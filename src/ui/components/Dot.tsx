import { tv } from 'tailwind-variants';

const dot = tv({
  base: 'inline-block h-2 w-2 shrink-0 rounded-full',
  variants: {
    status: {
      running: 'bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153_/_0.7)]',
      pending: 'bg-amber-400 shadow-[0_0_6px_rgb(251_191_36_/_0.6)] animate-pulse',
      idle: 'border border-neutral-500',
    },
  },
});

export type DotStatus = 'running' | 'pending' | 'idle';

export function Dot({ status, className }: { status: DotStatus; className?: string }) {
  return <span className={dot({ status, class: className })} />;
}
