// Sound made on the spot (no files): a noise burst per shot, a tick for a hit, a low thud when you are hit. Started by the first tap.
let ac: AudioContext | null = null;
let noise: AudioBuffer | null = null;

export function unlock(): void {
  try {
    if (!ac) {
      ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') void ac.resume();
  } catch { ac = null; }
}

function burst(freq: number, len: number, vol: number, kind: 'noise' | 'tone' = 'noise', slide = 0): void {
  if (!ac || vol <= 0.001) return;
  const t = ac.currentTime, g = ac.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  g.connect(ac.destination);
  if (kind === 'noise' && noise) {
    const s = ac.createBufferSource(); s.buffer = noise;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.25), t + len);
    s.connect(f); f.connect(g); s.start(t); s.stop(t + len);
  } else {
    const o = ac.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + len);
    o.connect(g); o.start(t); o.stop(t + len);
  }
}

const PITCH: Record<string, number> = { pistol: 2600, smg: 3200, rifle: 2200, shotgun: 1500, sniper: 1100 };
/** `dist` in metres: far shots are quieter */
export function shot(weapon: string, dist: number): void { burst(PITCH[weapon] ?? 2400, weapon === 'sniper' ? 0.35 : 0.14, 0.5 / (1 + dist / 5)); }
export function hitMarker(): void { burst(1500, 0.06, 0.25, 'tone', -500); }
export function hurt(): void { burst(260, 0.18, 0.5, 'tone', -150); }
export function kill(): void { burst(900, 0.16, 0.3, 'tone', 600); }
export function chime(): void { burst(520, 0.25, 0.2, 'tone', 260); }
