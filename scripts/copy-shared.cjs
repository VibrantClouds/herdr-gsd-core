#!/usr/bin/env node
/**
 * Keep the adapter hook runtime dependency-free (spec §12.5).
 *
 * `packages/adapters/claude-code/src/{emit,redact}.ts` are the single source of
 * truth; they are copied verbatim (with a generated-file banner) into the codex
 * and opencode adapters so each compiled hook needs nothing outside its own
 * `dist/` directory — no workspace `require`, no node_modules.
 *
 * Run before `tsc -b`. `--check` fails instead of writing (CI drift guard).
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SRC = path.join(root, 'packages', 'adapters', 'claude-code', 'src');
const TARGETS = [
  path.join(root, 'packages', 'adapters', 'codex', 'src'),
  path.join(root, 'packages', 'adapters', 'opencode', 'src'),
];
const FILES = ['emit.ts', 'redact.ts', 'hookfile.ts'];

const banner = (file) =>
  `// GENERATED FILE — do not edit.\n` +
  `// Source: packages/adapters/claude-code/src/${file}\n` +
  `// Regenerate: node scripts/copy-shared.cjs\n`;

const check = process.argv.includes('--check');
let drift = 0;

for (const file of FILES) {
  const body = fs.readFileSync(path.join(SRC, file), 'utf8');
  const out = banner(file) + body;
  for (const dir of TARGETS) {
    const dest = path.join(dir, file);
    const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
    if (current === out) continue;
    if (check) {
      drift++;
      process.stderr.write(`drift: ${path.relative(root, dest)}\n`);
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dest, out);
    process.stdout.write(`copy-shared: wrote ${path.relative(root, dest)}\n`);
  }
}

if (drift > 0) {
  process.stderr.write(`copy-shared --check: ${drift} file(s) out of date; run: node scripts/copy-shared.cjs\n`);
  process.exit(1);
}
