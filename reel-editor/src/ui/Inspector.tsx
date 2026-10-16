import { useRef } from 'react';
import { Clipboard, ClipboardPaste, Copy, Layers, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { useEditor, selectedClip } from '../state/store';
import type { AudioSettings, ColorSettings, EffectInstance, FilmSettings, MediaClip, TextClip, Transform, TextStyle } from '../model/types';
import { defaultColor, defaultFilm, defaultTransform, uid } from '../model/defaults';
import {
  COLOR_LOOKS,
  EFFECTS,
  FILM_STOCKS,
  FONTS,
  FRAME_RATES,
  PROJECT_FORMATS,
  TRANSITIONS,
  effectById,
} from '../model/presets';
import { clipEnd, formatTime } from '../model/timeline';
import { ColorField, ColorWheel, Section, Segmented, Select, Slider, Toggle } from './controls';
import { importLut } from './importFiles';
import { clearAll } from '../state/persist';
import { newProject } from '../model/defaults';
import { notify } from '../state/toasts';

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;
const pct0 = (v: number) => `${Math.round(v * 100)}%`;
const secs = (v: number) => `${v.toFixed(2)}s`;

// Copy/paste of a whole look (colour + film + effects) between clips.
let lookClipboard: { color: ColorSettings; film: FilmSettings; effects: EffectInstance[] } | null = null;

export function Inspector() {
  const clip = useEditor(selectedClip);
  const media = useEditor((s) => (clip && clip.type === 'media' ? s.media[clip.mediaId] : undefined));
  const track = useEditor((s) => (clip ? s.project.tracks.find((t) => t.id === clip.trackId) : undefined));

  if (!clip) return <ProjectPanel />;

  return (
    <aside className="inspector">
      <ClipHeader clipId={clip.id} name={clip.name} start={clip.start} duration={clip.duration} />
      <div className="inspector-scroll">
        {clip.type === 'text' && <TextPanels clip={clip} />}
        {clip.type === 'media' && media?.kind !== 'audio' && track?.kind !== 'audio' && (
          <>
            <LookPanel clip={clip} />
            <ColorPanel clip={clip} />
            <EffectsPanel clip={clip} />
            <TransformPanel id={clip.id} transform={clip.transform} media />
          </>
        )}
        {clip.type === 'media' && <TimingPanel clip={clip} />}
        {clip.type === 'media' && media?.hasAudio && <AudioPanel clip={clip} />}
      </div>
    </aside>
  );
}

function ClipHeader({ clipId, name, start, duration }: { clipId: string; name: string; start: number; duration: number }) {
  const updateClip = useEditor((s) => s.updateClip);
  const fps = useEditor((s) => s.project.settings.fps);
  const del = useEditor((s) => s.deleteSelected);
  const dup = useEditor((s) => s.duplicateSelected);
  const select = useEditor((s) => s.select);
  return (
    <div className="clip-header">
      <input
        className="name-input"
        value={name}
        aria-label="Clip name"
        onChange={(e) => updateClip(clipId, (c) => void (c.name = e.target.value), 'name')}
      />
      <div className="clip-meta">
        <span>{formatTime(start, fps)}</span>
        <span className="dim">→ {formatTime(start + duration, fps)}</span>
        <span className="dim">({duration.toFixed(2)}s)</span>
      </div>
      <div className="clip-header-btns">
        <button className="icon-btn" title="Duplicate" onClick={dup}>
          <Copy size={14} />
        </button>
        <button className="icon-btn danger" title="Delete clip" onClick={() => del()}>
          <Trash2 size={14} />
        </button>
        <button className="icon-btn" title="Close (Esc)" onClick={() => select(null)}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Film look
// ---------------------------------------------------------------------------

function LookPanel({ clip }: { clip: MediaClip }) {
  const updateClip = useEditor((s) => s.updateClip);
  const f = clip.film;
  const set = (patch: Partial<FilmSettings>, key: string) =>
    updateClip<MediaClip>(clip.id, (c) => void Object.assign(c.film, patch), `film.${key}`);
  const pick = (id: string) =>
    updateClip<MediaClip>(clip.id, (c) => {
      const stock = FILM_STOCKS.find((s) => s.id === id);
      c.film.stock = id;
      if (stock) Object.assign(c.film, { ...defaultFilm(), stock: id, strength: c.film.strength || 1 }, stock.suggested);
    });
  return (
    <Section
      title="Film look"
      actions={
        f.stock !== 'none' || f.grain > 0 ? (
          <button className="icon-btn" title="Remove film look" onClick={() => updateClip<MediaClip>(clip.id, (c) => void (c.film = defaultFilm()))}>
            <RotateCcw size={13} />
          </button>
        ) : null
      }
    >
      <div className="stock-grid">
        <button className={`stock ${f.stock === 'none' ? 'active' : ''}`} onClick={() => set({ stock: 'none' }, 'stock')}>
          <span className="stock-swatch none" />
          <span className="stock-name">None</span>
        </button>
        {FILM_STOCKS.map((s) => (
          <button key={s.id} className={`stock ${f.stock === s.id ? 'active' : ''}`} onClick={() => pick(s.id)} title={`${s.kind} · ${s.description}`}>
            <span className="stock-swatch" style={{ background: s.swatch }} />
            <span className="stock-name">{s.name}</span>
          </button>
        ))}
      </div>
      {f.stock !== 'none' && <Slider label="Strength" value={f.strength} min={0} max={1} def={1} format={pct0} onChange={(v) => set({ strength: v }, 'strength')} />}
      <Slider label="Grain" value={f.grain} min={0} max={1} format={pct0} onChange={(v) => set({ grain: v }, 'grain')} />
      {f.grain > 0 && <Slider label="Grain size" value={f.grainSize} min={0.5} max={3} def={1} format={(v) => v.toFixed(1)} onChange={(v) => set({ grainSize: v }, 'grainSize')} />}
      <Slider label="Halation" value={f.halation} min={0} max={1} format={pct0} onChange={(v) => set({ halation: v }, 'halation')} />
      <Slider label="Bloom" value={f.bloom} min={0} max={1} format={pct0} onChange={(v) => set({ bloom: v }, 'bloom')} />
      <Slider label="Vignette" value={f.vignette} min={0} max={1} format={pct0} onChange={(v) => set({ vignette: v }, 'vignette')} />
      <Slider label="Gate weave" value={f.weave} min={0} max={1} format={pct0} onChange={(v) => set({ weave: v }, 'weave')} />
      <Slider label="Flicker" value={f.flicker} min={0} max={1} format={pct0} onChange={(v) => set({ flicker: v }, 'flicker')} />
      <Slider label="Faded blacks" value={f.fade} min={0} max={1} format={pct0} onChange={(v) => set({ fade: v }, 'fade')} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

function ColorPanel({ clip }: { clip: MediaClip }) {
  const updateClip = useEditor((s) => s.updateClip);
  const update = useEditor((s) => s.update);
  const luts = useEditor((s) => s.project.luts);
  const lutInput = useRef<HTMLInputElement>(null);
  const c = clip.color;
  const set = (patch: Partial<ColorSettings>, key: string) =>
    updateClip<MediaClip>(clip.id, (x) => void Object.assign(x.color, patch), `color.${key}`);

  const copyLook = () => {
    lookClipboard = structuredClone({ color: clip.color, film: clip.film, effects: clip.effects });
    notify('Look copied. Select another clip and paste.', 'success', 2500);
  };
  const pasteLook = () => {
    if (!lookClipboard) return notify('Copy a look from a clip first.');
    const look = structuredClone(lookClipboard);
    updateClip<MediaClip>(clip.id, (x) => {
      x.color = look.color;
      x.film = look.film;
      x.effects = look.effects.map((e) => ({ ...e, id: uid('fx') }));
    });
  };
  const applyAll = () => {
    const look = structuredClone({ color: clip.color, film: clip.film, effects: clip.effects });
    update((p) => {
      for (const x of p.clips) {
        if (x.type !== 'media' || x.id === clip.id) continue;
        const tr = p.tracks.find((t) => t.id === x.trackId);
        if (tr?.kind === 'audio') continue;
        x.color = structuredClone(look.color);
        x.film = structuredClone(look.film);
        x.effects = look.effects.map((e) => ({ ...structuredClone(e), id: uid('fx') }));
      }
    });
    notify('Look applied to every video and photo clip.', 'success', 2500);
  };

  return (
    <Section
      title="Colour"
      actions={
        <>
          <button className="icon-btn" title="Copy look (colour, film and effects)" onClick={copyLook}>
            <Clipboard size={13} />
          </button>
          <button className="icon-btn" title="Paste look" onClick={pasteLook}>
            <ClipboardPaste size={13} />
          </button>
          <button className="icon-btn" title="Apply this look to all clips" onClick={applyAll}>
            <Layers size={13} />
          </button>
          <button className="icon-btn" title="Reset colour" onClick={() => updateClip<MediaClip>(clip.id, (x) => void (x.color = defaultColor()))}>
            <RotateCcw size={13} />
          </button>
        </>
      }
    >
      <div className="chips">
        {COLOR_LOOKS.map((l) => (
          <button
            key={l.id}
            className="chip"
            onClick={() => updateClip<MediaClip>(clip.id, (x) => void (x.color = { ...defaultColor(), lutId: x.color.lutId, lutAmount: x.color.lutAmount, ...l.color }))}
          >
            {l.name}
          </button>
        ))}
      </div>
      <div className="group-label">Light</div>
      <Slider label="Exposure" value={c.exposure} min={-3} max={3} step={0.05} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`} onChange={(v) => set({ exposure: v }, 'exposure')} />
      <Slider label="Contrast" value={c.contrast} min={-1} max={1} format={pct} onChange={(v) => set({ contrast: v }, 'contrast')} />
      <Slider label="Highlights" value={c.highlights} min={-1} max={1} format={pct} onChange={(v) => set({ highlights: v }, 'highlights')} />
      <Slider label="Shadows" value={c.shadows} min={-1} max={1} format={pct} onChange={(v) => set({ shadows: v }, 'shadows')} />
      <Slider label="Whites" value={c.whites} min={-1} max={1} format={pct} onChange={(v) => set({ whites: v }, 'whites')} />
      <Slider label="Blacks" value={c.blacks} min={-1} max={1} format={pct} onChange={(v) => set({ blacks: v }, 'blacks')} />
      <div className="group-label">Colour</div>
      <Slider label="Temperature" value={c.temperature} min={-1} max={1} format={pct} onChange={(v) => set({ temperature: v }, 'temperature')} />
      <Slider label="Tint" value={c.tint} min={-1} max={1} format={pct} onChange={(v) => set({ tint: v }, 'tint')} />
      <Slider label="Saturation" value={c.saturation} min={-1} max={1} format={pct} onChange={(v) => set({ saturation: v }, 'saturation')} />
      <Slider label="Vibrance" value={c.vibrance} min={-1} max={1} format={pct} onChange={(v) => set({ vibrance: v }, 'vibrance')} />

      <div className="group-label">Wheels</div>
      <div className="wheels">
        <ColorWheel label="Shadows" value={c.lift} master={c.liftMaster} onChange={(v) => set({ lift: v }, 'lift')} onMaster={(v) => set({ liftMaster: v }, 'liftMaster')} />
        <ColorWheel label="Midtones" value={c.gamma} master={c.gammaMaster} onChange={(v) => set({ gamma: v }, 'gamma')} onMaster={(v) => set({ gammaMaster: v }, 'gammaMaster')} />
        <ColorWheel label="Highlights" value={c.gain} master={c.gainMaster} onChange={(v) => set({ gain: v }, 'gain')} onMaster={(v) => set({ gainMaster: v }, 'gainMaster')} />
      </div>

      <div className="group-label">LUT</div>
      <div className="row">
        <select className="select grow" value={c.lutId ?? ''} aria-label="LUT" onChange={(e) => set({ lutId: e.target.value || null }, 'lut')}>
          <option value="">None</option>
          {luts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button className="btn small" onClick={() => lutInput.current?.click()}>
          <Upload size={13} /> .cube
        </button>
        <input
          ref={lutInput}
          type="file"
          accept=".cube"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const id = await importLut(file);
            if (id) set({ lutId: id, lutAmount: 1 }, 'lut');
          }}
        />
      </div>
      {c.lutId && <Slider label="LUT amount" value={c.lutAmount} min={0} max={1} def={1} format={pct0} onChange={(v) => set({ lutAmount: v }, 'lutAmount')} />}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

const CATEGORIES = Array.from(new Set(EFFECTS.map((e) => e.category)));

function EffectsPanel({ clip }: { clip: MediaClip }) {
  const updateClip = useEditor((s) => s.updateClip);
  const add = (type: string) => {
    const def = effectById(type);
    if (!def) return;
    updateClip<MediaClip>(clip.id, (c) => {
      c.effects.push({ id: uid('fx'), type, enabled: true, params: Object.fromEntries(def.params.map((p) => [p.key, p.default])) });
    });
  };
  return (
    <Section title={`Effects${clip.effects.length ? ` · ${clip.effects.length}` : ''}`}>
      <select
        className="select add-effect"
        value=""
        aria-label="Add effect"
        onChange={(e) => {
          if (e.target.value) add(e.target.value);
        }}
      >
        <option value="">+ Add effect…</option>
        {CATEGORIES.map((cat) => (
          <optgroup key={cat} label={cat}>
            {EFFECTS.filter((e) => e.category === cat).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {!clip.effects.length && <p className="hint">Blur, glow, VHS, glitch, light leaks, letterbox, slow zoom and more.</p>}
      {clip.effects.map((fx) => {
        const def = effectById(fx.type);
        if (!def) return null;
        return (
          <div key={fx.id} className={`fx-card ${fx.enabled ? '' : 'off'}`}>
            <div className="fx-head">
              <button
                className={`switch small ${fx.enabled ? 'on' : ''}`}
                role="switch"
                aria-checked={fx.enabled}
                title={fx.enabled ? 'Disable' : 'Enable'}
                onClick={() => updateClip<MediaClip>(clip.id, (c) => {
                  const e = c.effects.find((x) => x.id === fx.id);
                  if (e) e.enabled = !e.enabled;
                })}
              >
                <span />
              </button>
              <span className="fx-name">{def.name}</span>
              <button className="icon-btn" title="Remove effect" onClick={() => updateClip<MediaClip>(clip.id, (c) => void (c.effects = c.effects.filter((x) => x.id !== fx.id)))}>
                <X size={13} />
              </button>
            </div>
            {def.params.map((p) => (
              <Slider
                key={p.key}
                label={p.label}
                value={fx.params[p.key] ?? p.default}
                min={p.min}
                max={p.max}
                step={p.step}
                def={p.default}
                options={p.options}
                format={p.step >= 1 ? (v) => String(Math.round(v)) : undefined}
                onChange={(v) =>
                  updateClip<MediaClip>(clip.id, (c) => {
                    const e = c.effects.find((x) => x.id === fx.id);
                    if (e) e.params[p.key] = v;
                  }, `fx.${fx.id}.${p.key}`)
                }
              />
            ))}
          </div>
        );
      })}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Transform, timing, audio
// ---------------------------------------------------------------------------

function TransformPanel({ id, transform: t, media }: { id: string; transform: Transform; media?: boolean }) {
  const updateClip = useEditor((s) => s.updateClip);
  const set = (patch: Partial<Transform>, key: string) =>
    updateClip(id, (c) => void Object.assign(c.transform, patch), `tf.${key}`);
  return (
    <Section
      title="Position & size"
      defaultOpen={!media}
      actions={
        <button className="icon-btn" title="Reset" onClick={() => updateClip(id, (c) => void (c.transform = { ...defaultTransform(), fit: c.transform.fit }))}>
          <RotateCcw size={13} />
        </button>
      }
    >
      {media && (
        <div className="row">
          <span className="row-label">Fit</span>
          <Segmented
            value={t.fit}
            options={[
              { value: 'contain', label: 'Fit', title: 'Show the whole frame' },
              { value: 'cover', label: 'Fill', title: 'Fill the frame, cropping edges' },
            ]}
            onChange={(v) => set({ fit: v }, 'fit')}
          />
        </div>
      )}
      <Slider label="Position X" value={t.x} min={-1} max={1} format={pct} onChange={(v) => set({ x: v }, 'x')} />
      <Slider label="Position Y" value={t.y} min={-1} max={1} format={pct} onChange={(v) => set({ y: v }, 'y')} />
      <Slider label="Scale" value={t.scale} min={0.1} max={4} def={1} format={pct0} onChange={(v) => set({ scale: v }, 'scale')} />
      <Slider label="Rotation" value={t.rotation} min={-180} max={180} step={0.5} format={(v) => `${v.toFixed(1)}°`} onChange={(v) => set({ rotation: v }, 'rotation')} />
      <Slider label="Opacity" value={t.opacity} min={0} max={1} def={1} format={pct0} onChange={(v) => set({ opacity: v }, 'opacity')} />
      <p className="hint">Tip: drag the clip in the viewer to move it. Hold Shift to turn off centre snapping.</p>
    </Section>
  );
}

function TimingPanel({ clip }: { clip: MediaClip }) {
  const updateClip = useEditor((s) => s.updateClip);
  const media = useEditor((s) => s.media[clip.mediaId]);
  const clips = useEditor((s) => s.project.clips);
  const track = useEditor((s) => s.project.tracks.find((t) => t.id === clip.trackId));
  const setSpeed = (speed: number) =>
    updateClip<MediaClip>(clip.id, (c) => {
      const sourceDur = c.duration * c.speed;
      let dur = sourceDur / speed;
      if (media && media.kind !== 'image') dur = Math.min(dur, (media.duration - c.inPoint) / speed);
      const next = clips.filter((o) => o.trackId === c.trackId && o.id !== c.id && o.start >= clipEnd(c) - 1e-6).reduce((m, o) => Math.min(m, o.start), Infinity);
      c.duration = Math.max(0.05, Math.min(dur, next - c.start));
      c.speed = speed;
    }, 'speed');
  const visual = track?.kind !== 'audio' && media?.kind !== 'audio';
  return (
    <Section title={visual ? 'Speed & transition' : 'Speed'} defaultOpen={false}>
      {media?.kind !== 'image' && (
        <>
          <div className="chips">
            {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => (
              <button key={s} className={`chip ${clip.speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <Slider label="Speed" value={clip.speed} min={0.1} max={4} step={0.05} def={1} format={(v) => `${v.toFixed(2)}×`} onChange={setSpeed} />
        </>
      )}
      {visual && <TransitionControls id={clip.id} transition={clip.transitionIn} max={clip.duration} />}
    </Section>
  );
}

function TransitionControls({ id, transition, max }: { id: string; transition: MediaClip['transitionIn']; max: number }) {
  const updateClip = useEditor((s) => s.updateClip);
  return (
    <>
      <Select
        label="Transition in"
        value={transition.type}
        options={TRANSITIONS.map((t) => ({ value: t.id, label: t.name }))}
        onChange={(v) => updateClip(id, (c) => void (c.transitionIn.type = v))}
      />
      {transition.type !== 'none' && (
        <Slider
          label="Duration"
          value={Math.min(transition.duration, max)}
          min={0.1}
          max={Math.max(0.1, Math.min(3, max))}
          def={0.5}
          format={secs}
          onChange={(v) => updateClip(id, (c) => void (c.transitionIn.duration = v), 'trdur')}
        />
      )}
      <p className="hint">Blends from the clip just before this one on the same track, or in from nothing.</p>
    </>
  );
}

function AudioPanel({ clip }: { clip: MediaClip }) {
  const updateClip = useEditor((s) => s.updateClip);
  const a = clip.audio;
  const set = (patch: Partial<AudioSettings>, key: string) =>
    updateClip<MediaClip>(clip.id, (c) => void Object.assign(c.audio, patch), `audio.${key}`);
  const maxFade = Math.max(0.1, Math.min(10, clip.duration / 2));
  const db = (v: number) => (v <= -60 ? '−∞ dB' : `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`);
  return (
    <Section title="Audio">
      <Toggle label="Mute clip" value={a.muted} onChange={(v) => set({ muted: v }, 'muted')} />
      <Slider label="Volume" value={a.volume} min={-60} max={12} step={0.5} format={db} onChange={(v) => set({ volume: v }, 'volume')} />
      <Slider label="Fade in" value={a.fadeIn} min={0} max={maxFade} step={0.05} format={secs} onChange={(v) => set({ fadeIn: v }, 'fadeIn')} />
      <Slider label="Fade out" value={a.fadeOut} min={0} max={maxFade} step={0.05} format={secs} onChange={(v) => set({ fadeOut: v }, 'fadeOut')} />
      <Slider label="Pan" value={a.pan} min={-1} max={1} format={(v) => (Math.abs(v) < 0.01 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)} onChange={(v) => set({ pan: v }, 'pan')} />
      <div className="group-label">Equaliser</div>
      <Slider label="Bass" value={a.eqLow} min={-12} max={12} step={0.5} format={(v) => `${v > 0 ? '+' : ''}${v} dB`} onChange={(v) => set({ eqLow: v }, 'eqLow')} />
      <Slider label="Mids" value={a.eqMid} min={-12} max={12} step={0.5} format={(v) => `${v > 0 ? '+' : ''}${v} dB`} onChange={(v) => set({ eqMid: v }, 'eqMid')} />
      <Slider label="Treble" value={a.eqHigh} min={-12} max={12} step={0.5} format={(v) => `${v > 0 ? '+' : ''}${v} dB`} onChange={(v) => set({ eqHigh: v }, 'eqHigh')} />
      <div className="group-label">Enhance</div>
      <Toggle label="Voice enhance" value={a.voice} onChange={(v) => set({ voice: v }, 'voice')} />
      <Slider label="Clean up" value={a.denoise} min={0} max={1} format={pct0} onChange={(v) => set({ denoise: v }, 'denoise')} />
      <Slider label="Reverb" value={a.reverb} min={0} max={1} format={pct0} onChange={(v) => set({ reverb: v }, 'reverb')} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const ANIMS = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide-up', label: 'Slide up' },
  { value: 'slide-left', label: 'Slide from left' },
  { value: 'pop', label: 'Pop' },
  { value: 'blur-in', label: 'Blur' },
  { value: 'tracking', label: 'Letter spread' },
  { value: 'typewriter', label: 'Typewriter' },
] as const;

function TextPanels({ clip }: { clip: TextClip }) {
  const updateClip = useEditor((s) => s.updateClip);
  const s = clip.style;
  const set = (patch: Partial<TextStyle>, key: string) =>
    updateClip<TextClip>(clip.id, (c) => void Object.assign(c.style, patch), `style.${key}`);
  const fontValue = FONTS.find((f) => f.css === s.fontFamily)?.css ?? s.fontFamily;
  return (
    <>
      <Section title="Text">
        <textarea
          className="text-input"
          value={clip.text}
          rows={3}
          aria-label="Text"
          onChange={(e) => updateClip<TextClip>(clip.id, (c) => void (c.text = e.target.value), 'text')}
        />
        <Select label="Font" value={fontValue} options={FONTS.map((f) => ({ value: f.css, label: f.name }))} onChange={(v) => set({ fontFamily: v }, 'font')} />
        <Slider label="Size" value={s.fontSize} min={12} max={320} step={1} def={96} format={(v) => `${Math.round(v)}px`} onChange={(v) => set({ fontSize: v }, 'size')} />
        <Select
          label="Weight"
          value={s.fontWeight}
          options={[300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: w, label: String(w) }))}
          onChange={(v) => set({ fontWeight: v }, 'weight')}
        />
        <ColorField label="Colour" value={s.color} onChange={(v) => set({ color: v }, 'color')} />
        <div className="row">
          <span className="row-label">Align</span>
          <Segmented
            value={s.align}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Centre' },
              { value: 'right', label: 'Right' },
            ]}
            onChange={(v) => set({ align: v }, 'align')}
          />
        </div>
        <Toggle label="Italic" value={s.italic} onChange={(v) => set({ italic: v }, 'italic')} />
        <Toggle label="All caps" value={s.uppercase} onChange={(v) => set({ uppercase: v }, 'upper')} />
        <Slider label="Letter spacing" value={s.letterSpacing} min={-10} max={60} step={0.5} format={(v) => `${v}px`} onChange={(v) => set({ letterSpacing: v }, 'ls')} />
        <Slider label="Line height" value={s.lineHeight} min={0.8} max={2} def={1.15} format={(v) => v.toFixed(2)} onChange={(v) => set({ lineHeight: v }, 'lh')} />
      </Section>
      <Section title="Style" defaultOpen={false}>
        <Slider label="Outline" value={s.outlineWidth} min={0} max={20} step={0.5} format={(v) => `${v}px`} onChange={(v) => set({ outlineWidth: v }, 'ow')} />
        {s.outlineWidth > 0 && <ColorField label="Outline colour" value={s.outlineColor} onChange={(v) => set({ outlineColor: v }, 'oc')} />}
        <Slider label="Shadow" value={s.shadow} min={0} max={1} format={pct0} onChange={(v) => set({ shadow: v }, 'shadow')} />
        <Slider label="Background" value={s.backgroundOpacity} min={0} max={1} format={pct0} onChange={(v) => set({ backgroundOpacity: v }, 'bgo')} />
        {s.backgroundOpacity > 0 && (
          <>
            <ColorField label="Box colour" value={s.background} onChange={(v) => set({ background: v }, 'bg')} />
            <Slider label="Box padding" value={s.backgroundPadding} min={0} max={80} step={1} format={(v) => `${v}px`} onChange={(v) => set({ backgroundPadding: v }, 'bgp')} />
          </>
        )}
      </Section>
      <Section title="Animation">
        <Select label="In" value={clip.animIn} options={ANIMS.map((a) => ({ ...a }))} onChange={(v) => updateClip<TextClip>(clip.id, (c) => void (c.animIn = v))} />
        <Select label="Out" value={clip.animOut} options={ANIMS.filter((a) => a.value !== 'typewriter').map((a) => ({ ...a }))} onChange={(v) => updateClip<TextClip>(clip.id, (c) => void (c.animOut = v))} />
        <Slider label="Duration" value={clip.animDuration} min={0.1} max={3} step={0.05} def={0.5} format={secs} onChange={(v) => updateClip<TextClip>(clip.id, (c) => void (c.animDuration = v), 'animdur')} />
      </Section>
      <TransformPanel id={clip.id} transform={clip.transform} />
      <Section title="Transition" defaultOpen={false}>
        <TransitionControls id={clip.id} transition={clip.transitionIn} max={clip.duration} />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Nothing selected: project settings and help
// ---------------------------------------------------------------------------

function ProjectPanel() {
  const project = useEditor((s) => s.project);
  const update = useEditor((s) => s.update);
  const loadProject = useEditor((s) => s.loadProject);
  const fmt = PROJECT_FORMATS.find((f) => f.width === project.settings.width && f.height === project.settings.height);
  return (
    <aside className="inspector">
      <div className="clip-header">
        <input
          className="name-input"
          value={project.name}
          aria-label="Project name"
          onChange={(e) => update((p) => void (p.name = e.target.value), 'pname')}
        />
        <div className="clip-meta dim">Project settings · select a clip to edit it</div>
      </div>
      <div className="inspector-scroll">
        <Section title="Project">
          <Select
            label="Format"
            value={fmt ? `${fmt.width}x${fmt.height}` : 'custom'}
            options={[
              ...PROJECT_FORMATS.map((f) => ({ value: `${f.width}x${f.height}`, label: f.name })),
              ...(fmt ? [] : [{ value: 'custom', label: `${project.settings.width}×${project.settings.height}` }]),
            ]}
            onChange={(v) => {
              const [w, h] = v.split('x').map(Number);
              if (w && h) update((p) => void Object.assign(p.settings, { width: w, height: h }));
            }}
          />
          <Select
            label="Frame rate"
            value={project.settings.fps}
            options={FRAME_RATES.map((f) => ({ value: f, label: `${f} fps` }))}
            onChange={(v) => update((p) => void (p.settings.fps = v))}
          />
          <ColorField label="Background" value={project.settings.background} onChange={(v) => update((p) => void (p.settings.background = v), 'bg')} />
          <button
            className="btn danger full"
            onClick={async () => {
              if (!confirm('Start a new project? The current project and its imported media will be removed from this browser.')) return;
              await clearAll();
              loadProject(newProject(), {});
            }}
          >
            New project
          </button>
        </Section>
        <Section title="Keyboard shortcuts">
          <dl className="shortcuts">
            {[
              ['Space', 'Play / pause'],
              ['← / →', 'Previous / next frame (Shift: 1 second)'],
              ['Home / End', 'Start / end'],
              ['S', 'Split at playhead'],
              ['Del', 'Delete clip'],
              ['Shift + Del', 'Delete and close the gap'],
              ['Ctrl/⌘ + D', 'Duplicate clip'],
              ['Ctrl/⌘ + Z', 'Undo (Shift for redo)'],
              ['T', 'Add a title'],
              ['+ / −', 'Zoom timeline'],
              ['N', 'Toggle snapping'],
              ['Esc', 'Deselect'],
              ['Ctrl/⌘ + E', 'Export'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </aside>
  );
}
