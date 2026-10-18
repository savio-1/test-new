/* Artwork engine. Layout recipes are written in proportions of the canvas (like the studio research
   that informs them) and painted to a <canvas>. The same canvas is shown flat on the presentation board
   or warped onto a photo mockup by PG.Composite.

   Recipe: { id, name, by: 'studio whose thinking it borrows', note, kits:[…], draw: async (d) => {} }
   d (drawing kit): w, h, u (min side), t (tokens), c (copy), b (brand), dir
     fill(col) · rect(x,y,w,h,col,{r}) · line(x1,y1,x2,y2,{col,w}) · circle(cx,cy,r,col)
     text(str,x,y,{size,face,weight,col,align,base,max,upper,track,lh,wrap}) → bottom y (fraction)
     photo(role,x,y,w,h,{n}) · logo(x,y,hgt,{kind:'lockup'|'mark'|'word',variant,align}) · pattern(kind,{…})
   All x/y/w/h are fractions of the canvas; sizes are fractions of the canvas width.                    */
window.PG = window.PG || {};

(function () {
  const FALL = () => PG.FALLBACK;
  const famOf = (t, face) => (face === 'body' ? t.body : face === 'mono' ? t.mono : face === 'serif' ? 'Instrument Serif' : face && face.startsWith('font:') ? face.slice(5) : t.display);
  const wOf = (t, face, want) => { const fam = famOf(t, face); return PG.fontWeight(fam, want || (face === 'body' || face === 'mono' ? t.fbw : t.fdw)); };
  const fontCss = (t, face, px, weight, italic) => { const fam = famOf(t, face); return `${italic ? 'italic ' : ''}${weight} ${Math.round(px)}px "${fam}", ${FALL()[(PG.FONTS[fam] || {}).cls || 'sans']}`; };

  /* ---------- SVG → canvas, with live text redrawn in the page's web fonts ---------- */
  const imgCache = new Map();
  const svgImg = (svg) => {
    if (imgCache.has(svg)) return imgCache.get(svg);
    const p = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    imgCache.set(svg, p); return p;
  };
  function parseTransform(s) {
    let m = new DOMMatrix();
    (s || '').replace(/(\w+)\(([^)]*)\)/g, (_, fn, args) => {
      const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
      if (fn === 'translate') m = m.translate(a[0] || 0, a[1] || 0);
      else if (fn === 'scale') m = m.scale(a[0], a[1] == null ? a[0] : a[1]);
      else if (fn === 'rotate') m = a.length > 1 ? m.translate(a[1], a[2]).rotate(a[0]).translate(-a[1], -a[2]) : m.rotate(a[0]);
      else if (fn === 'skewX') m = m.skewX(a[0]);
      else if (fn === 'skewY') m = m.skewY(a[0]);
      else if (fn === 'matrix') m = m.multiply(new DOMMatrix(a));
    });
    return m;
  }
  const inherit = (el, attr) => { for (let n = el; n && n.getAttribute; n = n.parentNode) { const v = n.getAttribute(attr); if (v != null) return v; const st = n.getAttribute('style'); if (st) { const mm = st.match(new RegExp(attr + '\\s*:\\s*([^;]+)')); if (mm) return mm[1].trim(); } } return null; };
  async function drawSvg(g, svg, x, y, w, h) {
    if (!svg) return;
    const doc = new DOMParser().parseFromString(svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'), 'image/svg+xml');
    const root = doc.documentElement;
    const vb = (root.getAttribute('viewBox') || `0 0 ${root.getAttribute('width') || 100} ${root.getAttribute('height') || 100}`).split(/[\s,]+/).map(Number);
    const texts = [];
    root.querySelectorAll('text').forEach((el) => {
      if (el.closest('mask,clipPath,defs,pattern') || el.querySelector('textPath')) return;
      let m = new DOMMatrix();
      const chain = []; for (let n = el; n && n !== root; n = n.parentNode) chain.unshift(n);
      chain.forEach((n) => { if (n.getAttribute && n.getAttribute('transform')) m = m.multiply(parseTransform(n.getAttribute('transform'))); });
      const tspans = el.querySelectorAll('tspan');
      const runs = tspans.length ? Array.from(tspans).map((s) => ({ el: s, str: s.textContent })) : [{ el, str: el.textContent }];
      texts.push({ el, m, runs });
    });
    texts.forEach((tx) => tx.el.remove());
    const im = await svgImg(new XMLSerializer().serializeToString(root));
    if (im) g.drawImage(im, x, y, w, h);
    if (!texts.length) return;
    const sx = w / vb[2], sy = h / vb[3];
    const base = g.globalAlpha;
    for (const tx of texts) {
      g.save();
      g.translate(x - vb[0] * sx, y - vb[1] * sy); g.scale(sx, sy);
      const m = tx.m; g.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      let cx = parseFloat(tx.el.getAttribute('x') || 0), cy = parseFloat(tx.el.getAttribute('y') || 0);
      const anchor = inherit(tx.el, 'text-anchor') || 'start';
      // Measure all runs first so anchoring works for multi-run text.
      const runs = tx.runs.map((r) => {
        const fam = (inherit(r.el, 'font-family') || 'sans-serif').split(',')[0].replace(/['"]/g, '').trim();
        const size = parseFloat(inherit(r.el, 'font-size') || 16), weight = inherit(r.el, 'font-weight') || 400, style = inherit(r.el, 'font-style') || 'normal';
        const font = `${style === 'italic' ? 'italic ' : ''}${weight} ${size}px "${fam}", sans-serif`;
        const ls = parseFloat(inherit(r.el, 'letter-spacing') || 0) || 0;
        g.font = font; const wdt = g.measureText(r.str).width + ls * Math.max(0, r.str.length - 1);
        return { ...r, font, ls, wdt, fill: inherit(r.el, 'fill') || '#000', op: parseFloat(inherit(r.el, 'opacity') || inherit(r.el, 'fill-opacity') || 1), x: r.el.getAttribute('x'), y: r.el.getAttribute('y'), dx: parseFloat(r.el.getAttribute('dx') || 0) };
      });
      const total = runs.reduce((s, r) => s + r.wdt + r.dx, 0);
      if (anchor === 'middle') cx -= total / 2; else if (anchor === 'end') cx -= total;
      for (const r of runs) {
        if (r.x != null && r.el !== tx.el) { cx = parseFloat(r.x); if (anchor === 'middle') cx -= r.wdt / 2; else if (anchor === 'end') cx -= r.wdt; }
        if (r.y != null && r.el !== tx.el) cy = parseFloat(r.y);
        cx += r.dx;
        g.font = r.font; g.fillStyle = r.fill === 'none' ? 'transparent' : r.fill; g.globalAlpha = base * r.op; g.textBaseline = 'alphabetic';
        if ('letterSpacing' in g) { g.letterSpacing = r.ls + 'px'; g.fillText(r.str, cx, cy); g.letterSpacing = '0px'; }
        else { let px = cx; for (const ch of r.str) { g.fillText(ch, px, cy); px += g.measureText(ch).width + r.ls; } }
        cx += r.wdt;
      }
      g.restore();
    }
  }
  PG.drawSvg = drawSvg;

  /* ---------- drawing kit ---------- */
  function kit(g, w, h, ctx) {
    const { t } = ctx, u = Math.min(w, h);
    const X = (f) => f * w, Y = (f) => f * h, S = (f) => f * w;
    const d = {
      g, w, h, u, t, c: ctx.c, b: ctx.b, dir: ctx.dir, kit: ctx.kit,
      fill(col) { g.fillStyle = col; g.fillRect(0, 0, w, h); },
      rect(x, y, rw, rh, col, o) { g.fillStyle = col; if (o && o.r) { g.beginPath(); g.roundRect(X(x), Y(y), X(rw), Y(rh), S(o.r)); g.fill(); } else g.fillRect(X(x), Y(y), X(rw), Y(rh)); },
      stroke(x, y, rw, rh, col, lw) { g.strokeStyle = col; g.lineWidth = Math.max(1, S(lw || 0.002)); g.strokeRect(X(x), Y(y), X(rw), Y(rh)); },
      line(x1, y1, x2, y2, o) { o = o || {}; g.strokeStyle = o.col || t.ink; g.lineWidth = Math.max(1, S(o.w || 0.0015)); g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x2), Y(y2)); g.stroke(); },
      /* Load extra families used by a recipe (face: 'font:Anton'). */
      async font(...names) { await Promise.all(names.map(async (n) => { await PG.loadFont(n); const f = PG.FONTS[n]; await document.fonts.load(`${f ? Math.max(...f.w) : 400} 40px "${n}"`).catch(() => null); })); },
      /* The brand name broken into n roughly equal chunks, for stacked wordmarks. */
      chunks(n, str) { const s = String(str || ctx.b.name).replace(/^the\s+/i, '').replace(/\s+/g, ''); const k = Math.ceil(s.length / n); const out = []; for (let i = 0; i < s.length; i += k) out.push(s.slice(i, i + k)); return out; },
      /* Vertical gradient scrim, e.g. darkening the foot of a photo under white type. */
      shade(x, y, rw, rh, from, to) { const gr = g.createLinearGradient(0, Y(y), 0, Y(y + rh)); gr.addColorStop(0, from); gr.addColorStop(1, to); g.fillStyle = gr; g.fillRect(X(x), Y(y), X(rw), Y(rh)); },
      circle(cx, cy, r, col) { g.fillStyle = col; g.beginPath(); g.arc(X(cx), Y(cy), S(r), 0, Math.PI * 2); g.fill(); },
      /* Text. size is a fraction of canvas width. Returns the y (fraction) under the last line. */
      text(str, x, y, o) {
        o = o || {};
        const face = o.face || 'display', disp = face === 'display';
        let s = String(str == null ? '' : str);
        const upper = o.upper != null ? o.upper : disp ? t.upper : false;
        if (upper) s = s.toUpperCase(); if (o.lower) s = s.toLowerCase();
        const weight = wOf(t, face, o.weight);
        let px = S(o.size || 0.05);
        const track = (o.track != null ? o.track : disp ? t.track : 0);
        const italic = o.italic != null ? o.italic : disp && t.italic;
        const lines = [];
        const measure = (str2) => { g.font = fontCss(t, face, px, weight, italic); return g.measureText(str2).width + Math.max(0, str2.length - 1) * track * px; };
        // fit: scale the type so a single line spans exactly this width (fraction of canvas width).
        if (o.fit && !o.wrap) px *= X(o.fit) / Math.max(1, measure(s));
        if (o.wrap) {
          const maxW = X(o.wrap);
          const words = s.split(' ');
          let line = '';
          for (const wd of words) { const test = line ? line + ' ' + wd : wd; if (measure(test) > maxW && line) { lines.push(line); line = wd; } else line = test; }
          if (line) lines.push(line);
        } else {
          if (o.max) while (measure(s) > X(o.max) && px > 4) px *= 0.95;
          lines.push(s);
        }
        const lh = px * (o.lh || (disp ? 1.02 : 1.4));
        g.fillStyle = o.col || t.ink; g.textBaseline = 'alphabetic';
        let yy = Y(y) + (o.base === 'top' ? px * 0.8 : o.base === 'middle' ? px * 0.35 - (lines.length - 1) * lh / 2 : o.base === 'bottom' ? -(lines.length - 1) * lh : 0);
        for (const ln of lines) {
          const lw = measure(ln);
          let cx = o.align === 'center' ? X(x) - lw / 2 : o.align === 'right' ? X(x) - lw : X(x);
          g.font = fontCss(t, face, px, weight, italic);
          if (!track) g.fillText(ln, cx, yy);
          else if ('letterSpacing' in g) { g.letterSpacing = track * px + 'px'; g.fillText(ln, cx, yy); g.letterSpacing = '0px'; }
          else for (const ch of ln) { g.fillText(ch, cx, yy); cx += g.measureText(ch).width + track * px; }
          yy += lh;
        }
        return (yy - lh + px * 0.3) / h;
      },
      async photo(role, x, y, rw, rh, o) {
        o = o || {};
        const p = ctx.pick(role, o.n || 0);
        if (!p) { d.rect(x, y, rw, rh, t.surface); return; }
        const im = await PG.loadImage(p.file);
        g.save();
        if (o.r) { g.beginPath(); g.roundRect(X(x), Y(y), X(rw), Y(rh), S(o.r)); g.clip(); }
        PG.drawPhoto(g, im, p, Math.round(X(x)), Math.round(Y(y)), Math.round(X(rw)), Math.round(Y(rh)), t, o.grade || ctx.grade);
        g.restore();
      },
      /* Logo at (x, y) with height hgt (fraction of canvas height). */
      async logo(x, y, hgt, o) {
        o = o || {};
        const kind = o.kind || 'lockup', v = o.variant || '';
        const mk = kind !== 'word' ? PG.brandMark(t, ctx.b, 100, v) : '';
        const ws = kind !== 'mark' ? PG.brandWordSvg(t, ctx.b, v) : null;
        // Width per unit of height; the logo shrinks to fit the space it has (o.max, else to the margin).
        const perH = (mk ? 1 : 0) + (mk && ws ? 0.38 : 0) + (ws ? (mk ? 0.72 : 1) * ws.w / ws.h : 0);
        const room = X(o.max || (o.align === 'center' ? 0.88 : o.align === 'right' ? x - 0.05 : 0.95 - x));
        const H = Math.min(Y(hgt), perH ? room / perH : Infinity);
        const markW = mk ? H : 0, gap = mk && ws ? H * 0.38 : 0;
        const wordH = H * (mk ? 0.72 : 1), wordW = ws ? wordH * ws.w / ws.h : 0;
        const total = markW + gap + wordW;
        let lx = o.align === 'center' ? X(x) - total / 2 : o.align === 'right' ? X(x) - total : X(x);
        const top = Y(y) - (o.base === 'bottom' ? H : o.base === 'middle' ? H / 2 : 0);
        if (mk) { await drawSvg(g, mk, lx, top, H, H); lx += H + gap; }
        if (ws) await drawSvg(g, ws.svg, lx, top + (H - wordH) / 2, wordW, wordH);
        else if (kind !== 'mark') d.text(ctx.b.name, lx / w, (top + H * 0.82) / h, { size: H * 0.9 / w, col: v === 'reverse' ? t.onPrimary : v === 'inverse' || v === 'light' ? (v === 'light' ? '#fff' : t.bg) : t.ink });
        return total / w;
      },
      /* Repeat the brand mark as a pattern over a region. */
      async pattern(x, y, rw, rh, o) {
        o = o || {};
        const mk = PG.brandMark(t, ctx.b, 100, o.variant || ''); if (!mk) return;
        const step = S(o.step || 0.12), sz = step * (o.scale || 0.55);
        g.save(); g.beginPath(); g.rect(X(x), Y(y), X(rw), Y(rh)); g.clip(); g.globalAlpha = o.alpha || 1;
        for (let yy = Y(y), r = 0; yy < Y(y + rh) + step; yy += step, r++) for (let xx = X(x) + (r % 2 ? step / 2 : 0) - step; xx < X(x + rw) + step; xx += step) await drawSvg(g, mk, xx, yy, sz, sz);
        g.restore();
      }
    };
    return d;
  }

  /* Fonts used by a layout must be loaded before measuring. */
  async function fontsReady(t) {
    if (!document.fonts) return;
    const faces = [[t.display, t.fdw], [t.body, t.fbw], [t.body, t.fbBold], [t.mono, 400], ['Instrument Serif', 400]];
    await Promise.all(faces.map(([f, wt]) => document.fonts.load(`${wt} 40px "${f}"`).catch(() => null)));
    if (PG.ensureLogoFonts) { const p = PG.ensureLogoFonts(t, PG.brandFor(PG.App ? PG.App.S.brief : {})); if (p) await p.catch(() => null); }
  }

  const cache = new Map();
  PG.Artwork = {
    LAYOUTS: {},
    /* Paint one artwork. role: poster, billboard, card-front… layout: recipe id (optional). */
    async paint(role, w, h, ctx, layoutId) {
      const list = PG.Artwork.LAYOUTS[role] || PG.Artwork.LAYOUTS.poster;
      const rec = (layoutId && list.find((l) => l.id === layoutId)) || PG.Artwork.pick(role, ctx.dir.id);
      const key = [role, rec.id, w, h, ctx.key].join('|');
      if (cache.has(key)) return cache.get(key);
      const job = (async () => {
        await fontsReady(ctx.t);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d');
        await rec.draw(kit(g, w, h, ctx));
        cv.layout = rec;
        return cv;
      })();
      cache.set(key, job);
      if (cache.size > 120) cache.delete(cache.keys().next().value);
      return job;
    },
    /* Default recipe for a role and direction: the first recipe whose kits include the direction's kit. */
    pick(role, dirId) {
      const list = PG.Artwork.LAYOUTS[role] || PG.Artwork.LAYOUTS.poster;
      const k = PG.kitOf(dirId);
      return list.find((l) => (l.dirs || []).includes(dirId)) || list.find((l) => (l.kits || []).includes(k)) || list[0];
    },
    add(role, recipes) { (PG.Artwork.LAYOUTS[role] = PG.Artwork.LAYOUTS[role] || []).push(...recipes); },
    ROLE_SIZE: {
      poster: [1240, 1754], billboard: [2400, 800], sign: [1600, 600], flag: [900, 1400], 'card-front': [1050, 600], 'card-back': [1050, 600], letterhead: [1240, 1754],
      cover: [1240, 1754], spread: [2400, 1600], 'box-front': [1200, 1200], 'box-side': [600, 1200], label: [1200, 900], wrap: [2400, 1000], tote: [1100, 1300], bag: [1100, 1300],
      tee: [1000, 1000], cap: [800, 400], 'screen-phone': [1179, 2556], 'screen-laptop': [2560, 1600], 'screen-tablet': [2048, 1536], 'id-card': [640, 1010], vehicle: [2400, 900], wall: [2400, 1350],
      website: [1440, 900], social: [1080, 1350], story: [1080, 1920], deck: [1920, 1080]
    }
  };
})();
