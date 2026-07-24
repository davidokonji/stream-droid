import { useState } from 'react';
import { Button } from './Button';

export function StartButton({ onStart }: { onStart: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onStart();
        } catch (e) {
          alert((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'booting…' : 'Start'}
    </Button>
  );
}
