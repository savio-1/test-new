/* Powergrade taxonomy: the brief vocabulary.
   A client who has no logo, colours or direction can still answer four questions:
   what industry, what kind of business, who it's for, and what price tier.
   Each answer carries data the engine uses:
     axes      target personality on five 0–100 axes (see PG.AXES)
     codes     the category's visual codes, the conventions buyers already read
     convention / adjacent / avoid   direction ids, curated from the reference library
   Industry `copy` gives every mockup realistic, category-specific content. */
window.PG = window.PG || {};

PG.AXES = [
  { id: 'playful',     lo: 'Serious',     hi: 'Playful' },
  { id: 'progressive', lo: 'Classic',     hi: 'Progressive' },
  { id: 'energy',      lo: 'Calm',        hi: 'Energetic' },
  { id: 'exclusive',   lo: 'Accessible',  hi: 'Exclusive' },
  { id: 'technical',   lo: 'Human',       hi: 'Technical' }
];

PG.TIERS = [
  { id: 'value',   name: 'Value',       exclusive: 15, note: 'Price-led. Clarity and boldness beat refinement.' },
  { id: 'mid',     name: 'Mid-market',  exclusive: 40, note: 'Quality at a fair price. Friendly and confident.' },
  { id: 'premium', name: 'Premium',     exclusive: 65, note: 'Restraint, craft details, more whitespace.' },
  { id: 'luxury',  name: 'Luxury',      exclusive: 90, note: 'Scarcity signals: few colours, high-contrast type, slow pacing.' }
];

PG.STRATEGIES = [
  { id: 'conform', name: 'Conform',  note: 'Use the category codes so buyers recognise you instantly.' },
  { id: 'balance', name: 'Balance',  note: 'Use one or two category codes and own something distinct.' },
  { id: 'disrupt', name: 'Disrupt',  note: 'Break the category codes on purpose to stand out.' }
];

/* Business model / function. `boost` and `penalize` are direction tags. */
PG.FUNCTIONS = [
  { id: 'b2b-enterprise', name: 'B2B · Enterprise', shift: { playful: -12, technical: 10, exclusive: 8 },
    boost: ['trust', 'systematic', 'b2b', 'precise'], penalize: ['kids', 'raw', 'neon'],
    focus: ['website', 'webinar', 'banner', 'email', 'identity'],
    note: 'Long sales cycles and committee buying. Credibility, clarity and a scalable system matter most.' },
  { id: 'b2b-smb', name: 'B2B · Small business', shift: { playful: 8, exclusive: -10 },
    boost: ['friendly', 'clear', 'b2b', 'digital'], penalize: ['luxury'],
    focus: ['website', 'app', 'social', 'email', 'banner'],
    note: 'Owners buy fast and alone. Friendly, plain-spoken and obviously useful.' },
  { id: 'b2c-app', name: 'Consumer app / service', shift: { playful: 10, progressive: 10, energy: 8 },
    boost: ['digital', 'friendly', 'bold', 'social'], penalize: ['traditional'],
    focus: ['app', 'story', 'social', 'website', 'billboard'],
    note: 'The product is the brand. It has to work at icon size and in motion.' },
  { id: 'd2c-product', name: 'D2C product brand', shift: { playful: 6, energy: 6 },
    boost: ['packaging', 'social', 'crafted', 'bold'], penalize: ['b2b'],
    focus: ['packaging', 'social', 'story', 'website', 'email'],
    note: 'Packaging and social feeds are the store shelf. It needs instant stand-out and unboxing moments.' },
  { id: 'marketplace', name: 'Marketplace / platform', shift: { playful: 6, exclusive: -8 },
    boost: ['friendly', 'flexible', 'clear', 'warm'], penalize: ['ornate'],
    focus: ['website', 'app', 'social', 'billboard', 'email'],
    note: 'Must hold thousands of other people\'s photos and listings. The brand frames, it doesn\'t compete.' },
  { id: 'retail-venue', name: 'Retail / venue / F&B', shift: { energy: 6, technical: -10 },
    boost: ['signage', 'warm', 'packaging', 'retro', 'crafted'], penalize: ['mono'],
    focus: ['packaging', 'poster', 'social', 'billboard', 'card'],
    note: 'Physical first: signage, menus, bags, uniforms. It has to read from across the street.' },
  { id: 'service', name: 'Professional service', shift: { playful: -10, exclusive: 8 },
    boost: ['trust', 'editorial', 'human', 'clear'], penalize: ['neon', 'kids'],
    focus: ['website', 'card', 'webinar', 'email', 'identity'],
    note: 'You sell expertise and judgement. The identity should feel considered and senior.' },
  { id: 'mission', name: 'Mission / public good', shift: { exclusive: -20, playful: 0 },
    boost: ['accessible', 'human', 'trust', 'clear'], penalize: ['luxury'],
    focus: ['website', 'poster', 'social', 'email', 'webinar'],
    note: 'Has to be accessible to everyone and credible with funders at the same time.' },
  { id: 'hardware', name: 'Hardware / device', shift: { technical: 12, progressive: 8 },
    boost: ['technical', 'precise', 'premium', 'minimal'], penalize: ['raw'],
    focus: ['packaging', 'website', 'billboard', 'story', 'identity'],
    note: 'Product photography and packaging carry the brand. Precision is the promise.' }
];

/* Audiences. `minBody` and `contrast` are accessibility floors the QA checks enforce. */
PG.AUDIENCES = [
  { id: 'genz', name: 'Gen Z (born 1997–2012)', shift: { playful: 18, energy: 18, progressive: 15, exclusive: -5 },
    boost: ['expressive', 'bold', 'social', 'raw', 'neon'], penalize: ['corporate', 'traditional'],
    minBody: 16, contrast: 4.5,
    note: 'Mobile-first, vertical video, meme literacy. Rewards raw, self-aware and expressive work.' },
  { id: 'millennial', name: 'Millennials (born 1981–1996)', shift: { playful: 6, progressive: 6 },
    boost: ['friendly', 'crafted', 'clear', 'warm', 'digital'], penalize: [],
    minBody: 16, contrast: 4.5,
    note: 'Grew up with the friendly-geometric D2C wave. Values convenience, design quality and ethics.' },
  { id: 'genx', name: 'Gen X (born 1965–1980)', shift: { playful: -6, energy: -6 },
    boost: ['clear', 'trust', 'editorial'], penalize: ['neon'],
    minBody: 16, contrast: 4.5,
    note: 'Pragmatic and sceptical of hype. Prefers clear value and plain language.' },
  { id: 'senior', name: 'Older adults (60+)', shift: { energy: -20, progressive: -14, playful: -6 },
    boost: ['clear', 'trust', 'accessible', 'warm'], penalize: ['raw', 'neon', 'dense', 'mono'],
    minBody: 18, contrast: 7,
    note: 'Larger type, high contrast (aim for WCAG AAA 7:1), big tap targets, no low-contrast greys.' },
  { id: 'parents', name: 'Parents & families', shift: { playful: 10, energy: -4, technical: -10 },
    boost: ['warm', 'friendly', 'trust', 'clear'], penalize: ['dark', 'raw'],
    minBody: 16, contrast: 4.5,
    note: 'Time-poor and safety-minded. Warmth plus reassurance.' },
  { id: 'kids', name: 'Children (5–12)', shift: { playful: 35, energy: 25, exclusive: -20 },
    boost: ['kids', 'playful', 'bold', 'friendly'], penalize: ['luxury', 'dark', 'mono', 'minimal'],
    minBody: 18, contrast: 4.5,
    note: 'Big shapes, saturated primaries, rounded forms, very large, legible type.' },
  { id: 'enterprise', name: 'Enterprise buyers (C-suite, IT, procurement)', shift: { playful: -20, technical: 14, exclusive: 10 },
    boost: ['trust', 'systematic', 'b2b', 'precise'], penalize: ['kids', 'raw', 'neon'],
    minBody: 16, contrast: 4.5,
    note: 'Risk-averse committees. Signals of scale, security and maturity.' },
  { id: 'developers', name: 'Developers & technical users', shift: { technical: 30, progressive: 14, playful: -4 },
    boost: ['technical', 'mono', 'dark', 'precise', 'raw'], penalize: ['ornate', 'luxury'],
    minBody: 16, contrast: 4.5,
    note: 'Allergic to marketing gloss. Dark UIs, monospace, real code and honest specs.' },
  { id: 'smb', name: 'Small-business owners', shift: { playful: 6, exclusive: -14 },
    boost: ['friendly', 'clear', 'bold', 'digital'], penalize: ['luxury'],
    minBody: 16, contrast: 4.5,
    note: 'Want to feel the product is made for them and not for a corporation.' },
  { id: 'affluent', name: 'Affluent / luxury buyers', shift: { exclusive: 35, energy: -15, playful: -8 },
    boost: ['luxury', 'editorial', 'crafted', 'minimal', 'premium'], penalize: ['neon', 'kids', 'bold'],
    minBody: 16, contrast: 4.5,
    note: 'Restraint reads as confidence. Fewer colours, more space, impeccable type.' },
  { id: 'mass', name: 'Mass market / value seekers', shift: { exclusive: -30, energy: 15 },
    boost: ['bold', 'friendly', 'clear', 'retro'], penalize: ['minimal', 'luxury'],
    minBody: 16, contrast: 4.5,
    note: 'Instant recognition at shelf and on screen. Big type, strong colour blocks.' },
  { id: 'creatives', name: 'Creatives & design-literate', shift: { progressive: 20, playful: 10 },
    boost: ['expressive', 'editorial', 'raw', 'systematic', 'flexible'], penalize: ['corporate'],
    minBody: 16, contrast: 4.5,
    note: 'Will notice the type pairing. Reward a clear point of view and craft.' },
  { id: 'active', name: 'Active & health-conscious', shift: { energy: 22, playful: 4 },
    boost: ['kinetic', 'bold', 'natural'], penalize: ['ornate'],
    minBody: 16, contrast: 4.5,
    note: 'Motion, performance cues and real bodies. High energy without clutter.' },
  { id: 'clinicians', name: 'Clinicians & specialists', shift: { technical: 20, playful: -25, energy: -10 },
    boost: ['clear', 'precise', 'trust', 'systematic'], penalize: ['neon', 'raw', 'kids'],
    minBody: 16, contrast: 4.5,
    note: 'Evidence and clarity first. Data-dense layouts are welcome if they\'re well organised.' },
  { id: 'students', name: 'Students & learners', shift: { playful: 15, energy: 10, exclusive: -15 },
    boost: ['friendly', 'bold', 'digital', 'social'], penalize: ['luxury'],
    minBody: 16, contrast: 4.5,
    note: 'Encouraging, social and gamified. Clear progress cues.' },
  { id: 'citizens', name: 'General public / citizens', shift: { exclusive: -25, playful: -4 },
    boost: ['accessible', 'clear', 'trust', 'human'], penalize: ['luxury', 'neon', 'raw'],
    minBody: 18, contrast: 7,
    note: 'Everyone, including low vision and low literacy. Follow WCAG and plain-language rules.' }
];

/* Industries. Copy keys feed every mockup template. */
PG.INDUSTRIES = [
  {
    id: 'finance', name: 'Banking & Fintech', group: 'Finance',
    axes: { playful: 30, progressive: 60, energy: 40, exclusive: 45, technical: 65 },
    convention: ['institutional', 'neofintech', 'modernist'],
    adjacent: ['gradient', 'darkprecision', 'swiss', 'friendlyGeo'],
    avoid: ['handmade', 'memphis', 'riso', 'kidsJoy'],
    codes: [
      'Blue and navy dominate: they signal stability and are the most common category colour.',
      'Challengers broke the code with one saturated signature hue (Monzo coral, Cash App green).',
      'Geometric or grotesk sans with tabular numerals that read well in statements.',
      'Engraved guilloché patterns borrowed from banknotes signal security.'
    ],
    packaging: 'card', sampleName: 'Lumen',
    copy: {
      tagline: 'Banking that moves at your speed',
      headline: 'Your money, finally on your side.',
      sub: 'Instant payments, smart savings pots and zero hidden fees, all in one account.',
      cta: 'Open an account', cta2: 'See how it works',
      nav: ['Personal', 'Business', 'Savings', 'Help'],
      features: [['Instant transfers', 'Send money in seconds, 24/7.'], ['Savings pots', 'Set goals and round up spare change.'], ['Real-time alerts', 'Know every time you spend.']],
      stat: '4.8 ★ from 120k reviews',
      app: { greeting: 'Good morning, Sam', metricLabel: 'Total balance', metric: '£4,182.60', items: [['Coffee Lab', '−£3.40'], ['Salary', '+£2,850.00'], ['Holiday pot', '£640.00']], tabs: ['Home', 'Pay', 'Save', 'You'] },
      product: { name: 'Debit', detail: 'Contactless · Visa', claim: 'Metal edition' },
      social: 'We just dropped fees on international transfers to zero.',
      story: 'Split the bill in one tap',
      webinar: 'The future of everyday banking', speaker: ['Priya Shah', 'Head of Product'],
      email: 'Your savings just earned 4.1% AER',
      poster: ['Money Talks', 'Live Q&A with our founders', 'Thu 14 Nov · 18:30'],
      billboard: 'Fees? Never heard of them.'
    }
  },
  {
    id: 'insurance', name: 'Insurance & Wealth', group: 'Finance',
    axes: { playful: 28, progressive: 40, energy: 30, exclusive: 45, technical: 45 },
    convention: ['institutional', 'warmHuman', 'clinical'],
    adjacent: ['friendlyGeo', 'modernist', 'swiss', 'civic', 'heritage'],
    avoid: ['cyber', 'y2k', 'brutalist', 'riso'],
    codes: [
      'Protective metaphors: umbrellas, shields, hands, houses.',
      'Blues, greens and warm reds; human photography of life moments.',
      'Insurtech challengers use friendly illustration and plain-language copy.'
    ],
    packaging: 'card', sampleName: 'Harbor',
    copy: {
      tagline: 'Cover that keeps up with life',
      headline: 'Insurance that actually pays out.',
      sub: 'Get a quote in 90 seconds, claim in an app, and get paid in days, not months.',
      cta: 'Get a quote', cta2: 'How claims work',
      nav: ['Home', 'Car', 'Life', 'Claims'],
      features: [['90-second quotes', 'No forms, no phone calls.'], ['Fast claims', 'Most claims settled in 3 days.'], ['Flexible cover', 'Pause or change anytime.']],
      stat: 'Trusted by 2.1M households',
      app: { greeting: 'Hi Jordan', metricLabel: 'Policies active', metric: '3', items: [['Home cover', 'Renews May'], ['Car cover', 'Active'], ['Claim #2214', 'Paid']], tabs: ['Home', 'Policies', 'Claims', 'Help'] },
      product: { name: 'Member', detail: 'Policy 2214-883', claim: 'Covered' },
      social: 'Your claim, paid before your coffee gets cold.',
      story: 'Quote in 90 seconds',
      webinar: 'Protecting what matters in 2026', speaker: ['Daniel Okafor', 'Chief Actuary'],
      email: 'Your policy renewal is ready',
      poster: ['Peace of Mind', 'Free home-safety workshop', 'Sat 9 Nov · 10:00'],
      billboard: 'Life happens. We\'ve got it.'
    }
  },
  {
    id: 'health', name: 'Healthcare & Medtech', group: 'Health',
    axes: { playful: 25, progressive: 55, energy: 30, exclusive: 35, technical: 55 },
    convention: ['clinical', 'institutional', 'warmHuman'],
    adjacent: ['softWellness', 'swiss', 'scientific', 'civic'],
    avoid: ['cyber', 'brutalist', 'y2k', 'maximal'],
    codes: [
      'Blues, teals and greens for cleanliness and calm; white space as hygiene.',
      'Humanist sans for warmth and legibility; accessibility is non-negotiable.',
      'Shift from clinical coldness to warm, consumer-grade care experiences.'
    ],
    packaging: 'box', sampleName: 'Kindred Health',
    copy: {
      tagline: 'Care that comes to you',
      headline: 'See a doctor today, without the waiting room.',
      sub: 'Same-day video appointments, prescriptions delivered and your records in one place.',
      cta: 'Book an appointment', cta2: 'Our clinicians',
      nav: ['Services', 'Clinicians', 'Pricing', 'Support'],
      features: [['Same-day visits', 'Seen in under 2 hours.'], ['Prescriptions', 'Delivered to your door.'], ['One record', 'Every result in one place.']],
      stat: '96% would recommend us',
      app: { greeting: 'Hello, Alex', metricLabel: 'Next appointment', metric: 'Today 14:20', items: [['Dr. Mensah', 'Video call'], ['Blood test', 'Results ready'], ['Refill', 'Shipped']], tabs: ['Home', 'Care', 'Records', 'Me'] },
      product: { name: 'Daily D3', detail: '60 capsules · 25µg', claim: 'Clinically dosed' },
      social: 'Your health questions, answered by real doctors.',
      story: 'See a GP in 2 hours',
      webinar: 'Preventive care in the age of AI', speaker: ['Dr. Lena Ortiz', 'Chief Medical Officer'],
      email: 'Your test results are ready',
      poster: ['Know Your Numbers', 'Free blood-pressure checks', 'Every Sat · 9–13'],
      billboard: 'A doctor in your pocket.'
    }
  },
  {
    id: 'wellness', name: 'Wellness & Mental health', group: 'Health',
    axes: { playful: 45, progressive: 50, energy: 20, exclusive: 45, technical: 20 },
    convention: ['softWellness', 'organic', 'quietLux'],
    adjacent: ['warmHuman', 'japaneseMinimal', 'friendlyGeo', 'handmade'],
    avoid: ['cyber', 'brutalist', 'darkprecision', 'kinetic'],
    codes: [
      'Soft pastels, warm neutrals and rounded organic forms.',
      'Character illustration (Headspace) or calm nature imagery.',
      'Slow motion, generous spacing, gentle second-person copy.'
    ],
    packaging: 'jar', sampleName: 'Stillwater',
    copy: {
      tagline: 'Ten minutes for a calmer mind',
      headline: 'Breathe easier, sleep deeper.',
      sub: 'Guided meditations, sleep stories and gentle routines built with psychologists.',
      cta: 'Start for free', cta2: 'Explore sessions',
      nav: ['Meditate', 'Sleep', 'Move', 'For work'],
      features: [['Daily calm', '10-minute guided sessions.'], ['Sleep stories', 'Drift off in minutes.'], ['Mood check-ins', 'See your patterns.']],
      stat: '30M minutes of calm last month',
      app: { greeting: 'Welcome back, Mia', metricLabel: 'Mindful streak', metric: '12 days', items: [['Morning reset', '10 min'], ['Deep sleep', '25 min'], ['Breathwork', '5 min']], tabs: ['Today', 'Explore', 'Sleep', 'Profile'] },
      product: { name: 'Calm Balm', detail: '50 ml · lavender & cedar', claim: 'For slower evenings' },
      social: 'Take a breath. This one\'s for you.',
      story: 'Your 5-minute reset',
      webinar: 'Burnout-proofing your team', speaker: ['Dr. Hana Ito', 'Clinical Psychologist'],
      email: 'Your evening wind-down is ready',
      poster: ['Slow Sunday', 'Sound bath & breathwork', 'Sun 17 Nov · 11:00'],
      billboard: 'Pause. Breathe. Continue.'
    }
  },
  {
    id: 'beauty', name: 'Beauty & Personal care', group: 'Consumer',
    axes: { playful: 45, progressive: 60, energy: 40, exclusive: 65, technical: 25 },
    convention: ['quietLux', 'softWellness', 'editorialLux'],
    adjacent: ['y2k', 'organic', 'japaneseMinimal', 'artdeco', 'maximal'],
    avoid: ['civic', 'scientific', 'institutional'],
    codes: [
      'Two codes: clinical-minimal (white, sans, ingredient %) and sensorial-luxe (warm neutrals, serifs).',
      'Millennial pink and skin-tone neutrals; Gen Z shift towards chrome and saturated play.',
      'Packaging is the hero, built for the shelf and the unboxing video.'
    ],
    packaging: 'bottle', sampleName: 'Maison Rue',
    copy: {
      tagline: 'Skin first. Everything else second.',
      headline: 'Skincare that does less, better.',
      sub: 'Five essentials, dermatologist-tested, refillable and made without the fillers.',
      cta: 'Shop the ritual', cta2: 'Find your routine',
      nav: ['Skincare', 'Body', 'Refills', 'Journal'],
      features: [['Clean formulas', '98% naturally derived.'], ['Refillable', 'Glass bottles, 70% less plastic.'], ['Derm-tested', 'For sensitive skin.']],
      stat: '200k five-star reviews',
      app: { greeting: 'Hi Noor', metricLabel: 'Your routine', metric: '3 steps', items: [['Gentle cleanser', 'AM · PM'], ['Vitamin C serum', 'AM'], ['Barrier cream', 'PM']], tabs: ['Shop', 'Routine', 'Refill', 'Me'] },
      product: { name: 'Serum No.3', detail: '30 ml · 10% Niacinamide', claim: 'Brightening' },
      social: 'The serum that sold out three times.',
      story: 'Your skin, but better',
      webinar: 'The science of skin barriers', speaker: ['Dr. Amara Cole', 'Dermatologist'],
      email: 'Your refill is on its way',
      poster: ['The Ritual', 'Pop-up studio opening', 'Fri 22 Nov · Soho'],
      billboard: 'Less on. More you.'
    }
  },
  {
    id: 'fashion', name: 'Fashion & Luxury', group: 'Consumer',
    axes: { playful: 35, progressive: 70, energy: 50, exclusive: 80, technical: 25 },
    convention: ['editorialLux', 'quietLux', 'magazine'],
    adjacent: ['brutalist', 'y2k', 'darkLuxury', 'maximal', 'japaneseMinimal'],
    avoid: ['clinical', 'civic', 'kidsJoy', 'institutional'],
    codes: [
      'The 2010s "blanding": houses moved to bold black sans-serif wordmarks (Saint Laurent, Burberry, Celine).',
      'Black, white and one signature colour; campaign photography carries the emotion.',
      'Monograms and heritage marks return as status symbols.'
    ],
    packaging: 'tote', sampleName: 'Atelier Noor',
    copy: {
      tagline: 'Collection 07',
      headline: 'Autumn/Winter 26',
      sub: 'Tailoring cut in Italy from deadstock wool. Limited quantities.',
      cta: 'Discover', cta2: 'Book an appointment',
      nav: ['Women', 'Men', 'Atelier', 'Stores'],
      features: [['Made in Italy', 'Family-run ateliers.'], ['Deadstock wool', 'Zero new fibre.'], ['Lifetime repairs', 'Free, forever.']],
      stat: 'Paris · Milan · Tokyo',
      app: { greeting: 'Bonsoir, Léa', metricLabel: 'New in', metric: '24 pieces', items: [['Wool coat', '€1,450'], ['Silk shirt', '€390'], ['Leather tote', '€980']], tabs: ['New', 'Shop', 'Atelier', 'Bag'] },
      product: { name: 'Atelier', detail: 'AW26', claim: 'Paris' },
      social: 'AW26. Now in stores.',
      story: 'The coat of the season',
      webinar: 'Craft, heritage and the new luxury', speaker: ['Léa Moreau', 'Creative Director'],
      email: 'Private preview: AW26',
      poster: ['AW26', 'Runway show', 'Paris · 02.03.26'],
      billboard: 'AW26'
    }
  },
  {
    id: 'food', name: 'Food & Beverage (CPG)', group: 'Consumer',
    axes: { playful: 65, progressive: 50, energy: 65, exclusive: 30, technical: 15 },
    convention: ['handmade', 'retro', 'organic', 'maximal'],
    adjacent: ['friendlyGeo', 'memphis', 'riso', 'heritage'],
    avoid: ['darkprecision', 'scientific', 'institutional', 'civic'],
    codes: [
      'Appetite appeal first: warm reds, oranges and yellows.',
      'Challengers lead with personality: hand-drawn type, long-form honest copy (Oatly), maximal colour.',
      'Heritage and "made by hand" cues for premium; bold flat graphics for mass.'
    ],
    packaging: 'can', sampleName: 'Good Field',
    copy: {
      tagline: 'Honest food, loudly made',
      headline: 'Big flavour. Nothing fake.',
      sub: 'Small-batch sodas made with real fruit, half the sugar and zero apologies.',
      cta: 'Shop the range', cta2: 'Find a stockist',
      nav: ['Drinks', 'Snacks', 'Stockists', 'Our story'],
      features: [['Real fruit', 'Pressed, never from concentrate.'], ['Half the sugar', 'All of the taste.'], ['Infinitely recyclable', 'Aluminium cans only.']],
      stat: 'In 4,000 stores',
      app: { greeting: 'Hey Chris', metricLabel: 'Next delivery', metric: 'Friday', items: [['Yuzu soda ×12', '£18'], ['Blood orange ×12', '£18'], ['Mixed box', '£32']], tabs: ['Shop', 'Subscribe', 'Recipes', 'Me'] },
      product: { name: 'Yuzu Soda', detail: '330 ml · 40 kcal', claim: 'Sparkling' },
      social: 'New flavour. Old-school ingredients.',
      story: 'Taste the new Yuzu',
      webinar: 'Building a challenger CPG brand', speaker: ['Tom Becker', 'Co-founder'],
      email: 'Fresh batch, fresh flavours',
      poster: ['Taste Test', 'Free samples all weekend', 'Sat–Sun · Borough Market'],
      billboard: 'Thirsty? Good.'
    }
  },
  {
    id: 'restaurant', name: 'Restaurants & QSR', group: 'Consumer',
    axes: { playful: 60, progressive: 45, energy: 60, exclusive: 35, technical: 15 },
    convention: ['retro', 'warmHuman', 'heritage'],
    adjacent: ['handmade', 'maximal', 'riso', 'artdeco', 'friendlyGeo'],
    avoid: ['scientific', 'darkprecision', 'civic'],
    codes: [
      'Appetite colours (red, orange, yellow) and warm browns.',
      'Retro revival: chunky soft type and 70s warmth (Burger King 2021).',
      'Systems must work on menus, bags, uniforms and app tiles.'
    ],
    packaging: 'pouch', sampleName: 'Smash & Co',
    copy: {
      tagline: 'Burgers worth the trip',
      headline: 'Smashed fresh. Served fast.',
      sub: 'Dry-aged beef, potato buns and fries cooked in beef dripping. Order ahead.',
      cta: 'Order now', cta2: 'See the menu',
      nav: ['Menu', 'Locations', 'Delivery', 'Jobs'],
      features: [['Never frozen', 'Dry-aged beef, daily.'], ['Ready in 8 min', 'Or it\'s on us.'], ['Local suppliers', 'Within 50 miles.']],
      stat: '42 locations',
      app: { greeting: 'Hungry, Max?', metricLabel: 'Reward points', metric: '1,240', items: [['Double Smash', '£9.50'], ['Dripping fries', '£4.00'], ['Shake', '£4.50']], tabs: ['Order', 'Menu', 'Rewards', 'Me'] },
      product: { name: 'Double Smash', detail: 'Bag · Order #482', claim: 'Hot & fresh' },
      social: 'Two patties. Zero regrets.',
      story: 'Free fries this Friday',
      webinar: 'Scaling a restaurant brand', speaker: ['Rosa Alvarez', 'Founder'],
      email: 'Your burger is on the grill',
      poster: ['Smash Friday', 'Free fries with every burger', 'Fri · all day'],
      billboard: 'Smash hit.'
    }
  },
  {
    id: 'hospitality', name: 'Hospitality & Travel', group: 'Consumer',
    axes: { playful: 35, progressive: 45, energy: 35, exclusive: 65, technical: 20 },
    convention: ['quietLux', 'artdeco', 'heritage'],
    adjacent: ['warmHuman', 'japaneseMinimal', 'editorialLux', 'organic', 'retro'],
    avoid: ['cyber', 'brutalist', 'scientific'],
    codes: [
      'Sense of place: local materials, colours and stories.',
      'Boutique hotels lean on serif wordmarks, warm neutrals and Art Deco or mid-century nostalgia.',
      'Booking platforms favour friendly, flexible systems that frame user photos (Airbnb).'
    ],
    packaging: 'ticket', sampleName: 'The Linden',
    copy: {
      tagline: 'A slower kind of stay',
      headline: 'Your room with a view is waiting.',
      sub: 'Forty rooms above the old harbour, a rooftop bar and breakfast until noon.',
      cta: 'Book your stay', cta2: 'View rooms',
      nav: ['Rooms', 'Dining', 'Spa', 'Offers'],
      features: [['Harbour views', 'From every room.'], ['Rooftop bar', 'Open until late.'], ['Late checkout', 'Until 2pm.']],
      stat: 'Condé Nast Gold List 2026',
      app: { greeting: 'Welcome, Ines', metricLabel: 'Your stay', metric: '12–15 Dec', items: [['Room 304', 'Sea view'], ['Dinner', '20:00'], ['Spa', 'Booked']], tabs: ['Stay', 'Dine', 'Explore', 'Me'] },
      product: { name: 'Room key', detail: 'Room 304 · 12–15 Dec', claim: 'Welcome' },
      social: 'Sunset hour on the rooftop.',
      story: 'Weekend escape, 20% off',
      webinar: 'Designing memorable guest experiences', speaker: ['Marco Ricci', 'General Manager'],
      email: 'Your stay is confirmed',
      poster: ['Harbour Nights', 'Live jazz on the roof', 'Every Thu · 19:00'],
      billboard: 'Stay a little longer.'
    }
  },
  {
    id: 'realestate', name: 'Real estate & Architecture', group: 'Built environment',
    axes: { playful: 20, progressive: 55, energy: 30, exclusive: 60, technical: 60 },
    convention: ['architectural', 'swiss', 'quietLux'],
    adjacent: ['modernist', 'darkLuxury', 'editorialLux', 'japaneseMinimal'],
    avoid: ['kidsJoy', 'memphis', 'y2k', 'handmade'],
    codes: [
      'Monochrome palettes and thin, wide sans or classic serifs.',
      'Architectural photography and plan drawings as graphic devices.',
      'Precise grids and generous margins mirror the built work.'
    ],
    packaging: 'card', sampleName: 'Fieldhouse',
    copy: {
      tagline: 'Residences on the river',
      headline: 'Light, space and the river at your door.',
      sub: 'Fifty-two apartments designed around natural light. Completion spring 2027.',
      cta: 'Register interest', cta2: 'Download brochure',
      nav: ['Residences', 'Location', 'Design', 'Contact'],
      features: [['Floor-to-ceiling glass', 'South-facing living.'], ['Private gardens', '2,000 m² landscaped.'], ['Net-zero ready', 'Heat pumps throughout.']],
      stat: 'From £685,000',
      app: { greeting: 'Hello, Ravi', metricLabel: 'Saved homes', metric: '4', items: [['Apt 3.02', '2 bed · 84 m²'], ['Apt 5.01', '3 bed · 118 m²'], ['Viewing', 'Sat 11:00']], tabs: ['Homes', 'Map', 'Saved', 'Me'] },
      product: { name: 'Residence', detail: 'Apartment 5.01', claim: 'Welcome home' },
      social: 'Morning light in Residence 5.01.',
      story: 'Book a private viewing',
      webinar: 'The future of urban living', speaker: ['Elena Novak', 'Lead Architect'],
      email: 'New residences released',
      poster: ['Open House', 'Show apartment viewings', 'Sat 30 Nov · 10–16'],
      billboard: 'Live by the light.'
    }
  },
  {
    id: 'saas', name: 'SaaS & B2B software', group: 'Technology',
    axes: { playful: 45, progressive: 75, energy: 50, exclusive: 35, technical: 65 },
    convention: ['friendlyGeo', 'gradient', 'swiss'],
    adjacent: ['darkprecision', 'warmHuman', 'dynamicSystem', 'neofintech'],
    avoid: ['heritage', 'artdeco', 'handmade'],
    codes: [
      'Friendly geometric sans, bright accent on white, product screenshots as hero.',
      'Collins (Dropbox, Mailchimp) and Pentagram (Slack) set the "human SaaS" playbook with illustration and colour.',
      'Mesh gradients and dark mode signal sophistication at the top end.'
    ],
    packaging: 'box', sampleName: 'Relay',
    copy: {
      tagline: 'Work that flows',
      headline: 'Ship projects, not status updates.',
      sub: 'Plan, track and automate your team\'s work in one fast, friendly workspace.',
      cta: 'Start free trial', cta2: 'Book a demo',
      nav: ['Product', 'Solutions', 'Pricing', 'Docs'],
      features: [['Automations', 'Kill busywork with rules.'], ['Real-time docs', 'Write together, instantly.'], ['Insights', 'See what\'s blocked.']],
      stat: 'Used by 18,000 teams',
      app: { greeting: 'Morning, Kai', metricLabel: 'Due this week', metric: '7 tasks', items: [['Launch plan', 'In review'], ['Q4 roadmap', 'On track'], ['Bug bash', 'Blocked']], tabs: ['Home', 'Projects', 'Inbox', 'Me'] },
      product: { name: 'Welcome kit', detail: 'Team edition', claim: 'Let\'s ship' },
      social: 'Your Monday standup, automated.',
      story: 'New: AI project summaries',
      webinar: 'Scaling ops without scaling headcount', speaker: ['Jamie Lee', 'VP Operations'],
      email: 'Your weekly team digest',
      poster: ['Relay Conf 26', 'The future of work', '12–13 Mar · Lisbon'],
      billboard: 'Fewer meetings. More shipping.'
    }
  },
  {
    id: 'ai', name: 'AI & Deep tech', group: 'Technology',
    axes: { playful: 25, progressive: 90, energy: 45, exclusive: 55, technical: 90 },
    convention: ['darkprecision', 'gradient', 'scientific'],
    adjacent: ['swiss', 'dynamicSystem', 'architectural', 'cyber'],
    avoid: ['heritage', 'handmade', 'retro', 'kidsJoy'],
    codes: [
      'Dark interfaces, glowing gradients and particle fields: the "intelligence" cliché.',
      'Counter-trend: warm, humanist, editorial AI brands that feel trustworthy rather than sci-fi.',
      'Monospace details and diagrams signal real engineering.'
    ],
    packaging: 'box', sampleName: 'Cortex',
    copy: {
      tagline: 'Intelligence you can trust',
      headline: 'Models that reason over your data, safely.',
      sub: 'Deploy private AI agents on your own infrastructure with full audit trails.',
      cta: 'Request access', cta2: 'Read the research',
      nav: ['Platform', 'Research', 'Security', 'Company'],
      features: [['Private by default', 'Runs in your VPC.'], ['Grounded answers', 'Every claim cited.'], ['Audit trails', 'SOC 2 Type II.']],
      stat: '99.95% uptime SLA',
      app: { greeting: 'Workspace · Acme', metricLabel: 'Agent runs today', metric: '18,442', items: [['Claims triage', '98.2% acc.'], ['Contract review', 'Running'], ['Support agent', 'Healthy']], tabs: ['Agents', 'Data', 'Evals', 'Settings'] },
      product: { name: 'Edge Node', detail: 'Inference appliance', claim: 'On-prem AI' },
      social: 'We open-sourced our evaluation suite.',
      story: 'New model, 3× faster',
      webinar: 'Deploying AI agents in regulated industries', speaker: ['Dr. Wei Zhang', 'Chief Scientist'],
      email: 'Your workspace is ready',
      poster: ['Inference Summit', 'Talks, demos, research', '6 Feb · San Francisco'],
      billboard: 'Think bigger. Safely.'
    }
  },
  {
    id: 'devtools', name: 'Developer tools', group: 'Technology',
    axes: { playful: 35, progressive: 80, energy: 45, exclusive: 40, technical: 95 },
    convention: ['darkprecision', 'cyber', 'brutalist'],
    adjacent: ['swiss', 'scientific', 'gradient', 'riso'],
    avoid: ['quietLux', 'artdeco', 'softWellness'],
    codes: [
      'Dark mode, monospace and terminal motifs are table stakes.',
      'Code on the homepage beats illustrations of code.',
      'Developer swag culture: stickers, tees, zines with indie-print aesthetics.'
    ],
    packaging: 'tote', sampleName: 'Forge',
    copy: {
      tagline: 'Deploy on push',
      headline: 'From git push to global in 30 seconds.',
      sub: 'Preview every branch, roll back instantly and scale to zero when idle.',
      cta: 'Start deploying', cta2: 'Read the docs',
      nav: ['Docs', 'Pricing', 'Changelog', 'Blog'],
      features: [['Preview deploys', 'Every PR, its own URL.'], ['Edge runtime', '300+ locations.'], ['Instant rollback', 'One click, zero downtime.']],
      stat: '1.2B requests / day',
      app: { greeting: 'forge-cli · main', metricLabel: 'Deploys today', metric: '214', items: [['api-gateway', 'Ready · 31s'], ['web-app', 'Building'], ['docs', 'Ready · 12s']], tabs: ['Deploys', 'Logs', 'Usage', 'Team'] },
      product: { name: 'Forge', detail: '$ forge deploy', claim: 'ship it' },
      social: 'v4.0 is live. Builds are 2× faster.',
      story: 'Changelog: v4.0',
      webinar: 'Zero-downtime deploys at scale', speaker: ['Ana Silva', 'Staff Engineer'],
      email: 'Deployment succeeded: web-app',
      poster: ['Forge Hack Night', 'Pizza, prizes, prod deploys', 'Fri 8 Nov · 19:00'],
      billboard: 'git push. done.'
    }
  },
  {
    id: 'edu', name: 'Education & Edtech', group: 'Public & social',
    axes: { playful: 55, progressive: 55, energy: 50, exclusive: 25, technical: 40 },
    convention: ['friendlyGeo', 'civic', 'kidsJoy'],
    adjacent: ['warmHuman', 'swiss', 'bauhaus', 'riso', 'magazine'],
    avoid: ['darkLuxury', 'quietLux', 'editorialLux'],
    codes: [
      'Universities: heritage crests and serifs. Edtech: friendly, gamified colour (Duolingo).',
      'Highly legible type; progress and achievement visuals.',
      'Systems must serve students, parents and institutions at once.'
    ],
    packaging: 'box', sampleName: 'Brightpath',
    copy: {
      tagline: 'Learn anything, a little every day',
      headline: 'Five minutes a day to fluent.',
      sub: 'Bite-sized lessons, real conversations and streaks that keep you coming back.',
      cta: 'Start learning', cta2: 'For schools',
      nav: ['Courses', 'Schools', 'Teachers', 'Pricing'],
      features: [['Bite-sized lessons', '5 minutes a day.'], ['Live tutors', 'Practice for real.'], ['Certificates', 'Recognised by 400 employers.']],
      stat: '8M learners in 140 countries',
      app: { greeting: 'Keep going, Ella!', metricLabel: 'Daily streak', metric: '47 days', items: [['Spanish · Unit 4', '80%'], ['Speaking practice', 'New'], ['Weekly quiz', 'Due today']], tabs: ['Learn', 'Practice', 'League', 'Me'] },
      product: { name: 'Starter Kit', detail: 'Ages 8–12 · 40 cards', claim: 'Learn by playing' },
      social: 'Day 1 vs. day 100 of learning Spanish.',
      story: 'Your streak is on fire',
      webinar: 'AI tutors in the classroom', speaker: ['Prof. Grace Kim', 'Head of Learning Science'],
      email: 'You\'re 3 lessons from Level 5',
      poster: ['Open Day', 'Meet tutors, try a lesson', 'Sat 16 Nov · 10–15'],
      billboard: 'Learn like you play.'
    }
  },
  {
    id: 'media', name: 'Media & Entertainment', group: 'Culture',
    axes: { playful: 55, progressive: 70, energy: 75, exclusive: 45, technical: 35 },
    convention: ['maximal', 'magazine', 'dynamicSystem'],
    adjacent: ['brutalist', 'editorialLux', 'riso', 'y2k', 'kinetic'],
    avoid: ['clinical', 'institutional'],
    codes: [
      'Identity as a flexible container for endless content: frames, duotones, type systems.',
      'Spotify\'s duotones (Collins, 2015) and Channel 4\'s fragmented logo (2015) show content-led systems.',
      'Motion and sound are part of the identity.'
    ],
    packaging: 'ticket', sampleName: 'Wavelength',
    copy: {
      tagline: 'Stories worth staying up for',
      headline: 'Your next obsession starts here.',
      sub: 'Original series, live shows and podcasts, curated by people with taste.',
      cta: 'Start watching', cta2: 'Browse originals',
      nav: ['Series', 'Films', 'Live', 'Podcasts'],
      features: [['Originals', '60 new titles this year.'], ['Live events', 'Front row, from your sofa.'], ['Offline', 'Download anything.']],
      stat: '40M monthly listeners',
      app: { greeting: 'Tonight for you', metricLabel: 'Continue watching', metric: 'S2 · E5', items: [['Night Shift', 'New episode'], ['The Archive', 'Podcast'], ['Live: Glastonbury', '20:00']], tabs: ['Home', 'Search', 'Library', 'Live'] },
      product: { name: 'Live', detail: 'Admit one · Row F', claim: 'Premiere' },
      social: 'Season 2 drops Friday.',
      story: 'Watch the trailer',
      webinar: 'The future of the creator economy', speaker: ['Zoe Martin', 'Head of Content'],
      email: 'New this week: 6 picks for you',
      poster: ['Night Shift', 'Season 2 premiere', '15.11 · Only on Wavelength'],
      billboard: 'Stay up. It\'s worth it.'
    }
  },
  {
    id: 'gaming', name: 'Gaming & Esports', group: 'Culture',
    axes: { playful: 70, progressive: 85, energy: 90, exclusive: 40, technical: 70 },
    convention: ['cyber', 'y2k', 'kinetic'],
    adjacent: ['maximal', 'memphis', 'brutalist', 'darkprecision'],
    avoid: ['quietLux', 'institutional', 'clinical', 'heritage'],
    codes: [
      'Dark backgrounds with neon accents, angular display type and HUD details.',
      'Esports teams use aggressive mascots and monochrome marks for merch.',
      'Motion, glitch and pixel nostalgia for indie titles.'
    ],
    packaging: 'box', sampleName: 'Nightfall',
    copy: {
      tagline: 'Drop in. Stand out.',
      headline: 'Season 9 is live. Claim your rank.',
      sub: 'New map, new weapons and cross-play on every platform. Squad up tonight.',
      cta: 'Play free', cta2: 'Watch trailer',
      nav: ['Game', 'Esports', 'Store', 'News'],
      features: [['Cross-play', 'PC, console, mobile.'], ['Ranked seasons', 'Climb every 10 weeks.'], ['Creator tools', 'Build your own maps.']],
      stat: '12M players online',
      app: { greeting: 'GG, Vex', metricLabel: 'Rank', metric: 'Diamond II', items: [['Win rate', '58%'], ['K/D', '2.4'], ['Battle pass', 'Tier 64']], tabs: ['Play', 'Squad', 'Store', 'Profile'] },
      product: { name: 'Nightfall', detail: 'Collector\'s edition', claim: 'Season 9' },
      social: 'New map. New meta. Go.',
      story: 'Season 9 trailer',
      webinar: 'Building a community-first game studio', speaker: ['Kenji Mori', 'Game Director'],
      email: 'Your Season 9 rewards are ready',
      poster: ['Grand Finals', 'Live at the arena', '23.11 · Berlin'],
      billboard: 'Respawn stronger.'
    }
  },
  {
    id: 'sports', name: 'Sports & Fitness', group: 'Consumer',
    axes: { playful: 45, progressive: 65, energy: 90, exclusive: 40, technical: 50 },
    convention: ['kinetic', 'maximal', 'swiss'],
    adjacent: ['darkLuxury', 'bauhaus', 'brutalist', 'ecoOptimist'],
    avoid: ['quietLux', 'softWellness', 'heritage'],
    codes: [
      'Condensed, italic or extra-bold type that implies speed.',
      'High-contrast black with one volt or orange accent; athletes in motion.',
      'Data and performance metrics as graphics (Strava-style).'
    ],
    packaging: 'box', sampleName: 'Stride',
    copy: {
      tagline: 'Run your own race',
      headline: 'Faster starts here.',
      sub: 'Carbon-plated trainers, coached plans and a community that shows up at 6am.',
      cta: 'Shop running', cta2: 'Join a club',
      nav: ['Shoes', 'Apparel', 'Training', 'Clubs'],
      features: [['Carbon plate', '4% energy return.'], ['Coached plans', '5k to marathon.'], ['Run clubs', '120 cities.']],
      stat: 'Worn in 32 marathon PBs',
      app: { greeting: 'Ready, Lewis?', metricLabel: 'This week', metric: '42.3 km', items: [['Tempo run', '8 km · 4:12/km'], ['Long run', '21 km'], ['Recovery', '5 km']], tabs: ['Train', 'Clubs', 'Shop', 'Me'] },
      product: { name: 'Stride X2', detail: 'UK 9 · Volt', claim: 'Race day' },
      social: 'New PB? Tag us.',
      story: 'Race-day ready',
      webinar: 'Training science for amateur athletes', speaker: ['Coach Mia Torres', 'Head Coach'],
      email: 'Your marathon plan starts Monday',
      poster: ['City 10K', 'Run the streets', 'Sun 1 Dec · 08:00'],
      billboard: 'No finish line.'
    }
  },
  {
    id: 'auto', name: 'Automotive & Mobility', group: 'Technology',
    axes: { playful: 25, progressive: 75, energy: 55, exclusive: 60, technical: 75 },
    convention: ['darkLuxury', 'darkprecision', 'modernist'],
    adjacent: ['kinetic', 'swiss', 'gradient', 'architectural'],
    avoid: ['handmade', 'kidsJoy', 'memphis', 'riso'],
    codes: [
      'Flat, two-dimensional wordmarks replaced chrome badges in the 2020s (Kia, VW, BMW).',
      'Wide, extended type, dark palettes and dramatic product lighting.',
      'EV brands borrow tech-company minimalism.'
    ],
    packaging: 'card', sampleName: 'Volta',
    copy: {
      tagline: 'Electric, elevated',
      headline: 'Zero emissions. Zero compromise.',
      sub: '520 km of range, 10–80% in 18 minutes and a cabin built from recycled materials.',
      cta: 'Configure yours', cta2: 'Book a test drive',
      nav: ['Models', 'Charging', 'Ownership', 'Stores'],
      features: [['520 km range', 'WLTP certified.'], ['18-min charging', '10–80% on 350 kW.'], ['Over-the-air', 'Gets better every month.']],
      stat: '0–100 km/h in 3.9 s',
      app: { greeting: 'Volta One', metricLabel: 'Battery', metric: '82% · 426 km', items: [['Climate', '21°C'], ['Charging', 'Scheduled 01:00'], ['Doors', 'Locked']], tabs: ['Car', 'Climate', 'Charge', 'Map'] },
      product: { name: 'Key card', detail: 'Volta One · NFC', claim: 'Tap to drive' },
      social: 'The new Volta One. Silent. Swift.',
      story: 'Book a test drive',
      webinar: 'The road to software-defined vehicles', speaker: ['Lars Eriksen', 'CTO'],
      email: 'Your Volta One is in production',
      poster: ['Volta One', 'World premiere', '10.01.27 · Geneva'],
      billboard: 'Silence is fast.'
    }
  },
  {
    id: 'energy', name: 'Energy & Climate', group: 'Built environment',
    axes: { playful: 40, progressive: 75, energy: 45, exclusive: 30, technical: 55 },
    convention: ['ecoOptimist', 'organic', 'institutional'],
    adjacent: ['swiss', 'friendlyGeo', 'scientific', 'dynamicSystem'],
    avoid: ['darkLuxury', 'y2k', 'artdeco'],
    codes: [
      'Greens and blues were the default; climate tech now uses sunny optimism over doom.',
      'Data visualisation and maps as hero imagery.',
      'Avoid greenwashing clichés (leaves, globes); show real impact.'
    ],
    packaging: 'box', sampleName: 'Solace Energy',
    copy: {
      tagline: 'Power from the sun, priced for everyone',
      headline: 'Cleaner power. Lower bills.',
      sub: 'Rooftop solar and home batteries, installed in a day and paid back in six years.',
      cta: 'Get a free survey', cta2: 'See savings',
      nav: ['Solar', 'Batteries', 'Heat pumps', 'Business'],
      features: [['Installed in a day', 'Certified local crews.'], ['Save 70%', 'On average energy bills.'], ['25-year warranty', 'Panels and labour.']],
      stat: '1.4 GWh generated this year',
      app: { greeting: 'Sunny today, Ade', metricLabel: 'Generated today', metric: '18.6 kWh', items: [['Battery', '94%'], ['Exported', '6.2 kWh'], ['Saved this month', '£84']], tabs: ['Home', 'Energy', 'Savings', 'Me'] },
      product: { name: 'Home Battery', detail: '13.5 kWh', claim: 'Store the sun' },
      social: 'This roof paid for itself in 6 years.',
      story: 'How much could you save?',
      webinar: 'Electrifying the home', speaker: ['Dr. Ade Bello', 'Head of Energy Systems'],
      email: 'Your solar report: October',
      poster: ['Solar Saturday', 'Free home energy surveys', 'Sat 23 Nov · 10–16'],
      billboard: 'Your roof is a power plant.'
    }
  },
  {
    id: 'retail', name: 'Retail & E-commerce', group: 'Consumer',
    axes: { playful: 55, progressive: 55, energy: 70, exclusive: 30, technical: 25 },
    convention: ['maximal', 'friendlyGeo', 'retro'],
    adjacent: ['neofintech', 'memphis', 'warmHuman', 'brutalist', 'y2k'],
    avoid: ['scientific', 'institutional'],
    codes: [
      'Price and promotion clarity: bold sale graphics and strong colour blocks.',
      'Shopping bags, store signage and e-commerce tiles all have to carry the brand.',
      'D2C wave: friendly sans, pastel blocks, lifestyle photography.'
    ],
    packaging: 'box', sampleName: 'Parcel',
    copy: {
      tagline: 'Good stuff, delivered tomorrow',
      headline: 'Everything for home, half the hassle.',
      sub: 'Curated homeware, free next-day delivery and 100-day returns.',
      cta: 'Shop new in', cta2: 'Today\'s deals',
      nav: ['New', 'Home', 'Kitchen', 'Sale'],
      features: [['Next-day delivery', 'Free over £30.'], ['100-day returns', 'No questions asked.'], ['Carbon-neutral', 'Every order offset.']],
      stat: '2M happy customers',
      app: { greeting: 'Hi Sofia', metricLabel: 'Order arriving', metric: 'Tomorrow', items: [['Linen throw', '£45'], ['Ceramic mug ×2', '£24'], ['Candle', '£18']], tabs: ['Shop', 'Search', 'Wishlist', 'Bag'] },
      product: { name: 'Mailer box', detail: 'Order #20871', claim: 'Open me' },
      social: 'The throw everyone is talking about.',
      story: 'Weekend sale: 30% off',
      webinar: 'Retail trends for 2027', speaker: ['Hannah Wu', 'Chief Merchant'],
      email: 'Your order has shipped',
      poster: ['Big Weekend Sale', 'Up to 50% off home', 'Fri–Sun'],
      billboard: 'Tomorrow is soon.'
    }
  },
  {
    id: 'industrial', name: 'Logistics & Industrial', group: 'Built environment',
    axes: { playful: 20, progressive: 45, energy: 50, exclusive: 30, technical: 80 },
    convention: ['modernist', 'institutional', 'swiss'],
    adjacent: ['kinetic', 'architectural', 'scientific', 'brutalist'],
    avoid: ['softWellness', 'y2k', 'memphis', 'quietLux'],
    codes: [
      'Strong, simple marks that survive trucks, tails, uniforms and signage (FedEx\'s hidden arrow).',
      'Primary colour systems for wayfinding and safety.',
      'Engineering precision: grids, diagrams, numerals.'
    ],
    packaging: 'box', sampleName: 'Axle Freight',
    copy: {
      tagline: 'Freight, on time, every time',
      headline: 'Move anything, anywhere, tracked to the minute.',
      sub: 'Road, rail and sea freight across 60 countries with live tracking and one invoice.',
      cta: 'Get a freight quote', cta2: 'Track a shipment',
      nav: ['Services', 'Network', 'Tracking', 'Careers'],
      features: [['Live tracking', 'Every pallet, every minute.'], ['60 countries', 'One contract.'], ['98.7% on time', 'Audited annually.']],
      stat: '3.2M shipments a year',
      app: { greeting: 'Shipment AX-4471', metricLabel: 'ETA', metric: '14:05 Thu', items: [['Rotterdam', 'Departed'], ['Antwerp', 'In transit'], ['Lyon', 'Pending']], tabs: ['Track', 'Ship', 'Docs', 'Account'] },
      product: { name: 'Fragile', detail: 'AX-4471 · 24 kg', claim: 'This way up' },
      social: 'Behind the scenes at our Rotterdam hub.',
      story: 'Track any shipment',
      webinar: 'Resilient supply chains in 2027', speaker: ['Mark Jansen', 'COO'],
      email: 'Shipment AX-4471 delivered',
      poster: ['Safety Week', 'Depot open day', 'Mon 18 Nov'],
      billboard: 'On time is a promise.'
    }
  },
  {
    id: 'professional', name: 'Legal & Professional services', group: 'Finance',
    axes: { playful: 15, progressive: 35, energy: 25, exclusive: 60, technical: 55 },
    convention: ['institutional', 'heritage', 'editorialLux'],
    adjacent: ['swiss', 'quietLux', 'modernist', 'magazine'],
    avoid: ['cyber', 'y2k', 'memphis', 'kidsJoy'],
    codes: [
      'Serif wordmarks of founders\' surnames, navy and burgundy.',
      'Modern firms simplify to sans monograms and editorial thought-leadership layouts.',
      'Restraint signals discretion and seniority.'
    ],
    packaging: 'tote', sampleName: 'Ashford & Vale',
    copy: {
      tagline: 'Counsel for what comes next',
      headline: 'Clear advice for complex decisions.',
      sub: 'Corporate, employment and IP law for founders and fast-growing companies.',
      cta: 'Speak to a partner', cta2: 'Our expertise',
      nav: ['Expertise', 'People', 'Insights', 'Contact'],
      features: [['Fixed fees', 'No surprise invoices.'], ['Partner-led', 'Senior on every matter.'], ['Sector depth', 'Tech, health, energy.']],
      stat: 'Ranked Tier 1 · Legal 500',
      app: { greeting: 'Client portal', metricLabel: 'Open matters', metric: '3', items: [['Series B docs', 'In review'], ['Trademark filing', 'Filed'], ['Employment policy', 'Draft ready']], tabs: ['Matters', 'Docs', 'Billing', 'Team'] },
      product: { name: 'Insights', detail: 'Annual review 2026', claim: 'Members' },
      social: '5 things founders get wrong in term sheets.',
      story: 'New: founder legal toolkit',
      webinar: 'What the AI Act means for your business', speaker: ['Catherine Hale', 'Managing Partner'],
      email: 'Your quarterly legal briefing',
      poster: ['Founders\' Breakfast', 'Legal pitfalls of scaling', 'Wed 4 Dec · 08:00'],
      billboard: 'Advice, clearly.'
    }
  },
  {
    id: 'nonprofit', name: 'Nonprofit & Public sector', group: 'Public & social',
    axes: { playful: 40, progressive: 50, energy: 55, exclusive: 15, technical: 35 },
    convention: ['civic', 'warmHuman', 'handmade'],
    adjacent: ['riso', 'friendlyGeo', 'ecoOptimist', 'magazine'],
    avoid: ['darkLuxury', 'quietLux', 'editorialLux'],
    codes: [
      'Accessibility first: GOV.UK and the US Web Design System set the public-sector bar.',
      'Campaign energy: bold type, protest-poster colour, real people.',
      'Charities avoid looking expensive; donor trust depends on it.'
    ],
    packaging: 'tote', sampleName: 'Common Ground',
    copy: {
      tagline: 'Every neighbour fed',
      headline: 'No one in our city should go hungry.',
      sub: 'We rescue surplus food and deliver 40,000 meals a week to families who need them.',
      cta: 'Donate now', cta2: 'Volunteer',
      nav: ['Our work', 'Get help', 'Volunteer', 'Donate'],
      features: [['40k meals a week', 'Delivered across the city.'], ['92p in every £1', 'Goes straight to food.'], ['2,000 volunteers', 'Join them.']],
      stat: '3.1M meals since 2019',
      app: { greeting: 'Thanks, Ruth', metricLabel: 'Your impact', metric: '312 meals', items: [['Monthly gift', '£15'], ['Next shift', 'Sat 10:00'], ['Food drive', '4 days left']], tabs: ['Home', 'Give', 'Volunteer', 'Me'] },
      product: { name: 'Volunteer', detail: 'Common Ground', claim: 'Feed the city' },
      social: '£10 = 25 meals. Simple as that.',
      story: 'Volunteer this weekend',
      webinar: 'Ending food waste in our cities', speaker: ['Ruth Adeyemi', 'Executive Director'],
      email: 'Look what you made possible',
      poster: ['Food Drive', 'Drop off non-perishables', 'Until 30 Nov'],
      billboard: 'Hunger has a fix.'
    }
  },
  {
    id: 'culture', name: 'Arts, Culture & Museums', group: 'Culture',
    axes: { playful: 45, progressive: 75, energy: 60, exclusive: 55, technical: 40 },
    convention: ['dynamicSystem', 'swiss', 'magazine', 'riso'],
    adjacent: ['brutalist', 'editorialLux', 'bauhaus', 'maximal', 'artdeco'],
    avoid: ['clinical', 'neofintech'],
    codes: [
      'Responsive identities: marks that change with the content (Whitney, MIT Media Lab).',
      'Typographic posters as the primary medium (The Public Theater, Paula Scher).',
      'Black-and-white systems that let the art provide colour.'
    ],
    packaging: 'ticket', sampleName: 'Kunsthal North',
    copy: {
      tagline: 'Art for the curious',
      headline: 'Light & Matter: new works from 40 artists.',
      sub: 'A season of installations, film and performance across three floors. Free on Fridays.',
      cta: 'Book tickets', cta2: 'What\'s on',
      nav: ['Exhibitions', 'Events', 'Visit', 'Shop'],
      features: [['Free Fridays', '17:00–21:00.'], ['Members', 'Skip the queue.'], ['Late openings', 'Every Thursday.']],
      stat: '1.1M visitors last year',
      app: { greeting: 'Welcome to Floor 2', metricLabel: 'Now showing', metric: 'Light & Matter', items: [['Audio guide', '42 stops'], ['Film screening', '18:00'], ['Café', 'Open']], tabs: ['Visit', 'Guide', 'Tickets', 'Me'] },
      product: { name: 'Admit one', detail: 'Light & Matter', claim: 'Floor 2' },
      social: 'Opening night. You had to be there.',
      story: 'Light & Matter: now open',
      webinar: 'Curating in the digital age', speaker: ['Ines Varga', 'Chief Curator'],
      email: 'Members\' preview: Light & Matter',
      poster: ['Light & Matter', 'New works from 40 artists', '15.11.26–02.03.27'],
      billboard: 'Look closer.'
    }
  },
  {
    id: 'kids', name: 'Kids & Family', group: 'Public & social',
    axes: { playful: 85, progressive: 50, energy: 75, exclusive: 15, technical: 20 },
    convention: ['kidsJoy', 'friendlyGeo', 'memphis'],
    adjacent: ['bauhaus', 'handmade', 'softWellness', 'retro'],
    avoid: ['darkLuxury', 'darkprecision', 'editorialLux', 'scientific'],
    codes: [
      'Saturated primaries, rounded thick type and characters.',
      'Parents are the buyers: add reassurance (safety, learning outcomes).',
      'Highly legible letterforms for early readers.'
    ],
    packaging: 'box', sampleName: 'Pip & Pals',
    copy: {
      tagline: 'Play that grows with them',
      headline: 'Big imaginations start here.',
      sub: 'Screen-free activity kits designed with teachers, delivered every month.',
      cta: 'Get your first box', cta2: 'For parents',
      nav: ['Boxes', 'Activities', 'Parents', 'Gifts'],
      features: [['Teacher-designed', 'Ages 3–8.'], ['Screen-free', 'Hands-on play.'], ['Safety-tested', 'EN71 certified.']],
      stat: 'Loved by 200k families',
      app: { greeting: 'Hi Pip!', metricLabel: 'Stars earned', metric: '128 ★', items: [['Rocket build', 'Done!'], ['Colour mixing', 'Next'], ['Story time', 'New']], tabs: ['Play', 'Learn', 'Stars', 'Grown-ups'] },
      product: { name: 'Space Box', detail: 'Ages 4–8 · 6 activities', claim: 'Blast off!' },
      social: 'This month: build your own rocket.',
      story: 'Unbox the Space Box',
      webinar: 'Learning through play', speaker: ['Sarah Doyle', 'Early Years Lead'],
      email: 'Your Space Box ships today',
      poster: ['Family Fun Day', 'Crafts, games & music', 'Sun 24 Nov · 11:00'],
      billboard: 'Play more. Wonder more.'
    }
  },
  {
    id: 'crypto', name: 'Web3 & Crypto', group: 'Finance',
    axes: { playful: 50, progressive: 95, energy: 70, exclusive: 50, technical: 85 },
    convention: ['cyber', 'gradient', 'darkprecision'],
    adjacent: ['y2k', 'brutalist', 'dynamicSystem', 'neofintech'],
    avoid: ['heritage', 'handmade', 'quietLux'],
    codes: [
      'Dark mode, neon gradients, 3D and generative art.',
      'Post-2022 shift towards fintech-style trust signals: security, regulation, clarity.',
      'Community-first: memes, merch and collectible culture.'
    ],
    packaging: 'card', sampleName: 'Meridian',
    copy: {
      tagline: 'Own your money',
      headline: 'Self-custody, made simple.',
      sub: 'Buy, hold and stake digital assets in a wallet only you control. Regulated in the EU.',
      cta: 'Get the wallet', cta2: 'Security audits',
      nav: ['Wallet', 'Earn', 'Learn', 'Security'],
      features: [['Self-custody', 'Your keys, your coins.'], ['Audited', '3 independent audits.'], ['Low fees', '0.1% per trade.']],
      stat: '$2.4B secured',
      app: { greeting: 'gm, Ash', metricLabel: 'Portfolio', metric: '$12,408.22', items: [['ETH', '+3.2%'], ['BTC', '+1.1%'], ['Staking', '4.6% APY']], tabs: ['Wallet', 'Swap', 'Earn', 'Settings'] },
      product: { name: 'Cold Card', detail: 'Hardware wallet · NFC', claim: 'Your keys' },
      social: 'Not your keys, not your coins.',
      story: 'Stake in 3 taps',
      webinar: 'Regulation and the future of digital assets', speaker: ['Omar Haddad', 'Head of Policy'],
      email: 'Your staking rewards arrived',
      poster: ['Meridian Summit', 'Builders, founders, researchers', '18–19 Feb · Lisbon'],
      billboard: 'Your money. Your rules.'
    }
  }
];

PG.byId = function (list, id) { return list.find((x) => x.id === id); };
