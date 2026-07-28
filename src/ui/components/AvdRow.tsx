import { useState } from 'react';
import { tv } from 'tailwind-variants';
import { match } from 'ts-pattern';
import type { AvdStatus, BootOpts } from '../types';
import { Button } from './Button';
import { Dot, type DotStatus } from './Dot';

const card = tv({
  slots: {
    root: 'flex flex-col gap-2.5 rounded-xl border border-[var(--hairline)] bg-white/[0.02] p-2.5 transition-[background-color,border-color] duration-150 hover:border-[var(--hairline-strong)]',
    head: 'flex items-center gap-2',
    name: 'min-w-0 flex-1 break-words leading-tight text-neutral-100',
    body: 'flex items-center justify-between gap-2',
    trailing: 'flex min-h-9 items-center justify-end gap-2',
    config: 'flex items-center gap-1.5',
    booting: 'flex items-center gap-1.5 text-[12px] text-amber-300',
    spinner: 'h-3 w-3 animate-spin rounded-full border border-amber-300/40 border-t-amber-300',
    stopping: 'flex items-center gap-1.5 text-[12px] text-neutral-300',
    stopSpinner: 'h-3 w-3 animate-spin rounded-full border border-neutral-600 border-t-neutral-300',
    live: 'text-[11px] text-neutral-400',
  },
  variants: {
    active: {
      true: {
        root: 'border-[rgb(var(--accent-rgb)_/_0.5)] bg-[rgb(var(--accent-rgb)_/_0.12)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)]',
        name: 'text-neutral-50',
      },
    },
  },
});

const chip = tv({
  base: 'cursor-pointer rounded-md border px-2 py-1 text-[11px] transition-colors',
  variants: {
    on: {
      true: 'border-[rgb(var(--accent-rgb)_/_0.55)] bg-[rgb(var(--accent-rgb)_/_0.15)] text-neutral-50',
      false:
        'border-[var(--hairline)] text-neutral-300 hover:border-[var(--hairline-strong)] hover:text-neutral-100',
    },
  },
});

interface Props {
  avd: AvdStatus;
  active: boolean;
  streaming: boolean;
  booting: boolean;
  stopping: boolean;
  busy: boolean;
  onStream: (serial: string) => void;
  onStart: (avd: string, opts: BootOpts) => Promise<void>;
  onCloseDevice: () => void;
  onShutdownDevice: () => void;
  defaultHeadless: boolean;
}

type Phase = 'stopping' | 'live' | 'stream' | 'starting' | 'booting' | 'idle';

export function AvdRow({
  avd,
  active,
  streaming,
  booting,
  stopping,
  busy,
  onStream,
  onStart,
  onCloseDevice,
  onShutdownDevice,
  defaultHeadless,
}: Props) {
  const s = card({ active });
  const [headless, setHeadless] = useState(defaultHeadless);
  const [cold, setCold] = useState(false);

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
    .with({ running: true, booted: false }, () => 'starting')
    .with({ running: true }, () => 'stream')
    .with({ booting: true }, () => 'booting')
    .otherwise(() => 'idle');

  const dotStatus = match(phase)
    .returnType<DotStatus>()
    .with('live', 'stream', 'stopping', () => 'running')
    .with('starting', 'booting', () => 'pending')
    .with('idle', () => 'idle')
    .exhaustive();

  const body = match(phase)
    .with('idle', () => (
      <div className={s.body()}>
        <div className={s.config()}>
          <button
            className={chip({ on: headless })}
            aria-pressed={headless}
            onClick={() => setHeadless((v) => !v)}
            title="Boot with no host window (adb/stream only)"
          >
            Headless
          </button>
          <button
            className={chip({ on: cold })}
            aria-pressed={cold}
            onClick={() => setCold((v) => !v)}
            title="Skip the saved snapshot — recovers a bad boot"
          >
            Cold
          </button>
        </div>
        <Button disabled={busy} onClick={() => void onStart(avd.name, { headless, cold })}>
          Start
        </Button>
      </div>
    ))
    .with('stream', () => (
      <div className={s.trailing()}>
        <Button disabled={busy} onClick={() => onStream(avd.serial!)}>
          Stream
        </Button>
      </div>
    ))
    .with('live', () => (
      <div className={s.body()}>
        <span className={s.live()}>streaming</span>
        <div className="flex items-center gap-1.5">
          <Button
            onClick={onCloseDevice}
            title={
              avd.headless ? 'Shut this headless emulator down' : 'Stop streaming (the device keeps running)'
            }
          >
            {avd.headless ? 'Close' : 'Stop'}
          </Button>
          {avd.emulator && !avd.headless && (
            <Button
              onClick={onShutdownDevice}
              className="px-2 text-neutral-400 hover:text-red-400"
              aria-label="Shut down emulator"
              title="Shut the emulator down"
            >
              ⏻
            </Button>
          )}
        </div>
      </div>
    ))
    .with('starting', () => (
      <div className={s.trailing()}>
        <span className={s.booting()}>
          <span className={s.spinner()} />
          starting…
        </span>
      </div>
    ))
    .with('booting', () => (
      <div className={s.trailing()}>
        <span className={s.booting()}>
          <span className={s.spinner()} />
          booting…
        </span>
      </div>
    ))
    .with('stopping', () => (
      <div className={s.trailing()}>
        <span className={s.stopping()}>
          <span className={s.stopSpinner()} />
          shutting down…
        </span>
      </div>
    ))
    .exhaustive();

  return (
    <div className={s.root()}>
      <div className={s.head()}>
        <Dot status={dotStatus} />
        <span className={s.name()}>{avd.name}</span>
      </div>
      {body}
    </div>
  );
}
