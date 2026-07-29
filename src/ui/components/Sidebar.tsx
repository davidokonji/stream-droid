import type { ReactNode } from 'react';
import { tv } from 'tailwind-variants';
import type { AvdStatus } from '../types';
import { AvdRow } from './AvdRow';
import type { BootOpts } from '../types';

const rail = tv({
  slots: {
    aside: 'card flex h-full flex-col gap-3 overflow-y-auto rounded-2xl p-3.5',
    header: 'flex items-center justify-between',
    title: 'm-0 text-[12px] font-medium text-neutral-100',
    close:
      'flex h-9 w-9 items-center justify-center rounded-lg text-lg leading-none text-neutral-300 hover:bg-white/[0.08] md:hidden',
    group: 'flex flex-col gap-2',
    groupLabel: 'px-1 text-[10px] font-medium uppercase tracking-wider text-neutral-400',
    empty: 'flex flex-col gap-2 rounded-lg bg-black/25 p-3 text-[12px] leading-relaxed text-neutral-300',
    code: 'rounded bg-black/50 px-1.5 py-0.5 text-[11px] text-neutral-100',
    link: 'text-[var(--accent-soft)] underline-offset-2 hover:underline',
  },
});

interface Props {
  avds: AvdStatus[];
  activeSerial: string | null;
  liveSerial: string | null;
  booting: Set<string>;
  stopping: Set<string>;
  busy: boolean;
  onStream: (serial: string) => void;
  onStart: (avd: string, opts: BootOpts) => Promise<void>;
  onCloseDevice: () => void;
  onShutdownDevice: () => void;
  defaultHeadless: boolean;
  onClose: () => void;
}

export function Sidebar({
  avds,
  activeSerial,
  liveSerial,
  booting,
  stopping,
  busy,
  onStream,
  onStart,
  onCloseDevice,
  onShutdownDevice,
  defaultHeadless,
  onClose,
}: Props) {
  const s = rail();
  const running = avds.filter((a) => a.running);
  const available = avds.filter((a) => !a.running);

  const renderRow = (a: AvdStatus): ReactNode => (
    <AvdRow
      key={a.name}
      avd={a}
      active={a.serial != null && a.serial === activeSerial}
      streaming={a.serial != null && a.serial === liveSerial}
      booting={booting.has(a.name)}
      stopping={stopping.has(a.name)}
      busy={busy}
      onStream={(sr) => {
        onStream(sr);
        onClose();
      }}
      onStart={onStart}
      onCloseDevice={onCloseDevice}
      onShutdownDevice={onShutdownDevice}
      defaultHeadless={defaultHeadless}
    />
  );

  return (
    <aside className={s.aside()}>
      <div className={s.header()}>
        <h2 className={s.title()}>Devices</h2>
        <button onClick={onClose} aria-label="Close devices" className={s.close()}>
          ✕
        </button>
      </div>

      {avds.length === 0 ? (
        <div className={s.empty()}>
          <span className="font-medium text-neutral-100">No devices yet</span>
          <span>
            Create an emulator in Android Studio&apos;s Device Manager, or connect a phone over USB with{' '}
            <span className={s.code()}>USB debugging</span> on.
          </span>
          <a
            className={s.link()}
            href="https://davidokonji.github.io/stream-droid/"
            target="_blank"
            rel="noreferrer"
          >
            Setup guide →
          </a>
        </div>
      ) : (
        <>
          {running.length > 0 && (
            <div className={s.group()}>
              <span className={s.groupLabel()}>Running</span>
              {running.map(renderRow)}
            </div>
          )}
          {available.length > 0 && (
            <div className={s.group()}>
              {running.length > 0 && <span className={s.groupLabel()}>Available</span>}
              {available.map(renderRow)}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
