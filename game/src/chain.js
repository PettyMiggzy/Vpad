// Reads the game from the deployed contracts. `deployment.json` (next to the page) names the RPC and the WarheadzLands address;
// without it the game falls back to the made-up preview. Everything below is a read: nothing here sends a transaction.
import { Contract, JsonRpcProvider, formatUnits, keccak256, toUtf8Bytes } from 'ethers';
import abi from './landsAbi.json';
import { makeTerrain } from './terrain.js';

const ERC20 = ['function name() view returns (string)', 'function symbol() view returns (string)'];
const EMBLEMS = ['bruiser', 'sniper', 'trickster', 'defender'];

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
  let cfg;
  try {
    const r = await fetch(`${base}deployment.json`, { cache: 'no-store' });
    if (!r.ok) return null;
    cfg = await r.json();
  } catch (_) {
    return null;
  }
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
        token, name: symbol, color: colorOf(token), emblem: EMBLEMS[parseInt(token.slice(2, 4), 16) % 4],
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
      return { a: a.name, b: d.name, at, success: r.args.success };
    }).filter(Boolean);
    return { live: true, rpc: cfg.rpc, chainId: cfg.chainId, lands: cfg.lands, devKey: cfg.devKey || null, seed: seed.toString(), radius, terrain: makeTerrain(seed), nations, wars };
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
