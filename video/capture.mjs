// capture.mjs: collect REAL product assets with Playwright, so the film never redraws the UI from imagination.
//   node capture.mjs --url=http://localhost:5173 [--sizes=1920x1080,390x844] [--full] [--out=assets/capture]
//       screenshots per viewport (+ full-page with --full), the page's colors/fonts and logo candidates → brand.json
//   node capture.mjs --url=... --flow=flows/onboard.mjs [--size=1440x900] [--fps=30] [--out=assets/capture]
//       runs a scripted flow and records it (Chromium screencast) → flow/%05d.jpg, a seekable image sequence + flow.json
// A flow file:  export default async (page, { pause }) => { await page.click('text=Connect'); await pause(800); ... }
// Only capture the user's own product or a public page. Sign in with project demo/test accounts only, never
// with a real password typed into chat. If the product runs in a demo/testnet mode, keep that label visible.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const A = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
if (!A.url) { console.error('usage: node capture.mjs --url=<url> [--sizes=..] [--full] | [--flow=file.mjs]'); process.exit(1); }
const OUT = A.out || 'assets/capture'; mkdirSync(OUT, { recursive: true });
const wh = s => { const [w, h] = String(s).split('x').map(Number); return { width: w, height: h }; };

async function launch() {
  for (const b of A.browser ? [A.browser] : ['chromium', 'msedge', 'chrome']) {
    try { return await chromium.launch(b === 'chromium' ? {} : { channel: b }); } catch (e) { if (A.browser) throw e; }
  }
  throw new Error('No browser: npx playwright install chromium, or --browser=msedge');
}
const browser = await launch();
try {
  if (A.flow) {
    // Chromium screencast: frames arrive only when pixels change, stamped on the wall clock. We resample them to a
    // fixed fps (hold the latest frame), so the sequence and the marks share one clock. No extra downloads needed.
    const size = wh(A.size || '1440x900'), fps = +(A.fps || 30);
    const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(A.url, { waitUntil: 'networkidle' });
    const cdp = await ctx.newCDPSession(page), shots = [];
    cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      shots.push({ t: metadata.timestamp, buf: Buffer.from(data, 'base64') });
      await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    const t0 = Date.now() / 1000;
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
    const flow = (await import(pathToFileURL(resolve(A.flow)).href)).default;
    const marks = [];
    await page.waitForTimeout(300);
    await flow(page, { pause: ms => page.waitForTimeout(ms), mark: name => marks.push({ name, t: +(Date.now() / 1000 - t0).toFixed(3) }) });
    await page.waitForTimeout(300);
    const t1 = Date.now() / 1000;
    await cdp.send('Page.stopScreencast'); await ctx.close();
    if (!shots.length) throw new Error('screencast produced no frames');
    const seq = join(OUT, 'flow'); rmSync(seq, { recursive: true, force: true }); mkdirSync(seq, { recursive: true });
    const n = Math.floor((t1 - t0) * fps); let j = 0;
    for (let i = 0; i < n; i++) {
      const t = t0 + i / fps; while (j + 1 < shots.length && shots[j + 1].t <= t) j++;
      writeFileSync(join(seq, String(i + 1).padStart(5, '0') + '.jpg'), shots[j].buf);
    }
    writeFileSync(join(OUT, 'flow.json'), JSON.stringify({ fps, frames: n, ...size, marks }, null, 1));
    console.log(`flow: ${n} frames (${shots.length} distinct) → ${seq}/  marks: ${marks.map(m => `${m.name}@${m.t.toFixed(2)}s`).join(' ') || 'none (call mark("name") in the flow)'}`);
    console.log('marks are in sequence time: seek seqFrame(name, t) with the same t to land on them.');
  } else {
    const sizes = String(A.sizes || '1920x1080,390x844').split(',');
    const brand = { url: A.url, captured: new Date().toISOString(), shots: [] };
    for (const s of sizes) {
      const page = await browser.newPage({ viewport: wh(s), deviceScaleFactor: +(A.dpr || 2) });
      await page.goto(A.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(+(A.wait || 800));
      const f = join(OUT, `screen-${s}.png`); await page.screenshot({ path: f }); brand.shots.push(f);
      if (A.full) { const ff = join(OUT, `full-${s}.png`); await page.screenshot({ path: ff, fullPage: true }); brand.shots.push(ff); }
      if (!brand.colors) Object.assign(brand, await page.evaluate(() => {
        const count = new Map(), fonts = new Map();
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          for (const c of [cs.color, cs.backgroundColor, cs.borderTopColor]) if (c && !/rgba\(.*, 0\)$/.test(c) && c !== 'transparent') count.set(c, (count.get(c) || 0) + 1);
          fonts.set(cs.fontFamily, (fonts.get(cs.fontFamily) || 0) + 1);
        }
        const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => ({ value: k, uses: n }));
        const logos = [...document.querySelectorAll('img, svg, link[rel*="icon"]')]
          .filter(e => /logo|brand|icon/i.test((e.getAttribute('alt') || '') + (e.getAttribute('class') || '') + (e.getAttribute('src') || e.getAttribute('href') || '') + (e.id || '')))
          .slice(0, 8).map(e => e.getAttribute('src') || e.getAttribute('href') || '(inline svg)');
        const vars = {}; for (const r of document.styleSheets) { try { for (const rule of r.cssRules) if (rule.selectorText === ':root') for (const p of rule.style) if (p.startsWith('--')) vars[p] = rule.style.getPropertyValue(p).trim(); } catch {} }
        return { title: document.title, colors: top(count), fonts: top(fonts), logos, cssVars: vars };
      }));
      await page.close(); console.log(f);
    }
    writeFileSync(join(OUT, 'brand.json'), JSON.stringify(brand, null, 1));
    console.log(`brand.json: ${brand.colors?.length || 0} colors, ${brand.fonts?.length || 0} fonts, ${brand.logos?.length || 0} logo candidates`);
  }
} finally { await browser.close(); }
