# Demo film house rules

This folder makes one demo video. Claude Code reads this file on every run; these rules apply without being repeated in prompts. The `demoreel` skill has the full method.

## Render contract
- The film is a pure function of time: `window.seek(t)` paints frame t. `window.FILM = { w, h, dur, fps }`.
- No CSS transitions or animations, no setTimeout/setInterval, no requestAnimationFrame in render mode, no state carried between frames. Seeded randomness only (`rng`, `hash` in lib/motion.js), never Math.random.
- Motion comes from lib/motion.js: closed-form springs, and `track()` for any value with more than one target.
- `node render.mjs --verify=...` must print "deterministic" before a full render.

## Truth
- Real product UI only: screenshots and recordings from `capture.mjs`. Never redraw the product from imagination or invent screens, features, numbers, logos, or users.
- Every number and claim on screen has a source (tx hash, explorer link, log, dashboard). Placeholders stay visibly red until replaced.
- If the product runs in demo, mock, testnet, or local mode, the film shows that honestly (in-product label, end card, or caption). Never make a mock look live.
- Secrets live in `.env` and are referenced by name. Never type a key into a prompt, a frame, or a screenshot.

## Look
- Banned defaults: centered title on a gradient, everything fading in, corner labels and frame borders, glow on UI chrome, generic particle bursts, bouncy easing on type, lens flares, RGB split.
- One display face, one UI face, one accent color unless the brief says otherwise.
- Something new happens every 2 to 4 seconds. One focal action at a time.

## Sound
- Score and SFX are synthesized in code (`sfx.mjs`) unless a licensed track is supplied. Measure supplied tracks with `beats.mjs`.
- Cuts on downbeats, UI hits on beats, SFX about 0.03 s before the visual contact. Loudness: -14 LUFS for social, -16 for narrated judge demos.

## Loop before showing anything
1. `node render.mjs --every=0.5` and `--strip` around every fast moment. Open the images and look.
2. Score 1 to 10: hook in the first 2 s, readability at phone size, motion quality, variety, truthfulness to the product, sound sync.
3. Fix the 3 worst problems. Repeat until every score is 8 or more.
4. Only then: `--frames --sub=3`, `--encode`, `mix.mjs`, `check.mjs`.
