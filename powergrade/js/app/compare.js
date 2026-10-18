/* Compare: the diverse shortlist side by side across chosen touchpoints. */
(function () {
  const App = PG.App, S = App.S, esc = App.esc, $ = App.$, $$ = App.$$;
  const C = { n: 6, tps: App.LS.get('cmpTps', ['website', 'packaging', 'app', 'social', 'poster', 'identity']) };
  const H = 240;
  const isK = (tp) => !!PG.Mockups.KINDS[tp];
  const size = (tp) => {
    if (isK(tp)) return { w: Math.round(H * 4 / 3), h: H };
    const T = PG.TEMPLATES[tp], w = Math.min(400, Math.round(H * T.w / T.h));
    return { w, h: Math.round(w * T.h / T.w) };
  };
  const label = (tp) => isK(tp) ? tp[0].toUpperCase() + tp.slice(1) + ' · 3D' : PG.TEMPLATES[tp].name;

  App.views.compare = {
    render(main) {
      const ranking = PG.rank(S.brief, C.n), ind = PG.byId(PG.INDUSTRIES, S.brief.industry);
      const all = [...PG.TOUCHPOINTS.filter((x) => !x.three).map((x) => x.id), ...Object.keys(PG.Mockups.KINDS)];
      const tps = all.filter((x) => C.tps.includes(x));
      main.innerHTML = `<div class="mx"><div class="bar"><span class="lbl">Directions</span><div class="seg">${[4, 6, 8].map((n) => `<button class="${C.n === n ? 'on' : ''}" data-a="cmpN" data-n="${n}">${n}</button>`).join('')}</div>
        <span class="lbl">Touchpoints</span><div class="chips">${all.map((tp) => `<button class="${C.tps.includes(tp) ? 'on' : ''}" data-a="cmpTp" data-tp="${tp}">${esc(label(tp))}</button>`).join('')}</div>
        <span class="note" style="flex-basis:100%">${esc(App.brand().name)} · ${esc(ind.name)} · picked for fit and for variety, so no two rows are near-duplicates.</span></div>
        <div class="mx-scroll"><div class="mx-grid"><div class="mx-colh"><div class="corner">Direction</div>${tps.map((tp) => `<div style="width:${size(tp).w + 29}px">${esc(label(tp))}</div>`).join('')}</div>
        ${ranking.shortlist.map((x, i) => {
          const d = x.dir, sc = x.score, t = PG.tokens(d, App.tune(d.id), S.brief);
          return `<div class="mx-row"><div class="mx-head"><span class="rk">#${i + 1} · ${sc.role}</span><h3>${esc(d.name)}</h3><span class="fitn">${sc.total}<span class="note"> / 100</span></span>
            <div class="sws">${[t.bg, t.ink, t.primary, t.secondary, t.accent].map((c) => `<i style="background:${c}"></i>`).join('')}</div><p>${esc(d.summary)}</p>
            <div class="acts"><button class="tbtn sm" data-a="pickDir" data-d="${d.id}">Open board</button><button class="tbtn sm" data-a="fav" data-d="${d.id}">${S.favs.has(d.id) ? '♥' : '♡'}</button></div></div>
            ${tps.map((tp) => `<div class="mx-cell" data-cell="${d.id}|${tp}" style="width:${size(tp).w + 29}px;min-height:${H + 40}px"></div>`).join('')}</div>`;
        }).join('')}</div></div></div>`;
      const cells = $$('.mx-cell', main); let i = 0;
      const step = () => {
        const end = Math.min(cells.length, i + 6);
        for (; i < end; i++) {
          const [id, tp] = cells[i].dataset.cell.split('|'), sz = size(tp), d = PG.byId(PG.DIRECTIONS, id), tn = App.tune(id);
          if (isK(tp)) { cells[i].innerHTML = `<div style="position:relative;width:${sz.w}px;height:${sz.h}px">${PG.Mockups.slot(tp, (tn.objects && tn.objects[tp]) || PG.Mockups.defaultObject(tp, S.brief), { w: 960, h: 720, dir: id, quality: 'draft' }).replace('class="m3d loading"', 'class="m3d loading" style="position:absolute;inset:0"')}</div>`; App.hydrate(cells[i]); }
          else { const r = PG.renderBoard(tp, d, tn, S.brief, sz); cells[i].innerHTML = r.html + `<span class="c2">${esc(PG.TEMPLATES[tp].layouts[r.layout].name)}</span>`; }
        }
        if (i < cells.length && S.view === 'compare') setTimeout(step, 0);
      };
      step();
    },
    refresh() { App.renderMain(); }
  };
  Object.assign(App.act, {
    cmpN(el) { C.n = +el.dataset.n; App.renderMain(); },
    cmpTp(el) { const tp = el.dataset.tp; C.tps = C.tps.includes(tp) ? C.tps.filter((x) => x !== tp) : [...C.tps, tp]; App.LS.set('cmpTps', C.tps); App.renderMain(); }
  });
})();
