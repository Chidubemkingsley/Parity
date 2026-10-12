// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Script, console2} from "forge-std/Script.sol";
import {PairRegistry} from "../src/PairRegistry.sol";
import {ParityVault} from "../src/ParityVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// forge script script/DeployArbitrum.s.sol --rpc-url $ARB_RPC --broadcast
/// env: ASSET (USDC addr - VERIFY), ADMIN, KEEPER, GUARDIAN, EXECUTOR, FEE_RECIPIENT
contract DeployArbitrum is Script {
    function run() external {
        address asset = vm.envAddress("ASSET");
        address admin = vm.envAddress("ADMIN");
        vm.startBroadcast();
        PairRegistry reg = new PairRegistry(admin);
        ParityVault v = new ParityVault(
            IERC20(asset), reg, admin, vm.envAddress("KEEPER"), vm.envAddress("GUARDIAN"),
            vm.envAddress("EXECUTOR"), vm.envAddress("FEE_RECIPIENT")
        );
        vm.stopBroadcast();
        console2.log("PairRegistry", address(reg));
        console2.log("ParityVault ", address(v));
    }
}
