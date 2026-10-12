// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockToken} from "../src/testnet/MockToken.sol";
import {TestnetV4Router} from "../src/testnet/TestnetV4Router.sol";

/// Deploys mock quote/stock tokens + V4 swap router on Robinhood testnet.
/// forge script script/DeployTestnetMocks.s.sol --rpc-url $RH_TESTNET_RPC --broadcast
/// env: ADMIN (mint recipient), PM (PoolManager, default Robinhood testnet singleton)
contract DeployTestnetMocks is Script {
    address internal constant DEFAULT_PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;

    function run() external {
        address admin = vm.envAddress("ADMIN");
        address pm = vm.envOr("PM", DEFAULT_PM);
        vm.startBroadcast();
        MockToken musdg = new MockToken("Mock USDG", "mUSDG", 6, admin, 1_000_000e6);
        MockToken mtsla = new MockToken("Mock Tesla", "mTSLA", 18, admin, 100_000e18);
        TestnetV4Router router = new TestnetV4Router(pm);
        vm.stopBroadcast();
        console2.log("mUSDG  ", address(musdg));
        console2.log("mTSLA  ", address(mtsla));
        console2.log("router ", address(router));
    }
}
