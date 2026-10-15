import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BaseError, ContractFunctionRevertedError, createWalletClient, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { config } from "./config.ts";
import { short } from "./format.ts";
import { addresses, client, explorerTx, mezoTestnet, sigOpsAbi, vigilAbi } from "./mezo.ts";
import { musd, pct } from "./risk.ts";
import type { Snapshot } from "./snapshot.ts";
import { rescues } from "./store.ts";
import { notifyBorrower } from "./telegram.ts";

/**
 * The keeper only pays gas. Its key is generated on first boot inside the data volume and never
 * leaves it; VigilReserve has no keeper allow-list, so the key controls nothing but its own gas.
 */
function loadKeeperKey(): Hex {
  const file = join(config.dataDir, "keeper.key");
  if (!existsSync(file)) writeFileSync(file, generatePrivateKey(), { mode: 0o600 });
  return readFileSync(file, "utf8").trim() as Hex;
}

export const keeperAccount = privateKeyToAccount(loadKeeperKey());
const wallet = createWalletClient({ account: keeperAccount, chain: mezoTestnet, transport: http(config.rpcUrl) });

/** Mezo errors that mean the signature can never succeed. */
const PERMANENT = [/Invalid signature/i, /Signature expired/i, /TroveNotActive/, /RescueOff/];

function revertReason(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return revert.data?.errorName ?? revert.reason ?? revert.shortMessage;
    }
    return e.shortMessage;
  }
  return String(e);
}

export async function runKeeper(snap: Snapshot) {
  if (!config.keeperEnabled || !snap.price.ok) return; // never act on a stale price
  const now = Math.floor(Date.now() / 1000);

  for (const r of rescues.armed()) {
    const borrower = r.borrower as Hex;
    if (r.deadline <= now) {
      rescues.finish(r.id, "void", "signature expired");
      await notifyBorrower(borrower, `⌛ Your pre-signed rescue for <code>${short(borrower)}</code> expired. Sign a new one with /rescue.`);
      continue;
    }

    const nonce = await client.readContract({ address: addresses.borrowerOperationsSignatures, abi: sigOpsAbi, functionName: "getNonce", args: [borrower] });
    if (nonce !== r.nonce) {
      rescues.finish(r.id, "void", `nonce moved (${r.nonce} → ${nonce})`);
      await notifyBorrower(borrower, `⚠️ Your pre-signed rescue is void: you signed another Mezo action since, which used up its nonce. Sign a new one with /rescue.`);
      continue;
    }

    let ready = false;
    try {
      const [ok] = await client.readContract({ address: addresses.vigilReserve, abi: vigilAbi, functionName: "canRescue", args: [borrower, r.amount] });
      ready = ok;
    } catch {
      ready = false; // canRescue reverts when the oracle is stale
    }
    if (!ready) continue;

    try {
      const { request } = await client.simulateContract({
        account: keeperAccount,
        address: addresses.vigilReserve,
        abi: vigilAbi,
        functionName: "rescue",
        args: [borrower, r.amount, BigInt(r.deadline), r.signature, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"],
      });
      const hash = await wallet.writeContract(request);
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== "success") {
        rescues.finish(r.id, "failed", "transaction reverted", hash);
        continue;
      }
      rescues.finish(r.id, "executed", null, hash);
      const log = receipt.logs.find((l) => l.address.toLowerCase() === addresses.vigilReserve.toLowerCase());
      let detail = "";
      if (log) {
        const { decodeEventLog } = await import("viem");
        const ev = decodeEventLog({ abi: vigilAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "Rescued") detail = `\nRatio ${pct(ev.args.icrBefore, 2)} → <b>${pct(ev.args.icrAfter, 2)}</b>`;
      }
      console.log(`rescue executed ${borrower} ${hash}`);
      await notifyBorrower(
        borrower,
        `🛟 <b>Rescue executed</b> for <code>${short(borrower)}</code>\nRepaid ${musd(r.amount)} from your Vigil reserve.${detail}\n<a href="${explorerTx(hash)}">View transaction</a>`,
      );
    } catch (e) {
      const reason = revertReason(e);
      if (PERMANENT.some((re) => re.test(reason))) {
        rescues.finish(r.id, "void", reason);
        await notifyBorrower(borrower, `❌ Your pre-signed rescue was rejected: ${reason}. Sign a new one with /rescue.`);
      } else {
        console.error(`rescue ${r.id} not submitted: ${reason}`);
      }
    }
  }
}

export async function keeperStatus() {
  const balance = await client.getBalance({ address: keeperAccount.address }).catch(() => null);
  return { address: keeperAccount.address, balanceWei: balance?.toString() ?? null, enabled: config.keeperEnabled };
}
