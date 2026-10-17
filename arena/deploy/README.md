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
