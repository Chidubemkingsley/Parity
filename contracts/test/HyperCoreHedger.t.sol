// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Test} from "forge-std/Test.sol";
import {HyperCoreHedger} from "../src/HyperCoreHedger.sol";
import {HyperCore} from "../src/libraries/HyperCore.sol";
import {MockCoreWriter} from "./mocks/MockCoreWriter.sol";

contract HyperCoreHedgerTest is Test {
    HyperCoreHedger h; address admin = address(0xA); address keeper = address(0xB);
    bytes32 key = keccak256("TSLA");

    function setUp() public {
        vm.etch(HyperCore.CORE_WRITER, address(new MockCoreWriter()).code);
        h = new HyperCoreHedger(admin, keeper);
        vm.prank(admin);
        h.configureAsset(key, HyperCoreHedger.AssetCfg(110000, 0, 3, true, true, 1000));
        // szDecimals=3 -> raw = px * 10^(6-3); px=$250 -> raw 250000
        vm.mockCall(HyperCore.MARK_PX_PRECOMPILE, abi.encode(uint32(0)), abi.encode(uint256(250_000)));
    }

    function test_markScaling() public view {
        assertEq(HyperCore.markPx1e8(0, 3), 250e8);
    }

    function test_openShortEncodes() public {
        vm.prank(keeper); h.openShort(key, 250e8, 2e8, 3, 7);
        bytes memory expected = HyperCore.encodeLimitOrder(110000, false, 250e8, 2e8, false, 3, 7);
        assertEq(MockCoreWriter(HyperCore.CORE_WRITER).last(), expected);
        assertEq(bytes4(expected), bytes4(0x01000001));
    }

    function test_slippageBand() public {
        vm.prank(keeper); vm.expectRevert(HyperCoreHedger.PriceOutsideBand.selector);
        h.openShort(key, 240e8, 1e8, 3, 1); // sell 4% below mark
        vm.prank(keeper); h.openShort(key, 249e8, 1e8, 3, 1); // within 0.5%
    }

    function test_notionalCap() public {
        vm.prank(keeper); vm.expectRevert(HyperCoreHedger.NotionalTooLarge.selector);
        h.openShort(key, 250e8, 5e8, 3, 1); // $1250 > $1000
    }

    function test_closeIsReduceOnlyAndUncapped() public {
        vm.prank(keeper); h.closeShort(key, 251e8, 5e8, 3, 2);
        assertEq(MockCoreWriter(HyperCore.CORE_WRITER).last(), HyperCore.encodeLimitOrder(110000, true, 251e8, 5e8, true, 3, 2));
    }

    function test_access() public {
        vm.expectRevert(); h.openShort(key, 250e8, 1e8, 3, 1);
        vm.expectRevert(); h.configureAsset(key, HyperCoreHedger.AssetCfg(1, 0, 3, false, true, 1));
        vm.prank(keeper); vm.expectRevert(HyperCoreHedger.AssetDisabled.selector); h.openShort(keccak256("X"), 1, 1, 3, 1);
    }

    function test_moveUsdCap() public {
        vm.prank(keeper); h.moveUsd(1000e6, true);
        vm.prank(keeper); vm.expectRevert(HyperCoreHedger.NotionalTooLarge.selector); h.moveUsd(26_000e6, true);
    }
}
