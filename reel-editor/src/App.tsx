import { useEffect, useState } from 'react';
import { TopBar } from './ui/TopBar';
import { MediaBin } from './ui/MediaBin';
import { Viewer } from './ui/Viewer';
import { Inspector } from './ui/Inspector';
import { Timeline } from './ui/Timeline';
import { ExportDialog } from './ui/ExportDialog';
import { Toasts } from './ui/Toasts';
import { useEditor } from './state/store';
import { loadAutosave, saveProject } from './state/persist';
import { stepFrames, togglePlay } from './engine/instance';
import { projectDuration } from './model/timeline';
import { importFiles } from './ui/importFiles';

export function App() {
  const [ready, setReady] = useState(false);
  const [timelineH, setTimelineH] = useState(() => Math.round(window.innerHeight * 0.34));

  // Restore the autosaved project, then save on every change (debounced).
  useEffect(() => {
    let timer = 0;
    let unsub = () => {};
    void loadAutosave().then((saved) => {
      if (saved) useEditor.getState().loadProject(saved.project, saved.media);
      setReady(true);
      unsub = useEditor.subscribe((s, prev) => {
        if (s.project === prev.project && s.media === prev.media) return;
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          const st = useEditor.getState();
          const peaks = Object.fromEntries(Object.values(st.media).map((m) => [m.id, m.peaks]));
          void saveProject(st.project, peaks);
        }, 800);
      });
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]') && e.key !== 'Escape') {
        // Range sliders shouldn't swallow shortcuts other than arrows.
        if (!(el instanceof HTMLInputElement && el.type === 'range' && !e.key.startsWith('Arrow'))) return;
      }
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        s.duplicateSelected();
      } else if (mod && key === 'e') {
        e.preventDefault();
        if (s.project.clips.length) s.setExportOpen(true);
      } else if (mod) {
        return;
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFrames(e.shiftKey ? -s.project.settings.fps : -1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepFrames(e.shiftKey ? s.project.settings.fps : 1);
      } else if (e.key === 'Home') {
        s.setPlayhead(0);
      } else if (e.key === 'End') {
        s.setPlayhead(projectDuration(s.project));
      } else if (key === 's') {
        s.splitAtPlayhead();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.deleteSelected(e.shiftKey);
      } else if (key === 't') {
        s.addTextClip();
      } else if (key === 'n') {
        s.setSnapping(!s.snapping);
      } else if (e.key === '+' || e.key === '=') {
        s.setZoom(s.zoom * 1.4);
      } else if (e.key === '-') {
        s.setZoom(s.zoom / 1.4);
      } else if (e.key === 'Escape') {
        if (s.exportOpen) return;
        (document.activeElement as HTMLElement | null)?.blur();
        s.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Files dropped anywhere outside the bin/timeline still get imported.
  useEffect(() => {
    const over = (e: DragEvent) => e.dataTransfer?.types.includes('Files') && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length || e.defaultPrevented) return;
      e.preventDefault();
      void importFiles(Array.from(e.dataTransfer.files));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const startResize = (e: React.PointerEvent) => {
    const y0 = e.clientY;
    const h0 = timelineH;
    const move = (ev: PointerEvent) =>
      setTimelineH(Math.min(window.innerHeight - 260, Math.max(160, h0 - (ev.clientY - y0))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="app" style={{ gridTemplateRows: `48px 1fr 6px ${timelineH}px` }}>
      <TopBar />
      <main className="workspace">
        <MediaBin />
        <Viewer />
        <Inspector />
      </main>
      <div className="resizer" onPointerDown={startResize} title="Drag to resize the timeline" />
      <Timeline />
      <ExportDialog />
      <Toasts />
      {!ready && <div className="loading">Restoring your project…</div>}
    </div>
  );
}
