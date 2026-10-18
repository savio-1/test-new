/* Logo Lab: mark families with live controls, curated presets, a grid constructor, wordmark styles
   and lockup tests (sizes, reversed, on colour). "Use for brand" applies the choice across every mockup. */
(function () {
  const App = PG.App, S = App.S, esc = App.esc, $ = App.$, $$ = App.$$;
  const L = App.LS.get('lab2', { tab: 'marks', group: 'all', family: null, params: {}, style: null, wparams: {}, grid: null, tool: { t: 'quarter', r: 0, color: 'fg' } });

  const ready = () => !!(PG.MARK_FAMILIES && PG.renderMark);
  const fam = (id) => (PG.MARK_FAMILIES || []).find((f) => f.id === id);
  const defaults = (list) => (list || []).reduce((o, p) => (o[p.id] = p.default, o), {});
  const saveL = () => App.LS.set('lab2', L);
  const tok = () => PG.tokens(App.dir(), App.tune(), S.brief);
  const colorsOn = (t, where) => {
    const b = App.brand();
    const base = { initial: b.initial, initials: b.initials, name: b.name, font: t.display, weight: t.fdw, seed: t.seed };
    if (where === 'primary') return { ...base, fg: t.onPrimary, bg: t.primary, accent: t.onPrimary };
    if (where === 'ink') return { ...base, fg: t.bg, bg: t.ink, accent: PG.color.contrast(t.primary, t.ink) > 2.2 ? t.primary : t.bg };
    return { ...base, fg: PG.color.contrast(t.primary, t.bg) < 1.5 ? t.ink : t.primary, bg: t.bg, accent: t.accent };
  };
  function markSvg(spec, c, px) {
    try {
      if (spec.grid && PG.GRIDMARK) return `<svg viewBox="0 0 100 100" width="${px}" height="${px}">${PG.GRIDMARK.render(spec.grid, c)}</svg>`;
      if (spec.family) return PG.renderMark(spec.family, spec.params || {}, c, px);
    } catch (e) { return `<span class="note">${esc(e.message)}</span>`; }
    return '';
  }
  function current() {
    if (L.tab === 'grid') return { grid: L.grid || (PG.GRIDMARK && PG.GRIDMARK.presets ? PG.GRIDMARK.presets[0].spec || PG.GRIDMARK.presets[0] : { cols: 3, rows: 3, cells: [] }) };
    const f = fam(L.family) || (PG.MARK_FAMILIES || [])[0];
    return f ? { family: f.id, params: Object.assign(defaults(f.params), L.params || {}) } : null;
  }
  function wordSvg(styleId, params, t, px, where) {
    const st = (PG.WORDMARK_STYLES || []).find((s) => s.id === styleId); if (!st) return '';
    const c = colorsOn(t, where);
    try {
      const r = st.render(App.brand().name, { fg: where === 'primary' ? t.onPrimary : where === 'ink' ? t.bg : t.ink, bg: c.bg, accent: c.fg, font: st.font || t.display, weight: st.weight || t.fdw }, Object.assign(defaults(st.params), params || {}));
      const h = px, w = h * r.w / r.h;
      return r.svg.replace('<svg', `<svg width="${Math.round(w)}" height="${Math.round(h)}" style="max-width:100%;height:auto"`);
    } catch (e) { return `<span class="note">${esc(e.message)}</span>`; }
  }

  /* Lockup inside an artboard scope so brand CSS variables apply. */
  const lockupPreview = (t, over) => `<span class="ab" style="position:relative;display:inline-flex;transform:none;background:transparent;overflow:visible;${PG.cssVars(t)}">${PG.brandLockup(t, Object.assign(App.brand(), { logo: Object.assign({}, S.brief.logo || {}, over) }), 16)}</span>`;
  function heroHtml(t) {
    const spec = L.tab === 'words' ? null : current();
    if (L.tab === 'words') {
      const id = L.style || ((PG.WORDMARK_STYLES || [])[0] || {}).id;
      return `<div class="lab-hero"><div style="background:${t.bg}">${wordSvg(id, L.wparams, t, 90)}<span class="lb">On paper</span></div>
        <div style="background:${t.primary}">${wordSvg(id, L.wparams, t, 40, 'primary')}<span class="lb" style="color:${t.onPrimary}">On primary</span></div>
        <div style="background:${t.ink}">${wordSvg(id, L.wparams, t, 40, 'ink')}<span class="lb" style="color:${t.bg}">Reversed</span></div>
        <div style="background:${t.bg}">${lockupPreview(t, { word: { style: id, params: L.wparams } })}<span class="lb">Lockup</span></div>
        <div style="background:var(--ui-card)"><span class="note" style="padding:20px;text-align:center">${esc(((PG.WORDMARK_STYLES || []).find((s) => s.id === id) || {}).desc || '')}</span></div></div>`;
    }
    if (!spec) return '';
    return `<div class="lab-hero"><div style="background:${t.bg}">${markSvg(spec, colorsOn(t), 220)}<span class="lb">On paper</span></div>
      <div style="background:${t.primary}">${markSvg(spec, colorsOn(t, 'primary'), 110)}<span class="lb" style="color:${t.onPrimary}">On primary</span></div>
      <div style="background:${t.ink}">${markSvg(spec, colorsOn(t, 'ink'), 110)}<span class="lb" style="color:${t.bg}">Reversed</span></div>
      <div style="background:var(--ui-card)"><div class="sizes">${[16, 24, 32, 48, 64].map((s) => markSvg(spec, colorsOn(t), s)).join('')}</div><span class="lb">Small sizes · favicon test</span></div>
      <div style="background:${t.bg}">${lockupPreview(t, { mark: spec })}<span class="lb">Lockup</span></div></div>`;
  }

  function galleryHtml(t) {
    if (!ready()) return '<div class="empty">The logo engine is still loading.</div>';
    const c = colorsOn(t);
    if (L.tab === 'marks') {
      const groups = [...new Set(PG.MARK_FAMILIES.map((f) => f.group))];
      return `<div class="chips" style="margin-bottom:18px">${['all', ...groups].map((g) => `<button class="${L.group === g ? 'on' : ''}" data-a="labGroup" data-g="${g}">${g === 'all' ? 'All' : esc(g)}</button>`).join('')}</div>
        <div class="mgrid">${PG.MARK_FAMILIES.filter((f) => L.group === 'all' || f.group === L.group).map((f) => `<button class="mcell ${f.id === (current() || {}).family ? 'on' : ''}" data-a="labFam" data-f="${f.id}"><div class="mv">${markSvg({ family: f.id, params: defaults(f.params) }, c, 76)}</div><span>${esc(f.name)}</span></button>`).join('')}</div>`;
    }
    if (L.tab === 'presets') {
      return `<div class="mgrid">${(PG.MARK_PRESETS || []).map((p, i) => `<button class="mcell" data-a="labPreset" data-i="${i}" title="${esc(p.note || '')}"><div class="mv">${markSvg({ family: p.family, params: p.params }, c, 76)}</div><span>${esc(p.name)}</span></button>`).join('')}</div>`;
    }
    if (L.tab === 'grid') {
      const G = PG.GRIDMARK; if (!G) return '<div class="empty">Grid constructor unavailable.</div>';
      const spec = current().grid, cells = spec.cells || [];
      const cellSvg = (cell) => { const one = { cols: 1, rows: 1, cells: [cell || { t: 'empty' }], gap: 0, radius: spec.radius || 0 }; try { return `<svg viewBox="0 0 100 100">${G.render(one, c)}</svg>`; } catch (e) { return ''; } };
      return `<div style="display:flex;gap:30px;flex-wrap:wrap;align-items:flex-start;margin-bottom:30px">
          <div class="gridedit" style="grid-template-columns:repeat(${spec.cols},1fr)">${Array.from({ length: spec.cols * spec.rows }, (_, i) => `<button data-a="labCell" data-i="${i}" aria-label="Cell ${i + 1}">${cellSvg(cells[i])}</button>`).join('')}</div>
          <div style="display:flex;flex-direction:column;gap:12px;min-width:220px"><p class="lbl" style="margin:0">Paint with</p>
            <div class="imgs" style="grid-template-columns:repeat(5,1fr)">${G.tiles.map((tl) => { const id = tl.id || tl; return `<button class="${L.tool.t === id ? 'on' : ''}" data-a="labTool" data-t="${id}" title="${esc(id)}"><div class="iv" style="aspect-ratio:1">${cellSvg({ t: id, r: L.tool.r, color: 'fg' })}</div></button>`; }).join('')}</div>
            <div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="tbtn sm" data-a="labRot">Rotate ↻ ${L.tool.r * 90}°</button><button class="tbtn sm" data-a="labCol">${L.tool.color === 'fg' ? 'Main colour' : 'Accent'}</button></div>
            <p class="note" style="margin:0">Click a cell to paint it. Click again with the same tile to clear it.</p></div></div>
        <p class="lbl">Presets</p><div class="mgrid">${(G.presets || []).map((p, i) => `<button class="mcell" data-a="labGridPreset" data-i="${i}"><div class="mv">${markSvg({ grid: p.spec || p }, c, 76)}</div><span>${esc(p.name || 'Preset ' + (i + 1))}</span></button>`).join('')}</div>`;
    }
    if (L.tab === 'words') {
      const list = PG.WORDMARK_STYLES || [];
      return `<div class="wgrid">${list.map((s) => `<button class="mcell ${s.id === L.style ? 'on' : ''}" data-a="labWord" data-s="${s.id}"><div class="mv" style="background:${t.bg}">${wordSvg(s.id, {}, t, 44)}</div><span>${esc(s.name)} · <span style="color:var(--ui-fg-3)">${esc(s.inspiredBy || '')}</span></span></button>`).join('')}</div>`;
    }
    return '';
  }

  function controlsHtml(t) {
    if (!ready()) return '';
    let params = [], vals = {}, title = '';
    if (L.tab === 'words') {
      const st = (PG.WORDMARK_STYLES || []).find((s) => s.id === L.style) || (PG.WORDMARK_STYLES || [])[0];
      if (st) { L.style = st.id; params = st.params || []; vals = Object.assign(defaults(params), L.wparams); title = st.name; }
    } else if (L.tab !== 'grid') {
      const f = fam((current() || {}).family); if (f) { params = f.params; vals = Object.assign(defaults(params), L.params); title = f.name; }
    } else {
      const spec = current().grid; title = 'Grid constructor';
      params = [{ id: 'cols', label: 'Columns', type: 'range', min: 2, max: 6, step: 1 }, { id: 'rows', label: 'Rows', type: 'range', min: 2, max: 6, step: 1 }, { id: 'gap', label: 'Gap', type: 'range', min: 0, max: 8, step: 1 }, { id: 'radius', label: 'Corner radius', type: 'range', min: 0, max: 20, step: 1 }];
      vals = { cols: spec.cols, rows: spec.rows, gap: spec.gap || 0, radius: spec.radius || 0 };
    }
    const ctrl = (p) => {
      const v = vals[p.id];
      if (p.type === 'select') return `<label class="f">${esc(p.label)}<select data-c="labParam" data-k="${p.id}">${(p.options || []).map((o) => `<option value="${esc(o.v)}"${String(o.v) === String(v) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
      if (p.type === 'bool') return `<label class="f">${esc(p.label)}<input class="chk" type="checkbox" data-c="labParam" data-k="${p.id}" ${v ? 'checked' : ''}></label>`;
      return `<label class="f">${esc(p.label)}<div class="rng"><input type="range" min="${p.min}" max="${p.max}" step="${p.step || 1}" value="${v}" data-i="labParam" data-k="${p.id}"><output>${v}</output></div></label>`;
    };
    const lessons = (PG.LOGO_LESSONS || []).slice(0, 12);
    const logo = S.brief.logo || {};
    return `<h3 class="h2">${esc(title)}<button class="tbtn sm" data-a="labRandom">${App.ICON.shuffle} Random</button></h3>
      ${params.map(ctrl).join('') || '<p class="note">No controls for this one.</p>'}
      ${L.tab === 'grid' ? `<label class="f">Symmetry<select data-c="labSym"><option value="auto">Auto</option><option value="none">None</option><option value="mirror-x">Mirror</option><option value="mirror-y">Mirror vertical</option><option value="rotational">Rotational</option></select></label>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><button class="tbtn primary" data-a="labApply">Use for ${esc(App.brand().name)}</button><button class="tbtn" data-a="labCopy">Copy SVG</button></div>
      <div class="note">${logo.mark || logo.word ? `Brand logo: ${logo.mark ? (logo.mark.grid ? 'grid mark' : esc((fam(logo.mark.family) || {}).name || 'custom mark')) : 'direction default mark'} + ${logo.word ? esc(((PG.WORDMARK_STYLES || []).find((s) => s.id === logo.word.style) || {}).name || 'custom wordmark') : 'typeset wordmark'}. <button class="link" data-a="labReset">Reset to direction default</button>` : 'The board uses the direction\'s default logo until you choose one here.'}</div>
      <div class="f">Lockup<div class="seg">${['horizontal', 'stacked'].map((k) => `<button class="${(logo.lockup || 'horizontal') === k ? 'on' : ''}" data-a="labLockup" data-k="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
      <div class="f">No symbol<input class="chk" type="checkbox" data-c="labNoMark" ${logo.mark && logo.mark.none ? 'checked' : ''}></div>
      ${lessons.length ? `<p class="lbl" style="margin-top:18px">Lessons from the greats</p>${lessons.map((l) => `<div class="lesson"><b>${esc(l.brand)}</b> <span style="color:var(--ui-fg-3)">${esc(l.studio || '')}${l.year ? ', ' + l.year : ''}</span><br>${esc(l.lesson)}${l.link ? ` <button class="link" data-a="labLesson" data-k="${l.link.kind}" data-i="${l.link.id}">Try it →</button>` : ''}</div>`).join('')}` : ''}`;
  }

  function render(main) {
    const t = tok();
    const tabs = [['marks', 'Mark families'], ['presets', 'Curated marks'], ['grid', 'Grid constructor'], ['words', 'Wordmarks']];
    main.innerHTML = `<div class="lab"><div class="lab-l" id="lab-l">
      <div class="bhead" style="margin-bottom:22px"><div><h1 style="font-size:24px">Logo Lab</h1><div class="sub">Build ${esc(App.brand().name)}'s mark and wordmark in the colours and type of ${esc(App.dir().name)}. Choices apply to every mockup.</div></div>
        <div class="seg">${tabs.map(([k, v]) => `<button class="${L.tab === k ? 'on' : ''}" data-a="labTab" data-k="${k}">${v}</button>`).join('')}</div></div>
      <div id="lab-hero">${heroHtml(t)}</div><div id="lab-gal">${galleryHtml(t)}</div></div>
      <div class="lab-r" id="lab-r">${controlsHtml(t)}</div></div>`;
  }
  const redraw = (parts) => {
    const t = tok();
    if (!parts || parts.includes('hero')) { const h = $('#lab-hero'); if (h) h.innerHTML = heroHtml(t); }
    if (!parts || parts.includes('gal')) { const g = $('#lab-gal'); if (g) g.innerHTML = galleryHtml(t); }
    if (!parts || parts.includes('ctl')) { const r = $('#lab-r'); if (r) r.innerHTML = controlsHtml(t); }
    saveL();
  };

  App.views.lab = {
    render(main) {
      render(main);
      if (PG.wordmarkReady && PG.WORDMARK_STYLES && L.tab === 'words') PG.wordmarkReady(PG.WORDMARK_STYLES).then(() => redraw(['gal', 'hero']));
    },
    refresh() { App.renderMain(); }
  };

  const randomFor = (params) => params.reduce((o, p) => {
    if (p.type === 'select') o[p.id] = p.options[Math.floor(Math.random() * p.options.length)].v;
    else if (p.type === 'bool') o[p.id] = Math.random() > 0.5;
    else { const st = p.step || 1; o[p.id] = Math.round((p.min + Math.random() * (p.max - p.min)) / st) * st; }
    return o;
  }, {});

  Object.assign(App.act, {
    labTab(el) { L.tab = el.dataset.k; saveL(); App.renderMain(); if (L.tab === 'words' && PG.wordmarkReady) PG.wordmarkReady(PG.WORDMARK_STYLES).then(() => redraw(['gal', 'hero'])); },
    labGroup(el) { L.group = el.dataset.g; redraw(['gal']); },
    labFam(el) { L.family = el.dataset.f; L.params = {}; redraw(); },
    labPreset(el) { const p = PG.MARK_PRESETS[+el.dataset.i]; L.tab = 'marks'; L.family = p.family; L.params = Object.assign({}, p.params); saveL(); App.renderMain(); },
    labWord(el) { L.style = el.dataset.s; L.wparams = {}; redraw(['hero', 'ctl']); $$('#lab-gal .mcell').forEach((b) => b.classList.toggle('on', b.dataset.s === L.style)); },
    labGridPreset(el) { const p = PG.GRIDMARK.presets[+el.dataset.i]; L.grid = JSON.parse(JSON.stringify(p.spec || p)); redraw(); },
    labTool(el) { L.tool.t = el.dataset.t; redraw(['gal']); },
    labRot() { L.tool.r = (L.tool.r + 1) % 4; redraw(['gal']); },
    labCol() { L.tool.color = L.tool.color === 'fg' ? 'accent' : 'fg'; redraw(['gal']); },
    labCell(el) {
      const spec = L.grid = JSON.parse(JSON.stringify(current().grid)), i = +el.dataset.i;
      spec.cells = spec.cells || []; const cur = spec.cells[i];
      spec.cells[i] = cur && cur.t === L.tool.t && cur.r === L.tool.r ? { t: 'empty' } : { t: L.tool.t, r: L.tool.r, color: L.tool.color };
      redraw(['hero', 'gal']);
    },
    labRandom() {
      if (L.tab === 'grid') { const g = current().grid; L.grid = PG.GRIDMARK.random(Math.floor(Math.random() * 1e6), g.cols, g.rows, { symmetry: L.sym || 'auto' }); }
      else if (L.tab === 'words') { const st = PG.WORDMARK_STYLES[Math.floor(Math.random() * PG.WORDMARK_STYLES.length)]; L.style = st.id; L.wparams = randomFor(st.params || []); }
      else { const f = fam((current() || {}).family); if (f) L.params = randomFor(f.params); }
      redraw();
    },
    labApply() {
      const logo = Object.assign({}, S.brief.logo || {});
      if (L.tab === 'words') logo.word = { style: L.style, params: Object.assign({}, L.wparams) };
      else logo.mark = current();
      S.brief.logo = logo; App.changed('logo'); App.toast('Logo applied to every mockup');
    },
    labLesson(el) { if (el.dataset.k === 'wordmark') { L.tab = 'words'; L.style = el.dataset.i; L.wparams = {}; } else { L.tab = 'marks'; L.family = el.dataset.i; L.params = {}; } saveL(); App.renderMain(); },
    labReset() { S.brief.logo = null; App.changed('logo'); },
    labLockup(el) { S.brief.logo = Object.assign({}, S.brief.logo || {}, { lockup: el.dataset.k }); App.changed('logo'); },
    labCopy() {
      const t = tok();
      const svg = L.tab === 'words' ? wordSvg(L.style, L.wparams, t, 120) : markSvg(current(), colorsOn(t), 512);
      App.copy(svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
    }
  });
  Object.assign(App.inp, {
    labParam(el) {
      const k = el.dataset.k, v = +el.value;
      if (L.tab === 'grid') { const g = L.grid = JSON.parse(JSON.stringify(current().grid)); g[k] = v; if (k === 'cols' || k === 'rows') g.cells = (g.cells || []).slice(0, g.cols * g.rows); }
      else if (L.tab === 'words') L.wparams[k] = v; else L.params[k] = v;
      const o = el.parentElement.querySelector('output'); if (o) o.textContent = v;
      redraw(L.tab === 'grid' ? ['hero', 'gal'] : ['hero']);
    }
  });
  Object.assign(App.chg, {
    labParam(el) { const k = el.dataset.k, v = el.type === 'checkbox' ? el.checked : (isNaN(+el.value) ? el.value : +el.value); if (L.tab === 'words') L.wparams[k] = v; else L.params[k] = v; redraw(['hero']); },
    labSym(el) { L.sym = el.value; },
    labNoMark(el) { S.brief.logo = Object.assign({}, S.brief.logo || {}, { mark: el.checked ? { none: true } : null }); App.changed('logo'); }
  });
})();
