/* Powergrade Logo Lab: mark families, a grid constructor, wordmark treatments and reference lessons.
   Pure generator logic. Everything renders to SVG strings; nothing touches the page except an
   offscreen canvas used to measure glyphs (so letters can be optically centred and wordmarks get a tight viewBox).

   API
     PG.MARK_FAMILIES           [{ id, name, group, desc, params, render(p, c) }]  render → inner SVG for viewBox 0 0 100 100
     PG.MARK_PRESETS            [{ id, name, family, params, note, directions, industries }]
     PG.renderMark(id, params, c, sizePx, opts)   → full <svg> string (opts.background paints c.bg)
     PG.markDefaults(id)        → default params for a family
     PG.randomMarkParams(id, seed) → a random but valid param set
     PG.GRIDMARK                { tiles, presets, render(spec, c), random(seed, cols, rows, opts) }
     PG.WORDMARK_STYLES         [{ id, name, desc, inspiredBy, font, weight, case, tracking, params, render(name, c, p) }]
     PG.renderWordmark(id, name, c, params) → { svg, w, h }
     PG.wordmarkReady(styles)   → Promise; loads every face the styles need (and c.font via PG.logoFontsReady)
     PG.LOGO_LESSONS            [{ id, brand, studio, year, lesson, link: { kind: 'mark'|'wordmark', id } }]

   c = { fg, bg, accent, initial, initials, name, font, weight, seed }
   Geometry conventions (100-unit box): circles r40, squares 71 wide, triangles and bursts a little larger
   so marks read at the same optical size in a grid; default stroke 7. */
window.PG = window.PG || {};

(function (PG) {
  'use strict';

  /* ---------- basics ---------- */
  let CALL = 0;
  const uid = () => 'll' + (++CALL).toString(36) + '_';
  const f = (n) => { const v = Math.round(n * 100) / 100; return Object.is(v, -0) ? 0 : v; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const RAD = Math.PI / 180;
  const P = (cx, cy, r, deg) => [cx + r * Math.cos(deg * RAD), cy + r * Math.sin(deg * RAD)];
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  function hash(s) {
    let h = 2166136261 >>> 0;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = (typeof seed === 'number' ? Math.floor(seed * 2654435761) : hash(seed)) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  /* attribute helper: el('circle', {cx: 5, fill: '#000'}) */
  function attrs(o) {
    let s = '';
    for (const k in o) {
      const v = o[k];
      if (v == null || v === false) continue;
      s += ` ${k}="${typeof v === 'number' ? f(v) : v}"`;
    }
    return s;
  }
  const el = (tag, o, inner) => (inner == null ? `<${tag}${attrs(o)}/>` : `<${tag}${attrs(o)}>${inner}</${tag}>`);
  const col = (c, k) => (k === 'accent' ? c.accent : k === 'bg' ? c.bg : k === 'none' ? 'none' : c.fg);

  /* ---------- path builders ---------- */
  const circleD = (cx, cy, r) => `M${f(cx - r)},${f(cy)}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`;
  const ellipseD = (cx, cy, rx, ry) => `M${f(cx - rx)},${f(cy)}a${f(rx)},${f(ry)} 0 1,0 ${f(2 * rx)},0a${f(rx)},${f(ry)} 0 1,0 ${f(-2 * rx)},0Z`;
  const polyD = (pts, closed = true) => pts.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ',' + f(p[1])).join('') + (closed ? 'Z' : '');
  /* arc from a0 to a1 degrees (clockwise on screen when a1 > a0) */
  function arcD(cx, cy, r, a0, a1, move = true) {
    const span = a1 - a0;
    if (Math.abs(span) >= 359.99) {
      const m = P(cx, cy, r, a0), h = P(cx, cy, r, a0 + 180 * Math.sign(span));
      const sw = span > 0 ? 1 : 0;
      return `${move ? 'M' + f(m[0]) + ',' + f(m[1]) : ''}A${f(r)},${f(r)} 0 1,${sw} ${f(h[0])},${f(h[1])}A${f(r)},${f(r)} 0 1,${sw} ${f(m[0])},${f(m[1])}`;
    }
    const p0 = P(cx, cy, r, a0), p1 = P(cx, cy, r, a1);
    return `${move ? 'M' + f(p0[0]) + ',' + f(p0[1]) : ''}A${f(r)},${f(r)} 0 ${Math.abs(span) > 180 ? 1 : 0},${span > 0 ? 1 : 0} ${f(p1[0])},${f(p1[1])}`;
  }
  /* annular sector (r0 may be 0 for a pie slice) */
  function sectorD(cx, cy, r0, r1, a0, a1) {
    if (r0 <= 0.01) {
      return `M${f(cx)},${f(cy)}L${P(cx, cy, r1, a0).map(f).join(',')}${arcD(cx, cy, r1, a0, a1, false)}Z`;
    }
    const q = P(cx, cy, r0, a1);
    return `${arcD(cx, cy, r1, a0, a1)}L${f(q[0])},${f(q[1])}${arcD(cx, cy, r0, a1, a0, false)}Z`;
  }
  const regPts = (cx, cy, r, n, rot = -90) => range(n).map((i) => P(cx, cy, r, rot + (360 / n) * i));
  /* polygon with true circular corner radii (clamped so neighbouring corners never overlap) */
  function roundPolyD(pts, rad) {
    if (!rad || rad < 0.05) return polyD(pts);
    const n = pts.length;
    let d = '';
    for (let i = 0; i < n; i++) {
      const A = pts[(i - 1 + n) % n], Pp = pts[i], B = pts[(i + 1) % n];
      const v1 = [A[0] - Pp[0], A[1] - Pp[1]], v2 = [B[0] - Pp[0], B[1] - Pp[1]];
      const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
      const u1 = [v1[0] / l1, v1[1] / l1], u2 = [v2[0] / l2, v2[1] / l2];
      const ang = Math.acos(clamp(u1[0] * u2[0] + u1[1] * u2[1], -1, 1));
      let t = rad / Math.tan(ang / 2);
      t = Math.min(t, l1 / 2, l2 / 2);
      const r = t * Math.tan(ang / 2);
      const p1 = [Pp[0] + u1[0] * t, Pp[1] + u1[1] * t], p2 = [Pp[0] + u2[0] * t, Pp[1] + u2[1] * t];
      const turn = (Pp[0] - A[0]) * (B[1] - Pp[1]) - (Pp[1] - A[1]) * (B[0] - Pp[0]);
      d += (i ? 'L' : 'M') + f(p1[0]) + ',' + f(p1[1]) + `A${f(r)},${f(r)} 0 0,${turn > 0 ? 1 : 0} ${f(p2[0])},${f(p2[1])}`;
    }
    return d + 'Z';
  }
  /* open polyline with rounded corners (for continuous-line marks) */
  function roundLineD(pts, rad, closed) {
    if (closed) return roundPolyD(pts, rad);
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const A = pts[i - 1], Pp = pts[i], B = pts[i + 1];
      const l1 = Math.hypot(A[0] - Pp[0], A[1] - Pp[1]), l2 = Math.hypot(B[0] - Pp[0], B[1] - Pp[1]);
      const t = Math.min(rad, l1 / 2, l2 / 2);
      const p1 = [Pp[0] + (A[0] - Pp[0]) / l1 * t, Pp[1] + (A[1] - Pp[1]) / l1 * t];
      const p2 = [Pp[0] + (B[0] - Pp[0]) / l2 * t, Pp[1] + (B[1] - Pp[1]) / l2 * t];
      d += `L${f(p1[0])},${f(p1[1])}Q${f(Pp[0])},${f(Pp[1])} ${f(p2[0])},${f(p2[1])}`;
    }
    const z = pts[pts.length - 1];
    return d + `L${f(z[0])},${f(z[1])}`;
  }
  /* smooth closed curve through points (Catmull-Rom → cubic Bézier) */
  function smoothD(pts, closed = true, tension = 1) {
    const n = pts.length;
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];
      const k = tension / 6;
      d += `C${f(p1[0] + (p2[0] - p0[0]) * k)},${f(p1[1] + (p2[1] - p0[1]) * k)} ${f(p2[0] - (p3[0] - p1[0]) * k)},${f(p2[1] - (p3[1] - p1[1]) * k)} ${f(p2[0])},${f(p2[1])}`;
    }
    return d + (closed ? 'Z' : '');
  }
  /* vesica (lens) from point a to point b, half-width w at the middle */
  function vesicaD(ax, ay, bx, by, w) {
    const L = Math.hypot(bx - ax, by - ay);
    const s = Math.max(0.01, w);
    const rho = (L * L / 4 + s * s) / (2 * s);
    return `M${f(ax)},${f(ay)}A${f(rho)},${f(rho)} 0 0,1 ${f(bx)},${f(by)}A${f(rho)},${f(rho)} 0 0,1 ${f(ax)},${f(ay)}Z`;
  }
  /* superellipse */
  function squircleD(cx, cy, hx, hy, n = 4.5) {
    const pts = range(96).map((i) => {
      const t = (i / 96) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      return [cx + hx * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), cy + hy * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
    });
    return polyD(pts);
  }
  function bboxOf(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  /* scale + centre a point set into a box of size w×h around (cx, cy) */
  function fitPts(sets, w, h, cx = 50, cy = 50) {
    const b = bboxOf([].concat(...sets));
    const k = Math.min(w / (b.w || 1), h / (b.h || 1));
    return { k, sets: sets.map((s) => s.map((p) => [cx + (p[0] - b.cx) * k, cy + (p[1] - b.cy) * k])) };
  }
  const MASK_BOX = 'x="-1000" y="-1000" width="8000" height="3000"';
  const maskEl = (id, inner, base = '#fff') => `<mask id="${id}" maskUnits="userSpaceOnUse" ${MASK_BOX}><rect ${MASK_BOX} fill="${base}"/>${inner}</mask>`;
  const clipEl = (id, inner) => `<clipPath id="${id}">${inner}</clipPath>`;
  /* half-plane (as a big rotated rect) on the +normal side of a line through (cx,cy) at angle deg */
  const halfPlane = (cx, cy, deg, off = 0, side = 1) => `<rect x="-300" y="${side > 0 ? f(off) : -600 + f(off)}" width="600" height="600" transform="translate(${f(cx)} ${f(cy)}) rotate(${f(deg)})"/>`;

  /* smooth periodic noise r(θ) built from a few seeded sines */
  function periodicNoise(seed, octaves = 4) {
    const r = rng(seed);
    const terms = range(octaves).map((i) => ({ k: i + 2, a: (r() * 0.6 + 0.4) / (i + 1), ph: r() * Math.PI * 2 }));
    const norm = terms.reduce((s, t) => s + t.a, 0);
    return (t) => terms.reduce((s, q) => s + q.a * Math.sin(q.k * t + q.ph), 0) / norm;
  }

  /* ---------- fonts and glyph metrics ---------- */
  const stack = (font) => (PG.fontStack ? PG.fontStack(font) : `"${font}", sans-serif`);
  const svgFamily = (font) => stack(font).replace(/"/g, "'");
  const fontW = (font, w) => (PG.fontWeight ? PG.fontWeight(font, w) : w);
  const LOADED = new Set();
  function faceLoaded(font, weight, italic) {
    const key = font + '|' + weight + '|' + (italic ? 1 : 0);
    if (LOADED.has(key)) return true;
    if (typeof document === 'undefined' || !document.fonts) return false;
    let ok = false;
    try {
      document.fonts.forEach((ff) => {
        if (ok || ff.status !== 'loaded') return;
        if (ff.family.replace(/["']/g, '') !== font) return;
        if ((ff.style === 'italic' || ff.style.indexOf('oblique') === 0) !== !!italic) return;
        const ws = String(ff.weight).split(/\s+/).map(Number);
        if (weight >= ws[0] && weight <= (ws[1] || ws[0])) ok = true;
      });
    } catch (e) { /* ignore */ }
    if (ok) LOADED.add(key);
    return ok;
  }
  let CTX = null;
  function ctx2d() {
    if (CTX) return CTX;
    if (typeof document === 'undefined') return null;
    try { CTX = document.createElement('canvas').getContext('2d'); } catch (e) { CTX = null; }
    return CTX;
  }
  /* crude fallback metrics (em units) so layout is sane before a face has loaded */
  function guessGlyph(ch) {
    const up = ch !== ch.toLowerCase();
    const narrow = /[iljtfI1!.,:;']/.test(ch), wide = /[mwMW]/.test(ch);
    const adv = ch === ' ' ? 0.28 : narrow ? 0.3 : wide ? 0.86 : up ? 0.68 : 0.56;
    const a = up || /[bdfhklt0-9]/.test(ch) ? 0.72 : ch === ' ' ? 0 : 0.52;
    return { adv, l: -0.04, r: adv - 0.04, a, d: /[gjpqy]/.test(ch) ? 0.2 : 0 };
  }
  const MCACHE = new Map();
  /* Measure a run of text at 1em. Glyph x positions include kerning (prefix widths) plus tracking (em). */
  function measure(text, font, weight, italic = false, tracking = 0, wordSpace = 0) {
    text = String(text);
    const key = text + '|' + font + '|' + weight + '|' + (italic ? 1 : 0) + '|' + tracking + '|' + wordSpace;
    const loaded = faceLoaded(font, weight, italic);
    if (loaded && MCACHE.has(key)) return MCACHE.get(key);
    const cx = ctx2d();
    const chars = Array.from(text);
    let glyphs;
    if (cx) {
      cx.font = `${italic ? 'italic ' : ''}${weight} 200px ${stack(font)}`;
      let prefix = '', spaces = 0;
      glyphs = chars.map((ch, i) => {
        const x = cx.measureText(prefix).width / 200 + i * tracking + spaces * wordSpace;
        prefix += ch;
        if (ch === ' ') spaces++;
        const m = cx.measureText(ch);
        return { ch, x, adv: m.width / 200, l: m.actualBoundingBoxLeft / 200, r: m.actualBoundingBoxRight / 200, a: m.actualBoundingBoxAscent / 200, d: m.actualBoundingBoxDescent / 200 };
      });
    } else {
      let x = 0;
      glyphs = chars.map((ch) => { const g = guessGlyph(ch); const o = Object.assign({ ch, x }, g); x += g.adv + tracking + (ch === ' ' ? wordSpace : 0); return o; });
    }
    const ink = glyphs.filter((g) => g.ch.trim());
    const out = {
      glyphs,
      inkL: ink.length ? Math.min(...ink.map((g) => g.x - g.l)) : 0,
      inkR: ink.length ? Math.max(...ink.map((g) => g.x + g.r)) : 0,
      a: ink.length ? Math.max(...ink.map((g) => g.a)) : 0.7,
      d: ink.length ? Math.max(...ink.map((g) => g.d)) : 0,
      adv: glyphs.length ? glyphs[glyphs.length - 1].x + glyphs[glyphs.length - 1].adv : 0
    };
    out.w = out.inkR - out.inkL;
    if (loaded) MCACHE.set(key, out);
    return out;
  }
  /* vertical metrics of a face: cap height, x-height, ascender, descender, stem (from 'l') */
  function fontMetrics(font, weight, italic = false) {
    const H = measure('H', font, weight, italic), x = measure('x', font, weight, italic);
    const dd = measure('d', font, weight, italic), pp = measure('p', font, weight, italic), l = measure('l', font, weight, italic);
    const ii = measure('i', font, weight, italic);
    return { cap: H.a, xh: x.a, asc: dd.a, desc: pp.d, stem: l.w, iTop: ii.a, overshoot: measure('O', font, weight, italic).a - H.a };
  }
  /* one <text> element; glyph positions explicit so the SVG matches the measurement exactly */
  function textEl(glyphs, x0, y, size, font, weight, italic, extra = {}) {
    const g = glyphs.filter((q) => q.ch.trim());
    if (!g.length) return '';
    const xs = g.map((q) => f(x0 + q.x * size)).join(' ');
    return el('text', Object.assign({ x: xs, y: f(y), 'font-family': svgFamily(font), 'font-weight': weight, 'font-size': f(size), 'font-style': italic ? 'italic' : null }, extra), esc(g.map((q) => q.ch).join('')));
  }
  /* Fit a string into a box, optically centred. Uppercase centres on the cap height (ignores Q tails and overshoot). */
  function fitText(str, box, o) {
    const font = o.font, weight = o.weight, italic = !!o.italic;
    const m = measure(str, font, weight, italic, o.tracking || 0);
    const fm = fontMetrics(font, weight, italic);
    const upper = /[A-Z]/.test(str) && str === str.toUpperCase();
    let top = m.a, bot = m.d;
    if (upper && o.capAlign !== false) { top = fm.cap; bot = 0; }
    const size = Math.min(box.h / Math.max(0.01, top + bot), box.w / Math.max(0.01, m.w));
    const x = box.cx - ((m.inkL + m.inkR) / 2) * size;
    const y = box.cy + ((top - bot) / 2) * size;
    return {
      size, x, y, m, fm, top, bot,
      ink: { x0: x + m.inkL * size, x1: x + m.inkR * size, y0: y - top * size, y1: y + bot * size },
      svg: (extra) => textEl(m.glyphs, x, y, size, font, weight, italic, extra)
    };
  }
  const letterOf = (c, i = 0) => {
    const s = (c.initials || c.initial || c.name || 'A').replace(/[^\p{L}\p{N}]/gu, '');
    return (s[i] || s[0] || 'A');
  };
  /* initial letter for a mark, set in the brand face */
  function initialFit(c, box, o = {}) {
    const ch = o.ch || (c.initial || letterOf(c)).slice(0, 1);
    return fitText(ch, box, { font: o.font || c.font, weight: fontW(o.font || c.font, o.weight || c.weight || 700), italic: o.italic });
  }

  /* ---------- weave: over/under crossings for knots, loops and rings ---------- */
  /* polyline arc lengths */
  function arcLengths(pts, closed) {
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    if (closed) s.total = s[s.length - 1] + Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    else s.total = s[s.length - 1];
    return s;
  }
  function segX(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    if (t < 0 || t >= 1 || u < 0 || u >= 1) return null;
    return { t, u, p: [a[0] + r[0] * t, a[1] + r[1] * t] };
  }
  /* self-crossings of one closed polyline → [{s1, s2, p}] (arc-length params) */
  function selfCrossings(pts) {
    const n = pts.length, S = arcLengths(pts, true), out = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const x = segX(a, b, pts[j], pts[(j + 1) % n]);
        if (x) {
          const s1 = S[i] + x.t * Math.hypot(b[0] - a[0], b[1] - a[1]);
          const c2 = pts[j], d2 = pts[(j + 1) % n];
          out.push({ s1, s2: S[j] + x.u * Math.hypot(d2[0] - c2[0], d2[1] - c2[1]), p: x.p });
        }
      }
    }
    return { crossings: out, S };
  }
  /* sub-polyline of a closed curve between arc lengths s0..s1 (wraps) */
  function subPath(pts, S, s0, s1) {
    const L = S.total, out = [];
    const at = (s) => {
      s = ((s % L) + L) % L;
      let i = 0;
      while (i < pts.length - 1 && S[i + 1] < s) i++;
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const segL = (i + 1 < pts.length ? S[i + 1] : L) - S[i];
      const t = segL ? (s - S[i]) / segL : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    const steps = Math.max(4, Math.ceil((s1 - s0) / 0.8));
    for (let k = 0; k <= steps; k++) out.push(at(s0 + (s1 - s0) * k / steps));
    return out;
  }
  /* Render a closed self-crossing curve with alternating over/under.
     style 'line' = one stroke; 'ribbon' = outlined band. Single colour via a mask. */
  function weaveCurve(pts, o) {
    const id = o.id, W = o.w, gap = o.gap, rib = o.style === 'ribbon', line = o.line || W * 0.28;
    const { crossings, S } = selfCrossings(pts);
    const ev = [];
    crossings.forEach((c, k) => { ev.push({ s: c.s1, k }); ev.push({ s: c.s2, k }); });
    ev.sort((a, b) => a.s - b.s);
    const state = {};
    let over = true;
    const overS = [];
    ev.forEach((e) => {
      if (state[e.k] === undefined) { state[e.k] = over; if (over) overS.push(e.s); }
      else if (!state[e.k]) overS.push(e.s);
      over = !over;
    });
    const full = polyD(pts);
    const strokeAttrs = (w, colr) => `fill="none" stroke="${colr}" stroke-width="${f(w)}" stroke-linejoin="round"`;
    let m = `<path d="${full}" ${strokeAttrs(W, '#fff')}/>`;
    if (rib) m += `<path d="${full}" ${strokeAttrs(W - 2 * line, '#000')}/>`;
    const win = W * 1.4 + gap * 2;
    overS.forEach((s) => {
      const d = polyD(subPath(pts, S, s - win, s + win), false), d2 = polyD(subPath(pts, S, s - win - 1.5, s + win + 1.5), false);
      m += `<path d="${d}" ${strokeAttrs(W + 2 * gap, '#000')} stroke-linecap="butt"/>`;
      m += `<path d="${d2}" ${strokeAttrs(W, '#fff')} stroke-linecap="butt"/>`;
      if (rib) m += `<path d="${polyD(subPath(pts, S, s - win - 1, s + win + 1), false)}" ${strokeAttrs(W - 2 * line, '#000')} stroke-linecap="butt"/>`;
    });
    const b = bboxOf(pts);
    const pad = W + 4;
    return `<defs>${maskEl(id, m, '#000')}</defs><rect x="${f(b.x0 - pad)}" y="${f(b.y0 - pad)}" width="${f(b.w + 2 * pad)}" height="${f(b.h + 2 * pad)}" fill="${o.fill}" mask="url(#${id})"${o.clip ? ` clip-path="url(#${o.clip})"` : ''}/>`;
  }

  /* ---------- constructed monoline alphabet (cap height 100, stroke centre-lines) ---------- */
  const SKEL = {
    A: [80, 'M0,100L40,0L80,100M14.4,64H65.6'],
    B: [67, 'M0,100V0H36A23,23 0 0,1 36,46H0M36,46H40A27,27 0 0,1 40,100H0'],
    C: [88, 'M88.3,17.9A50,50 0 1,0 88.3,82.1'],
    D: [88, 'M0,0H38A50,50 0 0,1 38,100H0Z'],
    E: [64, 'M64,0H0V100H64M0,50H56'],
    F: [62, 'M62,0H0V100M0,50H54'],
    G: [100, 'M88.3,17.9A50,50 0 1,0 100,50H56'],
    H: [76, 'M0,0V100M76,0V100M0,50H76'],
    I: [0, 'M0,0V100'],
    J: [56, 'M56,0V72A28,28 0 0,1 0,72'],
    K: [70, 'M0,0V100M68,0L0,62M24,47L70,100'],
    L: [60, 'M0,0V100H60'],
    M: [92, 'M0,100V0L46,72L92,0V100'],
    N: [74, 'M0,100V0L74,100V0'],
    O: [100, 'M100,50A50,50 0 1,1 0,50A50,50 0 1,1 100,50Z'],
    P: [64, 'M0,100V0H37A27,27 0 0,1 37,54H0'],
    Q: [100, 'M100,50A50,50 0 1,1 0,50A50,50 0 1,1 100,50ZM64,64L100,100'],
    R: [68, 'M0,100V0H37A27,27 0 0,1 37,54H0M34,54L68,100'],
    S: [50, 'M46.65,12.5A25,25 0 1,0 25,50A25,25 0 1,1 3.35,87.5'],
    T: [76, 'M0,0H76M38,0V100'],
    U: [74, 'M0,0V63A37,37 0 0,0 74,63V0'],
    V: [80, 'M0,0L40,100L80,0'],
    W: [112, 'M0,0L26,100L56,16L86,100L112,0'],
    X: [74, 'M0,0L74,100M74,0L0,100'],
    Y: [78, 'M0,0L39,52L78,0M39,52V100'],
    Z: [70, 'M0,0H70L0,100H70']
  };
  /* 5×7 dot-matrix capitals */
  const DOT5 = {
    A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
    D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
    G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
    J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
    M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110',
    P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
    S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
    V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
    Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111'
  };

  /* shared param builders */
  const pR = (id, label, min, max, step, def) => ({ id, label, type: 'range', min, max, step, default: def });
  const pS = (id, label, opts, def) => {
    const options = opts.map((o) => (Array.isArray(o) ? { v: o[0], label: o[1] } : { v: o, label: String(o).charAt(0).toUpperCase() + String(o).slice(1).replace(/-/g, ' ') }));
    return { id, label, type: 'select', options, default: def === undefined ? options[0].v : def };
  };
  const pB = (id, label, def) => ({ id, label, type: 'bool', default: !!def });
  const SEED = pR('seed', 'Seed', 1, 999, 1, 7);

  /* exported internals other modules (and the test page) can reuse */
  PG.LOGOLAB = { measure, fontMetrics, fitText, rng, hash, SKEL, DOT5, svgFamily, faceLoaded };

  /* registry */
  const FAM = [];
  const fam = (id, name, group, desc, params, render) => FAM.push({ id, name, group, desc, params, render });

  /* ======================================================================
     MONOGRAM
     ====================================================================== */
  /* Containers at matched optical size. inset shrinks the outline so a stroke's outer edge lands on the same footprint. */
  function container(kind, round = 0, inset = 0) {
    switch (kind) {
      case 'square': {
        const h = 35.5 + 2.5 * round - inset;
        return { d: roundPolyD([[50 - h, 50 - h], [50 + h, 50 - h], [50 + h, 50 + h], [50 - h, 50 + h]], round * h * 0.5), lw: 52, lcy: 50, k: 1 };
      }
      case 'squircle': { const h = 37.5 - inset; return { d: squircleD(50, 50, h, h, 4.4), lw: 52, lcy: 50, k: 1 }; }
      case 'hexagon': { const r = 44 - inset / Math.cos(30 * RAD); return { d: roundPolyD(regPts(50, 50, r, 6, 0), round * 10), lw: 48, lcy: 50, k: 0.96 }; }
      case 'diamond': { const r = 47 - inset * Math.SQRT2; return { d: roundPolyD(regPts(50, 50, r, 4, -90), round * 12), lw: 36, lcy: 50, k: 0.76 }; }
      case 'arch': {
        const hw = 31.5 - inset, top = 9 + inset, bot = 91 - inset;
        return { d: `M${f(50 - hw)},${f(bot)}V${f(top + hw)}A${f(hw)},${f(hw)} 0 0,1 ${f(50 + hw)},${f(top + hw)}V${f(bot)}Z`, lw: 44, lcy: 58, k: 0.9 };
      }
      default: { const r = 40 - inset; return { d: circleD(50, 50, r), lw: 50, lcy: 50, k: 1 }; }
    }
  }
  const SHAPES = [['circle', 'Circle'], ['square', 'Square'], ['squircle', 'Squircle'], ['hexagon', 'Hexagon'], ['diamond', 'Diamond'], ['arch', 'Arch']];

  fam('mono-shape', 'Initial in a shape', 'Monogram',
    'The initial in a solid or outlined container, centred on its cap height rather than its bounding box.',
    [pS('shape', 'Shape', SHAPES, 'circle'), pS('style', 'Style', [['knockout', 'Knockout'], ['outline', 'Outline'], ['solid', 'On accent']], 'knockout'),
      pR('size', 'Letter size', 0.35, 0.72, 0.01, 0.5), pR('round', 'Corner roundness', 0, 1, 0.05, 0.2), pR('weight', 'Outline weight', 2, 12, 0.5, 5)],
    (p, c) => {
      const id = uid(), out = p.style === 'outline';
      const C = container(p.shape, p.round, out ? p.weight / 2 : 0);
      const L = initialFit(c, { cx: 50, cy: C.lcy, w: C.lw, h: 80 * p.size * C.k });
      if (p.style === 'knockout') return `<defs>${maskEl(id + 'm', L.svg({ fill: '#000' }))}</defs><path d="${C.d}" fill="${c.fg}" mask="url(#${id}m)"/>`;
      if (out) return `<path d="${C.d}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}"/>${L.svg({ fill: c.fg })}`;
      return `<path d="${C.d}" fill="${c.accent}"/>${L.svg({ fill: c.fg })}`;
    });

  fam('mono-sliced', 'Sliced initial', 'Monogram',
    'The initial cut into bands that slip along the cut: motion and precision in one gesture.',
    [pR('cuts', 'Cuts', 1, 3, 1, 1), pR('angle', 'Angle', -60, 60, 5, -20), pR('gap', 'Gap', 0, 8, 0.5, 2.5), pR('shift', 'Slip', 0, 16, 0.5, 6),
      pR('size', 'Size', 0.5, 0.8, 0.01, 0.66), pB('accent', 'Accent slice', false)],
    (p, c) => {
      const id = uid(), N = p.cuts + 1, a = p.angle;
      const L = initialFit(c, { cx: 50, cy: 50, w: 72, h: 100 * p.size });
      const nx = -Math.sin(a * RAD), ny = Math.cos(a * RAD);
      const hw = (L.ink.x1 - L.ink.x0) / 2, hh = (L.ink.y1 - L.ink.y0) / 2;
      const icx = (L.ink.x0 + L.ink.x1) / 2, icy = (L.ink.y0 + L.ink.y1) / 2;
      const e = (Math.abs(hw * nx) + Math.abs(hh * ny)) * 0.92, o = (icx - 50) * nx + (icy - 50) * ny;
      const cut = (j) => o - e + (2 * e * j) / N;
      let defs = '', body = '';
      for (let k = 0; k < N; k++) {
        const lo = k === 0 ? -300 : cut(k) + p.gap / 2, hi = k === N - 1 ? 300 : cut(k + 1) - p.gap / 2;
        defs += clipEl(id + 'c' + k, `<rect x="-300" y="${f(lo)}" width="600" height="${f(hi - lo)}" transform="translate(50 50) rotate(${f(a)})"/>`);
        const sh = (k - (N - 1) / 2) * p.shift;
        body += `<g transform="translate(${f(sh * Math.cos(a * RAD))} ${f(sh * Math.sin(a * RAD))})"><g clip-path="url(#${id}c${k})">${L.svg({ fill: p.accent && k === N - 1 ? c.accent : c.fg })}</g></g>`;
      }
      return `<defs>${defs}</defs>${body}`;
    });

  fam('mono-stencil', 'Stencil initial', 'Monogram',
    'Bridges cut through the initial like a stencil plate: industrial, honest, made.',
    [pS('bridges', 'Bridges', ['auto', 'vertical', 'horizontal', 'cross'], 'auto'), pR('width', 'Bridge width', 1.5, 7, 0.5, 3),
      pR('count', 'Bridge count', 1, 2, 1, 1), pR('size', 'Size', 0.5, 0.8, 0.01, 0.66), pS('frame', 'Container', ['none', 'circle', 'square'], 'none')],
    (p, c) => {
      const id = uid(), framed = p.frame !== 'none';
      const C = framed ? container(p.frame) : null;
      const L = initialFit(c, { cx: 50, cy: 50, w: framed ? 50 : 72, h: framed ? 80 * 0.52 : 100 * p.size });
      const ch = (c.initial || letterOf(c)).slice(0, 1);
      let o = p.bridges;
      /* round and symmetric letters split down the middle; straight-sided ones take a bridge just above centre */
      if (o === 'auto') o = /[OCGQDBPRSUHAX068obcdegpqsu]/.test(ch) ? 'vertical' : 'horizontal';
      const icx = (L.ink.x0 + L.ink.x1) / 2, icy = (L.ink.y0 + L.ink.y1) / 2 - (o === 'horizontal' ? (L.ink.y1 - L.ink.y0) * 0.16 : 0), iw = L.ink.x1 - L.ink.x0, ih = L.ink.y1 - L.ink.y0;
      const offs = p.count > 1 && o !== 'cross' ? [-0.2, 0.2] : [0];
      let bars = '';
      if (o === 'vertical' || o === 'cross') offs.forEach((d) => { bars += `<rect x="${f(icx + d * iw - p.width / 2)}" y="-100" width="${f(p.width)}" height="300"/>`; });
      if (o === 'horizontal' || o === 'cross') offs.forEach((d) => { bars += `<rect x="-100" y="${f(icy + d * ih - p.width / 2)}" width="300" height="${f(p.width)}"/>`; });
      if (!framed) return `<defs>${maskEl(id + 'm', bars.replace(/<rect /g, '<rect fill="#000" '))}</defs>${L.svg({ fill: c.fg, mask: `url(#${id}m)` })}`;
      const m = L.svg({ fill: '#000' }) + bars.replace(/<rect /g, '<rect fill="#fff" ');
      return `<defs>${maskEl(id + 'm', m)}${clipEl(id + 'k', `<path d="${C.d}"/>`)}</defs><path d="${C.d}" fill="${c.fg}" mask="url(#${id}m)"/>`;
    });

  fam('mono-dot', 'Initial and full stop', 'Monogram',
    'The initial with a single coloured point: a full stop, a superscript or a tittle. Confident and finished.',
    [pS('position', 'Dot position', [['period', 'Full stop'], ['superscript', 'Superscript'], ['tittle', 'Above']], 'period'),
      pS('shape', 'Dot shape', ['circle', 'square', 'diamond'], 'circle'), pR('dot', 'Dot size', 0.12, 0.4, 0.01, 0.24),
      pR('gap', 'Gap', 0, 0.3, 0.01, 0.07), pR('size', 'Size', 0.45, 0.75, 0.01, 0.62), pB('accent', 'Accent dot', true)],
    (p, c) => {
      const font = c.font, w = fontW(font, c.weight || 700), ch = (c.initial || letterOf(c)).slice(0, 1);
      const m = measure(ch, font, w), fm = fontMetrics(font, w);
      const upper = ch !== ch.toLowerCase();
      const cap = upper ? fm.cap : m.a, D = p.dot * cap, G = p.gap * cap;
      let dx, dy;
      if (p.position === 'period') { dx = m.inkR + G + D / 2; dy = -D / 2; }
      else if (p.position === 'superscript') { dx = m.inkR + G + D / 2; dy = -cap + D / 2; }
      else { dx = (m.inkL + m.inkR) / 2; dy = -cap - G - D / 2; }
      const x0 = m.inkL, x1 = Math.max(m.inkR, dx + D / 2), y0 = Math.min(-cap, dy - D / 2), y1 = Math.max(upper ? 0 : m.d, dy + D / 2);
      const s = Math.min(80 / (x1 - x0), (100 * p.size) / cap, 80 / (y1 - y0));
      const ox = 50 - ((x0 + x1) / 2) * s, oy = 50 - ((y0 + y1) / 2) * s;
      const X = ox + dx * s, Y = oy + dy * s, r = (D * s) / 2, fill = p.accent ? c.accent : c.fg;
      let dot;
      if (p.shape === 'square') dot = `<rect x="${f(X - r)}" y="${f(Y - r)}" width="${f(2 * r)}" height="${f(2 * r)}" fill="${fill}"/>`;
      else if (p.shape === 'diamond') dot = `<path d="${polyD(regPts(X, Y, r * 1.25, 4, -90))}" fill="${fill}"/>`;
      else dot = `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(r)}" fill="${fill}"/>`;
      return textEl(m.glyphs, ox, oy, s, font, w, false, { fill: c.fg }) + dot;
    });

  fam('mono-ligature', 'Two-letter ligature', 'Monogram',
    'Two initials fused into one sign: interlaced with a keyline, knocked out where they overlap, or multiplied.',
    [pS('mode', 'Overlap', [['halo', 'Interlaced keyline'], ['xor', 'Knockout'], ['multiply', 'Multiply'], ['outline', 'Solid + outline']], 'halo'),
      pR('overlap', 'Overlap', 0, 0.6, 0.01, 0.3), pR('stagger', 'Stagger', -0.3, 0.3, 0.01, 0), pR('size', 'Size', 0.4, 0.72, 0.01, 0.56),
      pB('accent', 'Accent second letter', true)],
    (p, c) => {
      const id = uid(), font = c.font, w = fontW(font, c.weight || 700);
      const a = letterOf(c, 0), b = letterOf(c, 1);
      const m1 = measure(a, font, w), m2 = measure(b, font, w), fm = fontMetrics(font, w);
      const cap = (a + b) === (a + b).toUpperCase() ? fm.cap : Math.max(m1.a, m2.a);
      const ov = p.overlap * Math.min(m1.w, m2.w);
      const X1 = -m1.inkL, X2 = m1.w - ov - m2.inkL, W = m1.w - ov + m2.w;
      const dy2 = p.stagger * cap, y0 = Math.min(-cap, -cap + dy2), y1 = Math.max(0, dy2);
      const s = Math.min(84 / W, (100 * p.size) / cap, 84 / (y1 - y0));
      const ox = 50 - (W / 2) * s, oy = 50 - ((y0 + y1) / 2) * s;
      const t1 = (x) => textEl(m1.glyphs, ox + X1 * s, oy, s, font, w, false, x);
      const t2 = (x) => textEl(m2.glyphs, ox + X2 * s, oy + dy2 * s, s, font, w, false, x);
      const c2 = p.accent ? c.accent : c.fg, hw = 0.075 * cap * s;
      if (p.mode === 'xor') return `<defs>${maskEl(id + 'a', t2({ fill: '#000' }))}${maskEl(id + 'b', t1({ fill: '#000' }))}</defs>${t1({ fill: c.fg, mask: `url(#${id}a)` })}${t2({ fill: c2, mask: `url(#${id}b)` })}`;
      if (p.mode === 'multiply') return `<g style="isolation:isolate">${t1({ fill: c.fg })}${t2({ fill: c2, style: 'mix-blend-mode:multiply' })}</g>`;
      if (p.mode === 'outline') return `<defs>${maskEl(id + 'a', t2({ fill: '#000', stroke: '#000', 'stroke-width': f(hw * 2), 'stroke-linejoin': 'round' }))}</defs>${t1({ fill: c.fg, mask: `url(#${id}a)` })}${t2({ fill: 'none', stroke: c2, 'stroke-width': f(hw * 0.9), 'stroke-linejoin': 'round' })}`;
      return `<defs>${maskEl(id + 'a', t2({ fill: '#000', stroke: '#000', 'stroke-width': f(hw * 2), 'stroke-linejoin': 'round' }))}</defs>${t1({ fill: c.fg, mask: `url(#${id}a)` })}${t2({ fill: c2 })}`;
    });

  fam('mono-negative', 'Negative-space initial', 'Monogram',
    'An oversized initial knocked out of a block and cropped by its edges, so the counters become the mark.',
    [pS('frame', 'Block', ['square', 'circle', ['portrait', 'Portrait']], 'square'), pR('scale', 'Letter scale', 0.7, 1.8, 0.01, 1.25),
      pR('x', 'Offset X', -0.4, 0.4, 0.01, 0.18), pR('y', 'Offset Y', -0.4, 0.4, 0.01, -0.18), pR('rotate', 'Rotate', -30, 30, 1, 0),
      pS('mode', 'Mode', [['knockout', 'Knockout'], ['crop', 'Crop on accent']], 'knockout')],
    (p, c) => {
      const id = uid();
      let d, W, H;
      if (p.frame === 'circle') { d = circleD(50, 50, 40); W = H = 80; }
      else if (p.frame === 'portrait') { d = polyD([[22, 8], [78, 8], [78, 92], [22, 92]]); W = 56; H = 84; }
      else { d = polyD([[14.5, 14.5], [85.5, 14.5], [85.5, 85.5], [14.5, 85.5]]); W = H = 71; }
      let L = initialFit(c, { cx: 50 + p.x * W, cy: 50 + p.y * H, w: 1000, h: p.scale * H });
      /* no slivers: an edge that lands within 5 units of the block edge (inside or out) is pushed just past it */
      if (p.frame !== 'circle' && !p.rotate) {
        const X0 = 50 - W / 2, X1 = 50 + W / 2, Y0 = 50 - H / 2, Y1 = 50 + H / 2;
        const near = (a, b) => Math.abs(a - b) < 5;
        let dx = 0, dy = 0;
        if (near(L.ink.x0, X0)) dx = X0 - 2 - L.ink.x0; else if (near(L.ink.x1, X1)) dx = X1 + 2 - L.ink.x1;
        if (near(L.ink.y0, Y0)) dy = Y0 - 2 - L.ink.y0; else if (near(L.ink.y1, Y1)) dy = Y1 + 2 - L.ink.y1;
        if (dx || dy) L = initialFit(c, { cx: 50 + p.x * W + dx, cy: 50 + p.y * H + dy, w: 1000, h: p.scale * H });
      }
      const rot = (s) => (p.rotate ? `<g transform="rotate(${f(p.rotate)} 50 50)">${s}</g>` : s);
      if (p.mode === 'crop') return `<defs>${clipEl(id + 'c', `<path d="${d}"/>`)}</defs><path d="${d}" fill="${c.accent}"/><g clip-path="url(#${id}c)">${rot(L.svg({ fill: c.fg }))}</g>`;
      return `<defs>${maskEl(id + 'm', rot(L.svg({ fill: '#000' })))}</defs><path d="${d}" fill="${c.fg}" mask="url(#${id}m)"/>`;
    });

  /* stroke a skeleton letter (or fall back to the brand face) inside a mask; stripes > 1 gives an inline */
  function skeletonLetter(ch, cx, cy, H, W, o) {
    const sk = SKEL[ch.toUpperCase()];
    if (!sk) return null;
    const k = H / 100, sx = sk[0] * k, n = o.lines || 1, q = W / (2 * n - 1);
    let s = '';
    for (let i = 0; i < 2 * n - 1; i++) {
      const on = (i % 2 === 0) !== !!o.invert;
      s += `<path d="${sk[1]}" fill="none" stroke="${on ? '#fff' : '#000'}" stroke-width="${f((W - i * q) / k)}" stroke-linecap="${o.cap || 'round'}" stroke-linejoin="${o.join || 'round'}" stroke-miterlimit="2.6"/>`;
    }
    return { svg: `<g transform="translate(${f(cx - sx / 2)} ${f(cy - H / 2)}) scale(${f(k * 1000) / 1000})">${s}</g>`, w: sx };
  }

  fam('mono-geo', 'Constructed initial', 'Monogram',
    'The initial drawn from circles and straight lines at one stroke weight, optionally as an inline of parallel rails.',
    [pR('weight', 'Weight', 4, 18, 0.5, 10), pR('lines', 'Inline rails', 1, 4, 1, 1), pS('cap', 'Terminals', [['round', 'Round'], ['butt', 'Flat'], ['square', 'Square']], 'butt'),
      pS('join', 'Corners', [['miter', 'Sharp'], ['round', 'Round']], 'miter'), pS('frame', 'Container', [['none', 'None'], ['ring', 'Ring'], ['disc', 'Disc'], ['square', 'Square outline']], 'none'),
      pR('size', 'Size', 0.45, 0.72, 0.01, 0.58)],
    (p, c) => {
      const id = uid(), ch = (c.initial || letterOf(c)).slice(0, 1), framed = p.frame !== 'none';
      const H = framed ? p.size * 66 : p.size * 100, W = p.weight * (H / 58);
      const sk = skeletonLetter(ch, 50, 50, H, W, { lines: p.lines, cap: p.cap, join: p.join, invert: p.frame === 'disc' });
      if (!sk) return FAM.find((q) => q.id === 'mono-shape').render({ shape: 'circle', style: 'knockout', size: 0.5, round: 0, weight: 5 }, c);
      if (p.frame === 'disc') return `<defs>${maskEl(id + 'm', `<circle cx="50" cy="50" r="40" fill="#fff"/>${sk.svg}`, '#000')}</defs><circle cx="50" cy="50" r="40" fill="${c.fg}" mask="url(#${id}m)"/>`;
      let frame = '';
      const fw = Math.max(3, W * 0.7);
      if (p.frame === 'ring') frame = `<circle cx="50" cy="50" r="${f(40 - fw / 2)}" fill="none" stroke="${c.fg}" stroke-width="${f(fw)}"/>`;
      if (p.frame === 'square') frame = `<rect x="${f(14.5 + fw / 2)}" y="${f(14.5 + fw / 2)}" width="${f(71 - fw)}" height="${f(71 - fw)}" fill="none" stroke="${c.fg}" stroke-width="${f(fw)}"/>`;
      return `<defs>${maskEl(id + 'm', sk.svg, '#000')}</defs><rect x="0" y="0" width="100" height="100" fill="${c.fg}" mask="url(#${id}m)"/>${frame}`;
    });

  fam('mono-dots', 'Dot-matrix initial', 'Monogram',
    'The initial on a 5 × 7 matrix: dots, squares or a joined pixel line. Systematic and digital.',
    [pS('shape', 'Module', ['circle', 'square', 'rounded', 'diamond'], 'circle'), pR('dot', 'Module size', 0.4, 1, 0.01, 0.82),
      pB('connect', 'Join modules', false), pB('ghost', 'Show grid', false), pS('accent', 'Accent module', ['none', 'first', 'last'], 'first')],
    (p, c) => {
      const ch = (c.initial || letterOf(c)).slice(0, 1).toUpperCase();
      const bits = DOT5[ch] || DOT5.A;
      const pitch = 74 / 7, r = (pitch / 2) * p.dot;
      const X = (i) => 50 + (i - 2) * pitch, Y = (j) => 50 + (j - 3) * pitch;
      const on = (i, j) => i >= 0 && i < 5 && j >= 0 && j < 7 && bits[j * 5 + i] === '1';
      const cells = [];
      for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (on(i, j)) cells.push([i, j]);
      const acc = p.accent === 'first' ? cells[0] : p.accent === 'last' ? cells[cells.length - 1] : null;
      const mod = (x, y, fill, op) => {
        const o = op ? ` opacity="${op}"` : '';
        if (p.shape === 'square') return `<rect x="${f(x - r)}" y="${f(y - r)}" width="${f(2 * r)}" height="${f(2 * r)}" fill="${fill}"${o}/>`;
        if (p.shape === 'rounded') return `<rect x="${f(x - r)}" y="${f(y - r)}" width="${f(2 * r)}" height="${f(2 * r)}" rx="${f(r * 0.45)}" fill="${fill}"${o}/>`;
        if (p.shape === 'diamond') return `<path d="${polyD(regPts(x, y, r * 1.2, 4, -90))}" fill="${fill}"${o}/>`;
        return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${o}/>`;
      };
      let s = '';
      if (p.ghost) for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (!on(i, j)) s += mod(X(i), Y(j), c.fg, 0.16);
      if (p.connect) {
        let d = '';
        const round = p.shape === 'circle' || p.shape === 'rounded';
        cells.forEach(([i, j]) => {
          const ln = (a, b) => { d += `M${f(X(i))},${f(Y(j))}L${f(X(a))},${f(Y(b))}`; };
          if (on(i + 1, j)) ln(i + 1, j);
          if (on(i, j + 1)) ln(i, j + 1);
          if (round && on(i + 1, j + 1) && !on(i + 1, j) && !on(i, j + 1)) ln(i + 1, j + 1);
          if (round && on(i - 1, j + 1) && !on(i - 1, j) && !on(i, j + 1)) ln(i - 1, j + 1);
        });
        if (d) s += `<path d="${d}" fill="none" stroke="${c.fg}" stroke-width="${f(2 * r)}" stroke-linecap="${round ? 'round' : 'square'}"/>`;
      }
      cells.forEach((q) => { s += mod(X(q[0]), Y(q[1]), acc === q ? c.accent : c.fg); });
      return s;
    });

  fam('mono-split', 'Split initial', 'Monogram',
    'A container cut in half: on one side the letter is knocked out, on the other it is solid. The letter survives the cut.',
    [pR('angle', 'Split angle', 0, 180, 5, 90), pS('frame', 'Container', ['circle', 'square'], 'circle'), pR('size', 'Letter size', 0.4, 0.7, 0.01, 0.56),
      pR('outline', 'Outline', 0, 6, 0.5, 2.5)],
    (p, c) => {
      const id = uid(), C = container(p.frame, 0, p.outline / 2), C0 = container(p.frame, 0, 0);
      const L = initialFit(c, { cx: 50, cy: 50, w: 54, h: 80 * p.size });
      return `<defs>${clipEl(id + 'a', halfPlane(50, 50, p.angle, 0, 1))}${clipEl(id + 'b', halfPlane(50, 50, p.angle, 0, -1))}${maskEl(id + 'm', L.svg({ fill: '#000' }))}</defs>` +
        `<g clip-path="url(#${id}a)"><path d="${C0.d}" fill="${c.fg}" mask="url(#${id}m)"/></g><g clip-path="url(#${id}b)">${L.svg({ fill: c.fg })}</g>` +
        (p.outline > 0 ? `<path d="${C.d}" fill="none" stroke="${c.fg}" stroke-width="${f(p.outline)}"/>` : '');
    });

  fam('mono-pair', 'Paired initials', 'Monogram',
    'Two initials set as a pair: side by side across a slash, stacked over a rule, or split across a diagonal.',
    [pS('layout', 'Layout', [['side', 'Side by side'], ['stack', 'Stacked'], ['diagonal', 'Diagonal']], 'side'),
      pS('divider', 'Divider', ['slash', 'rule', 'none'], 'slash'), pS('frame', 'Container', ['none', 'circle', 'square'], 'none'),
      pR('weight', 'Line weight', 1.5, 6, 0.5, 2.5), pR('size', 'Letter size', 0.28, 0.5, 0.01, 0.38)],
    (p, c) => {
      const font = c.font, w = fontW(font, c.weight || 700);
      const a = letterOf(c, 0), b = letterOf(c, 1), fm = fontMetrics(font, w);
      const ma = measure(a, font, w), mb = measure(b, font, w);
      const framed = p.frame !== 'none';
      const line = (x1, y1, x2, y2, col2) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${col2 || c.fg}" stroke-width="${f(p.weight)}"/>`;
      let s = '';
      if (p.layout === 'diagonal') {
        const H = p.size * 70, sz = H / fm.cap;
        s += textEl(ma.glyphs, 35 - ((ma.inkL + ma.inkR) / 2) * sz, 35 + H / 2, sz, font, w, false, { fill: c.fg });
        s += textEl(mb.glyphs, 65 - ((mb.inkL + mb.inkR) / 2) * sz, 65 + H / 2, sz, font, w, false, { fill: c.fg });
        if (p.divider !== 'none') s += line(80, 20, 20, 80, p.divider === 'rule' ? c.accent : c.fg);
        if (!framed) s += `<rect x="${f(14.5 + p.weight / 2)}" y="${f(14.5 + p.weight / 2)}" width="${f(71 - p.weight)}" height="${f(71 - p.weight)}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}"/>`;
      } else if (p.layout === 'stack') {
        let H = p.size * 90 * (framed ? 0.72 : 1), sz = H / fm.cap;
        const maxH = framed ? 48 : 78;
        if (H * 2.44 > maxH) { H = maxH / 2.44; sz = H / fm.cap; }
        const maxW = Math.max(ma.w, mb.w) * sz, lim = framed ? 48 : 60;
        if (maxW > lim) { sz *= lim / maxW; H = sz * fm.cap; }
        const G = H * 0.22;
        s += textEl(ma.glyphs, 50 - ((ma.inkL + ma.inkR) / 2) * sz, 50 - G, sz, font, w, false, { fill: c.fg });
        s += textEl(mb.glyphs, 50 - ((mb.inkL + mb.inkR) / 2) * sz, 50 + G + H, sz, font, w, false, { fill: c.fg });
        const rw = Math.max(ma.w, mb.w) * sz * 0.62;
        if (p.divider !== 'none') s += line(50 - rw, 50, 50 + rw, 50, p.divider === 'slash' ? c.accent : c.fg);
      } else {
        let sz = (p.size * 100 * (framed ? 0.72 : 1)) / fm.cap;
        let G = fm.cap * sz * 0.2;
        let total = (ma.w + mb.w) * sz + 2 * G;
        const maxW = framed ? 62 : 84;
        if (total > maxW) { const k = maxW / total; sz *= k; G *= k; total = maxW; }
        const H = fm.cap * sz, x0 = 50 - total / 2;
        s += textEl(ma.glyphs, x0 - ma.inkL * sz, 50 + H / 2, sz, font, w, false, { fill: c.fg });
        s += textEl(mb.glyphs, x0 + ma.w * sz + 2 * G - mb.inkL * sz, 50 + H / 2, sz, font, w, false, { fill: c.fg });
        const xm = x0 + ma.w * sz + G;
        if (p.divider === 'slash') s += line(xm + H * 0.2, 50 - H * 0.62, xm - H * 0.2, 50 + H * 0.62, c.accent);
        if (p.divider === 'rule') s += line(xm, 50 - H * 0.62, xm, 50 + H * 0.62, c.accent);
      }
      if (p.frame === 'circle') s += `<circle cx="50" cy="50" r="${f(40 - p.weight / 2)}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}"/>`;
      if (p.frame === 'square') s += `<rect x="${f(14.5 + p.weight / 2)}" y="${f(14.5 + p.weight / 2)}" width="${f(71 - p.weight)}" height="${f(71 - p.weight)}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}"/>`;
      return s;
    });

  fam('mono-frame', 'Framed initial', 'Monogram',
    'The initial held by a frame: corner marks, brackets, a keyline box or a single rule. Editorial and exact.',
    [pS('frame', 'Frame', [['corners', 'Corner marks'], ['brackets', 'Brackets'], ['box', 'Box'], ['underline', 'Rule']], 'corners'),
      pR('weight', 'Weight', 2, 8, 0.5, 4), pR('size', 'Letter size', 0.4, 0.7, 0.01, 0.52), pB('accent', 'Accent frame', false)],
    (p, c) => {
      const L = initialFit(c, { cx: 50, cy: p.frame === 'underline' ? 45 : 50, w: 54, h: 72 * p.size });
      const k = p.weight / 2, a = 14.5 + k, b = 85.5 - k, arm = 17, fc = p.accent ? c.accent : c.fg;
      const st = `fill="none" stroke="${fc}" stroke-width="${f(p.weight)}" stroke-linecap="square"`;
      let fr = '';
      if (p.frame === 'corners') fr = `<path d="M${a},${a + arm}V${a}H${a + arm}M${b - arm},${a}H${b}V${a + arm}M${b},${b - arm}V${b}H${b - arm}M${a + arm},${b}H${a}V${b - arm}" ${st}/>`;
      if (p.frame === 'brackets') fr = `<path d="M${a + arm * 0.7},${a}H${a}V${b}H${a + arm * 0.7}M${b - arm * 0.7},${a}H${b}V${b}H${b - arm * 0.7}" ${st}/>`;
      if (p.frame === 'box') fr = `<rect x="${f(a)}" y="${f(a)}" width="${f(b - a)}" height="${f(b - a)}" fill="none" stroke="${fc}" stroke-width="${f(p.weight)}"/>`;
      if (p.frame === 'underline') fr = `<rect x="${f(L.ink.x0)}" y="${f(L.ink.y1 + L.size * 0.09)}" width="${f(L.ink.x1 - L.ink.x0)}" height="${f(p.weight * 1.3)}" fill="${fc}"/>`;
      return L.svg({ fill: c.fg }) + fr;
    });

  fam('mono-contour', 'Contour initial', 'Monogram',
    'The initial echoed by evenly spaced outlines, like an inline sign or a topographic letter.',
    [pR('rings', 'Outlines', 1, 4, 1, 2), pR('gap', 'Gap', 1, 4, 0.25, 2), pR('weight', 'Line weight', 1, 4, 0.25, 2), pR('size', 'Letter size', 0.35, 0.65, 0.01, 0.5),
      pB('solid', 'Solid core', true)],
    (p, c) => {
      const id = uid(), Rm = p.rings * (p.gap + p.weight);
      const L = initialFit(c, { cx: 50, cy: 50, w: 80 - 2 * Rm, h: Math.min(100 * p.size, 80 - 2 * Rm) });
      const st = (w, colr) => L.svg({ fill: colr, stroke: colr, 'stroke-width': f(w), 'stroke-linejoin': 'round' });
      let m = '';
      for (let i = p.rings; i >= 1; i--) {
        const Ri = i * (p.gap + p.weight);
        m += st(2 * Ri, '#fff') + st(2 * (Ri - p.weight), '#000');
      }
      m += p.solid ? L.svg({ fill: '#fff' }) : L.svg({ fill: '#000', stroke: '#fff', 'stroke-width': f(p.weight * 2), 'stroke-linejoin': 'round' }) + L.svg({ fill: '#000' });
      return `<defs>${maskEl(id + 'm', m, '#000')}</defs><rect width="100" height="100" fill="${c.fg}" mask="url(#${id}m)"/>`;
    });

  /* ======================================================================
     GRID CONSTRUCTOR (tiles shared with several geometric families)
     ====================================================================== */
  const TILE_TYPES = ['empty', 'full', 'circle', 'ring', 'half', 'quarter', 'triangle', 'diag', 'dot', 'arch'];
  const CORNER_T = { quarter: 1, triangle: 1, diag: 1 }, EDGE_T = { half: 1, arch: 1 };
  /* local tile geometry in a cell of side s; rotation r turns it 90° clockwise */
  function tileSvg(t, r, x, y, s, fill, rad) {
    const tr = `translate(${f(x)} ${f(y)})${r % 4 ? ` rotate(${(r % 4) * 90} ${f(s / 2)} ${f(s / 2)})` : ''}`;
    const h = s / 2;
    switch (t) {
      case 'full': return `<rect x="${f(x)}" y="${f(y)}" width="${f(s)}" height="${f(s)}"${rad ? ` rx="${f(rad * h)}"` : ''} fill="${fill}"/>`;
      case 'circle': return `<circle cx="${f(x + h)}" cy="${f(y + h)}" r="${f(h)}" fill="${fill}"/>`;
      case 'ring': return `<path d="${circleD(x + h, y + h, h)}${circleD(x + h, y + h, h * 0.5)}" fill="${fill}" fill-rule="evenodd"/>`;
      case 'dot': return `<circle cx="${f(x + h)}" cy="${f(y + h)}" r="${f(s * 0.21)}" fill="${fill}"/>`;
      case 'half': return `<path transform="${tr}" d="M0,${f(s)}A${f(h)},${f(h)} 0 0,1 ${f(s)},${f(s)}Z" fill="${fill}"/>`;
      case 'quarter': return `<path transform="${tr}" d="M0,${f(s)}V0A${f(s)},${f(s)} 0 0,1 ${f(s)},${f(s)}Z" fill="${fill}"/>`;
      case 'triangle': return `<path transform="${tr}" d="M0,0L${f(s)},${f(s)}H0Z" fill="${fill}"/>`;
      case 'diag': { const k = s * 0.3; return `<path transform="${tr}" d="${polyD([[0, 0], [k, 0], [s, s - k], [s, s], [s - k, s], [0, k]])}" fill="${fill}"/>`; }
      case 'arch': return `<path transform="${tr}" d="M0,${f(s)}V${f(h)}A${f(h)},${f(h)} 0 0,1 ${f(s)},${f(h)}V${f(s)}Z" fill="${fill}"/>`;
      default: return '';
    }
  }
  function gridRender(spec, c, box = 72) {
    const cols = spec.cols || 2, rows = spec.rows || 2, gap = spec.gap || 0, rad = spec.radius || 0;
    const s = Math.min((box - gap * (cols - 1)) / cols, (box - gap * (rows - 1)) / rows);
    const W = cols * s + gap * (cols - 1), H = rows * s + gap * (rows - 1);
    const x0 = 50 - W / 2, y0 = 50 - H / 2;
    let out = '';
    (spec.cells || []).forEach((cell, i) => {
      if (!cell || !cell.t || cell.t === 'empty' || i >= cols * rows) return;
      let t = tileSvg(cell.t, cell.r || 0, x0 + (i % cols) * (s + gap), y0 + Math.floor(i / cols) * (s + gap), s, col(c, cell.color), rad);
      /* touching tiles get a 0.4-unit bleed in their own colour so no antialiasing seam shows */
      if (!gap && cell.t !== 'dot' && cell.t !== 'ring') t = t.replace(/fill="([^"]+)"\/>$/, 'fill="$1" stroke="$1" stroke-width=".4"/>');
      out += t;
    });
    return out;
  }
  const mirX = (q) => ({ t: q.t, color: q.color, r: CORNER_T[q.t] ? (3 - (q.r || 0)) & 3 : EDGE_T[q.t] ? (4 - (q.r || 0)) % 4 : q.r || 0 });
  const mirY = (q) => ({ t: q.t, color: q.color, r: CORNER_T[q.t] ? (q.r || 0) ^ 1 : EDGE_T[q.t] ? (6 - (q.r || 0)) % 4 : q.r || 0 });
  const rotQ = (q, k) => ({ t: q.t, color: q.color, r: ((q.r || 0) + k) % 4 });
  const VOCABS = [
    ['quarter', 'quarter', 'quarter', 'full', 'empty'], ['quarter', 'half', 'circle', 'empty'], ['triangle', 'triangle', 'full', 'empty', 'quarter'],
    ['half', 'arch', 'circle', 'empty'], ['quarter', 'circle', 'dot', 'empty'], ['diag', 'triangle', 'full', 'empty'],
    ['arch', 'arch', 'quarter', 'full', 'empty'], ['ring', 'quarter', 'quarter', 'dot', 'empty'], ['quarter', 'quarter', 'empty', 'circle', 'triangle']
  ];
  function gridRandom(seed, cols = 3, rows = 3, opts = {}) {
    const r = rng('grid' + seed);
    let sym = opts.symmetry || 'auto';
    if (sym === 'auto') sym = pick(r, cols === rows ? ['mirror-x', 'rotational', 'rotational', 'mirror-y', 'none'] : ['mirror-x', 'mirror-y', 'rotational']);
    const vocab = opts.vocab || pick(r, VOCABS);
    const accentP = opts.accent == null ? 0.14 : opts.accent;
    for (let attempt = 0; attempt < 12; attempt++) {
      const cells = range(cols * rows).map(() => ({ t: pick(r, vocab), r: Math.floor(r() * 4), color: r() < accentP ? 'accent' : 'fg' }));
      const at = (x, y) => cells[y * cols + x];
      const set = (x, y, q) => { cells[y * cols + x] = q; };
      const SYM = ['full', 'circle', 'ring', 'dot', 'empty'];
      if (sym === 'mirror-x') {
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          if (x > (cols - 1) / 2) set(x, y, mirX(at(cols - 1 - x, y)));
          else if (x === (cols - 1) / 2) { const q = at(x, y); if (CORNER_T[q.t]) set(x, y, { t: pick(r, SYM), r: 0, color: q.color }); else if (EDGE_T[q.t]) q.r = (q.r & 1) ? 0 : q.r; }
        }
      } else if (sym === 'mirror-y') {
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          if (y > (rows - 1) / 2) set(x, y, mirY(at(x, rows - 1 - y)));
          else if (y === (rows - 1) / 2) { const q = at(x, y); if (CORNER_T[q.t]) set(x, y, { t: pick(r, SYM), r: 0, color: q.color }); else if (EDGE_T[q.t]) q.r = (q.r & 1) ? q.r : 1; }
        }
      } else if (sym === 'rotational') {
        const done = new Set();
        const sq = cols === rows;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          if (done.has(x + ',' + y)) continue;
          const base = at(x, y);
          let px = x, py = y;
          const orbit = [];
          for (let k = 0; k < (sq ? 4 : 2); k++) {
            const key = px + ',' + py;
            if (orbit.some((o) => o.key === key)) break;
            orbit.push({ key, x: px, y: py, k });
            if (sq) { const nx = cols - 1 - py, ny = px; px = nx; py = ny; } else { px = cols - 1 - px; py = rows - 1 - py; }
          }
          if (orbit.length === 1) { if (!SYM.includes(base.t)) set(x, y, { t: pick(r, ['circle', 'full', 'ring', 'dot']), r: 0, color: base.color }); }
          else orbit.forEach((o) => set(o.x, o.y, rotQ(base, o.k * (sq ? 1 : 2))));
          orbit.forEach((o) => done.add(o.key));
        }
      }
      const empties = cells.filter((q) => q.t === 'empty').length;
      const accents = cells.filter((q) => q.color === 'accent' && q.t !== 'empty').length;
      if (empties > cells.length * 0.45 || empties === cells.length) continue;
      if (accents > Math.max(2, cells.length * 0.3)) cells.forEach((q, i) => { if (i % 3) q.color = 'fg'; });
      return { cols, rows, cells, gap: opts.gap == null ? 0 : opts.gap, radius: 0, symmetry: sym };
    }
    return { cols, rows, cells: range(cols * rows).map((i) => ({ t: i % 2 ? 'quarter' : 'circle', r: i % 4, color: 'fg' })), gap: 0, radius: 0, symmetry: sym };
  }

  /* ======================================================================
     GEOMETRIC
     ====================================================================== */
  fam('geo-circles', 'Circle composition', 'Geometric',
    'Overlapping circles in a row, a cluster or a stack. The overlap does the talking: a lens of accent, a knockout or a multiply.',
    [pR('count', 'Circles', 2, 5, 1, 3), pS('layout', 'Layout', ['row', 'cluster', 'stack'], 'cluster'), pR('overlap', 'Overlap', 0, 0.7, 0.01, 0.35),
      pS('mode', 'Overlap treatment', [['lens', 'Accent lens'], ['xor', 'Knockout'], ['multiply', 'Multiply'], ['outline', 'Outline'], ['solid', 'Solid']], 'lens'),
      pR('weight', 'Outline weight', 2, 10, 0.5, 4)],
    (p, c) => {
      const id = uid(), n = p.count, ov = p.overlap;
      let C = [], r;
      if (p.layout === 'cluster' && n > 2) {
        const s = Math.sin(Math.PI / n), D = 42 / (1 + (1 + ov) * s);
        r = (1 + ov) * D * s;
        C = range(n).map((i) => P(50, 50, D, -90 + (360 / n) * i));
        const b = bboxOf(C.map((q) => [q[0] - r, q[1] - r]).concat(C.map((q) => [q[0] + r, q[1] + r])));
        C = C.map((q) => [q[0] + 50 - b.cx, q[1] + 50 - b.cy]);
      } else {
        r = Math.min(40, 84 / (2 + (n - 1) * 2 * (1 - ov)));
        const d = 2 * r * (1 - ov);
        C = range(n).map((i) => (p.layout === 'stack' ? [50, 50 - ((n - 1) * d) / 2 + i * d] : [50 - ((n - 1) * d) / 2 + i * d, 50]));
      }
      if (p.mode === 'xor') return `<path d="${C.map((q) => circleD(q[0], q[1], r)).join('')}" fill="${c.fg}" fill-rule="evenodd"/>`;
      if (p.mode === 'outline') return C.map((q) => `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(r - p.weight / 2)}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}"/>`).join('');
      if (p.mode === 'multiply') return `<g style="isolation:isolate">${C.map((q, i) => `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(r)}" fill="${i % 2 ? c.accent : c.fg}" style="mix-blend-mode:multiply"/>`).join('')}</g>`;
      let s = C.map((q) => `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(r)}" fill="${c.fg}"/>`).join('');
      if (p.mode === 'lens') {
        let defs = '';
        C.forEach((q, i) => { defs += clipEl(id + i, `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(r)}"/>`); });
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          if (Math.hypot(C[i][0] - C[j][0], C[i][1] - C[j][1]) < 2 * r) s += `<g clip-path="url(#${id}${i})"><circle cx="${f(C[j][0])}" cy="${f(C[j][1])}" r="${f(r)}" fill="${c.accent}"/></g>`;
        }
        s = `<defs>${defs}</defs>` + s;
      }
      return s;
    });

  fam('geo-quarters', 'Quarter-circle tiles', 'Geometric',
    'Quarter discs on a square grid, Bauhaus-style. Point them inward for a circle, outward for a star, or turn them for a pinwheel.',
    [pR('grid', 'Grid', 2, 4, 1, 2), pS('pattern', 'Pattern', ['circle', 'star', 'pinwheel', 'wave', 'seeded'], 'pinwheel'), pR('gap', 'Gap', 0, 6, 0.5, 2),
      pB('twoTone', 'Two-tone', false), SEED],
    (p, c) => {
      const n = p.grid, r = rng('q' + p.seed), cells = [];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dx = x - (n - 1) / 2, dy = y - (n - 1) / 2;
        let t = 'quarter', rr = 0;
        const inward = dx < 0 ? (dy < 0 ? 3 : 2) : (dy < 0 ? 0 : 1);
        if (p.pattern === 'circle') rr = inward;
        else if (p.pattern === 'star') rr = (inward + 2) % 4;
        else if (p.pattern === 'pinwheel') { const q = dx < 0 ? (dy < 0 ? 0 : 3) : (dy < 0 ? 1 : 2); rr = (q + 2) % 4; }
        else if (p.pattern === 'wave') rr = y % 2 ? (x % 2 ? 2 : 1) : (x % 2 ? 3 : 0);
        else rr = Math.floor(r() * 4);
        if (dx === 0 && dy === 0) { t = 'circle'; }
        else if (p.pattern !== 'seeded' && p.pattern !== 'wave' && (dx === 0 || dy === 0)) { t = 'half'; rr = dx === 0 ? (dy < 0 ? 0 : 2) : (dx < 0 ? 3 : 1); if (p.pattern === 'star') rr = (rr + 2) % 4; }
        cells.push({ t, r: rr, color: p.twoTone && (x + y) % 2 ? 'accent' : 'fg' });
      }
      return gridRender({ cols: n, rows: n, cells, gap: p.gap }, c);
    });

  fam('geo-dotgrid', 'Dot field', 'Geometric',
    'A square field of dots whose size is modulated: radial, linear, wave or noise. Halftone precision.',
    [pR('n', 'Grid', 4, 11, 1, 7), pS('mod', 'Modulation', ['uniform', 'radial', 'linear', 'wave', 'noise'], 'radial'), pS('shape', 'Dot', ['circle', 'square', 'diamond'], 'circle'),
      pR('size', 'Max size', 0.5, 1, 0.01, 0.9), pS('mask', 'Field', ['square', 'circle', 'diamond'], 'circle'), pS('accent', 'Accent dot', ['none', 'centre', 'corner', 'random'], 'none'), SEED],
    (p, c) => {
      const n = p.n, span = p.mask === 'circle' ? 80 : 72, pitch = span / n, maxR = (pitch / 2) * p.size;
      const noise = periodicNoise(p.seed), r = rng('dg' + p.seed);
      let s = '';
      const acc = p.accent === 'random' ? [Math.floor(r() * n), Math.floor(r() * n)] : null;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n - 0.5, v = (j + 0.5) / n - 0.5;
        const dist = Math.hypot(u, v) / 0.5;
        if (p.mask === 'circle' && dist > 1.02) continue;
        if (p.mask === 'diamond' && Math.abs(u) + Math.abs(v) > 0.52) continue;
        let k = 1;
        if (p.mod === 'radial') k = 1 - Math.min(1, dist / 1.15) * 0.82;
        if (p.mod === 'linear') k = 0.18 + 0.82 * ((i + j) / (2 * n - 2));
        if (p.mod === 'wave') k = 0.55 + 0.45 * Math.sin((u * 1.4 + v * 0.6) * Math.PI * 2);
        if (p.mod === 'noise') k = 0.55 + 0.45 * noise(Math.atan2(v, u) + dist * 3.1);
        const R = maxR * clamp(k, 0.12, 1), x = 50 + u * span, y = 50 + v * span;
        const isAcc = (p.accent === 'centre' && i === (n - 1) / 2 && j === (n - 1) / 2) || (p.accent === 'centre' && n % 2 === 0 && i === n / 2 && j === n / 2 - 1) ||
          (p.accent === 'corner' && i === n - 1 && j === 0 && p.mask === 'square') || (p.accent === 'corner' && p.mask !== 'square' && i === Math.floor(n * 0.75) && j === Math.floor(n * 0.2)) ||
          (acc && acc[0] === i && acc[1] === j);
        const fill = isAcc ? c.accent : c.fg;
        if (p.shape === 'square') s += `<rect x="${f(x - R)}" y="${f(y - R)}" width="${f(2 * R)}" height="${f(2 * R)}" fill="${fill}"/>`;
        else if (p.shape === 'diamond') s += `<path d="${polyD(regPts(x, y, R * 1.25, 4, -90))}" fill="${fill}"/>`;
        else s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}" fill="${fill}"/>`;
      }
      return s;
    });

  fam('geo-concentric', 'Concentric rings', 'Geometric',
    'Rings at an even rhythm. Slide them off-centre for a tunnel or a ripple; open them for a target or a signal.',
    [pR('count', 'Rings', 2, 8, 1, 4), pR('ratio', 'Line / space', 0.2, 0.85, 0.01, 0.5), pR('ecc', 'Off-centre', 0, 1, 0.01, 0),
      pR('open', 'Opening', 0, 120, 5, 0), pR('rot', 'Opening angle', 0, 360, 15, 0), pB('dot', 'Centre dot', true)],
    (p, c) => {
      const R = 40, pitch = R / (p.count + (p.dot ? p.ratio : 0)), w = pitch * p.ratio;
      let s = '';
      for (let i = 0; i < p.count; i++) {
        const ro = R - i * pitch, rc = ro - w / 2, cy = 50 + p.ecc * (R - ro);
        if (p.open > 0) s += `<path d="${arcD(50, cy, rc, p.rot + p.open / 2, p.rot + 360 - p.open / 2)}" fill="none" stroke="${c.fg}" stroke-width="${f(w)}"/>`;
        else s += `<circle cx="50" cy="${f(cy)}" r="${f(rc)}" fill="none" stroke="${c.fg}" stroke-width="${f(w)}"/>`;
      }
      if (p.dot) s += `<circle cx="50" cy="${f(50 + p.ecc * (R - w))}" r="${f(w)}" fill="${c.accent}"/>`;
      return s;
    });

  fam('geo-rotsquares', 'Rotating squares', 'Geometric',
    'Squares turning by a fixed step, each inscribed in the last, or decaying in scale. Rhythm from one rule.',
    [pR('count', 'Squares', 2, 14, 1, 7), pR('step', 'Turn per step', 0, 45, 1, 12), pS('mode', 'Scaling', [['inscribed', 'Inscribed'], ['decay', 'Decay']], 'inscribed'),
      pR('decay', 'Decay', 0.6, 0.98, 0.01, 0.84), pS('style', 'Style', [['outline', 'Outline'], ['bands', 'Alternating bands'], ['solid', 'Two-tone stack']], 'outline'),
      pR('weight', 'Line weight', 1, 6, 0.25, 2.25)],
    (p, c) => {
      const th = p.step * RAD;
      let h = p.style === 'outline' ? 35.5 - p.weight / 2 : 35.5;
      const sq = [];
      for (let k = 0; k < p.count; k++) {
        sq.push(regPts(50, 50, h * Math.SQRT2, 4, -45 + k * p.step));
        h = p.mode === 'inscribed' && p.step > 0 ? h / (Math.cos(th) + Math.sin(th)) : h * p.decay;
      }
      if (p.style === 'bands') return `<path d="${sq.map((q) => polyD(q)).join('')}" fill="${c.fg}" fill-rule="evenodd"/>`;
      if (p.style === 'solid') return sq.map((q, i) => `<path d="${polyD(q)}" fill="${i % 2 ? c.accent : c.fg}"/>`).join('');
      return `<path d="${sq.map((q) => polyD(q)).join('')}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}" stroke-linejoin="miter"/>`;
    });

  function polyRadius(n) {
    const k = Math.sqrt((2 * Math.PI) / (n * Math.sin((2 * Math.PI) / n)));
    return 40 * (1 + (k - 1) * 0.55);
  }
  /* centred regular polygon points */
  function centredPoly(n, rot, scale = 1) {
    const R = polyRadius(n) * scale;
    let pts = regPts(0, 0, R, n, -90 + rot);
    const b = bboxOf(pts);
    const k = Math.min(1, 90 / b.w, 88 / b.h);
    pts = pts.map((q) => [50 + (q[0] - b.cx) * k, 50 + (q[1] - b.cy) * k]);
    return { pts, R: R * k, c: [50 - b.cx * k, 50 - b.cy * k] };
  }

  fam('geo-polygon', 'Faceted polygon', 'Geometric',
    'A regular polygon, solid, outlined, faceted in two tones, nested, or cut like a gem.',
    [pR('sides', 'Sides', 3, 12, 1, 6), pS('style', 'Style', ['solid', 'outline', 'faceted', 'nested', 'gem'], 'faceted'), pR('round', 'Roundness', 0, 1, 0.05, 0),
      pR('rotation', 'Rotation', 0, 60, 1, 0), pR('weight', 'Line weight', 2, 10, 0.5, 4)],
    (p, c) => {
      const id = uid(), Q = centredPoly(p.sides, p.rotation), pts = Q.pts, C = Q.c, rr = p.round * Q.R * 0.25;
      if (p.style === 'outline') { const Qi = centredPoly(p.sides, p.rotation, 1 - p.weight / 2 / Q.R / Math.cos(Math.PI / p.sides)); return `<path d="${roundPolyD(Qi.pts, rr)}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}"/>`; }
      if (p.style === 'faceted') {
        let s = `<defs>${clipEl(id + 'c', `<path d="${roundPolyD(pts, rr)}"/>`)}</defs><g clip-path="url(#${id}c)">`;
        pts.forEach((q, i) => { const q2 = pts[(i + 1) % pts.length]; s += `<path d="${polyD([C, q, q2])}" fill="${i % 2 ? c.accent : c.fg}" stroke="${i % 2 ? c.accent : c.fg}" stroke-width=".3"/>`; });
        return s + '</g>';
      }
      if (p.style === 'nested') return `<path d="${[1, 0.68, 0.36].map((k) => roundPolyD(pts.map((q) => [C[0] + (q[0] - C[0]) * k, C[1] + (q[1] - C[1]) * k]), rr * k)).join('')}${[0.84, 0.52].map((k) => roundPolyD(pts.map((q) => [C[0] + (q[0] - C[0]) * k, C[1] + (q[1] - C[1]) * k]), rr * k)).join('')}" fill="${c.fg}" fill-rule="evenodd"/>`;
      if (p.style === 'gem') {
        const inner = pts.map((q) => [C[0] + (q[0] - C[0]) * 0.45, C[1] + (q[1] - C[1]) * 0.45]);
        const m = pts.map((q, i) => `<line x1="${f(q[0])}" y1="${f(q[1])}" x2="${f(inner[i][0])}" y2="${f(inner[i][1])}"/>`).join('') + `<path d="${polyD(inner)}" fill="none"/>`;
        return `<defs>${maskEl(id + 'm', `<g stroke="#000" stroke-width="${f(p.weight * 0.6)}">${m}</g>`)}</defs><path d="${roundPolyD(pts, rr)}" fill="${c.fg}" mask="url(#${id}m)"/><path d="${polyD(inner)}" fill="${c.accent}" mask="url(#${id}m)"/>`;
      }
      return `<path d="${roundPolyD(pts, rr)}" fill="${c.fg}"/>`;
    });

  fam('geo-burst', 'Burst', 'Geometric',
    'Rays from a centre: bars, wedges or tapering needles, with an optional disc. Energy, optimism, light.',
    [pR('rays', 'Rays', 6, 48, 1, 16), pR('inner', 'Inner radius', 0, 0.7, 0.01, 0.34), pS('shape', 'Ray', ['bar', 'wedge', 'taper'], 'bar'),
      pB('alternate', 'Alternate lengths', false), pR('weight', 'Ray weight', 1.5, 10, 0.25, 4), pB('disc', 'Centre disc', true)],
    (p, c) => {
      const R = 43, n = p.rays, rin = p.inner * R, gap = Math.max(2.5, p.weight * 0.8);
      const start = p.disc && rin > 6 ? rin : Math.max(rin, 0.01);
      let s = '';
      for (let i = 0; i < n; i++) {
        const a = -90 + (360 / n) * i, Ro = p.alternate && i % 2 ? R * 0.74 : R;
        if (p.shape === 'bar') { const a0 = P(50, 50, start, a), a1 = P(50, 50, Ro, a); s += `<line x1="${f(a0[0])}" y1="${f(a0[1])}" x2="${f(a1[0])}" y2="${f(a1[1])}"/>`; }
        else if (p.shape === 'wedge') { const hw = (180 / n) * 0.62; s += `<path d="${polyD([P(50, 50, start, a - hw), P(50, 50, Ro, a), P(50, 50, start, a + hw)])}"/>`; }
        else { const b = start > 1 ? start : 1, hw = (p.weight / 2 / Math.max(b, 4)) / RAD; s += `<path d="${polyD([P(50, 50, b, a - hw), P(50, 50, Ro, a), P(50, 50, b, a + hw)])}"/>`; }
      }
      const g = p.shape === 'bar' ? `<g stroke="${c.fg}" stroke-width="${f(p.weight)}">${s}</g>` : `<g fill="${c.fg}">${s}</g>`;
      return g + (p.disc && rin > 6 ? `<circle cx="50" cy="50" r="${f(rin - gap)}" fill="${c.accent}"/>` : '');
    });

  fam('geo-bloom', 'Radial bloom', 'Geometric',
    'Lens-shaped petals around a centre. Overlap them with multiply for depth, or keep them crisp and solid.',
    [pR('petals', 'Petals', 3, 16, 1, 8), pR('width', 'Petal width', 0.15, 1, 0.01, 0.42), pR('start', 'Centre gap', 0, 0.4, 0.01, 0),
      pS('mode', 'Mode', ['solid', 'multiply', 'outline', 'alternate'], 'multiply'), pR('rotation', 'Rotation', 0, 90, 1, 0), pR('weight', 'Outline weight', 1.5, 6, 0.25, 3)],
    (p, c) => {
      const R = 44 - (p.mode === 'outline' ? p.weight / 2 : 0), r0 = p.start * R;
      let s = '';
      for (let i = 0; i < p.petals; i++) {
        const a = -90 + p.rotation + (360 / p.petals) * i, A = P(50, 50, r0, a), B = P(50, 50, R, a);
        const d = vesicaD(A[0], A[1], B[0], B[1], ((R - r0) * p.width) / 2);
        if (p.mode === 'outline') s += `<path d="${d}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}"/>`;
        else if (p.mode === 'multiply') s += `<path d="${d}" fill="${i % 2 ? c.accent : c.fg}" style="mix-blend-mode:multiply"/>`;
        else s += `<path d="${d}" fill="${p.mode === 'alternate' && i % 2 ? c.accent : c.fg}"/>`;
      }
      return p.mode === 'multiply' ? `<g style="isolation:isolate">${s}</g>` : s;
    });

  fam('geo-spiral', 'Spiral', 'Geometric',
    'An even Archimedean coil, a golden logarithmic curve or a squared maze spiral, at one stroke weight.',
    [pS('type', 'Spiral', [['archimedean', 'Archimedean'], ['golden', 'Golden'], ['square', 'Squared']], 'archimedean'), pR('turns', 'Turns', 1.5, 6, 0.25, 3),
      pR('weight', 'Weight', 2, 12, 0.5, 6), pR('arms', 'Arms', 1, 3, 1, 1), pS('cap', 'Terminals', [['round', 'Round'], ['butt', 'Flat']], 'round')],
    (p, c) => {
      /* the stroke never fills more than 60% of the pitch, so a coil always reads as a coil */
      const pitch = p.type === 'square' ? 80 / (Math.round(p.turns * 4) / 2 + 1) / 2 : 40 / (p.turns * p.arms);
      const W = Math.min(p.weight, pitch * 0.6), st = `fill="none" stroke="${c.fg}" stroke-width="${f(W)}" stroke-linecap="${p.cap}" stroke-linejoin="${p.type === 'square' ? 'miter' : 'round'}"`;
      if (p.type === 'archimedean') {
        const Rm = 40 - W / 2, r0 = p.arms > 1 ? W * 0.6 : W * 0.5, N = Math.ceil(p.turns * 72);
        return range(p.arms).map((j) => {
          const pts = range(N + 1).map((k) => { const t = k / N, th = t * p.turns * 2 * Math.PI; return P(50, 50, r0 + (Rm - r0) * t, th / RAD - 90 + (360 / p.arms) * j); });
          return `<path d="${polyD(pts, false)}" ${st}/>`;
        }).join('');
      }
      if (p.type === 'golden') {
        const b = Math.log(1.618034) / (Math.PI / 2), N = Math.ceil(p.turns * 90);
        const sets = range(p.arms).map((j) => range(N + 1).map((k) => { const th = -p.turns * 2 * Math.PI * (1 - k / N); const r = Math.exp(b * th) * 40; return P(0, 0, r, th / RAD + (360 / p.arms) * j); }));
        const F = fitPts(sets, 80 - W, 80 - W);
        return F.sets.map((s) => `<path d="${polyD(s, false)}" ${st}/>`).join('');
      }
      const segs = Math.round(p.turns * 4), dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      let x = 0, y = 0;
      const pts = [[0, 0]];
      for (let i = 0; i < segs; i++) { const L = Math.ceil((i + 1) / 2); x += dirs[i % 4][0] * L; y += dirs[i % 4][1] * L; pts.push([x, y]); }
      const F = fitPts([pts], 80 - W, 80 - W);
      return `<path d="${polyD(F.sets[0], false)}" ${st}/>`;
    });

  fam('geo-waves', 'Line waves', 'Geometric',
    'Parallel lines bent by one sine, held in a circle or a square. Water, sound, signal, flow.',
    [pR('lines', 'Lines', 3, 12, 1, 6), pR('amp', 'Amplitude', 0, 12, 0.5, 5), pR('cycles', 'Cycles', 0.5, 4, 0.25, 1.5),
      pR('ratio', 'Line / space', 0.2, 0.8, 0.01, 0.5), pS('frame', 'Container', ['circle', 'square', 'none'], 'circle'), pR('phase', 'Phase drift', 0, 0.5, 0.01, 0)],
    (p, c) => {
      const id = uid(), span = p.frame === 'circle' ? 80 : p.frame === 'square' ? 71 : 64, pitch = span / p.lines, sw = pitch * p.ratio;
      const free = p.frame === 'none';
      const x0 = free ? 14 + sw / 2 : 0, x1 = free ? 86 - sw / 2 : 100;
      /* neighbouring lines may never close up: with phase drift their distance swings by 2·amp·sin(π·phase) */
      const swing = 2 * Math.abs(Math.sin(Math.PI * p.phase));
      const amp = Math.min(p.amp, pitch * 1.3, swing > 0.05 ? Math.max(0, pitch - sw * 1.25) / swing : Infinity);
      let s = '';
      for (let i = 0; i < p.lines; i++) {
        const y0 = 50 - span / 2 + pitch * (i + 0.5);
        const pts = range(61).map((k) => { const x = x0 + ((x1 - x0) * k) / 60; return [x, y0 + amp * Math.sin(2 * Math.PI * (p.cycles * (x - (free ? x0 : 14)) / (free ? x1 - x0 : 72) + p.phase * i))]; });
        s += `<path d="${smoothD(pts, false)}" fill="none" stroke="${c.fg}" stroke-width="${f(sw)}" stroke-linecap="${free ? 'round' : 'butt'}"/>`;
      }
      if (free) return s;
      const shape = p.frame === 'circle' ? `<circle cx="50" cy="50" r="40"/>` : `<rect x="14.5" y="14.5" width="71" height="71"/>`;
      return `<defs>${clipEl(id + 'c', shape)}</defs><g clip-path="url(#${id}c)">${s}</g>`;
    });

  fam('geo-arcs', 'Stacked arcs', 'Geometric',
    'Concentric half-rings with crisp flat ends: a rainbow, a stacked double arch or a mirrored wave.',
    [pR('count', 'Arcs', 2, 7, 1, 4), pR('ratio', 'Line / space', 0.3, 0.85, 0.01, 0.6), pS('variant', 'Arrangement', [['rainbow', 'Rainbow'], ['stacked', 'Double arch'], ['mirrored', 'Mirrored wave']], 'rainbow'),
      pB('fill', 'Solid core', true), pB('accent', 'Accent core', false)],
    (p, c) => {
      const set = (cx, cy, R, a0, a1) => {
        const pitch = R / (p.count + (p.fill ? p.ratio : 0)), w = pitch * p.ratio;
        let s = '';
        for (let i = 0; i < p.count; i++) { const ro = R - i * pitch; s += `<path d="${sectorD(cx, cy, ro - w, ro, a0, a1)}" fill="${c.fg}"/>`; }
        if (p.fill) s += `<path d="${sectorD(cx, cy, 0, R - p.count * pitch, a0, a1)}" fill="${p.accent ? c.accent : c.fg}"/>`;
        return s;
      };
      if (p.variant === 'stacked') return set(50, 49, 40, 180, 360) + set(50, 91, 40, 180, 360);
      if (p.variant === 'mirrored') return set(28, 50, 22, 180, 360) + set(72, 50, 22, 0, 180);
      return set(50, 73, 46, 180, 360);
    });

  fam('geo-chevrons', 'Chevrons', 'Geometric',
    'Stacked chevrons with vertically cut ends: direction, rank and momentum.',
    [pR('count', 'Chevrons', 1, 5, 1, 3), pR('slope', 'Slope', 0.3, 1.2, 0.01, 0.62), pR('thick', 'Thickness', 4, 18, 0.5, 10), pR('gap', 'Gap', 2, 12, 0.5, 5),
      pS('dir', 'Direction', ['up', 'right', 'down', 'left'], 'up'), pB('accent', 'Accent lead', true)],
    (p, c) => {
      let hw = 40, t = p.thick, g = p.gap;
      let H = hw * p.slope + t + (p.count - 1) * (t + g);
      const k = Math.min(1, 84 / H);
      hw *= k; t *= k; g *= k; H *= k;
      const y0 = 50 - H / 2, rot = { up: 0, right: 90, down: 180, left: 270 }[p.dir];
      let s = '';
      for (let i = 0; i < p.count; i++) {
        const y = y0 + i * (t + g), d = hw * p.slope;
        s += `<path d="${polyD([[50 - hw, y + d], [50, y], [50 + hw, y + d], [50 + hw, y + d + t], [50, y + t], [50 - hw, y + d + t]])}" fill="${p.accent && i === 0 ? c.accent : c.fg}"/>`;
      }
      return rot ? `<g transform="rotate(${rot} 50 50)">${s}</g>` : s;
    });

  fam('geo-hex', 'Hexagon and cube', 'Geometric',
    'The hexagon as an isometric cube, a honeycomb cluster or nested bands. Structure, building, systems.',
    [pS('variant', 'Variant', [['cube', 'Cube'], ['honeycomb', 'Honeycomb'], ['nested', 'Nested']], 'cube'), pS('shade', 'Shading', [['mono', 'Mono'], ['two', 'Two-tone'], ['three', 'Three-tone']], 'two'),
      pR('gap', 'Gap', 0, 6, 0.25, 2.5), pR('round', 'Roundness', 0, 1, 0.05, 0)],
    (p, c) => {
      const id = uid();
      if (p.variant === 'honeycomb') {
        const g = p.gap, sq3 = Math.sqrt(3);
        const r = (86 - 2 * g) / (3 * sq3), d = sq3 * r + g;
        const centres = [[50, 50]].concat(range(6).map((i) => P(50, 50, d, i * 60)));
        return centres.map((q, i) => `<path d="${roundPolyD(regPts(q[0], q[1], r, 6, -90), p.round * r * 0.3)}" fill="${i === 0 && p.shade !== 'mono' ? c.accent : c.fg}"/>`).join('');
      }
      if (p.variant === 'nested') {
        const R = 45, w = R / 5.6;
        return `<path d="${[R, R - w, R - 2 * w, R - 3 * w, R - 4 * w].map((r) => roundPolyD(regPts(50, 50, r, 6, -90), p.round * r * 0.18)).join('')}" fill="${c.fg}" fill-rule="evenodd"/>` + (p.shade !== 'mono' ? `<path d="${roundPolyD(regPts(50, 50, R - 5 * w + 0.01, 6, -90), p.round * w)}" fill="${c.accent}"/>` : '');
      }
      const R = 45, V = (a) => P(50, 50, R, a), C = [50, 50];
      const top = [V(-90), V(-30), C, V(210)], left = [V(210), C, V(90), V(150)], right = [V(-30), V(30), V(90), C];
      const cols = p.shade === 'three' ? [c.accent, c.fg, c.fg] : p.shade === 'two' ? [c.accent, c.fg, c.fg] : [c.fg, c.fg, c.fg];
      const lines = [V(-30), V(210), V(90)].map((q) => `<line x1="50" y1="50" x2="${f(q[0])}" y2="${f(q[1])}"/>`).join('');
      const body = `<path d="${polyD(top)}" fill="${cols[0]}"/><path d="${polyD(left)}" fill="${cols[1]}"/><path d="${polyD(right)}" fill="${cols[2]}"${p.shade === 'three' ? ' fill-opacity=".55"' : ''}/>`;
      return `<defs>${maskEl(id + 'm', `<g stroke="#000" stroke-width="${f(Math.max(0.01, p.gap))}" stroke-linecap="round">${lines}</g>`)}${clipEl(id + 'c', `<path d="${roundPolyD(regPts(50, 50, R, 6, -90), p.round * 8)}"/>`)}</defs><g mask="url(#${id}m)" clip-path="url(#${id}c)">${body}</g>`;
    });

  fam('geo-rings', 'Interlocking rings', 'Geometric',
    'Rings that pass over and under each other, cut with an exact keyline. Partnership, connection, continuity.',
    [pR('count', 'Rings', 2, 4, 1, 2), pS('layout', 'Layout', ['row', 'triangle'], 'row'), pR('weight', 'Weight', 4, 14, 0.5, 8), pR('overlap', 'Overlap', 0.2, 0.7, 0.01, 0.42),
      pR('gap', 'Keyline', 1, 5, 0.25, 2.5), pB('twoTone', 'Two-tone', true)],
    (p, c) => {
      const id = uid(), w = p.weight;
      let C, rc;
      if (p.layout === 'triangle') {
        const n = 3, D = (43 - w / 2) / (1.6 + p.overlap);
        rc = D * (0.6 + p.overlap);
        C = range(n).map((i) => P(50, 50, D, -90 + i * 120));
        const b = bboxOf(C.map((q) => [q[0] - rc, q[1] - rc]).concat(C.map((q) => [q[0] + rc, q[1] + rc])));
        C = C.map((q) => [q[0] + 50 - b.cx, q[1] + 50 - b.cy]);
      } else {
        const n = p.count;
        rc = Math.min(40 - w / 2, (86 - w) / (2 + 2 * (n - 1) * (1 - p.overlap)));
        const d = 2 * rc * (1 - p.overlap);
        C = range(n).map((i) => [50 - ((n - 1) * d) / 2 + i * d, 50]);
      }
      const n = C.length, under = range(n).map(() => []);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const dx = C[j][0] - C[i][0], dy = C[j][1] - C[i][1], dd = Math.hypot(dx, dy);
        if (dd >= 2 * rc || dd === 0) continue;
        const a = dd / 2, h = Math.sqrt(rc * rc - a * a), mx = C[i][0] + (dx * a) / dd, my = C[i][1] + (dy * a) / dd;
        let pts = [[mx + (h * dy) / dd, my - (h * dx) / dd], [mx - (h * dy) / dd, my + (h * dx) / dd]];
        pts.sort((u, v) => u[1] - v[1] || u[0] - v[0]);
        under[i].push({ over: j, p: pts[0] });
        under[j].push({ over: i, p: pts[1] });
      }
      const del = ((w * 1.25 + p.gap) / rc) / RAD;
      let defs = '', s = '';
      C.forEach((q, i) => {
        const m = under[i].map((u) => { const oc = C[u.over], a = Math.atan2(u.p[1] - oc[1], u.p[0] - oc[0]) / RAD; return `<path d="${arcD(oc[0], oc[1], rc, a - del, a + del)}" fill="none" stroke="#000" stroke-width="${f(w + 2 * p.gap)}"/>`; }).join('');
        defs += maskEl(id + i, m);
        s += `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(rc)}" fill="none" stroke="${p.twoTone && i % 2 ? c.accent : c.fg}" stroke-width="${f(w)}" mask="url(#${id}${i})"/>`;
      });
      return `<defs>${defs}</defs>${s}`;
    });

  fam('geo-split', 'Split circle', 'Geometric',
    'A circle cut once. The halves slip, part, turn or change state: a horizon, a before and after, a hinge.',
    [pS('variant', 'Variant', [['shift', 'Slip'], ['gap', 'Part'], ['outline', 'Solid + outline'], ['swivel', 'Swivel']], 'shift'), pR('angle', 'Cut angle', 0, 180, 5, 0),
      pR('gap', 'Gap', 0, 12, 0.5, 4), pR('shift', 'Slip / turn', 0, 24, 0.5, 8), pR('weight', 'Outline weight', 2, 8, 0.5, 3.5)],
    (p, c) => {
      const id = uid(), a = p.angle, ca = Math.cos(a * RAD), sa = Math.sin(a * RAD), nx = -sa, ny = ca;
      const defs = `<defs>${clipEl(id + 'a', halfPlane(50, 50, a, p.gap / 2, 1))}${clipEl(id + 'b', halfPlane(50, 50, a, -p.gap / 2, -1))}</defs>`;
      const disc = (fill) => `<circle cx="50" cy="50" r="40" fill="${fill}"/>`;
      if (p.variant === 'outline') {
        return defs + `<g clip-path="url(#${id}b)">${disc(c.fg)}</g><g clip-path="url(#${id}a)"><circle cx="50" cy="50" r="${f(40 - p.weight / 2)}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}"/></g>`;
      }
      if (p.variant === 'swivel') return defs + `<g clip-path="url(#${id}b)">${disc(c.fg)}</g><g transform="rotate(${f(p.shift * 2.5)} 50 50)"><g clip-path="url(#${id}a)">${disc(c.accent)}</g></g>`;
      const sh = p.variant === 'shift' ? p.shift / 2 : 0;
      const g = p.variant === 'gap' ? p.gap / 2 : 0;
      return defs + `<g transform="translate(${f(-sh * ca - g * nx)} ${f(-sh * sa - g * ny)})"><g clip-path="url(#${id}b)">${disc(c.fg)}</g></g>` +
        `<g transform="translate(${f(sh * ca + g * nx)} ${f(sh * sa + g * ny)})"><g clip-path="url(#${id}a)">${disc(c.fg)}</g></g>`;
    });

  fam('geo-bands', 'Banded disc', 'Geometric',
    'A disc or square cut by horizontal gaps: even bands, a sunset that dissolves downward, or a shaded sphere.',
    [pR('bands', 'Bands', 3, 14, 1, 7), pS('progression', 'Progression', ['even', 'sunset', 'sphere'], 'sunset'), pS('shape', 'Shape', [['disc', 'Disc'], ['half', 'Half disc'], ['square', 'Square']], 'disc'),
      pR('angle', 'Angle', -45, 45, 1, 0), pR('gap', 'Gap', 1, 6, 0.25, 2.5)],
    (p, c) => {
      const id = uid();
      let shape, top, bot;
      if (p.shape === 'half') { shape = `<path d="M4,${f(73)}A46,46 0 0,1 96,73Z" fill="${c.fg}"/>`; top = 27; bot = 73; }
      else if (p.shape === 'square') { shape = `<rect x="14.5" y="14.5" width="71" height="71" fill="${c.fg}"/>`; top = 14.5; bot = 85.5; }
      else { shape = `<circle cx="50" cy="50" r="40" fill="${c.fg}"/>`; top = 10; bot = 90; }
      const H = bot - top, n = p.bands;
      let m = '';
      const bar = (y, h) => { m += `<rect x="-50" y="${f(y)}" width="200" height="${f(h)}"/>`; };
      if (p.progression === 'even') for (let k = 1; k < n; k++) bar(top + (H * k) / n - p.gap / 2, p.gap);
      else if (p.progression === 'sunset') {
        const start = top + H * 0.42;
        for (let k = 1; k < n; k++) { const t = k / n, y = start + (bot - start) * Math.pow(t, 0.85), g = p.gap * (0.35 + 1.5 * t); bar(y - g / 2, g); }
      } else {
        const pitch = H / n;
        for (let k = 0; k < n; k++) { const t = k / (n - 1), fill = pitch * (0.14 + 0.86 * Math.pow(t, 1.3)); bar(top + k * pitch, pitch - fill); }
      }
      return `<defs>${maskEl(id + 'm', `<g fill="#000" transform="rotate(${f(p.angle)} 50 50)">${m}</g>`)}</defs><g mask="url(#${id}m)">${shape}</g>`;
    });

  fam('geo-segments', 'Segmented ring', 'Geometric',
    'A ring or disc divided by parallel-sided cuts into equal segments, one or more picked out in accent.',
    [pR('segments', 'Segments', 3, 16, 1, 6), pR('thick', 'Ring thickness', 0.2, 1, 0.01, 0.45), pR('gap', 'Gap', 1, 8, 0.25, 3),
      pS('accent', 'Accent', ['none', 'one', 'alternate'], 'one'), pR('rotation', 'Rotation', 0, 90, 1, 0)],
    (p, c) => {
      const id = uid(), R = 40, r0 = R * (1 - p.thick), n = p.segments;
      const cuts = range(n).map((i) => `<rect x="0" y="${f(-p.gap / 2)}" width="60" height="${f(p.gap)}" transform="translate(50 50) rotate(${f(-90 + p.rotation + (360 / n) * i)})"/>`).join('');
      const ring = r0 > 0.5 ? `<path d="${circleD(50, 50, R)}${circleD(50, 50, r0)}" fill="${c.fg}" fill-rule="evenodd"/>` : `<circle cx="50" cy="50" r="${R}" fill="${c.fg}"/>`;
      let acc = '';
      for (let i = 0; i < n; i++) {
        if (p.accent === 'one' ? i !== 0 : p.accent === 'alternate' ? i % 2 : true) continue;
        const a0 = -90 + p.rotation + (360 / n) * i;
        acc += `<path d="${sectorD(50, 50, r0, R, a0, a0 + 360 / n)}" fill="${c.accent}"/>`;
      }
      return `<defs>${maskEl(id + 'm', `<g fill="#000">${cuts}</g>`)}</defs><g mask="url(#${id}m)">${ring}${acc}</g>`;
    });

  fam('geo-crescent', 'Crescent and phase', 'Geometric',
    'A disc eclipsed by another: a crescent, a two-tone eclipse or a row of phases. Time, rhythm, change.',
    [pS('variant', 'Variant', [['crescent', 'Crescent'], ['eclipse', 'Eclipse'], ['phases', 'Phases']], 'crescent'), pR('offset', 'Offset', 0.15, 0.8, 0.01, 0.36),
      pR('rotation', 'Rotation', -180, 180, 5, -35), pR('count', 'Phases', 3, 5, 1, 3)],
    (p, c) => {
      const id = uid(), o = P(0, 0, p.offset * 80, p.rotation);
      if (p.variant === 'phases') {
        const n = p.count, g = 4, r = Math.min(20, (88 - (n - 1) * g) / (2 * n));
        let s = '', defs = '';
        for (let i = 0; i < n; i++) {
          const cx = 50 - ((n - 1) * (2 * r + g)) / 2 + i * (2 * r + g), t = i / (n - 1);
          const dx = (0.35 + 1.25 * t) * r;
          if (t >= 0.999) { s += `<circle cx="${f(cx)}" cy="50" r="${f(r)}" fill="${c.fg}"/>`; continue; }
          defs += maskEl(id + i, `<circle cx="${f(cx - dx)}" cy="50" r="${f(r)}" fill="#000"/>`);
          s += `<circle cx="${f(cx)}" cy="50" r="${f(r)}" fill="${c.fg}" mask="url(#${id}${i})"/>`;
        }
        return `<defs>${defs}</defs>${s}`;
      }
      if (p.variant === 'eclipse') return `<defs>${clipEl(id + 'c', `<circle cx="50" cy="50" r="40"/>`)}</defs><circle cx="50" cy="50" r="40" fill="${c.accent}"/><g clip-path="url(#${id}c)"><circle cx="${f(50 + o[0])}" cy="${f(50 + o[1])}" r="40" fill="${c.fg}"/></g>`;
      return `<defs>${maskEl(id + 'm', `<circle cx="${f(50 + o[0])}" cy="${f(50 + o[1])}" r="38" fill="#000"/>`)}</defs><circle cx="50" cy="50" r="40" fill="${c.fg}" mask="url(#${id}m)"/>`;
    });

  fam('geo-bars', 'Bars and pills', 'Geometric',
    'A row of bars or pills whose heights follow one profile: rising, peaking, a wave or a seeded rhythm.',
    [pR('count', 'Bars', 3, 9, 1, 5), pS('profile', 'Profile', ['rise', 'peak', 'valley', 'wave', 'seeded'], 'peak'), pR('round', 'Roundness', 0, 1, 0.05, 1),
      pR('gap', 'Gap', 0.2, 1.2, 0.05, 0.55), pS('align', 'Align', ['bottom', 'center'], 'center'), pB('accent', 'Accent bar', false), SEED],
    (p, c) => {
      const n = p.count, bw = 80 / (n + (n - 1) * p.gap), r = rng('bars' + p.seed);
      let s = '';
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        let k = 1;
        if (p.profile === 'rise') k = 0.3 + 0.7 * t;
        if (p.profile === 'peak') k = 1 - 0.68 * Math.abs(t * 2 - 1);
        if (p.profile === 'valley') k = 0.32 + 0.68 * Math.abs(t * 2 - 1);
        if (p.profile === 'wave') k = 0.6 + 0.4 * Math.sin(t * Math.PI * 2);
        if (p.profile === 'seeded') k = 0.3 + 0.7 * r();
        const h = Math.max(bw, 76 * k), x = 10 + i * bw * (1 + p.gap), y = p.align === 'bottom' ? 88 - h : 50 - h / 2;
        s += `<rect x="${f(x)}" y="${f(y)}" width="${f(bw)}" height="${f(h)}" rx="${f((p.round * bw) / 2)}" fill="${p.accent && i === Math.floor(n / 2) ? c.accent : c.fg}"/>`;
      }
      return s;
    });

  fam('geo-tri', 'Triangle grid', 'Geometric',
    'An equilateral triangle subdivided into a lattice: a Sierpinski pattern, two tones, or a seeded selection.',
    [pR('depth', 'Subdivisions', 1, 4, 1, 2), pS('mode', 'Mode', [['sierpinski', 'Sierpinski'], ['alternate', 'Two-tone'], ['seeded', 'Seeded']], 'sierpinski'), pR('gap', 'Gap', 0, 4, 0.25, 1.5), SEED],
    (p, c) => {
      const m = Math.pow(2, p.depth), side = 94, H = side * Math.sqrt(3) / 2, s = side / m, h = H / m, y0 = 50 - H / 2 + 3, r = rng('tri' + p.seed);
      const shrink = (pts) => { const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3, k = Math.max(0.55, 1 - (p.gap / 2) / (h / 3)); return pts.map((q) => [cx + (q[0] - cx) * k, cy + (q[1] - cy) * k]); };
      let out = '';
      for (let k = 0; k < m; k++) for (let j = 0; j <= k; j++) {
        const ax = 50 - (k * s) / 2 + j * s, ay = y0 + k * h;
        const up = [[ax, ay], [ax + s / 2, ay + h], [ax - s / 2, ay + h]];
        let show = true, fill = c.fg;
        if (p.mode === 'sierpinski') show = (j & (k - j)) === 0;
        if (p.mode === 'seeded') { show = r() < 0.78; if (r() < 0.12) fill = c.accent; }
        if (show) out += `<path d="${polyD(shrink(up))}" fill="${fill}"/>`;
        if (j < k && p.mode !== 'sierpinski') {
          const dn = [[ax, ay], [ax + s, ay], [ax + s / 2, ay + h]];
          if (p.mode === 'alternate' || r() < 0.3) out += `<path d="${polyD(shrink(dn))}" fill="${c.accent}"/>`;
        }
      }
      return out;
    });

  fam('geo-pinwheel', 'Pinwheel', 'Geometric',
    'Blades turning around one point: right triangles, half discs or sectors. Rotation without an arrow.',
    [pR('blades', 'Blades', 3, 8, 1, 4), pS('shape', 'Blade', [['triangle', 'Triangle'], ['semicircle', 'Half disc'], ['sector', 'Sector']], 'triangle'),
      pR('gap', 'Gap', 0, 6, 0.25, 2), pB('twoTone', 'Two-tone', false), pR('rotation', 'Rotation', 0, 90, 1, 0)],
    (p, c) => {
      const n = p.blades, half = 180 / n, R = p.shape === 'triangle' ? 46 : 42;
      let s = '';
      for (let i = 0; i < n; i++) {
        const a = -90 + p.rotation + (360 / n) * i, fill = p.twoTone && i % 2 ? c.accent : c.fg;
        let d, dir;
        if (p.shape === 'triangle') { const ap = R * Math.cos(half * RAD); d = polyD([[50, 50], P(50, 50, ap, a), P(50, 50, R, a + half)]); dir = a + half * 0.6; }
        else if (p.shape === 'semicircle') { const e = P(50, 50, R, a); d = `M50,50L${f(e[0])},${f(e[1])}A${f(R / 2)},${f(R / 2)} 0 0,1 50,50Z`; dir = a + 30; }
        else { d = sectorD(50, 50, 0, R, a, a + half); dir = a + half / 2; }
        const g = P(0, 0, p.gap / 2 / Math.sin(Math.max(half, 20) * RAD / 2), dir);
        s += `<path d="${d}" fill="${fill}" transform="translate(${f(g[0] * 0.5)} ${f(g[1] * 0.5)})"/>`;
      }
      return s;
    });

  fam('geo-blocks', 'Offset blocks', 'Geometric',
    'Two or three rounded squares stepping on a diagonal; the overlap becomes a third shape.',
    [pR('count', 'Blocks', 2, 3, 1, 2), pR('offset', 'Offset', 0.2, 0.7, 0.01, 0.4), pR('round', 'Roundness', 0, 1, 0.05, 0.3),
      pS('mode', 'Overlap', [['lens', 'Accent overlap'], ['xor', 'Knockout'], ['multiply', 'Multiply'], ['outline', 'Outline']], 'lens'), pR('weight', 'Outline weight', 2, 8, 0.5, 4)],
    (p, c) => {
      const id = uid(), n = p.count, S = 76 / (1 + (n - 1) * p.offset), d = S * p.offset;
      const blocks = range(n).map((i) => { const x = 50 - (S + (n - 1) * d) / 2 + i * d, y = 50 - (S + (n - 1) * d) / 2 + i * d; return [x, y]; });
      const rr = (p.round * S) / 4;
      const D = (q, ins = 0) => roundPolyD([[q[0] + ins, q[1] + ins], [q[0] + S - ins, q[1] + ins], [q[0] + S - ins, q[1] + S - ins], [q[0] + ins, q[1] + S - ins]], Math.max(0, rr - ins));
      if (p.mode === 'xor') return `<path d="${blocks.map((q) => D(q)).join('')}" fill="${c.fg}" fill-rule="evenodd"/>`;
      if (p.mode === 'outline') return blocks.map((q) => `<path d="${D(q, p.weight / 2)}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}"/>`).join('');
      if (p.mode === 'multiply') return `<g style="isolation:isolate">${blocks.map((q, i) => `<path d="${D(q)}" fill="${i % 2 ? c.accent : c.fg}" style="mix-blend-mode:multiply"/>`).join('')}</g>`;
      let s = blocks.map((q) => `<path d="${D(q)}" fill="${c.fg}"/>`).join(''), defs = '';
      for (let i = 0; i < n - 1; i++) { defs += clipEl(id + i, `<path d="${D(blocks[i])}"/>`); s += `<g clip-path="url(#${id}${i})"><path d="${D(blocks[i + 1])}" fill="${c.accent}"/></g>`; }
      return `<defs>${defs}</defs>${s}`;
    });

  /* ======================================================================
     SYMBOL (abstracted, built from circles, lines and arcs; never pictures)
     ====================================================================== */
  fam('sym-sun', 'Sun', 'Symbol',
    'Light reduced to a disc and a rhythm: rising over a horizon, radiating, ringed with dots, or setting into its reflection.',
    [pS('variant', 'Variant', [['rising', 'Rising'], ['radiant', 'Radiant'], ['dotted', 'Dotted halo'], ['sunset', 'Reflection']], 'rising'),
      pR('rays', 'Rays', 6, 24, 1, 11), pR('disc', 'Disc size', 0.3, 0.65, 0.01, 0.46), pR('weight', 'Weight', 2.5, 10, 0.25, 5), pR('gap', 'Gap', 2, 9, 0.25, 4.5)],
    (p, c) => {
      const w = p.weight, g = p.gap;
      if (p.variant === 'rising' || p.variant === 'sunset') {
        const Rr = 42, cy = p.variant === 'rising' ? (142 - g - w) / 2 : 56, rd = Rr * p.disc * (p.variant === 'sunset' ? 1.75 : 1);
        let s = `<path d="${sectorD(50, cy, 0, rd, 180, 360)}" fill="${c.fg}"/>`;
        if (p.variant === 'rising') {
          for (let i = 0; i < p.rays; i++) { const a = 180 + ((i + 0.5) * 180) / p.rays, a0 = P(50, cy, rd + g, a), a1 = P(50, cy, Rr, a); s += `<line x1="${f(a0[0])}" y1="${f(a0[1])}" x2="${f(a1[0])}" y2="${f(a1[1])}" stroke="${c.fg}" stroke-width="${f(w)}"/>`; }
          s += `<rect x="8" y="${f(cy + g)}" width="84" height="${f(w)}" fill="${c.accent}"/>`;
        } else {
          let y = cy + g;
          [1, 0.74, 0.5, 0.3].forEach((k, i) => { const hw = rd * k; s += `<rect x="${f(50 - hw)}" y="${f(y)}" width="${f(2 * hw)}" height="${f(w * (1 - i * 0.18))}" fill="${i === 0 ? c.accent : c.fg}"/>`; y += w * (1 - i * 0.18) + g * 0.8; });
          s = `<g transform="translate(0 ${f(50 - (cy - rd + y - g * 0.8) / 2)})">${s}</g>`;
        }
        return s;
      }
      const rd = 42 * p.disc;
      let s = `<circle cx="50" cy="50" r="${f(rd)}" fill="${c.accent}"/>`;
      for (let i = 0; i < p.rays; i++) {
        const a = -90 + (360 / p.rays) * i;
        if (p.variant === 'dotted') { const q = P(50, 50, (rd + g + 42) / 2 + 2, a); s += `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(Math.min(w * 0.75, (42 - rd - g) / 2))}" fill="${c.fg}"/>`; }
        else { const a0 = P(50, 50, rd + g, a), a1 = P(50, 50, 43, a); s += `<line x1="${f(a0[0])}" y1="${f(a0[1])}" x2="${f(a1[0])}" y2="${f(a1[1])}" stroke="${c.fg}" stroke-width="${f(w)}"/>`; }
      }
      return s;
    });

  fam('sym-leaf', 'Leaf', 'Symbol',
    'A lens of two arcs and a midrib gap. Single, split into two tones, paired, or drawn as a monoline.',
    [pS('variant', 'Variant', [['single', 'Single'], ['split', 'Split'], ['pair', 'Pair'], ['vein', 'Monoline']], 'single'), pR('angle', 'Angle', -60, 60, 1, -35),
      pR('width', 'Width', 0.3, 0.8, 0.01, 0.46), pR('gap', 'Midrib gap', 1, 6, 0.25, 2.5), pR('weight', 'Line weight', 2, 6, 0.25, 3.5)],
    (p, c) => {
      const id = uid(), rot = (s) => `<g transform="rotate(${f(p.angle)} 50 50)">${s}</g>`;
      if (p.variant === 'pair') {
        const a = Math.max(18, Math.abs(p.angle)), L = 72, hw = (L * p.width) / 2, base = [50, 90];
        const leaf = (ang, fill) => { const tip = P(base[0], base[1], L, -90 + ang); return `<path d="${vesicaD(base[0], base[1], tip[0], tip[1], hw)}" fill="${fill}"/>`; };
        const s = leaf(-a, c.fg) + leaf(a, c.accent);
        return `<defs>${maskEl(id + 'm', `<path d="M50,92V40" stroke="#000" stroke-width="${f(p.gap)}"/>`)}</defs><g transform="translate(0 -8)" mask="url(#${id}m)" style="isolation:isolate">${s}</g>`;
      }
      const hw = 44 * p.width, d = vesicaD(50, 94, 50, 6, hw);
      if (p.variant === 'vein') {
        const W = p.weight, d2 = vesicaD(50, 94 - W / 2, 50, 6 + W / 2, hw - W / 2);
        let v = `<path d="M50,90V22"/>`;
        [0.34, 0.5, 0.66].forEach((t) => { const y = 94 - 88 * t, wy = hw * Math.sin(Math.PI * t) * 0.78; v += `<path d="M50,${f(y)}L${f(50 - wy)},${f(y - wy * 0.75)}M50,${f(y)}L${f(50 + wy)},${f(y - wy * 0.75)}"/>`; });
        return rot(`<path d="${d2}" fill="none" stroke="${c.fg}" stroke-width="${f(W)}"/><g fill="none" stroke="${c.fg}" stroke-width="${f(W)}" stroke-linecap="round">${v}</g>`);
      }
      if (p.variant === 'split') {
        return rot(`<defs>${clipEl(id + 'l', `<rect x="-50" y="-50" width="${f(100 - p.gap / 2)}" height="200"/>`)}${clipEl(id + 'r', `<rect x="${f(50 + p.gap / 2)}" y="-50" width="100" height="200"/>`)}</defs><path d="${d}" fill="${c.fg}" clip-path="url(#${id}l)"/><path d="${d}" fill="${c.accent}" clip-path="url(#${id}r)"/>`);
      }
      return rot(`<defs>${maskEl(id + 'm', `<path d="M50,100V30" stroke="#000" stroke-width="${f(p.gap)}" stroke-linecap="round"/>`)}</defs><path d="${d}" fill="${c.fg}" mask="url(#${id}m)"/>`);
    });

  function dropD(cx, top, bot, tip) {
    const r = (bot - top) / (2 + tip), cy = bot - r, dd = cy - top, b = Math.acos(r / dd) / RAD;
    const R1 = P(cx, cy, r, -90 + b), L1 = P(cx, cy, r, -90 - b);
    return { d: `M${f(cx)},${f(top)}L${f(R1[0])},${f(R1[1])}A${f(r)},${f(r)} 0 1,1 ${f(L1[0])},${f(L1[1])}Z`, r, cy };
  }
  fam('sym-drop', 'Drop', 'Symbol',
    'A circle and two tangents: the purest drop. With a cut highlight, as an outline, or split in two tones.',
    [pS('variant', 'Variant', [['solid', 'Solid'], ['highlight', 'Highlight cut'], ['outline', 'Outline'], ['split', 'Split']], 'highlight'),
      pR('tip', 'Tip height', 0.4, 1.4, 0.01, 0.9), pR('weight', 'Weight', 2, 9, 0.25, 5), pR('gap', 'Gap', 1, 6, 0.25, 3)],
    (p, c) => {
      const id = uid(), D = dropD(50, 8, 92, p.tip);
      if (p.variant === 'outline') { const Di = dropD(50, 8 + p.weight * 1.3, 92 - p.weight / 2, p.tip); return `<path d="${Di.d}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}" stroke-linejoin="miter" stroke-miterlimit="8"/>`; }
      if (p.variant === 'split') return `<defs>${clipEl(id + 'l', `<rect x="-50" y="-50" width="${f(100 - p.gap / 2)}" height="200"/>`)}${clipEl(id + 'r', `<rect x="${f(50 + p.gap / 2)}" y="-50" width="100" height="200"/>`)}</defs><path d="${D.d}" fill="${c.fg}" clip-path="url(#${id}l)"/><path d="${D.d}" fill="${c.accent}" clip-path="url(#${id}r)"/>`;
      if (p.variant === 'highlight') return `<defs>${maskEl(id + 'm', `<path d="${arcD(50, D.cy, D.r * 0.64, 100, 165)}" fill="none" stroke="#000" stroke-width="${f(p.weight)}" stroke-linecap="round"/>`)}</defs><path d="${D.d}" fill="${c.fg}" mask="url(#${id}m)"/>`;
      return `<path d="${D.d}" fill="${c.fg}"/>`;
    });

  fam('sym-mountain', 'Mountain', 'Symbol',
    'Overlapping peaks separated by an exact keyline, with an optional snow line or sun.',
    [pR('peaks', 'Peaks', 1, 3, 1, 2), pS('variant', 'Variant', [['solid', 'Solid'], ['snowcap', 'Snow line'], ['outline', 'Outline'], ['sun', 'With sun']], 'snowcap'),
      pR('slope', 'Steepness', 0.7, 1.6, 0.01, 1.05), pR('round', 'Rounded peaks', 0, 1, 0.05, 0), pR('gap', 'Keyline', 1, 5, 0.25, 2.5)],
    (p, c) => {
      const id = uid(), s = p.slope;
      const defsP = p.peaks === 1 ? [[50, 44, 44 * s * 0.92]] : p.peaks === 2 ? [[63, 31, 31 * s * 1.3], [35, 29, 29 * s * 1.05]] : [[50, 28, 28 * s * 1.4], [23, 20, 20 * s * 1.25], [76, 22, 22 * s * 1.2]];
      /* scale the range so its tallest peak lands near the optical size of the other marks, then centre it */
      const tall = Math.max(...defsP.map((q) => q[2])), kk = Math.min(1.5, 58 / tall);
      const fit = defsP.map((q) => [50 + (q[0] - 50) * Math.min(1, kk), q[1] * Math.min(1, kk), q[2] * kk]);
      const xl = Math.min(...fit.map((q) => q[0] - q[1])), xr = Math.max(...fit.map((q) => q[0] + q[1]));
      fit.forEach((q) => { q[0] += 50 - (xl + xr) / 2; });
      const H = Math.min(80, Math.max(...fit.map((q) => q[2])));
      fit.forEach((q) => { q[2] = Math.min(q[2], 80); });
      const B = 50 + H / 2;
      const tri = (q) => [[q[0] - q[1], B], [q[0], B - q[2]], [q[0] + q[1], B]];
      const D = (q) => roundPolyD(tri(q), p.round * 9);
      let s2 = '', defs = '';
      if (p.variant === 'sun') s2 += `<circle cx="${f(p.peaks === 1 ? 72 : 30)}" cy="${f(B - H * 0.86)}" r="${f(H * 0.16)}" fill="${c.accent}"/>`;
      fit.forEach((q, i) => {
        let m = fit.slice(i + 1).map((o) => `<path d="${D(o)}" fill="#000" stroke="#000" stroke-width="${f(p.gap * 2)}" stroke-linejoin="round"/>`).join('');
        if (p.variant === 'snowcap') {
          const t = 0.38, ys = B - q[2] + q[2] * t, xl = q[0] - q[1] * t, xr = q[0] + q[1] * t, z = q[1] * t * 0.32, k = (xr - xl) / 4;
          m += `<path d="M${f(xl - 2)},${f(ys)}L${f(xl + k)},${f(ys + z)}L${f(q[0])},${f(ys)}L${f(xr - k)},${f(ys + z)}L${f(xr + 2)},${f(ys)}" fill="none" stroke="#000" stroke-width="${f(p.gap)}" stroke-linejoin="miter"/>`;
        }
        defs += maskEl(id + i, m);
        if (p.variant === 'outline') s2 += `<path d="${roundPolyD(tri([q[0], q[1] - 2, q[2] - 3]).map((v, j) => (j === 1 ? v : [v[0], v[1] - 1.5])), p.round * 9)}" fill="none" stroke="${c.fg}" stroke-width="3.5" stroke-linejoin="miter" mask="url(#${id}${i})"/>`;
        else s2 += `<path d="${D(q)}" fill="${c.fg}" mask="url(#${id}${i})"/>`;
      });
      return `<defs>${defs}</defs>${s2}`;
    });

  fam('sym-wave', 'Wave', 'Symbol',
    'Water as rhythm: parallel sine lines, a block with a wave edge, or waves cut through a disc.',
    [pS('variant', 'Variant', [['lines', 'Lines'], ['block', 'Wave block'], ['circle', 'Cut disc']], 'circle'), pR('count', 'Waves', 2, 5, 1, 3),
      pR('amp', 'Amplitude', 2, 12, 0.25, 5.5), pR('cycles', 'Cycles', 1, 3, 0.25, 1.5), pR('weight', 'Weight', 3, 12, 0.25, 7)],
    (p, c) => {
      const id = uid(), w = p.weight;
      const wave = (y, x0 = 0, x1 = 100) => smoothD(range(41).map((k) => { const x = x0 + ((x1 - x0) * k) / 40; return [x, y + p.amp * Math.sin(2 * Math.PI * p.cycles * (x - 14) / 72)]; }), false);
      if (p.variant === 'lines') {
        const pitch = w * 2.3, y0 = 50 - ((p.count - 1) * pitch) / 2;
        return range(p.count).map((i) => `<path d="${wave(y0 + i * pitch, 12 + w / 2, 88 - w / 2)}" fill="none" stroke="${i === 0 ? c.accent : c.fg}" stroke-width="${f(w)}" stroke-linecap="round"/>`).join('');
      }
      const R = p.variant === 'circle' ? 40 : 35.5, pitch = (2 * R) / (p.count + 1);
      const shape = p.variant === 'circle' ? `<circle cx="50" cy="50" r="40" fill="${c.fg}"/>` : `<rect x="14.5" y="14.5" width="71" height="71" rx="6" fill="${c.fg}"/>`;
      let m = '';
      for (let i = 1; i <= p.count; i++) m += `<path d="${wave(50 - R + i * pitch - (p.variant === 'block' ? pitch * 0.25 : 0))}" fill="none" stroke="#000" stroke-width="${f(w * 0.55)}"/>`;
      if (p.variant === 'block') m += `<path d="${wave(14.5 + pitch * 0.5)}V-10H0Z" fill="#000"/>`;
      return `<defs>${maskEl(id + 'm', m)}</defs><g mask="url(#${id}m)">${shape}</g>`;
    });

  function arrowPts(len, w, head) {
    const hh = len * head * 0.62, hw = hh * 0.92, t = 50 - len / 2, b = 50 + len / 2;
    return [[50, t], [50 + hw, t + hh], [50 + w / 2, t + hh], [50 + w / 2, b], [50 - w / 2, b], [50 - w / 2, t + hh], [50 - hw, t + hh]];
  }
  fam('sym-arrow', 'Arrow', 'Symbol',
    'Direction without decoration: a solid arrow, a Swiss corner arrow, an arrow cut from a disc, or a chevron over a stem.',
    [pS('variant', 'Variant', [['straight', 'Solid'], ['corner', 'Corner line'], ['circle', 'Cut from disc'], ['chevron', 'Chevron + stem']], 'corner'),
      pR('weight', 'Weight', 5, 18, 0.5, 10), pR('head', 'Head', 0.3, 0.8, 0.01, 0.52), pR('rotation', 'Rotation', 0, 315, 45, 0)],
    (p, c) => {
      const id = uid(), w = p.weight, rot = (s) => (p.rotation ? `<g transform="rotate(${p.rotation} 50 50)">${s}</g>` : s);
      if (p.variant === 'corner') {
        const a = 16 + w / 2, b = 84 - w / 2, L = (b - a) * p.head * 1.15;
        return rot(`<path d="M${f(a)},${f(b)}L${f(b - w * 0.35)},${f(a + w * 0.35)}M${f(b - L)},${f(a)}H${f(b)}V${f(a + L)}" fill="none" stroke="${c.fg}" stroke-width="${f(w)}" stroke-linejoin="miter" stroke-miterlimit="4"/>`);
      }
      if (p.variant === 'circle') return `<defs>${maskEl(id + 'm', rot(`<path d="${polyD(arrowPts(52, w * 0.8, p.head))}" fill="#000"/>`))}</defs><circle cx="50" cy="50" r="40" fill="${c.fg}" mask="url(#${id}m)"/>`;
      if (p.variant === 'chevron') {
        const hw = 38, d = hw * p.head * 1.4, t = w * 1.2, g = w * 0.6, H = d + t + g + (84 - d - t - g) * 0.0, y0 = 8;
        const stem = `<rect x="${f(50 - w / 2)}" y="${f(y0 + t + g + w * 0.5)}" width="${f(w)}" height="${f(92 - (y0 + t + g + w * 0.5))}" fill="${c.fg}"/>`;
        void H;
        return rot(`<path d="${polyD([[50 - hw, y0 + d], [50, y0], [50 + hw, y0 + d], [50 + hw, y0 + d + t], [50, y0 + t], [50 - hw, y0 + d + t]])}" fill="${c.accent}"/>${stem}`);
      }
      return rot(`<path d="${polyD(arrowPts(84, w, p.head))}" fill="${c.fg}"/>`);
    });

  fam('sym-spark', 'Spark and asterisk', 'Symbol',
    'Spokes, a concave sparkle or slots cut from a disc. The asterisk as a sign of something extra.',
    [pS('variant', 'Variant', [['asterisk', 'Asterisk'], ['sparkle', 'Sparkle'], ['cut', 'Cut disc']], 'asterisk'), pR('arms', 'Arms', 3, 16, 1, 6),
      pR('thick', 'Thickness', 3, 16, 0.5, 9), pR('length', 'Length', 0.5, 1, 0.01, 1), pR('hole', 'Centre hole', 0, 0.4, 0.01, 0), pS('cap', 'Terminals', [['round', 'Round'], ['butt', 'Flat']], 'butt')],
    (p, c) => {
      const id = uid(), n = p.arms;
      if (p.variant === 'sparkle') {
        const R = 46 * p.length, rc = R * (0.04 + p.thick / 60);
        let d = '';
        for (let i = 0; i < n; i++) {
          const a = -90 + (360 / n) * i, t0 = P(50, 50, R, a), cc = P(50, 50, rc, a + 180 / n), t1 = P(50, 50, R, a + 360 / n);
          d += (i ? '' : `M${f(t0[0])},${f(t0[1])}`) + `Q${f(cc[0])},${f(cc[1])} ${f(t1[0])},${f(t1[1])}`;
        }
        let s = `<path d="${d}Z" fill="${c.fg}"/>`;
        if (p.hole > 0) s = `<defs>${maskEl(id + 'm', `<circle cx="50" cy="50" r="${f(p.hole * R * 0.5)}" fill="#000"/>`)}</defs><g mask="url(#${id}m)">${s}</g>`;
        return s;
      }
      if (p.variant === 'cut') {
        let m = '';
        for (let i = 0; i < n; i++) m += `<rect x="${f(p.hole * 40)}" y="${f(-p.thick * 0.3)}" width="60" height="${f(p.thick * 0.6)}" transform="translate(50 50) rotate(${f(-90 + (360 / n) * i)})"/>`;
        m += p.hole > 0 ? `<circle cx="50" cy="50" r="${f(p.hole * 40)}"/>` : '';
        return `<defs>${maskEl(id + 'm', `<g fill="#000">${m}</g>`)}</defs><circle cx="50" cy="50" r="40" fill="${c.fg}" mask="url(#${id}m)"/>`;
      }
      const R = 43 * p.length - (p.cap === 'round' ? p.thick / 2 : 0), r0 = p.hole * 43;
      let s = '';
      for (let i = 0; i < n; i++) { const a = -90 + (360 / n) * i, a0 = P(50, 50, r0, a), a1 = P(50, 50, R, a); s += `<line x1="${f(a0[0])}" y1="${f(a0[1])}" x2="${f(a1[0])}" y2="${f(a1[1])}"/>`; }
      return `<g stroke="${c.fg}" stroke-width="${f(p.thick)}" stroke-linecap="${p.cap}">${s}</g>`;
    });

  fam('sym-eye', 'Eye', 'Symbol',
    'Vision as two arcs and a circle: an almond with a cut iris, a keyline almond, or an almond cut from a disc.',
    [pS('variant', 'Variant', [['almond', 'Almond'], ['outline', 'Outline'], ['disc', 'Cut from disc']], 'almond'), pR('open', 'Openness', 0.3, 0.8, 0.01, 0.5),
      pR('pupil', 'Pupil', 0.2, 0.75, 0.01, 0.46), pR('weight', 'Weight', 2, 8, 0.25, 4), pB('accent', 'Accent pupil', true)],
    (p, c) => {
      const id = uid(), pf = p.accent ? c.accent : c.fg;
      if (p.variant === 'disc') {
        const hw = 34 * p.open * 0.9, ri = Math.min(hw * 0.95, 14) * 1.05;
        const al = vesicaD(16, 50, 84, 50, hw);
        return `<defs>${maskEl(id + 'm', `<path d="${al}" fill="#000"/>`)}</defs><circle cx="50" cy="50" r="40" fill="${c.fg}" mask="url(#${id}m)"/><circle cx="50" cy="50" r="${f(ri * p.pupil * 1.6)}" fill="${pf}"/>`;
      }
      const hw = 44 * p.open, ri = hw * 0.86;
      if (p.variant === 'outline') {
        const w = p.weight;
        return `<path d="${vesicaD(6 + w, 50, 94 - w, 50, hw - w / 2)}" fill="none" stroke="${c.fg}" stroke-width="${f(w)}"/><circle cx="50" cy="50" r="${f(ri * 0.78)}" fill="${c.fg}"/><circle cx="50" cy="50" r="${f(ri * 0.78 * p.pupil)}" fill="${pf}"/>`;
      }
      return `<defs>${maskEl(id + 'm', `<circle cx="50" cy="50" r="${f(ri)}" fill="#000"/>`)}</defs><path d="${vesicaD(4, 50, 96, 50, hw)}" fill="${c.fg}" mask="url(#${id}m)"/><circle cx="50" cy="50" r="${f(ri * (0.35 + p.pupil * 0.6))}" fill="${pf}"/>`;
    });

  fam('sym-house', 'House and roof', 'Symbol',
    'Shelter as a pentagon: solid with a door cut, a keyline outline, or a separated roofline over a block.',
    [pS('variant', 'Variant', [['solid', 'Solid'], ['outline', 'Outline'], ['roofline', 'Roofline']], 'roofline'), pR('pitch', 'Roof pitch', 0.4, 1.1, 0.01, 0.7),
      pR('round', 'Roundness', 0, 1, 0.05, 0), pB('door', 'Door', true), pR('weight', 'Weight', 3, 12, 0.5, 7)],
    (p, c) => {
      const id = uid(), Hw = 38, Hr = 34 * p.pitch, H = Hw + Hr, B = 50 + H / 2, E = B - Hw, A = B - H, w = p.weight;
      const pts = [[16, B], [16, E], [50, A], [84, E], [84, B]];
      const door = (x, b, dw, dh, fill) => `<path d="M${f(x - dw / 2)},${f(b + 1)}V${f(b - dh + dw / 2)}A${f(dw / 2)},${f(dw / 2)} 0 0,1 ${f(x + dw / 2)},${f(b - dh + dw / 2)}V${f(b + 1)}Z" fill="${fill}"/>`;
      if (p.variant === 'outline') {
        const ins = pts.map((q, i) => [q[0] + (i < 2 ? w / 2 : i > 2 ? -w / 2 : 0), q[1] + (i === 0 || i === 4 ? -w / 2 : i === 2 ? w * 0.7 : w * 0.25)]);
        return `<path d="${roundPolyD(ins, p.round * 6)}" fill="none" stroke="${c.fg}" stroke-width="${f(w)}" stroke-linejoin="miter"/>` + (p.door ? `<path d="M50,${f(B - w / 2)}V${f(B - 20)}" stroke="${c.accent}" stroke-width="${f(w)}"/>` : '');
      }
      if (p.variant === 'roofline') {
        const g = Math.max(3, w * 0.55), t = w * 1.15;
        const roof = `<path d="${polyD([[8, E + 4], [50, A], [92, E + 4], [92, E + 4 + t], [50, A + t], [8, E + 4 + t]])}" fill="${c.accent}"/>`;
        const top = A + t + g, slope = (E + 4 - A) / 42;
        const body = [[20, B], [20, E + 4 + t + g - 0 + (50 - 20) * 0 + (42 - 30) * slope * 0], [50, top], [80, E + 4 + t + g], [80, B]];
        body[1] = [20, top + 30 * slope];
        body[3] = [80, top + 30 * slope];
        return roof + `<defs>${maskEl(id + 'm', p.door ? door(50, B, 14, 22, '#000') : '')}</defs><path d="${roundPolyD(body, p.round * 6)}" fill="${c.fg}" mask="url(#${id}m)"/>`;
      }
      return `<defs>${maskEl(id + 'm', p.door ? door(50, B, 16, 24, '#000') : '')}</defs><path d="${roundPolyD(pts, p.round * 7)}" fill="${c.fg}" mask="url(#${id}m)"/>`;
    });

  fam('sym-infinity', 'Infinity loop', 'Symbol',
    'A lemniscate that truly crosses over itself. One line, a ribbon, or two tones meeting in the middle.',
    [pS('variant', 'Variant', [['line', 'Line'], ['ribbon', 'Ribbon'], ['twotone', 'Two-tone']], 'line'), pR('weight', 'Weight', 4, 14, 0.5, 9),
      pR('height', 'Height', 0.8, 1.6, 0.01, 1.2), pR('gap', 'Keyline', 1, 5, 0.25, 2.5)],
    (p, c) => {
      const id = uid(), a = 44 - p.weight / 2;
      const pts = range(360).map((k) => { const t = (k / 360) * Math.PI * 2, d = 1 + Math.sin(t) * Math.sin(t); return [50 + (a * Math.cos(t)) / d, 50 + (p.height * a * Math.sin(t) * Math.cos(t)) / d]; });
      const o = { w: p.weight, gap: p.gap, style: p.variant === 'ribbon' ? 'ribbon' : 'line', fill: c.fg };
      if (p.variant !== 'twotone') return weaveCurve(pts, Object.assign(o, { id: id + 'w' }));
      return `<defs>${clipEl(id + 'l', '<rect x="-10" y="-10" width="60" height="120"/>')}${clipEl(id + 'r', '<rect x="50" y="-10" width="60" height="120"/>')}</defs>` +
        weaveCurve(pts, Object.assign({}, o, { id: id + 'a', clip: id + 'l' })) + weaveCurve(pts, Object.assign({}, o, { id: id + 'b', fill: c.accent, clip: id + 'r' }));
    });

  fam('sym-knot', 'Knot', 'Symbol',
    'A torus knot drawn as one continuous line with honest over-and-under crossings. Craft, bond, continuity.',
    [pS('knot', 'Knot', [['2-3', 'Trefoil'], ['2-5', 'Cinquefoil'], ['2-7', 'Seven lobes'], ['3-4', 'Woven 3 × 4'], ['3-5', 'Woven 3 × 5']], '2-3'),
      pR('weight', 'Weight', 3, 12, 0.5, 7), pS('style', 'Style', [['line', 'Line'], ['ribbon', 'Ribbon']], 'line'), pR('gap', 'Keyline', 1, 5, 0.25, 2.5), pR('inner', 'Lobe depth', 0.25, 0.8, 0.01, 0.55)],
    (p, c) => {
      const [kp, kq] = p.knot.split('-').map(Number), N = 260 * kp;
      const raw = range(N).map((k) => { const t = (k / N) * Math.PI * 2 * kp, r = 1 + p.inner * Math.cos((kq * t) / kp); return [r * Math.cos(t - Math.PI / 2), r * Math.sin(t - Math.PI / 2)]; });
      const F = fitPts([raw], 84 - p.weight, 84 - p.weight);
      return weaveCurve(F.sets[0], { id: uid() + 'k', w: Math.min(p.weight, 20 / kp), gap: p.gap, style: p.style, fill: c.fg });
    });

  function starPts(n, inner, rot) {
    const pts = range(2 * n).map((i) => P(0, 0, i % 2 ? inner : 1, -90 + rot + (180 / n) * i));
    const b = bboxOf(pts), k = Math.min(90 / b.w, 90 / b.h);
    return pts.map((q) => [50 + (q[0] - b.cx) * k, 50 + (q[1] - b.cy) * k]);
  }
  fam('sym-star', 'Star', 'Symbol',
    'A star of any point count: solid, keyline, faceted in two tones like a compass rose, or softened.',
    [pR('points', 'Points', 4, 12, 1, 5), pR('inner', 'Inner radius', 0.2, 0.7, 0.01, 0.42), pS('style', 'Style', ['solid', 'outline', 'faceted', 'rounded'], 'faceted'),
      pR('rotation', 'Rotation', -36, 36, 1, 0), pR('weight', 'Outline weight', 2, 6, 0.25, 3)],
    (p, c) => {
      const pts = starPts(p.points, p.inner, p.rotation);
      const cen = (() => { const raw = range(2 * p.points).map((i) => P(0, 0, i % 2 ? p.inner : 1, -90 + p.rotation + (180 / p.points) * i)); const b = bboxOf(raw), k = Math.min(90 / b.w, 90 / b.h); return [50 - b.cx * k, 50 - b.cy * k]; })();
      if (p.style === 'outline') return `<path d="${polyD(starPts(p.points, p.inner, p.rotation).map((q) => [cen[0] + (q[0] - cen[0]) * 0.94, cen[1] + (q[1] - cen[1]) * 0.94]))}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}" stroke-linejoin="miter" stroke-miterlimit="10"/>`;
      if (p.style === 'rounded') return `<path d="${roundPolyD(pts, 4)}" fill="${c.fg}"/>`;
      if (p.style === 'faceted') {
        let s = '';
        for (let i = 0; i < 2 * p.points; i += 2) {
          const tip = pts[i], l = pts[(i - 1 + 2 * p.points) % (2 * p.points)], r = pts[i + 1];
          s += `<path d="${polyD([cen, l, tip])}" fill="${c.fg}" stroke="${c.fg}" stroke-width=".25"/><path d="${polyD([cen, tip, r])}" fill="${c.accent}" stroke="${c.accent}" stroke-width=".25"/>`;
        }
        return s;
      }
      return `<path d="${polyD(pts)}" fill="${c.fg}"/>`;
    });

  function flameD(cx, base, H, W, lean) {
    const r = W / 2, by = base - r, tx = cx + lean * W, ty = base - H;
    return `M${f(cx - r)},${f(by)}A${f(r)},${f(r)} 0 0,0 ${f(cx + r)},${f(by)}C${f(cx + r)},${f(by - H * 0.26)} ${f(tx + W * 0.16)},${f(ty + H * 0.34)} ${f(tx)},${f(ty)}` +
      `C${f(tx - W * 0.1)},${f(ty + H * 0.2)} ${f(cx - r * 1.02)},${f(by - H * 0.3)} ${f(cx - r)},${f(by)}Z`;
  }
  /* a flame with a main tongue and a smaller left tongue: bowl, convex right shoulder, valley, second tip */
  function flame2D(cx, base, H, W, lean) {
    const r = W / 2, by = base - r, T = [cx + lean * W, base - H];
    const V = [cx - r * 0.1, by - H * 0.3], S = [cx - r * 0.66, by - H * 0.47];
    return `M${f(cx - r)},${f(by)}A${f(r)},${f(r)} 0 0,0 ${f(cx + r)},${f(by)}` +
      `C${f(cx + r)},${f(by - H * 0.3)} ${f(T[0] + r * 0.32)},${f(T[1] + H * 0.36)} ${f(T[0])},${f(T[1])}` +
      `C${f(T[0] - r * 0.12)},${f(T[1] + H * 0.22)} ${f(V[0] + r * 0.3)},${f(V[1] - H * 0.12)} ${f(V[0])},${f(V[1])}` +
      `C${f(V[0] - r * 0.22)},${f(V[1] + H * 0.03)} ${f(S[0] + r * 0.3)},${f(S[1] + H * 0.1)} ${f(S[0])},${f(S[1])}` +
      `C${f(S[0] - r * 0.3)},${f(S[1] + H * 0.16)} ${f(cx - r * 1.04)},${f(by - r * 0.7)} ${f(cx - r)},${f(by)}Z`;
  }
  fam('sym-flame', 'Flame', 'Symbol',
    'A flame from one circle and two curves, with a leaning tip. Single, with a cut inner flame, or as a twin.',
    [pS('variant', 'Variant', [['single', 'Single'], ['inner', 'Inner flame'], ['twin', 'Twin']], 'inner'), pR('lean', 'Lean', -0.1, 0.4, 0.01, 0.16),
      pR('width', 'Width', 0.7, 1.2, 0.01, 1), pR('gap', 'Keyline', 1, 5, 0.25, 2.5)],
    (p, c) => {
      const id = uid(), W = 54 * p.width, cx = 50 - p.lean * W * 0.35;
      if (p.variant === 'twin') {
        const big = flame2D(57, 92, 84, W * 0.84, p.lean), sm = flameD(31, 92, 50, W * 0.56, -0.05);
        return `<defs>${maskEl(id + 'm', `<path d="${big}" fill="#000" stroke="#000" stroke-width="${f(p.gap * 2)}"/>`)}</defs><path d="${sm}" fill="${c.accent}" mask="url(#${id}m)"/><path d="${big}" fill="${c.fg}"/>`;
      }
      const d = flame2D(cx, 92, 84, W, p.lean);
      if (p.variant === 'inner') return `<defs>${maskEl(id + 'm', `<path d="${flameD(cx + W * 0.03, 92 - W * 0.13, 84 * 0.44, W * 0.42, p.lean * 0.6)}" fill="#000"/>`)}</defs><path d="${d}" fill="${c.fg}" mask="url(#${id}m)"/>`;
      return `<path d="${d}" fill="${c.fg}"/>`;
    });

  fam('sym-seed', 'Seed', 'Symbol',
    'Potential in an oval: split by an S-curve into two tones, a sprout of stem and leaf, or a bean with its groove.',
    [pS('variant', 'Variant', [['split', 'Split'], ['sprout', 'Sprout'], ['bean', 'Bean']], 'split'), pR('angle', 'Angle', -45, 45, 1, -20),
      pR('gap', 'Gap', 1, 6, 0.25, 3), pR('weight', 'Stem weight', 3, 9, 0.25, 5)],
    (p, c) => {
      const id = uid(), rot = (s) => `<g transform="rotate(${f(p.angle)} 50 50)">${s}</g>`;
      if (p.variant === 'sprout') {
        const w = p.weight;
        return `<circle cx="50" cy="78" r="13" fill="${c.fg}"/><path d="M50,${f(66)}V36" stroke="${c.fg}" stroke-width="${f(w)}"/>` +
          `<path d="${vesicaD(50, 46, 82, 18, 9)}" fill="${c.accent}"/><path d="${vesicaD(50, 52, 24, 32, 7)}" fill="${c.fg}"/>`;
      }
      const e = ellipseD(50, 50, 27, 42), S = 'M50,4C82,32 18,68 50,96';
      if (p.variant === 'bean') return rot(`<defs>${maskEl(id + 'm', `<path d="M44,18C60,36 60,64 44,82" fill="none" stroke="#000" stroke-width="${f(p.gap)}" stroke-linecap="round"/>`)}</defs><path d="${e}" fill="${c.fg}" mask="url(#${id}m)"/>`);
      return rot(`<defs>${clipEl(id + 'l', `<path d="${S}L-20,96L-20,4Z"/>`)}${clipEl(id + 'r', `<path d="${S}L120,96L120,4Z"/>`)}${maskEl(id + 'm', `<path d="${S}" fill="none" stroke="#000" stroke-width="${f(p.gap)}"/>`)}</defs>` +
        `<g mask="url(#${id}m)"><path d="${e}" fill="${c.fg}" clip-path="url(#${id}l)"/><path d="${e}" fill="${c.accent}" clip-path="url(#${id}r)"/></g>`);
    });

  fam('sym-key', 'Key and keyhole', 'Symbol',
    'Access and security: a keyhole cut from a disc or a block, or a monoline key.',
    [pS('variant', 'Variant', [['circle', 'Keyhole disc'], ['square', 'Keyhole block'], ['key', 'Monoline key']], 'circle'), pR('hole', 'Keyhole size', 0.6, 1.3, 0.01, 0.95),
      pR('weight', 'Key weight', 4, 10, 0.25, 7), pR('rotation', 'Key angle', -90, 90, 15, -45)],
    (p, c) => {
      const id = uid(), k = p.hole;
      if (p.variant === 'key') {
        const w = p.weight;
        return `<g transform="rotate(${p.rotation} 50 50)" fill="none" stroke="${c.fg}" stroke-width="${f(w)}"><circle cx="27" cy="50" r="${f(15)}"/><path d="M${f(42 + 0)},50H92M92,50V${f(64)}M78,50V${f(61)}" stroke-linecap="butt"/></g>`;
      }
      const hole = `<circle cx="50" cy="${f(50 - 9 * k)}" r="${f(11 * k)}" fill="#000"/><path d="${polyD([[50 - 5 * k, 50 - 6 * k], [50 + 5 * k, 50 - 6 * k], [50 + 9 * k, 50 + 21 * k], [50 - 9 * k, 50 + 21 * k]])}" fill="#000"/>`;
      const shape = p.variant === 'square' ? `<path d="${roundPolyD([[14.5, 14.5], [85.5, 14.5], [85.5, 85.5], [14.5, 85.5]], 10)}" fill="${c.fg}" mask="url(#${id}m)"/>` : `<circle cx="50" cy="50" r="40" fill="${c.fg}" mask="url(#${id}m)"/>`;
      return `<defs>${maskEl(id + 'm', hole)}</defs>${shape}`;
    });

  /* ======================================================================
     EMBLEM
     ====================================================================== */
  const upperName = (c) => String(c.name || 'Brand').toUpperCase();
  /* text on an arc; dir 1 = over the top (glyphs outward), -1 = under the bottom (glyphs inward) */
  function arcText(id, str, r, dir, size, font, weight, fill, spanDeg) {
    const m = measure(str, font, weight, false, 0);
    const avail = r * spanDeg * RAD;
    let sz = size, nat = m.adv * sz;
    if (nat > avail * 0.98) { sz *= (avail * 0.98) / nat; nat = m.adv * sz; }
    const n = Array.from(str).length;
    const ls = Math.min(sz * 0.42, Math.max(0, (avail * 0.86 - nat) / Math.max(1, n - 1)));
    const a0 = dir > 0 ? 270 - spanDeg / 2 : 90 + spanDeg / 2, a1 = dir > 0 ? 270 + spanDeg / 2 : 90 - spanDeg / 2;
    return `<path id="${id}" d="${arcD(50, 50, r, a0, a1)}" fill="none"/>` +
      `<text font-family="${svgFamily(font)}" font-weight="${weight}" font-size="${f(sz)}" letter-spacing="${f(ls)}" fill="${fill}" text-anchor="middle"><textPath href="#${id}" startOffset="50%">${esc(str)}</textPath></text>`;
  }

  fam('em-badge', 'Circular badge', 'Emblem',
    'A roundel with the name set on the circle, an inner keyline and a centre device. Heritage with modern spacing.',
    [pS('layout', 'Text', [['arc', 'Top arc'], ['ring', 'Full ring']], 'arc'), pS('center', 'Centre', [['initial', 'Initial'], ['star', 'Star'], ['dot', 'Dot'], ['mono', 'Constructed initial']], 'initial'),
      pS('ring', 'Rings', [['single', 'Single'], ['double', 'Double'], ['solid', 'Solid band']], 'single'), pR('size', 'Text size', 7, 12, 0.25, 9),
      pS('bottom', 'Lower arc', [['dots', 'Dots'], ['tagline', 'Tagline'], ['none', 'None']], 'dots')],
    (p, c) => {
      const id = uid(), font = c.font, w = fontW(font, 600), solid = p.ring === 'solid';
      const tf = solid ? c.bg : c.fg, cap = p.size * 0.72;
      let s = '';
      if (solid) s += `<path d="${circleD(50, 50, 44)}${circleD(50, 50, 27.5)}" fill="${c.fg}" fill-rule="evenodd"/>`;
      else {
        s += `<circle cx="50" cy="50" r="43" fill="none" stroke="${c.fg}" stroke-width="2"/>`;
        s += `<circle cx="50" cy="50" r="27.5" fill="none" stroke="${c.fg}" stroke-width="1.5"/>`;
        if (p.ring === 'double') s += `<circle cx="50" cy="50" r="39.5" fill="none" stroke="${c.fg}" stroke-width=".75"/><circle cx="50" cy="50" r="25" fill="none" stroke="${c.fg}" stroke-width=".75"/>`;
      }
      const rb = 35.2 - cap / 2;
      if (p.layout === 'ring') {
        const unit = upperName(c) + '  •  ';
        const um = measure(unit, font, w, false, 0).adv * p.size, circ = 2 * Math.PI * rb;
        /* at least two repeats; shrink the type rather than letter-space it into dust */
        const reps = Math.max(2, Math.round(circ / (um * 1.12)));
        const sz = Math.min(p.size, p.size * circ / (um * reps * 1.04));
        const str = unit.repeat(reps), n = Array.from(str).length;
        const ls = (circ - (um * sz / p.size) * reps) / n;
        s += `<path id="${id}p" d="${arcD(50, 50, rb, 180, 540)}" fill="none"/><text font-family="${svgFamily(font)}" font-weight="${w}" font-size="${f(sz)}" letter-spacing="${f(ls)}" fill="${tf}"><textPath href="#${id}p">${esc(str)}</textPath></text>`;
      } else {
        s += arcText(id + 't', upperName(c), rb, 1, p.size, font, w, tf, 132);
        if (p.bottom === 'tagline') s += arcText(id + 'b', String(c.tagline || 'Est. 2026').toUpperCase(), rb + cap, -1, p.size * 0.82, font, w, tf, 90);
        else if (p.bottom === 'dots') [-14, 0, 14].forEach((a) => { const q = P(50, 50, 35.2, 90 + a); s += `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="1.5" fill="${tf}"/>`; });
        [180, 0].forEach((a) => { const q = P(50, 50, 35.2, a); s += `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="1.3" fill="${solid ? c.accent : c.accent}"/>`; });
      }
      if (p.center === 'star') s += `<path d="${polyD(range(10).map((i) => P(50, 50, i % 2 ? 7 : 17, -90 + 36 * i)))}" fill="${c.accent}"/>`;
      else if (p.center === 'dot') s += `<circle cx="50" cy="50" r="9" fill="${c.accent}"/>`;
      else if (p.center === 'mono') { const sk = skeletonLetter((c.initial || letterOf(c)).slice(0, 1), 50, 50, 24, 4, { cap: 'butt', join: 'miter' }); s += sk ? `<defs>${maskEl(id + 'm', sk.svg, '#000')}</defs><rect width="100" height="100" fill="${c.fg}" mask="url(#${id}m)"/>` : ''; }
      else s += initialFit(c, { cx: 50, cy: 50, w: 30, h: 22 }).svg({ fill: c.fg });
      return s;
    });

  fam('em-seal', 'Seal', 'Emblem',
    'A solid seal with a scalloped, serrated or rosette edge, a cut keyline and a knocked-out centre.',
    [pS('edge', 'Edge', [['scallop', 'Scallop'], ['zigzag', 'Serrated'], ['rosette', 'Rosette']], 'scallop'), pR('teeth', 'Teeth', 12, 48, 1, 24), pR('depth', 'Edge depth', 0.03, 0.14, 0.005, 0.06),
      pS('center', 'Centre', [['initial', 'Initial'], ['star', 'Star'], ['text', 'Name ring + initial']], 'initial'), pB('ring', 'Keyline', true)],
    (p, c) => {
      const id = uid(), R = 45, Rin = R * (1 - p.depth), n = p.teeth;
      let d;
      if (p.edge === 'zigzag') d = polyD(range(2 * n).map((i) => P(50, 50, i % 2 ? Rin : R, -90 + (180 / n) * i)));
      else if (p.edge === 'rosette') d = smoothD(range(n * 8).map((i) => { const a = (i / (n * 8)) * 360; return P(50, 50, R - (R - Rin) * (1 - Math.cos((n * a) * RAD)) / 2, a - 90); }));
      else {
        const pts = range(n).map((i) => P(50, 50, Rin, -90 + (360 / n) * i)), ch = 2 * Rin * Math.sin(Math.PI / n), sg = R - Rin, rho = (ch * ch / 4 + sg * sg) / (2 * sg);
        d = `M${f(pts[0][0])},${f(pts[0][1])}` + pts.map((q, i) => { const nx = pts[(i + 1) % n]; return `A${f(rho)},${f(rho)} 0 0,1 ${f(nx[0])},${f(nx[1])}`; }).join('') + 'Z';
      }
      let m = p.ring ? `<circle cx="50" cy="50" r="${f(Rin - 5)}" fill="none" stroke="#000" stroke-width="1.6"/>` : '';
      if (p.center === 'star') m += `<path d="${polyD(range(10).map((i) => P(50, 50, i % 2 ? 9 : 22, -90 + 36 * i)))}" fill="#000"/>`;
      else if (p.center === 'text') {
        const font = c.font, w = fontW(font, 600);
        m += arcText(id + 't', upperName(c), 26, 1, 7.5, font, w, '#000', 150) + `<circle cx="50" cy="50" r="19" fill="none" stroke="#000" stroke-width="1"/>`;
        m += initialFit(c, { cx: 50, cy: 50, w: 22, h: 16 }).svg({ fill: '#000' });
      } else m += initialFit(c, { cx: 50, cy: 50, w: 40, h: 30 }).svg({ fill: '#000' });
      return `<defs>${maskEl(id + 'm', m)}</defs><path d="${d}" fill="${c.fg}" mask="url(#${id}m)"/>`;
    });

  const SHIELDS = {
    heater: 'M16,10H84V44C84,68 70,84 50,92C30,84 16,68 16,44Z',
    round: 'M17,10H83V56A33,33 0 0,1 17,56Z',
    pointed: 'M16,13Q50,4 84,13V48C84,72 66,86 50,92C34,86 16,72 16,48Z'
  };
  fam('em-shield', 'Shield and crest', 'Emblem',
    'A shield with one heraldic division: a chevron, a bend, quarters, or simply the initial. Trust and lineage, kept modern.',
    [pS('shape', 'Shield', [['heater', 'Heater'], ['round', 'Round base'], ['pointed', 'Curved top']], 'heater'), pS('content', 'Charge', [['initial', 'Initial'], ['chevron', 'Chevron'], ['bend', 'Bend'], ['quarters', 'Quarters']], 'chevron'),
      pS('style', 'Style', ['solid', 'outline'], 'solid'), pR('weight', 'Outline weight', 2, 6, 0.25, 3.5)],
    (p, c) => {
      const id = uid(), d = SHIELDS[p.shape] || SHIELDS.heater, solid = p.style === 'solid';
      let ch = '';
      if (p.content === 'initial') ch = initialFit(c, { cx: 50, cy: 47, w: 44, h: 32 }).svg({ fill: '__F' });
      if (p.content === 'chevron') ch = `<path d="${polyD([[10, 70], [50, 36], [90, 70], [90, 84], [50, 50], [10, 84]])}" fill="__F"/>`;
      if (p.content === 'bend') ch = `<rect x="-20" y="-7" width="140" height="14" fill="__F" transform="rotate(45 50 50)"/>`;
      if (p.content === 'quarters') ch = `<rect x="0" y="0" width="50" height="50" fill="__F"/><rect x="50" y="50" width="50" height="50" fill="__F"/>`;
      if (solid) {
        if (p.content === 'quarters') return `<defs>${clipEl(id + 'c', `<path d="${d}"/>`)}</defs><path d="${d}" fill="${c.fg}"/><g clip-path="url(#${id}c)">${ch.replace(/__F/g, c.accent)}</g>`;
        return `<defs>${maskEl(id + 'm', ch.replace(/__F/g, '#000'))}</defs><path d="${d}" fill="${c.fg}" mask="url(#${id}m)"/>`;
      }
      return `<defs>${clipEl(id + 'c', `<path d="${d}"/>`)}</defs><g clip-path="url(#${id}c)">${ch.replace(/__F/g, p.content === 'initial' ? c.fg : c.accent)}</g><path d="${d}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}" transform="translate(50 50) scale(${f(1 - p.weight / 84)}) translate(-50 -50)"/>`;
    });

  fam('em-stamp', 'Stamp', 'Emblem',
    'The name in a ruled frame, like a rubber stamp or a postage stamp with a perforated edge.',
    [pS('shape', 'Shape', [['rect', 'Rectangle'], ['rounded', 'Rounded'], ['oval', 'Oval']], 'rect'), pR('rules', 'Rules', 1, 2, 1, 2), pB('perforated', 'Perforated (solid)', false),
      pR('tilt', 'Tilt', -10, 10, 1, 0), pS('sub', 'Detail', [['rule', 'Accent rule'], ['dots', 'Dots'], ['none', 'None']], 'rule')],
    (p, c) => {
      const id = uid(), font = c.font, w = fontW(font, 700), oval = p.shape === 'oval';
      const X = 6, Y = 23, W = 88, H = 54, rx = p.shape === 'rounded' ? 9 : 0;
      const L = fitText(upperName(c), { cx: 50, cy: p.sub === 'none' ? 50 : 47.5, w: oval ? 56 : 66, h: 14 }, { font, weight: w, tracking: 0.08 });
      let detail = '';
      if (p.sub === 'rule') detail = `<rect x="${f(50 - 9)}" y="${f(L.ink.y1 + 4)}" width="18" height="2.4" fill="__A"/>`;
      if (p.sub === 'dots') detail = [-6, 0, 6].map((dx) => `<circle cx="${f(50 + dx)}" cy="${f(L.ink.y1 + 5.5)}" r="1.4" fill="__A"/>`).join('');
      const shapeD = (ins) => (oval ? ellipseD(50, 50, 44 - ins, 31 - ins) : roundPolyD([[X + ins, Y + ins], [X + W - ins, Y + ins], [X + W - ins, Y + H - ins], [X + ins, Y + H - ins]], Math.max(0, rx - ins)));
      const tilt = (s) => (p.tilt ? `<g transform="rotate(${p.tilt} 50 50)">${s}</g>` : s);
      if (p.perforated && !oval) {
        let holes = '';
        const pitch = 7.2;
        for (let x = X + pitch / 2; x < X + W; x += W / Math.round(W / pitch)) holes += `<circle cx="${f(x)}" cy="${Y}" r="2"/><circle cx="${f(x)}" cy="${Y + H}" r="2"/>`;
        for (let y = Y + pitch / 2; y < Y + H; y += H / Math.round(H / pitch)) holes += `<circle cx="${X}" cy="${f(y)}" r="2"/><circle cx="${X + W}" cy="${f(y)}" r="2"/>`;
        const m = `<g fill="#000">${holes}</g><path d="${shapeD(5.5)}" fill="none" stroke="#000" stroke-width="1.2"/>${L.svg({ fill: '#000' })}${detail.replace(/__A/g, '#000')}`;
        return tilt(`<defs>${maskEl(id + 'm', m)}</defs><path d="${shapeD(0)}" fill="${c.fg}" mask="url(#${id}m)"/>`);
      }
      let s = `<path d="${shapeD(1.25)}" fill="none" stroke="${c.fg}" stroke-width="2.5"/>`;
      if (p.rules > 1) s += `<path d="${shapeD(5)}" fill="none" stroke="${c.fg}" stroke-width="1"/>`;
      return tilt(s + L.svg({ fill: c.fg }) + detail.replace(/__A/g, c.accent));
    });

  fam('em-roundel', 'Roundel', 'Emblem',
    'Concentric discs in alternating colour, a ring split into two states, or a ring of dots around the initial.',
    [pS('variant', 'Variant', [['target', 'Target'], ['split', 'Split ring'], ['dotted', 'Dot ring']], 'target'), pR('rings', 'Rings', 2, 5, 1, 3),
      pB('initial', 'Initial', true), pR('gap', 'Gap', 0, 4, 0.25, 0)],
    (p, c) => {
      const id = uid();
      const L = initialFit(c, { cx: 50, cy: 50, w: 28, h: 20 });
      if (p.variant === 'split') {
        const R = 40, r0 = 25;
        const m = `<rect x="-50" y="${f(50 - Math.max(0.01, p.gap) / 2)}" width="200" height="${f(Math.max(0.01, p.gap))}" fill="#000"/>`;
        return `<defs>${maskEl(id + 'm', m)}</defs><g mask="url(#${id}m)"><path d="${sectorD(50, 50, r0, R, 180, 360)}" fill="${c.accent}"/><path d="${sectorD(50, 50, r0, R, 0, 180)}" fill="${c.fg}"/></g>` + (p.initial ? L.svg({ fill: c.fg }) : `<circle cx="50" cy="50" r="10" fill="${c.fg}"/>`);
      }
      if (p.variant === 'dotted') {
        const n = 6 + p.rings * 6;
        let s = '';
        for (let i = 0; i < n; i++) { const q = P(50, 50, 36, -90 + (360 / n) * i); s += `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(Math.min(4, 2 * Math.PI * 36 / n * 0.3))}" fill="${i === 0 ? c.accent : c.fg}"/>`; }
        return s + (p.initial ? initialFit(c, { cx: 50, cy: 50, w: 36, h: 28 }).svg({ fill: c.fg }) : `<circle cx="50" cy="50" r="14" fill="${c.fg}"/>`);
      }
      const n = p.rings, inner = 40 * (p.initial ? 0.4 : 0.28), band = (40 - inner) / n;
      let s = '';
      for (let i = 0; i < n; i++) { const r = 40 - i * band; s += `<circle cx="50" cy="50" r="${f(r - (i ? p.gap : 0))}" fill="${i % 2 ? c.accent : c.fg}"/>`; }
      if (n % 2 === 0) s += `<circle cx="50" cy="50" r="${f(inner)}" fill="${c.fg}"/>`;
      if (!p.initial) return s;
      return `<defs>${maskEl(id + 'm', initialFit(c, { cx: 50, cy: 50, w: inner * 1.25, h: inner * 0.92 }).svg({ fill: '#000' }))}</defs><g mask="url(#${id}m)">${s}</g>`;
    });

  /* ======================================================================
     LINE
     ====================================================================== */
  fam('line-construct', 'Monoline construction', 'Line',
    'Geometric constructions drawn at one weight: a compass, a vesica, an architect\'s grid, a triad.',
    [pS('variant', 'Construction', [['compass', 'Compass'], ['lens', 'Vesica'], ['grid', 'Grid'], ['triad', 'Triad']], 'lens'),
      pR('weight', 'Weight', 1.5, 8, 0.25, 3.5), pB('accent', 'Accent detail', true)],
    (p, c) => {
      const id = uid(), w = p.weight, st = `fill="none" stroke="${c.fg}" stroke-width="${f(w)}"`;
      if (p.variant === 'compass') return `<circle cx="50" cy="50" r="${f(34)}" ${st}/><path d="M50,6V94M6,50H94" ${st}/>` + (p.accent ? `<circle cx="50" cy="50" r="${f(Math.max(4, w * 1.4))}" fill="${c.accent}"/>` : '');
      if (p.variant === 'lens') {
        const r = 29, d = 12.5, h = Math.sqrt(r * r - d * d);
        return `<defs>${clipEl(id + 'c', `<circle cx="${50 - d}" cy="50" r="${r}"/>`)}</defs>` + (p.accent ? `<g clip-path="url(#${id}c)"><circle cx="${50 + d}" cy="50" r="${r}" fill="${c.accent}"/></g>` : '') +
          `<circle cx="${50 - d}" cy="50" r="${r}" ${st}/><circle cx="${50 + d}" cy="50" r="${r}" ${st}/><path d="M50,${f(50 - h - 10)}V${f(50 + h + 10)}" ${st}/>`;
      }
      if (p.variant === 'grid') {
        const a = 14.5 + w / 2, b = 85.5 - w / 2;
        return `<rect x="${f(a)}" y="${f(a)}" width="${f(b - a)}" height="${f(b - a)}" ${st}/><circle cx="50" cy="50" r="${f((b - a) / 2)}" ${st}/><path d="M50,${f(a)}V${f(b)}M${f(a)},50H${f(b)}" ${st}/>` + (p.accent ? `<circle cx="50" cy="50" r="${f(Math.max(4, w * 1.4))}" fill="${c.accent}"/>` : '');
      }
      const r = 23, D = 15;
      return range(3).map((i) => { const q = P(50, 54, D, -90 + 120 * i); return `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${r}" ${st}/>`; }).join('') + (p.accent ? `<circle cx="50" cy="54" r="${f(Math.max(3, w))}" fill="${c.accent}"/>` : '');
    });

  /* Hamiltonian cycle on a 2n×2n lattice from a random spanning tree of an n×n grid */
  function hamiltonCycle(n, r) {
    const tree = new Set(), seen = new Set(['0,0']), stack = [[0, 0]];
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !seen.has(a + ',' + b));
      if (!nb.length) { stack.pop(); continue; }
      const [a, b] = nb[Math.floor(r() * nb.length)];
      seen.add(a + ',' + b);
      tree.add([Math.min(x, a), Math.min(y, b), x === a ? 'v' : 'h'].join(','));
      stack.push([a, b]);
    }
    const adj = new Map();
    const link = (p1, p2) => { const k1 = p1.join(','), k2 = p2.join(','); (adj.get(k1) || adj.set(k1, []).get(k1)).push(k2); (adj.get(k2) || adj.set(k2, []).get(k2)).push(k1); };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const X = 2 * x, Y = 2 * y;
      if (!tree.has([x, y - 1, 'v'].join(','))) link([X, Y], [X + 1, Y]);
      if (!tree.has([x, y, 'v'].join(','))) link([X, Y + 1], [X + 1, Y + 1]);
      if (!tree.has([x - 1, y, 'h'].join(','))) link([X, Y], [X, Y + 1]);
      if (!tree.has([x, y, 'h'].join(','))) link([X + 1, Y], [X + 1, Y + 1]);
      if (tree.has([x, y, 'h'].join(','))) { link([X + 1, Y], [X + 2, Y]); link([X + 1, Y + 1], [X + 2, Y + 1]); }
      if (tree.has([x, y, 'v'].join(','))) { link([X, Y + 1], [X, Y + 2]); link([X + 1, Y + 1], [X + 1, Y + 2]); }
    }
    const path = ['0,0'];
    let prev = null, cur = '0,0';
    for (let i = 0; i < 4 * n * n; i++) {
      const nx = (adj.get(cur) || []).find((k) => k !== prev);
      if (!nx || nx === '0,0') break;
      path.push(nx); prev = cur; cur = nx;
    }
    const pts = path.map((k) => k.split(',').map(Number));
    return pts.filter((q, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return !((a[0] === q[0] && q[0] === b[0]) || (a[1] === q[1] && q[1] === b[1])); });
  }
  fam('line-continuous', 'Continuous line', 'Line',
    'One unbroken line that visits every point of a grid and returns to its start. Seeded, so every brand gets its own path.',
    [pR('grid', 'Grid', 2, 5, 1, 3), pR('round', 'Corner radius', 0, 1, 0.05, 1), pR('weight', 'Weight', 2, 10, 0.25, 5.5), SEED, pB('accent', 'Start point', false)],
    (p, c) => {
      const n = p.grid, N = 2 * n, w0 = Math.min(p.weight, (80 / (N - 1)) * 0.42), pitch = (80 - w0) / (N - 1), r = rng('ham' + p.seed);
      p = Object.assign({}, p, { weight: w0 });
      const pts = hamiltonCycle(n, r).map(([x, y]) => [50 - ((N - 1) * pitch) / 2 + x * pitch, 50 - ((N - 1) * pitch) / 2 + y * pitch]);
      const d = roundPolyD(pts, (p.round * pitch) / 2);
      return `<path d="${d}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}" stroke-linejoin="round"/>` + (p.accent ? `<circle cx="${f(pts[0][0] + (p.round * pitch) / 2)}" cy="${f(pts[0][1])}" r="${f(p.weight * 0.95)}" fill="${c.accent}"/>` : '');
    });

  fam('line-contour', 'Contour lines', 'Line',
    'Nested contour lines drifting toward a summit, like a survey map. Terrain, depth, data.',
    [pR('rings', 'Lines', 3, 10, 1, 6), pR('wobble', 'Wobble', 0, 0.35, 0.01, 0.16), pR('drift', 'Summit drift', 0, 0.5, 0.01, 0.22), pR('weight', 'Weight', 1.25, 5, 0.25, 2.5), SEED, pB('accent', 'Summit dot', true)],
    (p, c) => {
      const no = periodicNoise(p.seed), no2 = periodicNoise(p.seed + 99, 3), r = rng('ct' + p.seed), ang = r() * Math.PI * 2;
      const Rm = 42 - p.weight / 2, pitch = Rm / (p.rings + 0.4);
      const sx = Math.cos(ang) * Rm * p.drift, sy = Math.sin(ang) * Rm * p.drift;
      let s = '';
      for (let i = 0; i < p.rings; i++) {
        const R = Rm - i * pitch, t = 1 - R / Rm, cx = 50 + sx * t, cy = 50 + sy * t;
        const pts = range(72).map((k) => { const th = (k / 72) * Math.PI * 2, rr = R * (1 + p.wobble * (no(th) * 0.8 + no2(th + i * 0.3) * 0.2) * (0.6 + 0.4 * R / Rm)); return [cx + Math.cos(th) * rr, cy + Math.sin(th) * rr]; });
        s += `<path d="${smoothD(pts)}" fill="none" stroke="${c.fg}" stroke-width="${f(p.weight)}"/>`;
      }
      const all = s;
      return `<g transform="translate(50 50) scale(${f(Math.min(1, 42 / (Rm * (1 + p.wobble))))}) translate(-50 -50)">${all}${p.accent ? `<circle cx="${f(50 + sx)}" cy="${f(50 + sy)}" r="${f(Math.max(2.5, p.weight * 1.3))}" fill="${c.accent}"/>` : ''}</g>`;
    });

  /* ======================================================================
     GENERATIVE (seeded)
     ====================================================================== */
  fam('gen-grid', 'Seeded tile grid', 'Generative',
    'A grid of Bauhaus tiles chosen by a seed with mirror or rotational symmetry. Every seed is a new mark from the same system.',
    [SEED, pR('cols', 'Columns', 2, 5, 1, 3), pR('rows', 'Rows', 2, 5, 1, 3), pS('symmetry', 'Symmetry', [['auto', 'Auto'], ['none', 'None'], ['mirror-x', 'Mirror X'], ['mirror-y', 'Mirror Y'], ['rotational', 'Rotational']], 'auto'),
      pR('accent', 'Accent amount', 0, 0.4, 0.01, 0.14), pR('gap', 'Gap', 0, 4, 0.25, 0)],
    (p, c) => gridRender(gridRandom(p.seed, p.cols, p.rows, { symmetry: p.symmetry, accent: p.accent, gap: p.gap }), c));

  fam('gen-truchet', 'Truchet tiles', 'Generative',
    'Seeded Truchet tiles: quarter arcs that join into meandering paths, diagonal triangles, or diagonal strokes.',
    [pS('variant', 'Tiles', [['arcs', 'Arcs'], ['triangles', 'Triangles'], ['lines', 'Diagonals']], 'arcs'), pR('grid', 'Grid', 2, 8, 1, 4), pR('weight', 'Weight', 0.12, 0.5, 0.01, 0.3),
      SEED, pS('frame', 'Container', ['square', 'circle'], 'circle')],
    (p, c) => {
      const id = uid(), n = p.grid, span = p.frame === 'circle' ? 80 : 71, s = span / n, x0 = 50 - span / 2, r = rng('tru' + p.seed), w = p.weight * s;
      let out = '';
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = x0 + i * s, y = x0 + j * s, o = r() < 0.5;
        if (p.variant === 'arcs') out += o ? `<path d="M${f(x + s / 2)},${f(y)}A${f(s / 2)},${f(s / 2)} 0 0,1 ${f(x)},${f(y + s / 2)}M${f(x + s)},${f(y + s / 2)}A${f(s / 2)},${f(s / 2)} 0 0,0 ${f(x + s / 2)},${f(y + s)}"/>` : `<path d="M${f(x + s / 2)},${f(y)}A${f(s / 2)},${f(s / 2)} 0 0,0 ${f(x + s)},${f(y + s / 2)}M${f(x)},${f(y + s / 2)}A${f(s / 2)},${f(s / 2)} 0 0,1 ${f(x + s / 2)},${f(y + s)}"/>`;
        else if (p.variant === 'lines') out += o ? `<path d="M${f(x)},${f(y)}L${f(x + s)},${f(y + s)}"/>` : `<path d="M${f(x + s)},${f(y)}L${f(x)},${f(y + s)}"/>`;
        else out += tileSvg('triangle', Math.floor(r() * 4), x, y, s, c.fg, 0);
      }
      const g = p.variant === 'triangles' ? out : `<g fill="none" stroke="${c.fg}" stroke-width="${f(w)}" stroke-linecap="${p.variant === 'lines' ? 'square' : 'butt'}">${out}</g>`;
      const shape = p.frame === 'circle' ? '<circle cx="50" cy="50" r="40"/>' : `<rect x="${f(x0)}" y="${f(x0)}" width="${f(span)}" height="${f(span)}"/>`;
      return `<defs>${clipEl(id + 'c', shape)}</defs><g clip-path="url(#${id}c)">${g}</g>`;
    });

  fam('gen-blob', 'Organic blob', 'Generative',
    'A smooth closed form from seeded noise, alone or layered with multiply. Soft, human, alive.',
    [pR('points', 'Lobes', 4, 10, 1, 6), pR('wobble', 'Wobble', 0.08, 0.6, 0.01, 0.3), pR('layers', 'Layers', 1, 3, 1, 2), SEED,
      pS('mode', 'Style', [['multiply', 'Multiply'], ['solid', 'Solid'], ['outline', 'Outline']], 'multiply')],
    (p, c) => {
      let s = '';
      for (let L = 0; L < p.layers; L++) {
        const r = rng('blob' + p.seed + '_' + L), n = p.points, ph = r() * Math.PI * 2;
        const pts = range(n).map((i) => { const a = ph + (i / n) * Math.PI * 2, rr = 1 - p.wobble / 2 + r() * p.wobble; return [Math.cos(a) * rr, Math.sin(a) * rr]; });
        const k = (p.layers > 1 ? 34 : 40) / Math.max(...pts.map((q) => Math.hypot(q[0], q[1])));
        const off = p.layers > 1 ? P(0, 0, 8, L * (360 / p.layers) + r() * 40) : [0, 0];
        const q2 = pts.map((q) => [50 + off[0] + q[0] * k, 50 + off[1] + q[1] * k]);
        const fill = L % 2 ? c.accent : c.fg;
        s += p.mode === 'outline' ? `<path d="${smoothD(q2)}" fill="none" stroke="${fill}" stroke-width="3"/>` : `<path d="${smoothD(q2)}" fill="${p.mode === 'solid' && L > 0 ? (L % 2 ? c.accent : c.fg) : fill}"${p.mode === 'multiply' ? ' style="mix-blend-mode:multiply"' : ''}/>`;
      }
      return `<g style="isolation:isolate">${s}</g>`;
    });

  fam('gen-slices', 'Shifted slices', 'Generative',
    'A disc or square cut into strips that slide by seeded offsets, like a signal glitch or a sliding puzzle.',
    [pR('strips', 'Strips', 3, 12, 1, 6), pR('shift', 'Shift', 0, 20, 0.5, 9), SEED, pS('shape', 'Shape', ['circle', 'square', 'initial'], 'circle'),
      pS('dir', 'Direction', ['vertical', 'horizontal'], 'vertical'), pR('gap', 'Gap', 0, 3, 0.25, 1.5)],
    (p, c) => {
      const id = uid(), n = p.strips, r = rng('sl' + p.seed), vert = p.dir === 'vertical';
      const span = 84, x0 = 50 - span / 2, sw = span / n;
      const shape = p.shape === 'square' ? `<rect x="14.5" y="14.5" width="71" height="71" fill="${c.fg}"/>` : p.shape === 'initial' ? initialFit(c, { cx: 50, cy: 50, w: 70, h: 62 }).svg({ fill: c.fg }) : `<circle cx="50" cy="50" r="36" fill="${c.fg}"/>`;
      let defs = '', s = '';
      for (let i = 0; i < n; i++) {
        const a = x0 + i * sw + p.gap / 2 - (p.gap ? 0 : 0.2), b = sw - p.gap + (p.gap ? 0 : 0.4);
        defs += clipEl(id + i, vert ? `<rect x="${f(a)}" y="-20" width="${f(b)}" height="140"/>` : `<rect x="-20" y="${f(a)}" width="140" height="${f(b)}"/>`);
        const d = (r() * 2 - 1) * p.shift * (i === 0 || i === n - 1 ? 0.4 : 1);
        s += `<g transform="translate(${vert ? 0 : f(d)} ${vert ? f(d) : 0})"><g clip-path="url(#${id}${i})">${shape}</g></g>`;
      }
      return `<defs>${defs}</defs>${s}`;
    });

  /* ======================================================================
     MARK API
     ====================================================================== */
  const FAM_BY = {};
  FAM.forEach((q) => { FAM_BY[q.id] = q; });
  function normC(c) {
    c = Object.assign({ fg: '#111111', bg: '#FFFFFF', accent: '#E4572E', name: 'Brand', font: 'Inter', weight: 700, seed: 1 }, c || {});
    const words = String(c.name).trim().split(/\s+/).filter(Boolean);
    const clean = (s) => s.replace(/[^\p{L}\p{N}]/gu, '');
    if (!c.initial) c.initial = (clean(words[0] || 'B')[0] || 'B').toUpperCase();
    if (!c.initials) c.initials = (words.length > 1 ? clean(words[0])[0] + clean(words[1])[0] : clean(words[0] || 'Br').slice(0, 2)).toUpperCase();
    return c;
  }
  function markDefaults(id) {
    const q = FAM_BY[id], o = {};
    if (q) q.params.forEach((p) => { o[p.id] = p.default; });
    return o;
  }
  function randomParams(id, seed) {
    const q = FAM_BY[id], r = rng('rp' + id + seed), o = {};
    if (!q) return o;
    q.params.forEach((p) => {
      if (p.type === 'range') { const steps = Math.round((p.max - p.min) / p.step); o[p.id] = +(p.min + Math.round(r() * steps) * p.step).toFixed(4); }
      else if (p.type === 'select') o[p.id] = p.options[Math.floor(r() * p.options.length)].v;
      else o[p.id] = r() < 0.5;
    });
    return o;
  }
  PG.MARK_FAMILIES = FAM;
  PG.MARK_GROUPS = ['Monogram', 'Geometric', 'Symbol', 'Emblem', 'Line', 'Generative'];
  PG.markDefaults = markDefaults;
  PG.randomMarkParams = randomParams;
  PG.renderMarkInner = function (id, params, c) {
    const q = FAM_BY[id];
    if (!q) return '';
    const p = Object.assign(markDefaults(id), params || {});
    try { return q.render(p, normC(c)); } catch (e) { return `<!-- ${esc(id)}: ${esc(e.message)} -->`; }
  };
  PG.renderMark = function (id, params, c, sizePx, opts) {
    opts = opts || {};
    const cc = normC(c);
    const inner = PG.renderMarkInner(id, params, cc);
    const sz = sizePx ? ` width="${sizePx}" height="${sizePx}"` : '';
    const bg = opts.background ? `<rect width="100" height="100" fill="${cc.bg}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${sz} role="img" aria-label="${esc(cc.name)} mark">${bg}${inner}</svg>`;
  };

  /* ---------- GRIDMARK ---------- */
  const G = (t, r, color) => ({ t, r: r || 0, color: color || 'fg' });
  const GRID_PRESETS = [
    { id: 'flower', name: 'Quartered circle', note: 'Four quarter discs turned inward make a circle split by a cross of space.', spec: { cols: 2, rows: 2, gap: 3, cells: [G('quarter', 3), G('quarter', 0), G('quarter', 2), G('quarter', 1, 'accent')] } },
    { id: 'windmill', name: 'Windmill', note: 'Each quarter anchored one corner further round: rotation with no arrow.', spec: { cols: 2, rows: 2, gap: 0, cells: [G('quarter', 2), G('quarter', 3), G('quarter', 1), G('quarter', 0)] } },
    { id: 'star', name: 'Four-point star', note: 'Quarters turned outward leave a concave star in the negative space.', spec: { cols: 2, rows: 2, gap: 0, cells: [G('quarter', 1), G('quarter', 2), G('quarter', 0), G('quarter', 3)] } },
    { id: 'gateway', name: 'Gateway', note: 'Two quarter discs round the top corners of a portal: arrival, institution.', spec: { cols: 3, rows: 3, gap: 0, cells: [G('quarter', 3), G('full'), G('quarter', 0), G('full'), G('empty'), G('full'), G('full'), G('empty'), G('full')] } },
    { id: 'dome', name: 'Dome on plinth', note: 'A semicircle over a two-block base; architecture and shelter.', spec: { cols: 2, rows: 2, gap: 2.5, cells: [G('quarter', 3, 'accent'), G('quarter', 0, 'accent'), G('full'), G('full')] } },
    { id: 'twin', name: 'Twin circles', note: 'Two circles each assembled from four quarters; a partnership read at a glance.', spec: { cols: 4, rows: 2, gap: 0, cells: [G('quarter', 3), G('quarter', 0), G('quarter', 3, 'accent'), G('quarter', 0, 'accent'), G('quarter', 2), G('quarter', 1), G('quarter', 2, 'accent'), G('quarter', 1, 'accent')] } },
    { id: 'scallop', name: 'Scalloped step', note: 'A staircase whose edge is scalloped by quarter discs; growth, softened.', spec: { cols: 3, rows: 3, gap: 0, cells: [G('empty'), G('empty'), G('quarter', 3, 'accent'), G('empty'), G('quarter', 3), G('full'), G('quarter', 3), G('full'), G('full')] } },
    { id: 'pills', name: 'Three pills', note: 'Arches meeting upside-down arches: three capsules, a rhythm of three.', spec: { cols: 3, rows: 2, gap: 0, cells: [G('arch', 0), G('arch', 0, 'accent'), G('arch', 0), G('arch', 2), G('arch', 2, 'accent'), G('arch', 2)] } },
    { id: 'lattice', name: 'Lattice', note: 'Diagonal bands alternating per cell knit into a diamond net.', spec: { cols: 3, rows: 3, gap: 0, cells: [0, 1, 0, 1, 0, 1, 0, 1, 0].map((r, i) => G('diag', r, i === 4 ? 'accent' : 'fg')) } },
    { id: 'rings', name: 'Rings and dots', note: 'A checkerboard of rings and dots around a solid accent centre.', spec: { cols: 3, rows: 3, gap: 2, cells: [G('ring'), G('dot'), G('ring'), G('dot'), G('circle', 0, 'accent'), G('dot'), G('ring'), G('dot'), G('ring')] } },
    { id: 'bloom', name: 'Bloom', note: 'Quarters and half discs all facing out from a centre circle: a flower from a grid.', spec: { cols: 3, rows: 3, gap: 1.5, cells: [G('quarter', 3), G('half', 0), G('quarter', 0), G('half', 3), G('circle', 0, 'accent'), G('half', 1), G('quarter', 2), G('half', 2), G('quarter', 1)] } },
    { id: 'diamond', name: 'Faceted diamond', note: 'Four half-square triangles form a diamond, lit from above in two tones.', spec: { cols: 2, rows: 2, gap: 0, cells: [G('triangle', 3), G('triangle', 0), G('triangle', 2, 'accent'), G('triangle', 1, 'accent')] } }
  ];
  PG.GRIDMARK = {
    tiles: TILE_TYPES.map((t) => ({ id: t, rotations: CORNER_T[t] || EDGE_T[t] ? 4 : 1 })),
    symmetries: ['none', 'mirror-x', 'mirror-y', 'rotational'],
    presets: GRID_PRESETS,
    render(spec, c) { return gridRender(spec, normC(c)); },
    renderSvg(spec, c, sizePx) { const sz = sizePx ? ` width="${sizePx}" height="${sizePx}"` : ''; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${sz}>${gridRender(spec, normC(c))}</svg>`; },
    random(seed, cols, rows, opts) { return gridRandom(seed, cols || 3, rows || cols || 3, opts || {}); }
  };

  /* ======================================================================
     WORDMARKS
     All text is set at 100 units per em and measured on a canvas, so the viewBox hugs the ink.
     ====================================================================== */
  const ITALICS = { 'Instrument Serif': [400], 'Playfair Display': [400, 700], 'Fraunces': [400, 600, 700, 900], 'Cormorant Garamond': [400, 500, 600], 'Newsreader': [400, 600], 'Bodoni Moda': [400, 500, 700], 'Libre Caslon Text': [400] };
  const titleCase = (s) => s.replace(/\b(\p{L})(\p{L}*)/gu, (m, a, b) => a.toUpperCase() + b.toLowerCase());
  function wcase(s, cs) {
    s = String(s || 'Brand').trim().replace(/\s+/g, ' ');
    if (cs === 'upper') return s.toUpperCase();
    if (cs === 'lower') return s.toLowerCase();
    if (cs === 'title') return titleCase(s);
    return s;
  }
  /* Split a name into two balanced parts: at the space, else near the middle between consonant clusters. */
  function splitName(name) {
    const s = String(name).trim();
    const sp = s.indexOf(' ');
    if (sp > 0) return [s.slice(0, sp), s.slice(sp + 1).trim()];
    const n = s.length;
    if (n < 4) return [s, ''];
    const V = /[aeiouyAEIOUY]/, DI = ['th', 'sh', 'ch', 'ph', 'wh', 'ck', 'ng', 'qu', 'gh'];
    let best = Math.round(n / 2), score = Infinity;
    for (let i = 2; i <= n - 2; i++) {
      let sc = Math.abs(i - n / 2);
      if (DI.includes(s.slice(i - 1, i + 1).toLowerCase())) sc += 3;
      if (V.test(s[i])) sc += 1.5;
      if (!V.test(s[i - 1]) && !V.test(s[i]) && !DI.includes(s.slice(i - 1, i + 1).toLowerCase())) sc -= 0.3;
      if (sc < score) { score = sc; best = i; }
    }
    return [s.slice(0, best), s.slice(best)];
  }
  /* a measured run of text at (x, y baseline); size in user units */
  function wrun(str, o) {
    const size = o.size || 100, font = o.font, weight = fontW(font, o.weight || 400), italic = !!o.italic, tr = o.tracking || 0;
    /* word space follows tracking only partly: tight words keep a readable gap, airy caps don't fall apart */
    const ws = o.wordSpace != null ? o.wordSpace : tr < 0 ? -tr * 1.6 : -tr * 0.7;
    const m = measure(str, font, weight, italic, tr, ws), fm = fontMetrics(font, weight, italic);
    const x = o.x || 0, y = o.y || 0;
    const base = { 'font-family': svgFamily(font), 'font-weight': weight, 'font-size': f(size), 'font-style': italic ? 'italic' : null };
    const R = {
      str, m, fm, size, x, y, font, weight, italic, tr,
      ink: { x0: x + m.inkL * size, x1: x + m.inkR * size, y0: y - m.a * size, y1: y + m.d * size },
      cap: fm.cap * size, xh: fm.xh * size, stem: fm.stem * size,
      gx: (i) => x + m.glyphs[i].x * size,
      gink: (i) => { const g = m.glyphs[i]; return { x0: x + (g.x - g.l) * size, x1: x + (g.x + g.r) * size, y0: y - g.a * size, y1: y + g.d * size }; },
      /* whole run: browser shaping kept (ligatures, script joins); optional coloured ranges as tspans */
      whole(extra, ranges) {
        let inner = esc(str);
        if (ranges && ranges.length) {
          const ch = Array.from(str);
          inner = ch.map((q, i) => { const r = ranges.find((rr) => i >= rr.from && i < rr.to); return r ? `<tspan fill="${r.fill}">${esc(q)}</tspan>` : esc(q); }).join('');
        }
        return el('text', Object.assign({ x: f(x), y: f(y), 'letter-spacing': tr ? f(tr * size) : null, 'word-spacing': ws ? f(ws * size) : null, 'xml:space': 'preserve' }, base, extra), inner);
      },
      /* glyph by glyph (explicit positions); filter(i) picks glyphs */
      each(extra, filter) { return textEl(filter ? m.glyphs.filter((g, i) => filter(i)) : m.glyphs, x, y, size, font, weight, italic, extra); },
      glyph(i, extra) { return textEl([m.glyphs[i]], x, y, size, font, weight, italic, extra); }
    };
    return R;
  }
  const ubox = (...bs) => ({ x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) });
  function wout(inner, box, pad) {
    pad = pad == null ? 4 : pad;
    const x = box.x0 - pad, y = box.y0 - pad, w = box.x1 - box.x0 + 2 * pad, h = box.y1 - box.y0 + 2 * pad;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} ${f(h)}" width="${f(w)}" height="${f(h)}"><g transform="translate(${f(-x)} ${f(-y)})">${inner}</g></svg>`, w: f(w), h: f(h), inner: `<g transform="translate(${f(-x)} ${f(-y)})">${inner}</g>` };
  }
  const WS_LIST = [];
  function WS(id, name, desc, inspiredBy, font, weight, cs, tracking, params, render, extra) {
    WS_LIST.push(Object.assign({ id, name, desc, inspiredBy, font, weight, case: cs, tracking, params, render }, extra || {}));
  }
  const WEIGHTS = (ws, def) => pS('weight', 'Weight', ws.map((w) => [w, String(w)]), def);
  /* simple single-run treatments share this */
  const plain = (font, cs, extraFn) => (name, c, p) => {
    const R = wrun(wcase(name, cs), { font: p.font || font, weight: p.weight, tracking: p.tracking, italic: p.italic });
    return extraFn ? extraFn(R, c, p) : wout(R.whole({ fill: c.fg }), R.ink);
  };

  WS('wm-grotesk', 'Tight grotesk', 'Lowercase grotesk, tightly and evenly tracked. Quiet confidence; the name does the work.',
    'tech-platform lowercase grotesk', 'Inter Tight', 700, 'lower', -0.055,
    [WEIGHTS([600, 700, 800], 700), pR('tracking', 'Tracking', -0.09, 0, 0.005, -0.055)], plain('Inter Tight', 'lower'));

  WS('wm-extended', 'Extended caps', 'Wide extended capitals with open tracking: engineered, horizontal, fast.',
    'automotive and aerospace extended caps', 'Michroma', 400, 'upper', 0.08,
    [pR('tracking', 'Tracking', 0, 0.3, 0.01, 0.08), pB('accent', 'Accent last letter', false)],
    (name, c, p) => { const s = wcase(name, 'upper'); const R = wrun(s, { font: 'Michroma', weight: 400, tracking: p.tracking }); return wout(R.whole({ fill: c.fg }, p.accent ? [{ from: s.length - 1, to: s.length, fill: c.accent }] : null), R.ink); });

  WS('wm-didone', 'Didone caps', 'High-contrast Didone capitals with wide tracking: the fashion masthead.',
    'fashion-house didone masthead', 'Bodoni Moda', 500, 'upper', 0.28,
    [WEIGHTS([400, 500, 700], 500), pR('tracking', 'Tracking', 0.08, 0.5, 0.01, 0.28)], plain('Bodoni Moda', 'upper'));

  WS('wm-mono', 'Monospace', 'A monospaced lowercase name with a single terminal gesture: a cursor, a prompt, a slash.',
    'developer-tool monospace', 'JetBrains Mono', 700, 'lower', 0,
    [pS('affix', 'Affix', [['cursor', 'Cursor block'], ['prompt', 'Prompt >'], ['slash', 'Leading slash'], ['underscore', 'Underscore'], ['none', 'None']], 'cursor'), WEIGHTS([400, 700], 700)],
    (name, c, p) => {
      const nm = wcase(name, 'lower').replace(/ /g, p.affix === 'none' ? ' ' : '_');
      const pre = p.affix === 'prompt' ? '> ' : p.affix === 'slash' ? '/' : '', post = p.affix === 'underscore' ? '_' : '';
      const s = pre + nm + post;
      const R = wrun(s, { font: 'JetBrains Mono', weight: p.weight });
      const ranges = [];
      if (pre) ranges.push({ from: 0, to: 1, fill: c.accent });
      if (post) ranges.push({ from: s.length - 1, to: s.length, fill: c.accent });
      let extra = '', box = R.ink;
      if (p.affix === 'cursor') {
        const cell = R.m.glyphs[0].adv * R.size, x = R.x + R.m.adv * R.size + cell * 0.12;
        extra = `<rect x="${f(x)}" y="${f(R.y - R.cap)}" width="${f(cell * 0.82)}" height="${f(R.cap)}" fill="${c.accent}"/>`;
        box = ubox(box, { x0: x, x1: x + cell * 0.82, y0: R.y - R.cap, y1: R.y });
      }
      return wout(R.whole({ fill: c.fg }, ranges) + extra, box);
    });

  WS('wm-stencil', 'Stencil cut', 'Heavy capitals with stencil bridges cut through every bowl: industrial and made-by-hand at once.',
    'industrial stencil lettering', 'Archivo', 900, 'upper', 0.04,
    [pR('bridge', 'Bridge width', 0.02, 0.09, 0.005, 0.045), pS('mode', 'Bridges', [['counters', 'Bowls only'], ['all', 'Every letter']], 'all'), WEIGHTS([800, 900], 900)],
    (name, c, p) => {
      const id = uid(), s = wcase(name, 'upper');
      const R = wrun(s, { font: 'Archivo', weight: p.weight, tracking: 0.04 });
      const bw = p.bridge * 100;
      let m = '';
      R.m.glyphs.forEach((g, i) => {
        if (!g.ch.trim()) return;
        const b = R.gink(i), cx = (b.x0 + b.x1) / 2;
        const bowl = /[ABDOPQR04689]/.test(g.ch), stemmy = /[ILTJ1!]/.test(g.ch);
        if (p.mode === 'counters' && !bowl) return;
        if (stemmy) m += `<rect x="${f(b.x0 - 1)}" y="${f(R.y - R.cap * 0.42 - bw / 2)}" width="${f(b.x1 - b.x0 + 2)}" height="${f(bw)}"/>`;
        else m += `<rect x="${f(cx - bw / 2)}" y="${f(b.y0 - 2)}" width="${f(bw)}" height="${f(b.y1 - b.y0 + 4)}"/>`;
      });
      return wout(`<defs>${maskEl(id + 'm', `<g fill="#000">${m}</g>`)}</defs>` + R.whole({ fill: c.fg, mask: `url(#${id}m)` }), R.ink);
    });

  WS('wm-slash', 'Slash cut', 'A diagonal gap slices clean through the word, optionally carrying an accent blade that overshoots the cap height. Speed, change, a before and after.',
    'sportswear and fintech slash', 'Archivo', 800, 'upper', 0,
    [pR('angle', 'Angle', 50, 80, 1, 66), pR('gap', 'Gap', 0.03, 0.16, 0.005, 0.09), pR('spread', 'Spread', 0, 0.12, 0.005, 0), pR('at', 'Position', 0, 1, 0.01, 0.5), pB('accent', 'Accent blade', true)],
    (name, c, p) => {
      const id = uid(), s = wcase(name, 'upper');
      const R = wrun(s, { font: 'Archivo', weight: 800, tracking: 0.01 });
      /* the cut lands in the middle of a letter, never in a word space */
      const idxs = R.m.glyphs.map((g, i) => (g.ch.trim() ? i : -1)).filter((i) => i >= 0);
      const k = idxs[Math.min(idxs.length - 1, Math.round(p.at * (idxs.length - 1)))];
      const b = R.gink(k), px = (b.x0 + b.x1) / 2, py = R.y - R.cap / 2, th = -p.angle, g = p.gap * 100, sp = p.spread * 100;
      const defs = `<defs>${clipEl(id + 'a', halfPlane(px, py, th, -g / 2, -1))}${clipEl(id + 'b', halfPlane(px, py, th, g / 2, 1))}</defs>`;
      let blade = '', box = { x0: R.ink.x0, x1: R.ink.x1 + sp, y0: R.ink.y0, y1: R.ink.y1 };
      if (p.accent) {
        const over = R.cap * 0.16, half = (R.cap / 2 + over) / Math.sin(p.angle * RAD), u = [Math.cos(th * RAD), Math.sin(th * RAD)];
        const a = [px + sp / 2 - u[0] * half, py - u[1] * half], z = [px + sp / 2 + u[0] * half, py + u[1] * half];
        blade = `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(z[0])}" y2="${f(z[1])}" stroke="${c.accent}" stroke-width="${f(g * 0.42)}"/>`;
        box = ubox(box, { x0: Math.min(a[0], z[0]), x1: Math.max(a[0], z[0]), y0: Math.min(a[1], z[1]), y1: Math.max(a[1], z[1]) });
      }
      const body = `<g clip-path="url(#${id}a)">${R.whole({ fill: c.fg })}</g><g transform="translate(${f(sp)} 0)"><g clip-path="url(#${id}b)">${R.whole({ fill: c.fg })}</g></g>`;
      return wout(defs + body + blade, box);
    });

  WS('wm-geo-o', 'Geometric letter', 'One round letter (o, a, e, u or n) rebuilt from a perfect circle and a stem, often in accent. The Mobil move.',
    'mid-century corporate geometric', 'Outfit', 600, 'lower', -0.02,
    [pS('shape', 'Shape', [['ring', 'Ring'], ['disc', 'Disc'], ['split', 'Split ring'], ['target', 'Ring + dot']], 'ring'), pB('accent', 'Accent', true), WEIGHTS([400, 600, 700], 600)],
    (name, c, p) => {
      const id = uid(), s = wcase(name, 'lower');
      const R = wrun(s, { font: 'Outfit', weight: p.weight, tracking: -0.02 });
      const order = ['o', 'a', 'e', 'u', 'n'];
      let idx = -1, ch = '';
      for (const q of order) { idx = s.indexOf(q); if (idx >= 0) { ch = q; break; } }
      const fill = p.accent ? c.accent : c.fg;
      if (idx < 0) return wout(R.whole({ fill: c.fg }), R.ink);
      const b = R.gink(idx), st = R.stem * 1.04, ovx = (measure('o', R.font, R.weight).a - R.fm.xh) * R.size;
      const H = R.xh + 2 * ovx, top = R.y - R.xh - ovx;
      let shape = '';
      const ringAt = (cx, cy, ro) => {
        if (p.shape === 'disc') return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(ro)}" fill="${fill}"/>`;
        if (p.shape === 'split') return `<path d="${sectorD(cx, cy, ro - st, ro, 180, 360)}" fill="${c.fg}"/><path d="${sectorD(cx, cy, ro - st, ro, 0, 180)}" fill="${fill}"/>`;
        let r = `<path d="${circleD(cx, cy, ro)}${circleD(cx, cy, ro - st)}" fill="${fill}" fill-rule="evenodd"/>`;
        if (p.shape === 'target') r += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(st * 0.62)}" fill="${fill === c.fg ? c.accent : c.fg}"/>`;
        return r;
      };
      if (ch === 'o') { const ro = Math.max(b.x1 - b.x0, H) / 2 * 0.985; shape = ringAt((b.x0 + b.x1) / 2, R.y - R.xh / 2, ro); }
      else if (ch === 'a') { const ro = H / 2, cx = b.x1 - st - ro + st; shape = ringAt(b.x1 - ro - (p.shape === 'disc' ? st * 0.15 : 0), R.y - R.xh / 2, ro) + `<rect x="${f(b.x1 - st)}" y="${f(R.y - R.xh)}" width="${f(st)}" height="${f(R.xh)}" fill="${fill}"/>`; void cx; }
      else if (ch === 'e') {
        const ro = Math.max(b.x1 - b.x0, H) / 2 * 0.98, cx = (b.x0 + b.x1) / 2, cy = R.y - R.xh / 2;
        shape = `<defs>${maskEl(id + 'e', `<path d="${sectorD(cx, cy, 0, ro + 2, 12, 48)}" fill="#000"/>`)}</defs><g mask="url(#${id}e)">${ringAt(cx, cy, ro)}</g><rect x="${f(cx - ro + st / 2)}" y="${f(cy - st * 0.45)}" width="${f(2 * ro - st)}" height="${f(st * 0.9)}" fill="${fill}"/>`;
      } else {
        const W = b.x1 - b.x0, r = (W - st) / 2, flip = ch === 'n';
        const cy = flip ? R.y - R.xh + r + st / 2 : R.y - r - st / 2;
        const arc = flip ? `M${f(b.x0 + st / 2)},${f(R.y)}V${f(cy)}A${f(r)},${f(r)} 0 0,1 ${f(b.x1 - st / 2)},${f(cy)}V${f(R.y)}` : `M${f(b.x0 + st / 2)},${f(R.y - R.xh)}V${f(cy)}A${f(r)},${f(r)} 0 0,0 ${f(b.x1 - st / 2)},${f(cy)}V${f(R.y - R.xh)}M${f(b.x1 - st / 2)},${f(cy)}V${f(R.y)}`;
        shape = `<path d="${arc}" fill="none" stroke="${fill}" stroke-width="${f(st)}"/>`;
      }
      void top;
      return wout(R.each({ fill: c.fg }, (i) => i !== idx) + shape, R.ink);
    });

  WS('wm-dot', 'Accent dot', 'The tittle of every i and j replaced by a coloured shape, or a full stop that ends the name. Small, ownable, memorable.',
    'consumer-app accent tittle', 'Manrope', 800, 'lower', -0.03,
    [pS('mode', 'Dot', [['tittle', 'i / j tittle'], ['stop', 'Full stop'], ['both', 'Both']], 'tittle'), pS('shape', 'Shape', ['circle', 'square', 'diamond'], 'circle'), pR('scale', 'Dot scale', 0.8, 1.8, 0.01, 1.2)],
    (name, c, p) => {
      const id = uid(), s = wcase(name, 'lower');
      const R = wrun(s, { font: 'Manrope', weight: 800, tracking: -0.03 });
      const iTop = R.fm.iTop * R.size, st = R.stem;
      const dot = (x, y, d) => (p.shape === 'square' ? `<rect x="${f(x - d / 2)}" y="${f(y - d / 2)}" width="${f(d)}" height="${f(d)}" fill="${c.accent}"/>` : p.shape === 'diamond' ? `<path d="${polyD(regPts(x, y, d * 0.62, 4, -90))}" fill="${c.accent}"/>` : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(d / 2)}" fill="${c.accent}"/>`);
      let m = '', dots = '', box = R.ink;
      const tits = [];
      R.m.glyphs.forEach((g, i) => { if (g.ch === 'i' || g.ch === 'j') tits.push(i); });
      const doT = (p.mode !== 'stop' && tits.length), doS = p.mode !== 'tittle' || !tits.length;
      if (doT) tits.forEach((i) => {
        const b = R.gink(i), g = R.m.glyphs[i];
        const cx = g.ch === 'i' ? (b.x0 + b.x1) / 2 : b.x1 - st / 2;
        const cy = R.y - iTop + st * 0.55, d = st * 1.08 * p.scale;
        m += `<rect x="${f(cx - st * 0.9)}" y="${f(R.y - iTop - 4)}" width="${f(st * 1.8)}" height="${f(iTop - R.xh - st * 0.12)}"/>`;
        dots += dot(cx, cy, d);
        box = ubox(box, { x0: cx - d / 2, x1: cx + d / 2, y0: cy - d / 2, y1: cy + d / 2 });
      });
      if (doS) {
        const d = st * 1.22 * p.scale, x = R.ink.x1 + st * 0.55 + d / 2, y = R.y - d / 2;
        dots += dot(x, y, d);
        box = ubox(box, { x0: x - d / 2, x1: x + d / 2, y0: y - d / 2, y1: R.y });
      }
      return wout((m ? `<defs>${maskEl(id + 'm', `<g fill="#000">${m}</g>`)}</defs>` : '') + R.whole({ fill: c.fg, mask: m ? `url(#${id}m)` : null }) + dots, box);
    });

  WS('wm-overlap', 'Overlap multiply', 'Heavy round letters tracked so tightly they overlap, each multiplied over the last. Playful density.',
    'creative-agency overprint', 'Bricolage Grotesque', 800, 'lower', -0.13,
    [pR('tracking', 'Tracking', -0.24, -0.05, 0.005, -0.12), pS('colours', 'Colours', [['alternate', 'Alternate'], ['mono', 'Mono overprint'], ['last', 'Accent last']], 'alternate')],
    (name, c, p) => {
      const s = wcase(name, 'lower').replace(/ /g, '');
      const R = wrun(s, { font: 'Bricolage Grotesque', weight: 800, tracking: p.tracking });
      let out = '';
      R.m.glyphs.forEach((g, i) => {
        const fill = p.colours === 'alternate' ? (i % 2 ? c.accent : c.fg) : p.colours === 'last' && i === R.m.glyphs.length - 1 ? c.accent : c.fg;
        out += R.glyph(i, { fill, 'fill-opacity': p.colours === 'mono' ? 0.82 : null, style: 'mix-blend-mode:multiply' });
      });
      return wout(`<g style="isolation:isolate">${out}</g>`, R.ink);
    });

  WS('wm-stacked', 'Stacked two-line', 'The name broken over two lines and locked into a block, justified or ranged left.',
    'cultural-institution stacked block', 'Archivo', 800, 'upper', -0.01,
    [pS('align', 'Alignment', [['justify', 'Justified'], ['left', 'Ranged left'], ['center', 'Centred']], 'justify'), pR('leading', 'Line gap', 0.06, 0.4, 0.01, 0.16), WEIGHTS([700, 800, 900], 800)],
    (name, c, p) => {
      const [a, b] = splitName(wcase(name, 'upper'));
      const r1 = wrun(a, { font: 'Archivo', weight: p.weight, tracking: -0.01 });
      if (!b) return wout(r1.whole({ fill: c.fg }), r1.ink);
      const w1 = r1.ink.x1 - r1.ink.x0;
      const probe = wrun(b, { font: 'Archivo', weight: p.weight, tracking: -0.01 });
      const w2 = probe.ink.x1 - probe.ink.x0;
      /* justified: the narrower line grows to the wider one's measure (capped so it never turns into a headline) */
      let k1 = 1, k2 = 1;
      if (p.align === 'justify') { if (w1 < w2) k1 = Math.min(1.8, w2 / w1); else k2 = Math.min(1.8, w1 / w2); }
      const W = Math.max(w1 * k1, w2 * k2), cap = r1.cap, gap = cap * p.leading;
      const x1 = (p.align === 'center' ? (W - w1 * k1) / 2 : 0) - r1.m.inkL * 100 * k1;
      const R1 = wrun(a, { font: 'Archivo', weight: p.weight, tracking: -0.01, size: 100 * k1, x: x1, y: cap * k1 });
      const y2 = cap * k1 + gap + cap * k2;
      const x2 = (p.align === 'center' ? (W - w2 * k2) / 2 : 0) - probe.m.inkL * 100 * k2;
      const R2 = wrun(b, { font: 'Archivo', weight: p.weight, tracking: -0.01, size: 100 * k2, x: x2, y: y2 });
      return wout(R1.whole({ fill: c.fg }) + R2.whole({ fill: c.fg }), ubox({ x0: 0, x1: W, y0: 0, y1: cap * k1 }, { x0: R2.ink.x0, x1: R2.ink.x1, y0: y2 - R2.cap, y1: R2.ink.y1 }));
    });

  WS('wm-outline', 'Outline', 'Heavy capitals drawn as a single keyline, with an optional solid first letter or offset fill.',
    'retro sports outline', 'Archivo Black', 400, 'upper', 0.03,
    [pR('stroke', 'Stroke', 1.5, 6, 0.25, 2.75), pB('fillFirst', 'Solid first letter', false), pB('offset', 'Offset fill', false)],
    (name, c, p) => {
      const s = wcase(name, 'upper');
      const R = wrun(s, { font: 'Archivo Black', weight: 400, tracking: 0.03 });
      const o = 6;
      let out = p.offset ? `<g transform="translate(${o} ${o})">${R.whole({ fill: c.accent })}</g>` : '';
      out += R.whole({ fill: 'none', stroke: c.fg, 'stroke-width': f(p.stroke), 'stroke-linejoin': 'miter' });
      if (p.fillFirst) out += R.glyph(0, { fill: c.fg });
      const box = p.offset ? ubox(R.ink, { x0: R.ink.x0 + o, x1: R.ink.x1 + o, y0: R.ink.y0 + o, y1: R.ink.y1 + o }) : R.ink;
      return wout(out, box, 4 + p.stroke / 2);
    });

  WS('wm-shear', 'Italic shear', 'Heavy capitals sheared forward on the baseline, optionally with speed cuts. Built for motion.',
    'motorsport and performance shear', 'Archivo', 900, 'upper', -0.01,
    [pR('angle', 'Shear', 6, 20, 0.5, 12), pR('lines', 'Speed cuts', 0, 3, 1, 0)],
    (name, c, p) => {
      const id = uid(), s = wcase(name, 'upper');
      const R = wrun(s, { font: 'Archivo', weight: 900, tracking: -0.01 });
      const t = Math.tan(p.angle * RAD);
      let m = '';
      for (let i = 0; i < p.lines; i++) { const y = R.y - R.cap * (0.16 + i * 0.16); m += `<rect x="${f(R.ink.x0 - 20)}" y="${f(y - R.cap * 0.035)}" width="${f(R.ink.x1 - R.ink.x0 + 60)}" height="${f(R.cap * 0.07)}"/>`; }
      const body = `<g transform="skewX(${f(-p.angle)})">${R.whole({ fill: c.fg, mask: m ? `url(#${id}m)` : null })}</g>`;
      const box = { x0: R.ink.x0 - t * R.ink.y1, x1: R.ink.x1 + t * -R.ink.y0, y0: R.ink.y0, y1: R.ink.y1 };
      return wout((m ? `<defs>${maskEl(id + 'm', `<g fill="#000">${m}</g>`)}</defs>` : '') + body, box);
    });

  WS('wm-underline', 'Underline swoosh', 'A bold lowercase name over a tapered swoosh or a straight accent rule: the name, signed.',
    'consumer brand with signature underline', 'Plus Jakarta Sans', 800, 'lower', -0.035,
    [pS('variant', 'Underline', [['swoosh', 'Swoosh'], ['rule', 'Rule'], ['short', 'Short rule']], 'swoosh'), pR('weight', 'Weight', 0.03, 0.14, 0.005, 0.075), pR('gap', 'Gap', 0.04, 0.3, 0.01, 0.1)],
    (name, c, p) => {
      const s = wcase(name, 'lower');
      const R = wrun(s, { font: 'Plus Jakarta Sans', weight: 800, tracking: -0.035 });
      const yb = Math.max(R.y + R.fm.desc * 100 * 0.35, R.ink.y1) + p.gap * 100, t = p.weight * 100, x0 = R.ink.x0, x1 = R.ink.x1, xm = (x0 + x1) / 2;
      let u;
      if (p.variant === 'swoosh') u = `<path d="M${f(x0 + 2)},${f(yb)}Q${f(xm)},${f(yb + t * 3.4)} ${f(x1)},${f(yb - t * 0.9)}Q${f(xm)},${f(yb + t * 0.9)} ${f(x0 + 2)},${f(yb)}Z" fill="${c.accent}"/>`;
      else if (p.variant === 'short') u = `<rect x="${f(x0)}" y="${f(yb)}" width="${f((x1 - x0) * 0.32)}" height="${f(t)}" fill="${c.accent}"/>`;
      else u = `<rect x="${f(x0)}" y="${f(yb)}" width="${f(x1 - x0)}" height="${f(t)}" fill="${c.accent}"/>`;
      return wout(R.whole({ fill: c.fg }) + u, ubox(R.ink, { x0, x1, y0: yb - t, y1: yb + t * (p.variant === 'swoosh' ? 1.6 : 1) }));
    });

  WS('wm-boxed', 'Boxed', 'Spaced capitals held in a keyline box, reversed out of a solid block, or set between brackets.',
    'gallery and studio label', 'Space Grotesk', 500, 'upper', 0.14,
    [pS('variant', 'Frame', [['box', 'Keyline box'], ['solid', 'Solid block'], ['brackets', 'Brackets'], ['corners', 'Corner marks']], 'box'), pR('pad', 'Padding', 0.15, 0.8, 0.01, 0.38), pR('weight', 'Line weight', 0.02, 0.09, 0.005, 0.04)],
    (name, c, p) => {
      const id = uid(), s = wcase(name, 'upper');
      const R = wrun(s, { font: 'Space Grotesk', weight: 500, tracking: 0.14 });
      const pd = p.pad * R.cap, w = p.weight * 100;
      const X0 = R.ink.x0 - pd * 1.25, X1 = R.ink.x1 + pd * 1.25, Y0 = R.y - R.cap - pd, Y1 = R.y + pd;
      const box = { x0: X0, x1: X1, y0: Y0, y1: Y1 };
      const st = `fill="none" stroke="${c.fg}" stroke-width="${f(w)}"`;
      if (p.variant === 'solid') return wout(`<defs>${maskEl(id + 'm', R.whole({ fill: '#000' }))}</defs><rect x="${f(X0)}" y="${f(Y0)}" width="${f(X1 - X0)}" height="${f(Y1 - Y0)}" fill="${c.fg}" mask="url(#${id}m)"/>`, box, 2);
      const a = w / 2;
      let fr;
      if (p.variant === 'brackets') { const L = pd * 1.1; fr = `<path d="M${f(X0 + L)},${f(Y0 + a)}H${f(X0 + a)}V${f(Y1 - a)}H${f(X0 + L)}M${f(X1 - L)},${f(Y0 + a)}H${f(X1 - a)}V${f(Y1 - a)}H${f(X1 - L)}" ${st}/>`; }
      else if (p.variant === 'corners') { const L = pd * 0.9; fr = `<path d="M${f(X0 + a)},${f(Y0 + L)}V${f(Y0 + a)}H${f(X0 + L)}M${f(X1 - L)},${f(Y0 + a)}H${f(X1 - a)}V${f(Y0 + L)}M${f(X1 - a)},${f(Y1 - L)}V${f(Y1 - a)}H${f(X1 - L)}M${f(X0 + L)},${f(Y1 - a)}H${f(X0 + a)}V${f(Y1 - L)}" ${st}/>`; }
      else fr = `<rect x="${f(X0 + a)}" y="${f(Y0 + a)}" width="${f(X1 - X0 - w)}" height="${f(Y1 - Y0 - w)}" ${st}/>`;
      return wout(R.whole({ fill: c.fg }) + fr, box, 2);
    });

  WS('wm-registered', 'Superscript mark', 'A clean title-case name with a superscript registered, trademark or asterisk mark aligned to the cap height.',
    'heritage consumer brand with registered mark', 'Inter', 600, 'title', -0.025,
    [pS('mark', 'Mark', [['®', 'Registered'], ['™', 'Trademark'], ['*', 'Asterisk'], ['°', 'Degree']], '®'), pR('size', 'Mark size', 0.2, 0.45, 0.01, 0.3), pB('accent', 'Accent mark', false)],
    (name, c, p) => {
      const R = wrun(wcase(name, 'title'), { font: 'Inter', weight: 600, tracking: -0.025 });
      const ms = p.size * 100, mm = measure(p.mark, 'Inter', R.weight), x = R.ink.x1 + R.size * 0.035 + mm.glyphs[0].l * ms;
      const y = R.y - R.cap + mm.a * ms;
      const mk = `<text x="${f(x)}" y="${f(y)}" font-family="${svgFamily('Inter')}" font-weight="${R.weight}" font-size="${f(ms)}" fill="${p.accent ? c.accent : c.fg}">${esc(p.mark)}</text>`;
      return wout(R.whole({ fill: c.fg }) + mk, ubox(R.ink, { x0: x, x1: x + mm.inkR * ms, y0: R.y - R.cap, y1: y }));
    });

  WS('wm-rounded', 'Rounded soft', 'A heavy rounded lowercase softened further at every corner. Friendly, safe, approachable.',
    'family and wellness rounded sans', 'Nunito', 900, 'lower', -0.01,
    [pR('soft', 'Softness', 0, 8, 0.25, 3), pR('tracking', 'Tracking', -0.06, 0.06, 0.005, -0.01)],
    (name, c, p) => {
      const R = wrun(wcase(name, 'lower'), { font: 'Nunito', weight: 900, tracking: p.tracking });
      return wout(R.whole({ fill: c.fg, stroke: c.fg, 'stroke-width': f(p.soft), 'stroke-linejoin': 'round' }), R.ink, 4 + p.soft / 2);
    });

  WS('wm-condensed', 'Condensed tall caps', 'Compressed capitals stretched tall: maximum presence in minimum width. Posters, sport, news.',
    'poster and sports condensed caps', 'Anton', 400, 'upper', 0.02,
    [pR('height', 'Height', 1, 1.5, 0.01, 1.12), pR('tracking', 'Tracking', 0, 0.15, 0.005, 0.02)],
    (name, c, p) => {
      const R = wrun(wcase(name, 'upper'), { font: 'Anton', weight: 400, tracking: p.tracking });
      return wout(`<g transform="scale(1 ${f(p.height)})">${R.whole({ fill: c.fg })}</g>`, { x0: R.ink.x0, x1: R.ink.x1, y0: R.ink.y0 * p.height, y1: R.ink.y1 * p.height });
    });

  WS('wm-serif-italic', 'Serif italic', 'A lowercase serif italic: literary, warm, personal. Editorial confidence without shouting.',
    'literary publisher italic', 'Instrument Serif', 400, 'lower', -0.01,
    [pS('case', 'Case', [['lower', 'Lowercase'], ['title', 'Title case']], 'lower'), pB('accentFirst', 'Accent first letter', false)],
    (name, c, p) => {
      const s = wcase(name, p.case);
      const R = wrun(s, { font: 'Instrument Serif', weight: 400, italic: true, tracking: -0.01 });
      return wout(R.whole({ fill: c.fg }, p.accentFirst ? [{ from: 0, to: 1, fill: c.accent }] : null), R.ink);
    }, { italic: true });

  WS('wm-script', 'Script', 'A connected script signature with an optional flourish beneath. Craft, hospitality, a personal promise.',
    'hospitality and patisserie script', 'Pinyon Script', 400, 'title', 0,
    [pS('face', 'Hand', [['formal', 'Formal copperplate'], ['hand', 'Casual hand']], 'formal'), pB('flourish', 'Flourish', true)],
    (name, c, p) => {
      const font = p.face === 'hand' ? 'Caveat' : 'Pinyon Script', w = p.face === 'hand' ? 700 : 400;
      const R = wrun(wcase(name, 'title'), { font, weight: w, tracking: 0 });
      let fl = '', box = R.ink;
      if (p.flourish) {
        const x0 = R.ink.x0 + (R.ink.x1 - R.ink.x0) * 0.18, x1 = R.ink.x1 + 6, y = Math.max(R.ink.y1, R.y + 8) + 6, t = 3.2;
        fl = `<path d="M${f(x0)},${f(y + 2)}C${f(x0 + (x1 - x0) * 0.35)},${f(y + t * 2.6)} ${f(x0 + (x1 - x0) * 0.7)},${f(y - t)} ${f(x1)},${f(y - t * 3)}C${f(x0 + (x1 - x0) * 0.7)},${f(y + t * 0.2)} ${f(x0 + (x1 - x0) * 0.35)},${f(y + t * 3.4)} ${f(x0)},${f(y + 2)}Z" fill="${c.accent}"/>`;
        box = ubox(box, { x0, x1, y0: y - t * 3, y1: y + t * 2.5 });
      }
      return wout(R.whole({ fill: c.fg }) + fl, box);
    }, { fonts: [['Pinyon Script', 400], ['Caveat', 700]] });

  WS('wm-acronym', 'Dotted acronym', 'Initials punctuated with full stops (M.R.) or every letter spaced with interpuncts, the stops in accent.',
    'law-firm and institution initials', 'Fraunces', 700, 'upper', 0.02,
    [pS('source', 'Source', [['initials', 'Initials'], ['spaced', 'Every letter']], 'initials'), pB('accent', 'Accent stops', true), WEIGHTS([600, 700, 900], 700)],
    (name, c, p) => {
      let s;
      if (p.source === 'spaced') s = Array.from(wcase(name, 'upper').replace(/ /g, '')).join('·');
      else { const parts = String(name).trim().split(/\s+/).length > 1 ? String(name).trim().split(/\s+/) : splitName(name); s = parts.filter(Boolean).map((q) => q[0].toUpperCase() + '.').join(''); }
      const R = wrun(s, { font: 'Fraunces', weight: p.weight, tracking: p.source === 'spaced' ? 0.06 : 0.02 });
      const ranges = [];
      Array.from(s).forEach((q, i) => { if (q === '.' || q === '·') ranges.push({ from: i, to: i + 1, fill: p.accent ? c.accent : c.fg }); });
      return wout(R.whole({ fill: c.fg }, ranges), R.ink);
    });

  WS('wm-split-colour', 'Split colour', 'The word cut by colour: top and bottom halves, alternating letters, the first letter, or left and right.',
    'youth and media two-tone', 'Space Grotesk', 700, 'lower', -0.03,
    [pS('mode', 'Split', [['horizontal', 'Top / bottom'], ['alternate', 'Alternate letters'], ['first', 'First letter'], ['half', 'Left / right']], 'horizontal')],
    (name, c, p) => {
      const id = uid(), s = wcase(name, 'lower');
      const R = wrun(s, { font: 'Space Grotesk', weight: 700, tracking: -0.03 });
      if (p.mode === 'alternate') { const rg = []; let k = 0; Array.from(s).forEach((q, i) => { if (q.trim()) { if (k % 2) rg.push({ from: i, to: i + 1, fill: c.accent }); k++; } }); return wout(R.whole({ fill: c.fg }, rg), R.ink); }
      if (p.mode === 'first') return wout(R.whole({ fill: c.fg }, [{ from: 0, to: 1, fill: c.accent }]), R.ink);
      const cut = p.mode === 'half' ? `<rect x="${f((R.ink.x0 + R.ink.x1) / 2)}" y="-300" width="2000" height="600"/>` : `<rect x="-100" y="${f(R.y - R.xh / 2)}" width="4000" height="300"/>`;
      return wout(`<defs>${clipEl(id + 'c', cut)}</defs>${R.whole({ fill: c.fg })}<g clip-path="url(#${id}c)">${R.whole({ fill: c.accent })}</g>`, R.ink);
    });

  WS('wm-crop', 'Baseline crop', 'Heavy capitals cut off by a hard horizontal edge, as if rising from the page or sinking below it.',
    'architecture and gallery crop', 'Archivo', 900, 'upper', -0.01,
    [pR('crop', 'Crop', 0.1, 0.45, 0.01, 0.2), pS('edge', 'Edge', ['bottom', 'top'], 'bottom'), pB('rule', 'Rule at the edge', true)],
    (name, c, p) => {
      const id = uid(), s = wcase(name, 'upper');
      const R = wrun(s, { font: 'Archivo', weight: 900, tracking: -0.01 });
      const yc = p.edge === 'bottom' ? R.y - R.cap * p.crop : R.y - R.cap * (1 - p.crop);
      const keep = p.edge === 'bottom' ? `<rect x="-100" y="-400" width="4000" height="${f(400 + yc)}"/>` : `<rect x="-100" y="${f(yc)}" width="4000" height="400"/>`;
      const rw = R.cap * 0.045, gap = R.cap * 0.08;
      const rule = p.rule ? `<rect x="${f(R.ink.x0)}" y="${f(p.edge === 'bottom' ? yc + gap : yc - gap - rw)}" width="${f(R.ink.x1 - R.ink.x0)}" height="${f(rw)}" fill="${c.accent}"/>` : '';
      const box = p.edge === 'bottom' ? { x0: R.ink.x0, x1: R.ink.x1, y0: R.y - R.cap, y1: p.rule ? yc + gap + rw : yc } : { x0: R.ink.x0, x1: R.ink.x1, y0: p.rule ? yc - gap - rw : yc, y1: R.y };
      return wout(`<defs>${clipEl(id + 'c', keep)}</defs><g clip-path="url(#${id}c)">${R.whole({ fill: c.fg })}</g>${rule}`, box);
    });

  WS('wm-smallcaps', 'Spaced small caps', 'Widely letter-spaced serif small capitals between fine rules. Restraint as luxury.',
    'atelier and hotel small caps', 'Cormorant Garamond', 600, 'upper', 0.34,
    [pS('rule', 'Rules', [['sides', 'Either side'], ['below', 'Below'], ['framed', 'Above and below']], 'sides'), pR('tracking', 'Tracking', 0.15, 0.6, 0.01, 0.34), pB('smallcaps', 'True small caps', true), pR('weight', 'Rule weight', 0.008, 0.04, 0.001, 0.016)],
    (name, c, p) => {
      const font = 'Cormorant Garamond', w = fontW(font, 600), up = wcase(name, 'upper');
      const fm = fontMetrics(font, w), k = p.smallcaps ? 0.74 : 1, tr = p.tracking * 100;
      let x = 0, out = '';
      const words = up.split(' ');
      words.forEach((wd, wi) => {
        Array.from(wd).forEach((ch, i) => {
          const sz = i === 0 ? 100 : 100 * k, m = measure(ch, font, w);
          out += `<text x="${f(x)}" y="0" font-family="${svgFamily(font)}" font-weight="${w}" font-size="${f(sz)}" fill="${c.fg}">${esc(ch)}</text>`;
          x += m.adv * sz + tr * (i === 0 ? 1 : k);
        });
        if (wi < words.length - 1) x += 100 * 0.28 + tr;
      });
      x -= tr * k;
      const cap = fm.cap * 100, rw = p.weight * 100, x0 = measure(up[0], font, w).inkL * 100;
      let rules = '', box = { x0, x1: x, y0: -cap, y1: 0 };
      if (p.rule === 'sides') {
        const L = cap * 1.6, g = cap * 0.7, y = -cap * k / 2 - rw / 2;
        rules = `<rect x="${f(x0 - g - L)}" y="${f(y)}" width="${f(L)}" height="${f(rw)}" fill="${c.fg}"/><rect x="${f(x + g)}" y="${f(y)}" width="${f(L)}" height="${f(rw)}" fill="${c.fg}"/>`;
        box = { x0: x0 - g - L, x1: x + g + L, y0: -cap, y1: 0 };
      } else if (p.rule === 'below') {
        const L = (x - x0) * 0.22;
        rules = `<rect x="${f((x0 + x) / 2 - L / 2)}" y="${f(cap * 0.42)}" width="${f(L)}" height="${f(rw * 1.4)}" fill="${c.accent}"/>`;
        box.y1 = cap * 0.42 + rw * 1.4;
      } else {
        rules = `<rect x="${f(x0)}" y="${f(-cap - cap * 0.45 - rw)}" width="${f(x - x0)}" height="${f(rw)}" fill="${c.fg}"/><rect x="${f(x0)}" y="${f(cap * 0.45)}" width="${f(x - x0)}" height="${f(rw)}" fill="${c.fg}"/>`;
        box.y0 = -cap - cap * 0.45 - rw; box.y1 = cap * 0.45 + rw;
      }
      return wout(out + rules, box);
    });

  WS('wm-ligature', 'Custom ligature', 'Two neighbouring letters made to share a stem: a single drawn connection that makes the word ownable.',
    'bespoke logotype ligature', 'Outfit', 600, 'lower', -0.01,
    [pB('accent', 'Accent the pair', false), WEIGHTS([400, 600, 700], 600)],
    (name, c, p) => {
      const s = wcase(name, 'lower');
      const R = wrun(s, { font: 'Outfit', weight: p.weight, tracking: -0.01 });
      /* a right-hand stem meeting a left-hand stem can be shared (u+m, n+n, a+r); i and l would vanish, so they never join */
      const RS = /[adhmnu]/, LS = /[bhkmnpr]/;
      let at = -1;
      for (let i = 0; i < s.length - 1; i++) if (RS.test(s[i]) && LS.test(s[i + 1])) { at = i; break; }
      const st = R.stem;
      let shift = 0;
      if (at >= 0) { const a = R.gink(at), b = R.gink(at + 1); shift = b.x0 - a.x1 + st; }
      else {
        /* no shared stem: the closest neighbours kiss, overlapping by a third of a stem */
        let best = Infinity;
        for (let i = 0; i < s.length - 1; i++) { if (!s[i].trim() || !s[i + 1].trim()) continue; const g = R.gink(i + 1).x0 - R.gink(i).x1; if (g < best) { best = g; at = i; } }
        if (at < 0) at = 0;
        shift = best + st * 0.35;
      }
      let out = '';
      R.m.glyphs.forEach((g, i) => { if (!g.ch.trim()) return; const dx = i > at ? -shift : 0; out += `<g transform="translate(${f(dx)} 0)">${R.glyph(i, { fill: p.accent && (i === at || i === at + 1) ? c.accent : c.fg })}</g>`; });
      return wout(out, { x0: R.ink.x0, x1: R.ink.x1 - shift, y0: R.ink.y0, y1: R.ink.y1 });
    });

  WS('wm-vertical', 'Vertical stack', 'Capitals stacked one above another on a centred axis, or the whole name turned to read upward. For spines, signs and tall formats.',
    'signage and book-spine vertical', 'Archivo', 800, 'upper', 0,
    [pS('mode', 'Mode', [['stacked', 'Stacked letters'], ['rotated', 'Rotated']], 'stacked'), pR('leading', 'Letter spacing', 1.05, 1.6, 0.01, 1.2)],
    (name, c, p) => {
      const s = wcase(name, 'upper');
      if (p.mode === 'rotated') {
        const R = wrun(s, { font: 'Archivo', weight: 800, tracking: 0.04 });
        return wout(`<g transform="rotate(-90)">${R.whole({ fill: c.fg })}</g>`, { x0: R.ink.y0, x1: R.ink.y1, y0: -R.ink.x1, y1: -R.ink.x0 });
      }
      const font = 'Archivo', w = fontW(font, 800), fm = fontMetrics(font, w), cap = fm.cap * 100;
      let y = 0, out = '', maxW = 0;
      Array.from(s).forEach((ch) => {
        if (ch === ' ') { y += cap * 0.6; return; }
        y += cap * (y === 0 ? 1 : p.leading);
        const m = measure(ch, font, w);
        maxW = Math.max(maxW, m.w * 100);
        out += `<text x="${f(-((m.inkL + m.inkR) / 2) * 100)}" y="${f(y)}" font-family="${svgFamily(font)}" font-weight="${w}" font-size="100" fill="${c.fg}">${esc(ch)}</text>`;
      });
      return wout(out, { x0: -maxW / 2, x1: maxW / 2, y0: 0, y1: y });
    });

  WS('wm-mixed', 'Mixed weights', 'The name in two weights of one family: the first part bold, the second light. Two ideas in one word.',
    'media and property two-weight', 'Hanken Grotesk', 700, 'lower', -0.02,
    [pS('light', 'Light weight', [[300, 'Light'], [400, 'Regular']], 300), pB('swap', 'Light first', false)],
    (name, c, p) => {
      const parts = splitName(wcase(name, 'lower'));
      const hasSpace = String(name).trim().indexOf(' ') > 0;
      const wA = p.swap ? p.light : 700, wB = p.swap ? 700 : p.light;
      const A = wrun(parts[0], { font: 'Hanken Grotesk', weight: wA, tracking: -0.02 });
      const xB = A.m.adv * 100 + (hasSpace ? measure(' ', 'Hanken Grotesk', fontW('Hanken Grotesk', wA)).adv * 100 * 0.8 : 0);
      const B = wrun(parts[1] || '', { font: 'Hanken Grotesk', weight: wB, tracking: -0.02, x: xB });
      return wout(A.whole({ fill: c.fg }) + B.whole({ fill: c.fg }), ubox(A.ink, parts[1] ? B.ink : A.ink));
    });

  WS('wm-circular', 'Circular text', 'The name set around a circle with separators and a centre point: a roundel made of type.',
    'coffee, craft and studio roundel', 'Space Grotesk', 500, 'upper', 0.12,
    [pS('center', 'Centre', [['dot', 'Dot'], ['initial', 'Initial'], ['none', 'Empty']], 'dot'), pR('size', 'Type size', 8, 14, 0.25, 11), pS('sep', 'Separator', [['•', 'Bullet'], ['—', 'Dash'], ['✦', 'Star'], ['/', 'Slash']], '•')],
    (name, c, p) => {
      const id = uid(), font = 'Space Grotesk', w = fontW(font, 500), unit = wcase(name, 'upper') + '  ' + p.sep + '  ';
      const r = 40 - p.size * 0.72 / 2 - 2, circ = 2 * Math.PI * r, um = measure(unit, font, w).adv * p.size;
      const reps = Math.max(2, Math.round(circ / (um * 1.12))), sz = Math.min(p.size, p.size * circ / (um * reps * 1.04)), str = unit.repeat(reps), n = Array.from(str).length, ls = (circ - (um * sz / p.size) * reps) / n;
      let s = `<path id="${id}p" d="${arcD(50, 50, r, 180, 540)}" fill="none"/><text font-family="${svgFamily(font)}" font-weight="${w}" font-size="${f(p.size)}" letter-spacing="${f(ls)}" fill="${c.fg}"><textPath href="#${id}p">${esc(str)}</textPath></text>`.replace(`font-size="${f(p.size)}"`, `font-size="${f(sz)}"`);
      if (p.center === 'dot') s += `<circle cx="50" cy="50" r="7" fill="${c.accent}"/>`;
      if (p.center === 'initial') s += initialFit(normC(Object.assign({}, c, { name })), { cx: 50, cy: 50, w: 34, h: 26 }, { font, weight: 700 }).svg({ fill: c.fg });
      return wout(s, { x0: 9, x1: 91, y0: 9, y1: 91 }, 1);
    });

  /* optical side-bearing adjustments for the constructed alphabet (fraction of cap height) */
  const SKEL_SB = { A: [-0.1, -0.1], V: [-0.1, -0.1], W: [-0.07, -0.07], Y: [-0.08, -0.08], X: [-0.05, -0.05], T: [-0.07, -0.07], O: [-0.05, -0.05], Q: [-0.05, -0.04], C: [-0.05, -0.03], G: [-0.05, -0.02], D: [0, -0.05], B: [0, -0.03], P: [0, -0.04], R: [0, -0.03], S: [-0.03, -0.03], J: [-0.05, 0], L: [0, -0.08], K: [0, -0.05], Z: [-0.02, -0.02] };
  WS('wm-constructed', 'Constructed monoline', 'Custom capitals drawn from circles and straight lines at one weight, spaced optically. Lettering, not a typeface.',
    'space-age constructed lettering', 'constructed', 0, 'upper', 0.3,
    [pR('weight', 'Weight', 5, 18, 0.5, 10), pR('spacing', 'Spacing', 0.12, 0.6, 0.01, 0.3), pS('cap', 'Terminals', [['butt', 'Flat'], ['round', 'Round']], 'butt'), pS('accent', 'Accent', [['none', 'None'], ['first', 'First letter'], ['last', 'Last letter']], 'none')],
    (name, c, p) => {
      const s = wcase(name, 'upper'), W = p.weight;
      let x = 0, out = '';
      const chars = Array.from(s), last = chars.length - 1 - Array.from(s).reverse().findIndex((q) => SKEL[q]);
      chars.forEach((ch, i) => {
        if (ch === ' ') { x += 26 + p.spacing * 60; return; }
        const sk = SKEL[ch];
        if (!sk) return;
        const sb = SKEL_SB[ch] || [0, 0];
        if (x > 0) x += sb[0] * 100;
        const fill = (p.accent === 'first' && i === 0) || (p.accent === 'last' && i === last) ? c.accent : c.fg;
        out += `<path d="${sk[1]}" transform="translate(${f(x + W / 2)} -100)" fill="none" stroke="${fill}" stroke-width="${f(W)}" stroke-linecap="${p.cap}" stroke-linejoin="${p.cap === 'round' ? 'round' : 'miter'}" stroke-miterlimit="2.6"/>`;
        x += sk[0] + W;
        x += sb[1] * 100 + p.spacing * 100;
      });
      x -= p.spacing * 100;
      const lastCh = chars[last];
      if (lastCh) x -= (SKEL_SB[lastCh] || [0, 0])[1] * 100;
      return wout(out, { x0: 0, x1: x, y0: -100 - (p.cap === 'round' ? W / 2 : W * 0.15), y1: p.cap === 'round' ? W / 2 : W * 0.15 }, 4);
    }, { fonts: [] });

  WS('wm-lined', 'Scanline cut', 'Heavy capitals cut by evenly spaced horizontal lines: speed, signal and engineered precision.',
    'corporate striped logotype', 'Archivo Black', 400, 'upper', 0.02,
    [pR('lines', 'Lines', 3, 11, 1, 7), pR('ratio', 'Cut ratio', 0.15, 0.6, 0.01, 0.38), pS('region', 'Region', [['full', 'Full height'], ['lower', 'Lower half']], 'full')],
    (name, c, p) => {
      const id = uid(), R = wrun(wcase(name, 'upper'), { font: 'Archivo Black', weight: 400, tracking: 0.02 });
      const n = p.lines, pitch = R.cap / n, g = pitch * p.ratio;
      let m = '';
      for (let i = 1; i < n; i++) { if (p.region === 'lower' && i < n / 2) continue; const y = R.y - R.cap + i * pitch - g / 2; m += `<rect x="-100" y="${f(y)}" width="4000" height="${f(g)}"/>`; }
      return wout(`<defs>${maskEl(id + 'm', `<g fill="#000">${m}</g>`)}</defs>` + R.whole({ fill: c.fg, mask: `url(#${id}m)` }), R.ink);
    });

  WS('wm-fashion', 'Fashion sans caps', 'Geometric sans capitals with generous, even tracking. Minimal, cool, expensive.',
    'fashion-house sans caps', 'Josefin Sans', 600, 'upper', 0.24,
    [WEIGHTS([400, 600, 700], 600), pR('tracking', 'Tracking', 0.08, 0.5, 0.01, 0.24)], plain('Josefin Sans', 'upper'));

  WS('wm-soft-serif', 'Soft display serif', 'A heavy, soft-cornered display serif in lowercase, tightly set. Warm, nostalgic, edible.',
    'seventies food and editorial serif', 'Fraunces', 900, 'lower', -0.035,
    [WEIGHTS([600, 700, 900], 900), pR('tracking', 'Tracking', -0.07, 0.02, 0.005, -0.035)], plain('Fraunces', 'lower'));

  WS('wm-kinetic', 'Expanding tracking', 'Spacing that opens letter by letter across the name: acceleration, breath, growth.',
    'mobility and fintech kinetic spacing', 'Inter Tight', 700, 'upper', 0,
    [pR('growth', 'Growth', 0.05, 0.6, 0.01, 0.24), pS('direction', 'Direction', [['open', 'Opening'], ['close', 'Closing']], 'open')],
    (name, c, p) => {
      const s = wcase(name, 'upper').replace(/ /g, ' ');
      const R = wrun(s, { font: 'Inter Tight', weight: 700, tracking: 0 });
      const n = R.m.glyphs.length, extra = [];
      let acc = 0;
      R.m.glyphs.forEach((g, i) => { extra.push(acc); const t = n > 1 ? i / (n - 1) : 0; acc += p.growth * 100 * (p.direction === 'open' ? t * t : (1 - t) * (1 - t)); });
      const xs = R.m.glyphs.map((g, i) => f(R.x + g.x * 100 + extra[i])).join(' ');
      const t = `<text x="${xs}" y="0" font-family="${svgFamily('Inter Tight')}" font-weight="${R.weight}" font-size="100" fill="${c.fg}">${esc(s)}</text>`;
      const lastG = R.m.glyphs[n - 1];
      return wout(t, { x0: R.ink.x0, x1: R.x + (lastG.x + lastG.r) * 100 + extra[n - 1], y0: R.ink.y0, y1: R.ink.y1 });
    });

  WS('wm-highlight', 'Marker highlight', 'A bold lowercase name over a flat accent band at x-height, like a marker pass. Editorial and direct.',
    'editorial and campaign highlight', 'DM Sans', 700, 'lower', -0.035,
    [pR('band', 'Band height', 0.25, 0.7, 0.01, 0.42), pR('offset', 'Band drop', 0, 0.3, 0.01, 0.06)],
    (name, c, p) => {
      const R = wrun(wcase(name, 'lower'), { font: 'DM Sans', weight: 700, tracking: -0.035 });
      const h = R.xh * p.band * 1.6, y = R.y - h + p.offset * 100, ex = R.size * 0.06;
      return wout(`<g style="isolation:isolate"><rect x="${f(R.ink.x0 - ex)}" y="${f(y)}" width="${f(R.ink.x1 - R.ink.x0 + 2 * ex)}" height="${f(h)}" fill="${c.accent}"/>${R.whole({ fill: c.fg, style: 'mix-blend-mode:multiply' })}</g>`, ubox(R.ink, { x0: R.ink.x0 - ex, x1: R.ink.x1 + ex, y0: y, y1: y + h }));
    });

  /* ---------- wordmark API and font loading ---------- */
  const WS_BY = {};
  WS_LIST.forEach((q) => { WS_BY[q.id] = q; });
  function styleFaces(st) {
    if (st.fonts) return st.fonts.map((q) => ({ font: q[0], weight: q[1], italic: !!q[2] }));
    const ws = new Set([st.weight]);
    (st.params || []).forEach((p) => { if (p.id === 'weight' && p.type === 'select') p.options.forEach((o) => ws.add(+o.v)); if (p.id === 'light') p.options.forEach((o) => ws.add(+o.v)); });
    return Array.from(ws).map((w) => ({ font: st.font, weight: w, italic: !!st.italic }));
  }
  function wordmarkDefaults(id) { const st = WS_BY[id], o = {}; if (st) st.params.forEach((p) => { o[p.id] = p.default; }); return o; }
  PG.WORDMARK_STYLES = WS_LIST;
  PG.wordmarkDefaults = wordmarkDefaults;
  PG.renderWordmark = function (id, name, c, params) {
    const st = WS_BY[id];
    if (!st) return { svg: '', w: 0, h: 0 };
    const p = Object.assign(wordmarkDefaults(id), params || {});
    try { return st.render(name, normC(Object.assign({}, c, { name })), p); } catch (e) { return { svg: `<!-- ${esc(id)}: ${esc(e.message)} -->`, w: 0, h: 0 }; }
  };
  const ITALIC_LINKS = new Set();
  function loadFace(font, italic) {
    if (typeof document === 'undefined') return null;
    const fam = font.replace(/ /g, '+');
    if (italic) {
      const ws = ITALICS[font];
      if (!ws) return null;
      if (!ITALIC_LINKS.has(font)) {
        ITALIC_LINKS.add(font);
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${ws.map((w) => '1,' + w).join(';')}&display=swap`;
        link.dataset.pgItalic = font;
        document.head.appendChild(link);
      }
      return document.querySelector(`link[data-pg-italic="${font}"]`);
    }
    if (PG.loadFont) PG.loadFont(font);
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find((l) => l.href.indexOf(`family=${fam}:`) > 0 || l.href.indexOf(`family=${fam}&`) > 0) || null;
  }
  const linkReady = (link) => new Promise((res) => {
    if (!link) return res();
    if (link.sheet) return res();
    link.addEventListener('load', () => res(), { once: true });
    link.addEventListener('error', () => res(), { once: true });
    setTimeout(res, 6000);
  });
  /* Load faces [{font, weight, italic}] and resolve once they can be measured. */
  PG.logoFontsReady = function (faces) {
    if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
    const uniq = new Map();
    faces.forEach((q) => { if (q && q.font && PG.FONTS && PG.FONTS[q.font]) uniq.set(q.font + '|' + fontW(q.font, q.weight || 400) + '|' + (q.italic ? 1 : 0), { font: q.font, weight: fontW(q.font, q.weight || 400), italic: !!q.italic }); });
    const list = Array.from(uniq.values());
    const sample = 'AaBbGgHhOoQqRrSsZz ıȷ.,·•®™*°>/_ 0123456789';
    return Promise.all(list.map((q) => linkReady(loadFace(q.font, q.italic))))
      .then(() => Promise.all(list.map((q) => document.fonts.load(`${q.italic ? 'italic ' : ''}${q.weight} 40px "${q.font}"`, sample).catch(() => null))))
      .then(() => (document.fonts.ready || Promise.resolve()))
      .then(() => { MCACHE.clear(); });
  };
  /* Load every face the given wordmark styles need (all styles if omitted). Pass c.font to include the brand face. */
  PG.wordmarkReady = function (styles, c) {
    const list = (styles || WS_LIST).map((s) => (typeof s === 'string' ? WS_BY[s] : s)).filter(Boolean);
    const faces = [].concat(...list.map(styleFaces));
    if (c && c.font) faces.push({ font: c.font, weight: c.weight || 700 });
    return PG.logoFontsReady(faces);
  };
  /* Load the brand face used by monogram and emblem marks. */
  PG.markReady = function (c) { c = c || {}; return PG.logoFontsReady([{ font: c.font || 'Inter', weight: c.weight || 700 }, { font: c.font || 'Inter', weight: 600 }]); };

  /* ======================================================================
     REFERENCE LESSONS (descriptions only; no trademark is redrawn)
     ====================================================================== */
  const LL = (id, brand, studio, year, lesson, kind, link) => ({ id, brand, studio, year, lesson, link: { kind, id: link } });
  PG.LOGO_LESSONS = [
    LL('fedex', 'FedEx', 'Landor Associates (Lindon Leader)', 1994, 'A forward arrow hides in the negative space between the E and the x. Space between forms can carry the idea.', 'mark', 'mono-negative'),
    LL('chase', 'Chase', 'Chermayeff & Geismar (Tom Geismar)', 1961, 'Four identical rotated segments around a square make an octagon: one of the first purely abstract marks for a large US company.', 'mark', 'geo-pinwheel'),
    LL('mastercard', 'Mastercard', 'Pentagram (Michael Bierut)', 2016, 'Two overlapping circles where the overlap is its own colour. By 2019 the circles alone could stand without the name.', 'mark', 'geo-circles'),
    LL('nasa', 'NASA "worm"', 'Danne & Blackburn', 1975, 'Custom letters at a single continuous stroke weight, the A drawn without crossbars. Constructed lettering beats a typeface for ownership.', 'wordmark', 'wm-constructed'),
    LL('olympic', 'Olympic rings', 'Pierre de Coubertin', 1913, 'Rings that genuinely interlock, over and under, say "joined" in a way that merely overlapping rings cannot.', 'mark', 'geo-rings'),
    LL('cbs', 'CBS eye', 'William Golden', 1951, 'Two arcs and a circle make an eye. A symbol can be reduced to its geometry and still be read instantly.', 'mark', 'sym-eye'),
    LL('ibm', 'IBM eight-bar logo', 'Paul Rand', 1972, 'Horizontal stripes cut through heavy slab letters suggest speed and scan lines, and unify three letters of different widths.', 'wordmark', 'wm-lined'),
    LL('westinghouse', 'Westinghouse', 'Paul Rand', 1960, 'A W built from three dots and connecting lines: a letter assembled from geometric modules, like a circuit.', 'mark', 'mono-dots'),
    LL('deutsche', 'Deutsche Bank', 'Anton Stankowski', 1974, 'One diagonal stroke inside a square, described as growth within a secure frame. A single angled gesture can carry the whole story.', 'wordmark', 'wm-slash'),
    LL('mobil', 'Mobil', 'Chermayeff & Geismar', 1964, 'A plain sans wordmark where only the o is red. Changing one round letter is enough to make a name ownable.', 'wordmark', 'wm-geo-o'),
    LL('citi', 'Citi', 'Pentagram (Paula Scher)', 1998, 'A red arc over the t, drawn on a napkin, borrowed the Travelers umbrella so the merged bank kept a trace of both companies.', 'wordmark', 'wm-underline'),
    LL('woolmark', 'Woolmark', 'Francesco Saroglia (possibly a pseudonym of Franco Grignani)', 1964, 'A continuous ribbon looping into a skein: one line, no beginning, no end. Chosen in a 1963 competition and launched in 1964.', 'mark', 'line-continuous'),
    LL('mitml', 'MIT Media Lab', 'Pentagram (Michael Bierut)', 2014, 'A grid-based system where each research group gets its own glyph from the same rules. A generator can be the identity.', 'mark', 'gen-grid'),
    LL('saks', 'Saks Fifth Avenue', 'Pentagram (Michael Bierut)', 2007, 'The script logo cut into 64 squares and reshuffled into endless patterns. Tiles turn one mark into a system.', 'mark', 'gen-slices'),
    LL('whitney', 'Whitney Museum', 'Experimental Jetset', 2013, 'The "responsive W", a single zigzag line that reshapes itself to fit the format: a line that adapts rather than a fixed picture.', 'mark', 'line-continuous'),
    LL('mozilla', 'Mozilla', 'Johnson Banks', 2017, 'moz://a set in a slab monospace: the name written in the syntax of its own medium.', 'wordmark', 'wm-mono'),
    LL('chanel', 'Chanel', 'Coco Chanel', 1925, 'Two interlocking Cs facing away from each other: initials fused into one symmetrical sign.', 'mark', 'mono-ligature'),
    LL('ysl', 'Yves Saint Laurent', 'A. M. Cassandre', 1961, 'Three initials interlaced on a vertical axis, mixing serif and sans: a monogram as a vertical stack.', 'wordmark', 'wm-vertical'),
    LL('nike', 'Nike Swoosh', 'Carolyn Davidson', 1971, 'A single tapered curve suggesting motion. Later often set beneath or apart from the name as a signature stroke.', 'wordmark', 'wm-underline'),
    LL('exxon', 'Exxon', 'Raymond Loewy', 1966, 'The double X is interlocked into a ligature: one drawn connection makes an ordinary word unmistakable.', 'wordmark', 'wm-ligature'),
    LL('att', 'AT&T globe', 'Saul Bass', 1983, 'A sphere drawn with horizontal lines of varying weight: shading and depth from stripes alone.', 'mark', 'geo-bands'),
    LL('girlscouts', 'Girl Scouts', 'Saul Bass', 1978, 'Profiles of faces formed by the edges of a single shape: figure and ground working together.', 'mark', 'mono-split'),
    LL('bp', 'BP Helios', 'Landor Associates', 2000, 'A radial flower of petals in tones of green and yellow: energy expressed as a bloom rather than a shield.', 'mark', 'geo-bloom'),
    LL('underground', 'London Underground roundel', 'Edward Johnston (redrawn)', 1919, 'Proportions fixed by a designer turned a simple ring and bar into one of the most recognised symbols in the world. Geometry plus discipline.', 'mark', 'em-roundel'),
    LL('coca-cola', 'Coca-Cola', 'Frank Mason Robinson', 1886, 'Spencerian script, the handwriting style of its day, became a wordmark that has barely changed. Script carries personality and history.', 'wordmark', 'wm-script'),
    LL('unilever', 'Unilever', 'Wolff Olins', 2004, 'A U built from 25 small icons, each standing for a part of the business: a letter as a container of meaning.', 'mark', 'mono-dots')
  ];

  /* ======================================================================
     PRESETS: curated starting points
     ====================================================================== */
  const PR = (id, name, family, params, note, directions, industries) => ({ id, name, family, params, note, directions, industries });
  PG.MARK_PRESETS = [
    PR('split-horizon', 'Split horizon', 'geo-split', { variant: 'shift', angle: 0, gap: 4, shift: 10 }, 'A circle cut by a horizontal gap whose halves slip apart: energy, travel, a new day.', ['swiss', 'dynamicSystem', 'kinetic'], ['hospitality', 'auto', 'energy', 'finance']),
    PR('quiet-initial', 'Quiet initial', 'mono-shape', { shape: 'circle', style: 'knockout', size: 0.5 }, 'The initial knocked out of a disc, centred on its cap height. The safest strong mark there is.', ['institutional', 'civic', 'clinical'], ['insurance', 'health', 'professional', 'nonprofit']),
    PR('arch-initial', 'Arch doorway', 'mono-shape', { shape: 'arch', style: 'knockout', size: 0.46 }, 'The initial in an arched doorway: welcome, place, permanence.', ['architectural', 'quietLux', 'heritage'], ['realestate', 'hospitality', 'culture']),
    PR('slipped-letter', 'Slipped letter', 'mono-sliced', { cuts: 1, angle: -20, gap: 2.5, shift: 7 }, 'One angled cut and a slip: precision and motion in a single gesture.', ['kinetic', 'neofintech', 'darkprecision'], ['finance', 'sports', 'auto', 'saas']),
    PR('signal-stencil', 'Stencil plate', 'mono-stencil', { bridges: 'auto', width: 3, frame: 'circle' }, 'A stencilled initial in a disc, honest and made, like a crate marking.', ['brutalist', 'handmade', 'architectural'], ['industrial', 'food', 'retail']),
    PR('full-stop', 'Full stop', 'mono-dot', { position: 'period', dot: 0.24, gap: 0.07 }, 'Initial plus a coloured full stop: decisive, finished, modern.', ['swiss', 'friendlyGeo', 'neofintech'], ['saas', 'media', 'professional', 'finance']),
    PR('keyline-pair', 'Interlaced pair', 'mono-ligature', { mode: 'halo', overlap: 0.3 }, 'Two initials overlapping with a keyline so one passes in front: a partnership monogram.', ['editorialLux', 'heritage', 'quietLux'], ['fashion', 'professional', 'hospitality']),
    PR('crop-block', 'Cropped block', 'mono-negative', { frame: 'square', scale: 1.4, x: 0.22, y: -0.22 }, 'An oversized initial cut from a block so only its counters and edges remain.', ['brutalist', 'magazine', 'maximal'], ['media', 'culture', 'retail']),
    PR('rail-letter', 'Rail letter', 'mono-geo', { weight: 14, lines: 3, cap: 'butt', join: 'round' }, 'A constructed initial drawn as three parallel rails: the inline of transport and 70s optimism.', ['retro', 'kinetic', 'modernist'], ['auto', 'sports', 'hospitality', 'media']),
    PR('monoline-ring', 'Monoline in a ring', 'mono-geo', { weight: 8, frame: 'ring', cap: 'butt', join: 'miter' }, 'A geometric monoline initial inside a ring of the same weight: engineered, consistent.', ['modernist', 'architectural', 'scientific'], ['industrial', 'realestate', 'ai']),
    PR('pixel-letter', 'Pixel letter', 'mono-dots', { shape: 'circle', connect: true, accent: 'last' }, 'A dot-matrix initial joined into a line, ending on an accent dot. Digital without cliché.', ['cyber', 'darkprecision', 'dynamicSystem'], ['devtools', 'gaming', 'ai']),
    PR('split-state', 'Split state', 'mono-split', { angle: 90, frame: 'circle' }, 'Half the disc is solid with the letter cut out, half is open with the letter solid. Before and after, figure and ground.', ['swiss', 'scientific', 'japaneseMinimal'], ['ai', 'health', 'professional']),
    PR('corner-frame', 'Corner frame', 'mono-frame', { frame: 'corners', weight: 4 }, 'An initial held by corner marks, like a viewfinder or a crop.', ['magazine', 'editorialLux', 'swiss'], ['media', 'culture', 'fashion']),
    PR('venn-trio', 'Venn trio', 'geo-circles', { count: 3, layout: 'cluster', overlap: 0.35, mode: 'lens' }, 'Three overlapping circles with accent lenses: collaboration and shared ground.', ['friendlyGeo', 'warmHuman', 'civic'], ['nonprofit', 'edu', 'saas']),
    PR('windmill', 'Windmill', 'geo-quarters', { grid: 2, pattern: 'pinwheel', gap: 0 }, 'Four quarter discs turning around a point: renewal, momentum, energy.', ['bauhaus', 'ecoOptimist', 'friendlyGeo'], ['energy', 'kids', 'edu']),
    PR('halftone-sun', 'Halftone field', 'geo-dotgrid', { n: 9, mod: 'radial', mask: 'circle', size: 0.95 }, 'A dot field swelling to the centre: a halftone sun, a lens, data made warm.', ['scientific', 'riso', 'dynamicSystem'], ['ai', 'media', 'energy']),
    PR('ripple', 'Ripple', 'geo-concentric', { count: 4, ratio: 0.5, ecc: 0.7, dot: true }, 'Rings sliding toward one side: a ripple, a tunnel, depth.', ['softWellness', 'japaneseMinimal', 'clinical'], ['wellness', 'health', 'beauty']),
    PR('whirl', 'Whirl', 'geo-rotsquares', { count: 9, step: 9, mode: 'inscribed', style: 'outline', weight: 2 }, 'Squares each inscribed in the last and turned a few degrees: one rule, a spiral emerges.', ['modernist', 'architectural', 'scientific'], ['realestate', 'professional', 'ai']),
    PR('facet-hex', 'Faceted hexagon', 'geo-polygon', { sides: 6, style: 'faceted' }, 'A hexagon faceted in two tones like a cut stone: structure with light in it.', ['gradient', 'darkLuxury', 'cyber'], ['crypto', 'ai', 'saas']),
    PR('deco-burst', 'Deco burst', 'geo-burst', { rays: 24, inner: 0.36, shape: 'wedge', alternate: true, disc: true }, 'Alternating wedge rays around a disc: Art Deco sunrise, celebration.', ['artdeco', 'retro', 'maximal'], ['hospitality', 'restaurant', 'culture']),
    PR('bloom-8', 'Bloom', 'geo-bloom', { petals: 8, width: 0.42, mode: 'multiply' }, 'Eight lens petals multiplied where they overlap: growth, care, abundance.', ['softWellness', 'organic', 'warmHuman'], ['wellness', 'beauty', 'food']),
    PR('coil', 'Coil', 'geo-spiral', { type: 'archimedean', turns: 3, weight: 6 }, 'An even coil at one weight: focus, depth, a journey inward.', ['japaneseMinimal', 'softWellness', 'scientific'], ['wellness', 'edu', 'ai']),
    PR('striped-globe', 'Striped globe', 'geo-waves', { lines: 7, amp: 0, frame: 'circle', ratio: 0.55 }, 'A disc of parallel lines: a globe, a signal, a horizon.', ['swiss', 'institutional', 'scientific'], ['finance', 'insurance', 'industrial']),
    PR('tide', 'Tide', 'geo-waves', { lines: 6, amp: 5, cycles: 1.5, frame: 'circle', ratio: 0.5 }, 'Wave lines held in a circle: water, sound, flow.', ['organic', 'ecoOptimist', 'softWellness'], ['energy', 'wellness', 'hospitality']),
    PR('rainbow', 'Rainbow arch', 'geo-arcs', { count: 4, ratio: 0.6, variant: 'rainbow', fill: true }, 'Stacked half-rings with flat ends: optimism with 70s warmth.', ['retro', 'kidsJoy', 'friendlyGeo'], ['kids', 'edu', 'food']),
    PR('rank', 'Rank', 'geo-chevrons', { count: 3, slope: 0.62, thick: 10, gap: 5, accent: true }, 'Three chevrons pointing up: progress, rank, ascent.', ['kinetic', 'institutional', 'neofintech'], ['sports', 'finance', 'industrial']),
    PR('iso-cube', 'Iso cube', 'geo-hex', { variant: 'cube', shade: 'two', gap: 2.5 }, 'An isometric cube cut by a Y: building blocks, structure, product.', ['darkprecision', 'architectural', 'bauhaus'], ['devtools', 'saas', 'realestate']),
    PR('link', 'Link', 'geo-rings', { count: 2, layout: 'row', weight: 8, overlap: 0.42, twoTone: true }, 'Two rings honestly interlocked: partnership, connection, integration.', ['friendlyGeo', 'institutional', 'civic'], ['saas', 'insurance', 'nonprofit']),
    PR('sunset-disc', 'Sunset disc', 'geo-bands', { bands: 7, progression: 'sunset', shape: 'disc' }, 'A disc dissolving into widening bands below the horizon: retro sunset, calm.', ['retro', 'y2k', 'organic'], ['hospitality', 'food', 'energy']),
    PR('phases', 'Phases', 'geo-crescent', { variant: 'phases', count: 3 }, 'Crescent to full in three steps: time, progress, routine.', ['japaneseMinimal', 'softWellness', 'scientific'], ['wellness', 'health', 'edu']),
    PR('dawn', 'Dawn', 'sym-sun', { variant: 'rising', rays: 11 }, 'A half sun over a horizon rule: a beginning, energy, optimism.', ['ecoOptimist', 'warmHuman', 'organic'], ['energy', 'food', 'nonprofit']),
    PR('midrib-leaf', 'Midrib leaf', 'sym-leaf', { variant: 'single', angle: -35 }, 'A lens leaf cut by its midrib: natural, fresh, never clip-art.', ['organic', 'ecoOptimist', 'softWellness'], ['food', 'beauty', 'energy']),
    PR('pure-drop', 'Pure drop', 'sym-drop', { variant: 'highlight', tip: 0.9 }, 'A circle and two tangents, with a cut highlight: purity, water, care.', ['clinical', 'softWellness', 'ecoOptimist'], ['health', 'beauty', 'energy']),
    PR('ridge', 'Ridge', 'sym-mountain', { peaks: 2, variant: 'snowcap' }, 'Two peaks separated by a keyline, a snow line cut through: ambition and the outdoors.', ['organic', 'heritage', 'kinetic'], ['sports', 'hospitality', 'food']),
    PR('swiss-arrow', 'Swiss arrow', 'sym-arrow', { variant: 'corner', weight: 10 }, 'A north-east corner arrow at one weight: growth and direction, Swiss and exact.', ['swiss', 'neofintech', 'darkprecision'], ['finance', 'saas', 'professional']),
    PR('asterisk', 'Asterisk', 'sym-spark', { variant: 'asterisk', arms: 6, thick: 9 }, 'Six spokes: an asterisk, a spark, "something extra".', ['brutalist', 'memphis', 'neofintech'], ['media', 'ai', 'retail']),
    PR('trefoil', 'Trefoil knot', 'sym-knot', { knot: '2-3', weight: 7, style: 'line' }, 'One line tied into a trefoil with honest crossings: craft, bond, continuity.', ['heritage', 'handmade', 'quietLux'], ['fashion', 'professional', 'crypto']),
    PR('compass-star', 'Compass star', 'sym-star', { points: 4, inner: 0.3, style: 'faceted' }, 'A four-point star faceted in two tones like a compass rose: guidance, travel.', ['heritage', 'artdeco', 'institutional'], ['hospitality', 'insurance', 'auto']),
    PR('pilot-flame', 'Pilot flame', 'sym-flame', { variant: 'inner', lean: 0.12 }, 'A flame with its inner flame cut out: warmth, passion, energy.', ['warmHuman', 'retro', 'kinetic'], ['energy', 'restaurant', 'sports']),
    PR('club-badge', 'Club badge', 'em-badge', { layout: 'arc', center: 'initial', ring: 'double', bottom: 'dots' }, 'Name on the arc, initial in the centre, double keylines: a club, a craft, a promise.', ['heritage', 'handmade', 'retro'], ['restaurant', 'food', 'sports']),
    PR('scallop-seal', 'Scallop seal', 'em-seal', { edge: 'scallop', teeth: 24, center: 'initial' }, 'A scalloped seal with a cut keyline: approval, quality, provenance.', ['heritage', 'handmade', 'quietLux'], ['food', 'beauty', 'retail']),
    PR('chevron-shield', 'Chevron shield', 'em-shield', { shape: 'heater', content: 'chevron', style: 'solid' }, 'A heater shield with one chevron cut through it: trust and lineage, kept modern.', ['institutional', 'heritage', 'civic'], ['insurance', 'edu', 'professional']),
    PR('target-roundel', 'Target roundel', 'em-roundel', { variant: 'target', rings: 3, initial: true }, 'Concentric discs in alternating colour with the initial cut from the centre.', ['modernist', 'retro', 'kinetic'], ['sports', 'auto', 'media']),
    PR('vesica', 'Vesica', 'line-construct', { variant: 'lens', weight: 3.5, accent: true }, 'Two circles and a line: the vesica construction, overlap made visible.', ['scientific', 'architectural', 'quietLux'], ['professional', 'ai', 'wellness']),
    PR('one-line', 'One line', 'line-continuous', { grid: 3, round: 1, weight: 5.5, seed: 7 }, 'A single unbroken line visiting every point of a grid: continuity, a system, a journey.', ['dynamicSystem', 'darkprecision', 'japaneseMinimal'], ['saas', 'devtools', 'industrial']),
    PR('survey', 'Survey', 'line-contour', { rings: 6, wobble: 0.16, drift: 0.22, seed: 11 }, 'Contour lines drifting toward a summit: terrain, data, depth.', ['organic', 'scientific', 'ecoOptimist'], ['energy', 'realestate', 'ai']),
    PR('tile-seed', 'Tile system', 'gen-grid', { seed: 12, cols: 3, rows: 3, symmetry: 'rotational' }, 'A seeded grid of Bauhaus tiles with rotational symmetry: one system, endless marks.', ['bauhaus', 'dynamicSystem', 'memphis'], ['culture', 'edu', 'saas']),
    PR('truchet-path', 'Meander', 'gen-truchet', { variant: 'arcs', grid: 4, weight: 0.3, seed: 5, frame: 'circle' }, 'Truchet arcs that join into a maze of paths: complexity from two tiles.', ['dynamicSystem', 'riso', 'memphis'], ['gaming', 'media', 'edu']),
    PR('glitch-disc', 'Shifted disc', 'gen-slices', { strips: 7, shift: 8, shape: 'circle', seed: 4, gap: 1.5 }, 'A disc cut into strips that slide: signal, glitch, a system in motion.', ['cyber', 'y2k', 'brutalist'], ['gaming', 'media', 'crypto'])
  ];
})(window.PG);
