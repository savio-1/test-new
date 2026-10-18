/* Studio recipes: layouts translated from how named studios design and present their work
   (research/studios/*.md). Each recipe keeps the studio's proportions and logic but takes colour,
   type, logo and photography from the route, so the same layout works for any brand.
   `by` credits the studio; `dirs` lists the directions it becomes the default for. */
(function () {
  const A = PG.Artwork;
  const web = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
  const hs = (d, f) => f * d.h / d.w;                    // a height fraction expressed as a type size
  const lum = (hex) => { let h = String(hex).replace('#', ''); if (h.length < 6) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; };
  const on = (d, bg) => (lum(bg) > 0.55 ? d.t.ink === bg ? '#000' : (lum(d.t.ink) < 0.5 ? d.t.ink : '#111') : '#fff');
  const loud = (d) => (lum(d.t.accent) > 0.45 && d.t.accent !== d.t.bg ? d.t.accent : d.t.secondary);   // an acid accent where the palette has one
  const deep = (d) => [d.t.primary, d.t.ink, d.t.secondary].sort((a, b) => lum(a) - lum(b))[0];
  const add = (role, by, list) => A.add(role, list.map((r) => Object.assign({ by }, r)));

  /* ======================= All Purpose (London) ======================= */
  const AP = ['brutalist', 'maximal', 'kinetic', 'riso', 'y2k', 'cyber'];
  add('poster', 'All Purpose', [{
    id: 'ap-hanging', name: 'Hanging wordmark', dirs: AP,
    note: 'Name stacked in three lines that hang from the top edge, in one acid colour over an untouched documentary photo.',
    async draw(d) {
      await d.photo('hero', 0, 0, 1, 1, { n: 21 });
      const col = loud(d), parts = d.chunks(3);
      let y = 0.03;
      for (const p of parts) { const b = d.text(p, 0.06, y, { fit: 0.88, base: 'top', upper: true, col, lh: 0.82, track: -0.03 }); y = b + 0.005; }
      const [title, , when] = d.c.poster;
      d.text(when, 0.04, 0.965, { size: 0.016, face: 'body', weight: 700, col });
      d.text(title, 0.96, 0.965, { size: 0.016, face: 'body', weight: 700, col, align: 'right' });
    }
  }]);
  add('billboard', 'All Purpose', [{
    id: 'ap-fluoro', name: 'Fluoro overprint', dirs: AP,
    note: 'Deep ground, a blurred colour halo, the line set huge in the accent with a hard outline.',
    async draw(d) {
      const g = d.g, bg = deep(d); d.fill(bg);
      const gr = g.createRadialGradient(d.w * 0.5, d.h * 0.5, 0, d.w * 0.5, d.h * 0.5, d.w * 0.32);
      gr.addColorStop(0, d.t.secondary); gr.addColorStop(0.55, d.t.primary === bg ? d.t.accent : d.t.primary); gr.addColorStop(1, bg);
      g.fillStyle = gr; g.filter = `blur(${Math.round(d.w * 0.02)}px)`; g.fillRect(0, 0, d.w, d.h); g.filter = 'none';
      const col = loud(d);
      g.save(); g.lineWidth = d.w * 0.003; g.strokeStyle = '#000'; g.lineJoin = 'round';
      const words = d.c.billboard.split(' ');
      const half = Math.ceil(words.length / 2), lines = [words.slice(0, half).join(' '), words.slice(half).join(' ')].filter(Boolean);
      let y = 0.18;
      for (const ln of lines) y = d.text(ln, 0.5, y, { fit: 0.7, align: 'center', base: 'top', col, upper: true, lh: 0.9 }) + 0.02;
      g.restore();
      d.text(d.c.poster[2], 0.02, 0.95, { size: 0.0085, face: 'body', weight: 700, col: '#fff' });
      await d.logo(0.98, 0.95, 0.06, { align: 'right', base: 'bottom', variant: 'light' });
    }
  }]);
  const apIndex = async (d) => {
    d.fill('#fff');
    d.text('Projects   Information', 0.012, 0.045, { size: 0.0105, face: 'body', weight: 800, col: '#000', upper: true });
    await d.logo(0.5, 0.025, 0.035, { align: 'center', kind: 'word' });
    d.text(d.c.nav.join(', '), 0.5, 0.12, { size: 0.0115, face: 'body', col: '#BDBDBD', align: 'center' });
    const xs = [0.01, 0.66, 0.07, 0.36];
    for (let i = 0; i < 4; i++) {
      const x = xs[i], y = 0.2 + i * 0.36, w = 0.3, h = w * 1.25 * d.w / d.h;
      if (y > 1) break;
      await d.photo(i % 2 ? 'product' : 'hero', x, y, w, h, { n: 30 + i });
      d.text(d.c.features[i % 3][0], x, y + h + 0.025, { size: 0.0075, face: 'body', weight: 700, col: '#000' });
    }
  };
  add('website', 'All Purpose', [{ id: 'ap-index', name: 'Scattered index', dirs: ['riso', 'kinetic'], note: 'Tiles a third wide on asymmetric x-stops with tiny captions; whitespace is the point.', draw: apIndex }]);
  add('spread', 'All Purpose', [{
    id: 'ap-mosaic', name: 'Case mosaic', dirs: AP,
    note: 'Hero in situ, one intro sentence in black weight, then a gutterless strip of crops.',
    async draw(d) {
      d.fill('#fff');
      await d.photo('place', 0, 0, 1, 0.56, { n: 40 });
      d.text(d.c.sub, 0.012, 0.6, { size: 0.021, face: 'body', weight: 800, col: '#000', wrap: 0.46, lh: 1.1, base: 'top' });
      const tiles = 4, tw = 1 / tiles, th = tw * d.w / d.h * 0.62;
      for (let i = 0; i < tiles; i++) {
        if (i === 1) { d.rect(i * tw, 1 - th, tw, th, loud(d)); await d.logo(i * tw + tw / 2, 1 - th / 2, th * 0.3, { kind: 'mark', align: 'center', base: 'middle' }); }
        else await d.photo(i % 2 ? 'detail' : 'people', i * tw, 1 - th, tw, th, { n: 41 + i });
      }
    }
  }]);

  /* ======================= Mother Design (New York) ======================= */
  const MO = ['modernist', 'dynamicSystem', 'institutional', 'ecoOptimist', 'civic'];
  add('website', 'Mother Design', [{
    id: 'mo-ruled', name: 'Ruled values grid', dirs: ['modernist', 'institutional', 'civic'],
    note: 'Twelve columns, no gutters, full-width hairlines; a statement then a 2×2 block of one-word values.',
    async draw(d) {
      const ink = d.t.ink; d.fill(d.t.bg);
      const m = 0.011;
      let x = m; for (const n of d.c.nav.slice(0, 3)) { d.stroke(x, 0.03, 0.075, 0.045, ink, 0.0007); d.text(n, x + 0.0375, 0.06, { size: 0.008, face: 'body', align: 'center' }); x += 0.08; }
      await d.logo(1 - m, 0.03, 0.045, { align: 'right' });
      d.line(0, 0.11, 1, 0.11, { col: ink, w: 0.0007 });
      d.text(d.c.headline + ' ' + d.c.sub, m, 0.14, { size: 0.033, wrap: 0.95, lh: 1.1, track: -0.04, base: 'top', upper: false });
      const top = 0.5; d.line(0, top, 1, top, { col: ink, w: 0.0007 }); d.line(0.5, top, 0.5, 1, { col: ink, w: 0.0007 }); d.line(0, 0.75, 1, 0.75, { col: ink, w: 0.0007 });
      d.c.features.concat([[d.c.cta2 || d.c.cta]]).slice(0, 4).forEach(([word], i) => {
        const cx = (i % 2) * 0.5, cy = top + Math.floor(i / 2) * 0.25;
        d.text(String(i + 1).padStart(2, '0'), cx + m, cy + 0.03, { size: 0.007, face: 'mono' });
        d.text(word.split(' ')[0], cx + 0.25, cy + 0.125, { size: 0.045, align: 'center', base: 'middle', max: 0.44 });
      });
    }
  }]);
  add('social', 'Mother Design', [{
    id: 'mo-field', name: 'Colour field wordmark', dirs: MO,
    note: 'The whole frame in the hero colour, the wordmark in off-white, a serif line beneath. Nothing else.',
    async draw(d) {
      d.fill(d.t.primary);
      await d.logo(0.5, 0.47, 0.12, { kind: 'word', align: 'center', base: 'bottom', variant: 'reverse', max: 0.62 });
      d.text(d.c.tagline, 0.5, 0.56, { size: 0.036, face: 'serif', align: 'center', col: d.t.onPrimary, upper: false, italic: true, max: 0.8 });
    }
  }]);
  add('poster', 'Mother Design', [{
    id: 'mo-crop', name: 'Cropped monumental wordmark', dirs: MO,
    note: 'A material photograph, darkened; the name broken into three lines so wide it bleeds off both sides.',
    async draw(d) {
      await d.photo('texture', 0, 0, 1, 1, { n: 50 });
      d.rect(0, 0, 1, 1, 'rgba(0,0,0,.3)');
      const g = d.g; g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.9;
      let y = 0.1; for (const p of d.chunks(3)) y = d.text(p, -0.1, y, { fit: 1.2, base: 'top', col: d.t.primary === '#000000' ? '#fff' : d.t.bg, upper: true, lh: 0.84, weight: 900 }) + 0.01;
      g.restore();
      d.text(d.c.poster[1] + ' — ' + d.c.poster[2], 0.04, 0.965, { size: 0.012, face: 'mono', col: '#fff' });
    }
  }]);
  add('spread', 'Mother Design', [{
    id: 'mo-label', name: 'Label / text case page', dirs: ['modernist', 'dynamicSystem'],
    note: 'Label column at the left, values at a quarter, a body block, then an image pair aligned on their bottoms.',
    async draw(d) {
      d.fill(d.t.bg); const ink = d.t.ink;
      d.line(0.01, 0.06, 0.99, 0.06, { col: ink, w: 0.0006 });
      d.text('What we did', 0.01, 0.1, { size: 0.009, face: 'body', weight: 700 }); d.text('Strategy, identity, packaging, digital', 0.25, 0.1, { size: 0.009, face: 'body' });
      d.text(d.c.sub + ' ' + d.c.features.map((f) => f[1]).join(' '), 0.25, 0.16, { size: 0.011, face: 'body', wrap: 0.35, lh: 1.5, base: 'top' });
      await d.photo('hero', 0.01, 0.42, 0.59, 0.5, { n: 51 });
      await d.photo('detail', 0.67, 0.42 + 0.5 - 0.5 * 1.25 * 0.32 / 0.59 * 1.6, 0.32, 0.5 * 1.25 * 0.32 / 0.59 * 1.6, { n: 52 });
      d.text(d.c.features[0][0] + ' — ' + d.c.features[0][1], 0.01, 0.955, { size: 0.0075, face: 'body', col: d.t.muted });
    }
  }]);

  /* ======================= NOT W+K (London) ======================= */
  const NOT = ['memphis', 'kidsJoy', 'retro', 'gradient', 'y2k'];
  add('poster', 'NOT W+K', [{
    id: 'not-wall', name: 'Repetition wall', dirs: NOT,
    note: 'One short phrase repeated edge to edge until it becomes texture, broken by a split colour band.',
    async draw(d) {
      d.fill(d.t.bg); const phrase = d.c.billboard.replace(/[.!]$/, '').toUpperCase() + ' ';
      const sz = hs(d, 0.09), rows = Math.ceil(1 / 0.09) + 1;
      for (let r = 0; r < rows; r++) d.text(phrase.repeat(6), -0.3 * (r % 4) / 1.3, r * 0.09 + 0.08, { size: sz, upper: true, col: d.t.ink, track: -0.02, weight: 900 });
      const bt = 0.33, bh = 0.34;
      d.rect(0, bt, 0.5, bh, d.t.primary); d.rect(0.5, bt, 0.5, bh, d.t.secondary);
      const halves = d.c.poster[0].split(' '), mid = Math.ceil(halves.length / 2);
      d.text(halves.slice(0, mid).join(' ') || d.c.poster[0], 0.25, bt + bh / 2, { fit: 0.4, align: 'center', base: 'middle', col: loud(d), upper: true });
      d.text(halves.slice(mid).join(' ') || d.c.poster[2], 0.75, bt + bh / 2, { fit: 0.4, align: 'center', base: 'middle', col: loud(d), upper: true });
    }
  }]);
  add('social', 'NOT W+K', [{
    id: 'not-hands', name: 'One logo, many hands', dirs: NOT,
    note: 'The same name re-made in twelve different hands and faces on a cream sheet.',
    async draw(d) {
      const faces = ['Shrikhand', 'Caveat', 'Rubik Mono One', 'Limelight', 'Anton', 'Pinyon Script', 'Bodoni Moda', 'Unbounded', 'Josefin Slab', 'Baloo 2', 'Michroma', 'Gloock'];
      await d.font(...faces);
      d.fill('#F3EFE3');
      d.text('One logo, many hands', 0.04, 0.06, { size: 0.03, face: 'body', col: '#111', weight: 300 });
      const m = 0.04, gap = 0.02, cw = (1 - 2 * m - 2 * gap) / 3, ch = cw * d.w / d.h;
      const cols = [d.t.primary, d.t.secondary, d.t.accent, '#fff'];
      faces.forEach((f, i) => {
        const x = m + (i % 3) * (cw + gap), y = 0.1 + Math.floor(i / 3) * (ch + 0.012);
        const bg = cols[i % 4]; d.rect(x, y, cw, ch * 0.9, bg);
        d.text(d.b.name, x + cw / 2, y + ch * 0.45, { face: 'font:' + f, fit: cw * 0.72, align: 'center', base: 'middle', col: on(d, bg), upper: false, track: 0 });
      });
    }
  }]);
  add('website', 'NOT W+K', [{
    id: 'not-gradient', name: 'Gradient stage', dirs: ['gradient', 'y2k', 'memphis'],
    note: 'A pastel gradient ground, one centred square stage holding the mark, a row of chips below.',
    async draw(d) {
      const g = d.g, gr = g.createLinearGradient(0, 0, 0, d.h);
      gr.addColorStop(0, d.t.secondary); gr.addColorStop(0.4, d.t.accent); gr.addColorStop(0.62, d.t.primary); gr.addColorStop(1, '#DCDCDC'); g.fillStyle = gr; g.fillRect(0, 0, d.w, d.h);
      await d.logo(0.02, 0.04, 0.035, { kind: 'word' });
      d.text(d.c.nav.join('    '), 0.98, 0.065, { size: 0.0095, face: 'mono', align: 'right' });
      const s = 0.37, sx = 0.5 - s / 2, sy = 0.14, sh = s * d.w / d.h;
      d.rect(sx, sy, s, sh, 'rgba(255,255,255,.35)', { r: 0.004 }); d.stroke(sx, sy, s, sh, '#666', 0.0006);
      await d.logo(0.5, sy + sh / 2, sh * 0.45, { kind: 'mark', align: 'center', base: 'middle' });
      for (let i = 0; i < 18; i++) await d.logo(0.5 - 9 * 0.024 + i * 0.024 + 0.006, sy + sh + 0.06, 0.022, { kind: 'mark' });
      d.rect(0, 0.95, 0.5, 0.05, '#111'); d.rect(0.5, 0.95, 0.5, 0.05, d.t.bg);
      d.text(d.c.cta.toUpperCase(), 0.25, 0.977, { size: 0.0085, face: 'mono', col: '#fff', align: 'center', base: 'middle' });
      d.text(d.c.tagline.toUpperCase(), 0.75, 0.977, { size: 0.0085, face: 'mono', col: d.t.ink, align: 'center', base: 'middle', max: 0.46 });
    }
  }]);

  /* ======================= Stockholm Design Lab ======================= */
  const SDL = ['swiss', 'scientific', 'architectural', 'darkprecision', 'clinical'];
  add('spread', 'Stockholm Design Lab', [{
    id: 'sdl-opener', name: 'Name / tagline opener', dirs: SDL,
    note: 'Photo over the top half; client name at the left margin, tagline at the centre line, two narrow body columns. Regular weight only.',
    async draw(d) {
      d.fill('#fff');
      await d.photo('product', 0, 0, 1, 0.56, { n: 60, grade: 'mono' });
      d.text(d.b.name, 0.02, 0.62, { size: 0.015, face: 'body', col: '#000', weight: 400 });
      d.text(d.c.headline, 0.5, 0.62, { size: 0.016, face: 'body', col: '#000', wrap: 0.45, weight: 400, lh: 1.3 });
      d.text(d.c.sub, 0.5, 0.72, { size: 0.007, face: 'body', col: '#000', wrap: 0.21, lh: 1.45 });
      d.text(d.c.features.map((f) => f.join(': ')).join(' '), 0.735, 0.72, { size: 0.007, face: 'body', col: '#000', wrap: 0.21, lh: 1.45 });
    }
  }]);
  add('deck', 'Stockholm Design Lab', [{
    id: 'sdl-spec', name: 'Hairline spec sheet', dirs: SDL.concat(['modernist', 'institutional']),
    note: 'Five ruled rows: symbol, wordmark, typography, colour, marking. A product photograph opposite.',
    async draw(d) {
      d.fill('#fff'); const x0 = 0.04, x1 = 0.48, top = 0.08, rh = 0.168;
      const labels = ['Symbol', 'Wordmark', 'Typography', 'Colour', 'Marking'];
      for (let i = 0; i < 5; i++) {
        const y = top + i * rh; d.line(x0, y, x1, y, { col: '#000', w: 0.0005 });
        d.text(labels[i], x0, y + 0.03, { size: 0.0062, face: 'body', col: '#777' });
        const cx = 0.14, cy = y + rh / 2;
        if (i === 0) await d.logo(cx, cy, rh * 0.6, { kind: 'mark', base: 'middle' });
        if (i === 1) await d.logo(cx, cy, rh * 0.32, { kind: 'word', base: 'middle', max: 0.32 });
        if (i === 2) { d.text('Aa Bb Cc 0123', cx, cy - 0.01, { size: 0.02 }); d.text(d.t.display + ' / ' + d.t.body, cx, cy + 0.045, { size: 0.0065, face: 'body', col: '#777' }); }
        if (i === 3) [d.t.ink, d.t.muted, d.t.surface, d.t.bg, d.t.secondary, d.t.primary].forEach((c, k) => { d.rect(cx + k * 0.05, cy - 0.04, 0.042, 0.08, c); d.stroke(cx + k * 0.05, cy - 0.04, 0.042, 0.08, '#00000022', 0.0004); });
        if (i === 4) { d.text(d.c.product.name, cx, cy - 0.005, { size: 0.012, face: 'body', weight: 700 }); d.text('1 size, 1–2 lines', cx, cy + 0.035, { size: 0.0065, face: 'body', col: '#777' }); }
      }
      d.line(x0, top + 5 * rh, x1, top + 5 * rh, { col: '#000', w: 0.0005 });
      await d.photo('product', 0.52, top, 0.44, 5 * rh, { n: 61 });
    }
  }]);
  add('poster', 'Stockholm Design Lab', [{
    id: 'sdl-place', name: 'Place-name landscape', dirs: ['scientific', 'architectural', 'swiss', 'ecoOptimist'],
    note: 'A cool, quiet landscape; brand, place and country stacked and centred. No other elements.',
    async draw(d) {
      await d.photo('place', 0, 0, 1, 1, { n: 62, grade: 'cool' });
      const lines = [d.b.name, d.c.poster[2].split('·').pop().trim(), d.c.poster[1]];
      let y = 0.38; for (const l of lines) y = d.text(l, 0.5, y, { size: hs(d, 0.055), align: 'center', base: 'top', col: 'rgba(255,255,255,.92)', upper: true, track: 0.02, lh: 1.05, max: 0.86 }) + 0.012;
    }
  }]);
  add('billboard', 'Stockholm Design Lab', [{
    id: 'sdl-panel', name: 'Landscape + white panel', dirs: SDL,
    note: 'A wide landscape with one small white panel bottom right: wordmark and two lines of tiny caps.',
    async draw(d) {
      await d.photo('place', 0, 0, 1, 1, { n: 63, grade: 'cool' });
      d.rect(0.68, 0.56, 0.3, 0.38, '#fff');
      await d.logo(0.7, 0.62, 0.09, { max: 0.26 });
      d.text(d.c.billboard.toUpperCase(), 0.7, 0.82, { size: 0.0072, face: 'body', col: '#000', track: 0.08 });
      d.text(web(d.b.name).toUpperCase(), 0.7, 0.88, { size: 0.0072, face: 'body', col: '#777', track: 0.08 });
    }
  }]);
  add('social', 'Stockholm Design Lab', [{
    id: 'sdl-specimen', name: 'Specimen card', dirs: ['swiss', 'scientific', 'clinical'],
    note: 'One letterform at specimen scale with faint baseline and cap-height guides on a warm grey card.',
    async draw(d) {
      d.fill(d.t.surface === d.t.bg ? '#E7E3DE' : d.t.surface);
      const base = 0.62, cap = 0.33;
      [base, base - cap * 0.72, base - cap].forEach((y) => d.line(0.06, y, 0.94, y, { col: 'rgba(0,0,0,.18)', w: 0.0012 }));
      d.text('Aa', 0.5, base, { size: hs(d, cap) * 1.38, align: 'center', upper: false, col: d.t.ink });
      d.text(d.t.display, 0.06, 0.07, { size: 0.022, face: 'body', col: d.t.ink });
      d.text(d.c.tagline, 0.06, 0.9, { size: 0.022, face: 'body', col: d.t.muted, wrap: 0.6 });
    }
  }]);

  /* ======================= A Friend of Mine (Melbourne) ======================= */
  const AFOM = ['friendlyGeo', 'retro', 'kidsJoy', 'memphis', 'ecoOptimist'];
  add('poster', 'A Friend of Mine', [{
    id: 'afom-condensed', name: 'Full-width condensed', dirs: AFOM,
    note: 'Meta row, one playful photograph, then the name in condensed caps justified exactly to the margins.',
    async draw(d) {
      await d.font('Anton');
      d.fill('#FAFAFA'); const m = 0.06;
      d.text(web(d.b.name), m, 0.035, { size: 0.016, face: 'body', col: '#111' });
      d.text(d.c.poster[1], 1 - m, 0.035, { size: 0.016, face: 'body', col: '#111', align: 'right' });
      d.text(d.c.poster[2], 1 - m, 0.052, { size: 0.016, face: 'body', col: '#111', align: 'right' });
      await d.photo('product', m, 0.08, 1 - 2 * m, 0.64, { n: 70 });
      d.text(d.b.name, m, 0.96, { face: 'font:Anton', fit: 1 - 2 * m, upper: true, col: d.t.primary === '#FAFAFA' ? '#111' : d.t.primary, track: -0.01 });
    }
  }]);
  add('social', 'A Friend of Mine', [{
    id: 'afom-block', name: 'Colour-block portrait', dirs: AFOM,
    note: 'A portrait against a flat complementary backdrop, the name in condensed caps across the top.',
    async draw(d) {
      await d.font('Anton');
      d.fill(d.t.secondary);
      await d.photo('people', 0.12, 0.2, 0.76, 0.8, { n: 71 });
      d.g.save(); d.g.globalCompositeOperation = 'multiply'; d.rect(0.12, 0.2, 0.76, 0.8, d.t.secondary); d.g.restore();
      d.text(d.b.name, 0.5, 0.04, { face: 'font:Anton', fit: 0.6, align: 'center', base: 'top', upper: true, col: loud(d) === d.t.secondary ? d.t.primary : loud(d) });
    }
  }]);
  add('spread', 'A Friend of Mine', [{
    id: 'afom-mosaic', name: 'Type / photo mosaic', dirs: AFOM,
    note: 'Six by four squares, no gutters; four in ten are flat colour with one condensed word.',
    async draw(d) {
      await d.font('Anton');
      const cols = 6, rows = 4, cw = 1 / cols, ch = 1 / rows;
      const words = [d.b.name, ...d.c.features.map((f) => f[0].split(' ')[0]), d.c.cta.split(' ')[0], 'Hello'];
      const pal = [d.t.primary, d.t.secondary, d.t.accent, d.t.ink];
      let w = 0, n = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const type = (r * 7 + c * 3) % 5 < 2;
        if (type) { const bg = pal[(r + c) % 4]; d.rect(c * cw, r * ch, cw, ch, bg); d.text(words[w++ % words.length], c * cw + cw / 2, r * ch + ch / 2, { face: 'font:Anton', fit: cw * 0.85, align: 'center', base: 'middle', upper: true, col: on(d, bg) }); }
        else await d.photo(n % 2 ? 'people' : 'detail', c * cw, r * ch, cw, ch, { n: 72 + n++ });
      }
    }
  }]);

  /* ======================= .Oddity (Hong Kong) ======================= */
  const OD = ['japaneseMinimal', 'quietLux', 'architectural', 'softWellness'];
  const dotless = (s) => s.replace(/i/g, 'ı');
  add('website', '.Oddity', [{
    id: 'od-index', name: 'Stepped poetic index', dirs: OD,
    note: 'Corner furniture, then a list of poetic one-liners each snapped to one of five tab stops. No images.',
    async draw(d) {
      d.fill('#fff');
      d.text(d.c.nav.join('  '), 0.012, 0.03, { size: 0.007, face: 'body', col: '#000' });
      d.text('hello@' + web(d.b.name), 0.988, 0.03, { size: 0.007, face: 'body', col: '#000', align: 'right' });
      const stops = [0.01, 0.18, 0.33, 0.46, 0.52];
      const lines = [d.c.headline, d.c.tagline, d.c.social, d.c.story, d.c.billboard, d.c.webinar, ...d.c.features.map((f) => f[1]), d.c.sub.split(',')[0]];
      lines.slice(0, 10).forEach((l, i) => d.text(dotless(l.toLowerCase()), stops[(i * 3 + 1) % 5], 0.14 + i * 0.075, { size: 0.03, face: 'body', weight: 300, col: '#000', max: 0.47 }));
      d.text('.' + d.b.name, 0.012, 0.975, { size: 0.011, face: 'body', weight: 700, col: '#000' });
      d.text('Studio', 0.988, 0.975, { size: 0.011, face: 'body', weight: 700, col: '#000', align: 'right' });
    }
  }]);
  add('poster', '.Oddity', [{
    id: 'od-mirror', name: 'Mirror sequence', dirs: OD,
    note: 'The wordmark in five states — normal, half-mirrored, inverted, turned, mirrored — on pale grey.',
    async draw(d) {
      d.fill('#EEEEEE'); const g = d.g;
      const states = [[1, 1, 0], [1, -1, 0], [1, 1, 1], [-1, -1, 0], [-1, 1, 0]];
      const wW = 0.46, step = 0.17;
      for (let i = 0; i < 5; i++) {
        const cy = 0.12 + i * step, [sx, sy, inv] = states[i];
        g.save(); g.translate(d.w / 2, cy * d.h); g.scale(sx, sy); g.translate(-d.w / 2, -cy * d.h);
        if (inv) { d.rect(0.5 - wW / 2 - 0.02, cy - 0.04, wW + 0.04, 0.08, '#000'); }
        await d.logo(0.5, cy, 0.055, { kind: 'word', align: 'center', base: 'middle', max: wW, variant: inv ? 'light' : '' });
        g.restore();
        if (i < 4) d.line(0.5, cy + 0.05, 0.5, cy + step - 0.05, { col: '#000', w: 0.0012 });
      }
      d.text(d.c.product.name, 0.5, 0.97, { size: 0.012, face: 'body', align: 'center', col: '#000' });
    }
  }]);
  add('label', '.Oddity', [{
    id: 'od-labsheet', name: 'Lab-sheet label', dirs: OD.concat(['clinical']),
    note: 'A white label set like a specimen sheet: four small blocks of left-aligned text, generous spacing.',
    async draw(d) {
      d.fill('#fff'); const x = 0.08;
      await d.logo(x, 0.1, 0.07, { kind: 'word' });
      const blocks = [['Name', d.c.product.name], ['Claim', d.c.product.claim], ['Contents', d.c.product.detail], ['Maker', d.b.name + ', ' + d.c.poster[2].split('·').pop().trim()]];
      blocks.forEach(([k, v], i) => { const y = 0.36 + i * 0.14; d.text(k.toUpperCase(), x, y, { size: 0.016, face: 'mono', col: '#888' }); d.text(v, 0.34, y, { size: 0.022, face: 'body', col: '#000', max: 0.6 }); d.line(x, y + 0.04, 0.92, y + 0.04, { col: '#000', w: 0.0008 }); });
    }
  }]);

  /* ======================= Bedow (Stockholm) ======================= */
  const BD = ['softWellness', 'organic', 'neofintech', 'ecoOptimist', 'friendlyGeo'];
  add('label', 'Bedow', [{
    id: 'bd-stripes', name: 'Stripe-coded label', dirs: BD,
    note: 'Name strip at the top; below, one stripe per ingredient, its height in proportion to its share, stepped like a bar chart.',
    async draw(d) {
      d.fill('#fff');
      await d.logo(0.06, 0.06, 0.07, { kind: 'word' });
      d.text(d.c.product.name, 0.06, 0.19, { size: 0.03, face: 'body', weight: 700, col: '#000' });
      d.text(d.c.product.detail, 0.94, 0.19, { size: 0.02, face: 'body', col: '#000', align: 'right' });
      const parts = [45, 25, 15, 10, 5], cols = [d.t.primary, d.t.secondary, d.t.accent, d.t.muted, d.t.ink];
      let y = 0.24;
      parts.forEach((p, i) => { const h = 0.76 * p / 100, x = i * 0.06; d.rect(x, y, 1 - x, h, cols[i]); d.text(p + '%', 0.96, y + h / 2, { size: 0.018, face: 'mono', col: on(d, cols[i]), align: 'right', base: 'middle' }); y += h; });
    }
  }]);
  add('box-front', 'Bedow', [{
    id: 'bd-plate', name: 'Superellipse plate', dirs: BD,
    note: 'Flat category colour with a faint pattern; one white superellipse plate carries the product name in heavy caps.',
    async draw(d) {
      d.fill(d.t.primary);
      await d.pattern(0, 0, 1, 1, { step: 0.22, scale: 0.7, variant: 'reverse', alpha: 0.15 });
      const g = d.g, cx = d.w / 2, cy = d.h * 0.55, rx = d.w * 0.31, ry = d.h * 0.27;
      g.beginPath(); for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.02) { const c = Math.cos(a), s = Math.sin(a); const x = cx + rx * Math.sign(c) * Math.abs(c) ** 0.5, y = cy + ry * Math.sign(s) * Math.abs(s) ** 0.5; a === 0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.closePath(); g.fillStyle = '#fff'; g.fill();
      await d.logo(0.5, 0.36, 0.045, { align: 'center', kind: 'word' });
      const words = d.c.product.name.split(' ');
      let y = 0.47; for (const wd of words) y = d.text(wd, 0.5, y, { size: hs(d, 0.09), align: 'center', base: 'top', upper: true, weight: 900, col: '#111', max: 0.5 }) + 0.01;
      d.text(d.c.product.detail, 0.5, 0.74, { size: 0.02, face: 'body', align: 'center', col: '#111' });
    }
  }]);
  add('deck', 'Bedow', [{
    id: 'bd-band', name: 'Insight / concept / solution', dirs: BD.concat(['warmHuman', 'civic']),
    note: 'One colour, four columns: three numbered thoughts and a small hand-drawn arrow. Everything else is space.',
    async draw(d) {
      const bg = d.t.primary, fg = d.t.onPrimary; d.fill(bg);
      const heads = ['Insight', 'Concept', 'Solution'], bodies = [d.c.sub, d.c.headline + ' ' + d.c.tagline, d.c.features.map((f) => f.join(': ')).join('. ')];
      heads.forEach((h, i) => { const x = 0.02 + i * 0.24; d.text(`0${i + 1}   ${h}`, x, 0.3, { size: 0.0075, face: 'body', col: fg, weight: 700 }); d.text(bodies[i], x, 0.34, { size: 0.0085, face: 'body', col: fg, wrap: 0.2, lh: 1.45, base: 'top' }); });
      const g = d.g; g.save(); g.strokeStyle = fg; g.lineWidth = Math.max(1, d.w * 0.0009); g.beginPath();
      const ox = d.w * 0.76, oy = d.h * 0.3; for (let tt = 0; tt <= 1; tt += 0.01) { const x = ox + tt * d.w * 0.12 + Math.cos(tt * Math.PI * 6) * d.w * 0.012, y = oy + Math.sin(tt * Math.PI * 6) * d.h * 0.03; tt === 0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); g.restore();
      d.text(d.c.cta + ' →', 0.74, 0.9, { size: 0.0085, face: 'body', col: fg });
      await d.logo(0.02, 0.06, 0.04, { variant: 'reverse' });
    }
  }]);

  /* ======================= Perky Bros (Nashville) ======================= */
  const PB = ['heritage', 'organic', 'warmHuman', 'handmade'];
  add('website', 'Perky Bros', [{
    id: 'pb-indent', name: 'Indented serif case page', dirs: PB,
    note: 'The page takes the project colour; a serif intro whose first line is indented; photographs stacked opposite.',
    async draw(d) {
      const bg = d.t.secondary, fg = on(d, bg); d.fill(bg);
      d.text(d.b.name.toUpperCase(), 0.008, 0.035, { size: 0.0075, face: 'body', col: fg, weight: 700 });
      d.text(d.c.nav.slice(0, 3).join('   ').toUpperCase(), 0.06, 0.035, { size: 0.0075, face: 'body', col: fg });
      d.text(d.c.cta.toUpperCase(), 0.992, 0.035, { size: 0.0075, face: 'body', col: fg, align: 'right' });
      await d.photo('hero', 0.008, 0.07, 0.482, 0.482 / 1.5 * d.w / d.h, { n: 80 });
      const y = 0.07 + 0.482 / 1.5 * d.w / d.h + 0.05;
      d.text('CLIENT', 0.008, y, { size: 0.006, face: 'body', col: fg, weight: 700 }); d.text(d.b.name + ' — identity, packaging, web', 0.06, y, { size: 0.006, face: 'serif', col: fg, upper: false });
      // First-line indent: draw the first words alone, then wrap the rest under it.
      const words = d.c.sub.split(' '), first = words.slice(0, 4).join(' '), rest = words.slice(4).join(' ');
      d.text(first, 0.068, y + 0.07, { size: 0.021, face: 'serif', col: fg, upper: false, lh: 1.13 });
      d.text(rest, 0.008, y + 0.07 + 0.021 * 1.13 * d.w / d.h, { size: 0.021, face: 'serif', col: fg, upper: false, wrap: 0.48, lh: 1.13 });
      await d.photo('product', 0.51, 0.07, 0.482, 0.45, { n: 81 });
      await d.photo('people', 0.51, 0.53, 0.482, 0.45, { n: 82 });
    }
  }]);
  add('poster', 'Perky Bros', [{
    id: 'pb-nice', name: 'Kraft slogan poster', dirs: PB,
    note: 'A friendly two-line slogan over kraft paper, the product cut out in the middle on a ghosted repeat, wordmark at the foot.',
    async draw(d) {
      d.fill('#C49A6C'); const g = d.g;
      for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '60,40,20'},.06)`; g.fillRect(Math.random() * d.w, Math.random() * d.h, d.w * 0.004, 1); }
      const navy = lum(d.t.primary) < 0.4 ? d.t.primary : d.t.ink;
      const words = d.c.billboard.split(' '), mid = Math.ceil(words.length / 2);
      d.text(words.slice(0, mid).join(' '), 0.5, 0.12, { size: hs(d, 0.07), align: 'center', col: navy, upper: false, max: 0.86 });
      d.text(words.slice(mid).join(' '), 0.5, 0.2, { size: hs(d, 0.07), align: 'center', col: navy, upper: false, max: 0.86 });
      g.save(); g.globalAlpha = 0.12; for (let r = 0; r < 6; r++) d.text(d.c.billboard, 0.5, 0.33 + r * 0.06, { size: 0.06, align: 'center', col: navy, upper: false }); g.restore();
      await d.photo('product', 0.275, 0.3, 0.45, 0.4, { n: 83 });
      d.text(d.c.features.map((f) => f[0]).join(' · ').toUpperCase(), 0.5, 0.79, { size: 0.0095, face: 'body', align: 'center', col: navy, track: 0.15 });
      await d.logo(0.5, 0.86, 0.04, { align: 'center', kind: 'word', max: 0.32 });
      d.text(web(d.b.name), 0.04, 0.975, { size: 0.0095, face: 'body', col: navy });
      d.text('@' + web(d.b.name).replace('.com', ''), 0.96, 0.975, { size: 0.0095, face: 'body', col: navy, align: 'right' });
    }
  }]);

  /* ======================= Smith & Diction (Philadelphia) ======================= */
  const SD = ['heritage', 'artdeco', 'retro', 'darkLuxury', 'magazine'];
  add('social', 'Smith & Diction', [{
    id: 'sd-stickers', name: 'Sticker sheet', dirs: SD,
    note: 'Badges, plates and coins scattered on one warm colour, each a different way of carrying the mark.',
    async draw(d) {
      const g = d.g, warm = d.t.primary; d.fill(warm);
      const cream = '#F4EBDD', dark = deep(d) === warm ? '#0F2A2E' : deep(d);
      const items = [[0.5, 0.5, 0.2, 'emblem'], [0.18, 0.2, 0.11, 'badge'], [0.82, 0.24, 0.1, 'badge'], [0.2, 0.8, 0.1, 'badge'], [0.78, 0.8, 0.16, 'plate'], [0.22, 0.48, 0.14, 'plate'], [0.5, 0.15, 0.05, 'coin'], [0.86, 0.52, 0.05, 'coin'], [0.5, 0.86, 0.05, 'coin']];
      for (const [x, y, r, kind] of items) {
        g.save(); g.translate(x * d.w, y * d.h); g.rotate(((x * 97 + y * 31) % 1 - 0.5) * 0.42); g.translate(-x * d.w, -y * d.h);
        g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = d.w * 0.006; g.shadowOffsetY = d.w * 0.003;
        if (kind === 'plate') { d.rect(x - r, y - r * 0.32, r * 2, r * 0.64, cream, { r: 0.012 }); g.shadowColor = 'transparent'; await d.logo(x, y, r * 0.3, { kind: 'word', align: 'center', base: 'middle', max: r * 1.7 }); }
        else if (kind === 'coin') { const gr = g.createLinearGradient((x - r) * d.w, (y - r) * d.h, (x + r) * d.w, (y + r) * d.h); gr.addColorStop(0, '#F6D98A'); gr.addColorStop(1, '#A87B2B'); g.fillStyle = gr; g.beginPath(); g.arc(x * d.w, y * d.h, r * d.u, 0, 7); g.fill(); g.shadowColor = 'transparent'; await d.logo(x, y, r * 1.1, { kind: 'mark', align: 'center', base: 'middle' }); }
        else {
          d.circle(x, y, r, kind === 'emblem' ? dark : cream); g.shadowColor = 'transparent';
          const fg = kind === 'emblem' ? cream : dark;
          g.strokeStyle = fg; g.lineWidth = d.w * 0.002; g.beginPath(); g.arc(x * d.w, y * d.h, r * d.u * 0.86, 0, 7); g.stroke();
          const txt = (d.b.name + ' · ' + d.c.tagline + ' · ').toUpperCase(), rr = r * d.u * 0.72, fs = r * d.u * 0.13;
          g.fillStyle = fg; g.font = `600 ${fs}px "${d.t.body}", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          const n = Math.min(txt.length, 60); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 - Math.PI / 2; g.save(); g.translate(x * d.w + Math.cos(a) * rr, y * d.h + Math.sin(a) * rr); g.rotate(a + Math.PI / 2); g.fillText(txt[i], 0, 0); g.restore(); }
          g.textAlign = 'start'; g.textBaseline = 'alphabetic';
          await d.logo(x, y, (r * d.u * 0.8) / d.h, { kind: 'mark', align: 'center', base: 'middle', variant: kind === 'emblem' ? 'light' : '' });
        }
        g.restore();
      }
    }
  }]);
  add('website', 'Smith & Diction', [{
    id: 'sd-archive', name: 'Logo archive', dirs: ['darkLuxury', 'artdeco', 'magazine'],
    note: 'Black page, a heavy two-line header, then a five-column grid of white marks with name, sector and year.',
    async draw(d) {
      d.fill('#000');
      d.text('Logos &', 0.02, 0.12, { size: 0.065, face: 'body', weight: 900, col: '#fff', track: -0.03 });
      d.text('Icons', 0.02, 0.23, { size: 0.065, face: 'body', weight: 900, col: '#fff', track: -0.03 });
      d.text(d.c.tagline.toUpperCase(), 0.98, 0.06, { size: 0.0085, face: 'body', col: '#8A8A8A', align: 'right' });
      const cw = 0.164, chh = 0.12 * d.w / d.h, names = [d.b.name, ...d.c.nav, ...d.c.features.map((f) => f[0])];
      for (let i = 0; i < 10; i++) {
        const x = 0.09 + (i % 5) * cw, y = 0.32 + Math.floor(i / 5) * (chh + 0.06);
        if (y + chh > 1) break;
        await d.logo(x + cw * 0.3, y + chh * 0.36, chh * 0.62, { kind: i === 0 ? 'lockup' : 'mark', align: 'center', base: 'middle', variant: 'light', max: cw * 0.85 });
        d.text(names[i % names.length], x, y + chh * 0.8, { size: 0.0062, face: 'body', weight: 700, col: '#fff' });
        d.text(`Identity — ${2016 + i}`, x, y + chh * 0.8 + 0.022, { size: 0.0062, face: 'body', col: '#8A8A8A' });
      }
    }
  }]);
  add('box-front', 'Smith & Diction', [{
    id: 'sd-crossed', name: 'Crossed Didone box', dirs: SD,
    note: 'A deep matte box; letter-spaced Didone caps crossed by two hairline diagonals; a square colour label carries a small drawing.',
    async draw(d) {
      await d.font('Bodoni Moda');
      const bg = deep(d), cream = '#F4EBDD'; d.fill(bg);
      const g = d.g; g.strokeStyle = cream; g.lineWidth = Math.max(1, d.w * 0.0012);
      g.beginPath(); g.moveTo(d.w * 0.06, d.h * 0.32); g.lineTo(d.w * 0.6, d.h * 0.62); g.moveTo(d.w * 0.06, d.h * 0.62); g.lineTo(d.w * 0.6, d.h * 0.32); g.stroke();
      d.text(d.b.name, 0.33, 0.5, { face: 'font:Bodoni Moda', fit: 0.45, align: 'center', base: 'middle', upper: true, track: 0.12, col: cream });
      d.rect(0.64, 0.06, 0.3, 0.3, loud(d));
      await d.logo(0.79, 0.21, 0.16, { kind: 'mark', align: 'center', base: 'middle' });
      d.text(d.c.product.name.toUpperCase(), 0.06, 0.92, { size: 0.022, face: 'body', col: cream, track: 0.25 });
      d.text(d.c.product.detail, 0.94, 0.92, { size: 0.018, face: 'body', col: cream, align: 'right' });
    }
  }]);

  /* ======================= VSA Partners (Chicago) ======================= */
  const VSA = ['institutional', 'swiss', 'civic', 'modernist', 'darkprecision'];
  add('website', 'VSA Partners', [{
    id: 'vsa-opener', name: 'Two-tone case opener', dirs: VSA,
    note: 'Full-bleed photograph in situ, then the client name in black stacked over its descriptor in grey, services listed with a plus.',
    async draw(d) {
      d.fill('#fff'); const m = 0.035;
      await d.logo(m, 0.02, 0.035, { kind: 'word' });
      d.text(d.c.nav.join('    '), 1 - m, 0.045, { size: 0.009, face: 'body', col: '#000', align: 'right' });
      await d.photo('place', 0, 0.09, 1, 0.5, { n: 90 });
      d.text(d.b.name, m, 0.69, { size: 0.044, face: 'body', weight: 600, col: '#000', track: -0.02 });
      d.text(d.c.headline, m, 0.69 + 0.044 * d.w / d.h, { size: 0.044, face: 'body', weight: 600, col: '#777', track: -0.02, max: 0.62 });
      d.text(d.c.sub, m, 0.86, { size: 0.0125, face: 'body', col: '#777', wrap: 0.45, lh: 1.4 });
      ['Brand strategy', 'Identity system', 'Packaging', 'Digital'].forEach((x, i) => d.text('+ ' + x, 0.74, 0.86 + i * 0.032, { size: 0.0125, face: 'body', col: '#777' }));
    }
  }]);
  add('billboard', 'VSA Partners', [{
    id: 'vsa-triptych', name: 'Triptych, one word a panel', dirs: VSA,
    note: 'The line chopped across three panels; photo over a deep band; the wordmark signs off only on the middle one.',
    async draw(d) {
      d.fill('#fff'); const gap = 0.012, pw = (1 - 2 * gap) / 3, words = d.c.billboard.replace(/[.]/g, '').split(' ');
      while (words.length < 3) words.push('');
      const lines = [words[0], words.slice(1, -1).join(' ') || words[1], words.length > 2 ? words[words.length - 1] : ''];
      for (let i = 0; i < 3; i++) {
        const x = i * (pw + gap);
        await d.photo(i === 1 ? 'people' : 'place', x, 0, pw, 0.75, { n: 91 + i }); d.rect(x, 0, pw, 0.75, 'rgba(0,0,0,.45)');
        d.rect(x, 0.75, pw, 0.25, deep(d));
        d.text(lines[i], x + pw / 2, 0.18, { size: hs(d, 0.12), align: 'center', base: 'top', upper: true, col: '#fff', max: pw * 0.9, track: -0.01, weight: 800 });
        if (i === 1) await d.logo(x + pw / 2, 0.875, 0.1, { align: 'center', base: 'middle', variant: 'light', max: pw * 0.45 });
      }
    }
  }]);
  add('deck', 'VSA Partners', [{
    id: 'vsa-wall', name: 'System wall', dirs: VSA.concat(['dynamicSystem']),
    note: 'Thirty applications in a masonry wall that bleeds off every edge: a third symbol crops, a third type, a third photo.',
    async draw(d) {
      d.fill('#E9EAEC'); const cols = 7, gap = 0.008, cw = (1.08 - gap * (cols - 1)) / cols, chh = cw * d.w / d.h;
      let k = 0;
      for (let c = 0; c < cols; c++) for (let r = -0.4 + (c % 2) * 0.35; r < 1; r += chh * (k % 3 === 0 ? 1.4 : 1) + gap) {
        const x = -0.04 + c * (cw + gap), h = chh * (k % 3 === 0 ? 1.4 : 1), kind = k % 3;
        if (kind === 0) await d.photo(k % 2 ? 'people' : 'hero', x, r, cw, h, { n: 100 + k });
        else if (kind === 1) { const bg = [d.t.primary, d.t.secondary, d.t.ink][k % 3]; d.rect(x, r, cw, h, bg); await d.logo(x + cw * 0.15, r + h * 0.5, h * 1.6, { kind: 'mark', base: 'middle' }); }
        else { d.rect(x, r, cw, h, d.t.bg); d.text(d.c.billboard, x + 0.01, r + 0.03, { size: 0.016, wrap: cw - 0.02, base: 'top', col: d.t.ink }); }
        k++;
      }
    }
  }]);

  /* ======================= Dentsu (Tokyo) ======================= */
  const DT = ['japaneseMinimal', 'heritage', 'civic', 'riso'];
  add('poster', 'Dentsu', [{
    id: 'dt-stamp', name: 'Station stamp', dirs: DT,
    note: 'One stamp in one pigment, dead centre on washi off-white; the place name below; a series number in the corner.',
    async draw(d) {
      d.fill('#F3EEE3'); const ink = lum(d.t.primary) < 0.55 ? d.t.primary : '#D9381E', g = d.g;
      const cx = 0.5, cy = 0.42, r = 0.31;
      g.save(); g.strokeStyle = ink; g.lineWidth = d.w * 0.012; g.beginPath(); g.arc(cx * d.w, cy * d.h, r * d.w, 0, 7); g.stroke();
      g.lineWidth = d.w * 0.003; g.beginPath(); g.arc(cx * d.w, cy * d.h, r * d.w * 0.9, 0, 7); g.stroke(); g.restore();
      await d.logo(cx, cy - 0.04, 0.2, { kind: 'mark', align: 'center', base: 'middle' });
      d.rect(cx - r * 0.75, cy + 0.1, r * 1.5, 0.05, ink);
      d.text(d.c.poster[2].split('·').pop().trim(), cx, cy + 0.125, { size: 0.03, face: 'body', weight: 700, col: '#F3EEE3', align: 'center', base: 'middle', upper: true, track: 0.15 });
      // woodblock: knock small gaps out of the ink
      g.save(); g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 900; i++) { g.globalAlpha = Math.random() * 0.5; g.fillRect(Math.random() * d.w, Math.random() * d.h * 0.7, d.w * 0.004 * Math.random(), d.w * 0.002); } g.restore();
      g.save(); g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#F3EEE3'; g.fillRect(0, 0, d.w, d.h); g.restore();
      d.text(d.c.poster[0], 0.5, 0.82, { size: hs(d, 0.05), align: 'center', col: '#1A1A1A' });
      d.text(d.c.poster[1].toUpperCase(), 0.5, 0.86, { size: hs(d, 0.016), face: 'body', align: 'center', col: '#1A1A1A', track: 0.2 });
      d.text('017 / 120', 0.95, 0.05, { size: 0.016, face: 'mono', align: 'right', col: '#1A1A1A' });
      await d.logo(0.5, 0.94, 0.025, { align: 'center', base: 'middle', max: 0.24 });
    }
  }]);
  add('website', 'Dentsu', [{
    id: 'dt-overlap', name: 'Corporate overlap', dirs: ['institutional', 'civic', 'clinical'],
    note: 'A photograph and a deep text panel overlapping by a tenth of the width; an eyebrow in wide-tracked caps.',
    async draw(d) {
      d.fill('#fff');
      await d.logo(0.05, 0.03, 0.035);
      d.text(d.c.nav.join('    '), 0.95, 0.055, { size: 0.009, face: 'body', col: '#0A0A23', align: 'right' });
      d.text(d.c.tagline.toUpperCase(), 0.05, 0.15, { size: 0.0085, face: 'body', col: '#0A0A23', track: 0.5, max: 0.5 });
      await d.photo('people', 0, 0.2, 0.55, 0.52, { n: 110 });
      const bg = deep(d); d.rect(0.45, 0.34, 0.47, 0.6, bg);
      d.text(d.c.headline, 0.49, 0.42, { size: 0.022, face: 'body', weight: 700, col: '#fff', wrap: 0.38, base: 'top', upper: false, lh: 1.2 });
      d.text(d.c.sub, 0.49, 0.62, { size: 0.0095, face: 'body', col: 'rgba(255,255,255,.8)', wrap: 0.36, lh: 1.5 });
      d.stroke(0.49, 0.8, 0.12, 0.055, '#fff', 0.0008); d.text(d.c.cta + '  ›', 0.55, 0.835, { size: 0.0085, face: 'body', col: '#fff', align: 'center' });
    }
  }]);

  /* ======================= CENTER (Brooklyn) ======================= */
  const CE = ['brutalist', 'modernist', 'bauhaus', 'kinetic', 'maximal'];
  add('social', 'CENTER', [{
    id: 'ce-range', name: 'Flat-colour range', dirs: CE.concat(['neofintech', 'friendlyGeo']),
    note: 'Packs in diagonal rows, edge to edge, each one matte colour from a spectrum; names run vertically up the side.',
    async draw(d) {
      d.fill('#fff'); const g = d.g, pal = [d.t.primary, d.t.secondary, d.t.accent, d.t.ink, d.t.surface, d.t.muted];
      g.save(); g.translate(d.w / 2, d.h / 2); g.rotate(-Math.PI / 6); g.translate(-d.w / 2, -d.h / 2);
      const pw = 0.15, ph = pw * 1.9 * d.w / d.h;
      for (let r = -2, k = 0; r < 6; r++) for (let c = -2; c < 8; c++, k++) {
        const x = c * (pw + 0.03) + (r % 2) * 0.09, y = r * (ph + 0.03);
        const col = pal[(c + r + 12) % pal.length];
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect((x + 0.006) * d.w, (y + 0.006) * d.h, pw * d.w, ph * d.h);
        d.rect(x, y, pw, ph, col, { r: 0.012 });
        g.save(); g.translate((x + pw - 0.025) * d.w, (y + ph - 0.03) * d.h); g.rotate(-Math.PI / 2); g.fillStyle = on(d, col); g.font = `600 ${d.w * 0.014}px "${d.t.body}"`; if ('letterSpacing' in g) g.letterSpacing = d.w * 0.0025 + 'px'; g.fillText(d.c.product.name.toUpperCase(), 0, 0); g.restore();
      }
      g.restore();
    }
  }]);
  add('poster', 'CENTER', [{
    id: 'ce-surface', name: 'Logo on a real surface', dirs: CE,
    note: 'The wordmark sprayed onto concrete or card under hard daylight; texture shows through. No other type.',
    async draw(d) {
      await d.photo('texture', 0, 0, 1, 1, { n: 120, grade: 'mono' });
      d.g.save(); d.g.globalCompositeOperation = 'multiply'; d.g.globalAlpha = 0.88;
      await d.logo(0.5, 0.5, 0.2, { kind: 'word', align: 'center', base: 'middle', max: 0.72 });
      d.g.restore();
      d.shade(0, 0, 1, 0.35, 'rgba(0,0,0,.28)', 'rgba(0,0,0,0)');
    }
  }]);
  add('website', 'CENTER', [{
    id: 'ce-splash', name: 'Wordmark splash', dirs: CE,
    note: 'One wide wordmark filling the screen; four tiny nav labels pinned to the corners. Nothing else.',
    async draw(d) {
      d.fill('#fff'); const n = d.c.nav;
      d.text('Work', 0.011, 0.04, { size: 0.014, face: 'body', weight: 700, col: '#000' }); d.text('Info', 0.989, 0.04, { size: 0.014, face: 'body', weight: 700, col: '#000', align: 'right' });
      d.text(n[0], 0.011, 0.975, { size: 0.014, face: 'body', weight: 700, col: '#000' }); d.text(n[1], 0.989, 0.975, { size: 0.014, face: 'body', weight: 700, col: '#000', align: 'right' });
      d.text(d.b.name, 0.5, 0.5, { fit: 0.9, align: 'center', base: 'middle', upper: true, track: -0.05, weight: 900, col: '#000' });
    }
  }]);

  /* ======================= Sibley Peteet (Dallas) ======================= */
  const SP = ['heritage', 'riso', 'organic', 'warmHuman', 'handmade'];
  add('poster', 'Sibley Peteet', [{
    id: 'sp-idea', name: 'Illustrated idea poster', dirs: SP,
    note: 'Cream stock; the mark drawn large in two spot inks as the idea; quiet letterspaced serif caps beneath.',
    async draw(d) {
      d.fill('#F2EBDD'); const g = d.g;
      for (let i = 0; i < 2000; i++) { g.fillStyle = 'rgba(80,60,30,.05)'; g.fillRect(Math.random() * d.w, Math.random() * d.h, 2, 2); }
      d.circle(0.5, 0.42 * d.h / d.w, 0.3, '#C8963E');
      await d.logo(0.5, 0.42, 0.4, { kind: 'mark', align: 'center', base: 'middle' });
      d.text(d.c.poster[0], 0.5, 0.8, { size: hs(d, 0.03), face: 'serif', align: 'center', upper: true, track: 0.12, col: '#1a1a1a', italic: false });
      d.text(d.c.poster[1], 0.5, 0.84, { size: hs(d, 0.018), face: 'serif', align: 'center', italic: true, upper: false, col: '#1a1a1a' });
      d.text((d.b.name + ' · ' + d.c.poster[2]).toUpperCase(), 0.5, 0.95, { size: hs(d, 0.01), face: 'body', align: 'center', track: 0.25, col: '#1a1a1a' });
    }
  }]);
  add('spread', 'Sibley Peteet', [{
    id: 'sp-annual', name: 'Annual-report spread', dirs: SP.concat(['institutional', 'editorialLux']),
    note: 'Full-bleed duotone on the left; on the right generous margins, a four-line drop cap in the spot colour and a hung italic pull quote.',
    async draw(d) {
      d.fill('#F7F2E8'); await d.photo('people', 0, 0, 0.5, 1, { n: 130, grade: 'mono' });
      d.g.save(); d.g.globalCompositeOperation = 'multiply'; d.rect(0, 0, 0.5, 1, d.t.primary); d.g.restore();
      const x = 0.5 + 0.5 * 0.22, w = 0.5 * 0.6, top = 0.12, body = 0.0105;
      d.text(d.c.sub[0], x, top + 0.14, { size: 0.06, face: 'serif', col: d.t.primaryText, upper: false });
      const txt = (d.c.sub.slice(1) + ' ' + d.c.features.map((f) => f[1]).join(' ') + ' ').repeat(3);
      d.text(txt.slice(0, 150), x + 0.05, top + 0.03, { size: body, face: 'serif', wrap: w - 0.05, lh: 1.6, upper: false, base: 'top' });
      d.text(txt.slice(150, 600), x, top + 0.18, { size: body, face: 'serif', wrap: w, lh: 1.6, upper: false, base: 'top' });
      d.text('“' + d.c.tagline + '”', 0.5 + 0.5 * 0.04, 0.62, { size: body * 1.9, face: 'serif', italic: true, wrap: 0.5 * 0.17, lh: 1.2, upper: false, col: d.t.primaryText });
      d.text('ANNUAL REVIEW · 07', 0.95, 0.94, { size: 0.0075, face: 'body', track: 0.2, align: 'right' });
    }
  }]);

  /* ======================= Tractorbeam (Dallas) ======================= */
  const TB = ['heritage', 'darkLuxury', 'quietLux', 'artdeco'];
  add('sign', 'Tractorbeam', [{
    id: 'tb-crop', name: 'Cropped wordmark panel', dirs: TB,
    note: 'Dusty ground, a short tracked paragraph, and the name in heavy condensed caps sitting below the bottom edge.',
    async draw(d) {
      await d.font('Anton');
      const bg = d.t.surface === d.t.bg ? d.t.secondary : d.t.surface; d.fill(bg);
      const dark = deep(d);
      d.text(d.c.sub.toUpperCase(), 0.5, 0.14, { size: 0.0115, face: 'body', align: 'center', wrap: 0.5, track: 0.12, col: dark, lh: 1.6 });
      d.text(d.b.name, 0.5, 1.12, { face: 'font:Anton', fit: 0.92, align: 'center', upper: true, col: dark });
    }
  }]);
  add('id-card', 'Tractorbeam', [{
    id: 'tb-key', name: 'Vertical key card', dirs: TB,
    note: 'Charcoal card; the name as stacked single letters, tone on tone; city in small caps.',
    async draw(d) {
      await d.font('Anton');
      d.shade(0, 0, 1, 1, '#2E2E30', '#1C1C1E');
      const letters = d.b.name.replace(/\s+/g, '').toUpperCase().split('').slice(0, 9), step = 0.75 / letters.length;
      letters.forEach((ch, i) => d.text(ch, 0.5, 0.1 + (i + 0.85) * step, { face: 'font:Anton', size: hs(d, step * 0.92), align: 'center', col: '#4A4A4E' }));
      d.text(d.c.poster[2].split('·').pop().trim().toUpperCase(), 0.5, 0.95, { size: hs(d, 0.022), face: 'body', align: 'center', track: 0.3, col: '#6A6A6E' });
    }
  }]);
  add('website', 'Tractorbeam', [{
    id: 'tb-cards', name: 'Rounded cards on black', dirs: TB,
    note: 'Black page, a big tight serif headline with small tag chips, then rounded media cards.',
    async draw(d) {
      d.fill('#000'); const m = 0.037;
      d.text(d.b.name, m, 0.07, { size: 0.015, face: 'body', col: '#fff' });
      d.text(d.c.headline, m, 0.11, { size: 0.045, face: 'serif', col: '#fff', wrap: 0.48, base: 'top', track: -0.04, lh: 1, upper: false });
      ['Identity', 'Signage', 'Print'].forEach((tg, i) => { d.rect(m + i * 0.07, 0.36, 0.064, 0.032, '#333', { r: 0.002 }); d.text(tg.toUpperCase(), m + i * 0.07 + 0.032, 0.381, { size: 0.0075, face: 'body', col: '#fff', align: 'center' }); });
      d.text(d.c.sub, 0.58, 0.11, { size: 0.011, face: 'body', col: '#fff', wrap: 0.38, base: 'top', lh: 1.45 });
      d.text('Read more ↓', 0.58, 0.3, { size: 0.011, face: 'body', col: '#fff' });
      d.rect(m, 0.45, 0.45, 0.55, d.t.secondary, { r: 0.006 }); await d.logo(m + 0.225, 0.72, 0.16, { kind: 'mark', align: 'center', base: 'middle' });
      await d.photo('detail', 0.513, 0.45, 0.45, 0.55, { n: 140, r: 0.006 });
    }
  }]);

  /* ======================= Chermayeff & Geismar & Haviv (New York) ======================= */
  const CGH = ['modernist', 'swiss', 'bauhaus', 'institutional', 'civic', 'friendlyGeo'];
  const cghField = async (d) => { d.fill(d.t.primary); await d.logo(0.5, 0.5, 0.2, { align: 'center', base: 'middle', variant: 'reverse', max: 0.42 }); };
  add('poster', 'Chermayeff & Geismar & Haviv', [{ id: 'cgh-field', name: 'Mark on a field', dirs: CGH, note: 'One flat colour edge to edge, the lockup reversed at forty per cent of the width. Nothing else.', draw: cghField }]);
  add('tote', 'Chermayeff & Geismar & Haviv', [{ id: 'cgh-tote', name: 'Mark on a field', dirs: CGH, note: 'The bag is the colour field; the lockup alone.', draw: cghField }]);
  add('flag', 'Chermayeff & Geismar & Haviv', [{
    id: 'cgh-banner', name: 'Banner run', dirs: CGH,
    note: 'A run of lamp-post banners alternates: the lockup, a giant crop of the symbol, a plain colour with one word.',
    async draw(d) {
      const k = (d.t.seed || 1) % 3;
      if (k === 0) { d.fill(d.t.primary); await d.logo(0.5, 0.25, 0.14, { align: 'center', base: 'middle', variant: 'reverse', max: 0.7 }); }
      else if (k === 1) { d.fill(d.t.bg); await d.logo(-0.2, 0.2, 1.05, { kind: 'mark' }); }
      else { d.fill(d.t.secondary); d.text(d.c.nav[0], 0.5, 0.2, { size: 0.14, align: 'center', col: d.t.onSecondary, max: 0.8 }); }
    }
  }]);
  add('cover', 'Chermayeff & Geismar & Haviv', [{ id: 'cgh-cover', name: 'Monumental mark', dirs: CGH, note: 'A modest title over a full-bleed band where the mark sits alone.', async draw(d) { d.fill('#F5F5F5'); d.text(d.c.webinar, 0.06, 0.08, { size: 0.03, face: 'body', col: '#000', wrap: 0.8 }); d.rect(0, 0.3, 1, 0.7, d.t.primary); await d.logo(0.5, 0.65, 0.12, { align: 'center', base: 'middle', variant: 'reverse', max: 0.6 }); } }]);

  /* ======================= Landor ======================= */
  const LA = ['gradient', 'neofintech', 'darkprecision', 'dynamicSystem', 'y2k'];
  add('poster', 'Landor', [{
    id: 'la-gradient', name: 'Gradient field', dirs: LA,
    note: 'A soft three-colour gradient flowing up to the right with one blurred highlight; the mark centred in white; the headline low left.',
    async draw(d) {
      const g = d.g, gr = g.createLinearGradient(0, d.h, d.w, 0);
      gr.addColorStop(0, deep(d)); gr.addColorStop(0.55, d.t.primary); gr.addColorStop(1, d.t.secondary); g.fillStyle = gr; g.fillRect(0, 0, d.w, d.h);
      const rg = g.createRadialGradient(d.w * 0.65, d.h * 0.35, 0, d.w * 0.65, d.h * 0.35, d.w * 0.45); rg.addColorStop(0, 'rgba(255,255,255,.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, d.w, d.h);
      await d.logo(0.5, 0.38, 0.2, { kind: 'mark', align: 'center', base: 'middle', variant: 'light' });
      d.text(d.c.tagline, 0.06, 0.8, { size: 0.014, face: 'body', col: '#fff' });
      d.text(d.c.headline, 0.06, 0.84, { size: 0.06, face: 'body', weight: 600, col: '#fff', wrap: 0.85, base: 'top', track: -0.02, lh: 1.02, upper: false });
    }
  }]);
  add('deck', 'Landor', [{
    id: 'la-type', name: 'Typeface hero', dirs: LA.concat(['swiss', 'modernist']),
    note: 'The typeface name huge and cropped, a waterfall of sizes, and one glyph with construction lines.',
    async draw(d) {
      d.fill('#fff'); const g = d.g;
      g.save(); g.beginPath(); g.rect(0, 0, d.w * 0.6, d.h); g.clip();
      d.text(d.t.display, 0.04, 0.32, { size: hs(d, 0.3), col: d.t.ink, upper: false });
      g.restore();
      [0.08, 0.055, 0.035, 0.022, 0.015].forEach((s, i) => d.text(i ? d.c.headline : 'Aa Bb Cc', 0.04, 0.45 + [0, 0.1, 0.17, 0.22, 0.26][i], { size: hs(d, s), col: d.t.ink, upper: false, max: 0.54 }));
      d.rect(0.62, 0.06, 0.34, 0.82, '#F2F2F2');
      const L = d.b.name.replace(/^the\s+/i, '')[0];
      [0.2, 0.62, 0.72].forEach((y) => d.line(0.64, y, 0.94, y, { col: d.t.primary, w: 0.0006 }));
      d.text(L, 0.79, 0.72, { size: hs(d, 0.62), align: 'center', col: d.t.ink });
      d.text('Supports 200+ languages   Aa  Аа  Αα  أ  あ  한', 0.04, 0.95, { size: hs(d, 0.014), face: 'body', col: '#777', upper: false });
    }
  }]);
  add('spread', 'Landor', [{
    id: 'la-results', name: 'Results band', dirs: LA.concat(['institutional', 'civic']),
    note: 'Business proof given the same stage as the design: three big numbers on the brand colour.',
    async draw(d) {
      d.fill(d.t.primary); const fg = d.t.onPrimary;
      const nums = ['+38%', '2.4×', '#1'], caps = [d.c.stat, d.c.features[1][1], d.c.features[0][1]];
      for (let i = 0; i < 3; i++) {
        const x = 0.06 + i * 0.3;
        if (i) d.line(x - 0.02, 0.25, x - 0.02, 0.75, { col: 'rgba(255,255,255,.3)', w: 0.0005 });
        d.text(nums[i], x, 0.5, { size: 0.07, face: 'body', weight: 500, col: fg, track: -0.03 });
        d.text(caps[i], x, 0.6, { size: 0.011, face: 'body', col: fg, wrap: 0.24, lh: 1.4 });
      }
      await d.logo(0.06, 0.1, 0.05, { variant: 'reverse' });
    }
  }]);

  /* ======================= Wolff Olins (London) ======================= */
  const WO = ['maximal', 'kinetic', 'y2k', 'brutalist', 'ecoOptimist', 'memphis'];
  const woPanel = (story) => async (d) => {
    const split = story ? 0.62 : 0.6;
    await d.photo('people', 0, 0, 1, split, { n: story ? 151 : 150 });
    d.rect(0, split, 1, 1 - split, loud(d));
    const words = d.c.billboard.replace(/[.]/g, '').split(' ').slice(0, 2);
    let y = split + (1 - split) * 0.18; for (const wd of words) y = d.text(wd, 0.5, y, { size: 0.15, align: 'center', base: 'top', col: '#000', weight: 900, max: 0.9, lh: 0.95, upper: false }) + 0.005;
    d.text(d.b.name + ' — ' + d.c.tagline, 0.5, 0.97, { size: 0.016, face: 'body', align: 'center', col: '#000' });
  };
  add('social', 'Wolff Olins', [{ id: 'wo-panel', name: 'Panel in photo', dirs: WO, note: 'A street portrait cut straight across by a flat bright panel carrying two words in a heavy display face.', draw: woPanel(false) }]);
  add('story', 'Wolff Olins', [{ id: 'wo-panel-story', name: 'Panel in photo', dirs: WO, note: 'The same cut, vertical.', draw: woPanel(true) }]);
  add('spread', 'Wolff Olins', [{
    id: 'wo-half', name: 'Offset half on black', dirs: WO.concat(['darkLuxury', 'darkprecision']),
    note: 'One portrait in the right half of a black page; the left half stays empty but for a small caption.',
    async draw(d) { d.fill('#000'); await d.photo('people', 0.51, 0.06, 0.47, 0.88, { n: 152 }); d.text(d.b.name + ' — ' + d.c.story, 0.024, 0.92, { size: 0.009, face: 'body', col: 'rgba(255,255,255,.6)' }); }
  }]);
  add('website', 'Wolff Olins', [{
    id: 'wo-header', name: 'Pill nav case header', dirs: WO,
    note: 'Black page, a floating pill nav, the client name large left, a serif intro right, and a row of stats.',
    async draw(d) {
      d.fill('#000');
      d.rect(0.225, 0.03, 0.55, 0.05, '#1A1A1A', { r: 0.025 }); await d.logo(0.24, 0.055, 0.025, { base: 'middle', variant: 'light', kind: 'word' });
      d.text(d.c.nav.join('   '), 0.76, 0.06, { size: 0.0085, face: 'body', col: '#fff', align: 'right' });
      d.text(d.b.name, 0.024, 0.2, { size: 0.038, face: 'body', col: '#fff', weight: 500 });
      d.text('Industry', 0.024, 0.28, { size: 0.0095, face: 'body', col: 'rgba(255,255,255,.6)' }); d.text('What we did', 0.024, 0.33, { size: 0.0095, face: 'body', col: 'rgba(255,255,255,.6)' });
      d.text(d.c.sub + ' ' + d.c.tagline, 0.5, 0.17, { size: 0.014, face: 'serif', col: '#fff', wrap: 0.46, base: 'top', lh: 1.45, upper: false });
      ['3×', '70%', '200k'].forEach((n, i) => { d.text(n, 0.024 + i * 0.32, 0.62, { size: 0.05, face: 'body', col: loud(d) }); d.text([d.c.features[0][0], d.c.features[1][1], d.c.stat][i], 0.024 + i * 0.32, 0.68, { size: 0.0095, face: 'body', col: '#fff', max: 0.28 }); });
      await d.photo('hero', 0.024, 0.76, 0.952, 0.3, { n: 153 });
    }
  }]);

  /* ======================= Jones Knowles Ritchie (London) ======================= */
  const JKR = ['retro', 'kidsJoy', 'maximal', 'friendlyGeo', 'memphis', 'handmade'];
  const jkrWall = async (d) => {
    const bg = deep(d); d.fill(bg);
    const word = (d.c.product.claim || d.c.nav[0]).toUpperCase(), sz = hs(d, 0.2);
    d.g.save(); d.g.globalAlpha = 0.22;
    for (let r = 0; r < 6; r++) d.text((word + ' ').repeat(5), -0.25 * (r % 2), 0.16 + r * 0.18, { size: sz, col: '#fff', weight: 900, track: -0.02, upper: true });
    d.g.restore();
    d.g.save(); d.g.shadowColor = 'rgba(0,0,0,.35)'; d.g.shadowBlur = d.w * 0.02;
    await d.logo(0.5, 0.5, 0.16, { align: 'center', base: 'middle', variant: 'light', max: 0.5 }); d.g.restore();
  };
  add('social', 'Jones Knowles Ritchie', [{ id: 'jkr-wall', name: 'Type wallpaper', dirs: JKR, note: 'One owned word repeated tone on tone until it becomes the brand; the logo sits on top.', draw: jkrWall }]);
  add('bag', 'Jones Knowles Ritchie', [{ id: 'jkr-bag', name: 'Type wallpaper', dirs: JKR, note: 'The owned word wrapped round the bag.', draw: jkrWall }]);
  add('billboard', 'Jones Knowles Ritchie', [{
    id: 'jkr-word', name: 'One-word billboard', dirs: JKR,
    note: 'One sensory word huge on cream; a narrow strip in the second colour carries the name and logo.',
    async draw(d) {
      d.fill('#F5EBDC'); const word = (d.c.product.claim || d.c.billboard.split(' ')[0]).replace(/[.]/g, '');
      d.text(word, 0.04, 0.5, { fit: 0.8, base: 'middle', col: d.t.primary, weight: 900, upper: false, track: -0.02 });
      d.rect(0.88, 0, 0.12, 1, d.t.secondary);
      await d.logo(0.94, 0.9, 0.2, { kind: 'mark', align: 'center', base: 'bottom' });
    }
  }]);

  /* ======================= Gander (Brooklyn) ======================= */
  const GA = ['retro', 'organic', 'kidsJoy', 'ecoOptimist', 'friendlyGeo', 'riso'];
  add('poster', 'Gander', [{
    id: 'ga-quilt', name: 'Quilt poster', dirs: GA,
    note: 'A patchwork of simple geometric blocks in festival colours; a window knocked out for the name and dates.',
    async draw(d) {
      const cols = 6, rows = 9, cw = 1 / cols, ch = 1 / rows, g = d.g;
      const pal = [d.t.primary, d.t.secondary, d.t.accent, '#F2B8C6', '#2B4BD8', '#F5EBDC'];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const a = pal[(r * 2 + c) % pal.length], b = pal[(r + c * 3 + 2) % pal.length], x = c * cw * d.w, y = r * ch * d.h, w = cw * d.w, h = ch * d.h;
        g.fillStyle = a; g.fillRect(x, y, w + 1, h + 1); g.fillStyle = b;
        const k = (r * 5 + c * 7) % 4;
        if (k === 0) { g.beginPath(); g.arc(x, y + h, w, -Math.PI / 2, 0); g.lineTo(x, y + h); g.fill(); }
        else if (k === 1) { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2) g.fillRect(x + i * w / 2, y + j * h / 2, w / 2, h / 2); }
        else if (k === 2) { g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w * 0.18, h * 0.42, 0, 0, 7); g.ellipse(x + w / 2, y + h / 2, w * 0.42, h * 0.18, 0, 0, 7); g.fill(); }
        else { g.beginPath(); g.arc(x + w / 2, y + h, w / 2, Math.PI, 0); g.fill(); }
      }
      d.rect(2 * cw, 3 * ch, 2 * cw, 3 * ch, d.t.ink);
      await d.font('Anton');
      d.text(d.c.poster[0], 0.5, 4.4 * ch, { face: 'font:Anton', fit: 2 * cw * 0.84, align: 'center', base: 'middle', upper: true, col: d.t.bg });
      d.text(d.c.poster[2], 0.5, 5.3 * ch, { size: hs(d, 0.02), face: 'body', align: 'center', col: d.t.bg, max: 2 * cw * 0.9 });
    }
  }]);
  add('spread', 'Gander', [{
    id: 'ga-pair', name: 'Mark + colour block', dirs: GA,
    note: 'Two tiles on cream: the mark drawn in one ink, and a plain block of the brand colour with nothing on it.',
    async draw(d) {
      d.fill('#FBF2EC'); const m = 0.028, gap = 0.015, tw = (1 - 2 * m - gap) / 2, th = 0.72;
      d.rect(m, m * 1.6, tw, th, '#F6EADF', { r: 0.004 }); await d.logo(m + tw / 2, m * 1.6 + th / 2, 0.36, { kind: 'mark', align: 'center', base: 'middle' });
      d.rect(m + tw + gap, m * 1.6, tw, th, d.t.primary, { r: 0.004 });
      d.rect(m, m * 1.6 + th + 0.03, 1 - 2 * m, 0.12, d.t.secondary, { r: 0.004 });
    }
  }]);
  add('website', 'Gander', [{
    id: 'ga-header', name: 'Cream case header', dirs: GA,
    note: 'Cream page, nav spread across the width, a rounded hero tile, a big sentence-case title and a services list.',
    async draw(d) {
      d.fill('#FBF2EC'); const ink = '#171717';
      await d.logo(0.012, 0.02, 0.03, { kind: 'mark' });
      d.c.nav.forEach((n, i) => d.text(n.toUpperCase(), 0.25 + i * 0.22, 0.045, { size: 0.0078, face: 'body', col: ink }));
      await d.photo('hero', 0.012, 0.08, 0.976, 0.52, { n: 160, r: 0.004 });
      d.text(d.b.name, 0.012, 0.73, { size: 0.07, face: 'body', col: ink, track: -0.02, upper: false });
      d.text(d.c.sub, 0.13, 0.8, { size: 0.011, face: 'body', col: ink, wrap: 0.42, lh: 1.45, base: 'top' });
      ['Strategy', 'Identity', 'Packaging', 'Illustration'].forEach((s, i) => d.text(s, 0.85, 0.8 + i * 0.03, { size: 0.0085, face: 'body', col: ink, align: 'right' }));
      d.text('Read more +', 0.13, 0.95, { size: 0.011, face: 'body', col: ink });
    }
  }]);

  /* ======================= Pentagram ======================= */
  const PE = ['swiss', 'modernist', 'editorialLux', 'institutional', 'bauhaus', 'magazine'];
  const initial = (d) => d.b.name.replace(/^the\s+/i, '')[0].toUpperCase();
  add('website', 'Pentagram', [{
    id: 'pe-initial', name: 'Initial as symbol', dirs: PE,
    note: 'The first letter at two-thirds of the screen height in the brand colour; the name in three ruled lines overprinting it.',
    async draw(d) {
      d.fill('#000'); const col = lum(d.t.primary) > 0.12 ? d.t.primary : d.t.accent;
      d.text(initial(d), 0.44, 0.17, { size: hs(d, 0.66) * 1.38, base: 'top', col, weight: 900, upper: true });
      const words = d.b.name.split(' ').length > 1 ? d.b.name.split(' ') : d.chunks(3);
      const sz = hs(d, 0.042) * 1.38, gap = 0.024, lines = words.slice(0, 3);
      let y = 0.67 - (lines.length - 1) * (0.042 + gap);
      d.g.font = `300 ${sz * d.w}px "${d.t.body}"`; const lw = Math.max(...lines.map((l) => d.g.measureText(l.toUpperCase()).width)) / d.w * 1.12;
      lines.forEach((l, i) => { if (i) d.line(0.29, y - 0.042 - gap / 2, 0.29 + lw, y - 0.042 - gap / 2, { col: '#F4EFE6', w: 0.0012 }); d.text(l, 0.29, y, { size: sz, face: 'body', weight: 300, upper: true, track: 0.04, col: '#F4EFE6' }); y += 0.042 + gap; });
    }
  }]);
  add('poster', 'Pentagram', [{
    id: 'pe-playbill', name: 'Playbill stack', dirs: PE.concat(['brutalist', 'kinetic']),
    note: 'Every line sized to the same measure like a theatre broadside; one line in the brand colour.',
    async draw(d) {
      d.fill('#000'); const lines = [d.c.poster[0], ...d.c.features.map((f) => f[0]), d.c.poster[1].split(' ')[0]].slice(0, 5);
      let y = 0.06;
      lines.forEach((l, i) => { y = d.text(l, 0.07, y, { fit: 0.86, base: 'top', upper: true, lh: 0.88, track: 0, weight: i % 2 ? 900 : 500, face: i % 2 ? 'display' : 'body', col: i === 2 ? (lum(d.t.primary) < 0.15 ? d.t.accent : d.t.primary) : '#fff' }) + 0.012; });
      await d.logo(0.07, 0.94, 0.03, { base: 'bottom', variant: 'light', max: 0.3 });
      d.text(d.c.poster[2], 0.93, 0.94, { size: 0.016, face: 'body', col: '#fff', align: 'right' });
    }
  }]);
  add('social', 'Pentagram', [{
    id: 'pe-rings', name: 'Radiating initials', dirs: ['maximal', 'kinetic', 'y2k', 'gradient', 'memphis'],
    note: 'The initials repeated round four concentric rings, each turned a little further; the name small in the corner.',
    async draw(d) {
      const g = d.g; d.fill(deep(d)); const ini = d.b.initials || initial(d), cols = [d.t.primary, d.t.secondary, d.t.accent];
      [0.11, 0.18, 0.25, 0.32].forEach((r, k) => {
        const R = r * d.w, fs = 0.036 * d.w, txt = (ini + ' · ').toUpperCase();
        g.font = `800 ${fs}px "${d.t.display}", sans-serif`; g.fillStyle = cols[k % 3] === deep(d) ? '#fff' : cols[k % 3]; g.textAlign = 'center'; g.textBaseline = 'middle';
        const per = g.measureText(txt).width * 1.08, n = Math.max(3, Math.floor(2 * Math.PI * R / per)), full = (txt.repeat(n));
        for (let i = 0; i < full.length; i++) { const a = (i / full.length) * Math.PI * 2 + k * 0.122; g.save(); g.translate(d.w / 2 + Math.cos(a) * R, d.h / 2 + Math.sin(a) * R); g.rotate(a + Math.PI / 2); g.fillText(full[i], 0, 0); g.restore(); }
      });
      g.textAlign = 'start'; g.textBaseline = 'alphabetic';
      d.text(d.b.name, 0.05, 0.95, { size: 0.022, face: 'body', col: '#F2EDE6' });
    }
  }]);

  /* ======================= COLLINS ======================= */
  const CO = ['editorialLux', 'warmHuman', 'magazine', 'neofintech', 'retro', 'darkLuxury'];
  add('poster', 'COLLINS', [{
    id: 'co-crescendo', name: 'Crescendo serif', dirs: CO,
    note: 'The name in a high-contrast serif whose letters grow from the last to the first, standing on a portrait.',
    async draw(d) {
      await d.font('Bodoni Moda');
      d.fill('#EFE9DF'); await d.photo('people', 0, 0.32, 1, 0.68, { n: 170 });
      const g = d.g, name = d.b.name.toUpperCase(), n = name.length, base = 0.3 * d.h;
      g.font = `700 100px "Bodoni Moda"`; const tw = g.measureText(name).width, px = 0.9 * d.w / tw * 100;
      g.font = `700 ${px}px "Bodoni Moda"`; g.fillStyle = d.t.ink; let x = 0.05 * d.w;
      for (let i = 0; i < n; i++) { const sy = 2.2 - 1.2 * (i / Math.max(1, n - 1)); g.save(); g.translate(x, base); g.scale(1, sy); g.fillText(name[i], 0, 0); g.restore(); x += g.measureText(name[i]).width; }
      d.text(d.c.poster[1], 0.05, 0.9, { size: 0.019, face: 'body', col: '#fff' }); d.text(d.c.poster[2], 0.05, 0.935, { size: 0.019, face: 'body', col: '#fff' });
    }
  }]);
  add('website', 'COLLINS', [{
    id: 'co-hush', name: 'Dark statement', dirs: CO,
    note: 'Near-black, one serif sentence in the middle, and the top of a vivid image card rising from below the fold.',
    async draw(d) {
      d.fill('#140805');
      await d.logo(0.033, 0.03, 0.022, { kind: 'word', variant: 'light' });
      d.line(0.955, 0.035, 0.97, 0.035, { col: '#F8F8F7', w: 0.0012 }); d.line(0.955, 0.045, 0.97, 0.045, { col: '#F8F8F7', w: 0.0012 });
      d.text(d.c.headline, 0.5, 0.45, { size: 0.05, face: 'serif', col: '#F8F8F7', align: 'center', base: 'middle', max: 0.8, upper: false, track: -0.02, italic: false });
      d.text(d.c.stat.toUpperCase(), 0.5, 0.74, { size: 0.0065, face: 'body', col: 'rgba(248,248,247,.8)', align: 'center', track: 0.1 });
      await d.photo('hero', 0.15, 0.88, 0.7, 0.5, { n: 171, r: 0.01 });
    }
  }]);
  add('deck', 'COLLINS', [{
    id: 'co-annotated', name: 'Annotated board', dirs: CO.concat(['friendlyGeo', 'kidsJoy']),
    note: 'A clean application with the strategist\'s orange pen over it: arrows, a circled detail, a handwritten note.',
    async draw(d) {
      await d.font('Caveat');
      d.fill('#F7F6F2'); await d.photo('product', 0.19, 0.2, 0.62, 0.72, { n: 172 });
      await d.logo(0.5, 0.56, 0.12, { align: 'center', base: 'middle', variant: 'light', max: 0.4 });
      const g = d.g, pen = '#F05A28'; g.strokeStyle = pen; g.lineWidth = d.w * 0.003; g.lineCap = 'round';
      const wob = (pts) => { g.beginPath(); g.moveTo(pts[0][0] * d.w, pts[0][1] * d.h); for (let i = 1; i < pts.length; i++) g.quadraticCurveTo((pts[i - 1][0] + pts[i][0]) / 2 * d.w + 6, (pts[i - 1][1] + pts[i][1]) / 2 * d.h - 8, pts[i][0] * d.w, pts[i][1] * d.h); g.stroke(); };
      wob([[0.1, 0.4], [0.2, 0.5], [0.3, 0.54]]); wob([[0.28, 0.5], [0.3, 0.54], [0.27, 0.57]]);
      wob([[0.9, 0.75], [0.85, 0.7], [0.72, 0.62]]); wob([[0.75, 0.6], [0.72, 0.62], [0.75, 0.66]]);
      g.beginPath(); g.ellipse(0.5 * d.w, 0.56 * d.h, 0.17 * d.w, 0.09 * d.h, -0.05, 0, 6.1); g.stroke();
      d.text('the mark holds up at every size — keep the photography warm, never staged. Push the colour on outdoor.', 0.04, 0.08, { face: 'font:Caveat', size: 0.017, col: pen, wrap: 0.24, lh: 1.15, upper: false, track: 0 });
      g.save(); g.translate(0.19 * d.w, 0.17 * d.h); g.rotate(-0.07); g.translate(-0.19 * d.w, -0.17 * d.h); d.text('hero lock-up!', 0.19, 0.17, { face: 'font:Caveat', size: 0.02, col: pen, upper: false, track: 0 }); g.restore();
    }
  }]);
  add('spread', 'COLLINS', [{
    id: 'co-impact', name: 'Impact cards', dirs: CO,
    note: 'Premium framed as proof: four white cards with a big light number each, the last running off the edge.',
    async draw(d) {
      d.fill('#F7F6F4'); d.text('Impact', 0.07, 0.12, { size: 0.017, face: 'serif', col: '#111', upper: false });
      const nums = ['3×', '↑ 70%', '200k', '#1'], labs = [d.c.features[0][0], d.c.features[1][0], d.c.stat, d.c.features[2][0]];
      for (let i = 0; i < 4; i++) { const x = 0.07 + i * 0.213; d.rect(x, 0.2, 0.205, 0.62, '#fff', { r: 0.006 }); d.text(nums[i], x + 0.016, 0.3, { size: 0.046, face: 'body', weight: 300, col: '#111' }); d.text(labs[i], x + 0.016, 0.7, { size: 0.0075, face: 'body', weight: 500, col: '#111', max: 0.17 }); d.text(d.c.features[i % 3][1], x + 0.016, 0.74, { size: 0.007, face: 'body', col: '#6B6B6B', wrap: 0.17, lh: 1.4 }); }
    }
  }]);

  /* ======================= Upstatement (Boston) ======================= */
  const UP = ['magazine', 'neofintech', 'civic', 'warmHuman', 'editorialLux'];
  add('website', 'Upstatement', [{
    id: 'up-collage', name: 'Floating collage on black', dirs: ['magazine', 'kinetic', 'darkprecision'],
    note: 'Six images at deliberately mismatched sizes with no shared edges, dot clusters, one small caption.',
    async draw(d) {
      d.fill('#000'); const a = d.w / d.h;
      const P = [[0.06, 0.08, 0.28, 4 / 3], [0.44, 0.04, 0.09, 1.25], [0.58, 0.3, 0.18, 1], [0.38, 0.52, 0.11, 4 / 3], [0.72, 0.56, 0.22, 1.25], [0.18, 0.7, 0.07, 1]];
      for (let i = 0; i < P.length; i++) { const [x, y, w, r] = P[i]; await d.photo(i % 2 ? 'product' : 'people', x, y, w, Math.min(w * r * a, 0.98 - y), { n: 180 + i }); }
      for (let i = 0; i < 6; i++) { d.circle(0.5 + (i % 3) * 0.012, 0.2 + Math.floor(i / 3) * 0.02 * a, 0.0025, '#fff'); d.circle(0.12 + (i % 3) * 0.012, 0.6 + Math.floor(i / 3) * 0.02 * a, 0.0025, '#fff'); }
      d.text(d.c.sub, 0.4, 0.34, { size: 0.0085, face: 'body', col: '#fff', wrap: 0.16, lh: 1.4 });
      await d.logo(0.94, 0.04, 0.025, { align: 'right', variant: 'light', kind: 'word' });
    }
  }]);
  add('spread', 'Upstatement', [{
    id: 'up-opener', name: 'Editorial case opener', dirs: UP,
    note: 'A newspaper feature for a brand: serif name, bold deck, hairline, body and two lists left; the hero photograph right.',
    async draw(d) {
      d.fill('#E9E7E2'); const ink = '#111';
      d.text(d.b.name, 0.04, 0.13, { size: 0.03, face: 'serif', col: ink, upper: false, weight: 300 });
      d.text(d.c.headline, 0.04, 0.24, { size: 0.009, face: 'body', col: ink, weight: 700 });
      d.line(0.04, 0.27, 0.34, 0.27, { col: ink, w: 0.0005 });
      d.text(d.c.sub + ' ' + d.c.features.map((f) => f.join(' — ')).join('. '), 0.04, 0.3, { size: 0.0075, face: 'body', col: ink, wrap: 0.3, lh: 1.45, base: 'top' });
      [['What we did', ['Strategy', 'Identity', 'Packaging']], ['What we made', ['Website', 'App', 'Campaign']]].forEach(([h, items], k) => { const x = 0.04 + k * 0.15; d.text(h, x, 0.55, { size: 0.0075, face: 'body', weight: 700, col: ink }); items.forEach((it, i) => d.text(it, x, 0.58 + i * 0.03, { size: 0.0075, face: 'body', col: ink })); });
      await d.photo('people', 0.5, 0.11, 0.46, 0.46 * 0.75 * d.w / d.h, { n: 190 });
    }
  }]);
  const phone = async (d, x, y, w, n) => { const h = w * 19.5 / 9 * d.w / d.h; d.g.save(); d.g.shadowColor = 'rgba(0,0,0,.14)'; d.g.shadowBlur = d.w * 0.02; d.g.shadowOffsetY = d.w * 0.01; d.rect(x, y, w, h, '#111', { r: 0.014 }); d.g.restore(); d.rect(x + 0.004, y + 0.004 * d.w / d.h, w - 0.008, h - 0.008 * d.w / d.h, d.t.bg, { r: 0.011 }); await d.photo(n % 2 ? 'product' : 'people', x + 0.004, y + 0.05, w - 0.008, h * 0.45, { n }); d.rect(x + 0.012, y + h * 0.82, w - 0.024, h * 0.06, d.t.primary, { r: 0.01 }); await d.logo(x + 0.012, y + 0.02, 0.02, { kind: 'word', max: w - 0.03 }); return h; };
  add('website', 'Upstatement', [{
    id: 'up-screens', name: 'Headline with floating screens', dirs: UP.concat(['friendlyGeo']),
    note: 'A light serif headline at huge size with five phone screens floating across it.',
    async draw(d) {
      d.fill('#fff'); const words = d.c.headline.replace(/[.,]/g, '').split(/[\s/]+/).slice(0, 3);
      words.forEach((w, i) => d.text(w, 0.08, 0.27 + i * 0.2, { size: hs(d, 0.15) / 0.7, face: 'serif', col: deep(d), upper: false, track: -0.02, weight: 300 }));
      const X = [0.04, 0.33, 0.47, 0.61, 0.84], Y = [0.28, 0.06, 0.34, 0.1, 0.3];
      for (let i = 0; i < 5; i++) await phone(d, X[i], Y[i], 0.1, 200 + i);
    }
  }]);
  add('social', 'Upstatement', [{
    id: 'up-wild', name: 'UI in the wild', dirs: UP,
    note: 'A phone held in a real, saturated place, showing the product; a three-line caption beside it.',
    async draw(d) {
      await d.photo('place', 0, 0, 1, 1, { n: 210 });
      await phone(d, 0.35, 0.16, 0.3, 211);
      d.text(d.c.social, 0.68, 0.64, { size: 0.02, face: 'body', col: '#fff', wrap: 0.28, lh: 1.3 });
      await d.logo(0.04, 0.96, 0.025, { base: 'bottom', variant: 'light' });
    }
  }]);

  /* ======================= DIA (New York) ======================= */
  const DI = ['kinetic', 'cyber', 'dynamicSystem', 'brutalist', 'swiss'];
  add('wall', 'DIA', [{
    id: 'dia-columns', name: 'Rotated column type wall', dirs: DI,
    note: 'Eight columns, each one word turned on its side and repeated off both ends; two columns in outline.',
    async draw(d) {
      d.fill('#000'); const g = d.g, cols = 8, m = 0.04, gap = 0.025, cw = (1 - 2 * m - gap * (cols - 1)) / cols, word = (d.b.name + ' ').toUpperCase();
      for (let c = 0; c < cols; c++) {
        const x = (m + c * (cw + gap)) * d.w, px = cw * d.w * 1.25;
        g.save(); g.translate(x + (c % 2 ? 0 : cw * d.w), ((c * 0.13) % 1) * d.h - d.h * 0.4); g.rotate(c % 2 ? -Math.PI / 2 : Math.PI / 2);
        g.font = `900 ${px}px "${d.t.display}", sans-serif`; g.textBaseline = 'alphabetic';
        const t = word.repeat(6);
        if (c === 2 || c === 5) { g.strokeStyle = '#fff'; g.lineWidth = d.w * 0.0015; g.strokeText(t, c % 2 ? -d.h * 2 : 0, c % 2 ? px * 0.85 : 0); }
        else { g.fillStyle = '#fff'; g.fillText(t, c % 2 ? -d.h * 2 : 0, c % 2 ? px * 0.85 : 0); }
        g.restore();
      }
    }
  }]);
  add('poster', 'DIA', [{
    id: 'dia-elastic', name: 'Elastic grotesk', dirs: DI,
    note: 'Lines of caps fitted to the measure, each letter stretched along a sine wave; a few letters replaced by pixelated photo tiles.',
    async draw(d) {
      d.fill('#fff'); const g = d.g, lines = [d.b.name, ...d.c.poster[0].split(' '), d.c.poster[1].split(' ')[0]].slice(0, 5).map((s) => s.toUpperCase().replace(/\s+/g, ''));
      let y = 0.04 * d.h;
      for (let li = 0; li < lines.length; li++) {
        const L = lines[li]; const sx = L.split('').map((_, i) => Math.min(2.1, Math.max(0.45, 1 + 0.8 * Math.sin(i * 0.9 + li * 1.3))));
        g.font = `800 100px "${d.t.body}", sans-serif`; const ws = L.split('').map((ch, i) => g.measureText(ch).width * sx[i]); const tot = ws.reduce((a, b) => a + b, 0);
        const k = 0.92 * d.w / tot, px = 100 * k; g.font = `800 ${px}px "${d.t.body}", sans-serif`; g.fillStyle = '#000';
        let x = 0.04 * d.w; y += px * 0.74;
        for (let i = 0; i < L.length; i++) {
          if ((li * 7 + i * 3) % 11 === 5) { await d.photo('detail', x / d.w, (y - px * 0.72) / d.h, ws[i] * k / d.w, px * 0.72 / d.h, { n: 220 + li }); }
          else { g.save(); g.translate(x, y); g.scale(sx[i], 1); g.fillText(L[i], 0, 0); g.restore(); }
          x += ws[i] * k;
        }
        y += px * 0.12;
      }
      d.text(d.c.poster[2].split('·')[0].trim(), 0.04, 0.9, { size: 0.07, face: 'body', weight: 800, col: '#000' });
      d.text([d.b.name, d.c.poster[1], d.c.poster[2], web(d.b.name)].join('\n').split('\n').join(' / '), 0.96, 0.96, { size: 0.013, face: 'body', col: '#000', align: 'right' });
    }
  }]);
  add('social', 'DIA', [{
    id: 'dia-contours', name: 'Contour field', dirs: DI.concat(['scientific', 'ecoOptimist', 'organic']),
    note: 'Generative contour lines across the whole card; the wordmark sits calm on a knocked-out panel.',
    async draw(d) {
      const bg = d.t.surface, ink = d.t.ink, g = d.g; d.fill(bg);
      g.strokeStyle = ink; g.lineWidth = Math.max(1, d.w * 0.0015);
      const f = (x, y) => Math.sin(x * 5.1 + Math.sin(y * 3.3) * 1.7) + Math.cos(y * 4.3 + Math.sin(x * 2.7) * 1.9) + 0.5 * Math.sin((x + y) * 7.7);
      const N = 120, cell = d.w / N;
      for (let lvl = -2; lvl <= 2; lvl += 0.25) {
        g.beginPath();
        for (let i = 0; i < N; i++) for (let j = 0; j < Math.ceil(d.h / cell); j++) {
          const x0 = i / N, y0 = j * cell / d.w, s = 1 / N;
          const a = f(x0, y0) > lvl, b = f(x0 + s, y0) > lvl, c = f(x0 + s, y0 + s) > lvl, e = f(x0, y0 + s) > lvl;
          const pts = []; if (a !== b) pts.push([i + 0.5, j]); if (b !== c) pts.push([i + 1, j + 0.5]); if (c !== e) pts.push([i + 0.5, j + 1]); if (e !== a) pts.push([i, j + 0.5]);
          if (pts.length >= 2) { g.moveTo(pts[0][0] * cell, pts[0][1] * cell); g.lineTo(pts[1][0] * cell, pts[1][1] * cell); }
        }
        g.stroke();
      }
      d.rect(0.31, 0.44, 0.38, 0.12, bg);
      await d.logo(0.5, 0.5, 0.06, { align: 'center', base: 'middle', max: 0.34 });
      d.text(web(d.b.name).toUpperCase(), 0.04, 0.96, { size: 0.012, face: 'mono', col: ink });
    }
  }]);

  /* ======================= Marx Design (Auckland) ======================= */
  const MX = ['friendlyGeo', 'retro', 'organic', 'heritage', 'darkLuxury', 'quietLux'];
  add('box-front', 'Marx Design', [{
    id: 'mx-blob', name: 'Abstraction pack', dirs: ['friendlyGeo', 'retro', 'kidsJoy', 'ecoOptimist'],
    note: 'A flavour-coloured blob, the product crossing it on a diagonal, and a ragged indented headline beside.',
    async draw(d) {
      d.fill('#F3EFE6'); const g = d.g, cx = 0.46 * d.w, cy = 0.48 * d.h, R = 0.22 * d.w;
      g.fillStyle = d.t.primary; g.beginPath();
      const pts = [...Array(8)].map((_, i) => { const a = i / 8 * Math.PI * 2, r = R * (0.85 + 0.3 * Math.abs(Math.sin(i * 2.3))); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
      g.moveTo((pts[0][0] + pts[7][0]) / 2, (pts[0][1] + pts[7][1]) / 2); for (let i = 0; i < 8; i++) { const n = pts[(i + 1) % 8]; g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + n[0]) / 2, (pts[i][1] + n[1]) / 2); } g.fill();
      g.save(); g.translate(cx, cy); g.rotate(-14 * Math.PI / 180); g.translate(-cx, -cy); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = d.w * 0.03; g.shadowOffsetY = d.w * 0.015; d.rect(0.33, 0.3, 0.26, 0.4, '#fff'); g.shadowColor = 'transparent'; await d.photo('product', 0.33, 0.3, 0.26, 0.4, { n: 230 }); g.restore();
      const words = (d.c.headline).replace(/[.,]/g, '').split(' '), ind = [0, -0.06, 0.04, 0, -0.03, 0.02];
      words.slice(0, 6).forEach((w, i) => d.text(w, 0.62 + ind[i], 0.38 + i * 0.055, { size: 0.044, face: 'body', weight: 500, col: '#111', upper: false }));
      await d.logo(0.95, 0.05, 0.06, { align: 'right', kind: 'mark' });
      d.text(d.c.product.detail, 0.05, 0.93, { size: 0.016, face: 'body', col: '#111' });
    }
  }]);
  add('label', 'Marx Design', [{
    id: 'mx-deboss', name: 'Tonal heritage deboss', dirs: ['heritage', 'darkLuxury', 'quietLux', 'artdeco'],
    note: 'A deep ground, a foil crest, and the name in Roman caps that only reads through its shadow.',
    async draw(d) {
      await d.font('Cinzel');
      const bg = deep(d), g = d.g; d.fill(bg);
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; g.fillRect(Math.random() * d.w, Math.random() * d.h, 2, 2); }
      const gr = g.createLinearGradient(0.45 * d.w, 0.12 * d.h, 0.55 * d.w, 0.32 * d.h); gr.addColorStop(0, '#C9A35A'); gr.addColorStop(0.5, '#8C6A2E'); gr.addColorStop(1, '#E5C27A');
      d.circle(0.5, 0.22 * d.h / d.w, 0.07, '#00000000'); g.fillStyle = gr; g.beginPath(); g.arc(0.5 * d.w, 0.22 * d.h, 0.07 * d.w, 0, 7); g.fill();
      await d.logo(0.5, 0.22, 0.13, { kind: 'mark', align: 'center', base: 'middle', variant: 'light' });
      d.text((d.c.product.claim || d.c.tagline).toUpperCase(), 0.5, 0.6, { size: 0.016, face: 'body', col: '#CFC6A0', align: 'center', track: 0.2 });
      g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = d.w * 0.004; g.shadowOffsetY = d.w * 0.0025;
      d.text(d.b.name, 0.04, 0.88, { face: 'font:Cinzel', fit: 0.92, upper: true, track: 0.02, col: bg }); g.restore();
      g.save(); g.globalAlpha = 0.12; d.text(d.b.name, 0.04, 0.878, { face: 'font:Cinzel', fit: 0.92, upper: true, track: 0.02, col: '#fff' }); g.restore();
      d.text(d.b.name, 0.04, 0.88, { face: 'font:Cinzel', fit: 0.92, upper: true, track: 0.02, col: bg });
    }
  }]);
  add('website', 'Marx Design', [{
    id: 'mx-comma', name: 'Comma-title case page', dirs: MX,
    note: 'The page wears the brand colour; the project name with a comma fixed top left; images in an asymmetric, staggered flow.',
    async draw(d) {
      const bg = d.t.primary, fg = d.t.onPrimary; d.fill(bg);
      d.text(d.b.name + ',', 0.009, 0.08, { size: 0.04, face: 'body', weight: 500, col: fg, track: -0.02 });
      await d.photo('hero', 0.065, 0.2, 0.435, 0.44, { n: 240 }); await d.photo('product', 0.517, 0.2, 0.438, 0.44, { n: 241 });
      d.text('Identity\nPackaging\nDigital'.split('\n').join('   '), 0.065, 0.74, { size: 0.0075, face: 'body', col: fg });
      d.text(d.c.headline, 0.44, 0.74, { size: 0.013, face: 'body', col: fg });
      d.text(d.c.sub, 0.44, 0.79, { size: 0.0065, face: 'body', col: fg, wrap: 0.24, lh: 1.5 });
      d.text(d.c.features.map((f) => f.join(' ')).join(' '), 0.7, 0.79, { size: 0.0065, face: 'body', col: fg, wrap: 0.25, lh: 1.5 });
      await d.photo('people', 0.26, 0.92, 0.685, 0.4, { n: 242 });
    }
  }]);

  /* ======================= Inhouse (Auckland) ======================= */
  const IH = ['architectural', 'japaneseMinimal', 'quietLux', 'swiss', 'clinical'];
  const ihNav = (d) => ['Projects', 'Index', 'Studio', 'People', 'News', 'Contact', d.b.name].forEach((n, i) => d.text(n, 0.025 + i * 0.158, 0.035, { size: 0.012 * (d.w > d.h ? 0.85 : 1), face: 'font:Inter', col: '#000', align: i === 6 ? 'right' : 'left' }));
  add('website', 'Inhouse', [{
    id: 'ih-fragment', name: 'Single fragment', dirs: IH,
    note: 'Museum quiet: one artefact alone in white, two siblings just behind it, the navigation spread evenly across the top.',
    async draw(d) {
      await d.font('Inter'); d.fill('#fff'); ihNav(d);
      const w = 0.18, h = w * 4 / 3 * d.w / d.h, x = 0.41, y = 0.5 - h / 2;
      await d.photo('product', x - 0.018, y + 0.035, w, h, { n: 250 }); await d.photo('detail', x + 0.015, y - 0.025, w, h, { n: 251 }); await d.photo('hero', x, y, w, h, { n: 252 });
    }
  }]);
  add('deck', 'Inhouse', [{
    id: 'ih-index', name: 'Index table', dirs: IH.concat(['institutional', 'modernist']),
    note: 'The work as a catalogue: ruled rows of name, client, discipline, sector and year. Facts over adjectives.',
    async draw(d) {
      await d.font('Inter'); d.fill('#fff'); ihNav(d);
      const rows = [[d.c.product.name, d.b.name, 'Packaging', 'Retail', '2026'], [d.c.webinar, d.b.name, 'Editorial', 'Culture', '2026'], [d.c.poster[0], d.b.name, 'Campaign', 'Events', '2025'], ...d.c.features.map((f, i) => [f[0], d.b.name, ['Identity', 'Digital', 'Signage'][i], 'Brand', String(2025 - i)])];
      const xs = [0.025, 0.35, 0.53, 0.7, 0.975];
      for (let r = 0; r < 26; r++) {
        const y = 0.42 + r * 0.032; if (y > 1.02) break; const row = rows[r % rows.length];
        d.line(0.025, y, 0.975, y, { col: '#000', w: 0.0005 });
        row.forEach((v, c) => d.text(v, xs[c], y + 0.022, { size: 0.0105, face: 'font:Inter', col: '#000', align: c === 4 ? 'right' : 'left', max: 0.17 }));
      }
    }
  }]);
  add('tote', 'Inhouse', [{
    id: 'ih-windows', name: 'Window constellation', dirs: IH,
    note: 'No wordmark: seven off-white squares in three sizes scattered like lit windows on a facade.',
    async draw(d) {
      d.fill(deep(d)); const sq = [[0.42, 0.52, 0.06], [0.55, 0.5, 0.04], [0.62, 0.6, 0.025], [0.46, 0.66, 0.04], [0.58, 0.72, 0.06], [0.38, 0.75, 0.025], [0.68, 0.68, 0.04]];
      sq.forEach(([x, y, s]) => d.rect(x, y, s, s * d.w / d.h, '#F4F1EA'));
    }
  }]);

  /* ======================= Studio Nari (London) ======================= */
  const NA = ['brutalist', 'maximal', 'riso', 'kinetic', 'y2k'];
  add('poster', 'Studio Nari', [{
    id: 'na-furniture', name: 'Type as furniture', dirs: NA.concat(['architectural']),
    note: 'One word in ultra-condensed caps across the top with a solid dot standing in for a letter; the object floats below on stone grey.',
    async draw(d) {
      await d.font('Anton'); d.fill('#E6E6E4');
      const word = d.b.name.split(' ')[0].toUpperCase(), oi = word.search(/[OQ]/) >= 0 ? word.search(/[OQ]/) : word.length - 1;
      const g = d.g; g.font = '100px "Anton"'; const wsz = word.split('').map((c) => g.measureText(c).width), tot = wsz.reduce((a, b) => a + b, 0), px = 0.92 * d.w / tot * 100;
      let x = 0.04 * d.w; const base = 0.03 * d.h + px * 0.8; g.font = `${px}px "Anton"`; g.fillStyle = '#000';
      word.split('').forEach((c, i) => { const w = wsz[i] * px / 100; if (i === oi) { g.beginPath(); g.arc(x + w / 2, base - px * 0.36, Math.min(w, px * 0.72) / 2, 0, 7); g.fill(); } else g.fillText(c, x, base); x += w; });
      await d.photo('product', 0.29, 0.28 + px / d.h * 0.2, 0.42, 0.5, { n: 260 });
      d.text(d.c.poster[0] + ' — ' + d.c.poster[2], 0.5, 0.95, { face: 'font:Anton', size: 0.024, align: 'center', col: '#000', upper: true });
    }
  }]);
  add('billboard', 'Studio Nari', [{
    id: 'na-manifesto', name: 'Manifesto split', dirs: NA,
    note: 'A manifesto in stacked condensed caps on hot colour, the monogram alone on stone grey opposite.',
    async draw(d) {
      await d.font('Anton'); d.rect(0, 0, 0.5, 1, d.t.accent === d.t.bg ? d.t.primary : d.t.accent); d.rect(0.503, 0, 0.497, 1, '#E6E6E4');
      const lines = [d.c.billboard, d.c.tagline, d.c.headline].join(' ').replace(/[.,]/g, '').toUpperCase().split(' ');
      const rows = []; for (let i = 0; i < lines.length && rows.length < 5; i += 2) rows.push(lines.slice(i, i + 2).join(' • '));
      rows.forEach((r, i) => d.text(r, 0.015, 0.2 + i * 0.18, { face: 'font:Anton', size: hs(d, 0.16), col: '#000', max: 0.47, lh: 0.92 }));
      await d.logo(0.75, 0.5, 0.5, { kind: 'mark', align: 'center', base: 'middle' });
    }
  }]);
  add('poster', 'Studio Nari', [{
    id: 'na-chrome', name: 'Liquid chrome wordmark', dirs: ['y2k', 'maximal', 'artdeco', 'gradient'],
    note: 'The name in a swash serif, tilted, rendered in a gold-chrome gradient with a dark extrusion, on a saturated grainy ground.',
    async draw(d) {
      await d.font('Pinyon Script');
      const g = d.g; d.fill(d.t.primary);
      for (let i = 0; i < 3500; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},.05)`; g.fillRect(Math.random() * d.w, Math.random() * d.h, 2, 2); }
      g.save(); g.translate(0.5 * d.w, 0.44 * d.h); g.rotate(-6 * Math.PI / 180); g.translate(-0.5 * d.w, -0.44 * d.h);
      g.font = '100px "Pinyon Script"'; const px = 0.82 * d.w / g.measureText(d.b.name).width * 100; g.font = `${px}px "Pinyon Script"`; g.textAlign = 'center';
      for (let k = 8; k > 0; k--) { g.fillStyle = 'rgba(80,40,0,.5)'; g.fillText(d.b.name, 0.5 * d.w + k, 0.44 * d.h + k); }
      const gr = g.createLinearGradient(0, 0.44 * d.h - px * 0.7, 0, 0.44 * d.h + px * 0.2); gr.addColorStop(0, '#FFF3C4'); gr.addColorStop(0.45, '#F7E2A1'); gr.addColorStop(0.6, '#C7891E'); gr.addColorStop(1, '#FFF3C4');
      g.fillStyle = gr; g.fillText(d.b.name, 0.5 * d.w, 0.44 * d.h); g.restore(); g.textAlign = 'start';
      d.text((d.b.name + ' presents').toUpperCase(), 0.5, 0.9, { size: 0.011, face: 'body', align: 'center', col: d.t.onPrimary, track: 0.08 });
      d.text(d.c.poster[0], 0.5, 0.93, { size: 0.016, face: 'body', align: 'center', col: d.t.onPrimary, weight: 700 });
    }
  }]);

  /* ======================= Regular Practice (London) ======================= */
  const RP = ['friendlyGeo', 'neofintech', 'civic', 'ecoOptimist', 'kidsJoy'];
  add('box-front', 'Regular Practice', [{
    id: 'rp-tape', name: 'Brand tape', dirs: RP,
    note: 'Kraft card under warm side light, brand-colour tape running over the edge with the wordmark repeating up it.',
    async draw(d) {
      d.fill('#C49A6C'); const g = d.g;
      for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,240,220' : '70,45,20'},.07)`; g.fillRect(Math.random() * d.w, Math.random() * d.h, d.w * 0.006, 1); }
      d.shade(0, 0, 1, 1, 'rgba(255,230,190,.15)', 'rgba(0,0,0,.18)');
      d.rect(0.72, 0, 0.18, 1, d.t.primary); d.rect(0.72, 0.58, 0.18, 0.1, 'rgba(0,0,0,.12)');
      g.save(); g.translate(0.81 * d.w, d.h); g.rotate(-Math.PI / 2);
      g.font = `800 ${0.09 * d.w}px "${d.t.body}", sans-serif`; g.fillStyle = d.t.onPrimary; g.textBaseline = 'middle';
      const t = (d.b.name.toUpperCase() + '   ').repeat(4); if ('letterSpacing' in g) g.letterSpacing = '2px'; g.fillText(t, d.w * 0.02, 0); g.restore();
    }
  }]);
  add('website', 'Regular Practice', [{
    id: 'rp-card', name: 'Portrait card hero', dirs: RP,
    note: 'A tall rounded product card on the left with an inset caption and VIEW pill; two more cards peeking; a calm two-line headline.',
    async draw(d) {
      d.fill('#fff');
      d.rect(0.02, 0.04, 0.38, 0.92, d.t.primary, { r: 0.008 }); await d.photo('product', 0.05, 0.18, 0.32, 0.6, { n: 270, r: 0.006 });
      await d.photo('detail', 0.026, 0.05, 0.04, 0.065, { n: 271 });
      d.text(d.c.tagline, 0.072, 0.065, { size: 0.0065, face: 'body', col: d.t.onPrimary, weight: 700 }); d.text(d.c.sub, 0.072, 0.085, { size: 0.0055, face: 'body', col: d.t.onPrimary, wrap: 0.3, lh: 1.3 });
      d.rect(0.026, 0.125, 0.04, 0.02, '#fff', { r: 0.01 }); d.text('VIEW', 0.046, 0.139, { size: 0.0045, face: 'body', col: '#000', align: 'center', weight: 700 });
      d.text(d.c.headline, 0.42, 0.08, { size: 0.021, face: 'body', col: '#111', weight: 300, wrap: 0.5, lh: 1.15 });
      d.rect(0.42, 0.3, 0.36, 0.66, d.t.secondary, { r: 0.008 }); await d.logo(0.6, 0.63, 0.12, { kind: 'mark', align: 'center', base: 'middle' });
      await d.photo('people', 0.8, 0.3, 0.3, 0.66, { n: 272, r: 0.008 });
    }
  }]);

  /* ======================= Monday Nights (London) ======================= */
  const MN = ['darkprecision', 'cyber', 'gradient', 'kinetic', 'darkLuxury'];
  add('website', 'Monday Nights', [{
    id: 'mn-initial', name: 'Off-axis initial', dirs: MN,
    note: 'The initial as a crafted object: extruded, turned slightly off-axis, one edge lit with the accent.',
    async draw(d) {
      const g = d.g, rg = g.createRadialGradient(d.w / 2, d.h / 2, 0, d.w / 2, d.h / 2, d.w * 0.6); rg.addColorStop(0, '#2A2A2A'); rg.addColorStop(1, '#0B0B0B'); g.fillStyle = rg; g.fillRect(0, 0, d.w, d.h);
      const L = initial(d), px = 0.46 * d.h * 1.38; g.font = `900 ${px}px "${d.t.display}", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save(); g.translate(d.w / 2, d.h / 2); g.transform(0.91, -0.06, 0.1, 0.99, 0, 0);
      for (let k = 22; k > 0; k--) { g.fillStyle = k < 3 ? loud(d) : `rgb(${40 + k * 3},${40 + k * 3},${40 + k * 3})`; g.fillText(L, k * d.w * 0.0016, k * d.w * 0.0009); }
      const fg = g.createLinearGradient(0, -px / 2, 0, px / 2); fg.addColorStop(0, '#F2F0EA'); fg.addColorStop(1, '#BDB9B0'); g.fillStyle = fg; g.fillText(L, 0, 0); g.restore();
      g.textAlign = 'start'; g.textBaseline = 'alphabetic';
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(0.02 * d.w, 0.02 * d.w, 0.005 * d.w, 0.005 * d.w);
      d.text('WORDMARK', 0.955, 0.95, { size: 0.0075, face: 'serif', col: '#fff', align: 'right', track: 0.14 }); d.rect(0.96, 0.95 - 0.006 * d.w / d.h * 1.2, 0.006, 0.006 * d.w / d.h, '#fff');
    }
  }]);
  add('social', 'Monday Nights', [{
    id: 'mn-grid', name: 'Visible grid tile', dirs: MN.concat(['scientific', 'swiss']),
    note: 'Construction lines and crosshairs left in the artwork; a 2×3 grid of logo, accent, renders and tracked caps.',
    async draw(d) {
      d.fill('#161616'); const x0 = 0.14, x1 = 0.86, y0 = 0.12, y1 = 0.88, gl = 'rgba(255,255,255,.18)';
      [x0, x1].forEach((x) => d.line(x, 0, x, 1, { col: gl, w: 0.001 })); [y0, y1].forEach((y) => d.line(0, y, 1, y, { col: gl, w: 0.001 }));
      const cw = (x1 - x0) / 2, ch = (y1 - y0) / 3;
      d.rect(x0, y0, cw, ch, '#fff'); await d.logo(x0 + cw / 2, y0 + ch / 2, ch * 0.3, { align: 'center', base: 'middle', max: cw * 0.8 });
      d.rect(x0 + cw, y0, cw, ch, loud(d));
      await d.photo('product', x0, y0 + ch, cw, ch, { n: 280 }); await d.photo('detail', x0 + cw, y0 + 2 * ch, cw, ch, { n: 281 });
      d.rect(x0 + cw, y0 + ch, cw, ch, '#fff'); d.text(d.c.tagline.toUpperCase(), x0 + cw + 0.03, y0 + ch + 0.08, { size: 0.016, face: 'serif', col: '#111', wrap: cw - 0.06, track: 0.3, lh: 1.6 });
      d.rect(x0, y0 + 2 * ch, cw, ch, '#0B0B0B'); await d.logo(x0 + cw / 2, y0 + 2.5 * ch, ch * 0.4, { kind: 'mark', align: 'center', base: 'middle', variant: 'light' });
      [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(([x, y]) => { d.line(x - 0.012, y, x + 0.012, y, { col: '#fff', w: 0.0015 }); d.line(x, y - 0.01, x, y + 0.01, { col: '#fff', w: 0.0015 }); });
    }
  }]);
  add('poster', 'Monday Nights', [{
    id: 'mn-shape', name: 'Shape-framed poster', dirs: MN.concat(['kinetic', 'brutalist']),
    note: 'A huge rounded-triangle outline cropped by the edge; the figure breaks through it; dates stacked in condensed caps.',
    async draw(d) {
      await d.font('Barlow Condensed'); d.fill('#F7F3E8'); const g = d.g;
      await d.photo('people', 0.18, 0.3, 0.8, 0.7, { n: 290 });
      const col = lum(d.t.primary) < 0.7 ? d.t.primary : d.t.accent; g.strokeStyle = col; g.lineWidth = d.w * 0.03; g.lineJoin = 'round';
      const cx = 0.6 * d.w, cy = 0.64 * d.h, R = 0.55 * d.w; g.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * R, cy + Math.sin(a) * R); } g.closePath(); g.stroke();
      const dt = d.c.poster[2].split('·')[0].trim().toUpperCase().split(' ');
      dt.concat(['2026']).slice(0, 3).forEach((p, i) => d.text(p, 0.05, 0.1 + i * 0.055, { face: 'font:Barlow Condensed', size: 0.075, weight: 800, col: '#111', upper: true }));
      await d.logo(0.05, 0.95, 0.04, { base: 'bottom', max: 0.3 });
    }
  }]);

  /* Website layouts also dress the laptop and tablet screens in device mockups. */
  A.LAYOUTS.website.filter((l) => l.by).forEach((l) => {
    A.add('screen-laptop', [Object.assign({}, l, { id: 'lap-' + l.id })]);
    A.add('screen-tablet', [Object.assign({}, l, { id: 'tab-' + l.id })]);
  });
})();
