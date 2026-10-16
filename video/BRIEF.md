# Vigil demo film: brief

## Goal
- **Kind:** judge demo, about 2:00 (rules ask for "a 2-minute pitch video").
- **Audience:** the Mezo core team scoring the Buildathon (integration 30%, product 30%, tech 20%, UX 10%, materials 10%).
- **The one thing they must understand:** Vigil warns MUSD borrowers about liquidation *and* redemption, and a rescue they pre-signed is executed through Mezo's own contract. It works on testnet today: here are the transactions.
- **Where it appears:** YouTube link in the Akindo form; also linked from the README. 16:9, 1920×1080, 30 fps.
- **Hard limits:** about 2 minutes. Upload is YouTube (public or unlisted). Posting needs the user's explicit OK.
- **Muted playback:** burned-in captions carry the whole story (user preference).

## Truth sheet (the film may only show what is here)
| Claim / number / screen | Evidence | Status |
|---|---|---|
| Web app: Position, Reserve, Rescue and Log tabs | `assets/capture/` (live capture of vigil-mezo.up.railway.app, 2026-10-16) | live, Mezo testnet |
| Burner loan: 148.86% ratio, liquidation $60,563, #84 of 247 in the redemption queue | Position capture, 2026-10-16. Values move with the BTC price | live read, testnet |
| Lowest testnet loan was 1.1% from liquidation and #1 of 244 in the queue | Vigil monitor read 2026-10-15 (trove 0xda04…aaaa); deck slide 3 | testnet observation, dated |
| Rescue: 300 MUSD repaid, ratio 130.94% → 148.77% | tx 0x36505f76…8347, `Rescued` event; `docs/evidence.md` | testnet, submitted by the live keeper |
| Rescue tx shows Success, method `rescue`, VigilReserve, 300 MUSD burnt | `assets/explorer/rescue-tx/` | testnet |
| Refused: `AboveTrigger` | tx 0x94b9e31e…17da, `assets/explorer/reject-above/` | testnet |
| Refused: Mezo `Invalid signature` (amount changed) | tx 0x5400e79b…7168, `assets/explorer/reject-tamper/` | testnet |
| VigilReserve source verified (exact match) | `assets/explorer/contract/` | testnet |
| 12/12 fork tests | `forge test` output, `docs/evidence.md` | local, against forked testnet |
| Telegram bot alerts and /watch card | **NEEDED: screen recording from the user's phone** | live |

**Must be labelled:**
- The test loan's setup transactions were scripted; only the rescue came from the live keeper.
- Everything runs on Mezo testnet; the app's own "Mezo testnet" badge stays visible.
- Rescue needs an EVM wallet.
- The roadmap is planned, not shipped.

## Inputs
- **Product:** https://vigil-mezo.up.railway.app, borrower `0x16f2981DF2027e66857e3a857d6d3B2F858eCB4f` (project burner, testnet).
- **Brand:** `../brand/` (mark, lockup). Navy #0B0F17, amber #F5A524, warm light #F4F1EA. Space Grotesk headings, IBM Plex Sans body, JetBrains Mono for numbers.
- **Music:** synthesized in code (calm, ~100 BPM bed) plus UI click and tick SFX.
- **Voice:** proposed Kokoro offline narration (no key, no cost, as on Nkwado), or captions only. **User to choose.**

## Gates
1. Brief and truth sheet agreed ← **we are here**
2. Shot list agreed (`docs/shotlist.md`)
3. Stills and contact sheet reviewed, scores in `docs/review_log.md`
4. Hardest 2–4 s checked with a strip; `--verify` deterministic
5. Full render, mix, `check.mjs` (contact, phone, loudness), watched with sound
6. Deliverables: `out/final.mp4`, poster, contact sheet, credits line
