import type {
  AudioSettings,
  ColorSettings,
  FilmSettings,
  MediaClip,
  MediaItem,
  Project,
  TextClip,
  TextStyle,
  Track,
  TrackKind,
  Transform,
} from './types';

let counter = 0;
export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const defaultTransform = (): Transform => ({
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  fit: 'contain',
});

export const defaultColor = (): ColorSettings => ({
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  lift: { x: 0, y: 0 },
  gamma: { x: 0, y: 0 },
  gain: { x: 0, y: 0 },
  liftMaster: 0,
  gammaMaster: 0,
  gainMaster: 0,
  lutId: null,
  lutAmount: 1,
});

export const defaultFilm = (): FilmSettings => ({
  stock: 'none',
  strength: 1,
  grain: 0,
  grainSize: 1,
  halation: 0,
  bloom: 0,
  vignette: 0,
  weave: 0,
  flicker: 0,
  fade: 0,
});

export const defaultAudio = (): AudioSettings => ({
  volume: 0,
  fadeIn: 0,
  fadeOut: 0,
  pan: 0,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  voice: false,
  denoise: 0,
  reverb: 0,
  muted: false,
});

export const defaultTextStyle = (): TextStyle => ({
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 96,
  fontWeight: 700,
  italic: false,
  color: '#ffffff',
  align: 'center',
  lineHeight: 1.15,
  letterSpacing: 0,
  outlineColor: '#000000',
  outlineWidth: 0,
  shadow: 0.4,
  background: '#000000',
  backgroundOpacity: 0,
  backgroundPadding: 24,
  uppercase: false,
});

export const makeTrack = (kind: TrackKind, index: number): Track => ({
  id: uid('trk'),
  kind,
  name: kind === 'video' ? `Video ${index}` : kind === 'text' ? `Text ${index}` : `Audio ${index}`,
  muted: false,
  hidden: false,
  solo: false,
  volume: 1,
});

export const IMAGE_DEFAULT_DURATION = 5;

export const makeMediaClip = (media: MediaItem, trackId: string, start: number): MediaClip => ({
  id: uid('clp'),
  type: 'media',
  trackId,
  start,
  duration: media.kind === 'image' ? IMAGE_DEFAULT_DURATION : media.duration,
  name: media.name,
  mediaId: media.id,
  inPoint: 0,
  speed: 1,
  transform: defaultTransform(),
  color: defaultColor(),
  film: defaultFilm(),
  effects: [],
  audio: defaultAudio(),
  transitionIn: { type: 'none', duration: 0.5 },
});

export const makeTextClip = (
  trackId: string,
  start: number,
  overrides: Partial<TextClip> = {},
): TextClip => ({
  id: uid('clp'),
  type: 'text',
  trackId,
  start,
  duration: 4,
  name: 'Title',
  text: 'Your title',
  style: defaultTextStyle(),
  transform: defaultTransform(),
  animIn: 'fade',
  animOut: 'fade',
  animDuration: 0.5,
  transitionIn: { type: 'none', duration: 0.5 },
  ...overrides,
});

export const newProject = (): Project => ({
  version: 1,
  name: 'Untitled project',
  settings: { width: 1920, height: 1080, fps: 30, background: '#000000' },
  tracks: [makeTrack('video', 1), makeTrack('video', 2), makeTrack('text', 1), makeTrack('audio', 1), makeTrack('audio', 2)],
  clips: [],
  luts: [],
});
