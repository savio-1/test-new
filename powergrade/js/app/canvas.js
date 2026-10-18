/* Canvas: Brief → three routes → the same applications for every route, on real photo mockups.
   Nodes are compact cards; selecting one opens its settings in the right-hand inspector. */
(function () {
  const App = PG.App, S = App.S, esc = App.esc, $ = App.$, $$ = App.$$, clamp = App.clamp, ICON = App.ICON;
  const C = { zoom: 0.62, pan: { x: 40, y: 30 }, fitted: false };
  const APP_W = 300, APP_H = 225, ROW = APP_H + 76, X_ROUTE = 330, X_APPS = 640;
  const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;

  const apps = () => (S.apps = S.apps || PG.Mocks.defaults(S.brief.industry));

  /* ---------------- nodes ---------------- */
  function briefCard() {
    const b = S.brief, ind = PG.byId(PG.INDUSTRIES, b.industry);
    const on = S.sel.kind === 'brief' ? ' sel' : '';
    return `<div class="node brief${on}" style="left:0;top:${(S.routes.length * ROW) / 2 - 110}px;width:270px" data-a="selBrief">
      <div class="nk">Brief</div><div class="nbig">${esc(App.brand().name)}</div>
      <div class="nchips"><span>${esc(ind.name)}</span><span>${esc(PG.byId(PG.FUNCTIONS, b.func).name)}</span>${b.audiences.map((a) => `<span>${esc(PG.byId(PG.AUDIENCES, a).name.split(' (')[0])}</span>`).join('')}<span>${esc(PG.byId(PG.TIERS, b.tier).name)}</span><span>${esc(PG.byId(PG.STRATEGIES, b.strategy).name)}</span></div>
      <div class="nlink">Edit brief →</div></div>`;
  }
  function routeCard(i) {
    const d = App.dir(App.dirId(i)), sc = App.score(d.id), t = PG.tokens(d, App.tune(d.id), S.brief);
    const on = S.sel.kind === 'route' && S.sel.i === i ? ' sel' : '';
    return `<div class="node route${on}" style="left:${X_ROUTE}px;top:${i * ROW + 6}px;width:270px;height:${APP_H}px" data-a="selRoute" data-i="${i}">
      <div class="nk">Route ${'ABC'[i]} <span>${sc.total}% fit</span></div>
      <div class="rlogo ab" style="position:relative;transform:none;overflow:visible;background:${t.bg};${PG.cssVars(t)}">${PG.brandLockup(t, App.brand(), 20)}</div>
      <div class="nname">${esc(d.name)}</div><div class="nsub">${esc(d.school)}</div>
      <div class="ndots">${[t.bg, t.ink, t.primary, t.secondary, t.accent].map((c) => `<i style="background:${c}"></i>`).join('')}<span style="font-family:${t.fd.replace(/"/g, "'")};font-weight:${t.fdw}">Aa</span></div></div>`;
  }
  function appHeader(slot, j) {
    const lb = PG.Mocks.label(slot), on = S.sel.kind === 'app' && S.sel.id === slot.id ? ' on' : '';
    return `<button class="colh${on}" style="left:${X_APPS + j * (APP_W + 24)}px;top:-46px;width:${APP_W}px" data-a="selApp" data-id="${slot.id}"><b>${esc(lb.title)}</b><span>${esc(lb.sub)}</span></button>`;
  }
  function appCell(slot, i, j) {
    const on = S.sel.kind === 'app' && S.sel.id === slot.id && S.route === i ? ' sel' : '';
    return `<div class="node cell${on}" style="left:${X_APPS + j * (APP_W + 24)}px;top:${i * ROW + 6}px;width:${APP_W}px;height:${APP_H}px" data-a="selCell" data-id="${slot.id}" data-i="${i}">
      <div class="m3d loading" data-app="${slot.id}" data-route="${i}"></div></div>`;
  }

  function build(main) {
    const A = apps();
    main.innerHTML = `<div class="canvas" id="canvas"><div class="world" id="world">
      <svg class="wires" id="wires" width="1" height="1"></svg>
      ${briefCard()}${S.routes.map((_, i) => routeCard(i)).join('')}
      ${A.map(appHeader).join('')}
      <button class="colh add" style="left:${X_APPS + A.length * (APP_W + 24)}px;top:-46px;width:160px" data-a="addApp">${ICON.plus} Add application</button>
      ${S.routes.map((_, i) => A.map((s, j) => appCell(s, i, j)).join('')).join('')}
    </div></div>
    <div class="dock"><button data-a="fit">Fit</button><button data-a="shuffleAll">${ICON.shuffle} New photos</button><button class="tbtn primary" data-a="presentRoute">Present route ${'ABC'[S.route]} →</button></div>`;
    wires(); apply(); bind(); hydrate();
    if (!C.fitted) { C.fitted = true; requestAnimationFrame(fit); }
  }
  function wires() {
    const svg = $('#wires'); if (!svg) return;
    const by = (S.routes.length * ROW) / 2 - 110 + 70;
    svg.innerHTML = S.routes.map((_, i) => { const y = i * ROW + 60; return `<path d="M270,${by} C310,${by} 290,${y} ${X_ROUTE},${y}"/><path class="dash" d="M${X_ROUTE + 270},${y} L${X_APPS},${y}"/>`; }).join('');
  }
  /* Fill cells progressively: each is a real composite of the route's artwork on the mockup photo. */
  function hydrate(root) {
    const A = apps();
    $$('.m3d[data-app]', root || $('#world')).forEach((el) => {
      const slot = A.find((s) => s.id === el.dataset.app), i = +el.dataset.route;
      if (!slot) return;
      const ctx = App.artCtx(i), tune = App.tune(App.dirId(i));
      PG.Mocks.render(slot, ctx, tune, 900).then((url) => {
        if (!el.isConnected) return;
        el.outerHTML = `<img class="r3d${slot.flat ? ' flat' : ''}" src="${url}" alt="${esc(PG.Mocks.label(slot).title)}, route ${'ABC'[i]}">`;
      }).catch((e) => { if (el.isConnected) { el.classList.remove('loading'); el.textContent = e.message; } });
    });
  }
  App.hydrateApps = hydrate;

  function apply() {
    const world = $('#world'), cv = $('#canvas'); if (!world) return;
    world.style.transform = `translate(${C.pan.x}px,${C.pan.y}px) scale(${C.zoom})`;
    cv.style.backgroundSize = `${22 * C.zoom}px ${22 * C.zoom}px`; cv.style.backgroundPosition = `${C.pan.x}px ${C.pan.y}px`;
    const zv = $('#zoomv'); if (zv) zv.textContent = Math.round(C.zoom * 100) + '%';
  }
  function fit() {
    const cv = $('#canvas'); if (!cv) return;
    const w = X_APPS + (apps().length + 0.7) * (APP_W + 24), h = S.routes.length * ROW + 60;
    C.zoom = clamp(Math.min((cv.clientWidth - 60) / w, (cv.clientHeight - 140) / h), 0.25, 1);
    C.pan.x = 30; C.pan.y = 56 + 46 * C.zoom; apply();
  }
  function zoomBy(f) { const cv = $('#canvas'); if (!cv) return; const cx = cv.clientWidth / 2, cy = cv.clientHeight / 2, nz = clamp(C.zoom * f, 0.2, 2); C.pan.x = cx - (cx - C.pan.x) * (nz / C.zoom); C.pan.y = cy - (cy - C.pan.y) * (nz / C.zoom); C.zoom = nz; apply(); }
  function bind() {
    const cv = $('#canvas'); let drag = null, moved = false;
    cv.addEventListener('pointerdown', (e) => { if (e.button !== 0 || e.target.closest('.node,.colh')) return; drag = { sx: e.clientX, sy: e.clientY, ox: C.pan.x, oy: C.pan.y }; moved = false; cv.classList.add('panning'); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; moved = true; C.pan.x = drag.ox + e.clientX - drag.sx; C.pan.y = drag.oy + e.clientY - drag.sy; apply(); });
    const end = () => { drag = null; cv.classList.remove('panning'); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.01)); else { C.pan.x -= e.deltaX; C.pan.y -= e.deltaY; apply(); } }, { passive: false });
    void moved;
  }

  /* ---------------- inspectors ---------------- */
  const sec = (title, body, open) => `<details class="isec"${open ? ' open' : ''}><summary>${title}</summary><div class="ibody">${body}</div></details>`;

  App.inspectors.brief = function () {
    const b = S.brief, ind = PG.byId(PG.INDUSTRIES, b.industry), target = PG.targetAxes(b);
    const groups = [...new Set(PG.INDUSTRIES.map((i) => i.group))];
    const audOpts = (sel, none) => (none ? opt('', 'None', !sel) : '') + PG.AUDIENCES.map((a) => opt(a.id, a.name, a.id === sel)).join('');
    return `<div class="ih"><span class="nk">Brief</span><h3>${esc(App.brand().name)}</h3><p class="note">Four answers are enough. The routes update as you edit.</p></div>
      <div class="ibody">
        <label class="f">Brand name<input type="text" data-i="briefName" value="${esc(b.name)}" placeholder="${esc(ind.sampleName)}" maxlength="28"></label>
        <label class="f">Industry<select data-c="brief" data-k="industry">${groups.map((g) => `<optgroup label="${esc(g)}">${PG.INDUSTRIES.filter((i) => i.group === g).map((i) => opt(i.id, i.name, i.id === b.industry)).join('')}</optgroup>`).join('')}</select></label>
        <label class="f">Business<select data-c="brief" data-k="func">${PG.FUNCTIONS.map((x) => opt(x.id, x.name, x.id === b.func)).join('')}</select></label>
        <label class="f">Audience<select data-c="brief" data-k="aud0">${audOpts(b.audiences[0])}</select></label>
        <label class="f">Also for<select data-c="brief" data-k="aud1">${audOpts(b.audiences[1], true)}</select></label>
        <label class="f">Price tier<select data-c="brief" data-k="tier">${PG.TIERS.map((x) => opt(x.id, x.name, x.id === b.tier)).join('')}</select></label>
        <div class="f">Approach<div class="seg">${PG.STRATEGIES.map((s) => `<button class="${b.strategy === s.id ? 'on' : ''}" data-a="strategy" data-s="${s.id}" title="${esc(s.note)}">${s.name}</button>`).join('')}</div></div>
        <p class="note">${esc(PG.byId(PG.STRATEGIES, b.strategy).note)}</p></div>
      ${sec('Personality', PG.AXES.map((a) => `<div class="axis"><span>${a.lo}</span><input type="range" min="0" max="100" value="${target[a.id]}" data-i="axis" data-c="axisDone" data-k="${a.id}" class="${b.manual[a.id] != null ? 'manual' : ''}" aria-label="${a.lo} to ${a.hi}"><span>${a.hi}</span></div>`).join('') + (Object.keys(b.manual).length ? '<button class="link" data-a="autoAxes">Reset to the brief</button>' : ''))}
      ${sec(esc(ind.name) + ' codes', `<ul class="note" style="margin:0;padding-left:16px">${ind.codes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`)}`;
  };

  App.inspectors.route = function (sel) {
    const i = sel.i, d = App.dir(App.dirId(i)), tune = App.tune(d.id), sc = App.score(d.id), t = PG.tokens(d, tune, S.brief);
    const sl = S.ranking.shortlist.map((x) => x.dir.id);
    const dirSel = `<optgroup label="Shortlist">${sl.map((id) => opt(id, PG.byId(PG.DIRECTIONS, id).name + ' · ' + App.score(id).total + '%', id === d.id)).join('')}</optgroup><optgroup label="All directions">${S.ranking.all.filter((x) => !sl.includes(x.dir.id)).map((x) => opt(x.dir.id, x.dir.name + ' · ' + x.score.total + '%', x.dir.id === d.id)).join('')}</optgroup>`;
    const rng = (key, min, max, val, fmt) => `<div class="rng"><input type="range" min="${min}" max="${max}" value="${val}" data-i="tuneRange" data-c="tuneDone" data-k="${key}" aria-label="${key}"><output>${fmt(val)}</output></div>`;
    const fonts = Object.keys(PG.FONTS).sort();
    const ev = PG.evidence(d, S.brief.industry).slice(0, 4);
    const why = PG.explain(d, S.brief, sc);
    return `<div class="ih"><span class="nk">Route ${'ABC'[i]} · ${sc.total}% fit</span><h3>${esc(d.name)}</h3><p class="note">${esc(d.summary)}</p>
        <label class="f">Direction<select data-c="routeDir" data-i2="${i}">${dirSel}</select></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="tbtn sm primary" data-a="presentRoute" data-i="${i}">Present →</button><button class="tbtn sm" data-a="view" data-v="lab">Edit logo</button><button class="tbtn sm" data-a="shuffleRoute" data-i="${i}">${ICON.shuffle} Photos</button></div></div>
      ${sec('Why this route', `<div class="why">${why.map((l) => `<div class="${l.warn ? 'warn' : ''}"><b>${esc(l.k)}.</b> ${esc(l.v)}</div>`).join('')}</div><div class="refs">${ev.map((r) => `<a class="ref" href="${PG.refSearchUrl(r)}" target="_blank" rel="noopener"><b>${esc(r.brand)} · ${r.year || 'n.d.'}</b><span class="conf ${r.conf}">${r.conf}</span><span>${esc(r.by)}</span></a>`).join('')}</div>`, true)}
      ${sec('Colour', `<div class="f">Palette<div class="seg">${d.palettes.map((p, k) => `<button class="${tune.pal === k ? 'on' : ''}" data-a="tuneSet" data-k="pal" data-v="${k}" data-num="1">${esc(p.name)}</button>`).join('')}</div></div>
        <div class="f">Mode<div class="seg">${['auto', 'light', 'dark'].map((m) => `<button class="${tune.mode === m ? 'on' : ''}" data-a="tuneSet" data-k="mode" data-v="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div></div>
        <label class="f">Hue${rng('hue', -60, 60, tune.hue, (v) => (v > 0 ? '+' : '') + v + '°')}</label><label class="f">Saturation${rng('sat', -60, 60, tune.sat, (v) => (v > 0 ? '+' : '') + v + '%')}</label>
        <div class="swrow">${[['bg', t.bg], ['text', t.ink], ['primary', t.primary], ['second', t.secondary], ['accent', t.accent], ['surface', t.surface]].map(([k, v]) => `<button class="sw" data-a="copyText" data-t="${v}"><i style="background:${v}"></i><span>${k}<br>${v}</span></button>`).join('')}</div>
        <div class="qa">${t.qa.map((q) => `<div><span>${q.label}</span><span class="mono" style="font-size:11px">${q.ratio.toFixed(1)}:1</span><span class="badge ${q.ratio >= q.need ? 'ok' : 'no'}">${q.ratio >= q.need ? 'pass' : 'fail'}</span></div>`).join('')}</div>`)}
      ${sec('Type', `<label class="f">Display<select data-c="tuneSel" data-k="display">${fonts.map((f) => opt(f, f, f === t.display)).join('')}</select></label><label class="f">Body<select data-c="tuneSel" data-k="body">${fonts.map((f) => opt(f, f, f === t.body)).join('')}</select></label><label class="f">Uppercase<input class="chk" type="checkbox" data-c="tuneUpper" ${t.upper ? 'checked' : ''}></label>`)}
      ${sec('Photography', `<label class="f">Grade<select data-c="tuneSel" data-k="grade">${Object.keys(PG.GRADE_NAMES).map((k) => opt(k, PG.GRADE_NAMES[k], k === PG.gradeFor(d.id, tune))).join('')}</select></label>`)}`;
  };

  App.inspectors.app = function (sel) {
    const slot = apps().find((s) => s.id === sel.id); if (!slot) return App.inspectors.brief();
    const lb = PG.Mocks.label(slot), d = App.dir(), tune = App.tune(d.id);
    const roles = slot.flat ? [slot.flat] : PG.Mocks.roles(PG.Mocks.byId(slot.mock) || { surfaces: [] });
    const cats = [...new Set(PG.Mocks.all().map((m) => m.category))];
    return `<div class="ih"><span class="nk">Application</span><h3>${esc(lb.title)}</h3><p class="note">${esc(lb.sub)}. Applies to all three routes.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="tbtn sm" data-a="openApp" data-id="${slot.id}">${ICON.arrow} Open large</button><button class="tbtn sm" data-a="rmApp" data-id="${slot.id}">Remove</button></div></div>
      ${sec(`Artwork for route ${'ABC'[S.route]}`, roles.map((r) => { const L = PG.Artwork.LAYOUTS[r] || PG.Artwork.LAYOUTS.poster, cur = (tune.art && tune.art[r]) || PG.Artwork.pick(r, d.id).id; return `<label class="f">${esc(PG.Mocks.ROLE_NAMES[r] || r)}<select data-c="artLayout" data-r="${r}">${L.map((l) => opt(l.id, l.name + (l.by ? ' · after ' + l.by : ''), l.id === cur)).join('')}</select></label>`; }).join('') + '<p class="note">Layouts are drawn from how leading studios design these pieces.</p>', true)}
      ${sec('Mockup', `<div class="chips" style="margin-bottom:10px">${['all', ...cats].map((c) => `<button class="${(S.mockCat || 'all') === c ? 'on' : ''}" data-a="mockCat" data-c="${c}">${esc(c)}</button>`).join('')}</div>
        <div class="mpick">${PG.Mocks.all().filter((m) => !S.mockCat || S.mockCat === 'all' || m.category === S.mockCat).map((m) => `<button class="${slot.mock === m.id ? 'on' : ''}" data-a="setMock" data-id="${slot.id}" data-m="${m.id}" title="${esc(m.name)}">${m.thumb ? `<img src="${m.thumb}" alt="" loading="lazy">` : `<span>${esc(m.name)}</span>`}</button>`).join('')}
        ${['website', 'social', 'deck', 'poster'].map((f) => `<button class="flat ${slot.flat === f ? 'on' : ''}" data-a="setFlat" data-id="${slot.id}" data-f="${f}"><span>Flat ${esc(PG.Mocks.ROLE_NAMES[f])}</span></button>`).join('')}</div>
        <p class="note">Need a specific object? Import any PSD mockup in <button class="link" data-a="view" data-v="mockups">Mockups</button>.</p>`, true)}`;
  };

  /* ---------------- view ---------------- */
  App.views.canvas = {
    inspector: true,
    topTools: () => `<button class="iconbtn hide-sm" data-a="zout" aria-label="Zoom out">${ICON.zout}</button><span class="zoomv hide-sm" id="zoomv">${Math.round(C.zoom * 100)}%</span><button class="iconbtn hide-sm" data-a="zin" aria-label="Zoom in">${ICON.zin}</button>`,
    render(main) { build(main); },
    refresh() { const k = { z: C.zoom, p: { ...C.pan } }; build($('#main')); C.zoom = k.z; C.pan = k.p; apply(); },
    onSelect() { App.views.canvas.refresh(); }
  };

  Object.assign(App.act, {
    zin: () => zoomBy(1.2), zout: () => zoomBy(1 / 1.2), fit: () => fit(),
    selBrief() { App.select({ kind: 'brief' }); },
    selRoute(el) { S.route = +el.dataset.i; App.save(); App.renderSide(); App.select({ kind: 'route', i: S.route }); },
    selApp(el) { App.select({ kind: 'app', id: el.dataset.id }); },
    selCell(el) { S.route = +el.dataset.i; App.save(); App.renderSide(); App.select({ kind: 'app', id: el.dataset.id }); },
    strategy(el) { S.brief.strategy = el.dataset.s; App.changed('brief'); },
    autoAxes() { S.brief.manual = {}; App.changed('brief'); },
    tuneSet(el) { App.tune()[el.dataset.k] = el.dataset.num ? +el.dataset.v : el.dataset.v; App.changed('tune'); },
    shuffleRoute(el) { App.tune(App.dirId(+el.dataset.i)).seed = Math.floor(Math.random() * 99991); App.changed('tune'); },
    shuffleAll() { S.routes.forEach((r) => { App.tune(r.dir).seed = Math.floor(Math.random() * 99991); }); App.changed('tune'); },
    presentRoute(el) { if (el.dataset.i != null) S.route = +el.dataset.i; S.view = 'present'; App.save(); App.renderAll(); },
    addApp() { const used = new Set(apps().map((a) => a.mock)); const m = PG.Mocks.all().find((x) => !used.has(x.id)); const slot = m ? { id: 'a' + Date.now().toString(36), mock: m.id } : { id: 'a' + Date.now().toString(36), flat: 'poster' }; apps().push(slot); App.select({ kind: 'app', id: slot.id }); App.changed('apps'); },
    rmApp(el) { S.apps = apps().filter((a) => a.id !== el.dataset.id); App.select({ kind: 'brief' }); App.changed('apps'); },
    setMock(el) { const s = apps().find((a) => a.id === el.dataset.id); s.mock = el.dataset.m; delete s.flat; App.changed('apps'); },
    setFlat(el) { const s = apps().find((a) => a.id === el.dataset.id); s.flat = el.dataset.f; delete s.mock; App.changed('apps'); },
    mockCat(el) { S.mockCat = el.dataset.c; App.renderInspector(); },
    openApp(el) {
      const slot = apps().find((a) => a.id === el.dataset.id);
      const m = App.modal(esc(PG.Mocks.label(slot).title), `<div class="lb3">${S.routes.map((_, i) => `<figure><div class="m3d loading" data-big="${i}"></div><figcaption>Route ${'ABC'[i]} · ${esc(App.dir(App.dirId(i)).name)}</figcaption></figure>`).join('')}</div>`, true);
      $$('[data-big]', m).forEach((el2) => { const i = +el2.dataset.big; PG.Mocks.render(slot, App.artCtx(i), App.tune(App.dirId(i)), 1600).then((url) => { el2.outerHTML = `<img src="${url}" alt="">`; }).catch((e) => { el2.textContent = e.message; }); });
    }
  });
  Object.assign(App.inp, {
    briefName(el) { S.brief.name = el.value; App.save(); clearTimeout(C.nt); C.nt = setTimeout(() => App.changed('name'), 500); },
    axis(el) { S.brief.manual[el.dataset.k] = +el.value; el.classList.add('manual'); },
    tuneRange(el) { const tn = App.tune(), v = +el.value, k = el.dataset.k; tn[k] = v; const out = el.parentElement.querySelector('output'); if (out) out.textContent = k === 'hue' ? (v > 0 ? '+' : '') + v + '°' : (v > 0 ? '+' : '') + v + '%'; }
  });
  Object.assign(App.chg, {
    brief(el) {
      const k = el.dataset.k, b = S.brief;
      if (k === 'industry') { b.industry = el.value; b.manual = {}; S.apps = null; S.routes.forEach((r) => { r.pinned = false; }); }
      else if (k === 'aud0') b.audiences = [el.value, b.audiences[1]].filter(Boolean);
      else if (k === 'aud1') b.audiences = [b.audiences[0], el.value].filter(Boolean);
      else b[k] = el.value;
      App.changed('brief');
    },
    axisDone() { App.changed('brief'); },
    tuneDone() { App.changed('tune'); },
    tuneSel(el) { App.tune()[el.dataset.k] = el.value; App.changed('tune'); },
    tuneUpper(el) { App.tune().upper = el.checked; App.changed('tune'); },
    routeDir(el) { S.routes[+el.dataset.i2] = { dir: el.value, pinned: true }; App.changed('route'); },
    artLayout(el) { const tn = App.tune(); tn.art = tn.art || {}; tn.art[el.dataset.r] = el.value; App.changed('tune'); }
  });
})();
