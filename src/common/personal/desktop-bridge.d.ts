import type { DesktopFolderPicker } from './native-folder-selection';

declare global {
  interface Window {
    sector7Desktop?: {
      onPrepareClose: (callback: () => Promise<void>) => () => void;
    } & Partial<DesktopFolderPicker>;
  }
}
