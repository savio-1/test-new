/* Board: the active direction presented as a case study. Soft grey frames, one application per frame,
   real photography, 3D product renders, and quiet captions with a layout cycler under each piece. */
(function () {
  const App = PG.App, S = App.S, esc = App.esc, $ = App.$, $$ = App.$$;
  const B = { cols: App.LS.get('boardCols', 2), filter: 'all' };

  /* Board items. html: one or more layouts of an HTML touchpoint; 3d: a PG.Mockups kind. */
  const ITEMS = [
    { id: 'website', type: 'html', tp: 'website', span: 2, group: 'Digital' },
    { id: 'packaging', type: '3d', kind: 'packaging', group: 'Physical' },
    { id: 'app', type: 'html', tp: 'app', multi: ['home', 'feed', 'detail'], span: 2, group: 'Digital', label: 'Mobile app' },
    { id: 'stationery', type: '3d', kind: 'stationery', group: 'Print' },
    { id: 'identity', type: 'html', tp: 'identity', span: 2, group: 'Brand' },
    { id: 'poster', type: 'html', tp: 'poster', group: 'Print' },
    { id: 'social', type: 'html', tp: 'social', multi: 3, span: 2, group: 'Social', label: 'Social posts' },
    { id: 'devices', type: '3d', kind: 'devices', group: 'Digital' },
    { id: 'webinar', type: 'html', tp: 'webinar', span: 2, group: 'Events' },
    { id: 'story', type: 'html', tp: 'story', multi: 2, group: 'Social', label: 'Stories' },
    { id: 'outdoor', type: '3d', kind: 'outdoor', group: 'Physical' },
    { id: 'email', type: 'html', tp: 'email', group: 'Digital' },
    { id: 'banner', type: 'html', tp: 'banner', group: 'Social' },
    { id: 'billboard', type: 'html', tp: 'billboard', span: 2, group: 'Physical', label: 'Billboard (flat)' }
  ];
  const GROUPS = ['all', 'Digital', 'Social', 'Print', 'Physical', 'Brand', 'Events'];

  function layoutsOf(tp) { return Object.keys(PG.TEMPLATES[tp].layouts); }
  function currentLayout(tp) { const tn = App.tune(); return (tn.layouts && tn.layouts[tp]) || PG.defaultLayout(tp, S.activeDir); }
  /* For multi items, the visible set starts at the current layout and continues through the list. */
  function multiLayouts(it) {
    if (Array.isArray(it.multi)) return it.multi;
    const all = layoutsOf(it.tp), start = Math.max(0, all.indexOf(currentLayout(it.tp)));
    return Array.from({ length: Math.min(it.multi, all.length) }, (_, i) => all[(start + i) % all.length]);
  }
  function currentObject(kind) { const tn = App.tune(); return (tn.objects && tn.objects[kind]) || PG.Mockups.defaultObject(kind, S.brief); }

  function caption(it) {
    const T = it.type === 'html' ? PG.TEMPLATES[it.tp] : null;
    if (it.type === '3d') {
      const name = currentObject(it.kind), av = PG.Mockups.available(it.kind);
      return `<div class="cap"><span><b>${esc(it.kind[0].toUpperCase() + it.kind.slice(1))}</b><span class="muted">${esc(PG.Mockups.NAMES[name] || name)}</span></span>
        ${av.length > 1 ? `<span class="cyc"><button data-a="cycObj" data-k="${it.kind}" data-dir="-1" aria-label="Previous object">‹</button>${av.length} objects<button data-a="cycObj" data-k="${it.kind}" data-dir="1" aria-label="Next object">›</button></span>` : ''}</div>`;
    }
    const lay = T.layouts[currentLayout(it.tp)];
    const n = layoutsOf(it.tp).length;
    return `<div class="cap"><span><b>${esc(it.label || T.name)}</b><span class="muted">${it.multi ? n + ' layouts' : esc(lay.name)}</span></span>
      ${n > 1 && !Array.isArray(it.multi) ? `<span class="cyc"><button data-a="cycLay" data-tp="${it.tp}" data-dir="-1" aria-label="Previous layout">‹</button>${esc(it.multi ? 'More' : (layoutsOf(it.tp).indexOf(currentLayout(it.tp)) + 1) + ' / ' + n)}<button data-a="cycLay" data-tp="${it.tp}" data-dir="1" aria-label="Next layout">›</button></span>` : ''}</div>`;
  }

  function fillFrame(it, frame) {
    const d = App.dir(), tn = App.tune();
    const pad = Math.round(frame.clientWidth * 0.06);
    const W = frame.clientWidth - pad * 2, H = frame.clientHeight - pad * 2;
    if (it.type === '3d') {
      frame.classList.add('bleed');
      frame.innerHTML = PG.Mockups.slot(it.kind, currentObject(it.kind), { w: 1600, h: Math.round(1600 * frame.clientHeight / frame.clientWidth) }) + hover(it);
      App.hydrate(frame);
      return;
    }
    const lays = it.multi ? multiLayouts(it) : [currentLayout(it.tp)];
    const gap = 22, bw = (W - gap * (lays.length - 1)) / lays.length;
    frame.innerHTML = lays.map((l, i) => PG.renderBoard(it.tp, d, tn, S.brief, { w: bw, h: H }, { layout: l, salt: i }).html).join('') + hover(it);
    if (PG.TEMPLATES[it.tp].frame) $$('.stage', frame).forEach((s) => s.classList.add('noshadow'));
  }
  const hover = (it) => `<div class="hover"><button class="rbtn" data-a="openItem" data-it="${it.id}" aria-label="Open large">${App.ICON.arrow}</button></div>`;

  function layoutGrid(root) {
    const gal = $('.gal', root); if (!gal) return;
    const cols = window.innerWidth <= 860 ? 1 : window.innerWidth <= 1200 ? Math.min(2, B.cols) : B.cols;
    const colW = (gal.clientWidth - 30 * (cols - 1)) / cols;
    gal.style.setProperty('--cols', cols);
    $$('.gi', gal).forEach((g) => {
      const it = ITEMS.find((x) => x.id === g.dataset.it);
      const span = Math.min(it.span || 1, cols);
      g.style.gridColumn = `span ${span}`;
      const f = $('.frame', g);
      f.style.aspectRatio = 'auto';
      // A full-row item in two columns gets a taller frame so websites and spreads read large.
      const k = cols === 1 ? 0.78 : cols === 2 ? (span === 2 ? 1.0 : 0.78) : 0.8;
      f.style.height = Math.round(colW * k) + 'px';
    });
    $$('.gi', gal).forEach((g) => fillFrame(ITEMS.find((x) => x.id === g.dataset.it), $('.frame', g)));
  }

  App.views.board = {
    topTools() {
      return `<div class="seg hide-sm">${[2, 3].map((n) => `<button class="${B.cols === n ? 'on' : ''}" data-a="boardCols" data-n="${n}">${n} col</button>`).join('')}</div>`;
    },
    render(main) {
      const d = App.dir(), sc = App.score(d.id), ind = PG.byId(PG.INDUSTRIES, S.brief.industry);
      const items = ITEMS.filter((it) => B.filter === 'all' || it.group === B.filter);
      main.innerHTML = `<div class="scroll" id="bscroll"><div class="board">
        <div class="bhead"><div><h1>${esc(App.brand().name)} — ${esc(d.name)}</h1>
          <div class="sub">${esc(d.summary)} <span class="muted">${sc.total}% fit for ${esc(ind.name)} · ${esc(PG.GRADE_NAMES[PG.gradeFor(d.id, App.tune())])} photography.</span></div></div>
          <div class="acts"><div class="chips">${GROUPS.map((g) => `<button class="${B.filter === g ? 'on' : ''}" data-a="boardFilter" data-g="${g}">${g === 'all' ? 'All' : g}</button>`).join('')}</div>
          <button class="tbtn sm" data-a="shuffle">${App.ICON.shuffle} New photos</button><button class="tbtn sm" data-a="fav">${S.favs.has(d.id) ? '♥ Saved' : '♡ Save'}</button>${S.pinned ? '<button class="tbtn sm" data-a="best">Best match</button>' : ''}<button class="tbtn sm" data-a="view" data-v="lab">Logo Lab</button></div></div>
        <div class="gal">${items.map((it) => `<div class="gi" data-it="${it.id}"><div class="frame"></div>${caption(it)}</div>`).join('')}</div></div></div>`;
      requestAnimationFrame(() => layoutGrid(main));
    },
    refresh() { App.renderMain(); },
    resize() { layoutGrid($('#main')); }
  };

  Object.assign(App.act, {
    boardCols(el) { B.cols = +el.dataset.n; App.LS.set('boardCols', B.cols); App.renderTop(); layoutGrid($('#main')); },
    boardFilter(el) { B.filter = el.dataset.g; App.renderMain(); },
    cycLay(el) {
      const tp = el.dataset.tp, all = layoutsOf(tp), tn = App.tune();
      const i = all.indexOf(currentLayout(tp));
      tn.layouts = tn.layouts || {}; tn.layouts[tp] = all[(i + (+el.dataset.dir) + all.length) % all.length];
      App.save(); refreshItem(tp);
    },
    cycObj(el) {
      const k = el.dataset.k, av = PG.Mockups.available(k), tn = App.tune();
      const i = av.indexOf(currentObject(k));
      tn.objects = tn.objects || {}; tn.objects[k] = av[(i + (+el.dataset.dir) + av.length) % av.length];
      App.save(); refreshItem(k);
    },
    openItem(el) {
      const it = ITEMS.find((x) => x.id === el.dataset.it), d = App.dir(), tn = App.tune();
      if (it.type === '3d') {
        const m = App.modal(`${esc(it.kind[0].toUpperCase() + it.kind.slice(1))} · ${esc(PG.Mockups.NAMES[currentObject(it.kind)])}`, `<div class="lightbox">${PG.Mockups.slot(it.kind, currentObject(it.kind), { w: 2000, h: 1500 })}</div>
          <div class="row" style="display:flex;gap:8px;flex-wrap:wrap">${(PG.Studio3D && PG.Studio3D.CAMERAS ? Object.keys(PG.Studio3D.CAMERAS) : ['hero']).map((c) => `<button class="tbtn sm" data-a="cam" data-k="${it.kind}" data-c="${c}">${c}</button>`).join('')}</div>`, true);
        App.hydrate(m);
        return;
      }
      const lays = it.multi ? multiLayouts(it) : [currentLayout(it.tp)];
      const W = Math.min(1220, window.innerWidth - 120), n = lays.length;
      App.modal(`${esc(it.label || PG.TEMPLATES[it.tp].name)}`, `<div class="lightbox" style="display:flex;gap:20px;justify-content:center">${lays.map((l, i) => PG.renderBoard(it.tp, d, tn, S.brief, { w: (W - 20 * (n - 1)) / n - 40, h: window.innerHeight * 0.68 }, { layout: l, salt: i }).html).join('')}</div>
        <p class="note">${lays.map((l) => `<b>${esc(PG.TEMPLATES[it.tp].layouts[l].name)}</b>: ${esc(PG.TEMPLATES[it.tp].layouts[l].ref)}`).join(' · ')}</p>`, true);
    },
    cam(el) {
      const lb = $('#modal .lightbox'); if (!lb) return;
      lb.innerHTML = PG.Mockups.slot(el.dataset.k, currentObject(el.dataset.k), { w: 2000, h: 1500, camera: el.dataset.c });
      App.hydrate(lb);
    }
  });

  function refreshItem(key) {
    const g = $$('.gi').find((x) => { const it = ITEMS.find((i) => i.id === x.dataset.it); return it && (it.tp === key || it.kind === key); });
    if (!g) return App.renderMain();
    $$('.gi').forEach((x) => {
      const it = ITEMS.find((i) => i.id === x.dataset.it);
      if (it.tp === key || it.kind === key) { x.querySelector('.cap').outerHTML = caption(it); fillFrame(it, $('.frame', x)); }
    });
  }

  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const v = App.views[S.view]; if (v && v.resize) v.resize(); }, 160); });
  App.boardItems = ITEMS;
})();
