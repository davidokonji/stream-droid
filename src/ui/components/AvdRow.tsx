import { tv } from 'tailwind-variants';
import type { AvdStatus } from '../types';
import { Button } from './Button';
import { StartButton } from './StartButton';
import { LiveDot } from './LiveDot';

const row = tv({
  slots: {
    root: 'flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5',
    dot: 'text-[9px]',
    name: 'flex-1 overflow-hidden text-ellipsis whitespace-nowrap',
  },
  variants: {
    active: { true: { root: 'border-[#2f6feb] bg-[#12203b]' } },
  },
});

interface Props {
  avd: AvdStatus;
  active: boolean;
  streaming: boolean;
  onStream: (serial: string) => void;
  onStart: (avd: string) => Promise<void>;
}

export function AvdRow({ avd, active, streaming, onStream, onStart }: Props) {
  const s = row({ active });
  return (
    <div className={s.root()}>
      <span className={s.dot()}>{avd.running ? '🟢' : '⚪'}</span>
      <span className={s.name()}>{avd.name}</span>
      {avd.running && avd.serial ? (
        streaming ? (
          <LiveDot />
        ) : (
          <Button onClick={() => onStream(avd.serial!)}>Stream</Button>
        )
      ) : (
        <StartButton onStart={() => onStart(avd.name)} />
      )}
    </div>
  );
}
