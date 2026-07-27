import { tv } from 'tailwind-variants';
import { match } from 'ts-pattern';
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
  stopping: boolean;
  busy: boolean;
  streamingHeadless: boolean;
  onStream: (serial: string) => void;
  onStart: (avd: string) => Promise<void>;
  onCloseDevice: () => void;
  onShutdownDevice: () => void;
}

// The single visual state a row is in — precedence runs top to bottom (a device
// being shut down beats "running", a running-but-not-booted one shows "starting",
// etc.). Both the trailing control and the status dot are derived from it.
type Phase = 'stopping' | 'live' | 'stream' | 'starting' | 'booting' | 'idle';

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

  const phase = match({
    stopping,
    streaming,
    booting,
    running: avd.running && avd.serial !== null,
    booted: avd.booted,
  })
    .returnType<Phase>()
    .with({ stopping: true }, () => 'stopping')
    .with({ running: true, streaming: true }, () => 'live')
    .with({ running: true, booted: false }, () => 'starting') // online to adb, framework not up yet
    .with({ running: true }, () => 'stream')
    .with({ booting: true }, () => 'booting')
    .otherwise(() => 'idle');

  const trailing = match(phase)
    .with('stopping', () => (
      <span className={s.stopping()}>
        <span className={s.stopSpinner()} />
        shutting down…
      </span>
    ))
    .with('starting', () => (
      <span className={s.booting()}>
        <span className={s.spinner()} />
        starting…
      </span>
    ))
    .with('live', () => (
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
    ))
    .with('stream', () => (
      <Button disabled={busy} onClick={() => onStream(avd.serial!)}>
        Stream
      </Button>
    ))
    .with('booting', () => (
      <span className={s.booting()}>
        <span className={s.spinner()} />
        booting…
      </span>
    ))
    .with('idle', () => <StartButton disabled={busy} onStart={() => onStart(avd.name)} />)
    .exhaustive();

  const dot = match(phase)
    .with('live', 'stream', 'stopping', () => '🟢') // up and running
    .with('starting', 'booting', () => '🟡') // coming up
    .with('idle', () => '⚪')
    .exhaustive();

  return (
    <div className={s.root()}>
      <span className={s.dot()}>{dot}</span>
      <span className={s.name()}>{avd.name}</span>
      {trailing}
    </div>
  );
}
