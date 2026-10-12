// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestnetV4Router, IPoolManager} from "../src/testnet/TestnetV4Router.sol";

/// Initializes the mock V4 pool and seeds liquidity on Robinhood testnet.
/// Currencies are sorted numerically (currency0 < currency1) inside the script;
/// SQRT_PRICE_X96 must be quoted for the SORTED pair (raw1/raw0).
/// forge script script/InitTestnetPool.s.sol --rpc-url $RH_TESTNET_RPC --broadcast
/// env: PM, MUSDG, MTSLA, ROUTER, SQRT_PRICE_X96, TICK_LOWER, TICK_UPPER,
///      LIQUIDITY, AMT0MAX, AMT1MAX
contract InitTestnetPool is Script {
    function run() external {
        IPoolManager pm = IPoolManager(vm.envAddress("PM"));
        address a = vm.envAddress("MUSDG");
        address b = vm.envAddress("MTSLA");
        TestnetV4Router router = TestnetV4Router(vm.envAddress("ROUTER"));
        (address c0, address c1) = a < b ? (a, b) : (b, a);
        IPoolManager.PoolKey memory key =
            IPoolManager.PoolKey({currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: address(0)});
        uint160 sqrtPrice = uint160(vm.envUint("SQRT_PRICE_X96"));
        int24 tickLower = int24(vm.envInt("TICK_LOWER"));
        int24 tickUpper = int24(vm.envInt("TICK_UPPER"));
        int256 liquidity = int256(vm.envUint("LIQUIDITY"));
        uint256 amt0Max = vm.envUint("AMT0MAX");
        uint256 amt1Max = vm.envUint("AMT1MAX");

        vm.startBroadcast();
        int24 tick = pm.initialize(key, sqrtPrice);
        IERC20(c0).approve(address(router), amt0Max);
        IERC20(c1).approve(address(router), amt1Max);
        (uint256 used0, uint256 used1) = router.addLiquidity(
            TestnetV4Router.AddArgs({
                key: key,
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidity: liquidity,
                amount0Max: amt0Max,
                amount1Max: amt1Max,
                deadline: block.timestamp + 1 hours
            })
        );
        vm.stopBroadcast();
        console2.log("tick", tick);
        console2.log("used0", used0);
        console2.log("used1", used1);
        console2.log("poolId");
        console2.logBytes32(keccak256(abi.encode(key)));
    }
}
