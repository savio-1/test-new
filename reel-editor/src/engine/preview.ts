import type { MediaClip, MediaItem, Project } from '../model/types';
import { clipEnd, previousAdjacent, sourceTime } from '../model/timeline';
import type { FrameSource } from './renderer';
import { buildClipChain, envelope, makeImpulse, trackAudible, type ClipChain } from './audio';

interface Entry {
  el: HTMLVideoElement;
  mediaId: string;
  chain?: ClipChain;
  source?: MediaElementAudioSourceNode;
  lastUsed: number;
  seeking: boolean;
  routedTrack?: string;
}

const PREROLL = 1.5; // seconds: prepare upcoming clips ahead of the playhead
const RESYNC = 0.3; // seconds of drift tolerated while playing

/**
 * Drives playback for the viewer: one media element per clip, kept in sync
 * with the timeline clock, with audio routed through the clip chain.
 */
export class PreviewEngine implements FrameSource {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private reverb: ConvolverNode | null = null;
  private trackGains = new Map<string, GainNode>();
  private entries = new Map<string, Entry>();
  private images = new Map<string, HTMLImageElement>();
  private media: Record<string, MediaItem> = {};
  private meterBuf: Float32Array<ArrayBuffer> | null = null;
  onFrameReady: () => void = () => {};

  /** Create the audio graph; must be called from a user gesture. */
  ensureAudio() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx);
    this.reverb.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    for (const [id, e] of this.entries) this.connectAudio(id, e);
  }

  /** Peak level of the master bus, 0..1. */
  level() {
    if (!this.analyser) return 0;
    if (!this.meterBuf) this.meterBuf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this.meterBuf);
    let peak = 0;
    for (const v of this.meterBuf) peak = Math.max(peak, Math.abs(v));
    return peak;
  }

  setMedia(media: Record<string, MediaItem>) {
    this.media = media;
  }

  frame(clip: MediaClip) {
    const m = this.media[clip.mediaId];
    if (!m) return null;
    if (m.kind === 'image') {
      let img = this.images.get(m.id);
      if (!img) {
        img = new Image();
        img.decoding = 'async';
        img.onload = () => this.onFrameReady();
        img.src = m.url;
        this.images.set(m.id, img);
      }
      return img.complete && img.naturalWidth ? { image: img, width: img.naturalWidth, height: img.naturalHeight, key: m.id } : null;
    }
    const e = this.entries.get(clip.id);
    if (!e || e.el.readyState < 2 || !e.el.videoWidth) return null;
    return { image: e.el, width: e.el.videoWidth, height: e.el.videoHeight };
  }

  /** Bring every element in line with timeline time `t`. Call every frame while playing and on every seek. */
  sync(project: Project, t: number, playing: boolean) {
    const now = performance.now();
    const fps = project.settings.fps;
    const wanted = new Map<string, { clip: MediaClip; active: boolean; audible: boolean }>();

    for (const c of project.clips) {
      if (c.type !== 'media') continue;
      const m = this.media[c.mediaId];
      if (!m || m.kind === 'image') continue;
      const track = project.tracks.find((tr) => tr.id === c.trackId);
      if (!track) continue;
      const inRange = t >= c.start && t < clipEnd(c);
      const visualTrack = track.kind !== 'audio';
      if (inRange) {
        wanted.set(c.id, { clip: c, active: true, audible: trackAudible(project, track) });
        // Outgoing clip of a running transition keeps playing past its end, silently.
        if (visualTrack && c.transitionIn.type !== 'none' && t - c.start < c.transitionIn.duration) {
          const prev = previousAdjacent(project, c);
          if (prev && prev.type === 'media') wanted.set(prev.id, { clip: prev, active: true, audible: false });
        }
      } else if (c.start > t && c.start - t < PREROLL) {
        if (!wanted.has(c.id)) wanted.set(c.id, { clip: c, active: false, audible: false });
      }
    }

    for (const [id, w] of wanted) {
      let e = this.entries.get(id);
      if (!e || e.mediaId !== w.clip.mediaId) {
        if (e) this.destroy(id, e);
        e = this.create(id, w.clip);
      }
      e.lastUsed = now;
      const m = this.media[w.clip.mediaId];
      const st = w.active ? Math.min(Math.max(0, sourceTime(w.clip, t)), Math.max(0, m.duration - 0.001)) : w.clip.inPoint;
      const el = e.el;
      if (el.playbackRate !== w.clip.speed) el.playbackRate = w.clip.speed;

      if (playing && w.active) {
        if (el.paused) {
          if (Math.abs(el.currentTime - st) > 0.05) el.currentTime = st;
          void el.play().catch(() => {});
        } else if (Math.abs(el.currentTime - st) > RESYNC) {
          el.currentTime = st;
        }
      } else {
        if (!el.paused) el.pause();
        if (!e.seeking && Math.abs(el.currentTime - st) > 0.5 / fps) {
          e.seeking = true;
          el.currentTime = st;
        }
      }

      if (e.chain && this.ctx) {
        const local = t - w.clip.start;
        const g = w.active && w.audible && t < clipEnd(w.clip) ? envelope(w.clip.audio, local, w.clip.duration) : 0;
        e.chain.apply(w.clip.audio);
        e.chain.gain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.012);
        const tg = this.trackGain(w.clip.trackId);
        const track = project.tracks.find((tr) => tr.id === w.clip.trackId);
        tg.gain.value = track ? track.volume : 1;
        if (e.routedTrack !== w.clip.trackId) {
          e.chain.output.disconnect();
          e.chain.output.connect(tg);
          e.routedTrack = w.clip.trackId;
        }
      }
    }

    // Pause what is no longer needed, and free elements unused for a while.
    for (const [id, e] of this.entries) {
      if (wanted.has(id)) continue;
      if (!e.el.paused) e.el.pause();
      if (e.chain && this.ctx) e.chain.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      if (now - e.lastUsed > 8000) this.destroy(id, e);
    }
  }

  pauseAll() {
    for (const e of this.entries.values()) {
      if (!e.el.paused) e.el.pause();
      if (e.chain && this.ctx) e.chain.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
    }
  }

  dispose() {
    for (const [id, e] of this.entries) this.destroy(id, e);
    void this.ctx?.close();
  }

  private trackGain(trackId: string) {
    let g = this.trackGains.get(trackId);
    if (!g) {
      g = this.ctx!.createGain();
      g.connect(this.master!);
      this.trackGains.set(trackId, g);
    }
    return g;
  }

  private create(id: string, clip: MediaClip): Entry {
    const m = this.media[clip.mediaId];
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.src = m.url;
    const e: Entry = { el, mediaId: clip.mediaId, lastUsed: performance.now(), seeking: false };
    el.addEventListener('seeked', () => {
      e.seeking = false;
      this.onFrameReady();
    });
    el.addEventListener('loadeddata', () => this.onFrameReady());
    this.entries.set(id, e);
    if (this.ctx) this.connectAudio(id, e);
    return e;
  }

  private connectAudio(_id: string, e: Entry) {
    if (!this.ctx || e.source) return;
    const m = this.media[e.mediaId];
    if (!m?.hasAudio) return;
    e.source = this.ctx.createMediaElementSource(e.el);
    e.chain = buildClipChain(this.ctx, this.reverb);
    e.chain.gain.gain.value = 0;
    e.source.connect(e.chain.input);
    e.el.muted = false;
  }

  private destroy(id: string, e: Entry) {
    e.el.pause();
    e.el.removeAttribute('src');
    e.el.load();
    e.source?.disconnect();
    e.chain?.disconnect();
    this.entries.delete(id);
  }
}
