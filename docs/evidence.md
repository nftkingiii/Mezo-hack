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

## Live service

| Item | Value |
|---|---|
| App and API | https://vigil-production-c566.up.railway.app |
| Health | https://vigil-production-c566.up.railway.app/health |
| Revision served on 2026-10-16 | `f49ba95` (matches the pushed commit) |
| Keeper (gas only, key generated inside the service) | [`0xBE8c12D0…3934`](https://explorer.test.mezo.org/address/0xBE8c12D0546430A371d3dE375958574393113934) |
| Telegram | [@VigilMezoBot](https://t.me/VigilMezoBot) |

## Live rescue: 2026-10-16

Borrower: the project's burner wallet [`0x16f2981D…CB4f`](https://explorer.test.mezo.org/address/0x16f2981DF2027e66857e3a857d6d3B2F858eCB4f).

**Scripted setup.** These transactions were sent by `scripts/live-demo.sh` from the burner. They are not a user flow.

| Step | Tx | Result |
|---|---|---|
| Open trove: 0.04 BTC, 2,300 MUSD borrowed | [`0xbccbfb53…8b6c`](https://explorer.test.mezo.org/tx/0xbccbfb53e0abfa0ed78b98ddb820f228052e14ab96e4f27219e3b043665c8b6c) | ok. ICR ~130.8%, liquidation $68,813, #27 in the redemption queue (read from the live API) |
| Approve 400 MUSD | [`0xc71c84cf…29ba`](https://explorer.test.mezo.org/tx/0xc71c84cf3f5313b92f4cf8b99f92a5b1856f5f0cb94817fb9d1ab520d65729ba) | ok |
| Deposit 400 MUSD reserve | [`0xfccafa23…6cb5`](https://explorer.test.mezo.org/tx/0xfccafa234a2da05ee0a1ff77f96c6b00c08c02a08c5724576189439dac276cb5) | ok |
| Set trigger 120% | [`0x54c6d9a0…ae04`](https://explorer.test.mezo.org/tx/0x54c6d9a01eeedc9aed30dbe3553aa8e077b9ab43705c7cdfac8ac46943bdae04) | ok |
| Sign RepayMUSD(300 MUSD, nonce 0, 7 days); POST to the live `/api/rescue` | off-chain | `{"ok":true,"id":1}`. The service verified the signature, nonce, reserve and trigger before arming |

**Rejections (on-chain, expected to revert).**

| Attempt | Tx | Revert (replayed at the block before) |
|---|---|---|
| Rescue while the loan is above its 120% trigger | [`0x94b9e31e…17da`](https://explorer.test.mezo.org/tx/0x94b9e31e8c385f7459ec69c265a7c78dc924e0f5f60704fb8a79135f9a7417da) | `AboveTrigger(icr = 1.30885, trigger = 1.2)` from VigilReserve |
| Same signature, amount changed from 300 to 400 MUSD | [`0x5400e79b…7168`](https://explorer.test.mezo.org/tx/0x5400e79bbcf8e84252b8d37afbd2d6bd24c4c60f336ba638ccf4ac5366a77168) | `BorrowerOperationsSignatures: Invalid signature` from Mezo |

Between the two attempts the trigger was raised to 135% ([`0x794f4b5b…71fd`](https://explorer.test.mezo.org/tx/0x794f4b5b5f611a0bcc4b0554b16c62e5ca02405ea2b9667567351bf23f2471fd), scripted). That put the ~130.9% loan below its trigger.

**Rescue, submitted by the live keeper on Railway, not by the script.**

| Tx | From | Event `Rescued` |
|---|---|---|
| [`0x36505f76…8347`](https://explorer.test.mezo.org/tx/0x36505f769fecbff092c85736a9f09e1c9fc006bf4454d387effe70a8ad5e8347), block 16,183,495, 03:47:21 UTC | keeper `0xbe8c12d0…3934` | amount **300 MUSD**, price $81,910.87, ICR **130.94% → 148.77%** |

Read back after the rescue:

| What | Value |
|---|---|
| Vigil reserve | 400 → 100 MUSD |
| Mezo `getNonce(borrower)` | 0 → 1, so the signature cannot be replayed |
| Trove debt | 2,502.30 → 2,202.30 MUSD |
| Service log | `/api/rescues` shows #1 `executed` with the same tx hash |

**Not yet done:** a rescue signed by a real user in a wallet through the web page. Everything above was set up by script; only the rescue tx came from the live service.
