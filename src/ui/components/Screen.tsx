// The live device surface: a <video> (H.264/jMuxer) and a <canvas> (gRPC PNG),
// one shown per codec. In h264 mode the <video> shows its `poster` (an instant
// screenshot set by the hook) until the first decoded frame renders. Pointer
// gestures become normalized tap/swipe control messages.

import { useRef, type PointerEvent, type RefObject } from 'react';
import { tv } from 'tailwind-variants';
import type { Codec, Control } from '../types';
import { LiveDot } from './LiveDot';

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
  const down = useRef<{ x: number; y: number } | null>(null);
  const png = codec === 'png';
  const { root, surface, badge } = screen();

  const norm = (ev: PointerEvent): { x: number; y: number } => {
    const el = png ? canvasRef.current : videoRef.current;
    const r = el!.getBoundingClientRect();
    return { x: clamp((ev.clientX - r.left) / r.width), y: clamp((ev.clientY - r.top) / r.height) };
  };

  return (
    <div
      className={root()}
      onPointerDown={(ev) => {
        if (!controllable) return;
        down.current = norm(ev);
        (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
      }}
      onPointerUp={(ev) => {
        const d = down.current;
        if (!d) return;
        const u = norm(ev);
        const moved = Math.hypot(u.x - d.x, u.y - d.y) > 0.02; // ~2% = swipe
        onControl(
          moved
            ? { type: 'swipe', x1: d.x, y1: d.y, x2: u.x, y2: u.y, ms: 200 }
            : { type: 'tap', x: u.x, y: u.y },
        );
        down.current = null;
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
