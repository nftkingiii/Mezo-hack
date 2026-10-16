// motion.js: pure functions of time for seek(t) films. Classic script (works over file://).
// Everything here is deterministic: same t in, same value out, in any order.
(function (root) {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (t, a, b) => clamp((t - a) / (b - a));            // 0..1 progress through [a, b]

  // Easings (use on the settle, not the change: "snap, then hold")
  const ease = k => k * k * (3 - 2 * k);
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  const easeIn = k => k * k * k;
  const easeInOut = k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const backOut = (k, s = 1.7) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);

  // Closed-form damped spring 0 -> 1 (k stiffness, d damping). Pure function of time.
  function spring(t, k = 170, d = 26) {
    if (t <= 0) return 0;
    const w0 = Math.sqrt(k), z = d / (2 * w0);
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
    }
    if (z === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    const r1 = -w0 * (z - Math.sqrt(z * z - 1)), r2 = -w0 * (z + Math.sqrt(z * z - 1));  // overdamped
    return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  }
  // Presets: [k, d]
  const SPRINGS = {
    snappy: [320, 30],   // buttons, toggles, leading edges
    base: [170, 26],     // cards, containers, camera
    heavy: [90, 20],     // big type, logo lockups
    playful: [220, 14],  // mascots, stickers: visible overshoot
  };

  // A value with several targets: sum one spring per change, so motion stays continuous
  // and frame N renders without simulating frames 0..N-1. keys: [[time, value], ...] sorted.
  function track(t, keys, k = 170, d = 26) {
    let v = keys[0][1];
    for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], k, d);
    return v;
  }
  // Same for [x, y] or any array value
  function trackN(t, keys, k, d) {
    return keys[0][1].map((_, j) => track(t, keys.map(([tt, v]) => [tt, v[j]]), k, d));
  }
  // Tab/selection indicator that stretches: leading edge stiffer than trailing edge
  function indicator(t, stops, width = 120) {
    const lead = track(t, stops, 320, 30), trail = track(t, stops, 140, 22);
    return { left: Math.min(lead, trail), right: Math.max(lead, trail) + width };
  }
  // Content inside a morphing container: enters after the morph starts, leaves before the next
  const swapAlpha = (t, tIn, tOut) => Math.min(clamp((t - tIn - .08) / .12), clamp((tOut - .1 - t) / .1));
  // Keyframes with an easing between each pair: kf(t, [[0, 0], [1, 100]], easeOut)
  function kf(t, keys, fn = ease) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) {
      const [t0, a] = keys[i - 1], [t1, b] = keys[i], k = fn((t - t0) / (t1 - t0));
      return Array.isArray(a) ? a.map((v, j) => lerp(v, b[j], k)) : lerp(a, b, k);
    }
    return keys[keys.length - 1][1];
  }
  // Seamless loop: map any t into [0, dur)
  const loopT = (t, dur) => ((t % dur) + dur) % dur;

  // Beat grid helpers. BEAT = { bpm, offset } (offset = first downbeat, seconds)
  const beatLen = g => 60 / g.bpm;
  const beatPos = (t, g) => (t - g.offset) / beatLen(g);
  const beatN = (t, g) => Math.floor(beatPos(t, g));
  const beatAt = (n, g) => g.offset + n * beatLen(g);
  const pulse = (t, g, decay = 6) => { const p = beatPos(t, g); return p < 0 ? 0 : Math.exp(-decay * (p - Math.floor(p)) * beatLen(g)); };

  // Seeded randomness, never Math.random
  function rng(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // Layout: design once at 1920x1080 (or any base), place by fractions so 9:16 / 1:1 / 16:9 reframe
  function layout(W, H) {
    const portrait = H > W, square = Math.abs(W - H) < 2;
    const u = Math.min(W, H) / 1080;                                   // 1 unit = 1px at 1080 short side
    return { W, H, u, portrait, square, cx: W / 2, cy: H / 2,
      x: f => f * W, y: f => f * H, safe: { top: H * (portrait ? .12 : .08), bottom: H * (portrait ? .18 : .08), side: W * .06 } };
  }

  Object.assign(root, { clamp, lerp, seg, ease, easeOut, easeIn, easeInOut, backOut, spring, SPRINGS, track, trackN,
    indicator, swapAlpha, kf, loopT, beatLen, beatPos, beatN, beatAt, pulse, rng, hash, layout });
})(typeof window !== 'undefined' ? window : globalThis);
