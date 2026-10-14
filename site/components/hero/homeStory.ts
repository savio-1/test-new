/**
 * The immersive hero's story, frame by frame (docs/STORYBOARD.md).
 * Frames come from tools/home-scene/build_home.py; keep the windows here in step with its AIM beats.
 */

export const HOME_BASE = '/media/home';
export const FRAMES = 240;
/** Frames rendered from Alaro's own lens (the viewfinder is shown over these). */
export const POV = [61, 199] as const;

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
    box: [66, 77],
    card: [68, 74],
    title: 'Game night',
    who: 'Arlo & Dad',
    room: 'Living room',
    clip: 'gamenight',
    line: 'Game nights that run late.',
    filmAt: 3.0,
  },
  {
    key: 'sofa',
    box: [77, 88],
    card: [81, 88],
    title: 'Giggles on the sofa',
    who: 'Zoe',
    room: 'Living room',
    clip: 'sofa',
    line: 'Giggles nobody planned.',
    filmAt: 0,
  },
  {
    key: 'cake',
    box: [95, 114],
    card: [99, 114],
    title: "Grandpa's birthday",
    who: 'The whole family',
    room: 'Dining table',
    clip: 'birthday',
    line: 'Wishes, made over candles.',
    filmAt: 5.1,
  },
  {
    key: 'plane',
    box: [121, 138],
    card: [125, 138],
    title: 'First flight',
    who: 'Leo & Mum',
    room: 'Kitchen',
    clip: 'kitchen',
    line: 'First flights, across the kitchen.',
    filmAt: 10.1,
  },
  {
    key: 'catbed',
    box: [146, 160],
    card: [149, 161],
    title: 'Sunbathing',
    who: 'Milo',
    room: 'By the window',
    clip: 'milo',
    line: 'And Milo, in the last of the sun.',
    filmAt: 0,
  },
  {
    key: 'book',
    box: [171, 191],
    card: [175, 192],
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
  intro: [0, 12],
  alaro: [17, 40],
  wake: [44, 55],
  kept: [205, 221],
  end: [224, 239],
} as const;

/** Iris transitions into and out of Alaro's lens. */
export const IRIS = {
  closeIn: [50, 60],
  openIn: [61, 67],
  closeOut: [193, 199],
  openOut: [199, 206],
} as const;

export function roomAt(f: number) {
  if (f < 92) return 'Living room';
  if (f < 118) return 'Dining table';
  if (f < 142) return 'Kitchen';
  if (f < 166) return 'By the window';
  return 'Reading corner';
}

export function clockLabel(hours: number) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** 0..1 visibility for a [in, out] window with `fade` frames of ease at each end. */
export function windowAlpha(f: number, [a, b]: readonly [number, number], fade = 3) {
  if (f < a - fade || f > b + fade) return 0;
  const i = Math.min(1, (f - (a - fade)) / fade);
  const o = Math.min(1, (b + fade - f) / fade);
  return Math.max(0, Math.min(i, o));
}
