/* Mockup import: bring your own mockup.
   - PSD (from Mockup Cloud, Unblast, Graphic Burger…): parsed in the browser with ag-psd. Every visible
     smart object becomes a placement surface (its transform is the quad); the layer stack is re-composited
     with the brand artwork in place, so shadow/highlight layers above it keep their blend modes.
   - JPG/PNG photo: the user clicks the four corners of each surface.
   Imported mockups are kept in this browser (IndexedDB) and never uploaded anywhere. */
window.PG = window.PG || {};

(function () {
  const AG_URL = 'https://cdn.jsdelivr.net/npm/ag-psd@20.2.0/dist/bundle.js';
  let agLoad = null;
  const loadAg = () => agLoad || (agLoad = new Promise((res, rej) => {
    if (window.agPsd) return res(window.agPsd);
    const s = document.createElement('script'); s.src = AG_URL; s.onload = () => res(window.agPsd); s.onerror = () => rej(new Error('Could not load the PSD reader'));
    document.head.appendChild(s);
  }));

  const BLEND = {
    'normal': 'source-over', 'pass through': 'source-over', 'dissolve': 'source-over', 'multiply': 'multiply', 'screen': 'screen', 'overlay': 'overlay',
    'darken': 'darken', 'lighten': 'lighten', 'color dodge': 'color-dodge', 'color burn': 'color-burn', 'hard light': 'hard-light', 'soft light': 'soft-light',
    'difference': 'difference', 'exclusion': 'exclusion', 'hue': 'hue', 'saturation': 'saturation', 'color': 'color', 'luminosity': 'luminosity',
    'linear burn': 'multiply', 'linear dodge': 'lighter', 'darker color': 'darken', 'lighter color': 'lighten', 'vivid light': 'hard-light', 'linear light': 'hard-light', 'pin light': 'hard-light', 'hard mix': 'hard-light', 'subtract': 'difference', 'divide': 'color-dodge'
  };

  /* Flatten the layer tree bottom→top, carrying group visibility and opacity. */
  function flatten(children, out, op) {
    (children || []).forEach((l) => {
      if (l.hidden) return;
      const o = op * (l.opacity == null ? 1 : l.opacity);
      if (l.children) flatten(l.children, out, o);
      else out.push({ l, opacity: o });
    });
    return out;
  }

  /* Apply a Photoshop layer mask (grey = alpha) to a layer canvas positioned at left/top. */
  function applyMask(c, l) {
    const m = l.mask; if (!m || m.disabled || !m.canvas) return c;
    const out = document.createElement('canvas'); out.width = c.width; out.height = c.height;
    const g = out.getContext('2d'); g.drawImage(c, 0, 0);
    const mc = document.createElement('canvas'); mc.width = c.width; mc.height = c.height;
    const mg = mc.getContext('2d');
    mg.fillStyle = `rgb(${m.defaultColor || 0},${m.defaultColor || 0},${m.defaultColor || 0})`; mg.fillRect(0, 0, c.width, c.height);
    mg.drawImage(m.canvas, (m.left || 0) - (l.left || 0), (m.top || 0) - (l.top || 0));
    const md = mg.getImageData(0, 0, c.width, c.height), d = md.data;
    for (let i = 0; i < d.length; i += 4) { d[i + 3] = d[i]; }
    mg.putImageData(md, 0, 0);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(mc, 0, 0);
    return out;
  }

  async function parsePsd(buffer, name) {
    const ag = await loadAg();
    const psd = ag.readPsd(buffer, { skipThumbnail: true });
    const layers = flatten(psd.children, [], 1);
    const surfaces = [];
    layers.forEach((e, i) => {
      const pl = e.l.placedLayer;
      if (!pl || !pl.transform || pl.transform.length < 8) return;
      const t = pl.transform;
      const quad = [[t[0], t[1]], [t[2], t[3]], [t[4], t[5]], [t[6], t[7]]];
      const aspect = pl.width && pl.height ? pl.width / pl.height : Math.hypot(t[2] - t[0], t[3] - t[1]) / Math.hypot(t[6] - t[0], t[7] - t[1]);
      surfaces.push({ id: 's' + i, layerIndex: i, name: e.l.name || 'Smart object', quad, aspect, role: guessRole(e.l.name || '', aspect) });
    });
    if (!surfaces.length) throw new Error('No visible smart objects found. Use a PSD with a smart object, or import a JPG and mark the corners.');
    return { id: 'psd-' + Date.now().toString(36), name: name.replace(/\.psd$/i, ''), kind: 'psd', w: psd.width, h: psd.height, layers, surfaces, category: 'imported' };
  }

  /* Re-composite a parsed PSD with artwork in its smart objects. arts: { surfaceId: canvas } */
  function renderPsd(m, arts, maxW) {
    const k = Math.min(1, (maxW || 2000) / m.w);
    const W = Math.round(m.w * k), H = Math.round(m.h * k);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const g = out.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    let clipBase = null;
    m.layers.forEach((e, i) => {
      const l = e.l, surf = m.surfaces.find((s) => s.layerIndex === i);
      let c, x = (l.left || 0), y = (l.top || 0);
      if (surf && arts[surf.id]) {
        // Smart object: draw the artwork warped into its quad on a full-size layer.
        c = document.createElement('canvas'); c.width = W; c.height = H;
        PG.Composite.warpInto(c.getContext('2d'), arts[surf.id], surf.quad.map(([qx, qy]) => [qx * k, qy * k]), 'source-over');
        x = 0; y = 0;
      } else {
        if (!l.canvas) return;
        c = applyMask(l.canvas, l);
        if (k !== 1) { const s = document.createElement('canvas'); s.width = Math.max(1, Math.round(c.width * k)); s.height = Math.max(1, Math.round(c.height * k)); s.getContext('2d').drawImage(c, 0, 0, s.width, s.height); c = s; }
        x *= k; y *= k;
      }
      if (l.clipping && clipBase) {
        // Clipping mask: keep only where the base layer below has pixels.
        const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d');
        tg.drawImage(c, x, y); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(clipBase, 0, 0);
        c = t; x = 0; y = 0;
      } else if (!l.clipping) {
        const b = document.createElement('canvas'); b.width = W; b.height = H; b.getContext('2d').drawImage(c, x, y); clipBase = b;
      }
      g.save(); g.globalAlpha = e.opacity; g.globalCompositeOperation = BLEND[l.blendMode] || 'source-over';
      g.drawImage(c, x, y); g.restore();
    });
    return out;
  }

  function guessRole(name, aspect) {
    const n = name.toLowerCase();
    const map = [['billboard', 'billboard'], ['poster', 'poster'], ['card', 'card-front'], ['letter', 'letterhead'], ['tote', 'tote'], ['bag', 'bag'], ['shirt', 'tee'], ['tee', 'tee'], ['cap', 'cap'], ['cup', 'wrap'], ['can', 'wrap'], ['label', 'label'], ['box', 'box-front'], ['book', 'cover'], ['cover', 'cover'], ['phone', 'screen-phone'], ['iphone', 'screen-phone'], ['screen', 'screen-laptop'], ['laptop', 'screen-laptop'], ['macbook', 'screen-laptop'], ['sign', 'sign'], ['flag', 'flag']];
    for (const [k, r] of map) if (n.includes(k)) return r;
    return aspect > 2.2 ? 'billboard' : aspect > 1.2 ? 'screen-laptop' : aspect < 0.62 ? 'screen-phone' : 'poster';
  }

  /* ---------- storage (IndexedDB; this browser only) ---------- */
  const DB = 'powergrade-mockups', STORE = 'm';
  const db = () => new Promise((res, rej) => { try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
  async function put(rec) { try { const d = await db(); await new Promise((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(rec); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return true; } catch (e) { return false; } }
  async function all() { try { const d = await db(); return await new Promise((res) => { const r = d.transaction(STORE).objectStore(STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); } catch (e) { return []; } }
  async function del(id) { try { const d = await db(); await new Promise((res) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = res; tx.onerror = res; }); } catch (e) { /* ignore */ } }

  const loadImg = (blob) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Could not read that image')); im.src = URL.createObjectURL(blob); });

  PG.Import = {
    /* Parse a dropped file. Returns a mockup model (not yet saved). */
    async fromFile(file) {
      if (/\.psd$/i.test(file.name)) { const buf = await file.arrayBuffer(); const m = await parsePsd(buf, file.name); m.blob = file; return m; }
      if (/^image\//.test(file.type)) { const im = await loadImg(file); return { id: 'img-' + Date.now().toString(36), name: file.name.replace(/\.[a-z]+$/i, ''), kind: 'image', w: im.naturalWidth, h: im.naturalHeight, image: im, blob: file, surfaces: [], category: 'imported' }; }
      throw new Error('Drop a .psd with a smart object, or a JPG/PNG photo.');
    },
    async save(m) { return put({ id: m.id, name: m.name, kind: m.kind, blob: m.blob, surfaces: m.surfaces.map((s) => ({ id: s.id, layerIndex: s.layerIndex, name: s.name, quad: s.quad, aspect: s.aspect, role: s.role })), w: m.w, h: m.h }); },
    async list() { return all(); },
    async remove(id) { return del(id); },
    /* Rehydrate a stored record into a renderable model. */
    async open(rec) {
      if (rec.kind === 'psd') { const m = await parsePsd(await rec.blob.arrayBuffer(), rec.name); m.id = rec.id; m.surfaces.forEach((s) => { const saved = rec.surfaces.find((x) => x.layerIndex === s.layerIndex); if (saved) s.role = saved.role; }); return m; }
      const im = await loadImg(rec.blob); return { id: rec.id, name: rec.name, kind: 'image', w: rec.w, h: rec.h, image: im, surfaces: rec.surfaces, category: 'imported' };
    },
    renderPsd
  };
})();
