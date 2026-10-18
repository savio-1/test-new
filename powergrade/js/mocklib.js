/* Mockup library service: bundled real-photo mockups (PG.MOCKUP_PHOTOS) plus imported ones (PSD/JPG),
   default application slots per industry, and rendering a route's artwork onto any mockup.
   An application slot is { id, mock: '<mockup id>' } (photo) or { id, flat: '<role>' } (flat artwork). */
window.PG = window.PG || {};

(function () {
  const imported = new Map();     // id → model (parsed, ready to render)
  const PREF = {
    beauty: ['wrap', 'label', 'box-front', 'bag', 'poster', 'card-front'], wellness: ['wrap', 'label', 'screen-phone', 'tote', 'poster'],
    food: ['wrap', 'label', 'tote', 'billboard', 'box-front'], restaurant: ['wrap', 'bag', 'sign', 'tee', 'poster'],
    finance: ['id-card', 'card-front', 'screen-phone', 'billboard', 'letterhead'], insurance: ['screen-phone', 'card-front', 'billboard', 'letterhead'],
    crypto: ['screen-phone', 'id-card', 'billboard', 'tee'], hospitality: ['card-front', 'sign', 'bag', 'cover', 'flag'],
    realestate: ['sign', 'billboard', 'letterhead', 'cover', 'card-front'], professional: ['card-front', 'letterhead', 'cover', 'sign'],
    saas: ['screen-laptop', 'screen-phone', 'tee', 'poster', 'tote'], ai: ['screen-laptop', 'poster', 'billboard', 'tee'], devtools: ['screen-laptop', 'tee', 'cap', 'poster'],
    culture: ['poster', 'flag', 'tote', 'billboard', 'cover'], media: ['poster', 'billboard', 'screen-phone', 'cover'], gaming: ['screen-laptop', 'poster', 'tee', 'cap'],
    fashion: ['bag', 'tote', 'tee', 'billboard', 'card-front'], retail: ['bag', 'box-front', 'sign', 'tote'], sports: ['tee', 'cap', 'billboard', 'bag'],
    energy: ['vehicle', 'billboard', 'screen-phone', 'sign'], industrial: ['vehicle', 'sign', 'card-front', 'letterhead'], auto: ['billboard', 'screen-phone', 'id-card', 'sign'],
    edu: ['cover', 'screen-tablet', 'tote', 'poster'], kids: ['box-front', 'tee', 'screen-tablet', 'poster'], health: ['screen-phone', 'box-front', 'sign', 'card-front'],
    nonprofit: ['tote', 'poster', 'tee', 'billboard']
  };
  const FALLBACK_ORDER = ['poster', 'card-front', 'screen-laptop', 'tote', 'billboard', 'screen-phone', 'bag', 'cover', 'sign', 'tee', 'letterhead'];
  const ROLE_NAMES = { poster: 'Poster', billboard: 'Billboard', sign: 'Signage', flag: 'Banner', 'card-front': 'Business cards', 'card-back': 'Business card back', letterhead: 'Letterhead', cover: 'Cover', spread: 'Editorial spread', 'box-front': 'Packaging', 'box-side': 'Packaging side', label: 'Label', wrap: 'Packaging wrap', tote: 'Tote bag', bag: 'Shopping bag', tee: 'T-shirt', cap: 'Cap', 'screen-phone': 'App', 'screen-laptop': 'Website', 'screen-tablet': 'Tablet', 'id-card': 'Card', vehicle: 'Vehicle', wall: 'Wall graphic', website: 'Website', social: 'Social', story: 'Story', deck: 'Presentation' };

  const all = () => [...(PG.MOCKUP_PHOTOS || []).map((m) => Object.assign({ source: 'library' }, m)), ...Array.from(imported.values())];
  const byId = (id) => all().find((m) => m.id === id);

  /* Size an artwork canvas for a surface: the role's standard size, reshaped to the surface aspect. */
  function artSize(role, aspect) {
    const std = (PG.Artwork.ROLE_SIZE[role] || [1600, 1200]);
    const a = aspect || std[0] / std[1];
    const long = Math.max(std[0], std[1]);
    return a >= 1 ? [long, Math.round(long / a)] : [Math.round(long * a), long];
  }

  const cache = new Map();
  async function toURL(cv) { return new Promise((res) => cv.toBlob((b) => res(URL.createObjectURL(b)), 'image/jpeg', 0.9)); }

  PG.Mocks = {
    ROLE_NAMES, all, byId, artSize,
    register(model) { imported.set(model.id, Object.assign({ source: 'imported' }, model)); },
    unregister(id) { imported.delete(id); },
    /* Load imported mockups saved in this browser. */
    async restore() {
      if (!PG.Import) return;
      for (const rec of await PG.Import.list()) { try { PG.Mocks.register(await PG.Import.open(rec)); } catch (e) { /* skip unreadable */ } }
    },
    roles: (m) => [...new Set((m.surfaces || []).map((s) => s.role))],
    label(slot) {
      if (slot.flat) return { title: ROLE_NAMES[slot.flat] || slot.flat, sub: 'Flat artwork' };
      const m = byId(slot.mock); if (!m) return { title: 'Missing mockup', sub: '' };
      return { title: ROLE_NAMES[(m.surfaces[0] || {}).role] || m.name, sub: m.name };
    },
    /* Default applications for an industry: up to six real-photo mockups plus flat website and social. */
    defaults(industry) {
      const list = PG.Mocks.all(), out = [], used = new Set();
      [...(PREF[industry] || []), ...FALLBACK_ORDER].forEach((role) => {
        if (out.length >= 6) return;
        const m = list.find((x) => !used.has(x.id) && (x.surfaces || []).some((s) => s.role === role));
        if (m) { used.add(m.id); out.push({ id: 'a' + out.length, mock: m.id }); }
      });
      out.push({ id: 'fw', flat: 'website' }, { id: 'fs', flat: 'social' });
      return out;
    },
    /* Render one application for an art context (App.artCtx). Returns an object URL. */
    async render(slot, ctx, tune, maxW) {
      const key = JSON.stringify([slot.mock || slot.flat, ctx.key, tune && tune.art, maxW]);
      if (cache.has(key)) return cache.get(key);
      const job = (async () => {
        if (slot.flat) {
          const [w, h] = PG.Artwork.ROLE_SIZE[slot.flat];
          return toURL(await PG.Artwork.paint(slot.flat, w, h, ctx, tune.art && tune.art[slot.flat]));
        }
        const m = byId(slot.mock); if (!m) throw new Error('Mockup not found');
        const arts = {};
        for (const s of m.surfaces) {
          const [w, h] = artSize(s.role, s.aspect);
          arts[s.id] = await PG.Artwork.paint(s.role, w, h, ctx, tune.art && tune.art[s.role]);
        }
        let cv;
        if (m.kind === 'psd') cv = PG.Import.renderPsd(m, arts, maxW);
        else {
          const base = m.image || await PG.loadImage(m.file);
          if (!base) throw new Error('Could not load the mockup photo');
          cv = PG.Composite.render(base, m.surfaces.map((s) => ({ quad: s.quad, art: arts[s.id], blend: s.blend, curve: s.curve, shading: s.shading, gloss: s.gloss })), { maxW });
        }
        return toURL(cv);
      })();
      cache.set(key, job);
      job.catch(() => cache.delete(key));
      if (cache.size > 200) { const k = cache.keys().next().value; cache.delete(k); }
      return job;
    }
  };
})();
