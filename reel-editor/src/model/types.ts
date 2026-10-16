// Core data model. Everything in `Project` is plain JSON so it can be saved,
// undone and redone. Runtime-only data (files, decoded audio) lives in MediaItem.

export type MediaKind = 'video' | 'audio' | 'image';

export interface MediaItem {
  id: string;
  name: string;
  kind: MediaKind;
  url: string; // object URL for the file
  file: File;
  duration: number; // seconds (images: 0, they are stretched freely)
  width: number;
  height: number;
  hasAudio: boolean;
  thumbnail?: string; // data URL
  peaks?: number[]; // normalised waveform peaks, ~100 per second
}

export type TrackKind = 'video' | 'text' | 'audio';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  solo: boolean;
  volume: number; // linear gain
}

export interface Transform {
  x: number; // offset as a fraction of frame width (-1..1)
  y: number; // offset as a fraction of frame height (-1..1), positive = up
  scale: number;
  rotation: number; // degrees
  opacity: number; // 0..1
  fit: 'contain' | 'cover';
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface ColorSettings {
  exposure: number; // stops, -3..3
  contrast: number; // -1..1
  highlights: number; // -1..1
  shadows: number; // -1..1
  whites: number; // -1..1
  blacks: number; // -1..1
  temperature: number; // -1..1 (cool..warm)
  tint: number; // -1..1 (green..magenta)
  saturation: number; // -1..1
  vibrance: number; // -1..1
  // Colour wheels: puck position in the unit disc plus a master (luminance) offset.
  lift: Vec2;
  gamma: Vec2;
  gain: Vec2;
  liftMaster: number; // -1..1
  gammaMaster: number;
  gainMaster: number;
  lutId: string | null;
  lutAmount: number; // 0..1
}

export interface FilmSettings {
  stock: string; // id from FILM_STOCKS, 'none' for off
  strength: number; // 0..1
  grain: number; // 0..1
  grainSize: number; // 0.5..3
  halation: number; // 0..1
  bloom: number; // 0..1
  vignette: number; // 0..1
  weave: number; // 0..1 gate weave
  flicker: number; // 0..1 exposure flicker
  fade: number; // 0..1 milky blacks on top of the stock
}

export interface EffectInstance {
  id: string;
  type: string; // id from EFFECTS
  enabled: boolean;
  params: Record<string, number>;
}

export interface AudioSettings {
  volume: number; // dB, -60..+12
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  pan: number; // -1..1
  eqLow: number; // dB
  eqMid: number; // dB
  eqHigh: number; // dB
  voice: boolean; // voice enhance chain
  denoise: number; // 0..1, rumble + hiss filtering
  reverb: number; // 0..1 wet
  muted: boolean;
}

export type TransitionType =
  | 'none'
  | 'crossfade'
  | 'dip-black'
  | 'dip-white'
  | 'wipe-left'
  | 'wipe-right'
  | 'slide-left'
  | 'slide-up'
  | 'zoom'
  | 'blur'
  | 'circle';

export interface Transition {
  type: TransitionType;
  duration: number; // seconds
}

export type TextAnimation =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-left'
  | 'pop'
  | 'typewriter'
  | 'blur-in'
  | 'tracking';

export interface TextStyle {
  fontFamily: string;
  fontSize: number; // px at 1080p height
  fontWeight: number;
  italic: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number; // px
  outlineColor: string;
  outlineWidth: number;
  shadow: number; // 0..1
  background: string;
  backgroundOpacity: number; // 0..1
  backgroundPadding: number;
  uppercase: boolean;
}

interface ClipBase {
  id: string;
  trackId: string;
  start: number; // timeline seconds
  duration: number; // timeline seconds
  name: string;
}

export interface MediaClip extends ClipBase {
  type: 'media';
  mediaId: string;
  inPoint: number; // source seconds
  speed: number;
  transform: Transform;
  color: ColorSettings;
  film: FilmSettings;
  effects: EffectInstance[];
  audio: AudioSettings;
  transitionIn: Transition;
}

export interface TextClip extends ClipBase {
  type: 'text';
  text: string;
  style: TextStyle;
  transform: Transform;
  animIn: TextAnimation;
  animOut: TextAnimation;
  animDuration: number;
  transitionIn: Transition;
}

export type Clip = MediaClip | TextClip;

export interface Lut {
  id: string;
  name: string;
  size: number;
  data: number[]; // size^3 * 3 floats, r fastest
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  background: string;
}

export interface Project {
  version: 1;
  name: string;
  settings: ProjectSettings;
  tracks: Track[]; // index 0 is drawn at the bottom of the stack
  clips: Clip[];
  luts: Lut[];
}
