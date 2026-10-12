// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Test} from "forge-std/Test.sol";
import {PairRegistry} from "../src/PairRegistry.sol";
import {IPairRegistry} from "../src/interfaces/IPairRegistry.sol";

contract PairRegistryTest is Test {
    PairRegistry r; address admin = address(0xA);
    function setUp() public { r = new PairRegistry(admin); }
    function test_upsertAndRead() public {
        vm.prank(admin); r.upsertPair(IPairRegistry.Pair("NVDA", address(1), 1, 3, 100, 10, true));
        assertTrue(r.isEnabled(r.idFor("NVDA"))); assertEq(r.pairCount(), 1);
    }
    function test_invalid() public {
        vm.startPrank(admin);
        vm.expectRevert(); r.upsertPair(IPairRegistry.Pair("", address(1), 1, 3, 100, 10, true));
        vm.expectRevert(); r.upsertPair(IPairRegistry.Pair("A", address(0), 1, 3, 100, 10, true));
        vm.expectRevert(); r.upsertPair(IPairRegistry.Pair("A", address(1), 1, 3, 0, 10, true));
        vm.stopPrank();
    }
    function test_onlyOwner() public {
        vm.expectRevert(); r.upsertPair(IPairRegistry.Pair("A", address(1), 1, 3, 1, 1, true));
    }
}
