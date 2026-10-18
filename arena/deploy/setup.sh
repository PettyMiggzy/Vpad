#!/usr/bin/env bash
# Puts Vyre Bad Lands: Token Arena on an Ubuntu server: the game page, the match server, and a web server in front of both.
# Run it as root, on the server:   curl -fsSL https://raw.githubusercontent.com/PettyMiggzy/Vpad/main/arena/deploy/setup.sh | bash
# With a name that already points at this server (for https):   ... | bash -s -- play.example.com
# It is safe to run again. It changes nothing outside /opt/arena, /var/lib/arena, /var/www/arena, the arena services and the
# web server's own site list. Once installed it checks for a new build every ten minutes by itself (`--update`).
set -euo pipefail

main() {
  # files made by this script must be readable by the web server and the match server's own user, whatever restrictive setting the installer's shell has
  umask 022
  local UPDATE=0
  if [ "${1:-}" = "--update" ]; then UPDATE=1; shift; fi
  local DOMAIN="${1:-}"
  local REPO="${REPO:-https://github.com/PettyMiggzy/Vpad}"
  local BRANCH="${BRANCH:-main}"
  local APP=/opt/arena DATA=/var/lib/arena WEB=/var/www/arena
  local SRC="$APP/repo"
  say() { printf '\n== %s\n' "$*"; }

  [ "$(id -u)" = 0 ] || { echo "Run this as root (sudo bash setup.sh)."; exit 1; }
  . /etc/os-release
  case "$ID" in ubuntu|debian) ;; *) echo "This script is for Ubuntu or Debian (found $ID)."; exit 1 ;; esac
  export DEBIAN_FRONTEND=noninteractive

  if [ "$UPDATE" = 0 ]; then
    say "Packages"
    apt-get update -qq
    apt-get install -y -qq nginx git curl ca-certificates rsync >/dev/null
    if [ -n "$DOMAIN" ]; then apt-get install -y -qq certbot python3-certbot-nginx >/dev/null; fi

    say "Node 22"
    if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
      apt-get install -y -qq nodejs >/dev/null
    fi
    node -v

    # building the page needs about a gigabyte of memory; a small server gets a swap file for it
    if [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 1900 ] && ! swapon --show | grep -q .; then
      say "Adding a 2 GB swap file (this server has little memory)"
      fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
      grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    id arena >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin arena
  fi

  say "Code"
  mkdir -p "$APP" "$DATA" "$WEB"
  chown arena:arena "$DATA"
  local OLD=""
  if [ -d "$SRC/.git" ]; then
    OLD="$(git -C "$SRC" rev-parse HEAD)"
    git -C "$SRC" fetch --depth 1 origin "$BRANCH"
    git -C "$SRC" reset --hard FETCH_HEAD
  else
    rm -rf "$SRC"
    git clone --depth 1 --branch "$BRANCH" --filter=blob:none --sparse "$REPO" "$SRC"
    git -C "$SRC" sparse-checkout set arena
  fi
  local NEW
  NEW="$(git -C "$SRC" rev-parse HEAD)"
  echo "at $NEW"
  local SAME=0
  if [ "$OLD" = "$NEW" ] && [ -f "$WEB/index.html" ] && systemctl is-active --quiet arena 2>/dev/null && [ "${FORCE:-}" != 1 ]; then SAME=1; fi
  # the ten-minute check stops here when nothing changed; a run by hand goes on to set up the web server and https
  if [ "$SAME" = 1 ] && [ "$UPDATE" = 1 ]; then echo "Nothing new since last time."; return 0; fi

  if [ "$SAME" = 1 ]; then
    echo "The game is already up to date; skipping the build."
  else
    say "Match server"
    ( cd "$SRC/arena/server" && npm ci --omit=dev --no-audit --no-fund >/dev/null )

    say "Game page (the build takes a minute)"
    ( cd "$SRC/arena/web" && npm ci --no-audit --no-fund >/dev/null && VITE_SERVER=auto npx vite build >/dev/null )
    # the page's scripts have new names each build; a phone with the old page open must still find its old ones, so those stay for a week
  rsync -a --delete --exclude='/assets/' "$SRC/arena/web/dist/" "$WEB/"
  mkdir -p "$WEB/assets"
  rsync -a "$SRC/arena/web/dist/assets/" "$WEB/assets/"
  find "$WEB/assets" -type f -mtime +7 -delete
  fi

  # and make what is already there readable too (a run under a strict umask leaves root-only files behind)
  chmod 755 "$APP" "$WEB" 2>/dev/null || true
  chmod -R a+rX "$SRC" "$WEB" 2>/dev/null || true
  if ! runuser -u arena -- test -r "$SRC/arena/server/node_modules/colyseus/package.json"; then echo "The service user still cannot read the match server's files."; return 1; fi

  # an installed web server config from an older build lacks routes added since (certbot has edited that file, so it is never rewritten whole): add them in place
  local NGX=/etc/nginx/sites-available/arena
  if [ -f "$NGX" ] && ! grep -q 'location = /stats' "$NGX"; then
    cp "$NGX" "$NGX.bak"
    sed -i '/location = \/rooms/a\    location = /stats  { proxy_pass http://127.0.0.1:2567; }' "$NGX"
    if nginx -t >/dev/null 2>&1; then systemctl reload nginx || true; echo "Web server: added the /stats route."; else cp "$NGX.bak" "$NGX"; echo "Web server: the /stats route did not fit this config; left as it was."; fi
  fi

  if [ "$UPDATE" = 1 ]; then
    # a page-only change must not end the matches being played: restart the match server only when its own files changed
    if [ -z "$OLD" ] || ! git -C "$SRC" diff --quiet "$OLD" "$NEW" -- arena/server; then systemctl restart arena; echo "Updated to $NEW (match server restarted)."
    else echo "Updated to $NEW (page only; matches keep running)."; fi
    return 0
  fi

  say "Services"
  # the match server runs as its own user, so it needs a node that user can run: not a copy under another folder or one only this shell's PATH knows
  local NODE_BIN=""
  for c in /usr/bin/node /usr/local/bin/node "$(command -v node || true)"; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    if runuser -u arena -- "$c" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then NODE_BIN="$c"; break; fi
  done
  if [ -z "$NODE_BIN" ]; then
    echo "No Node 22 that the service user can run was found; installing it system-wide."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
    NODE_BIN=/usr/bin/node
  fi
  echo "service uses $NODE_BIN"
  cat > /etc/systemd/system/arena.service <<EOF
[Unit]
Description=Vyre Bad Lands match server
After=network.target

[Service]
WorkingDirectory=$SRC/arena/server
Environment=PORT=2567
Environment=HOST=127.0.0.1
Environment=ARENA_DATA=$DATA
ExecStart=$NODE_BIN index.js
Restart=always
RestartSec=2
User=arena
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
  cat > /etc/systemd/system/arena-update.service <<EOF
[Unit]
Description=Update Vyre Bad Lands

[Service]
Type=oneshot
ExecStart=/bin/bash $SRC/arena/deploy/setup.sh --update $DOMAIN
EOF
  cat > /etc/systemd/system/arena-update.timer <<EOF
[Unit]
Description=Check for a new Vyre Bad Lands build

[Timer]
OnBootSec=5min
OnUnitActiveSec=10min

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable arena >/dev/null 2>&1
  systemctl restart arena
  systemctl enable --now arena-update.timer >/dev/null 2>&1

  say "Web server"
  sed -e "s/__SERVER_NAME__/${DOMAIN:-_}/" -e "s#__WEBROOT__#$WEB#" "$SRC/arena/deploy/nginx-arena.conf" > /etc/nginx/sites-available/arena
  ln -sf /etc/nginx/sites-available/arena /etc/nginx/sites-enabled/arena
  # the stock "Welcome to nginx" page is the only thing this replaces
  if [ -L /etc/nginx/sites-enabled/default ]; then rm -f /etc/nginx/sites-enabled/default; fi
  nginx -t
  systemctl enable nginx >/dev/null 2>&1
  systemctl reload nginx || systemctl restart nginx
  if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then ufw allow 'Nginx Full' >/dev/null; fi

  local MYIP
  MYIP="$(curl -fsS https://api.ipify.org 2>/dev/null || true)"
  if [ -n "$DOMAIN" ]; then
    say "https for $DOMAIN"
    local THEIRS
    THEIRS="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}' || true)"
    if [ -n "$MYIP" ] && [ "$MYIP" = "$THEIRS" ]; then
      certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
    else
      echo "$DOMAIN does not point at this server yet (it points at '${THEIRS:-nowhere}', this server is '${MYIP:-unknown}')."
      echo "Add an A record for $DOMAIN to ${MYIP:-the server address}, wait a few minutes, then run this again."
    fi
  fi

  say "Checking"
  local UP=0
  for _ in $(seq 1 20); do if curl -fsS http://127.0.0.1:2567/health >/dev/null 2>&1; then UP=1; break; fi; sleep 1; done
  if [ "$UP" = 1 ]; then echo "match server: up"; else
    echo "MATCH SERVER IS NOT RUNNING. Its last log lines:"; journalctl -u arena -n 15 --no-pager || true
    echo "Send those lines to Jarvis."; return 1
  fi
  # asked by name, the way a visitor asks (a plain address is refused once https redirects are on)
  local HOSTNAME_CHECK="${DOMAIN:-localhost}"
  curl -fsS -o /dev/null -w "page: %{http_code}\n" -H "Host: $HOSTNAME_CHECK" http://127.0.0.1/ || true
  curl -fsS -H "Host: $HOSTNAME_CHECK" http://127.0.0.1/health || true; echo
  echo
  echo "Done. Open: http://${MYIP:-this-server}/"
  if [ -n "$DOMAIN" ]; then echo "  and: https://$DOMAIN/"; fi
}

main "$@"
exit 0
