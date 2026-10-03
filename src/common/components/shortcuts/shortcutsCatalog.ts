/**
 * Data-driven shortcut catalog for documentation display in ShortcutsModal.
 * Extends ShortcutDefinition for fingerprint matching against registered shortcuts.
 */
import type { ShortcutDefinition } from './useGlobalShortcuts';

export type ShortcutCatalogItem = ShortcutDefinition & Required<Pick<ShortcutDefinition, 'description'>>;

export interface ShortcutCatalogCategory {
  label: string;
  items: ShortcutCatalogItem[];
}

export const shortcutsCatalog: ShortcutCatalogCategory[] = [
  {
    label: 'Edit',
    items: [
      { key: 'Enter', shift: true, description: 'Newline' },
      { key: 'Enter', alt: true, description: 'Append (no response)' },
      { key: 'z', ctrl: true, shift: true, description: 'Regenerate last message' },
      { key: 'Backspace', ctrl: true, shift: true, description: 'Delete last message' },
      { key: 'f', ctrl: true, shift: true, description: 'Attach file' },
      { key: 'v', ctrl: true, shift: true, description: 'Attach clipboard' },
      { key: 'l', ctrl: true, description: 'Change Model' },
      { key: 'm', ctrl: true, description: 'Microphone (voice typing)' },
    ],
  },
  {
    label: 'Chats',
    items: [
      { key: 'n', ctrl: true, shift: true, description: 'New chat' },
      { key: 'x', ctrl: true, shift: true, description: 'Reset chat' },
      { key: 'd', ctrl: true, shift: true, description: 'Delete chat' },
      { key: 'ArrowUp', ctrl: true, description: 'Previous message' },
      { key: 'ArrowDown', ctrl: true, description: 'Next message' },
      { key: '[', ctrl: true, description: 'Previous chat (in history)' },
      { key: ']', ctrl: true, description: 'Next chat (in history)' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { key: ',', ctrl: true, description: 'Preferences' },
      { key: '+', ctrl: true, shift: true, description: 'Increase Text Size' },
      { key: '-', ctrl: true, shift: true, description: 'Decrease Text Size' },
      { key: 'a', ctrl: true, shift: true, description: 'AI Request Inspector' },
      { key: '/', ctrl: true, shift: true, description: 'Shortcuts' },
    ],
  },
  {
    label: 'Layout',
    items: [
      { key: '(', ctrl: true, shift: true, description: 'Toggle left drawer' },
    ],
  },
] as const;
