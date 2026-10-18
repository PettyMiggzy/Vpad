// How many matches one match server can run before play suffers.
//   node capacity.js                      tries 4, 8, 16, 24, 32, 48 matches (CAP_ROOMS=a,b,c to choose)
// Each match is a practice game of PER_SIDE a side (default 6: one human and computer players for the rest) on the three big maps in turn,
// and every human runs and fires. The players run in separate processes so the test itself is not the slow part. Per count it prints the
// snapshot rate of the slowest player (20 is perfect), the server's CPU as a share of one core, and the server's own clock delay
// (loopP99Ms: how late its 30-steps-a-second timer runs; over about 15 ms play starts to stutter). "ok" means the slowest player is within
// 1.5 snapshots a second of a lone match and the clock's 99th percentile is under 15 ms.
import { spawn, fork, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const maps = ['cargo', 'dust', 'refinery'];
const PER_SIDE = Number(process.env.PER_SIDE) || 6;
const SECONDS = 8;
const PER_WORKER = 6;

if (process.argv[2] === '--worker') {
  const { Client } = await import('@colyseus/sdk');
  const [port, first, n] = process.argv.slice(3).map(Number);
  const rooms = [];
  for (let k = 0; k < n; k++) {
    const i = first + k;
    const room = await new Client(`ws://127.0.0.1:${port}`).joinOrCreate('match', { names: ['BLUE', 'RED'], map: maps[i % 3], perSide: PER_SIDE, mode: 'practice', difficulty: 1, objective: i % 2 ? 'zone' : 'elim', name: `P${i}`, team: 0, pid: `c${i.toString(16).padStart(31, '0')}`, solo: `s${i}` });
    room.onMessage('hello', () => {}); room.onMessage('roster', () => {}); room.onMessage('probe', (m) => room.send('probe', m));
    rooms.push(room);
  }
  const counts = new Array(n).fill(0);
  rooms.forEach((room, k) => room.onMessage('snap', () => { counts[k]++; }));
  const input = setInterval(() => rooms.forEach((room, k) => room.send('input', { dx: 1, dy: (first + k) % 2 ? 1 : -1, aim: (Date.now() / 700 + k) % 6.28, pitch: 0, fire: true, nade: false, reload: false, sprint: false, jump: false, melee: false, swap: false })), 50);
  process.send({ ready: true });
  process.on('message', (m) => {
    if (m === 'reset') counts.fill(0);
    if (m === 'report') { process.send({ counts }); }
    if (m === 'stop') { clearInterval(input); Promise.all(rooms.map((r) => r.leave().catch(() => {}))).then(() => process.exit(0)); }
  });
} else {
  const counts = (process.env.CAP_ROOMS || '4,8,16,24,32,48').split(',').map(Number);
  const clk = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
  const cpuTicks = (pid) => { const r = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const x = r.slice(r.lastIndexOf(')') + 2).split(' '); return Number(x[11]) + Number(x[12]); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function trial(R, port) {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-cap-'));
    const child = spawn(process.execPath, ['index.js'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(port), ARENA_DATA: data, MAX_ROOMS: '500' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; child.stdout.on('data', (b) => { log += b; }); child.stderr.on('data', (b) => { log += b; });
    const workers = [];
    try {
      for (let t = 0; t < 150 && !log.includes('arena server on'); t++) await wait(100);
      for (let first = 0; first < R; first += PER_WORKER) {
        const w = fork(import.meta.filename, ['--worker', port, first, Math.min(PER_WORKER, R - first)], { silent: true });
        await new Promise((res, rej) => { w.once('message', res); w.once('exit', () => rej(new Error('worker died'))); });
        workers.push(w);
      }
      await wait(2500);
      await fetch(`http://127.0.0.1:${port}/stats`);
      workers.forEach((w) => w.send('reset'));
      const t0 = process.hrtime.bigint(), c0 = cpuTicks(child.pid);
      await wait(SECONDS * 1000);
      const el = Number(process.hrtime.bigint() - t0) / 1e9, cpu = (cpuTicks(child.pid) - c0) / clk / el * 100;
      const stats = await fetch(`http://127.0.0.1:${port}/stats`).then((r) => r.json());
      const all = [];
      for (const w of workers) all.push(...await new Promise((res) => { w.once('message', (m) => res(m.counts)); w.send('report'); }));
      const per = all.map((n) => n / el);
      return { rooms: R, players: stats.players, bots: stats.bots, slowestSnapsPerSec: +Math.min(...per).toFixed(1), avgSnapsPerSec: +(per.reduce((a, b) => a + b, 0) / R).toFixed(1), serverCpuPercentOfOneCore: Math.round(cpu), loopMeanMs: stats.loopMeanMs, loopP99Ms: stats.loopP99Ms, loopMaxMs: stats.loopMaxMs, serverMemoryMB: stats.memoryMB };
    } finally {
      workers.forEach((w) => w.send('stop'));
      await wait(500); workers.forEach((w) => w.kill());
      child.kill('SIGTERM'); await new Promise((r) => { child.on('exit', r); setTimeout(r, 2000); });
    }
  }

  let port = 26100;
  const base = await trial(1, port++);
  console.log(JSON.stringify({ ...base, ok: true, note: 'baseline: one match' }));
  for (const R of counts) {
    const r = await trial(R, port++);
    console.log(JSON.stringify({ ...r, ok: r.slowestSnapsPerSec >= base.slowestSnapsPerSec - 1.5 && r.loopP99Ms < 15 }));
  }
}
