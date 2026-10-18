/* Library: directions, industries, audiences, layouts, photography, references and method. */
(function () {
  const App = PG.App, S = App.S, esc = App.esc, $ = App.$;
  const L = { tab: 'directions', q: '', conf: 'all' };
  const dname = (id) => (PG.byId(PG.DIRECTIONS, id) || { name: id }).name;

  function body() {
    const q = L.q.toLowerCase();
    if (L.tab === 'directions') {
      return `<div class="cards">${PG.DIRECTIONS.filter((d) => App.matchQ(d, q)).map((d) => {
        const t = PG.tokens(d, PG.defaultTune(d), S.brief), pick = PG.photoPicker(S.brief, t, 'lib|' + d.id);
        const conv = PG.INDUSTRIES.filter((i) => i.convention.includes(d.id)).map((i) => i.name), refs = PG.evidence(d, S.brief.industry);
        return `<article class="dcard"><div class="tv">${PG.photoImg(pick('hero', 0), t, { grade: PG.gradeFor(d.id), thumb: true })}<span class="aa" style="font-family:${t.fd.replace(/"/g, "'")};font-weight:${t.fdw};color:${t.ink};background:${t.bg};${t.upper ? 'text-transform:uppercase;' : ''}">Aa</span><span class="sws">${[t.bg, t.ink, t.primary, t.secondary, t.accent].map((c) => `<i style="background:${c}"></i>`).join('')}</span></div>
          <h3>${esc(d.name)}</h3><div class="sc">${esc(d.school)}</div><p>${esc(d.summary)}</p><ul>${d.principles.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
          <div class="note">${esc(d.type.display)} + ${esc(d.type.body)} · ${esc(PG.GRADE_NAMES[PG.gradeFor(d.id)])} photography · ${d.tiers.join(' / ')}</div>
          ${conv.length ? `<div class="tags">${conv.map((c) => `<span class="c">${esc(c)}</span>`).join('')}</div>` : ''}
          <div class="ft"><span class="note">${refs.length} reference${refs.length === 1 ? '' : 's'}</span><button class="tbtn sm" data-a="pickDir" data-d="${d.id}">Use direction</button></div></article>`;
      }).join('')}</div>`;
    }
    if (L.tab === 'layouts') {
      const d = App.dir(), tn = App.tune();
      return Object.keys(PG.TEMPLATES).filter((tp) => !PG.TEMPLATES[tp].three).map((tp) => {
        const T = PG.TEMPLATES[tp], keys = Object.keys(T.layouts).filter((k) => !q || (T.layouts[k].name + T.layouts[k].ref).toLowerCase().includes(q));
        if (!keys.length) return '';
        const w = T.w >= T.h ? 300 : 170;
        return `<h3 class="h2" style="margin-top:8px">${esc(T.name)} <span class="note">${keys.length} layouts · rendered in ${esc(d.name)}</span></h3><div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(${w + 20}px,1fr));margin-bottom:34px">${keys.map((k) => {
          const r = PG.renderBoard(tp, d, tn, S.brief, { w, h: 260 }, { layout: k });
          return `<article class="dcard"><div style="background:var(--ui-card);border-radius:6px;padding:16px;display:grid;place-items:center;min-height:200px">${r.html}</div><h3 style="font-size:14px">${esc(T.layouts[k].name)}</h3><p style="font-size:12px">${esc(T.layouts[k].ref)}</p><div class="ft"><span></span><button class="tbtn sm" data-a="useLayout" data-tp="${tp}" data-l="${k}">Use layout</button></div></article>`;
        }).join('')}</div>`;
      }).join('');
    }
    if (L.tab === 'photos') {
      const list = (PG.PHOTOS || []).filter((p) => !q || (p.alt + p.cats.join(' ') + p.industries.join(' ')).toLowerCase().includes(q));
      if (!list.length) return '<div class="empty">No photos match.</div>';
      return `<p class="note" style="margin:0 0 18px">${list.length} photographs. Every image is CC0, public domain or Unsplash-licensed, credited below. Layouts pick from these by industry and grade them to the direction.</p>
        <div class="pgrid">${list.map((p) => `<figure><img src="${p.thumb}" alt="${esc(p.alt)}" loading="lazy" style="aspect-ratio:${p.w}/${p.h}"><figcaption>${esc(p.alt)}<br><a href="${esc(p.credit.url)}" target="_blank" rel="noopener">${esc(p.credit.author || 'Unknown')}</a> · ${esc(p.credit.license)}</figcaption></figure>`).join('')}</div>`;
    }
    if (L.tab === 'industries') {
      return PG.INDUSTRIES.filter((i) => !q || (i.name + i.group + i.codes.join(' ')).toLowerCase().includes(q)).map((i) => {
        const refs = PG.REFERENCES.filter((r) => r.ind.includes(i.id));
        return `<section class="irow"><div><div><h3>${esc(i.name)}</h3><div class="grp">${esc(i.group)}</div></div><div><button class="tbtn sm" data-a="useInd" data-i="${i.id}">Use in brief</button></div></div>
          <div><p class="k">Category codes</p><ul>${i.codes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
          <div><p class="k">Conventions</p><div class="tags">${i.convention.map((x) => `<span class="c">${esc(dname(x))}</span>`).join('')}</div><p class="k">Proven adjacent</p><div class="tags">${i.adjacent.map((x) => `<span>${esc(dname(x))}</span>`).join('')}</div>
          <p class="k">Usually avoided</p><div class="tags">${i.avoid.map((x) => `<span class="a">${esc(dname(x))}</span>`).join('')}</div><p class="k">References</p><div class="tags">${refs.map((r) => `<span>${esc(r.brand)} ’${String(r.year || '').slice(2)}</span>`).join('') || '<span>None yet</span>'}</div></div></section>`;
      }).join('');
    }
    if (L.tab === 'audiences') {
      return `<div class="cards">${PG.AUDIENCES.filter((a) => !q || (a.name + a.note).toLowerCase().includes(q)).map((a) => `<article class="dcard"><h3>${esc(a.name)}</h3><p>${esc(a.note)}</p><div class="note">Contrast floor ${a.contrast}:1 · body text ≥ ${a.minBody}px</div><div class="tags">${a.boost.map((x) => `<span class="c">+ ${esc(x)}</span>`).join('')}${a.penalize.map((x) => `<span class="a">− ${esc(x)}</span>`).join('')}</div></article>`).join('')}</div>`;
    }
    if (L.tab === 'references') {
      const list = PG.REFERENCES.filter((r) => (L.conf === 'all' || r.conf === L.conf) && (!q || (r.brand + r.by + r.traits + r.year).toLowerCase().includes(q)));
      return `<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px"><span class="lbl" style="margin:0">Confidence</span><div class="seg">${['all', 'verified', 'likely', 'unverified'].map((c) => `<button class="${L.conf === c ? 'on' : ''}" data-a="libConf" data-c="${c}">${c}</button>`).join('')}</div></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Brand</th><th>Studio / designer</th><th>Year</th><th>Industries</th><th>Directions</th><th>Visual traits</th><th>Confidence</th><th>Source</th></tr></thead><tbody>
        ${list.map((r) => `<tr><td>${esc(r.brand)}</td><td>${esc(r.by)}</td><td class="num">${r.year || '—'}</td><td>${r.ind.map((i) => esc(PG.byId(PG.INDUSTRIES, i).name)).join(', ')}</td><td>${[...new Set([...(r.dirs || []), ...PG.DIRECTIONS.filter((d) => d.refs.includes(r.id)).map((d) => d.id)])].map((x) => esc(dname(x))).join(', ') || '—'}</td><td>${esc(r.traits)}</td><td><span class="conf ${r.conf}">${r.conf}</span></td><td><a href="${PG.refSearchUrl(r)}" target="_blank" rel="noopener">Search ↗</a></td></tr>`).join('')}</tbody></table></div>`;
    }
    return `<div class="prose"><h3>How a brief becomes directions</h3>
      <p>Industry, business model, audience and price tier each carry data: a starting personality, the category's visual codes, and tags to favour or avoid. Every direction is scored out of 100: personality fit 34%, category fit 30% (set by the conform, balance or disrupt strategy), audience 16%, price tier 12%, business model 8%. The shortlist trades fit against similarity so the routes really differ.</p>
      <h3>How the board is built</h3>
      <p>Each touchpoint has several layout archetypes drawn from patterns on leading studio, fashion and product sites. Photography is chosen for the industry from a licensed library and colour-graded to the direction (black and white, faded film, duotone and so on). Packaging, stationery, devices and outdoor are rendered in 3D with three.js under CC0 studio lighting, with the brand artwork painted onto each surface.</p>
      <p>Accessibility floors follow WCAG 2.2: 4.5:1 by default and 7:1 for older adults and the general public.</p>
      <h3>Research the engine cites</h3>${PG.RESEARCH.map((r) => `<div class="rsrc"><b>${esc(r.title)}</b><div>${esc(r.finding)}<br><span class="note">${esc(r.source)}${r.url ? ` · <a href="${r.url}" target="_blank" rel="noopener">${r.url.replace('https://', '')}</a>` : ''}</span></div></div>`).join('')}</div>`;
  }

  App.views.library = {
    render(main) {
      const tabs = [['directions', 'Directions'], ['layouts', 'Layouts'], ['photos', 'Photography'], ['industries', 'Industries'], ['audiences', 'Audiences'], ['references', 'References'], ['method', 'Method']];
      main.innerHTML = `<div class="lib"><div class="bar"><div class="seg">${tabs.map(([k, v]) => `<button class="${L.tab === k ? 'on' : ''}" data-a="libTab" data-k="${k}">${v}</button>`).join('')}</div>
        ${L.tab !== 'method' ? `<label class="search" style="margin:0;width:min(300px,100%)">${App.ICON.search}<input id="lib-q" type="text" data-i="libQ" placeholder="Search" value="${esc(L.q)}" autocomplete="off"></label>` : ''}</div>
        <div class="lib-scroll" id="lib-body">${body()}</div></div>`;
    },
    refresh() { App.renderMain(); }
  };
  Object.assign(App.act, {
    libTab(el) { L.tab = el.dataset.k; L.q = ''; App.renderMain(); },
    libConf(el) { L.conf = el.dataset.c; $('#lib-body').innerHTML = body(); },
    useInd(el) { S.brief.industry = el.dataset.i; S.brief.manual = {}; S.pinned = false; S.view = 'board'; App.changed('brief'); App.renderAll(); },
    useLayout(el) { const tn = App.tune(); tn.layouts = tn.layouts || {}; tn.layouts[el.dataset.tp] = el.dataset.l; App.save(); App.toast('Layout set for ' + PG.TEMPLATES[el.dataset.tp].name); }
  });
  Object.assign(App.inp, { libQ(el) { L.q = el.value; $('#lib-body').innerHTML = body(); } });
})();
