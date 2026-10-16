// High-DPI stills of each tab of the live Vigil app (real product, Mezo testnet), for zooms in the film.
import { chromium } from 'playwright';
const url = 'https://vigil-mezo.up.railway.app/?borrower=0x16f2981DF2027e66857e3a857d6d3B2F858eCB4f';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
for (const tab of ['position', 'reserve', 'rescue', 'log']) {
  await p.click(`#tab-${tab}`); await p.waitForTimeout(tab === 'log' ? 2500 : 600);
  await p.screenshot({ path: `assets/app/${tab}.png` });
}
await b.close();
