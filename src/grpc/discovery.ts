// Discover a running emulator's gRPC endpoint + auth token.
//
// The emulator advertises itself by writing a `pid_<pid>.ini` file into a
// per-user "running" directory. That file carries `grpc.port`, `grpc.token`
// (the static bearer token), and `port.serial` (the adb console port, e.g. 5554
// for serial "emulator-5554"). We match on the serial and read the endpoint.
//
// gRPC is emulator-only — physical devices have no such endpoint.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GrpcEndpoint {
  port: number;
  token: string; // send as metadata: authorization: Bearer <token>
  avdId: string;
  serial: string; // adb serial, e.g. "emulator-5554"
}

// Platform locations the emulator writes discovery files to.
function runningDirs(): string[] {
  const home = process.env.HOME ?? '';
  return [
    join(home, 'Library/Caches/TemporaryItems/avd/running'), // macOS
    join(process.env.XDG_RUNTIME_DIR ?? '', 'avd/running'), // Linux
    join(home, '.android/avd/running'), // fallback
  ].filter(Boolean);
}

function parseIni(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

// All currently-advertised emulator gRPC endpoints.
export function listGrpcEndpoints(): GrpcEndpoint[] {
  const found: GrpcEndpoint[] = [];
  for (const dir of runningDirs()) {
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.startsWith('pid_') || !f.endsWith('.ini')) continue;
      try {
        const ini = parseIni(readFileSync(join(dir, f), 'utf8'));
        const port = Number(ini['grpc.port']);
        const consolePort = ini['port.serial'];
        if (!port || !consolePort) continue;
        found.push({
          port,
          token: ini['grpc.token'] ?? '',
          avdId: ini['avd.id'] ?? ini['avd.name'] ?? '',
          serial: `emulator-${consolePort}`,
        });
      } catch {
        /* skip unreadable/rotated file */
      }
    }
  }
  return found;
}

// The gRPC endpoint for a specific adb serial, or null if not found.
export function grpcEndpointFor(serial: string): GrpcEndpoint | null {
  return listGrpcEndpoints().find((e) => e.serial === serial) ?? null;
}
