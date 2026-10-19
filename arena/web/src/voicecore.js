// The small pure parts of the voice code, kept apart so they can be tested without a browser.
/** true when a block of 8-bit samples (128 is silence) is loud enough to be somebody talking */
export function isLoud(buf, threshold = 0.02) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
  return Math.sqrt(sum / Math.max(1, buf.length)) > threshold;
}

/** keep Opus small: voice at 24 kbit/s, forward error correction on, silence not sent */
export function tuneOpus(sdp) {
  return String(sdp).replace(/a=fmtp:(\d+) ([^\r\n]*minptime=[^\r\n]*)/g, (m, pt, rest) => {
    const kv = new Map(rest.split(';').map((s) => s.trim()).filter(Boolean).map((s) => { const i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
    for (const [k, v] of [['maxaveragebitrate', '24000'], ['usedtx', '1'], ['useinbandfec', '1'], ['stereo', '0']]) kv.set(k, v);
    return `a=fmtp:${pt} ${[...kv].map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join(';')}`;
  });
}
