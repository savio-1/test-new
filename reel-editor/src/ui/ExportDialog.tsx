import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useEditor } from '../state/store';
import { exportProject, pickCodecs, type ExportOptions, type ExportResult } from '../engine/export';
import { projectDuration, formatTime } from '../model/timeline';
import { FRAME_RATES } from '../model/presets';
import { togglePlay } from '../engine/instance';
import { saveFile } from './saveFile';

const SIZES = [
  { id: 'project', label: 'Project size', scale: 1 },
  { id: '2160', label: '2160p (4K)', height: 2160 },
  { id: '1080', label: '1080p', height: 1080 },
  { id: '720', label: '720p', height: 720 },
  { id: '480', label: '480p (quick preview)', height: 480 },
] as const;

type Phase = { kind: 'setup' } | { kind: 'running'; progress: number; stage: string } | { kind: 'done'; result: ExportResult; url: string; seconds: number } | { kind: 'error'; message: string };

export function ExportDialog() {
  const open = useEditor((s) => s.exportOpen);
  const setOpen = useEditor((s) => s.setExportOpen);
  const project = useEditor((s) => s.project);
  const media = useEditor((s) => s.media);
  const [container, setContainer] = useState<'mp4' | 'webm'>('mp4');
  const [size, setSize] = useState<(typeof SIZES)[number]['id']>('project');
  const [fps, setFps] = useState(project.settings.fps);
  const [quality, setQuality] = useState<ExportOptions['quality']>('high');
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' });
  const [support, setSupport] = useState<{ mp4: string | null; webm: string | null }>({ mp4: null, webm: null });
  const abort = useRef<AbortController | null>(null);

  const dims = (() => {
    const s = SIZES.find((x) => x.id === size)!;
    const { width, height } = project.settings;
    if ('height' in s) {
      const short = Math.min(width, height);
      const k = s.height / short;
      return { width: Math.round((width * k) / 2) * 2, height: Math.round((height * k) / 2) * 2 };
    }
    return { width, height };
  })();

  useEffect(() => {
    if (!open) return;
    togglePlay(false);
    setPhase({ kind: 'setup' });
    setFps(project.settings.fps);
    void (async () => {
      const [mp4, webm] = await Promise.all([pickCodecs('mp4', 1920, 1080), pickCodecs('webm', 1920, 1080)]);
      setSupport({ mp4: mp4.video, webm: webm.video });
      if (!mp4.video && webm.video) setContainer('webm');
    })();
  }, [open]);

  if (!open) return null;
  const duration = projectDuration(project);

  const start = async () => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    const t0 = performance.now();
    setPhase({ kind: 'running', progress: 0, stage: 'Preparing' });
    try {
      const result = await exportProject(
        project,
        media,
        { ...dims, fps, quality, container, start: 0, end: duration },
        (progress, stage) => setPhase({ kind: 'running', progress, stage }),
        ctrl.signal,
      );
      const url = URL.createObjectURL(result.blob);
      setPhase({ kind: 'done', result, url, seconds: (performance.now() - t0) / 1000 });
    } catch (e) {
      if ((e as Error).name === 'AbortError') setPhase({ kind: 'setup' });
      else setPhase({ kind: 'error', message: (e as Error).message || String(e) });
    }
  };

  const close = () => {
    abort.current?.abort();
    if (phase.kind === 'done') URL.revokeObjectURL(phase.url);
    setOpen(false);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && phase.kind !== 'running' && close()}>
      <div className="modal" role="dialog" aria-label="Export">
        <div className="modal-head">
          <h2>Export video</h2>
          <button className="icon-btn" onClick={close} title="Close">
            <X size={16} />
          </button>
        </div>

        {phase.kind === 'setup' && (
          <>
            <div className="modal-body">
              <div className="export-summary">
                <strong>{project.name}</strong>
                <span>
                  {formatTime(duration, fps)} · {dims.width}×{dims.height} · {fps} fps
                </span>
              </div>
              <label className="row">
                <span className="row-label">Format</span>
                <select className="select" value={container} onChange={(e) => setContainer(e.target.value as 'mp4' | 'webm')}>
                  <option value="mp4" disabled={!support.mp4}>
                    MP4 {support.mp4 ? `(${support.mp4.toUpperCase()})` : '— not supported here'}
                  </option>
                  <option value="webm" disabled={!support.webm}>
                    WebM {support.webm ? `(${support.webm.toUpperCase()})` : '— not supported here'}
                  </option>
                </select>
              </label>
              <label className="row">
                <span className="row-label">Resolution</span>
                <select className="select" value={size} onChange={(e) => setSize(e.target.value as typeof size)}>
                  {SIZES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="row">
                <span className="row-label">Frame rate</span>
                <select className="select" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                  {FRAME_RATES.map((f) => (
                    <option key={f} value={f}>
                      {f} fps
                    </option>
                  ))}
                </select>
              </label>
              <label className="row">
                <span className="row-label">Quality</span>
                <select className="select" value={quality} onChange={(e) => setQuality(e.target.value as ExportOptions['quality'])}>
                  <option value="medium">Good (smaller file)</option>
                  <option value="high">High</option>
                  <option value="very-high">Very high</option>
                </select>
              </label>
              <p className="hint">Everything renders on this computer; nothing is uploaded. Keep this tab open until it finishes.</p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button className="btn primary" disabled={!duration || !(container === 'mp4' ? support.mp4 : support.webm)} onClick={() => void start()}>
                <Download size={15} /> Export
              </button>
            </div>
          </>
        )}

        {phase.kind === 'running' && (
          <>
            <div className="modal-body">
              <div className="progress-label">
                <span>{phase.stage}…</span>
                <span>{Math.round(phase.progress * 100)}%</span>
              </div>
              <div className="progress">
                <div className="progress-fill" style={{ width: `${phase.progress * 100}%` }} />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => abort.current?.abort()}>
                Cancel export
              </button>
            </div>
          </>
        )}

        {phase.kind === 'done' && (
          <>
            <div className="modal-body">
              <p className="success">Done in {phase.seconds.toFixed(1)}s.</p>
              <p className="hint">
                {phase.result.filename} · {(phase.result.blob.size / 1e6).toFixed(1)} MB · {phase.result.videoCodec.toUpperCase()}
                {phase.result.audioCodec ? ` + ${phase.result.audioCodec.toUpperCase()}` : ' (no audio)'}
              </p>
              <video className="export-preview" src={phase.url} controls />
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={close}>
                Close
              </button>
              <button className="btn primary" onClick={() => void saveFile(phase.result.blob, phase.result.filename)}>
                <Download size={15} /> Save video
              </button>
            </div>
          </>
        )}

        {phase.kind === 'error' && (
          <>
            <div className="modal-body">
              <p className="error-text">Export failed: {phase.message}</p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setPhase({ kind: 'setup' })}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
