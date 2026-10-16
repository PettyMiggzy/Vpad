// Reads the game from the deployed contracts. `deployment.json` (next to the page) names the RPC and the WarheadzLands address;
// without it the game falls back to the made-up preview. Everything below is a read: nothing here sends a transaction.
import { Contract, JsonRpcProvider, formatUnits, keccak256, toUtf8Bytes } from 'ethers';
import abi from './landsAbi.json';
import { makeTerrain } from './terrain.js';

const ERC20 = ['function name() view returns (string)', 'function symbol() view returns (string)'];
const EMBLEMS = ['bruiser', 'sniper', 'trickster', 'defender'];

const safeName = (v) => String(v).replace(/[^A-Za-z0-9 _.$-]/g, '').slice(0, 16) || 'COIN';
const colorOf = (s) => {
  const h = parseInt(keccak256(toUtf8Bytes(s)).slice(2, 8), 16);
  // keep it bright: lift each channel into 0x60..0xff
  return ((((h >> 16) & 0xff) | 0x60) << 16) | ((((h >> 8) & 0xff) | 0x60) << 8) | ((h & 0xff) | 0x60);
};

// a plot key is packed (x, y): int16 each, x in the high half
const unpack = (key) => {
  const k = Number(key);
  const s16 = (v) => (v >= 0x8000 ? v - 0x10000 : v);
  return [s16((k >> 16) & 0xffff), s16(k & 0xffff)];
};

export async function loadLive(base = '') {
  // deployment.json is a local dev chain's record (never committed); without it the game reads the VYRE testnet's record
  let cfg = null;
  for (const name of ['deployment.json', 'deployment.testnet.json']) {
    try {
      const r = await fetch(`${base}${name}`, { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) { cfg = await r.json(); break; }
    } catch (_) { /* try the next */ }
  }
  if (!cfg) return null;
  try {
    const provider = new JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true });
    const lands = new Contract(cfg.lands, abi, provider);
    const [seed, radius] = [await lands.seed(), Number(await lands.radius())];
    const claimed = await lands.queryFilter(lands.filters.LandClaimed(), cfg.fromBlock ?? 0);
    const nations = [];
    for (const ev of claimed) {
      const token = ev.args.token;
      const [n, erc] = [await lands.nation(token), new Contract(token, ERC20, provider)];
      const symbol = await erc.symbol();
      nations.push({
        token, name: safeName(symbol), color: colorOf(token), emblem: EMBLEMS[parseInt(token.slice(2, 4), 16) % 4],
        plots: n.plots.map(unpack), units: n.units.map(Number), wall: Number(n.wall), tower: Number(n.tower),
        pool: Math.round(Number(formatUnits(n.warPool, 18))), holders: null,
      });
    }
    const byToken = new Map(nations.map((n) => [n.token.toLowerCase(), n]));
    const raids = await lands.queryFilter(lands.filters.Raided(), cfg.fromBlock ?? 0);
    const wars = raids.map((r) => {
      const [a, d] = [byToken.get(r.args.attacker.toLowerCase()), byToken.get(r.args.defender.toLowerCase())];
      if (!a || !d) return null;
      const at = [(a.plots[0][0] + d.plots[0][0]) / 2, (a.plots[0][1] + d.plots[0][1]) / 2];
      return { a: a.name, b: d.name, at, success: r.args.success, attack: Number(r.args.attackPower), defense: Number(r.args.defensePower) };
    }).filter(Boolean);
    return { live: true, rpc: cfg.rpc, chainId: cfg.chainId, lands: cfg.lands, wusdc: cfg.wusdc, devKey: cfg.devKey || null, seed: seed.toString(), radius, terrain: makeTerrain(seed), nations, wars };
  } catch (e) {
    console.warn('could not read the chain, showing the preview', e);
    return null;
  }
}

// ---- writes: the only place the game sends transactions ----
import { BrowserProvider, Wallet } from 'ethers';

const ERC20_RW = ['function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)', 'function balanceOf(address) view returns (uint256)', 'function totalSupply() view returns (uint256)'];

let signerPromise = null;
/** The player's signer: the wallet in the page (EIP-1193), or, on a local test chain only, the key deployment.json carries. */
export function getSigner(world) {
  if (!signerPromise) {
    signerPromise = (async () => {
      if (world.devKey) return new Wallet(world.devKey, new JsonRpcProvider(world.rpc, world.chainId, { staticNetwork: true }));
      if (!window.ethereum) throw new Error('no wallet in this page');
      const provider = new BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      return provider.getSigner();
    })();
  }
  return signerPromise;
}

async function contracts(world, token) {
  const signer = await getSigner(world);
  return { signer, lands: new Contract(world.lands, abi, signer), coin: new Contract(token, ERC20_RW, signer) };
}

/** One tx at a time, each reported back as { hash, ok }. The coin must be approved to the game first (one extra tx, once). */
export async function train(world, token, unit, count) {
  const { signer, lands, coin } = await contracts(world, token);
  const me = await signer.getAddress();
  if ((await coin.allowance(me, world.lands)) < 10n ** 30n) await (await coin.approve(world.lands, 2n ** 255n)).wait();
  const tx = await lands.train(token, unit, count);
  const rc = await tx.wait();
  return { hash: tx.hash, ok: rc.status === 1 };
}

export async function collectReady(world) {
  const { signer, lands } = await contracts(world, world.nations[0].token);
  const now = BigInt((await signer.provider.getBlock('latest')).timestamp); // the chain's clock, not the page's
  const n = Number(await lands.jobCount());
  const done = [];
  for (let id = 0; id < n; id++) {
    const j = await lands.jobs(id);
    if (!j.collected && now >= j.readyAt) { try { const tx = await lands.collect(id); await tx.wait(); done.push(tx.hash); } catch (_) {} }
  }
  return done;
}

export async function buildDefense(world, token, wall) {
  const { signer, lands, coin } = await contracts(world, token);
  const me = await signer.getAddress();
  if ((await coin.allowance(me, world.lands)) < 10n ** 30n) await (await coin.approve(world.lands, 2n ** 255n)).wait();
  const tx = await lands.build(token, wall);
  const rc = await tx.wait();
  return { hash: tx.hash, ok: rc.status === 1 };
}

export async function readNation(world, token) {
  const provider = new JsonRpcProvider(world.rpc, world.chainId, { staticNetwork: true });
  const lands = new Contract(world.lands, abi, provider);
  const n = await lands.nation(token);
  return { units: n.units.map(Number), wall: Number(n.wall), tower: Number(n.tower), pool: Math.round(Number(formatUnits(n.warPool, 18))) };
}

// ---- USDC-priced actions: the game takes WUSDC, so the page wraps native USDC first ----
const WUSDC = ['function deposit() payable', 'function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)'];

async function payWithUsdc(world, signer, need) {
  const w = new Contract(world.wusdc, WUSDC, signer);
  const me = await signer.getAddress();
  const have = await w.balanceOf(me);
  if (have < need) await (await w.deposit({ value: need - have })).wait();
  if ((await w.allowance(me, world.lands)) < need) await (await w.approve(world.lands, 2n ** 255n)).wait();
}

export async function buyShield(world, token, hours) {
  const { signer, lands } = await contracts(world, token);
  await payWithUsdc(world, signer, BigInt(hours) * (await shieldPrice(world, signer)));
  const tx = await lands.buyShield(token, hours);
  const rc = await tx.wait();
  return { hash: tx.hash, ok: rc.status === 1 };
}

async function shieldPrice(world, signer) {
  const c = new Contract(world.lands, ['function shieldPricePerHour() view returns (uint256)', 'function speedUpPricePerHour() view returns (uint256)'], signer);
  world._prices ??= { shield: await c.shieldPricePerHour(), speed: await c.speedUpPricePerHour() };
  return world._prices.shield;
}

export async function speedUpLatest(world, token, hours) {
  const { signer, lands } = await contracts(world, token);
  await shieldPrice(world, signer);
  const n = Number(await lands.jobCount());
  if (!n) throw new Error('no training job to speed up');
  await payWithUsdc(world, signer, BigInt(hours) * world._prices.speed);
  const tx = await lands.speedUp(n - 1, hours);
  const rc = await tx.wait();
  return { hash: tx.hash, ok: rc.status === 1 };
}

/** Raid `defender` with everything the attacker has of bruisers, snipers and tricksters, from the first pair of touching plots. */
export async function raidNation(world, attacker, defender) {
  const { lands } = await contracts(world, attacker.token);
  const touching = [];
  attacker.plots.forEach((a, i) => defender.plots.forEach((d, j) => { if (Math.abs(a[0] - d[0]) + Math.abs(a[1] - d[1]) === 1) touching.push([i, j]); }));
  if (!touching.length) throw new Error(`${attacker.name} and ${defender.name} do not touch`);
  const fresh = await readNation(world, attacker.token);
  const send = fresh.units.slice(0, 3);
  if (!send.some((u) => u > 0)) throw new Error('no units to send');
  const tx = await lands.raid(attacker.token, defender.token, send, touching[0][0], touching[0][1]);
  const rc = await tx.wait();
  return { hash: tx.hash, ok: rc.status === 1 };
}

/** Buy the next free ordinary plot touching the nation's land. */
export async function expandNation(world, nation) {
  const { signer, lands, coin } = await contracts(world, nation.token);
  const me = await signer.getAddress();
  await shieldPrice(world, signer);
  const isFree = async (x, y) => {
    if (Math.abs(x) > world.radius || Math.abs(y) > world.radius) return false;
    const kind = Number(await lands.terrain(x, y));
    if (kind === 1 || kind === 2) return false;
    const key = ((x & 0xffff) * 65536) + (y & 0xffff);
    return (await lands.plotOwner(key)) === '0x0000000000000000000000000000000000000000';
  };
  let pick = null;
  for (const [px, py] of nation.plots) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!pick && await isFree(px + dx, py + dy) && Number(await lands.terrain(px + dx, py + dy)) === 0) pick = [px + dx, py + dy];
  if (!pick) throw new Error('no free plot next to this land');
  if ((await coin.allowance(me, world.lands)) < 10n ** 30n) await (await coin.approve(world.lands, 2n ** 255n)).wait();
  const price = world._prices.shield * 3n; // generous: the real price is read by the contract; the wrap tops up what is missing
  await payWithUsdc(world, signer, 20n * 10n ** 18n + price);
  const tx = await lands.expand(nation.token, pick[0], pick[1]);
  const rc = await tx.wait();
  nation.plots.push(pick);
  return { hash: tx.hash, ok: rc.status === 1 };
}
