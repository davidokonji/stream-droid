import { useRef, type RefObject } from 'react';
import { tv } from 'tailwind-variants';
import type { Codec, Control } from '../types';
import { LiveDot } from './LiveDot';

const LONG_PRESS_MS = 500; // a stationary hold this long becomes a long-press

const screen = tv({
  slots: {
    root: 'relative touch-none',
    surface:
      'block max-h-[78vh] max-w-full cursor-crosshair rounded-xl bg-black object-contain shadow-[0_8px_40px_rgba(0,0,0,0.5)]',
    badge:
      'pointer-events-none absolute top-2 flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[11px]',
  },
  variants: {
    hidden: { true: { surface: 'hidden' } },
    viewOnly: { true: { surface: 'cursor-default' } },
  },
});

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  codec: Codec;
  live: boolean;
  controllable: boolean;
  onControl: (msg: Control) => void;
}

const clamp = (v: number): number => Math.min(1, Math.max(0, v));

export function Screen({ videoRef, canvasRef, codec, live, controllable, onControl }: Props) {
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const png = codec === 'png';
  const { root, surface, badge } = screen();

  const rect = (): DOMRect => (png ? canvasRef.current! : videoRef.current!).getBoundingClientRect();
  const norm = (ev: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = rect();
    return { x: clamp((ev.clientX - r.left) / r.width), y: clamp((ev.clientY - r.top) / r.height) };
  };

  return (
    <div
      className={root()}
      onPointerDown={(ev) => {
        if (!controllable) return;
        down.current = { ...norm(ev), t: Date.now() };
        (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
      }}
      onPointerUp={(ev) => {
        const d = down.current;
        if (!d) return;
        down.current = null;
        const u = norm(ev);
        const held = Date.now() - d.t;
        if (Math.hypot(u.x - d.x, u.y - d.y) > 0.02) {
          onControl({ type: 'swipe', x1: d.x, y1: d.y, x2: u.x, y2: u.y, ms: 200 }); // ~2% = swipe
        } else if (held >= LONG_PRESS_MS) {
          onControl({ type: 'longPress', x: u.x, y: u.y, ms: held });
        } else {
          onControl({ type: 'tap', x: u.x, y: u.y });
        }
      }}
      onWheel={(ev) => {
        if (!controllable) return;
        const r = rect();
        const p = norm(ev);
        onControl({ type: 'scroll', x: p.x, y: p.y, dx: ev.deltaX / r.width, dy: ev.deltaY / r.height });
      }}
    >
      {live && (
        <div className={badge({ class: 'left-2' })}>
          <LiveDot />
        </div>
      )}
      {!controllable && <div className={badge({ class: 'right-2 text-amber-300' })}>👁 view-only</div>}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={surface({ hidden: png, viewOnly: !controllable })}
      />
      <canvas ref={canvasRef} className={surface({ hidden: !png, viewOnly: !controllable })} />
    </div>
  );
}
