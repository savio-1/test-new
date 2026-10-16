import { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward, Maximize2 } from 'lucide-react';
import { useEditor } from '../state/store';
import { Renderer } from '../engine/renderer';
import { preview, stepFrames, togglePlay } from '../engine/instance';
import { clipEnd, formatTime, projectDuration } from '../model/timeline';
import { notify } from '../state/toasts';

type Quality = 1 | 0.5 | 0.25;

export function Viewer() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const [quality, setQuality] = useState<Quality>(1);
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const [box, setBox] = useState({ w: 640, h: 360 });
  const settings = useEditor((s) => s.project.settings);

  // Fit the canvas into the available space.
  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const aspect = settings.width / settings.height;
      let w = r.width - 24;
      let h = w / aspect;
      if (h > r.height - 24) {
        h = r.height - 24;
        w = h * aspect;
      }
      setBox({ w: Math.max(32, Math.floor(w)), h: Math.max(18, Math.floor(h)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [settings.width, settings.height]);

  // Render loop.
  useEffect(() => {
    let renderer: Renderer;
    try {
      renderer = new Renderer(canvasRef.current!);
    } catch (e) {
      notify((e as Error).message, 'error', 10000);
      return;
    }
    let dirty = true;
    preview.onFrameReady = () => (dirty = true);
    let raf = 0;
    let wasPlaying = false;
    let clockStart = 0;
    let clockT0 = 0;
    let lastSetT = -1;
    let lastProject: unknown = null;
    let lastT = -1;
    let lastSize = '';
    let liveIds = new Set<string>();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = useEditor.getState();
      const { width, height } = s.project.settings;
      const box = canvasRef.current!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cap = qualityRef.current;
      const rw = Math.min(width, box.width * dpr) * cap;
      const rh = (rw * height) / width;
      const size = `${Math.round(rw)}x${Math.round(rh)}`;
      if (size !== lastSize) {
        renderer.setSize(rw, rh);
        lastSize = size;
        dirty = true;
      }

      let t = s.playhead;
      if (s.playing) {
        if (!wasPlaying || Math.abs(s.playhead - lastSetT) > 1e-6) {
          clockStart = performance.now();
          clockT0 = s.playhead;
          wasPlaying = true;
        }
        t = clockT0 + (performance.now() - clockStart) / 1000;
        const dur = projectDuration(s.project);
        if (t >= dur) {
          t = dur;
          s.setPlaying(false);
        }
        lastSetT = t;
        s.setPlayhead(t);
      } else if (wasPlaying) {
        wasPlaying = false;
        preview.pauseAll();
      }

      preview.setMedia(s.media);
      preview.sync(s.project, t, s.playing);

      if (s.project !== lastProject) {
        liveIds = new Set(s.project.clips.map((c) => c.id));
        renderer.pruneSources(liveIds);
      }
      if (s.playing || dirty || s.project !== lastProject || t !== lastT) {
        renderer.render(s.project, t, preview);
        dirty = false;
        lastProject = s.project;
        lastT = t;
      }
      if (meterRef.current) {
        const lvl = s.playing ? preview.level() : 0;
        meterRef.current.style.transform = `scaleX(${Math.min(1, lvl)})`;
        meterRef.current.classList.toggle('hot', lvl > 0.95);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose(false);
    };
  }, []);

  // Drag the selected visual clip to reposition it.
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; id: string } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const s = useEditor.getState();
    const clip = s.project.clips.find(
      (c) => c.id === s.selectedClipId && s.playhead >= c.start && s.playhead < clipEnd(c),
    );
    const track = clip && s.project.tracks.find((t) => t.id === clip.trackId);
    if (!clip || !track || track.kind === 'audio') return;
    if (clip.type === 'media' && s.media[clip.mediaId]?.kind === 'audio') return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: clip.transform.x, oy: clip.transform.y, id: clip.id };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const r = canvasRef.current!.getBoundingClientRect();
    let x = d.ox + (e.clientX - d.x) / r.width;
    let y = d.oy - (e.clientY - d.y) / r.height;
    if (!e.shiftKey) {
      // Snap to centre lines.
      if (Math.abs(x) < 0.012) x = 0;
      if (Math.abs(y) < 0.012) y = 0;
    }
    useEditor.getState().updateClip(d.id, (c) => {
      c.transform.x = Math.round(x * 1000) / 1000;
      c.transform.y = Math.round(y * 1000) / 1000;
    }, 'viewer-drag');
  };

  return (
    <div className="viewer">
      <div className="viewer-stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="viewer-canvas"
          style={{ width: box.w, height: box.h }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onDoubleClick={() => wrapRef.current?.requestFullscreen?.()}
        />
      </div>
      <Transport quality={quality} setQuality={setQuality} meterRef={meterRef} onFullscreen={() => wrapRef.current?.requestFullscreen?.()} />
    </div>
  );
}

function Transport({
  quality,
  setQuality,
  meterRef,
  onFullscreen,
}: {
  quality: Quality;
  setQuality: (q: Quality) => void;
  meterRef: React.RefObject<HTMLDivElement | null>;
  onFullscreen: () => void;
}) {
  const playing = useEditor((s) => s.playing);
  const playhead = useEditor((s) => s.playhead);
  const fps = useEditor((s) => s.project.settings.fps);
  const duration = useEditor((s) => projectDuration(s.project));
  const setPlayhead = useEditor((s) => s.setPlayhead);
  return (
    <div className="transport">
      <div className="transport-time">
        <span className="tc">{formatTime(playhead, fps)}</span>
        <span className="tc dim">/ {formatTime(duration, fps)}</span>
      </div>
      <div className="transport-buttons">
        <button className="icon-btn" title="Go to start (Home)" onClick={() => setPlayhead(0)}>
          <SkipBack size={16} />
        </button>
        <button className="icon-btn" title="Previous frame (←)" onClick={() => stepFrames(-1)}>
          <StepBack size={16} />
        </button>
        <button className="play-btn" title="Play / pause (Space)" onClick={() => togglePlay()}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="icon-btn" title="Next frame (→)" onClick={() => stepFrames(1)}>
          <StepForward size={16} />
        </button>
        <button className="icon-btn" title="Go to end (End)" onClick={() => setPlayhead(duration)}>
          <SkipForward size={16} />
        </button>
      </div>
      <div className="transport-right">
        <div className="meter" title="Output level">
          <div ref={meterRef} className="meter-fill" />
        </div>
        <select
          className="select small"
          value={quality}
          title="Preview quality"
          onChange={(e) => setQuality(Number(e.target.value) as Quality)}
        >
          <option value={1}>Full</option>
          <option value={0.5}>Half</option>
          <option value={0.25}>Quarter</option>
        </select>
        <button className="icon-btn" title="Full screen" onClick={onFullscreen}>
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  );
}
