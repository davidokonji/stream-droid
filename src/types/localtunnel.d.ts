// localtunnel ships no types; declare the small surface we use.
declare module 'localtunnel' {
  interface Tunnel {
    url: string;
    close(): void;
    on(event: 'close' | 'error' | 'request', cb: (arg?: unknown) => void): void;
  }
  interface LocalTunnelOptions {
    port: number;
    host?: string;
    subdomain?: string;
    local_host?: string;
  }
  export default function localtunnel(options: LocalTunnelOptions): Promise<Tunnel>;
}
