# Token Arena, first person

The first-person version of the arena, built for the Phaser game workspace (project `w8cwV2Uewgi`, published at
https://phaser.io/agent/local/w8cwV2Uewgi, private to the owner's Phaser account). Only the game's own source is kept here: the engine
folder that the workspace provides is not copied.

- `src/sim/` is the match server's own rules (`arena/server/game.js` and `items.js`) copied unchanged (typed face in `sim/index.ts`). Keep them in step: change the server file, copy it here.
- `src/arena.ts` map and soldiers from boxes, `src/game.ts` the loop, `src/ui.ts` menu, shop, HUD and touch controls, `src/profile.ts` the shop's rules (play coins in the browser for now).
- Teams come from the address: `?a=NAME&b=NAME`. `?dbg=nolock` skips the pointer lock (needed for headless screenshots).
- Not done: talking to the match server (needs the server hosted), WebGPU path untested here (screenshots were taken on the WebGL2 fallback).
