// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Test} from "forge-std/Test.sol";
import {ParityVault} from "../src/ParityVault.sol";
import {PairRegistry} from "../src/PairRegistry.sol";
import {IPairRegistry} from "../src/interfaces/IPairRegistry.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ParityVaultTest is Test {
    MockUSDC usdc; PairRegistry reg; ParityVault v;
    address admin = address(0xA); address keeper = address(0xB); address guardian = address(0xC);
    address exec = address(0xE); address feeR = address(0xF); address alice = address(0x1); address bob = address(0x2);
    bytes32 pid;

    function setUp() public {
        usdc = new MockUSDC();
        reg = new PairRegistry(admin);
        v = new ParityVault(IERC20(address(usdc)), reg, admin, keeper, guardian, exec, feeR);
        vm.prank(admin);
        reg.upsertPair(IPairRegistry.Pair("TSLA", address(0x7), 110000, 3, 1000e6, 20, true));
        pid = reg.idFor("TSLA");
        usdc.mint(alice, 1_000e6); usdc.mint(bob, 1_000e6);
        vm.prank(alice); usdc.approve(address(v), type(uint256).max);
        vm.prank(bob); usdc.approve(address(v), type(uint256).max);
        vm.warp(1_000_000);
    }

    function _dep(address u, uint256 a) internal returns (uint256) { vm.prank(u); return v.deposit(a, u); }

    function test_depositWithdraw() public {
        uint256 s = _dep(alice, 100e6);
        assertGt(s, 0);
        vm.prank(alice); v.redeem(s, alice, alice);
        assertApproxEqAbs(usdc.balanceOf(alice), 1_000e6, 1);
    }

    function test_depositCap() public {
        usdc.mint(alice, 20_000e6);
        assertEq(v.maxDeposit(alice), 10_000e6);
        vm.prank(alice); vm.expectRevert(); v.deposit(10_001e6, alice);
    }

    function test_sendToExecutor_capAndRoles() public {
        _dep(alice, 100e6);
        vm.prank(alice); vm.expectRevert(); v.sendToExecutor(1e6);
        vm.prank(keeper); vm.expectRevert(ParityVault.ExceedsDeployCap.selector); v.sendToExecutor(91e6);
        vm.prank(keeper); v.sendToExecutor(90e6);
        assertEq(v.deployed(), 90e6); assertEq(usdc.balanceOf(exec), 90e6); assertEq(v.totalAssets(), 100e6);
    }

    function test_withdrawLimitedToIdle() public {
        uint256 s = _dep(alice, 100e6);
        vm.prank(keeper); v.sendToExecutor(90e6);
        assertEq(v.maxWithdraw(alice), 10e6);
        vm.prank(alice); vm.expectRevert(); v.redeem(s, alice, alice);
    }

    function test_returnCapital() public {
        _dep(alice, 100e6);
        vm.prank(keeper); v.sendToExecutor(50e6);
        usdc.mint(exec, 2e6); vm.startPrank(exec); usdc.approve(address(v), 52e6); v.returnCapital(52e6); vm.stopPrank();
        assertEq(v.deployed(), 0);
        assertEq(v.totalAssets(), 102e6);
        vm.prank(alice); vm.expectRevert(ParityVault.NotExecutor.selector); v.returnCapital(1);
    }

    function test_reportBoundsAndInterval() public {
        _dep(alice, 100e6);
        vm.prank(keeper); v.sendToExecutor(50e6);
        vm.warp(block.timestamp + 61);
        vm.prank(keeper); vm.expectRevert(ParityVault.NavMoveTooLarge.selector); v.reportDeployed(60e6, bytes32(0)); // +10 > 5% of 100
        vm.prank(keeper); v.reportDeployed(54e6, keccak256("e"));
        assertEq(v.deployed(), 54e6);
        vm.prank(keeper); vm.expectRevert(ParityVault.ReportTooSoon.selector); v.reportDeployed(55e6, bytes32(0));
    }

    function test_feeAccrualOnlyAboveHwm() public {
        _dep(alice, 100e6);
        vm.prank(keeper); v.sendToExecutor(50e6);
        vm.warp(block.timestamp + 61);
        vm.prank(keeper); v.reportDeployed(54e6, bytes32(0)); // +4 gain
        uint256 fee = v.balanceOf(feeR);
        assertGt(fee, 0);
        uint256 feeValue = v.convertToAssets(fee);
        assertApproxEqAbs(feeValue, 0.4e6, 5); // 10% of 4 USDC
        // loss then partial recovery below HWM -> no new fee
        vm.warp(block.timestamp + 61);
        vm.prank(keeper); v.reportDeployed(51e6, bytes32(0));
        vm.warp(block.timestamp + 61);
        vm.prank(keeper); v.reportDeployed(53e6, bytes32(0));
        assertEq(v.balanceOf(feeR), fee);
    }

    function test_staleNavBlocksDeposits() public {
        _dep(alice, 100e6);
        vm.prank(keeper); v.sendToExecutor(50e6);
        vm.warp(block.timestamp + 1 days + 1);
        assertTrue(v.navIsStale());
        assertEq(v.maxDeposit(bob), 0);
        vm.prank(bob); vm.expectRevert(); v.deposit(1e6, bob);
    }

    function test_pauseBlocksDepositsAndDeployButNotExit() public {
        uint256 s = _dep(alice, 100e6);
        vm.prank(guardian); v.pause();
        vm.prank(bob); vm.expectRevert(); v.deposit(1e6, bob);
        vm.prank(keeper); vm.expectRevert(); v.sendToExecutor(1e6);
        vm.prank(alice); v.redeem(s, alice, alice);
        vm.prank(guardian); vm.expectRevert(); v.unpause();
        vm.prank(admin); v.unpause();
    }

    function test_recordRoundTrip() public {
        ParityVault.RoundTrip memory rt = ParityVault.RoundTrip(pid, 500e6, 3e6, 42, bytes32(uint256(1)), bytes32(uint256(2)), 1, 2);
        vm.prank(keeper); v.recordRoundTrip(rt);
        assertEq(v.roundTripCount(), 1); assertEq(v.cumulativePnl(), 3e6);
        rt.notional = 1001e6;
        vm.prank(keeper); vm.expectRevert(ParityVault.NotionalTooLarge.selector); v.recordRoundTrip(rt);
        vm.prank(admin); reg.setEnabled(pid, false);
        rt.notional = 1e6;
        vm.prank(keeper); vm.expectRevert(ParityVault.PairNotEnabled.selector); v.recordRoundTrip(rt);
    }

    function test_setParamsBounds() public {
        vm.prank(admin); vm.expectRevert(ParityVault.BadParam.selector); v.setParams(3001, 9000, 500, 60, 1 days, 1e6);
        vm.prank(alice); vm.expectRevert(); v.setParams(1000, 9000, 500, 60, 1 days, 1e6);
    }

    function testFuzz_roundTripShares(uint96 a) public {
        a = uint96(bound(a, 1e6, 1_000e6));
        uint256 s = _dep(alice, a);
        vm.prank(alice); uint256 out = v.redeem(s, alice, alice);
        assertLe(out, a); assertGe(out + 2, a);
    }
}
