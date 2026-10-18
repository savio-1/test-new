# Powergrade Studio

An art-direction playground. Describe a client with four answers (industry, business model, audience, price tier) and Powergrade shortlists diverse art directions from a researched library, explains each pick with documented references, and renders every direction live across 12 touchpoints.

Open `index.html` in a browser. There's no build step and no server.

## Views

- **Flow**: a node canvas. Brief → Direction → Outputs. Tune colour, type, shape and imagery and every output updates live. Add, swap or remove output nodes.
- **Matrix** (Compare all): the top 4, 6 or 8 directions × any touchpoints, side by side.
- **Library**: every direction, industry, audience and reference, plus the research and the scoring method.

## Data

| File | Contents |
|---|---|
| `js/data/taxonomy.js` | 26 industries (category codes, conventions, adjacent and avoided directions, packaging type, realistic copy), 9 business models, 16 audiences (with accessibility floors), 4 tiers, 3 strategies |
| `js/data/directions.js` | 34 direction "genomes": personality axes, 2 palettes with colour roles, type pairing, shape, layout, imagery, mark, voice, tags, tiers, references |
| `js/data/references.js` | 113 documented identity projects (Pentagram, Collins, Wolff Olins, Koto, JKR, Landor, Lippincott and others) with a confidence label, plus colour and accessibility research |

References were checked against trade press or the studio's own pages in October 2026. No brand artwork is stored. Outputs are generated from parameters.

## Engine (`js/engine.js`)

Score = personality fit 34% + category fit 30% (depends on strategy: conform, balance or disrupt) + audience 16% + tier 12% + business model 8%. The shortlist uses maximal marginal relevance so routes differ. Tokens are corrected to each audience's WCAG floor (4.5:1 by default, 7:1 for older adults and the general public).

## Touchpoints (`js/templates.js`)

Website, mobile app, social post, story, ad banner, packaging (box, cans, bottle, jar, bag, card, tote or ticket, depending on industry), business card, poster, webinar slide, email, billboard and identity sheet.

## Publishing

`python3 tools/build_artifact.py` bundles everything into `dist/powergrade.html`, a single self-contained file.
