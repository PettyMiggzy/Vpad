// Builds the game page for the store apps into ./www: the light set of models, textures and skies only (phones never use the desktop set),
// the match server's address fixed to the public one (inside an app the page has no server of its own to be "auto" about).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname), web = path.resolve(here, '../../web'), out = path.resolve(here, '../www');
fs.rmSync(out, { recursive: true, force: true });
execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { cwd: web, stdio: 'inherit', env: { ...process.env, VITE_SERVER: process.env.GAME_SERVER || 'https://play.vyrebadlands.com', VITE_LITE: '1' } });
for (const d of ['models', 'tex', 'hdr', 'sessions.html']) fs.rmSync(path.join(out, d), { recursive: true, force: true });
const size = (p) => fs.readdirSync(p, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(p, e.name)) : fs.statSync(path.join(p, e.name)).size), 0);
console.log(`www: ${(size(out) / 1048576).toFixed(1)} MB`);
