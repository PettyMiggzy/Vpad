const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

const E = (n) => ethers.parseUnits(String(n), 18);
const SUPPLY = E(1_000_000_000);
const HOLD = SUPPLY / 10n; // 10% of supply each

async function setup(thr = E(100)) {
  const [owner, creator, treasury, alice, bob, carol] = await ethers.getSigners();
  const F = async (n, ...a) => (await ethers.getContractFactory(n)).deploy(...a);
  const usdc = await F('MockToken', 'USDC', E(10_000_000));
  const cap = await F('MockMarketCap');
  const reg = await F('MockRegistry');
  const lands = await F(
    'WarheadzLands',
    await usdc.getAddress(), await cap.getAddress(), await reg.getAddress(), treasury.address,
    E(50_000), E(1), E(2), thr, thr
  );
  const buyback = await F('MockBuyback', await usdc.getAddress());
  for (const u of [alice, bob, carol, creator]) {
    await usdc.transfer(u.address, E(10_000));
    await usdc.connect(u).approve(await lands.getAddress(), ethers.MaxUint256);
  }
  async function nation(holders) {
    const coin = await F('MockToken', 'COIN', SUPPLY);
    await reg.set(await coin.getAddress(), creator.address);
    await cap.set(await coin.getAddress(), E(60_000));
    for (const h of holders) await coin.transfer(h.address, HOLD);
    for (const h of holders) await coin.connect(h).approve(await lands.getAddress(), ethers.MaxUint256);
    await lands.claimLand(await coin.getAddress());
    return coin;
  }
  async function army(coin, who, unit, count) {
    const id = (await lands.connect(who).train.staticCall(await coin.getAddress(), unit, count));
    await lands.connect(who).train(await coin.getAddress(), unit, count);
    await time.increase(3601);
    await lands.collect(id);
  }
  return { owner, creator, treasury, alice, bob, carol, usdc, cap, reg, lands, buyback, nation, army, F };
}

describe('WarheadzLands', () => {
  it('claims land only at the market cap, only for pad coins, only once', async () => {
    const { lands, cap, reg, creator, F } = await setup();
    const coin = await F('MockToken', 'C', SUPPLY);
    const a = await coin.getAddress();
    await expect(lands.claimLand(a)).to.be.revertedWith('not a pad coin');
    await reg.set(a, creator.address);
    await cap.set(a, E(49_999));
    await expect(lands.claimLand(a)).to.be.revertedWith('market cap too low');
    await cap.set(a, E(50_000));
    await lands.claimLand(a);
    await expect(lands.claimLand(a)).to.be.revertedWith('already claimed');
    const n = await lands.nation(a);
    expect(n.claimed).to.equal(true);
    expect(n.creator).to.equal(creator.address);
  });

  it('training burns coin and is limited by what the wallet holds', async () => {
    const { lands, nation, alice } = await setup();
    const coin = await nation([alice]);
    const a = await coin.getAddress();
    await lands.connect(alice).train(a, 0, 200); // 10% holding allows 200
    expect(await coin.balanceOf('0x000000000000000000000000000000000000dEaD')).to.equal((SUPPLY * 200n) / 10000n);
    await expect(lands.connect(alice).train(a, 0, 1)).to.be.revertedWith('holding too small');
    await expect(lands.connect(alice).train(a, 7, 1)).to.be.revertedWith('bad order');
  });

  it('units only arrive when the job is ready, and speed-ups cost USDC split 60/40', async () => {
    const { lands, nation, alice, usdc, treasury } = await setup();
    const coin = await nation([alice]);
    const a = await coin.getAddress();
    await lands.connect(alice).train(a, 1, 10);
    await expect(lands.collect(0)).to.be.revertedWith('not ready');
    await lands.connect(alice).speedUp(0, 1);
    await lands.collect(0);
    expect((await lands.nation(a)).units[1]).to.equal(10n);
    expect((await lands.nation(a)).warPool).to.equal(E(1) * 6n / 10n);
    expect(await usdc.balanceOf(treasury.address)).to.equal(E(1) * 4n / 10n);
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

  it('new lands are protected for the cooldown', async () => {
    const { lands, nation, army, alice, bob } = await setup();
    const A = await nation([alice]);
    const B = await nation([bob]);
    await army(A, alice, 0, 10);
    await expect(lands.connect(alice).raid(await A.getAddress(), await B.getAddress(), [10, 0, 0])).to.be.revertedWith('defender protected');
    await time.increase(24 * 3600);
    await lands.connect(alice).raid(await A.getAddress(), await B.getAddress(), [10, 0, 0]);
  });

  it('the counter triangle decides: snipers beat bruisers, tricksters do not', async () => {
    const { lands, nation, army, alice, bob, carol } = await setup();
    const A = await nation([alice, carol]);
    const B = await nation([bob]);
    const a = await A.getAddress(), b = await B.getAddress();
    await army(B, bob, 0, 100); // 100 bruisers at home
    await army(A, alice, 1, 100); // 100 snipers
    await army(A, carol, 2, 100); // 100 tricksters
    await time.increase(24 * 3600);
    const lose = await lands.connect(alice).raid.staticCall(a, b, [0, 0, 100]).then(() => null);
    expect(lose).to.equal(null);
    await expect(lands.connect(alice).raid(a, b, [0, 0, 100])).to.emit(lands, 'Raided').withArgs(a, b, false, 5000, 10000, 0);
    await time.increase(24 * 3600);
    await expect(lands.connect(alice).raid(a, b, [0, 100, 0])).to.emit(lands, 'Raided').withArgs(a, b, true, 15000, 9000, anyValue);
  });

  it('a won raid moves a share of the loser pool into the winner buyback pot, then the loser is protected', async () => {
    const { lands, nation, army, alice, bob } = await setup();
    const A = await nation([alice]);
    const B = await nation([bob]);
    const a = await A.getAddress(), b = await B.getAddress();
    await lands.connect(bob).train(b, 3, 1);
    await lands.connect(bob).speedUp(0, 1); // pays 1 USDC: 0.6 to B's war pool
    await lands.collect(0);
    await army(A, alice, 0, 50);
    await time.increase(24 * 3600);
    await lands.connect(alice).raid(a, b, [50, 0, 0]);
    expect((await lands.nation(b)).warPool).to.equal(E(0.6) * 8n / 10n);
    expect((await lands.nation(a)).buybackPot).to.equal(E(0.6) * 2n / 10n);
    await expect(lands.connect(alice).raid(a, b, [10, 0, 0])).to.be.revertedWith('attacker cooling down');
  });

  it('only a real holder can order a raid', async () => {
    const { lands, nation, army, alice, bob, carol } = await setup();
    const A = await nation([alice]);
    const B = await nation([bob]);
    await army(A, alice, 0, 10);
    await time.increase(24 * 3600);
    await expect(lands.connect(carol).raid(await A.getAddress(), await B.getAddress(), [10, 0, 0])).to.be.revertedWith('not a commander');
  });

  async function loot(ctx, thr) {
    const { lands, nation, army, alice, bob, buyback } = ctx;
    const A = await nation([alice]);
    const B = await nation([bob]);
    const a = await A.getAddress(), b = await B.getAddress();
    await lands.queueBuyback(await buyback.getAddress());
    await time.increase(2 * 24 * 3600 + 1);
    await lands.activateBuyback();
    await lands.connect(bob).train(b, 3, 1);
    await lands.connect(bob).speedUp(0, 1); // B's war pool gets 0.6 USDC
    await lands.collect(0);
    await army(A, alice, 0, 50);
    await time.increase(24 * 3600);
    return { A, B, a, b };
  }

  it('buyback: needs a helper after a 2-day wait, refuses below the threshold', async () => {
    const ctx = await setup(E(100));
    const { lands, buyback, nation, alice } = ctx;
    const A = await nation([alice]);
    await expect(lands.settleBuyback(await A.getAddress())).to.be.revertedWith('no buyback set');
    await lands.queueBuyback(await buyback.getAddress());
    await expect(lands.activateBuyback()).to.be.revertedWith('not yet');
    await time.increase(2 * 24 * 3600 + 1);
    await lands.activateBuyback();
    await expect(lands.settleBuyback(await A.getAddress())).to.be.revertedWith('pot below threshold');
  });

  it('buyback: with claims off the whole step is burned', async () => {
    const ctx = await setup(E(0.05));
    const { lands, buyback, alice } = ctx;
    const { a, b } = await loot(ctx);
    await lands.connect(alice).raid(a, b, [50, 0, 0]);
    expect((await lands.nation(a)).buybackPot).to.equal(E(0.12));
    await expect(lands.settleBuyback(a)).to.emit(lands, 'BuybackSettled').withArgs(a, E(0.05), 0);
    expect(await buyback.burned()).to.equal(E(0.05));
    expect((await lands.nation(a)).buybackPot).to.equal(E(0.07));
  });

  it('buyback: with claims on, the creator-set share goes to participants, not the creator', async () => {
    const ctx = await setup(E(0.05));
    const { lands, buyback, alice, creator, usdc } = ctx;
    const { A, a, b } = await loot(ctx);
    await lands.connect(creator).setClaimBps(a, 3000);
    await lands.setClaimsEnabled(true);
    await lands.connect(alice).raid(a, b, [50, 0, 0]);
    await expect(lands.settleBuyback(a)).to.emit(lands, 'BuybackSettled').withArgs(a, E(0.035), E(0.015));
    const owed = await lands.pendingRewards(a, alice.address);
    expect(owed).to.be.gt(0n);
    expect(await lands.pendingRewards(a, creator.address)).to.equal(0n);
    const before = await usdc.balanceOf(alice.address);
    await lands.connect(alice).claimRewards(a);
    expect((await usdc.balanceOf(alice.address)) - before).to.equal(owed);
    await expect(lands.connect(creator).claimRewards(a)).to.be.revertedWith('nothing to claim');
  });

  it('claims: creator cannot claim, claim share is lowerable never raisable, off by default', async () => {
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
