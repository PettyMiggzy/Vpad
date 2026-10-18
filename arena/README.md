# Token Arena (prototype)

A top-down team shooter where each team is a token. A Colyseus match server (`server/`) runs the whole match (movement, shooting,
hits, rounds, bots that fill empty seats); a Phaser page (`client/`) draws it and sends the player's input. Play money only: the
server never touches a wallet, and a finished match is only logged (`reportResult`) until a rules engine is connected.

    cd server && npm i && node index.js          # the match server on :2567
    cd client && npm i && npx vite --host         # the page; add ?server=ws://host:2567 to point it elsewhere
    cd server && node --test game.test.js         # the rules, bots and rounds on their own

Rules: two teams of up to 32 seats each, bots fill empty seats, 80 s rounds, first team to win two rounds takes the match.

A shot is judged a short moment in the past, so it lands where the shooter could see the target. That moment is the connection's round trip plus a tenth of a second, and it is never more than a quarter of a second. The walls are not rewound: a wall that is shut now still stops the shot. The server keeps about a second of where everyone stood. Snapshots still go out 20 times a second. Positions are quantised, and a soldier who has not changed is left out of the next one (`full: 1` means the whole list is there again).

## Hosting the match server

Node 22. The process listens on `PORT` (2567 if unset) and keeps profiles in `ARENA_DATA` (the `data` folder next to the server if unset). Those are play coins. Nothing in this server talks to a wallet.

On a small Linux box:

```bash
cd arena/server
npm ci --omit=dev
sudo mkdir -p /var/lib/arena
sudo chown "$USER" /var/lib/arena
PORT=2567 ARENA_DATA=/var/lib/arena node index.js
```

`GET /health` answers `{ "ok": true }`. `GET /rooms` lists open matches: team names, map, mode, and seats still open. A practice match starts at once and is not reported. A challenge waits until each side has a human, and the result is logged once when it ends.

### systemd

`/etc/systemd/system/arena.service`:

```
[Unit]
Description=Vyre Bad Lands match server
After=network.target

[Service]
WorkingDirectory=/opt/arena/server
Environment=PORT=2567
Environment=ARENA_DATA=/var/lib/arena
ExecStart=/usr/bin/node index.js
Restart=on-failure
User=arena
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Copy `arena/server` to `/opt/arena/server`, run `npm ci --omit=dev` there, and `systemctl enable --now arena`.

### Docker

```bash
docker build -t arena-server arena/server
docker run --rm -p 2567:2567 -e PORT=2567 -e ARENA_DATA=/data -v arena-data:/data arena-server
```

### HTTPS with Caddy

The page is served somewhere else. Give the match server a name and let Caddy end TLS. WebSocket upgrades are proxied as they are.

```
arena.example.com {
	reverse_proxy 127.0.0.1:2567
}
```

The page then uses `wss://arena.example.com`. `https://arena.example.com/health` and `https://arena.example.com/rooms` are the same routes.

## Putting it all on a server

`deploy/setup.sh` installs the page and the match server on an Ubuntu machine in one command (see `deploy/README.md`).
