import { useState } from 'react';
import { tv } from 'tailwind-variants';
import type { TunnelInfo } from '../types';
import { Dot } from './Dot';

const share = tv({
  slots: {
    head: 'mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-300',
    intro: 'mb-2.5 text-[11px] leading-relaxed text-neutral-300',
    opt: 'control mb-1.5 flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left disabled:opacity-60',
    optTitle: 'text-[12px] font-medium text-neutral-50',
    optSub: 'text-[10px] text-neutral-300',
    qr: 'mx-auto mb-2 w-fit rounded-lg bg-white p-2 shadow-[0_8px_24px_-8px_rgb(0_0_0_/_0.6)] [&>svg]:block [&>svg]:h-32 [&>svg]:w-32',
    urlRow: 'flex items-stretch gap-1.5',
    url: 'min-w-0 flex-1 truncate rounded-md bg-black/30 px-2 py-1.5 text-[10px] leading-tight text-neutral-200',
    copy: 'control shrink-0 rounded-md px-2 text-[11px] font-medium text-neutral-100',
    stop: 'control mt-2 w-full rounded-md py-1.5 text-[11px] font-medium text-neutral-100',
  },
});

interface Props {
  tunnel: TunnelInfo | null;
  onStartShare: (control: boolean) => Promise<void>;
  onStopShare: () => void;
}

export function SharePanel({ tunnel, onStartShare, onStopShare }: Props) {
  const s = share();
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const start = async (control: boolean): Promise<void> => {
    setStarting(true);
    try {
      await onStartShare(control);
    } finally {
      setStarting(false);
    }
  };

  if (!tunnel?.active || !tunnel.host) {
    return (
      <div>
        <div className={s.head()}>Share this device</div>
        <p className={s.intro()}>
          {starting
            ? 'Opening a public link… this can take a few seconds.'
            : 'Open a public link + QR so someone else can watch or drive this device.'}
        </p>
        <button className={s.opt()} disabled={starting} onClick={() => void start(false)}>
          <span className={s.optTitle()}>Share view-only</span>
          <span className={s.optSub()}>they can watch, not control</span>
        </button>
        <button className={s.opt()} disabled={starting} onClick={() => void start(true)}>
          <span className={s.optTitle()}>Share with control</span>
          <span className={s.optSub()}>they can tap, swipe and type too</span>
        </button>
      </div>
    );
  }

  const url = tunnel.shareUrl ?? '';
  return (
    <div>
      <div className={s.head()}>
        <Dot status="running" /> Sharing · {tunnel.control ? 'control' : 'view-only'}
      </div>
      {tunnel.qr && <div className={s.qr()} dangerouslySetInnerHTML={{ __html: tunnel.qr }} />}
      <div className={s.urlRow()}>
        <span className={s.url()}>{url}</span>
        <button
          className={s.copy()}
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <button className={s.stop()} onClick={onStopShare}>
        Stop sharing
      </button>
    </div>
  );
}
