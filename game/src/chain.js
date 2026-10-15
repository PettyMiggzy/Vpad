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
    return { live: true, rpc: cfg.rpc, seed: seed.toString(), radius, terrain: makeTerrain(seed), nations, wars };
  } catch (e) {
    console.warn('could not read the chain, showing the preview', e);
    return null;
  }
}
