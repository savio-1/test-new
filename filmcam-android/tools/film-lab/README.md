# Film lab

Bakes each film stock's colour into a 3D LUT (`app/src/main/assets/luts/<stock>.png`, 33³ as a
1089×33 strip) that the final shader applies.

The model works like the darkroom it imitates:
- **Negative.** Spectral crosstalk between the dye layers, then each layer's characteristic
  curve: density against log exposure, with its own contrast. The differing contrasts are what
  give film its crossovers (a cast in the shadows that turns in the highlights).
- **Print.** Printer lights balance 18% grey to the stock's own grey, neutral or warm on
  purpose, and the paper adds its curve. Slide stocks skip the print.
- **Dyes.** Saturation pushed in density space, so mid-tones are rich and highlights quiet.
- **Tone.** The stock's own curve: contrast, a shoulder that reaches paper white, and a lab
  scan's lifted black and softly capped white.
- **Character, in OKLab.** Hue shifts (greens to olive or teal, skin warmer, skies cyan),
  saturation by hue, split toning and faded blacks. Colours that leave the gamut slide toward
  grey instead of clipping.

Each stock's numbers are in `stocks.json`, with a line on what it's after. The tuning targets
the well-known character of classic Kodak and Fujifilm stocks (warm portrait negatives,
golden consumer films, cool green 400s, pastel pro films, landscape slide, tungsten cine,
instant) under the app's own names.

```bash
python3 filmlab.py preview photo.jpg sheet.jpg portrait400 gold200   # try stocks on a picture
python3 filmlab.py luts ../../app/src/main/assets/luts               # rebake every LUT
```

Grain, halation, bloom, leaks and the rest stay in the shader; only colour lives in the LUT.

## Fujifilm simulations and recipes (`fujilab.py`)

```bash
python3 fujilab.py fetch                                        # Fujifilm's F-Log2 LUTs, into .fuji-cache/
python3 fujilab.py preview photo.jpg sheet.jpg classicchrome reggiesportra   # try them on a picture
python3 fujilab.py luts ../../app/src/main/assets/luts          # bake luts/fx_<recipe>.png
python3 fujilab.py tiles lake.jpg ../../app/src/main/assets/looks
python3 fujilab.py kotlin ../../app/src/main/java/app/filmcam/film/FujiRecipes.kt
```

The pipeline:
1. **Phone picture to scene light.** The picture is inverted through Fujifilm's PROVIA LUT.
   Each colour is walked out from its grey so the solver stays on the right branch; 99% of
   colours come back within 0.06.
2. **Camera settings in scene light.** White balance (Kelvin or preset, plus the R/B shift),
   exposure, then DR and Highlight/Shadow tone, which bend the curve in stops around grey.
3. **The simulation.** Fujifilm's own LUT for it.
4. **After the simulation.** Color, Color Chrome Effect and Color Chrome FX Blue, in OKLab,
   with a soft gamut edge.

The recipes, with their Fuji X Weekly settings, are in `recipes.json`. Grain Effect, Clarity
and Sharpness map onto the look's shader settings (see `look_args`).
