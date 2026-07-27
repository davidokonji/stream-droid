import { tv } from 'tailwind-variants';

export interface NoticeData {
  message: string;
  tone?: 'warn' | 'error';
  onRetry?: () => void;
  retryLabel?: string;
}

const notice = tv({
  slots: {
    root: 'flex w-full max-w-md items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[12px]',
    icon: 'shrink-0 leading-none',
    body: 'flex min-w-0 flex-1 flex-col gap-1.5',
    msg: 'leading-snug',
    retry: 'w-fit cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
    dismiss: 'shrink-0 cursor-pointer text-[13px] leading-none opacity-50 hover:opacity-100',
  },
  variants: {
    tone: {
      warn: {
        root: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
        retry: 'border-amber-400/40 text-amber-100 hover:bg-amber-400/15',
      },
      error: {
        root: 'border-red-500/25 bg-red-500/10 text-red-200',
        retry: 'border-red-400/40 text-red-100 hover:bg-red-400/15',
      },
    },
  },
});

export function Notice({ data, onDismiss }: { data: NoticeData; onDismiss: () => void }) {
  const tone = data.tone ?? 'warn';
  const s = notice({ tone });
  return (
    <output className={s.root()}>
      <span className={s.icon()}>{tone === 'error' ? '⛔' : '⚠'}</span>
      <div className={s.body()}>
        <span className={s.msg()}>{data.message}</span>
        {data.onRetry && (
          <button className={s.retry()} onClick={data.onRetry}>
            {data.retryLabel ?? 'Retry'}
          </button>
        )}
      </div>
      <button className={s.dismiss()} aria-label="Dismiss" onClick={onDismiss}>
        ✕
      </button>
    </output>
  );
}
