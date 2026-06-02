import { formatForDisplay, matchesKeyboardEvent, parseHotkey } from '@tanstack/hotkeys';
import type { RegisterableHotkey } from '@tanstack/hotkeys';
import type { CodiffKeymap, KeyCombo } from './types.ts';

export const toRegisterableHotkey = (combo: KeyCombo): RegisterableHotkey =>
  combo as RegisterableHotkey;

export const matchesShortcut = (
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
  keymap: CodiffKeymap,
  action: keyof CodiffKeymap,
): boolean => matchesKeyboardEvent(event as KeyboardEvent, parseHotkey(keymap[action]));

export const getShortcutLabel = (keymap: CodiffKeymap, action: keyof CodiffKeymap): string =>
  formatForDisplay(toRegisterableHotkey(keymap[action]));
