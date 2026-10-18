/* Powergrade engine
   1. Brief → target personality (industry + business model + audiences + tier + manual overrides)
   2. Score every direction: personality fit, category fit (by strategy), audience/model tag fit, tier fit
   3. Pick a diverse shortlist (maximal marginal relevance), so the top N aren't near-duplicates
   4. Turn a direction + its tuning into render tokens, with contrast QA against the audience's floor
   5. Explain every pick in plain language, citing the reference library */
window.PG = window.PG || {};

(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- colour ---------- */
  const hexToRgb = (h) => {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  };
  const hslToRgb = (h, s, l) => {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  };
  const shift = (hex, dh, ds) => {
    const [h, s, l] = rgbToHsl(...hexToRgb(hex));
    if (s < 0.06) return hex.toUpperCase();
    return rgbToHex(...hslToRgb(h + dh, clamp(s * (1 + ds / 100), 0, 1), l));
  };
  const mix = (a, b, t) => {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  };
  const lum = (hex) => {
    const c = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bestOn = (bg, options) => options.reduce((best, c) => (contrast(bg, c) > contrast(bg, best) ? c : best), options[0]);
  /* Move `fg` toward the ink extreme until it reaches `target` against `bg`. */
  const ensure = (fg, bg, target, ink) => {
    let c = fg;
    for (let i = 1; i <= 10 && contrast(c, bg) < target; i++) c = mix(fg, ink, i / 10);
    return c;
  };
  const hueOf = (hex) => rgbToHsl(...hexToRgb(hex))[0];
  const satOf = (hex) => rgbToHsl(...hexToRgb(hex))[1];

  PG.color = { hexToRgb, rgbToHex, mix, lum, contrast, shift, bestOn, hueOf, satOf };

  /* ---------- seeded random ---------- */
  PG.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  PG.hash = (str) => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* ---------- brief → target personality ---------- */
  PG.targetAxes = function (brief) {
    const ind = PG.byId(PG.INDUSTRIES, brief.industry);
    const fn = PG.byId(PG.FUNCTIONS, brief.func);
    const tier = PG.byId(PG.TIERS, brief.tier);
    const out = {};
    PG.AXES.forEach(({ id }) => {
      let v = ind ? ind.axes[id] : 50;
      if (fn && fn.shift[id]) v += fn.shift[id];
      (brief.audiences || []).forEach((aid, i) => {
        const a = PG.byId(PG.AUDIENCES, aid);
        if (a && a.shift[id]) v += a.shift[id] * (i === 0 ? 1 : 0.5);
      });
      if (id === 'exclusive' && tier) v = v * 0.45 + tier.exclusive * 0.55;
      out[id] = clamp(Math.round(v), 0, 100);
    });
    Object.keys(brief.manual || {}).forEach((k) => { if (brief.manual[k] != null) out[k] = brief.manual[k]; });
    return out;
  };

  /* ---------- scoring ---------- */
  const CATEGORY_FIT = {
    conform: { convention: 1, adjacent: 0.7, neutral: 0.3, avoid: 0 },
    balance: { convention: 0.8, adjacent: 0.9, neutral: 0.5, avoid: 0.05 },
    disrupt: { convention: 0.1, adjacent: 0.55, neutral: 0.95, avoid: 0.35 }
  };
  PG.categoryRole = function (dirId, ind) {
    if (!ind) return 'neutral';
    if (ind.convention.includes(dirId)) return 'convention';
    if (ind.adjacent.includes(dirId)) return 'adjacent';
    if (ind.avoid.includes(dirId)) return 'avoid';
    return 'neutral';
  };
  const axisDistance = (a, b) => Math.sqrt(PG.AXES.reduce((s, { id }) => s + Math.pow((a[id] - b[id]) / 100, 2), 0) / PG.AXES.length);

  PG.scoreDirection = function (dir, brief, target) {
    const ind = PG.byId(PG.INDUSTRIES, brief.industry);
    const fn = PG.byId(PG.FUNCTIONS, brief.func);
    const role = PG.categoryRole(dir.id, ind);
    const axis = clamp(1 - axisDistance(dir.axes, target) * 2.4, 0, 1);
    const category = CATEGORY_FIT[brief.strategy || 'balance'][role];

    let audRaw = 0; const audHits = [], audMiss = [];
    (brief.audiences || []).forEach((aid, i) => {
      const a = PG.byId(PG.AUDIENCES, aid); if (!a) return;
      const w = i === 0 ? 1 : 0.5;
      a.boost.forEach((tg) => { if (dir.tags.includes(tg)) { audRaw += w; audHits.push(tg); } });
      a.penalize.forEach((tg) => { if (dir.tags.includes(tg)) { audRaw -= 1.5 * w; audMiss.push({ tag: tg, aud: a.name }); } });
    });
    const audience = clamp(0.45 + audRaw * 0.14, 0, 1);

    let fnRaw = 0;
    if (fn) {
      fn.boost.forEach((tg) => { if (dir.tags.includes(tg)) fnRaw += 1; });
      fn.penalize.forEach((tg) => { if (dir.tags.includes(tg)) fnRaw -= 1.5; });
    }
    const func = clamp(0.45 + fnRaw * 0.18, 0, 1);

    const ti = PG.TIERS.findIndex((x) => x.id === brief.tier);
    const near = dir.tiers.some((x) => Math.abs(PG.TIERS.findIndex((y) => y.id === x) - ti) === 1);
    const tier = dir.tiers.includes(brief.tier) ? 1 : near ? 0.45 : 0;

    const total = 0.34 * axis + 0.30 * category + 0.16 * audience + 0.08 * func + 0.12 * tier;
    return { id: dir.id, total: Math.round(total * 100), parts: { axis, category, audience, func, tier }, role, audHits: [...new Set(audHits)], audMiss };
  };

  /* Rank all, then pick a diverse shortlist with maximal marginal relevance. */
  PG.rank = function (brief, n) {
    const target = PG.targetAxes(brief);
    const scored = PG.DIRECTIONS.map((d) => ({ dir: d, score: PG.scoreDirection(d, brief, target) }))
      .sort((a, b) => b.score.total - a.score.total);
    const picked = [];
    const pool = scored.slice();
    const sim = (a, b) => {
      const ax = 1 - axisDistance(a.axes, b.axes) * 2;
      const img = a.imagery[0] === b.imagery[0] ? 1 : 0;
      const hueGap = Math.abs(hueOf(a.palettes[0].primary) - hueOf(b.palettes[0].primary));
      const hue = 1 - Math.min(hueGap, 360 - hueGap) / 180;
      return 0.6 * ax + 0.2 * img + 0.2 * hue;
    };
    while (picked.length < n && pool.length) {
      let bestI = 0, bestV = -Infinity;
      pool.forEach((c, i) => {
        const maxSim = picked.length ? Math.max(...picked.map((p) => sim(c.dir, p.dir))) : 0;
        const v = 0.72 * c.score.total - 0.28 * maxSim * 100;
        if (v > bestV) { bestV = v; bestI = i; }
      });
      picked.push(pool.splice(bestI, 1)[0]);
    }
    return { target, all: scored, shortlist: picked };
  };

  /* ---------- tokens ---------- */
  PG.defaultTune = (dir, seed) => ({ dir: dir.id, pal: 0, hue: 0, sat: 0, mode: 'auto', radius: null, density: null, display: null, body: null, upper: null, imagery: null, button: null, seed: seed || PG.hash(dir.id) % 9973 });

  PG.tokens = function (dir, tune, brief) {
    const p = dir.palettes[tune.pal] || dir.palettes[0];
    const S = (c) => shift(c, tune.hue, tune.sat);
    let bg = p.bg, surface = p.surface, ink = p.ink, muted = p.muted;
    let primary = S(p.primary), secondary = S(p.secondary), accent = S(p.accent);
    const native = lum(bg) < 0.2 ? 'dark' : 'light';
    const mode = tune.mode === 'auto' ? native : tune.mode;
    if (mode !== native) {
      if (mode === 'dark') {
        const base = mix('#0B0B0D', satOf(primary) > 0.15 ? primary : '#0B0B0D', 0.07);
        bg = base; surface = mix(base, '#FFFFFF', 0.06); ink = p.bg; muted = mix(p.bg, base, 0.38);
      } else {
        const base = mix('#FFFFFF', satOf(primary) > 0.15 ? primary : '#FFFFFF', 0.04);
        bg = base; surface = mix(base, '#000000', 0.035); ink = p.bg; muted = mix(p.bg, base, 0.4);
      }
      if (contrast(primary, bg) < 1.6) primary = ink;
      if (contrast(secondary, bg) < 1.3) secondary = mix(ink, bg, 0.5);
    }
    const auds = (brief && brief.audiences || []).map((a) => PG.byId(PG.AUDIENCES, a)).filter(Boolean);
    const floor = Math.max(4.5, ...auds.map((a) => a.contrast));
    const minBody = Math.max(16, ...auds.map((a) => a.minBody));
    const fixes = [];
    const ink0 = ink;
    ink = ensure(ink, bg, floor, lum(bg) > 0.4 ? '#000000' : '#FFFFFF');
    if (ink !== ink0) fixes.push('Body text darkened to meet ' + floor + ':1');
    const muted0 = muted;
    muted = ensure(muted, bg, floor === 7 ? 7 : 4.5, ink);
    if (muted !== muted0) fixes.push('Secondary text adjusted to meet ' + (floor === 7 ? 7 : 4.5) + ':1');
    const onPrimary = bestOn(primary, [ink, bg, '#FFFFFF', '#111111']);
    const onSecondary = bestOn(secondary, [ink, bg, '#FFFFFF', '#111111']);
    const primaryText = contrast(primary, bg) >= 3 ? primary : ink;
    const line = mix(ink, bg, 0.82);
    const display = tune.display || dir.type.display;
    const body = tune.body || dir.type.body;
    const mono = dir.type.mono || 'JetBrains Mono';
    [display, body, mono].forEach(PG.loadFont);
    const upper = tune.upper != null ? tune.upper : dir.type.case === 'upper';
    const radius = tune.radius != null ? tune.radius : dir.shape.radius;
    const density = tune.density != null ? tune.density : dir.layout.density;
    const btn = tune.button || dir.shape.button;
    const rBtn = btn === 'pill' ? 999 : btn === 'underline' || btn === 'square' ? 0 : radius;

    const t = {
      dirId: dir.id, mode, bg, surface, ink, muted, primary, onPrimary, primaryText, secondary, onSecondary, accent, line,
      display, body, mono,
      fd: PG.fontStack(display), fb: PG.fontStack(body), fm: PG.fontStack(mono),
      fdw: PG.fontWeight(display, dir.type.dw), fbw: PG.fontWeight(body, dir.type.bw || 400), fbBold: PG.fontWeight(body, 700),
      upper, track: dir.type.track + (upper && dir.type.track < 0.02 ? 0.03 : 0), italic: !!dir.type.italic, scale: dir.type.scale,
      radius, rBtn, button: btn, stroke: dir.shape.stroke, density, pad: 1.35 - density * 0.6,
      hero: dir.layout.hero, imagery: tune.imagery || dir.imagery[0], mark: dir.mark, seed: tune.seed,
      floor, minBody, fixes
    };
    t.qa = [
      { label: 'Body text', ratio: contrast(ink, bg), need: floor },
      { label: 'Secondary text', ratio: contrast(muted, bg), need: floor === 7 ? 7 : 4.5 },
      { label: 'Button label', ratio: contrast(onPrimary, primary), need: 4.5 },
      { label: 'Brand colour vs page (UI)', ratio: contrast(primary, bg), need: 3 }
    ];
    return t;
  };

  PG.cssVars = function (t) {
    return [
      `--bg:${t.bg}`, `--surface:${t.surface}`, `--ink:${t.ink}`, `--muted:${t.muted}`, `--primary:${t.primary}`,
      `--on-primary:${t.onPrimary}`, `--primary-text:${t.primaryText}`, `--secondary:${t.secondary}`, `--on-secondary:${t.onSecondary}`,
      `--accent:${t.accent}`, `--line:${t.line}`, `--fd:${t.fd.replace(/"/g, "'")}`, `--fb:${t.fb.replace(/"/g, "'")}`, `--fm:${t.fm.replace(/"/g, "'")}`,
      `--fdw:${t.fdw}`, `--fbw:${t.fbw}`, `--fbb:${t.fbBold}`, `--tt:${t.upper ? 'uppercase' : 'none'}`, `--trk:${t.track}em`,
      `--fst:${t.italic ? 'italic' : 'normal'}`, `--r:${t.radius}px`, `--rb:${t.rBtn}px`, `--st:${t.stroke}px`, `--pad:${t.pad.toFixed(3)}`
    ].join(';');
  };

  /* ---------- rationale ---------- */
  PG.explain = function (dir, brief, score) {
    const ind = PG.byId(PG.INDUSTRIES, brief.industry);
    const target = PG.targetAxes(brief);
    const lines = [];
    const roleText = {
      convention: `Uses the ${ind.name} category code, so buyers recognise the category instantly.`,
      adjacent: `Proven in categories next to ${ind.name}. It feels familiar but isn't the default.`,
      neutral: `Not a ${ind.name} convention, so it stands apart from category peers.`,
      avoid: `Breaks a ${ind.name} norm. High stand-out, but test it with real buyers.`
    };
    lines.push({ k: 'Category', v: roleText[score.role] });
    const auds = (brief.audiences || []).map((a) => PG.byId(PG.AUDIENCES, a)).filter(Boolean);
    if (auds.length) {
      if (score.audHits.length) lines.push({ k: 'Audience', v: `Matches what ${auds[0].name.split(' (')[0]} respond to: ${score.audHits.join(', ')}.` });
      score.audMiss.forEach((m) => lines.push({ k: 'Watch out', v: `"${m.tag}" can put off ${m.aud.split(' (')[0]}.`, warn: true }));
    }
    const tier = PG.byId(PG.TIERS, brief.tier);
    lines.push({ k: 'Price tier', v: dir.tiers.includes(brief.tier) ? `Credible at ${tier.name.toLowerCase()} price points.` : `A stretch for ${tier.name.toLowerCase()}; usually seen at ${dir.tiers.join(' / ')}.`, warn: !dir.tiers.includes(brief.tier) });
    const gaps = PG.AXES.map((a) => ({ a, d: dir.axes[a.id] - target[a.id] })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
    const g = gaps[0];
    if (Math.abs(g.d) >= 15) lines.push({ k: 'Personality', v: `Reads more ${g.d > 0 ? g.a.hi : g.a.lo} than the brief (${g.d > 0 ? '+' : ''}${g.d}). Use the tuning sliders to pull it back.` });
    else lines.push({ k: 'Personality', v: 'Within 15 points of the brief on all five personality axes.' });
    return lines;
  };

  /* References for a direction, best matches for the industry first. */
  PG.evidence = function (dir, industryId) {
    const linked = PG.REFERENCES.filter((r) => dir.refs.includes(r.id) || (r.dirs || []).includes(dir.id));
    const order = { verified: 0, likely: 1, unverified: 2 };
    return linked.sort((a, b) => ((b.ind.includes(industryId) ? 1 : 0) - (a.ind.includes(industryId) ? 1 : 0)) || (order[a.conf] - order[b.conf]));
  };

  /* ---------- export ---------- */
  PG.exportTokens = function (dir, t, brandName) {
    return JSON.stringify({
      brand: brandName, direction: dir.name, school: dir.school,
      color: { background: t.bg, surface: t.surface, text: t.ink, textMuted: t.muted, primary: t.primary, onPrimary: t.onPrimary, secondary: t.secondary, accent: t.accent, border: t.line },
      typography: { display: { family: t.display, weight: t.fdw, case: t.upper ? 'uppercase' : 'none', letterSpacing: t.track + 'em' }, body: { family: t.body, weight: t.fbw, minSizePx: t.minBody }, mono: { family: t.mono }, scaleRatio: t.scale },
      shape: { radiusPx: t.radius, buttonStyle: t.button, strokePx: t.stroke },
      layout: { density: t.density, hero: t.hero },
      imagery: t.imagery, mark: t.mark,
      accessibility: t.qa.map((q) => ({ check: q.label, ratio: +q.ratio.toFixed(2), required: q.need, pass: q.ratio >= q.need }))
    }, null, 2);
  };
  PG.exportCss = function (t) {
    return ':root {\n  ' + PG.cssVars(t).split(';').map((s) => s.replace(':', ': ')).join(';\n  ') + ';\n}';
  };
})();
