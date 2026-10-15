import type { Address } from "viem";
import { addresses, client, priceFeedAbi, troveManagerAbi, TROVE_ACTIVE } from "./mezo.ts";
import type { Trove } from "./risk.ts";

export type PriceState = { ok: true; price: bigint } | { ok: false; reason: string };

export interface Snapshot {
  at: Date;
  block: bigint;
  price: PriceState;
  troves: Trove[];
}

const CHUNK = 100;

function chunks<T>(xs: T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Mezo's PriceFeed reverts when its oracle is more than 60 s old. That is a state, not an error. */
export async function readPrice(): Promise<PriceState> {
  try {
    const price = await client.readContract({
      address: addresses.priceFeed,
      abi: priceFeedAbi,
      functionName: "fetchPrice",
    });
    return { ok: true, price };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: /stale/i.test(msg) ? "oracle stale" : "price unavailable" };
  }
}

/** Reads every active trove in a handful of multicalls. */
export async function readTroves(): Promise<Trove[]> {
  const count = await client.readContract({
    address: addresses.troveManager,
    abi: troveManagerAbi,
    functionName: "getTroveOwnersCount",
  });

  const indexes = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  const owners: Address[] = [];
  for (const part of chunks(indexes)) {
    const res = await client.multicall({
      allowFailure: false,
      contracts: part.map((i) => ({
        address: addresses.troveManager,
        abi: troveManagerAbi,
        functionName: "getTroveFromTroveOwnersArray" as const,
        args: [i] as const,
      })),
    });
    owners.push(...res);
  }
  return readTrovesOf(owners);
}

export async function readTrovesOf(owners: Address[]): Promise<Trove[]> {
  const troves: Trove[] = [];
  for (const part of chunks(owners, 50)) {
    const res = await client.multicall({
      allowFailure: true,
      contracts: part.flatMap((borrower) => [
        { address: addresses.troveManager, abi: troveManagerAbi, functionName: "getEntireDebtAndColl" as const, args: [borrower] as const },
        { address: addresses.troveManager, abi: troveManagerAbi, functionName: "getTroveInterestRate" as const, args: [borrower] as const },
        { address: addresses.troveManager, abi: troveManagerAbi, functionName: "getTroveStatus" as const, args: [borrower] as const },
      ]),
    });
    part.forEach((borrower, i) => {
      const debtColl = res[i * 3];
      const rate = res[i * 3 + 1];
      const status = res[i * 3 + 2];
      if (debtColl?.status !== "success" || rate?.status !== "success" || status?.status !== "success") return;
      if (Number(status.result) !== TROVE_ACTIVE) return;
      const [coll, principal, interest] = debtColl.result as readonly bigint[];
      troves.push({ borrower, coll: coll!, principal: principal!, interest: interest!, rateBips: Number(rate.result) });
    });
  }
  return troves;
}

export async function takeSnapshot(): Promise<Snapshot> {
  const [block, price, troves] = await Promise.all([client.getBlockNumber(), readPrice(), readTroves()]);
  return { at: new Date(), block, price, troves };
}
