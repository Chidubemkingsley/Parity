// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
contract MockCoreWriter {
    bytes public last;
    uint256 public count;
    function sendRawAction(bytes calldata data) external { last = data; count++; }
}
