import type { AudioSettings, Clip, Project, Track } from '../model/types';

/**
 * Per-clip processing chain, shared by live playback and offline export:
 * gain (volume + fades) -> 3-band EQ -> clean-up filters -> voice presence
 * -> compressor -> pan -> out, with a reverb send after the pan.
 */
export interface ClipChain {
  input: AudioNode;
  output: AudioNode;
  gain: GainNode;
  apply(a: AudioSettings): void;
  disconnect(): void;
}

export function buildClipChain(ctx: BaseAudioContext, reverbBus: AudioNode | null): ClipChain {
  const gain = ctx.createGain();
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 220;
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1800;
  mid.Q.value = 0.9;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 6500;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 1;
  const comp = ctx.createDynamicsCompressor();
  const pan = ctx.createStereoPanner();
  const out = ctx.createGain();
  const send = ctx.createGain();

  gain.connect(low).connect(mid).connect(high).connect(hp).connect(lp).connect(presence).connect(comp).connect(pan).connect(out);
  if (reverbBus) pan.connect(send).connect(reverbBus);

  const apply = (a: AudioSettings) => {
    low.gain.value = a.eqLow;
    mid.gain.value = a.eqMid;
    high.gain.value = a.eqHigh;
    hp.frequency.value = a.voice ? Math.max(90, 20 + a.denoise * 140) : 20 + a.denoise * 140;
    lp.frequency.value = 20000 - a.denoise * 11000;
    presence.gain.value = a.voice ? 4 : 0;
    if (a.voice) {
      comp.threshold.value = -24;
      comp.ratio.value = 3.5;
      comp.knee.value = 10;
      comp.attack.value = 0.005;
      comp.release.value = 0.2;
    } else {
      comp.threshold.value = 0;
      comp.ratio.value = 1;
      comp.knee.value = 0;
    }
    pan.pan.value = a.pan;
    send.gain.value = a.reverb * 0.9;
  };

  return {
    input: gain,
    output: out,
    gain,
    apply,
    disconnect: () => {
      for (const n of [gain, low, mid, high, hp, lp, presence, comp, pan, out, send]) n.disconnect();
    },
  };
}

export const dbToGain = (db: number) => (db <= -60 ? 0 : Math.pow(10, db / 20));

/** Volume envelope (volume + fades + mute) at clip-local time. */
export function envelope(a: AudioSettings, local: number, duration: number) {
  if (a.muted) return 0;
  let g = dbToGain(a.volume);
  if (a.fadeIn > 0 && local < a.fadeIn) g *= Math.max(0, local / a.fadeIn);
  if (a.fadeOut > 0 && local > duration - a.fadeOut) g *= Math.max(0, (duration - local) / a.fadeOut);
  return g;
}

/** Schedule the volume envelope as automation (offline rendering). */
export function scheduleEnvelope(param: AudioParam, a: AudioSettings, start: number, duration: number) {
  const v = a.muted ? 0 : dbToGain(a.volume);
  const fi = Math.min(a.fadeIn, duration / 2);
  const fo = Math.min(a.fadeOut, duration / 2);
  param.setValueAtTime(fi > 0 ? 0 : v, Math.max(0, start));
  if (fi > 0) param.linearRampToValueAtTime(v, start + fi);
  if (fo > 0) {
    param.setValueAtTime(v, start + duration - fo);
    param.linearRampToValueAtTime(0, start + duration);
  }
}

export function makeImpulse(ctx: BaseAudioContext, seconds = 2.4, decay = 3) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/** Is this track audible, taking mute and solo into account? */
export function trackAudible(project: Project, track: Track | undefined) {
  if (!track || track.muted) return false;
  const anySolo = project.tracks.some((t) => t.solo);
  return !anySolo || track.solo;
}

/** Does this clip contribute audio? */
export function clipHasAudio(clip: Clip, hasAudio: (mediaId: string) => boolean) {
  return clip.type === 'media' && !clip.audio.muted && hasAudio(clip.mediaId);
}
