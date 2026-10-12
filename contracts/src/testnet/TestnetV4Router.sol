// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPoolManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }
    struct ModifyLiquidityParams {
        int24 tickLower;
        int24 tickUpper;
        int256 liquidityDelta;
        bytes32 salt;
    }
    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }
    function unlock(bytes calldata data) external returns (bytes memory);
    function initialize(PoolKey calldata key, uint160 sqrtPriceX96) external returns (int24);
    function modifyLiquidity(PoolKey calldata key, ModifyLiquidityParams calldata params, bytes calldata hookData)
        external
        returns (int256 callerDelta, int256 feesAccrued);
    function swap(PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        external
        returns (int256 swapDelta);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
}

/// Minimal V4 unlock router for Parity plumbing on Robinhood testnet.
/// Matches THIS chain's PoolManager ABI (reversed BalanceDelta: amount0 = UPPER 128 bits).
/// NOT audited. TESTNET ONLY.
contract TestnetV4Router {
    IPoolManager public immutable PM;

    uint160 internal constant MIN_SQRT_PRICE = 4295128739;
    uint160 internal constant MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342;

    error NotManager();
    error Expired();
    error MinOut(uint256 got, uint256 want);
    error DeltaMismatch();

    uint8 private constant OP_ADD = 1;
    uint8 private constant OP_SWAP = 2;

    constructor(address pm) {
        PM = IPoolManager(pm);
    }

    // ---- unpacking: amount0 = upper 128 bits (sar), amount1 = lower 128 bits (signextend) ----
    function _a0(int256 packed) internal pure returns (int128 v) {
        assembly ("memory-safe") {
            v := sar(128, packed)
        }
    }

    function _a1(int256 packed) internal pure returns (int128 v) {
        assembly ("memory-safe") {
            v := signextend(15, packed)
        }
    }

    function _payLeg(address currency, int128 leg) internal {
        if (leg < 0) {
            PM.sync(currency);
            IERC20(currency).transfer(address(PM), uint256(int256(-leg)));
            PM.settle();
        } else if (leg > 0) {
            PM.take(currency, address(this), uint256(int256(leg)));
        }
    }

    struct AddArgs {
        IPoolManager.PoolKey key;
        int24 tickLower;
        int24 tickUpper;
        int256 liquidity;
        uint256 amount0Max;
        uint256 amount1Max;
        uint256 deadline;
    }

    /// Pulls up to max amounts, adds liquidity, refunds leftovers to caller.
    function addLiquidity(AddArgs calldata a) external returns (uint256 used0, uint256 used1) {
        if (block.timestamp > a.deadline) revert Expired();
        IERC20(a.key.currency0).transferFrom(msg.sender, address(this), a.amount0Max);
        IERC20(a.key.currency1).transferFrom(msg.sender, address(this), a.amount1Max);
        bytes memory ret =
            PM.unlock(abi.encode(OP_ADD, a.key, a.tickLower, a.tickUpper, a.liquidity, msg.sender));
        (int256 callerDelta,) = abi.decode(ret, (int256, int256));
        int128 d0 = _a0(callerDelta);
        int128 d1 = _a1(callerDelta);
        used0 = d0 < 0 ? uint256(int256(-d0)) : 0;
        used1 = d1 < 0 ? uint256(int256(-d1)) : 0;
        // refund anything not consumed
        uint256 r0 = IERC20(a.key.currency0).balanceOf(address(this));
        uint256 r1 = IERC20(a.key.currency1).balanceOf(address(this));
        if (r0 > 0) IERC20(a.key.currency0).transfer(msg.sender, r0);
        if (r1 > 0) IERC20(a.key.currency1).transfer(msg.sender, r1);
    }

    struct SwapArgs {
        IPoolManager.PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
        uint256 amountOutMin;
        uint256 deadline;
        address to;
    }

    /// Exact-input swap. Pulls amountIn, sends output to `to`.
    function swapExactInput(SwapArgs calldata s) external returns (uint256 amountOut) {
        if (block.timestamp > s.deadline) revert Expired();
        address tokenIn = s.zeroForOne ? s.key.currency0 : s.key.currency1;
        IERC20(tokenIn).transferFrom(msg.sender, address(this), s.amountIn);
        bytes memory ret = PM.unlock(abi.encode(OP_SWAP, s.key, s.zeroForOne, s.amountIn, s.to, s.amountOutMin));
        amountOut = abi.decode(ret, (uint256));
    }

    /// Called back by the PoolManager during unlock.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(PM)) revert NotManager();
        uint8 op = abi.decode(data[:32], (uint8));
        if (op == OP_ADD) {
            (, IPoolManager.PoolKey memory key, int24 tickLower, int24 tickUpper, int256 liquidity,) =
                abi.decode(data, (uint8, IPoolManager.PoolKey, int24, int24, int256, address));
            (int256 callerDelta, int256 fees) = PM.modifyLiquidity(
                key,
                IPoolManager.ModifyLiquidityParams({
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    liquidityDelta: liquidity,
                    salt: bytes32(0)
                }),
                ""
            );
            // fees should be zero on a fresh add; route any positive legs back via take below
            _payLeg(key.currency0, _a0(callerDelta));
            _payLeg(key.currency1, _a1(callerDelta));
            if (fees != 0) {
                _payLeg(key.currency0, _a0(fees));
                _payLeg(key.currency1, _a1(fees));
            }
            return abi.encode(callerDelta, fees);
        }
        // OP_SWAP
        (, IPoolManager.PoolKey memory skey, bool zeroForOne, uint256 amountIn, address to, uint256 minOut) =
            abi.decode(data, (uint8, IPoolManager.PoolKey, bool, uint256, address, uint256));
        uint160 limit = zeroForOne ? MIN_SQRT_PRICE + 1 : MAX_SQRT_PRICE - 1;
        int256 packed = PM.swap(
            skey,
            IPoolManager.SwapParams({zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: limit}),
            ""
        );
        int128 d0 = _a0(packed);
        int128 d1 = _a1(packed);
        int128 inLeg = zeroForOne ? d0 : d1;
        int128 outLeg = zeroForOne ? d1 : d0;
        if (inLeg != -int256(amountIn)) revert DeltaMismatch();
        address tokenIn = zeroForOne ? skey.currency0 : skey.currency1;
        address tokenOut = zeroForOne ? skey.currency1 : skey.currency0;
        PM.sync(tokenIn);
        IERC20(tokenIn).transfer(address(PM), amountIn);
        PM.settle();
        uint256 out = uint256(int256(outLeg));
        if (out < minOut) revert MinOut(out, minOut);
        PM.take(tokenOut, to, out);
        return abi.encode(out);
    }
}
