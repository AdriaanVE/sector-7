import { localJSON } from './disk-storage';

export interface DesktopFolderPicker {
  pickFolder: (requestId: string) => Promise<{ path: string } | { cancelled: true }>;
  cancelFolderPicker: (requestId: string) => void;
}

/** Both native pickers pass the selected path through the same server validation. */
export async function selectNativeFolder(signal: AbortSignal, desktop?: DesktopFolderPicker) {
  if (signal.aborted) return { cancelled: true };
  if (!desktop) {
    const result = await localJSON('folders', { method: 'POST', body: JSON.stringify({ action: 'pick' }), signal });
    return signal.aborted ? { cancelled: true } : result;
  }
  const requestId = crypto.randomUUID();
  const cancel = () => desktop.cancelFolderPicker(requestId);
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const result = await desktop.pickFolder(requestId);
    if (signal.aborted || 'cancelled' in result) return { cancelled: true };
    return await localJSON('folders', { method: 'POST', body: JSON.stringify({ action: 'connect', path: result.path }), signal });
  } finally { signal.removeEventListener('abort', cancel); }
}
