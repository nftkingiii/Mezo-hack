// mix.mjs: put music, SFX and voice-over under a silent render, duck the bed under the voice, normalize loudness.
//   node mix.mjs --video=out/silent.mp4 [--music=audio/track.mp3] [--sfx=out/sfx.wav] [--voice=out/vo.wav]
//               [--music-vol=0.5] [--sfx-vol=1] [--voice-vol=1] [--music-at=0] [--fade=1.5] [--lufs=-14] [--out=out/final.mp4]
// -14 LUFS suits X / YouTube / social; use --lufs=-16 for a judged demo with narration.
// Music is faded out over the last --fade seconds of the picture. Video stream is copied, not re-encoded.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const A = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
if (!A.video) { console.error('usage: node mix.mjs --video=out/silent.mp4 [--music=..] [--sfx=..] [--voice=..]'); process.exit(1); }
const out = A.out || 'out/final.mp4', lufs = A.lufs || -14, fade = +(A.fade || 1.5);
const vdur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', A.video]).toString().trim();

const inputs = ['-i', A.video], chains = [], mixes = [];
let idx = 1;
if (A.music) {
  inputs.push('-i', A.music);
  const at = +(A['music-at'] || 0), d = Math.round(at * 1000);
  chains.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${A['music-vol'] || .5},adelay=${d}|${d},afade=t=out:st=${Math.max(0, vdur - fade)}:d=${fade}[m]`);
  mixes.push('[m]'); idx++;
}
if (A.sfx) { inputs.push('-i', A.sfx); chains.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${A['sfx-vol'] || 1}[s]`); mixes.push('[s]'); idx++; }
if (A.voice) {
  inputs.push('-i', A.voice);
  chains.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${A['voice-vol'] || 1},asplit=2[v][vk]`); idx++;
  if (A.music) {   // duck the music under the voice
    const m = chains.findIndex(c => c.endsWith('[m]')); chains[m] = chains[m].replace(/\[m\]$/, '[m0]');
    chains.push('[m0][vk]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[m]');
  } else chains.push('[vk]anullsink');
  mixes.push('[v]');
}
if (!mixes.length) { console.error('nothing to mix: pass --music, --sfx or --voice'); process.exit(1); }
const filter = [...chains,
  `${mixes.join('')}amix=inputs=${mixes.length}:normalize=0:duration=longest,apad,atrim=0:${vdur},loudnorm=I=${lufs}:TP=-1.5:LRA=11,aresample=48000[a]`].join(';');
mkdirSync(dirname(out), { recursive: true });
const args = ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out];
await new Promise((ok, bad) => spawn('ffmpeg', args, { stdio: 'inherit' }).on('close', c => c ? bad(new Error('ffmpeg exited ' + c)) : ok()));
console.log(`wrote ${out}  (${vdur.toFixed(2)} s, target ${lufs} LUFS). Check it: node check.mjs ${out} --loudness`);
