/* Powergrade app core: state, persistence, shell (top bar + direction sidebar), event routing, modals.
   Views register themselves in App.views and their handlers in App.act / App.inp / App.chg:
   any element with data-a="name" calls App.act[name](el, event); data-i / data-c do the same for input/change. */
window.PG = window.PG || {};

(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('powergrade2:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('powergrade2:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
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
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 17L17 7M9 7h8v8"/></svg>'
  };

  const RECIPES = [
    { n: 'Gen Z neobank', b: { industry: 'finance', func: 'b2c-app', audiences: ['genz', 'millennial'], tier: 'mid', strategy: 'balance', name: 'Lumen' } },
    { n: 'Luxury skincare, D2C', b: { industry: 'beauty', func: 'd2c-product', audiences: ['affluent', 'millennial'], tier: 'luxury', strategy: 'conform', name: 'Maison Rue' } },
    { n: 'Enterprise AI platform', b: { industry: 'ai', func: 'b2b-enterprise', audiences: ['enterprise', 'developers'], tier: 'premium', strategy: 'balance', name: 'Cortex' } },
    { n: 'Kids learning app', b: { industry: 'edu', func: 'b2c-app', audiences: ['kids', 'parents'], tier: 'value', strategy: 'conform', name: 'Brightpath' } },
    { n: 'Boutique harbour hotel', b: { industry: 'hospitality', func: 'retail-venue', audiences: ['affluent', 'millennial'], tier: 'premium', strategy: 'balance', name: 'The Linden' } },
    { n: 'Challenger soda', b: { industry: 'food', func: 'd2c-product', audiences: ['genz', 'mass'], tier: 'value', strategy: 'disrupt', name: 'Good Field' } },
    { n: 'Telehealth for over-60s', b: { industry: 'health', func: 'b2c-app', audiences: ['senior', 'parents'], tier: 'mid', strategy: 'conform', name: 'Kindred Health' } },
    { n: 'Home solar & batteries', b: { industry: 'energy', func: 'hardware', audiences: ['millennial', 'genx'], tier: 'mid', strategy: 'balance', name: 'Solace Energy' } },
    { n: 'Developer platform', b: { industry: 'devtools', func: 'b2b-smb', audiences: ['developers'], tier: 'mid', strategy: 'conform', name: 'Forge' } },
    { n: 'Food-rescue charity', b: { industry: 'nonprofit', func: 'mission', audiences: ['citizens', 'senior'], tier: 'value', strategy: 'conform', name: 'Common Ground' } },
    { n: 'Esports title', b: { industry: 'gaming', func: 'b2c-app', audiences: ['genz', 'active'], tier: 'mid', strategy: 'disrupt', name: 'Nightfall' } },
    { n: 'Corporate law firm', b: { industry: 'professional', func: 'service', audiences: ['enterprise', 'genx'], tier: 'premium', strategy: 'conform', name: 'Ashford & Vale' } },
    { n: 'Contemporary art museum', b: { industry: 'culture', func: 'mission', audiences: ['creatives', 'citizens'], tier: 'mid', strategy: 'balance', name: 'Kunsthal North' } },
    { n: 'EV launch', b: { industry: 'auto', func: 'hardware', audiences: ['affluent', 'millennial'], tier: 'premium', strategy: 'balance', name: 'Volta' } },
    { n: 'Running brand', b: { industry: 'sports', func: 'd2c-product', audiences: ['active', 'genz'], tier: 'mid', strategy: 'balance', name: 'Stride' } },
    { n: 'Smash-burger chain', b: { industry: 'restaurant', func: 'retail-venue', audiences: ['mass', 'genz'], tier: 'value', strategy: 'balance', name: 'Smash & Co' } }
  ];
  const DEFAULT_BRIEF = { name: 'Maison Rue', industry: 'beauty', func: 'd2c-product', audiences: ['affluent', 'millennial'], tier: 'luxury', strategy: 'conform', manual: {}, logo: null };

  const S = {
    view: LS.get('view', 'board'),
    ui: LS.get('ui', 'light'),
    brief: Object.assign({}, DEFAULT_BRIEF, LS.get('brief', {})),
    activeDir: LS.get('activeDir', null), pinned: LS.get('pinned', false),
    tunes: LS.get('tunes', {}),
    favs: new Set(LS.get('favs', [])),
    q: '', sideSub: 'suggested', sideOpen: false, ranking: null
  };
  if (!S.brief.manual) S.brief.manual = {};

  const App = PG.App = {
    S, $, $$, esc, clamp, LS, ICON, RECIPES, DEFAULT_BRIEF,
    views: {}, act: {}, inp: {}, chg: {},
    save() { LS.set('brief', S.brief); LS.set('tunes', S.tunes); LS.set('favs', [...S.favs]); LS.set('activeDir', S.activeDir); LS.set('pinned', S.pinned); LS.set('view', S.view); LS.set('ui', S.ui); },
    dir: (id) => PG.byId(PG.DIRECTIONS, id || S.activeDir),
    tune(id) { id = id || S.activeDir; return (S.tunes[id] = Object.assign(PG.defaultTune(PG.byId(PG.DIRECTIONS, id)), { layouts: {}, objects: {} }, S.tunes[id] || {})); },
    score: (id) => S.ranking.all.find((x) => x.dir.id === id).score,
    brand: () => PG.brandFor(S.brief),
    rerank() {
      S.ranking = PG.rank(S.brief, 8);
      if (!S.pinned || !PG.byId(PG.DIRECTIONS, S.activeDir)) { S.activeDir = S.ranking.shortlist[0].dir.id; S.pinned = false; }
    },
    setActive(id) { S.activeDir = id; S.pinned = id !== S.ranking.shortlist[0].dir.id; App.save(); },
    toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); },
    copy(text, ta) {
      const fail = () => { if (ta) { ta.focus(); ta.select(); } App.toast('Press Ctrl+C (⌘C) to copy the selected text'); };
      try { navigator.clipboard.writeText(text).then(() => App.toast('Copied to clipboard'), fail); } catch (e) { fail(); }
    },
    modal(title, html, big) {
      App.closeModal();
      const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal';
      m.innerHTML = `<div class="dlg${big ? ' big' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dlg-h"><h2>${title}</h2><button class="iconbtn" data-a="closeModal" aria-label="Close">×</button></div><div class="dlg-b">${html}</div></div>`;
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m) App.closeModal(); });
      return m;
    },
    closeModal() { const m = $('#modal'); if (m) m.remove(); },
    /* Re-render after the brief, direction or tuning changed. */
    changed(what) {
      if (what === 'brief') App.rerank();
      App.save();
      const v = App.views[S.view];
      if (v && v.refresh) v.refresh(what); else App.renderMain();
      App.renderSide();
    },
    hydrate(root) {
      PG.Mockups.hydrate(root, (o) => {
        const id = o.dir || S.activeDir;
        return { dir: PG.byId(PG.DIRECTIONS, id), tune: App.tune(id), brief: S.brief };
      });
    }
  };

  /* ================= shell ================= */
  const VIEWS = [['board', 'Board'], ['studio', 'Studio'], ['compare', 'Compare'], ['lab', 'Logo Lab'], ['library', 'Library']];
  App.renderTop = function () {
    const v = App.views[S.view];
    $('#top').innerHTML = `
      <button class="iconbtn only-narrow" data-a="side" aria-label="Show directions">${ICON.menu}</button>
      <div class="logo">${ICON.spark}<span>Powergrade</span></div>
      <nav class="nav">${VIEWS.map(([k, n]) => `<button class="${S.view === k ? 'on' : ''}" data-a="view" data-v="${k}">${n}</button>`).join('')}</nav>
      <div class="mid">${v && v.topTools ? v.topTools() : ''}</div>
      <button class="iconbtn hide-sm" data-a="theme" aria-label="Switch light or dark">${S.ui === 'dark' ? ICON.sun : ICON.moon}</button>
      <button class="iconbtn hide-sm" data-a="help" aria-label="Help">${ICON.help}</button>
      <button class="tbtn primary" data-a="export">${ICON.down}<span class="hide-sm">Export</span></button>`;
  };

  function thumb(d, feature) {
    const t = PG.tokens(d, App.tune(d.id), S.brief);
    const sc = App.score(d.id);
    const pick = PG.photoPicker(S.brief, t, 'thumb|' + d.id);
    const p = pick('hero', 0);
    const img = PG.photoImg(p, t, { grade: PG.gradeFor(d.id, App.tune(d.id)), thumb: true });
    const sw = `<span class="swd">${[t.bg, t.primary, t.secondary, t.accent].map((c) => `<i style="background:${c}"></i>`).join('')}</span>`;
    const aa = `<span class="aa" style="font-family:${t.fd.replace(/"/g, "'")};font-weight:${t.fdw};color:${t.ink};background:${t.bg};${t.upper ? 'text-transform:uppercase;' : ''}">Aa</span>`;
    if (feature) return `<button class="feature" data-a="pickDir" data-d="${d.id}"><div class="tv">${img}<span class="pill">${sc.total}% fit · ${sc.role}</span>${sw}${aa}</div><div class="nm">${esc(d.name)}</div><div class="sc">${esc(d.school)}</div></button>`;
    return `<button class="th ${d.id === S.activeDir ? 'on' : ''}" data-a="pickDir" data-d="${d.id}" title="${esc(d.summary)}"><div class="tv">${img}${sw}${aa}<span class="fit">${sc.total}%</span></div><div class="nm">${esc(d.name)}</div><div class="sc">${esc(d.school.split('·')[0])}</div></button>`;
  }
  App.thumb = thumb;
  const matchQ = (d, q) => !q || [d.name, d.school, d.summary, d.tags.join(' ')].join(' ').toLowerCase().includes(q.toLowerCase());
  App.matchQ = matchQ;

  App.renderSide = function () {
    const el = $('#side'); el.classList.toggle('open', S.sideOpen);
    const q = S.q; let inner = '';
    if (S.sideSub === 'recipes') {
      inner = `<p class="lbl">Starting briefs</p>` + RECIPES.map((r, i) => {
        const ind = PG.byId(PG.INDUSTRIES, r.b.industry);
        return `<button class="recipe" data-a="recipe" data-r="${i}"><b>${esc(r.n)}</b><span>${esc(ind.name)} · ${r.b.audiences.map((a) => PG.byId(PG.AUDIENCES, a).name.split(' (')[0]).join(' + ')} · ${esc(PG.byId(PG.TIERS, r.b.tier).name)}</span></button>`;
      }).join('');
    } else if (S.sideSub === 'saved') {
      const favs = PG.DIRECTIONS.filter((d) => S.favs.has(d.id) && matchQ(d, q));
      inner = favs.length ? `<div class="thumbs">${favs.map((d) => thumb(d)).join('')}</div>` : `<div class="empty">Nothing saved yet. Press ♡ Save on a direction to keep it here.</div>`;
    } else if (S.sideSub === 'all' || q) {
      const list = S.ranking.all.map((x) => x.dir).filter((d) => matchQ(d, q));
      inner = `<p class="lbl">${q ? list.length + ' matching' : 'All ' + PG.DIRECTIONS.length + ' directions'} · ranked for this brief</p><div class="thumbs">${list.map((d) => thumb(d)).join('')}</div>` + (list.length ? '' : '<div class="empty">No direction matches. Try a mood (calm, bold), a school (Bauhaus, Swiss) or a tag (luxury, kids).</div>');
    } else {
      const sl = S.ranking.shortlist.map((x) => x.dir);
      const rest = S.ranking.all.map((x) => x.dir).filter((d) => !sl.includes(d)).slice(0, 6);
      inner = `<p class="lbl">Best match</p>${thumb(sl[0], true)}<p class="lbl">Diverse shortlist</p><div class="thumbs">${sl.slice(1).map((d) => thumb(d)).join('')}</div><p class="lbl">Also strong</p><div class="thumbs">${rest.map((d) => thumb(d)).join('')}</div>`;
    }
    el.innerHTML = `<div class="side-h"><h2>Directions</h2><span class="note">${esc(App.brand().name)}</span></div>
      <label class="search">${ICON.search}<input id="side-q" type="text" data-i="sideQ" placeholder="Search name, school or tag" value="${esc(q)}" autocomplete="off"></label>
      <div class="subtabs">${[['suggested', 'Suggested'], ['all', 'All'], ['saved', 'Saved'], ['recipes', 'Briefs']].map(([k, v]) => `<button class="${S.sideSub === k ? 'on' : ''}" data-a="sideSub" data-s="${k}">${v}</button>`).join('')}</div>
      <div class="side-scroll">${inner}</div>`;
  };

  App.renderMain = function () {
    document.documentElement.setAttribute('data-ui', S.ui);
    const v = App.views[S.view] || App.views.board;
    $('#main').innerHTML = '';
    v.render($('#main'));
  };
  App.renderAll = function () { App.renderTop(); App.renderSide(); App.renderMain(); };

  /* ================= shared actions ================= */
  Object.assign(App.act, {
    view(el) { S.view = el.dataset.v; S.sideOpen = false; App.save(); App.renderAll(); },
    theme() { S.ui = S.ui === 'dark' ? 'light' : 'dark'; App.save(); document.documentElement.setAttribute('data-ui', S.ui); App.renderTop(); },
    side() { S.sideOpen = !S.sideOpen; App.renderSide(); },
    sideSub(el) { S.sideSub = el.dataset.s; App.renderSide(); },
    pickDir(el) { App.setActive(el.dataset.d); S.sideOpen = false; if (S.view === 'library' || S.view === 'compare') S.view = 'board'; App.renderAll(); },
    recipe(el) { const r = RECIPES[+el.dataset.r]; S.brief = Object.assign({}, DEFAULT_BRIEF, r.b, { manual: {}, logo: null }); S.pinned = false; S.sideOpen = false; App.changed('brief'); App.renderAll(); App.toast('Brief loaded: ' + r.n); },
    closeModal() { App.closeModal(); },
    copyText(el) { App.copy(el.dataset.t); },
    fav(el) { const id = el.dataset.d || S.activeDir; S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id); App.save(); App.renderSide(); const v = App.views[S.view]; if (v.refresh) v.refresh('fav'); },
    best() { S.pinned = false; App.changed('brief'); },
    shuffle() { const tn = App.tune(); tn.seed = Math.floor(Math.random() * 99991); App.changed('tune'); },
    help() {
      App.modal('How Powergrade works', `<div class="steps">
        <div><b>1 · Brief</b>Industry, business model, audiences and price tier. No logo or colours needed.</div>
        <div><b>2 · Directions</b>34 art directions are scored against the brief and shortlisted for variety, each with evidence.</div>
        <div><b>3 · Board</b>The active direction applied across web, app, social, print, packaging, devices and outdoor, with real photography and 3D renders.</div>
        <div><b>4 · Logo Lab</b>Pick or build a mark, choose a wordmark, test lockups. Everything updates across the board.</div>
        <div><b>5 · Compare & tune</b>Compare puts the shortlist side by side; Studio exposes every control on a node canvas.</div></div>
        <p class="note">Photography: CC0 and Unsplash-licensed images, graded per direction. 3D: three.js with CC0 lighting from Poly Haven. Your choices are remembered in this browser.</p>`);
    },
    export() { App.views.studio.openExport(); }
  });
  Object.assign(App.inp, {
    sideQ(el) { S.q = el.value; const pos = el.selectionStart; App.renderSide(); const n = $('#side-q'); n.focus(); n.setSelectionRange(pos, pos); }
  });

  /* ================= event routing ================= */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]'); if (!el) return;
    const fn = App.act[el.dataset.a]; if (fn) fn(el, e);
  });
  document.addEventListener('input', (e) => { const el = e.target.closest('[data-i]'); if (el && App.inp[el.dataset.i]) App.inp[el.dataset.i](el, e); });
  document.addEventListener('change', (e) => { const el = e.target.closest('[data-c]'); if (el && App.chg[el.dataset.c]) App.chg[el.dataset.c](el, e); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') App.closeModal(); });
})();
