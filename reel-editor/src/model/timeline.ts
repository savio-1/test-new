import type { Clip, MediaClip, Project, TextClip, Track } from './types';

export const clipEnd = (c: Clip) => c.start + c.duration;

export const projectDuration = (p: Project) => p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);

export const trackById = (p: Project, id: string) => p.tracks.find((t) => t.id === id);

export const clipsOnTrack = (p: Project, trackId: string) =>
  p.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);

/** Source time (seconds into the media file) for a timeline time inside a media clip. */
export const sourceTime = (clip: MediaClip, t: number) => clip.inPoint + (t - clip.start) * clip.speed;

/** The clip on the same track that ends where `clip` starts (within half a frame). */
export const previousAdjacent = (p: Project, clip: Clip, eps = 0.02): Clip | undefined =>
  p.clips.find((c) => c.trackId === clip.trackId && c.id !== clip.id && Math.abs(clipEnd(c) - clip.start) < eps);

export interface VisualLayer {
  track: Track;
  clip: MediaClip | TextClip;
  time: number; // timeline time this layer is rendered at
  /** When a transition is running into `clip`, the outgoing clip and the progress 0..1. */
  transition?: { from: MediaClip | TextClip | null; fromTime: number; progress: number };
}

/**
 * Everything visible at timeline time `t`, bottom of the stack first.
 * Transitions extend the outgoing clip past its end (holding handles from the
 * source file when available).
 */
export function visualLayersAt(p: Project, t: number): VisualLayer[] {
  const layers: VisualLayer[] = [];
  for (const track of p.tracks) {
    if (track.kind === 'audio' || track.hidden) continue;
    const clip = p.clips.find((c) => c.trackId === track.id && t >= c.start && t < clipEnd(c)) as
      | MediaClip
      | TextClip
      | undefined;
    if (!clip) continue;
    const layer: VisualLayer = { track, clip, time: t };
    const tr = clip.transitionIn;
    if (tr && tr.type !== 'none' && tr.duration > 0 && t - clip.start < tr.duration) {
      const from = (previousAdjacent(p, clip) as MediaClip | TextClip | undefined) ?? null;
      layer.transition = { from, fromTime: t, progress: (t - clip.start) / tr.duration };
    }
    layers.push(layer);
  }
  return layers;
}

/** Find a free start time on a track at or after `t` for a clip of `duration`. */
export function freeSlot(p: Project, trackId: string, t: number, duration: number, ignoreId?: string) {
  const clips = clipsOnTrack(p, trackId).filter((c) => c.id !== ignoreId);
  let start = Math.max(0, t);
  for (const c of clips) {
    if (start + duration <= c.start + 1e-6) break;
    if (start < clipEnd(c) - 1e-6) start = clipEnd(c);
  }
  return start;
}

export function overlaps(p: Project, trackId: string, start: number, duration: number, ignoreId?: string) {
  return p.clips.some(
    (c) => c.trackId === trackId && c.id !== ignoreId && start < clipEnd(c) - 1e-6 && start + duration > c.start + 1e-6,
  );
}

export const formatTime = (t: number, fps: number) => {
  const sign = t < 0 ? '-' : '';
  t = Math.abs(t);
  const f = Math.floor((t % 1) * fps + 1e-6);
  const s = Math.floor(t) % 60;
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  const pad = (n: number, l = 2) => n.toString().padStart(l, '0');
  return `${sign}${h > 0 ? `${h}:` : ''}${pad(m)}:${pad(s)}:${pad(f)}`;
};

export const snapToFrame = (t: number, fps: number) => Math.round(t * fps) / fps;
