#!/usr/bin/env node

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'server.ts'),
).href;

// Under node, register tsx to transpile TypeScript on import. Under bun, TS runs
// natively, so no loader is needed.
if (typeof globalThis.Bun === 'undefined') {
  const { register } = await import('tsx/esm/api');
  register();
}

await import(entry);
