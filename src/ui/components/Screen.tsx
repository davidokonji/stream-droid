import { useRef, useState, type RefObject } from 'react';
import { match } from 'ts-pattern';
import { tv } from 'tailwind-variants';
import type { Codec, ConnState, Control } from '../types';
import { LiveDot } from './LiveDot';
import { CoachMark } from './CoachMark';

const LONG_PRESS_MS = 500; // a stationary hold this long becomes a long-press

const screen = tv({
  slots: {
    frame:
      'relative flex touch-none items-center justify-center rounded-[26px] bg-[#0a0a0d] p-2.5 outline-none ring-1 ring-white/[0.12] shadow-[0_40px_110px_-34px_rgb(0_0_0_/_0.9)] focus-visible:ring-[var(--accent)]',
    surface: 'block max-h-[80vh] max-w-full rounded-[18px] bg-black object-contain cursor-crosshair',
    badge:
      'pill pointer-events-none absolute bottom-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]',
    kbd: 'pill pointer-events-none absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide text-[var(--accent-soft)]',
    overlay:
      'enter-pop pointer-events-none absolute inset-2.5 z-10 flex flex-col items-center justify-center gap-2.5 rounded-[18px] bg-black/45 px-4 text-center backdrop-blur-md',
    spinner: 'h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-neutral-200',
    oDot: 'h-2.5 w-2.5 rounded-full bg-current shadow-[0_0_8px_currentColor]',
    oTitle: 'text-[13px] font-medium',
    oSub: 'text-[11px] text-neutral-300',
    idle: 'flex h-[80vh] max-h-[80vh] w-[290px] max-w-full flex-col items-center justify-center gap-4 rounded-[18px] px-8 text-center',
    idleIcon: 'text-neutral-300',
    idleTitle: 'text-[15px] font-medium text-neutral-50',
    idleBtn:
      'mt-1 min-h-[44px] cursor-pointer rounded-lg border border-[rgb(var(--accent-rgb)_/_0.55)] bg-[rgb(var(--accent-rgb)_/_0.15)] px-4 py-2 text-[13px] font-medium text-[var(--accent-soft)] transition duration-150 ease-out hover:border-[rgb(var(--accent-rgb)_/_0.75)] hover:bg-[rgb(var(--accent-rgb)_/_0.28)] active:scale-[0.98]',
    idleSub: 'text-[12px] leading-relaxed text-neutral-300',
  },
  variants: {
    hidden: { true: { surface: 'hidden' } },
    viewOnly: { true: { surface: 'cursor-default' } },
  },
});

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
  onFocusChange: (focused: boolean) => void;
  focused: boolean;
  coach: boolean;
  onDismissCoach: () => void;
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
  onFocusChange,
  focused,
  coach,
  onDismissCoach,
}: Props) {
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const rippleId = useRef(0);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const png = codec === 'png';
  const idleState = state === 'idle';
  const s = screen();
  const { frame, surface, badge, overlay, spinner, oDot, oTitle, oSub } = s;

  const rect = (): DOMRect => (png ? canvasRef.current! : videoRef.current!).getBoundingClientRect();
  const norm = (ev: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = rect();
    return { x: clamp((ev.clientX - r.left) / r.width), y: clamp((ev.clientY - r.top) / r.height) };
  };

  const ripple = (ev: { clientX: number; clientY: number }): void => {
    const f = frameRef.current;
    if (!f) return;
    const r = f.getBoundingClientRect();
    const id = ++rippleId.current;
    setRipples((rs) => [...rs, { id, x: ev.clientX - r.left, y: ev.clientY - r.top }]);
    setTimeout(() => setRipples((rs) => rs.filter((p) => p.id !== id)), 480);
  };

  return (
    <div
      ref={frameRef}
      className={frame()}
      tabIndex={controllable ? 0 : undefined}
      role={controllable ? 'application' : undefined}
      aria-label={
        controllable ? 'Android device — click to tap, drag to swipe, type to send keys' : undefined
      }
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      onPointerDown={(ev) => {
        if (!controllable) return;
        frameRef.current?.focus();
        down.current = { ...norm(ev), t: Date.now() };
        ripple(ev);
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
        <div className={badge({ class: 'left-3' })}>
          <LiveDot />
        </div>
      )}
      {!controllable && (
        <div className={badge({ class: 'right-3 font-medium tracking-wide text-amber-300' })}>view-only</div>
      )}
      {controllable && live && focused && <div className={s.kbd()}>⌨ keyboard → device</div>}

      {ripples.map((p) => (
        <span key={p.id} className="ripple" style={{ left: p.x, top: p.y }} />
      ))}

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
                {empty.startLabel}
              </button>
            )}
            <span className={s.idleSub()}>{empty.hint}</span>
          </div>
        ))
        .with('connecting', () => (
          <div className={overlay()}>
            <span className={spinner()} />
            <span className={oTitle({ class: 'text-neutral-200' })}>Connecting…</span>
          </div>
        ))
        .with('disconnected', () => (
          <div className={overlay()}>
            <span className={oDot({ class: 'text-amber-300' })} />
            <span className={oTitle({ class: 'text-amber-300' })}>Device disconnected</span>
            <span className={oSub()}>
              {controllable ? 'Reconnect from the sidebar' : 'Waiting for the host…'}
            </span>
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

      {controllable && live && coach && <CoachMark onDismiss={onDismissCoach} />}
    </div>
  );
}
