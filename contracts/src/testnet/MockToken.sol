// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Mock quote/stock token for Robinhood-testnet plumbing. Open mint — TESTNET ONLY.
contract MockToken is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address mintTo, uint256 mintAmt)
        ERC20(name_, symbol_)
    {
        _decimals = decimals_;
        _mint(mintTo, mintAmt);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}
