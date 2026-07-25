// jMuxer ships no types; declare the small surface we use.
declare module 'jmuxer' {
  interface JMuxerOptions {
    node: string | HTMLElement;
    mode?: 'both' | 'video' | 'audio';
    flushingTime?: number;
    fps?: number;
    debug?: boolean;
    clearBuffer?: boolean;
    onReady?: () => void;
    onError?: (err: unknown) => void;
  }
  interface Feed {
    video?: Uint8Array;
    audio?: Uint8Array;
    duration?: number;
  }
  export default class JMuxer {
    constructor(options: JMuxerOptions);
    feed(data: Feed): void;
    destroy(): void;
  }
}
