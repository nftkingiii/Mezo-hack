// beats.mjs: measure a music track's beat grid with only Node + ffmpeg (no librosa needed).
//   node beats.mjs audio/track.mp3 > beats.json      [--min=80 --max=170]  (BPM search range)
//   node beats.mjs audio/track.mp3 --bpm=120 > beats.json                  (known tempo: only find the phase)
// Output: { bpm, offset, beats[], downbeats[], bars[{t, energy}], drop, hits[] }
//   beats     → UI state changes land here         downbeats → cuts and big moments
//   hits      → measured transients (place SFX so their PEAK lands on these)
//   drop      → the bar with the biggest energy jump (put the reveal there)
// It is an estimate: always sanity-check by rendering a clip with --audio and watching the cuts.
import { spawn } from 'node:child_process';

const A = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const file = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!file) { console.error('usage: node beats.mjs <audio> [--bpm=120] [--min=80 --max=170]'); process.exit(1); }

const SR = 22050, HOP = 256;
const pcm = await new Promise((ok, bad) => {
  const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-']);
  const chunks = []; p.stdout.on('data', c => chunks.push(c)); p.on('close', c => c ? bad(new Error('ffmpeg failed')) : ok(Buffer.concat(chunks)));
});
const x = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
const dur = x.length / SR, fr = SR / HOP;

// Onset envelope: positive change in log energy, in a low band (kick) and a full band, summed
const nF = Math.floor(x.length / HOP), low = new Float32Array(nF), full = new Float32Array(nF);
let lp = 0; const a = 1 - Math.exp(-2 * Math.PI * 150 / SR);            // one-pole low-pass ~150 Hz
for (let f = 0; f < nF; f++) {
  let el = 0, ef = 0;
  for (let i = f * HOP; i < (f + 1) * HOP; i++) { lp += a * (x[i] - lp); el += lp * lp; ef += x[i] * x[i]; }
  low[f] = Math.log(1e-9 + el); full[f] = Math.log(1e-9 + ef);
}
const env = new Float32Array(nF);
for (let f = 1; f < nF; f++) env[f] = Math.max(0, low[f] - low[f - 1]) * 1.5 + Math.max(0, full[f] - full[f - 1]);
const mean = env.reduce((s, v) => s + v, 0) / nF;
for (let f = 0; f < nF; f++) env[f] = Math.max(0, env[f] - mean);

// Tempo: autocorrelation of the envelope, lightly weighted toward 120 BPM
let bpm = +A.bpm || 0;
if (!bpm) {
  const lo = +(A.min || 80), hi = +(A.max || 170); let best = -1;
  for (let b = lo; b <= hi; b += 0.25) {
    const lag = fr * 60 / b; let s = 0;
    for (let f = 0; f + 2 * lag < nF; f++) s += env[f] * (env[Math.round(f + lag)] + .5 * env[Math.round(f + 2 * lag)]);
    s *= Math.exp(-Math.pow(Math.log2(b / 120), 2) / (2 * .6 * .6));
    if (s > best) { best = s; bpm = b; }
  }
}
const period = 60 / bpm;

// Phase: the offset whose grid collects the most onset energy
const sampleAt = t => { const f = Math.round(t * fr); return f >= 0 && f < nF ? Math.max(env[f], env[f - 1] || 0, env[f + 1] || 0) : 0; };
let phase = 0, bestP = -1;
for (let p = 0; p < period; p += 1 / fr) {
  let s = 0; for (let t = p; t < dur; t += period) s += sampleAt(t);
  if (s > bestP) { bestP = s; phase = p; }
}
const beats = []; for (let t = phase; t < dur; t += period) beats.push(+t.toFixed(3));

// Downbeat: which of the 4 beat positions is loudest in the low band
let bar0 = 0, bestB = -1;
for (let k = 0; k < 4; k++) { let s = 0; for (let i = k; i < beats.length; i += 4) s += sampleAt(beats[i]) + Math.max(0, low[Math.round(beats[i] * fr)] || 0) * .01; if (s > bestB) { bestB = s; bar0 = k; } }
const downbeats = beats.filter((_, i) => i >= bar0 && (i - bar0) % 4 === 0);

// Bar energy and the drop
const rms = (t0, t1) => { let s = 0, n = 0; for (let i = Math.floor(t0 * SR); i < Math.min(x.length, t1 * SR); i++) { s += x[i] * x[i]; n++; } return n ? Math.sqrt(s / n) : 0; };
const bars = downbeats.map(t => ({ t, energy: +rms(t, t + 4 * period).toFixed(4) }));
let drop = null, jump = 0;
for (let i = 1; i < bars.length; i++) { const j = bars[i].energy - bars[i - 1].energy; if (j > jump) { jump = j; drop = bars[i].t; } }
const meanE = bars.reduce((s, b) => s + b.energy, 0) / Math.max(1, bars.length);
if (jump < .25 * meanE) drop = null;                                   // no clear drop: don't invent one

// Hits: envelope peaks well above the local level, at least 0.1 s apart
const vals = [...env].sort((p, q) => p - q), thr = vals[Math.floor(vals.length * .97)];
const hits = []; let lastHit = -1;
for (let f = 2; f < nF - 2; f++) {
  if (env[f] > thr && env[f] >= env[f - 1] && env[f] >= env[f + 1] && env[f] >= env[f - 2] && env[f] >= env[f + 2] && f / fr - lastHit > .1) { hits.push(+(f / fr).toFixed(3)); lastHit = f / fr; }
}

console.log(JSON.stringify({ file, dur: +dur.toFixed(3), bpm, offset: downbeats[0] ?? phase, beats, downbeats, bars, drop, hits }, null, 1));
console.error(`bpm ${bpm}  first downbeat ${(downbeats[0] ?? phase).toFixed(3)}s  ${beats.length} beats  drop ${drop ?? 'none'}  ${hits.length} hits`);
