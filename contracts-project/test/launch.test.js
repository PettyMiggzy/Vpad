const { expect } = require('chai');
const { ethers } = require('hardhat');

const E = (n) => ethers.parseUnits(String(n), 18);
const EARLY = 1200, LATE = 5000, FLOOR = 400;

async function setup() {
  const [owner, treasury, creator, other, w1, w2] = await ethers.getSigners();
  const F = async (n, ...a) => (await ethers.getContractFactory(n)).deploy(...a);
  const usdc = await F('MockToken', 'USDC', E(1_000_000));
  const pad = await F('MockPad', await usdc.getAddress());
  const factory = await F('LaunchFactory', await pad.getAddress(), treasury.address, EARLY, LATE, FLOOR);
  const params = (buy = 500, sell = 500) => ({
    name: 'COIN', symbol: 'COIN', totalSupply: E(1_000_000_000), startingMarketCap: E(3000),
    buyTaxBps: buy, sellTaxBps: sell, partner: ethers.ZeroAddress, partnerFeeBps: 0, metadataURI: '',
  });
  async function launch(share, buy = 500, sell = 500, who = creator, value = 0n) {
    const tx = await factory.connect(who).launch(params(buy, sell), share, { value });
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === 'Launched');
    const split = await ethers.getContractAt('LaunchSplit', ev.args.split);
    return { token: ev.args.token, split };
  }
  async function earn(token, amount) {
    await usdc.approve(await pad.getAddress(), amount);
    await pad.accrue(token, amount);
  }
  return { owner, treasury, creator, other, w1, w2, usdc, pad, factory, launch, earn };
}

describe('LaunchFactory and LaunchSplit', () => {
  it('the person is the creator for the game, the split contract is the creator of record in the pad', async () => {
    const { launch, factory, pad, creator } = await setup();
    const { token, split } = await launch(EARLY);
    expect(await factory.creatorOf(token)).to.equal(creator.address);
    expect((await pad.launches(token)).creator).to.equal(await split.getAddress());
    expect(await factory.isCreatorWallet(token, creator.address)).to.equal(true);
  });

  it('the treasury share is taken first and the creator gets the rest', async () => {
    const { launch, earn, usdc, treasury, creator } = await setup();
    const { token, split } = await launch(EARLY);
    await earn(token, E(1000));
    const t0 = await usdc.balanceOf(treasury.address), c0 = await usdc.balanceOf(creator.address);
    await split.collectAndRelease();
    expect((await usdc.balanceOf(treasury.address)) - t0).to.equal(E(120));
    expect((await usdc.balanceOf(creator.address)) - c0).to.equal(E(880));
  });

  it('collecting straight from the pad cannot strand or dodge the share: release still splits what is there', async () => {
    const { launch, earn, usdc, treasury, pad } = await setup();
    const { token, split } = await launch(EARLY);
    await earn(token, E(1000));
    await pad.collectCreatorFees(token); // anyone can do this: the money lands in the split contract
    expect(await usdc.balanceOf(await split.getAddress())).to.equal(E(1000));
    const t0 = await usdc.balanceOf(treasury.address);
    await split.release();
    expect((await usdc.balanceOf(treasury.address)) - t0).to.equal(E(120));
  });

  it('no function lets the creator hand the role on, change the pad tax wallets, or lower the share', async () => {
    const { launch } = await setup();
    const { split } = await launch(EARLY);
    const names = split.interface.fragments.filter((f) => f.type === 'function').map((f) => f.name);
    for (const bad of ['offerCreator', 'acceptCreator', 'setTaxWallets', 'lowerShare', 'setShare', 'withdraw', 'transferOwnership'])
      expect(names).to.not.include(bad);
  });

  it('the share can only be raised, only by the creator, and a raise pays out at the old share first', async () => {
    const { launch, earn, usdc, treasury, creator, other } = await setup();
    const { token, split } = await launch(EARLY);
    await expect(split.connect(other).raiseShare(LATE)).to.be.revertedWith('creator only');
    await expect(split.connect(creator).raiseShare(EARLY)).to.be.revertedWith('can only raise');
    await expect(split.connect(creator).raiseShare(1000)).to.be.revertedWith('can only raise');
    await earn(token, E(1000));
    await split.collectAndRelease();
    const t0 = await usdc.balanceOf(treasury.address);
    await earn(token, E(1000));
    await split.connect(creator).raiseShare(LATE);
    expect((await usdc.balanceOf(treasury.address)) - t0).to.equal(0n); // nothing was sitting in the split; the 1000 is still in the pad
    await split.collectAndRelease();
    expect((await usdc.balanceOf(treasury.address)) - t0).to.equal(E(500));
  });

  it('a deal needs a tax worth sharing, and the floor holds when lowering', async () => {
    const { launch, factory, creator } = await setup();
    await expect(factory.connect(creator).launch({ name: 'C', symbol: 'C', totalSupply: E(1_000_000_000), startingMarketCap: E(3000), buyTaxBps: 100, sellTaxBps: 100, partner: ethers.ZeroAddress, partnerFeeBps: 0, metadataURI: '' }, EARLY)).to.be.revertedWith('tax too low for a deal');
    await expect(factory.connect(creator).launch({ name: 'C', symbol: 'C', totalSupply: E(1_000_000_000), startingMarketCap: E(3000), buyTaxBps: 500, sellTaxBps: 500, partner: ethers.ZeroAddress, partnerFeeBps: 0, metadataURI: '' }, 500)).to.be.revertedWith('bad deal share');
    const { split } = await launch(EARLY, 500, 500);
    await expect(split.connect(creator).lowerTaxes(100, 100)).to.be.revertedWith("below the deal's tax floor");
    await split.connect(creator).lowerTaxes(200, 200); // exactly the floor
  });

  it('deal tiers: none, early at launch, late only after raising to the late share', async () => {
    const { launch, factory, creator } = await setup();
    const plain = await launch(0, 0, 0);
    const early = await launch(EARLY);
    const late = await launch(0, 500, 500);
    expect(await factory.dealTier(plain.token)).to.equal(0);
    expect(await factory.dealTier(early.token)).to.equal(1);
    expect(await factory.dealTier(late.token)).to.equal(0);
    await late.split.connect(creator).raiseShare(LATE - 1);
    expect(await factory.dealTier(late.token)).to.equal(0);
    await late.split.connect(creator).raiseShare(LATE);
    expect(await factory.dealTier(late.token)).to.equal(2);
    await expect(plain.split.connect(creator).raiseShare(LATE)).to.be.revertedWith('tax too low for a deal');
  });

  it('the creator can split their part between up to four wallets; the treasury share is unaffected', async () => {
    const { launch, earn, usdc, treasury, creator, w1, w2, other } = await setup();
    const { token, split } = await launch(EARLY);
    await expect(split.connect(other).setWallets([w1.address], [10000])).to.be.revertedWith('creator only');
    await expect(split.connect(creator).setWallets([w1.address, w2.address], [5000, 4000])).to.be.revertedWith('bps');
    await split.connect(creator).setWallets([w1.address, w2.address], [7000, 3000]);
    await earn(token, E(1000));
    const t0 = await usdc.balanceOf(treasury.address), a0 = await usdc.balanceOf(w1.address), b0 = await usdc.balanceOf(w2.address);
    await split.collectAndRelease();
    expect((await usdc.balanceOf(treasury.address)) - t0).to.equal(E(120));
    expect((await usdc.balanceOf(w1.address)) - a0).to.equal(E(616));
    expect((await usdc.balanceOf(w2.address)) - b0).to.equal(E(264));
    expect(await split.isCreatorWallet(w1.address)).to.equal(true);
  });

  it('the first buy and the refund reach the person, not the split contract', async () => {
    const { launch, creator, factory } = await setup();
    const before = await ethers.provider.getBalance(creator.address);
    const { token, split } = await launch(0, 500, 500, creator, E(1));
    const t = await ethers.getContractAt('MockToken', token);
    expect(await t.balanceOf(creator.address)).to.equal(E(1) * 1000n);
    expect(await t.balanceOf(await split.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await split.getAddress())).to.equal(0n);
    expect(before - (await ethers.provider.getBalance(creator.address))).to.be.lt(E(0.6)); // half came back
  });

  it('a plain launch (no deal) leaves the creator everything, and the pad keeps charging its own 1%', async () => {
    const { launch, earn, usdc, treasury, creator } = await setup();
    const { token, split } = await launch(0, 0, 0);
    await earn(token, E(100));
    const t0 = await usdc.balanceOf(treasury.address), c0 = await usdc.balanceOf(creator.address);
    await split.collectAndRelease();
    expect((await usdc.balanceOf(treasury.address)) - t0).to.equal(0n);
    expect((await usdc.balanceOf(creator.address)) - c0).to.equal(E(100));
  });

  it('metadata and tax passthroughs only work for the creator', async () => {
    const { launch, other, creator, pad } = await setup();
    const { token, split } = await launch(0, 500, 500);
    await expect(split.connect(other).setMetadata('x')).to.be.revertedWith('creator only');
    await split.connect(creator).setMetadata('ipfs://x');
    expect(await pad.metadataOf(token)).to.equal('ipfs://x');
  });
});
