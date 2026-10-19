# Vyre Bad Lands: how the game uses the token and the war chests

Status: DESIGN ONLY, nothing of this is built or live. Written 2026-10-19 for the owner and the owner's lawyer. Play money until the lawyer says yes.

## The idea in one paragraph

Players burn the game's own token to upgrade their gear. Teams are separate pad tokens; each team token has a war chest in USDC. The
chest is filled from the pad's own income on that token's trades, not from anything players pay. When a best-of-three is confirmed, the
two chests merge, the owner takes a 20% cut, and the rest buys back and burns the winning team's token.

## Two jobs, kept apart

1. **Upgrades: burn the game token.** The player sends tokens from a linked wallet to the dead address. The match server sees the burn on chain and unlocks the item for that profile (once per transaction). No new contract and no USDC is involved. Prices are a fixed token amount per item that the owner can change, not a live market price (a live price can be pushed around by a trader). Website only, never inside the phone store apps.
2. **War chests: a share of the pad's income on that token's trades.** The pad takes its platform fee on every trade in a token's pad pool (1%, fixed in the pool, paid by the fee contract). A part of that goes into the token's own chest and the rest stays with the owner. The share and what it is a share of are being settled with the owner (see open points). The first version moves it with the fee collector service that already exists, so the audited fee contract does not change.

## Only pad trades count

Only trades in the token's WARHEADZ pad pool produce income for its chest. Trades anywhere else add nothing, and launch tokens cannot be held by other venues unless the owner approves them (the land book's venue check). The launch screen must say this plainly to the creator before they launch. Wording for that notice, to be added when the chest is built (not before: it is not live): "Only trades in this token's WARHEADZ pool feed its war chest. Trades anywhere else do not count."

## When a match series is confirmed

- The match server confirms a best-of-three result. The two chests merge. The owner takes a 20% cut. The rest goes to the existing buyback helper, which buys the winning team's token from its pool and sends it to the dead address.
- Version 1 trusts our match server to say who won. That is a trust point and is stated here on purpose: the confirming key should sit behind the multisig with a delay, and a challenge window can be added later.

## Why this shape

- No player money feeds a payout: the chest comes from the owner's own pad income, so a player's burn buys gear and nothing else.
- Fewer moving parts: one small new contract (the chest), the fee collector sending each token's share to it, and the burn watcher in the match server. The buyback and the dead-address burn already exist in `engine/contracts/game`.
- The competition stays: more trading of your team's coin on the pad and more wins mean a bigger chest and a bigger burn of your coin.

## Open points (owner, lawyer)

- Whose money the chest is. The pad belongs to a separate person, and the chest is a share of the pad's own income, so the pad's owner must agree, in writing, to send that share to the chests. It is his choice, not the chain owner's.

- Which token is burned for upgrades (the game's own token is the plan) and its name.
- The chest's share: 10% of what, exactly. Either 10% of the owner's 1% platform fee on that token's trades (0.1% of volume), or something larger added on top. The owner is to give it in numbers for a 1,000 USDC fee.
- Whether a buyback of the winner's token, paid from a chest filled by the pad's income, needs anything from the lawyer; and whether burning a launched token for items does.
- Fairness: burning lets the biggest holder get the strongest gear. Cosmetics and small side-grades avoid that; it is the owner's call.
- Wording everywhere: "war chest", "buyback and burn". Never price talk, promises, "prize", "jackpot".

## Not decided

The chest contract, the burn watcher and any price table do not exist yet. They would be new audit scope together with the land and pad contracts already waiting for an audit.
