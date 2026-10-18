/* 3D mockups: brand direction → painted surfaces → PG.Studio3D render → image.
   Layout code drops placeholders (PG.Mockups.slot) and PG.Mockups.hydrate() fills them in,
   one render at a time, caching every result. */
window.PG = window.PG || {};

(function () {
  const KINDS = {
    packaging: ['can', 'box', 'bottle', 'jar', 'tube', 'pouch', 'cup', 'bag', 'paycard'],
    stationery: ['cards', 'book'],
    devices: ['phone', 'laptop'],
    outdoor: ['billboard', 'poster']
  };
  const IND_PACK = {
    finance: 'paycard', insurance: 'paycard', health: 'box', wellness: 'jar', beauty: 'bottle', fashion: 'bag', food: 'can',
    restaurant: 'cup', hospitality: 'cup', realestate: 'book', saas: 'box', ai: 'box', devtools: 'bag', edu: 'book', media: 'book',
    gaming: 'box', sports: 'box', auto: 'paycard', energy: 'box', retail: 'bag', industrial: 'box', professional: 'book',
    nonprofit: 'bag', culture: 'book', kids: 'box', crypto: 'paycard'
  };
  /* Object id aliases between the app's names and the 3D engine's names. */
  const ALIAS = { paycard: ['paycard', 'payment', 'card'], cards: ['cards', 'businesscards'], book: ['book', 'notebook'] };
  const NAMES = { can: 'Can', box: 'Carton', bottle: 'Bottle', jar: 'Jar', tube: 'Tube', pouch: 'Pouch', cup: 'Coffee cup', bag: 'Shopping bag', paycard: 'Card', cards: 'Business cards', book: 'Notebook', phone: 'Phone', laptop: 'Laptop', poster: 'Poster', billboard: 'Billboard' };

  const objId = (name) => {
    const O = (PG.Studio3D && PG.Studio3D.OBJECTS) || {};
    for (const a of (ALIAS[name] || [name])) if (O[a]) return a;
    return null;
  };
  const available = (kind) => KINDS[kind].filter((n) => objId(n));

  /* Which painter draws which texture slot. */
  function roleFor(obj, tex) {
    const k = tex.toLowerCase();
    if (obj === 'jar' && k.includes('top')) return 'top';
    if (obj === 'can' || obj === 'jar' || obj === 'cup') return 'wrap';
    if (obj === 'bag') return k.includes('side') ? 'side' : 'bagFront';
    if (obj === 'cards' || obj === 'businesscards') return k.includes('back') ? 'cardBack' : 'cardFront';
    if (obj === 'paycard' || obj === 'payment' || obj === 'card') return k.includes('back') ? 'back' : 'payCard';
    if (obj === 'book' || obj === 'notebook') return k.includes('spine') ? 'spine' : k.includes('back') ? 'side' : 'cover';
    if (obj === 'phone') return 'phone';
    if (obj === 'laptop') return 'laptop';
    if (obj === 'poster') return 'poster';
    if (obj === 'billboard') return 'billboard';
    if (k.includes('side')) return 'side';
    if (k.includes('top')) return 'top';
    if (k.includes('back')) return 'back';
    if (k.includes('wrap')) return 'wrap';
    return 'front';
  }

  function sceneFor(t, kit, kind) {
    const S = (PG.Studio3D && PG.Studio3D.SCENES) || {};
    const has = (s) => !!S[s];
    if (kind === 'outdoor') return { preset: has('outdoor') ? 'outdoor' : 'wall', backdrop: PG.color.mix(t.surface, '#BFD3E6', 0.5) };
    if (kind === 'outdoor-wall') return { preset: 'wall', backdrop: t.surface };
    const pref = { minimal: ['linen', 'studio'], editorial: ['table', 'studio'], bold: ['studio'], friendly: ['studio'], tech: ['concrete', 'studio'] }[kit] || ['studio'];
    const preset = pref.find(has) || 'studio';
    const backdrop = kit === 'bold' ? PG.color.mix(t.secondary, '#FFFFFF', 0.15) : kit === 'friendly' ? PG.color.mix(t.primary, '#FFFFFF', 0.72) : kit === 'tech' ? PG.color.mix(t.ink, '#808080', 0.25) : PG.color.mix(t.surface, t.primary, 0.06);
    return { preset, backdrop };
  }

  /* Object variant that suits the direction: slim cans and droppers read premium, pumps and tall cans read everyday. */
  function variantFor(obj, kit, tier) {
    const premium = tier === 'premium' || tier === 'luxury';
    if (obj === 'can') return premium || kit === 'minimal' ? 'slim' : 'standard';
    if (obj === 'bottle') return kit === 'minimal' || kit === 'editorial' || premium ? 'dropper' : 'pump';
    if (obj === 'box') return kit === 'tech' ? 'flat' : kit === 'bold' || kit === 'friendly' ? 'cube' : 'tall';
    if (obj === 'poster') return kit === 'bold' ? 'hanger' : kit === 'minimal' ? 'mat' : 'frame';
    return undefined;
  }
  /* Paint the artwork inside the object's safe area (the part visible from the front), then extend
     its edge colour to fill the rest. 360° wraps use the whole canvas on purpose (side panels, barcode). */
  async function paintSafe(role, d, ctx) {
    if (role === 'wrap' || !d.safe) return PG.paintSurface(role, d.w, d.h, ctx);
    const [sx, sy, sw, sh] = d.safe;
    const inner = await PG.paintSurface(role, Math.round(sw), Math.round(sh), ctx);
    const cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h;
    const g = cv.getContext('2d');
    const px = inner.getContext('2d').getImageData(2, 2, 1, 1).data;
    g.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`; g.fillRect(0, 0, d.w, d.h);
    g.drawImage(inner, sx, sy);
    return cv;
  }
  const cache = new Map();
  let queue = Promise.resolve();

  PG.Mockups = {
    KINDS, NAMES, available, objId,
    defaultObject(kind, brief) {
      const av = available(kind);
      if (kind === 'packaging') { const p = IND_PACK[brief.industry]; if (av.includes(p)) return p; }
      return av[0] || KINDS[kind][0];
    },
    async render(kind, name, dir, tune, brief, opts) {
      opts = opts || {};
      if (!PG.Studio3D) throw new Error('3D engine not loaded');
      await PG.Studio3D.ready;
      const obj = objId(name); if (!obj) throw new Error('No 3D object ' + name);
      const t = PG.tokens(dir, tune, brief);
      const key = JSON.stringify([obj, opts.quality, opts.variant, dir.id, tune, brief.name, brief.industry, brief.audiences, brief.logo, opts.camera, opts.w, opts.h, t.bg, t.primary]);
      if (cache.has(key)) return cache.get(key);
      const job = queue.then(async () => {
        const kit = PG.kitOf(dir.id), tier = brief.tier;
        const variant = opts.variant || variantFor(obj, kit, tier);
        const texSpec = PG.Studio3D.textureSpec ? PG.Studio3D.textureSpec(obj, variant) : PG.Studio3D.OBJECTS[obj].textures;
        const ind = PG.byId(PG.INDUSTRIES, brief.industry);
        const pick = PG.photoPicker(brief, t, (tune.seed || 1) + '|3d|' + obj);
        const ctx = { t, c: ind.copy, b: PG.brandFor(brief), dir, kit: PG.kitOf(dir.id), grade: PG.gradeFor(dir.id, tune), pick: (r, n) => pick(r, n || 0) };
        const textures = {};
        for (const [tex, d] of Object.entries(texSpec || {})) textures[tex] = await paintSafe(roleFor(obj, tex), d, ctx);
        const glass = ctx.kit === 'minimal' || ctx.kit === 'editorial' ? 'frosted' : ctx.kit === 'tech' ? 'amber' : 'clear';
        return PG.Studio3D.render({
          object: obj, textures, key,
          colors: { body: t.primary, metal: '#C8CBD0', accent: t.accent, glass, paper: t.bg, ink: t.ink },
          scene: sceneFor(t, ctx.kit, obj === 'poster' ? 'outdoor-wall' : obj === 'billboard' ? 'outdoor' : kind),
          camera: opts.camera || 'hero', width: opts.w || 1600, height: opts.h || 1200, count: opts.count,
          variant, finish: kit === 'bold' || kit === 'friendly' ? 'gloss' : kit === 'tech' ? 'satin' : 'matte',
          quality: opts.quality || 'final'
        });
      });
      queue = job.catch(() => null);
      cache.set(key, job);
      job.catch(() => cache.delete(key));
      return job;
    },
    /* Placeholder markup; hydrate() replaces it with the rendered image. */
    slot(kind, name, opts) {
      return `<div class="m3d loading" data-m3d='${JSON.stringify({ kind, name, ...(opts || {}) }).replace(/'/g, '&#39;')}'>Rendering ${NAMES[name] || name}…</div>`;
    },
    hydrate(root, getCtx) {
      if (!PG.Studio3D) {
        // The three.js module loads asynchronously; wait for it, then give up after 25 s.
        if (!root.__pgWait) {
          root.__pgWait = true;
          const go = () => { clearTimeout(tm); window.removeEventListener('pg:studio3d-ready', go); root.__pgWait = false; PG.Mockups.hydrate(root, getCtx); };
          const tm = setTimeout(() => { window.removeEventListener('pg:studio3d-ready', go); root.querySelectorAll('.m3d').forEach((el) => { el.classList.remove('loading'); el.textContent = '3D renderer unavailable (WebGL or network blocked)'; }); }, 25000);
          window.addEventListener('pg:studio3d-ready', go);
        }
        return;
      }
      root.querySelectorAll('.m3d[data-m3d]').forEach((el) => {
        const o = JSON.parse(el.getAttribute('data-m3d'));
        el.removeAttribute('data-m3d');
        const { dir, tune, brief } = getCtx(o);
        PG.Mockups.render(o.kind, o.name, dir, tune, brief, o).then((src) => {
          if (!el.isConnected) return;
          const im = new Image(); im.className = 'r3d'; im.alt = `${NAMES[o.name] || o.name} mockup`; im.src = src;
          im.onload = () => el.replaceWith(im);
        }).catch((e) => { if (el.isConnected) { el.classList.remove('loading'); el.textContent = 'Could not render: ' + e.message; } });
      });
    }
  };
})();
