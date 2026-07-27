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
    live: 'flex items-center gap-2',
    booting: 'flex items-center gap-1.5 text-[12px] text-amber-300',
    spinner: 'h-3 w-3 animate-spin rounded-full border border-amber-300/40 border-t-amber-300',
    stopping: 'flex items-center gap-1.5 text-[12px] text-neutral-400',
    stopSpinner: 'h-3 w-3 animate-spin rounded-full border border-neutral-600 border-t-neutral-300',
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
  stopping: boolean; // being shut down — show "shutting down…" until it's gone
  // A boot is in progress somewhere, so conflicting actions (a second boot, or
  // starting a new stream) are disabled until it clears. An already-live stream
  // is left alone.
  busy: boolean;
  // This AVD was booted headless — its "close" shuts the emulator down entirely
  // (no window), vs. just detaching the stream from a windowed one.
  streamingHeadless: boolean;
  onStream: (serial: string) => void;
  onStart: (avd: string) => Promise<void>;
  onCloseDevice: () => void;
  onShutdownDevice: () => void;
}

export function AvdRow({
  avd,
  active,
  streaming,
  booting,
  stopping,
  busy,
  streamingHeadless,
  onStream,
  onStart,
  onCloseDevice,
  onShutdownDevice,
}: Props) {
  const s = row({ active });
  const trailing = stopping ? (
    <span className={s.stopping()}>
      <span className={s.stopSpinner()} />
      shutting down…
    </span>
  ) : avd.running && avd.serial ? (
    streaming ? (
      <span className={s.live()}>
        <LiveDot />
        <Button
          onClick={onCloseDevice}
          title={
            streamingHeadless
              ? 'Shut this headless emulator down'
              : 'Stop streaming (the emulator keeps running)'
          }
        >
          {streamingHeadless ? 'Close' : 'Stop'}
        </Button>
        {/* Windowed emulators keep running on Stop; offer an explicit shutdown too. */}
        {!streamingHeadless && (
          <Button
            onClick={onShutdownDevice}
            title="Shut the emulator down"
            className="px-2 text-neutral-400 hover:text-red-400"
          >
            ⏻
          </Button>
        )}
      </span>
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
