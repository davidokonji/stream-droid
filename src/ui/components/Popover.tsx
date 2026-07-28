import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tv } from 'tailwind-variants';

const pop = tv({
  slots: {
    root: 'relative',
    panel:
      'card enter-pop absolute right-0 top-[calc(100%+8px)] z-40 w-64 rounded-xl p-3 text-left origin-top-right',
  },
});

interface Props {
  label: ReactNode;
  triggerClass?: string;
  ariaLabel?: string;
  children: (close: () => void) => ReactNode;
}

export function Popover({ label, triggerClass, ariaLabel, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const s = pop();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={s.root()} ref={ref}>
      <button
        className={triggerClass}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <div className={s.panel()} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
