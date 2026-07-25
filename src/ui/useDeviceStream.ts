import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import JMuxer from 'jmuxer';
import type { Codec, ConnState, Control, ServerMsg } from './types';
import { controlToken } from './token';

export interface DeviceStream {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  codec: Codec;
  status: string;
  state: ConnState; // connection lifecycle, for the preview overlay
  serial: string | null;
  live: boolean; // frames are flowing
  controllable: boolean; // this session may drive the device (false = view-only)
  connect: (serial: string) => void;
  send: (msg: Control) => void;
}

export function useDeviceStream(): DeviceStream {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const muxRef = useRef<JMuxer | null>(null);
  const serialRef = useRef<string | null>(null);
  const codecRef = useRef<Codec>('h264');
  const liveRef = useRef(false);
  const posterRef = useRef(false); // next binary frame is the one-shot PNG poster
  const posterUrlRef = useRef<string | null>(null);

  const [codec, setCodec] = useState<Codec>('h264');
  const [status, setStatus] = useState('select an emulator →');
  const [state, setState] = useState<ConnState>('idle');
  const [serial, setSerial] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [controllable, setControllable] = useState(true);

  // Decode PNG frames, keeping only the newest frame if decode falls behind.
  const decoding = useRef(false);
  const pending = useRef<ArrayBuffer | null>(null);
  const drawPng = useCallback(async function draw(buf: ArrayBuffer): Promise<void> {
    if (decoding.current) {
      pending.current = buf;
      return;
    }
    decoding.current = true;
    try {
      const cv = canvasRef.current;
      if (!cv) return;
      const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }));
      if (cv.width !== bmp.width || cv.height !== bmp.height) {
        cv.width = bmp.width;
        cv.height = bmp.height;
      }
      cv.getContext('2d')!.drawImage(bmp, 0, 0);
      bmp.close();
    } finally {
      decoding.current = false;
      if (pending.current) {
        const next = pending.current;
        pending.current = null;
        void draw(next);
      }
    }
  }, []);

  const markLive = useCallback(() => {
    if (!liveRef.current) {
      liveRef.current = true;
      setLive(true);
      setState('live');
    }
  }, []);

  // Show a screenshot instantly via the <video>'s poster attribute — the browser
  // keeps it until the first decoded frame renders, so the video still autoplays
  // (unlike hiding it, which blocks playback).
  const setPoster = useCallback((buf: ArrayBuffer): void => {
    const v = videoRef.current;
    if (!v) return;
    if (posterUrlRef.current) URL.revokeObjectURL(posterUrlRef.current);
    posterUrlRef.current = URL.createObjectURL(new Blob([buf], { type: 'image/png' }));
    v.poster = posterUrlRef.current;
  }, []);

  const clearPoster = useCallback((): void => {
    if (posterUrlRef.current) {
      URL.revokeObjectURL(posterUrlRef.current);
      posterUrlRef.current = null;
    }
    if (videoRef.current) videoRef.current.poster = '';
  }, []);

  const connect = useCallback(
    (s: string): void => {
      wsRef.current?.close();
      muxRef.current?.destroy();
      muxRef.current = null;
      serialRef.current = s;
      liveRef.current = false;
      posterRef.current = false;
      clearPoster();
      setSerial(s);
      setLive(false);
      setControllable(true);
      setState('connecting');
      setStatus(`connecting to ${s}…`);

      const k = controlToken();
      const ws = new WebSocket(
        `ws://${location.host}/?serial=${encodeURIComponent(s)}${k ? `&k=${encodeURIComponent(k)}` : ''}`,
      );
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.addEventListener('message', (e: MessageEvent) => {
        if (e.data instanceof ArrayBuffer) {
          markLive();
          if (posterRef.current) {
            posterRef.current = false;
            setPoster(e.data); // instant preview; the video replaces it on first frame
          } else if (codecRef.current === 'png') {
            void drawPng(e.data);
          } else {
            muxRef.current?.feed({ video: new Uint8Array(e.data) });
          }
          return;
        }
        const msg = JSON.parse(e.data as string) as ServerMsg;
        if (msg.type === 'meta') {
          const c = msg.codec ?? 'h264';
          codecRef.current = c;
          setCodec(c);
          setControllable(msg.control !== false);
          if (c === 'h264' && !muxRef.current && videoRef.current) {
            muxRef.current = new JMuxer({
              node: videoRef.current,
              mode: 'video',
              flushingTime: 0,
              fps: 30,
              debug: false,
            });
          }
          setStatus(`${msg.name} · ${msg.w}×${msg.h} · ${c}`);
        } else if (msg.type === 'poster') {
          posterRef.current = true;
        } else if (msg.type === 'error') {
          setState('error');
          setStatus(msg.message);
        }
      });
      ws.addEventListener('close', () => {
        if (serialRef.current === s) {
          liveRef.current = false;
          setLive(false);
          setState((prev) => (prev === 'error' ? prev : 'disconnected'));
          setStatus('device disconnected');
        }
      });
    },
    [clearPoster, drawPng, markLive, setPoster],
  );

  const send = useCallback((msg: Control): void => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  useEffect(
    () => () => {
      wsRef.current?.close();
      muxRef.current?.destroy();
      if (posterUrlRef.current) URL.revokeObjectURL(posterUrlRef.current);
    },
    [],
  );

  return { videoRef, canvasRef, codec, status, state, serial, live, controllable, connect, send };
}
