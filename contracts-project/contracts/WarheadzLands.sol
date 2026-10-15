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

    /// @dev Share (in basis points) of the creator's tax that goes to `wallet` (sum over the tax wallet split)
    function taxShareOf(address token, address wallet) external view returns (uint16);
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
    uint64 public constant LAPSE_GRACE = 7 days; // how long a land can sit below the market cap with no deal before it is freed
    uint256 public constant POOL_BPS = 6_000; // share of paid USDC that joins the nation's war pool
    uint256 public constant LOOT_BPS = 2_000; // share of the loser's war pool a winning raid takes
    uint256 public constant UNIT_COST_BPS = 1; // coin burned per unit: 0.01% of supply
    uint256 public constant UNIT_SLOT_BPS = 5; // holding needed per unit a wallet has trained: 0.05% of supply
    uint256 public constant COMMANDER_BPS = 50; // holding needed to order a raid: 0.5% of supply
    uint256 public constant BUILD_COST_BPS = 10; // coin burned per defense level: 0.1% of supply, times the new level
    uint8 public constant MAX_LEVEL = 5;
    uint256 public constant LAND_POOL_BPS = 5_000; // share of a land payment that joins the nation's war pool
    uint8 public constant MAX_PLOTS = 16;
    uint256 public constant PASS_DEFENSE_BPS = 2_000; // defending a mountain pass: +20%
    int16 public constant START_RADIUS = 12;
    int16 public constant GROW_BY = 4;
    // terrain kinds
    uint8 public constant LAND = 0;
    uint8 public constant WATER = 1;
    uint8 public constant MOUNTAIN = 2;
    uint8 public constant COAST = 3; // land beside water: premium
    uint8 public constant PASS = 4; // land between two mountains: premium, defended better
    uint256 public constant MIN_BURN_BPS = 5_000; // the creator can never route more than half of a win to claims
    uint256 public constant POINTS_CAP = 10_000; // most a wallet can count for in one nation

    struct Nation {
        bool claimed;
        address creator;
        uint64 protectedUntil;
        uint64 nextRaidAt;
        uint64 lapsedSince;
        uint8 wall;
        uint8 tower;
        uint16 claimBps;
        bool claimBpsSet;
        uint32[4] units;
        uint32[] plots;
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
    uint256 public immutable premiumPrice; // USDC for a coast or pass plot (the first of a nation; later ones double)
    uint256 public immutable plotPrice; // USDC for an ordinary extra plot (doubles with every plot owned)
    uint16 public immutable dealBps; // share of a creator's tax that must go to the treasury to claim early
    uint256 public immutable seed; // fixes the terrain of the whole world

    int16 public radius = START_RADIUS;
    uint256 public claimedPlots;
    mapping(uint32 => address) public plotOwner; // packed (x, y) => nation (coin address)

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
    event PlotTaken(address indexed token, int16 x, int16 y, uint8 kind);
    event WorldGrew(int16 radius);
    event Lapsing(address indexed token, uint64 since);
    event Reclaimed(address indexed token, uint256 plotsFreed, uint256 forfeited);
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

    struct Params {
        address usdc;
        address marketCap;
        address registry;
        address treasury;
        uint256 claimMcap;
        uint256 speedUpPricePerHour;
        uint256 shieldPricePerHour;
        uint256 buybackThreshold;
        uint256 buybackStep;
        uint256 premiumPrice;
        uint256 plotPrice;
        uint16 dealBps;
        uint256 seed;
    }

    constructor(Params memory p) {
        require(p.usdc != address(0) && p.marketCap != address(0) && p.registry != address(0) && p.treasury != address(0), "zero");
        require(p.buybackStep > 0 && p.buybackThreshold >= p.buybackStep, "bad step");
        require(p.dealBps > 0 && p.dealBps <= BPS, "bad deal");
        usdc = IERC20(p.usdc);
        marketCap = IMarketCap(p.marketCap);
        registry = IPadRegistry(p.registry);
        treasury = p.treasury;
        owner = msg.sender;
        claimMcap = p.claimMcap;
        speedUpPricePerHour = p.speedUpPricePerHour;
        shieldPricePerHour = p.shieldPricePerHour;
        buybackThreshold = p.buybackThreshold;
        buybackStep = p.buybackStep;
        premiumPrice = p.premiumPrice;
        plotPrice = p.plotPrice;
        dealBps = p.dealBps;
        seed = p.seed;
    }

    // ------------------------------------------------------------------ land

    /// @notice Claim the land of a launched coin and pick its first plot. Two ways in:
    /// - the coin's 24-hour average market cap is at or above the claim level (a last-minute pump does not count);
    /// - or the creator's tax already sends at least `dealBps` of it to the treasury (the early deal), at any cap.
    /// The creator picks the plot. Once the market cap path is open, anyone may claim an ordinary plot for the coin,
    /// so a coin whose creator left still gets its land. A coast or pass plot costs `premiumPrice` USDC.
    function claimLand(address token, int16 x, int16 y) external nonReentrant {
        Nation storage n = nations[token];
        require(!n.claimed, "already claimed");
        address creator = registry.creatorOf(token);
        require(creator != address(0), "not a pad coin");
        bool capOk = marketCap.marketCap24h(token) >= claimMcap;
        bool dealOk = dealActive(token);
        require(capOk || dealOk, "needs the market cap or the early deal");
        uint8 kind = terrain(x, y);
        bool premium = kind == COAST || kind == PASS;
        require(msg.sender == creator || (capOk && !premium), "creator picks the plot");
        n.claimed = true;
        n.creator = creator;
        n.protectedUntil = uint64(block.timestamp) + COOLDOWN;
        _takePlot(token, n, x, y, kind);
        if (premium) _payUsdcFor(token, premiumPrice, LAND_POOL_BPS);
        emit LandClaimed(token, creator);
    }

    /// @notice Buy one more plot next to the nation's land. Burns coin and costs USDC (doubling with every plot owned,
    /// premium plots cost at least `premiumPrice`). Open while the market cap path or the early deal holds.
    function expand(address token, int16 x, int16 y) external nonReentrant {
        Nation storage n = _live(token);
        require(n.plots.length < MAX_PLOTS, "nation is full");
        require(marketCap.marketCap24h(token) >= claimMcap || dealActive(token), "needs the market cap or the early deal");
        uint256 supply = IERC20(token).totalSupply();
        require(IERC20(token).balanceOf(msg.sender) >= (supply * COMMANDER_BPS) / BPS, "not a commander");
        require(_touchesNation(n, x, y), "must touch your land");
        uint8 kind = terrain(x, y);
        uint256 cost = plotPrice << (n.plots.length - 1);
        if ((kind == COAST || kind == PASS) && cost < premiumPrice) cost = premiumPrice;
        IERC20(token).safeTransferFrom(msg.sender, DEAD, (supply * BUILD_COST_BPS * n.plots.length) / BPS);
        _takePlot(token, n, x, y, kind);
        _payUsdcFor(token, cost, LAND_POOL_BPS);
        _addPoints(token, msg.sender, 5);
    }

    /// @notice True while the creator's tax still sends the agreed share to the treasury (the creator can change the
    /// split any time; the early deal then stops holding)
    function dealActive(address token) public view returns (bool) {
        return registry.taxShareOf(token, treasury) >= dealBps;
    }

    /// @notice A land stays only while its coin keeps the market cap or the early deal holds. Anyone can mark a land
    /// that has neither; it can be freed after LAPSE_GRACE. If it recovers, marking again clears it.
    function markLapse(address token) external {
        Nation storage n = _live(token);
        bool lapsed = !dealActive(token) && marketCap.marketCap24h(token) < claimMcap;
        if (lapsed) {
            require(n.lapsedSince == 0, "already marked");
            n.lapsedSince = uint64(block.timestamp);
            emit Lapsing(token, n.lapsedSince);
        } else {
            n.lapsedSince = 0;
        }
    }

    /// @notice Free the plots of a land that has stayed lapsed for the whole grace period. Whatever USDC sat in its
    /// pools goes to the treasury, so a squatted plot is never free for the squatter and never trapped.
    function reclaim(address token) external nonReentrant {
        Nation storage n = _live(token);
        require(n.lapsedSince != 0 && block.timestamp >= n.lapsedSince + LAPSE_GRACE, "grace not over");
        require(!dealActive(token) && marketCap.marketCap24h(token) < claimMcap, "recovered");
        uint256 freed = n.plots.length;
        for (uint256 i = 0; i < freed; i++) plotOwner[n.plots[i]] = address(0);
        claimedPlots -= freed;
        uint256 forfeited = n.warPool + n.buybackPot;
        delete nations[token];
        if (forfeited > 0) usdc.safeTransfer(treasury, forfeited);
        emit Reclaimed(token, freed, forfeited);
    }

    function _takePlot(address token, Nation storage n, int16 x, int16 y, uint8 kind) private {
        require(kind != WATER && kind != MOUNTAIN, "cannot build there");
        require(_inside(x, y), "outside the world");
        uint32 key = _key(x, y);
        require(plotOwner[key] == address(0), "plot taken");
        plotOwner[key] = token;
        n.plots.push(key);
        claimedPlots += 1;
        _growIfNeeded();
        emit PlotTaken(token, x, y, kind);
    }

    function _growIfNeeded() private {
        uint256 side = uint256(int256(radius) * 2 + 1);
        if (claimedPlots * 10 > side * side * 4) {
            radius += GROW_BY;
            emit WorldGrew(radius);
        }
    }

    function _inside(int16 x, int16 y) private view returns (bool) {
        return x >= -radius && x <= radius && y >= -radius && y <= radius;
    }

    function _key(int16 x, int16 y) private pure returns (uint32) {
        return (uint32(uint16(x)) << 16) | uint32(uint16(y));
    }

    function _xy(uint32 key) private pure returns (int16 x, int16 y) {
        x = int16(uint16(key >> 16));
        y = int16(uint16(key));
    }

    function _touchesNation(Nation storage n, int16 x, int16 y) private view returns (bool) {
        for (uint256 i = 0; i < n.plots.length; i++) {
            (int16 px, int16 py) = _xy(n.plots[i]);
            if (_adjacent(px, py, x, y)) return true;
        }
        return false;
    }

    function _adjacent(int16 ax, int16 ay, int16 bx, int16 by) private pure returns (bool) {
        int256 dx = int256(ax) - int256(bx);
        int256 dy = int256(ay) - int256(by);
        if (dx < 0) dx = -dx;
        if (dy < 0) dy = -dy;
        return dx + dy == 1;
    }

    // ---------------------------------------------------------------- terrain

    /// @notice What a plot is. The world is fixed by the seed: lakes and ranges come in 4-by-4 blocks; land beside
    /// water is COAST; land between two mountains is a PASS. COAST and PASS are the premium spots.
    function terrain(int16 x, int16 y) public view returns (uint8) {
        uint8 base = _base(x, y);
        if (base != LAND) return base;
        bool w;
        bool mL = _base(x - 1, y) == MOUNTAIN;
        bool mR = _base(x + 1, y) == MOUNTAIN;
        bool mU = _base(x, y - 1) == MOUNTAIN;
        bool mD = _base(x, y + 1) == MOUNTAIN;
        w = _base(x - 1, y) == WATER || _base(x + 1, y) == WATER || _base(x, y - 1) == WATER || _base(x, y + 1) == WATER;
        if (w) return COAST;
        if ((mL && mR) || (mU && mD)) return PASS;
        return LAND;
    }

    function _base(int16 x, int16 y) private view returns (uint8) {
        uint256 r = uint256(keccak256(abi.encode(seed, _floorDiv(x, 4), _floorDiv(y, 4)))) % 100;
        if (r < 16) return WATER;
        if (r >= 84) return MOUNTAIN;
        // a second, finer and offset layer of small ridges: it leaves narrow gaps between mountains (the passes)
        uint256 r2 = uint256(keccak256(abi.encode(seed, "ridge", _floorDiv(x + 1, 3), _floorDiv(y + 2, 3)))) % 100;
        return r2 < 12 ? MOUNTAIN : LAND;
    }

    function _floorDiv(int16 v, int256 d) private pure returns (int256) {
        int256 x = int256(v);
        return x >= 0 ? x / d : -((-x + d - 1) / d);
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
    function raid(address attacker, address defender, uint32[3] calldata send, uint256 myPlot, uint256 theirPlot) external nonReentrant {
        Nation storage a = _live(attacker);
        Nation storage d = _live(defender);
        require(attacker != defender, "same nation");
        require(myPlot < a.plots.length && theirPlot < d.plots.length, "no such plot");
        {
            (int16 ax, int16 ay) = _xy(a.plots[myPlot]);
            (int16 dx, int16 dy) = _xy(d.plots[theirPlot]);
            require(_adjacent(ax, ay, dx, dy), "lands do not touch there");
        }
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

        (uint256 atk, uint256 def) = _powers(d, send, d.plots[theirPlot]);
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

    function _powers(Nation storage d, uint32[3] calldata send, uint32 targetKey) private view returns (uint256 atk, uint256 def) {
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
        (int16 px, int16 py) = _xy(targetKey);
        uint256 bonus = 1_000 * (uint256(d.wall) + d.tower);
        if (terrain(px, py) == PASS) bonus += PASS_DEFENSE_BPS;
        def = (base * (BPS + bonus)) / BPS;
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
        _payUsdcFor(token, amount, POOL_BPS);
    }

    function _payUsdcFor(address token, uint256 amount, uint256 poolBps) private {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 toPool = (amount * poolBps) / BPS;
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
