// Build the TypeDoc landing page from README.md with its leading top-level
// heading removed. TypeDoc already renders the project name as the page title, so
// the README's own `# stream-droid` H1 would duplicate it. This keeps the full
// README intro (tagline, badges, features) on the docs landing without the double
// title — and leaves README.md itself untouched for GitHub / npm.

import { readFileSync, writeFileSync } from 'node:fs';

const OUT = '.typedoc-readme.md';
const readme = readFileSync('README.md', 'utf8');
// Strip a single leading `# …` heading (and one blank line after it), if present.
const landing = readme.replace(/^﻿?#[^\n]*\n\n?/, '');
writeFileSync(OUT, landing);
