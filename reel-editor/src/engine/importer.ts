import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import type { MediaItem, MediaKind } from '../model/types';
import { uid } from '../model/defaults';

const EXT_KIND: Record<string, MediaKind> = {
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', m4v: 'video', avi: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', opus: 'audio', flac: 'audio',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', avif: 'image', bmp: 'image',
};

export function kindOf(file: File): MediaKind | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_KIND[ext] ?? null;
}

const once = <T extends Event>(el: EventTarget, ok: string, fail = 'error') =>
  new Promise<T>((resolve, reject) => {
    const onOk = (e: Event) => {
      cleanup();
      resolve(e as T);
    };
    const onFail = () => {
      cleanup();
      reject(new Error('This file could not be decoded by the browser.'));
    };
    const cleanup = () => {
      el.removeEventListener(ok, onOk);
      el.removeEventListener(fail, onFail);
    };
    el.addEventListener(ok, onOk);
    el.addEventListener(fail, onFail);
  });

function thumbFrom(source: CanvasImageSource, w: number, h: number) {
  const tw = 192;
  const th = Math.max(1, Math.round((tw * h) / Math.max(1, w)));
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = Math.min(th, 192);
  const ctx = c.getContext('2d')!;
  const scale = Math.max(c.width / w, c.height / h);
  ctx.drawImage(source, (c.width - w * scale) / 2, (c.height - h * scale) / 2, w * scale, h * scale);
  return c.toDataURL('image/jpeg', 0.75);
}

async function hasAudioTrack(file: File) {
  try {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    return !!(await input.getPrimaryAudioTrack());
  } catch {
    return false;
  }
}

/** Probe a file and build a MediaItem. `id` lets persisted media keep their ids. */
export async function importFile(file: File, id = uid('med')): Promise<MediaItem> {
  const kind = kindOf(file);
  if (!kind) throw new Error(`${file.name}: unsupported file type.`);
  const url = URL.createObjectURL(file);
  const base = { id, name: file.name, kind, url, file };

  try {
    if (kind === 'image') {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { ...base, duration: 0, width: img.naturalWidth, height: img.naturalHeight, hasAudio: false, thumbnail: thumbFrom(img, img.naturalWidth, img.naturalHeight) };
    }

    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'auto';
    el.muted = true;
    el.src = url;
    await once(el, 'loadedmetadata');
    let duration = el.duration;
    if (!isFinite(duration)) {
      // Some recordings (e.g. MediaRecorder WebM) report Infinity until fully scanned.
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
      duration = await input.computeDuration();
    }
    if (kind === 'audio') {
      return { ...base, duration, width: 0, height: 0, hasAudio: true };
    }
    const v = el as HTMLVideoElement;
    v.currentTime = Math.min(1, duration * 0.1);
    await once(v, 'seeked');
    const thumbnail = thumbFrom(v, v.videoWidth, v.videoHeight);
    const hasAudio = await hasAudioTrack(file);
    v.removeAttribute('src');
    v.load();
    return { ...base, duration, width: v.videoWidth, height: v.videoHeight, hasAudio, thumbnail };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw new Error(`${file.name}: ${(err as Error).message}`);
  }
}

/** Waveform peaks, `perSecond` buckets per second of audio, normalised to 0..1. */
export async function computePeaks(file: File, perSecond = 50): Promise<number[]> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) return [];
  const sink = new AudioBufferSink(track);
  const peaks: number[] = [];
  for await (const { buffer, timestamp } of sink.buffers()) {
    const data = buffer.getChannelData(0);
    const rate = buffer.sampleRate;
    for (let i = 0; i < data.length; i += 64) {
      const bucket = Math.floor((timestamp + i / rate) * perSecond);
      if (bucket < 0) continue;
      let m = 0;
      for (let j = i; j < Math.min(i + 64, data.length); j++) m = Math.max(m, Math.abs(data[j]));
      while (peaks.length <= bucket) peaks.push(0);
      if (m > peaks[bucket]) peaks[bucket] = m;
    }
  }
  let max = 0.01;
  for (const p of peaks) if (p > max) max = p;
  return peaks.map((p) => Math.round((p / max) * 1000) / 1000);
}

/** Parse an Adobe/Resolve .cube 3D LUT. */
export function parseCube(text: string): { size: number; data: number[] } {
  let size = 0;
  const data: number[] = [];
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const key = parts[0].toUpperCase();
    if (key === 'LUT_3D_SIZE') size = parseInt(parts[1], 10);
    else if (key === 'DOMAIN_MIN') min = parts.slice(1, 4).map(Number);
    else if (key === 'DOMAIN_MAX') max = parts.slice(1, 4).map(Number);
    else if (key === 'TITLE' || key === 'LUT_1D_SIZE' || /^[A-Z_]+$/.test(key)) {
      if (key === 'LUT_1D_SIZE') throw new Error('1D LUTs are not supported; use a 3D .cube LUT.');
    } else if (parts.length >= 3) {
      for (let i = 0; i < 3; i++) data.push((Number(parts[i]) - min[i]) / (max[i] - min[i] || 1));
    }
  }
  if (!size || data.length !== size * size * size * 3) throw new Error('Invalid .cube file.');
  return { size, data };
}
