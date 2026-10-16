# Reel: a simple video editor

A lightweight, browser-based video editor for everyday editing. It covers the
things you need daily (cutting, film looks, colour, effects, titles, sound)
behind one calm screen instead of pages of tabs. Everything runs locally: media
never leaves the computer.

## Run it

```bash
cd reel-editor
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/, host anywhere
```

Use a recent **Chrome or Edge** (desktop). Export uses WebCodecs: Chrome and Edge
write H.264/AAC MP4; browsers without H.264 fall back to VP9 (in MP4 or WebM).

## What's in it

| Area | Features |
|---|---|
| **Timeline** | Video, text and audio tracks; drag to move (also across tracks), trim edges, split, duplicate, ripple delete, snapping, zoom, hide/mute/solo tracks, waveforms, undo/redo |
| **Film look** | 12 original film stocks (colour negative, cine, slide, process, B&W) with strength, grain (size, luma-weighted), halation, bloom, vignette, gate weave, flicker, faded blacks |
| **Colour** | Exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, saturation, vibrance; shadow/midtone/highlight colour wheels; `.cube` 3D LUTs; quick looks; copy/paste a look; apply a look to all clips |
| **Effects** | 24 effects: blur, sharpen, glow, light leak, vignette, B&W, sepia, tint, duotone, invert, posterize, sketch, halftone, pixelate, mirror, lens distortion, chromatic aberration, glitch, VHS, CRT, dust & scratches, letterbox, camera shake, slow zoom |
| **Transitions** | Cross dissolve, dip to black/white, wipes, slides, zoom, blur dissolve, iris |
| **Text** | 7 templates (title, subtitle, lower third, caption, quote, typewriter, chapter); font, size, weight, colour, outline, shadow, background box; in/out animations; drag to position in the viewer |
| **Audio** | Volume, fades, pan, 3-band EQ, voice enhance, clean-up filter, reverb, per-clip mute, level meter |
| **Output** | MP4/WebM export (480p to 4K, 23.976 to 60 fps), PNG stills, autosave of the project and media in the browser |

## Shortcuts

`Space` play · `←/→` frame step (`Shift` = 1 s) · `S` split · `Del` delete (`Shift+Del` closes the gap) ·
`Ctrl/⌘+D` duplicate · `Ctrl/⌘+Z` undo (`Shift` redo) · `T` add title · `+/−` zoom · `N` snapping ·
`Ctrl/⌘+E` export · `Esc` deselect

## How it works

```
src/
  model/      types, defaults, film stocks / effects / templates, timeline maths
  state/      zustand store with undo history, IndexedDB autosave, toasts
  engine/
    renderer.ts   WebGL2 compositor: per-clip grade pass → blur/glow/halation passes → transitions → stack
    shaders.ts    colour correction, film model, effects, transitions (GLSL)
    preview.ts    playback: one <video> per clip kept in sync, audio routed through Web Audio
    audio.ts      per-clip chain (gain/fades → EQ → clean-up → voice → compressor → pan → reverb)
    export.ts     frame-accurate decode (mediabunny) → same renderer → WebCodecs encode → MP4/WebM
    text.ts       title rasteriser and animations
  ui/         React components: media bin, viewer, inspector, timeline, export dialog
```

Preview and export share one renderer and one audio chain, so the export matches what you see.

**Film model:** each stock runs a dye-coupling channel mix, a per-channel S-curve with toe and
shoulder, shadow/highlight crossover tints, saturation and a black fade. Halation is a blurred
highlight pass tinted red-orange, and grain is luma-weighted value noise that changes every frame.
The looks are original and are not copies of any commercial product's profiles.

## Ideas for next iterations

- Keyframes (position, scale, opacity, effect parameters)
- Speed ramps and freeze frames
- Detach audio from video; audio ducking under voice
- Project file save/open with media relinking
- Crop, masks and picture-in-picture presets
- Auto-captions (speech to text)
- Desktop app wrapper (Tauri/Electron) for larger files and native codecs
