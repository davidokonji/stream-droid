import { tv } from 'tailwind-variants';

const bar = tv({
  slots: {
    root: 'pill flex items-center gap-1 rounded-full p-1',
    seg: 'flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] text-neutral-200 transition-[background-color,color,transform] duration-100 ease-out hover:bg-white/10 hover:text-neutral-50 active:scale-[0.94]',
  },
  variants: {
    orientation: {
      vertical: { root: 'flex-col' },
      horizontal: { root: 'flex-row' },
    },
  },
});

const KEYS: ReadonlyArray<{ label: string; glyph: string; key: string }> = [
  { label: 'Back', glyph: '◀', key: 'Back' },
  { label: 'Home', glyph: '●', key: 'Home' },
  { label: 'Recents', glyph: '■', key: 'AppSwitch' },
];

interface Props {
  onKey: (key: string) => void;
  onHelp: () => void;
  orientation?: 'vertical' | 'horizontal';
}

export function DeviceToolbar({ onKey, onHelp, orientation = 'vertical' }: Props) {
  const s = bar({ orientation });
  return (
    <div className={s.root()}>
      {KEYS.map((k) => (
        <button
          key={k.key}
          className={s.seg()}
          onClick={() => onKey(k.key)}
          aria-label={k.label}
          title={k.label}
        >
          <span aria-hidden="true">{k.glyph}</span>
        </button>
      ))}
      <button className={s.seg()} onClick={onHelp} aria-label="Input help" title="How to drive the device">
        <span aria-hidden="true">?</span>
      </button>
    </div>
  );
}
