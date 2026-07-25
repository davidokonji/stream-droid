import { useRef, type RefObject } from 'react';
import { tv } from 'tailwind-variants';
import type { Codec, ConnState, Control } from '../types';
import { LiveDot } from './LiveDot';

const LONG_PRESS_MS = 500; // a stationary hold this long becomes a long-press

// What the preview overlay says when frames aren't flowing.
const OVERLAY: Record<Exclude<ConnState, 'live'>, { title: string; sub: string; tone: string }> = {
  idle: { title: 'No device streaming', sub: 'Pick an emulator in the sidebar', tone: 'text-neutral-400' },
  connecting: { title: 'Connecting…', sub: '', tone: 'text-neutral-300' },
  disconnected: { title: 'Device disconnected', sub: 'Reconnect from the sidebar', tone: 'text-amber-300' },
  error: { title: 'Stream error', sub: '', tone: 'text-red-300' },
};

const screen = tv({
  slots: {
    root: 'relative touch-none',
    surface:
      'block max-h-[78vh] max-w-full cursor-crosshair rounded-xl bg-black object-contain shadow-[0_8px_40px_rgba(0,0,0,0.5)]',
    badge:
      'pointer-events-none absolute top-2 flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[11px]',
    overlay:
      'pointer-events-none absolute inset-0 z-10 flex min-h-[220px] flex-col items-center justify-center gap-2.5 rounded-xl bg-black/65 px-4 text-center backdrop-blur-[1px]',
    spinner: 'h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-neutral-200',
    oDot: 'h-2.5 w-2.5 rounded-full bg-current',
    oTitle: 'text-[13px] font-medium',
    oSub: 'text-[11px] text-neutral-400',
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
  state: ConnState;
  status: string;
  controllable: boolean;
  onControl: (msg: Control) => void;
}

const clamp = (v: number): number => Math.min(1, Math.max(0, v));

export function Screen({ videoRef, canvasRef, codec, live, state, status, controllable, onControl }: Props) {
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const png = codec === 'png';
  const { root, surface, badge, overlay, spinner, oDot, oTitle, oSub } = screen();

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
      {state !== 'live' && (
        <div className={overlay()}>
          {state === 'connecting' ? (
            <span className={spinner()} />
          ) : (
            <span className={oDot({ class: OVERLAY[state].tone })} />
          )}
          <span className={oTitle({ class: OVERLAY[state].tone })}>{OVERLAY[state].title}</span>
          <span className={oSub()}>{state === 'error' ? status : OVERLAY[state].sub}</span>
        </div>
      )}
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
