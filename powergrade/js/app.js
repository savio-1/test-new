/* Powergrade studio controller: Flow canvas (brief → direction → outputs), Matrix, Library. */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('powergrade:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('powergrade:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  const ICON = {
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 2c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M18.5 13c.3 2.2 1.1 3 3.3 3.3-2.2.3-3 1.1-3.3 3.3-.3-2.2-1.1-3-3.3-3.3 2.2-.3 3-1.1 3.3-3.3z" opacity=".75"/></svg>',
    zin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5M8 11h6M11 8v6"/></svg>',
    zout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5M8 11h6"/></svg>',
    fit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v12M6 11l6 6 6-6M4 20h16"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg>'
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

  const DEFAULT_BRIEF = { name: 'Lumen', industry: 'finance', func: 'b2c-app', audiences: ['genz', 'millennial'], tier: 'mid', strategy: 'balance', manual: {}, pack: null };
  const DEFAULT_OUTPUTS = ['website', 'app', 'social', 'packaging', 'story', 'webinar', 'identity', 'poster'];

  const S = {
    view: 'flow',
    brief: Object.assign({}, DEFAULT_BRIEF, LS.get('brief', {})),
    activeDir: LS.get('activeDir', null), pinned: LS.get('pinned', false),
    tunes: LS.get('tunes', {}),
    outputs: LS.get('outputs', DEFAULT_OUTPUTS.map((tp, i) => ({ id: 'o' + i, tp }))),
    pos: {}, zoom: 0.8, pan: { x: 40, y: 80 },
    sideTab: 'suggested', sideSub: 'explore', q: '', sideOpen: false,
    favs: new Set(LS.get('favs', [])),
    dirTab: 'why',
    mxN: 6, mxTps: ['website', 'app', 'social', 'story', 'packaging', 'poster', 'webinar', 'identity'],
    libTab: 'directions', libQ: '', libConf: 'all',
    notice: LS.get('notice', true), menu: false, ranking: null
  };
  if (!S.brief.manual) S.brief.manual = {};
  const save = () => { LS.set('brief', S.brief); LS.set('tunes', S.tunes); LS.set('outputs', S.outputs); LS.set('favs', [...S.favs]); LS.set('activeDir', S.activeDir); LS.set('pinned', S.pinned); };

  const dirById = (id) => PG.byId(PG.DIRECTIONS, id);
  const tuneFor = (id) => (S.tunes[id] = S.tunes[id] || PG.defaultTune(dirById(id)));
  const scoreOf = (id) => S.ranking.all.find((x) => x.dir.id === id).score;
  const active = () => dirById(S.activeDir);
  const brandName = () => (S.brief.name || '').trim() || PG.byId(PG.INDUSTRIES, S.brief.industry).sampleName;

  function rerank() {
    S.ranking = PG.rank(S.brief, 8);
    if (!S.pinned || !dirById(S.activeDir)) { S.activeDir = S.ranking.shortlist[0].dir.id; S.pinned = false; }
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }
  function copy(text, ta) {
    const done = () => toast('Copied to clipboard');
    try {
      navigator.clipboard.writeText(text).then(done, () => { if (ta) { ta.focus(); ta.select(); } toast('Press Ctrl+C (⌘C) to copy the selected text'); });
    } catch (e) { if (ta) { ta.focus(); ta.select(); } toast('Press Ctrl+C (⌘C) to copy the selected text'); }
  }

  /* ================= top bar ================= */
  function renderTop() {
    $('#top').innerHTML = `
      <button class="iconbtn only-narrow" data-act="side" aria-label="Show directions">${ICON.menu}</button>
      <div class="logo">${ICON.spark}<span>Powergrade</span></div>
      <div class="seg" role="tablist">${['flow', 'matrix', 'library'].map((v) => `<button class="${S.view === v ? 'on' : ''}" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
      <div class="mid">${S.view === 'flow' ? `
        <button class="iconbtn hide-sm" data-act="zout" aria-label="Zoom out">${ICON.zout}</button>
        <span class="zoomv hide-sm" id="zoomv">${Math.round(S.zoom * 100)}%</span>
        <button class="iconbtn hide-sm" data-act="zin" aria-label="Zoom in">${ICON.zin}</button>
        <button class="iconbtn hide-sm" data-act="fit" aria-label="Fit content">${ICON.fit}</button>
        <button class="iconbtn hide-sm" data-act="shuffle" aria-label="Shuffle imagery" title="Shuffle imagery">${ICON.shuffle}</button>` : ''}</div>
      <button class="tbtn gold hide-sm" data-act="export">${ICON.crown} Export</button>
      <button class="tbtn hide-md" data-act="help">${ICON.help} Help</button>`;
  }

  /* ================= sidebar ================= */
  function thumb(d, opts) {
    opts = opts || {};
    const t = PG.tokens(d, tuneFor(d.id), S.brief);
    const b = { name: brandName(), initial: brandName().charAt(0) };
    const sc = scoreOf(d.id);
    const big = opts.feature;
    const art = PG.art(t, b, big ? 320 : 160, big ? 180 : 120, { salt: 2 });
    const aa = `<span class="aa" style="font-family:${t.fd.replace(/"/g, "'")};font-weight:${t.fdw};color:${t.ink};background:${t.bg};padding:3px 7px;${t.upper ? 'text-transform:uppercase;' : ''}${big ? 'font-size:26px;' : ''}">Aa</span>`;
    if (big) {
      return `<button class="feature" data-dir="${d.id}"><div class="tv">${art}<span class="pill">${sc.total}% fit · ${sc.role}</span><span class="cap">Best match for this brief</span></div>
        <div class="nm">${esc(d.name)}</div><div class="sc">${esc(d.school)}</div></button>`;
    }
    return `<button class="th ${d.id === S.activeDir ? 'on' : ''}" data-dir="${d.id}" title="${esc(d.summary)}"><div class="tv">${art}${aa}<span class="fit">${sc.total}%</span></div><div class="nm">${esc(d.name)}</div><div class="sc">${esc(d.school.split('·')[0])}</div></button>`;
  }
  const matchQ = (d, q) => !q || [d.name, d.school, d.summary, d.tags.join(' ')].join(' ').toLowerCase().includes(q.toLowerCase());

  function renderSide() {
    const el = $('#side');
    el.classList.toggle('open', S.sideOpen);
    const q = S.q;
    let inner = '';
    if (S.sideSub === 'recipes') {
      inner = `<p class="lbl">Starting briefs</p>` + RECIPES.map((r, i) => {
        const ind = PG.byId(PG.INDUSTRIES, r.b.industry);
        return `<button class="recipe" data-recipe="${i}"><b>${esc(r.n)}</b><span>${esc(ind.name)} · ${r.b.audiences.map((a) => PG.byId(PG.AUDIENCES, a).name.split(' (')[0]).join(' + ')} · ${esc(PG.byId(PG.TIERS, r.b.tier).name)}</span></button>`;
      }).join('');
    } else if (S.sideSub === 'favorites') {
      const favs = PG.DIRECTIONS.filter((d) => S.favs.has(d.id) && matchQ(d, q));
      inner = favs.length ? `<p class="lbl">Saved directions</p><div class="thumbs">${favs.map((d) => thumb(d)).join('')}</div>`
        : `<div class="empty">No saved directions yet. Open a direction and press ♡ Save in its node to keep it here.</div>`;
    } else if (S.sideTab === 'all' || q) {
      const list = S.ranking.all.map((x) => x.dir).filter((d) => matchQ(d, q));
      inner = `<p class="lbl">${q ? `${list.length} matching` : 'All 34 directions'} · ranked for this brief</p><div class="thumbs">${list.map((d) => thumb(d)).join('')}</div>`;
      if (!list.length) inner += '<div class="empty">No direction matches that search. Try a mood (calm, bold), a school (Bauhaus, Swiss) or a tag (luxury, kids).</div>';
    } else {
      const sl = S.ranking.shortlist.map((x) => x.dir);
      const rest = S.ranking.all.map((x) => x.dir).filter((d) => !sl.includes(d)).slice(0, 6);
      inner = `<p class="lbl">Suggested for this brief</p>${thumb(sl[0], { feature: true })}
        <p class="lbl">Diverse shortlist</p><div class="thumbs">${sl.slice(1).map((d) => thumb(d)).join('')}</div>
        <p class="lbl">Also strong</p><div class="thumbs">${rest.map((d) => thumb(d)).join('')}</div>`;
    }
    el.innerHTML = `
      <div class="side-h"><h2>Directions</h2><button class="iconbtn" data-view="library" aria-label="Open the full library">${ICON.expand}</button></div>
      <div class="tabs2"><button class="${S.sideTab === 'suggested' ? 'on' : ''}" data-sidetab="suggested">Suggested</button><button class="${S.sideTab === 'all' ? 'on' : ''}" data-sidetab="all">All directions</button></div>
      <label class="search">${ICON.search}<input id="side-q" type="text" placeholder="Search name, school or tag" value="${esc(q)}" autocomplete="off"></label>
      <div class="subtabs">${[['explore', 'Explore'], ['favorites', 'Favorites'], ['recipes', 'Recipes']].map(([k, v]) => `<button class="${S.sideSub === k ? 'on' : ''}" data-sidesub="${k}">${v}</button>`).join('')}</div>
      <div class="side-scroll">${inner}</div>`;
  }

  /* ================= flow: nodes ================= */
  const W = { brief: 320, dir: 350, out: 360 };
  const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;

  function briefNode() {
    const b = S.brief, ind = PG.byId(PG.INDUSTRIES, b.industry), target = PG.targetAxes(b);
    const groups = [...new Set(PG.INDUSTRIES.map((i) => i.group))];
    const indSel = groups.map((g) => `<optgroup label="${esc(g)}">${PG.INDUSTRIES.filter((i) => i.group === g).map((i) => opt(i.id, i.name, i.id === b.industry)).join('')}</optgroup>`).join('');
    const audOpts = (sel, none) => (none ? opt('', 'None', !sel) : '') + PG.AUDIENCES.map((a) => opt(a.id, a.name, a.id === sel)).join('');
    const axes = PG.AXES.map((a) => {
      const manual = b.manual[a.id] != null;
      return `<div class="axis"><span>${a.lo}</span><input type="range" min="0" max="100" value="${target[a.id]}" data-axis="${a.id}" class="${manual ? 'manual' : ''}" aria-label="${a.lo} to ${a.hi}"><span>${a.hi}</span></div>`;
    }).join('');
    const anyManual = Object.keys(b.manual).some((k) => b.manual[k] != null);
    return `<div class="nh" data-drag><span class="grip">⋮⋮</span><span class="kind">Brief</span><select id="b-industry" data-b="industry" aria-label="Industry">${indSel}</select></div>
      <span class="port out" style="top:17px"></span>
      <div class="nsec">Client<span class="note">No logo or colours needed</span></div>
      <div class="nb">
        <label class="f">Brand name<input id="b-name" type="text" data-b="name" value="${esc(b.name)}" placeholder="${esc(ind.sampleName)}" maxlength="28"></label>
        <label class="f">Business model<select id="b-func" data-b="func">${PG.FUNCTIONS.map((x) => opt(x.id, x.name, x.id === b.func)).join('')}</select></label>
        <label class="f">Main audience<select id="b-aud0" data-b="aud0">${audOpts(b.audiences[0])}</select></label>
        <label class="f">Second audience<select id="b-aud1" data-b="aud1">${audOpts(b.audiences[1], true)}</select></label>
        <label class="f">Price tier<select id="b-tier" data-b="tier">${PG.TIERS.map((x) => opt(x.id, x.name, x.id === b.tier)).join('')}</select></label>
        <div class="f">Strategy<div class="seg">${PG.STRATEGIES.map((s) => `<button class="${b.strategy === s.id ? 'on' : ''}" data-strategy="${s.id}" title="${esc(s.note)}">${s.name}</button>`).join('')}</div></div>
        <div class="note">${esc(PG.byId(PG.STRATEGIES, b.strategy).note)}</div>
        <div class="crumb">/ Personality ${anyManual ? '· <button class="link" data-act="auto-axes">reset to brief</button>' : '<span class="note">· derived from the brief</span>'}</div>
        ${axes}
        <div class="crumb">/ ${esc(ind.name)} codes</div>
        <ul class="note" style="margin:0;padding-left:16px">${ind.codes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      </div>`;
  }

  function dirNode() {
    const d = active(), tune = tuneFor(d.id), sc = scoreOf(d.id);
    const t = PG.tokens(d, tune, S.brief);
    const sl = S.ranking.shortlist.map((x) => x.dir.id);
    const sel = `<optgroup label="Shortlist for this brief">${sl.map((id) => opt(id, dirById(id).name + ' · ' + scoreOf(id).total + '%', id === d.id)).join('')}</optgroup>
      <optgroup label="All directions">${S.ranking.all.filter((x) => !sl.includes(x.dir.id)).map((x) => opt(x.dir.id, x.dir.name + ' · ' + x.score.total + '%', x.dir.id === d.id)).join('')}</optgroup>`;
    const tabs = [['why', 'Why'], ['colour', 'Colour'], ['type', 'Type'], ['shape', 'Shape'], ['imagery', 'Imagery']];
    let body = '';
    const rng = (key, min, max, val, step, fmt) => `<div class="rng"><input type="range" min="${min}" max="${max}" step="${step || 1}" value="${val}" data-tune="${key}" aria-label="${key}"><output>${fmt ? fmt(val) : val}</output></div>`;
    if (S.dirTab === 'colour') {
      const sws = [['bg', t.bg], ['surface', t.surface], ['text', t.ink], ['primary', t.primary], ['second', t.secondary], ['accent', t.accent]];
      body = `<div class="crumb">/ Palette</div>
        <div class="f">Variant<div class="seg">${d.palettes.map((p, i) => `<button class="${tune.pal === i ? 'on' : ''}" data-pal="${i}">${esc(p.name)}</button>`).join('')}</div></div>
        <div class="f">Mode<div class="seg">${['auto', 'light', 'dark'].map((m) => `<button class="${tune.mode === m ? 'on' : ''}" data-mode="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div></div>
        <label class="f">Hue shift${rng('hue', -60, 60, tune.hue, 1, (v) => (v > 0 ? '+' : '') + v + '°')}</label>
        <label class="f">Saturation${rng('sat', -60, 60, tune.sat, 1, (v) => (v > 0 ? '+' : '') + v + '%')}</label>
        <div class="swrow">${sws.map(([k, v]) => `<button class="sw" data-copy="${v}" title="Copy ${v}"><i style="background:${v}"></i><span>${k}<br>${v}</span></button>`).join('')}</div>
        <div class="crumb">/ Accessibility · WCAG 2.2</div>
        <div class="qa">${t.qa.map((q) => `<div><span>${q.label}</span><span class="mono" style="font-size:11.5px">${q.ratio.toFixed(2)}:1</span><span class="badge ${q.ratio >= q.need ? 'ok' : 'no'}">${q.ratio >= q.need ? 'PASS' : 'FAIL'} ${q.need}</span></div>`).join('')}</div>
        ${t.fixes.length ? `<div class="note">Auto-fixed for this audience: ${t.fixes.join('; ')}.</div>` : ''}
        <div class="note">Floor for this audience: ${t.floor}:1 body text, ${t.minBody}px minimum body size.</div>`;
    } else if (S.dirTab === 'type') {
      const fonts = Object.keys(PG.FONTS).sort();
      body = `<div class="crumb">/ Typography</div>
        <div style="font-family:${t.fd.replace(/"/g, "'")};font-weight:${t.fdw};font-size:34px;line-height:1.05;${t.upper ? 'text-transform:uppercase;' : ''}letter-spacing:${t.track}em;${t.italic ? 'font-style:italic;' : ''}">${esc(brandName())}</div>
        <div style="font-family:${t.fb.replace(/"/g, "'")};font-size:13.5px;color:var(--ui-fg-2)">${esc(PG.byId(PG.INDUSTRIES, S.brief.industry).copy.sub)}</div>
        <label class="f">Display face<select data-tune="display">${fonts.map((f) => opt(f, f, f === t.display)).join('')}</select></label>
        <label class="f">Body face<select data-tune="body">${fonts.map((f) => opt(f, f, f === t.body)).join('')}</select></label>
        <label class="f">Uppercase<input class="chk" type="checkbox" data-tune="upper" ${t.upper ? 'checked' : ''}></label>
        <div class="note">Scale ratio ${t.scale} · display ${t.fdw} weight · tracking ${t.track.toFixed(2)}em. Fonts load from Google Fonts.</div>
        ${tune.display || tune.body || tune.upper != null ? '<button class="link" data-act="reset-type">Reset to the direction\'s pairing</button>' : ''}`;
    } else if (S.dirTab === 'shape') {
      body = `<div class="crumb">/ Shape & layout</div>
        <label class="f">Corner radius${rng('radius', 0, 40, t.radius, 1, (v) => v + 'px')}</label>
        <label class="f">Density${rng('density', 0, 100, Math.round(t.density * 100), 1, (v) => v + '%')}</label>
        <label class="f">Buttons<select data-tune="button">${['pill', 'soft', 'square', 'outline', 'underline', 'shadow'].map((x) => opt(x, x[0].toUpperCase() + x.slice(1), x === t.button)).join('')}</select></label>
        <div class="note">Hero layout: <b style="color:var(--ui-fg)">${t.hero}</b>. Density changes spacing in every template; radius applies to cards, images and buttons.</div>
        ${tune.radius != null || tune.density != null || tune.button ? '<button class="link" data-act="reset-shape">Reset shape</button>' : ''}`;
    } else if (S.dirTab === 'imagery') {
      const b = { name: brandName(), initial: brandName().charAt(0) };
      const kinds = [...new Set([...d.imagery, ...PG.IMAGERY])].slice(0, 12);
      body = `<div class="crumb">/ Imagery</div>
        <div class="imgs">${kinds.map((k) => `<button class="${k === t.imagery ? 'on' : ''}" data-img="${k}"><div class="iv">${PG.art(t, b, 120, 80, { kind: k, salt: 2 })}</div><span>${esc(PG.IMAGERY_NAMES[k])}${d.imagery.includes(k) ? ' ★' : ''}</span></button>`).join('')}</div>
        <label class="f">All styles<select data-tune="imagery">${PG.IMAGERY.map((k) => opt(k, PG.IMAGERY_NAMES[k] + (d.imagery.includes(k) ? ' ★' : ''), k === t.imagery)).join('')}</select></label>
        <div class="row" style="display:flex;gap:8px"><button class="tbtn" data-act="reseed">${ICON.shuffle} New variation</button></div>
        <div class="note">★ = native to this direction. Imagery is generated from the palette as a stand-in until real photography or illustration exists.</div>`;
    } else {
      const parts = [['Personality', sc.parts.axis], ['Category fit', sc.parts.category], ['Audience', sc.parts.audience], ['Business model', sc.parts.func], ['Price tier', sc.parts.tier]];
      const target = PG.targetAxes(S.brief);
      const ev = PG.evidence(d, S.brief.industry).slice(0, 5);
      body = `<div class="bigscore"><b>${sc.total}</b><span class="note">/100 fit · ${sc.role === 'convention' ? 'category convention' : sc.role === 'adjacent' ? 'adjacent category' : sc.role === 'avoid' ? 'category breaker' : 'outside category'}</span></div>
        ${parts.map(([k, v]) => `<div class="scorebar"><span>${k}</span><b><i style="width:${Math.round(v * 100)}%"></i></b><output>${Math.round(v * 100)}</output></div>`).join('')}
        <div class="crumb">/ Why this direction</div>
        <div class="why">${PG.explain(d, S.brief, sc).map((l) => `<div class="${l.warn ? 'warn' : ''}"><b>${esc(l.k)}.</b> ${esc(l.v)}</div>`).join('')}</div>
        <div class="crumb">/ Personality vs brief</div>
        <div class="legend"><span><i style="border:1.5px solid var(--ui-fg-2);border-radius:50%"></i>Brief</span><span><i style="background:var(--ui-accent)"></i>Direction</span></div>
        ${PG.AXES.map((a) => `<div class="axis"><span>${a.lo}</span><div class="cmp"><span class="b" style="left:${target[a.id]}%"></span><span class="d" style="left:${d.axes[a.id]}%"></span></div><span>${a.hi}</span></div>`).join('')}
        <div class="crumb">/ Evidence · documented work</div>
        <div class="refs">${ev.length ? ev.map((r) => `<a class="ref" href="${PG.refSearchUrl(r)}" target="_blank" rel="noopener"><b>${esc(r.brand)} · ${r.year || 'n.d.'}</b><span class="conf ${r.conf}">${r.conf}</span><span>${esc(r.by)}. ${esc(r.traits)}</span></a>`).join('') : '<div class="note">No documented references linked yet.</div>'}</div>`;
    }
    return `<div class="nh" data-drag><span class="grip">⋮⋮</span><span class="kind">Direction</span><select id="d-dir" data-act-sel="dir" aria-label="Direction">${sel}</select><span class="dot live"></span></div>
      <span class="port in" style="top:17px"></span><span class="port out" style="top:17px"></span>
      <div class="nsec"><span>${esc(d.school)}</span><span style="display:flex;gap:10px;align-items:center">${S.pinned ? '<button class="link" data-act="best">Best match</button>' : ''}<button class="link" data-act="fav">${S.favs.has(d.id) ? '♥ Saved' : '♡ Save'}</button></span></div>
      <div style="padding:12px 14px 0;font-size:13px;color:var(--ui-fg-2);line-height:1.5">${esc(d.summary)}</div>
      <div class="ntabs">${tabs.map(([k, v]) => `<button class="${S.dirTab === k ? 'on' : ''}" data-dirtab="${k}">${v}</button>`).join('')}</div>
      <div class="nb">${body}</div>`;
  }

  function outNode(o) {
    const d = active(), tpl = PG.TEMPLATES[o.tp];
    const r = PG.renderBoard(o.tp, d, tuneFor(d.id), S.brief, { w: W.out - 26, h: 330 });
    const ind = PG.byId(PG.INDUSTRIES, S.brief.industry);
    const packSel = o.tp === 'packaging' ? `<select data-pack aria-label="Packaging format">${Object.keys(PG.PACK_NAMES).map((k) => opt(k, PG.PACK_NAMES[k] + (k === ind.packaging ? ' (default)' : ''), k === (S.brief.pack || ind.packaging))).join('')}</select>` : `<span>${esc(tpl.group)}</span>`;
    return `<div class="nh" data-drag><span class="grip">⋮⋮</span><span class="kind">Output</span><select data-out="${o.id}" aria-label="Touchpoint">${PG.TOUCHPOINTS.map((tp) => opt(tp.id, tp.name, tp.id === o.tp)).join('')}</select><button class="x" data-rm="${o.id}" aria-label="Remove output">×</button></div>
      <span class="port in" style="top:17px"></span>
      <div class="board">${r.html}</div>
      <div class="nfoot"><span>▭ ${tpl.w} × ${tpl.h}</span>${packSel}</div>`;
  }

  /* ================= flow: canvas ================= */
  function buildFlow() {
    const main = $('#main');
    main.innerHTML = `
      ${S.notice ? `<div class="notice">${ICON.spark}<span class="txt">${PG.DIRECTIONS.length} directions · ${PG.INDUSTRIES.length} industries · ${PG.REFERENCES.length} documented references. Every pick shows its evidence.</span><button class="tbtn" data-view="library">See the data →</button><button class="x" data-act="notice" aria-label="Dismiss">×</button></div>` : ''}
      <div class="canvas" id="canvas"><div class="world" id="world"><svg class="wires" id="wires" width="1" height="1"></svg></div></div>
      <div class="dock"><div style="position:relative;display:flex"><button data-act="menu">Add output</button>${S.menu ? `<div class="menu">${PG.TOUCHPOINTS.map((tp) => `<button data-add="${tp.id}">${esc(tp.name)}<span>${tp.w}×${tp.h}</span></button>`).join('')}</div>` : ''}</div><button data-act="fit">Fit content</button><button data-view="matrix" class="hide-sm">Compare all</button><button class="tbtn primary" data-act="export">${ICON.down} Export</button></div>`;
    const world = $('#world');
    const mk = (id, cls, w, html) => { const n = document.createElement('div'); n.className = 'node ' + cls; n.id = id; n.style.width = w + 'px'; n.innerHTML = html; world.appendChild(n); return n; };
    mk('n-brief', 'brief', W.brief, briefNode());
    mk('n-dir', 'dir sel', W.dir, dirNode());
    S.outputs.forEach((o) => mk('n-' + o.id, 'out', W.out, outNode(o)));
    layout();
    applyView();
    bindCanvas();
  }

  function layout() {
    const place = (id, x, y) => { if (!S.pos[id]) S.pos[id] = { x, y }; const el = $('#' + id); el.style.left = S.pos[id].x + 'px'; el.style.top = S.pos[id].y + 'px'; };
    place('n-brief', 0, 0);
    place('n-dir', W.brief + 60, 0);
    const cols = [W.brief + W.dir + 130, W.brief + W.dir + 130 + W.out + 30, W.brief + W.dir + 130 + 2 * (W.out + 30)];
    const bottoms = cols.map(() => 0);
    S.outputs.forEach((o) => {
      const id = 'n-' + o.id, p = S.pos[id];
      if (p) { const ci = cols.reduce((bi, cx, i) => (Math.abs(cx - p.x) < Math.abs(cols[bi] - p.x) ? i : bi), 0); bottoms[ci] = Math.max(bottoms[ci], p.y + $('#' + id).offsetHeight + 30); }
    });
    S.outputs.forEach((o) => {
      const id = 'n-' + o.id;
      if (S.pos[id]) return place(id);
      const ci = bottoms.indexOf(Math.min(...bottoms));
      place(id, cols[ci], bottoms[ci]);
      bottoms[ci] += $('#' + id).offsetHeight + 30;
    });
    wires();
  }

  function wires() {
    const svg = $('#wires'); if (!svg) return;
    const box = (id) => { const el = $('#' + id); const p = S.pos[id]; return { x: p.x, y: p.y, w: el.offsetWidth, h: el.offsetHeight }; };
    const curve = (a, b, dash) => { const x1 = a.x + a.w + 1, y1 = a.y + 22, x2 = b.x - 1, y2 = b.y + 22, dx = Math.max(60, Math.abs(x2 - x1) * 0.45); return `<path class="${dash ? 'dash' : ''}" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"/>`; };
    const bri = box('n-brief'), dir = box('n-dir');
    svg.innerHTML = curve(bri, dir, true) + S.outputs.map((o) => curve(dir, box('n-' + o.id))).join('');
  }

  function applyView() {
    const world = $('#world'), cv = $('#canvas'); if (!world) return;
    world.style.transform = `translate(${S.pan.x}px,${S.pan.y}px) scale(${S.zoom})`;
    cv.style.backgroundSize = `${24 * S.zoom}px ${24 * S.zoom}px`;
    cv.style.backgroundPosition = `${S.pan.x}px ${S.pan.y}px`;
    const zv = $('#zoomv'); if (zv) zv.textContent = Math.round(S.zoom * 100) + '%';
  }

  function fit() {
    const cv = $('#canvas'); if (!cv) return;
    const ids = ['n-brief', 'n-dir', ...S.outputs.map((o) => 'n-' + o.id)];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ids.forEach((id) => { const p = S.pos[id], el = $('#' + id); if (!p || !el) return; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + el.offsetWidth); y1 = Math.max(y1, p.y + el.offsetHeight); });
    const cw = cv.clientWidth, ch = cv.clientHeight, top = S.notice ? 70 : 24;
    S.zoom = clamp(Math.min((cw - 48) / (x1 - x0), (ch - top - 110) / (y1 - y0)), 0.2, 1);
    S.pan.x = (cw - (x1 - x0) * S.zoom) / 2 - x0 * S.zoom;
    S.pan.y = top - y0 * S.zoom;
    applyView();
  }
  function zoomBy(f, cx, cy) {
    const cv = $('#canvas'); if (!cv) return;
    if (cx == null) { cx = cv.clientWidth / 2; cy = cv.clientHeight / 2; }
    const nz = clamp(S.zoom * f, 0.15, 2);
    S.pan.x = cx - (cx - S.pan.x) * (nz / S.zoom);
    S.pan.y = cy - (cy - S.pan.y) * (nz / S.zoom);
    S.zoom = nz; applyView();
  }

  function bindCanvas() {
    const cv = $('#canvas');
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const node = e.target.closest('.node');
      if (node) {
        const h = e.target.closest('[data-drag]');
        if (!h || e.target.closest('select,input,button')) return;
        $$('.node.sel').forEach((n) => n.classList.remove('sel')); node.classList.add('sel');
        drag = { kind: 'node', id: node.id, sx: e.clientX, sy: e.clientY, ox: S.pos[node.id].x, oy: S.pos[node.id].y };
      } else {
        drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: S.pan.x, oy: S.pan.y };
        cv.classList.add('panning');
      }
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (drag.kind === 'pan') { S.pan.x = drag.ox + dx; S.pan.y = drag.oy + dy; applyView(); }
      else { const p = S.pos[drag.id]; p.x = drag.ox + dx / S.zoom; p.y = drag.oy + dy / S.zoom; const el = $('#' + drag.id); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; wires(); }
    });
    const end = () => { drag = null; cv.classList.remove('panning'); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => {
      if (e.target.closest('select')) return;
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else { S.pan.x -= e.deltaX; S.pan.y -= e.deltaY; applyView(); }
    }, { passive: false });
  }

  /* Partial refreshes keep focus in the brief while typing. */
  function refreshDir() { const n = $('#n-dir'); if (n) n.innerHTML = dirNode(); }
  function refreshOutputs() { S.outputs.forEach((o) => { const n = $('#n-' + o.id); if (n) n.innerHTML = outNode(o); }); requestAnimationFrame(wires); }
  function refreshBrief() { const n = $('#n-brief'); if (n) n.innerHTML = briefNode(); }

  function onBriefChange(opts) {
    rerank(); save();
    if (S.view === 'flow') { if (!(opts && opts.keepBrief)) refreshBrief(); refreshDir(); refreshOutputs(); }
    else renderMain();
    renderSide();
  }
  function onTuneChange() {
    save();
    if (S.view === 'flow') { refreshDir(); refreshOutputs(); }
    renderSide();
  }
  function setActive(id, pinned) {
    S.activeDir = id; S.pinned = pinned != null ? pinned : id !== S.ranking.shortlist[0].dir.id; save();
  }

  /* ================= matrix ================= */
  function buildMatrix() {
    const main = $('#main');
    const H = 230;
    const tps = PG.TOUCHPOINTS.filter((tp) => S.mxTps.includes(tp.id));
    const size = (tp) => { const w = Math.min(380, Math.round(H * tp.w / tp.h)); return { w, h: Math.round(w * tp.h / tp.w) }; };
    const ranking = PG.rank(S.brief, S.mxN);
    const ind = PG.byId(PG.INDUSTRIES, S.brief.industry);
    const auds = S.brief.audiences.map((a) => PG.byId(PG.AUDIENCES, a).name.split(' (')[0]).join(' + ');
    main.innerHTML = `<div class="mx">
      <div class="mx-bar"><span class="lbl">Directions</span><div class="seg sm">${[4, 6, 8].map((n) => `<button class="${S.mxN === n ? 'on' : ''}" data-mxn="${n}">${n}</button>`).join('')}</div>
        <span class="lbl">Touchpoints</span><div class="chips">${PG.TOUCHPOINTS.map((tp) => `<button class="${S.mxTps.includes(tp.id) ? 'on' : ''}" data-mxtp="${tp.id}">${esc(tp.name)}</button>`).join('')}</div>
        <span class="note" style="flex-basis:100%">${esc(brandName())} · ${esc(ind.name)} · ${esc(auds)} · ${esc(PG.byId(PG.TIERS, S.brief.tier).name)} · ${esc(PG.byId(PG.STRATEGIES, S.brief.strategy).name)}. The shortlist is picked for fit and for variety, so no two rows are near-duplicates.</span></div>
      <div class="mx-scroll" id="mxs"><div class="mx-grid">
        <div class="mx-colh"><div class="corner">Direction</div>${tps.map((tp) => `<div style="width:${size(tp).w + 29}px">${esc(tp.name)}</div>`).join('')}</div>
        ${ranking.shortlist.map((x, i) => {
          const d = x.dir, sc = x.score, t = PG.tokens(d, tuneFor(d.id), S.brief);
          return `<div class="mx-row" data-row="${d.id}"><div class="mx-head"><span class="rk">#${i + 1} · <span class="role">${sc.role}</span></span><h3>${esc(d.name)}</h3><span class="fitn">${sc.total}<span class="note"> / 100</span></span>
            <div class="sws">${[t.bg, t.surface, t.ink, t.primary, t.secondary, t.accent].map((c) => `<i style="background:${c}"></i>`).join('')}</div><p>${esc(d.summary)}</p>
            <div class="acts"><button class="tbtn" data-open="${d.id}">Open in Flow</button><button class="tbtn" data-favd="${d.id}">${S.favs.has(d.id) ? '♥' : '♡'}</button></div></div>
            ${tps.map((tp) => `<div class="mx-cell" data-cell="${d.id}|${tp.id}" style="width:${size(tp).w + 29}px;min-height:${H + 40}px"></div>`).join('')}</div>`;
        }).join('')}</div></div></div>`;
    // Fill cells progressively so the first rows appear immediately.
    const cells = $$('.mx-cell', main);
    let i = 0;
    const step = () => {
      const end = Math.min(cells.length, i + 6);
      for (; i < end; i++) {
        const [id, tp] = cells[i].dataset.cell.split('|');
        const tpl = PG.TOUCHPOINTS.find((x) => x.id === tp), sz = size(tpl);
        const r = PG.renderBoard(tp, dirById(id), tuneFor(id), S.brief, { w: sz.w, h: sz.h });
        cells[i].innerHTML = r.html + `<span class="cap">${tpl.w}×${tpl.h}</span>`;
      }
      if (i < cells.length && S.view === 'matrix') setTimeout(step, 0);
    };
    step();
    renderDock();
  }

  function renderDock() {
    const d = document.createElement('div');
    d.className = 'dock';
    d.innerHTML = `<button data-view="flow">Back to Flow</button><button data-act="shuffle">Shuffle imagery</button><button class="tbtn primary" data-act="export">${ICON.down} Export</button>`;
    $('#main').appendChild(d);
  }

  /* ================= library ================= */
  function buildLibrary() {
    const main = $('#main');
    const q = S.libQ.toLowerCase();
    const tabs = [['directions', `Directions · ${PG.DIRECTIONS.length}`], ['industries', `Industries · ${PG.INDUSTRIES.length}`], ['audiences', `Audiences · ${PG.AUDIENCES.length}`], ['references', `References · ${PG.REFERENCES.length}`], ['method', 'Research & method']];
    let body = '';
    const dname = (id) => (dirById(id) || { name: id }).name;
    if (S.libTab === 'directions') {
      const list = PG.DIRECTIONS.filter((d) => matchQ(d, q));
      body = `<div class="cards">${list.map((d) => {
        const t = PG.tokens(d, PG.defaultTune(d), S.brief);
        const conv = PG.INDUSTRIES.filter((i) => i.convention.includes(d.id)).map((i) => i.name);
        const refs = PG.evidence(d, S.brief.industry);
        return `<article class="dcard"><div class="tv">${PG.art(t, { name: brandName(), initial: brandName().charAt(0) }, 320, 160, { salt: 2 })}<span class="aa" style="font-family:${t.fd.replace(/"/g, "'")};font-weight:${t.fdw};color:${t.ink};background:${t.bg};padding:4px 9px;${t.upper ? 'text-transform:uppercase;' : ''}">Aa</span><span class="sws">${[t.bg, t.ink, t.primary, t.secondary, t.accent].map((c) => `<i style="background:${c}"></i>`).join('')}</span></div>
          <div class="bd"><h3>${esc(d.name)}</h3><div class="sc">${esc(d.school)}</div><p>${esc(d.summary)}</p>
          <ul>${d.principles.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
          <div class="note">${esc(d.type.display)} + ${esc(d.type.body)} · ${esc(PG.IMAGERY_NAMES[d.imagery[0]])} · ${d.tiers.join(' / ')}</div>
          ${conv.length ? `<div class="tags">${conv.map((c) => `<span class="c">${esc(c)}</span>`).join('')}</div>` : ''}
          <div class="tags">${d.tags.map((x) => `<span>${esc(x)}</span>`).join('')}</div>
          <div class="ft"><span class="note">${refs.length} reference${refs.length === 1 ? '' : 's'}</span><button class="tbtn" data-open="${d.id}">Use direction</button></div></div></article>`;
      }).join('')}</div>`;
    } else if (S.libTab === 'industries') {
      const list = PG.INDUSTRIES.filter((i) => !q || (i.name + i.group + i.codes.join(' ')).toLowerCase().includes(q));
      body = list.map((i) => {
        const refs = PG.REFERENCES.filter((r) => r.ind.includes(i.id));
        return `<section class="irow"><div><div><h3>${esc(i.name)}</h3><div class="grp">${esc(i.group)} · packaging: ${esc(PG.PACK_NAMES[i.packaging])}</div></div><div><button class="tbtn" data-useind="${i.id}">Use in brief</button></div></div>
          <div><p class="k">Category codes</p><ul>${i.codes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
          <div><p class="k">Conventions</p><div class="tags">${i.convention.map((x) => `<span class="c">${esc(dname(x))}</span>`).join('')}</div>
          <p class="k">Proven adjacent</p><div class="tags">${i.adjacent.map((x) => `<span>${esc(dname(x))}</span>`).join('')}</div>
          <p class="k">Usually avoided</p><div class="tags">${i.avoid.map((x) => `<span class="a">${esc(dname(x))}</span>`).join('')}</div>
          <p class="k">References</p><div class="tags">${refs.map((r) => `<span>${esc(r.brand)} ’${String(r.year || '').slice(2)}</span>`).join('') || '<span>None yet</span>'}</div></div></section>`;
      }).join('');
    } else if (S.libTab === 'audiences') {
      const list = PG.AUDIENCES.filter((a) => !q || (a.name + a.note).toLowerCase().includes(q));
      body = `<div class="cards">${list.map((a) => `<article class="dcard"><div class="bd"><h3>${esc(a.name)}</h3><p>${esc(a.note)}</p>
        <div class="note">Contrast floor ${a.contrast}:1 · body text ≥ ${a.minBody}px</div>
        <div class="note">Personality shift: ${Object.keys(a.shift).map((k) => `${PG.AXES.find((x) => x.id === k)[a.shift[k] > 0 ? 'hi' : 'lo']} ${a.shift[k] > 0 ? '+' : ''}${a.shift[k]}`).join(', ')}</div>
        <div class="tags">${a.boost.map((x) => `<span class="c">+ ${esc(x)}</span>`).join('')}${a.penalize.map((x) => `<span class="a">− ${esc(x)}</span>`).join('')}</div></div></article>`).join('')}</div>`;
    } else if (S.libTab === 'references') {
      const list = PG.REFERENCES.filter((r) => (S.libConf === 'all' || r.conf === S.libConf) && (!q || (r.brand + r.by + r.traits + r.year).toLowerCase().includes(q)));
      body = `<div class="lbl" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">Confidence <div class="seg sm">${['all', 'verified', 'likely', 'unverified'].map((c) => `<button class="${S.libConf === c ? 'on' : ''}" data-conf="${c}">${c}</button>`).join('')}</div></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Brand</th><th>Studio / designer</th><th>Year</th><th>Industries</th><th>Directions</th><th>Visual traits</th><th>Confidence</th><th>Source</th></tr></thead><tbody>
        ${list.map((r) => `<tr><td>${esc(r.brand)}</td><td>${esc(r.by)}</td><td class="num">${r.year || '—'}</td><td>${r.ind.map((i) => esc(PG.byId(PG.INDUSTRIES, i).name)).join(', ')}</td><td>${[...new Set([...(r.dirs || []), ...PG.DIRECTIONS.filter((d) => d.refs.includes(r.id)).map((d) => d.id)])].map((x) => esc(dname(x))).join(', ') || '—'}</td><td>${esc(r.traits)}${r.note ? ` <em>${esc(r.note)}</em>` : ''}</td><td><span class="conf ${r.conf}">${r.conf}</span></td><td><a href="${PG.refSearchUrl(r)}" target="_blank" rel="noopener">Search ↗</a></td></tr>`).join('')}
        </tbody></table></div>`;
    } else {
      body = `<div class="prose">
        <h3>How a brief becomes directions</h3>
        <p>A client without a logo can still answer four questions: industry, business model, audience and price tier. Each answer carries data. The industry sets a starting personality and lists its <em>category codes</em>: the directions buyers already associate with it, the ones proven in adjacent categories, and the ones it usually avoids. The business model and audiences shift that personality and add tags to favour or penalise. The tier sets how exclusive it should feel.</p>
        <p>Every direction is scored out of 100:</p>
        <ul><li><b>Personality fit, 34%:</b> distance between the direction and the brief on five axes (serious↔playful, classic↔progressive, calm↔energetic, accessible↔exclusive, human↔technical).</li>
        <li><b>Category fit, 30%:</b> depends on strategy. <em>Conform</em> rewards conventions, <em>Balance</em> rewards adjacent codes most, <em>Disrupt</em> rewards directions from outside the category.</li>
        <li><b>Audience, 16%:</b> tags each audience responds to or rejects (the second audience counts half).</li>
        <li><b>Price tier, 12%</b> and <b>business model, 8%</b>.</li></ul>
        <p>The shortlist uses maximal marginal relevance: each pick trades fit against similarity to directions already picked (personality, imagery and hue), so you get genuinely different routes rather than six shades of one idea.</p>
        <p>Rendering applies accessibility floors per audience: WCAG 2.2 AA (4.5:1) by default, and AAA (7:1) for older adults and the general public. Text colours that miss the floor are corrected automatically, and the Colour tab reports every check.</p>
        <h3>Research the engine cites</h3>
        ${PG.RESEARCH.map((r) => `<div class="rsrc"><b>${esc(r.title)}</b><div>${esc(r.finding)}<br><span class="note">${esc(r.source)} · <span class="conf ${r.conf}">${r.conf}</span>${r.url ? ` · <a href="${r.url}" target="_blank" rel="noopener">${r.url.replace('https://', '')}</a>` : ''}</span></div></div>`).join('')}
        <h3>About the reference library</h3>
        <p>${PG.REFERENCES.length} identity projects from studios including Pentagram, Collins, Wolff Olins, Koto, DesignStudio, Jones Knowles Ritchie, Landor, Lippincott, Johnson Banks, Experimental Jetset and Porto Rocha, plus design-history sources (Bauhaus, Swiss Style, Memphis, Rand, Vignelli, Aicher). Each was checked against trade press or the studio's own page in October 2026 and carries a confidence label. No brand artwork is stored or copied. Directions are distilled principles, and every output is generated from parameters.</p>
        <h3>Extending the data</h3>
        <p>Directions live in <code>js/data/directions.js</code>, industries, models and audiences in <code>js/data/taxonomy.js</code>, and references in <code>js/data/references.js</code>. Add an entry and it appears in scoring, the matrix and this library immediately.</p></div>`;
    }
    main.innerHTML = `<div class="lib"><div class="lib-bar"><div class="seg sm">${tabs.map(([k, v]) => `<button class="${S.libTab === k ? 'on' : ''}" data-libtab="${k}">${v}</button>`).join('')}</div>
      ${S.libTab !== 'method' ? `<label class="search">${ICON.search}<input id="lib-q" type="text" placeholder="Search the ${S.libTab}" value="${esc(S.libQ)}" autocomplete="off"></label>` : ''}</div>
      <div class="lib-scroll">${body}</div></div>`;
  }

  /* ================= modals ================= */
  function summary() {
    const d = active(), sc = scoreOf(d.id), t = PG.tokens(d, tuneFor(d.id), S.brief), b = S.brief;
    const ind = PG.byId(PG.INDUSTRIES, b.industry);
    const lines = [
      `# ${brandName()}: ${d.name}`, '', d.summary, '',
      `**Brief:** ${ind.name} · ${PG.byId(PG.FUNCTIONS, b.func).name} · ${b.audiences.map((a) => PG.byId(PG.AUDIENCES, a).name).join(' + ')} · ${PG.byId(PG.TIERS, b.tier).name} · ${PG.byId(PG.STRATEGIES, b.strategy).name}`,
      `**Fit:** ${sc.total}/100 (${sc.role})`, '', '## Why', ...PG.explain(d, b, sc).map((l) => `- **${l.k}.** ${l.v}`), '',
      '## Principles', ...d.principles.map((p) => `- ${p}`), '',
      '## System', `- Palette: background ${t.bg}, text ${t.ink}, primary ${t.primary}, secondary ${t.secondary}, accent ${t.accent}`,
      `- Type: ${t.display} (display, ${t.fdw}${t.upper ? ', uppercase' : ''}) with ${t.body} (body)`,
      `- Shape: ${t.radius}px radius, ${t.button} buttons · Imagery: ${PG.IMAGERY_NAMES[t.imagery]}`,
      `- Voice: "${d.voice}"`, '', '## Evidence',
      ...PG.evidence(d, b.industry).slice(0, 6).map((r) => `- ${r.brand} (${r.by}, ${r.year || 'n.d.'}) [${r.conf}]: ${r.traits}`)
    ];
    return lines.join('\n');
  }
  function openExport(tab) {
    tab = tab || 'json';
    const d = active(), t = PG.tokens(d, tuneFor(d.id), S.brief);
    const text = tab === 'json' ? PG.exportTokens(d, t, brandName()) : tab === 'css' ? PG.exportCss(t) : summary();
    modal(`Export · ${esc(d.name)}`, `<div class="seg sm">${[['json', 'Design tokens (JSON)'], ['css', 'CSS variables'], ['md', 'Direction summary']].map(([k, v]) => `<button class="${tab === k ? 'on' : ''}" data-extab="${k}">${v}</button>`).join('')}</div>
      <textarea id="ex-ta" readonly aria-label="Export">${esc(text)}</textarea>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="tbtn primary" data-act="copy-ex">Copy</button><span class="note">Tokens follow the active tuning. The summary is ready to paste into a deck or doc.</span></div>`);
  }
  function openHelp() {
    modal('How Powergrade works', `<div class="steps">
      <div><b>1 · Brief</b>Pick the industry, business model, audiences and price tier. No logo or colours needed.</div>
      <div><b>2 · Directions</b>The engine scores 34 art directions against the brief and shortlists diverse routes, each with evidence.</div>
      <div><b>3 · Outputs</b>The active direction renders live across web, app, social, packaging, print, events and email.</div>
      <div><b>4 · Compare & tune</b>Use Compare all to see every shortlisted direction on every touchpoint, then tune colour, type, shape and imagery.</div></div>
      <p class="note">Canvas: drag the background to pan, scroll to move, Ctrl/⌘ + scroll to zoom, and drag a node by its header. Changes and saved directions are remembered in this browser.</p>`);
  }
  function modal(title, html) {
    closeModal();
    const m = document.createElement('div');
    m.className = 'modal'; m.id = 'modal';
    m.innerHTML = `<div class="dlg" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dlg-h"><h2>${title}</h2><button class="iconbtn" data-act="close" aria-label="Close">×</button></div><div class="dlg-b">${html}</div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
  }
  function closeModal() { const m = $('#modal'); if (m) m.remove(); }

  /* ================= render ================= */
  function renderMain() {
    S.menu = false;
    if (S.view === 'flow') buildFlow();
    else if (S.view === 'matrix') buildMatrix();
    else buildLibrary();
  }
  function renderAll() { renderTop(); renderSide(); renderMain(); }

  /* ================= events ================= */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, [data-dir]');
    if (!el) return;
    const ds = el.dataset;
    if (ds.view) { S.view = ds.view; S.sideOpen = false; renderAll(); if (S.view === 'flow') requestAnimationFrame(fit); return; }
    if (ds.dir) { setActive(ds.dir); S.sideOpen = false; if (S.view !== 'flow') { S.view = 'flow'; renderAll(); requestAnimationFrame(fit); } else { refreshDir(); refreshOutputs(); renderSide(); } return; }
    if (ds.open) { setActive(ds.open); S.view = 'flow'; renderAll(); requestAnimationFrame(fit); return; }
    if (ds.favd) { S.favs.has(ds.favd) ? S.favs.delete(ds.favd) : S.favs.add(ds.favd); save(); el.textContent = S.favs.has(ds.favd) ? '♥' : '♡'; return; }
    if (ds.sidetab) { S.sideTab = ds.sidetab; S.sideSub = 'explore'; renderSide(); return; }
    if (ds.sidesub) { S.sideSub = ds.sidesub; renderSide(); return; }
    if (ds.recipe != null) { const r = RECIPES[+ds.recipe]; S.brief = Object.assign({}, DEFAULT_BRIEF, r.b, { manual: {}, pack: null }); S.pinned = false; S.sideOpen = false; onBriefChange(); if (S.view === 'flow') requestAnimationFrame(() => { layout(); fit(); }); toast('Brief loaded: ' + r.n); return; }
    if (ds.strategy) { S.brief.strategy = ds.strategy; onBriefChange(); return; }
    if (ds.dirtab) { S.dirTab = ds.dirtab; refreshDir(); requestAnimationFrame(wires); return; }
    if (ds.pal != null) { tuneFor(S.activeDir).pal = +ds.pal; onTuneChange(); return; }
    if (ds.mode) { tuneFor(S.activeDir).mode = ds.mode; onTuneChange(); return; }
    if (ds.img) { tuneFor(S.activeDir).imagery = ds.img; onTuneChange(); return; }
    if (ds.copy) { copy(ds.copy); return; }
    if (ds.rm) { S.outputs = S.outputs.filter((o) => o.id !== ds.rm); delete S.pos['n-' + ds.rm]; save(); buildFlow(); return; }
    if (ds.add) { const id = 'o' + Date.now().toString(36); S.outputs.push({ id, tp: ds.add }); save(); S.menu = false; buildFlow(); toast('Added ' + PG.TEMPLATES[ds.add].name); return; }
    if (ds.mxn) { S.mxN = +ds.mxn; buildMatrix(); return; }
    if (ds.mxtp) { S.mxTps = S.mxTps.includes(ds.mxtp) ? S.mxTps.filter((x) => x !== ds.mxtp) : PG.TOUCHPOINTS.map((t) => t.id).filter((x) => x === ds.mxtp || S.mxTps.includes(x)); buildMatrix(); return; }
    if (ds.libtab) { S.libTab = ds.libtab; S.libQ = ''; buildLibrary(); return; }
    if (ds.conf) { S.libConf = ds.conf; buildLibrary(); return; }
    if (ds.useind) { S.brief.industry = ds.useind; S.brief.pack = null; S.pinned = false; rerank(); save(); S.view = 'flow'; renderAll(); requestAnimationFrame(fit); return; }
    if (ds.extab) { openExport(ds.extab); return; }
    switch (ds.act) {
      case 'side': S.sideOpen = !S.sideOpen; renderSide(); break;
      case 'zin': zoomBy(1.2); break;
      case 'zout': zoomBy(1 / 1.2); break;
      case 'fit': fit(); break;
      case 'notice': S.notice = false; LS.set('notice', false); $('.notice') && $('.notice').remove(); break;
      case 'menu': S.menu = !S.menu; { const keep = { zoom: S.zoom, pan: Object.assign({}, S.pan) }; buildFlow(); S.zoom = keep.zoom; S.pan = keep.pan; applyView(); } break;
      case 'shuffle': PG.DIRECTIONS.forEach((d) => { tuneFor(d.id).seed = Math.floor(Math.random() * 99991); }); save(); if (S.view === 'matrix') buildMatrix(); else { refreshDir(); refreshOutputs(); } renderSide(); break;
      case 'reseed': tuneFor(S.activeDir).seed = Math.floor(Math.random() * 99991); onTuneChange(); break;
      case 'fav': S.favs.has(S.activeDir) ? S.favs.delete(S.activeDir) : S.favs.add(S.activeDir); save(); refreshDir(); renderSide(); break;
      case 'best': S.pinned = false; rerank(); save(); refreshDir(); refreshOutputs(); renderSide(); break;
      case 'auto-axes': S.brief.manual = {}; onBriefChange(); break;
      case 'reset-type': Object.assign(tuneFor(S.activeDir), { display: null, body: null, upper: null }); onTuneChange(); break;
      case 'reset-shape': Object.assign(tuneFor(S.activeDir), { radius: null, density: null, button: null }); onTuneChange(); break;
      case 'export': openExport(); break;
      case 'help': openHelp(); break;
      case 'close': closeModal(); break;
      case 'copy-ex': copy($('#ex-ta').value, $('#ex-ta')); break;
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target, ds = el.dataset;
    if (el.id === 'side-q') { S.q = el.value; const pos = el.selectionStart; renderSide(); const n = $('#side-q'); n.focus(); n.setSelectionRange(pos, pos); return; }
    if (el.id === 'lib-q') { S.libQ = el.value; const pos = el.selectionStart; buildLibrary(); const n = $('#lib-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
    if (ds.b === 'name') { S.brief.name = el.value; save(); if (S.view === 'flow') { refreshDir(); refreshOutputs(); } renderSide(); return; }
    if (ds.axis) { S.brief.manual[ds.axis] = +el.value; el.classList.add('manual'); rerank(); save(); refreshDir(); refreshOutputs(); renderSide(); return; }
    if (ds.tune && el.type === 'range') {
      const tn = tuneFor(S.activeDir), v = +el.value;
      if (ds.tune === 'density') tn.density = v / 100; else tn[ds.tune] = v;
      const out = el.parentElement.querySelector('output');
      if (out) out.textContent = ds.tune === 'hue' ? (v > 0 ? '+' : '') + v + '°' : ds.tune === 'sat' ? (v > 0 ? '+' : '') + v + '%' : ds.tune === 'radius' ? v + 'px' : v + '%';
      save(); refreshOutputs();
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target, ds = el.dataset;
    if (ds.tune && el.type === 'range') { onTuneChange(); return; }
    if (ds.b === 'industry') { S.brief.industry = el.value; S.brief.pack = null; S.brief.manual = {}; S.pinned = false; onBriefChange(); return; }
    if (ds.b === 'func') { S.brief.func = el.value; onBriefChange({ keepBrief: false }); return; }
    if (ds.b === 'aud0') { S.brief.audiences = [el.value, S.brief.audiences[1]].filter(Boolean); onBriefChange(); return; }
    if (ds.b === 'aud1') { S.brief.audiences = [S.brief.audiences[0], el.value].filter(Boolean); onBriefChange(); return; }
    if (ds.b === 'tier') { S.brief.tier = el.value; onBriefChange(); return; }
    if (ds.axis) { onBriefChange(); return; }
    if (ds.actSel === 'dir') { setActive(el.value); refreshDir(); refreshOutputs(); renderSide(); return; }
    if (ds.out) { const o = S.outputs.find((x) => x.id === ds.out); o.tp = el.value; save(); const n = $('#n-' + o.id); n.innerHTML = outNode(o); requestAnimationFrame(wires); return; }
    if (ds.pack !== undefined) { S.brief.pack = el.value; save(); refreshOutputs(); if (S.view === 'matrix') buildMatrix(); return; }
    if (ds.tune === 'upper') { tuneFor(S.activeDir).upper = el.checked; onTuneChange(); return; }
    if (ds.tune) { tuneFor(S.activeDir)[ds.tune] = el.value; onTuneChange(); }
  });
  window.addEventListener('resize', () => { if (S.view === 'flow') applyView(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); if (S.menu) { S.menu = false; buildFlow(); } } });

  /* ================= boot ================= */
  PG.loadFont('Inter'); PG.loadFont('JetBrains Mono');
  rerank();
  renderAll();
  requestAnimationFrame(() => { layout(); fit(); });
  // Fonts change node heights once they load; re-run layout so wires and stacking stay right.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S.view === 'flow') { wires(); } });
})();
