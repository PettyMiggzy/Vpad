// One full match of players, each sending input, while the server broadcasts snapshots.
// LOAD_N is how many clients join (64 if unset). LOAD_SIDE is seats on a team.
// Prints the snapshot rate, the JSON payload per second, and the server process CPU.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@colyseus/sdk';

const PORT = 25991;
const N = Number(process.env.LOAD_N) || 64;
const SECONDS = 5;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-load-'));
const clk = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());

function cpuTicks(pid) {
  const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const rest = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
  return Number(rest[11]) + Number(rest[12]);
}

const child = spawn(process.execPath, ['index.js'], {
  cwd: import.meta.dirname,
  env: { ...process.env, PORT: String(PORT), ARENA_DATA: data },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (b) => { log += b; });
child.stderr.on('data', (b) => { log += b; });

const pidOf = (i) => `b${i.toString(16).padStart(31, '0')}`;
const perSide = Math.min(32, Math.max(1, Number(process.env.LOAD_SIDE) || Math.ceil(N / 2)));
const opts = (i) => ({
  names: ['LOAD', 'TEST'], a: 'LOAD', b: 'TEST', map: 'cargo', perSide,
  mode: 'practice', difficulty: 1, objective: 'elim',
  name: `P${i}`, team: i < perSide ? 0 : 1, pid: pidOf(i),
});

const rooms = [];
try {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start\n' + log.slice(-1500))), 15000);
    const i = setInterval(() => {
      if (log.includes('arena server on')) { clearInterval(i); clearTimeout(t); resolve(); }
    }, 30);
  });

  for (let i = 0; i < N; i++) {
    const client = new Client(`ws://127.0.0.1:${PORT}`);
    const room = await client.joinOrCreate('match', opts(i));
    room.onMessage('hello', () => {});
    room.onMessage('roster', () => {});
    room.onMessage('probe', (n) => { if (typeof n === 'number') room.send('probe', n); });
    rooms.push(room);
  }

  let bytes = 0;
  let snaps = 0;
  const counts = new Array(N).fill(0);
  rooms.forEach((room, i) => {
    room.onMessage('snap', (s) => {
      counts[i] += 1;
      snaps += 1;
      bytes += Buffer.byteLength(JSON.stringify(s));
    });
  });

  const input = setInterval(() => {
    for (let i = 0; i < rooms.length; i++) {
      const dir = i < 32 ? 1 : -1;
      rooms[i].send('input', {
        dx: dir, dy: 0, aim: dir > 0 ? 0 : Math.PI, pitch: 0,
        fire: true, nade: false, reload: false, sprint: i % 3 === 0, jump: false, melee: false, swap: false,
      });
    }
  }, 50);

  await new Promise((r) => setTimeout(r, 300));
  bytes = 0; snaps = 0; counts.fill(0);
  const t0 = process.hrtime.bigint();
  const c0 = cpuTicks(child.pid);
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  const elapsed = Number(process.hrtime.bigint() - t0) / 1e9;
  const cpu = (cpuTicks(child.pid) - c0) / clk / elapsed * 100;
  clearInterval(input);

  const perClient = counts.map((n) => n / elapsed);
  const listing = await fetch(`http://127.0.0.1:${PORT}/rooms`).then((r) => r.json());
  const summary = {
    clients: N,
    seconds: +elapsed.toFixed(2),
    snaps: snaps,
    snapsPerClientPerSec: +(snaps / N / elapsed).toFixed(2),
    slowestClientPerSec: +Math.min(...perClient).toFixed(2),
    fastestClientPerSec: +Math.max(...perClient).toFixed(2),
    bytes: bytes,
    bytesPerSec: Math.round(bytes / elapsed),
    avgSnapBytes: snaps ? Math.round(bytes / snaps) : 0,
    serverCpuPercent: +cpu.toFixed(1),
    rooms: listing,
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await Promise.all(rooms.map((room) => room.leave().catch(() => {})));
  child.kill('SIGTERM');
  await new Promise((r) => { child.on('exit', r); setTimeout(r, 2000); });
}
