import { config } from "./config.ts";
import { keeperAccount } from "./keeper.ts";
import { startMonitor } from "./monitor.ts";
import { startTelegram } from "./telegram.ts";
import { startWeb } from "./web.ts";

console.log(`vigil ${config.revision} · reserve ${config.vigilReserve} · keeper ${keeperAccount.address}`);
startWeb();
startMonitor();
void startTelegram();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`${sig}: shutting down`);
    process.exit(0);
  });
}
