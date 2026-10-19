import test from 'node:test';
import assert from 'node:assert/strict';
import { coneLimit, frictionFor, zoomScale, cleanLook, onBody, flinchAmount } from '../src/aimcore.js';
import { Haptics, patternFor } from '../src/haptics.js';

test('the catch cone is wide close up and narrow far away', () => {
  assert.ok(coneLimit(150) > coneLimit(1200));
  assert.ok(coneLimit(100000) >= 0.05);
});

test('friction: nothing outside the inner cone, the full strength at the centre, smooth in between', () => {
  const lim = 0.2;
  assert.equal(frictionFor(0.2, lim, 0.5), 1);
  assert.equal(frictionFor(0.1, lim, 0.5), 1);
  assert.equal(frictionFor(0, lim, 0.5), 0.5);
  assert.equal(frictionFor(0.05, lim, 0), 1);
  let prev = 1;
  for (let e = 0.1; e >= 0; e -= 0.01) { const f = frictionFor(e, lim, 0.6); assert.ok(f <= prev + 1e-9, `not monotonic at ${e}`); prev = f; }
  assert.equal(frictionFor(-0.03, lim, 0.5), frictionFor(0.03, lim, 0.5));       // either side of the target
  assert.ok(frictionFor(0, lim, 5) > 0.099);                                       // never a dead stop
});

test('a zoomed view turns slower, an open one at full speed', () => {
  assert.equal(zoomScale(75, 75), 1);
  assert.ok(zoomScale(30, 75) < 0.5);
  assert.equal(zoomScale(120, 75), 1);
  assert.ok(zoomScale(1, 75) >= 0.15);
});

test('the look speed setting stays inside the slider', () => {
  assert.equal(cleanLook(null), 1); assert.equal(cleanLook(undefined), 1); assert.equal(cleanLook(''), 1); assert.equal(cleanLook('banana'), 1); assert.equal(cleanLook(0), 0.4); assert.equal(cleanLook(9), 2.5); assert.equal(cleanLook(1.3), 1.3);
});

test('on body: wider near, narrower far', () => {
  assert.ok(onBody(0.05, 5)); assert.ok(!onBody(0.05, 30)); assert.ok(onBody(0.005, 60));
});

test('a hit knocks the view harder for more damage, never below a graze or above a full hit', () => {
  assert.ok(flinchAmount(60) === 1 && flinchAmount(2) === 0.25 && flinchAmount(undefined) > 0.5);
  assert.ok(flinchAmount(20) < flinchAmount(40));
});

test('vibration patterns grow with the weapon and with the hit', () => {
  assert.ok(patternFor('shot', 60) > patternFor('shot', 10));
  assert.ok(patternFor('hit', 1) > patternFor('hit', 0.25));
  assert.ok(Array.isArray(patternFor('kill')));
  assert.equal(patternFor('nonsense'), 0);
});

const mk = (o = {}) => { const calls = []; const h = new Haptics({ touch: true, nav: { vibrate: (p) => { calls.push(p); return true; } }, win: {}, now: () => h.t, ...o }); h.t = 1000; return { h, calls }; };

test('a phone browser vibrates, spaced out, and a computer does not', () => {
  const { h, calls } = mk();
  assert.ok(h.fire('shot', 20)); assert.equal(h.fire('shot', 20), false);       // too soon after the last
  h.t += 100; assert.ok(h.fire('shot', 20)); assert.equal(calls.length, 2);
  const pc = mk({ touch: false }); assert.equal(pc.h.fire('hit', 1), false); assert.equal(pc.calls.length, 0);
  assert.equal(pc.h.available(), false); assert.equal(h.available(), true);
});

test('switched off, it never vibrates', () => {
  const { h, calls } = mk({ enabled: () => false }); assert.equal(h.fire('hit', 1), false); assert.equal(calls.length, 0);
});

test('inside the app the phone haptic engine is used instead of the browser', () => {
  const seen = [];
  const Haptics_ = { impact: (o) => seen.push(['impact', o.style]), notification: (o) => seen.push(['note', o.type]) };
  const { h, calls } = mk({ win: { Capacitor: { isNativePlatform: () => true, Plugins: { Haptics: Haptics_ } } }, touch: false });
  assert.ok(h.available());
  h.fire('hit', 1); h.t += 300; h.fire('kill'); h.t += 300; h.fire('shot', 40);
  assert.deepEqual(seen, [['impact', 'HEAVY'], ['note', 'SUCCESS'], ['impact', 'MEDIUM']]);
  assert.equal(calls.length, 0);
});

test('a browser without vibration (an iPhone) stays quiet and does not throw', () => {
  const { h } = mk({ nav: {} }); assert.equal(h.fire('hit', 1), false); assert.equal(h.available(), false);
});
