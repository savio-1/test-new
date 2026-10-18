/* Present: a route as a studio case-study page. Hero image, project facts, then the applications in
   sequence (full-width and two-up, the way studios pace a project page), then the identity system. */
(function () {
  const App = PG.App, S = App.S, esc = App.esc, $$ = App.$$;

  function slotHtml(slot, cls) {
    const lb = PG.Mocks.label(slot);
    return `<figure class="${cls}"><div class="m3d loading" data-pslot="${slot.id}"></div><figcaption>${esc(lb.title)}<span>${esc(lb.sub)}</span></figcaption></figure>`;
  }

  App.views.present = {
    render(main) {
      const i = S.route, d = App.dir(), sc = App.score(d.id), t = PG.tokens(d, App.tune(), S.brief), b = S.brief;
      const ind = PG.byId(PG.INDUSTRIES, b.industry), A = S.apps || PG.Mocks.defaults(b.industry);
      S.apps = A;
      const [hero, ...rest] = A;
      // Pace: full, pair, full, pair…
      let seq = '', k = 0, full = false;
      while (k < rest.length) {
        if (full || k + 1 >= rest.length) { seq += slotHtml(rest[k], 'cs-full'); k += 1; }
        else { seq += `<div class="cs-pair">${slotHtml(rest[k], '')}${slotHtml(rest[k + 1], '')}</div>`; k += 2; }
        full = !full;
      }
      const why = PG.explain(d, b, sc);
      const ev = PG.evidence(d, b.industry).slice(0, 5);
      const sw = [['Primary', t.primary, t.onPrimary], ['Ink', t.ink, t.bg], ['Paper', t.bg, t.ink], ['Secondary', t.secondary, t.onSecondary], ['Accent', t.accent, t.ink]];
      main.innerHTML = `<div class="scroll"><article class="cs">
        <div class="cs-tabs">${S.routes.map((r, j) => `<button class="${j === i ? 'on' : ''}" data-a="presRoute" data-i="${j}">Route ${'ABC'[j]} · ${esc(PG.byId(PG.DIRECTIONS, r.dir).name)}</button>`).join('')}</div>
        ${slotHtml(hero, 'cs-hero')}
        <header class="cs-head">
          <div><h1>${esc(App.brand().name)}</h1><p class="cs-dir">${esc(d.name)}</p></div>
          <div class="cs-intro"><p>${esc(d.summary)} ${esc(why[0].v)}</p>
            <dl><dt>Industry</dt><dd>${esc(ind.name)}</dd><dt>Audience</dt><dd>${b.audiences.map((a) => esc(PG.byId(PG.AUDIENCES, a).name)).join(', ')}</dd><dt>Price tier</dt><dd>${esc(PG.byId(PG.TIERS, b.tier).name)}</dd><dt>Approach</dt><dd>${esc(PG.byId(PG.STRATEGIES, b.strategy).name)} · ${sc.total}% fit</dd></dl></div>
        </header>
        ${seq}
        <section class="cs-system">
          <h2>System</h2>
          <div class="cs-logos">
            <div style="background:${t.bg}"><span class="ab cs-ab" style="${PG.cssVars(t)}">${PG.brandLockup(t, App.brand(), 34)}</span></div>
            <div style="background:${t.primary}"><span class="ab cs-ab" style="${PG.cssVars(t)}">${PG.brandLockup(t, App.brand(), 28, 'reverse')}</span></div>
            <div style="background:${t.ink}"><span class="ab cs-ab" style="${PG.cssVars(t)}">${PG.brandLockup(t, App.brand(), 28, 'inverse')}</span></div>
          </div>
          <div class="cs-swatches">${sw.map(([n, c, on]) => `<div style="background:${c};color:${on}"><b>${n}</b><span>${c}</span></div>`).join('')}</div>
          <div class="cs-type"><span style="font-family:${t.fd.replace(/"/g, "'")};font-weight:${t.fdw};${t.upper ? 'text-transform:uppercase;' : ''}letter-spacing:${t.track}em">Aa</span>
            <div><b>${esc(t.display)}</b> for display, <b>${esc(t.body)}</b> for text.<p style="font-family:${t.fb.replace(/"/g, "'")}">${esc(ind.copy.sub)}</p><p class="note">Voice: “${esc(d.voice)}”</p></div></div>
        </section>
        <section class="cs-notes"><h2>Rationale</h2><div class="why">${why.map((l) => `<div class="${l.warn ? 'warn' : ''}"><b>${esc(l.k)}.</b> ${esc(l.v)}</div>`).join('')}</div>
          <h2 style="margin-top:28px">Lineage</h2><div class="refs">${ev.map((r) => `<a class="ref" href="${PG.refSearchUrl(r)}" target="_blank" rel="noopener"><b>${esc(r.brand)} · ${r.year || 'n.d.'}</b><span class="conf ${r.conf}">${r.conf}</span><span>${esc(r.by)}. ${esc(r.traits)}</span></a>`).join('')}</div></section>
      </article></div>`;
      const ctx = App.artCtx(i), tune = App.tune();
      $$('[data-pslot]', main).forEach((el) => {
        const slot = A.find((s) => s.id === el.dataset.pslot);
        PG.Mocks.render(slot, ctx, tune, el.closest('.cs-hero,.cs-full') ? 2200 : 1400).then((url) => { if (el.isConnected) el.outerHTML = `<img${slot.flat ? ' class="flat"' : ''} src="${url}" alt="${esc(PG.Mocks.label(slot).title)}">`; }).catch((e) => { if (el.isConnected) { el.classList.remove('loading'); el.textContent = e.message; } });
      });
    },
    refresh() { App.renderMain(); }
  };
  Object.assign(App.act, { presRoute(el) { S.route = +el.dataset.i; App.save(); App.renderMain(); } });
})();
