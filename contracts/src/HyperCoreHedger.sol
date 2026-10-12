// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {HyperCore, ICoreWriter} from "./libraries/HyperCore.sol";

/// @title HyperCoreHedger
/// @notice Deployed on HyperEVM. Lets a keeper place guard-railed perp orders on HyperCore via CoreWriter.
/// @dev    CoreWriter actions are ASYNCHRONOUS and not atomic: this contract only emits intent events.
///         Fills must be confirmed off-chain via the Hyperliquid info API. Guards: per-asset enable,
///         notional cap, mark-price slippage band (optional), reduce-only closes.
contract HyperCoreHedger is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    struct AssetCfg {
        uint32 assetId; // HyperCore asset id used in orders (HIP-3: 100000 + dexIndex*10000 + idx)
        uint32 markIndex; // index passed to the markPx precompile
        uint8 szDecimals;
        bool useMarkCheck; // HIP-3 markets may not be readable via the precompile; verify on testnet
        bool enabled;
        uint64 maxNotionalUsd; // whole USD per order
    }

    mapping(bytes32 => AssetCfg) public assets; // key = keccak256(symbol)
    uint16 public maxSlippageBps = 50;
    uint64 public maxMoveUsd = 25_000e6; // per usdClassTransfer, 1e6 units

    event AssetConfigured(bytes32 indexed key, AssetCfg cfg);
    event OrderSent(bytes32 indexed key, bool isBuy, bool reduceOnly, uint64 limitPx1e8, uint64 sz1e8, uint128 cloid);
    event OrderCancelled(bytes32 indexed key, uint128 cloid);
    event UsdMoved(uint64 ntl, bool toPerp);
    event SlippageUpdated(uint16 bps);

    error AssetDisabled();
    error NotionalTooLarge();
    error PriceOutsideBand();
    error BadParam();

    constructor(address admin, address keeper) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        if (keeper != address(0)) _grantRole(KEEPER_ROLE, keeper);
    }

    function keyFor(string calldata symbol) external pure returns (bytes32) {
        return keccak256(bytes(symbol));
    }

    function configureAsset(bytes32 key, AssetCfg calldata cfg) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (cfg.szDecimals > 6) revert BadParam();
        assets[key] = cfg;
        emit AssetConfigured(key, cfg);
    }

    function setMaxSlippageBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > 1_000) revert BadParam();
        maxSlippageBps = bps;
        emit SlippageUpdated(bps);
    }

    function setMaxMoveUsd(uint64 v) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxMoveUsd = v;
    }

    // ───────────── keeper actions ─────────────
    function openShort(bytes32 key, uint64 limitPx1e8, uint64 sz1e8, uint8 tif, uint128 cloid)
        external
        onlyRole(KEEPER_ROLE)
    {
        _order(key, false, false, limitPx1e8, sz1e8, tif, cloid);
    }

    function closeShort(bytes32 key, uint64 limitPx1e8, uint64 sz1e8, uint8 tif, uint128 cloid)
        external
        onlyRole(KEEPER_ROLE)
    {
        _order(key, true, true, limitPx1e8, sz1e8, tif, cloid);
    }

    function cancel(bytes32 key, uint128 cloid) external onlyRole(KEEPER_ROLE) {
        AssetCfg memory c = assets[key];
        ICoreWriter(HyperCore.CORE_WRITER).sendRawAction(HyperCore.encodeCancelByCloid(c.assetId, cloid));
        emit OrderCancelled(key, cloid);
    }

    function moveUsd(uint64 ntl, bool toPerp) external onlyRole(KEEPER_ROLE) {
        if (ntl > maxMoveUsd) revert NotionalTooLarge();
        ICoreWriter(HyperCore.CORE_WRITER).sendRawAction(HyperCore.encodeUsdClassTransfer(ntl, toPerp));
        emit UsdMoved(ntl, toPerp);
    }

    function sweep(IERC20 token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        token.safeTransfer(to, amount);
    }

    // ───────────── internals ─────────────
    function _order(bytes32 key, bool isBuy, bool reduceOnly, uint64 px, uint64 sz, uint8 tif, uint128 cloid) internal {
        AssetCfg memory c = assets[key];
        if (!c.enabled) revert AssetDisabled();
        if (px == 0 || sz == 0 || tif < 1 || tif > 3) revert BadParam();

        // notional in 1e8 USD: px(1e8) * sz(1e8) / 1e8
        uint256 notional1e8 = (uint256(px) * uint256(sz)) / 1e8;
        if (!reduceOnly && notional1e8 > uint256(c.maxNotionalUsd) * 1e8) revert NotionalTooLarge();

        if (c.useMarkCheck) {
            uint256 mark = HyperCore.markPx1e8(c.markIndex, c.szDecimals);
            if (isBuy) {
                if (px > (mark * (10_000 + maxSlippageBps)) / 10_000) revert PriceOutsideBand();
            } else {
                if (px < (mark * (10_000 - maxSlippageBps)) / 10_000) revert PriceOutsideBand();
            }
        }

        ICoreWriter(HyperCore.CORE_WRITER).sendRawAction(
            HyperCore.encodeLimitOrder(c.assetId, isBuy, px, sz, reduceOnly, tif, cloid)
        );
        emit OrderSent(key, isBuy, reduceOnly, px, sz, cloid);
    }
}
