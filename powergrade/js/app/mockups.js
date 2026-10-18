/* Mockups: the real-photo mockup library, importing your own (PSD smart objects or a photo with four
   clicked corners), and where to find good free mockups. Imports stay in this browser. */
(function () {
  const App = PG.App, S = App.S, esc = App.esc, $ = App.$, $$ = App.$$;
  const M = { cat: 'all', editing: null };
  const ROLES = Object.keys(PG.Mocks.ROLE_NAMES).filter((r) => !['website', 'social', 'story', 'deck'].includes(r));

  function grid() {
    const list = PG.Mocks.all().filter((m) => M.cat === 'all' || m.category === M.cat);
    return list.map((m) => `<figure class="mk-card"><div class="mk-th">${m.thumb ? `<img src="${m.thumb}" alt="${esc(m.name)}" loading="lazy">` : `<span class="note">${esc(m.kind === 'psd' ? 'PSD' : 'Photo')}</span>`}</div>
      <figcaption><b>${esc(m.name)}</b><span>${esc(PG.Mocks.roles(m).map((r) => PG.Mocks.ROLE_NAMES[r] || r).join(', '))}</span>
      <span>${m.source === 'imported' ? 'Imported · this browser only' : m.credit ? `${esc(m.credit.license)} · <a href="${esc(m.credit.url)}" target="_blank" rel="noopener">${esc(m.credit.author || 'source')}</a>` : ''}</span></figcaption>
      <div class="mk-acts"><button class="tbtn sm" data-a="mkPreview" data-m="${m.id}">Preview route ${'ABC'[S.route]}</button><button class="tbtn sm" data-a="mkUse" data-m="${m.id}">Add to canvas</button>${m.source === 'imported' ? `<button class="tbtn sm" data-a="mkDel" data-m="${m.id}">Delete</button>` : ''}</div></figure>`).join('') || '<div class="empty">No mockups in this category yet.</div>';
  }

  App.views.mockups = {
    render(main) {
      const cats = [...new Set(PG.Mocks.all().map((m) => m.category))];
      const src = PG.MOCKUP_SOURCES || [];
      main.innerHTML = `<div class="scroll"><div class="mk">
        <div class="bhead"><div><h1>Mockups</h1><div class="sub">Real photographs with a marked-out surface. Every route is placed on them with perspective and the photo's own light. Bring your own: drop a PSD (smart objects are found automatically) or a photo (click its four corners).</div></div></div>
        <label class="drop" id="drop"><input type="file" accept=".psd,image/*" data-c="mkFile" multiple hidden><b>Drop a mockup here</b><span>PSD with a smart object, or a JPG/PNG photo · stays in this browser</span></label>
        <div class="chips" style="margin:22px 0 18px">${['all', ...cats].map((c) => `<button class="${M.cat === c ? 'on' : ''}" data-a="mkCat" data-c="${c}">${esc(c)}</button>`).join('')}</div>
        <div class="mk-grid">${grid()}</div>
        ${src.length ? `<h2 class="h2" style="margin-top:46px">Where to get great free mockups</h2><p class="note" style="margin:-4px 0 14px">Download a PSD, drop it above. Most free licences allow use in your own client work but not redistribution, which is why these aren't bundled.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Source</th><th>Best for</th><th>Formats</th><th>Licence</th></tr></thead><tbody>${src.map((s) => `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></td><td>${esc((s.bestFor || []).join(', '))}</td><td>${esc((s.formats || []).join(', '))}</td><td>${esc(s.licenceSummary || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div></div>`;
      const drop = $('#drop');
      ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
      drop.addEventListener('drop', (e) => { e.preventDefault(); importFiles(Array.from(e.dataTransfer.files || [])); });
    },
    refresh() { App.renderMain(); }
  };

  async function importFiles(files) {
    for (const f of files) {
      App.toast('Reading ' + f.name + '…');
      try {
        const m = await PG.Import.fromFile(f);
        if (m.kind === 'psd') { await finish(m); App.toast(`Imported ${m.name}: ${m.surfaces.length} smart object${m.surfaces.length > 1 ? 's' : ''}`); }
        else openCorners(m);
      } catch (e) { App.toast(e.message); }
    }
  }
  async function finish(m) {
    // Thumbnail: render with a neutral grid so the placement is visible.
    PG.Mocks.register(m); await PG.Import.save(m);
    App.renderMain();
  }

  /* Corner editor for plain photos: click four corners (top-left, top-right, bottom-right, bottom-left). */
  function openCorners(m) {
    M.editing = { m, pts: [], role: 'poster' };
    const url = URL.createObjectURL(m.blob);
    App.modal('Mark the surface', `<p class="note">Click the four corners of the surface where the design goes: top-left, top-right, bottom-right, bottom-left. Add more surfaces if the photo has several.</p>
      <div class="ce" id="ce"><img src="${url}" alt="" id="ce-img"><svg id="ce-svg"></svg></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label class="f" style="grid-template-columns:auto 200px">Surface is a<select data-c="ceRole">${ROLES.map((r) => `<option value="${r}"${r === 'poster' ? ' selected' : ''}>${esc(PG.Mocks.ROLE_NAMES[r])}</option>`).join('')}</select></label>
      <button class="tbtn sm" data-a="ceReset">Clear points</button><button class="tbtn sm" data-a="ceNext">Add another surface</button><button class="tbtn sm primary" data-a="ceSave">Save mockup</button><span class="note" id="ce-n">0 / 4 corners</span></div>`, true);
    $('#ce').addEventListener('click', (e) => {
      const img = $('#ce-img'), r = img.getBoundingClientRect();
      const E = M.editing; if (E.pts.length >= 4) return;
      E.pts.push([Math.round((e.clientX - r.left) / r.width * m.w), Math.round((e.clientY - r.top) / r.height * m.h)]);
      drawCorners();
    });
  }
  function drawCorners() {
    const E = M.editing, svg = $('#ce-svg'); if (!svg) return;
    svg.setAttribute('viewBox', `0 0 ${E.m.w} ${E.m.h}`);
    const done = E.m.surfaces.map((s) => `<polygon points="${s.quad.map((p) => p.join(',')).join(' ')}" fill="rgba(224,165,38,.25)" stroke="#E0A526" stroke-width="${E.m.w / 400}"/>`).join('');
    const cur = E.pts.length ? `<polyline points="${E.pts.map((p) => p.join(',')).join(' ')}${E.pts.length === 4 ? ' ' + E.pts[0].join(',') : ''}" fill="none" stroke="#fff" stroke-width="${E.m.w / 300}"/>` + E.pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${E.m.w / 120}" fill="#E0A526" stroke="#fff" stroke-width="${E.m.w / 600}"/><text x="${p[0] + E.m.w / 90}" y="${p[1] - E.m.w / 90}" font-size="${E.m.w / 45}" fill="#fff" stroke="#000" stroke-width="${E.m.w / 900}">${i + 1}</text>`).join('') : '';
    svg.innerHTML = done + cur;
    $('#ce-n').textContent = `${E.pts.length} / 4 corners · ${E.m.surfaces.length} surface${E.m.surfaces.length === 1 ? '' : 's'} saved`;
  }
  function commitSurface() {
    const E = M.editing; if (!E || E.pts.length !== 4) return false;
    const q = E.pts, aspect = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) / Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
    E.m.surfaces.push({ id: 's' + E.m.surfaces.length, quad: q, aspect, role: E.role, blend: 'multiply' });
    E.pts = []; return true;
  }

  Object.assign(App.act, {
    mkCat(el) { M.cat = el.dataset.c; $('.mk-grid').innerHTML = grid(); $$('.mk .chips button').forEach((b) => b.classList.toggle('on', b.dataset.c === M.cat)); },
    mkUse(el) { S.apps = S.apps || PG.Mocks.defaults(S.brief.industry); S.apps.push({ id: 'a' + Date.now().toString(36), mock: el.dataset.m }); App.save(); App.toast('Added to the canvas for all three routes'); },
    async mkDel(el) { await PG.Import.remove(el.dataset.m); PG.Mocks.unregister(el.dataset.m); App.renderMain(); },
    mkPreview(el) {
      const slot = { id: 'preview', mock: el.dataset.m };
      const m = App.modal(esc(PG.Mocks.byId(el.dataset.m).name), `<div class="lightbox"><div class="m3d loading" id="mkp">Placing route ${'ABC'[S.route]}…</div></div>`, true);
      PG.Mocks.render(slot, App.artCtx(S.route), App.tune(), 1800).then((url) => { const x = $('#mkp', m); if (x) x.outerHTML = `<img src="${url}" alt="">`; }).catch((e) => { const x = $('#mkp', m); if (x) x.textContent = e.message; });
    },
    ceReset() { M.editing.pts = []; drawCorners(); },
    ceNext() { if (!commitSurface()) return App.toast('Click all four corners first'); drawCorners(); },
    async ceSave() {
      commitSurface();
      const E = M.editing; if (!E.m.surfaces.length) return App.toast('Mark at least one surface');
      App.closeModal(); await finish(E.m); M.editing = null; App.toast('Mockup saved in this browser');
    }
  });
  Object.assign(App.chg, {
    mkFile(el) { importFiles(Array.from(el.files || [])); el.value = ''; },
    ceRole(el) { if (M.editing) M.editing.role = el.value; }
  });
})();
