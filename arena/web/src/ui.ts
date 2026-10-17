// @ts-nocheck
// The page around the 3D view: the menu with the loadout shop, the scoreboard, health, kill feed, banners, name tags and the touch controls.
// All of it is ordinary HTML laid over the canvas, so it stays sharp and works with a thumb.
import { CATALOG, SLOTS } from '../../server/items.js';
import { buy, equip, level, levelProgress, classSave, classSelect, classRename, type Profile } from './profile.js';
import { lockedReason, masteryOf, levelOf, xpForLevel, MAX_LEVEL } from '../../server/progress.js';
import { SEATS, DEFAULT_SEATS } from './config.js';
import { MAP_LIST } from './world.js';

type Item = { slot: string; name: string; cost: number; blurb: string };
const items = CATALOG as unknown as Record<string, Item>;
const TAB_NAMES: Record<string, string> = { weapon: 'Weapon', mod: 'Gun mods', armor: 'Armour', helmet: 'Helmet', boots: 'Boots', grenade: 'Grenades', camo: 'Camo' };

export interface PlayChoice { name: string; team: 0 | 1; seats: number; map: string; gfx: string; names: [string, string]; mode: 'practice' | 'challenge'; difficulty: number; objective: 'elim' | 'zone' }
export interface BoardRow { name: string; team: number; kills: number; deaths: number; bot: boolean; me: boolean; alive: boolean }
export interface LeaderData { teams: Record<string, { w: number; l: number }>; players: Record<string, { kills: number; deaths: number; matches: number; wins: number }> }
export interface UiOptions {
  teamNames: [string, string];
  teamColors: readonly [string, string];
  profile: Profile;
  save: () => void;
  onPlay: (c: PlayChoice) => void;
  onResume: () => void;
  onLeave: () => void;
  onPause: () => void;
  onScore: () => void;
  challengeLive: boolean;
  /** a shop or class action the menu took on this device; a hosted game repeats it on the server */
  onShop?: (op: string, a?: string | number, b?: string) => void;
  leaders: () => LeaderData;
}

const CSS = `
:root { --lime: #b6ff00; --bg: #050805; --panel: rgba(10,16,8,.92); --line: rgba(182,255,0,.28); --text: #eef6e4; --muted: #9aa98e; }
.vy, .vy * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
.vy [hidden] { display: none !important; }
#vy-hud { position: fixed; inset: 0; pointer-events: none; z-index: 3; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--text); user-select: none; -webkit-user-select: none; }
#vy-hud .bar { position: absolute; left: 50%; top: calc(8px + env(safe-area-inset-top)); transform: translateX(-50%); display: flex; align-items: center; gap: 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 7px 14px; font-weight: 800; white-space: nowrap; }
#vy-hud .t { display: flex; flex-direction: column; align-items: center; min-width: 74px; font-size: 12px; letter-spacing: .06em; }
#vy-hud .t b { font-size: 20px; line-height: 1; } #vy-hud .t small { color: var(--muted); font-weight: 600; }
#vy-hud .mid { display: flex; flex-direction: column; align-items: center; font-size: 11px; color: var(--muted); } #vy-hud .mid b { color: #fff; font-size: 18px; }
#vy-hud .pips { display: flex; gap: 4px; margin-top: 3px; } #vy-hud .pips i { width: 9px; height: 9px; border-radius: 50%; border: 2px solid currentColor; } #vy-hud .pips i.on { background: currentColor; }
#vy-banner { position: absolute; left: 0; right: 0; top: 24%; text-align: center; font-size: clamp(28px, 7vw, 60px); font-weight: 900; letter-spacing: .05em; text-shadow: 0 4px 18px #000; opacity: 0; transition: opacity .25s; }
#vy-banner.on { opacity: 1; } #vy-banner small { display: block; font-size: .32em; letter-spacing: .12em; color: var(--muted); margin-top: 6px; font-weight: 700; }
#vy-cross { position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; transform: translate(-50%, -50%); }
#vy-cross::before, #vy-cross::after { content: ''; position: absolute; background: #fff; box-shadow: 0 0 3px #000; }
#vy-cross::before { left: 12px; top: 0; width: 2px; height: 26px; -webkit-mask: linear-gradient(#000 0 8px, transparent 8px 18px, #000 18px); mask: linear-gradient(#000 0 8px, transparent 8px 18px, #000 18px); }
#vy-cross::after { top: 12px; left: 0; height: 2px; width: 26px; -webkit-mask: linear-gradient(90deg, #000 0 8px, transparent 8px 18px, #000 18px); mask: linear-gradient(90deg, #000 0 8px, transparent 8px 18px, #000 18px); }
#vy-hitm { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; transform: translate(-50%, -50%) rotate(45deg); opacity: 0; transition: opacity .12s; border: 2px solid var(--lime); }
#vy-hitm.on { opacity: 1; transition: none; }
#vy-hurt { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(255,40,20,0) 50%, rgba(255,40,20,.6) 100%); opacity: 0; transition: opacity .35s; }
#vy-hurt.on { opacity: 1; transition: none; }
#vy-me { position: absolute; left: calc(14px + env(safe-area-inset-left)); bottom: calc(14px + env(safe-area-inset-bottom)); width: min(260px, 46vw); }
#vy-me .hp { height: 14px; border-radius: 7px; background: rgba(0,0,0,.6); border: 1px solid var(--line); overflow: hidden; } #vy-me .hp i { display: block; height: 100%; width: 100%; background: var(--lime); transition: width .12s; }
#vy-me b { font-size: 26px; text-shadow: 0 2px 8px #000; } #vy-me small { color: var(--muted); font-size: 11px; display: block; }
#vy-gun { position: absolute; right: calc(14px + env(safe-area-inset-right)); bottom: calc(14px + env(safe-area-inset-bottom)); text-align: right; font-weight: 800; text-shadow: 0 2px 8px #000; }
#vy-gun small { display: block; color: var(--muted); font-size: 11px; font-weight: 600; }
#vy-feed { position: absolute; right: 10px; top: calc(66px + env(safe-area-inset-top)); display: flex; flex-direction: column; align-items: flex-end; gap: 3px; font-size: 12px; font-weight: 700; }
#vy-feed span { background: rgba(0,0,0,.55); border-radius: 8px; padding: 2px 8px; }
.vy-tag { position: absolute; transform: translate(-50%, -100%); font-size: 11px; font-weight: 800; text-shadow: 0 1px 4px #000; white-space: nowrap; }
.vy-tag i { display: block; height: 3px; border-radius: 2px; background: currentColor; margin: 2px auto 0; width: 34px; }
#vy-touch { position: absolute; inset: 0; pointer-events: none; }
#vy-pad { position: absolute; left: calc(max(5vw, 34px) + env(safe-area-inset-left)); bottom: calc(max(8vh, 28px) + env(safe-area-inset-bottom)); width: 132px; height: 132px; margin: 0; border-radius: 50%; border: 3px solid rgba(255,255,255,.35); background: rgba(255,255,255,.07); }
#vy-pad.moved { margin: -66px 0 0 -66px; }
#vy-pad::after { content: 'MOVE'; position: absolute; inset: 0; display: grid; place-items: center; font: 800 11px system-ui; letter-spacing: .12em; color: rgba(255,255,255,.4); }
#vy-pad.live::after { content: ''; }
#vy-pad i { position: absolute; left: 50%; top: 50%; width: 58px; height: 58px; margin: -29px 0 0 -29px; border-radius: 50%; background: rgba(255,255,255,.5); box-shadow: 0 0 12px rgba(0,0,0,.4); }
#vy-pad.sprint { border-color: #ffd24a; } #vy-pad.sprint i { background: #ffd24a; }
.vy-tb { position: absolute; border-radius: 50%; color: #fff; font-weight: 900; display: grid; place-items: center; pointer-events: auto; touch-action: none; text-align: center; letter-spacing: .04em; text-shadow: 0 1px 4px #000; user-select: none; -webkit-user-select: none; }
#vy-fire { right: calc(26px + env(safe-area-inset-right)); bottom: calc(22px + env(safe-area-inset-bottom)); width: 108px; height: 108px; font-size: 17px; background: rgba(255,70,50,.42); border: 3px solid rgba(255,140,120,.9); }
#vy-fire.on { background: rgba(255,70,50,.78); }
#vy-nade { right: calc(146px + env(safe-area-inset-right)); bottom: calc(26px + env(safe-area-inset-bottom)); width: 70px; height: 70px; font-size: 10px; background: rgba(120,170,40,.4); border: 3px solid rgba(190,255,60,.8); }
#vy-nade.on { background: rgba(182,255,0,.7); }
#vy-reload { right: calc(34px + env(safe-area-inset-right)); bottom: calc(142px + env(safe-area-inset-bottom)); width: 66px; height: 66px; font-size: 10px; background: rgba(60,120,210,.42); border: 3px solid rgba(130,185,255,.85); }
#vy-reload.on { background: rgba(130,185,255,.7); }
#vy-jump { right: calc(36px + env(safe-area-inset-right)); bottom: calc(222px + env(safe-area-inset-bottom)); width: 62px; height: 62px; font-size: 10px; background: rgba(255,210,74,.28); border: 3px solid rgba(255,210,74,.8); }
#vy-knife { right: calc(126px + env(safe-area-inset-right)); bottom: calc(118px + env(safe-area-inset-bottom)); width: 58px; height: 58px; font-size: 10px; background: rgba(255,255,255,.14); border: 3px solid rgba(255,255,255,.6); }
#vy-swap { right: calc(210px + env(safe-area-inset-right)); bottom: calc(112px + env(safe-area-inset-bottom)); width: 54px; height: 54px; font-size: 10px; background: rgba(255,255,255,.14); border: 3px solid rgba(255,255,255,.6); }
#vy-jump.on, #vy-knife.on, #vy-swap.on { background: rgba(255,255,255,.45); }
#vy-scope { right: calc(124px + env(safe-area-inset-right)); bottom: calc(186px + env(safe-area-inset-bottom)); width: 54px; height: 54px; font-size: 10px; background: rgba(255,255,255,.14); border: 3px solid rgba(255,255,255,.6); display: none; }
#vy-scope.on { background: rgba(255,255,255,.4); }
body.touch #vy-me { left: 50%; transform: translateX(-108%); bottom: calc(8px + env(safe-area-inset-bottom)); width: min(180px, 26vw); }
body.touch #vy-me b { font-size: 22px; } body.touch #vy-me small { display: none; }
body.touch #vy-gun { right: auto; left: 50%; transform: translateX(8%); bottom: calc(8px + env(safe-area-inset-bottom)); text-align: left; font-size: 13px; }
body.touch #vy-gun small { display: none; } body.touch #vy-gun b { font-size: 24px !important; }
#vy-rotate { position: fixed; inset: 0; z-index: 20; background: #0b0d10; color: #fff; display: none; place-items: center; text-align: center; font: 800 20px system-ui, sans-serif; padding: 30px; }
#vy-rotate small { display: block; margin-top: 10px; color: #9aa98e; font-weight: 600; font-size: 14px; } #vy-rotate .ph { font-size: 54px; display: block; transform: rotate(90deg); margin-bottom: 14px; }
@media (pointer: coarse) and (orientation: portrait) { #vy-rotate { display: grid; } }
#vy-tips { position: fixed; inset: 0; z-index: 8; background: rgba(5,8,5,.82); display: grid; place-items: center; color: #fff; font-family: system-ui, sans-serif; }
#vy-tips[hidden] { display: none; }
#vy-tips .card { width: min(560px, 92vw); background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 18px; }
#vy-tips h2 { margin: 0 0 10px; color: var(--lime); font-size: 20px; letter-spacing: .06em; } #vy-tips li { margin: 8px 0; font-size: 15px; line-height: 1.35; list-style: none; } #vy-tips b { color: #ffd24a; }
#vy-tips button { margin-top: 12px; width: 100%; border: 0; border-radius: 12px; padding: 14px; font-size: 17px; font-weight: 900; background: var(--lime); color: #071000; }
#vy-score { position: absolute; left: 50%; top: 14%; transform: translateX(-50%); width: min(720px, 94vw); background: rgba(6,10,6,.9); border: 1px solid var(--line); border-radius: 16px; padding: 14px; display: none; }
#vy-score.on { display: block; }
#vy-score .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } #vy-score h3 { margin: 0 0 6px; font-size: 14px; letter-spacing: .08em; } #vy-score table { width: 100%; border-collapse: collapse; font-size: 13px; }
#vy-score th { color: var(--muted); font-weight: 600; text-align: right; font-size: 11px; } #vy-score th:first-child, #vy-score td:first-child { text-align: left; } #vy-score td { text-align: right; padding: 3px 0; border-top: 1px solid rgba(255,255,255,.06); } #vy-score tr.me td { font-weight: 900; background: rgba(255,255,255,.08); } #vy-score tr.dead td { opacity: .45; }
#vy-score .foot { text-align: center; color: var(--muted); font-size: 11px; margin-top: 8px; }
#vy-spec { position: absolute; left: 50%; bottom: calc(86px + env(safe-area-inset-bottom)); transform: translateX(-50%); background: rgba(0,0,0,.6); border: 1px solid var(--line); border-radius: 12px; padding: 8px 16px; font-weight: 800; text-align: center; display: none; } #vy-spec small { display: block; color: var(--muted); font-weight: 600; font-size: 11px; margin-top: 2px; } #vy-spec.on { display: block; }
#vy-menubtn { position: absolute; left: calc(10px + env(safe-area-inset-left)); top: calc(8px + env(safe-area-inset-top)); width: 40px; height: 40px; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); color: #fff; font-weight: 900; display: none; place-items: center; pointer-events: auto; }
#vy-dir { position: absolute; inset: 0; pointer-events: none; }
#vy-dir i { position: absolute; left: 50%; top: 50%; width: 0; height: 0; margin: -150px 0 0 -22px; transform-origin: 22px 150px; border-left: 22px solid transparent; border-right: 22px solid transparent; border-bottom: 38px solid rgba(255,50,30,.85); filter: drop-shadow(0 0 6px #f20); animation: vyfade .9s forwards; }
@keyframes vyfade { 0% { opacity: 1; } 100% { opacity: 0; } }
#vy-low { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(160,0,0,.55) 100%); opacity: 0; transition: opacity .3s; pointer-events: none; }
#vy-medal { position: absolute; left: 50%; top: 62%; transform: translateX(-50%); text-align: center; font-weight: 900; letter-spacing: .08em; font-size: clamp(16px, 3.4vw, 28px); text-shadow: 0 2px 10px #000; opacity: 0; pointer-events: none; color: #ffd24a; } #vy-medal.on { animation: vymedal 1.6s forwards; }
@keyframes vymedal { 0% { opacity: 0; transform: translateX(-50%) scale(.6); } 12% { opacity: 1; transform: translateX(-50%) scale(1.1); } 80% { opacity: 1; transform: translateX(-50%) scale(1); } 100% { opacity: 0; transform: translateX(-50%) translateY(-14px); } }
#vy-map { position: absolute; left: calc(60px + env(safe-area-inset-left)); top: calc(8px + env(safe-area-inset-top)); width: 168px; height: 105px; border: 1px solid var(--line); border-radius: 10px; background: rgba(4,8,4,.55); }
@media (min-width: 900px) { #vy-map { left: calc(12px + env(safe-area-inset-left)); width: 216px; height: 135px; } }
#vy-zone { position: absolute; left: 50%; top: calc(76px + env(safe-area-inset-top)); transform: translateX(-50%); width: min(300px, 60vw); height: 14px; background: rgba(0,0,0,.6); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; } #vy-zone .l, #vy-zone .r { position: absolute; top: 0; bottom: 0; width: 0; } #vy-zone .l { right: 50%; } #vy-zone .r { left: 50%; } #vy-zone span { position: absolute; inset: 0; display: grid; place-items: center; font: 800 9px system-ui; letter-spacing: .12em; color: #fff; text-shadow: 0 1px 3px #000; } #vy-zone::after { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: rgba(255,255,255,.5); }
#vy-pause .btns { display: flex; gap: 10px; justify-content: center; margin-top: 18px; } #vy-pause button { border: 0; border-radius: 12px; padding: 12px 20px; font-size: 15px; font-weight: 900; cursor: pointer; background: var(--lime); color: #071000; } #vy-pause button.leave { background: transparent; color: #ff8a70; border: 1px solid #ff8a70; }
#vy-menu .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } #vy-menu .mode { border: 2px solid var(--line); border-radius: 12px; padding: 10px; background: #0d160a; cursor: pointer; text-align: center; font-weight: 800; font-size: 13px; } #vy-menu .mode small { display: block; color: var(--muted); font-weight: 600; font-size: 11px; margin-top: 3px; line-height: 1.3; } #vy-menu .mode.on { border-color: var(--lime); box-shadow: 0 0 14px rgba(182,255,0,.35); } #vy-menu .mode.off { opacity: .45; cursor: not-allowed; }
#vy-menu .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
#vy-menu details { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 10px; } #vy-menu summary { cursor: pointer; font-weight: 800; letter-spacing: .06em; font-size: 13px; color: var(--lime); }
#vy-menu table.lb { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; } #vy-menu table.lb td, #vy-menu table.lb th { padding: 4px 6px; text-align: right; border-top: 1px solid rgba(255,255,255,.06); } #vy-menu table.lb th:first-child, #vy-menu table.lb td:first-child { text-align: left; } #vy-menu table.lb th { color: var(--muted); font-size: 11px; }
#vy-pause { position: fixed; inset: 0; z-index: 4; display: grid; place-items: center; background: rgba(5,8,5,.72); color: #fff; font: 800 22px system-ui, sans-serif; letter-spacing: .06em; text-align: center; cursor: pointer; }
#vy-pause small { display: block; color: var(--muted); font-size: 13px; font-weight: 600; margin-top: 8px; letter-spacing: .02em; }
#vy-menu { position: fixed; inset: 0; background: radial-gradient(ellipse at 50% 15%, rgba(27,42,16,.9), rgba(5,8,5,.94) 70%); display: grid; place-items: center; padding: 14px; overflow-y: auto; z-index: 5; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--text); }
#vy-menu .card { width: min(560px, 100%); background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 20px; }
#vy-menu .logo { display: block; width: min(360px, 80%); margin: 0 auto 2px; }
#vy-menu .pick { margin-top: 10px; text-align: center; font-size: 12px; font-weight: 800; letter-spacing: .06em; color: var(--muted); }
#vy-menu .pick b { color: var(--text); }
#vy-menu .install { margin-top: 10px; font-size: 12px; line-height: 1.4; color: var(--muted); text-align: center; }
#vy-menu .install button { margin-top: 6px; border: 1px solid var(--lime); background: transparent; color: var(--lime); border-radius: 10px; padding: 8px 14px; font-weight: 800; }
/* wide screens (a computer, a phone turned sideways): who you are and PLAY stay on the left while the options scroll on the right */
@media (min-width: 700px) {
  #vy-menu { padding: max(10px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left)); overflow: hidden; }
  #vy-menu .card { width: min(1000px, 100%); max-height: calc(100vh - 20px); max-height: calc(100dvh - 20px); display: grid; grid-template-columns: minmax(250px, 320px) 1fr; gap: 22px; padding: 16px 18px; overflow: hidden; }
  #vy-menu .side { align-self: center; }
  #vy-menu .main { overflow-y: auto; overscroll-behavior: contain; padding-right: 8px; max-height: calc(100vh - 56px); max-height: calc(100dvh - 56px); -webkit-overflow-scrolling: touch; }
  #vy-menu .main > label:first-child { margin-top: 0; }
  #vy-menu .logo { width: min(300px, 100%); }
}
@media (max-height: 520px) { #vy-menu .sub { display: none; } #vy-menu .side label { margin-top: 8px; } #vy-menu .logo { width: min(210px, 100%); } #vy-menu button.go { margin-top: 10px; padding: 12px; } }
 #vy-menu .sub { color: var(--muted); font-size: 13px; margin-bottom: 14px; line-height: 1.4; }
#vy-menu label { display: block; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin: 14px 0 6px; }
#vy-menu input, #vy-menu select { width: 100%; background: #0d160a; color: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 12px; font-size: 16px; }
#vy-menu .teams { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } #vy-menu .team { border: 2px solid var(--line); border-radius: 14px; padding: 12px; text-align: center; font-weight: 900; cursor: pointer; background: #0d160a; } #vy-menu .team.on { border-color: var(--c); box-shadow: 0 0 18px var(--c); } #vy-menu .team small { display: block; color: var(--muted); font-weight: 600; margin-top: 3px; }
#vy-menu .maps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } #vy-menu .map { border: 2px solid var(--line); border-radius: 12px; padding: 10px 8px; background: #0d160a; cursor: pointer; text-align: center; font-size: 13px; } #vy-menu .map.on { border-color: var(--lime); box-shadow: 0 0 14px rgba(182,255,0,.4); } #vy-menu .map small { display: block; color: var(--muted); font-size: 10px; margin-top: 3px; line-height: 1.3; }
#vy-menu .lv { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; } #vy-menu .lv b { color: var(--lime); letter-spacing: .08em; font-size: 15px; } #vy-menu .lv span { color: var(--muted); font-size: 12px; }
#vy-menu .xpbar { height: 8px; border-radius: 5px; background: #0d160a; border: 1px solid var(--line); overflow: hidden; margin-top: 4px; } #vy-menu .xpbar i { display: block; height: 100%; background: linear-gradient(90deg, #7ac900, var(--lime)); }
#vy-menu .classes { display: flex; flex-wrap: wrap; gap: 6px; } #vy-menu .cls { padding: 8px 10px; border-radius: 10px; border: 2px solid var(--line); background: #0d160a; font-weight: 800; font-size: 12px; cursor: pointer; } #vy-menu .cls.on { border-color: var(--lime); box-shadow: 0 0 10px rgba(182,255,0,.35); }
#vy-menu .clsb { border: 0; border-radius: 10px; padding: 8px 12px; font-weight: 900; font-size: 12px; cursor: pointer; background: var(--lime); color: #071000; } #vy-menu .clsb.alt { background: transparent; color: var(--lime); border: 1px solid var(--lime); }
#vy-menu .it.lock { opacity: .6; } #vy-menu .stars { color: #ffd24a; letter-spacing: 1px; } #vy-menu .it i { color: #ffb070; font-style: normal; }
#vy-hints { position: absolute; left: calc(12px + env(safe-area-inset-left)); bottom: calc(70px + env(safe-area-inset-bottom)); background: rgba(0,0,0,.55); border: 1px solid var(--line); border-radius: 12px; padding: 8px 12px; font-size: 12px; line-height: 1.55; display: none; } #vy-hints.on { display: block; } #vy-hints kbd { background: #1c2a14; border: 1px solid var(--line); border-radius: 5px; padding: 0 5px; font: 800 11px system-ui; color: var(--lime); margin-right: 4px; }
#vy-menu .tabs { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; } #vy-menu .tab { padding: 8px 12px; border-radius: 10px; border: 1px solid var(--line); background: #0d160a; font-weight: 800; font-size: 13px; cursor: pointer; } #vy-menu .tab.on { background: var(--lime); color: #071000; border-color: var(--lime); }
#vy-menu .items { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; } #vy-menu .it { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid var(--line); background: #0d160a; border-radius: 12px; padding: 8px 10px; } #vy-menu .it b { display: block; font-size: 14px; } #vy-menu .it small { color: var(--muted); font-size: 11px; }
#vy-menu .it button { border: 0; border-radius: 9px; padding: 8px 12px; font-weight: 900; font-size: 13px; cursor: pointer; background: var(--lime); color: #071000; min-width: 78px; } #vy-menu .it button.eq { background: transparent; color: var(--lime); border: 1px solid var(--lime); } #vy-menu .it button:disabled { opacity: .45; }
#vy-menu button.go { width: 100%; margin-top: 18px; background: var(--lime); color: #071000; border: 0; border-radius: 14px; padding: 15px; font-size: 18px; font-weight: 900; letter-spacing: .04em; cursor: pointer; }
#vy-menu .err { color: #ff8a70; font-size: 13px; margin-top: 8px; min-height: 18px; } #vy-menu .note { font-size: 11px; color: var(--muted); margin-top: 12px; line-height: 1.45; }
`;

export class Ui {
  private el: Record<string, HTMLElement> = {};
  private tab = 'weapon';
  private team: 0 | 1 = 0;
  private mapId = 'cargo';
  private mode: 'practice' | 'challenge' = 'practice';
  private tags = new Map<string, HTMLElement>();
  private bannerTimer = 0;
  readonly touch: boolean;
  /** the move stick and the look finger are read by the main loop */
  move = { x: 0, y: 0 };
  lookDelta = { x: 0, y: 0 };
  fireTouch = false;
  nadeTouch = false;
  reloadTouch = false;
  zoomTouch = false;
  jumpTouch = false;
  knifeTouch = false;
  swapTouch = false;
  sprintTouch = false;
  easy = true;
  tipsPending = false;

  constructor(private o: UiOptions) {
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const root = document.createElement('div'); root.className = 'vy';
    const [a, b] = o.teamNames, [ca, cb] = o.teamColors;
    root.innerHTML = `
<div id="vy-hud" hidden>
  <div id="vy-hurt"></div>
  <div class="bar"><div class="t" style="color:${ca}"><b data-n="0">0</b><span data-tn="0">${a}</span><div class="pips" data-pips="0"></div></div><div class="mid"><span data-round>ROUND 1</span><b data-time>0</b><span data-alive></span></div><div class="t" style="color:${cb}"><b data-n="1">0</b><span data-tn="1">${b}</span><div class="pips" data-pips="1"></div></div></div>
  <div id="vy-zone" hidden><i class="l"></i><i class="r"></i><span></span></div><div id="vy-feed"></div><div id="vy-banner"></div><div id="vy-hints"><kbd>WASD</kbd>move &nbsp;<kbd>Mouse</kbd>aim &nbsp;<kbd>Click</kbd>fire &nbsp;<kbd>Right click</kbd>zoom<br><kbd>R</kbd>reload &nbsp;<kbd>G</kbd>throw grenade &nbsp;<kbd>F</kbd>knife &nbsp;<kbd>Q</kbd>swap gun<br><kbd>Space</kbd>jump &nbsp;<kbd>Shift</kbd>sprint &nbsp;<kbd>Tab</kbd>scoreboard &nbsp;<kbd>Esc</kbd>pause<br><kbd>H</kbd>hide this</div><div id="vy-low"></div><div id="vy-dir"></div><div id="vy-medal"></div><canvas id="vy-map" width="432" height="270"></canvas><div id="vy-menubtn">II</div><div id="vy-score"></div><div id="vy-spec"></div>
  <div id="vy-cross"></div><div id="vy-hitm"></div>
  <div id="vy-me"><b data-hp>100</b><div class="hp"><i></i></div><small data-me></small></div>
  <div id="vy-gun"><b data-ammo style="font-size:26px"></b><br><span data-gun></span><small data-nades></small><small data-coins></small></div>
  <div id="vy-tags"></div>
  <div id="vy-touch" hidden><div id="vy-pad"><i></i></div><div class="vy-tb" id="vy-scope">ZOOM</div><div class="vy-tb" id="vy-jump">JUMP</div><div class="vy-tb" id="vy-knife">KNIFE</div><div class="vy-tb" id="vy-swap">SWAP</div><div class="vy-tb" id="vy-reload">RELOAD</div><div class="vy-tb" id="vy-nade">GRENADE</div><div class="vy-tb" id="vy-fire">FIRE</div></div>
</div>
<div id="vy-rotate"><div><span class="ph">&#128241;</span>Turn your phone sideways<small>The game plays in landscape.</small></div></div>
<div id="vy-tips" hidden><div class="card"><h2>HOW TO PLAY ON A PHONE</h2><ul><li><b>Left thumb</b>: move. Push the stick all the way out to sprint.</li><li><b>Right thumb</b>: drag anywhere to look around.</li><li><b>FIRE</b>: the big red button. You can hold it and drag to aim at the same time.</li><li><b>Easy aim</b> is on: it helps line up your shots and fires when you are on target.</li><li>Tap the scoreboard at the top to see everyone. The II button pauses.</li></ul><button id="vy-tipsok">GOT IT, PLAY</button></div></div>
<div id="vy-pause" hidden><div>PAUSED<small>${'ontouchstart' in window ? 'Tap Resume to keep playing' : 'Click Resume to keep playing. Esc frees the mouse.'}</small><div class="btns"><button id="vy-resume">Resume</button><button class="leave" id="vy-leave">Leave match</button></div></div></div>
<div id="vy-menu">
  <div class="card">
   <div class="side">
    <img class="logo" src="${import.meta.env.BASE_URL}badlands.webp" alt="Vyre Bad Lands" />
    <div style="text-align:center;color:var(--lime);letter-spacing:.3em;font-size:11px;font-weight:800;margin-bottom:10px">TOKEN ARENA</div>
    <div class="sub">First-person team shooter. Two token teams, best of three rounds, bots fill the empty seats so a match is always on. Play money only: nothing here touches a wallet. Prototype.</div>
    <label>Your name</label><input id="vy-name" type="text" maxlength="12" placeholder="e.g. FROGGY" autocomplete="off" />
    <div class="pick" id="vy-pick"></div>
    <button class="go" id="vy-go">PLAY</button>
    <div class="err" id="vy-err"></div>
    <div id="vy-level"></div>
    <div class="install" id="vy-install" hidden></div>
   </div>
   <div class="main">
    <label>Match type</label>
    <div class="modes"><div class="mode on" data-mode="practice">Practice<small>Against bots, any time. Does not count on the ranked board.</small></div><div class="mode ${o.challengeLive ? '' : 'off'}" data-mode="challenge">Challenge a team<small>${o.challengeLive ? 'Waits for a player on each side. Counts.' : 'Needs the match server, which this page cannot reach.'}</small></div></div>
    <label>Game type</label>
    <select id="vy-obj"><option value="elim">Elimination: knock out the other team</option><option value="zone">Hold the Zone: own the middle, or knock them out</option></select>
    <label>Team names (a token each)</label>
    <div class="two"><input id="vy-ta" type="text" maxlength="12" value="${a}" autocomplete="off" /><input id="vy-tb" type="text" maxlength="12" value="${b}" autocomplete="off" /></div>
    <label>Your team (a token)</label>
    <div class="teams">
      <div class="team on" data-team="0" style="--c:${ca}"><span data-tc="0">${a}</span><small>tap to join</small></div>
      <div class="team" data-team="1" style="--c:${cb}"><span data-tc="1">${b}</span><small>tap to join</small></div>
    </div>
    <label>Your classes (saved loadouts)</label>
    <div class="classes" id="vy-classes"></div>
    <label>Loadout shop <span id="vy-coins" style="float:right;color:var(--lime);letter-spacing:0;font-size:14px;font-weight:800"></span></label>
    <div class="tabs" id="vy-tabs"></div>
    <div class="items" id="vy-items"></div>
    <label>Map</label>
    <div class="maps" id="vy-maps">${MAP_LIST.map(([id, name, blurb], i) => `<div class="map${i === 0 ? ' on' : ''}" data-map="${id}"><b>${name}</b><small>${blurb}</small></div>`).join('')}</div>
    <label class="easyrow" id="vy-easyrow" style="display:none;text-transform:none;letter-spacing:0;font-size:14px;color:var(--text)"><input id="vy-easy" type="checkbox" checked style="width:auto;margin-right:8px" />Easy aim (phones): helps line up shots and fires when you are on target</label>
    <label>Bot skill (practice)</label>
    <select id="vy-diff"><option value="0">Easy</option><option value="1" selected>Normal</option><option value="2">Hard</option></select>
    <label>Graphics</label>
    <select id="vy-gfx"><option value="auto">Auto (drops detail if slow)</option><option value="high">High</option><option value="mid">Medium</option><option value="low">Low (fastest)</option></select>
    <label>Seats per side (humans and bots together)</label>
    <select id="vy-seats">${SEATS.map((n) => `<option${n === DEFAULT_SEATS ? ' selected' : ''}>${n}</option>`).join('')}</select>
    <details id="vy-lb"><summary>LEADERBOARD</summary><div id="vy-lbbody"></div></details>
    <div class="note">Earn coins from kills and wins, spend them in the shop. Move: WASD or the left thumb. Look: the mouse or drag with the right thumb. Fire: click or the FIRE button. Grenade: G or the GRENADE button. Knife: F. Reload: R. Swap gun: Q. Jump: Space. Sprint: Shift (no firing while sprinting). Scoreboard: hold Tab. Esc pauses and lets you leave the match.</div>
   </div>
  </div>
</div>`;
    document.body.appendChild(root);
    for (const id of ['vy-pick', 'vy-install', 'vy-zone', 'vy-level', 'vy-classes', 'vy-obj', 'vy-jump', 'vy-knife', 'vy-swap', 'vy-hints', 'vy-scope', 'vy-tips', 'vy-tipsok', 'vy-easy', 'vy-pad', 'vy-low', 'vy-dir', 'vy-medal', 'vy-map', 'vy-diff', 'vy-menubtn', 'vy-resume', 'vy-leave', 'vy-ta', 'vy-tb', 'vy-lbbody', 'vy-lb', 'vy-score', 'vy-spec', 'vy-reload', 'vy-nade', 'vy-hud', 'vy-menu', 'vy-pause', 'vy-banner', 'vy-feed', 'vy-hitm', 'vy-hurt', 'vy-tags', 'vy-touch', 'vy-fire', 'vy-name', 'vy-seats', 'vy-gfx', 'vy-err', 'vy-items', 'vy-tabs', 'vy-coins', 'vy-go']) this.el[id] = root.querySelector('#' + id) as HTMLElement;
    this.el.hud = this.el['vy-hud'];
    root.querySelectorAll<HTMLElement>('.team').forEach((t) => t.addEventListener('click', () => {
      this.team = t.dataset.team === '1' ? 1 : 0;
      root.querySelectorAll('.team').forEach((x) => x.classList.toggle('on', x === t));
    }));
    root.querySelectorAll<HTMLElement>('.map').forEach((t) => t.addEventListener('click', () => {
      this.mapId = t.dataset.map || 'cargo';
      root.querySelectorAll('.map').forEach((x) => x.classList.toggle('on', x === t));
    }));
    try { (this.el['vy-name'] as HTMLInputElement).value = localStorage.getItem('vyre.arena.name') || ''; (this.el['vy-gfx'] as HTMLSelectElement).value = localStorage.getItem('vyre.arena.gfx') || 'auto'; } catch { /* storage may be blocked */ }
    this.el['vy-go'].addEventListener('click', () => {
      const name = (this.el['vy-name'] as HTMLInputElement).value.replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 12) || 'Player';
      try { localStorage.setItem('vyre.arena.name', name); } catch { /* ignore */ }
      this.o.onPlay({ name, team: this.team, seats: Number((this.el['vy-seats'] as HTMLSelectElement).value) || DEFAULT_SEATS, map: this.mapId, names: this.names(), mode: this.mode, difficulty: Number((this.el['vy-diff'] as HTMLSelectElement).value) || 0, objective: (this.el['vy-obj'] as HTMLSelectElement).value === 'zone' ? 'zone' : 'elim', gfx: (this.el['vy-gfx'] as HTMLSelectElement).value });
    });
    this.el['vy-pause'].addEventListener('click', (e) => { if ((e.target as HTMLElement).id !== 'vy-leave') this.o.onResume(); });
    this.el['vy-leave'].addEventListener('click', (e) => { e.stopPropagation(); this.o.onLeave(); });
    root.querySelectorAll<HTMLElement>('.mode').forEach((t) => t.addEventListener('click', () => {
      if (t.classList.contains('off')) { this.el['vy-err'].textContent = 'The match server is not reachable from this page. Practice now.'; return; }
      this.mode = t.dataset.mode === 'challenge' ? 'challenge' : 'practice';
      root.querySelectorAll('.mode').forEach((x) => x.classList.toggle('on', x === t));
    }));
    for (const k of ['vy-ta', 'vy-tb']) this.el[k].addEventListener('input', () => { const n = this.names(); this.setTeams(n, true); });
    this.el['vy-lb'].addEventListener('toggle', () => this.renderBoard());
    this.el['vy-tipsok'].addEventListener('click', () => { this.el['vy-tips'].hidden = true; try { if (this.touch) localStorage.setItem('vyre.arena.tips', '1'); } catch { /* ignore */ } this.o.onResume(); });
    this.renderShop();
    const main = root.querySelector('.main') as HTMLElement;
    for (const ev of ['click', 'input', 'change']) main.addEventListener(ev, () => this.updatePick());
    this.updatePick(); this.installHint();
    if (this.touch) this.wireTouch();
  }

  /** the one line under the name: what PLAY will start */
  updatePick(): void {
    const n = this.names(), obj = (this.el['vy-obj'] as HTMLSelectElement).value === 'zone' ? 'Hold the Zone' : 'Elimination';
    const m = MAP_LIST.find(([id]) => id === this.mapId)?.[1] ?? '';
    this.el['vy-pick'].innerHTML = `<b>${this.mode === 'challenge' ? 'Challenge' : 'Practice'}</b> &middot; ${obj} &middot; ${m}<br>you join <b style="color:${this.o.teamColors[this.team]}">${n[this.team]}</b>`;
  }
  /** on a phone, how to get the game full screen: iPhones only get it from the home screen, Android can install it */
  private installHint(): void {
    const box = this.el['vy-install'];
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || nav.standalone === true;
    if (!this.touch || standalone) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) { box.hidden = false; box.innerHTML = 'For full screen: tap <b>Share</b>, then <b>Add to Home Screen</b>, and open the game from the new icon.'; return; }
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      const ev = e as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
      box.hidden = false; box.innerHTML = 'Install the game to play full screen<br><button id="vy-inst">Install</button>';
      box.querySelector('#vy-inst')!.addEventListener('click', async () => { try { await ev.prompt(); await ev.userChoice; } catch { /* dismissed */ } box.hidden = true; });
    });
  }

  /** the two team names as typed, cleaned the way the server cleans them, with the defaults when empty */
  names(): [string, string] {
    const clean = (v: string, d: string) => { const s = String(v ?? '').replace(/[^A-Za-z0-9$ ]/g, '').replace(/ +/g, ' ').trim().slice(0, 12); return s || d; };
    return [clean((this.el['vy-ta'] as HTMLInputElement).value, this.o.teamNames[0]), clean((this.el['vy-tb'] as HTMLInputElement).value, this.o.teamNames[1])];
  }
  /** show the team names in the score bar and the team cards (typing: leave the input alone) */
  setTeams(n: [string, string], typing = false): void {
    for (const t of [0, 1]) { document.querySelectorAll<HTMLElement>(`[data-tn="${t}"],[data-tc="${t}"]`).forEach((e) => { e.textContent = n[t]; }); }
    if (!typing) { (this.el['vy-ta'] as HTMLInputElement).value = n[0]; (this.el['vy-tb'] as HTMLInputElement).value = n[1]; }
  }
  /** the leaderboard of this device: practice results, and the ranked board that fills when challenges are live */
  renderBoard(): void {
    if (!(this.el['vy-lb'] as HTMLDetailsElement).open) return;
    const d = this.o.leaders();
    const teams = Object.entries(d.teams).sort((a, b) => b[1].w - a[1].w || a[1].l - b[1].l).slice(0, 8);
    const players = Object.entries(d.players).sort((a, b) => b[1].kills - a[1].kills).slice(0, 8);
    const rows = (r: string[][]) => r.map((c) => `<tr>${c.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">nothing yet: play a match</td></tr>';
    this.el['vy-lbbody'].innerHTML = `<table class="lb"><tr><th>Team (practice wins, this device)</th><th>W</th><th>L</th></tr>${rows(teams.map(([n, v]) => [n, String(v.w), String(v.l)]))}</table>
      <table class="lb"><tr><th>Player (this device)</th><th>Kills</th><th>Deaths</th><th>Wins</th></tr>${rows(players.map(([n, v]) => [n, String(v.kills), String(v.deaths), String(v.wins)]))}</table>
      <div class="note">Practice results stay on this device. The ranked board across all teams opens with challenge matches once the match server is hosted.</div>`;
  }
  /** the in-match table (hold Tab, and at the end of a match) */
  scoreboard(on: boolean, rows: BoardRow[], names: [string, string], score: number[], footer = ''): void {
    const el = this.el['vy-score']; el.classList.toggle('on', on); if (!on) return;
    const col = (t: number) => {
      const r = rows.filter((x) => x.team === t).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      return `<div><h3 style="color:${this.o.teamColors[t]}">${names[t]} &nbsp; ${score[t]}</h3><table><tr><th>Player</th><th>K</th><th>D</th></tr>${r.map((x) => `<tr class="${x.me ? 'me' : ''}${x.alive ? '' : ' dead'}"><td>${x.name}${x.bot ? ' <small style="opacity:.5">bot</small>' : ''}</td><td>${x.kills}</td><td>${x.deaths}</td></tr>`).join('')}</table></div>`;
    };
    el.innerHTML = `<div class="cols">${col(0)}${col(1)}</div>${footer ? `<div class="foot">${footer}</div>` : ''}`;
  }
  get mapCanvas(): HTMLCanvasElement { return this.el['vy-map'] as HTMLCanvasElement; }
  /** a red wedge pointing at who hit you: `rel` is the angle from where you look (0 ahead, positive to the right) */
  hitDir(rel: number): void {
    const i = document.createElement('i'); i.style.transform = `rotate(${rel}rad)`; this.el['vy-dir'].appendChild(i);
    window.setTimeout(() => i.remove(), 900);
  }
  medal(text: string, color = '#ffd24a'): void {
    const m = this.el['vy-medal']; m.textContent = text; m.style.color = color; m.classList.remove('on'); void m.offsetWidth; m.classList.add('on');
  }
  lowHealth(frac: number): void { this.el['vy-low'].style.opacity = frac < 0.35 ? String(Math.min(1, (0.35 - frac) / 0.25)) : '0'; }
  /** the tug-of-war bar for Hold the Zone: each team's bar grows out from the middle */
  setZone(on: boolean, p0: number, p1: number, in0: number, in1: number, colors: readonly string[]): void {
    const z = this.el['vy-zone']; z.hidden = !on; if (!on) return;
    const l = z.querySelector('.l') as HTMLElement, r = z.querySelector('.r') as HTMLElement, tx = z.querySelector('span') as HTMLElement;
    l.style.width = `${p0 * 50}%`; l.style.background = colors[0]; r.style.width = `${p1 * 50}%`; r.style.background = colors[1];
    tx.textContent = in0 && in1 ? 'ZONE CONTESTED' : in0 || in1 ? 'ZONE BEING HELD' : 'HOLD THE ZONE';
  }
  /** the line at the bottom while spectating, null hides it */
  spec(text: string | null, sub = ''): void { const e = this.el['vy-spec']; e.classList.toggle('on', !!text); if (text) e.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`; }

  // ---- menu and shop ----
  renderShop(): void {
    const p = this.o.profile, L = level(p);
    this.el['vy-coins'].textContent = `${p.coins} coins`;
    // level and experience
    const into = p.xp - xpForLevel(L), span = L >= MAX_LEVEL ? 1 : xpForLevel(L + 1) - xpForLevel(L);
    this.el['vy-level'].innerHTML = `<div class="lv"><b>LEVEL ${L}</b><span>${L >= MAX_LEVEL ? 'max' : `${into} / ${span} XP`}</span></div><div class="xpbar"><i style="width:${Math.round(levelProgress(p) * 100)}%"></i></div>`;
    // the five saved classes
    this.el['vy-classes'].innerHTML = p.classes.map((c, i) => `<div class="cls${i === p.activeClass ? ' on' : ''}" data-cls="${i}">${c.name}</div>`).join('') +
      `<button class="clsb" data-clsdo="save">Save gear to ${p.classes[p.activeClass].name}</button><button class="clsb alt" data-clsdo="rename">Rename</button>`;
    this.el['vy-classes'].querySelectorAll<HTMLElement>('.cls').forEach((c) => c.addEventListener('click', () => { classSelect(p, Number(c.dataset.cls)); this.o.save(); this.o.onShop?.('class-select', Number(c.dataset.cls)); this.el['vy-err'].textContent = ''; this.renderShop(); }));
    this.el['vy-classes'].querySelector<HTMLElement>('[data-clsdo="save"]')!.addEventListener('click', () => { classSave(p, p.activeClass); this.o.save(); this.o.onShop?.('class-save', p.activeClass); this.el['vy-err'].textContent = `Saved to ${p.classes[p.activeClass].name}`; });
    this.el['vy-classes'].querySelector<HTMLElement>('[data-clsdo="rename"]')!.addEventListener('click', () => { const n = window.prompt('Name this class', p.classes[p.activeClass].name); if (n !== null) { const r = classRename(p, p.activeClass, n); this.el['vy-err'].textContent = r.error || ''; this.o.save(); if (!r.error) this.o.onShop?.('class-rename', p.activeClass, n); this.renderShop(); } });
    this.el['vy-tabs'].innerHTML = (SLOTS as string[]).map((s) => `<div class="tab${s === this.tab ? ' on' : ''}" data-tab="${s}">${TAB_NAMES[s]}</div>`).join('');
    this.el['vy-tabs'].querySelectorAll<HTMLElement>('.tab').forEach((t) => t.addEventListener('click', () => { this.tab = t.dataset.tab || 'weapon'; this.renderShop(); }));
    const rows = Object.entries(items).filter(([, it]) => it.slot === this.tab).sort((a, b) => a[1].cost - b[1].cost);
    this.el['vy-items'].innerHTML = rows.map(([id, it]) => {
      const owned = p.owned.includes(id), on = p.loadout[it.slot] === id, lock = lockedReason(p, id);
      const btn = on ? '<button class="eq" disabled>Equipped</button>' : lock && !owned ? `<button disabled title="${lock}">${lock.replace('Reach level ', 'Lv ').replace(/^Master.*/, 'Earn it').replace(/^Reach level 20.*/, 'Lv 20')}</button>` : owned ? `<button class="eq" data-do="equip" data-id="${id}">Equip</button>` : `<button data-do="buy" data-id="${id}"${p.coins < it.cost ? ' disabled' : ''}>${it.cost ? `${it.cost} coins` : 'Take it'}</button>`;
      const kills = p.weaponKills[id] ?? 0, stars = it.slot === 'weapon' ? masteryOf(kills) : 0;
      const sub = it.slot === 'weapon' ? `${it.blurb} &middot; <span class="stars">${'&#9733;'.repeat(stars)}${'&#9734;'.repeat(3 - stars)}</span> ${kills} kills` : lock && !owned ? `${it.blurb} &middot; <i>${lock}</i>` : it.blurb;
      return `<div class="it${lock && !owned ? ' lock' : ''}"><div><b>${it.name}</b><small>${sub}</small></div>${btn}</div>`;
    }).join('');
    this.el['vy-items'].querySelectorAll<HTMLElement>('button[data-do]').forEach((b) => b.addEventListener('click', () => {
      const r = b.dataset.do === 'buy' ? buy(p, b.dataset.id || '') : equip(p, b.dataset.id || '');
      this.el['vy-err'].textContent = r.error || '';
      if (!r.error) { this.o.save(); this.o.onShop?.(b.dataset.do || '', b.dataset.id || ''); }
      this.renderShop();
    }));
  }
  showMenu(on: boolean): void { this.el['vy-menu'].hidden = !on; this.el.hud.hidden = on; if (on) { this.renderShop(); this.renderBoard(); this.spec(null); this.scoreboard(false, [], this.names(), [0, 0]); this.showPause(false); } }
  /** the key list at the bottom left on a computer: shown for a while at the start, H toggles it */
  hints(show: boolean): void { if (!this.touch) this.el['vy-hints'].classList.toggle('on', show); }
  /** the phone how-to card, the first time only; returns true when it was shown (the match waits behind it) */
  showTips(): boolean {
    if (!this.touch) {
      let seen = false; try { seen = localStorage.getItem('vyre.arena.tips.desk') === '1'; } catch { /* ignore */ }
      if (seen) return false;
      this.el['vy-tips'].querySelector('h2')!.textContent = 'HOW TO PLAY';
      this.el['vy-tips'].querySelector('ul')!.innerHTML = '<li><b>WASD</b> move, <b>mouse</b> aim, <b>click</b> fire, <b>right click</b> zoom in.</li><li><b>G</b> throws a grenade, <b>F</b> is the knife for close range (from behind it kills), <b>R</b> reloads, <b>Q</b> swaps to your pistol and back.</li><li><b>Space</b> jumps (you can hop over low cover), <b>Shift</b> sprints (you cannot shoot while sprinting).</li><li><b>Tab</b> shows the scoreboard, <b>Esc</b> pauses, <b>H</b> hides the key list.</li><li>In <b>Hold the Zone</b>, stand in the glowing circle with no enemy in it to fill your bar.</li>';
      try { localStorage.setItem('vyre.arena.tips.desk', '1'); } catch { /* ignore */ }
      this.el['vy-tips'].hidden = false; return true;
    }
    if (!this.tipsPending) return false; this.tipsPending = false; this.el['vy-tips'].hidden = false; return true;
  }
  /** a line under the menu's buttons */
  error(msg: string): void { this.el['vy-err'].textContent = msg; }
  showPause(on: boolean): void { this.el['vy-pause'].hidden = !on; }
  menuOpen(): boolean { return !this.el['vy-menu'].hidden; }

  // ---- in-match readouts ----
  private q<T extends HTMLElement = HTMLElement>(s: string): T { return this.el.hud.querySelector(s) as T; }
  setScore(score: number[], round: number, time: number, alive: number[], phase: string): void {
    this.q('[data-n="0"]').textContent = String(score[0]); this.q('[data-n="1"]').textContent = String(score[1]);
    for (const t of [0, 1]) this.q(`[data-pips="${t}"]`).innerHTML = [0, 1].map((i) => `<i class="${score[t] > i ? 'on' : ''}"></i>`).join('');
    this.q('[data-round]').textContent = `ROUND ${Math.max(1, round)}`;
    this.q('[data-time]').textContent = phase === 'live' || phase === 'countdown' ? String(time) : '-';
    this.q('[data-alive]').textContent = `${alive[0]} vs ${alive[1]} alive`;
  }
  setMe(hp: number, hpMax: number, text: string, gun: string, coins: number, nades = 0, ammo = 0, mag = 0, reloading = false): void {
    this.q('[data-hp]').textContent = String(Math.max(0, Math.ceil(hp)));
    (this.q('#vy-me .hp i')).style.width = `${Math.max(0, Math.min(100, (hp / hpMax) * 100))}%`;
    this.q('[data-me]').textContent = text; this.q('[data-gun]').textContent = (items[gun]?.name ?? gun); this.el['vy-scope'].style.display = this.touch && gun === 'sniper' ? 'grid' : 'none'; this.q('[data-coins]').textContent = `${coins} coins`; this.q('[data-nades]').textContent = `G  grenades ${nades}`; this.q('[data-ammo]').textContent = reloading ? 'RELOADING' : `${ammo} / ${mag}`; this.q('[data-ammo]').style.color = !reloading && ammo <= Math.max(2, mag * 0.2) ? '#ff6a50' : '';
  }
  banner(title: string, sub = '', ms = 2200): void {
    const b = this.el['vy-banner']; b.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`; b.classList.add('on');
    clearTimeout(this.bannerTimer); if (ms > 0) this.bannerTimer = window.setTimeout(() => b.classList.remove('on'), ms);
  }
  hideBanner(): void { this.el['vy-banner'].classList.remove('on'); }
  feed(html: string): void {
    const f = this.el['vy-feed'], s = document.createElement('span'); s.innerHTML = html; f.appendChild(s);
    while (f.children.length > 5) f.firstChild?.remove();
    window.setTimeout(() => s.remove(), 5000);
  }
  flash(id: 'vy-hitm' | 'vy-hurt'): void {
    const e = this.el[id]; e.classList.add('on'); window.setTimeout(() => e.classList.remove('on'), 90);
  }
  /** name tags over team-mates: x/y are screen pixels, null hides the tag */
  tag(id: string, text: string, color: string, hpFrac: number, x: number, y: number, show: boolean): void {
    let t = this.tags.get(id);
    if (!show) { if (t) t.style.display = 'none'; return; }
    if (!t) { t = document.createElement('div'); t.className = 'vy-tag'; this.el['vy-tags'].appendChild(t); this.tags.set(id, t); }
    t.style.display = 'block'; t.style.color = color; t.style.left = `${x}px`; t.style.top = `${y}px`;
    t.innerHTML = `${text}<i style="width:${Math.round(34 * Math.max(0, Math.min(1, hpFrac)))}px"></i>`;
  }
  dropTag(id: string): void { this.tags.get(id)?.remove(); this.tags.delete(id); }

  // ---- touch: a floating move stick on the left, look by dragging the right, a fire button ----
  private wireTouch(): void {
    document.body.classList.add('touch');
    this.el['vy-touch'].hidden = false;
    this.el['vy-easyrow'] = document.getElementById('vy-easyrow') as HTMLElement; this.el['vy-easyrow'].style.display = 'block';
    try { this.easy = localStorage.getItem('vyre.arena.easy') !== '0'; } catch { /* storage may be blocked */ }
    const easyBox = this.el['vy-easy'] as HTMLInputElement; easyBox.checked = this.easy;
    easyBox.addEventListener('change', () => { this.easy = easyBox.checked; try { localStorage.setItem('vyre.arena.easy', this.easy ? '1' : '0'); } catch { /* ignore */ } });
    // the how-to card, once
    let seen = false; try { seen = localStorage.getItem('vyre.arena.tips') === '1'; } catch { /* ignore */ }
    this.tipsPending = !seen;
    const mb = this.el['vy-menubtn']; mb.style.display = 'grid'; mb.addEventListener('click', () => this.o.onPause());
    (this.el.hud.querySelector('.bar') as HTMLElement).style.pointerEvents = 'auto'; (this.el.hud.querySelector('.bar') as HTMLElement).addEventListener('click', () => this.o.onScore());
    const pad = this.el['vy-pad'], knob = pad.firstElementChild as HTMLElement, R = 62;
    let mv: { id: number; x0: number; y0: number } | null = null, lk: { id: number; x: number; y: number } | null = null, fp: { id: number; x: number; y: number } | null = null;
    const root = document.body;
    const SKIP = '#vy-fire,#vy-nade,#vy-reload,#vy-scope,#vy-jump,#vy-knife,#vy-swap,#vy-menubtn,#vy-menu,#vy-pause,#vy-tips,.bar';
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.el.hud.hidden || (e.target as HTMLElement).closest(SKIP)) return;
      if (e.clientX < innerWidth * 0.42 && !mv) { mv = { id: e.pointerId, x0: e.clientX, y0: e.clientY }; pad.classList.add('moved', 'live'); pad.style.left = `${e.clientX}px`; pad.style.top = `${e.clientY}px`; pad.style.bottom = 'auto'; }
      else if (e.clientX >= innerWidth * 0.42 && !lk) lk = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    root.addEventListener('pointermove', (e) => {
      if (mv && e.pointerId === mv.id) {
        const dx = e.clientX - mv.x0, dy = e.clientY - mv.y0, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / R);
        this.move.x = (dx / d) * k; this.move.y = (dy / d) * k; knob.style.transform = `translate(${(dx / d) * Math.min(d, R)}px, ${(dy / d) * Math.min(d, R)}px)`;
        this.sprintTouch = d > R * 1.25 && dy < 0; pad.classList.toggle('sprint', this.sprintTouch);
      } else if (lk && e.pointerId === lk.id) { this.lookDelta.x += e.clientX - lk.x; this.lookDelta.y += e.clientY - lk.y; lk.x = e.clientX; lk.y = e.clientY; }
      else if (fp && e.pointerId === fp.id) { this.lookDelta.x += e.clientX - fp.x; this.lookDelta.y += e.clientY - fp.y; fp.x = e.clientX; fp.y = e.clientY; }
    });
    const end = (e: PointerEvent) => {
      if (mv && e.pointerId === mv.id) { mv = null; this.move.x = 0; this.move.y = 0; this.sprintTouch = false; pad.classList.remove('moved', 'live', 'sprint'); pad.style.left = ''; pad.style.top = ''; pad.style.bottom = ''; knob.style.transform = ''; }
      if (lk && e.pointerId === lk.id) lk = null;
      if (fp && e.pointerId === fp.id) { fp = null; this.fireTouch = false; this.el['vy-fire'].classList.remove('on'); }
    };
    root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
    // the fire button also turns the view: hold it and drag to aim and shoot with one thumb
    const fire = this.el['vy-fire'];
    fire.addEventListener('pointerdown', (e) => { e.preventDefault(); this.fireTouch = true; fire.classList.add('on'); fp = { id: e.pointerId, x: e.clientX, y: e.clientY }; fire.setPointerCapture(e.pointerId); });
    const hold = (id: string, set: (v: boolean) => void) => {
      const b = this.el[id];
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); b.classList.add('on'); b.setPointerCapture(e.pointerId); });
      const off = () => { set(false); b.classList.remove('on'); }; b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
    };
    hold('vy-nade', (v) => { this.nadeTouch = v; }); hold('vy-reload', (v) => { this.reloadTouch = v; }); hold('vy-scope', (v) => { this.zoomTouch = v; }); hold('vy-jump', (v) => { this.jumpTouch = v; }); hold('vy-knife', (v) => { this.knifeTouch = v; }); hold('vy-swap', (v) => { this.swapTouch = v; });
  }
}
