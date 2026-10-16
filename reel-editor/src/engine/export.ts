import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type VideoCodec,
  type WrappedCanvas,
} from 'mediabunny';
import type { MediaClip, MediaItem, Project } from '../model/types';
import { clipEnd, projectDuration, sourceTime, visualLayersAt } from '../model/timeline';
import { Renderer, type FrameSource } from './renderer';
import { buildClipChain, makeImpulse, scheduleEnvelope, trackAudible } from './audio';

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  quality: 'medium' | 'high' | 'very-high';
  container: 'mp4' | 'webm';
  start: number;
  end: number;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  videoCodec: string;
  audioCodec: string | null;
}

const QUALITY = { medium: QUALITY_MEDIUM, high: QUALITY_HIGH, 'very-high': QUALITY_VERY_HIGH };

export async function pickCodecs(container: 'mp4' | 'webm', width: number, height: number) {
  const video = await getFirstEncodableVideoCodec(container === 'mp4' ? ['avc', 'hevc', 'vp9', 'av1'] : ['vp9', 'vp8', 'av1'], {
    width,
    height,
  });
  const audio = await getFirstEncodableAudioCodec(container === 'mp4' ? ['aac', 'opus'] : ['opus', 'vorbis']);
  return { video, audio };
}

/** Render the project to a video file entirely in the browser. */
export async function exportProject(
  project: Project,
  media: Record<string, MediaItem>,
  opts: ExportOptions,
  onProgress: (p: number, stage: string) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const width = even(opts.width);
  const height = even(opts.height);
  const { video: videoCodec, audio: audioCodec } = await pickCodecs(opts.container, width, height);
  if (!videoCodec) throw new Error(`This browser cannot encode ${opts.container.toUpperCase()} video at ${width}×${height}.`);

  const start = Math.max(0, opts.start);
  const end = Math.min(opts.end, projectDuration(project));
  const frameCount = Math.max(1, Math.round((end - start) * opts.fps));
  const frameTimes = Array.from({ length: frameCount }, (_, i) => start + i / opts.fps);

  const canvas = document.createElement('canvas');
  const renderer = new Renderer(canvas, { preserveDrawingBuffer: true });
  renderer.setSize(width, height);

  const output = new Output({
    format: opts.container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, { codec: videoCodec as VideoCodec, quality: QUALITY[opts.quality], keyFrameInterval: 2 });
  output.addVideoTrack(videoSource, { frameRate: opts.fps });

  const audible = project.clips.some(
    (c) => c.type === 'media' && media[c.mediaId]?.hasAudio && !c.audio.muted && c.start < end && clipEnd(c) > start,
  );
  let audioSource: AudioBufferSource | null = null;
  if (audible && audioCodec) {
    audioSource = new AudioBufferSource({ codec: audioCodec as AudioCodec, quality: QUALITY[opts.quality] });
    output.addAudioTrack(audioSource);
  }

  const inputs = new Map<string, Input>();
  const inputFor = (m: MediaItem) => {
    let i = inputs.get(m.id);
    if (!i) {
      i = new Input({ source: new BlobSource(m.file), formats: ALL_FORMATS });
      inputs.set(m.id, i);
    }
    return i;
  };

  const frames = new ExportFrames(media);
  try {
    await output.start();

    if (audioSource) {
      onProgress(0, 'Mixing audio');
      const mix = await renderMix(project, media, start, end, inputFor, signal);
      check(signal);
      await audioSource.add(mix);
      audioSource.close();
    }

    // Plan which clips need which source frames, in render order.
    const plan: string[][] = [];
    const times = new Map<string, number[]>();
    const clips = new Map<string, MediaClip>();
    for (const t of frameTimes) {
      const needed: string[] = [];
      for (const layer of visualLayersAt(project, t)) {
        for (const c of [layer.clip, layer.transition?.from]) {
          if (!c || c.type !== 'media') continue;
          const m = media[c.mediaId];
          if (!m || m.kind !== 'video' || needed.includes(c.id)) continue;
          needed.push(c.id);
          clips.set(c.id, c);
          const st = Math.min(Math.max(0, sourceTime(c, t)), Math.max(0, m.duration - 0.001));
          (times.get(c.id) ?? times.set(c.id, []).get(c.id)!).push(st);
        }
      }
      plan.push(needed);
    }

    for (const [id, c] of clips) {
      const m = media[c.mediaId];
      const track = await inputFor(m).getPrimaryVideoTrack();
      if (!track) continue;
      const sink = new CanvasSink(track, { poolSize: 3 });
      frames.iterators.set(id, sink.canvasesAtTimestamps(times.get(id)!)[Symbol.asyncIterator]());
    }
    await frames.loadImages(project);

    for (let i = 0; i < frameCount; i++) {
      check(signal);
      for (const id of plan[i]) await frames.advance(id);
      renderer.render(project, frameTimes[i], frames);
      await videoSource.add(i / opts.fps, 1 / opts.fps);
      if (i % 3 === 0) onProgress(i / frameCount, 'Rendering video');
    }
    videoSource.close();
    onProgress(1, 'Finishing file');
    await output.finalize();
  } catch (err) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {});
    throw err;
  } finally {
    await frames.dispose();
    for (const i of inputs.values()) i.dispose();
    renderer.dispose();
  }

  const buffer = (output.target as BufferTarget).buffer!;
  const safeName = project.name.replace(/[^\w\- ]+/g, '').trim() || 'export';
  return {
    blob: new Blob([buffer], { type: opts.container === 'mp4' ? 'video/mp4' : 'video/webm' }),
    filename: `${safeName}.${opts.container}`,
    videoCodec,
    audioCodec: audioSource ? audioCodec : null,
  };
}

class ExportFrames implements FrameSource {
  iterators = new Map<string, AsyncIterator<WrappedCanvas | null>>();
  private current = new Map<string, WrappedCanvas>();
  private bitmaps = new Map<string, ImageBitmap>();

  constructor(private media: Record<string, MediaItem>) {}

  async loadImages(project: Project) {
    for (const c of project.clips) {
      if (c.type !== 'media') continue;
      const m = this.media[c.mediaId];
      if (m?.kind === 'image' && !this.bitmaps.has(m.id)) this.bitmaps.set(m.id, await createImageBitmap(m.file));
    }
  }

  async advance(clipId: string) {
    const it = this.iterators.get(clipId);
    if (!it) return;
    const r = await it.next();
    if (!r.done && r.value) this.current.set(clipId, r.value);
  }

  frame(clip: MediaClip) {
    const m = this.media[clip.mediaId];
    if (!m) return null;
    if (m.kind === 'image') {
      const b = this.bitmaps.get(m.id);
      return b ? { image: b, width: b.width, height: b.height, key: m.id } : null;
    }
    const w = this.current.get(clip.id);
    if (!w) return null;
    return { image: w.canvas as TexImageSource, width: w.canvas.width, height: w.canvas.height };
  }

  async dispose() {
    for (const it of this.iterators.values()) await it.return?.().catch(() => {});
    for (const b of this.bitmaps.values()) b.close();
  }
}

/** Offline mixdown of every audible clip using the same chain as playback. */
async function renderMix(
  project: Project,
  media: Record<string, MediaItem>,
  start: number,
  end: number,
  inputFor: (m: MediaItem) => Input,
  signal: AbortSignal,
): Promise<AudioBuffer> {
  const rate = 48000;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil((end - start) * rate)), rate);
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx);
  reverb.connect(ctx.destination);

  for (const clip of project.clips) {
    check(signal);
    if (clip.type !== 'media' || clip.audio.muted) continue;
    const m = media[clip.mediaId];
    const track = project.tracks.find((t) => t.id === clip.trackId);
    if (!m?.hasAudio || !trackAudible(project, track)) continue;
    const cStart = Math.max(clip.start, start);
    const cEnd = Math.min(clipEnd(clip), end);
    if (cEnd <= cStart) continue;

    const from = sourceTime(clip, cStart);
    const to = sourceTime(clip, cEnd);
    const audioTrack = await inputFor(m).getPrimaryAudioTrack();
    if (!audioTrack) continue;
    const sink = new AudioBufferSink(audioTrack);
    const parts: { buffer: AudioBuffer; timestamp: number }[] = [];
    for await (const part of sink.buffers(from, to)) parts.push(part);
    if (!parts.length) continue;

    const srcRate = parts[0].buffer.sampleRate;
    const channels = Math.min(2, parts[0].buffer.numberOfChannels);
    const t0 = parts[0].timestamp;
    const total = Math.ceil((parts[parts.length - 1].timestamp - t0) * srcRate) + parts[parts.length - 1].buffer.length;
    const merged = ctx.createBuffer(channels, Math.max(1, total), srcRate);
    for (const part of parts) {
      const offset = Math.max(0, Math.round((part.timestamp - t0) * srcRate));
      for (let ch = 0; ch < channels; ch++) {
        const src = part.buffer.getChannelData(Math.min(ch, part.buffer.numberOfChannels - 1));
        const room = merged.length - offset;
        merged.copyToChannel(room < src.length ? src.subarray(0, room) : src, ch, offset);
      }
    }

    const node = ctx.createBufferSource();
    node.buffer = merged;
    node.playbackRate.value = clip.speed;
    const chain = buildClipChain(ctx, reverb);
    chain.apply(clip.audio);
    const out = ctx.createGain();
    out.gain.value = track?.volume ?? 1;
    node.connect(chain.input);
    chain.output.connect(out).connect(ctx.destination);
    // Envelope is relative to the full clip, so schedule it at the clip's own start.
    scheduleEnvelope(chain.gain.gain, clip.audio, clip.start - start, clip.duration);
    const when = cStart - start;
    node.start(when, Math.max(0, from - t0), (cEnd - cStart) * clip.speed);
  }
  return ctx.startRendering();
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

function check(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
}
