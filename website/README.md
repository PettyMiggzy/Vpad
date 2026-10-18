# Vyre Bad Lands website

Static site for vyrebadlands.com: no build step. Pages: home, `matches/` (live matches from the game server and the scheduled sessions in `fixtures.json`), `armory/` (loadout planner fed by `catalog.json`).

- `node tools/make-catalog.mjs` rewrites `catalog.json` from the game's own rules files; run it whenever guns, mods or unlock levels change.
- Edit `fixtures.json` to add or change scheduled sessions (daily, weekly or a one-off `startsAt`).
- `media/promo.mp4` is the promo clip on the home page.
- Vercel project `vyre-bad-lands`, root directory `website`.
