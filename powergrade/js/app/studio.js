/* Studio: node canvas. Brief → Direction → Outputs, with every control exposed.
   Outputs can be any HTML touchpoint (with a layout picker) or a 3D kind (with an object picker). */
(function () {
  const App = PG.App, S = App.S, esc = App.esc, $ = App.$, $$ = App.$$, clamp = App.clamp, ICON = App.ICON;
  const W = { brief: 320, dir: 350, out: 380 };
  const F = {
    outputs: App.LS.get('outputs', ['website', 'packaging', 'app', 'social', 'identity', 'stationery'].map((tp, i) => ({ id: 'o' + i, tp }))),
    pos: {}, zoom: 0.7, pan: { x: 40, y: 40 }, dirTab: 'why', menu: false
  };
  const saveOut = () => App.LS.set('outputs', F.outputs);
  const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  const is3D = (tp) => !!PG.Mockups.KINDS[tp];

  /* ---------------- nodes ---------------- */
  function briefNode() {
    const b = S.brief, ind = PG.byId(PG.INDUSTRIES, b.industry), target = PG.targetAxes(b);
    const groups = [...new Set(PG.INDUSTRIES.map((i) => i.group))];
    const indSel = groups.map((g) => `<optgroup label="${esc(g)}">${PG.INDUSTRIES.filter((i) => i.group === g).map((i) => opt(i.id, i.name, i.id === b.industry)).join('')}</optgroup>`).join('');
    const audOpts = (sel, none) => (none ? opt('', 'None', !sel) : '') + PG.AUDIENCES.map((a) => opt(a.id, a.name, a.id === sel)).join('');
    const anyManual = Object.keys(b.manual).some((k) => b.manual[k] != null);
    return `<div class="nh" data-drag><span class="grip">⋮⋮</span><span class="kind">Brief</span><select id="b-industry" data-c="brief" data-k="industry" aria-label="Industry">${indSel}</select></div>
      <span class="port out" style="top:17px"></span>
      <div class="nsec"><span>Client</span><span class="note">No logo or colours needed</span></div>
      <div class="nb">
        <label class="f">Brand name<input id="b-name" type="text" data-i="briefName" value="${esc(b.name)}" placeholder="${esc(ind.sampleName)}" maxlength="28"></label>
        <label class="f">Business model<select id="b-func" data-c="brief" data-k="func">${PG.FUNCTIONS.map((x) => opt(x.id, x.name, x.id === b.func)).join('')}</select></label>
        <label class="f">Main audience<select id="b-aud0" data-c="brief" data-k="aud0">${audOpts(b.audiences[0])}</select></label>
        <label class="f">Second audience<select id="b-aud1" data-c="brief" data-k="aud1">${audOpts(b.audiences[1], true)}</select></label>
        <label class="f">Price tier<select id="b-tier" data-c="brief" data-k="tier">${PG.TIERS.map((x) => opt(x.id, x.name, x.id === b.tier)).join('')}</select></label>
        <div class="f">Strategy<div class="seg">${PG.STRATEGIES.map((s) => `<button class="${b.strategy === s.id ? 'on' : ''}" data-a="strategy" data-s="${s.id}" title="${esc(s.note)}">${s.name}</button>`).join('')}</div></div>
        <div class="note">${esc(PG.byId(PG.STRATEGIES, b.strategy).note)}</div>
        <div class="crumb">/ Personality ${anyManual ? '· <button class="link" data-a="autoAxes">reset</button>' : '· from the brief'}</div>
        ${PG.AXES.map((a) => `<div class="axis"><span>${a.lo}</span><input type="range" min="0" max="100" value="${target[a.id]}" data-i="axis" data-c="axisDone" data-k="${a.id}" class="${b.manual[a.id] != null ? 'manual' : ''}" aria-label="${a.lo} to ${a.hi}"><span>${a.hi}</span></div>`).join('')}
        <div class="crumb">/ ${esc(ind.name)} codes</div>
        <ul class="note" style="margin:0;padding-left:16px">${ind.codes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>`;
  }

  function dirNode() {
    const d = App.dir(), tune = App.tune(), sc = App.score(d.id), t = PG.tokens(d, tune, S.brief);
    const sl = S.ranking.shortlist.map((x) => x.dir.id);
    const sel = `<optgroup label="Shortlist for this brief">${sl.map((id) => opt(id, PG.byId(PG.DIRECTIONS, id).name + ' · ' + App.score(id).total + '%', id === d.id)).join('')}</optgroup><optgroup label="All directions">${S.ranking.all.filter((x) => !sl.includes(x.dir.id)).map((x) => opt(x.dir.id, x.dir.name + ' · ' + x.score.total + '%', x.dir.id === d.id)).join('')}</optgroup>`;
    const tabs = [['why', 'Why'], ['colour', 'Colour'], ['type', 'Type'], ['shape', 'Shape'], ['photo', 'Photography']];
    const rng = (key, min, max, val, fmt) => `<div class="rng"><input type="range" min="${min}" max="${max}" value="${val}" data-i="tuneRange" data-c="tuneDone" data-k="${key}" aria-label="${key}"><output>${fmt(val)}</output></div>`;
    let body = '';
    if (F.dirTab === 'colour') {
      const sws = [['bg', t.bg], ['surface', t.surface], ['text', t.ink], ['primary', t.primary], ['second', t.secondary], ['accent', t.accent]];
      body = `<div class="f">Palette<div class="seg">${d.palettes.map((p, i) => `<button class="${tune.pal === i ? 'on' : ''}" data-a="tuneSet" data-k="pal" data-v="${i}" data-num="1">${esc(p.name)}</button>`).join('')}</div></div>
        <div class="f">Mode<div class="seg">${['auto', 'light', 'dark'].map((m) => `<button class="${tune.mode === m ? 'on' : ''}" data-a="tuneSet" data-k="mode" data-v="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div></div>
        <label class="f">Hue shift${rng('hue', -60, 60, tune.hue, (v) => (v > 0 ? '+' : '') + v + '°')}</label>
        <label class="f">Saturation${rng('sat', -60, 60, tune.sat, (v) => (v > 0 ? '+' : '') + v + '%')}</label>
        <div class="swrow">${sws.map(([k, v]) => `<button class="sw" data-a="copyText" data-t="${v}" title="Copy ${v}"><i style="background:${v}"></i><span>${k}<br>${v}</span></button>`).join('')}</div>
        <div class="crumb">/ Accessibility · WCAG 2.2</div>
        <div class="qa">${t.qa.map((q) => `<div><span>${q.label}</span><span class="mono" style="font-size:11px">${q.ratio.toFixed(2)}:1</span><span class="badge ${q.ratio >= q.need ? 'ok' : 'no'}">${q.ratio >= q.need ? 'pass' : 'fail'} ${q.need}</span></div>`).join('')}</div>
        ${t.fixes.length ? `<div class="note">Auto-fixed for this audience: ${t.fixes.join('; ')}.</div>` : ''}`;
    } else if (F.dirTab === 'type') {
      const fonts = Object.keys(PG.FONTS).sort();
      body = `<div style="font-family:${t.fd.replace(/"/g, "'")};font-weight:${t.fdw};font-size:32px;line-height:1.05;${t.upper ? 'text-transform:uppercase;' : ''}letter-spacing:${t.track}em;${t.italic ? 'font-style:italic;' : ''}">${esc(App.brand().name)}</div>
        <div style="font-family:${t.fb.replace(/"/g, "'")};font-size:13px;color:var(--ui-fg-2)">${esc(PG.byId(PG.INDUSTRIES, S.brief.industry).copy.sub)}</div>
        <label class="f">Display face<select data-c="tuneSel" data-k="display">${fonts.map((f) => opt(f, f, f === t.display)).join('')}</select></label>
        <label class="f">Body face<select data-c="tuneSel" data-k="body">${fonts.map((f) => opt(f, f, f === t.body)).join('')}</select></label>
        <label class="f">Uppercase<input class="chk" type="checkbox" data-c="tuneUpper" ${t.upper ? 'checked' : ''}></label>
        ${tune.display || tune.body || tune.upper != null ? '<button class="link" data-a="resetType">Reset to the direction\'s pairing</button>' : ''}`;
    } else if (F.dirTab === 'shape') {
      body = `<label class="f">Corner radius${rng('radius', 0, 40, t.radius, (v) => v + 'px')}</label>
        <label class="f">Density${rng('density', 0, 100, Math.round(t.density * 100), (v) => v + '%')}</label>
        <label class="f">Buttons<select data-c="tuneSel" data-k="button">${['pill', 'soft', 'square', 'outline', 'underline', 'shadow'].map((x) => opt(x, x[0].toUpperCase() + x.slice(1), x === t.button)).join('')}</select></label>
        ${tune.radius != null || tune.density != null || tune.button ? '<button class="link" data-a="resetShape">Reset shape</button>' : ''}`;
    } else if (F.dirTab === 'photo') {
      const g = PG.gradeFor(d.id, tune), pick = PG.photoPicker(S.brief, t, (tune.seed || 1) + '|website|');
      body = `<label class="f">Grade<select data-c="tuneSel" data-k="grade">${Object.keys(PG.GRADE_NAMES).map((k) => opt(k, PG.GRADE_NAMES[k], k === g)).join('')}</select></label>
        <div class="imgs">${['hero', 'people', 'product', 'place', 'detail', 'texture'].map((r) => { const p = pick(r, 0); return `<button><div class="iv">${PG.photoImg(p, t, { grade: g, thumb: true })}</div><span>${r}</span></button>`; }).join('')}</div>
        <button class="tbtn sm" data-a="shuffle">${ICON.shuffle} New photo selection</button>
        <div class="note">Photos are chosen for the industry and graded to the direction. ${PG.PHOTOS ? PG.PHOTOS.length + ' photos in the library.' : ''}</div>`;
    } else {
      const parts = [['Personality', sc.parts.axis], ['Category fit', sc.parts.category], ['Audience', sc.parts.audience], ['Business model', sc.parts.func], ['Price tier', sc.parts.tier]];
      const target = PG.targetAxes(S.brief), ev = PG.evidence(d, S.brief.industry).slice(0, 5);
      body = `<div class="bigscore"><b>${sc.total}</b><span class="note">/100 fit · ${sc.role}</span></div>
        ${parts.map(([k, v]) => `<div class="scorebar"><span>${k}</span><b><i style="width:${Math.round(v * 100)}%"></i></b><output>${Math.round(v * 100)}</output></div>`).join('')}
        <div class="crumb">/ Why this direction</div><div class="why">${PG.explain(d, S.brief, sc).map((l) => `<div class="${l.warn ? 'warn' : ''}"><b>${esc(l.k)}.</b> ${esc(l.v)}</div>`).join('')}</div>
        <div class="crumb">/ Personality vs brief</div><div class="legend"><span><i style="border:1.5px solid var(--ui-fg-2)"></i>Brief</span><span><i style="background:var(--ui-accent)"></i>Direction</span></div>
        ${PG.AXES.map((a) => `<div class="axis"><span>${a.lo}</span><div class="cmp"><span class="b" style="left:${target[a.id]}%"></span><span class="d" style="left:${d.axes[a.id]}%"></span></div><span>${a.hi}</span></div>`).join('')}
        <div class="crumb">/ Evidence</div><div class="refs">${ev.map((r) => `<a class="ref" href="${PG.refSearchUrl(r)}" target="_blank" rel="noopener"><b>${esc(r.brand)} · ${r.year || 'n.d.'}</b><span class="conf ${r.conf}">${r.conf}</span><span>${esc(r.by)}. ${esc(r.traits)}</span></a>`).join('')}</div>`;
    }
    return `<div class="nh" data-drag><span class="grip">⋮⋮</span><span class="kind">Direction</span><select data-c="pickDirSel" aria-label="Direction">${sel}</select><span class="dot"></span></div>
      <span class="port in" style="top:17px"></span><span class="port out" style="top:17px"></span>
      <div class="nsec"><span>${esc(d.school)}</span><span style="display:flex;gap:10px">${S.pinned ? '<button class="link" data-a="best">Best match</button>' : ''}<button class="link" data-a="fav">${S.favs.has(d.id) ? '♥ Saved' : '♡ Save'}</button></span></div>
      <div style="padding:11px 13px 0;font-size:12.5px;color:var(--ui-fg-2);line-height:1.5">${esc(d.summary)}</div>
      <div class="ntabs">${tabs.map(([k, v]) => `<button class="${F.dirTab === k ? 'on' : ''}" data-a="dirTab" data-k="${k}">${v}</button>`).join('')}</div>
      <div class="nb">${body}</div>`;
  }

  function outNode(o) {
    const d = App.dir(), tn = App.tune();
    const tps = PG.TOUCHPOINTS.filter((x) => !x.three).map((x) => opt(x.id, x.name, x.id === o.tp)).join('') + Object.keys(PG.Mockups.KINDS).map((k) => opt(k, k[0].toUpperCase() + k.slice(1) + ' (3D)', k === o.tp)).join('');
    let inner, foot;
    if (is3D(o.tp)) {
      const name = o.obj || PG.Mockups.defaultObject(o.tp, S.brief);
      inner = PG.Mockups.slot(o.tp, name, { w: 1200, h: 900 }).replace('class="m3d loading"', 'class="m3d loading" style="position:relative;height:260px;width:100%"');
      foot = `<span>3D · ${esc(PG.Mockups.NAMES[name])}</span><select data-c="outObj" data-o="${o.id}" aria-label="Object">${PG.Mockups.available(o.tp).map((n) => opt(n, PG.Mockups.NAMES[n], n === name)).join('')}</select>`;
    } else {
      const T = PG.TEMPLATES[o.tp], r = PG.renderBoard(o.tp, d, tn, S.brief, { w: W.out - 26, h: 320 }, { layout: o.layout });
      inner = r.html;
      foot = `<span>${T.w} × ${T.h}</span><select data-c="outLay" data-o="${o.id}" aria-label="Layout">${Object.keys(T.layouts).map((k) => opt(k, T.layouts[k].name, k === r.layout)).join('')}</select>`;
    }
    return `<div class="nh" data-drag><span class="grip">⋮⋮</span><span class="kind">Output</span><select data-c="outTp" data-o="${o.id}" aria-label="Touchpoint">${tps}</select><button class="x" data-a="rmOut" data-o="${o.id}" aria-label="Remove output">×</button></div>
      <span class="port in" style="top:17px"></span><div class="board-in">${inner}</div><div class="nfoot">${foot}</div>`;
  }

  /* ---------------- canvas ---------------- */
  function build(main) {
    main.innerHTML = `<div class="canvas" id="canvas"><div class="world" id="world"><svg class="wires" id="wires" width="1" height="1"></svg></div></div>
      <div class="dock"><div style="position:relative;display:flex"><button data-a="outMenu">Add output</button>${F.menu ? `<div class="menu">${PG.TOUCHPOINTS.filter((x) => !x.three).map((tp) => `<button data-a="addOut" data-tp="${tp.id}">${esc(tp.name)}<span>${tp.w}×${tp.h}</span></button>`).join('')}${Object.keys(PG.Mockups.KINDS).map((k) => `<button data-a="addOut" data-tp="${k}">${k[0].toUpperCase() + k.slice(1)}<span>3D</span></button>`).join('')}</div>` : ''}</div>
      <button data-a="fit">Fit</button><button data-a="view" data-v="board">Open board</button></div>`;
    const world = $('#world');
    const mk = (id, cls, w, html) => { const n = document.createElement('div'); n.className = 'node ' + cls; n.id = id; n.style.width = w + 'px'; n.innerHTML = html; world.appendChild(n); return n; };
    mk('n-brief', 'brief', W.brief, briefNode());
    mk('n-dir', 'dir sel', W.dir, dirNode());
    F.outputs.forEach((o) => mk('n-' + o.id, 'out', W.out, outNode(o)));
    layout(); apply(); bind(); App.hydrate(world);
  }
  function layout() {
    const place = (id, x, y) => { if (!F.pos[id]) F.pos[id] = { x, y }; const el = $('#' + id); el.style.left = F.pos[id].x + 'px'; el.style.top = F.pos[id].y + 'px'; };
    place('n-brief', 0, 0); place('n-dir', W.brief + 60, 0);
    const x0 = W.brief + W.dir + 130, cols = [x0, x0 + W.out + 30, x0 + 2 * (W.out + 30)], bottoms = [0, 0, 0];
    F.outputs.forEach((o) => { const id = 'n-' + o.id, p = F.pos[id]; if (p) { const ci = cols.reduce((bi, cx, i) => (Math.abs(cx - p.x) < Math.abs(cols[bi] - p.x) ? i : bi), 0); bottoms[ci] = Math.max(bottoms[ci], p.y + $('#' + id).offsetHeight + 30); } });
    F.outputs.forEach((o) => { const id = 'n-' + o.id; if (F.pos[id]) return place(id); const ci = bottoms.indexOf(Math.min(...bottoms)); place(id, cols[ci], bottoms[ci]); bottoms[ci] += $('#' + id).offsetHeight + 30; });
    wires();
  }
  function wires() {
    const svg = $('#wires'); if (!svg) return;
    const box = (id) => { const el = $('#' + id), p = F.pos[id]; return { x: p.x, y: p.y, w: el.offsetWidth }; };
    const curve = (a, b, dash) => { const x1 = a.x + a.w + 1, y1 = a.y + 22, x2 = b.x - 1, y2 = b.y + 22, dx = Math.max(60, Math.abs(x2 - x1) * 0.45); return `<path class="${dash ? 'dash' : ''}" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"/>`; };
    const bri = box('n-brief'), dir = box('n-dir');
    svg.innerHTML = curve(bri, dir, true) + F.outputs.map((o) => curve(dir, box('n-' + o.id))).join('');
  }
  function apply() {
    const world = $('#world'), cv = $('#canvas'); if (!world) return;
    world.style.transform = `translate(${F.pan.x}px,${F.pan.y}px) scale(${F.zoom})`;
    cv.style.backgroundSize = `${22 * F.zoom}px ${22 * F.zoom}px`; cv.style.backgroundPosition = `${F.pan.x}px ${F.pan.y}px`;
    const zv = $('#zoomv'); if (zv) zv.textContent = Math.round(F.zoom * 100) + '%';
  }
  function fit() {
    const cv = $('#canvas'); if (!cv) return;
    const ids = ['n-brief', 'n-dir', ...F.outputs.map((o) => 'n-' + o.id)];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ids.forEach((id) => { const p = F.pos[id], el = $('#' + id); if (!p || !el) return; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + el.offsetWidth); y1 = Math.max(y1, p.y + el.offsetHeight); });
    const cw = cv.clientWidth, ch = cv.clientHeight;
    F.zoom = clamp(Math.min((cw - 48) / (x1 - x0), (ch - 120) / (y1 - y0)), 0.2, 1);
    F.pan.x = (cw - (x1 - x0) * F.zoom) / 2 - x0 * F.zoom; F.pan.y = 24 - y0 * F.zoom; apply();
  }
  function zoomBy(f, cx, cy) {
    const cv = $('#canvas'); if (!cv) return;
    if (cx == null) { cx = cv.clientWidth / 2; cy = cv.clientHeight / 2; }
    const nz = clamp(F.zoom * f, 0.15, 2);
    F.pan.x = cx - (cx - F.pan.x) * (nz / F.zoom); F.pan.y = cy - (cy - F.pan.y) * (nz / F.zoom); F.zoom = nz; apply();
  }
  function bind() {
    const cv = $('#canvas'); let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const node = e.target.closest('.node');
      if (node) {
        if (!e.target.closest('[data-drag]') || e.target.closest('select,input,button')) return;
        $$('.node.sel').forEach((n) => n.classList.remove('sel')); node.classList.add('sel');
        drag = { kind: 'node', id: node.id, sx: e.clientX, sy: e.clientY, ox: F.pos[node.id].x, oy: F.pos[node.id].y };
      } else { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: F.pan.x, oy: F.pan.y }; cv.classList.add('panning'); }
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (drag.kind === 'pan') { F.pan.x = drag.ox + dx; F.pan.y = drag.oy + dy; apply(); }
      else { const p = F.pos[drag.id]; p.x = drag.ox + dx / F.zoom; p.y = drag.oy + dy / F.zoom; const el = $('#' + drag.id); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; wires(); }
    });
    const end = () => { drag = null; cv.classList.remove('panning'); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => {
      if (e.target.closest('select')) return;
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else { F.pan.x -= e.deltaX; F.pan.y -= e.deltaY; apply(); }
    }, { passive: false });
  }
  const refreshDir = () => { const n = $('#n-dir'); if (n) n.innerHTML = dirNode(); };
  const refreshOut = () => { F.outputs.forEach((o) => { const n = $('#n-' + o.id); if (n) { n.innerHTML = outNode(o); App.hydrate(n); } }); requestAnimationFrame(wires); };
  const refreshBrief = () => { const n = $('#n-brief'); if (n) n.innerHTML = briefNode(); };

  App.views.studio = {
    topTools: () => `<button class="iconbtn hide-sm" data-a="zout" aria-label="Zoom out">${ICON.zout}</button><span class="zoomv hide-sm" id="zoomv">${Math.round(F.zoom * 100)}%</span><button class="iconbtn hide-sm" data-a="zin" aria-label="Zoom in">${ICON.zin}</button><button class="iconbtn hide-sm" data-a="fit" aria-label="Fit">${ICON.fit}</button>`,
    render(main) { build(main); requestAnimationFrame(() => { layout(); fit(); }); },
    refresh(what) { if (!$('#n-dir')) return App.renderMain(); if (what === 'brief') refreshBrief(); refreshDir(); refreshOut(); },
    openExport(tab) {
      tab = tab || 'json';
      const d = App.dir(), t = PG.tokens(d, App.tune(), S.brief);
      const text = tab === 'json' ? PG.exportTokens(d, t, App.brand().name) : tab === 'css' ? PG.exportCss(t) : summary();
      App.modal(`Export · ${esc(d.name)}`, `<div class="seg">${[['json', 'Design tokens (JSON)'], ['css', 'CSS variables'], ['md', 'Direction summary']].map(([k, v]) => `<button class="${tab === k ? 'on' : ''}" data-a="exTab" data-k="${k}">${v}</button>`).join('')}</div>
        <textarea id="ex-ta" readonly aria-label="Export">${esc(text)}</textarea><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="tbtn primary" data-a="exCopy">Copy</button><span class="note">Follows the active tuning and logo. The summary pastes straight into a deck or doc.</span></div>`);
    }
  };
  function summary() {
    const d = App.dir(), sc = App.score(d.id), t = PG.tokens(d, App.tune(), S.brief), b = S.brief, ind = PG.byId(PG.INDUSTRIES, b.industry);
    return [`# ${App.brand().name}: ${d.name}`, '', d.summary, '',
      `**Brief:** ${ind.name} · ${PG.byId(PG.FUNCTIONS, b.func).name} · ${b.audiences.map((a) => PG.byId(PG.AUDIENCES, a).name).join(' + ')} · ${PG.byId(PG.TIERS, b.tier).name} · ${PG.byId(PG.STRATEGIES, b.strategy).name}`,
      `**Fit:** ${sc.total}/100 (${sc.role})`, '', '## Why', ...PG.explain(d, b, sc).map((l) => `- **${l.k}.** ${l.v}`), '', '## Principles', ...d.principles.map((p) => `- ${p}`), '',
      '## System', `- Palette: background ${t.bg}, text ${t.ink}, primary ${t.primary}, secondary ${t.secondary}, accent ${t.accent}`, `- Type: ${t.display} with ${t.body}`,
      `- Shape: ${t.radius}px radius, ${t.button} buttons · Photography: ${PG.GRADE_NAMES[PG.gradeFor(d.id, App.tune())]}`, `- Voice: "${d.voice}"`, '', '## Evidence',
      ...PG.evidence(d, b.industry).slice(0, 6).map((r) => `- ${r.brand} (${r.by}, ${r.year || 'n.d.'}) [${r.conf}]: ${r.traits}`)].join('\n');
  }

  Object.assign(App.act, {
    zin: () => zoomBy(1.2), zout: () => zoomBy(1 / 1.2), fit: () => fit(),
    dirTab(el) { F.dirTab = el.dataset.k; refreshDir(); },
    strategy(el) { S.brief.strategy = el.dataset.s; App.changed('brief'); },
    autoAxes() { S.brief.manual = {}; App.changed('brief'); },
    tuneSet(el) { App.tune()[el.dataset.k] = el.dataset.num ? +el.dataset.v : el.dataset.v; App.changed('tune'); },
    resetType() { Object.assign(App.tune(), { display: null, body: null, upper: null }); App.changed('tune'); },
    resetShape() { Object.assign(App.tune(), { radius: null, density: null, button: null }); App.changed('tune'); },
    outMenu() { F.menu = !F.menu; const k = { z: F.zoom, p: { ...F.pan } }; build($('#main')); F.zoom = k.z; F.pan = k.p; apply(); },
    addOut(el) { F.outputs.push({ id: 'o' + Date.now().toString(36), tp: el.dataset.tp }); saveOut(); F.menu = false; const k = { z: F.zoom, p: { ...F.pan } }; build($('#main')); F.zoom = k.z; F.pan = k.p; apply(); },
    rmOut(el) { F.outputs = F.outputs.filter((o) => o.id !== el.dataset.o); delete F.pos['n-' + el.dataset.o]; saveOut(); const k = { z: F.zoom, p: { ...F.pan } }; build($('#main')); F.zoom = k.z; F.pan = k.p; apply(); },
    exTab(el) { App.views.studio.openExport(el.dataset.k); },
    exCopy() { App.copy($('#ex-ta').value, $('#ex-ta')); }
  });
  Object.assign(App.inp, {
    briefName(el) { S.brief.name = el.value; App.save(); if (S.view === 'studio') { refreshDir(); refreshOut(); } App.renderSide(); },
    axis(el) { S.brief.manual[el.dataset.k] = +el.value; el.classList.add('manual'); App.rerank(); App.save(); refreshDir(); },
    tuneRange(el) {
      const tn = App.tune(), v = +el.value, k = el.dataset.k;
      if (k === 'density') tn.density = v / 100; else tn[k] = v;
      const out = el.parentElement.querySelector('output');
      if (out) out.textContent = k === 'hue' ? (v > 0 ? '+' : '') + v + '°' : k === 'sat' ? (v > 0 ? '+' : '') + v + '%' : k === 'radius' ? v + 'px' : v + '%';
    }
  });
  Object.assign(App.chg, {
    brief(el) {
      const k = el.dataset.k, b = S.brief;
      if (k === 'industry') { b.industry = el.value; b.manual = {}; S.pinned = false; }
      else if (k === 'aud0') b.audiences = [el.value, b.audiences[1]].filter(Boolean);
      else if (k === 'aud1') b.audiences = [b.audiences[0], el.value].filter(Boolean);
      else b[k] = el.value;
      App.changed('brief');
    },
    axisDone() { App.changed('brief'); },
    tuneDone() { App.changed('tune'); },
    tuneSel(el) { App.tune()[el.dataset.k] = el.value; App.changed('tune'); },
    tuneUpper(el) { App.tune().upper = el.checked; App.changed('tune'); },
    pickDirSel(el) { App.setActive(el.value); App.changed('dir'); },
    outTp(el) { const o = F.outputs.find((x) => x.id === el.dataset.o); o.tp = el.value; o.layout = null; o.obj = null; saveOut(); const n = $('#n-' + o.id); n.innerHTML = outNode(o); App.hydrate(n); requestAnimationFrame(wires); },
    outLay(el) { const o = F.outputs.find((x) => x.id === el.dataset.o); o.layout = el.value; saveOut(); const n = $('#n-' + o.id); n.innerHTML = outNode(o); requestAnimationFrame(wires); },
    outObj(el) { const o = F.outputs.find((x) => x.id === el.dataset.o); o.obj = el.value; saveOut(); const n = $('#n-' + o.id); n.innerHTML = outNode(o); App.hydrate(n); }
  });
})();
