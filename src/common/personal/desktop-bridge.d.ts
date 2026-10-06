import type { DesktopFolderPicker } from './native-folder-selection';

declare global {
  interface Window {
    sector7Desktop?: {
      onPrepareClose: (callback: () => Promise<void>) => () => void;
      phonon: {
        ensure: () => Promise<{ url: string }>;
        stop: () => Promise<void>;
        status: () => Promise<{ state: 'idle' | 'starting' | 'running' | 'not-installed'; message?: string }>;
      };
    } & Partial<DesktopFolderPicker>;
  }
}
