import { tv } from 'tailwind-variants';
import type { AvdStatus, TunnelInfo } from '../types';
import { AvdRow } from './AvdRow';

const toggle = tv({
  base: 'flex items-center gap-1.5 opacity-80',
  variants: {
    disabled: { true: 'cursor-not-allowed opacity-40' },
  },
});

// Live-share panel pinned to the bottom of the sidebar: the scannable QR, the
// shareable link, and a Stop action — shown only while a tunnel is active.
const share = tv({
  slots: {
    box: 'mt-auto flex flex-col items-center gap-2 rounded-lg border border-[#2f6feb]/25 bg-[#12203b]/50 p-3 text-center',
    head: 'text-[11px] uppercase tracking-wider text-[#6aa0ff]',
    qr: 'rounded-md bg-white p-2 [&>svg]:block [&>svg]:h-32 [&>svg]:w-32',
    url: 'w-full break-all text-[10px] leading-tight opacity-60',
    stop: 'cursor-pointer rounded-md border border-[#2f6feb]/50 px-3 py-1 text-[11px] font-medium text-[#6aa0ff] transition-colors hover:bg-[#16294a]',
  },
});

interface Props {
  avds: AvdStatus[];
  activeSerial: string | null;
  liveSerial: string | null;
  booting: Set<string>;
  stopping: Set<string>;
  busy: boolean;
  headless: boolean;
  onHeadless: (v: boolean) => void;
  onStream: (serial: string) => void;
  onStart: (avd: string) => Promise<void>;
  onCloseDevice: () => void;
  onShutdownDevice: () => void;
  onClose: () => void;
  tunnel: TunnelInfo | null;
  onStopShare: () => void;
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
  tunnel,
  onStopShare,
}: Props) {
  const sh = share();
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

      {/* Host-only: a recipient of the shared link never sees the share dialog. */}
      {tunnel?.active && tunnel.host && (
        <div className={sh.box()}>
          <div className={sh.head()}>🔗 Sharing {tunnel.control ? '· control' : '· view-only'}</div>
          {/* QR is server-generated from our own share URL (not user input). */}
          {tunnel.qr && <div className={sh.qr()} dangerouslySetInnerHTML={{ __html: tunnel.qr }} />}
          {tunnel.shareUrl && <div className={sh.url()}>{tunnel.shareUrl}</div>}
          <button className={sh.stop()} onClick={onStopShare}>
            Stop sharing
          </button>
        </div>
      )}
    </aside>
  );
}
