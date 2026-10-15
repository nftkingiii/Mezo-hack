# Evidence

All on Mezo testnet (chain ID 31611). Explorer: https://explorer.test.mezo.org

## VigilReserve

| Item | Value |
|---|---|
| Address | [`0x9829963c86bf6A8AC47b0996eAD58cf3e630cf3E`](https://explorer.test.mezo.org/address/0x9829963c86bf6A8AC47b0996eAD58cf3e630cf3E) |
| Deploy tx | [`0x3f8d39cc…2a75`](https://explorer.test.mezo.org/tx/0x3f8d39cc97eb9d3a59a01f610da70384e0aaed247e3ecab003a3332a6e0d2a75), block 16,174,041, status success |
| Source | Verified on the explorer (Blockscout). Solidity 0.8.24, optimizer 200 runs, via-IR, EVM paris |
| Deployed | 2026-10-15 |

Read back with `cast call` after the deploy:

| Getter | Returns | Mezo contract |
|---|---|---|
| `musd()` | `0x118917a4…c503` | MUSD |
| `priceFeed()` | `0x86bCF084…9366` | PriceFeed |
| `troveManager()` | `0xE47c80e8…6bb0` | TroveManager |
| `borrowerOpsSig()` | `0xD757e364…639e` | BorrowerOperationsSignatures |
| `MIN_TRIGGER_ICR()` | `1.1e18` | the 110% liquidation line |

## Fork tests

`forge test` in `contracts/` runs on a fork of Mezo testnet, so every repay goes through the real MUSD contracts. Only the oracle at `0x7b7c…0015` is replaced, because it doesn't work on a local fork.

12/12 passed (2026-10-15):

| Case | Expected | Result |
|---|---|---|
| Rescue below trigger | Debt drops by the signed amount; MUSD burned from the reserve; ICR improves; nonce consumed | pass |
| Above trigger | `AboveTrigger` | pass |
| Stale oracle (61 s) | `PriceFeed: Oracle is stale.` | pass |
| Amount changed after signing | `BorrowerOperationsSignatures: Invalid signature` | pass |
| Signature past deadline | `Signature expired` | pass |
| Borrower's nonce moved | `Invalid signature` (rescue void) | pass |
| Same signature replayed | `Invalid signature` | pass |
| Reserve smaller than amount | `ReserveTooSmall` | pass |
| Rescue switched off | `RescueOff` | pass |
| Stranger withdraws someone's reserve | `ReserveTooSmall(0, 1)` | pass |
| Trigger at or below 110% | `TriggerTooLow` | pass |
| `canRescue` view | Matches the guards | pass |

## Live user-flow transactions

None yet. Live rescues run through the bot and the signing page, and are recorded here separately from scripted setup transactions.
