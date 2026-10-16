import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Eye,
  EyeOff,
  Film,
  Magnet,
  Music,
  Plus,
  Scissors,
  Trash2,
  Type,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Maximize,
} from 'lucide-react';
import { useEditor } from '../state/store';
import type { Clip, MediaItem, Track } from '../model/types';
import { clipEnd, formatTime, projectDuration } from '../model/timeline';
import { importFiles } from './importFiles';

const HEADER_W = 156;
const RULER_H = 26;
const TRACK_H: Record<Track['kind'], number> = { video: 62, text: 38, audio: 50 };
const SNAP_PX = 8;

export function Timeline() {
  const tracks = useEditor((s) => s.project.tracks);
  const clips = useEditor((s) => s.project.clips);
  const media = useEditor((s) => s.media);
  const zoom = useEditor((s) => s.zoom);
  const selectedId = useEditor((s) => s.selectedClipId);
  const fps = useEditor((s) => s.project.settings.fps);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ left: 0, width: 800 });

  const ordered = useMemo(() => {
    const visual = tracks.filter((t) => t.kind !== 'audio').reverse();
    const audio = tracks.filter((t) => t.kind === 'audio');
    return [...visual, ...audio];
  }, [tracks]);

  const duration = useMemo(() => clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0), [clips]);
  const contentW = Math.max((duration + 30) * zoom, view.width - HEADER_W);

  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const update = () => setView({ left: el.scrollLeft, width: el.clientWidth });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);

  // Ctrl/Cmd + wheel zooms around the pointer.
  useEffect(() => {
    const el = scrollRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const s = useEditor.getState();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - HEADER_W + el.scrollLeft;
      const t = x / s.zoom;
      const nz = Math.min(400, Math.max(4, s.zoom * Math.exp(-e.deltaY * 0.002)));
      s.setZoom(nz);
      requestAnimationFrame(() => (el.scrollLeft = t * nz - (e.clientX - rect.left - HEADER_W)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const timeAt = (clientX: number) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left - HEADER_W + el.scrollLeft) / useEditor.getState().zoom);
  };

  const snapPoints = (excludeId: string) => {
    const s = useEditor.getState();
    const pts = [0, s.playhead];
    for (const c of s.project.clips) if (c.id !== excludeId) pts.push(c.start, clipEnd(c));
    return pts;
  };

  const snap = (t: number, pts: number[], z: number) => {
    if (!useEditor.getState().snapping) return t;
    let best = t;
    let bestD = SNAP_PX / z;
    for (const p of pts) {
      const d = Math.abs(p - t);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  };

  const startClipDrag = (e: React.PointerEvent, clip: Clip, mode: 'move' | 'start' | 'end') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useEditor.getState();
    s.select(clip.id);
    const x0 = e.clientX;
    const orig = { start: clip.start, end: clipEnd(clip), dur: clip.duration };
    const pts = snapPoints(clip.id);
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const z = useEditor.getState().zoom;
      const dt = (ev.clientX - x0) / z;
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      moved = true;
      const st = useEditor.getState();
      if (mode === 'move') {
        let start = orig.start + dt;
        const a = snap(start, pts, z);
        const b = snap(start + orig.dur, pts, z) - orig.dur;
        start = Math.abs(a - start) <= Math.abs(b - start) ? a : b;
        const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-track-id]');
        const trackId = under?.dataset.trackId ?? st.project.clips.find((c) => c.id === clip.id)?.trackId ?? clip.trackId;
        st.moveClip(clip.id, trackId, Math.max(0, start));
      } else if (mode === 'start') {
        st.trimClip(clip.id, 'start', snap(orig.start + dt, pts, z));
      } else {
        st.trimClip(clip.id, 'end', snap(orig.end + dt, pts, z));
      }
    };
    // Listen on window: moving to another track remounts the clip's element.
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const s = useEditor.getState();
    s.setPlaying(false);
    const set = (x: number) => {
      const st = useEditor.getState();
      st.setPlayhead(Math.round(timeAt(x) * st.project.settings.fps) / st.project.settings.fps);
    };
    set(e.clientX);
    const onMove = (ev: PointerEvent) => set(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onLaneDrop = async (e: React.DragEvent, track: Track) => {
    e.preventDefault();
    const s = useEditor.getState();
    const at = timeAt(e.clientX);
    const mediaId = e.dataTransfer.getData('application/x-reel-media');
    const template = e.dataTransfer.getData('application/x-reel-text');
    if (template) {
      s.addTextClip(template, at);
      return;
    }
    const ids = mediaId ? [mediaId] : await importFiles(Array.from(e.dataTransfer.files));
    let t = at;
    for (const id of ids) {
      const m = useEditor.getState().media[id];
      if (!m) continue;
      const compatible = (m.kind === 'audio') === (track.kind === 'audio') && track.kind !== 'text';
      const clipId = useEditor.getState().addClipFromMedia(id, compatible ? track.id : undefined, t);
      const c = useEditor.getState().project.clips.find((x) => x.id === clipId);
      if (c) t = clipEnd(c);
    }
  };

  return (
    <div className="timeline">
      <Toolbar scrollRef={scrollRef} viewWidth={view.width} />
      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-content" style={{ width: contentW + HEADER_W }}>
          <div className="tl-ruler-row" style={{ height: RULER_H }}>
            <div className="tl-corner" style={{ width: HEADER_W }} />
            <Ruler zoom={zoom} left={view.left} width={view.width} fps={fps} onPointerDown={scrub} />
          </div>
          {ordered.map((track) => (
            <div key={track.id} className={`tl-row kind-${track.kind}`} style={{ height: TRACK_H[track.kind] }}>
              <TrackHeader track={track} />
              <div
                className={`tl-lane ${track.hidden ? 'hidden' : ''}`}
                data-track-id={track.id}
                onPointerDown={(e) => {
                  useEditor.getState().select(null);
                  scrub(e);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(e) => void onLaneDrop(e, track)}
              >
                {clips
                  .filter((c) => c.trackId === track.id)
                  .map((c) => (
                    <ClipView
                      key={c.id}
                      clip={c}
                      track={track}
                      zoom={zoom}
                      selected={c.id === selectedId}
                      media={c.type === 'media' ? media[c.mediaId] : undefined}
                      onPointerDown={startClipDrag}
                    />
                  ))}
              </div>
            </div>
          ))}
          <div className="tl-add-row" style={{ paddingLeft: 8 }}>
            <AddTrackButtons />
          </div>
          <Playhead zoom={zoom} scrollRef={scrollRef} />
        </div>
      </div>
    </div>
  );
}

function Toolbar({ scrollRef, viewWidth }: { scrollRef: React.RefObject<HTMLDivElement | null>; viewWidth: number }) {
  const zoom = useEditor((s) => s.zoom);
  const snapping = useEditor((s) => s.snapping);
  const hasSel = useEditor((s) => !!s.selectedClipId);
  const s = useEditor.getState();
  const fit = () => {
    const d = projectDuration(useEditor.getState().project);
    if (d > 0) s.setZoom((viewWidth - HEADER_W - 40) / d);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  };
  return (
    <div className="tl-toolbar">
      <div className="tl-tools">
        <button className="tool-btn" title="Split at playhead (S)" onClick={() => s.splitAtPlayhead()}>
          <Scissors size={15} /> <span>Split</span>
        </button>
        <button className="tool-btn" title="Duplicate (Ctrl/Cmd+D)" disabled={!hasSel} onClick={() => s.duplicateSelected()}>
          <Copy size={15} /> <span>Duplicate</span>
        </button>
        <button
          className="tool-btn"
          title="Delete (Del) · Shift+Del closes the gap"
          disabled={!hasSel}
          onClick={(e) => s.deleteSelected(e.shiftKey)}
        >
          <Trash2 size={15} /> <span>Delete</span>
        </button>
        <span className="tool-sep" />
        <button className={`tool-btn ${snapping ? 'active' : ''}`} title="Snapping (N)" onClick={() => s.setSnapping(!snapping)}>
          <Magnet size={15} /> <span>Snap</span>
        </button>
      </div>
      <div className="tl-zoom">
        <button className="icon-btn" title="Zoom out (−)" onClick={() => s.setZoom(zoom / 1.4)}>
          <ZoomOut size={15} />
        </button>
        <input
          type="range"
          min={Math.log(4)}
          max={Math.log(400)}
          step={0.01}
          value={Math.log(zoom)}
          aria-label="Timeline zoom"
          onChange={(e) => s.setZoom(Math.exp(Number(e.target.value)))}
        />
        <button className="icon-btn" title="Zoom in (+)" onClick={() => s.setZoom(zoom * 1.4)}>
          <ZoomIn size={15} />
        </button>
        <button className="icon-btn" title="Fit timeline (Shift+Z)" onClick={fit}>
          <Maximize size={15} />
        </button>
      </div>
    </div>
  );
}

function AddTrackButtons() {
  const addTrack = useEditor((s) => s.addTrack);
  return (
    <div className="add-track">
      <Plus size={13} />
      <button onClick={() => addTrack('video')}>Video track</button>
      <button onClick={() => addTrack('text')}>Text track</button>
      <button onClick={() => addTrack('audio')}>Audio track</button>
    </div>
  );
}

const TICKS = [1 / 30, 1 / 10, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];

function Ruler({
  zoom,
  left,
  width,
  fps,
  onPointerDown,
}: {
  zoom: number;
  left: number;
  width: number;
  fps: number;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const major = TICKS.find((t) => t * zoom >= 90) ?? 1800;
  const minor = major / (major >= 1 ? 5 : 2);
  const t0 = Math.max(0, Math.floor(left / zoom / major) * major);
  const t1 = (left + width) / zoom + major;
  const ticks: { t: number; major: boolean }[] = [];
  for (let t = t0; t <= t1; t += minor) {
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    ticks.push({ t, major: isMajor });
  }
  const label = (t: number) => {
    if (major < 1) return formatTime(t, fps);
    const m = Math.floor(t / 60);
    const s = Math.round(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  return (
    <div className="tl-ruler" onPointerDown={onPointerDown}>
      {ticks.map(({ t, major: mj }) => (
        <div key={t.toFixed(4)} className={`tick ${mj ? 'major' : ''}`} style={{ left: t * zoom }}>
          {mj && <span>{label(t)}</span>}
        </div>
      ))}
    </div>
  );
}

function Playhead({ zoom, scrollRef }: { zoom: number; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const x = HEADER_W + playhead * zoom;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const visibleRight = el.scrollLeft + el.clientWidth;
    if (x > visibleRight - 40 || x < el.scrollLeft + HEADER_W) el.scrollLeft = x - HEADER_W - 60;
  }, [x, playing, scrollRef]);
  return (
    <div className="tl-playhead" style={{ transform: `translateX(${x}px)` }}>
      <div className="tl-playhead-cap" />
    </div>
  );
}

function TrackHeader({ track }: { track: Track }) {
  const update = useEditor((s) => s.update);
  const removeTrack = useEditor((s) => s.removeTrack);
  const Icon = track.kind === 'video' ? Film : track.kind === 'text' ? Type : Music;
  const set = (patch: Partial<Track>) =>
    update((p) => {
      const t = p.tracks.find((x) => x.id === track.id);
      if (t) Object.assign(t, patch);
    });
  return (
    <div className="tl-header" style={{ width: HEADER_W }}>
      <Icon size={13} className="tl-header-icon" />
      <span className="tl-header-name" title={track.name}>
        {track.name}
      </span>
      <div className="tl-header-btns">
        {track.kind !== 'audio' && (
          <button className={`mini ${track.hidden ? 'off' : ''}`} title={track.hidden ? 'Show track' : 'Hide track'} onClick={() => set({ hidden: !track.hidden })}>
            {track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
        {track.kind !== 'text' && (
          <button className={`mini ${track.muted ? 'off' : ''}`} title={track.muted ? 'Unmute' : 'Mute'} onClick={() => set({ muted: !track.muted })}>
            {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        )}
        {track.kind === 'audio' && (
          <button className={`mini solo ${track.solo ? 'on' : ''}`} title="Solo" onClick={() => set({ solo: !track.solo })}>
            S
          </button>
        )}
        <button className="mini danger" title="Remove track" onClick={() => removeTrack(track.id)}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

const ClipView = memo(function ClipView({
  clip,
  track,
  zoom,
  selected,
  media,
  onPointerDown,
}: {
  clip: Clip;
  track: Track;
  zoom: number;
  selected: boolean;
  media?: MediaItem;
  onPointerDown: (e: React.PointerEvent, clip: Clip, mode: 'move' | 'start' | 'end') => void;
}) {
  const left = clip.start * zoom;
  const width = Math.max(4, clip.duration * zoom);
  const isAudio = track.kind === 'audio';
  const kind = clip.type === 'text' ? 'text' : media?.kind ?? 'video';
  const hasFx =
    clip.type === 'media' &&
    (clip.effects.some((e) => e.enabled) || clip.film.stock !== 'none' || JSON.stringify(clip.color) !== DEFAULT_COLOR_JSON);
  return (
    <div
      className={`clip kind-${kind} ${selected ? 'selected' : ''}`}
      style={{ left, width }}
      onPointerDown={(e) => onPointerDown(e, clip, 'move')}
      title={clip.name}
    >
      {clip.type === 'media' && media?.thumbnail && !isAudio && (
        <div className="clip-thumbs" style={{ backgroundImage: `url(${media.thumbnail})` }} />
      )}
      {clip.type === 'media' && media?.peaks && (isAudio || media.kind === 'video') && (
        <Waveform peaks={media.peaks} inPoint={clip.inPoint} duration={clip.duration} speed={clip.speed} width={width} compact={!isAudio} />
      )}
      <div className="clip-label">
        {clip.transitionIn.type !== 'none' && <span className="clip-badge" title="Transition in">⟋</span>}
        {hasFx && <span className="clip-badge fx">fx</span>}
        <span className="clip-name">{clip.type === 'text' ? clip.text.split('\n')[0] || 'Text' : clip.name}</span>
        {clip.type === 'media' && clip.speed !== 1 && <span className="clip-badge">{clip.speed}×</span>}
      </div>
      {clip.type === 'media' && (clip.audio.fadeIn > 0 || clip.audio.fadeOut > 0) && (
        <svg className="clip-fades" viewBox={`0 0 ${width} 10`} preserveAspectRatio="none">
          {clip.audio.fadeIn > 0 && <path d={`M0 10 L${clip.audio.fadeIn * zoom} 0 L0 0 Z`} />}
          {clip.audio.fadeOut > 0 && <path d={`M${width} 10 L${width - clip.audio.fadeOut * zoom} 0 L${width} 0 Z`} />}
        </svg>
      )}
      <div className="clip-handle left" onPointerDown={(e) => onPointerDown(e, clip, 'start')} />
      <div className="clip-handle right" onPointerDown={(e) => onPointerDown(e, clip, 'end')} />
    </div>
  );
});

const DEFAULT_COLOR_JSON = JSON.stringify({
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, temperature: 0, tint: 0, saturation: 0, vibrance: 0,
  lift: { x: 0, y: 0 }, gamma: { x: 0, y: 0 }, gain: { x: 0, y: 0 }, liftMaster: 0, gammaMaster: 0, gainMaster: 0, lutId: null, lutAmount: 1,
});

function Waveform({
  peaks,
  inPoint,
  duration,
  speed,
  width,
  compact,
}: {
  peaks: number[];
  inPoint: number;
  duration: number;
  speed: number;
  width: number;
  compact: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.min(Math.ceil(width), 8000);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const h = c.clientHeight || 30;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = compact ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.75)';
    const perSec = 50;
    for (let x = 0; x < w; x++) {
      const t0 = inPoint + (x / w) * duration * speed;
      const t1 = inPoint + ((x + 1) / w) * duration * speed;
      let m = 0;
      for (let i = Math.floor(t0 * perSec); i <= Math.floor(t1 * perSec); i++) m = Math.max(m, peaks[i] ?? 0);
      const bh = Math.max(1, m * h * 0.9);
      if (compact) ctx.fillRect(x, h - bh, 1, bh);
      else ctx.fillRect(x, (h - bh) / 2, 1, bh);
    }
  }, [peaks, inPoint, duration, speed, w, compact]);
  return <canvas ref={ref} className={`clip-wave ${compact ? 'compact' : ''}`} style={{ width: w }} />;
}
