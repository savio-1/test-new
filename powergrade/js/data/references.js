/* Powergrade reference library: documented identity work from world-class studios and designers.
   Each entry was checked against trade press (Dezeen, Creative Review, Design Week, It's Nice That,
   Brand New, The Dieline) or the agency/brand's own page during the October 2026 survey.
     conf: 'verified'   confirmed by trade press or the agency/brand
           'likely'     secondary sources only, or only partly confirmed
           'unverified' attribution not confirmed; listed for its visual traits only
   `dirs` links a reference to the direction(s) it informs. `ind` links it to industries.
   No brand imagery is stored: the tool links out to a search for each project. */
window.PG = window.PG || {};

PG.REFERENCES = [
  // Finance
  { id: 'mastercard-2016', brand: 'Mastercard', by: 'Pentagram (Michael Bierut, Luke Hayman)', year: 2016, ind: ['finance'], dirs: ['modernist', 'institutional'], traits: 'Interlocking circles reduced to flat primaries; wordmark later dropped from the symbol.', conf: 'verified' },
  { id: 'chase-1960', brand: 'Chase', by: 'Chermayeff & Geismar', year: 1960, ind: ['finance'], dirs: ['institutional', 'modernist'], traits: 'Abstract octagon: one of the first non-literal bank symbols.', conf: 'verified' },
  { id: 'citi-1999', brand: 'Citi', by: 'Pentagram (Paula Scher)', year: 1999, ind: ['finance'], dirs: ['institutional'], traits: 'Lowercase wordmark with an umbrella arc over the t; blue and red.', conf: 'verified' },
  { id: 'deutsche-bank-1974', brand: 'Deutsche Bank', by: 'Anton Stankowski', year: 1974, ind: ['finance'], dirs: ['institutional', 'swiss'], traits: 'Slash in a square: growth within a secure frame. Pure constructivist geometry.', conf: 'verified' },
  { id: 'monzo', brand: 'Monzo', by: 'In-house; later system refresh by Ragged Edge', year: 2016, ind: ['finance'], dirs: ['neofintech'], traits: 'Hot-coral card colour that started as a prototype and became the brand.', conf: 'likely' },
  { id: 'wise-2021', brand: 'Wise (ex-TransferWise)', by: 'Ragged Edge', year: 2021, ind: ['finance'], dirs: ['neofintech'], traits: 'Bright green, a flag-arrow symbol and big confident type.', conf: 'verified' },
  { id: 'robinhood-2024', brand: 'Robinhood', by: 'Porto Rocha', year: 2024, ind: ['finance', 'crypto'], dirs: ['neofintech', 'darkprecision'], traits: 'Lime "Robin Neon" on black, simplified feather, 3D abstract imagery.', conf: 'verified' },
  { id: 'coinbase-2021', brand: 'Coinbase', by: 'Moniker', year: 2021, ind: ['crypto', 'finance'], dirs: ['gradient', 'cyber'], traits: 'Blue circle with square cut-out, custom Coinbase Sans.', conf: 'verified' },
  { id: 'phantom', brand: 'Phantom', by: 'Bakken & Baeck (type by F37)', year: null, ind: ['crypto'], dirs: ['friendlyGeo', 'y2k'], traits: 'Friendly ghost mascot and soft violet palette for a wallet.', conf: 'verified' },
  // Insurance & professional
  { id: 'hartford-2025', brand: 'The Hartford', by: 'Pentagram (with Solve)', year: 2025, ind: ['insurance'], dirs: ['institutional', 'heritage'], traits: 'Redrawn stag icon; black, claret and fuchsia palette.', conf: 'verified' },
  { id: 'mckinsey-2019', brand: 'McKinsey & Company', by: 'Wolff Olins', year: 2019, ind: ['professional'], dirs: ['institutional', 'editorialLux'], traits: 'Bower serif, deep blue, old-meets-new contrast.', conf: 'verified' },
  { id: 'pwc-2010', brand: 'PwC', by: 'Wolff Olins', year: 2010, ind: ['professional'], dirs: ['institutional', 'warmHuman'], traits: 'Lowercase wordmark in ITC Charter over warm overlapping colour blocks.', conf: 'verified' },
  // Health & wellness
  { id: 'huma-2020', brand: 'Huma (ex-Medopad)', by: 'Koto', year: 2020, ind: ['health'], dirs: ['warmHuman', 'clinical'], traits: 'Warm human tone; hand-drawn illustration by Yu Nagaba.', conf: 'verified' },
  { id: 'heart-stroke-2016', brand: 'Heart & Stroke Foundation', by: 'Pentagram (Paula Scher)', year: 2016, ind: ['health', 'nonprofit'], dirs: ['clinical', 'civic'], traits: 'Charity identity combining heart and stroke symbols.', conf: 'likely' },
  { id: 'mind-2021', brand: 'Mind', by: 'DesignStudio', year: 2021, ind: ['wellness', 'nonprofit'], dirs: ['warmHuman', 'handmade'], traits: '"Fighting spirit" campaigning identity for a mental-health charity.', conf: 'verified' },
  { id: 'calm-charity-2021', brand: 'CALM (Campaign Against Living Miserably)', by: 'Studio Output (verbal by Reed Words)', year: 2021, ind: ['wellness', 'nonprofit'], dirs: ['handmade', 'maximal'], traits: 'Fixed bold typeface, bright palette, eye-catching campaign graphics.', conf: 'verified' },
  { id: 'headspace', brand: 'Headspace', by: 'In-house; refresh with Italic Studio, type by Colophon', year: 2023, ind: ['wellness'], dirs: ['softWellness'], traits: 'Orange sun dot, rounded characters, soft pastels.', conf: 'verified' },
  // Beauty & fashion
  { id: 'glossier', brand: 'Glossier', by: 'Hand-drawn G attributed to Leslie David studio', year: 2014, ind: ['beauty'], dirs: ['softWellness', 'quietLux'], traits: 'Millennial pink, minimal sans, bubble-wrap pouches.', conf: 'unverified' },
  { id: 'aesop', brand: 'Aesop', by: 'In-house under founder Dennis Paphitis', year: null, ind: ['beauty', 'wellness'], dirs: ['quietLux'], traits: 'Amber apothecary bottles, dense typographic labels, warm stores.', conf: 'likely' },
  { id: 'sol-de-janeiro-2024', brand: 'Sol de Janeiro', by: 'Pentagram London', year: 2024, ind: ['beauty'], dirs: ['maximal', 'retro'], traits: 'New logo and graphic system rooted in Brazilian heritage.', conf: 'verified' },
  { id: 'burberry-2018', brand: 'Burberry', by: 'Peter Saville (for Riccardo Tisci)', year: 2018, ind: ['fashion'], dirs: ['editorialLux'], traits: 'Bold black sans-serif caps plus a TB monogram pattern.', conf: 'verified' },
  { id: 'calvin-klein-2017', brand: 'Calvin Klein', by: 'Peter Saville (with Raf Simons)', year: 2017, ind: ['fashion'], dirs: ['editorialLux'], traits: 'All-caps wordmark echoing the 1970s original.', conf: 'verified' },
  { id: 'celine-2018', brand: 'Celine', by: 'Hedi Slimane', year: 2018, ind: ['fashion'], dirs: ['editorialLux'], traits: 'Accent dropped; 1930s modernist capitals.', conf: 'verified' },
  { id: 'rimowa-2018', brand: 'Rimowa', by: 'Bureau Borsche with Commission Studio', year: 2018, ind: ['fashion', 'hospitality'], dirs: ['editorialLux', 'darkLuxury'], traits: 'Blue pill dropped for a plain sans wordmark.', conf: 'verified' },
  { id: 'supreme', brand: 'Supreme', by: 'In-house, after Barbara Kruger', year: 1994, ind: ['fashion', 'retail'], dirs: ['brutalist', 'maximal'], traits: 'Futura Heavy Oblique, white on red box.', conf: 'verified' },
  // Food & restaurants
  { id: 'oatly-2014', brand: 'Oatly', by: 'Forsman & Bodenfors', year: 2014, ind: ['food'], dirs: ['handmade'], traits: 'Hand-drawn type, scribbles, long irreverent copy on the carton.', conf: 'verified', note: 'Agency verified; launch year 2014–15.' },
  { id: 'heinz-2020', brand: 'Heinz', by: 'Jones Knowles Ritchie', year: 2020, ind: ['food'], dirs: ['heritage', 'retro'], traits: 'First global masterbrand built on the keystone label shape.', conf: 'verified' },
  { id: 'pringles-2021', brand: 'Pringles', by: 'Jones Knowles Ritchie', year: 2021, ind: ['food'], dirs: ['maximal', 'friendlyGeo'], traits: 'Simplified Mr. P, bolder wordmark, bright flat packs.', conf: 'verified' },
  { id: 'pepsi-2023', brand: 'Pepsi', by: 'PepsiCo Design (Mauro Porcini)', year: 2023, ind: ['food'], dirs: ['maximal', 'retro'], traits: 'Bold type inside the globe, black zero-sugar cue, electric blue.', conf: 'verified' },
  { id: 'tropicana-2009', brand: 'Tropicana (cautionary)', by: 'Arnell Group', year: 2009, ind: ['food', 'retail'], dirs: [], traits: 'Generic redesign reverted after ~7 weeks and a ~20% unit drop. Don\'t erase recognisable assets.', conf: 'verified' },
  { id: 'burger-king-2021', brand: 'Burger King', by: 'Jones Knowles Ritchie', year: 2021, ind: ['restaurant'], dirs: ['retro'], traits: 'Return to the 1969–99 bun logo, custom Flame Sans, warm browns.', conf: 'verified' },
  { id: 'dunkin-2018', brand: 'Dunkin\'', by: 'Jones Knowles Ritchie', year: 2018, ind: ['restaurant'], dirs: ['retro', 'friendlyGeo'], traits: 'Name shortened; kept pink/orange and the 1973 rounded font.', conf: 'verified' },
  { id: 'taco-bell-2016', brand: 'Taco Bell', by: 'Lippincott with in-house', year: 2016, ind: ['restaurant'], dirs: ['maximal'], traits: 'Flattened purple bell and a simple sans wordmark.', conf: 'verified' },
  { id: 'shake-shack', brand: 'Shake Shack', by: 'Pentagram (Paula Scher)', year: 2004, ind: ['restaurant'], dirs: ['retro', 'swiss'], traits: 'Coney Island scale with refined letterforms.', conf: 'likely' },
  { id: 'starbucks-2011', brand: 'Starbucks', by: 'Lippincott', year: 2011, ind: ['restaurant', 'food'], dirs: ['heritage'], traits: 'Siren freed from the wordmark ring; single green.', conf: 'verified' },
  // Hospitality & travel
  { id: 'airbnb-2014', brand: 'Airbnb', by: 'DesignStudio', year: 2014, ind: ['hospitality'], dirs: ['warmHuman'], traits: '"Bélo" symbol of belonging, Rausch coral, people photography.', conf: 'verified' },
  { id: 'southwest-2014', brand: 'Southwest Airlines', by: 'Lippincott (with others)', year: 2014, ind: ['hospitality'], dirs: ['warmHuman', 'maximal'], traits: 'Heart symbol and bold multicolour livery.', conf: 'verified' },
  { id: 'american-airlines-1967', brand: 'American Airlines', by: 'Massimo Vignelli', year: 1967, ind: ['hospitality'], dirs: ['modernist', 'swiss'], traits: 'Helvetica AA with eagle; held for 46 years.', conf: 'verified' },
  { id: 'american-airlines-2013', brand: 'American Airlines', by: 'FutureBrand', year: 2013, ind: ['hospitality'], dirs: ['gradient'], traits: '"Flight Symbol" eagle/A/star, silver mica livery, flag-stripe tail.', conf: 'verified' },
  { id: 'lufthansa-1962', brand: 'Lufthansa', by: 'Otl Aicher with Gruppe E5 (HfG Ulm)', year: 1962, ind: ['hospitality', 'industrial'], dirs: ['swiss', 'modernist'], traits: 'Crane in a circle, yellow and blue, systematic manual.', conf: 'verified' },
  { id: 'warner-bros-2019', brand: 'Warner Bros.', by: 'Pentagram (Emily Oberman)', year: 2019, ind: ['media'], dirs: ['artdeco', 'heritage'], traits: 'Shield redrawn with a custom typeface family.', conf: 'verified' },
  { id: 'cassandre', brand: 'A.M. Cassandre posters', by: 'Adolphe Mouron Cassandre', year: 1935, ind: ['hospitality', 'culture'], dirs: ['artdeco'], traits: 'Art Deco travel posters (e.g. Normandie, 1935): monumental geometry, airbrushed light.', conf: 'likely' },
  // Real estate & architecture
  { id: 'halstead-2018', brand: 'Halstead', by: 'Pentagram', year: 2018, ind: ['realestate'], dirs: ['architectural', 'swiss'], traits: 'Dimensional H used as a window, pattern or arrow.', conf: 'verified' },
  { id: '443-greenwich', brand: '443 Greenwich', by: 'Pentagram', year: null, ind: ['realestate'], dirs: ['architectural', 'heritage'], traits: 'Geometric mark referencing the 1883 building.', conf: 'verified' },
  // Tech, SaaS, AI, devtools
  { id: 'slack-2019', brand: 'Slack', by: 'Pentagram (Michael Bierut) with in-house', year: 2019, ind: ['saas'], dirs: ['friendlyGeo'], traits: 'Octothorpe rebuilt from speech-bubble "pills"; reduced palette.', conf: 'verified' },
  { id: 'mailchimp-2018', brand: 'Mailchimp', by: 'Collins', year: 2018, ind: ['saas'], dirs: ['friendlyGeo'], traits: 'Cavendish Yellow, redrawn Freddie, Cooper Light, loose illustration.', conf: 'verified' },
  { id: 'dropbox-2017', brand: 'Dropbox', by: 'Collins', year: 2017, ind: ['saas'], dirs: ['friendlyGeo', 'maximal'], traits: 'Simplified box, bold colour pairings, creative-tool feel.', conf: 'verified' },
  { id: 'miro-2023', brand: 'Miro', by: 'AKQA', year: 2023, ind: ['saas'], dirs: ['friendlyGeo'], traits: 'Expanded colour and shape system, dynamic illustration.', conf: 'verified' },
  { id: 'squarespace-2018', brand: 'Squarespace', by: 'In-house with DIA and Optimo', year: 2018, ind: ['saas'], dirs: ['editorialLux', 'swiss'], traits: 'Monochrome system with custom Clarkson typeface.', conf: 'verified' },
  { id: 'zapier-2022', brand: 'Zapier', by: 'Instrument with in-house', year: 2022, ind: ['saas'], dirs: ['friendlyGeo'], traits: '"International orange", Degular type.', conf: 'verified' },
  { id: 'figma-2024', brand: 'Figma', by: 'In-house Brand Studio (Damien Correll); Figma Sans by Grilli Type', year: 2024, ind: ['saas'], dirs: ['maximal', 'friendlyGeo'], traits: 'Expressive colour and shape system with a custom grotesk.', conf: 'verified' },
  { id: 'asana-2015', brand: 'Asana', by: 'Moving Brands with in-house', year: 2015, ind: ['saas'], dirs: ['friendlyGeo', 'gradient'], traits: 'Three-dot "people" mark, coral gradient.', conf: 'likely' },
  { id: 'stripe', brand: 'Stripe', by: 'In-house Brand Design', year: 2020, ind: ['finance', 'saas'], dirs: ['gradient'], traits: 'Signature animated gradient refined over ~5 years; Söhne type.', conf: 'likely' },
  { id: 'linear', brand: 'Linear', by: 'In-house', year: null, ind: ['saas', 'devtools'], dirs: ['darkprecision'], traits: 'Near-black UI, subtle glows, tight Inter-style type.', conf: 'likely' },
  { id: 'github-2022', brand: 'GitHub (type system)', by: 'In-house with Degarism', year: 2022, ind: ['devtools'], dirs: ['darkprecision'], traits: 'Mona Sans / Hubot Sans variable grotesques, dark UI.', conf: 'verified' },
  { id: 'stack-overflow-2025', brand: 'Stack Overflow', by: 'Koto', year: 2025, ind: ['devtools'], dirs: ['friendlyGeo', 'brutalist'], traits: 'Reworked stack mark, community-led system.', conf: 'verified' },
  { id: 'openai-2025', brand: 'OpenAI', by: 'In-house with ABC Dinamo and Studio Dumbar', year: 2025, ind: ['ai'], dirs: ['scientific', 'quietLux'], traits: 'Refined Blossom mark, rounded geometric OpenAI Sans, restrained palette.', conf: 'verified' },
  { id: 'perplexity', brand: 'Perplexity', by: 'Smith & Diction', year: 2023, ind: ['ai'], dirs: ['darkprecision', 'scientific'], traits: 'Asterisk icon, FK Display wordmark, teal on off-black.', conf: 'likely' },
  { id: 'instagram-2016', brand: 'Instagram', by: 'In-house (Ian Spalter)', year: 2016, ind: ['media', 'saas'], dirs: ['gradient'], traits: 'Camera glyph over a warm-to-violet gradient.', conf: 'verified' },
  { id: 'google-2015', brand: 'Google', by: 'In-house', year: 2015, ind: ['saas', 'ai'], dirs: ['friendlyGeo'], traits: 'Geometric Product Sans, four primaries, the G mark.', conf: 'verified' },
  { id: 'ibm-1972', brand: 'IBM', by: 'Paul Rand', year: 1972, ind: ['ai', 'saas', 'industrial'], dirs: ['modernist'], traits: '8-bar striped wordmark: scan-line stripes suggest speed and dynamism.', conf: 'verified' },
  { id: 'nasa-1975', brand: 'NASA "worm"', by: 'Danne & Blackburn', year: 1975, ind: ['ai', 'industrial'], dirs: ['scientific', 'modernist'], traits: 'Continuous-stroke wordmark; Graphics Standards Manual (1974).', conf: 'verified' },
  // Media, culture, gaming
  { id: 'spotify-2015', brand: 'Spotify', by: 'Collins', year: 2015, ind: ['media'], dirs: ['maximal'], traits: 'Duotone photography, bold colour pairs, content-led system.', conf: 'likely' },
  { id: 'channel4-2015', brand: 'Channel 4', by: '4creative + DBLG; idents by Jonathan Glazer; type by Neville Brody', year: 2015, ind: ['media'], dirs: ['maximal', 'dynamicSystem'], traits: 'Fragmented 4 blocks, Horseferry and Chadwick typefaces.', conf: 'verified' },
  { id: 'netflix-2014', brand: 'Netflix', by: 'Gretel', year: 2014, ind: ['media'], dirs: ['maximal'], traits: '"The Stack" system: character photography with red/white splash.', conf: 'likely' },
  { id: 'guardian-2018', brand: 'The Guardian', by: 'In-house (Alex Breuer) with Commercial Type', year: 2018, ind: ['media'], dirs: ['magazine'], traits: 'Black masthead, Guardian Headline, tabloid format.', conf: 'verified' },
  { id: 'businessweek-2010', brand: 'Bloomberg Businessweek', by: 'Richard Turley (creative director)', year: 2010, ind: ['media'], dirs: ['magazine', 'brutalist'], traits: 'Loud, irreverent covers; collage; rule-breaking typography.', conf: 'verified' },
  { id: 'twitch-2019', brand: 'Twitch', by: 'Collins', year: 2019, ind: ['gaming', 'media'], dirs: ['y2k', 'cyber'], traits: 'Purple kept with bright layered tones and custom type.', conf: 'verified' },
  { id: 'whitney-2013', brand: 'Whitney Museum', by: 'Experimental Jetset', year: 2013, ind: ['culture'], dirs: ['dynamicSystem'], traits: '"Responsive W": a zigzag line that adapts to any format.', conf: 'verified' },
  { id: 'mit-media-lab-2014', brand: 'MIT Media Lab', by: 'Pentagram (Michael Bierut, Aron Fay)', year: 2014, ind: ['culture', 'edu', 'ai'], dirs: ['dynamicSystem', 'swiss'], traits: '7×7 grid generating marks for each research group.', conf: 'verified' },
  { id: 'mozilla-2017', brand: 'Mozilla', by: 'Johnson Banks', year: 2017, ind: ['devtools', 'nonprofit'], dirs: ['dynamicSystem', 'brutalist'], traits: 'moz://a wordmark, open design process, slab type.', conf: 'verified' },
  { id: 'tate-2000', brand: 'Tate', by: 'Wolff Olins', year: 2000, ind: ['culture'], dirs: ['dynamicSystem'], traits: 'Blurred, shifting logotype; refreshed by North in 2016.', conf: 'verified' },
  { id: 'met-2016', brand: 'The Met', by: 'Wolff Olins', year: 2016, ind: ['culture'], dirs: ['editorialLux', 'heritage'], traits: 'Ligatured serif "THE MET" in red.', conf: 'verified' },
  { id: 'public-theater-1994', brand: 'The Public Theater', by: 'Pentagram (Paula Scher)', year: 1994, ind: ['culture'], dirs: ['riso', 'magazine'], traits: 'Wood-type, street-poster typography at shouting scale.', conf: 'verified' },
  { id: 'stedelijk-2012', brand: 'Stedelijk Museum', by: 'Mevis & Van Deursen', year: 2012, ind: ['culture'], dirs: ['brutalist', 'dynamicSystem'], traits: 'Big S mark in Radim Peško\'s Union; criticised as hard to read.', conf: 'verified' },
  { id: 'va-1989', brand: 'V&A', by: 'Alan Fletcher (Pentagram)', year: 1989, ind: ['culture'], dirs: ['heritage', 'editorialLux'], traits: 'Bodoni V&A where the ampersand completes the A.', conf: 'verified' },
  { id: 'sfmoma-2016', brand: 'SFMOMA', by: 'In-house (Jennifer Sonderby)', year: 2016, ind: ['culture'], dirs: ['dynamicSystem', 'swiss'], traits: 'Stacked tri-split letterforms in modified FF Mark.', conf: 'verified' },
  { id: 'brooklyn-museum', brand: 'Brooklyn Museum', by: '2x4', year: 2004, ind: ['culture'], dirs: ['dynamicSystem'], traits: 'Flexible B mark in many patterns.', conf: 'likely', note: 'Agency verified; 2004 date unverified.' },
  // Sports & auto
  { id: 'formula1-2017', brand: 'Formula 1', by: 'Wieden+Kennedy London (Richard Turley)', year: 2017, ind: ['sports', 'auto'], dirs: ['kinetic'], traits: 'Speed-form logo and three custom typefaces.', conf: 'verified' },
  { id: 'premier-league-2016', brand: 'Premier League', by: 'DesignStudio', year: 2016, ind: ['sports'], dirs: ['kinetic', 'maximal'], traits: 'Cropped lion head, rounded sans, colours rotated every 3 years.', conf: 'verified' },
  { id: 'juventus-2017', brand: 'Juventus', by: 'Interbrand', year: 2017, ind: ['sports'], dirs: ['darkLuxury', 'swiss'], traits: 'Abstract J from the stripes and Scudetto shield.', conf: 'verified' },
  { id: 'peloton-2023', brand: 'Peloton', by: 'Mother Design + Uncommon Creative Studio', year: 2023, ind: ['sports', 'wellness'], dirs: ['kinetic', 'maximal'], traits: 'Palette moved to lime, lilac and ultramarine.', conf: 'verified' },
  { id: 'polestar-2017', brand: 'Polestar', by: 'Stockholm Design Lab', year: 2017, ind: ['auto'], dirs: ['darkLuxury', 'architectural'], traits: 'North Star symbol, minimal monochrome.', conf: 'verified' },
  { id: 'volvo-2021', brand: 'Volvo', by: 'In-house (Volvo Group + Volvo Cars)', year: 2021, ind: ['auto'], dirs: ['darkLuxury', 'modernist'], traits: 'Flat two-dimensional iron mark.', conf: 'verified' },
  { id: 'jaguar-2024', brand: 'Jaguar (controversial)', by: 'Accenture Song with Spark44', year: 2024, ind: ['auto'], dirs: ['maximal', 'y2k'], traits: '"Exuberant Modernism": leaper dropped, saturated colour. A live disruption case.', conf: 'verified' },
  { id: 'rolls-royce-2020', brand: 'Rolls-Royce Motor Cars', by: 'Pentagram (Marina Willer)', year: 2020, ind: ['auto', 'hospitality'], dirs: ['heritage', 'darkLuxury'], traits: 'Flat RR monogram, purple accent, Spirit of Ecstasy redrawn.', conf: 'verified' },
  { id: 'uber-2018', brand: 'Uber', by: 'Wolff Olins (Uber Move type with MCKL)', year: 2018, ind: ['auto', 'saas'], dirs: ['swiss', 'darkprecision'], traits: 'Plain wordmark, black and white, custom Uber Move.', conf: 'verified' },
  // Energy & industrial
  { id: 'bp-2000', brand: 'BP', by: 'Landor', year: 2000, ind: ['energy'], dirs: ['ecoOptimist'], traits: 'Helios sunburst in green and yellow, lowercase bp.', conf: 'verified' },
  { id: 'orsted-2017', brand: 'Ørsted (ex-DONG Energy)', by: 'Kontrapunkt with in-house', year: 2017, ind: ['energy'], dirs: ['organic', 'swiss'], traits: 'Functional Danish-modernist system.', conf: 'verified' },
  { id: 'patagonia', brand: 'Patagonia', by: 'Designer disputed', year: 1973, ind: ['retail', 'energy'], dirs: ['organic'], traits: 'Fitz Roy skyline in sunset bands; activist tone.', conf: 'unverified' },
  { id: 'fedex-1994', brand: 'FedEx', by: 'Landor (Lindon Leader)', year: 1994, ind: ['industrial'], dirs: ['modernist'], traits: 'Hidden arrow between E and x; purple and orange.', conf: 'verified' },
  { id: 'ups-1961', brand: 'UPS', by: 'Paul Rand', year: 1961, ind: ['industrial'], dirs: ['modernist'], traits: 'Shield with a bow-tied parcel.', conf: 'verified' },
  { id: 'dpd-2015', brand: 'DPDgroup', by: 'Lippincott', year: 2015, ind: ['industrial'], dirs: ['modernist', 'swiss'], traits: 'Red cube, lowercase type.', conf: 'verified' },
  { id: 'nyc-transit-1970', brand: 'NYCTA Graphics Standards Manual', by: 'Unimark (Massimo Vignelli, Bob Noorda)', year: 1970, ind: ['industrial', 'nonprofit'], dirs: ['swiss'], traits: 'Helvetica wayfinding, coloured route discs, black bands.', conf: 'verified' },
  // Retail
  { id: 'ebay-2012', brand: 'eBay', by: 'Lippincott', year: 2012, ind: ['retail'], dirs: ['friendlyGeo'], traits: 'Tidied four-colour wordmark.', conf: 'verified' },
  { id: 'amazon-2000', brand: 'Amazon', by: 'Turner Duckworth', year: 2000, ind: ['retail'], dirs: ['friendlyGeo'], traits: 'Smile/arrow from a to z.', conf: 'verified' },
  { id: 'walmart-2008', brand: 'Walmart', by: 'Lippincott', year: 2008, ind: ['retail'], dirs: ['friendlyGeo'], traits: 'Spark symbol and friendly blue/yellow.', conf: 'verified' },
  { id: 'kodak-2016', brand: 'Kodak', by: 'Work-Order', year: 2016, ind: ['retail', 'media'], dirs: ['retro'], traits: 'Revived 1970s K camera-shutter mark, yellow and red.', conf: 'verified' },
  // Education, kids, civic
  { id: 'duolingo-2019', brand: 'Duolingo', by: 'Johnson Banks with in-house; Feather Bold with Fontsmith', year: 2019, ind: ['edu'], dirs: ['friendlyGeo', 'kidsJoy'], traits: 'Owl simplified, bright green, chunky rounded type.', conf: 'verified' },
  { id: 'new-school-2015', brand: 'The New School', by: 'Pentagram (Paula Scher)', year: 2015, ind: ['edu'], dirs: ['magazine', 'swiss'], traits: 'Custom Neue typeface in three widths, black and white.', conf: 'verified' },
  { id: 'fisher-price-2020', brand: 'Fisher-Price', by: 'Pentagram (Emily Oberman)', year: 2020, ind: ['kids'], dirs: ['kidsJoy'], traits: 'Three-scallop red awning, lowercase, Let\'s Be Glyphs typeface.', conf: 'verified' },
  { id: 'nickelodeon-2023', brand: 'Nickelodeon', by: 'Roger (LA)', year: 2023, ind: ['kids', 'media'], dirs: ['kidsJoy', 'memphis'], traits: 'Revived orange splat.', conf: 'verified' },
  { id: 'govuk-2012', brand: 'GOV.UK', by: 'Government Digital Service (in-house)', year: 2012, ind: ['nonprofit'], dirs: ['civic'], traits: 'Black text, link blue, yellow focus, plain language. Design System from ~2018.', conf: 'likely' },
  { id: 'nyc-2007', brand: 'NYC (city brand)', by: 'Wolff Olins', year: 2007, ind: ['nonprofit'], dirs: ['civic', 'dynamicSystem'], traits: 'Bold geometric NYC wordmark with flexible colour.', conf: 'verified' },
  { id: 'melbourne-2009', brand: 'City of Melbourne', by: 'Landor', year: 2009, ind: ['nonprofit'], dirs: ['dynamicSystem'], traits: 'Faceted M filled with many patterns.', conf: 'verified' },
  { id: 'london-2012', brand: 'London 2012 Olympics', by: 'Wolff Olins', year: 2007, ind: ['sports', 'nonprofit'], dirs: ['maximal', 'brutalist'], traits: 'Jagged 2012 emblem, neon palette; divisive at launch.', conf: 'verified' },
  // Movements (design history)
  { id: 'bauhaus-1919', brand: 'Bauhaus school', by: 'Gropius, Bayer, Moholy-Nagy et al.', year: 1919, ind: ['culture', 'edu'], dirs: ['bauhaus'], traits: 'Primary shapes and colours; Bayer\'s universal alphabet.', conf: 'verified' },
  { id: 'munich-1972', brand: 'Munich 1972 Olympics', by: 'Otl Aicher', year: 1972, ind: ['sports'], dirs: ['bauhaus', 'swiss'], traits: 'Pastel rainbow palette, the original sports pictograms.', conf: 'likely' },
  { id: 'memphis-1981', brand: 'Memphis Group', by: 'Ettore Sottsass and collective', year: 1981, ind: ['culture', 'retail'], dirs: ['memphis'], traits: 'Laminate patterns, squiggles, clashing pastels.', conf: 'likely' },
  { id: 'muji-2002', brand: 'Muji', by: 'Kenya Hara (art director since 2002)', year: 2002, ind: ['retail'], dirs: ['japaneseMinimal', 'quietLux'], traits: '"Emptiness": unbleached kraft, wine red, no logo on products.', conf: 'verified' },
  { id: 'uniqlo-2006', brand: 'Uniqlo', by: 'Kashiwa Sato (Samurai)', year: 2006, ind: ['fashion', 'retail'], dirs: ['japaneseMinimal'], traits: 'Red squares with katakana and Latin wordmarks.', conf: 'verified' },
  { id: 'pinterest-2011', brand: 'Pinterest', by: 'Michael Deal & Juan Carlos Pagan', year: 2011, ind: ['media', 'retail'], dirs: ['warmHuman'], traits: 'Script P doubling as a pin; Pinterest red.', conf: 'verified' },
  { id: 'notion', brand: 'Notion', by: 'Illustrations by Roman Muradov', year: null, ind: ['saas'], dirs: ['handmade', 'japaneseMinimal'], traits: 'Black-and-white line illustration, monochrome UI.', conf: 'verified' }
];

/* Research the engine cites for colour conventions and accessibility floors. */
PG.RESEARCH = [
  { id: 'adobe-top100', title: 'Top-100 brands by colour', finding: 'Blue 33%, red 29%, black/greyscale 28%; 95% of brands use only one or two colours.', source: 'Adobe blog, "What brand colors can reveal about your business" (dataset also credited to Marketo)', conf: 'verified' },
  { id: 'reboot-top100', title: 'Colour by sector', finding: 'Top 100 brands: black 34%, blue 30%, red 30%. Blue leads in tech, red in automotive, black in luxury.', source: 'Reboot Online study (~2018), reported by CEO Today and others', conf: 'verified' },
  { id: 'singh-2006', title: 'Colour drives first judgement', finding: '62–90% of a product assessment is based on colour alone.', source: 'Singh, S. (2006). Impact of color on marketing. Management Decision 44(6), 783–789', conf: 'verified' },
  { id: 'wcag-143', title: 'WCAG 2.2 · 1.4.3 Contrast (AA)', finding: 'Text 4.5:1; large text (≥24px, or ≥18.5px bold) 3:1. Ratios are not rounded.', source: 'W3C', url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html', conf: 'verified' },
  { id: 'wcag-146', title: 'WCAG 2.2 · 1.4.6 Contrast (AAA)', finding: 'Text 7:1. Powergrade applies it as the floor for older adults and the general public.', source: 'W3C', url: 'https://www.w3.org/TR/WCAG22/', conf: 'verified' },
  { id: 'wcag-258', title: 'WCAG 2.2 · 2.5.8 Target size (AA)', finding: 'Pointer targets at least 24×24 CSS px.', source: 'W3C', url: 'https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html', conf: 'verified' },
  { id: 'wai-older', title: 'W3C WAI · Older users', finding: 'Reduced contrast sensitivity, colour perception, near focus, dexterity and memory. Points to WCAG.', source: 'W3C WAI', url: 'https://www.w3.org/WAI/older-users/', conf: 'verified' },
  { id: 'nia-senior', title: 'Senior-friendly web checklist', finding: 'Sans serif, medium/bold weight, mixed case for body, no condensed or all-caps body text.', source: 'NIA/NLM, "Making Your Web Site Senior Friendly"', conf: 'verified' },
  { id: 'tropicana', title: 'Distinctive assets matter', finding: 'Tropicana\'s 2009 generic redesign was reverted in ~7 weeks after a ~20% unit-sales drop.', source: 'Trade press coverage of the Arnell Group redesign', conf: 'verified' }
];

PG.refSearchUrl = function (r) {
  const q = [r.brand.replace(/\s*\(.*?\)\s*/g, ' '), r.by.split(/[(;,]/)[0], r.year || '', 'identity'].join(' ');
  return 'https://www.google.com/search?q=' + encodeURIComponent(q.replace(/\s+/g, ' ').trim());
};
