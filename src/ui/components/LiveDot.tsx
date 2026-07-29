import { tv } from 'tailwind-variants';

const live = tv({
  slots: {
    root: 'flex items-center gap-1 text-[11px] font-medium tracking-wide text-red-400',
    dot: 'h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_8px_rgb(239_68_68_/_0.8)]',
  },
});

export function LiveDot({ label = 'LIVE' }: { label?: string }) {
  const s = live();
  return (
    <span className={s.root()}>
      <span className={s.dot()} />
      {label}
    </span>
  );
}
