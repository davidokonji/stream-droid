import { tv } from 'tailwind-variants';

const coach = tv({
  slots: {
    root: 'card enter-pop absolute bottom-3 left-1/2 z-20 w-[min(20rem,90%)] -translate-x-1/2 rounded-xl p-3',
    title: 'mb-1.5 text-[12px] font-medium text-neutral-50',
    row: 'flex items-baseline justify-between gap-3 py-0.5 text-[12px] text-neutral-300',
    key: 'shrink-0 rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-neutral-100',
    dismiss: 'mt-2 w-full rounded-md control py-1 text-[11px] font-medium text-neutral-100',
  },
});

const MOVES: ReadonlyArray<[string, string]> = [
  ['Click', 'tap'],
  ['Drag', 'swipe'],
  ['Hold', 'long-press'],
  ['Scroll', 'scroll'],
  ['Type', 'keys (focus the device first)'],
  ['⌘V / Ctrl+V', 'paste into the focused field'],
  ['⌘C / Ctrl+C', "copy the device's clipboard"],
];

export function CoachMark({ onDismiss }: { onDismiss: () => void }) {
  const s = coach();
  return (
    <div className={s.root()} role="note" aria-label="How to drive the device">
      <div className={s.title()}>Drive the device</div>
      {MOVES.map(([k, v]) => (
        <div key={k} className={s.row()}>
          <span className={s.key()}>{k}</span>
          <span>{v}</span>
        </div>
      ))}
      <button className={s.dismiss()} onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}
