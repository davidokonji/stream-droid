import { tv } from 'tailwind-variants';
import { Button } from './Button';

const bar = tv({ base: 'flex gap-2' });

const KEYS: ReadonlyArray<{ label: string; key: string }> = [
  { label: '◀ Back', key: 'Back' },
  { label: '● Home', key: 'Home' },
  { label: '■ Recents', key: 'AppSwitch' },
];

export function NavBar({ onKey }: { onKey: (key: string) => void }) {
  return (
    <div className={bar()}>
      {KEYS.map((k) => (
        <Button key={k.key} onClick={() => onKey(k.key)}>
          {k.label}
        </Button>
      ))}
    </div>
  );
}
