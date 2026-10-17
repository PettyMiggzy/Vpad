# Token Arena (3D)

The first-person arena in three.js. The rules (movement, shots, bots, rounds) are the match server's own file (`../server/game.js`), read directly: one copy.

- `npm install && npm run dev` to play against bots; `?a=NAME&b=NAME` sets the two token teams; `?q=low` turns off shadows and glow.
- Models are Kenney's CC0 blocky characters, Blaster Kit, City Kit (Industrial), Survival Kit and Prototype Textures (https://kenney.nl, public domain).
- Not done: talking to the match server (needs it hosted), 3D versions of the painted meme characters, a better map than the shared one.
