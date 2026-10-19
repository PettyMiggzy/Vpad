# Vyre Bad Lands: how the game uses the token and the war chests

Status: DESIGN ONLY, nothing of this is built or live. Written 2026-10-19 for the owner and the owner's lawyer. Play money until the lawyer says yes.

## The idea in one paragraph

Players burn the game's own token to upgrade their gear. Teams are separate pad tokens; each team has a war chest in USDC that is filled by
its own token's trading tax, never by player purchases. When a best-of-three is confirmed, the two chests merge and most of it buys back
and burns the winning team's token. Players never pay or stake anything to enter, and what they burn is not what funds the chest.

## Two jobs, kept apart

1. **Upgrades: burn the game token.** The player sends tokens from a linked wallet to the dead address. The match server sees the burn on chain and unlocks the item for that profile (once per transaction). No new contract and no USDC is involved. Prices are a fixed token amount per item that the owner can change, not a live market price (a live price can be pushed around by a trader). Website only, never inside the phone store apps.
2. **War chests: USDC from each team token's own tax.** A team token is launched on the pad by its creator, who may route part of the token's swap tax to the team's chest (the pad already allows up to four tax wallets). The chest is a small new contract that only holds USDC per team.

## When a match series is confirmed

- The match server confirms a best-of-three result. The chest contract pays the winner: the two chests merge, 80% goes to the existing buyback helper, which buys the winning team's token from its pool and sends it to the dead address; the other 20% is still undecided (see below).
- Version 1 trusts our match server to say who won. That is a trust point and is stated here on purpose: the confirming key should sit behind the multisig with a delay, and a challenge window can be added later.

## Why this shape

- No player money feeds a prize: the chest comes from the team token's tax, which the team's creator chose, so a player's burn buys gear and nothing else.
- Fewer moving parts: one small new contract (the chest) and the burn watcher in the match server. The buyback and the dead-address burn already exist in `engine/contracts/game`.
- The competition stays: more trading in your team's coin and more wins mean a bigger chest and a bigger burn of your coin.

## Open points (owner, lawyer)

- Which token is burned for upgrades (the game's own token is the plan) and its name.
- Where the other 20% of a merged chest goes.
- Whether a buyback of the winner's token, paid from a chest filled by tax, needs anything from the lawyer; and whether burning a launched token for items does.
- Fairness: burning lets the biggest holder get the strongest gear. Cosmetics and small side-grades avoid that; it is the owner's call.
- Wording everywhere: "war chest", "buyback and burn". Never price talk, promises, "prize", "jackpot".

## Not decided

The chest contract, the burn watcher and any price table do not exist yet. They would be new audit scope together with the land and pad contracts already waiting for an audit.
