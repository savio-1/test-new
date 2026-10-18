# Powergrade Studio

An art-direction studio. Describe a client with four answers (industry, business model, audience, price tier). Powergrade then shortlists three diverse routes from a researched library and explains each pick with documented references. Every route is placed on real photo mockups and flat layouts that follow how leading identity studios design and present their work.

Run it over http (mockup photos and imported PSDs are read with fetch and IndexedDB):

```
cd powergrade && python3 -m http.server 8000   # then open http://localhost:8000
```

## Views

- **Canvas**: the brief, three routes and their applications as a grid. Click any card to edit it in the right-hand panel:
  - **Brief**: the four answers.
  - **Route**: direction, colour, type and photography.
  - **Application**: which mockup or flat piece, and which layout.
- **Present**: one route as a studio case-study page. It opens with a hero, then paces full-width and paired applications, then shows the identity system and the rationale.
- **Mockups**: the real-photo mockup library and where to find more.
  - Drop in a PSD and its smart objects are found automatically.
  - Drop in a JPG or PNG and click the four corners of each surface.
  - Imports stay in this browser.
- **Logo**: 61 parametric mark families, 49 curated marks, a grid constructor, 33 wordmark styles and lockup tests.
- **References**: directions, the 28 studios behind the layouts, every layout rendered in the current route, photography, industries, audiences, documented projects and the method.

## How an application is made

1. **Layout recipe** (`js/layouts/`): written in proportions of the canvas, after a named studio. Examples:
   - Pentagram's initial-as-symbol hero
   - All Purpose's hanging wordmark poster
   - Bedow's stripe-coded label
   - Wolff Olins' panel-in-photo ad

   Each recipe lists the directions it suits, so it becomes the default for them.
2. **Artwork** (`js/artwork.js`): the recipe is painted to a canvas with the route's colour, type, logo and graded photography.
3. **Composite** (`js/composite.js`): for a mockup, the artwork is warped into the photograph's marked surface with a perspective transform (WebGL2). It is multiplied into the photo's own light, so paper texture, folds and shadows show through. PSDs are re-composited layer by layer with their blend modes (`js/psdimport.js`, using ag-psd).

## Pieces

| File | Role |
|---|---|
| `js/data/taxonomy.js`, `directions.js`, `references.js` | Brief vocabulary, 34 direction genomes, 113 documented identity projects |
| `js/data/studios.js` + `research/studios/` | Notes on 28 studios: philosophy, type, colour, imagery, case-study pacing and layout recipes. `tools/build_studios.py` builds the data file from `research/studios-*.json` |
| `js/data/photos.js` + `assets/photos/` | 145 photos (Unsplash licence via Picsum, CC0 Wikimedia Commons), each with focal point, tone and credit |
| `js/data/mockups.js` + `assets/mockups/` | Bundled real-photo mockups with marked surfaces (licences that allow redistribution only) |
| `js/engine.js`, `js/imagery.js` | Scoring, diversity shortlist, tokens, WCAG checks; photo choice and grading |
| `js/logolab.js`, `js/brand.js` | Logo engine and the brand adapter every layout uses |
| `js/artwork.js`, `js/layouts/*.js` | Canvas drawing kit and layout recipes per application |
| `js/composite.js`, `js/psdimport.js`, `js/mocklib.js` | Perspective compositor, PSD import, mockup library service |
| `js/app/*.js` | UI: core shell and one file per view |

## Mockup licences

Most free mockup PSDs (Mockup Cloud, Unblast, Graphic Burger, Pixeden and others) may be used in client work but not redistributed. That is why they are imported rather than bundled. The bundled photos use licences that allow redistribution, and each one carries its credit.

## Publishing

`python3 tools/build_artifact.py` bundles the page into `dist/powergrade.html`. Publish it with `assets/photos/**` and `assets/mockups/**` as supporting files.
