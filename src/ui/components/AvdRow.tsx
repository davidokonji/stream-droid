import { tv } from 'tailwind-variants';
import type { AvdStatus } from '../types';
import { Button } from './Button';
import { StartButton } from './StartButton';
import { LiveDot } from './LiveDot';

const row = tv({
  slots: {
    root: 'flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5',
    dot: 'text-[9px]',
    name: 'flex-1 overflow-hidden text-ellipsis whitespace-nowrap',
    booting: 'flex items-center gap-1.5 text-[12px] text-amber-300',
    spinner: 'h-3 w-3 animate-spin rounded-full border border-amber-300/40 border-t-amber-300',
  },
  variants: {
    active: { true: { root: 'border-[#2f6feb] bg-[#12203b]' } },
  },
});

interface Props {
  avd: AvdStatus;
  active: boolean;
  streaming: boolean;
  booting: boolean;
  // A boot is in progress somewhere, so conflicting actions (a second boot, or
  // starting a new stream) are disabled until it clears. An already-live stream
  // is left alone.
  busy: boolean;
  onStream: (serial: string) => void;
  onStart: (avd: string) => Promise<void>;
}

export function AvdRow({ avd, active, streaming, booting, busy, onStream, onStart }: Props) {
  const s = row({ active });
  const trailing =
    avd.running && avd.serial ? (
      streaming ? (
        <LiveDot />
      ) : (
        <Button disabled={busy} onClick={() => onStream(avd.serial!)}>
          Stream
        </Button>
      )
    ) : booting ? (
      <span className={s.booting()}>
        <span className={s.spinner()} />
        booting…
      </span>
    ) : (
      <StartButton disabled={busy} onStart={() => onStart(avd.name)} />
    );
  return (
    <div className={s.root()}>
      <span className={s.dot()}>{avd.running ? '🟢' : booting ? '🟡' : '⚪'}</span>
      <span className={s.name()}>{avd.name}</span>
      {trailing}
    </div>
  );
}
