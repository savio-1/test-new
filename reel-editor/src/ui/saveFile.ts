import { notify } from '../state/toasts';

type DownloadsApi = { save(req: { filename: string; data: Blob }): Promise<{ status: string }> };
type ClaudeHost = { use(name: 'downloads'): Promise<DownloadsApi | null> };

let downloads: Promise<DownloadsApi | null> | null = null;

/** The claude.ai downloads capability when hosted as an Artifact, otherwise null. */
function hostDownloads() {
  const claude = (window as unknown as { claude?: ClaudeHost }).claude;
  if (!claude?.use) return Promise.resolve(null);
  downloads ??= claude.use('downloads').catch(() => null);
  return downloads;
}

/** Offer a generated file to the user. Returns true when it was handed over. */
export async function saveFile(blob: Blob, filename: string): Promise<boolean> {
  const host = await hostDownloads();
  if (host) {
    try {
      await host.save({ filename, data: blob });
      return true;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'declined') return false;
      if (code === 'rate_limited') notify('A save prompt is already open.', 'info');
      else notify(`Could not save the file (${code ?? 'error'}).`, 'error');
      return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return true;
}
