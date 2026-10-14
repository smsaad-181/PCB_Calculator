// npm run check:size: gzip JS budgets (docs/SPEC.md non-functional). Run after `npm run build`.
// (1) First-load per calculator route <= 150 KB gzip: entry chunk + its static shared chunks
//     + that route's lazy chunk and its static dependencies.
// (2) Total across all JS <= 400 KB gzip.
// Uses dist/.vite/manifest.json when present; otherwise parses import statements in the built chunks.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, posix } from 'node:path';
import { evaluateBudget } from './size-lib.mjs';

const FIRST_LOAD_BUDGET = 150 * 1024;
const TOTAL_BUDGET = 400 * 1024;
const CHUNK_WARN_BYTES = 50 * 1024;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const fail = (msg) => {
  console.error(`check:size FAILED: ${msg}`);
  process.exit(1);
};
if (!existsSync(dist) || !statSync(dist).isDirectory()) fail('dist/ not found. Run `npm run build` first.');

const jsFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.js')) jsFiles.push(full);
  }
})(dist);
if (jsFiles.length === 0) fail('no .js files in dist/ (build output looks wrong).');

const kb = (n) => (n / 1024).toFixed(2) + ' KB';
const rel = (f) => relative(dist, f).split('\\').join('/');
const sizes = {};
const texts = {};
for (const f of jsFiles.sort()) {
  const buf = readFileSync(f);
  sizes[rel(f)] = gzipSync(buf, { level: 9 }).length;
  texts[rel(f)] = buf.toString('utf8');
}

/** Fallback when no Vite manifest: build a manifest-shaped graph from import statements. */
function manifestFromChunks() {
  const html = existsSync(join(dist, 'index.html')) ? readFileSync(join(dist, 'index.html'), 'utf8') : '';
  const entries = [...html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)].map((m) =>
    posix.normalize(m[1].replace(/^\.\//, '')),
  );
  if (entries.length === 0) fail('no manifest and no module script in dist/index.html.');
  const m = {};
  const staticRe = /(?:^|[;}\s])import\s*(?:[\w$*{}\s,]*?from\s*)?["']([^"']+\.js)["']/g;
  const dynRe = /import\(\s*["'`]([^"'`]+\.js)["'`]\s*\)/g;
  for (const file of Object.keys(texts)) {
    const dir = posix.dirname(file);
    const resolve = (p) => posix.normalize(posix.join(dir, p));
    const imports = [...texts[file].matchAll(staticRe)].filter((x) => x[1].startsWith('.')).map((x) => resolve(x[1]));
    const dynamicImports = [...texts[file].matchAll(dynRe)].filter((x) => x[1].startsWith('.')).map((x) => resolve(x[1]));
    m[file] = { file, imports: [...new Set(imports)].filter((i) => i in texts), dynamicImports: [...new Set(dynamicImports)].filter((i) => i in texts) };
  }
  for (const e of entries) {
    if (!m[e]) fail(`entry ${e} from index.html not found in dist/.`);
    m[e].isEntry = true;
  }
  return m;
}

const manifestPath = join(dist, '.vite', 'manifest.json');
let manifest;
let source;
if (existsSync(manifestPath)) {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  source = 'vite manifest';
} else {
  console.warn('check:size: dist/.vite/manifest.json missing; falling back to parsing chunk imports.');
  manifest = manifestFromChunks();
  source = 'parsed imports';
}

let result;
try {
  result = evaluateBudget({ manifest, sizes, firstLoadBudget: FIRST_LOAD_BUDGET, totalBudget: TOTAL_BUDGET });
} catch (e) {
  fail(e.message);
}

console.log('Chunks (gzip):');
for (const [f, gz] of Object.entries(sizes)) {
  const warn = gz > CHUNK_WARN_BYTES ? `  WARNING: chunk > ${kb(CHUNK_WARN_BYTES)}` : '';
  console.log(`  ${f}: ${kb(gz)}${warn}`);
}
console.log(`First-load per route (gzip JS, budget ${kb(FIRST_LOAD_BUDGET)}, graph from ${source}), largest first:`);
for (const r of result.routes) console.log(`  ${r.route}: ${kb(r.bytes)} (${r.files.length} files)`);
console.log(`check:size: largest first-load ${result.largest.route} ${kb(result.largest.bytes)} of ${kb(FIRST_LOAD_BUDGET)}`);
console.log(`check:size: total ${kb(result.total)} gzip JS of ${kb(TOTAL_BUDGET)} ceiling (${jsFiles.length} files)`);
if (!result.ok) {
  for (const f of result.failures) console.error(`check:size FAILED: ${f} (docs/SPEC.md).`);
  process.exit(1);
}
console.log('check:size: PASS');
