// npm run check:size: gzip JS budget (Phase 0 task 6). Run after `npm run build`.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

// Budget from docs/SPEC.md (non-functional): total gzip JS <= 150 KB, code-split per calculator.
const BUDGET_BYTES = 150 * 1024;
const CHUNK_WARN_BYTES = 50 * 1024;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
if (!existsSync(dist) || !statSync(dist).isDirectory()) {
  console.error('check:size FAILED: dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const jsFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.js')) jsFiles.push(full);
  }
})(dist);

if (jsFiles.length === 0) {
  console.error('check:size FAILED: no .js files in dist/ (build output looks wrong).');
  process.exit(1);
}

const kb = (n) => (n / 1024).toFixed(2) + ' KB';
let total = 0;
for (const f of jsFiles.sort()) {
  const gz = gzipSync(readFileSync(f), { level: 9 }).length;
  total += gz;
  const warn = gz > CHUNK_WARN_BYTES ? `  WARNING: chunk > ${kb(CHUNK_WARN_BYTES)}` : '';
  console.log(`  ${relative(dist, f).split('\\').join('/')}: ${kb(gz)} gzip${warn}`);
}
console.log(`check:size: total ${kb(total)} gzip JS of ${kb(BUDGET_BYTES)} budget (${jsFiles.length} files)`);
if (total > BUDGET_BYTES) {
  console.error(`check:size FAILED: ${total} bytes exceeds budget ${BUDGET_BYTES} bytes (docs/SPEC.md).`);
  process.exit(1);
}
console.log('check:size: PASS');
