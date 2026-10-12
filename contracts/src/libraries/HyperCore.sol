// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal encoders / readers for Hyperliquid HyperEVM <-> HyperCore.
/// @dev    ALL constants below are from memory of Hyperliquid's docs and MUST be verified on testnet
///         (see docs/VERIFY_ME.md) before any real funds are used.
library HyperCore {
    address internal constant CORE_WRITER = 0x3333333333333333333333333333333333333333;
    address internal constant MARK_PX_PRECOMPILE = 0x0000000000000000000000000000000000000806;

    uint8 internal constant TIF_ALO = 1;
    uint8 internal constant TIF_GTC = 2;
    uint8 internal constant TIF_IOC = 3;

    /// @dev header: 1 byte version (0x01) + 3 byte action id (big endian)
    function _header(uint24 actionId) private pure returns (bytes4) {
        return bytes4(uint32(0x01000000) | uint32(actionId));
    }

    function encodeLimitOrder(
        uint32 asset,
        bool isBuy,
        uint64 limitPx1e8,
        uint64 sz1e8,
        bool reduceOnly,
        uint8 tif,
        uint128 cloid
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(_header(1), abi.encode(asset, isBuy, limitPx1e8, sz1e8, reduceOnly, tif, cloid));
    }

    function encodeUsdClassTransfer(uint64 ntl, bool toPerp) internal pure returns (bytes memory) {
        return abi.encodePacked(_header(7), abi.encode(ntl, toPerp));
    }

    function encodeCancelByCloid(uint32 asset, uint128 cloid) internal pure returns (bytes memory) {
        return abi.encodePacked(_header(11), abi.encode(asset, cloid));
    }

    /// @notice Perp mark price scaled to 1e8 USD. Raw precompile value = px * 10^(6 - szDecimals).
    function markPx1e8(uint32 perpIndex, uint8 szDecimals) internal view returns (uint64) {
        (bool ok, bytes memory out) = MARK_PX_PRECOMPILE.staticcall(abi.encode(perpIndex));
        require(ok && out.length >= 32, "markPx failed");
        uint256 raw = abi.decode(out, (uint256));
        uint256 scaled = raw * (10 ** (2 + uint256(szDecimals)));
        require(scaled <= type(uint64).max, "markPx overflow");
        return uint64(scaled);
    }
}

interface ICoreWriter {
    function sendRawAction(bytes calldata data) external;
}
