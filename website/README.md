# Vyre Bad Lands website

Static site for vyrebadlands.com: no build step. Pages: home, `matches/` (live matches from the game server and the scheduled sessions in `fixtures.json`), `armory/` (loadout planner fed by `catalog.json`).

- `node tools/make-catalog.mjs` rewrites `catalog.json` from the game's own rules files; run it whenever guns, mods or unlock levels change.
- Edit `fixtures.json` to add or change scheduled sessions (daily, weekly or a one-off `startsAt`).
- `media/promo.mp4` is the promo clip on the home page.
- Vercel project `vyre-bad-lands`, root directory `website`.

- `api/telegram.js` is the Telegram webhook for @warheadzsbot: it welcomes people who join the group (`api/_welcome.js` holds the logic, `node --test tools/welcome.test.mjs` tests it). Settings are Vercel environment variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `WELCOME_CHAT_ID`, `WELCOME_OWNER_IDS`, `WELCOME_VIDEO_URL`; set `WELCOME=off` to stop it. The owner can send `/testwelcome` to the bot to see the welcome. `media/welcome.mp4` is the welcome video. While the webhook is set, nothing else can read the bot's updates by polling.
- The same function is the group hype (`api/_hype.js`): a post when the group passes 25, 50, 75, 100, then every 50 to 1,000 and every 250 after, a fire or trophy reaction now and then on streak talk and screenshots, and `/hype`, `/play`, `/lfg`, `/stickers` for anyone (each pauses 15-60 s so it cannot be spammed). `HYPE=off` stops that part, `WELCOME=off` the welcome.
- Looks (`api/_style.js`): posts use animated custom emoji from our set `t.me/addemoji/warheadz_squad_by_warheadzsbot` (frog, bulldog, ape and raccoon heads, medkit, crate, ammo box, barrel, sniper, rifle, smg, lmg; spinning 3D renders from `arena/web/emoji.html`) and the coin emoji, green, blue and red buttons with icons, and quote blocks. If Telegram refuses the dressed-up version the same words go out plain.
