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

    mapping(address => uint8) public dealTier;

    function setTier(address t, uint8 tier) external {
        dealTier[t] = tier;
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

import {IVyrePadLike} from "../LaunchSplit.sol";

contract MockPad {
    IERC20 public immutable quoteToken;

    struct L {
        address pool;
        uint16 buyTaxBps;
        uint16 sellTaxBps;
        int24 tickLower;
        int24 tickUpper;
        address creator;
        uint64 createdAt;
        uint16 partnerFeeBps;
        address partner;
    }

    mapping(address => L) public launches;
    mapping(address => uint256) public accrued;
    mapping(address => string) public metadataOf;

    constructor(address quote_) {
        quoteToken = IERC20(quote_);
    }

    function createLaunch(IVyrePadLike.CreateParams calldata p) external payable returns (address token, address pool, uint256 bought) {
        MockToken t = new MockToken(p.name, p.totalSupply);
        token = address(t);
        launches[token] = L(address(0xBEEF), p.buyTaxBps, p.sellTaxBps, 0, 0, msg.sender, uint64(block.timestamp), p.partnerFeeBps, p.partner);
        if (msg.value > 0) {
            bought = msg.value * 1000;
            t.transfer(msg.sender, bought);
            (bool ok, ) = msg.sender.call{value: msg.value / 2}(""); // refund half, natively, as the real pad can
            require(ok);
        }
        return (token, address(0xBEEF), bought);
    }

    /// @dev test helper: fees the pool earned for this launch
    function accrue(address token, uint256 amount) external {
        quoteToken.transferFrom(msg.sender, address(this), amount);
        accrued[token] += amount;
    }

    function collectCreatorFees(address token) external returns (uint256 amount) {
        amount = accrued[token];
        accrued[token] = 0;
        if (amount > 0) quoteToken.transfer(launches[token].creator, amount);
    }

    function lowerTaxes(address token, uint16 buy, uint16 sell) external {
        L storage l = launches[token];
        require(msg.sender == l.creator, "creator");
        require(buy <= l.buyTaxBps && sell <= l.sellTaxBps && buy + sell < l.buyTaxBps + l.sellTaxBps, "tax");
        l.buyTaxBps = buy;
        l.sellTaxBps = sell;
    }

    function setMetadata(address token, string calldata uri) external {
        require(msg.sender == launches[token].creator, "creator");
        metadataOf[token] = uri;
    }

    function offerCreator(address, address) external pure {}

    receive() external payable {}
}
