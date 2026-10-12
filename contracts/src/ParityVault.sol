// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPairRegistry} from "./interfaces/IPairRegistry.sol";

/// @title ParityVault
/// @notice ERC-4626 USDC vault funding a delta-neutral basis strategy:
///         long a Robinhood Chain Stock Token, short the matching Hyperliquid HIP-3 equity perp.
/// @dev    TRUST MODEL (read this): the legs execute off-chain / cross-chain via a keeper and an
///         executor wallet. Deployed capital is valued by a keeper-ATTESTED number (`reportDeployed`).
///         The contract bounds the damage a bad attestation can do (move cap, interval, stale-NAV
///         deposit block, deploy cap, deposit cap, pause) but it does NOT trustlessly prove NAV.
contract ParityVault is ERC4626, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ───────────────────────────── roles ─────────────────────────────
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    // ───────────────────────────── constants ─────────────────────────
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 3_000; // 30%
    uint8 private constant OFFSET = 3;
    /// @dev price-per-share (assets per share, 1e18 scaled) of an empty vault with the virtual offset.
    uint256 private constant INITIAL_PPS = 10 ** (18 - OFFSET);

    // ───────────────────────────── state ─────────────────────────────
    IPairRegistry public immutable registry;

    address public executor; // wallet that receives deployed capital
    address public feeRecipient;

    uint256 public deployed; // keeper-attested value of capital living outside the vault
    uint256 public lastReportTs;
    bytes32 public lastEvidence;
    uint256 public hwmPps; // high-water-mark price per share (1e18 scaled)

    uint16 public performanceFeeBps = 1_000;
    uint16 public maxDeployBps = 9_000;
    uint16 public maxNavMoveBps = 500;
    uint32 public minReportInterval = 60;
    uint32 public maxNavAge = 1 days;
    uint256 public depositCap = 10_000e6;

    // round-trip stats (informational, attested by keeper, tx hashes are auditable on explorers)
    struct RoundTrip {
        bytes32 pairId;
        uint128 notional; // USDC, asset decimals
        int128 pnl; // USDC, asset decimals, net of modelled costs
        int32 entryEdgeBps;
        bytes32 rhTx; // Robinhood Chain swap tx hash
        bytes32 hlRef; // Hyperliquid order id / cloid / tx reference
        uint64 openedAt;
        uint64 closedAt;
    }

    uint256 public roundTripCount;
    uint256 public cumulativeNotional;
    int256 public cumulativePnl;

    // ───────────────────────────── events ────────────────────────────
    event SentToExecutor(address indexed executor, uint256 amount, uint256 deployedAfter);
    event CapitalReturned(address indexed executor, uint256 amount, uint256 deployedAfter);
    event DeployedReported(uint256 oldDeployed, uint256 newDeployed, bytes32 evidence, uint256 totalAssets);
    event PerformanceFeeMinted(address indexed recipient, uint256 shares, uint256 feeAssets);
    event RoundTripRecorded(
        uint256 indexed id,
        bytes32 indexed pairId,
        uint128 notional,
        int128 pnl,
        int32 entryEdgeBps,
        bytes32 rhTx,
        bytes32 hlRef,
        uint64 openedAt,
        uint64 closedAt
    );
    event ParamsUpdated(
        uint16 performanceFeeBps,
        uint16 maxDeployBps,
        uint16 maxNavMoveBps,
        uint32 minReportInterval,
        uint32 maxNavAge,
        uint256 depositCap
    );
    event ExecutorUpdated(address executor);
    event FeeRecipientUpdated(address feeRecipient);

    // ───────────────────────────── errors ────────────────────────────
    error ZeroAddress();
    error NotExecutor();
    error ExceedsIdle();
    error ExceedsDeployCap();
    error ReportTooSoon();
    error NavMoveTooLarge();
    error PairNotEnabled();
    error NotionalTooLarge();
    error BadParam();
    error ExecutorNotSet();

    constructor(
        IERC20 asset_,
        IPairRegistry registry_,
        address admin,
        address keeper,
        address guardian,
        address executor_,
        address feeRecipient_
    ) ERC20("Parity Basis Vault", "pBASIS") ERC4626(asset_) {
        if (
            address(asset_) == address(0) || address(registry_) == address(0) || admin == address(0)
                || executor_ == address(0) || feeRecipient_ == address(0)
        ) revert ZeroAddress();
        registry = registry_;
        executor = executor_;
        feeRecipient = feeRecipient_;
        hwmPps = INITIAL_PPS;
        lastReportTs = block.timestamp;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        if (keeper != address(0)) _grantRole(KEEPER_ROLE, keeper);
        if (guardian != address(0)) _grantRole(GUARDIAN_ROLE, guardian);
    }

    // ───────────────────────────── ERC-4626 ──────────────────────────
    function _decimalsOffset() internal pure override returns (uint8) {
        return OFFSET;
    }

    function idle() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function totalAssets() public view override returns (uint256) {
        return idle() + deployed;
    }

    function navIsStale() public view returns (bool) {
        return deployed > 0 && block.timestamp > lastReportTs + maxNavAge;
    }

    function maxDeposit(address) public view override returns (uint256) {
        if (paused() || navIsStale()) return 0;
        uint256 ta = totalAssets();
        return ta >= depositCap ? 0 : depositCap - ta;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return _convertToShares(maxDeposit(receiver), Math.Rounding.Floor);
    }

    /// @dev withdrawals are limited to idle liquidity; they stay open while paused so users can exit.
    function maxWithdraw(address owner_) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner_), idle());
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner_), _convertToShares(idle(), Math.Rounding.Floor));
    }

    function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256) {
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256) {
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner_) public override nonReentrant returns (uint256) {
        return super.withdraw(assets, receiver, owner_);
    }

    function redeem(uint256 shares, address receiver, address owner_) public override nonReentrant returns (uint256) {
        return super.redeem(shares, receiver, owner_);
    }

    // ───────────────────────────── capital flow ──────────────────────
    /// @notice Move idle USDC to the executor wallet to run the legs.
    function sendToExecutor(uint256 amount) external onlyRole(KEEPER_ROLE) whenNotPaused nonReentrant {
        if (executor == address(0)) revert ExecutorNotSet();
        if (amount > idle()) revert ExceedsIdle();
        uint256 cap = (totalAssets() * maxDeployBps) / BPS;
        if (deployed + amount > cap) revert ExceedsDeployCap();
        deployed += amount;
        IERC20(asset()).safeTransfer(executor, amount);
        emit SentToExecutor(executor, amount, deployed);
    }

    /// @notice Executor returns USDC. Anything above the attested deployed balance is realised profit.
    function returnCapital(uint256 amount) external nonReentrant {
        if (msg.sender != executor) revert NotExecutor();
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        deployed = deployed > amount ? deployed - amount : 0;
        emit CapitalReturned(msg.sender, amount, deployed);
    }

    /// @notice Keeper attests the current value of capital outside the vault (both venues, marked to market).
    /// @param evidence hash of the off-chain snapshot (balances, positions, mark prices) for auditability.
    function reportDeployed(uint256 newDeployed, bytes32 evidence) external onlyRole(KEEPER_ROLE) nonReentrant {
        if (block.timestamp < lastReportTs + minReportInterval) revert ReportTooSoon();
        uint256 ta = totalAssets();
        uint256 diff = newDeployed > deployed ? newDeployed - deployed : deployed - newDeployed;
        if (ta > 0 && diff * BPS > ta * maxNavMoveBps) revert NavMoveTooLarge();

        uint256 old = deployed;
        deployed = newDeployed;
        lastReportTs = block.timestamp;
        lastEvidence = evidence;
        emit DeployedReported(old, newDeployed, evidence, totalAssets());

        _accruePerformanceFee();
    }

    function _accruePerformanceFee() internal {
        uint256 supply = totalSupply();
        if (supply == 0) return;
        uint256 ta = totalAssets();
        uint256 pps = (ta * 1e18) / supply;
        if (pps > hwmPps && performanceFeeBps > 0) {
            uint256 gain = ((pps - hwmPps) * supply) / 1e18;
            uint256 feeAssets = (gain * performanceFeeBps) / BPS;
            if (feeAssets > 0 && ta > feeAssets) {
                uint256 feeShares = (feeAssets * supply) / (ta - feeAssets);
                if (feeShares > 0) {
                    _mint(feeRecipient, feeShares);
                    emit PerformanceFeeMinted(feeRecipient, feeShares, feeAssets);
                }
            }
        }
        uint256 newSupply = totalSupply();
        uint256 newPps = (ta * 1e18) / newSupply;
        if (newPps > hwmPps) hwmPps = newPps;
    }

    // ───────────────────────────── journal ───────────────────────────
    /// @notice Record a completed basis round-trip with auditable references. Informational; does not move funds.
    function recordRoundTrip(RoundTrip calldata rt) external onlyRole(KEEPER_ROLE) {
        IPairRegistry.Pair memory p = registry.pairOf(rt.pairId);
        if (!p.enabled) revert PairNotEnabled();
        if (rt.notional > p.maxNotional) revert NotionalTooLarge();
        uint256 id = ++roundTripCount;
        cumulativeNotional += rt.notional;
        cumulativePnl += rt.pnl;
        emit RoundTripRecorded(
            id, rt.pairId, rt.notional, rt.pnl, rt.entryEdgeBps, rt.rhTx, rt.hlRef, rt.openedAt, rt.closedAt
        );
    }

    // ───────────────────────────── admin ─────────────────────────────
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setParams(
        uint16 performanceFeeBps_,
        uint16 maxDeployBps_,
        uint16 maxNavMoveBps_,
        uint32 minReportInterval_,
        uint32 maxNavAge_,
        uint256 depositCap_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (performanceFeeBps_ > MAX_PERFORMANCE_FEE_BPS || maxDeployBps_ > BPS || maxNavMoveBps_ > BPS) {
            revert BadParam();
        }
        performanceFeeBps = performanceFeeBps_;
        maxDeployBps = maxDeployBps_;
        maxNavMoveBps = maxNavMoveBps_;
        minReportInterval = minReportInterval_;
        maxNavAge = maxNavAge_;
        depositCap = depositCap_;
        emit ParamsUpdated(
            performanceFeeBps_, maxDeployBps_, maxNavMoveBps_, minReportInterval_, maxNavAge_, depositCap_
        );
    }

    function setExecutor(address executor_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (executor_ == address(0)) revert ZeroAddress();
        executor = executor_;
        emit ExecutorUpdated(executor_);
    }

    function setFeeRecipient(address feeRecipient_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeRecipient = feeRecipient_;
        emit FeeRecipientUpdated(feeRecipient_);
    }
}
