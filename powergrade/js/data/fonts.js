/* Google Fonts registry. Each entry lists the exact weights the family ships,
   so a CSS2 request never asks for a weight that doesn't exist (which fails the whole request).
   `cls` is the fallback stack class used when the face hasn't loaded. */
window.PG = window.PG || {};

PG.FONTS = {
  'Inter':                 { w: [400, 500, 600, 700, 800], cls: 'sans' },
  'Inter Tight':           { w: [400, 600, 700, 800], cls: 'sans' },
  'Archivo':               { w: [400, 500, 700, 800, 900], cls: 'sans' },
  'Archivo Black':         { w: [400], cls: 'sans' },
  'Hanken Grotesk':        { w: [300, 400, 500, 700], cls: 'sans' },
  'Space Grotesk':         { w: [400, 500, 700], cls: 'sans' },
  'Space Mono':            { w: [400, 700], cls: 'mono' },
  'IBM Plex Sans':         { w: [400, 500, 700], cls: 'sans' },
  'IBM Plex Serif':        { w: [400, 600, 700], cls: 'serif' },
  'IBM Plex Mono':         { w: [400, 500, 700], cls: 'mono' },
  'JetBrains Mono':        { w: [400, 700], cls: 'mono' },
  'DM Sans':               { w: [400, 500, 700], cls: 'sans' },
  'Playfair Display':      { w: [400, 700, 900], cls: 'serif' },
  'Cormorant Garamond':    { w: [400, 500, 600], cls: 'serif' },
  'Fraunces':              { w: [400, 600, 700, 900], cls: 'serif' },
  'Instrument Serif':      { w: [400], cls: 'serif' },
  'Instrument Sans':       { w: [400, 500, 700], cls: 'sans' },
  'Syne':                  { w: [400, 600, 700, 800], cls: 'sans' },
  'Anton':                 { w: [400], cls: 'sans' },
  'Unbounded':             { w: [400, 600, 800], cls: 'sans' },
  'Manrope':               { w: [400, 600, 700, 800], cls: 'sans' },
  'Plus Jakarta Sans':     { w: [400, 600, 800], cls: 'sans' },
  'Outfit':                { w: [400, 600, 700], cls: 'sans' },
  'Sora':                  { w: [400, 600, 700], cls: 'sans' },
  'Rubik':                 { w: [400, 500, 700, 900], cls: 'sans' },
  'Rubik Mono One':        { w: [400], cls: 'sans' },
  'Nunito':                { w: [400, 700, 900], cls: 'sans' },
  'Baloo 2':               { w: [400, 600, 800], cls: 'sans' },
  'Bricolage Grotesque':   { w: [400, 600, 800], cls: 'sans' },
  'Young Serif':           { w: [400], cls: 'serif' },
  'Libre Caslon Text':     { w: [400, 700], cls: 'serif' },
  'Libre Franklin':        { w: [400, 600, 800], cls: 'sans' },
  'Bodoni Moda':           { w: [400, 500, 700], cls: 'serif' },
  'Josefin Sans':          { w: [400, 600, 700], cls: 'sans' },
  'Work Sans':             { w: [400, 500, 700], cls: 'sans' },
  'Barlow Condensed':      { w: [500, 700, 800], cls: 'sans' },
  'Chakra Petch':          { w: [400, 600, 700], cls: 'sans' },
  'Caveat':                { w: [400, 700], cls: 'hand' },
  'Newsreader':            { w: [400, 600], cls: 'serif' },
  'Schibsted Grotesk':     { w: [400, 700, 900], cls: 'sans' },
  'Figtree':               { w: [400, 600, 800], cls: 'sans' },
  'Shrikhand':             { w: [400], cls: 'serif' },
  'Limelight':             { w: [400], cls: 'serif' },
  'Josefin Slab':          { w: [400, 600], cls: 'serif' },
  'Shippori Mincho':       { w: [400, 600], cls: 'serif' },
  'Zen Kaku Gothic New':   { w: [400, 700], cls: 'sans' },
  'Atkinson Hyperlegible': { w: [400, 700], cls: 'sans' },
  'Public Sans':           { w: [400, 700, 900], cls: 'sans' },
  'Lexend':                { w: [400, 600, 800], cls: 'sans' },
  'Michroma':              { w: [400], cls: 'sans' },
  'Cinzel':                { w: [400, 600, 700], cls: 'serif' },
  'Gloock':                { w: [400], cls: 'serif' },
  'Darker Grotesque':      { w: [500, 700, 900], cls: 'sans' },
  'Pinyon Script':         { w: [400], cls: 'hand' }
};

PG.FALLBACK = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  hand: '"Comic Sans MS", "Bradley Hand", cursive'
};

PG.fontStack = function (name) {
  const f = PG.FONTS[name];
  return `"${name}", ${PG.FALLBACK[(f && f.cls) || 'sans']}`;
};

/* Closest weight the family actually ships. */
PG.fontWeight = function (name, want) {
  const f = PG.FONTS[name];
  if (!f) return want;
  return f.w.reduce((best, w) => (Math.abs(w - want) < Math.abs(best - want) ? w : best), f.w[0]);
};

/* One <link> per family, so a single bad family can't block the rest.
   Returns a promise that settles once the stylesheet has loaded (or failed). */
PG._loadedFonts = new Map();
PG.loadFont = function (name) {
  if (!name || !PG.FONTS[name]) return Promise.resolve();
  if (PG._loadedFonts.has(name)) return PG._loadedFonts.get(name);
  const fam = name.replace(/ /g, '+');
  const w = PG.FONTS[name].w.join(';');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fam}:wght@${w}&display=swap`;
  const p = new Promise((res) => { link.onload = res; link.onerror = res; });
  PG._loadedFonts.set(name, p);
  document.head.appendChild(link);
  return p;
};
