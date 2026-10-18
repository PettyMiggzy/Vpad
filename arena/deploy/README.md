# Putting the game on your own server

One command, run as root on the Ubuntu server (for example `ssh root@137.184.29.10`):

    curl -fsSL https://raw.githubusercontent.com/PettyMiggzy/Vpad/main/arena/deploy/setup.sh | bash

It installs what is needed (web server, Node 22), downloads the game, builds the page, starts the match server, and puts the web server in front of both. When it ends it prints the address to open, for example `http://137.184.29.10/`.

## What it sets up

- **The page** is served by nginx from `/var/www/arena`.
- **The match server** (Node, `arena/server`) runs as the `arena` user on `127.0.0.1:2567`, kept alive by systemd (`arena.service`). Nothing outside the machine can reach it directly; nginx passes the page's match and shop requests to it, including the live WebSocket.
- **Profiles** (coins, level, owned gear, saved classes) are kept in `/var/lib/arena/profiles.json`. Back that file up if you care about the progress.
- **Updates**: every ten minutes a timer (`arena-update.timer`) checks the `main` branch of the repo and, when there is something new, rebuilds the page and restarts the match server (a running match ends). To update at once, run the command above again. To stop automatic updates: `systemctl disable --now arena-update.timer`.
- It uses a 2 GB swap file on a small machine, only while the page is built.

## https and a name (recommended)

Browsers want https for some things on a public site, and a plain IP address cannot get a certificate. Make a name for the server (for example `play.vyrebadlands.com`) with an **A record** pointing at the server's address in GoDaddy, wait a few minutes, then run:

    curl -fsSL https://raw.githubusercontent.com/PettyMiggzy/Vpad/main/arena/deploy/setup.sh | bash -s -- play.vyrebadlands.com

That also gets a free certificate (Let's Encrypt, renewed by itself) and sends http to https.

## Useful commands

    systemctl status arena            # is the match server running
    journalctl -u arena -n 50         # its last lines
    curl http://127.0.0.1/health      # {"ok":true} when the page and server are connected
    curl http://127.0.0.1/rooms       # the matches open right now

## Settings

Environment variables for the install command: `BRANCH` (default `main`), `REPO`, `FORCE=1` (rebuild even when nothing changed). The match server reads `PORT`, `HOST` and `ARENA_DATA`.

## What this does not do

It does not protect against a lot of traffic beyond nginx's own limits (20 requests a second per visitor for the match and shop calls, 40 open connections each), and play coins are the only thing on it: nothing here touches a wallet.

## How many matches one server can run

Open `/sessions.html` on the game's address to see what is running now (matches, people, the server's clock delay). The server refuses new matches past `MAX_ROOMS` (12 unless the service sets the `MAX_ROOMS` environment variable; 12 is what the 2-core, 2 GB droplet measured: fine at 8 matches, stuttering at 16). A practice player who finds the server full plays the same match on their own device instead..

To measure a server (do this on the droplet itself, with nobody playing): `cd /opt/arena/repo/arena/server && umask 022 && npm install --no-save @colyseus/sdk && node capacity.js` (the install is needed once: the server install leaves the client library out; the next automatic update removes it again). It starts matches of one person and eleven computer players, 4 up to 48 at a time, and prints for each count the slowest player's snapshot rate (20 is perfect), the server's CPU as a share of one core, and the clock delay (`loopP99Ms`). A count is fine while `ok` is true; set `MAX_ROOMS` a few below the last count that was fine. One match server uses one core, so a bigger droplet needs a second server process before it helps.
