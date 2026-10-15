# Vyre Bad Lands contracts (version 0, testnet only)

`WarheadzLands.sol`: land claims, units, builds, shields, raids, buyback pot and holder claims. `npm ci && npm test` runs 13 tests.

Rules in code: claim at the 24-hour average market cap; units and defenses burn the nation's coin; USDC only speeds up or buys shield time (60% to the nation's war pool, 40% to the treasury); raids are a fixed formula with no chance; a won raid moves 20% of the loser's war pool into the winner's buyback pot; the buyback burns the winner's own coin; claims are off until the owner switches them on, the creator can route at most half of a win to claims, can only lower it, and never earns points.

Not built yet: the 10M-coin holders' eligibility (needs a hold snapshot per round), trading-activity scoring, the market-cap adapter over the pad's pools, the real buyback helper (a mock stands in), the "different buyers" check (cannot be done on chain).

Known limits, found while writing it: any holder of 0.5% of the supply can use up their nation's raid window with a tiny raid; one person owning two coins can raid themselves to move USDC between their own pots. Both need a fix or a rule before mainnet. Not audited.
