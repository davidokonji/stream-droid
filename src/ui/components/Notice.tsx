import { tv } from 'tailwind-variants';

export interface NoticeData {
  message: string;
  tone?: 'warn' | 'error';
  onRetry?: () => void;
  retryLabel?: string;
}

const notice = tv({
  slots: {
    root: 'card enter-rise flex w-full max-w-md items-start gap-3 rounded-xl px-3.5 py-3 text-left text-[12px]',
    icon: 'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[11px] font-bold leading-none',
    body: 'flex min-w-0 flex-1 flex-col gap-1.5',
    msg: 'leading-snug',
    retry: 'control w-fit cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium',
    dismiss:
      'shrink-0 cursor-pointer text-[13px] leading-none opacity-50 transition-opacity hover:opacity-100',
  },
  variants: {
    tone: {
      warn: {
        root: 'border-amber-400/35',
        icon: 'bg-amber-400/20 text-amber-200',
        msg: 'text-amber-100',
        retry: 'text-amber-100',
      },
      error: {
        root: 'border-red-400/35',
        icon: 'bg-red-400/20 text-red-200',
        msg: 'text-red-100',
        retry: 'text-red-100',
      },
    },
  },
});

export function Notice({ data, onDismiss }: { data: NoticeData; onDismiss: () => void }) {
  const tone = data.tone ?? 'warn';
  const s = notice({ tone });
  return (
    <output className={s.root()}>
      <span className={s.icon()} aria-hidden="true">
        !
      </span>
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
