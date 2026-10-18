/* Powergrade app core: state, persistence, shell (top bar, direction library, inspector), event routing.
   Flow: Brief → 3 routes (art directions) → the same applications on real photo mockups for each route.
   Views register in App.views; handlers in App.act / App.inp / App.chg via data-a / data-i / data-c. */
window.PG = window.PG || {};

(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('powergrade3:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('powergrade3:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  const ICON = {
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 2c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M18.5 13c.3 2.2 1.1 3 3.3 3.3-2.2.3-3 1.1-3.3 3.3-.3-2.2-1.1-3-3.3-3.3 2.2-.3 3-1.1 3.3-3.3z" opacity=".7"/></svg>',
    zin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5M8 11h6M11 8v6"/></svg>',
    zout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5M8 11h6"/></svg>',
    fit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 4v12M6 11l6 6 6-6M4 20h16"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 17L17 7M9 7h8v8"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  const RECIPES = [
    { n: 'Luxury skincare, D2C', b: { industry: 'beauty', func: 'd2c-product', audiences: ['affluent', 'millennial'], tier: 'luxury', strategy: 'conform', name: 'Maison Rue' } },
    { n: 'Gen Z neobank', b: { industry: 'finance', func: 'b2c-app', audiences: ['genz', 'millennial'], tier: 'mid', strategy: 'balance', name: 'Lumen' } },
    { n: 'Enterprise AI platform', b: { industry: 'ai', func: 'b2b-enterprise', audiences: ['enterprise', 'developers'], tier: 'premium', strategy: 'balance', name: 'Cortex' } },
    { n: 'Boutique harbour hotel', b: { industry: 'hospitality', func: 'retail-venue', audiences: ['affluent', 'millennial'], tier: 'premium', strategy: 'balance', name: 'The Linden' } },
    { n: 'Challenger soda', b: { industry: 'food', func: 'd2c-product', audiences: ['genz', 'mass'], tier: 'value', strategy: 'disrupt', name: 'Good Field' } },
    { n: 'Contemporary art museum', b: { industry: 'culture', func: 'mission', audiences: ['creatives', 'citizens'], tier: 'mid', strategy: 'balance', name: 'Kunsthal North' } },
    { n: 'Specialty coffee roaster', b: { industry: 'restaurant', func: 'retail-venue', audiences: ['millennial', 'creatives'], tier: 'premium', strategy: 'balance', name: 'Field Notes Coffee' } },
    { n: 'Climate hardware', b: { industry: 'energy', func: 'hardware', audiences: ['millennial', 'genx'], tier: 'mid', strategy: 'balance', name: 'Solace Energy' } },
    { n: 'Architecture practice', b: { industry: 'realestate', func: 'service', audiences: ['affluent', 'creatives'], tier: 'premium', strategy: 'conform', name: 'Fieldhouse' } },
    { n: 'Kids learning app', b: { industry: 'edu', func: 'b2c-app', audiences: ['kids', 'parents'], tier: 'value', strategy: 'conform', name: 'Brightpath' } },
    { n: 'Corporate law firm', b: { industry: 'professional', func: 'service', audiences: ['enterprise', 'genx'], tier: 'premium', strategy: 'conform', name: 'Ashford & Vale' } },
    { n: 'Running brand', b: { industry: 'sports', func: 'd2c-product', audiences: ['active', 'genz'], tier: 'mid', strategy: 'balance', name: 'Stride' } }
  ];
  const DEFAULT_BRIEF = { name: 'Maison Rue', industry: 'beauty', func: 'd2c-product', audiences: ['affluent', 'millennial'], tier: 'luxury', strategy: 'conform', manual: {}, logo: null };

  const S = {
    view: LS.get('view', 'canvas'),
    ui: LS.get('ui', 'light'),
    brief: Object.assign({}, DEFAULT_BRIEF, LS.get('brief', {})),
    routes: LS.get('routes', null),              // [{ dir, pinned }] × 3
    route: LS.get('route', 0),                   // active route index
    apps: LS.get('apps', null),                  // application slots: [{ id, mock }]
    tunes: LS.get('tunes', {}),
    favs: new Set(LS.get('favs', [])),
    sel: { kind: 'brief' },                      // inspector selection: brief | route(i) | app(id)
    q: '', sideSub: 'suggested', sideOpen: false, ranking: null
  };
  if (!S.brief.manual) S.brief.manual = {};

  const App = PG.App = {
    S, $, $$, esc, clamp, LS, ICON, RECIPES, DEFAULT_BRIEF,
    views: {}, act: {}, inp: {}, chg: {}, inspectors: {},
    save() { ['brief', 'routes', 'route', 'apps', 'tunes', 'view', 'ui'].forEach((k) => LS.set(k, S[k])); LS.set('favs', [...S.favs]); },
    dirId: (i) => S.routes[i == null ? S.route : i].dir,
    dir: (id) => PG.byId(PG.DIRECTIONS, id || App.dirId()),
    tune(id) { id = id || App.dirId(); return (S.tunes[id] = Object.assign(PG.defaultTune(PG.byId(PG.DIRECTIONS, id)), { art: {} }, S.tunes[id] || {})); },
    score: (id) => S.ranking.all.find((x) => x.dir.id === id).score,
    brand: () => PG.brandFor(S.brief),
    rerank() {
      S.ranking = PG.rank(S.brief, 8);
      const sl = S.ranking.shortlist.map((x) => x.dir.id);
      if (!S.routes) S.routes = sl.slice(0, 3).map((dir) => ({ dir, pinned: false }));
      // Unpinned routes follow the shortlist; pinned ones keep the user's choice.
      const taken = new Set(S.routes.filter((r) => r.pinned).map((r) => r.dir));
      const pool = sl.filter((d) => !taken.has(d));
      S.routes = S.routes.map((r) => (r.pinned && PG.byId(PG.DIRECTIONS, r.dir) ? r : { dir: pool.shift() || sl[0], pinned: false }));
      S.route = clamp(S.route, 0, S.routes.length - 1);
    },
    /* Everything needed to paint artwork for a route. */
    artCtx(i) {
      const dir = App.dir(App.dirId(i)), tune = App.tune(dir.id), t = PG.tokens(dir, tune, S.brief);
      const ind = PG.byId(PG.INDUSTRIES, S.brief.industry), b = App.brand();
      const pick = PG.photoPicker(S.brief, t, (tune.seed || 1) + '|art');
      return { t, c: ind.copy, b, dir, kit: PG.kitOf(dir.id), grade: PG.gradeFor(dir.id, tune), pick: (r, n) => pick(r, n || 0), key: JSON.stringify([dir.id, tune, S.brief.name, S.brief.industry, S.brief.audiences, S.brief.logo]) };
    },
    toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); },
    copy(text, ta) {
      const fail = () => { if (ta) { ta.focus(); ta.select(); } App.toast('Press Ctrl+C (⌘C) to copy the selected text'); };
      try { navigator.clipboard.writeText(text).then(() => App.toast('Copied to clipboard'), fail); } catch (e) { fail(); }
    },
    modal(title, html, big) {
      App.closeModal();
      const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal';
      m.innerHTML = `<div class="dlg${big ? ' big' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dlg-h"><h2>${title}</h2><button class="iconbtn" data-a="closeModal" aria-label="Close">${ICON.x}</button></div><div class="dlg-b">${html}</div></div>`;
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m) App.closeModal(); });
      return m;
    },
    closeModal() { const m = $('#modal'); if (m) m.remove(); },
    select(sel) { S.sel = sel; App.renderInspector(); const v = App.views[S.view]; if (v && v.onSelect) v.onSelect(); },
    /* Re-render after a change. what: brief | route | tune | logo | apps */
    changed(what) {
      if (what === 'brief') App.rerank();
      App.save();
      const v = App.views[S.view];
      if (v && v.refresh) v.refresh(what); else App.renderMain();
      App.renderSide(); App.renderInspector();
    }
  };

  /* ================= shell ================= */
  const VIEWS = [['canvas', 'Canvas'], ['present', 'Present'], ['mockups', 'Mockups'], ['lab', 'Logo'], ['library', 'References']];
  App.renderTop = function () {
    const v = App.views[S.view], b = S.brief, ind = PG.byId(PG.INDUSTRIES, b.industry);
    $('#top').innerHTML = `
      <button class="iconbtn only-narrow" data-a="side" aria-label="Show directions">${ICON.menu}</button>
      <div class="logo">${ICON.spark}<span>Powergrade</span></div>
      <nav class="nav">${VIEWS.map(([k, n]) => `<button class="${S.view === k ? 'on' : ''}" data-a="view" data-v="${k}">${n}</button>`).join('')}</nav>
      <div class="mid">${v && v.topTools ? v.topTools() : ''}</div>
      <button class="briefchip hide-sm" data-a="editBrief" title="Edit the brief"><b>${esc(App.brand().name)}</b><span>${esc(ind.name)} · ${esc(PG.byId(PG.TIERS, b.tier).name)}</span></button>
      <button class="iconbtn hide-sm" data-a="theme" aria-label="Switch light or dark">${S.ui === 'dark' ? ICON.sun : ICON.moon}</button>
      <button class="iconbtn hide-sm" data-a="help" aria-label="Help">${ICON.help}</button>`;
  };

  /* Direction thumbnail: one real photo graded to the direction, palette dots, type sample. */
  function thumb(d) {
    const t = PG.tokens(d, App.tune(d.id), S.brief), sc = App.score(d.id);
    const p = PG.photoPicker(S.brief, t, 'thumb|' + d.id)('hero', 0);
    const inRoute = S.routes.findIndex((r) => r.dir === d.id);
    return `<button class="th ${inRoute >= 0 ? 'on' : ''}" data-a="assignDir" data-d="${d.id}" title="${esc(d.summary)}">
      <div class="tv">${PG.photoImg(p, t, { grade: PG.gradeFor(d.id, App.tune(d.id)), thumb: true })}<span class="swd">${[t.bg, t.primary, t.secondary, t.accent].map((c) => `<i style="background:${c}"></i>`).join('')}</span>
      <span class="aa" style="font-family:${t.fd.replace(/"/g, "'")};font-weight:${t.fdw};color:${t.ink};background:${t.bg};${t.upper ? 'text-transform:uppercase;' : ''}">Aa</span><span class="fit">${inRoute >= 0 ? 'Route ' + 'ABC'[inRoute] : sc.total + '%'}</span></div>
      <div class="nm">${esc(d.name)}</div><div class="sc">${esc(d.school.split('·')[0])}</div></button>`;
  }
  App.thumb = thumb;
  const matchQ = (d, q) => !q || [d.name, d.school, d.summary, d.tags.join(' ')].join(' ').toLowerCase().includes(q.toLowerCase());
  App.matchQ = matchQ;

  App.renderSide = function () {
    const el = $('#side'); el.classList.toggle('open', S.sideOpen);
    const q = S.q; let inner = '';
    if (S.sideSub === 'briefs') {
      inner = `<p class="lbl">Starting briefs</p>` + RECIPES.map((r, i) => {
        const ind = PG.byId(PG.INDUSTRIES, r.b.industry);
        return `<button class="recipe" data-a="recipe" data-r="${i}"><b>${esc(r.n)}</b><span>${esc(ind.name)} · ${r.b.audiences.map((a) => PG.byId(PG.AUDIENCES, a).name.split(' (')[0]).join(' + ')}</span></button>`;
      }).join('');
    } else {
      const list = (S.sideSub === 'all' || q ? S.ranking.all.map((x) => x.dir) : S.ranking.shortlist.map((x) => x.dir)).filter((d) => matchQ(d, q));
      inner = `<p class="lbl">${S.sideSub === 'all' || q ? list.length + ' directions · ranked for this brief' : 'Shortlist for this brief'}</p>
        <p class="note" style="margin:-4px 0 14px">Click a direction to put it in the selected route (${'ABC'[S.route]}).</p>
        <div class="thumbs">${list.map(thumb).join('')}</div>`;
    }
    el.innerHTML = `<div class="side-h"><h2>Directions</h2></div>
      <label class="search">${ICON.search}<input id="side-q" type="text" data-i="sideQ" placeholder="Search name, school or tag" value="${esc(q)}" autocomplete="off"></label>
      <div class="subtabs">${[['suggested', 'Shortlist'], ['all', 'All 34'], ['briefs', 'Briefs']].map(([k, v]) => `<button class="${S.sideSub === k ? 'on' : ''}" data-a="sideSub" data-s="${k}">${v}</button>`).join('')}</div>
      <div class="side-scroll">${inner}</div>`;
  };

  App.renderInspector = function () {
    const el = $('#insp'); if (!el) return;
    const v = App.views[S.view];
    if (!v || !v.inspector) { el.hidden = true; document.querySelector('.body').classList.remove('has-insp'); return; }
    el.hidden = false; document.querySelector('.body').classList.add('has-insp');
    const kind = S.sel.kind, fn = App.inspectors[kind] || App.inspectors.brief;
    el.innerHTML = fn(S.sel);
  };

  App.renderMain = function () {
    document.documentElement.setAttribute('data-ui', S.ui);
    const v = App.views[S.view] || App.views.canvas;
    $('#main').innerHTML = '';
    v.render($('#main'));
    const p = PG.ensureLogoFonts && PG.ensureLogoFonts(PG.tokens(App.dir(), App.tune(), S.brief), App.brand());
    if (p) p.then(() => App.renderMain());
  };
  App.renderAll = function () { App.renderTop(); App.renderSide(); App.renderInspector(); App.renderMain(); };

  /* ================= shared actions ================= */
  Object.assign(App.act, {
    view(el) { S.view = el.dataset.v; S.sideOpen = false; App.save(); App.renderAll(); },
    theme() { S.ui = S.ui === 'dark' ? 'light' : 'dark'; App.save(); document.documentElement.setAttribute('data-ui', S.ui); App.renderTop(); },
    side() { S.sideOpen = !S.sideOpen; App.renderSide(); },
    sideSub(el) { S.sideSub = el.dataset.s; App.renderSide(); },
    editBrief() { if (S.view !== 'canvas') { S.view = 'canvas'; App.renderAll(); } App.select({ kind: 'brief' }); },
    assignDir(el) { S.routes[S.route] = { dir: el.dataset.d, pinned: true }; S.sideOpen = false; App.select({ kind: 'route', i: S.route }); App.changed('route'); },
    recipe(el) { const r = RECIPES[+el.dataset.r]; S.brief = Object.assign({}, DEFAULT_BRIEF, r.b, { manual: {}, logo: null }); S.routes = null; S.apps = null; S.sideOpen = false; App.changed('brief'); App.renderAll(); App.toast('Brief loaded: ' + r.n); },
    closeModal() { App.closeModal(); },
    copyText(el) { App.copy(el.dataset.t); },
    fav(el) { const id = el.dataset.d || App.dirId(); S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id); App.save(); App.renderInspector(); },
    help() {
      App.modal('How Powergrade works', `<div class="steps">
        <div><b>1 · Brief</b>Name, industry, audience and price tier. No logo or colours needed.</div>
        <div><b>2 · Routes</b>Three contrasting art directions are picked from a library of 34, each with evidence. Swap any route from the left panel.</div>
        <div><b>3 · Applications</b>Every route is placed on the same real photo mockups, so you compare like for like. Add your own PSD mockups in Mockups.</div>
        <div><b>4 · Present</b>Turn any route into a case-study page, the way studios present work.</div></div>
        <p class="note">Select any card on the canvas to edit it in the right panel. Photography is CC0/Unsplash-licensed; imported mockups stay in this browser.</p>`);
    }
  });
  Object.assign(App.inp, {
    sideQ(el) { S.q = el.value; const pos = el.selectionStart; App.renderSide(); const n = $('#side-q'); n.focus(); n.setSelectionRange(pos, pos); }
  });

  /* ================= event routing ================= */
  document.addEventListener('click', (e) => { const el = e.target.closest('[data-a]'); if (!el) return; const fn = App.act[el.dataset.a]; if (fn) fn(el, e); });
  document.addEventListener('input', (e) => { const el = e.target.closest('[data-i]'); if (el && App.inp[el.dataset.i]) App.inp[el.dataset.i](el, e); });
  document.addEventListener('change', (e) => { const el = e.target.closest('[data-c]'); if (el && App.chg[el.dataset.c]) App.chg[el.dataset.c](el, e); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') App.closeModal(); });
})();
