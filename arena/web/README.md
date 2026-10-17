# Token Arena (3D)

The first-person arena in three.js. The rules (movement, shots, bots, rounds) are the match server's own file (`../server/game.js`), read directly: one copy.

- `npm install && npm run dev` to play against bots; `?a=NAME&b=NAME` sets the two token teams; `?q=low` turns off shadows and glow.
- Soldiers and weapons are generated 3D models: pictures made with the image service, turned into rigged, textured models (24-bone humanoid rig, shared animation clips) and compressed (`gltf-transform optimize`, webp 1024, meshopt). Files in `public/models/hero`.
- Map pieces are still Kenney's CC0 Industrial and Survival kits (https://kenney.nl, public domain): next to be replaced with generated models.
- Not done: talking to the match server (needs it hosted), team-coloured soldiers, more characters, a better map than the shared one.
