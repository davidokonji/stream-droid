import { useEffect } from 'react';
import type { Control } from './types';

// Browser key names that map 1:1 to a device key we support (sent as-is).
const SPECIAL = new Set([
  'Enter',
  'Backspace',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Escape',
  'Delete',
  'PageUp',
  'PageDown',
]);

export function useKeyboard(send: (msg: Control) => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return; // view-only sessions don't capture the keyboard
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
}
