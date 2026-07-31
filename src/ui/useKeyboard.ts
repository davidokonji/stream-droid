import { useEffect } from 'react';
import type { Control } from './types';

const SPECIAL = new Set([
  'Enter',
  'Backspace',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Escape',
  'Delete',
  'PageUp',
  'PageDown',
]);

export function useKeyboard(
  send: (msg: Control) => void,
  enabled = true,
  canCopy = false,
  readClipboard?: () => string,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return; // leave browser shortcuts alone
      if (SPECIAL.has(ev.key)) {
        send({ type: 'key', key: ev.key });
        ev.preventDefault();
      } else if (ev.key.length === 1) send({ type: 'text', value: ev.key });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const onPaste = (ev: ClipboardEvent): void => {
      const value = ev.clipboardData?.getData('text/plain');
      if (!value) return;
      send({ type: 'paste', value });
      ev.preventDefault();
    };

    const onCopy = (ev: ClipboardEvent): void => {
      if (!canCopy || !readClipboard) return;
      const value = readClipboard();
      if (value) {
        ev.clipboardData?.setData('text/plain', value);
        ev.preventDefault();
      }
      send({ type: 'copy' });
    };

    window.addEventListener('paste', onPaste);
    window.addEventListener('copy', onCopy);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('copy', onCopy);
    };
  }, [send, enabled, canCopy, readClipboard]);
}
