# Bring any look into FilmCam with a Hald image

`hald-identity-512.png` holds every colour, 64 steps per channel, in a fixed order. Put it
through any grade (a FilmBox look, a Dehancer stock, a Lightroom preset) and save the result:
each pixel is now that grade's answer for its colour. In FilmCam, **Looks → Custom → Import
LUT** and pick the saved image. The look is applied exactly, live, in photos and video, and
the file's name becomes the look's name.

Rules that keep it exact:
- The image must stay **512 × 512**: no resizing, cropping, borders or sharpening.
- Save as **PNG** (TIFF can't be read on the phone; JPEG works but loses a little precision).
- Feed the grade **Rec.709 / sRGB**: that's what a phone picture is.
- Turn **off** everything that isn't colour: grain, halation, bloom, acutance, gate weave, dust,
  flicker, vignette. Those vary across the frame and would scramble the colour table; FilmCam
  adds its own (Looks → Adjust), and they follow the picture, not the chart.
- No watermark. If a trial burns one in, FilmCam warns that some colours "jump about".

## FilmBox (Video Village) in DaVinci Resolve

1. **Project Settings → Master Settings:** timeline resolution *Custom* 512 × 512.
   **Image Scaling:** mismatched resolution → *Center crop with no resizing*.
   **Color Management:** DaVinci YRGB, timeline and output colour space *Rec.709 Gamma 2.4*.
2. Import `hald-identity-512.png` and put it on a timeline.
3. **Color page:** on a node, add the **Filmbox** OpenFX.
   - Input / source: **Rec.709** (display-referred), not a camera log.
   - Pick the look (FilmBox Looks family and look, or in Pro the system, stock and print).
   - Set grain, halation, acutance, gate weave, dust and flicker to zero (or off).
4. Right-click the viewer → **Grab Still**. Change the look and grab again, once per look.
5. **Gallery:** select the stills → right-click → **Export** → **PNG**. Name each file after
   its look (for example `FB Vision3 250D.png`, `FB Portra 400.png`).
6. Copy the PNGs to the phone and import them one by one (Looks → Custom → Import LUT).

FilmBox has a 14-day trial; if the trial adds a watermark to stills, use a licensed copy.
The same steps work for Dehancer (any film and print) and any other Resolve plugin.

## Lightroom, Photoshop, Capture One, VSCO

Open `hald-identity-512.png`, apply the preset or adjustments (colour and tone only; turn off
grain, vignette, sharpening, clarity, texture and dehaze), and export a full-size PNG in sRGB.
