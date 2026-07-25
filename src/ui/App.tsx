import { useEffect, useState } from 'react';
import { tv } from 'tailwind-variants';
import { fetchState, startAvd } from './api';
import { useDeviceStream } from './useDeviceStream';
import { useKeyboard } from './useKeyboard';
import { Sidebar } from './components/Sidebar';
import { Screen } from './components/Screen';
import { NavBar } from './components/NavBar';
import { LiveDot } from './components/LiveDot';
import type { AvdStatus, ConnState } from './types';

// Browser-tab prefix per stream state, so the title says what's being streamed.
const TITLE_MARK: Partial<Record<ConnState, string>> = { live: '● ', disconnected: '⚠ ' };

const layout = tv({
  slots: {
    root: 'h-screen bg-[#0b0d10] font-mono text-[13px] text-neutral-200',
    topbar: 'flex items-center gap-3 border-b border-[#1c222b] p-3 md:hidden',
    burger: 'cursor-pointer text-xl leading-none opacity-80 hover:opacity-100',
    backdrop: 'fixed inset-0 z-20 bg-black/50 md:hidden',
    drawer:
      'fixed inset-y-0 left-0 z-30 w-64 transform bg-[#0b0d10] transition-transform md:static md:z-auto md:w-auto md:translate-x-0',
    main: 'flex min-w-0 flex-col items-center justify-center gap-2.5 p-3.5',
    hint: 'text-[12px] opacity-45',
    status: 'flex min-h-[1.2em] items-center gap-2 opacity-55',
  },
  variants: {
    open: { true: { drawer: 'translate-x-0' }, false: { drawer: '-translate-x-full' } },
    // View-only sessions hide the sidebar, so the grid column isn't reserved.
    sidebar: { true: { root: 'md:grid md:grid-cols-[240px_1fr]' } },
  },
});

export function App() {
  const { videoRef, canvasRef, codec, status, state, serial, live, controllable, connect, send } =
    useDeviceStream();
  const [avds, setAvds] = useState<AvdStatus[]>([]);
  const [headless, setHeadless] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [booting, setBooting] = useState<Set<string>>(new Set());

  useKeyboard(send, controllable);

  // Reflect what's streaming in the browser-tab title (● live · ⚠ disconnected).
  useEffect(() => {
    const name = avds.find((a) => a.serial === serial)?.name ?? serial;
    document.title = name ? `${TITLE_MARK[state] ?? ''}${name} · streaming` : 'No device streaming';
  }, [serial, state, avds]);

  const startBoot = async (avd: string): Promise<void> => {
    setBooting((b) => new Set(b).add(avd));
    try {
      await startAvd(avd, headless);
    } catch (e) {
      setBooting((b) => {
        const n = new Set(b);
        n.delete(avd);
        return n;
      });
      throw e;
    }
  };

  // Poll device/AVD state; auto-stream the pinned target (or first device) once,
  // and clear the "booting" flag for any AVD that has come online.
  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      try {
        const st = await fetchState();
        if (!alive) return;
        setAvds(st.avds);
        setBooting((b) => {
          if (b.size === 0) return b;
          const n = new Set(b);
          for (const a of st.avds) if (a.running) n.delete(a.name);
          return n.size === b.size ? b : n;
        });
        const t = st.target?.toLowerCase();
        const preferred =
          (t
            ? st.devices.find((d) => d.serial.toLowerCase() === t || d.avd.toLowerCase() === t)
            : undefined) ?? st.devices[0];
        if (!serial && preferred) connect(preferred.serial);
      } catch {
        /* transient; next tick retries */
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [connect, serial]);

  const s = layout({ open: menuOpen, sidebar: controllable });
  return (
    <div className={s.root()}>
      {/* View-only sessions (a shared tunnel link without the control token) show
          only the preview — the sidebar and its ☰ toggle are hidden, since booting
          or switching devices is control the viewer doesn't have. */}
      {controllable && (
        <header className={s.topbar()}>
          <button className={s.burger()} aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            ☰
          </button>
          <span className="flex-1 truncate opacity-70">{serial ?? 'stream-droid'}</span>
          {live && <LiveDot />}
        </header>
      )}

      {controllable && menuOpen && (
        <button className={s.backdrop()} aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      )}

      {controllable && (
        <div className={s.drawer()}>
          <Sidebar
            avds={avds}
            activeSerial={serial}
            liveSerial={live ? serial : null}
            booting={booting}
            headless={headless}
            onHeadless={setHeadless}
            onStream={connect}
            onStart={startBoot}
            onClose={() => setMenuOpen(false)}
          />
        </div>
      )}

      <main className={s.main()}>
        {controllable && <div className={s.hint()}>click = tap · drag = swipe · type = keys</div>}
        <Screen
          videoRef={videoRef}
          canvasRef={canvasRef}
          codec={codec}
          live={live}
          state={state}
          status={status}
          controllable={controllable}
          onControl={send}
        />
        {controllable && <NavBar onKey={(key) => send({ type: 'key', key })} />}
        <div className={s.status()}>
          {live && <LiveDot />}
          {status}
        </div>
      </main>
    </div>
  );
}
