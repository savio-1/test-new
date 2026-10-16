import { useEditor } from '../state/store';
import { Renderer } from '../engine/renderer';
import { preview } from '../engine/instance';
import { notify } from '../state/toasts';

/** Render the frame under the playhead at full project resolution and download it. */
export async function saveFrame() {
  const s = useEditor.getState();
  const canvas = document.createElement('canvas');
  let renderer: Renderer | null = null;
  try {
    renderer = new Renderer(canvas, { preserveDrawingBuffer: true });
    renderer.setSize(s.project.settings.width, s.project.settings.height);
    renderer.render(s.project, s.playhead, preview);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Could not encode the frame.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${s.project.name || 'frame'} ${s.playhead.toFixed(2)}s.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) {
    notify((e as Error).message, 'error');
  } finally {
    renderer?.dispose();
  }
}
