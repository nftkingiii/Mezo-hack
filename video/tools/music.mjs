// music.mjs: a calm synthesized bed for the narrated demo. Deterministic, nothing to license.
//   node tools/music.mjs out/music.wav --dur=100
// 84 BPM, A minor-ish progression (Am9 · Fmaj7 · C(add9) · G6), soft pads + a low pulse + sparse bell on bar starts.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2] || 'out/music.wav';
const A = Object.fromEntries(process.argv.slice(3).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v]; }));
const dur = +(A.dur || 100), SR = 48000, BPM = 84, beat = 60 / BPM, bar = beat * 4, TAU = Math.PI * 2;
const n = Math.ceil(dur * SR), L = new Float32Array(n), R = new Float32Array(n);
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [[45, 57, 60, 64, 71], [41, 57, 60, 64, 67], [48, 55, 60, 62, 64], [43, 55, 59, 62, 64]]; // MIDI

function add(start, len, fn, gl, gr) {
  const s0 = Math.floor(start * SR);
  for (let i = 0; i < len * SR && s0 + i < n; i++) { const y = fn(i / SR); L[s0 + i] += y * gl; R[s0 + i] += y * gr; }
}
const bars = Math.ceil(dur / bar);
for (let b = 0; b < bars; b++) {
  const t0 = b * bar, ch = CHORDS[Math.floor(b / 2) % CHORDS.length], len = bar * 1.15;
  // pad: each note a few detuned sines with slow attack/release
  ch.slice(1).forEach((m, i) => {
    const f = hz(m), pan = (i - 1.5) * 0.25;
    add(t0, len, t => {
      const env = Math.min(1, t / 1.2) * Math.min(1, (len - t) / 1.0);
      return env * 0.045 * (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 1.003 * t + 1) + 0.25 * Math.sin(TAU * f * 2 * t));
    }, Math.cos((pan + 1) * Math.PI / 4), Math.sin((pan + 1) * Math.PI / 4));
  });
  // bass pulse on beats 1 and 3
  for (const k of [0, 2]) {
    const f = hz(ch[0] - 12);
    add(t0 + k * beat, 0.9, t => Math.sin(TAU * f * t) * Math.exp(-t * 4) * 0.16 * Math.min(1, t / 0.01), 0.7, 0.7);
  }
  // bell on every other bar start
  if (b % 2 === 0) {
    const f = hz(ch[4] + 12);
    add(t0, 2.5, t => [1, 2.76, 5.4].reduce((a, h, i) => a + Math.sin(TAU * f * h * t) * Math.exp(-t * (2 + i * 2)) / (i + 1), 0) * 0.035, 0.55, 0.85);
  }
}
// fade in 1 s, fade out 3 s, soft clip, 16-bit stereo WAV
const b = Buffer.alloc(44 + n * 4);
b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) {
  const t = i / SR, g = Math.min(1, t / 1) * Math.min(1, (dur - t) / 3);
  b.writeInt16LE(Math.round(Math.tanh(L[i] * g) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.tanh(R[i] * g) * 32767), 46 + i * 4);
}
mkdirSync(dirname(out) || '.', { recursive: true });
writeFileSync(out, b);
console.log(`wrote ${out}  ${dur} s at ${BPM} BPM`);
