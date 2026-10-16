// sfx.mjs: synthesize UI sound effects on a cue list. No samples, nothing to license, deterministic.
//   node sfx.mjs cues.json out/sfx.wav [--dur=20]
// cues.json: [{ "t": 0.5, "type": "click", "vol": 0.5, "pitch": 1.1, "pan": -0.3 }, ...]
// Put t ~0.03 s BEFORE the visual contact: slightly early reads as synced, late reads as broken.
// Types: click tick type pop thump whoosh swish riser chime sparkle success error
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [cuesPath, outPath] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const A = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
if (!cuesPath || !outPath) { console.error('usage: node sfx.mjs cues.json out/sfx.wav [--dur=20]'); process.exit(1); }
const cues = JSON.parse(readFileSync(cuesPath, 'utf8'));
const SR = 48000, TAU = Math.PI * 2;
const dur = +(A.dur || Math.max(0, ...cues.map(c => c.t)) + 2.5);
const L = new Float32Array(Math.ceil(dur * SR)), R = new Float32Array(L.length);

let s = 42; const noise = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) * d));
// Each voice: [length s, fn(t, pitch) → sample]
const V = {
  click:   [.05, (t, p) => Math.sin(TAU * 1800 * p * t) * Math.exp(-t * 90) * .5 + noise() * Math.exp(-t * 400) * .15],
  tick:    [.03, (t, p) => Math.sin(TAU * 3200 * p * t) * Math.exp(-t * 160) * .35],
  type:    [.04, (t, p) => (noise() * .6 + Math.sin(TAU * 900 * p * t) * .4) * Math.exp(-t * 180) * .35],
  pop:     [.15, (t, p) => Math.sin(TAU * (600 + 900 * t) * p * t) * Math.exp(-t * 30) * .4],
  thump:   [.50, (t, p) => Math.sin(TAU * (90 - 60 * t) * p * t) * Math.exp(-t * 9) * .9],
  whoosh:  [.40, (t) => noise() * Math.sin(Math.PI * Math.min(1, t / .4)) * .25],
  swish:   [.22, (t) => noise() * Math.sin(Math.PI * Math.min(1, t / .22)) * Math.sin(Math.PI * Math.min(1, t / .22)) * .3],
  riser:   [1.2, (t, p) => (noise() * .15 + Math.sin(TAU * (200 + 600 * t * t) * p * t) * .12) * (t / 1.2) * (t < 1.15 ? 1 : (1.2 - t) / .05)],
  chime:   [1.2, (t, p) => [1, 2.01, 3.03].reduce((a, h, i) => a + Math.sin(TAU * 880 * p * h * t) * Math.exp(-t * (3 + i * 3)) / (i + 1), 0) * env(t, .005, 0) * .3],
  sparkle: [.6, (t, p) => [0, .07, .14, .21].reduce((a, o, i) => a + (t > o ? Math.sin(TAU * (1500 + i * 400) * p * (t - o)) * Math.exp(-(t - o) * 18) : 0), 0) * .18],
  success: [.6, (t, p) => (Math.sin(TAU * 660 * p * t) * (t < .12 ? 1 : 0) + (t >= .1 ? Math.sin(TAU * 990 * p * t) * Math.exp(-(t - .1) * 7) : 0)) * .3],
  error:   [.35, (t, p) => Math.sign(Math.sin(TAU * 140 * p * t)) * Math.exp(-t * 8) * .18],
};
for (const c of cues) {
  const v = V[c.type]; if (!v) { console.warn(`unknown type ${c.type}, skipped`); continue; }
  const [len, fn] = v, start = Math.floor(c.t * SR), vol = c.vol ?? .5, pitch = c.pitch ?? 1, pan = c.pan ?? 0;
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < len * SR && start + i < L.length; i++) { if (start + i < 0) continue; const y = fn(i / SR, pitch) * vol; L[start + i] += y * gl; R[start + i] += y * gr; }
}
// Soft clip, then 16-bit stereo WAV
const n = L.length, b = Buffer.alloc(44 + n * 4);
b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(Math.tanh(L[i]) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.tanh(R[i]) * 32767), 46 + i * 4); }
mkdirSync(dirname(outPath) || '.', { recursive: true });
writeFileSync(outPath, b);
console.log(`wrote ${outPath}  ${cues.length} cues  ${dur.toFixed(2)} s`);
