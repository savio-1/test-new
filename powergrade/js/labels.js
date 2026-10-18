/* Artwork painters for 3D mockups. Each painter draws one printable surface (a can wrap, a carton
   front, a business card, a poster, an app screen…) onto a canvas at the size the 3D object asks for.
   Label design varies by the direction's "kit" (minimal, editorial, bold, friendly, tech). */
window.PG = window.PG || {};

(function () {
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const fontStr = (t, which, size, weight) => {
    const fam = which === 'body' ? t.body : which === 'mono' ? t.mono : t.display;
    return `${t.italic && which === 'display' ? 'italic ' : ''}${weight || (which === 'display' ? t.fdw : t.fbw)} ${Math.round(size)}px "${fam}", ${PG.FALLBACK[(PG.FONTS[fam] || {}).cls || 'sans']}`;
  };
  async function fontsReady(t) {
    if (!document.fonts) return;
    const need = [fontStr(t, 'display', 40), fontStr(t, 'body', 40), fontStr(t, 'body', 40, t.fbBold), fontStr(t, 'mono', 40)];
    await Promise.all(need.map((n) => document.fonts.load(n).catch(() => null)));
  }
  /* Text with tracking, case and optional max width (shrinks to fit). */
  function text(g, t, which, s, x, y, size, color, opts) {
    opts = opts || {};
    let str = String(s);
    const upper = which === 'display' ? (opts.upper != null ? opts.upper : t.upper) : opts.upper;
    if (upper) str = str.toUpperCase();
    const track = which === 'display' ? (opts.track != null ? opts.track : t.track) : (opts.track || 0);
    let sz = size;
    const measure = () => { g.font = fontStr(t, which, sz, opts.weight); return g.measureText(str).width + Math.max(0, str.length - 1) * track * sz; };
    if (opts.max) while (measure() > opts.max && sz > 6) sz *= 0.94;
    const w = measure();
    g.fillStyle = color; g.textBaseline = opts.base || 'alphabetic';
    let cx = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
    if (!track) { g.fillText(str, cx, y); return { w, size: sz }; }
    for (const ch of str) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + track * sz; }
    return { w, size: sz };
  }
  /* Multi-line wrapped text. */
  function para(g, t, which, s, x, y, size, color, maxW, lh, opts) {
    opts = opts || {};
    g.font = fontStr(t, which, size, opts.weight); g.fillStyle = color; g.textBaseline = 'alphabetic';
    const words = String(opts.upper ? s.toUpperCase() : s).split(' '); let line = '', yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > maxW && line) { g.fillText(line, opts.align === 'center' ? x - g.measureText(line).width / 2 : x, yy); line = w; yy += size * lh; }
      else line = test;
    }
    if (line) g.fillText(line, opts.align === 'center' ? x - g.measureText(line).width / 2 : x, yy);
    return yy;
  }
  function svgImage(svg) {
    return new Promise((res) => {
      if (!svg) return res(null);
      const im = new Image();
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
    });
  }
  async function mark(g, x, y, size, svg) { const im = await svgImage(svg); if (im) g.drawImage(im, x - size / 2, y - size / 2, size, size); return !!im; }
  async function photo(g, ctx, role, x, y, w, h, n) {
    const p = ctx.pick(role, n || 0); if (!p) { g.fillStyle = ctx.t.surface; g.fillRect(x, y, w, h); return; }
    const im = await PG.loadImage(p.file); PG.drawPhoto(g, im, p, x, y, w, h, ctx.t, ctx.grade);
  }
  const rule = (g, x, y, w, color, lw) => { g.fillStyle = color; g.fillRect(x, y, w, lw || 2); };
  function barcode(g, x, y, w, h, color) {
    g.fillStyle = '#fff'; g.fillRect(x - 10, y - 10, w + 20, h + 34);
    const r = PG.rng(77); let cx = x; g.fillStyle = color;
    while (cx < x + w) { const bw = 1 + Math.floor(r() * 4); if (r() > 0.4) g.fillRect(cx, y, bw * 1.6, h); cx += bw * 2.2; }
    g.font = `14px ${PG.FALLBACK.mono}`; g.fillText('5 012345 678900', x, y + h + 18);
  }
  function pattern(g, t, w, h, svgIm, step, alpha) {
    if (!svgIm) return; g.globalAlpha = alpha;
    for (let yy = 0, row = 0; yy < h + step; yy += step, row++) for (let xx = (row % 2) * step / 2 - step; xx < w + step; xx += step) g.drawImage(svgIm, xx, yy, step * 0.42, step * 0.42);
    g.globalAlpha = 1;
  }

  /* ---------------- painters ---------------- */
  const P = {};

  /* 360° wrap (cans, jars, cups). The front is centred at x = w/2. */
  P.wrap = async (g, w, h, ctx) => {
    const { t, c, b, kit } = ctx, cx = w / 2, bold = kit === 'bold' || kit === 'friendly';
    g.fillStyle = bold ? t.primary : kit === 'tech' ? t.ink : t.bg; g.fillRect(0, 0, w, h);
    const fg = bold ? t.onPrimary : kit === 'tech' ? t.bg : t.ink;
    if (kit === 'bold') { g.fillStyle = t.secondary; g.fillRect(0, h * 0.72, w, h * 0.28); }
    if (kit === 'friendly') { g.fillStyle = t.accent; g.beginPath(); g.arc(cx + w * 0.16, h * 0.78, h * 0.42, 0, Math.PI * 2); g.fill(); }
    if (kit === 'editorial' || kit === 'minimal') { await photo(g, ctx, 'detail', w * 0.62, 0, w * 0.38, h, 3); }
    const mk = PG.brandMark(t, b, 200, bold ? 'reverse' : kit === 'tech' ? 'inverse' : '');
    if (mk) await mark(g, cx, h * 0.24, h * 0.16, mk);
    text(g, t, 'display', b.name, cx, h * (mk ? 0.47 : 0.36), h * 0.14, fg, { align: 'center', max: w * 0.3 });
    text(g, t, 'display', c.product.name, cx, h * 0.62, h * (kit === 'bold' ? 0.12 : 0.075), kit === 'bold' ? t.onSecondary : fg, { align: 'center', max: w * 0.3 });
    text(g, t, 'body', c.product.detail, cx, h * 0.88, h * 0.035, kit === 'bold' ? t.onSecondary : fg, { align: 'center', max: w * 0.3, upper: true, track: 0.12 });
    para(g, t, 'body', c.sub, w * 0.06, h * 0.3, h * 0.03, fg, w * 0.18, 1.45);
    text(g, t, 'body', c.product.claim, w * 0.06, h * 0.2, h * 0.04, fg, { weight: t.fbBold });
    barcode(g, w * 0.86, h * 0.62, w * 0.07, h * 0.12, '#111');
  };

  /* Carton or label front (portrait or landscape). */
  P.front = async (g, w, h, ctx) => {
    const { t, c, b, kit } = ctx, u = Math.min(w, h);
    if (kit === 'minimal') {
      g.fillStyle = t.bg; g.fillRect(0, 0, w, h);
      const word = PG.brandWord; // keep reference for clarity
      text(g, t, 'display', b.name, w / 2, h * 0.16, u * 0.075, t.ink, { align: 'center', max: w * 0.8 });
      rule(g, w * 0.4, h * 0.22, w * 0.2, t.ink, Math.max(1, u * 0.003));
      text(g, t, 'display', c.product.name, w / 2, h * 0.56, u * 0.1, t.ink, { align: 'center', max: w * 0.82 });
      text(g, t, 'body', c.product.claim, w / 2, h * 0.63, u * 0.035, t.muted, { align: 'center', max: w * 0.8 });
      text(g, t, 'body', c.product.detail, w / 2, h * 0.92, u * 0.03, t.ink, { align: 'center', upper: true, track: 0.14, max: w * 0.86 });
    } else if (kit === 'editorial') {
      g.fillStyle = t.bg; g.fillRect(0, 0, w, h);
      await photo(g, ctx, 'detail', 0, h * 0.42, w, h * 0.58, 5);
      text(g, t, 'display', b.name, w * 0.08, h * 0.13, u * 0.09, t.ink, { max: w * 0.84 });
      text(g, t, 'display', c.product.name, w * 0.08, h * 0.27, u * 0.065, t.ink, { max: w * 0.84, upper: false });
      text(g, t, 'body', c.product.detail, w * 0.08, h * 0.35, u * 0.028, t.muted, { max: w * 0.84 });
      const mk = PG.brandMark(t, b, 200, 'light'); if (mk) await mark(g, w * 0.86, h * 0.88, u * 0.1, mk);
    } else if (kit === 'bold') {
      g.fillStyle = t.primary; g.fillRect(0, 0, w, h);
      g.fillStyle = t.secondary; g.fillRect(0, h * 0.66, w, h * 0.34);
      const r = text(g, t, 'display', c.product.name, w * 0.06, h * 0.5, u * 0.3, t.onPrimary, { max: w * 0.88 });
      text(g, t, 'display', b.name, w * 0.06, h * 0.14, u * 0.08, t.onPrimary, { max: w * 0.7 });
      text(g, t, 'body', c.product.claim, w * 0.06, h * 0.78, u * 0.05, t.onSecondary, { weight: t.fbBold, max: w * 0.8 });
      text(g, t, 'body', c.product.detail, w * 0.06, h * 0.92, u * 0.03, t.onSecondary, { upper: true, track: 0.1, max: w * 0.88 });
    } else if (kit === 'friendly') {
      g.fillStyle = t.bg; g.fillRect(0, 0, w, h);
      g.fillStyle = t.primary; g.beginPath(); g.arc(w * 0.5, h * 0.95, u * 0.62, 0, Math.PI * 2); g.fill();
      g.fillStyle = t.accent; g.beginPath(); g.arc(w * 0.84, h * 0.42, u * 0.14, 0, Math.PI * 2); g.fill();
      const mk = PG.brandMark(t, b, 200, ''); if (mk) await mark(g, w * 0.14, h * 0.1, u * 0.1, mk);
      text(g, t, 'display', b.name, w * (mk ? 0.22 : 0.08), h * 0.12, u * 0.06, t.ink, { max: w * 0.6 });
      text(g, t, 'display', c.product.name, w * 0.08, h * 0.32, u * 0.12, t.ink, { max: w * 0.7 });
      text(g, t, 'body', c.product.detail, w / 2, h * 0.88, u * 0.04, t.onPrimary, { align: 'center', weight: t.fbBold, max: w * 0.8 });
    } else {
      g.fillStyle = t.ink; g.fillRect(0, 0, w, h);
      g.strokeStyle = PG.color.mix(t.ink, t.bg, 0.25); g.lineWidth = 1;
      for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(w * i / 6, 0); g.lineTo(w * i / 6, h); g.stroke(); }
      text(g, t, 'mono', b.name.toUpperCase(), w * 0.06, h * 0.08, u * 0.035, t.bg, { track: 0.1 });
      text(g, t, 'display', c.product.name, w * 0.06, h * 0.6, u * 0.13, t.bg, { max: w * 0.88 });
      g.fillStyle = t.primary; g.fillRect(w * 0.06, h * 0.66, w * 0.3, u * 0.012);
      text(g, t, 'mono', c.product.detail.toUpperCase(), w * 0.06, h * 0.93, u * 0.028, t.bg, { max: w * 0.88 });
      const mk = PG.brandMark(t, b, 200, 'inverse'); if (mk) await mark(g, w * 0.88, h * 0.1, u * 0.09, mk);
    }
  };

  /* Secondary panels: side, top, back. */
  P.side = async (g, w, h, ctx) => {
    const { t, c, b, kit } = ctx, u = Math.min(w, h);
    const bgc = kit === 'bold' ? t.secondary : kit === 'tech' ? t.ink : kit === 'friendly' ? t.primary : t.surface;
    const fg = PG.color.bestOn(bgc, [t.ink, t.bg, '#FFFFFF', '#111111']);
    g.fillStyle = bgc; g.fillRect(0, 0, w, h);
    const im = await svgImage(PG.brandMark(t, b, 120, ''));
    if (im && kit !== 'tech') pattern(g, t, w, h, im, u * 0.5, 0.12);
    if (h > w) { g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); text(g, t, 'display', b.name, 0, u * 0.12, u * 0.36, fg, { align: 'center', max: h * 0.8 }); g.restore(); }
    else text(g, t, 'display', b.name, w / 2, h / 2 + u * 0.12, u * 0.36, fg, { align: 'center', max: w * 0.8 });
    para(g, t, 'body', c.features.map((f) => f[0]).join(' · '), w / 2, h * 0.92, u * 0.05, fg, w * 0.86, 1.3, { align: 'center' });
  };
  P.top = P.side;
  P.back = async (g, w, h, ctx) => {
    const { t, c, b } = ctx, u = Math.min(w, h);
    g.fillStyle = t.bg; g.fillRect(0, 0, w, h);
    text(g, t, 'display', b.name, w * 0.08, h * 0.12, u * 0.07, t.ink, { max: w * 0.8 });
    para(g, t, 'body', c.sub, w * 0.08, h * 0.22, u * 0.035, t.ink, w * 0.84, 1.5);
    c.features.forEach(([k, v], i) => { rule(g, w * 0.08, h * (0.45 + i * 0.1), w * 0.84, t.line, 2); text(g, t, 'body', k, w * 0.08, h * (0.5 + i * 0.1), u * 0.032, t.ink, { weight: t.fbBold }); text(g, t, 'body', v, w * 0.92, h * (0.5 + i * 0.1), u * 0.03, t.muted, { align: 'right', max: w * 0.4 }); });
    barcode(g, w * 0.08, h * 0.8, w * 0.32, h * 0.08, '#111');
  };

  /* Business card front/back (85 × 55 mm). */
  P.cardFront = async (g, w, h, ctx) => {
    const { t, b, kit } = ctx;
    g.fillStyle = kit === 'minimal' ? t.bg : t.primary; g.fillRect(0, 0, w, h);
    const v = kit === 'minimal' ? '' : 'reverse';
    const mk = PG.brandMark(t, b, 200, v);
    if (mk) await mark(g, w / 2, h * 0.4, h * 0.26, mk);
    text(g, t, 'display', b.name, w / 2, mk ? h * 0.74 : h * 0.56, h * 0.13, kit === 'minimal' ? t.ink : t.onPrimary, { align: 'center', max: w * 0.8 });
  };
  P.cardBack = async (g, w, h, ctx) => {
    const { t, c, b } = ctx, [name, role] = c.speaker, site = b.name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
    g.fillStyle = t.bg; g.fillRect(0, 0, w, h);
    text(g, t, 'display', name, w * 0.08, h * 0.24, h * 0.09, t.ink, { upper: false, max: w * 0.7 });
    text(g, t, 'body', role, w * 0.08, h * 0.34, h * 0.055, t.muted);
    [`${name.split(' ')[0].toLowerCase()}@${site}`, '+44 20 7946 0321', site].forEach((l, i) => text(g, t, 'body', l, w * 0.08, h * (0.7 + i * 0.09), h * 0.052, t.ink));
    const mk = PG.brandMark(t, b, 200, ''); if (mk) await mark(g, w * 0.86, h * 0.8, h * 0.18, mk);
  };

  /* Payment / key card. */
  P.payCard = async (g, w, h, ctx) => {
    const { t, b, c, kit } = ctx;
    g.fillStyle = t.primary; g.fillRect(0, 0, w, h);
    if (kit === 'editorial' || kit === 'minimal') { await photo(g, ctx, 'texture', 0, 0, w, h, 7); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, w, h); }
    else { g.fillStyle = t.secondary; g.globalAlpha = 0.9; g.beginPath(); g.arc(w * 0.92, h * 1.05, h * 0.75, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
    const light = kit === 'editorial' || kit === 'minimal';
    const fg = light ? '#FFFFFF' : t.onPrimary;
    const mk = PG.brandMark(t, b, 200, light ? 'light' : 'reverse');
    if (mk) await mark(g, w * 0.1, h * 0.15, h * 0.14, mk);
    text(g, t, 'display', b.name, w * (mk ? 0.17 : 0.07), h * 0.19, h * 0.085, fg, { max: w * 0.6 });
    text(g, t, 'mono', '4821  ••••  ••••  0193', w * 0.07, h * 0.8, h * 0.065, fg, { track: 0.05 });
    text(g, t, 'body', c.product.claim, w * 0.93, h * 0.9, h * 0.05, fg, { align: 'right' });
  };

  /* Book / notebook cover and spine. */
  P.cover = async (g, w, h, ctx) => {
    const { t, b, c, kit } = ctx;
    g.fillStyle = kit === 'bold' || kit === 'friendly' ? t.primary : kit === 'tech' ? t.ink : t.surface; g.fillRect(0, 0, w, h);
    const fg = PG.color.bestOn(kit === 'bold' || kit === 'friendly' ? t.primary : kit === 'tech' ? t.ink : t.surface, [t.ink, t.bg, '#fff', '#111']);
    if (kit === 'editorial') await photo(g, ctx, 'place', w * 0.1, h * 0.3, w * 0.8, h * 0.45, 9);
    text(g, t, 'display', b.name, w * 0.1, h * 0.14, w * 0.11, fg, { max: w * 0.8 });
    text(g, t, 'body', c.tagline, w * 0.1, h * 0.9, w * 0.035, fg, { max: w * 0.8 });
    const mk = PG.brandMark(t, b, 200, fg === t.bg || fg === '#fff' ? 'light' : ''); if (mk && kit !== 'editorial') await mark(g, w / 2, h / 2, w * 0.3, mk);
  };
  P.spine = async (g, w, h, ctx) => { const { t, b } = ctx; g.fillStyle = t.ink; g.fillRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 2); text(g, t, 'display', b.name, 0, w * 0.18, w * 0.42, t.bg, { align: 'center', max: h * 0.7 }); g.restore(); };

  /* Poster and billboard. */
  P.poster = async (g, w, h, ctx) => {
    const { t, c, b, kit } = ctx, [title, sub, when] = c.poster, m = w * 0.06;
    g.fillStyle = kit === 'bold' ? t.primary : t.bg; g.fillRect(0, 0, w, h);
    const fg = kit === 'bold' ? t.onPrimary : t.ink;
    if (kit === 'bold') {
      text(g, t, 'display', b.name, m, h * 0.42, w * 0.34, fg, { max: w - 2 * m });
      await photo(g, ctx, 'people', m, h * 0.48, w - 2 * m, h * 0.3, 11);
    } else await photo(g, ctx, kit === 'tech' ? 'detail' : 'place', m, m, w - 2 * m, h * 0.62, 11);
    text(g, t, 'display', title, m, h * 0.78, w * 0.1, fg, { max: w - 2 * m });
    text(g, t, 'body', sub, m, h * 0.84, w * 0.03, fg, { max: w - 2 * m });
    rule(g, m, h * 0.9, w - 2 * m, fg, Math.max(2, w * 0.002));
    text(g, t, 'body', when, m, h * 0.94, w * 0.025, fg, { weight: t.fbBold });
    text(g, t, 'display', b.name, w - m, h * 0.94, w * 0.03, fg, { align: 'right' });
  };
  P.billboard = async (g, w, h, ctx) => {
    const { t, c, b } = ctx;
    g.fillStyle = t.bg; g.fillRect(0, 0, w, h);
    await photo(g, ctx, 'hero', w * 0.52, 0, w * 0.48, h, 13);
    text(g, t, 'display', c.billboard, w * 0.05, h * 0.45, h * 0.24, t.ink, { max: w * 0.44 });
    const mk = PG.brandMark(t, b, 200, ''); if (mk) await mark(g, w * 0.07, h * 0.8, h * 0.14, mk);
    text(g, t, 'display', b.name, w * (mk ? 0.11 : 0.05), h * 0.84, h * 0.1, t.ink, { max: w * 0.3 });
  };

  /* Device screens (simplified app and website captures). */
  P.phone = async (g, w, h, ctx) => {
    const { t, c, b } = ctx, s = w / 390;
    g.fillStyle = t.bg; g.fillRect(0, 0, w, h);
    text(g, t, 'body', '9:41', 30 * s, 34 * s, 15 * s, t.ink, { weight: t.fbBold });
    text(g, t, 'display', c.app.greeting, 22 * s, 96 * s, 26 * s, t.ink, { max: 300 * s });
    const cy = 120 * s, ch = 210 * s, r = Math.min(t.radius + 4, 28) * s;
    g.save(); g.beginPath(); g.roundRect(22 * s, cy, w - 44 * s, ch, r); g.clip();
    g.fillStyle = t.primary; g.fillRect(0, cy, w, ch); await photo(g, ctx, 'detail', 22 * s, cy, w - 44 * s, 110 * s, 15); g.restore();
    text(g, t, 'body', c.app.metricLabel, 40 * s, cy + 145 * s, 14 * s, t.onPrimary);
    text(g, t, 'display', c.app.metric, 40 * s, cy + 190 * s, 36 * s, t.onPrimary, { max: w - 80 * s });
    text(g, t, 'body', 'Recent', 22 * s, 380 * s, 15 * s, t.ink, { weight: t.fbBold });
    c.app.items.forEach(([k, v], i) => {
      const y = 400 * s + i * 66 * s; g.fillStyle = t.surface; g.beginPath(); g.roundRect(22 * s, y, w - 44 * s, 56 * s, Math.min(t.radius, 16) * s); g.fill();
      g.fillStyle = [t.primary, t.secondary, t.accent][i]; g.beginPath(); g.roundRect(36 * s, y + 12 * s, 32 * s, 32 * s, 9 * s); g.fill();
      text(g, t, 'body', k, 82 * s, y + 34 * s, 15 * s, t.ink); text(g, t, 'body', v, w - 36 * s, y + 34 * s, 15 * s, t.ink, { align: 'right', weight: t.fbBold });
    });
    g.fillStyle = t.primary; g.beginPath(); g.roundRect(22 * s, 620 * s, w - 44 * s, 54 * s, t.rBtn > 100 ? 27 * s : t.rBtn * s); g.fill();
    text(g, t, 'body', c.cta, w / 2, 653 * s, 16 * s, t.onPrimary, { align: 'center', weight: t.fbBold });
    g.fillStyle = t.line; g.fillRect(0, h - 90 * s, w, 1);
    c.app.tabs.forEach((x, i) => text(g, t, 'body', x, w * (i + 0.5) / 4, h - 46 * s, 12 * s, i ? t.muted : t.primaryText, { align: 'center' }));
  };
  P.laptop = async (g, w, h, ctx) => {
    const { t, c, b } = ctx, s = w / 1440;
    g.fillStyle = t.bg; g.fillRect(0, 0, w, h);
    await photo(g, ctx, 'hero', w * 0.55, 0, w * 0.45, h, 17);
    text(g, t, 'display', b.name, 56 * s, 64 * s, 26 * s, t.ink);
    c.nav.slice(0, 3).forEach((n, i) => text(g, t, 'body', n, 330 * s + i * 110 * s, 62 * s, 15 * s, t.muted));
    text(g, t, 'body', c.tagline.toUpperCase(), 56 * s, h * 0.32, 14 * s, t.primaryText, { track: 0.12, weight: t.fbBold });
    const lines = c.headline.split(' '), half = Math.ceil(lines.length / 2);
    text(g, t, 'display', lines.slice(0, half).join(' '), 56 * s, h * 0.43, 64 * s, t.ink, { max: w * 0.46 });
    text(g, t, 'display', lines.slice(half).join(' '), 56 * s, h * 0.43 + 72 * s, 64 * s, t.ink, { max: w * 0.46 });
    para(g, t, 'body', c.sub, 56 * s, h * 0.66, 19 * s, t.muted, w * 0.4, 1.5);
    g.fillStyle = t.primary; g.beginPath(); g.roundRect(56 * s, h * 0.78, 200 * s, 54 * s, t.rBtn > 100 ? 27 * s : t.rBtn * s); g.fill();
    text(g, t, 'body', c.cta, 156 * s, h * 0.78 + 34 * s, 16 * s, t.onPrimary, { align: 'center', weight: t.fbBold });
  };

  /* Paper bag front and side. */
  P.bagFront = async (g, w, h, ctx) => {
    const { t, b, c, kit } = ctx, u = Math.min(w, h);
    const bg = kit === 'bold' || kit === 'friendly' ? t.primary : kit === 'tech' ? t.ink : t.bg; g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const fg = PG.color.bestOn(bg, [t.ink, t.bg, '#fff', '#111']);
    const mk = PG.brandMark(t, b, 200, bg === t.primary ? 'reverse' : bg === t.ink ? 'inverse' : '');
    if (mk) await mark(g, w / 2, h * 0.42, u * 0.32, mk);
    text(g, t, 'display', b.name, w / 2, h * (mk ? 0.7 : 0.5), u * 0.11, fg, { align: 'center', max: w * 0.8 });
    text(g, t, 'body', c.tagline, w / 2, h * 0.9, u * 0.035, fg, { align: 'center', max: w * 0.8 });
  };

  PG.PAINTERS = P;

  /* Paint a surface. role: wrap|front|side|top|back|cardFront|cardBack|payCard|cover|spine|poster|billboard|phone|laptop|bagFront */
  PG.paintSurface = async function (role, w, h, ctx) {
    await fontsReady(ctx.t);
    const cv = canvas(w, h), g = cv.getContext('2d');
    await (P[role] || P.front)(g, w, h, ctx);
    return cv;
  };
  PG._labelText = text;
})();
