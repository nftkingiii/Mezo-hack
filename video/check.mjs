// check.mjs: look at the ENCODED video, not the code. Writes images to out/check/ for you to open and read.
//   node check.mjs out/final.mp4                 contact sheet (2 fps) + phone-size sheet + facts (duration, fps, size, audio)
//   node check.mjs out/final.mp4 --strip=4.2     12 consecutive frames around t (pops, overlaps, snaps)
//   node check.mjs out/final.mp4 --loop          plays it twice back-to-back → out/check/loop.mp4 (watch the seam)
//   node check.mjs out/final.mp4 --loudness      integrated LUFS / true peak (target -14 social, -16 narrated; TP ≤ -1)
//   node check.mjs out/final.mp4 --poster=2.5    full-res poster frame
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const file = process.argv[2];
const A = Object.fromEntries(process.argv.slice(3).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
if (!file) { console.error('usage: node check.mjs <video> [--strip=t] [--loop] [--loudness] [--poster=t]'); process.exit(1); }
mkdirSync('out/check', { recursive: true });
const ff = (args, capture = false) => new Promise((ok, bad) => {
  const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', capture ? 'info' : 'error', ...args], { stdio: capture ? ['ignore', 'ignore', 'pipe'] : 'inherit' });
  let err = ''; if (capture) p.stderr.on('data', d => err += d);
  p.on('close', c => c ? bad(new Error('ffmpeg ' + c + '\n' + err.slice(-800))) : ok(err));
});
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate,pix_fmt', '-of', 'json', file]).toString());
const v = probe.streams.find(s => s.codec_type === 'video'), a = probe.streams.find(s => s.codec_type === 'audio'), dur = +probe.format.duration;
console.log(`${file}: ${dur.toFixed(2)} s, ${v.width}x${v.height}, ${v.r_frame_rate} fps, ${v.pix_fmt}, audio: ${a ? 'yes' : 'NO'}`);

if (A.strip) {
  const t = Math.max(0, +A.strip - .2);
  await ff(['-ss', String(t), '-i', file, '-vf', 'scale=320:-2,tile=6x2:padding=4:color=white', '-frames:v', '1', 'out/check/strip.jpg']);
  console.log(`out/check/strip.jpg  (12 frames from ${t.toFixed(2)} s)`);
} else if (A.loop) {
  await ff(['-stream_loop', '1', '-i', file, '-c', 'copy', 'out/check/loop.mp4']); console.log('out/check/loop.mp4');
} else if (A.loudness) {
  const log = await ff(['-i', file, '-af', 'loudnorm=print_format=summary', '-f', 'null', '-'], true);
  const I = log.match(/Input Integrated:\s*(-?[\d.]+)/), TP = log.match(/Input True Peak:\s*([-+]?[\d.]+)/);
  console.log(`integrated ${I?.[1]} LUFS, true peak ${TP?.[1]} dBTP`);
} else if (A.poster) {
  await ff(['-ss', String(A.poster), '-i', file, '-frames:v', '1', 'out/check/poster.png']); console.log('out/check/poster.png');
} else {
  const n = Math.ceil(dur * 2), cols = v.height > v.width ? 8 : 6, rows = Math.ceil(n / cols);
  await ff(['-i', file, '-vf', `fps=2,scale=${v.height > v.width ? 200 : 320}:-2,tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', 'out/check/contact.jpg']);
  const pn = Math.ceil(dur), pc = 6, pr = Math.ceil(pn / pc);
  await ff(['-i', file, '-vf', `fps=1,scale=${v.height > v.width ? 360 : 360}:-2,tile=${pc}x${pr}:padding=4:color=white`, '-frames:v', '1', 'out/check/phone.jpg']);
  console.log(`out/check/contact.jpg  (${n} frames at 0.5 s steps, ${cols} per row)\nout/check/phone.jpg    (1 per second at 360 px wide: can you read every word?)`);
}
