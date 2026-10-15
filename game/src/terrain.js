// The map's terrain, the same function as WarheadzLands.terrain (checked against the contract's own output in
// test/terrain.test.js): lakes and ranges come in 4-by-4 blocks, small ridges in an offset 3-by-3 layer, land beside water is
// COAST, land between two mountains is a PASS. COAST and PASS are the premium spots.
import { AbiCoder, keccak256 } from 'ethers';

export const LAND = 0, WATER = 1, MOUNTAIN = 2, COAST = 3, PASS = 4;
const coder = AbiCoder.defaultAbiCoder();

const floorDiv = (v, d) => (v >= 0 ? Math.trunc(v / d) : -Math.trunc((-v + d - 1) / d));

function base(seed, x, y) {
  const r = BigInt(keccak256(coder.encode(['uint256', 'int256', 'int256'], [seed, floorDiv(x, 4), floorDiv(y, 4)]))) % 100n;
  if (r < 16n) return WATER;
  if (r >= 84n) return MOUNTAIN;
  const r2 = BigInt(keccak256(coder.encode(['uint256', 'string', 'int256', 'int256'], [seed, 'ridge', floorDiv(x + 1, 3), floorDiv(y + 2, 3)]))) % 100n;
  return r2 < 12n ? MOUNTAIN : LAND;
}

export function makeTerrain(seed) {
  const s = BigInt(seed);
  const cache = new Map();
  const b = (x, y) => {
    const k = `${x},${y}`;
    if (!cache.has(k)) cache.set(k, base(s, x, y));
    return cache.get(k);
  };
  return function terrain(x, y) {
    const t = b(x, y);
    if (t !== LAND) return t;
    const mL = b(x - 1, y) === MOUNTAIN, mR = b(x + 1, y) === MOUNTAIN, mU = b(x, y - 1) === MOUNTAIN, mD = b(x, y + 1) === MOUNTAIN;
    if (b(x - 1, y) === WATER || b(x + 1, y) === WATER || b(x, y - 1) === WATER || b(x, y + 1) === WATER) return COAST;
    if ((mL && mR) || (mU && mD)) return PASS;
    return LAND;
  };
}
