# Vyre Bad Lands website

Static site for vyrebadlands.com: no build step. Pages: home, `matches/` (live matches from the game server and the scheduled sessions in `fixtures.json`), `armory/` (loadout planner fed by `catalog.json`).

- `node tools/make-catalog.mjs` rewrites `catalog.json` from the game's own rules files; run it whenever guns, mods or unlock levels change.
- Edit `fixtures.json` to add or change scheduled sessions (daily, weekly or a one-off `startsAt`).
- `media/promo.mp4` is the promo clip on the home page.
- Vercel project `vyre-bad-lands`, root directory `website`.

- `api/telegram.js` is the Telegram webhook for @warheadzsbot: it welcomes people who join the group (`api/_welcome.js` holds the logic, `node --test tools/welcome.test.mjs` tests it). Settings are Vercel environment variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `WELCOME_CHAT_ID`, `WELCOME_OWNER_IDS`, `WELCOME_VIDEO_URL`; set `WELCOME=off` to stop it. The owner can send `/testwelcome` to the bot to see the welcome. `media/welcome.mp4` is the welcome video. While the webhook is set, nothing else can read the bot's updates by polling.
