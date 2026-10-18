/* Powergrade direction library: 34 art-direction archetypes.
   Each one is a "genome": a structured description of a look that any template can render.
     axes      position on the five personality axes (0–100)
     palettes  two alternative palettes, each with fixed colour roles
     type      display/body faces (Google Fonts), weight, case, tracking, scale ratio
     shape     corner radius, button style, stroke weight
     layout    density (0 airy … 1 dense) and hero composition
     imagery   procedural art generator id (see art.js), with alternates
     mark      logo-mark generator id
     tags      vocabulary used by functions and audiences to boost or penalise
     tiers     price tiers the direction credibly serves
     refs      reference ids (references.js): the documented work this direction is distilled from */
window.PG = window.PG || {};

PG.DIRECTIONS = [
  {
    id: 'swiss', name: 'Swiss International', school: 'International Typographic Style · 1950s→',
    summary: 'Objective grids, flush-left grotesk type, one signal colour. Information as design.',
    principles: ['Modular grid, flush-left, ragged-right', 'One signal colour on neutrals', 'Type is the image'],
    axes: { playful: 20, progressive: 55, energy: 45, exclusive: 45, technical: 75 },
    palettes: [
      { name: 'Signal red', bg: '#F4F4F2', surface: '#FFFFFF', ink: '#111111', muted: '#6B6B6B', primary: '#E3241B', secondary: '#111111', accent: '#F4F4F2' },
      { name: 'Electric blue', bg: '#FFFFFF', surface: '#EEF1F4', ink: '#0B1B2B', muted: '#5B6875', primary: '#0047FF', secondary: '#0B1B2B', accent: '#FFD400' }
    ],
    type: { display: 'Inter Tight', dw: 800, body: 'Inter', bw: 400, case: 'none', track: -0.04, scale: 1.5 },
    shape: { radius: 0, button: 'square', stroke: 2 },
    layout: { density: 0.5, hero: 'editorial' },
    imagery: ['lines', 'type'], mark: 'cutSquare',
    voice: 'Clear. Precise. Nothing extra.',
    tags: ['systematic', 'clear', 'editorial', 'precise', 'minimal', 'b2b'],
    tiers: ['mid', 'premium'],
    refs: ['nyc-transit-1970', 'mit-media-lab-2014', 'lufthansa-1962']
  },
  {
    id: 'institutional', name: 'Institutional Trust', school: 'Corporate modernism · 1960s→',
    summary: 'Navy, a crisp serif headline and an engraved security pattern. Stability you can bank on.',
    principles: ['Dark, stable base colour', 'Serif headlines, sans body', 'Security patterns as texture'],
    axes: { playful: 15, progressive: 30, energy: 20, exclusive: 55, technical: 55 },
    palettes: [
      { name: 'Navy & gold', bg: '#FFFFFF', surface: '#F2F5F9', ink: '#0A1F3C', muted: '#5A6B82', primary: '#0B3D91', secondary: '#0A1F3C', accent: '#C8A24A' },
      { name: 'Banker green', bg: '#F7F6F2', surface: '#FFFFFF', ink: '#10231C', muted: '#5E6B64', primary: '#0F5132', secondary: '#10231C', accent: '#B08D57' }
    ],
    type: { display: 'IBM Plex Serif', dw: 600, body: 'IBM Plex Sans', bw: 400, case: 'none', track: -0.01, scale: 1.333 },
    shape: { radius: 4, button: 'soft', stroke: 1 },
    layout: { density: 0.5, hero: 'split' },
    imagery: ['engraving', 'lines'], mark: 'octagon',
    voice: 'Steady, plain-spoken, assured.',
    tags: ['trust', 'corporate', 'b2b', 'clear', 'traditional', 'systematic'],
    tiers: ['mid', 'premium', 'luxury'],
    refs: ['chase-1960', 'citi-1999', 'deutsche-bank-1974', 'mckinsey-2019']
  },
  {
    id: 'modernist', name: 'Mid-century Modernist', school: 'American corporate modernism · Rand, Vignelli',
    summary: 'Bold reductive marks, primary colour and economical sans. Built to work on a truck and a stamp.',
    principles: ['Reduce the mark to one idea', 'Primaries used as a system', 'Works at every scale'],
    axes: { playful: 30, progressive: 40, energy: 45, exclusive: 40, technical: 65 },
    palettes: [
      { name: 'Primary', bg: '#FAF7F0', surface: '#FFFFFF', ink: '#1A1A1A', muted: '#6E6A60', primary: '#1F4FB2', secondary: '#D7262E', accent: '#F2B705' },
      { name: 'Brown & gold', bg: '#FFFFFF', surface: '#F0EEE9', ink: '#221B16', muted: '#6B645E', primary: '#5A3A22', secondary: '#E8A33D', accent: '#221B16' }
    ],
    type: { display: 'Archivo', dw: 800, body: 'Archivo', bw: 400, case: 'none', track: -0.03, scale: 1.414 },
    shape: { radius: 2, button: 'square', stroke: 2 },
    layout: { density: 0.55, hero: 'split' },
    imagery: ['stripes', 'geometric'], mark: 'stripes',
    voice: 'Confident and economical.',
    tags: ['systematic', 'corporate', 'trust', 'clear', 'b2b', 'bold'],
    tiers: ['value', 'mid', 'premium'],
    refs: ['ibm-1972', 'ups-1961', 'american-airlines-1967', 'fedex-1994']
  },
  {
    id: 'neofintech', name: 'Neo-Fintech Pop', school: 'Challenger-brand era · 2015→',
    summary: 'One owned, saturated hue, a chunky grotesk and pill buttons. Money made friendly and fast.',
    principles: ['Own one unexpected colour', 'Big numerals, short sentences', 'Product UI is the hero'],
    axes: { playful: 55, progressive: 80, energy: 65, exclusive: 30, technical: 60 },
    palettes: [
      { name: 'Hot coral', bg: '#14233C', surface: '#1E3150', ink: '#FFFFFF', muted: '#A9B6CC', primary: '#FF4F40', secondary: '#FFD6CF', accent: '#4CD3C2' },
      { name: 'Money green', bg: '#F5F5F0', surface: '#FFFFFF', ink: '#0E0E0E', muted: '#666666', primary: '#00C244', secondary: '#0E0E0E', accent: '#C9F27B' }
    ],
    type: { display: 'Bricolage Grotesque', dw: 800, body: 'DM Sans', bw: 400, case: 'none', track: -0.03, scale: 1.5 },
    shape: { radius: 18, button: 'pill', stroke: 2 },
    layout: { density: 0.45, hero: 'split' },
    imagery: ['geometric', 'friendly'], mark: 'circleMono',
    voice: 'Money, minus the jargon.',
    tags: ['bold', 'friendly', 'digital', 'social', 'clear'],
    tiers: ['value', 'mid'],
    refs: ['monzo', 'wise-2021', 'robinhood-2024']
  },
  {
    id: 'gradient', name: 'Gradient Futurism', school: 'Platform-tech aesthetic · 2016→',
    summary: 'Luminous mesh gradients on calm surfaces, precise sans and soft shadows. Infrastructure that feels alive.',
    principles: ['Gradient as the signature asset', 'Quiet UI around a loud hero', 'Precise, light type'],
    axes: { playful: 35, progressive: 90, energy: 50, exclusive: 50, technical: 80 },
    palettes: [
      { name: 'Daylight', bg: '#FFFFFF', surface: '#F6F9FC', ink: '#0A2540', muted: '#5B6B7F', primary: '#635BFF', secondary: '#00D4FF', accent: '#FF5996' },
      { name: 'Nightshift', bg: '#0B0B1A', surface: '#15152B', ink: '#F3F3FF', muted: '#9A9AC0', primary: '#7C5CFF', secondary: '#FF7A59', accent: '#2EE6D6' }
    ],
    type: { display: 'Sora', dw: 600, body: 'Plus Jakarta Sans', bw: 400, case: 'none', track: -0.03, scale: 1.414 },
    shape: { radius: 12, button: 'soft', stroke: 1 },
    layout: { density: 0.45, hero: 'split' },
    imagery: ['mesh', 'glow'], mark: 'orb',
    voice: 'Infrastructure for what\'s next.',
    tags: ['digital', 'technical', 'b2b', 'premium', 'systematic'],
    tiers: ['mid', 'premium'],
    refs: ['stripe', 'instagram-2016']
  },
  {
    id: 'darkprecision', name: 'Dark Precision', school: 'Developer-tool minimalism · 2019→',
    summary: 'Near-black canvases, hairline grids, a single glow. Built for speed and focus.',
    principles: ['Dark by default', 'Hairlines over boxes', 'Monospace for detail'],
    axes: { playful: 15, progressive: 90, energy: 35, exclusive: 55, technical: 95 },
    palettes: [
      { name: 'Graphite violet', bg: '#08090A', surface: '#141518', ink: '#F7F8F8', muted: '#8A8F98', primary: '#5E6AD2', secondary: '#26282E', accent: '#4EE1A0' },
      { name: 'Mono ember', bg: '#000000', surface: '#111111', ink: '#EDEDED', muted: '#888888', primary: '#FFFFFF', secondary: '#333333', accent: '#FF4D00' }
    ],
    type: { display: 'Inter Tight', dw: 600, body: 'Inter', bw: 400, mono: 'JetBrains Mono', case: 'none', track: -0.04, scale: 1.414 },
    shape: { radius: 8, button: 'soft', stroke: 1 },
    layout: { density: 0.6, hero: 'center' },
    imagery: ['glow', 'lines'], mark: 'stack',
    voice: 'Built for speed. Designed for focus.',
    tags: ['technical', 'dark', 'digital', 'precise', 'minimal', 'mono', 'b2b'],
    tiers: ['mid', 'premium'],
    refs: ['linear', 'github-2022']
  },
  {
    id: 'scientific', name: 'Scientific Data', school: 'Technical documentation · NASA standards manual',
    summary: 'Plots, coordinates and monospace labels on a clean ground. Evidence as aesthetic.',
    principles: ['Show the data', 'Monospace annotations', 'Engineering-drawing details'],
    axes: { playful: 15, progressive: 80, energy: 30, exclusive: 45, technical: 95 },
    palettes: [
      { name: 'Mission', bg: '#F7F7F4', surface: '#FFFFFF', ink: '#111418', muted: '#6A717A', primary: '#E03A1E', secondary: '#1C3F94', accent: '#FFB000' },
      { name: 'Blueprint', bg: '#0E1A2B', surface: '#13243A', ink: '#E6EEF8', muted: '#8EA3BD', primary: '#5AC8FA', secondary: '#FFD166', accent: '#FF6B6B' }
    ],
    type: { display: 'Space Grotesk', dw: 500, body: 'IBM Plex Sans', bw: 400, mono: 'IBM Plex Mono', case: 'none', track: -0.02, scale: 1.333 },
    shape: { radius: 0, button: 'outline', stroke: 1 },
    layout: { density: 0.65, hero: 'split' },
    imagery: ['data', 'plan'], mark: 'ring',
    voice: 'Evidence first.',
    tags: ['technical', 'precise', 'systematic', 'mono', 'b2b'],
    tiers: ['mid', 'premium'],
    refs: ['nasa-1975', 'openai-2025']
  },
  {
    id: 'editorialLux', name: 'Editorial Luxury', school: 'Fashion-house modernism · 2012→',
    summary: 'High-contrast didone or stark caps, black and white, campaign imagery. Less, louder.',
    principles: ['Black, white, one signature', 'Caps with generous tracking', 'Imagery carries emotion'],
    axes: { playful: 20, progressive: 55, energy: 30, exclusive: 92, technical: 35 },
    palettes: [
      { name: 'Gallery white', bg: '#FFFFFF', surface: '#F3F1EE', ink: '#0A0A0A', muted: '#6F6A64', primary: '#0A0A0A', secondary: '#FFFFFF', accent: '#A47C48' },
      { name: 'After dark', bg: '#0A0A0A', surface: '#161616', ink: '#F5F2EC', muted: '#A39E95', primary: '#F5F2EC', secondary: '#0A0A0A', accent: '#8E1B1B' }
    ],
    type: { display: 'Bodoni Moda', dw: 500, body: 'Instrument Sans', bw: 400, case: 'upper', track: 0.08, scale: 1.6 },
    shape: { radius: 0, button: 'outline', stroke: 1 },
    layout: { density: 0.3, hero: 'fullbleed' },
    imagery: ['scene', 'grain'], mark: 'wordmark',
    voice: 'Less, louder.',
    tags: ['luxury', 'editorial', 'minimal', 'premium'],
    tiers: ['premium', 'luxury'],
    refs: ['burberry-2018', 'calvin-klein-2017', 'celine-2018', 'rimowa-2018']
  },
  {
    id: 'quietLux', name: 'Quiet Luxury', school: 'Apothecary & atelier restraint',
    summary: 'Warm neutrals, a refined old-style serif, and lots of air. Considered, unhurried, precise.',
    principles: ['Tonal palettes, no brights', 'Old-style serif, small sizes', 'Whitespace is the luxury'],
    axes: { playful: 15, progressive: 35, energy: 15, exclusive: 85, technical: 25 },
    palettes: [
      { name: 'Apothecary', bg: '#EFEBE3', surface: '#F7F4EE', ink: '#2B2620', muted: '#7A7166', primary: '#4B3F33', secondary: '#D9D1C3', accent: '#8A6F4D' },
      { name: 'Sage stone', bg: '#E7E5DE', surface: '#F2F1EC', ink: '#20231F', muted: '#6C7069', primary: '#3F4A3C', secondary: '#C9CFC3', accent: '#9C7A54' }
    ],
    type: { display: 'Cormorant Garamond', dw: 500, body: 'Hanken Grotesk', bw: 400, case: 'none', track: -0.01, scale: 1.5 },
    shape: { radius: 0, button: 'underline', stroke: 1 },
    layout: { density: 0.25, hero: 'center' },
    imagery: ['grain', 'arch'], mark: 'wordmark',
    voice: 'Considered, unhurried, precise.',
    tags: ['luxury', 'minimal', 'crafted', 'natural', 'premium', 'editorial'],
    tiers: ['premium', 'luxury'],
    refs: ['aesop', 'muji-2002']
  },
  {
    id: 'artdeco', name: 'Art Deco Glamour', school: 'Art Deco · 1920s–30s, Cassandre',
    summary: 'Gold on deep jewel tones, sunbursts and tall geometric capitals. An evening, elevated.',
    principles: ['Symmetry and sunbursts', 'Metallic accent on jewel tones', 'Tall, spaced capitals'],
    axes: { playful: 30, progressive: 30, energy: 50, exclusive: 85, technical: 40 },
    palettes: [
      { name: 'Emerald gold', bg: '#0F1E1A', surface: '#16302A', ink: '#F3E9D2', muted: '#BFAF8C', primary: '#C9A646', secondary: '#1E4D40', accent: '#E8D9A8' },
      { name: 'Ivory midnight', bg: '#F3EBDD', surface: '#FBF6EC', ink: '#1B1B2F', muted: '#6B6577', primary: '#1B1B2F', secondary: '#B68A3A', accent: '#9E2A2B' }
    ],
    type: { display: 'Limelight', dw: 400, body: 'Josefin Sans', bw: 400, case: 'upper', track: 0.1, scale: 1.5 },
    shape: { radius: 0, button: 'outline', stroke: 1 },
    layout: { density: 0.4, hero: 'center' },
    imagery: ['deco', 'arch'], mark: 'fan',
    voice: 'An evening, elevated.',
    tags: ['luxury', 'ornate', 'premium', 'editorial', 'retro'],
    tiers: ['premium', 'luxury'],
    refs: ['cassandre', 'warner-bros-2019']
  },
  {
    id: 'heritage', name: 'Heritage Craft', school: 'Crests, labels & engraving',
    summary: 'Racing green and brass, a bookish serif and an engraved crest. Made properly, since day one.',
    principles: ['A crest or seal device', 'Deep heritage colours', 'Engraved line textures'],
    axes: { playful: 15, progressive: 15, energy: 25, exclusive: 75, technical: 35 },
    palettes: [
      { name: 'Racing green', bg: '#F4EFE4', surface: '#FBF8F1', ink: '#1E2A22', muted: '#6C6A5E', primary: '#1F4A35', secondary: '#B48A3C', accent: '#7A2E22' },
      { name: 'Oxblood brass', bg: '#1A1714', surface: '#26211C', ink: '#EFE6D4', muted: '#A89A82', primary: '#C49A4A', secondary: '#5E1F1F', accent: '#EFE6D4' }
    ],
    type: { display: 'Libre Caslon Text', dw: 700, body: 'Libre Franklin', bw: 400, case: 'none', track: 0, scale: 1.414 },
    shape: { radius: 2, button: 'square', stroke: 1 },
    layout: { density: 0.45, hero: 'center' },
    imagery: ['engraving', 'scene'], mark: 'crest',
    voice: 'Made properly, since day one.',
    tags: ['traditional', 'crafted', 'trust', 'premium', 'ornate'],
    tiers: ['mid', 'premium', 'luxury'],
    refs: ['rolls-royce-2020', 'starbucks-2011', 'va-1989']
  },
  {
    id: 'brutalist', name: 'Neo-Brutalism', school: 'Brutalist web · 2014→',
    summary: 'Thick borders, hard shadows, raw system type and clashing primaries. No filter.',
    principles: ['Visible structure, hard edges', 'Offset shadows, no blur', 'Default-looking type, used loudly'],
    axes: { playful: 50, progressive: 80, energy: 85, exclusive: 40, technical: 60 },
    palettes: [
      { name: 'Highlighter', bg: '#FFFFFF', surface: '#F2F2F2', ink: '#000000', muted: '#555555', primary: '#FFE600', secondary: '#000000', accent: '#FF3EA5' },
      { name: 'Concrete blue', bg: '#E8E8E3', surface: '#FFFFFF', ink: '#0A0A0A', muted: '#4D4D4D', primary: '#2D5BFF', secondary: '#0A0A0A', accent: '#FF4D2E' }
    ],
    type: { display: 'Archivo Black', dw: 400, body: 'Space Mono', bw: 400, case: 'upper', track: -0.02, scale: 1.6 },
    shape: { radius: 0, button: 'shadow', stroke: 3 },
    layout: { density: 0.7, hero: 'editorial' },
    imagery: ['type', 'pixel'], mark: 'squareMono',
    voice: 'No filter. Just the thing.',
    tags: ['raw', 'bold', 'expressive', 'digital', 'mono'],
    tiers: ['value', 'mid', 'premium'],
    refs: ['businessweek-2010', 'stedelijk-2012']
  },
  {
    id: 'friendlyGeo', name: 'Friendly Geometric', school: 'Human SaaS · 2015→',
    summary: 'Rounded geometric sans, sunny colour, pill buttons and playful shapes. Approachable software.',
    principles: ['Rounded, open letterforms', 'Bright primary plus warm neutral', 'Illustration-style shapes'],
    axes: { playful: 65, progressive: 65, energy: 55, exclusive: 30, technical: 40 },
    palettes: [
      { name: 'Cavendish', bg: '#FFFDF7', surface: '#FFFFFF', ink: '#241C15', muted: '#6E6258', primary: '#FFE01B', secondary: '#241C15', accent: '#007C89' },
      { name: 'Ultra violet', bg: '#F6F7FF', surface: '#FFFFFF', ink: '#1D1B4B', muted: '#63618A', primary: '#4A3AFF', secondary: '#FFB4A2', accent: '#2ED3B7' }
    ],
    type: { display: 'Outfit', dw: 700, body: 'Figtree', bw: 400, case: 'none', track: -0.025, scale: 1.414 },
    shape: { radius: 16, button: 'pill', stroke: 2 },
    layout: { density: 0.45, hero: 'split' },
    imagery: ['friendly', 'organic'], mark: 'circleMono',
    voice: 'Hey there, let\'s get you set up.',
    tags: ['friendly', 'clear', 'digital', 'warm', 'b2b', 'flexible'],
    tiers: ['value', 'mid'],
    refs: ['mailchimp-2018', 'slack-2019', 'dropbox-2017', 'duolingo-2019', 'deliveroo-2016']
  },
  {
    id: 'warmHuman', name: 'Warm Human', school: 'Belonging brands · 2014→',
    summary: 'A soft serif headline, coral warmth and arched frames for people. Come as you are.',
    principles: ['Soft serif with humanist sans', 'Warm coral or terracotta lead', 'Frames that hold people'],
    axes: { playful: 50, progressive: 50, energy: 45, exclusive: 40, technical: 20 },
    palettes: [
      { name: 'Coral welcome', bg: '#FFF8F3', surface: '#FFFFFF', ink: '#2A1E1A', muted: '#7A6A62', primary: '#FF5A5F', secondary: '#FFD8C2', accent: '#00A699' },
      { name: 'Hearth', bg: '#F7F3EC', surface: '#FFFFFF', ink: '#1F2A2E', muted: '#66757A', primary: '#D9653B', secondary: '#F2D6A2', accent: '#2F6F62' }
    ],
    type: { display: 'Fraunces', dw: 600, body: 'DM Sans', bw: 400, case: 'none', track: -0.02, scale: 1.414 },
    shape: { radius: 14, button: 'pill', stroke: 2 },
    layout: { density: 0.45, hero: 'split' },
    imagery: ['arch', 'scene'], mark: 'blob',
    voice: 'Come as you are. Stay a while.',
    tags: ['warm', 'human', 'friendly', 'trust', 'social'],
    tiers: ['value', 'mid', 'premium'],
    refs: ['airbnb-2014', 'huma-2020', 'mind-2021']
  },
  {
    id: 'softWellness', name: 'Soft Wellness', school: 'Calm-tech & clean beauty · 2014→',
    summary: 'Pastels, blobs, an elegant serif and pill shapes. Breathe in, you\'ve got this.',
    principles: ['Pastel, low-contrast fields', 'Organic blob forms', 'Gentle second-person copy'],
    axes: { playful: 50, progressive: 50, energy: 15, exclusive: 45, technical: 15 },
    palettes: [
      { name: 'Sunrise', bg: '#FBF4EE', surface: '#FFFFFF', ink: '#3A2E2A', muted: '#8C7B73', primary: '#F28C6B', secondary: '#F9D7C8', accent: '#9FC5B0' },
      { name: 'Rose quartz', bg: '#F6EFF4', surface: '#FFFFFF', ink: '#2E2433', muted: '#87798C', primary: '#E9A6C1', secondary: '#C9B6E4', accent: '#F4CFA8' }
    ],
    type: { display: 'Instrument Serif', dw: 400, body: 'Manrope', bw: 400, case: 'none', track: -0.01, scale: 1.5 },
    shape: { radius: 28, button: 'pill', stroke: 1 },
    layout: { density: 0.35, hero: 'center' },
    imagery: ['organic', 'rings'], mark: 'blob',
    voice: 'Breathe in. You\'ve got this.',
    tags: ['warm', 'human', 'friendly', 'natural'],
    tiers: ['mid', 'premium'],
    refs: ['headspace', 'glossier']
  },
  {
    id: 'clinical', name: 'Clinical Calm', school: 'Consumer healthcare · 2015→',
    summary: 'Teal and clean white, a legible humanist sans and soft rounded UI. Care that fits your life.',
    principles: ['Hygiene through whitespace', 'Legibility over style', 'Calm cool primaries'],
    axes: { playful: 25, progressive: 60, energy: 25, exclusive: 40, technical: 55 },
    palettes: [
      { name: 'Clinic teal', bg: '#F5FAFB', surface: '#FFFFFF', ink: '#0E2A33', muted: '#5C7480', primary: '#0E7C86', secondary: '#CDEBEE', accent: '#2F6FED' },
      { name: 'Trust blue', bg: '#FFFFFF', surface: '#F2F6FF', ink: '#0B1F44', muted: '#5A6A85', primary: '#2557D6', secondary: '#DCE6FF', accent: '#19B394' }
    ],
    type: { display: 'Manrope', dw: 700, body: 'Figtree', bw: 400, case: 'none', track: -0.02, scale: 1.333 },
    shape: { radius: 12, button: 'soft', stroke: 1 },
    layout: { density: 0.45, hero: 'split' },
    imagery: ['rings', 'organic'], mark: 'ring',
    voice: 'Care that fits your life.',
    tags: ['clear', 'trust', 'accessible', 'human', 'minimal'],
    tiers: ['value', 'mid', 'premium'],
    refs: ['huma-2020', 'heart-stroke-2016']
  },
  {
    id: 'organic', name: 'Organic Earth', school: 'Outdoor & natural goods',
    summary: 'Earth pigments, a soft wonky serif and topographic texture. Grown slowly, made to last.',
    principles: ['Pigments from nature', 'Paper and grain textures', 'Topographic and botanical lines'],
    axes: { playful: 35, progressive: 35, energy: 30, exclusive: 50, technical: 15 },
    palettes: [
      { name: 'Olive clay', bg: '#EFE9DD', surface: '#F7F3EA', ink: '#2C2A22', muted: '#6F6A58', primary: '#5B6E3A', secondary: '#C77D3A', accent: '#E3C567' },
      { name: 'Forest floor', bg: '#E9EFE8', surface: '#F6F9F5', ink: '#1D2B22', muted: '#5F6F63', primary: '#2F5D46', secondary: '#D8A657', accent: '#8FB3A2' }
    ],
    type: { display: 'Fraunces', dw: 700, body: 'Work Sans', bw: 400, case: 'none', track: -0.02, scale: 1.414 },
    shape: { radius: 6, button: 'soft', stroke: 1 },
    layout: { density: 0.45, hero: 'split' },
    imagery: ['topo', 'grain'], mark: 'sun',
    voice: 'Grown slowly. Made to last.',
    tags: ['natural', 'crafted', 'warm', 'human'],
    tiers: ['mid', 'premium'],
    refs: ['patagonia', 'orsted-2017']
  },
  {
    id: 'handmade', name: 'Hand-made Honest', school: 'Challenger CPG · 2014→',
    summary: 'Hand-drawn type, scribbles, black and white with one colour and long honest copy.',
    principles: ['Handwriting over polish', 'Talk like a person, at length', 'Black line on plain ground'],
    axes: { playful: 80, progressive: 55, energy: 60, exclusive: 25, technical: 10 },
    palettes: [
      { name: 'Carton', bg: '#FFFFFF', surface: '#F4F1EA', ink: '#1A1A1A', muted: '#555555', primary: '#1A1A1A', secondary: '#E8E3D7', accent: '#2B59C3' },
      { name: 'Market stall', bg: '#FFF6D9', surface: '#FFFFFF', ink: '#23201B', muted: '#6B6457', primary: '#E94E3C', secondary: '#23201B', accent: '#3AA17E' }
    ],
    type: { display: 'Caveat', dw: 700, body: 'Rubik', bw: 400, case: 'none', track: 0, scale: 1.6 },
    shape: { radius: 4, button: 'outline', stroke: 2.5 },
    layout: { density: 0.55, hero: 'editorial' },
    imagery: ['doodle', 'halftone'], mark: 'scribble',
    voice: 'We made this. It\'s good. Here\'s why.',
    tags: ['raw', 'human', 'playful', 'crafted', 'packaging', 'social'],
    tiers: ['value', 'mid'],
    refs: ['oatly-2014', 'calm-charity-2021']
  },
  {
    id: 'ecoOptimist', name: 'Climate Optimism', school: 'Clean-tech · 2020→',
    summary: 'Sun yellow and fresh green, a wide friendly sans and sunrise arcs. Brighter days ahead.',
    principles: ['Optimism over doom', 'Sun and sky motifs', 'Data shown as progress'],
    axes: { playful: 45, progressive: 80, energy: 55, exclusive: 35, technical: 50 },
    palettes: [
      { name: 'Solar', bg: '#F3F7EE', surface: '#FFFFFF', ink: '#10261B', muted: '#5A6E61', primary: '#0E9F5B', secondary: '#FFD23F', accent: '#0E6E52' },
      { name: 'Night grid', bg: '#0F2A22', surface: '#163A2F', ink: '#EAF7EE', muted: '#9CC0AE', primary: '#B6F36A', secondary: '#FFC94A', accent: '#6AD1E3' }
    ],
    type: { display: 'Unbounded', dw: 600, body: 'Instrument Sans', bw: 400, case: 'none', track: -0.03, scale: 1.333 },
    shape: { radius: 20, button: 'pill', stroke: 2 },
    layout: { density: 0.45, hero: 'split' },
    imagery: ['arch', 'topo'], mark: 'sun',
    voice: 'Cleaner power, brighter days.',
    tags: ['natural', 'friendly', 'bold', 'clear', 'digital'],
    tiers: ['value', 'mid', 'premium'],
    refs: ['bp-2000', 'orsted-2017']
  },
  {
    id: 'retro', name: 'Retro Revival', school: '70s warmth, revived · 2016→',
    summary: 'Chunky soft type, warm brown and flame red, rainbow stripes and round badges. Good things done the old way.',
    principles: ['Warm, food-safe palette', 'Chunky, soft display type', 'Stripes and round badges'],
    axes: { playful: 70, progressive: 25, energy: 70, exclusive: 30, technical: 15 },
    palettes: [
      { name: 'Flame grill', bg: '#F5EBDC', surface: '#FFF6EA', ink: '#502314', muted: '#8A6A55', primary: '#D62300', secondary: '#FF8732', accent: '#198737' },
      { name: 'Film yellow', bg: '#FBE9C6', surface: '#FFF5E1', ink: '#2E1F14', muted: '#7C6550', primary: '#E8A317', secondary: '#D6362C', accent: '#2E1F14' }
    ],
    type: { display: 'Shrikhand', dw: 400, body: 'Rubik', bw: 400, case: 'none', track: 0, scale: 1.5 },
    shape: { radius: 24, button: 'pill', stroke: 2 },
    layout: { density: 0.5, hero: 'center' },
    imagery: ['stripes', 'arch'], mark: 'badge',
    voice: 'Good things, done the old way.',
    tags: ['retro', 'warm', 'bold', 'playful', 'packaging', 'signage'],
    tiers: ['value', 'mid'],
    refs: ['burger-king-2021', 'kodak-2016', 'dunkin-2018']
  },
  {
    id: 'y2k', name: 'Y2K Chrome', school: 'Millennium-futurism revival · 2020→',
    summary: 'Liquid chrome, sparkles, lilac and hot pink with wide display type. Main-character energy.',
    principles: ['Chrome and iridescence', 'Wide, bubbly display type', 'Sparkles and stickers'],
    axes: { playful: 80, progressive: 85, energy: 85, exclusive: 50, technical: 45 },
    palettes: [
      { name: 'Liquid lilac', bg: '#EDEDF2', surface: '#FFFFFF', ink: '#111118', muted: '#6A6A7A', primary: '#8E7CFF', secondary: '#FF6AD5', accent: '#7DF9FF' },
      { name: 'Club night', bg: '#0B0B12', surface: '#17172A', ink: '#F2F2FF', muted: '#A0A0C0', primary: '#FF4FD8', secondary: '#7DF9FF', accent: '#E6E6F0' }
    ],
    type: { display: 'Unbounded', dw: 800, body: 'Space Grotesk', bw: 400, case: 'none', track: -0.03, scale: 1.5 },
    shape: { radius: 24, button: 'pill', stroke: 2 },
    layout: { density: 0.55, hero: 'center' },
    imagery: ['chrome', 'mesh'], mark: 'star',
    voice: 'Main character energy.',
    tags: ['expressive', 'bold', 'digital', 'social', 'neon'],
    tiers: ['value', 'mid', 'premium'],
    refs: ['twitch-2019']
  },
  {
    id: 'bauhaus', name: 'Bauhaus Constructivist', school: 'Bauhaus · 1919–1933',
    summary: 'Circle, square, triangle in red, blue and yellow, with geometric capitals. Form follows function.',
    principles: ['Primary shapes, primary colours', 'Asymmetric balance', 'Geometric sans in caps'],
    axes: { playful: 45, progressive: 50, energy: 60, exclusive: 40, technical: 60 },
    palettes: [
      { name: 'Dessau', bg: '#F1EADB', surface: '#FAF6EC', ink: '#1B1B1B', muted: '#66625A', primary: '#D7263D', secondary: '#1B4E9B', accent: '#F4B400' },
      { name: 'Black studio', bg: '#1B1B1B', surface: '#262626', ink: '#F1EADB', muted: '#A39F95', primary: '#F4B400', secondary: '#D7263D', accent: '#3A86FF' }
    ],
    type: { display: 'Josefin Sans', dw: 700, body: 'Work Sans', bw: 400, case: 'upper', track: 0.02, scale: 1.5 },
    shape: { radius: 0, button: 'square', stroke: 2 },
    layout: { density: 0.5, hero: 'split' },
    imagery: ['geometric', 'stripes'], mark: 'trio',
    voice: 'Form follows function.',
    tags: ['systematic', 'bold', 'expressive', 'editorial'],
    tiers: ['value', 'mid', 'premium'],
    refs: ['bauhaus-1919', 'munich-1972']
  },
  {
    id: 'memphis', name: 'Memphis Pop', school: 'Memphis Group · 1981',
    summary: 'Squiggles, confetti, clashing pastels and hard shadows. Loud, fun and a little weird.',
    principles: ['Pattern on pattern', 'Clashing pastels with black', 'Squiggles, dots, triangles'],
    axes: { playful: 90, progressive: 55, energy: 90, exclusive: 30, technical: 25 },
    palettes: [
      { name: 'Milano', bg: '#FFF4E0', surface: '#FFFFFF', ink: '#1E1E1E', muted: '#666666', primary: '#FF5FA2', secondary: '#2EC4B6', accent: '#FFD23F' },
      { name: 'Arcade', bg: '#E8F6FF', surface: '#FFFFFF', ink: '#1A1A2E', muted: '#5C5C7A', primary: '#6C3BFF', secondary: '#FF8A3D', accent: '#00C2A8' }
    ],
    type: { display: 'Rubik Mono One', dw: 400, body: 'Rubik', bw: 400, case: 'upper', track: -0.01, scale: 1.5 },
    shape: { radius: 10, button: 'shadow', stroke: 3 },
    layout: { density: 0.6, hero: 'center' },
    imagery: ['squiggle', 'geometric'], mark: 'trio',
    voice: 'Loud, fun, and a little weird.',
    tags: ['playful', 'bold', 'expressive', 'kids', 'retro'],
    tiers: ['value', 'mid'],
    refs: ['memphis-1981']
  },
  {
    id: 'japaneseMinimal', name: 'Japanese Minimalism', school: 'Muji / Hara · Uniqlo / Sato',
    summary: 'Off-white paper, one red, a quiet mincho headline and lots of emptiness. Just what is needed.',
    principles: ['Emptiness as content', 'One red accent', 'Natural, unbleached materials'],
    axes: { playful: 15, progressive: 40, energy: 10, exclusive: 55, technical: 40 },
    palettes: [
      { name: 'Unbleached', bg: '#F4F1EA', surface: '#FBF9F4', ink: '#232323', muted: '#7B776F', primary: '#7F0019', secondary: '#DCD6C8', accent: '#232323' },
      { name: 'Red square', bg: '#FFFFFF', surface: '#F4F4F4', ink: '#111111', muted: '#777777', primary: '#E60012', secondary: '#111111', accent: '#F4F4F4' }
    ],
    type: { display: 'Shippori Mincho', dw: 600, body: 'Zen Kaku Gothic New', bw: 400, case: 'none', track: 0.02, scale: 1.333 },
    shape: { radius: 0, button: 'square', stroke: 1 },
    layout: { density: 0.2, hero: 'center' },
    imagery: ['minimal', 'grain'], mark: 'squareMono',
    voice: 'Just what is needed.',
    tags: ['minimal', 'crafted', 'natural', 'clear', 'premium'],
    tiers: ['value', 'mid', 'premium'],
    refs: ['muji-2002', 'uniqlo-2006']
  },
  {
    id: 'magazine', name: 'Editorial Magazine', school: 'Newsstand editorial · Businessweek 2010',
    summary: 'Heavy news-grotesk headlines, a reading serif, collage and columns. The story behind the story.',
    principles: ['Headline as hero', 'Collage and cut-outs', 'Columns, rules and captions'],
    axes: { playful: 45, progressive: 65, energy: 75, exclusive: 50, technical: 45 },
    palettes: [
      { name: 'Newsprint', bg: '#FFFFFF', surface: '#F2F0EA', ink: '#111111', muted: '#5E5E5E', primary: '#FF3B00', secondary: '#111111', accent: '#FFE100' },
      { name: 'Weekend', bg: '#F4EFE6', surface: '#FFFFFF', ink: '#161616', muted: '#6A645C', primary: '#1D3AF0', secondary: '#161616', accent: '#F06292' }
    ],
    type: { display: 'Schibsted Grotesk', dw: 900, body: 'Newsreader', bw: 400, case: 'none', track: -0.04, scale: 1.6 },
    shape: { radius: 0, button: 'underline', stroke: 2 },
    layout: { density: 0.7, hero: 'editorial' },
    imagery: ['collage', 'halftone'], mark: 'wordmark',
    voice: 'The story behind the story.',
    tags: ['editorial', 'bold', 'expressive', 'dense'],
    tiers: ['mid', 'premium'],
    refs: ['businessweek-2010', 'guardian-2018', 'new-school-2015']
  },
  {
    id: 'dynamicSystem', name: 'Dynamic Identity System', school: 'Responsive identities · 2013→',
    summary: 'A mark that changes with the content, built on a strict system. Always changing, always recognisable.',
    principles: ['Rules, not a fixed logo', 'Generative variations', 'Monochrome base, rotating accents'],
    axes: { playful: 40, progressive: 85, energy: 65, exclusive: 55, technical: 65 },
    palettes: [
      { name: 'Gallery mono', bg: '#FFFFFF', surface: '#F0F0F0', ink: '#0A0A0A', muted: '#666666', primary: '#0A0A0A', secondary: '#FF3D00', accent: '#00C2FF' },
      { name: 'Black box', bg: '#111111', surface: '#1E1E1E', ink: '#F5F5F5', muted: '#999999', primary: '#F5F5F5', secondary: '#FF2E63', accent: '#08D9D6' }
    ],
    type: { display: 'Space Grotesk', dw: 700, body: 'IBM Plex Sans', bw: 400, case: 'none', track: -0.03, scale: 1.5 },
    shape: { radius: 0, button: 'square', stroke: 2 },
    layout: { density: 0.55, hero: 'editorial' },
    imagery: ['flow', 'lines'], mark: 'zigzag',
    voice: 'Always changing. Always us.',
    tags: ['systematic', 'flexible', 'expressive', 'editorial', 'digital'],
    tiers: ['mid', 'premium'],
    refs: ['whitney-2013', 'mit-media-lab-2014', 'mozilla-2017', 'tate-2000', 'melbourne-2009']
  },
  {
    id: 'maximal', name: 'Maximal Duotone', school: 'Content-led brands · 2015→',
    summary: 'Saturated duotone imagery, oversized type and clashing colour pairs. Turn it up.',
    principles: ['Duotone everything', 'Colour pairs as a system', 'Type at poster scale'],
    axes: { playful: 70, progressive: 80, energy: 95, exclusive: 40, technical: 35 },
    palettes: [
      { name: 'Duotone night', bg: '#1E3264', surface: '#2B4280', ink: '#FFFFFF', muted: '#C3CDF0', primary: '#F573A0', secondary: '#1ED760', accent: '#FFC864' },
      { name: 'Hot tomato', bg: '#FF4632', surface: '#FF6A5A', ink: '#1A1A1A', muted: '#3A1712', primary: '#1A1A1A', secondary: '#FFE14D', accent: '#A0E7FF' }
    ],
    type: { display: 'Syne', dw: 800, body: 'Inter', bw: 400, case: 'none', track: -0.03, scale: 1.6 },
    shape: { radius: 8, button: 'pill', stroke: 2 },
    layout: { density: 0.6, hero: 'fullbleed' },
    imagery: ['scene', 'halftone'], mark: 'circleMono',
    voice: 'Turn it up.',
    tags: ['bold', 'expressive', 'social', 'digital', 'neon'],
    tiers: ['value', 'mid', 'premium'],
    refs: ['spotify-2015', 'channel4-2015', 'netflix-2014']
  },
  {
    id: 'kinetic', name: 'Kinetic Performance', school: 'Sportswear & motorsport',
    summary: 'Condensed italic capitals, volt on black and speed lines. Faster than yesterday.',
    principles: ['Italic implies motion', 'Black plus one volt colour', 'Numbers and stats as graphics'],
    axes: { playful: 40, progressive: 70, energy: 95, exclusive: 45, technical: 50 },
    palettes: [
      { name: 'Volt', bg: '#0B0B0B', surface: '#161616', ink: '#FFFFFF', muted: '#9A9A9A', primary: '#D7FF1F', secondary: '#FFFFFF', accent: '#FF3B30' },
      { name: 'Track orange', bg: '#F2F2F2', surface: '#FFFFFF', ink: '#0B0B0B', muted: '#5A5A5A', primary: '#FF4F00', secondary: '#0B0B0B', accent: '#0057FF' }
    ],
    type: { display: 'Barlow Condensed', dw: 800, body: 'Archivo', bw: 400, case: 'upper', track: -0.01, italic: true, scale: 1.6 },
    shape: { radius: 2, button: 'square', stroke: 2 },
    layout: { density: 0.6, hero: 'fullbleed' },
    imagery: ['speed', 'scene'], mark: 'slash',
    voice: 'Faster than yesterday.',
    tags: ['kinetic', 'bold', 'dark', 'expressive'],
    tiers: ['value', 'mid', 'premium'],
    refs: ['formula1-2017', 'premier-league-2016', 'peloton-2023']
  },
  {
    id: 'kidsJoy', name: 'Joyful Play', school: 'Children\'s & family brands',
    summary: 'Chunky rounded type, saturated primaries and bouncy shapes, with reading-friendly body text.',
    principles: ['Chunky, rounded, friendly', 'Saturated primaries', 'Early-reader legibility'],
    axes: { playful: 95, progressive: 50, energy: 80, exclusive: 10, technical: 15 },
    palettes: [
      { name: 'Crayon box', bg: '#FFF9EC', surface: '#FFFFFF', ink: '#1F2D5C', muted: '#5F6B94', primary: '#FF6B3D', secondary: '#3DB5FF', accent: '#FFD23F' },
      { name: 'Playground', bg: '#EFFAF4', surface: '#FFFFFF', ink: '#173A2F', muted: '#557567', primary: '#7B5CFF', secondary: '#2FD08A', accent: '#FF8FB1' }
    ],
    type: { display: 'Baloo 2', dw: 800, body: 'Lexend', bw: 400, case: 'none', track: -0.01, scale: 1.5 },
    shape: { radius: 28, button: 'pill', stroke: 3 },
    layout: { density: 0.5, hero: 'split' },
    imagery: ['friendly', 'squiggle'], mark: 'blob',
    voice: 'Let\'s play and learn!',
    tags: ['kids', 'playful', 'friendly', 'bold', 'accessible'],
    tiers: ['value', 'mid'],
    refs: ['fisher-price-2020', 'nickelodeon-2023']
  },
  {
    id: 'civic', name: 'Civic Clarity', school: 'Government design systems · 2012→',
    summary: 'Plain black on white, one link blue, a yellow focus state and high-legibility type. Built for everyone.',
    principles: ['Accessibility is the brand', 'Plain language, short lines', 'High contrast, visible focus'],
    axes: { playful: 20, progressive: 45, energy: 30, exclusive: 10, technical: 55 },
    palettes: [
      { name: 'Public service', bg: '#FFFFFF', surface: '#F3F2F1', ink: '#0B0C0C', muted: '#505A5F', primary: '#1D70B8', secondary: '#0B0C0C', accent: '#FFDD00' },
      { name: 'Federal', bg: '#FFFFFF', surface: '#F0F0F0', ink: '#1B1B1B', muted: '#565C65', primary: '#005EA2', secondary: '#162E51', accent: '#00A91C' }
    ],
    type: { display: 'Public Sans', dw: 700, body: 'Atkinson Hyperlegible', bw: 400, case: 'none', track: -0.01, scale: 1.333 },
    shape: { radius: 0, button: 'square', stroke: 2 },
    layout: { density: 0.45, hero: 'split' },
    imagery: ['geometric', 'data'], mark: 'squareMono',
    voice: 'Find what you need, quickly.',
    tags: ['accessible', 'clear', 'trust', 'systematic', 'human'],
    tiers: ['value', 'mid'],
    refs: ['govuk-2012', 'nyc-2007']
  },
  {
    id: 'cyber', name: 'Cyber Pixel', school: 'Arcade & net culture',
    summary: 'Neon on black, pixel art, HUD details and techno display type. Enter the next level.',
    principles: ['Neon on true dark', 'Pixel and scanline texture', 'HUD frames and readouts'],
    axes: { playful: 60, progressive: 95, energy: 90, exclusive: 45, technical: 85 },
    palettes: [
      { name: 'Neon grid', bg: '#07070D', surface: '#12121F', ink: '#E8E8FF', muted: '#8080A8', primary: '#00F0FF', secondary: '#FF2BD6', accent: '#F9F871' },
      { name: 'Terminal', bg: '#0A0F0A', surface: '#111A11', ink: '#D8FFD8', muted: '#6FA06F', primary: '#39FF14', secondary: '#00B3FF', accent: '#FF6B00' }
    ],
    type: { display: 'Chakra Petch', dw: 700, body: 'JetBrains Mono', bw: 400, mono: 'JetBrains Mono', case: 'upper', track: 0.02, scale: 1.5 },
    shape: { radius: 0, button: 'outline', stroke: 2 },
    layout: { density: 0.6, hero: 'center' },
    imagery: ['pixel', 'glow'], mark: 'pixel',
    voice: 'Enter the next level.',
    tags: ['neon', 'dark', 'digital', 'technical', 'expressive', 'mono'],
    tiers: ['value', 'mid', 'premium'],
    refs: ['twitch-2019', 'coinbase-2021']
  },
  {
    id: 'riso', name: 'Risograph Indie', school: 'Indie print & zine culture',
    summary: 'Fluorescent riso inks, halftone grain and misregistration on recycled paper. Printed in small batches.',
    principles: ['Two or three spot inks', 'Halftone and grain', 'Overprint and misregister'],
    axes: { playful: 65, progressive: 60, energy: 65, exclusive: 35, technical: 25 },
    palettes: [
      { name: 'Pink & blue', bg: '#F6F1E7', surface: '#FFFFFF', ink: '#1F1F1F', muted: '#6B655C', primary: '#FF48B0', secondary: '#0078BF', accent: '#FFE800' },
      { name: 'Orange & green', bg: '#F2EEE3', surface: '#FFFFFF', ink: '#222222', muted: '#6E6A60', primary: '#FF6C2F', secondary: '#00A95C', accent: '#765BA7' }
    ],
    type: { display: 'Young Serif', dw: 400, body: 'Work Sans', bw: 400, case: 'none', track: -0.02, scale: 1.5 },
    shape: { radius: 4, button: 'square', stroke: 2 },
    layout: { density: 0.55, hero: 'editorial' },
    imagery: ['halftone', 'collage'], mark: 'circleMono',
    voice: 'Printed in small batches.',
    tags: ['crafted', 'raw', 'expressive', 'editorial', 'social'],
    tiers: ['value', 'mid'],
    refs: ['public-theater-1994']
  },
  {
    id: 'architectural', name: 'Architectural Mono', school: 'Architecture & property',
    summary: 'Light, wide sans at large sizes, plan drawings and stone neutrals. Space, considered.',
    principles: ['Light weights at large sizes', 'Plan and section lines', 'Stone and concrete neutrals'],
    axes: { playful: 15, progressive: 60, energy: 20, exclusive: 70, technical: 70 },
    palettes: [
      { name: 'Limestone', bg: '#EDEDEA', surface: '#F7F7F5', ink: '#1C1C1C', muted: '#77776F', primary: '#1C1C1C', secondary: '#B8B6AE', accent: '#C2502E' },
      { name: 'Basalt', bg: '#1E1F1F', surface: '#2A2B2B', ink: '#EDEDE8', muted: '#9A9A94', primary: '#EDEDE8', secondary: '#55564F', accent: '#D6B47A' }
    ],
    type: { display: 'Hanken Grotesk', dw: 300, body: 'Hanken Grotesk', bw: 400, case: 'none', track: -0.03, scale: 1.5 },
    shape: { radius: 0, button: 'outline', stroke: 1 },
    layout: { density: 0.3, hero: 'fullbleed' },
    imagery: ['plan', 'scene'], mark: 'frame',
    voice: 'Space, considered.',
    tags: ['minimal', 'precise', 'premium', 'systematic', 'editorial'],
    tiers: ['premium', 'luxury'],
    refs: ['halstead-2018', 'polestar-2017']
  },
  {
    id: 'darkLuxury', name: 'Performance Luxury', school: 'Premium automotive & tech',
    summary: 'Black and silver, wide extended capitals and dramatic light. Engineered to move you.',
    principles: ['Dark, dramatic lighting', 'Wide extended caps', 'Metallic neutrals, one signal'],
    axes: { playful: 15, progressive: 70, energy: 55, exclusive: 80, technical: 75 },
    palettes: [
      { name: 'Silver black', bg: '#0C0C0D', surface: '#18181A', ink: '#F2F2F2', muted: '#8D8D92', primary: '#C9CED6', secondary: '#2A2A2E', accent: '#B3121B' },
      { name: 'Studio white', bg: '#F2F2F0', surface: '#FFFFFF', ink: '#101114', muted: '#6A6C70', primary: '#101114', secondary: '#D9D9D6', accent: '#0A6CFF' }
    ],
    type: { display: 'Michroma', dw: 400, body: 'Manrope', bw: 400, case: 'upper', track: 0.06, scale: 1.414 },
    shape: { radius: 2, button: 'outline', stroke: 1 },
    layout: { density: 0.35, hero: 'fullbleed' },
    imagery: ['scene', 'speed'], mark: 'chevron',
    voice: 'Engineered to move you.',
    tags: ['premium', 'luxury', 'dark', 'technical', 'precise', 'kinetic'],
    tiers: ['premium', 'luxury'],
    refs: ['polestar-2017', 'volvo-2021', 'rimowa-2018']
  }
];
