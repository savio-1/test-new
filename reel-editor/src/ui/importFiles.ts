import { useEditor } from '../state/store';
import { computePeaks, importFile, kindOf, parseCube } from '../engine/importer';
import { saveFile } from '../state/persist';
import { notify } from '../state/toasts';
import { uid } from '../model/defaults';

/** Import files into the media bin. Returns the new media ids. .cube files become LUTs. */
export async function importFiles(files: File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.cube')) {
      await importLut(file);
      continue;
    }
    if (!kindOf(file)) {
      notify(`${file.name}: not a video, audio or image file.`, 'error');
      continue;
    }
    try {
      const item = await importFile(file);
      useEditor.getState().addMedia(item);
      ids.push(item.id);
      void saveFile(item.id, file);
      if (item.hasAudio) {
        computePeaks(file)
          .then((peaks) => useEditor.getState().patchMedia(item.id, { peaks }))
          .catch(() => {});
      }
    } catch (e) {
      notify((e as Error).message, 'error', 7000);
    }
  }
  return ids;
}

export async function importLut(file: File): Promise<string | null> {
  try {
    const { size, data } = parseCube(await file.text());
    const id = uid('lut');
    useEditor.getState().update((p) => {
      p.luts.push({ id, name: file.name.replace(/\.cube$/i, ''), size, data });
    });
    notify(`LUT “${file.name}” added. Pick it in Colour → LUT.`, 'success');
    return id;
  } catch (e) {
    notify(`${file.name}: ${(e as Error).message}`, 'error');
    return null;
  }
}
