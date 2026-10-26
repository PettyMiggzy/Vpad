// The loadout screen: pick a gun, fit attachments, choose armour and gear, save it as a class. A full screen of its own, opened from the menu.
// Pictures of the guns are renders of the game's own models (public/guns). Everything it does goes through the same profile rules as before.
import { CATALOG, SLOTS } from '../../server/items.js';
import { buy, equip, level, levelProgress, classSave, classSelect, classRename } from './profile.ts';
import { lockedReason, masteryOf, xpForLevel, MAX_LEVEL } from '../../server/progress.js';
import { bars, compare, WEAPON_PICTURES } from './loadoutcore.js';

const TAB_NAMES = { weapon: 'Guns', optic: 'Optics', muzzle: 'Muzzles', grip: 'Grips', ammo: 'Ammo', armor: 'Armour', helmet: 'Helmets', boots: 'Boots', grenade: 'Throwables', melee: 'Knives', gadget: 'Gadgets', camo: 'Camo' };
const SLOT_LABEL = { weapon: 'Gun', optic: 'Optic', muzzle: 'Muzzle', grip: 'Grip', ammo: 'Ammo', armor: 'Armour', helmet: 'Helmet', boots: 'Boots', grenade: 'Throwable', melee: 'Knife', gadget: 'Gadget', camo: 'Camo' };
const STAR = '&#9733;', STAR0 = '&#9734;';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const CSS = `
#vy-lo { position: fixed; inset: 0; z-index: 9; display: none; flex-direction: column; background: radial-gradient(ellipse at 30% 0%, #1b2a10, #060a05 70%); color: var(--text); font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
#vy-lo.on { display: flex; }
#vy-lo .top { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--line); flex-wrap: nowrap; overflow-x: auto; }
#vy-lo .back { border: 1px solid var(--lime); background: transparent; color: var(--lime); font-weight: 900; border-radius: 10px; padding: 8px 14px; cursor: pointer; white-space: nowrap; }
#vy-lo h1 { font-size: 18px; letter-spacing: .12em; margin: 0 6px 0 0; color: var(--lime); white-space: nowrap; }
#vy-lo .cls { padding: 7px 11px; border-radius: 10px; border: 2px solid var(--line); background: #0d160a; font-weight: 800; font-size: 12px; cursor: pointer; white-space: nowrap; } #vy-lo .cls.on { border-color: var(--lime); box-shadow: 0 0 10px rgba(182,255,0,.35); }
#vy-lo .clsb { border: 0; border-radius: 10px; padding: 8px 11px; font-weight: 900; font-size: 12px; cursor: pointer; background: var(--lime); color: #071000; white-space: nowrap; } #vy-lo .clsb.alt { background: transparent; color: var(--lime); border: 1px solid var(--lime); }
#vy-lo .sp { flex: 1; }
#vy-lo .coins { color: var(--lime); font-weight: 900; white-space: nowrap; } #vy-lo .lvl { font-size: 11px; color: var(--muted); white-space: nowrap; text-align: right; line-height: 1.3; }
#vy-lo .body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(280px, 42%) 1fr; gap: 14px; padding: 10px 12px; }
#vy-lo .left, #vy-lo .right { min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
#vy-lo .hero { border: 1px solid var(--line); border-radius: 16px; background: linear-gradient(180deg, rgba(20,32,12,.9), rgba(8,12,6,.9)); padding: 10px 12px 12px; }
#vy-lo .hero .pic { height: clamp(70px, 22vh, 170px); display: grid; place-items: center; } #vy-lo .hero .pic { overflow: hidden; } #vy-lo .hero .pic img { height: 100%; width: 100%; object-fit: contain; filter: drop-shadow(0 8px 14px rgba(0,0,0,.6)); }
#vy-lo .hero .nm { font-size: 20px; font-weight: 900; } #vy-lo .hero .bl { color: var(--muted); font-size: 12px; margin-top: 2px; }
#vy-lo .bars { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; margin-top: 10px; }
#vy-lo .bar { font-size: 11px; color: var(--muted); } #vy-lo .bar .l { display: flex; justify-content: space-between; } #vy-lo .bar .l b { color: var(--text); font-weight: 800; }
#vy-lo .bar .t { position: relative; height: 7px; border-radius: 4px; background: #0d160a; border: 1px solid var(--line); margin-top: 3px; overflow: hidden; }
#vy-lo .bar .t i { position: absolute; top: 0; bottom: 0; left: 0; background: linear-gradient(90deg, #7ac900, var(--lime)); }
#vy-lo .bar .t i.up { background: #4be08a; } #vy-lo .bar .t i.down { background: #ff6a55; }
#vy-lo .chips { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; }
#vy-lo .chip { border: 1px solid var(--line); background: #0d160a; border-radius: 10px; padding: 6px 9px; cursor: pointer; font-size: 12px; min-width: 0; } #vy-lo .chip small { display: block; color: var(--muted); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; } #vy-lo .chip b { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } #vy-lo .chip.on { border-color: var(--lime); box-shadow: 0 0 10px rgba(182,255,0,.3); }
#vy-lo .tabs { display: flex; gap: 6px; margin-bottom: 8px; overflow-x: auto; padding-bottom: 2px; position: sticky; top: 0; background: rgba(8,12,6,.96); z-index: 1; }
#vy-lo .tab { padding: 8px 13px; border-radius: 10px; border: 1px solid var(--line); background: #0d160a; font-weight: 800; font-size: 13px; cursor: pointer; white-space: nowrap; } #vy-lo .tab.on { background: var(--lime); color: #071000; border-color: var(--lime); }
#vy-lo .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
#vy-lo .card { border: 2px solid var(--line); background: #0d160a; border-radius: 14px; padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 4px; cursor: pointer; min-width: 0; } #vy-lo .card.sel { border-color: #fff; } #vy-lo .card.eq { border-color: var(--lime); box-shadow: 0 0 12px rgba(182,255,0,.35); } #vy-lo .card.lock { opacity: .62; }
#vy-lo .card img { height: 54px; object-fit: contain; align-self: center; margin-bottom: 2px; }
#vy-lo .card b { font-size: 14px; } #vy-lo .card small { color: var(--muted); font-size: 11px; line-height: 1.35; } #vy-lo .card .stars { color: #ffd24a; letter-spacing: 1px; }
#vy-lo .card button { margin-top: auto; border: 0; border-radius: 9px; padding: 9px 10px; font-weight: 900; font-size: 13px; cursor: pointer; background: var(--lime); color: #071000; } #vy-lo .card button.eq { background: transparent; color: var(--lime); border: 1px solid var(--lime); } #vy-lo .card button:disabled { opacity: .5; cursor: default; } #vy-lo .card button.poor { opacity: .55; }
#vy-lo .msg { color: #ffb070; font-size: 12px; margin: 0 0 6px; } #vy-lo .msg:empty { display: none; } #vy-lo .msg.ok { color: var(--lime); }
#vy-lo .note { color: var(--muted); font-size: 11px; margin: 10px 0 4px; line-height: 1.45; }
@media (max-width: 760px) { #vy-lo .body { grid-template-columns: 1fr; overflow-y: auto; } #vy-lo .left, #vy-lo .right { overflow: visible; } }
@media (max-height: 440px) { #vy-lo .hero .pic { height: clamp(56px, 24vh, 100px); } #vy-lo .hero .nm { font-size: 16px; } #vy-lo .bars { gap: 4px 12px; margin-top: 6px; } #vy-lo .chips { margin-top: 6px; } #vy-lo .grid { grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); } #vy-lo .card img { height: 40px; } }
`;

export class LoadoutScreen {
  /** root: the element the page's colours live on; profile: the player's profile (changed in place); save(): store it; onShop(op, a, b): tell the server; base: the page's base address */
  constructor({ root, profile, save, onShop = () => {}, onClose = () => {}, base = '/' }) {
    this.profile = profile; this.save = save; this.onShop = onShop; this.onClose = onClose; this.base = base;
    this.tab = 'weapon'; this.sel = null; this.msg = ''; this.ok = false;
    if (!document.getElementById('vy-lo-css')) { const st = document.createElement('style'); st.id = 'vy-lo-css'; st.textContent = CSS; document.head.appendChild(st); }
    this.el = document.createElement('div'); this.el.id = 'vy-lo'; root.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.click(e));
    this.keys = (e) => { if (e.key === 'Escape' && this.isOpen()) { e.preventDefault(); this.close(); } };
    window.addEventListener('keydown', this.keys);
  }
  isOpen() { return this.el.classList.contains('on'); }
  open() { this.sel = null; this.msg = ''; this.render(); this.el.classList.add('on'); }
  close() { this.el.classList.remove('on'); this.onClose(); }
  dispose() { window.removeEventListener('keydown', this.keys); this.el.remove(); }

  /** the picture for a gun, or '' */
  pic(id) { return WEAPON_PICTURES.includes(id) ? `<img src="${this.base}guns/${id}.webp" alt="" draggable="false">` : ''; }

  click(e) {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const p = this.profile, act = t.dataset.act, id = t.dataset.id;
    if (act === 'back') return this.close();
    if (act === 'tab') { this.tab = t.dataset.tab; this.sel = null; return this.render(); }
    if (act === 'pick') { const it = CATALOG[id]; if (it) { this.sel = this.sel?.id === id ? null : { slot: it.slot, id }; this.render(); } return; }
    if (act === 'buy' || act === 'equip') {
      e.stopPropagation();
      const r = act === 'buy' ? buy(p, id) : equip(p, id);
      this.ok = !r.error; this.msg = r.error || (act === 'buy' ? `Bought and equipped ${CATALOG[id].name}` : `Equipped ${CATALOG[id].name}`);
      if (!r.error) { this.save(); this.onShop(act, id); this.sel = null; }
      return this.render();
    }
    if (act === 'class') { classSelect(p, Number(t.dataset.i)); this.save(); this.onShop('class-select', Number(t.dataset.i)); this.msg = ''; this.sel = null; return this.render(); }
    if (act === 'save') { classSave(p, p.activeClass); this.save(); this.onShop('class-save', p.activeClass); this.ok = true; this.msg = `Saved to ${p.classes[p.activeClass].name}`; return this.render(); }
    if (act === 'rename') {
      const n = window.prompt('Name this class', p.classes[p.activeClass].name); if (n === null) return;
      const r = classRename(p, p.activeClass, n); this.ok = !r.error; this.msg = r.error || '';
      if (!r.error) { this.save(); this.onShop('class-rename', p.activeClass, n); }
      return this.render();
    }
  }

  barsHtml(list) {
    return list.map((b) => {
      const was = b.was ?? b.value, lo = Math.min(was, b.value), hi = Math.max(was, b.value);
      const fill = b.change ? `<i style="width:${Math.round(lo * 100)}%"></i><i class="${b.change > 0 ? 'up' : 'down'}" style="left:${Math.round(lo * 100)}%;width:${Math.round((hi - lo) * 100)}%"></i>` : `<i style="width:${Math.round(b.value * 100)}%"></i>`;
      const txt = b.change ? `${esc(b.wasText)} &rarr; ${esc(b.text)}` : esc(b.text);
      return `<div class="bar"><div class="l"><span>${b.name}</span><b>${txt}</b></div><div class="t">${fill}</div></div>`;
    }).join('');
  }

  render() {
    const p = this.profile, L = level(p), lo = p.loadout;
    const sel = this.sel && this.sel.id !== lo[this.sel.slot] ? this.sel : null;
    const shownGun = sel && sel.slot === 'weapon' ? sel.id : lo.weapon;
    const gun = CATALOG[shownGun];
    const list = sel ? compare(lo, sel.slot, sel.id) : bars(lo);
    const into = p.xp - xpForLevel(L), span = L >= MAX_LEVEL ? 1 : xpForLevel(L + 1) - xpForLevel(L);
    const kills = p.weaponKills[shownGun] ?? 0, stars = masteryOf(kills);
    const chipSlots = SLOTS.filter((s) => s !== 'weapon');
    const hint = sel ? `Trying ${CATALOG[sel.id].name}: green is better, red is worse. Tap its button to take it.` : gun.blurb;
    const rows = Object.entries(CATALOG).filter(([, it]) => it.slot === this.tab).sort((a, b) => a[1].cost - b[1].cost);
    this.el.innerHTML = `
<div class="top"><button class="back" data-act="back">&larr; BACK</button><h1>LOADOUT</h1>
 ${p.classes.map((c, i) => `<div class="cls${i === p.activeClass ? ' on' : ''}" data-act="class" data-i="${i}">${esc(c.name)}</div>`).join('')}
 <button class="clsb" data-act="save">SAVE TO ${esc(p.classes[p.activeClass].name.toUpperCase())}</button><button class="clsb alt" data-act="rename">RENAME</button>
 <span class="sp"></span><div class="lvl">LEVEL ${L}<br>${L >= MAX_LEVEL ? 'max' : `${into} / ${span} XP`}</div><div class="coins">${p.coins} coins</div></div>
<div class="body">
 <div class="left"><div class="hero"><div class="pic">${this.pic(shownGun)}</div>
  <div class="nm">${esc(gun.name)} <span class="stars" style="color:#ffd24a;font-size:13px">${STAR.repeat(stars)}${STAR0.repeat(3 - stars)}</span> <small style="color:var(--muted);font-weight:600;font-size:11px">${kills} kills</small></div>
  <div class="bl">${esc(hint)}</div>
  <div class="bars">${this.barsHtml(list)}</div>
  <div class="chips">${chipSlots.map((s) => `<div class="chip${s === this.tab ? ' on' : ''}" data-act="tab" data-tab="${s}"><small>${SLOT_LABEL[s]}</small><b>${esc(CATALOG[lo[s]].name)}</b></div>`).join('')}</div>
 </div></div>
 <div class="right"><div class="tabs">${SLOTS.map((s) => `<div class="tab${s === this.tab ? ' on' : ''}" data-act="tab" data-tab="${s}">${TAB_NAMES[s]}</div>`).join('')}</div>
  <div class="msg${this.ok ? ' ok' : ''}">${esc(this.msg)}</div>
  <div class="grid">${rows.map(([id, it]) => this.card(id, it)).join('')}</div>
  <div class="note">Your loadout is fixed when a match starts: changes here apply from your next match. Coins come from kills, rounds and wins. Play money only: nothing here touches a wallet.</div>
 </div>
</div>`;
  }

  card(id, it) {
    const p = this.profile, owned = p.owned.includes(id), on = p.loadout[it.slot] === id, lock = lockedReason(p, id);
    const cant = lock && !owned;
    const label = on ? 'EQUIPPED' : cant ? lock.replace('Reach level ', 'LEVEL ').replace(/^Master.*/, 'EARN IT').replace(/^Reach level 20.*/, 'LEVEL 20') : owned ? 'EQUIP' : `BUY ${it.cost}`;
    const act = on || cant ? '' : owned ? 'equip' : 'buy';
    const dis = on || cant, poor = !owned && !cant && p.coins < it.cost;
    const kills = p.weaponKills[id] ?? 0;
    const sub = it.slot === 'weapon' ? `${esc(it.blurb)}<br><span class="stars">${STAR.repeat(masteryOf(kills))}${STAR0.repeat(3 - masteryOf(kills))}</span> ${kills} kills` : esc(it.blurb);
    return `<div class="card${on ? ' eq' : ''}${cant ? ' lock' : ''}${this.sel?.id === id ? ' sel' : ''}" data-act="pick" data-id="${id}">${this.pic(id)}<b>${esc(it.name)}</b><small>${sub}${cant ? `<br><i style="color:#ffb070;font-style:normal">${esc(lock)}</i>` : ''}</small><button class="${on ? 'eq' : ''}${poor ? ' poor' : ''}" ${act ? `data-act="${act}" data-id="${id}"` : ''}${dis ? ' disabled' : ''}>${label}</button></div>`;
  }
}
