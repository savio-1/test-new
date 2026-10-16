import { create } from 'zustand';
import { produce } from 'immer';
import type { Clip, MediaClip, MediaItem, Project, TextClip, TrackKind } from '../model/types';
import { makeMediaClip, makeTextClip, makeTrack, newProject, uid } from '../model/defaults';
import { clipEnd, freeSlot, overlaps, projectDuration, snapToFrame } from '../model/timeline';
import { TEXT_TEMPLATES } from '../model/presets';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 900;

export interface EditorState {
  project: Project;
  media: Record<string, MediaItem>;
  selectedClipId: string | null;
  playhead: number;
  playing: boolean;
  zoom: number; // timeline pixels per second
  snapping: boolean;
  exportOpen: boolean;
  past: Project[];
  future: Project[];
  lastCoalesce: { key: string; at: number } | null;

  update: (recipe: (p: Project) => void, coalesceKey?: string) => void;
  updateClip: <T extends Clip = Clip>(id: string, recipe: (c: T) => void, coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;

  addMedia: (item: MediaItem) => void;
  patchMedia: (id: string, patch: Partial<MediaItem>) => void;
  removeMedia: (id: string) => void;

  setPlayhead: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  select: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  setSnapping: (on: boolean) => void;
  setExportOpen: (open: boolean) => void;

  addClipFromMedia: (mediaId: string, trackId?: string, start?: number) => string | null;
  addTextClip: (templateId?: string, start?: number) => string;
  moveClip: (id: string, trackId: string, start: number) => void;
  trimClip: (id: string, side: 'start' | 'end', t: number) => void;
  splitAtPlayhead: () => void;
  deleteSelected: (ripple?: boolean) => void;
  duplicateSelected: () => void;
  addTrack: (kind: TrackKind) => void;
  removeTrack: (id: string) => void;

  loadProject: (project: Project, media: Record<string, MediaItem>) => void;
}

const kindForMedia = (m: MediaItem): TrackKind => (m.kind === 'audio' ? 'audio' : 'video');

export const useEditor = create<EditorState>((set, get) => ({
  project: newProject(),
  media: {},
  selectedClipId: null,
  playhead: 0,
  playing: false,
  zoom: 60,
  snapping: true,
  exportOpen: false,
  past: [],
  future: [],
  lastCoalesce: null,

  update: (recipe, coalesceKey) => {
    const { project, past, lastCoalesce } = get();
    const next = produce(project, recipe);
    if (next === project) return;
    const now = performance.now();
    const coalesce = !!coalesceKey && lastCoalesce?.key === coalesceKey && now - lastCoalesce.at < COALESCE_MS;
    set({
      project: next,
      past: coalesce ? past : [...past.slice(-HISTORY_LIMIT + 1), project],
      future: [],
      lastCoalesce: coalesceKey ? { key: coalesceKey, at: now } : null,
    });
  },

  updateClip: (id, recipe, coalesceKey) =>
    get().update((p) => {
      const c = p.clips.find((x) => x.id === id);
      if (c) recipe(c as never);
    }, coalesceKey && `${id}:${coalesceKey}`),

  undo: () => {
    const { past, future, project, selectedClipId } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({
      project: prev,
      past: past.slice(0, -1),
      future: [project, ...future],
      lastCoalesce: null,
      selectedClipId: prev.clips.some((c) => c.id === selectedClipId) ? selectedClipId : null,
    });
  },

  redo: () => {
    const { past, future, project } = get();
    if (!future.length) return;
    set({ project: future[0], past: [...past, project], future: future.slice(1), lastCoalesce: null });
  },

  addMedia: (item) => set((s) => ({ media: { ...s.media, [item.id]: item } })),
  patchMedia: (id, patch) =>
    set((s) => (s.media[id] ? { media: { ...s.media, [id]: { ...s.media[id], ...patch } } } : {})),
  removeMedia: (id) => {
    get().update((p) => {
      p.clips = p.clips.filter((c) => !(c.type === 'media' && c.mediaId === id));
    });
    set((s) => {
      const media = { ...s.media };
      delete media[id];
      return { media };
    });
  },

  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (playing) => set({ playing }),
  select: (id) => set({ selectedClipId: id }),
  setZoom: (zoom) => set({ zoom: Math.min(400, Math.max(4, zoom)) }),
  setSnapping: (snapping) => set({ snapping }),
  setExportOpen: (exportOpen) => set({ exportOpen }),

  addClipFromMedia: (mediaId, trackId, start) => {
    const { media, project, playhead } = get();
    const m = media[mediaId];
    if (!m) return null;
    const kind = kindForMedia(m);
    let tracks = project.tracks.filter((t) => t.kind === kind);
    if (!tracks.length) {
      // Recreate a missing track type so dropping media always works.
      const track = makeTrack(kind, 1);
      get().update((p) => {
        if (kind === 'audio') p.tracks.push(track);
        else p.tracks.unshift(track);
      });
      tracks = [track];
    }
    if (trackId) tracks = tracks.filter((t) => t.id === trackId);
    if (!tracks.length) return null;
    const fps = project.settings.fps;
    const probe = makeMediaClip(m, tracks[0].id, 0);
    const target = tracks[0];
    let at: number;
    const trackEmpty = !project.clips.some((c) => c.trackId === target.id);
    if (start !== undefined) {
      at = freeSlot(project, target.id, snapToFrame(start, fps), probe.duration);
    } else if (kind === 'audio' && trackEmpty) {
      at = 0; // music usually runs from the top
    } else if (!overlaps(project, target.id, snapToFrame(playhead, fps), probe.duration)) {
      // Main track: at the playhead when there is room, otherwise appended to the end.
      at = snapToFrame(playhead, fps);
    } else {
      at = project.clips.filter((c) => c.trackId === target.id).reduce((e, c) => Math.max(e, clipEnd(c)), 0);
    }
    const clip = { ...probe, trackId: target.id, start: at };
    get().update((p) => {
      p.clips.push(clip);
    });
    // Without an explicit position, move on so the next add lands after this clip.
    set({ selectedClipId: clip.id, ...(start === undefined && kind !== 'audio' ? { playhead: clipEnd(clip) } : {}) });
    return clip.id;
  },

  addTextClip: (templateId, start) => {
    const { project, playhead } = get();
    let track = project.tracks.find((t) => t.kind === 'text');
    const template = TEXT_TEMPLATES.find((t) => t.id === templateId) ?? TEXT_TEMPLATES[0];
    const probe = makeTextClip('', 0, structuredClone(template.clip));
    let newTrack = null;
    if (!track) {
      newTrack = makeTrack('text', 1);
      track = newTrack;
    }
    const at = freeSlot(project, track.id, snapToFrame(start ?? playhead, project.settings.fps), probe.duration);
    const clip: TextClip = { ...probe, trackId: track.id, start: at };
    get().update((p) => {
      if (newTrack) p.tracks.push(newTrack);
      p.clips.push(clip);
    });
    set({ selectedClipId: clip.id });
    return clip.id;
  },

  moveClip: (id, trackId, start) => {
    const { project } = get();
    const clip = project.clips.find((c) => c.id === id);
    const track = project.tracks.find((t) => t.id === trackId);
    if (!clip || !track) return;
    const m = clip.type === 'media' ? get().media[clip.mediaId] : undefined;
    const allowed: TrackKind[] = clip.type === 'text' ? ['text', 'video'] : m?.kind === 'audio' ? ['audio'] : ['video'];
    if (!allowed.includes(track.kind)) return;
    start = Math.max(0, snapToFrame(start, project.settings.fps));
    if (overlaps(project, trackId, start, clip.duration, id)) return;
    get().update((p) => {
      const c = p.clips.find((x) => x.id === id)!;
      c.trackId = trackId;
      c.start = start;
    }, `move:${id}`);
  },

  trimClip: (id, side, t) => {
    const { project, media } = get();
    const clip = project.clips.find((c) => c.id === id);
    if (!clip) return;
    const fps = project.settings.fps;
    const minDur = 1 / fps;
    t = snapToFrame(t, fps);
    const m = clip.type === 'media' ? media[clip.mediaId] : undefined;
    const limited = !!m && m.kind !== 'image';
    const others = project.clips.filter((c) => c.trackId === clip.trackId && c.id !== id);
    get().update((p) => {
      const c = p.clips.find((x) => x.id === id)!;
      if (side === 'start') {
        const end = clipEnd(c);
        let start = Math.min(t, end - minDur);
        const prevEnd = others.filter((o) => clipEnd(o) <= c.start + 1e-6).reduce((e, o) => Math.max(e, clipEnd(o)), 0);
        start = Math.max(start, prevEnd);
        if (c.type === 'media') {
          let inPoint = c.inPoint + (start - c.start) * c.speed;
          if (limited && inPoint < 0) {
            start -= inPoint / c.speed;
            inPoint = 0;
          }
          if (!limited) inPoint = 0;
          c.inPoint = inPoint;
        }
        c.duration = end - start;
        c.start = start;
      } else {
        let end = Math.max(t, c.start + minDur);
        const nextStart = others.filter((o) => o.start >= clipEnd(c) - 1e-6).reduce((s, o) => Math.min(s, o.start), Infinity);
        end = Math.min(end, nextStart);
        if (c.type === 'media' && limited) {
          const maxEnd = c.start + (m!.duration - c.inPoint) / c.speed;
          end = Math.min(end, maxEnd);
        }
        c.duration = end - c.start;
      }
    }, `trim:${id}:${side}`);
  },

  splitAtPlayhead: () => {
    const { project, playhead, selectedClipId } = get();
    const t = snapToFrame(playhead, project.settings.fps);
    const under = project.clips.filter((c) => t > c.start + 1e-3 && t < clipEnd(c) - 1e-3);
    const selected = under.find((c) => c.id === selectedClipId);
    const targets = selected ? [selected] : under;
    if (!targets.length) return;
    let rightId: string | null = null;
    get().update((p) => {
      for (const target of targets) {
        const c = p.clips.find((x) => x.id === target.id)!;
        const leftDur = t - c.start;
        const right = structuredClone(target) as Clip; // clone the plain clip, not the immer draft
        right.id = uid('clp');
        right.start = t;
        right.duration = c.duration - leftDur;
        right.transitionIn = { ...right.transitionIn, type: 'none' };
        if (right.type === 'media' && c.type === 'media') {
          right.inPoint = c.inPoint + leftDur * c.speed;
          right.audio.fadeIn = 0;
          c.audio.fadeOut = 0;
        }
        c.duration = leftDur;
        p.clips.push(right);
        if (target.id === selectedClipId) rightId = right.id;
      }
    });
    if (rightId) set({ selectedClipId: rightId });
  },

  deleteSelected: (ripple = false) => {
    const { selectedClipId, project } = get();
    const clip = project.clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    get().update((p) => {
      p.clips = p.clips.filter((c) => c.id !== clip.id);
      if (ripple) {
        for (const c of p.clips) if (c.trackId === clip.trackId && c.start >= clipEnd(clip) - 1e-6) c.start -= clip.duration;
      }
    });
    set({ selectedClipId: null });
  },

  duplicateSelected: () => {
    const { selectedClipId, project } = get();
    const clip = project.clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const copy = structuredClone(clip) as Clip;
    copy.id = uid('clp');
    copy.start = freeSlot(project, clip.trackId, clipEnd(clip), clip.duration);
    get().update((p) => {
      p.clips.push(copy);
    });
    set({ selectedClipId: copy.id });
  },

  addTrack: (kind) =>
    get().update((p) => {
      const n = p.tracks.filter((t) => t.kind === kind).length + 1;
      const track = makeTrack(kind, n);
      if (kind === 'audio') p.tracks.push(track);
      else {
        // Visual tracks go above the existing visual tracks.
        const lastVisual = p.tracks.map((t) => t.kind !== 'audio').lastIndexOf(true);
        p.tracks.splice(lastVisual + 1, 0, track);
      }
    }),

  removeTrack: (id) =>
    get().update((p) => {
      p.tracks = p.tracks.filter((t) => t.id !== id);
      p.clips = p.clips.filter((c) => c.trackId !== id);
    }),

  loadProject: (project, media) =>
    set({ project, media, past: [], future: [], selectedClipId: null, playhead: 0, playing: false, lastCoalesce: null }),
}));

export const selectedClip = (s: EditorState) => s.project.clips.find((c) => c.id === s.selectedClipId) ?? null;
export const timelineDuration = (s: EditorState) => projectDuration(s.project);
export type { MediaClip, TextClip };
