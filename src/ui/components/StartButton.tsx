import { useState } from 'react';
import { Button } from './Button';

export function StartButton({
  onStart,
  disabled = false,
}: {
  onStart: () => Promise<void>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy || disabled}
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
