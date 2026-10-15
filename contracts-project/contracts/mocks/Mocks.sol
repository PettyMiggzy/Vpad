// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockToken is ERC20 {
    constructor(string memory n, uint256 supply) ERC20(n, n) {
        _mint(msg.sender, supply);
    }
}

contract MockMarketCap {
    mapping(address => uint256) public cap;

    function set(address t, uint256 v) external {
        cap[t] = v;
    }

    function marketCap24h(address t) external view returns (uint256) {
        return cap[t];
    }
}

contract MockRegistry {
    mapping(address => address) public creatorOf;
    mapping(address => mapping(address => bool)) public wallet;

    function set(address t, address c) external {
        creatorOf[t] = c;
    }

    function setWallet(address t, address w) external {
        wallet[t][w] = true;
    }

    function isCreatorWallet(address t, address w) external view returns (bool) {
        return wallet[t][w];
    }
}

contract MockBuyback {
    IERC20 public immutable usdc;
    uint256 public burned;

    constructor(address usdc_) {
        usdc = IERC20(usdc_);
    }

    function buyAndBurn(address, uint256 amount) external {
        usdc.transferFrom(msg.sender, address(0xdead), amount);
        burned += amount;
    }
}
