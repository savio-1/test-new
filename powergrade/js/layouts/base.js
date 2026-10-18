/* Base artwork recipes for every application role. Proportional, grid-based, restrained.
   Studio-specific recipes from the research (js/layouts/studios.js) are added on top of these. */
(function () {
  const A = PG.Artwork;
  const web = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
  const bgOf = (d, kitBold) => (kitBold && (d.kit === 'bold' || d.kit === 'friendly') ? d.t.primary : d.t.bg);
  const fgOn = (d, bg) => (bg === d.t.primary ? d.t.onPrimary : bg === d.t.ink ? d.t.bg : d.t.ink);
  const lv = (d, bg) => (bg === d.t.primary ? 'reverse' : bg === d.t.ink ? 'inverse' : '');

  /* ---------------- business cards ---------------- */
  A.add('card-front', [
    { id: 'cf-centre', name: 'Centred lockup', kits: ['minimal', 'editorial', 'tech'], async draw(d) { const bg = d.kit === 'tech' ? d.t.ink : d.t.primary; d.fill(bg); await d.logo(0.5, 0.5, 0.2, { align: 'center', base: 'middle', variant: lv(d, bg) }); } },
    { id: 'cf-corner', name: 'Corner mark, oversize', kits: ['bold', 'friendly'], async draw(d) { d.fill(d.t.primary); await d.logo(0.07, 0.11, 0.16, { kind: 'word', variant: 'reverse' }); await d.logo(0.93, 0.9, 0.62, { kind: 'mark', align: 'right', base: 'bottom', variant: 'reverse' }); } },
    { id: 'cf-pattern', name: 'Mark as pattern', kits: [], async draw(d) { d.fill(d.t.primary); await d.pattern(0, 0, 1, 1, { step: 0.11, scale: 0.5, variant: 'reverse', alpha: 0.9 }); } }
  ]);
  A.add('card-back', [
    { id: 'cb-classic', name: 'Name, role, details', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], async draw(d) {
      const [name, role] = d.c.speaker; d.fill(d.t.bg);
      d.text(name, 0.07, 0.2, { size: 0.05, face: 'body', weight: 700, upper: false });
      d.text(role, 0.07, 0.29, { size: 0.036, face: 'body', col: d.t.muted });
      [`${name.split(' ')[0].toLowerCase()}@${web(d.b.name)}`, '+44 20 7946 0321', web(d.b.name)].forEach((l, i) => d.text(l, 0.07, 0.68 + i * 0.085, { size: 0.034, face: 'body' }));
      await d.logo(0.93, 0.84, 0.13, { kind: 'mark', align: 'right', base: 'bottom' });
    } }
  ]);

  /* ---------------- posters ---------------- */
  A.add('poster', [
    { id: 'p-photo', name: 'Photo with title block', kits: ['minimal', 'editorial'], async draw(d) {
      const [title, sub, when] = d.c.poster; d.fill(d.t.bg);
      await d.photo('place', 0.05, 0.035, 0.9, 0.64, { n: 1 });
      d.text(title, 0.05, 0.79, { size: 0.105, max: 0.9 });
      d.text(sub, 0.05, 0.845, { size: 0.03, face: 'body' });
      d.line(0.05, 0.89, 0.95, 0.89, { col: d.t.ink, w: 0.002 });
      d.text(when, 0.05, 0.935, { size: 0.024, face: 'body', weight: 700 }); d.text(web(d.b.name), 0.5, 0.935, { size: 0.024, face: 'body' });
      await d.logo(0.95, 0.955, 0.028, { align: 'right', base: 'bottom' });
    } },
    { id: 'p-type', name: 'Typographic, stacked', kits: ['tech', 'bold'], async draw(d) {
      const [title, sub, when] = d.c.poster; const bg = d.kit === 'bold' ? d.t.primary : d.t.bg, fg = fgOn(d, bg); d.fill(bg);
      const words = title.split(' '); let y = 0.17;
      words.forEach((w) => { d.text(w, 0.045, y, { size: 0.23, col: fg, max: 0.92, track: -0.04 }); y += 0.19; });
      d.text(sub, 0.045, 0.86, { size: 0.03, face: 'body', col: fg, wrap: 0.5 });
      d.text(when, 0.955, 0.86, { size: 0.03, face: 'body', col: fg, align: 'right', weight: 700 });
      await d.logo(0.045, 0.955, 0.03, { base: 'bottom', variant: lv(d, bg) });
    } },
    { id: 'p-grid', name: 'Modular grid', kits: ['friendly'], async draw(d) {
      const [title, sub, when] = d.c.poster; d.fill(d.t.ink);
      await d.photo('people', 0, 0, 0.5, 0.5, { n: 2 }); d.rect(0.5, 0, 0.5, 0.5, d.t.primary); await d.photo('detail', 0.5, 0.5, 0.5, 0.5, { n: 3 }); d.rect(0, 0.5, 0.5, 0.5, d.t.accent);
      d.text(title, 0.54, 0.1, { size: 0.07, col: d.t.onPrimary, wrap: 0.42 }); d.text(sub, 0.04, 0.58, { size: 0.03, face: 'body', col: d.t.ink, wrap: 0.42 }); d.text(when, 0.04, 0.9, { size: 0.04, col: d.t.ink });
      await d.logo(0.54, 0.44, 0.03, { base: 'bottom', variant: 'reverse' });
    } }
  ]);

  /* ---------------- billboard / outdoor ---------------- */
  A.add('billboard', [
    { id: 'bb-split', name: 'Line + photo', kits: ['minimal', 'editorial', 'friendly'], async draw(d) { d.fill(d.t.bg); await d.photo('hero', 0.52, 0, 0.48, 1, { n: 4 }); d.text(d.c.billboard, 0.04, 0.42, { size: 0.062, wrap: 0.44, lh: 1 }); await d.logo(0.04, 0.88, 0.11, { base: 'bottom' }); } },
    { id: 'bb-type', name: 'Copy on colour', kits: ['bold', 'tech'], async draw(d) { d.fill(d.t.primary); d.text(d.c.billboard, 0.035, 0.6, { size: 0.09, col: d.t.onPrimary, max: 0.93 }); await d.logo(0.965, 0.88, 0.12, { align: 'right', base: 'bottom', variant: 'reverse' }); } }
  ]);
  A.add('sign', [
    { id: 'sg-fascia', name: 'Fascia lockup', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], async draw(d) { const bg = d.kit === 'minimal' ? d.t.bg : d.kit === 'tech' ? d.t.ink : d.t.primary; d.fill(bg); await d.logo(0.5, 0.5, 0.42, { align: 'center', base: 'middle', variant: lv(d, bg) }); } },
    { id: 'sg-word', name: 'Wordmark only', kits: [], async draw(d) { d.fill(d.t.ink); await d.logo(0.5, 0.5, 0.5, { kind: 'word', align: 'center', base: 'middle', variant: 'inverse' }); } }
  ]);
  A.add('flag', [
    { id: 'fl-mark', name: 'Mark on colour', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], async draw(d) { d.fill(d.t.primary); await d.logo(0.5, 0.36, 0.3, { kind: 'mark', align: 'center', base: 'middle', variant: 'reverse' }); d.text(d.c.poster[0], 0.5, 0.78, { size: 0.09, col: d.t.onPrimary, align: 'center', max: 0.84 }); d.text(d.c.poster[2], 0.5, 0.86, { size: 0.04, face: 'body', col: d.t.onPrimary, align: 'center' }); } }
  ]);
  A.add('vehicle', [
    { id: 've-livery', name: 'Livery', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], async draw(d) { d.fill(d.t.bg); d.rect(0, 0.72, 1, 0.28, d.t.primary); await d.logo(0.06, 0.38, 0.22, { base: 'middle' }); d.text(web(d.b.name), 0.94, 0.88, { size: 0.025, face: 'body', col: d.t.onPrimary, align: 'right' }); } }
  ]);
  A.add('wall', [
    { id: 'wl-mural', name: 'Supergraphic', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], async draw(d) { d.fill(d.t.primary); await d.logo(-0.02, 1.05, 1.15, { kind: 'mark', base: 'bottom', variant: 'reverse' }); d.text(d.c.tagline, 0.96, 0.12, { size: 0.03, col: d.t.onPrimary, align: 'right', face: 'body' }); } }
  ]);

  /* ---------------- stationery & editorial ---------------- */
  A.add('letterhead', [
    { id: 'lh-classic', name: 'Letterhead', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], async draw(d) {
      d.fill('#FFFFFF'); await d.logo(0.08, 0.06, 0.025);
      [d.c.speaker[0], d.c.speaker[1], '12 Market Street, London', web(d.b.name)].forEach((l, i) => d.text(l, 0.92, 0.065 + i * 0.016, { size: 0.014, face: 'body', align: 'right', col: i ? d.t.muted : d.t.ink }));
      d.text('18 October 2026', 0.08, 0.2, { size: 0.016, face: 'body' });
      d.text('Dear Alex,', 0.08, 0.25, { size: 0.016, face: 'body' });
      d.text(d.c.sub + ' ' + d.c.features.map((f) => f[1]).join(' ') + ' ' + d.c.sub, 0.08, 0.28, { size: 0.016, face: 'body', wrap: 0.6, lh: 1.7 });
      d.rect(0, 0.985, 1, 0.015, d.t.primary);
    } }
  ]);
  A.add('cover', [
    { id: 'cv-photo', name: 'Photo cover', kits: ['editorial', 'minimal'], async draw(d) { d.fill(d.t.bg); await d.photo('place', 0, 0, 1, 0.7, { n: 5 }); d.text(d.c.webinar, 0.06, 0.8, { size: 0.07, wrap: 0.85 }); await d.logo(0.06, 0.95, 0.03, { base: 'bottom' }); d.text('Annual Review 2026', 0.94, 0.95, { size: 0.025, face: 'body', align: 'right', col: d.t.muted }); } },
    { id: 'cv-type', name: 'Type cover', kits: ['bold', 'tech', 'friendly'], async draw(d) { d.fill(d.t.primary); d.text(d.b.name, 0.05, 0.22, { size: 0.2, col: d.t.onPrimary, max: 0.9 }); d.text(d.c.webinar, 0.05, 0.86, { size: 0.045, col: d.t.onPrimary, wrap: 0.8, face: 'body', weight: 700 }); await d.logo(0.95, 0.955, 0.06, { kind: 'mark', align: 'right', base: 'bottom', variant: 'reverse' }); } }
  ]);
  A.add('spread', [
    { id: 'sp-editorial', name: 'Editorial spread', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], async draw(d) { d.fill(d.t.bg); await d.photo('people', 0, 0, 0.5, 1, { n: 6 }); d.text(d.c.story, 0.55, 0.16, { size: 0.045, wrap: 0.38 }); d.text(d.c.sub + ' ' + d.c.sub, 0.55, 0.42, { size: 0.012, face: 'body', wrap: 0.18, lh: 1.6 }); d.text(d.c.features.map((f) => f[0] + '. ' + f[1]).join(' '), 0.76, 0.42, { size: 0.012, face: 'body', wrap: 0.18, lh: 1.6 }); d.text('12', 0.95, 0.95, { size: 0.012, face: 'body', align: 'right' }); } }
  ]);
  A.add('id-card', [
    { id: 'id-card', name: 'Card', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], async draw(d) { d.fill(d.t.primary); if (d.kit === 'editorial' || d.kit === 'minimal') await d.photo('texture', 0, 0, 1, 1, { n: 7 }); await d.logo(0.08, 0.08, 0.06, { variant: d.kit === 'editorial' || d.kit === 'minimal' ? 'light' : 'reverse' }); d.text('4821 •••• •••• 0193', 0.08, 0.9, { size: 0.05, face: 'mono', col: d.kit === 'editorial' || d.kit === 'minimal' ? '#fff' : d.t.onPrimary }); } }
  ]);

  /* ---------------- packaging ---------------- */
  const pack = {
    async minimal(d) { d.fill(d.t.bg); await d.logo(0.5, 0.14, 0.07, { kind: 'word', align: 'center' }); d.line(0.42, 0.25, 0.58, 0.25, { col: d.t.ink }); d.text(d.c.product.name, 0.5, 0.56, { size: 0.085, align: 'center', max: 0.8 }); d.text(d.c.product.claim, 0.5, 0.63, { size: 0.032, align: 'center', face: 'body', col: d.t.muted }); d.text(d.c.product.detail, 0.5, 0.9, { size: 0.026, align: 'center', face: 'body', upper: true, track: 0.14 }); },
    async editorial(d) { d.fill(d.t.bg); await d.photo('detail', 0, 0.44, 1, 0.56, { n: 8 }); await d.logo(0.07, 0.07, 0.07); d.text(d.c.product.name, 0.07, 0.3, { size: 0.08, max: 0.86 }); d.text(d.c.product.detail, 0.07, 0.37, { size: 0.028, face: 'body', col: d.t.muted }); },
    async bold(d) { d.fill(d.t.primary); d.rect(0, 0.66, 1, 0.34, d.t.secondary); d.text(d.c.product.name, 0.06, 0.52, { size: 0.24, col: d.t.onPrimary, max: 0.88, track: -0.04 }); await d.logo(0.06, 0.08, 0.08, { variant: 'reverse' }); d.text(d.c.product.claim, 0.06, 0.8, { size: 0.05, col: d.t.onSecondary, face: 'body', weight: 700 }); d.text(d.c.product.detail, 0.06, 0.92, { size: 0.03, col: d.t.onSecondary, face: 'body', upper: true, track: 0.1 }); },
    async friendly(d) { d.fill(d.t.bg); d.circle(0.5, 1.12, 0.55, d.t.primary); d.circle(0.85, 0.6, 0.1, d.t.accent); await d.logo(0.08, 0.08, 0.08); d.text(d.c.product.name, 0.08, 0.36, { size: 0.12, max: 0.7 }); d.text(d.c.product.detail, 0.5, 0.9, { size: 0.04, col: d.t.onPrimary, align: 'center', face: 'body', weight: 700 }); },
    async tech(d) { d.fill(d.t.ink); for (let i = 1; i < 6; i++) d.line(i / 6, 0, i / 6, 1, { col: PG.color.mix(d.t.ink, d.t.bg, 0.22), w: 0.001 }); d.text(d.b.name.toUpperCase(), 0.06, 0.08, { size: 0.035, face: 'mono', col: d.t.bg, track: 0.1 }); d.text(d.c.product.name, 0.06, 0.6, { size: 0.13, col: d.t.bg, max: 0.88 }); d.rect(0.06, 0.65, 0.3, 0.012, d.t.primary); d.text(d.c.product.detail.toUpperCase(), 0.06, 0.93, { size: 0.028, face: 'mono', col: d.t.bg }); }
  };
  ['box-front', 'label'].forEach((role) => A.add(role, Object.keys(pack).map((k) => ({ id: role + '-' + k, name: { minimal: 'Quiet label', editorial: 'Photo band', bold: 'Product name, oversize', friendly: 'Shapes', tech: 'Spec grid' }[k], kits: [k], draw: pack[k] }))));
  A.add('box-side', [{ id: 'bs-info', name: 'Side panel', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], async draw(d) { d.fill(d.kit === 'bold' ? d.t.secondary : d.t.surface); await d.logo(0.5, 0.1, 0.06, { kind: 'mark', align: 'center' }); d.text(d.c.features.map((f) => f[0]).join(' · '), 0.5, 0.9, { size: 0.06, face: 'body', align: 'center', wrap: 0.85 }); } }]);
  A.add('wrap', [
    { id: 'wr-label', name: 'Wrap label', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], async draw(d) {
      const bold = d.kit === 'bold' || d.kit === 'friendly', bg = bold ? d.t.primary : d.kit === 'tech' ? d.t.ink : d.t.bg, fg = fgOn(d, bg); d.fill(bg);
      if (d.kit === 'bold') d.rect(0, 0.7, 1, 0.3, d.t.secondary);
      if (d.kit === 'editorial' || d.kit === 'minimal') await d.photo('detail', 0.68, 0, 0.32, 1, { n: 9 });
      await d.logo(0.5, 0.2, 0.16, { kind: 'mark', align: 'center', variant: lv(d, bg) });
      await d.logo(0.5, 0.42, 0.12, { kind: 'word', align: 'center', variant: lv(d, bg) });
      d.text(d.c.product.name, 0.5, 0.68, { size: 0.03, col: d.kit === 'bold' ? d.t.onSecondary : fg, align: 'center', max: 0.3 });
      d.text(d.c.product.detail, 0.5, 0.86, { size: 0.012, col: d.kit === 'bold' ? d.t.onSecondary : fg, align: 'center', face: 'body', upper: true, track: 0.14 });
      d.text(d.c.sub, 0.04, 0.3, { size: 0.011, face: 'body', col: fg, wrap: 0.2, lh: 1.5 });
    } }
  ]);

  /* ---------------- merch ---------------- */
  const merch = (name, size) => ({ id: name, name: { 'm-lockup': 'Lockup', 'm-mark': 'Mark only', 'm-word': 'Wordmark, oversize', 'm-tag': 'Tagline' }[name], kits: [], async draw(d) {
    const bg = d.t.bg; d.fill(bg);
    if (name === 'm-lockup') await d.logo(0.5, 0.5, size, { align: 'center', base: 'middle' });
    if (name === 'm-mark') await d.logo(0.5, 0.5, size * 2.6, { kind: 'mark', align: 'center', base: 'middle' });
    if (name === 'm-word') await d.logo(0.5, 0.5, size * 1.4, { kind: 'word', align: 'center', base: 'middle' });
    if (name === 'm-tag') { await d.logo(0.5, 0.36, size * 0.8, { align: 'center', base: 'middle' }); d.text(d.c.billboard, 0.5, 0.62, { size: 0.08, align: 'center', wrap: 0.8 }); }
  } });
  ['tote', 'bag', 'tee'].forEach((role) => {
    const set = [merch('m-mark', 0.2), merch('m-lockup', 0.1), merch('m-word', 0.12), merch('m-tag', 0.09)];
    set[0].kits = ['minimal', 'tech']; set[1].kits = ['editorial']; set[2].kits = ['bold']; set[3].kits = ['friendly'];
    A.add(role, set.map((s) => Object.assign({}, s, { id: role + '-' + s.id })));
  });
  A.add('cap', [{ id: 'cap-mark', name: 'Mark', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], async draw(d) { d.fill(d.t.bg); await d.logo(0.5, 0.5, 0.5, { kind: 'mark', align: 'center', base: 'middle' }); } }]);

  /* ---------------- screens ---------------- */
  async function phoneHome(d) {
    const s = d.w / 390, t = d.t; const Y = (px) => px * s / d.h, X = (px) => px * s / d.w;
    d.fill(t.bg); d.text('9:41', X(30), Y(36), { size: 15 * s / d.w, face: 'body', weight: 700 });
    d.text(d.c.app.greeting, X(22), Y(110), { size: 26 * s / d.w, upper: false });
    d.rect(X(22), Y(130), X(346), Y(220), t.primary, { r: Math.min(t.radius + 4, 28) * s / d.w });
    await d.photo('detail', X(22), Y(130), X(346), Y(110), { n: 10, r: Math.min(t.radius + 4, 28) * s / d.w });
    d.text(d.c.app.metricLabel, X(40), Y(282), { size: 14 * s / d.w, face: 'body', col: t.onPrimary });
    d.text(d.c.app.metric, X(40), Y(328), { size: 36 * s / d.w, col: t.onPrimary, max: X(300) });
    d.text('Recent', X(22), Y(398), { size: 15 * s / d.w, face: 'body', weight: 700 });
    d.c.app.items.forEach(([k, v], i) => { const y = 418 + i * 66; d.rect(X(22), Y(y), X(346), Y(56), t.surface, { r: Math.min(t.radius, 16) * s / d.w }); d.rect(X(36), Y(y + 12), X(32), Y(32), [t.primary, t.secondary, t.accent][i], { r: 9 * s / d.w }); d.text(k, X(82), Y(y + 34), { size: 15 * s / d.w, face: 'body' }); d.text(v, X(354), Y(y + 34), { size: 15 * s / d.w, face: 'body', weight: 700, align: 'right' }); });
    d.rect(X(22), Y(640), X(346), Y(54), t.primary, { r: (t.rBtn > 100 ? 27 : t.rBtn) * s / d.w }); d.text(d.c.cta, 0.5, Y(673), { size: 16 * s / d.w, face: 'body', weight: 700, col: t.onPrimary, align: 'center' });
  }
  async function phoneEditorial(d) {
    const t = d.t; d.fill(t.bg);
    await d.photo('hero', 0, 0, 1, 0.62, { n: 11 });
    await d.logo(0.07, 0.035, 0.022, { variant: 'light' });
    d.text(d.c.tagline, 0.07, 0.69, { size: 0.035, face: 'body', col: t.primaryText, upper: true, track: 0.12, weight: 700 });
    d.text(d.c.story, 0.07, 0.75, { size: 0.1, wrap: 0.86 });
    d.rect(0.07, 0.88, 0.86, 0.055, t.primary, { r: t.rBtn > 100 ? 0.03 : t.rBtn / 390 }); d.text(d.c.cta, 0.5, 0.915, { size: 0.042, face: 'body', weight: 700, col: t.onPrimary, align: 'center' });
  }
  A.add('screen-phone', [
    { id: 'ph-home', name: 'Account home', kits: ['friendly', 'tech', 'bold'], draw: phoneHome },
    { id: 'ph-editorial', name: 'Editorial story', kits: ['editorial', 'minimal'], draw: phoneEditorial }
  ]);
  A.add('story', [{ id: 'st-editorial', name: 'Story', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], draw: phoneEditorial }]);

  async function webSplit(d) {
    const t = d.t; d.fill(t.bg);
    await d.photo('hero', 0.5, 0, 0.5, 1, { n: 12 });
    await d.logo(0.04, 0.05, 0.035);
    d.c.nav.slice(0, 3).forEach((n, i) => d.text(n, 0.25 + i * 0.065, 0.075, { size: 0.0105, face: 'body', col: t.muted }));
    d.text(d.c.tagline.toUpperCase(), 0.04, 0.33, { size: 0.009, face: 'body', col: t.primaryText, track: 0.14, weight: 700 });
    d.text(d.c.headline, 0.04, 0.42, { size: 0.045, wrap: 0.42, lh: 1.02 });
    d.text(d.c.sub, 0.04, 0.68, { size: 0.0125, face: 'body', col: t.muted, wrap: 0.36, lh: 1.55 });
    d.rect(0.04, 0.8, 0.13, 0.065, t.primary, { r: t.rBtn > 100 ? 0.02 : t.rBtn / 1440 }); d.text(d.c.cta, 0.105, 0.842, { size: 0.0105, face: 'body', weight: 700, col: t.onPrimary, align: 'center' });
  }
  async function webIndex(d) {
    const t = d.t; d.fill(t.bg);
    d.text(d.c.nav[0], 0.025, 0.05, { size: 0.0085, face: 'body' }); d.text(d.c.nav[3], 0.07, 0.05, { size: 0.0085, face: 'body' });
    await d.logo(0.5, 0.032, 0.03, { kind: 'word', align: 'center' });
    d.text(d.c.nav[1], 0.93, 0.05, { size: 0.0085, face: 'body', align: 'right' }); d.text(d.c.nav[2], 0.975, 0.05, { size: 0.0085, face: 'body', align: 'right' });
    await d.photo('product', 0.355, 0.17, 0.29, 0.58, { n: 13 });
    d.text(d.c.headline, 0.5, 0.84, { size: 0.02, align: 'center', max: 0.5 });
    d.text(d.c.features[0][0] + ' · ' + d.c.features[1][0], 0.025, 0.965, { size: 0.0085, face: 'body' }); d.text(d.c.stat, 0.975, 0.965, { size: 0.0085, face: 'body', align: 'right' });
  }
  async function webBig(d) {
    const t = d.t, bg = d.kit === 'bold' ? t.primary : t.bg, fg = fgOn(d, bg); d.fill(bg);
    d.text(d.c.tagline + '.', 0.028, 0.06, { size: 0.0115, face: 'body', weight: 700, col: fg, wrap: 0.25 });
    d.text('Menu ›', 0.972, 0.06, { size: 0.0115, face: 'body', weight: 700, col: fg, align: 'right' });
    d.text(d.b.name, 0.022, 0.62, { size: 0.21, col: fg, max: 0.96, track: -0.05 });
    d.text(d.c.stat, 0.028, 0.95, { size: 0.0095, face: 'body', col: fg }); d.text('Instagram   LinkedIn', 0.972, 0.95, { size: 0.0095, face: 'body', col: fg, align: 'right' });
  }
  async function webFull(d) {
    await d.photo('hero', 0, 0, 1, 1, { n: 14 });
    d.shade(0, 0, 1, 0.22, 'rgba(0,0,0,.32)', 'rgba(0,0,0,0)'); d.shade(0, 0.45, 1, 0.55, 'rgba(0,0,0,0)', 'rgba(0,0,0,.55)');
    await d.logo(0.03, 0.045, 0.035, { variant: 'light' }); d.c.nav.forEach((n, i) => d.text(n, 0.97 - (d.c.nav.length - 1 - i) * 0.075, 0.072, { size: 0.0105, face: 'body', col: '#fff', align: 'right' }));
    d.text(d.c.headline, 0.03, 0.83, { size: 0.042, col: '#fff', wrap: 0.6, base: 'bottom' });
    d.line(0.03, 0.885, 0.97, 0.885, { col: 'rgba(255,255,255,.45)', w: 0.0007 });
    d.text(d.c.tagline, 0.03, 0.94, { size: 0.0105, face: 'body', col: '#fff' }); d.text('01 / 04', 0.97, 0.94, { size: 0.0105, face: 'body', col: '#fff', align: 'right' });
  }
  const WEB = [
    { id: 'w-split', name: 'Split editorial', kits: ['friendly'], draw: webSplit },
    { id: 'w-index', name: 'Studio index', kits: ['minimal'], draw: webIndex },
    { id: 'w-big', name: 'Big-type statement', kits: ['bold', 'tech'], draw: webBig },
    { id: 'w-full', name: 'Full-bleed photo', kits: ['editorial'], draw: webFull }
  ];
  A.add('website', WEB); A.add('screen-laptop', WEB.map((w) => Object.assign({}, w, { id: 'lap-' + w.id })));
  A.add('screen-tablet', WEB.map((w) => Object.assign({}, w, { id: 'tab-' + w.id })));

  /* ---------------- social & deck ---------------- */
  A.add('social', [
    { id: 'so-photo', name: 'Photo + caption', kits: ['minimal', 'editorial', 'friendly'], async draw(d) { d.fill(d.t.bg); await d.photo('hero', 0, 0, 1, 0.78, { n: 15 }); await d.logo(0.06, 0.04, 0.026, { variant: 'light' }); d.text(d.c.social, 0.06, 0.86, { size: 0.05, wrap: 0.86 }); d.text('@' + web(d.b.name).replace('.com', ''), 0.94, 0.965, { size: 0.022, face: 'body', align: 'right', col: d.t.muted }); } },
    { id: 'so-type', name: 'Type on colour', kits: ['bold', 'tech'], async draw(d) { d.fill(d.t.primary); d.text(d.c.social, 0.07, 0.2, { size: 0.105, col: d.t.onPrimary, wrap: 0.84, lh: 1 }); await d.logo(0.07, 0.94, 0.03, { base: 'bottom', variant: 'reverse' }); } }
  ]);
  A.add('deck', [
    { id: 'dk-title', name: 'Title slide', kits: ['minimal', 'editorial', 'tech', 'bold', 'friendly'], async draw(d) { d.fill(d.t.bg); await d.photo('hero', 0.56, 0, 0.44, 1, { n: 16 }); await d.logo(0.05, 0.08, 0.04); d.text(d.c.webinar, 0.05, 0.42, { size: 0.048, wrap: 0.46 }); d.text(d.c.speaker[0] + ' · ' + d.c.speaker[1], 0.05, 0.86, { size: 0.0135, face: 'body', col: d.t.muted }); } }
  ]);
})();
