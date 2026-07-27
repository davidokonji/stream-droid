#!/usr/bin/env node

import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const jmuxerEntry = createRequire(import.meta.url).resolve('jmuxer');

const jmuxerUmd = {
  name: 'jmuxer-umd',
  setup(b) {
    b.onResolve({ filter: /^jmuxer$/ }, () => ({ path: jmuxerEntry, namespace: 'jmuxer-umd' }));
    b.onLoad({ filter: /.*/, namespace: 'jmuxer-umd' }, async () => {
      const src = await readFile(jmuxerEntry, 'utf8');
      const contents = `const require = () => undefined; const module = { exports: {} }; const exports = module.exports;\n${src}\nexport default module.exports;`;
      return { contents, loader: 'js' };
    });
  },
};

await build({
  entryPoints: [join(root, 'src/client.tsx')],
  bundle: true,
  outfile: join(root, 'public/client.js'),
  format: 'esm',
  platform: 'browser',
  target: ['chrome111', 'firefox111', 'safari16', 'edge111'],
  jsx: 'automatic',
  minify: true,
  sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [jmuxerUmd],
  logLevel: 'info',
});
