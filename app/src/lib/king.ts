// King of the Bad Lands: the launch that the most different wallets bought in the last six hours. Pure, so the unit tests can run it in node.
//
// Plain volume is the easiest number to fake: one wallet trading with itself costs only the fees. So the crown goes by breadth: what each
// wallet bought is counted up to a fifth of the launch's total buying and up to three times the typical (median) buyer's size, which means one
// wallet, or a big one with a couple of dust wallets beside it, scores little and it takes five or more real-sized wallets to count everything.
// The creator's own wallet is not counted, and a launch needs at least three different buyers to be ranked at all. This makes faking it harder and dearer, not impossible (someone with many wallets and the fees to spend can
// still do it), and the wording on the page never says more than "bought by different wallets".

/** The window the crown is judged over, in seconds */
export const KING_WINDOW = 6 * 3600;
/** The window as people read it */
export const KING_WINDOW_TEXT = '6 hours';
/** How many launches are shown chasing the crown */
export const CONTENDERS = 4;
/** Fewest different buyers a launch needs to be ranked */
export const KING_MIN_BUYERS = 3;
/** The most of the launch's buying one wallet counts for, in hundredths of a percent (20%) */
export const KING_WALLET_SHARE_BPS = 2000n;

/**
 * The score of a launch from what each buying wallet bought in the window (USDC, any scale; the creator's wallets already left out):
 * each wallet counts up to a fifth of the total bought and up to three times the median buyer; 0 with fewer than KING_MIN_BUYERS buyers.
 */
export function breadthScore(buys: Map<string, bigint>): bigint {
  const sizes = [...buys.values()].filter((v) => v > 0n).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (sizes.length < KING_MIN_BUYERS) return 0n;
  const total = sizes.reduce((a, b) => a + b, 0n);
  const share = (total * KING_WALLET_SHARE_BPS + 9_999n) / 10_000n; // rounded up, so tiny totals still count
  const median = sizes[Math.floor(sizes.length / 2)]!;
  const cap = share < median * 3n ? share : median * 3n;
  return sizes.reduce((score, v) => score + (v < cap ? v : cap), 0n);
}

interface Figures {
  /** breadthScore of the window; null when the window can't be dated */
  kingScore: bigint | null;
  /** The block of its latest trade */
  lastTradeBlock?: bigint;
}

/**
 * The launches with a score, highest first; a tie goes to the one that traded last. A launch with no score (too few buyers, no trade in the
 * window, or a window that can't be dated) is not ranked: with nobody buying there is no king. The first is the king, the next few are the contenders.
 */
export function rankByScore<T extends { pool: string }>(list: T[], stats: Map<string, Figures>): T[] {
  const score = (l: T) => stats.get(l.pool)?.kingScore ?? 0n;
  const last = (l: T) => stats.get(l.pool)?.lastTradeBlock ?? 0n;
  const cmp = (x: bigint, y: bigint) => (x > y ? 1 : x < y ? -1 : 0);
  return list.filter((l) => score(l) > 0n).sort((a, b) => cmp(score(b), score(a)) || cmp(last(b), last(a)));
}
