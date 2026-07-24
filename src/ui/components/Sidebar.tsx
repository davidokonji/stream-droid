import type { AvdStatus } from '../types';
import { AvdRow } from './AvdRow';

interface Props {
  avds: AvdStatus[];
  activeSerial: string | null;
  liveSerial: string | null;
  headless: boolean;
  onHeadless: (v: boolean) => void;
  onStream: (serial: string) => void;
  onStart: (avd: string) => Promise<void>;
  onClose: () => void;
}

export function Sidebar({
  avds,
  activeSerial,
  liveSerial,
  headless,
  onHeadless,
  onStream,
  onStart,
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
            onStream={(s) => {
              onStream(s);
              onClose();
            }}
            onStart={onStart}
          />
        ))}
      </div>
      <label className="flex items-center gap-1.5 opacity-80">
        <input type="checkbox" checked={headless} onChange={(e) => onHeadless(e.target.checked)} />
        headless (<code>-no-window</code>)
      </label>
      <div className="text-[12px] opacity-45">
        🟢 running · ⚪ stopped. Headless boots with no host window — adb/stream only.
      </div>
    </aside>
  );
}
