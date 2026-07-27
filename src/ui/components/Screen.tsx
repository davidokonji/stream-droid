import { useRef, type RefObject } from 'react';
import { match } from 'ts-pattern';
import { tv } from 'tailwind-variants';
import type { Codec, ConnState, Control } from '../types';
import { LiveDot } from './LiveDot';

const LONG_PRESS_MS = 500; // a stationary hold this long becomes a long-press

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
    // Idle empty state: a dashed device-shaped placeholder — "your device shows here".
    idle: 'flex h-[560px] max-h-[78vh] w-[280px] max-w-full flex-col items-center justify-center gap-4 rounded-[34px] border border-dashed border-[#2a323d] px-8 text-center',
    idleIcon: 'text-neutral-600',
    idleTitle: 'text-[14px] font-medium text-neutral-300',
    idleBtn:
      'mt-1 cursor-pointer rounded-lg border border-[#2f6feb]/60 bg-[#12203b] px-4 py-2 text-[13px] font-medium text-[#6aa0ff] transition-colors hover:bg-[#16294a]',
    idleSub: 'text-[12px] leading-relaxed text-neutral-500',
  },
  variants: {
    hidden: { true: { surface: 'hidden' } },
    viewOnly: { true: { surface: 'cursor-default' } },
  },
});

// Actionable empty-state content shown while idle (no device streaming).
export interface EmptyState {
  title: string;
  hint: string;
  busy: boolean; // an AVD is booting — show a spinner + "booting…"
  startLabel?: string; // primary action label, e.g. "Start Pixel_9"
  onStart?: () => void;
}

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  codec: Codec;
  live: boolean;
  state: ConnState;
  status: string;
  empty: EmptyState;
  controllable: boolean;
  onControl: (msg: Control) => void;
}

const clamp = (v: number): number => Math.min(1, Math.max(0, v));

export function Screen({
  videoRef,
  canvasRef,
  codec,
  live,
  state,
  status,
  empty,
  controllable,
  onControl,
}: Props) {
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const png = codec === 'png';
  const idleState = state === 'idle';
  const s = screen();
  const { root, surface, badge, overlay, spinner, oDot, oTitle, oSub } = s;

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

      {/* The layer over the (empty or last-frame) video, driven by the connection
          state: idle → a clean device-shaped empty state; connecting/disconnected/
          error → an overlay on the last frame; live → nothing (the video shows). */}
      {match(state)
        .with('idle', () => (
          <div className={s.idle()}>
            {empty.busy ? (
              <span className={spinner()} />
            ) : (
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className={s.idleIcon()}
              >
                <rect x="6" y="2" width="12" height="20" rx="3" />
                <line x1="10" y1="18.5" x2="14" y2="18.5" />
              </svg>
            )}
            <span className={s.idleTitle()}>{empty.title}</span>
            {!empty.busy && empty.onStart && (
              <button className={s.idleBtn()} onClick={empty.onStart}>
                ▶ {empty.startLabel}
              </button>
            )}
            <span className={s.idleSub()}>{empty.hint}</span>
          </div>
        ))
        .with('connecting', () => (
          <div className={overlay()}>
            <span className={spinner()} />
            <span className={oTitle({ class: 'text-neutral-300' })}>Connecting…</span>
          </div>
        ))
        .with('disconnected', () => (
          <div className={overlay()}>
            <span className={oDot({ class: 'text-amber-300' })} />
            <span className={oTitle({ class: 'text-amber-300' })}>Device disconnected</span>
            <span className={oSub()}>Reconnect from the sidebar</span>
          </div>
        ))
        .with('error', () => (
          <div className={overlay()}>
            <span className={oDot({ class: 'text-red-300' })} />
            <span className={oTitle({ class: 'text-red-300' })}>Stream error</span>
            <span className={oSub()}>{status}</span>
          </div>
        ))
        .with('live', () => null)
        .exhaustive()}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={surface({ hidden: png || idleState, viewOnly: !controllable })}
      />
      <canvas ref={canvasRef} className={surface({ hidden: !png || idleState, viewOnly: !controllable })} />
    </div>
  );
}
