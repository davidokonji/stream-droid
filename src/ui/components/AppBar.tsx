import { tv } from 'tailwind-variants';
import type { TunnelInfo } from '../types';
import { Dot } from './Dot';
import { LiveDot } from './LiveDot';
import { Popover } from './Popover';
import { SharePanel } from './SharePanel';

const bar = tv({
  slots: {
    root: 'surface z-30 flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-3',
    menu: 'flex h-9 w-9 items-center justify-center rounded-lg text-lg leading-none text-neutral-200 hover:bg-white/[0.08] md:hidden',
    mark: 'select-none pr-1 text-[13px] font-semibold tracking-tight text-neutral-50',
    pill: 'flex min-w-0 items-center gap-2 rounded-full bg-white/[0.06] px-2.5 py-1',
    name: 'truncate text-[12px] text-neutral-100',
    chip: 'hidden items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] text-neutral-300 sm:flex',
    spacer: 'flex-1',
    actions: 'flex items-center gap-1',
    share:
      'flex h-9 items-center gap-1.5 rounded-lg border border-[rgb(var(--accent-rgb)_/_0.4)] bg-[rgb(var(--accent-rgb)_/_0.12)] px-3 text-[12px] font-medium text-[var(--accent-soft)] transition-colors hover:bg-[rgb(var(--accent-rgb)_/_0.2)]',
  },
});

interface Props {
  onMenu: () => void;
  hasSidebar: boolean;
  activeName: string | null;
  live: boolean;
  meta: string | null;
  capture: string;
  anyRunning: boolean;
  tunnel: TunnelInfo | null;
  onStartShare: (control: boolean) => Promise<void>;
  onStopShare: () => void;
}

export function AppBar({
  onMenu,
  hasSidebar,
  activeName,
  live,
  meta,
  capture,
  anyRunning,
  tunnel,
  onStartShare,
  onStopShare,
}: Props) {
  const s = bar();
  const sharing = Boolean(tunnel?.active && tunnel.host);
  const canShare = anyRunning || sharing; // nothing to share until a device is up

  return (
    <header className={s.root()}>
      {hasSidebar && (
        <button className={s.menu()} aria-label="Open devices" onClick={onMenu}>
          ☰
        </button>
      )}
      <span className={s.mark()}>stream-droid</span>

      {activeName && (
        <span className={s.pill()}>
          <Dot status={live ? 'running' : 'pending'} />
          <span className={s.name()}>{activeName}</span>
          {live && <LiveDot />}
        </span>
      )}
      {meta && <span className={s.chip()}>{capture ? `${capture} · ${meta}` : meta}</span>}

      <span className={s.spacer()} />

      {hasSidebar && (
        <div className={s.actions()}>
          {canShare ? (
            <Popover
              ariaLabel="Share"
              triggerClass={s.share()}
              label={
                <>
                  <span aria-hidden="true">↗</span>
                  <span>{sharing ? 'Sharing' : 'Share'}</span>
                </>
              }
            >
              {() => <SharePanel tunnel={tunnel} onStartShare={onStartShare} onStopShare={onStopShare} />}
            </Popover>
          ) : (
            <button
              className={s.share({ class: 'cursor-not-allowed opacity-45' })}
              disabled
              title="Start a device to share"
            >
              <span aria-hidden="true">↗</span>
              <span>Share</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
}
