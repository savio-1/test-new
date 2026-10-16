import type { ColorSettings, FilmSettings, TextClip, TransitionType } from './types';
import { defaultTextStyle } from './defaults';

// ---------------------------------------------------------------------------
// Film stocks. These are original looks built from a simple film model:
// dye-coupling channel mix -> per-channel S-curve with toe/shoulder ->
// shadow/highlight crossover tints -> saturation -> black fade.
// ---------------------------------------------------------------------------

export interface FilmStock {
  id: string;
  name: string;
  kind: 'Colour negative' | 'Cine' | 'Slide' | 'Black & white' | 'Process';
  description: string;
  mono: boolean;
  contrast: number; // sigmoid steepness, 0 = linear
  pivot: number;
  toe: number; // shadow crush 0..1
  shoulder: number; // highlight roll-off 0..1
  mix: [number, number, number, number, number, number, number, number, number];
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  saturation: number;
  fade: number;
  swatch: string; // CSS gradient for the picker chip
  suggested: Partial<FilmSettings>;
}

const I: FilmStock['mix'] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const FILM_STOCKS: FilmStock[] = [
  {
    id: 'golden200',
    name: 'Golden 200',
    kind: 'Colour negative',
    description: 'Warm, sunny consumer negative with punchy yellows.',
    mono: false,
    contrast: 3.4,
    pivot: 0.45,
    toe: 0.15,
    shoulder: 0.3,
    mix: [1.06, -0.03, -0.03, -0.02, 1.03, -0.01, -0.03, -0.07, 1.1],
    shadowTint: [0.012, 0.004, -0.018],
    highlightTint: [0.045, 0.022, -0.045],
    saturation: 1.12,
    fade: 0.03,
    swatch: 'linear-gradient(135deg,#3b2a12,#d79a3a,#f6e2a8)',
    suggested: { grain: 0.25, halation: 0.2, bloom: 0.1, vignette: 0.15 },
  },
  {
    id: 'portrait400',
    name: 'Portrait 400',
    kind: 'Colour negative',
    description: 'Soft pastel negative, flattering skin and gentle contrast.',
    mono: false,
    contrast: 2.0,
    pivot: 0.45,
    toe: 0.25,
    shoulder: 0.45,
    mix: [1.02, -0.01, -0.01, -0.01, 1.01, 0.0, -0.01, -0.02, 1.03],
    shadowTint: [0.0, 0.006, 0.016],
    highlightTint: [0.026, 0.012, -0.01],
    saturation: 0.92,
    fade: 0.05,
    swatch: 'linear-gradient(135deg,#5a6470,#e7b9a1,#f7efe6)',
    suggested: { grain: 0.2, halation: 0.15, bloom: 0.15, vignette: 0.1 },
  },
  {
    id: 'evergreen400',
    name: 'Evergreen 400',
    kind: 'Colour negative',
    description: 'Cool greens in the shadows, clean magenta-leaning highlights.',
    mono: false,
    contrast: 3.0,
    pivot: 0.45,
    toe: 0.15,
    shoulder: 0.35,
    mix: [1.02, 0.0, -0.02, -0.03, 1.06, -0.03, -0.01, -0.04, 1.05],
    shadowTint: [-0.012, 0.02, 0.006],
    highlightTint: [0.012, -0.004, 0.02],
    saturation: 1.05,
    fade: 0.025,
    swatch: 'linear-gradient(135deg,#183026,#5f8f6e,#e4e9f2)',
    suggested: { grain: 0.3, halation: 0.15, vignette: 0.15 },
  },
  {
    id: 'tungsten500',
    name: 'Tungsten 500T',
    kind: 'Cine',
    description: 'Night cinema stock: teal shadows, glowing red halation around lights.',
    mono: false,
    contrast: 3.0,
    pivot: 0.42,
    toe: 0.2,
    shoulder: 0.5,
    mix: [1.03, -0.02, -0.01, -0.02, 1.02, 0.0, -0.01, -0.03, 1.04],
    shadowTint: [-0.022, 0.01, 0.036],
    highlightTint: [0.03, 0.0, -0.03],
    saturation: 1.0,
    fade: 0.02,
    swatch: 'linear-gradient(135deg,#0d2230,#2f6f7a,#e9965a)',
    suggested: { grain: 0.3, halation: 0.55, bloom: 0.2, vignette: 0.2 },
  },
  {
    id: 'daylight250',
    name: 'Daylight 250D',
    kind: 'Cine',
    description: 'Neutral cinema daylight stock with a rich, smooth roll-off.',
    mono: false,
    contrast: 2.6,
    pivot: 0.45,
    toe: 0.18,
    shoulder: 0.45,
    mix: [1.03, -0.02, -0.01, -0.01, 1.02, -0.01, -0.01, -0.03, 1.04],
    shadowTint: [-0.005, 0.005, 0.01],
    highlightTint: [0.015, 0.008, -0.012],
    saturation: 1.03,
    fade: 0.015,
    swatch: 'linear-gradient(135deg,#26303a,#9a8f80,#efe4d2)',
    suggested: { grain: 0.2, halation: 0.3, bloom: 0.1, vignette: 0.1 },
  },
  {
    id: 'vivid50',
    name: 'Vivid 50',
    kind: 'Slide',
    description: 'Slide film: deep blacks, saturated landscapes, very fine grain.',
    mono: false,
    contrast: 5.0,
    pivot: 0.47,
    toe: 0.05,
    shoulder: 0.15,
    mix: [1.12, -0.06, -0.06, -0.05, 1.1, -0.05, -0.05, -0.07, 1.12],
    shadowTint: [0.0, -0.005, 0.02],
    highlightTint: [0.01, 0.01, -0.01],
    saturation: 1.25,
    fade: 0,
    swatch: 'linear-gradient(135deg,#0b1d3a,#1d7a4c,#f4c22b)',
    suggested: { grain: 0.12, vignette: 0.2 },
  },
  {
    id: 'blockbuster',
    name: 'Blockbuster',
    kind: 'Process',
    description: 'Teal and orange split-tone for punchy, modern cinema.',
    mono: false,
    contrast: 3.5,
    pivot: 0.45,
    toe: 0.12,
    shoulder: 0.35,
    mix: I,
    shadowTint: [-0.04, 0.012, 0.04],
    highlightTint: [0.05, 0.016, -0.04],
    saturation: 1.1,
    fade: 0.01,
    swatch: 'linear-gradient(135deg,#0c3340,#2b7a85,#f0954b)',
    suggested: { grain: 0.15, halation: 0.2, vignette: 0.2 },
  },
  {
    id: 'bleach',
    name: 'Bleach Bypass',
    kind: 'Process',
    description: 'Silver retained in the print: desaturated, hard and gritty.',
    mono: false,
    contrast: 5.5,
    pivot: 0.45,
    toe: 0.05,
    shoulder: 0.2,
    mix: I,
    shadowTint: [0.0, 0.0, 0.006],
    highlightTint: [0.0, 0.0, 0.0],
    saturation: 0.45,
    fade: 0,
    swatch: 'linear-gradient(135deg,#111,#6b6f68,#d8d8cf)',
    suggested: { grain: 0.3, vignette: 0.25 },
  },
  {
    id: 'cross',
    name: 'Cross Process',
    kind: 'Process',
    description: 'Slide film in negative chemistry: yellow highs, cyan lows.',
    mono: false,
    contrast: 4.0,
    pivot: 0.45,
    toe: 0.1,
    shoulder: 0.25,
    mix: [1.05, 0.0, -0.05, -0.03, 1.08, -0.05, 0.0, -0.05, 1.05],
    shadowTint: [-0.03, 0.0, 0.06],
    highlightTint: [0.06, 0.05, -0.08],
    saturation: 1.3,
    fade: 0.02,
    swatch: 'linear-gradient(135deg,#0b2a4a,#3fb3a5,#f5ef6b)',
    suggested: { grain: 0.25, vignette: 0.2 },
  },
  {
    id: 'faded70',
    name: "Faded '70s",
    kind: 'Process',
    description: 'An old print: lifted purple blacks, warm and washed out.',
    mono: false,
    contrast: 1.5,
    pivot: 0.45,
    toe: 0.3,
    shoulder: 0.5,
    mix: [1.02, 0.0, -0.02, -0.01, 1.0, 0.01, -0.02, -0.02, 1.04],
    shadowTint: [0.02, 0.0, 0.03],
    highlightTint: [0.05, 0.03, -0.04],
    saturation: 0.8,
    fade: 0.12,
    swatch: 'linear-gradient(135deg,#3a2a3d,#b38b6d,#f1dcb6)',
    suggested: { grain: 0.35, vignette: 0.3, weave: 0.2 },
  },
  {
    id: 'silver400',
    name: 'Silver 400',
    kind: 'Black & white',
    description: 'Classic high-speed black and white: gritty grain, strong contrast.',
    mono: true,
    contrast: 4.0,
    pivot: 0.45,
    toe: 0.1,
    shoulder: 0.3,
    mix: [0.4, 0.45, 0.15, 0.4, 0.45, 0.15, 0.4, 0.45, 0.15],
    shadowTint: [0, 0, 0],
    highlightTint: [0, 0, 0],
    saturation: 0,
    fade: 0.02,
    swatch: 'linear-gradient(135deg,#0c0c0c,#777,#eee)',
    suggested: { grain: 0.45, vignette: 0.2 },
  },
  {
    id: 'silk100',
    name: 'Silk 100',
    kind: 'Black & white',
    description: 'Fine-grain black and white with soft, silvery tones.',
    mono: true,
    contrast: 2.5,
    pivot: 0.45,
    toe: 0.2,
    shoulder: 0.5,
    mix: [0.3, 0.59, 0.11, 0.3, 0.59, 0.11, 0.3, 0.59, 0.11],
    shadowTint: [0.004, 0.004, 0.008],
    highlightTint: [0.008, 0.006, 0.0],
    saturation: 0,
    fade: 0.03,
    swatch: 'linear-gradient(135deg,#1c1d22,#8a8a8f,#f3f1ec)',
    suggested: { grain: 0.15, vignette: 0.15 },
  },
];

export const stockById = (id: string) => FILM_STOCKS.find((s) => s.id === id);

// ---------------------------------------------------------------------------
// Effects catalogue. Each effect is rendered by the GPU pipeline in
// engine/renderer.ts; parameters are plain numbers so they can be animated later.
// ---------------------------------------------------------------------------

export interface EffectParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  options?: string[]; // when set, the param is an index into this list
}

export interface EffectDef {
  id: string;
  name: string;
  category: 'Blur & sharpen' | 'Colour' | 'Stylize' | 'Distort' | 'Retro' | 'Light' | 'Camera';
  params: EffectParam[];
}

const p = (key: string, label: string, min: number, max: number, def: number, step = 0.01): EffectParam => ({
  key,
  label,
  min,
  max,
  step,
  default: def,
});

export const EFFECTS: EffectDef[] = [
  { id: 'blur', name: 'Blur', category: 'Blur & sharpen', params: [p('amount', 'Amount', 0, 1, 0.4)] },
  { id: 'sharpen', name: 'Sharpen', category: 'Blur & sharpen', params: [p('amount', 'Amount', 0, 2, 0.6)] },
  {
    id: 'glow',
    name: 'Glow',
    category: 'Light',
    params: [p('amount', 'Amount', 0, 1, 0.5), p('threshold', 'Threshold', 0, 1, 0.6), p('radius', 'Radius', 0, 1, 0.5)],
  },
  {
    id: 'leak',
    name: 'Light leak',
    category: 'Light',
    params: [p('amount', 'Amount', 0, 1, 0.5), p('speed', 'Speed', 0, 1, 0.3), p('hue', 'Hue', 0, 360, 25, 1)],
  },
  {
    id: 'vignette',
    name: 'Vignette',
    category: 'Light',
    params: [p('amount', 'Amount', 0, 1, 0.5), p('softness', 'Softness', 0, 1, 0.5)],
  },
  { id: 'bw', name: 'Black & white', category: 'Colour', params: [p('amount', 'Amount', 0, 1, 1)] },
  { id: 'sepia', name: 'Sepia', category: 'Colour', params: [p('amount', 'Amount', 0, 1, 0.8)] },
  {
    id: 'tint',
    name: 'Colour tint',
    category: 'Colour',
    params: [p('amount', 'Amount', 0, 1, 0.4), p('hue', 'Hue', 0, 360, 200, 1)],
  },
  {
    id: 'duotone',
    name: 'Duotone',
    category: 'Colour',
    params: [p('amount', 'Amount', 0, 1, 1), p('hue1', 'Shadow hue', 0, 360, 250, 1), p('hue2', 'Highlight hue', 0, 360, 40, 1)],
  },
  { id: 'invert', name: 'Invert', category: 'Colour', params: [p('amount', 'Amount', 0, 1, 1)] },
  { id: 'posterize', name: 'Posterize', category: 'Stylize', params: [p('levels', 'Levels', 2, 16, 5, 1)] },
  { id: 'sketch', name: 'Sketch', category: 'Stylize', params: [p('amount', 'Amount', 0, 1, 1)] },
  {
    id: 'halftone',
    name: 'Halftone',
    category: 'Stylize',
    params: [p('size', 'Dot size', 3, 24, 8, 1), p('amount', 'Amount', 0, 1, 1)],
  },
  { id: 'pixelate', name: 'Pixelate', category: 'Stylize', params: [p('size', 'Block size', 2, 80, 16, 1)] },
  {
    id: 'mirror',
    name: 'Mirror',
    category: 'Distort',
    params: [{ ...p('mode', 'Mode', 0, 3, 0, 1), options: ['Left → right', 'Right → left', 'Top → bottom', 'Four-way'] }],
  },
  { id: 'lens', name: 'Lens distortion', category: 'Distort', params: [p('amount', 'Amount', -1, 1, 0.3)] },
  { id: 'chroma', name: 'Chromatic aberration', category: 'Distort', params: [p('amount', 'Amount', 0, 1, 0.4)] },
  {
    id: 'glitch',
    name: 'Glitch',
    category: 'Retro',
    params: [p('amount', 'Amount', 0, 1, 0.5), p('speed', 'Speed', 0, 1, 0.5)],
  },
  { id: 'vhs', name: 'VHS', category: 'Retro', params: [p('amount', 'Amount', 0, 1, 0.6)] },
  { id: 'crt', name: 'CRT screen', category: 'Retro', params: [p('amount', 'Amount', 0, 1, 0.6)] },
  { id: 'dust', name: 'Dust & scratches', category: 'Retro', params: [p('amount', 'Amount', 0, 1, 0.5)] },
  {
    id: 'letterbox',
    name: 'Letterbox',
    category: 'Camera',
    params: [{ ...p('ratio', 'Ratio', 0, 4, 0, 1), options: ['2.39 : 1', '2.00 : 1', '1.85 : 1', '4 : 3', '1 : 1'] }],
  },
  {
    id: 'shake',
    name: 'Camera shake',
    category: 'Camera',
    params: [p('amount', 'Amount', 0, 1, 0.3), p('speed', 'Speed', 0, 1, 0.5)],
  },
  {
    id: 'kenburns',
    name: 'Slow zoom',
    category: 'Camera',
    params: [p('zoom', 'Zoom (− out, + in)', -1, 1, 0.4), p('panX', 'Pan X', -1, 1, 0), p('panY', 'Pan Y', -1, 1, 0)],
  },
];

export const effectById = (id: string) => EFFECTS.find((e) => e.id === id);
export const LETTERBOX_RATIOS = [2.39, 2.0, 1.85, 4 / 3, 1];

// ---------------------------------------------------------------------------
// Quick colour looks: one-click starting points that only touch ColorSettings.
// ---------------------------------------------------------------------------

export const COLOR_LOOKS: { id: string; name: string; color: Partial<ColorSettings> }[] = [
  { id: 'reset', name: 'Reset', color: {} },
  { id: 'punch', name: 'Punchy', color: { contrast: 0.25, vibrance: 0.3, saturation: 0.05 } },
  { id: 'warm', name: 'Warm', color: { temperature: 0.35, tint: 0.05, vibrance: 0.1 } },
  { id: 'cool', name: 'Cool', color: { temperature: -0.35, tint: -0.03 } },
  { id: 'matte', name: 'Matte', color: { contrast: -0.2, blacks: 0.25, saturation: -0.1 } },
  { id: 'bright', name: 'Bright & airy', color: { exposure: 0.4, shadows: 0.3, highlights: -0.2, saturation: -0.1 } },
  { id: 'moody', name: 'Moody', color: { exposure: -0.3, contrast: 0.2, saturation: -0.25, shadows: -0.2 } },
];

// ---------------------------------------------------------------------------
// Transitions and text.
// ---------------------------------------------------------------------------

export const TRANSITIONS: { id: TransitionType; name: string }[] = [
  { id: 'none', name: 'Cut' },
  { id: 'crossfade', name: 'Cross dissolve' },
  { id: 'dip-black', name: 'Dip to black' },
  { id: 'dip-white', name: 'Dip to white' },
  { id: 'wipe-left', name: 'Wipe left' },
  { id: 'wipe-right', name: 'Wipe right' },
  { id: 'slide-left', name: 'Slide left' },
  { id: 'slide-up', name: 'Slide up' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'blur', name: 'Blur dissolve' },
  { id: 'circle', name: 'Iris' },
];

export const FONTS: { name: string; css: string }[] = [
  { name: 'Sans', css: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { name: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  { name: 'Condensed', css: 'Impact, "Arial Narrow", "Roboto Condensed", sans-serif' },
  { name: 'Rounded', css: 'ui-rounded, "SF Pro Rounded", "Nunito", "Arial Rounded MT Bold", sans-serif' },
  { name: 'Mono', css: 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace' },
  { name: 'Script', css: '"Segoe Script", "Brush Script MT", "Bradley Hand", cursive' },
];

type TextTemplate = { id: string; name: string; clip: Partial<TextClip> };

const style = defaultTextStyle;

export const TEXT_TEMPLATES: TextTemplate[] = [
  {
    id: 'title',
    name: 'Title',
    clip: { name: 'Title', text: 'Your title', style: { ...style(), fontSize: 120, fontWeight: 800 }, animIn: 'fade', animOut: 'fade' },
  },
  {
    id: 'subtitle',
    name: 'Subtitle',
    clip: {
      name: 'Subtitle',
      text: 'Subtitle text goes here',
      duration: 3,
      style: { ...style(), fontSize: 48, fontWeight: 500, shadow: 0, backgroundOpacity: 0.6, backgroundPadding: 14 },
      transform: { x: 0, y: -0.38, scale: 1, rotation: 0, opacity: 1, fit: 'contain' },
      animIn: 'none',
      animOut: 'none',
    },
  },
  {
    id: 'lower',
    name: 'Lower third',
    clip: {
      name: 'Lower third',
      text: 'Alex Morgan\nDirector of photography',
      style: { ...style(), fontSize: 54, fontWeight: 700, align: 'left', backgroundOpacity: 0.75, background: '#111111', backgroundPadding: 22, shadow: 0 },
      transform: { x: -0.28, y: -0.3, scale: 1, rotation: 0, opacity: 1, fit: 'contain' },
      animIn: 'slide-left',
      animOut: 'fade',
    },
  },
  {
    id: 'caption',
    name: 'Bold caption',
    clip: {
      name: 'Caption',
      text: 'WAIT FOR IT',
      duration: 2.5,
      style: { ...style(), fontSize: 110, fontWeight: 900, uppercase: true, outlineWidth: 8, color: '#ffe14d', shadow: 0.6 },
      transform: { x: 0, y: -0.25, scale: 1, rotation: 0, opacity: 1, fit: 'contain' },
      animIn: 'pop',
      animOut: 'fade',
    },
  },
  {
    id: 'quote',
    name: 'Quote',
    clip: {
      name: 'Quote',
      text: '“Every frame\na painting.”',
      duration: 5,
      style: { ...style(), fontFamily: FONTS[1].css, fontSize: 92, fontWeight: 400, italic: true, shadow: 0.3 },
      animIn: 'blur-in',
      animOut: 'fade',
    },
  },
  {
    id: 'typewriter',
    name: 'Typewriter',
    clip: {
      name: 'Typewriter',
      text: 'Somewhere, late at night…',
      style: { ...style(), fontFamily: FONTS[4].css, fontSize: 64, fontWeight: 500, shadow: 0.2 },
      animIn: 'typewriter',
      animOut: 'fade',
      animDuration: 1.5,
    },
  },
  {
    id: 'chapter',
    name: 'Chapter',
    clip: {
      name: 'Chapter',
      text: 'CHAPTER ONE',
      style: { ...style(), fontSize: 72, fontWeight: 300, letterSpacing: 24, uppercase: true, shadow: 0 },
      animIn: 'tracking',
      animOut: 'fade',
      animDuration: 1.2,
    },
  },
];

export const PROJECT_FORMATS = [
  { name: '16:9 · 1080p', width: 1920, height: 1080 },
  { name: '16:9 · 4K', width: 3840, height: 2160 },
  { name: '16:9 · 720p', width: 1280, height: 720 },
  { name: '9:16 · Vertical', width: 1080, height: 1920 },
  { name: '1:1 · Square', width: 1080, height: 1080 },
  { name: '4:5 · Portrait', width: 1080, height: 1350 },
  { name: '2.39:1 · Scope', width: 1920, height: 804 },
];

export const FRAME_RATES = [23.976, 24, 25, 30, 50, 60];
