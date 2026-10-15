# Vyre Bad Lands: the game (Phaser)

Run: `npm ci && npm run dev`. Test: `npm test`. Build: `npm run build`.

Two screens so far:
- **Map.** The terrain is the real map: `src/terrain.js` is the contract's own function, and `test/terrain.test.js` checks it against the contract's output for all 625 plots (`test/terrain-fixture.json` comes from `engine/scripts/dump-terrain.js` in the chain repo). Drag to move, wheel to zoom, click a nation. Premium plots (coast, mountain pass) are outlined; red glows mark wars.
- **Base.** A nation's town hall, buildings and army, with a fight preview scored by `src/combat.js`, the same formula as the contract (pinned in `test/combat.test.js`).

**Live or preview.** If `public/deployment.json` exists (the RPC and the WarheadzLands address), the game reads nations, plots, armies and raids from the contracts (`src/chain.js`; reads only, no transaction is sent) and says LIVE. Without it the screens show made-up nations (`src/data.js`) and say PREVIEW.

Try it on a local chain, from the chain repo's `engine/`: `npx hardhat node`, then `npx hardhat run scripts/seed-game.js --network localhost` (deploys everything, makes four launches, claims land, trains armies, runs one raid, writes the deployment file here), then `npm run build && npx vite preview` here. Next: the build and train buttons sending transactions through a wallet.
