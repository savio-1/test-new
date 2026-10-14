# Alaro immersive hero: storyboard and scroll plan

**Concept: "A day at home, kept."** The visitor scrolls through one afternoon-to-night in a real-looking open-plan home. Alaro sits on a walnut sideboard. As the light changes, Alaro wakes, turns its head and keeps the small moments of family life: game night, a birthday, a first flight across the kitchen, the cat in the sun, a bedtime story. The 3D home shows *where* each moment happens. A real clip from the brand film shows *what* Alaro kept.

**Technique** (same family as armory.in):
- **Frames:** the home is built and rendered in Blender (Cycles, path-traced), then played back as an image sequence on a `<canvas>`, scrubbed by scroll. That gives real global illumination, soft shadows and glass reflections that no real-time WebGL scene can match on a phone.
- **Tracking:** for every frame, Blender also exports where each prop lands on screen. So the HUD (detection boxes, labels, moment cards) sticks to the 3D objects as the camera moves, the way a real-time scene would.

---

## Layout of the home (plan view, 9 × 7 m, 2.8 m ceiling)

```
            KITCHEN (island, paper plane, pendants)
   ┌───────────────────────────────────────────────┐
   │                                               │
   │  DINING (table, birthday cake + candles)      │  WINDOW WALL
   │                                     PLANTS +  │  (sheer curtains,
   │  SIDEBOARD  ◄─ Alaro faces the room  CAT BED  │   sun comes in here)
   │  + Alaro                                      │
   │         LIVING (sofa, rug, coffee table,      │
   │                 block tower)                  │
   │                                READING NOOK   │
   │  ENTRY (camera starts here)    (armchair,     │
   │                                 floor lamp,   │
   └──────────────────────────────── picture book)─┘
```

Alaro sits at roughly human chest height on the sideboard, against the left wall, looking into the room. Every moment zone falls within its 350° pan and 75° tilt.

---

## Scroll timeline

The hero pins for **≈ 900vh**; 240 frames map linearly to scroll. Text, HUD and clips are DOM layers on top, driven by the same ScrollTrigger progress.

| # | Scroll | Frames | Light | Camera (3D) | Alaro | On-screen layer |
|---|---|---|---|---|---|---|
| 0 | 0–6% | 0–14 | 3:40 pm, warm low sun | Wide 24 mm from the entry, slow push in. Whole home, empty and calm. | Off, small on the sideboard | Preloader 0–100%, then the H1 "This is home." / "Alaro keeps what happens in it." and a scroll cue |
| 1 | 6–18% | 14–43 | 4:10 pm | Glide across the living room, arcing to a ¾ hero view of Alaro (50 mm) | The status light fades on (green); the head lifts 4° | Label `▪ 01 · ALARO`, one line: "It sits quietly on the sideboard." The spec chip `[ 350° PAN · 75° TILT · 2K HDR ]` follows Alaro's projected box |
| 2 | 18–25% | 43–60 | 4:20 pm | Push straight into the black glass until the frame is the lens | Faces the camera | The DOM iris closes around the lens (ties to the old hero's aperture idea) |
| 3 | 25–36% | 60–86 | 4:30 pm | **Alaro's view (POV)**, 18 mm, from just in front of the lens: the living room | Pans to the living area | The iris opens into a viewfinder: corners, `● LIVE`, the time. Detection boxes lock onto the **block tower** ("Game night · Arlo, Dad") and **the sofa** ("Zoe"). A moment card plays `gamenight` and flips to `sofa`. Caption: "Game nights that run late." |
| 4 | 36–48% | 86–115 | 5:45 pm, golden | POV pans right to the dining table | Pans +55° | Box on the **cake** (candles lit). Card plays `birthday`. Caption: "Wishes, made over candles." |
| 5 | 48–58% | 115–139 | 6:20 pm | POV continues to the kitchen island | Pans +30°, tilts down 6° | Box on the **paper plane**. Card plays `kitchen`. Caption: "First flights, across the kitchen." |
| 6 | 58–67% | 139–161 | 6:50 pm, sunset | POV swings to the window corner, low | Pans +25°, tilts down 12° | Box on the **cat bed by the plants** ("Milo"). Card plays `milo`. Caption: "And Milo, in the last of the sun." |
| 7 | 67–80% | 161–192 | 8:30 pm, night, lamps on | POV to the reading nook, lamp-lit | Pans back left, tilts down | Box on the **picture book on the armchair**. Card plays `storytime`. Caption: "Stories before bed." |
| 8 | 80–90% | 192–216 | Night | Pull back out through the lens, then up and away to a wide night view of the whole home | Back to centre, glowing dot | The viewfinder iris closes into the lens, the moment cards collect into a "Kept today · 6 moments" strip |
| 9 | 90–100% | 216–240 | Night | Settle on a calm ¾ of Alaro on the sideboard, lamp-lit | Idle | "Every moment, kept." with Buy Alaro and Watch the film. The pin releases into the camera journey (`#design`) |

### How each piece is shown
- **Moment capture (chapters 3–7):**
  1. A detection box draws in around the prop: corner ticks first, then the label chip.
  2. After a short hold, the moment card slides from the box toward the free side of the screen. The card is a rounded 4:5 tile with the clip (muted, looping), the name, the room and the time.
  3. The previous card shrinks into the strip at the bottom: "Kept today".
- **Text:** light, large Switzer with two tones (ink, then grey), as the existing design system does. Mono labels `▪ 03 · LIVING ROOM`. Lines rise in per line (SplitText).
- **Progress:** a thin rail at the right edge with the clock time of the scene (3:40 PM → 9:10 PM) and the chapter ticks. This replaces Armory's percentage and carries the "a day at home" idea.
- **Interactivity:**
  - The canvas leans a few pixels toward the pointer (parallax) and the HUD answers too.
  - Hovering a detection box raises its card.
  - Clicking a card opens the full film at that scene (the existing FilmPlayer).
  - Scrolling stops on chapter rests (gentle snap, never forced).

### Loading (armory-style progressive sequence)
- **Format:** frames are packed into WebP atlases, about 24 frames per image, to keep requests low.
- **Low pass:** 640 × 360, ≈ 2 MB in total, loads first and the preloader counts it.
- **High pass:** 1600 × 900 streams in behind it, in the order it will be needed.
- **On the canvas:** while scrolling it draws the best frame it already has; when scrolling stops, it swaps in the sharp one.

### Fallbacks
- **`prefers-reduced-motion`:** no pin. A stacked set of five stills (one per moment), each with its card.
- **Mobile (< 768px):**
  - the same sequence, cover-cropped toward the subject of each frame (the focus x is exported per frame)
  - pin length cut to 600vh
  - cards dock to the bottom
- **No JS:** the poster frame (the night wide shot) with the H1.
