import test from 'node:test';
import assert from 'node:assert/strict';
import { bars, compare, figures, WEAPON_PICTURES } from '../src/loadoutcore.js';
import { WEAPONS } from '../../server/items.js';
import { existsSync } from 'node:fs';

const by = (list, key) => list.find((b) => b.key === key);

test('every bar is between 0 and 1 for every gun, with and without attachments', () => {
  for (const id of Object.keys(WEAPONS)) for (const extra of [{}, { optic: 'reddot', muzzle: 'suppressor', grip: 'grip', ammo: 'extmag', armor: 'elite', boots: 'runner' }]) {
    const list = bars({ weapon: id, ...extra });
    assert.equal(list.length, 8);
    for (const b of list) assert.ok(b.value >= 0 && b.value <= 1 && b.text, `${id} ${b.key} ${b.value}`);
  }
});

test('the bars say what the rules say: a sniper hits harder than an SMG and shoots slower, an SMG has the better rate', () => {
  const sn = bars({ weapon: 'sniper' }), sm = bars({ weapon: 'smg' });
  assert.ok(by(sn, 'dmg').value > by(sm, 'dmg').value);
  assert.ok(by(sn, 'rate').value < by(sm, 'rate').value);
  assert.ok(by(sn, 'range').value > by(sm, 'range').value);
  assert.ok(by(sn, 'acc').value > by(sm, 'acc').value);
});

test('a shotgun counts all its pellets', () => {
  assert.equal(figures({ weapon: 'shotgun' }).perShot, WEAPONS.shotgun.dmg * WEAPONS.shotgun.pellets);
  assert.match(by(bars({ weapon: 'shotgun' }), 'dmg').text, /x 6$/);
});

test('comparing an attachment shows what it gains and loses', () => {
  const rd = compare({ weapon: 'rifle' }, 'optic', 'reddot');
  assert.equal(by(rd, 'acc').change, 1);
  const sup = compare({ weapon: 'rifle' }, 'muzzle', 'suppressor');
  assert.equal(by(sup, 'dmg').change, -1);
  const ext = compare({ weapon: 'rifle' }, 'ammo', 'extmag');
  assert.equal(by(ext, 'mag').change, 1);
  const elite = compare({ weapon: 'rifle' }, 'armor', 'elite');
  assert.equal(by(elite, 'hp').change, 1); assert.equal(by(elite, 'speed').change, -1);
  assert.equal(by(compare({ weapon: 'rifle' }, 'camo', 'desert'), 'dmg').change, 0);
});

test('comparing with the item already carried shows no change', () => {
  for (const b of compare({ weapon: 'rifle' }, 'weapon', 'rifle')) assert.equal(b.change, 0);
});

test('every gun has a picture in public/guns', () => {
  for (const id of WEAPON_PICTURES) assert.ok(existsSync(new URL(`../public/guns/${id}.webp`, import.meta.url)), id);
});
