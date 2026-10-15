# Vyre Bad Lands: the game (Phaser)

Run: `npm ci && npm run dev`. Test: `npm test`. Build: `npm run build`.

Two screens so far:
- **Map.** The terrain is the real map: `src/terrain.js` is the contract's own function, and `test/terrain.test.js` checks it against the contract's output for all 625 plots (`test/terrain-fixture.json` comes from `engine/scripts/dump-terrain.js` in the chain repo). Drag to move, wheel to zoom, click a nation. Premium plots (coast, mountain pass) are outlined; red glows mark wars.
- **Base.** A nation's town hall, buildings and army, with a fight preview scored by `src/combat.js`, the same formula as the contract (pinned in `test/combat.test.js`).

**Preview data.** The nations, their plots, armies and wars (`src/data.js`) are made up. Nothing here reads the chain yet; the screens say so. Next: read nations, plots and raids from the deployed contracts.
