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
