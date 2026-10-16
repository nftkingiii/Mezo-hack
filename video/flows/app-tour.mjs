// Real tour of the live Vigil app on Mezo testnet, reading the project's burner test loan.
export default async (page, { pause, mark }) => {
  await pause(1200); mark('position');
  await pause(2500);
  await page.click('#tab-reserve'); mark('reserve'); await pause(2500);
  await page.click('#tab-rescue'); mark('rescue'); await pause(3000);
  await page.click('#tab-log'); mark('log'); await pause(3000);
  await page.click('#tab-position'); mark('back'); await pause(1500);
};
