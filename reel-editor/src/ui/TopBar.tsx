import { Download, Redo2, Undo2, Camera } from 'lucide-react';
import { useEditor } from '../state/store';
import { saveFrame } from './saveFrame';

export function TopBar() {
  const name = useEditor((s) => s.project.name);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const setExportOpen = useEditor((s) => s.setExportOpen);
  const hasClips = useEditor((s) => s.project.clips.length > 0);
  const update = useEditor((s) => s.update);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden>
          <svg viewBox="0 0 32 32" width="22" height="22">
            <rect width="32" height="32" rx="8" fill="var(--accent)" />
            <circle cx="16" cy="16" r="8" fill="none" stroke="#141414" strokeWidth="3" />
            <circle cx="16" cy="16" r="2.5" fill="#141414" />
          </svg>
        </span>
        <span className="brand-name">Reel</span>
      </div>
      <input
        className="project-name"
        value={name}
        aria-label="Project name"
        onChange={(e) => update((p) => void (p.name = e.target.value), 'pname')}
      />
      <div className="topbar-actions">
        <button className="icon-btn" title="Undo (Ctrl/⌘+Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" title="Redo (Ctrl/⌘+Shift+Z)" disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </button>
        <button className="btn" title="Save the current frame as a PNG" disabled={!hasClips} onClick={() => void saveFrame()}>
          <Camera size={15} /> Still
        </button>
        <button className="btn primary" disabled={!hasClips} onClick={() => setExportOpen(true)}>
          <Download size={15} /> Export
        </button>
      </div>
    </header>
  );
}
