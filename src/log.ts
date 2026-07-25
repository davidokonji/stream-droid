// Tiny leveled logger. It's quiet by default: `info`, `warn`, and `debug` print
// only with -v/--verbose (which also timestamps every line). `error` always
// prints, so real failures are never silently swallowed. `logger(scope)` prefixes
// a [stream-droid:scope] tag so subsystem output is attributable.
//
// Note: standalone command output (-h help, -a list, -l logcat, --kill, tunnel
// QR) is written via console.* directly, not through this logger, so it always
// shows regardless of --verbose.

import { config } from './config.ts';

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const p2 = (n: number): string => String(n).padStart(2, '0');
function stamp(): string {
  const d = new Date();
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

function fmt(color: string, sym: string, scope: string | undefined, msg: string): string {
  const ts = config.VERBOSE ? `${C.gray}${stamp()}${C.reset} ` : '';
  const tag = `[stream-droid${scope ? `:${scope}` : ''}]`;
  return `${ts}${color}${sym}${C.reset} ${C.dim}${tag}${C.reset} ${msg}`;
}

export interface Logger {
  /** Only printed with -v/--verbose. */
  info(msg: string): void;
  /** Only printed with -v/--verbose. */
  warn(msg: string): void;
  /** Always printed — failures must never be silently swallowed. */
  error(msg: string): void;
  /** Only printed with -v/--verbose. */
  debug(msg: string): void;
}

export function logger(scope?: string): Logger {
  return {
    info: (m) => {
      if (config.VERBOSE) console.log(fmt(C.green, '•', scope, m));
    },
    warn: (m) => {
      if (config.VERBOSE) console.warn(fmt(C.yellow, '⚠', scope, m));
    },
    error: (m) => console.error(fmt(C.red, '✗', scope, m)),
    debug: (m) => {
      if (config.VERBOSE) console.log(fmt(C.cyan, '·', scope, `${C.dim}${m}${C.reset}`));
    },
  };
}

export const log = logger();
