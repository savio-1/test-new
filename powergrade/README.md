# Powergrade Studio

An art-direction studio. Describe a client with four answers (industry, business model, audience, price tier) and Powergrade shortlists diverse art directions from a researched library, explains each pick with documented references, and presents the chosen direction as a case study: websites, apps, social, print, packaging, devices and outdoor, with real photography and photoreal 3D renders.

Run it over http (the 3D engine loads its lighting with fetch):

```
cd powergrade && python3 -m http.server 8000   # then open http://localhost:8000
```

## Views

- **Board**: the active direction as a gallery of applications in calm grey frames. Each piece has a layout or object cycler and opens large.
- **Studio**: node canvas (Brief → Direction → Outputs) with every control: palette, mode, hue, type, shape, photo grade.
- **Compare**: the diverse shortlist side by side across chosen touchpoints.
- **Logo Lab**: 61 parametric mark families, 49 curated marks, a grid constructor, 33 wordmark styles and lockup tests. "Use for brand" applies the logo everywhere.
- **Library**: directions, layouts, photography, industries, audiences, references and method.

## Pieces

| File | Role |
|---|---|
| `js/data/taxonomy.js`, `directions.js`, `references.js` | Brief vocabulary, 34 direction genomes, 113 documented identity projects |
| `js/data/photos.js` + `assets/photos/` | 145 photos (Unsplash licence via Picsum, CC0 Wikimedia Commons), each with focal point, tone and credit |
| `js/engine.js` | Scoring, diversity shortlist, tokens, WCAG checks |
| `js/imagery.js` | Photo selection per industry and per-direction colour grading |
| `js/templates.js` | Layout library: 12 website layouts plus app, social, story, poster, presentation, email, ad, billboard and brand book |
| `js/logolab.js`, `js/brand.js` | Logo engine and the brand adapter every layout uses |
| `js/labels.js`, `js/mockups.js`, `js/studio3d.js` + `assets/3d/` | Artwork painters and the three.js engine (15 objects, CC0 Poly Haven lighting) |
| `js/app/*.js` | UI: core shell and one file per view |

## Publishing

`python3 tools/build_artifact.py --embed-hdr` bundles the page into `dist/powergrade.html` with the HDR lighting inlined. Publish it with `assets/3d/*.jpg` and `assets/photos/**` as supporting files.
