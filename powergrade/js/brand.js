/* Brand adapter: the one place layouts get the logo from.
   b.logo = { mark: {family, params} | {grid: spec} | null, word: {style, params} | null, lockup: 'horizontal'|'stacked' }
   Without a chosen logo it falls back to the direction's default mark family (Logo Lab) or the basic marks in art.js.
   Variants: '' (on page), 'reverse' (on primary), 'inverse' (on ink), 'light' (white, on photos). */
window.PG = window.PG || {};

(function () {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = (n) => Math.round(n * 10) / 10;

  /* Direction → default mark family and wordmark style (ids from js/logolab.js, used once it loads). */
  const WORD = {
    swiss: 'wm-grotesk', institutional: 'wm-smallcaps', modernist: 'wm-geo-o', neofintech: 'wm-dot', gradient: 'wm-grotesk', darkprecision: 'wm-kinetic',
    scientific: 'wm-mono', editorialLux: 'wm-didone', quietLux: 'wm-smallcaps', artdeco: 'wm-fashion', heritage: 'wm-registered', brutalist: 'wm-stencil',
    friendlyGeo: 'wm-rounded', warmHuman: 'wm-soft-serif', softWellness: 'wm-serif-italic', clinical: 'wm-dot', organic: 'wm-soft-serif', handmade: 'wm-highlight',
    ecoOptimist: 'wm-underline', retro: 'wm-lined', y2k: 'wm-overlap', bauhaus: 'wm-geo-o', memphis: 'wm-split-colour', japaneseMinimal: 'wm-smallcaps',
    magazine: 'wm-condensed', dynamicSystem: 'wm-crop', maximal: 'wm-overlap', kinetic: 'wm-shear', kidsJoy: 'wm-rounded', civic: 'wm-boxed',
    cyber: 'wm-constructed', riso: 'wm-mixed', architectural: 'wm-extended', darkLuxury: 'wm-extended'
  };
  /* Default logo per direction: the first curated mark preset tagged for it, plus a matching wordmark style. */
  /* Brand object shared by all renderers. */
  const initials = (n) => n.split(' ').map((x) => x[0]).join('').slice(0, 2);
  PG.brandFor = function (brief) {
    const ind = PG.byId(PG.INDUSTRIES, brief.industry);
    const name = ((brief.name || '').trim() || ind.sampleName);
    return { name, initial: name.replace(/^the\s+/i, '').charAt(0).toUpperCase(), initials: initials(name.replace(/^the\s+/i, '')).toUpperCase(), logo: brief.logo || null };
  };

  /* Layout family per direction: recipes declare which families they suit. */
  const KIT = {
    minimal: ['quietLux', 'japaneseMinimal', 'softWellness', 'architectural', 'clinical'],
    editorial: ['editorialLux', 'magazine', 'heritage', 'artdeco', 'institutional', 'organic', 'warmHuman'],
    bold: ['brutalist', 'maximal', 'kinetic', 'retro', 'memphis', 'y2k', 'handmade', 'riso', 'bauhaus'],
    friendly: ['friendlyGeo', 'neofintech', 'kidsJoy', 'ecoOptimist', 'civic'],
    tech: ['darkprecision', 'gradient', 'scientific', 'cyber', 'dynamicSystem', 'darkLuxury', 'modernist', 'swiss']
  };
  PG.KITS = KIT;
  PG.kitOf = (id) => Object.keys(KIT).find((k) => KIT[k].includes(id)) || 'editorial';

  PG.DIR_LOGO = {};
  PG.initDirLogos = function () {
    if (!PG.MARK_PRESETS) return;
    PG.DIRECTIONS.forEach((d) => {
      const pre = PG.MARK_PRESETS.find((p) => (p.directions || []).includes(d.id));
      PG.DIR_LOGO[d.id] = { mark: pre ? { family: pre.family, params: pre.params } : null, word: WORD[d.id] ? { style: WORD[d.id], params: {} } : null };
    });
  };
  PG.initDirLogos();

  /* Wordmarks measure text, so their faces must be loaded first. Resolves once; then callers re-render. */
  const loadedStyles = new Set();
  PG.ensureLogoFonts = function (t, b) {
    if (!PG.wordmarkReady || !PG.WORDMARK_STYLES) return null;
    const ws = wordSpec(t, b), id = ws && ws.style;
    const key = (id || '') + '|' + t.display;
    if (loadedStyles.has(key)) return null;
    loadedStyles.add(key);
    const st = PG.WORDMARK_STYLES.filter((s) => s.id === id);
    return Promise.all([PG.wordmarkReady(st, { font: t.display, weight: t.fdw }), PG.markReady ? PG.markReady({ font: t.display, weight: t.fdw }) : null]);
  };

  function colorsFor(t, b, variant) {
    let fg = t.ink, mk = t.primary, on = t.onPrimary;
    if (variant === 'reverse') { fg = t.onPrimary; mk = t.onPrimary; on = t.primary; }
    else if (variant === 'inverse') { fg = t.bg; mk = PG.color.contrast(t.primary, t.ink) > 2.2 ? t.primary : t.bg; on = t.ink; }
    else if (variant === 'light') { fg = '#FFFFFF'; mk = '#FFFFFF'; on = '#111111'; }
    else if (PG.color.contrast(t.primary, t.bg) < 1.5) mk = t.ink;
    return { fg, mk, on };
  }
  const markSpec = (t, b) => (b.logo && b.logo.mark) || (PG.DIR_LOGO[t.dirId] && PG.DIR_LOGO[t.dirId].mark) || null;
  const wordSpec = (t, b) => (b.logo && b.logo.word) || (PG.DIR_LOGO[t.dirId] && PG.DIR_LOGO[t.dirId].word) || null;

  PG.brandMark = function (t, b, px, variant) {
    const spec = markSpec(t, b);
    const col = colorsFor(t, b, variant);
    if (spec && spec.none) return '';
    if (spec && spec.grid && PG.GRIDMARK) {
      const inner = PG.GRIDMARK.render(spec.grid, { fg: col.mk, bg: col.on, accent: variant ? col.mk : t.accent });
      return `<svg class="mk" viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true">${inner}</svg>`;
    }
    if (spec && spec.family && PG.renderMark && PG.MARK_FAMILIES) {
      try {
        return PG.renderMark(spec.family, spec.params || {}, { fg: col.mk, bg: col.on, accent: variant ? col.mk : t.accent, initial: b.initial, initials: b.initials, name: b.name, font: t.display, weight: t.fdw, seed: t.seed }, px).replace('<svg', '<svg class="mk"');
      } catch (e) { /* fall through to the basic mark */ }
    }
    return PG.mark(t, b, px, variant === 'inverse' ? 'light' : variant);
  };

  PG.brandWord = function (t, b, px, variant) {
    const spec = wordSpec(t, b);
    const col = colorsFor(t, b, variant);
    if (spec && spec.style && PG.WORDMARK_STYLES) {
      const st = PG.WORDMARK_STYLES.find((s) => s.id === spec.style);
      if (st) {
        try {
          const r = st.render(b.name, { fg: col.fg, bg: variant === 'reverse' ? t.primary : t.bg, accent: variant ? col.fg : t.primary, font: t.display, weight: t.fdw }, Object.assign({}, defaults(st), spec.params || {}));
          const h = px * 1.15, w = h * (r.w / r.h);
          return r.svg.replace('<svg', `<svg class="wm" width="${f(w)}" height="${f(h)}"`);
        } catch (e) { /* fall through */ }
      }
    }
    return `<span class="lk-w" style="font-size:${f(px)}px;color:${col.fg}">${esc(b.name)}</span>`;
  };
  const defaults = (st) => (st.params || []).reduce((o, p) => (o[p.id] = p.default, o), {});

  /* Wordmark as {svg, w, h} for canvas painting (null when the direction has no wordmark style). */
  PG.brandWordSvg = function (t, b, variant) {
    const spec = wordSpec(t, b);
    if (!spec || !spec.style || !PG.WORDMARK_STYLES) return null;
    const st = PG.WORDMARK_STYLES.find((s) => s.id === spec.style); if (!st) return null;
    const col = colorsFor(t, b, variant);
    try {
      const r = st.render(b.name, { fg: col.fg, bg: variant === 'reverse' ? t.primary : variant === 'inverse' ? t.ink : t.bg, accent: variant ? col.fg : t.primary, font: t.display, weight: t.fdw }, Object.assign({}, defaults(st), spec.params || {}));
      return { svg: r.svg, w: r.w, h: r.h };
    } catch (e) { return null; }
  };

  PG.brandLockup = function (t, b, px, variant) {
    const col = colorsFor(t, b, variant);
    const mk = PG.brandMark(t, b, Math.round(px * 1.2), variant);
    const stacked = b.logo && b.logo.lockup === 'stacked';
    const word = PG.brandWord(t, b, mk ? px * 0.92 : px * 1.05, variant);
    return `<span class="lk${stacked ? ' stk' : ''}" style="gap:${f(px * (stacked ? 0.3 : 0.4))}px;color:${col.fg}">${mk}${word}</span>`;
  };
})();
