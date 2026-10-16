# Review log

Scores 1–10: hook · readability (phone) · motion · variety · composition · truthfulness (gate) · sound sync.

## Round 1 (one sheet per second, plus 12 key frames)
Scores 6 · 6 · 7 · 8 · 6 · pass · n/a.
1. The phone overlaps the caption bar in s01 and s03.
2. Highlight rings fall outside the visible crop in s04 and s08; zooms clip the left edge of text in s03 and s05.
3. Source lines collide with two-line captions.

Fixes: smaller phone; rings clipped to their view; s04, s05 and s08 reframed; sources moved to the top band.

## Round 2
Scores 7 · 8 · 8 · 8 · 7 · pass.
1. Zooming inside the narrow phone crops card lines (hook, s03).
2. The testnet stat in s02 overflows the right edge.
3. The contract shot is framed too wide.

Fixes: camera close-up by scaling the whole phone (every line stays full width); stat shortened and resized; contract camera tightened.

## Round 3 (key frames + strips across the iris at 21.9 s and the push at 35.4 s)
Scores 8 · 8 · 8 · 8 · 8 · pass · 8 (cues derived from the timeline).
The hook opens on the real alert card; rings follow the narration one at a time; transitions are clean frame to frame.
`--verify` deterministic across 12 hand-off times.

## Round 4 (encoded master)
- **Dead stretch:** s07 opened on an empty screen for about 2 s. Fixed: both explorer cards enter at once, dimmed, and each verdict lands on its narration line. Re-rendered that range only.
- **Master:** 99.60 s, 1920×1080, 30 fps, H.264 + AAC; −16.2 LUFS integrated, −1.4 dBTP true peak. Phone sheet readable.
- **Known look:** the push transitions show about 6 frames of 3-subframe motion blur (stepped smear) at full speed. Accepted.
