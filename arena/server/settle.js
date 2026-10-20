// A finished token match settles on chain by itself, with no one to press anything. When a challenge between two pad tokens ends, this sends the
// chest contract one report (settleMatch) from the match server's own key. The contract only takes a report from that key, once per match id.
//
// The key is the only thing here that can move money, so nothing is sent unless the match is what it says it is: both teams are pad tokens, and on
// each side enough different humans played whose linked wallets hold the team's token (a lone player on two seats, or people who hold nothing, cannot
// make a result). Whatever is missing, the match is simply not settled. It never throws into the game: a failure is logged and the next match goes on.
// Off unless SETTLE_RPC, CHEST_ADDRESS and SETTLE_KEY_FILE (a JSON file {"privateKey": "0x..."} outside the repo) are all set.
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, isAddress, getAddress, keccak256, toHex, parseAbi, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { walletOf } from './wallet.js';

const CHEST_ABI = parseAbi([
  'function settleMatch(bytes32 matchId, address winner, address loser, uint256 minTokens)',
  'function reported(bytes32) view returns (bool)',
  'function chestOf(address) view returns (uint256)',
  'function launchpad() view returns (address)',
]);
const PAD_ABI = parseAbi(['function launches(address) view returns (address pool, uint16, uint16, int24, int24, address creator, uint64, uint16, address)']);
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)']);

export const SETTLE = {
  MIN_PER_SIDE: Number(process.env.SETTLE_MIN_PER_SIDE) || 3,             // different humans on each side
  MIN_HOLD: BigInt(process.env.SETTLE_MIN_HOLD_TOKENS || 10_000_000),   // whole tokens each must hold of their team's token
  TRIES: 3,
};

/** the chain as the settler uses it, made from the environment (or null when it is not set up) */
export function chainFromEnv(env = process.env) {
  const { SETTLE_RPC: rpc, CHEST_ADDRESS: chest, SETTLE_KEY_FILE: file } = env;
  if (!rpc || !chest || !file || !isAddress(chest)) return null;
  const account = privateKeyToAccount(JSON.parse(fs.readFileSync(file, 'utf8')).privateKey);
  const pub = createPublicClient({ transport: http(rpc) });
  const wallet = createWalletClient({ account, transport: http(rpc) });
  return {
    chest: getAddress(chest),
    referee: account.address,
    read: (args) => pub.readContract(args),
    send: (args) => wallet.writeContract({ ...args, chain: null }),
    wait: (hash) => pub.waitForTransactionReceipt({ hash }),
  };
}

/**
 * match: { id, tokens: [a, b], winner: 0|1, score, humans: [[pid, ...], [pid, ...]] } (humans per team, those seated at the end).
 * chain: chainFromEnv's shape, or a stand-in in tests; lookup: a profile's linked wallet (the wallet module's own by default).
 * Resolves { ok, ... }: never throws.
 */
export async function settleMatch(match, chain, log = console.log, lookup = walletOf) {
  const skip = (why) => { log('MATCH NOT SETTLED', why); return { ok: false, why }; };
  try {
    if (!chain) return skip('settling is not set up');
    const tokens = (match.tokens || []).map((t) => (isAddress(String(t), { strict: false }) ? getAddress(t) : null));
    if (tokens.length !== 2 || !tokens[0] || !tokens[1] || tokens[0] === tokens[1]) return skip('the teams are not two different tokens');
    if (match.winner !== 0 && match.winner !== 1) return skip('no winner');
    const pad = await chain.read({ address: chain.chest, abi: CHEST_ABI, functionName: 'launchpad' });
    for (const t of tokens) {
      const [pool] = await chain.read({ address: pad, abi: PAD_ABI, functionName: 'launches', args: [t] });
      if (!pool || /^0x0+$/.test(pool)) return skip(`${t} is not a pad token`);
    }
    // each side: enough different humans, each with a linked wallet that holds the team's token
    for (const side of [0, 1]) {
      const wallets = new Set();
      for (const pid of match.humans?.[side] ?? []) {
        const w = lookup(pid);
        if (!w) return skip(`a player on side ${side + 1} has no linked wallet`);
        if (wallets.has(w)) return skip(`two players on side ${side + 1} share a wallet`);
        wallets.add(w);
        const held = await chain.read({ address: tokens[side], abi: ERC20_ABI, functionName: 'balanceOf', args: [getAddress(w)] });
        const decimals = await chain.read({ address: tokens[side], abi: ERC20_ABI, functionName: 'decimals' });
        if (BigInt(held) < SETTLE.MIN_HOLD * 10n ** BigInt(decimals)) return skip(`a player on side ${side + 1} holds ${formatUnits(held, decimals)} of the team's token, under the least ${SETTLE.MIN_HOLD}`);
      }
      if (wallets.size < SETTLE.MIN_PER_SIDE) return skip(`side ${side + 1} has ${wallets.size} different players, under the least ${SETTLE.MIN_PER_SIDE}`);
    }
    const matchId = keccak256(toHex(`${match.id}|${tokens[0]}|${tokens[1]}|${JSON.stringify(match.score)}`));
    if (await chain.read({ address: chain.chest, abi: CHEST_ABI, functionName: 'reported', args: [matchId] })) return skip('this match was settled already');
    const winner = tokens[match.winner];
    const loser = tokens[1 - match.winner];
    let last;
    for (let i = 0; i < SETTLE.TRIES; i += 1) {
      try {
        const hash = await chain.send({ address: chain.chest, abi: CHEST_ABI, functionName: 'settleMatch', args: [matchId, winner, loser, 1n] });
        const receipt = await chain.wait(hash);
        if (receipt.status !== 'success' && receipt.status !== 1) throw new Error('the transaction failed');
        log('MATCH SETTLED', JSON.stringify({ matchId, winner, loser, tx: hash }));
        return { ok: true, tx: hash, matchId };
      } catch (e) {
        last = e;
        // a report that already went through (an earlier try that was only slow to confirm) is done
        if (await chain.read({ address: chain.chest, abi: CHEST_ABI, functionName: 'reported', args: [matchId] }).catch(() => false)) return { ok: true, matchId, late: true };
      }
    }
    return skip(`the report failed ${SETTLE.TRIES} times: ${last?.shortMessage || last?.message}`);
  } catch (e) {
    return skip(`error: ${e?.shortMessage || e?.message}`);
  }
}
