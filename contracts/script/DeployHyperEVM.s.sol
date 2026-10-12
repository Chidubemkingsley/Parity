// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Script, console2} from "forge-std/Script.sol";
import {HyperCoreHedger} from "../src/HyperCoreHedger.sol";

/// forge script script/DeployHyperEVM.s.sol --rpc-url $HYPEREVM_RPC --broadcast   (chain 999; testnet 998)
/// env: ADMIN, KEEPER
contract DeployHyperEVM is Script {
    function run() external {
        vm.startBroadcast();
        HyperCoreHedger h = new HyperCoreHedger(vm.envAddress("ADMIN"), vm.envAddress("KEEPER"));
        vm.stopBroadcast();
        console2.log("HyperCoreHedger", address(h));
    }
}
