/**
 * The immersive hero's story, frame by frame (docs/STORYBOARD.md).
 * Frames come from tools/home-scene/build_home.py; keep the windows here in step with its AIM beats.
 */

export const HOME_BASE = '/media/home';
/**
 * The story is timed in 240 story frames (the numbers below, as in the storyboard). v2 renders STEP frames per
 * story frame for a smoother scroll: 479 frames, f000-f478, where frame 2n is story frame n. Everything exported
 * here is already in rendered frames. A 240-frame set (build_home.py --step 1) needs STEP = 1.
 */
export const STORY_FRAMES = 240;
export const STEP = 2;
export const FRAMES = (STORY_FRAMES - 1) * STEP + 1;
/** story frame -> rendered frame */
export const sf = (n: number) => n * STEP;
const span = (a: number, b: number): [number, number] => [sf(a), sf(b)];
/** Frames rendered from Alaro's own lens (the viewfinder is shown over these). */
export const POV = span(61, 199);

/** Tracked props, as named in track.json. */
export type TrackKey = 'alaro' | 'sofa' | 'tower' | 'cake' | 'plane' | 'catbed' | 'book';
export type Box = [number, number, number, number];
export type TrackFrame = { f: number; time: number; pov: boolean; lens?: [number, number] } & Partial<Record<TrackKey, Box>>;

export type Moment = {
  key: TrackKey;
  /** detection box visible */
  box: [number, number];
  /** moment card visible (inside `box`) */
  card: [number, number];
  title: string;
  who: string;
  room: string;
  /** clip in /media/moments */
  clip: string;
  /** big caption under the viewfinder */
  line: string;
  /** where this scene starts in the brand film, for "watch it" */
  filmAt: number;
};

export const MOMENTS: Moment[] = [
  {
    key: 'tower',
    box: span(66, 77),
    card: span(68, 74),
    title: 'Game night',
    who: 'Arlo & Dad',
    room: 'Living room',
    clip: 'gamenight',
    line: 'Game nights that run late.',
    filmAt: 3.0,
  },
  {
    key: 'sofa',
    box: span(77, 88),
    card: span(81, 88),
    title: 'Giggles on the sofa',
    who: 'Zoe',
    room: 'Living room',
    clip: 'sofa',
    line: 'Giggles nobody planned.',
    filmAt: 0,
  },
  {
    key: 'cake',
    box: span(95, 114),
    card: span(99, 114),
    title: "Grandpa's birthday",
    who: 'The whole family',
    room: 'Dining table',
    clip: 'birthday',
    line: 'Wishes, made over candles.',
    filmAt: 5.1,
  },
  {
    key: 'plane',
    box: span(121, 138),
    card: span(125, 138),
    title: 'First flight',
    who: 'Leo & Mum',
    room: 'Kitchen',
    clip: 'kitchen',
    line: 'First flights, across the kitchen.',
    filmAt: 10.1,
  },
  {
    key: 'catbed',
    box: span(146, 160),
    card: span(149, 161),
    title: 'Sunbathing',
    who: 'Milo',
    room: 'By the window',
    clip: 'milo',
    line: 'And Milo, in the last of the sun.',
    filmAt: 0,
  },
  {
    key: 'book',
    box: span(171, 191),
    card: span(175, 192),
    title: 'Bedtime story',
    who: 'Mira & Mum',
    room: 'Reading corner',
    clip: 'storytime',
    line: 'Stories before bed.',
    filmAt: 7.6,
  },
];

/** Text chapters outside the viewfinder: [in, out] frames (each fades over a few frames). */
export const CHAPTERS = {
  intro: span(0, 12),
  alaro: span(17, 40),
  wake: span(44, 55),
  kept: span(205, 221),
  end: span(224, 239),
} as const;

/** Iris transitions into and out of Alaro's lens. */
export const IRIS = {
  closeIn: span(50, 60),
  openIn: span(61, 67),
  closeOut: span(193, 199),
  openOut: span(199, 206),
} as const;

export function roomAt(f: number) {
  if (f < sf(92)) return 'Living room';
  if (f < sf(118)) return 'Dining table';
  if (f < sf(142)) return 'Kitchen';
  if (f < sf(166)) return 'By the window';
  return 'Reading corner';
}

export function clockLabel(hours: number) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** 0..1 visibility for a [in, out] window with `fade` frames of ease at each end (3 story frames by default). */
export function windowAlpha(f: number, [a, b]: readonly [number, number], fade = 3 * STEP) {
  if (f < a - fade || f > b + fade) return 0;
  const i = Math.min(1, (f - (a - fade)) / fade);
  const o = Math.min(1, (b + fade - f) / fade);
  return Math.max(0, Math.min(i, o));
}
