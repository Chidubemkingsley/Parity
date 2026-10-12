// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IPairRegistry} from "./interfaces/IPairRegistry.sol";

/// @title PairRegistry
/// @notice On-chain, owner-managed allow-list of (Stock Token <-> HIP-3 perp) pairs.
///         Keeps strategy scope transparent and lets the vault and the HyperEVM hedger
///         enforce the same limits the keeper uses off-chain.
contract PairRegistry is IPairRegistry, Ownable2Step {
    mapping(bytes32 => Pair) private _pairs;
    bytes32[] private _ids;
    mapping(bytes32 => bool) private _known;

    event PairUpserted(bytes32 indexed id, string symbol, address stockToken, uint32 hlAsset, bool enabled);
    event PairEnabled(bytes32 indexed id, bool enabled);

    error UnknownPair(bytes32 id);
    error InvalidPair();

    constructor(address owner_) Ownable(owner_) {}

    /// @notice Deterministic id for a ticker.
    function idFor(string memory symbol) public pure returns (bytes32) {
        return keccak256(bytes(symbol));
    }

    function upsertPair(Pair calldata p) external onlyOwner returns (bytes32 id) {
        if (bytes(p.symbol).length == 0 || p.stockToken == address(0) || p.maxNotional == 0) revert InvalidPair();
        id = idFor(p.symbol);
        _pairs[id] = p;
        if (!_known[id]) {
            _known[id] = true;
            _ids.push(id);
        }
        emit PairUpserted(id, p.symbol, p.stockToken, p.hlAsset, p.enabled);
    }

    function setEnabled(bytes32 id, bool enabled) external onlyOwner {
        if (!_known[id]) revert UnknownPair(id);
        _pairs[id].enabled = enabled;
        emit PairEnabled(id, enabled);
    }

    function pairOf(bytes32 id) external view returns (Pair memory) {
        if (!_known[id]) revert UnknownPair(id);
        return _pairs[id];
    }

    function isEnabled(bytes32 id) external view returns (bool) {
        return _known[id] && _pairs[id].enabled;
    }

    function pairIds() external view returns (bytes32[] memory) {
        return _ids;
    }

    function pairCount() external view returns (uint256) {
        return _ids.length;
    }
}
