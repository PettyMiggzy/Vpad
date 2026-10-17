# Token Arena (3D)

The first-person arena in three.js. The rules (movement, height, shots, grenades, bots, rounds) and the three maps are the match server's own files (`../server/game.js`, `../server/maps.js`), read directly: one copy.

- `npm install && npm run dev` to play against bots; `?a=NAME&b=NAME` sets the two token teams; `?q=low` turns off shadows and glow, `?q=mid` halves the shadow detail.
- Three maps, each with its own sky, light and props, and high decks reached by long ramps (sniper spots): Cargo Yard (dusk, stacked containers, four decks), Dust Town (noon, rooftops and a tower), Refinery (night, tanks and a catwalk across the middle).
- Controls: WASD move, mouse look, click fire, right click zoom (the sniper rifle zooms hard), R reload, G grenade, touch: left thumb moves, right thumb looks, FIRE, NADE and R buttons. Every weapon has a magazine and a reload time.
- Shop: weapons, gun mods (bigger or faster magazine, steadier grip, longer barrel, hollow points), armour up to a plate carrier, helmets (cut head-shot damage), boots, grenade kits (more frags, heavy frags) and camo. Play coins only.
- Sound: generated sound files (shots, reloads, steps, impacts, blasts, map ambience) in `public/sfx`, placed in stereo and softened by distance. First-person arms play the real reload and throw animations.
- Speed: soldiers in the crowd use lighter models, soldiers out of view are not drawn or animated, and Graphics (Auto/High/Mid/Low in the menu) steps detail down by itself when the frame rate is poor.
- Soldiers, weapons and map props are generated 3D models: pictures made with the image service, turned into textured models (soldiers rigged on a 24-bone humanoid skeleton with shared animation clips) and compressed (`gltf-transform optimize`, webp 1024, meshopt). Files in `public/models`. A map loads only the props, textures and sky it uses.
- Ground, wall and deck textures and the sky panoramas (which also light the scene) are Poly Haven, CC0 (see `public/CREDITS.txt`).
- Not done: talking to the match server (needs it hosted), team-coloured soldiers, more characters, mobile performance tuning on real phones.
