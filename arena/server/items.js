// The loadout catalogue, shared by the match server (which applies the stats and checks ownership) and the page (which shows the shop).
// Prices are in play coins. Nothing here touches a wallet. A real-money version would be a separate, lawyer-reviewed decision.
export const WEAPONS = {
  pistol:  { slot: 'weapon', name: 'Pistol',          cost: 0,   dmg: 18, gap: 0.38, speed: 620,  life: 0.7,  range: 1500, spread: 0.03, pellets: 1, blurb: 'Reliable and free' },
  smg:     { slot: 'weapon', name: 'SMG',             cost: 300, dmg: 8,  gap: 0.09, speed: 620,  life: 0.55, range: 1300, spread: 0.07, pellets: 1, blurb: 'Fast fire, close range' },
  rifle:   { slot: 'weapon', name: 'Assault rifle',   cost: 600, dmg: 13, gap: 0.16, speed: 700,  life: 0.8,  range: 2400, spread: 0.035, pellets: 1, blurb: 'Good at every range' },
  shotgun: { slot: 'weapon', name: 'Shotgun',         cost: 500, dmg: 9,  gap: 0.8,  speed: 600,  life: 0.32, range: 800, spread: 0.12, pellets: 6, blurb: 'Deadly up close' },
  sniper:  { slot: 'weapon', name: 'Sniper rifle',    cost: 900, dmg: 60, gap: 1.15, speed: 1100, life: 1.1,  range: 3400, spread: 0.002, pellets: 1, blurb: 'One or two shots, slow' },
};
export const GRENADE = { name: 'Frag grenade', count: 2, fuse: 2.2, radius: 300, dmg: 130, speed: 15 };
export const ARMOR = {
  none:  { slot: 'armor', name: 'No armour',    cost: 0,   hp: 100, speed: 1.0,  blurb: '100 health' },
  light: { slot: 'armor', name: 'Light vest',   cost: 200, hp: 125, speed: 0.97, blurb: '+25 health' },
  heavy: { slot: 'armor', name: 'Heavy plates', cost: 450, hp: 160, speed: 0.9,  blurb: '+60 health, slower' },
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
export const CATALOG = { ...WEAPONS, ...ARMOR, ...BOOTS, ...CAMO };
export const SLOTS = ['weapon', 'armor', 'boots', 'camo'];
export const FREE = { weapon: 'pistol', armor: 'none', boots: 'standard', camo: 'woodland' };
export const START_COINS = 600;
export const REWARD = { kill: 25, round: 100, match: 250 };
export const itemSlot = (id) => CATALOG[id]?.slot;
