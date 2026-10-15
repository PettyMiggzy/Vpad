// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

/// @dev The part of VyrePad this product uses. CreateParams matches VyrePad's, field for field.
interface IVyrePadLike {
    struct CreateParams {
        string name;
        string symbol;
        uint256 totalSupply;
        uint256 startingMarketCap;
        uint16 buyTaxBps;
        uint16 sellTaxBps;
        address partner;
        uint16 partnerFeeBps;
        string metadataURI;
    }

    function createLaunch(CreateParams calldata p) external payable returns (address token, address pool, uint256 bought);

    function collectCreatorFees(address token) external returns (uint256 amount);

    function lowerTaxes(address token, uint16 buyTaxBps, uint16 sellTaxBps) external;

    function setMetadata(address token, string calldata uri) external;

    function quoteToken() external view returns (address);

    function launches(address token)
        external
        view
        returns (
            address pool,
            uint16 buyTaxBps,
            uint16 sellTaxBps,
            int24 tickLower,
            int24 tickUpper,
            address creator,
            uint64 createdAt,
            uint16 partnerFeeBps,
            address partner
        );
}

/// @title The creator of record for one launch
/// @notice VyrePad pays a launch's tax to its creator. For a launch made through the factory, the creator of record is
/// one of these contracts, not the person: the pad pays the tax here, and `release` splits it. The treasury's share is
/// taken first, can only ever go up, and nothing in this contract can hand the creator role on, so a creator cannot
/// route around it (their own tax wallets are only for what is left). The person keeps the rest, can lower the taxes
/// (never below the deal's floor), and can edit the launch's metadata.
contract LaunchSplit {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_WALLETS = 4;

    struct Wallet {
        address wallet;
        uint16 bps;
    }

    LaunchFactory public factory;
    IVyrePadLike public pad;
    IERC20 public quote;
    address public token;
    address public human;
    uint16 public shareBps; // the treasury's share of the creator's tax: only ever raised
    bool public early; // set at creation (the early deal) rather than raised later
    uint16 public minTaxSumBps; // the lowest buy+sell tax the human may set (0: no floor)
    Wallet[] private _wallets;
    bool private _started;

    event Released(uint256 toTreasury, uint256 toCreator);
    event ShareRaised(uint16 from, uint16 to);
    event WalletsSet(address[] wallets, uint16[] bps);

    modifier onlyHuman() {
        require(msg.sender == human, "creator only");
        _;
    }

    /// @dev Only the factory starts a clone, once, and the clone makes the launch in the same call
    function start(
        address pad_,
        address human_,
        uint16 shareBps_,
        uint16 minTaxSumBps_,
        IVyrePadLike.CreateParams calldata p
    ) external payable returns (address token_) {
        require(!_started, "started");
        _started = true;
        factory = LaunchFactory(msg.sender);
        pad = IVyrePadLike(pad_);
        quote = IERC20(IVyrePadLike(pad_).quoteToken());
        human = human_;
        shareBps = shareBps_;
        early = shareBps_ > 0;
        minTaxSumBps = minTaxSumBps_;
        uint256 bought;
        (token_, , bought) = pad.createLaunch{value: msg.value}(p);
        token = token_;
        // the first buy and any refund came here as the creator of record: they belong to the person
        if (bought > 0) IERC20(token_).safeTransfer(human_, IERC20(token_).balanceOf(address(this)));
        if (address(this).balance > 0) {
            (bool ok, ) = human_.call{value: address(this).balance}("");
            require(ok, "refund failed");
        }
    }

    /// @dev The pad refunds unused first-buy USDC to its creator, natively
    receive() external payable {}

    /// @notice Pull the launch's tax from the pad and pay it out. Anyone can call it.
    function collectAndRelease() external {
        pad.collectCreatorFees(token);
        release();
    }

    /// @notice Pay out whatever USDC is here: the treasury's share first, then the rest to the creator's wallets.
    function release() public {
        uint256 amount = quote.balanceOf(address(this));
        if (amount == 0) return;
        uint256 toTreasury = (amount * shareBps) / BPS;
        if (toTreasury > 0) quote.safeTransfer(factory.treasury(), toTreasury);
        uint256 rest = amount - toTreasury;
        uint256 n = _wallets.length;
        if (n == 0) {
            if (rest > 0) quote.safeTransfer(human, rest);
        } else {
            uint256 paid;
            for (uint256 i = 0; i < n; i++) {
                uint256 part = i == n - 1 ? rest - paid : (rest * _wallets[i].bps) / BPS;
                paid += part;
                if (part > 0) quote.safeTransfer(_wallets[i].wallet, part);
            }
        }
        emit Released(toTreasury, rest);
    }

    /// @notice Give the treasury a bigger share of the tax, for good (this is how a launch buys land later)
    function raiseShare(uint16 to) external onlyHuman {
        require(to > shareBps && to <= factory.MAX_SHARE_BPS(), "can only raise");
        // a deal over an empty tax is worth nothing: the launch must carry the floor, now and from here on
        uint16 floor = factory.dealMinTaxSumBps();
        (, uint16 buyTax, uint16 sellTax, , , , , , ) = pad.launches(token);
        require(uint256(buyTax) + sellTax >= floor, "tax too low for a deal");
        if (floor > minTaxSumBps) minTaxSumBps = floor;
        release();
        emit ShareRaised(shareBps, to);
        shareBps = to;
    }

    /// @notice Split what is left after the treasury's share between up to four wallets (bps adding up to 10,000)
    function setWallets(address[] calldata wallets, uint16[] calldata bps) external onlyHuman {
        require(wallets.length > 0 && wallets.length <= MAX_WALLETS && wallets.length == bps.length, "wallets");
        release();
        delete _wallets;
        uint256 total;
        for (uint256 i = 0; i < wallets.length; i++) {
            require(wallets[i] != address(0) && wallets[i] != address(this) && bps[i] > 0, "wallet");
            total += bps[i];
            _wallets.push(Wallet(wallets[i], bps[i]));
        }
        require(total == BPS, "bps");
        emit WalletsSet(wallets, bps);
    }

    function walletsOf() external view returns (address[] memory w, uint16[] memory b) {
        w = new address[](_wallets.length);
        b = new uint16[](_wallets.length);
        for (uint256 i = 0; i < _wallets.length; i++) (w[i], b[i]) = (_wallets[i].wallet, _wallets[i].bps);
    }

    function isCreatorWallet(address who) external view returns (bool) {
        if (who == human) return true;
        for (uint256 i = 0; i < _wallets.length; i++) if (_wallets[i].wallet == who) return true;
        return false;
    }

    /// @notice Lower the launch's taxes (the pad only allows lowering). A launch with a deal keeps a floor.
    function lowerTaxes(uint16 buyTaxBps, uint16 sellTaxBps) external onlyHuman {
        require(uint256(buyTaxBps) + sellTaxBps >= minTaxSumBps, "below the deal's tax floor");
        release();
        pad.lowerTaxes(token, buyTaxBps, sellTaxBps);
    }

    function setMetadata(string calldata uri) external onlyHuman {
        pad.setMetadata(token, uri);
    }
}

/// @title Launches through VyrePad with an enforced treasury share, and tells the Lands contract about each launch
/// @notice A launch made here can carry a deal: the treasury takes a fixed share of the creator's tax, for good. The
/// early deal (set at launch) and the late deal (raised afterwards, larger) both open the door to land in Vyre Bad
/// Lands without reaching the market cap. A launch with no deal still works and still pays the pad's 1% as always.
contract LaunchFactory {
    using Clones for address;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_SHARE_BPS = 9_000;

    address public immutable implementation;
    IVyrePadLike public immutable pad;
    address public immutable owner;
    address public treasury;
    uint16 public immutable earlyBps; // share of the creator's tax for the early deal
    uint16 public immutable lateBps; // share needed for the late deal
    uint16 public immutable dealMinTaxSumBps; // a deal launch's buy+sell tax can never go below this

    mapping(address => address) public splitOf; // token => its LaunchSplit

    event Launched(address indexed token, address indexed creator, address split, uint16 shareBps);

    constructor(address pad_, address treasury_, uint16 earlyBps_, uint16 lateBps_, uint16 dealMinTaxSumBps_) {
        require(pad_ != address(0) && treasury_ != address(0), "zero");
        require(earlyBps_ > 0 && lateBps_ > earlyBps_ && lateBps_ <= MAX_SHARE_BPS, "bad shares");
        implementation = address(new LaunchSplit());
        pad = IVyrePadLike(pad_);
        treasury = treasury_;
        owner = msg.sender;
        earlyBps = earlyBps_;
        lateBps = lateBps_;
        dealMinTaxSumBps = dealMinTaxSumBps_;
    }

    function setTreasury(address to) external {
        require(msg.sender == owner && to != address(0), "owner only");
        treasury = to;
    }

    /// @notice Launch a coin. `shareBps` is 0 for no deal, or at least `earlyBps` for the early deal (capped at
    /// MAX_SHARE_BPS). With a deal, the buy+sell tax must be at least `dealMinTaxSumBps`, otherwise the deal is empty.
    function launch(IVyrePadLike.CreateParams calldata p, uint16 shareBps) external payable returns (address token) {
        require(shareBps == 0 || (shareBps >= earlyBps && shareBps <= MAX_SHARE_BPS), "bad deal share");
        uint16 floor = shareBps > 0 ? dealMinTaxSumBps : 0;
        require(uint256(p.buyTaxBps) + p.sellTaxBps >= floor, "tax too low for a deal");
        address clone = implementation.clone();
        token = LaunchSplit(payable(clone)).start{value: msg.value}(address(pad), msg.sender, shareBps, floor, p);
        splitOf[token] = clone;
        emit Launched(token, msg.sender, clone, shareBps);
    }

    // ----- what the Lands contract reads -----

    function creatorOf(address token) external view returns (address) {
        address s = splitOf[token];
        return s == address(0) ? address(0) : LaunchSplit(payable(s)).human();
    }

    function isCreatorWallet(address token, address who) external view returns (bool) {
        address s = splitOf[token];
        return s != address(0) && LaunchSplit(payable(s)).isCreatorWallet(who);
    }

    /// @notice 0: no deal. 1: the early deal (taken at launch). 2: the late deal (the share raised afterwards).
    /// A coin with the floor on its taxes lowered below it cannot exist: the split refuses it.
    function dealTier(address token) external view returns (uint8) {
        address s = splitOf[token];
        if (s == address(0)) return 0;
        LaunchSplit l = LaunchSplit(payable(s));
        uint16 share = l.shareBps();
        if (l.early() && share >= earlyBps) return 1;
        if (!l.early() && share >= lateBps) return 2;
        return 0;
    }
}
