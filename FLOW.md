# Vyre Bad Lands: game flow (draft for review)

All numbers are placeholders until tuned. Mock data until after mainnet.

1. **Launch.** A coin launches on the pad. Anyone can trade it.
2. **Claim.** Two ways in. (a) The coin's 24-hour average market cap reaches about $50k. (b) The project took the early deal at launch: part of its creator tax goes to the treasury for good, enforced by the pad's book, and then it can claim at any market cap with one premium plot free. (c) Later, the project raises that share to the bigger late share, for good, and gets the same. The creator picks the first plot on the map. Coast and mountain-pass plots are the good spots and cost 20 USDC; the rest are free. If the creator is gone, anyone can claim an ordinary plot for a coin that has the market cap.
2b. **The map.** A grid world fixed by a seed: lakes, mountain ranges, coast, and narrow passes between mountains. It starts small and grows as it fills. Nations can buy plots next to their own (price doubles with every plot owned, up to 16). Raids need touching plots; defending a pass is 20% stronger.
3. **Base screen.** The nation's holders open their base. Build menu on one side, the map beside it.
4. **Build.** Offense: barracks (bruiser, sniper, trickster), siege ram. Defense: walls, guard tower, vault. Each build burns some of the nation's coin. Units allowed depend on how much coin a holder holds. USDC only speeds a build up or buys cosmetics.
5. **Pools.** 60% of the USDC spent on speed-ups goes to the nation's own war pool (placeholder split), the rest to the platform.
6. **War round.** Nations attack neighbors. Units counter each other: bruiser beats trickster, trickster beats sniper, sniper beats bruiser. Trading activity, defenses and units decide the round. USDC cannot buy strength.
7. **Result.** The winner takes half of the loser's war pool, buys back its own coin and burns it. The loser keeps the plot and loses part of its vault treasury.
8. **Dashboard.** Holders who took part (or hold 10M or more through the round) see their share. Their creator-set split decides burn versus claim. Claims stay off until the lawyer agrees. The creator and the creator's wallets never receive any of it.
9. **Raids and shields.** Any land can be raided by another, depending on its defenses. A raided land gets a cooldown, and every new land starts with the same cooldown. Shields extend the protection time and never add strength. Loot is a share of the plot's vault.
10. **Next round.** Rubble gets rebuilt, units retrain, a new round starts.

## Cheats to test first
Wash trading, wallets split to dodge limits, a market-cap pump just before the 24-hour check, buying a 10M stack for a minute, creator hiding behind other wallets, front-running the buyback.


The contracts for all of this live in the VYRE chain repo, `engine/contracts/game/` and `engine/contracts/pad/VyrePadBook.sol`.
