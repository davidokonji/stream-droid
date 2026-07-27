import { tv } from 'tailwind-variants';
import type { AvdStatus } from '../types';
import { AvdRow } from './AvdRow';

const toggle = tv({
  base: 'flex items-center gap-1.5 opacity-80',
  variants: {
    disabled: { true: 'cursor-not-allowed opacity-40' },
  },
});

interface Props {
  avds: AvdStatus[];
  activeSerial: string | null;
  liveSerial: string | null;
  booting: Set<string>;
  stopping: Set<string>; // AVDs being shut down — show "shutting down…" until gone
  // Any AVD booting? Disables conflicting controls (other Start/Stream buttons
  // and the headless toggle) until the boot resolves.
  busy: boolean;
  headless: boolean;
  onHeadless: (v: boolean) => void;
  onStream: (serial: string) => void;
  onStart: (avd: string) => Promise<void>;
  onCloseDevice: () => void;
  onShutdownDevice: () => void;
  onClose: () => void;
}

export function Sidebar({
  avds,
  activeSerial,
  liveSerial,
  booting,
  stopping,
  busy,
  headless,
  onHeadless,
  onStream,
  onStart,
  onCloseDevice,
  onShutdownDevice,
  onClose,
}: Props) {
  return (
    <aside className="flex h-full flex-col gap-3 overflow-y-auto border-r border-[#1c222b] p-3.5">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[11px] uppercase tracking-wider opacity-50">Emulators</h2>
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="cursor-pointer text-lg leading-none opacity-60 hover:opacity-100 md:hidden"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {avds.length === 0 && (
          <div className="opacity-50">
            No AVDs found.
            <br />
            Is the Android SDK emulator installed?
          </div>
        )}
        {avds.map((a) => (
          <AvdRow
            key={a.name}
            avd={a}
            active={a.serial === activeSerial}
            streaming={a.serial != null && a.serial === liveSerial}
            booting={booting.has(a.name)}
            stopping={stopping.has(a.name)}
            busy={busy}
            streamingHeadless={a.headless}
            onStream={(s) => {
              onStream(s);
              onClose();
            }}
            onStart={onStart}
            onCloseDevice={onCloseDevice}
            onShutdownDevice={onShutdownDevice}
          />
        ))}
      </div>
      <label className={toggle({ disabled: busy })} aria-disabled={busy}>
        <input
          type="checkbox"
          checked={headless}
          disabled={busy}
          onChange={(e) => onHeadless(e.target.checked)}
        />
        headless (<code>-no-window</code>)
      </label>
      <div className="text-[12px] opacity-45">
        🟢 running · ⚪ stopped. Headless boots with no host window — adb/stream only.
      </div>
    </aside>
  );
}
