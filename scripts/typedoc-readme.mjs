import { readFileSync, writeFileSync } from 'node:fs';

const OUT = '.typedoc-readme.md';
const readme = readFileSync('README.md', 'utf8');
// Strip a single leading `# …` heading (and one blank line after it), if present.
const landing = readme.replace(/^﻿?#[^\n]*\n\n?/, '');
writeFileSync(OUT, landing);
