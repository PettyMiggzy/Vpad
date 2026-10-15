// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev 24-hour time-weighted market cap of a launched coin, in USDC units (an adapter over the pad's pools)
interface IMarketCap {
    function marketCap24h(address token) external view returns (uint256);
}

/// @dev What the pad knows about a coin's creator (the creator's own and tax wallets can never claim anything)
interface IPadRegistry {
    function creatorOf(address token) external view returns (address);

    function isCreatorWallet(address token, address who) external view returns (bool);
}

/// @dev Buys `token` with USDC pulled from the caller and burns it
interface IBuyback {
    function buyAndBurn(address token, uint256 usdcAmount) external;
}

/// @title Vyre Bad Lands: land, units, raids and the buyback pot of WARHEADZ
/// @notice A launched coin claims a land once its 24-hour average market cap reaches the claim level. Holders spend
/// the coin (burned) to train units and build defenses. USDC only speeds things up or buys shields (more protection
/// time, never more strength); 60% of it joins the nation's war pool, 40% goes to the treasury. A raid is decided by a
/// fixed formula with no randomness; a winning raid moves a share of the loser's war pool into the winner's buyback
/// pot, which buys back and burns the winner's own coin. The creator never receives any of it.
/// @dev Version 0 for the testnet. Not audited. See the notes at the bottom for what is not built yet.
contract WarheadzLands is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // units: 0 bruiser, 1 sniper, 2 trickster, 3 defender. Counter triangle: bruiser > trickster > sniper > bruiser.
    uint8 public constant BRUISER = 0;
    uint8 public constant SNIPER = 1;
    uint8 public constant TRICKSTER = 2;
    uint8 public constant DEFENDER = 3;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant BPS = 10_000;
    uint64 public constant COOLDOWN = 24 hours; // protection of every new land and of every land just raided
    uint64 public constant MAX_SHIELD = 72 hours; // the furthest ahead protection can be bought
    uint64 public constant TRAIN_TIME = 1 hours;
    uint256 public constant POOL_BPS = 6_000; // share of paid USDC that joins the nation's war pool
    uint256 public constant LOOT_BPS = 2_000; // share of the loser's war pool a winning raid takes
    uint256 public constant UNIT_COST_BPS = 1; // coin burned per unit: 0.01% of supply
    uint256 public constant UNIT_SLOT_BPS = 5; // holding needed per unit a wallet has trained: 0.05% of supply
    uint256 public constant COMMANDER_BPS = 50; // holding needed to order a raid: 0.5% of supply
    uint256 public constant BUILD_COST_BPS = 10; // coin burned per defense level: 0.1% of supply, times the new level
    uint8 public constant MAX_LEVEL = 5;
    uint256 public constant MIN_BURN_BPS = 5_000; // the creator can never route more than half of a win to claims
    uint256 public constant POINTS_CAP = 10_000; // most a wallet can count for in one nation

    struct Nation {
        bool claimed;
        address creator;
        uint64 protectedUntil;
        uint64 nextRaidAt;
        uint8 wall;
        uint8 tower;
        uint16 claimBps;
        bool claimBpsSet;
        uint32[4] units;
        uint256 warPool;
        uint256 buybackPot;
    }

    struct Job {
        address token;
        address trainer;
        uint8 unit;
        uint32 count;
        uint64 readyAt;
        bool collected;
    }

    struct Member {
        uint256 points;
        uint256 debt;
        uint256 owed;
        uint256 trained;
    }

    IERC20 public immutable usdc;
    IMarketCap public immutable marketCap;
    IPadRegistry public immutable registry;
    address public immutable owner;
    address public treasury;
    uint256 public immutable claimMcap;
    uint256 public immutable speedUpPricePerHour;
    uint256 public immutable shieldPricePerHour;
    uint256 public immutable buybackThreshold;
    uint256 public immutable buybackStep;

    IBuyback public buyback;
    IBuyback public pendingBuyback;
    uint64 public pendingBuybackAt;
    bool public claimsEnabled; // off until the owner's lawyer says yes

    mapping(address => Nation) internal nations;
    mapping(address => mapping(address => Member)) public members;
    mapping(address => uint256) public totalPoints;
    mapping(address => uint256) public accPerPoint;
    Job[] public jobs;

    event LandClaimed(address indexed token, address indexed creator);
    event Trained(address indexed token, address indexed by, uint8 unit, uint32 count, uint256 jobId, uint64 readyAt);
    event Collected(address indexed token, uint256 jobId);
    event SpedUp(address indexed token, uint256 jobId, uint64 hoursCut, uint256 usdcPaid);
    event Built(address indexed token, bool wall, uint8 level);
    event Shielded(address indexed token, uint64 protectedUntil, uint256 usdcPaid);
    event Raided(address indexed attacker, address indexed defender, bool success, uint256 attackPower, uint256 defensePower, uint256 loot);
    event BuybackSettled(address indexed token, uint256 burned, uint256 toClaims);
    event ClaimBpsSet(address indexed token, uint16 bps);
    event RewardsClaimed(address indexed token, address indexed who, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "owner only");
        _;
    }

    constructor(
        address usdc_,
        address marketCap_,
        address registry_,
        address treasury_,
        uint256 claimMcap_,
        uint256 speedUpPricePerHour_,
        uint256 shieldPricePerHour_,
        uint256 buybackThreshold_,
        uint256 buybackStep_
    ) {
        require(usdc_ != address(0) && marketCap_ != address(0) && registry_ != address(0) && treasury_ != address(0), "zero");
        require(buybackStep_ > 0 && buybackThreshold_ >= buybackStep_, "bad step");
        usdc = IERC20(usdc_);
        marketCap = IMarketCap(marketCap_);
        registry = IPadRegistry(registry_);
        treasury = treasury_;
        owner = msg.sender;
        claimMcap = claimMcap_;
        speedUpPricePerHour = speedUpPricePerHour_;
        shieldPricePerHour = shieldPricePerHour_;
        buybackThreshold = buybackThreshold_;
        buybackStep = buybackStep_;
    }

    // ------------------------------------------------------------------ land

    /// @notice Claim the land of a launched coin. Needs the 24-hour average market cap at or above the claim level,
    /// so a last-minute pump does not count. Anyone can call it.
    function claimLand(address token) external {
        Nation storage n = nations[token];
        require(!n.claimed, "already claimed");
        address creator = registry.creatorOf(token);
        require(creator != address(0), "not a pad coin");
        require(marketCap.marketCap24h(token) >= claimMcap, "market cap too low");
        n.claimed = true;
        n.creator = creator;
        n.protectedUntil = uint64(block.timestamp) + COOLDOWN;
        emit LandClaimed(token, creator);
    }

    // ----------------------------------------------------------------- units

    /// @notice Train units. Burns coin; a wallet can only have trained as many units as its holding allows.
    function train(address token, uint8 unit, uint32 count) external nonReentrant returns (uint256 jobId) {
        _live(token);
        require(unit <= DEFENDER && count > 0, "bad order");
        uint256 supply = IERC20(token).totalSupply();
        Member storage m = members[token][msg.sender];
        uint256 slot = (supply * UNIT_SLOT_BPS) / BPS;
        require(slot > 0, "supply too small");
        require(m.trained + count <= IERC20(token).balanceOf(msg.sender) / slot, "holding too small");
        m.trained += count;
        IERC20(token).safeTransferFrom(msg.sender, DEAD, (supply * UNIT_COST_BPS * count) / BPS);
        uint64 readyAt = uint64(block.timestamp) + TRAIN_TIME;
        jobs.push(Job(token, msg.sender, unit, count, readyAt, false));
        jobId = jobs.length - 1;
        _addPoints(token, msg.sender, count);
        emit Trained(token, msg.sender, unit, count, jobId, readyAt);
    }

    /// @notice Add the finished units to the nation. Anyone can call it.
    function collect(uint256 jobId) external {
        Job storage j = jobs[jobId];
        require(!j.collected, "collected");
        require(block.timestamp >= j.readyAt, "not ready");
        j.collected = true;
        nations[j.token].units[j.unit] += j.count;
        emit Collected(j.token, jobId);
    }

    /// @notice Pay USDC to take whole hours off a training job. Only speed: it adds no strength.
    function speedUp(uint256 jobId, uint64 hoursCut) external nonReentrant {
        Job storage j = jobs[jobId];
        require(!j.collected && hoursCut > 0, "nothing to speed up");
        uint64 left = j.readyAt > block.timestamp ? j.readyAt - uint64(block.timestamp) : 0;
        require(left > 0, "already ready");
        uint64 cut = uint64(hoursCut) * 1 hours;
        if (cut > left) cut = left;
        uint64 billedHours = (cut + 1 hours - 1) / 1 hours;
        uint256 cost = uint256(billedHours) * speedUpPricePerHour;
        j.readyAt -= cut;
        _payUsdc(j.token, cost);
        _addPoints(j.token, msg.sender, billedHours);
        emit SpedUp(j.token, jobId, billedHours, cost);
    }

    /// @notice Build the next level of a wall or a tower. Burns coin.
    function build(address token, bool wall) external nonReentrant {
        Nation storage n = _live(token);
        uint8 level = wall ? n.wall : n.tower;
        require(level < MAX_LEVEL, "max level");
        uint256 supply = IERC20(token).totalSupply();
        IERC20(token).safeTransferFrom(msg.sender, DEAD, (supply * BUILD_COST_BPS * (level + 1)) / BPS);
        if (wall) n.wall = level + 1;
        else n.tower = level + 1;
        _addPoints(token, msg.sender, 5 * (level + 1));
        emit Built(token, wall, level + 1);
    }

    /// @notice Buy more protection time (never more than MAX_SHIELD from now). Time only, never strength.
    function buyShield(address token, uint64 hoursToAdd) external nonReentrant {
        Nation storage n = _live(token);
        require(hoursToAdd > 0, "no hours");
        uint64 base = n.protectedUntil > block.timestamp ? n.protectedUntil : uint64(block.timestamp);
        uint64 target = base + hoursToAdd * 1 hours;
        require(target <= block.timestamp + MAX_SHIELD, "shield cap");
        n.protectedUntil = target;
        uint256 cost = uint256(hoursToAdd) * shieldPricePerHour;
        _payUsdc(token, cost);
        emit Shielded(token, target, cost);
    }

    // ----------------------------------------------------------------- raids

    /// @notice Send units of the attacker nation against another. Decided by a fixed formula, no chance involved.
    function raid(address attacker, address defender, uint32[3] calldata send) external nonReentrant {
        Nation storage a = _live(attacker);
        Nation storage d = _live(defender);
        require(attacker != defender, "same nation");
        require(block.timestamp >= a.nextRaidAt, "attacker cooling down");
        require(block.timestamp >= d.protectedUntil, "defender protected");
        uint256 supply = IERC20(attacker).totalSupply();
        require(IERC20(attacker).balanceOf(msg.sender) >= (supply * COMMANDER_BPS) / BPS, "not a commander");
        uint256 sent;
        for (uint8 i = 0; i < 3; i++) {
            require(send[i] <= a.units[i], "not enough units");
            sent += send[i];
        }
        require(sent > 0, "send something");

        (uint256 atk, uint256 def) = _powers(d, send);
        bool success = atk > def;

        // losses (integer, rounded down): winner's army loses 10%, loser's home army 30%; a failed raid costs half
        for (uint8 i = 0; i < 3; i++) {
            a.units[i] -= success ? send[i] / 10 : send[i] / 2;
        }
        for (uint8 i = 0; i < 4; i++) {
            d.units[i] -= success ? d.units[i] * 3 / 10 : d.units[i] / 10;
        }
        a.protectedUntil = uint64(block.timestamp); // attacking drops your own protection
        a.nextRaidAt = uint64(block.timestamp) + COOLDOWN;

        uint256 loot;
        if (success) {
            loot = (d.warPool * LOOT_BPS) / BPS;
            d.warPool -= loot;
            a.buybackPot += loot;
            d.protectedUntil = uint64(block.timestamp) + COOLDOWN;
            _addPoints(attacker, msg.sender, 10);
        }
        emit Raided(attacker, defender, success, atk, def, loot);
    }

    function _powers(Nation storage d, uint32[3] calldata send) private view returns (uint256 atk, uint256 def) {
        uint256 homeTotal = uint256(d.units[0]) + d.units[1] + d.units[2];
        for (uint8 i = 0; i < 3; i++) {
            // multiplier in bps: +50% against the type this unit beats, -50% against the type that beats it
            int256 mult = int256(BPS);
            if (homeTotal > 0) {
                int256 beaten = int256((uint256(d.units[(i + 2) % 3]) * BPS) / homeTotal);
                int256 beatenBy = int256((uint256(d.units[(i + 1) % 3]) * BPS) / homeTotal);
                mult += (beaten - beatenBy) / 2;
            }
            atk += (uint256(send[i]) * 100 * uint256(mult)) / BPS;
        }
        uint256 base = homeTotal * 100 + uint256(d.units[DEFENDER]) * 150;
        def = (base * (BPS + 1_000 * (uint256(d.wall) + d.tower))) / BPS;
    }

    // ------------------------------------------------------- buyback and claims

    /// @notice Spend a step of a nation's buyback pot: buy its coin back and burn it. While claims are off (or
    /// nobody has earned points) the whole step is burned. Anyone can call it once the pot reaches the threshold.
    function settleBuyback(address token) external nonReentrant {
        Nation storage n = nations[token];
        require(address(buyback) != address(0), "no buyback set");
        require(n.buybackPot >= buybackThreshold, "pot below threshold");
        uint256 amount = n.buybackPot < buybackStep ? n.buybackPot : buybackStep;
        n.buybackPot -= amount;
        uint256 toClaims;
        if (claimsEnabled && totalPoints[token] > 0) toClaims = (amount * n.claimBps) / BPS;
        if (toClaims > 0) accPerPoint[token] += (toClaims * 1e18) / totalPoints[token];
        uint256 burnAmount = amount - toClaims;
        usdc.forceApprove(address(buyback), burnAmount);
        buyback.buyAndBurn(token, burnAmount);
        emit BuybackSettled(token, burnAmount, toClaims);
    }

    /// @notice The creator picks how much of a win may go to claims: once, up to half, and only ever lowered after.
    function setClaimBps(address token, uint16 bps) external {
        Nation storage n = nations[token];
        require(n.claimed && msg.sender == n.creator, "creator only");
        require(bps <= BPS - MIN_BURN_BPS, "too high");
        require(!n.claimBpsSet || bps <= n.claimBps, "can only lower");
        n.claimBps = bps;
        n.claimBpsSet = true;
        emit ClaimBpsSet(token, bps);
    }

    /// @notice Claim what participation earned. Off until the owner switches claims on.
    function claimRewards(address token) external nonReentrant {
        require(claimsEnabled, "claims are off");
        Member storage m = members[token][msg.sender];
        uint256 amount = m.owed + (m.points * accPerPoint[token]) / 1e18 - m.debt;
        m.owed = 0;
        m.debt = (m.points * accPerPoint[token]) / 1e18;
        require(amount > 0, "nothing to claim");
        usdc.safeTransfer(msg.sender, amount);
        emit RewardsClaimed(token, msg.sender, amount);
    }

    function pendingRewards(address token, address who) external view returns (uint256) {
        Member storage m = members[token][who];
        return m.owed + (m.points * accPerPoint[token]) / 1e18 - m.debt;
    }

    // ----------------------------------------------------------------- admin

    function setClaimsEnabled(bool on) external onlyOwner {
        claimsEnabled = on;
    }

    function setTreasury(address to) external onlyOwner {
        require(to != address(0), "zero");
        treasury = to;
    }

    /// @notice The buyback helper can only change after a 2-day wait, so nobody can swap it in a hurry
    function queueBuyback(address to) external onlyOwner {
        require(to != address(0), "zero");
        pendingBuyback = IBuyback(to);
        pendingBuybackAt = uint64(block.timestamp) + 2 days;
    }

    function activateBuyback() external onlyOwner {
        require(address(pendingBuyback) != address(0) && block.timestamp >= pendingBuybackAt, "not yet");
        buyback = pendingBuyback;
        pendingBuyback = IBuyback(address(0));
    }

    // ------------------------------------------------------------------ views

    function nation(address token) external view returns (Nation memory) {
        return nations[token];
    }

    function jobCount() external view returns (uint256) {
        return jobs.length;
    }

    // --------------------------------------------------------------- internals

    function _live(address token) private view returns (Nation storage n) {
        n = nations[token];
        require(n.claimed, "no land");
    }

    function _payUsdc(address token, uint256 amount) private {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 toPool = (amount * POOL_BPS) / BPS;
        nations[token].warPool += toPool;
        if (amount > toPool) usdc.safeTransfer(treasury, amount - toPool);
    }

    function _addPoints(address token, address who, uint256 add) private {
        if (who == nations[token].creator || registry.isCreatorWallet(token, who)) return; // creators earn nothing
        Member storage m = members[token][who];
        uint256 acc = accPerPoint[token];
        m.owed += (m.points * acc) / 1e18 - m.debt;
        uint256 room = POINTS_CAP > m.points ? POINTS_CAP - m.points : 0;
        if (add > room) add = room;
        m.points += add;
        totalPoints[token] += add;
        m.debt = (m.points * acc) / 1e18;
    }

    // NOT BUILT YET (version 0): the 10M-coin holders' eligibility without participation (needs a hold snapshot per
    // round), trading-activity scoring in raids, the market-cap adapter over the pad's pools, the buyback helper that
    // swaps through a pool. "Different buyers" in the claim rule cannot be checked on chain: the 24-hour average is
    // the guard against a last-minute pump.
}
