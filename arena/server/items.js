// The loadout catalogue, shared by the match server (which applies the stats and checks ownership) and the page (which shows the shop).
// Prices are in play coins. Nothing here touches a wallet. A real-money version would be a separate, lawyer-reviewed decision.
export const WEAPONS = {
  pistol:  { slot: 'weapon', name: 'Pistol',          cost: 0,   dmg: 18, gap: 0.38, speed: 620,  life: 0.7,  range: 2200, spread: 0.03, pellets: 1, mag: 12, reload: 1.4, blurb: 'Reliable and free' },
  smg:     { slot: 'weapon', name: 'SMG',             cost: 300, dmg: 10, gap: 0.09, speed: 620,  life: 0.55, range: 1900, spread: 0.07, pellets: 1, mag: 30, reload: 1.9, blurb: 'Fast fire, close range' },
  rifle:   { slot: 'weapon', name: 'Assault rifle',   cost: 600, dmg: 13, gap: 0.16, speed: 700,  life: 0.8,  range: 4500, spread: 0.035, pellets: 1, mag: 30, reload: 2.3, blurb: 'Good at every range' },
  shotgun: { slot: 'weapon', name: 'Shotgun',         cost: 500, dmg: 14, gap: 0.8,  speed: 600,  life: 0.32, range: 800, spread: 0.12, pellets: 6, mag: 6, reload: 2.4, blurb: 'Deadly up close' },
  sniper:  { slot: 'weapon', name: 'Sniper rifle',    cost: 900, dmg: 60, gap: 1.15, speed: 1100, life: 1.1,  range: 12000, spread: 0.002, pellets: 1, mag: 5, reload: 2.7, blurb: 'One or two shots, slow' },
  revolver:{ slot: 'weapon', name: 'Magnum revolver', cost: 350, dmg: 42, gap: 0.65, speed: 900, life: 0.9, range: 3000, spread: 0.008, pellets: 1, mag: 6, reload: 2.3, blurb: 'Three body shots, two to the head' },
  burst:   { slot: 'weapon', name: 'Burst carbine',  cost: 700, dmg: 15, gap: 0.065, burst: 3, burstGap: 0.4, speed: 800, life: 0.8, range: 4200, spread: 0.018, pellets: 1, mag: 30, reload: 2.0, blurb: 'Three-round bursts, accurate' },
  lmg:     { slot: 'weapon', name: 'Light machine gun', cost: 1000, dmg: 12, gap: 0.1, speed: 700, life: 0.8, range: 4500, spread: 0.06, pellets: 1, mag: 75, reload: 4.2, move: 0.92, blurb: 'A huge magazine, heavy to carry' },
  autosg:  { slot: 'weapon', name: 'Auto shotgun',   cost: 1100, dmg: 9, gap: 0.28, speed: 600, life: 0.32, range: 700, spread: 0.13, pellets: 6, mag: 8, reload: 3.0, blurb: 'A shotgun that keeps firing' },
  mp:      { slot: 'weapon', name: 'Machine pistol', cost: 250, dmg: 9, gap: 0.055, speed: 600, life: 0.45, range: 1500, spread: 0.085, pellets: 1, mag: 20, reload: 1.5, blurb: 'A pistol that sprays, only good up close' },
  pdw:     { slot: 'weapon', name: 'Compact PDW',    cost: 650, dmg: 11, gap: 0.075, speed: 680, life: 0.7, range: 2800, spread: 0.045, pellets: 1, mag: 40, reload: 2.1, blurb: 'A long magazine and steady aim at medium range' },
  br:      { slot: 'weapon', name: 'Battle rifle',   cost: 1200, dmg: 30, gap: 0.26, speed: 900, life: 0.95, range: 6000, spread: 0.012, pellets: 1, mag: 20, reload: 2.6, blurb: 'Four body shots, one trigger pull each' },
  amr:     { slot: 'weapon', name: 'Anti-materiel rifle', cost: 2000, dmg: 110, gap: 1.6, speed: 1300, life: 1.2, range: 14000, spread: 0.001, pellets: 1, mag: 5, reload: 3.4, move: 0.88, blurb: 'Kills an unarmoured soldier in one shot, very slow' },
  thumper: { slot: 'weapon', name: 'Thumper grenade launcher', cost: 1500, dmg: 85, gap: 1.1, speed: 600, life: 1.8, range: 3500, spread: 0.008, pellets: 1, mag: 4, reload: 3.0, launch: { speed: 26, fuse: 1.8, radius: 230, dmg: 85, grav: 1, kind: 1 }, blurb: 'Lobs a grenade that bursts on impact' },
  rocket:  { slot: 'weapon', name: 'Rocket launcher', cost: 2200, dmg: 140, gap: 2.2, speed: 900, life: 3, range: 6000, spread: 0.004, pellets: 1, mag: 1, reload: 3.4, move: 0.9, launch: { speed: 42, fuse: 3.2, radius: 290, dmg: 140, grav: 0.06, kind: 2 }, blurb: 'A fast rocket and a huge blast. One shot, long reload' },
  minigun: { slot: 'weapon', name: 'Minigun', cost: 1800, dmg: 8, gap: 0.035, speed: 700, life: 0.8, range: 3500, spread: 0.1, pellets: 1, mag: 150, reload: 6.5, move: 0.7, blurb: 'A wall of lead. Slow to carry, long to reload' },
  flame:   { slot: 'weapon', name: 'Flamethrower', cost: 1000, dmg: 4, gap: 0.05, speed: 400, life: 0.3, range: 550, spread: 0.16, pellets: 5, mag: 120, reload: 3.5, fx: 'fire', blurb: 'Burns everything close. Useless at range' },
  raygun:  { slot: 'weapon', name: 'Ray gun', cost: 1600, dmg: 26, gap: 0.2, speed: 2000, life: 1.0, range: 5000, spread: 0.003, pellets: 1, mag: 24, reload: 2.2, fx: 'beam', blurb: 'A green beam that never drifts' },
  crossbow:{ slot: 'weapon', name: 'Tactical crossbow', cost: 900, dmg: 100, gap: 1.2, speed: 1200, life: 1.0, range: 4500, spread: 0.002, pellets: 1, mag: 1, reload: 2.0, quiet: 1, blurb: 'Silent. One bolt takes a soldier down, a head shot takes anyone' },
  dmr:     { slot: 'weapon', name: 'Marksman rifle', cost: 1300, dmg: 34, gap: 0.38, speed: 1000, life: 1.0, range: 7500, spread: 0.004, pellets: 1, mag: 10, reload: 2.6, blurb: 'Fast, hard-hitting, long range' },
};
// close range: the knife (key F). From behind it kills outright.
export const MELEE = { name: 'Combat knife', range: 100, arc: 0.45, dmg: 55, back: 140, gap: 0.8 };
/** hand weapons (key F): the knife is free; the rest hit harder or reach farther and are slower. Behind the target they hit for `back`. */
export const MELEES = {
  knife:    { slot: 'melee', name: 'Combat knife', cost: 0, range: 100, arc: 0.45, dmg: 55, back: 140, gap: 0.8, blurb: 'Quick. From behind it kills outright' },
  machete:  { slot: 'melee', name: 'Machete', cost: 300, range: 125, arc: 0.4, dmg: 65, back: 150, gap: 0.95, blurb: 'A longer reach and a harder cut' },
  tomahawk: { slot: 'melee', name: 'Tomahawk', cost: 400, range: 100, arc: 0.45, dmg: 60, back: 160, gap: 0.7, blurb: 'Fast, and it bites deep from behind' },
  katana:   { slot: 'melee', name: 'Katana', cost: 800, range: 140, arc: 0.35, dmg: 80, back: 200, gap: 1.0, blurb: 'Reach and power: two cuts, one from behind' },
  blade:    { slot: 'melee', name: 'Energy blade', cost: 1200, range: 115, arc: 0.4, dmg: 100, back: 200, gap: 1.2, blurb: 'One clean hit takes down a bare soldier' },
};
/** what you wear on your back: nothing, or a jetpack (hold jump in the air to climb until the fuel runs out; it refills on the ground) */
export const GADGETS = {
  nogadget: { slot: 'gadget', name: 'No gadget', cost: 0, blurb: 'Light and quiet' },
  jet:      { slot: 'gadget', name: 'Jetpack', cost: 800, jet: { fuel: 100, drain: 45, regen: 26, regenAir: 4, thrust: 24, vmax: 6.5, cap: 16, air: 1.12 }, blurb: 'Hold jump in the air to fly. Fuel refills on the ground' },
  turbo:    { slot: 'gadget', name: 'Turbo jetpack', cost: 1500, jet: { fuel: 160, drain: 50, regen: 32, regenAir: 6, thrust: 28, vmax: 8, cap: 24, air: 1.2 }, blurb: 'More fuel, faster climb, a higher ceiling' },
};
export const GRENADE = { name: 'Frag grenade', count: 2, fuse: 2.2, radius: 300, dmg: 130, speed: 15 };
export const ARMOR = {
  none:  { slot: 'armor', name: 'No armour',    cost: 0,   hp: 100, speed: 1.0,  blurb: '100 health' },
  light: { slot: 'armor', name: 'Light vest',   cost: 200, hp: 125, speed: 0.97, blurb: '+25 health' },
  heavy: { slot: 'armor', name: 'Heavy plates', cost: 450, hp: 160, speed: 0.9,  blurb: '+60 health, slower' },
  elite: { slot: 'armor', name: 'Elite plate carrier', cost: 900, hp: 200, speed: 0.84, blurb: '+100 health, much slower' },
};
// a helmet cuts the extra damage of a head shot (no helmet: double)
export const HELMETS = {
  nohelm:  { slot: 'helmet', name: 'No helmet',     cost: 0,   head: 2.0, speed: 1.0,  blurb: 'Head shots do double' },
  helmet1: { slot: 'helmet', name: 'Combat helmet', cost: 150, head: 1.6, speed: 1.0,  blurb: 'Head shots do 1.6x' },
  helmet2: { slot: 'helmet', name: 'Heavy helmet',  cost: 400, head: 1.25, speed: 0.98, blurb: 'Head shots do 1.25x, a little slower' },
};
// attachments change the weapon you carry. Four slots, one item in each, and they stack: every effect below multiplies with the others.
// optic: how you see and hold the aim
export const OPTICS = {
  noptic: { slot: 'optic', name: 'Iron sights',   cost: 0,   blurb: 'Stock sights' },
  reddot: { slot: 'optic', name: 'Red dot',       cost: 200, spread: 0.9,  blurb: '10% tighter spread, a clear dot to aim with' },
  scope:  { slot: 'optic', name: 'Long scope',    cost: 350, zoom: 0.65,   blurb: 'Zoom in half as far again when aiming' },
  steady: { slot: 'optic', name: 'Steady scope',  cost: 350, steady: 1,    blurb: 'Less wobble, and you hold your breath longer' },
};
// muzzle: range, kick and noise
export const MUZZLES = {
  nomuzzle:   { slot: 'muzzle', name: 'Bare muzzle',    cost: 0,   blurb: 'Stock muzzle' },
  barrel:     { slot: 'muzzle', name: 'Long barrel',    cost: 300, range: 1.25, blurb: '+25% range' },
  comp:       { slot: 'muzzle', name: 'Compensator',    cost: 300, recoil: 0.7, blurb: '30% less kick' },
  suppressor: { slot: 'muzzle', name: 'Suppressor',     cost: 450, dmg: 0.94, recoil: 0.85, quiet: 1, blurb: 'Quiet and no tracer for others, 6% less damage, a little less kick' },
};
// grip and trigger: how steady and how fast
export const GRIPS = {
  nogrip: { slot: 'grip', name: 'Plain grip',   cost: 0,   blurb: 'Stock grip' },
  grip:   { slot: 'grip', name: 'Steady grip',  cost: 300, spread: 0.6,  blurb: '40% tighter spread' },
  fore:   { slot: 'grip', name: 'Foregrip',     cost: 300, recoil: 0.75, blurb: '25% less kick' },
  bolt:   { slot: 'grip', name: 'Fast action',  cost: 450, gap: 0.8,     blurb: '20% less time between shots' },
};
// ammunition: magazine, reload and what the round does
export const AMMO = {
  stdammo:  { slot: 'ammo', name: 'Standard rounds',   cost: 0,   blurb: 'Stock ammunition' },
  extmag:   { slot: 'ammo', name: 'Extended magazine', cost: 250, mag: 1.5,    blurb: '+50% rounds before a reload' },
  quickmag: { slot: 'ammo', name: 'Quick-draw mag',    cost: 250, reload: 0.65, blurb: 'Reload 35% faster' },
  hollow:   { slot: 'ammo', name: 'Hollow points',     cost: 400, dmg: 1.12, mag: 0.8, blurb: '+12% damage, 20% smaller magazine' },
  ap:       { slot: 'ammo', name: 'Armour-piercing',   cost: 500, pierce: 0.55, blurb: 'Shoot through crates, barrels, sandbags and fences, at 55% damage' },
};
// grenade kits: how many you carry, and how hard they hit
export const KITS = {
  frag2:  { slot: 'grenade', name: 'Two frags',        cost: 0,   count: 2, radius: 1.0,  dmg: 1.0, blurb: 'Standard issue' },
  frag3:  { slot: 'grenade', name: 'Three frags',      cost: 150, count: 3, radius: 1.0,  dmg: 1.0, blurb: 'One more grenade' },
  frag4:  { slot: 'grenade', name: 'Four frags',       cost: 300, count: 4, radius: 1.0,  dmg: 1.0, blurb: 'Two more grenades' },
  heavy3: { slot: 'grenade', name: 'Heavy frags x3',   cost: 450, count: 3, radius: 1.25, dmg: 1.2, blurb: 'Bigger blast, harder hit' },
  sticky2:  { slot: 'grenade', name: 'Sticky bombs x2',  cost: 400, count: 2, radius: 1.0,  dmg: 1.25, type: 'sticky', blurb: 'Sticks to a soldier or a wall, then blows' },
  molotov2: { slot: 'grenade', name: 'Fire bombs x2',    cost: 450, count: 2, radius: 1.0,  dmg: 1.0,  type: 'fire',   blurb: 'Burst into flames that burn for five seconds' },
  flash3:   { slot: 'grenade', name: 'Flashbangs x3',    cost: 250, count: 3, radius: 1.0,  dmg: 0,    type: 'flash',  blurb: 'Blind everyone who sees it go off' },
  knives6:  { slot: 'grenade', name: 'Throwing knives x6', cost: 500, count: 6, radius: 1.0, dmg: 1.0,  type: 'knife',  blurb: 'Silent and straight. A head shot is a kill' },
};
export const BOOTS = {
  standard: { slot: 'boots', name: 'Standard boots', cost: 0,   speed: 1.0,  blurb: 'Normal speed' },
  swift:    { slot: 'boots', name: 'Light boots',    cost: 250, speed: 1.08, blurb: '+8% speed' },
  runner:   { slot: 'boots', name: 'Runner boots',   cost: 500, speed: 1.16, blurb: '+16% speed' },
};
export const CAMO = {
  woodland: { slot: 'camo', name: 'Woodland', cost: 0,   tint: 0xffffff, blurb: 'Standard issue' },
  desert:   { slot: 'camo', name: 'Desert',   cost: 100, tint: 0xffd9a0, blurb: 'Sand tones' },
  arctic:   { slot: 'camo', name: 'Arctic',   cost: 100, tint: 0xd8e8ff, blurb: 'Snow tones' },
  night:    { slot: 'camo', name: 'Night ops', cost: 150, tint: 0x7d8cb0, blurb: 'Dark blue' },
  toxic:    { slot: 'camo', name: 'Toxic',    cost: 200, tint: 0xb6ff6a, blurb: 'Lime glow' },
  gold:     { slot: 'camo', name: 'Gold',     cost: 0,   tint: 0xffd24a, blurb: 'Earned: master any weapon' },
  obsidian: { slot: 'camo', name: 'Obsidian', cost: 0,   tint: 0x5a4a78, blurb: 'Earned: reach level 20' },
};
export const CATALOG = { ...WEAPONS, ...MELEES, ...GADGETS, ...OPTICS, ...MUZZLES, ...GRIPS, ...AMMO, ...ARMOR, ...HELMETS, ...BOOTS, ...KITS, ...CAMO };
export const SLOTS = ['weapon', 'optic', 'muzzle', 'grip', 'ammo', 'armor', 'helmet', 'boots', 'grenade', 'melee', 'gadget', 'camo'];
export const FREE = { weapon: 'pistol', optic: 'noptic', muzzle: 'nomuzzle', grip: 'nogrip', ammo: 'stdammo', armor: 'none', helmet: 'nohelm', boots: 'standard', grenade: 'frag2', melee: 'knife', gadget: 'nogadget', camo: 'woodland' };
/** every gun is owned from the start (owner 2026-10-24: starting with only a pistol is no fun): upgrading means attachments, gear, camo and mastery */
export const STARTER_OWNED = [...Object.values(FREE), ...Object.keys(WEAPONS), ...Object.keys(MELEES), ...Object.keys(GADGETS), 'sticky2', 'molotov2', 'flash3', 'knives6'];
/** the loadout a new profile starts with, and the gun each of its five saved classes starts with */
export const STARTER_LOADOUT = { ...FREE, weapon: 'rifle' };
export const STARTER_CLASS_GUNS = ['rifle', 'smg', 'shotgun', 'sniper', 'lmg'];
export const START_COINS = 600;
export const REWARD = { kill: 25, round: 100, match: 250 };
export const itemSlot = (id) => CATALOG[id]?.slot;
/** the old single mod slot split into four: where each old mod went (a profile saved before the split is moved over with this) */
export const OLD_MOD_SLOT = { extmag: 'ammo', quickmag: 'ammo', hollow: 'ammo', grip: 'grip', bolt: 'grip', barrel: 'muzzle', scope: 'optic', steady: 'optic' };
