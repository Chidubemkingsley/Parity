// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Allow-list of tokenized-stock pairs Parity is permitted to hedge.
/// @dev One entry links a Robinhood Chain Stock Token to the Hyperliquid HIP-3
///      perpetual that references the same underlying equity.
interface IPairRegistry {
    struct Pair {
        string symbol; // underlying ticker, e.g. "NVDA"
        address stockToken; // Robinhood Chain Stock Token (ERC-20) - identifier only on other chains
        uint32 hlAsset; // HyperCore asset id of the HIP-3 perp (100000 + dexIndex * 10000 + indexInMeta)
        uint8 hlSzDecimals; // szDecimals of that perp, needed to scale mark prices
        uint128 maxNotional; // max single position notional, USDC 6dp
        uint16 minEdgeBps; // minimum net edge (after costs) required to open
        bool enabled;
    }

    function pairOf(bytes32 id) external view returns (Pair memory);

    function isEnabled(bytes32 id) external view returns (bool);
}
