// Acceptance tests — run headless by `npm run verify` (type-check + this file). Logic only: the rules engine, the shop and the arena data.
import { readFileSync } from 'node:fs';
import { BACKGROUND, PIXEL_ART, CONTAINER, GAME_OPTIONS, PX_PER_M, WALL_H, EYE_H, TEAM_COLORS, DEFAULT_TEAM_NAMES } from './config.js';
import { Match, WALLS, MAP, R, rayWall, rayCircle, pushOut } from './sim/index.js';
import { CATALOG, FREE, START_COINS, SLOTS, REWARD } from './sim/items.js';
import { freshProfile, sanitize, buy, equip, award, teamNames } from './profile.js';

let pass = 0, fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) { pass++; console.log('  ok   ', name); }
  else { fail++; console.error('  FAIL  ', name); }
}

// ── baseline sanity (the skeleton is wired correctly) ──
check('background is a hex colour', /^#[0-9a-fA-F]{3,8}$/.test(BACKGROUND));
check('boot options carry the background', GAME_OPTIONS.background === BACKGROUND);
check('boot options carry the art axis', GAME_OPTIONS.pixelArt === PIXEL_ART);
check('boot options carry the mount container', GAME_OPTIONS.container === CONTAINER);
const declared = JSON.parse(readFileSync(new URL('../src/game.json', import.meta.url), 'utf8')) as { worldHeight: number; background: string; pixelArt: boolean };
check('game.json agrees on background', declared.background === BACKGROUND);
check('game.json agrees on pixel art', declared.pixelArt === PIXEL_ART);
check('game.json declares a positive world height', Number.isFinite(declared.worldHeight) && declared.worldHeight > 0);

// ── the arena ──
check('the map is 32 by 20 metres', MAP.w / PX_PER_M === 32 && MAP.h / PX_PER_M === 20);
check('there are walls, all inside the map', WALLS.length > 10 && WALLS.every(([x, y, w, h]: number[]) => x >= 0 && y >= 0 && x + w <= MAP.w && y + h <= MAP.h));
check('you can see over a crate but not a wall', EYE_H > 1.4 && EYE_H < WALL_H);
check('two team colours', TEAM_COLORS.length === 2 && (TEAM_COLORS as readonly string[])[0] !== (TEAM_COLORS as readonly string[])[1] && DEFAULT_TEAM_NAMES.length === 2);

// ── shooting in first person: a shot lands the instant it is fired ──
check('a wall stops a ray', Math.abs(rayWall(60, 500, 0, 5000) - 120) < 1e-6);
check('a ray misses a circle off to the side', rayCircle(0, 0, 0, 100, 30, 10) === Infinity);
{
  const m = new Match({ teams: [{ name: 'A', color: 1 }, { name: 'B', color: 2 }], perSide: 3, bots: false });
  const a = m.addPlayer('a', { name: 'A', team: 0, loadout: { weapon: 'sniper' } })!, b = m.addPlayer('b', { name: 'B', team: 1 })!, c = m.addPlayer('c', { name: 'C', team: 0 })!;
  m.phase = 'live'; m.timer = 60;
  a.x = 200; a.y = 150; a.aim = 0; c.x = 300; c.y = 150; b.x = 500; b.y = 150;
  a.input = { dx: 0, dy: 0, aim: 0, fire: true };
  m.step(1 / 60);
  check('a shot hits the enemy and passes a team-mate', b.hp < b.hpMax && c.hp === c.hpMax);
  check('every shot sends a tracer event', m.events.some((e: any) => e.type === 'shot' && e.hit === 1));
  b.hp = b.hpMax; b.x = 1500; b.y = 500; a.x = 100; a.y = 500; a.cd = 0; m.step(1 / 60);
  check('a wall blocks the shot', b.hp === b.hpMax);
  b.x = 400; b.y = 150; a.x = 200; a.y = 150; a.cd = 0; b.hp = 10; m.step(1 / 60);
  check('the last of the health kills, once', !b.alive && a.kills === 1 && m.events.filter((e: any) => e.type === 'kill').length === 1);
}

// ── whole matches with bots only, at the page's step ──
{
  const m = new Match({ teams: [{ name: 'A', color: 1 }, { name: 'B', color: 2 }], perSide: 8, bots: true });
  m.startRound();
  let matches = 0, kills = 0, bad = false;
  for (let i = 0; i < 60 * 600; i++) {
    m.step(1 / 60);
    for (const e of m.events) { if (e.type === 'match') matches++; if (e.type === 'kill') kills++; }
    if (i % 600 === 0) for (const p of m.players.values()) { if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > MAP.w || p.y < 0 || p.y > MAP.h) bad = true; }
  }
  check('bots play whole matches, fight, and stay on the map', matches >= 1 && kills > 20 && !bad);
  const [x, y] = pushOut(WALLS[4][0] + 10, WALLS[4][1] + 10);
  check('players are pushed out of walls', !(x > WALLS[4][0] && x < WALLS[4][0] + WALLS[4][2] && y > WALLS[4][1] && y < WALLS[4][1] + WALLS[4][3]));
  check('rounds are best of three', R.WIN_ROUNDS === 2);
}

// ── the shop ──
{
  const p = freshProfile();
  check('a new player starts with the free items and the starting coins', p.coins === START_COINS && Object.values(FREE).every((id) => p.owned.includes(id as string)));
  check('buying needs coins', buy(p, 'sniper').error === 'not enough coins' && p.coins === START_COINS);
  check('a cheap item can be bought and is then carried', !buy(p, 'smg').error && p.loadout.weapon === 'smg' && p.coins === START_COINS - 300);
  check('you cannot buy twice or equip what you do not own', buy(p, 'smg').error === 'you already own it' && equip(p, 'rifle').error === 'you do not own it');
  check('you can switch back to a free item', !equip(p, 'pistol').error && p.loadout.weapon === 'pistol');
  award(p, REWARD.kill); check('a kill pays coins', p.coins === START_COINS - 300 + REWARD.kill);
  const dirty = sanitize({ coins: -5, owned: ['sniper', 'bogus', 7], loadout: { weapon: 'sniper', armor: 'bogus', boots: 'rifle' } });
  check('a stored profile is cleaned', dirty.coins === START_COINS && dirty.owned.includes('sniper') && !dirty.owned.includes('bogus') && dirty.loadout.weapon === 'sniper' && dirty.loadout.armor === FREE.armor && dirty.loadout.boots === FREE.boots);
  check('stored junk gives a fresh profile', sanitize('x').coins === START_COINS && sanitize(null).loadout.weapon === FREE.weapon);
  check('every slot has a free item', (SLOTS as string[]).every((s) => Object.values(CATALOG as Record<string, { slot: string; cost: number }>).some((i) => i.slot === s && i.cost === 0)));
  check('team names come from the address and are cleaned', teamNames('?a=PEPE&b=%3Cscript%3E', ['X', 'Y']).join('|') === 'PEPE|script');
  check('team names fall back', teamNames('', ['X', 'Y']).join('|') === 'X|Y');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
