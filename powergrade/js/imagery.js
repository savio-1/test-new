/* Imagery: picks real photography for each layout slot and grades it to the direction.
   Photos come from PG.PHOTOS (js/data/photos.js). Selection is deterministic per brief + seed,
   so a board stays stable until the user shuffles it. */
window.PG = window.PG || {};

(function () {
  /* Which photo categories suit each layout slot. */
  const ROLE_CATS = {
    hero: ['lifestyle', 'portrait', 'interior', 'architecture', 'landscape', 'still', 'travel', 'fashion', 'food'],
    people: ['portrait', 'lifestyle', 'fashion', 'kids', 'sport'],
    product: ['still', 'beauty', 'food', 'texture'],
    place: ['interior', 'architecture', 'travel', 'city', 'landscape'],
    texture: ['texture', 'landscape', 'still', 'architecture'],
    detail: ['still', 'texture', 'beauty', 'food', 'interior'],
    any: null
  };
  /* Industry-specific emphasis: the first category is the industry's natural hero subject. */
  const IND_CATS = {
    finance: ['lifestyle', 'portrait', 'architecture', 'city'], insurance: ['lifestyle', 'kids', 'interior'],
    health: ['health', 'portrait', 'lifestyle'], wellness: ['lifestyle', 'landscape', 'texture', 'still'],
    beauty: ['beauty', 'still', 'portrait'], fashion: ['fashion', 'portrait', 'city'], food: ['food', 'still'],
    restaurant: ['food', 'interior', 'lifestyle'], hospitality: ['travel', 'interior', 'landscape'],
    realestate: ['architecture', 'interior'], saas: ['tech', 'lifestyle', 'portrait'], ai: ['tech', 'abstract', 'architecture', 'texture'],
    devtools: ['tech', 'texture'], edu: ['lifestyle', 'kids', 'portrait'], media: ['portrait', 'city', 'lifestyle'],
    gaming: ['tech', 'city', 'sport'], sports: ['sport', 'portrait', 'landscape'], auto: ['mobility', 'city', 'landscape'],
    energy: ['energy', 'landscape', 'architecture'], retail: ['still', 'interior', 'lifestyle'], industrial: ['architecture', 'energy', 'city'],
    professional: ['architecture', 'portrait', 'interior'], nonprofit: ['lifestyle', 'kids', 'portrait'], culture: ['architecture', 'texture', 'portrait'],
    kids: ['kids', 'lifestyle'], crypto: ['tech', 'texture', 'city']
  };

  /* Colour grade per direction. CSS filters work everywhere; 'duo' uses an SVG duotone filter. */
  const GRADES = {
    natural: '', clean: 'saturate(.92) brightness(1.03)',
    mono: 'grayscale(1) contrast(1.06)', monoHard: 'grayscale(1) contrast(1.28) brightness(.98)', monoSoft: 'grayscale(1) contrast(.9) brightness(1.06)',
    warm: 'sepia(.16) saturate(1.04)', warmSoft: 'sepia(.2) saturate(.82) contrast(.92) brightness(1.04)', warmFade: 'sepia(.3) saturate(.72) contrast(.9) brightness(1.02)',
    warmHard: 'sepia(.22) contrast(1.16) saturate(1.05)', soft: 'saturate(.8) contrast(.9) brightness(1.05)', softFade: 'saturate(.62) contrast(.86) brightness(1.07)',
    cool: 'saturate(.82) hue-rotate(-6deg) brightness(1.02)', vivid: 'saturate(1.18) contrast(1.05)', contrast: 'contrast(1.18) saturate(1.04)',
    dark: 'brightness(.8) contrast(1.15) saturate(.82)', retro: 'sepia(.32) saturate(1.28) contrast(1.04)', duo: 'duo', duoDark: 'duo'
  };
  PG.GRADE_NAMES = {
    natural: 'Natural', clean: 'Clean daylight', mono: 'Black & white', monoHard: 'Hard B&W', monoSoft: 'Soft B&W', warm: 'Warm',
    warmSoft: 'Warm, soft', warmFade: 'Faded film', warmHard: 'Warm contrast', soft: 'Soft pastel', softFade: 'Washed', cool: 'Cool',
    vivid: 'Vivid', contrast: 'Punchy', dark: 'Low key', retro: '70s film', duo: 'Duotone', duoDark: 'Dark duotone'
  };
  const DIR_GRADE = {
    swiss: 'mono', institutional: 'clean', modernist: 'clean', neofintech: 'vivid', gradient: 'cool', darkprecision: 'dark', scientific: 'cool',
    editorialLux: 'monoHard', quietLux: 'warmSoft', artdeco: 'warmHard', heritage: 'warmFade', brutalist: 'monoHard', friendlyGeo: 'vivid',
    warmHuman: 'warm', softWellness: 'soft', clinical: 'clean', organic: 'warmFade', handmade: 'natural', ecoOptimist: 'vivid', retro: 'retro',
    y2k: 'duo', bauhaus: 'mono', memphis: 'vivid', japaneseMinimal: 'softFade', magazine: 'contrast', dynamicSystem: 'mono', maximal: 'duo',
    kinetic: 'monoHard', kidsJoy: 'vivid', civic: 'clean', cyber: 'duoDark', riso: 'duo', architectural: 'monoSoft', darkLuxury: 'dark'
  };
  PG.gradeFor = (dirId, tune) => (tune && tune.grade) || DIR_GRADE[dirId] || 'natural';
  PG.GRADES = GRADES;

  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* A per-board picker so one board never repeats a photo. */
  PG.photoPicker = function (brief, t, seed) {
    const used = new Set();
    const lib = PG.PHOTOS || [];
    const ind = brief.industry;
    const pref = IND_CATS[ind] || [];
    return function pick(role, n) {
      if (!lib.length) return null;
      const cats = ROLE_CATS[role] || null;
      const score = (p) => {
        let s = (hash(seed + '|' + role + '|' + (n || 0) + '|' + p.id) % 1000) / 1000;
        if (p.industries && p.industries.includes(ind)) s += 2;
        if (cats && p.cats.some((c) => cats.includes(c))) s += 1.5;
        const pi = p.cats.reduce((best, c) => Math.min(best, pref.indexOf(c) < 0 ? 9 : pref.indexOf(c)), 9);
        if (pi < 9) s += (4 - Math.min(pi, 4)) * 0.35;
        if (t && p.tone === (t.mode === 'dark' ? 'dark' : 'light')) s += 0.3;
        if (used.has(p.id)) s -= 10;
        return s;
      };
      let best = null, bs = -Infinity;
      for (const p of lib) { const s = score(p); if (s > bs) { bs = s; best = p; } }
      if (best) used.add(best.id);
      return best;
    };
  };

  /* <img> markup for a photo filling its box, graded to the direction. */
  let DUO = 0;
  PG.photoImg = function (p, t, opts) {
    opts = opts || {};
    if (!p) return `<div class="pic-fallback" style="position:absolute;inset:0;background:linear-gradient(135deg,var(--surface),var(--secondary))"></div>`;
    const g = opts.grade || 'natural';
    let filter = GRADES[g] || '', defs = '';
    if (filter === 'duo') {
      const id = 'duo' + (++DUO);
      const dark = g === 'duoDark' || t.mode === 'dark';
      const lo = PG.color.hexToRgb(dark ? t.bg : t.ink).map((v) => (v / 255).toFixed(3));
      const hi = PG.color.hexToRgb(t.primary).map((v) => (v / 255).toFixed(3));
      defs = `<svg width="0" height="0" style="position:absolute"><filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="${lo[0]} ${hi[0]}"/><feFuncG type="table" tableValues="${lo[1]} ${hi[1]}"/><feFuncB type="table" tableValues="${lo[2]} ${hi[2]}"/></feComponentTransfer></filter></svg>`;
      filter = `url(#${id})`;
    }
    const src = opts.thumb ? p.thumb : p.file;
    return `${defs}<img class="ph" src="${src}" alt="${(p.alt || '').replace(/"/g, '&quot;')}" loading="lazy" decoding="async" style="object-position:${Math.round((p.fx ?? 0.5) * 100)}% ${Math.round((p.fy ?? 0.5) * 100)}%;${filter ? `filter:${filter};` : ''}">`;
  };

  /* Load a photo as an Image for canvas painting (same origin, so the canvas stays clean). */
  const IMG_CACHE = new Map();
  PG.loadImage = function (src) {
    if (IMG_CACHE.has(src)) return IMG_CACHE.get(src);
    const pr = new Promise((res) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    IMG_CACHE.set(src, pr);
    return pr;
  };

  /* Draw a photo into a canvas rect with cover-fit, focal point and grade (pixel-level, so it works in every browser). */
  PG.drawPhoto = function (ctx, im, p, x, y, w, h, t, grade) {
    if (!im) { ctx.fillStyle = t.surface; ctx.fillRect(x, y, w, h); return; }
    const s = Math.max(w / im.width, h / im.height);
    const sw = w / s, sh = h / s;
    const sx = Math.min(im.width - sw, Math.max(0, im.width * (p.fx ?? 0.5) - sw / 2));
    const sy = Math.min(im.height - sh, Math.max(0, im.height * (p.fy ?? 0.5) - sh / 2));
    ctx.drawImage(im, sx, sy, sw, sh, x, y, w, h);
    if (!grade || grade === 'natural') return;
    const id = ctx.getImageData(x, y, w, h), d = id.data;
    const lo = PG.color.hexToRgb(grade === 'duoDark' || t.mode === 'dark' ? t.bg : t.ink), hi = PG.color.hexToRgb(t.primary);
    const sat = { mono: 0, monoHard: 0, monoSoft: 0, soft: 0.8, softFade: 0.62, warmSoft: 0.82, warmFade: 0.72, cool: 0.82, vivid: 1.18, dark: 0.82, clean: 0.92, retro: 1.2 }[grade];
    const con = { monoHard: 1.28, contrast: 1.18, warmHard: 1.16, dark: 1.15, soft: 0.9, softFade: 0.86, monoSoft: 0.9, warmFade: 0.9, warmSoft: 0.92 }[grade] || 1;
    const bri = { dark: 0.8, softFade: 1.07, soft: 1.05, monoSoft: 1.06, clean: 1.03 }[grade] || 1;
    const warm = { warm: 14, warmSoft: 16, warmFade: 22, warmHard: 16, retro: 24 }[grade] || 0;
    const cool = grade === 'cool' ? 8 : 0;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      if (grade === 'duo' || grade === 'duoDark') {
        const k = L / 255; r = lo[0] + (hi[0] - lo[0]) * k; g = lo[1] + (hi[1] - lo[1]) * k; b = lo[2] + (hi[2] - lo[2]) * k;
      } else {
        if (sat != null) { r = L + (r - L) * sat; g = L + (g - L) * sat; b = L + (b - L) * sat; }
        r += warm - cool; b -= warm * 0.8 - cool;
        r = (r - 128) * con + 128; g = (g - 128) * con + 128; b = (b - 128) * con + 128;
        r *= bri; g *= bri; b *= bri;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    ctx.putImageData(id, x, y);
  };
})();
