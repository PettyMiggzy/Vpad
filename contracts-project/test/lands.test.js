const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

const E = (n) => ethers.parseUnits(String(n), 18);
const SUPPLY = E(1_000_000_000);
const HOLD = SUPPLY / 10n; // 10% of supply each
const LAND = 0, WATER = 1, MOUNTAIN = 2, COAST = 3, PASS = 4;
const DEAL = 1000;

let SEED, MAP, PAIR, PASSPAIR; // MAP[y][x] terrain for the chosen seed

async function deployLands(F, usdc, cap, reg, treasury, seed, thr = E(100)) {
  return F('WarheadzLands', {
    usdc: await usdc.getAddress(), marketCap: await cap.getAddress(), registry: await reg.getAddress(), treasury: treasury.address,
    claimMcap: E(50_000), speedUpPricePerHour: E(1), shieldPricePerHour: E(2),
    buybackThreshold: thr, buybackStep: thr, premiumPrice: E(20), plotPrice: E(5), dealBps: DEAL, seed,
  });
}

before(async function () {
  this.timeout(600000);
  const [, , treasury] = await ethers.getSigners();
  const F = async (n, ...a) => (await ethers.getContractFactory(n)).deploy(...a);
  const usdc = await F('MockToken', 'USDC', E(1));
  const cap = await F('MockMarketCap');
  const reg = await F('MockRegistry');
  for (let seed = 1; seed < 60; seed++) {
    const L = await deployLands(F, usdc, cap, reg, treasury, seed);
    const map = [];
    for (let y = -12; y <= 12; y++) {
      const row = [];
      for (let x = -12; x <= 12; x++) row.push(Number(await L.terrain(x, y)));
      map.push(row);
    }
    const at = (x, y) => map[y + 12]?.[x + 12];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let pair = null, pp = null;
    for (let y = -12; y <= 12 && !(pair && pp); y++)
      for (let x = -12; x <= 12 && !(pair && pp); x++) {
        if (at(x, y) !== LAND) continue;
        for (const [dx, dy] of dirs) {
          const t = at(x + dx, y + dy);
          if (!pair && t === LAND) pair = [[x, y], [x + dx, y + dy]];
          if (!pp && t === PASS) pp = [[x, y], [x + dx, y + dy]];
        }
      }
    if (pair && pp) { SEED = seed; MAP = map; PAIR = pair; PASSPAIR = pp; return; }
  }
  throw new Error('no seed with a land pair and a pass');
});

async function setup(thr = E(100)) {
  const [owner, creator, treasury, alice, bob, carol] = await ethers.getSigners();
  const F = async (n, ...a) => (await ethers.getContractFactory(n)).deploy(...a);
  const usdc = await F('MockToken', 'USDC', E(10_000_000));
  const cap = await F('MockMarketCap');
  const reg = await F('MockRegistry');
  const lands = await deployLands(F, usdc, cap, reg, treasury, SEED, thr);
  const buyback = await F('MockBuyback', await usdc.getAddress());
  for (const u of [alice, bob, carol, creator]) {
    await usdc.transfer(u.address, E(10_000));
    await usdc.connect(u).approve(await lands.getAddress(), ethers.MaxUint256);
  }
  async function coinFor(holders, mcap = 60_000) {
    const coin = await F('MockToken', 'COIN', SUPPLY);
    await reg.set(await coin.getAddress(), creator.address);
    await cap.set(await coin.getAddress(), E(mcap));
    for (const h of holders) await coin.transfer(h.address, HOLD);
    for (const h of holders) await coin.connect(h).approve(await lands.getAddress(), ethers.MaxUint256);
    return coin;
  }
  async function nation(holders, plot = PAIR[0]) {
    const coin = await coinFor(holders);
    await lands.connect(creator).claimLand(await coin.getAddress(), plot[0], plot[1]);
    return coin;
  }
  async function two(hA, hB) {
    return [await nation(hA, PAIR[0]), await nation(hB, PAIR[1])];
  }
  async function army(coin, who, unit, count) {
    const id = await lands.connect(who).train.staticCall(await coin.getAddress(), unit, count);
    await lands.connect(who).train(await coin.getAddress(), unit, count);
    await time.increase(3601);
    await lands.collect(id);
  }
  const raid = (who, a, b, send) => lands.connect(who).raid(a, b, send, 0, 0);
  return { owner, creator, treasury, alice, bob, carol, usdc, cap, reg, lands, buyback, coinFor, nation, two, army, raid, F };
}

describe('Bad Lands: the map', () => {
  it('has water, mountains, coast and pass plots, and is the same every time', async () => {
    const { lands } = await setup();
    const flat = MAP.flat();
    for (const k of [LAND, WATER, MOUNTAIN, COAST, PASS]) expect(flat.includes(k), `kind ${k}`).to.equal(true);
    expect(Number(await lands.terrain(PAIR[0][0], PAIR[0][1]))).to.equal(LAND);
    expect(Number(await lands.terrain(PAIR[0][0], PAIR[0][1]))).to.equal(LAND);
  });
});

describe('Bad Lands: claiming and buying land', () => {
  it('claims at the market cap, only for pad coins, only once, never on water or mountains', async () => {
    const { lands, cap, reg, creator, coinFor } = await setup();
    const coin = await coinFor([], 49_999);
    const a = await coin.getAddress();
    await expect(lands.connect(creator).claimLand(a, PAIR[0][0], PAIR[0][1])).to.be.revertedWith('needs the market cap or the early deal');
    await cap.set(a, E(50_000));
    const water = [...MAP.keys()].flatMap((r) => MAP[r].map((t, c) => [t, c - 12, r - 12])).find((v) => v[0] === WATER);
    const mount = [...MAP.keys()].flatMap((r) => MAP[r].map((t, c) => [t, c - 12, r - 12])).find((v) => v[0] === MOUNTAIN);
    await expect(lands.connect(creator).claimLand(a, water[1], water[2])).to.be.revertedWith('cannot build there');
    await expect(lands.connect(creator).claimLand(a, mount[1], mount[2])).to.be.revertedWith('cannot build there');
    await lands.connect(creator).claimLand(a, PAIR[0][0], PAIR[0][1]);
    await expect(lands.connect(creator).claimLand(a, PAIR[1][0], PAIR[1][1])).to.be.revertedWith('already claimed');
    await expect(lands.connect(creator).claimLand(await (await coinFor([])).getAddress(), PAIR[0][0], PAIR[0][1])).to.be.revertedWith('plot taken');
  });

  it('a coin the pad does not know cannot claim', async () => {
    const { lands, F } = await setup();
    const coin = await F('MockToken', 'X', SUPPLY);
    await expect(lands.claimLand(await coin.getAddress(), PAIR[0][0], PAIR[0][1])).to.be.revertedWith('not a pad coin');
  });

  it('a premium (coast or pass) plot costs 20 USDC, split between the nation pool and the treasury; only the creator may pick it', async () => {
    const { lands, coinFor, creator, alice, usdc, treasury } = await setup();
    const coin = await coinFor([alice]);
    const a = await coin.getAddress();
    const flat = MAP.flatMap((row, r) => row.map((t, c) => [t, c - 12, r - 12]));
    const coast = flat.find((v) => v[0] === COAST);
    await expect(lands.connect(alice).claimLand(a, coast[1], coast[2])).to.be.revertedWith('creator picks the plot');
    const before = await usdc.balanceOf(treasury.address);
    await lands.connect(creator).claimLand(a, coast[1], coast[2]);
    expect((await usdc.balanceOf(treasury.address)) - before).to.equal(E(10));
    expect((await lands.nation(a)).warPool).to.equal(E(10));
  });

  it('anyone can claim an ordinary plot for a coin once it has the market cap, so an absent creator does not block it', async () => {
    const { lands, coinFor, alice } = await setup();
    const coin = await coinFor([alice]);
    await lands.connect(alice).claimLand(await coin.getAddress(), PAIR[0][0], PAIR[0][1]);
    expect((await lands.nation(await coin.getAddress())).claimed).to.equal(true);
  });

  it('the early deal lets a coin claim below the market cap while the creator tax still sends the share to the treasury', async () => {
    const { lands, coinFor, reg, creator, treasury } = await setup();
    const coin = await coinFor([], 1_000);
    const a = await coin.getAddress();
    await expect(lands.connect(creator).claimLand(a, PAIR[0][0], PAIR[0][1])).to.be.revertedWith('needs the market cap or the early deal');
    await reg.setShare(a, treasury.address, DEAL - 1);
    await expect(lands.connect(creator).claimLand(a, PAIR[0][0], PAIR[0][1])).to.be.revertedWith('needs the market cap or the early deal');
    await reg.setShare(a, treasury.address, DEAL);
    await lands.connect(creator).claimLand(a, PAIR[0][0], PAIR[0][1]);
    expect(await lands.dealActive(a)).to.equal(true);
    await reg.setShare(a, treasury.address, 0); // the creator changes the split
    expect(await lands.dealActive(a)).to.equal(false);
  });

  it('expanding needs a touching plot, doubles in price, and stops when the market cap and the deal both fail', async () => {
    const { lands, coinFor, creator, alice, usdc, cap } = await setup();
    const coin = await coinFor([alice]);
    const a = await coin.getAddress();
    await lands.connect(creator).claimLand(a, PAIR[0][0], PAIR[0][1]);
    const far = [PAIR[0][0] + 5, PAIR[0][1]];
    await expect(lands.connect(alice).expand(a, far[0], far[1])).to.be.revertedWith('must touch your land');
    const [px, py] = PAIR[0];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const next = dirs.map(([dx, dy]) => [px + dx, py + dy]).find(([x, y]) => MAP[y + 12]?.[x + 12] === LAND && !(x === PAIR[1][0] && y === PAIR[1][1]));
    const before = await usdc.balanceOf(alice.address);
    await lands.connect(alice).expand(a, next[0], next[1]);
    expect(before - (await usdc.balanceOf(alice.address))).to.equal(E(5));
    expect((await lands.nation(a)).plots.length).to.equal(2);
    await cap.set(a, E(10)); // fell below, and there is no deal
    const next2 = [next[0] + (next[0] - px), next[1] + (next[1] - py)];
    await expect(lands.connect(alice).expand(a, next2[0], next2[1])).to.be.revertedWith('needs the market cap or the early deal');
  });

  it('the world grows once enough of it is claimed', async () => {
    const { lands, nation, alice } = await setup();
    expect(await lands.radius()).to.equal(12n);
    await nation([alice]);
    expect(await lands.claimedPlots()).to.equal(1n);
  });
});

describe('Bad Lands: abandoned land', () => {
  it('a land that keeps neither the market cap nor the deal is freed after the grace period, and its pools go to the treasury', async () => {
    const { lands, coinFor, reg, creator, treasury, usdc, alice, cap, F } = await setup();
    const coin = await coinFor([alice], 1_000);
    const a = await coin.getAddress();
    await reg.setShare(a, treasury.address, DEAL);
    await lands.connect(creator).claimLand(a, PAIR[0][0], PAIR[0][1]);
    await lands.connect(alice).train(a, 0, 1);
    await lands.connect(alice).speedUp(0, 1); // 0.6 USDC into the war pool
    await expect(lands.markLapse(a)).to.not.emit(lands, 'Lapsing'); // the deal still holds
    await reg.setShare(a, treasury.address, 0); // the creator pulls the deal
    await expect(lands.reclaim(a)).to.be.revertedWith('grace not over');
    await lands.markLapse(a);
    await expect(lands.markLapse(a)).to.be.revertedWith('already marked');
    await time.increase(7 * 24 * 3600 - 10);
    await expect(lands.reclaim(a)).to.be.revertedWith('grace not over');
    await time.increase(20);
    const before = await usdc.balanceOf(treasury.address);
    await expect(lands.reclaim(a)).to.emit(lands, 'Reclaimed').withArgs(a, 1, E(0.6));
    expect((await usdc.balanceOf(treasury.address)) - before).to.equal(E(0.6));
    expect((await lands.nation(a)).claimed).to.equal(false);
    expect(await lands.plotOwner((PAIR[0][0] & 0xffff) * 65536 + (PAIR[0][1] & 0xffff))).to.equal(ethers.ZeroAddress);
    // the plot can be taken again by another coin
    const other = await coinFor([], 60_000);
    await lands.connect(creator).claimLand(await other.getAddress(), PAIR[0][0], PAIR[0][1]);
  });

  it('a land that recovers is not freed', async () => {
    const { lands, coinFor, creator, cap, alice } = await setup();
    const coin = await coinFor([alice], 60_000);
    const a = await coin.getAddress();
    await lands.connect(creator).claimLand(a, PAIR[0][0], PAIR[0][1]);
    await cap.set(a, E(1_000));
    await lands.markLapse(a);
    await cap.set(a, E(60_000));
    await time.increase(8 * 24 * 3600);
    await expect(lands.reclaim(a)).to.be.revertedWith('recovered');
    await lands.markLapse(a); // clears the mark
    expect((await lands.nation(a)).lapsedSince).to.equal(0n);
  });
});

describe('Bad Lands: units, shields, raids', () => {
  it('training burns coin and is limited by what the wallet holds', async () => {
    const { lands, nation, alice } = await setup();
    const coin = await nation([alice]);
    const a = await coin.getAddress();
    await lands.connect(alice).train(a, 0, 200);
    expect(await coin.balanceOf('0x000000000000000000000000000000000000dEaD')).to.equal((SUPPLY * 200n) / 10000n);
    await expect(lands.connect(alice).train(a, 0, 1)).to.be.revertedWith('holding too small');
    await expect(lands.connect(alice).train(a, 7, 1)).to.be.revertedWith('bad order');
  });

  it('units only arrive when ready, and speed-ups cost USDC split 60/40', async () => {
    const { lands, nation, alice, usdc, treasury } = await setup();
    const coin = await nation([alice]);
    const a = await coin.getAddress();
    await lands.connect(alice).train(a, 1, 10);
    await expect(lands.collect(0)).to.be.revertedWith('not ready');
    await lands.connect(alice).speedUp(0, 1);
    await lands.collect(0);
    expect((await lands.nation(a)).units[1]).to.equal(10n);
    expect((await lands.nation(a)).warPool).to.equal((E(1) * 6n) / 10n);
    expect(await usdc.balanceOf(treasury.address)).to.equal((E(1) * 4n) / 10n);
    await expect(lands.collect(0)).to.be.revertedWith('collected');
  });

  it('shields add time up to the cap and nothing else', async () => {
    const { lands, nation, alice } = await setup();
    const coin = await nation([alice]);
    const a = await coin.getAddress();
    await expect(lands.connect(alice).buyShield(a, 73)).to.be.revertedWith('shield cap');
    await lands.connect(alice).buyShield(a, 48);
    const n = await lands.nation(a);
    expect(n.protectedUntil).to.be.gt((await time.latest()) + 24 * 3600);
    expect(n.units.map(Number)).to.deep.equal([0, 0, 0, 0]);
    expect(n.wall + n.tower).to.equal(0n);
  });

  it('new lands are protected for the cooldown, and lands must touch to fight', async () => {
    const { lands, two, army, alice, bob, raid, coinFor, creator } = await setup();
    const [A, B] = await two([alice], [bob]);
    await army(A, alice, 0, 10);
    await expect(raid(alice, await A.getAddress(), await B.getAddress(), [10, 0, 0])).to.be.revertedWith('defender protected');
    await time.increase(24 * 3600);
    await raid(alice, await A.getAddress(), await B.getAddress(), [10, 0, 0]);
    const coin = await coinFor([alice]);
    const flat = MAP.flatMap((row, r) => row.map((t, c) => [t, c - 12, r - 12]));
    const far = flat.find(([t, x, y]) => t === LAND && Math.abs(x - PAIR[0][0]) + Math.abs(y - PAIR[0][1]) > 2 && Math.abs(x - PAIR[1][0]) + Math.abs(y - PAIR[1][1]) > 2);
    await lands.connect(creator).claimLand(await coin.getAddress(), far[1], far[2]);
    await time.increase(24 * 3600);
    await expect(lands.connect(alice).raid(await A.getAddress(), await coin.getAddress(), [1, 0, 0], 0, 0)).to.be.revertedWith('lands do not touch there');
  });

  it('the counter triangle decides: snipers beat bruisers, tricksters do not', async () => {
    const { lands, two, army, alice, bob, carol, raid } = await setup();
    const [A, B] = await two([alice, carol], [bob]);
    const a = await A.getAddress(), b = await B.getAddress();
    await army(B, bob, 0, 100);
    await army(A, alice, 1, 100);
    await army(A, carol, 2, 100);
    await time.increase(24 * 3600);
    await expect(raid(alice, a, b, [0, 0, 100])).to.emit(lands, 'Raided').withArgs(a, b, false, 5000, 10000, 0);
    await time.increase(24 * 3600);
    await expect(raid(alice, a, b, [0, 100, 0])).to.emit(lands, 'Raided').withArgs(a, b, true, 15000, 9000, anyValue);
  });

  it('a won raid moves a share of the loser pool into the winner buyback pot, then the loser is protected', async () => {
    const { lands, two, army, alice, bob, raid } = await setup();
    const [A, B] = await two([alice], [bob]);
    const a = await A.getAddress(), b = await B.getAddress();
    await lands.connect(bob).train(b, 3, 1);
    await lands.connect(bob).speedUp(0, 1);
    await lands.collect(0);
    await army(A, alice, 0, 50);
    await time.increase(24 * 3600);
    await raid(alice, a, b, [50, 0, 0]);
    expect((await lands.nation(b)).warPool).to.equal((E(0.6) * 8n) / 10n);
    expect((await lands.nation(a)).buybackPot).to.equal((E(0.6) * 2n) / 10n);
    await expect(raid(alice, a, b, [10, 0, 0])).to.be.revertedWith('attacker cooling down');
  });

  it('defending a mountain pass is 20% stronger', async () => {
    const { lands, coinFor, creator, alice, bob, army } = await setup();
    const [[ax, ay], [px, py]] = PASSPAIR; // ax,ay is land; px,py is a pass beside it
    const coinB = await coinFor([bob]);
    const coinA = await coinFor([alice]);
    await lands.connect(creator).claimLand(await coinB.getAddress(), px, py); // premium, paid by the creator
    await lands.connect(creator).claimLand(await coinA.getAddress(), ax, ay);
    await army(coinB, bob, 0, 100);
    await army(coinA, alice, 1, 100);
    await time.increase(24 * 3600);
    await expect(lands.connect(alice).raid(await coinA.getAddress(), await coinB.getAddress(), [0, 100, 0], 0, 0))
      .to.emit(lands, 'Raided').withArgs(await coinA.getAddress(), await coinB.getAddress(), true, 15000, 12000, anyValue);
  });

  it('only a real holder can order a raid', async () => {
    const { two, army, alice, bob, carol, raid } = await setup();
    const [A, B] = await two([alice], [bob]);
    await army(A, alice, 0, 10);
    await time.increase(24 * 3600);
    await expect(raid(carol, await A.getAddress(), await B.getAddress(), [10, 0, 0])).to.be.revertedWith('not a commander');
  });
});

describe('Bad Lands: buyback and claims', () => {
  async function loot(ctx) {
    const { lands, two, army, alice, bob, buyback, raid } = ctx;
    const [A, B] = await two([alice], [bob]);
    const a = await A.getAddress(), b = await B.getAddress();
    await lands.queueBuyback(await buyback.getAddress());
    await time.increase(2 * 24 * 3600 + 1);
    await lands.activateBuyback();
    await lands.connect(bob).train(b, 3, 1);
    await lands.connect(bob).speedUp(0, 1);
    await lands.collect(0);
    await army(A, alice, 0, 50);
    await time.increase(24 * 3600);
    return { A, B, a, b, raid };
  }

  it('needs a helper after a 2-day wait, refuses below the threshold', async () => {
    const { lands, buyback, nation, alice } = await setup(E(100));
    const A = await nation([alice]);
    await expect(lands.settleBuyback(await A.getAddress())).to.be.revertedWith('no buyback set');
    await lands.queueBuyback(await buyback.getAddress());
    await expect(lands.activateBuyback()).to.be.revertedWith('not yet');
    await time.increase(2 * 24 * 3600 + 1);
    await lands.activateBuyback();
    await expect(lands.settleBuyback(await A.getAddress())).to.be.revertedWith('pot below threshold');
  });

  it('with claims off the whole step is burned', async () => {
    const ctx = await setup(E(0.05));
    const { lands, buyback, alice, raid } = ctx;
    const { a, b } = await loot(ctx);
    await raid(alice, a, b, [50, 0, 0]);
    expect((await lands.nation(a)).buybackPot).to.equal(E(0.12));
    await expect(lands.settleBuyback(a)).to.emit(lands, 'BuybackSettled').withArgs(a, E(0.05), 0);
    expect(await buyback.burned()).to.equal(E(0.05));
  });

  it('with claims on, the creator-set share goes to participants, not the creator', async () => {
    const ctx = await setup(E(0.05));
    const { lands, alice, creator, usdc, raid } = ctx;
    const { a, b } = await loot(ctx);
    await lands.connect(creator).setClaimBps(a, 3000);
    await lands.setClaimsEnabled(true);
    await raid(alice, a, b, [50, 0, 0]);
    await expect(lands.settleBuyback(a)).to.emit(lands, 'BuybackSettled').withArgs(a, E(0.035), E(0.015));
    const owed = await lands.pendingRewards(a, alice.address);
    expect(owed).to.be.gt(0n);
    expect(await lands.pendingRewards(a, creator.address)).to.equal(0n);
    const before = await usdc.balanceOf(alice.address);
    await lands.connect(alice).claimRewards(a);
    expect((await usdc.balanceOf(alice.address)) - before).to.equal(owed);
    await expect(lands.connect(creator).claimRewards(a)).to.be.revertedWith('nothing to claim');
  });

  it('the claim share is lowerable never raisable; the creator earns no points; claims are off by default', async () => {
    const { lands, nation, alice, creator } = await setup();
    const coin = await nation([alice, creator]);
    const a = await coin.getAddress();
    await expect(lands.connect(alice).setClaimBps(a, 3000)).to.be.revertedWith('creator only');
    await expect(lands.connect(creator).setClaimBps(a, 5001)).to.be.revertedWith('too high');
    await lands.connect(creator).setClaimBps(a, 3000);
    await lands.connect(creator).setClaimBps(a, 2000);
    await expect(lands.connect(creator).setClaimBps(a, 2500)).to.be.revertedWith('can only lower');
    await lands.connect(creator).train(a, 0, 10);
    await lands.connect(alice).train(a, 0, 10);
    expect((await lands.members(a, creator.address)).points).to.equal(0n);
    expect((await lands.members(a, alice.address)).points).to.equal(10n);
    await expect(lands.connect(alice).claimRewards(a)).to.be.revertedWith('claims are off');
  });

  it('only the owner switches claims on', async () => {
    const { lands, alice } = await setup();
    await expect(lands.connect(alice).setClaimsEnabled(true)).to.be.revertedWith('owner only');
  });
});
