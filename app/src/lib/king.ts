// King of the Bad Lands: the launch with the most USDC traded in the last six hours. Pure, so the unit tests can run it in node.

/** The window the crown is judged over, in seconds */
export const KING_WINDOW = 6 * 3600;
/** The window as people read it */
export const KING_WINDOW_TEXT = '6 hours';
/** How many launches are shown chasing the crown */
export const CONTENDERS = 4;

interface Figures {
  /** USDC traded in the window (the creator's first buy is not a trade); null when the window can't be dated */
  volume6h: bigint | null;
  /** The block of its latest trade */
  lastTradeBlock?: bigint;
}

/**
 * The launches that traded in the window, most volume first; a tie goes to the one that traded last. A launch with no
 * trade in the window, or whose window can't be dated, is not ranked: with nobody trading there is no king.
 * The first is the king, the next few are the contenders.
 */
export function rankByVolume<T extends { pool: string }>(list: T[], stats: Map<string, Figures>): T[] {
  const vol = (l: T) => stats.get(l.pool)?.volume6h ?? 0n;
  const last = (l: T) => stats.get(l.pool)?.lastTradeBlock ?? 0n;
  const cmp = (x: bigint, y: bigint) => (x > y ? 1 : x < y ? -1 : 0);
  return list.filter((l) => vol(l) > 0n).sort((a, b) => cmp(vol(b), vol(a)) || cmp(last(b), last(a)));
}
