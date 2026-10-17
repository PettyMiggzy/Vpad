// The loadout catalogue, shared by the match server (which applies the stats and checks ownership) and the page (which shows the shop).
// Prices are in play coins. Nothing here touches a wallet. A real-money version would be a separate, lawyer-reviewed decision.
export const WEAPONS = {
  pistol:  { slot: 'weapon', name: 'Pistol',          cost: 0,   dmg: 18, gap: 0.38, speed: 620,  life: 0.7,  range: 1500, spread: 0.03, pellets: 1, mag: 12, reload: 1.4, blurb: 'Reliable and free' },
  smg:     { slot: 'weapon', name: 'SMG',             cost: 300, dmg: 8,  gap: 0.09, speed: 620,  life: 0.55, range: 1300, spread: 0.07, pellets: 1, mag: 30, reload: 1.9, blurb: 'Fast fire, close range' },
  rifle:   { slot: 'weapon', name: 'Assault rifle',   cost: 600, dmg: 13, gap: 0.16, speed: 700,  life: 0.8,  range: 2400, spread: 0.035, pellets: 1, mag: 30, reload: 2.3, blurb: 'Good at every range' },
  shotgun: { slot: 'weapon', name: 'Shotgun',         cost: 500, dmg: 9,  gap: 0.8,  speed: 600,  life: 0.32, range: 800, spread: 0.12, pellets: 6, mag: 6, reload: 2.4, blurb: 'Deadly up close' },
  sniper:  { slot: 'weapon', name: 'Sniper rifle',    cost: 900, dmg: 60, gap: 1.15, speed: 1100, life: 1.1,  range: 3400, spread: 0.002, pellets: 1, mag: 5, reload: 2.7, blurb: 'One or two shots, slow' },
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
// a mod changes the weapon you carry: each has a price in the gun, not only in coins
export const MODS = {
  nomod:    { slot: 'mod', name: 'No mod',          cost: 0,   blurb: 'Stock weapon' },
  extmag:   { slot: 'mod', name: 'Extended magazine', cost: 250, mag: 1.5,    blurb: '+50% rounds before a reload' },
  quickmag: { slot: 'mod', name: 'Quick-draw mag',  cost: 250, reload: 0.65, blurb: 'Reload 35% faster' },
  grip:     { slot: 'mod', name: 'Steady grip',     cost: 300, spread: 0.6,  blurb: '40% tighter spread' },
  barrel:   { slot: 'mod', name: 'Long barrel',     cost: 300, range: 1.25,  blurb: '+25% range' },
  hollow:   { slot: 'mod', name: 'Hollow points',   cost: 400, dmg: 1.12, mag: 0.8, blurb: '+12% damage, 20% smaller magazine' },
};
// grenade kits: how many you carry, and how hard they hit
export const KITS = {
  frag2:  { slot: 'grenade', name: 'Two frags',        cost: 0,   count: 2, radius: 1.0,  dmg: 1.0, blurb: 'Standard issue' },
  frag3:  { slot: 'grenade', name: 'Three frags',      cost: 150, count: 3, radius: 1.0,  dmg: 1.0, blurb: 'One more grenade' },
  frag4:  { slot: 'grenade', name: 'Four frags',       cost: 300, count: 4, radius: 1.0,  dmg: 1.0, blurb: 'Two more grenades' },
  heavy3: { slot: 'grenade', name: 'Heavy frags x3',   cost: 450, count: 3, radius: 1.25, dmg: 1.2, blurb: 'Bigger blast, harder hit' },
};
export const BOOTS = {
  standard: { slot: 'boots', name: 'Standard boots', cost: 0,   speed: 1.0,  blurb: 'Normal speed' },
  light:    { slot: 'boots', name: 'Light boots',    cost: 250, speed: 1.08, blurb: '+8% speed' },
  runner:   { slot: 'boots', name: 'Runner boots',   cost: 500, speed: 1.16, blurb: '+16% speed' },
};
export const CAMO = {
  woodland: { slot: 'camo', name: 'Woodland', cost: 0,   tint: 0xffffff, blurb: 'Standard issue' },
  desert:   { slot: 'camo', name: 'Desert',   cost: 100, tint: 0xffd9a0, blurb: 'Sand tones' },
  arctic:   { slot: 'camo', name: 'Arctic',   cost: 100, tint: 0xd8e8ff, blurb: 'Snow tones' },
  night:    { slot: 'camo', name: 'Night ops', cost: 150, tint: 0x7d8cb0, blurb: 'Dark blue' },
  toxic:    { slot: 'camo', name: 'Toxic',    cost: 200, tint: 0xb6ff6a, blurb: 'Lime glow' },
};
export const CATALOG = { ...WEAPONS, ...MODS, ...ARMOR, ...HELMETS, ...BOOTS, ...KITS, ...CAMO };
export const SLOTS = ['weapon', 'mod', 'armor', 'helmet', 'boots', 'grenade', 'camo'];
export const FREE = { weapon: 'pistol', mod: 'nomod', armor: 'none', helmet: 'nohelm', boots: 'standard', grenade: 'frag2', camo: 'woodland' };
export const START_COINS = 600;
export const REWARD = { kill: 25, round: 100, match: 250 };
export const itemSlot = (id) => CATALOG[id]?.slot;
