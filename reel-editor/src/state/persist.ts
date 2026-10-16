import type { MediaItem, Project } from '../model/types';
import { importFile } from '../engine/importer';

// Autosave: the project JSON plus the original media files, in IndexedDB.

const DB = 'reel-editor';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function saveFile(id: string, file: File) {
  try {
    await tx('files', 'readwrite', (s) => s.put(file, id));
  } catch (e) {
    console.warn('Could not store media for autosave', e);
  }
}

export async function deleteFile(id: string) {
  await tx('files', 'readwrite', (s) => s.delete(id)).catch(() => {});
}

export async function saveProject(project: Project, peaks: Record<string, number[] | undefined>) {
  await tx('kv', 'readwrite', (s) => s.put({ project, peaks, savedAt: Date.now() }, 'project')).catch((e) =>
    console.warn('Autosave failed', e),
  );
}

export async function clearAll() {
  await tx('kv', 'readwrite', (s) => s.clear()).catch(() => {});
  await tx('files', 'readwrite', (s) => s.clear()).catch(() => {});
}

/** Restore the autosaved project and its media. Missing files are skipped. */
export async function loadAutosave(): Promise<{ project: Project; media: Record<string, MediaItem> } | null> {
  try {
    const saved = await tx<{ project: Project; peaks?: Record<string, number[]> }>('kv', 'readonly', (s) => s.get('project'));
    if (!saved?.project) return null;
    const ids = new Set(saved.project.clips.flatMap((c) => (c.type === 'media' ? [c.mediaId] : [])));
    const keys = ((await tx<IDBValidKey[]>('files', 'readonly', (s) => s.getAllKeys())) ?? []) as string[];
    for (const k of keys) ids.add(k);
    const media: Record<string, MediaItem> = {};
    for (const id of ids) {
      const file = await tx<File>('files', 'readonly', (s) => s.get(id));
      if (!file) continue;
      try {
        const item = await importFile(file, id);
        item.peaks = saved.peaks?.[id];
        media[id] = item;
      } catch (e) {
        console.warn('Could not restore', id, e);
      }
    }
    const project = saved.project;
    project.clips = project.clips.filter((c) => c.type !== 'media' || media[c.mediaId]);
    return { project, media };
  } catch (e) {
    console.warn('Autosave restore failed', e);
    return null;
  }
}
