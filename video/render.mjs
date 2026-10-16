// render.mjs: drive a seek(t) page in headless Chromium/Edge/Chrome and turn it into frames, sheets and MP4.
// The page must define window.FILM = { w, h, dur, fps } and window.seek(t) (may return a promise).
//
//   node render.mjs --sheet=0.5,2,4,6 [--cols=4] [--w=480] [--out=out/check/sheet.jpg]   contact sheet at chosen times
//   node render.mjs --every=0.5 [--cols=6]                                               sheet: one frame per 0.5 s
//   node render.mjs --strip=4.1:4.6 [--cols=6]                                           sheet: EVERY frame in a range
//   node render.mjs --stills=1,3.2 [--out=out/stills]                                    full-res PNGs
//   node render.mjs --verify=0.3,2.9,7.5                                                 same t, different seek order → same pixels?
//   node render.mjs --frames[=a:b] [--workers=3] [--sub=1]                               JPEG frames → out/frames (resumable)
//   node render.mjs --encode [--audio=out/mix.wav] [--out=out/silent.mp4]                frames → H.264 MP4
//   node render.mjs --clip=a:b [--out=out/clip.mp4]                                      quick range render + encode
// Common: --page=index.html  --fps=30  --q=92  --browser=chromium|msedge|chrome  --size=1080x1920 (passed to the page as ?w=&h=)
// --sub=N renders N subframes per frame and blends them (motion blur). Use 3–4 for the final, 1 while iterating.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, renameSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const A = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const PAGE = resolve(A.page || 'index.html');
const FR_DIR = A.dir || 'out/frames';
const Q = +(A.q || 92);
const run = (cmd, args, opts = {}) => new Promise((ok, bad) => { const p = spawn(cmd, args, { stdio: 'inherit', ...opts }); p.on('close', c => c ? bad(new Error(`${cmd} exited ${c}`)) : ok()); });
const times = s => String(s).split(',').filter(Boolean).map(Number);
const pad = (i, n = 6) => String(i).padStart(n, '0');

async function launch() {
  const order = A.browser ? [A.browser] : ['chromium', 'msedge', 'chrome'];
  for (const b of order) {
    try { return await chromium.launch(b === 'chromium' ? {} : { channel: b }); }
    catch (e) { if (A.browser) throw e; }
  }
  throw new Error('No browser: run `npx playwright install chromium`, or pass --browser=msedge / --browser=chrome');
}

let browser, FILM;
async function openPage(tag = '') {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log(`[page${tag}] ${m.text()}`); });
  page.on('pageerror', e => console.log(`[page error${tag}] ${e.message}`));
  const url = new URL(pathToFileURL(PAGE).href);
  url.searchParams.set('render', '1');
  if (A.size) { const [w, h] = String(A.size).split('x'); url.searchParams.set('w', w); url.searchParams.set('h', h); }
  await page.goto(url.href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.FILM && typeof window.seek === 'function', null, { timeout: 30000 });
  await page.evaluate(async () => { await document.fonts.ready; if (window.ready) await window.ready; });
  FILM = await page.evaluate(() => ({ w: 1920, h: 1080, dur: 10, fps: 30, ...window.FILM }));
  if (A.fps) FILM.fps = +A.fps;
  await page.setViewportSize({ width: FILM.w, height: FILM.h });
  return page;
}
async function shot(page, t, type = 'jpeg') {
  // Canvas text loads fonts lazily: if drawing triggered a font load, wait for it and paint the frame again
  await page.evaluate(async t => {
    await window.seek(t);
    if (document.fonts.status === 'loading') { await document.fonts.ready; await window.seek(t); }
  }, Math.max(0, t));
  // one rAF so layout/paint of DOM-based films settles before capture
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  return page.screenshot({ type, ...(type === 'jpeg' ? { quality: Q } : {}), clip: { x: 0, y: 0, width: FILM.w, height: FILM.h } });
}

async function sheet(ts, out, cols, w) {
  const page = await openPage(), tmp = join(dirname(out), '.sheet-tmp');
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  for (let i = 0; i < ts.length; i++) {
    const t0 = Date.now(); writeFileSync(join(tmp, `s${pad(i, 3)}.jpg`), await shot(page, ts[i]));
    console.log(`  [${i}] t=${ts[i].toFixed(3)}  ${Date.now() - t0} ms`);
  }
  const rows = Math.ceil(ts.length / cols);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', join(tmp, 's%03d.jpg'),
    '-vf', `scale=${w}:-2,tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', '-q:v', '3', out]);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`${out}  (${ts.length} frames, ${cols}x${rows}, read left→right, top→bottom)`);
}

// Subframe times for frame i: centred on i/fps, spread over one frame interval (360° shutter)
// The shutter opens at the frame time and stays inside that frame, so a frame never blends across a hard cut on a frame boundary.
const subTimes = (i, fps, sub) => Array.from({ length: sub }, (_, k) => (i + k / sub) / fps);

async function frames(a, b, dir, workers, sub) {
  const probe = await openPage(); await probe.close();
  const fps = FILM.fps, dur = FILM.dur;
  const first = Math.round(a * fps), last = Math.min(Math.ceil(dur * fps) - 1, Math.round(b * fps) - 1);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ fps, sub, w: FILM.w, h: FILM.h, first, last }));
  const todo = [];
  for (let i = first; i <= last; i++) for (let k = 0; k < sub; k++) {
    const f = join(dir, `f${pad((i - first) * sub + k)}.jpg`);
    if (!existsSync(f) || statSync(f).size < 500) todo.push([i, k, f]);
  }
  console.log(`${todo.length} images to render (${(last - first + 1) * sub - todo.length} already done), ${workers} workers, sub=${sub}`);
  let next = 0, done = 0; const start = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const page = await openPage('#' + w);
    while (next < todo.length) {
      const [i, k, f] = todo[next++];
      const buf = await shot(page, subTimes(i, fps, sub)[k]);
      writeFileSync(f + '.tmp', buf); renameSync(f + '.tmp', f);
      if (++done % (fps * sub) === 0 || done === todo.length) {
        const el = (Date.now() - start) / 1000;
        console.log(`${done}/${todo.length}  ${(el / done * 1000).toFixed(0)} ms/img  eta ${((todo.length - done) * el / done / 60).toFixed(1)} min`);
      }
    }
    await page.close();
  }));
}

// Which tmix output holds the average of one frame's own subframes. Older ffmpeg (4.x) drops the first sub-1 outputs
// while the window fills; newer versions pad instead. Picking the wrong one blends across every hard cut.
function tmixPick(sub) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=16x16:rate=${sub}:duration=3`, '-vf', `tmix=frames=${sub}`, '-f', 'null', '-', '-progress', 'pipe:1'], { encoding: 'utf8' });
  const out = Math.max(...[...r.stdout.matchAll(/^frame=(\d+)/gm)].map(x => +x[1]));
  const lag = 3 * sub - out;
  return (((sub - 1 - lag) % sub) + sub) % sub;
}

async function encode(dir, out, audio) {
  const m = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const n = readdirSync(dir).filter(f => /^f\d+\.jpg$/.test(f)).length;
  if (n !== (m.last - m.first + 1) * m.sub) console.warn(`warning: ${n} images, expected ${(m.last - m.first + 1) * m.sub} (run --frames again to fill gaps)`);
  const vf = m.sub > 1 ? [`tmix=frames=${m.sub}`, `select='eq(mod(n\\,${m.sub})\\,${tmixPick(m.sub)})'`, `setpts=N/${m.fps}/TB`] : [];
  vf.push('scale=in_range=pc:out_range=tv', 'format=yuv420p');
  mkdirSync(dirname(out), { recursive: true });
  const args = ['-y', '-loglevel', 'error', '-framerate', String(m.fps * m.sub), '-i', join(dir, 'f%06d.jpg')];
  if (audio) args.push('-ss', String(m.first / m.fps), '-i', audio);
  args.push('-vf', vf.join(','), '-r', String(m.fps), '-c:v', 'libx264', '-preset', 'slow', '-crf', String(A.crf || 16), '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-movflags', '+faststart');
  if (audio) args.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push(out);
  await run('ffmpeg', args);
  console.log(`wrote ${out}`);
}

// Render the same times forward in one page and backward in a fresh page. Real carried state or unseeded randomness
// changes large areas; GPU text antialiasing can flip a handful of pixels, which is tolerated (≤ 0.005% of pixels).
async function verify(ts) {
  const dir = 'out/check/verify'; mkdirSync(dir, { recursive: true });
  const hashOf = b => createHash('sha1').update(b).digest('hex').slice(0, 12);
  const p1 = await openPage('#fwd'), fwd = [];
  for (const t of ts) { const b = await shot(p1, t, 'png'); writeFileSync(`${dir}/fwd-${t}.png`, b); fwd.push(hashOf(b)); }
  const p2 = await openPage('#rev'), rev = [];
  for (const t of [...ts].reverse()) { const b = await shot(p2, t, 'png'); writeFileSync(`${dir}/rev-${t}.png`, b); rev.unshift(hashOf(b)); }
  let ok = true;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]; let note = 'identical';
    if (fwd[i] !== rev[i]) {
      const frac = await diffFraction(`${dir}/fwd-${t}.png`, `${dir}/rev-${t}.png`);
      const pass = frac <= 5e-5; ok &&= pass;
      note = `${pass ? 'OK' : 'DIFFERENT'} (${(frac * 100).toFixed(4)}% of pixels differ${pass ? ', antialiasing noise' : `: compare ${dir}/fwd-${t}.png and rev-${t}.png`})`;
    }
    console.log(`t=${t}  ${note}`);
  }
  console.log(ok ? 'verify: deterministic' : 'verify: FAILED: state is carried between frames, randomness is unseeded, or an asset loads late');
  if (!ok) process.exitCode = 1;
}
function diffFraction(a, b) {
  return new Promise((ok, bad) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-filter_complex',
      "blend=all_mode=difference,format=gray,geq=lum='if(gt(lum(X,Y),8),255,0)',signalstats,metadata=print:key=lavfi.signalstats.YAVG", '-f', 'null', '-']);
    let err = ''; p.stderr.on('data', d => err += d);
    p.on('close', c => { const m = err.match(/YAVG=([\d.]+)/); c || !m ? bad(new Error('diff failed')) : ok(+m[1] / 255); });
  });
}

const needsBrowser = !A.encode;
if (needsBrowser) browser = await launch();
try {
  const cols = +(A.cols || 4), w = +(A.w || 480);
  if (A.sheet) await sheet(times(A.sheet), A.out || 'out/check/sheet.jpg', cols, w);
  else if (A.every) {
    const p = await openPage(); await p.close();
    const step = +A.every, ts = []; for (let t = step / 2; t < FILM.dur; t += step) ts.push(+t.toFixed(3));
    await sheet(ts, A.out || 'out/check/every.jpg', +(A.cols || 6), +(A.w || 320));
  } else if (A.strip) {
    const p = await openPage(); await p.close();
    const [a, b] = String(A.strip).split(':').map(Number), ts = [];
    for (let i = Math.round(a * FILM.fps); i <= Math.round(b * FILM.fps); i++) ts.push(+(i / FILM.fps).toFixed(4));
    await sheet(ts, A.out || 'out/check/strip.jpg', +(A.cols || 6), +(A.w || 320));
  } else if (A.stills) {
    const page = await openPage(), out = A.out || 'out/stills'; mkdirSync(out, { recursive: true });
    for (const t of times(A.stills)) { const f = `${out}/t${t.toFixed(2).replace('.', '_')}.png`; writeFileSync(f, await shot(page, t, 'png')); console.log(f); }
  } else if (A.verify) await verify(times(A.verify));
  else if (A.frames) {
    const p = await openPage(); await p.close();
    const [a, b] = A.frames === true ? [0, FILM.dur] : String(A.frames).split(':').map(Number);
    await frames(a, b, FR_DIR, +(A.workers || 3), +(A.sub || 1));
  } else if (A.encode) await encode(FR_DIR, A.out || 'out/silent.mp4', A.audio);
  else if (A.clip) {
    const [a, b] = String(A.clip).split(':').map(Number), dir = 'out/clip-frames';
    rmSync(dir, { recursive: true, force: true });
    await frames(a, b, dir, +(A.workers || 3), +(A.sub || 1));
    await browser.close(); browser = null;
    await encode(dir, A.out || 'out/clip.mp4', A.audio);
  } else {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).join('\n'));
  }
} finally { if (browser) await browser.close(); }
