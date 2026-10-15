/** Print Vigil's view of one trove: npm run inspect -- 0xBorrower */
import { takeSnapshot } from "../src/snapshot.ts";
import { position, pct, usd, musd, btc } from "../src/risk.ts";

const borrower = process.argv[2];
const t0 = Date.now();
const s = await takeSnapshot();
console.log(`block ${s.block} · ${s.troves.length} active troves · ${Date.now() - t0} ms`);
if (!s.price.ok) {
  console.log(`price: ${s.price.reason}`);
  process.exit(0);
}
console.log(`BTC price ${usd(s.price.price)}`);
if (borrower) {
  const p = position(s.troves, borrower, s.price.price);
  if (!p) {
    console.log("no active trove for", borrower);
    process.exit(0);
  }
  console.log({
    collateral: btc(p.coll),
    debt: musd(p.debt),
    icr: pct(p.icr, 2),
    liquidationPrice: usd(p.liquidationPrice),
    dropToLiquidation: pct(p.dropToLiquidation),
    daysToMcrFlat: p.daysToMcrFlat?.toFixed(0),
    redemptionRank: `${p.redemptionRank} of ${p.redeemableTroves}`,
    redemptionBuffer: musd(p.redemptionBuffer),
  });
}
