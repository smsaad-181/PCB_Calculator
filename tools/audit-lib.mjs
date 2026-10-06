// Audit logic shared by tools/check-audit.mjs (CLI) and tests/audit.test.ts.
// Pure Node, no dependencies. Types: tools/audit-lib.d.mts.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// CLAUDE.md rule 2: only the gate (and its test, which asserts on the label text) may contain these.
// Matches "IPC compliant", "IPC-compliant", "IPC-2221 compliant", "IEC 60664-1 compliant",
// "IPC-2152-compliant", "IPC-2221B compliant", "production safe"/"production-safe".
// Does not match "not compliant", "non-compliant" or "Not assessed for compliance".
// Also matches wording variants ("compliant with IPC-2221", "complies with IEC ...", "conforms to ...",
// "meets IPC-...", "IPC certified", "certified to IEC ..."), "fab-ready"/"fab ready", and template-built
// strings such as `${std} compliant` / `${standard}-compliant`.
export const FORBIDDEN_PHRASES = new RegExp(
  [
    String.raw`\b(?:IPC|IEC)\b[-\s]*(?:[0-9][0-9A-Za-z.-]*[-\s]*)*compliant\b`,
    String.raw`\bproduction[-\s]safe\b`,
    String.raw`\b(?:compliant\s+with|complies\s+with|conforms?\s+to|meets)\s+(?:IPC|IEC)\b`,
    String.raw`\b(?:IPC|IEC)[-\s]+certified\b`,
    String.raw`\bcertified\s+to\s+(?:IPC|IEC)\b`,
    String.raw`\bfab[-\s]ready\b`,
    String.raw`\$\{[^}]*(?:std|standard|ipc|iec)[^}]*\}[-\s]*compliant\b`,
  ].join('|'),
  'gi',
);
export const ALLOWED_PHRASE_FILES = ['src/core/gate.ts', 'src/core/gate.test.ts'];
export const SCAN_ROOTS = ['src', 'index.html', 'public'];
export const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage', 'docs', '.claude', '.git', 'fixtures']);
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|html|css|md|svg|txt|webmanifest)$/i;

export const ALLOWED_STATUS = ['VERIFIED', 'UNVERIFIED', 'PAYWALLED-USER-MUST-VERIFY'];
export const LEDGER_STATUS = [...ALLOWED_STATUS, 'CONFLICT'];
export const DATA_DIRS = ['src/core/data', 'data'];

const posix = (p) => p.split(sep).join('/');

/** Recursively list files under `start` (absolute), skipping excluded dir names. */
function walk(start, out = []) {
  if (!existsSync(start)) return out;
  if (statSync(start).isFile()) {
    out.push(start);
    return out;
  }
  for (const name of readdirSync(start)) {
    const full = join(start, name);
    if (statSync(full).isDirectory()) {
      if (!EXCLUDED_DIRS.has(name)) walk(full, out);
    } else out.push(full);
  }
  return out;
}

/** @returns {{file:string,line:number,phrase:string}[]} */
export function scanForbiddenPhrases(root, opts = {}) {
  const roots = opts.roots ?? SCAN_ROOTS;
  const allowed = opts.allowed ?? ALLOWED_PHRASE_FILES;
  const hits = [];
  for (const r of roots) {
    for (const file of walk(join(root, r))) {
      const rel = posix(relative(root, file));
      if (allowed.includes(rel) || !TEXT_EXT.test(rel)) continue;
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((text, i) => {
          for (const m of text.matchAll(FORBIDDEN_PHRASES)) hits.push({ file: rel, line: i + 1, phrase: m[0] });
        });
    }
  }
  return hits;
}

/** Validate one parsed data-table object. Returns list of error strings. */
export function validateTable(obj, relPath) {
  const errs = [];
  const e = (m) => errs.push(`${relPath}: ${m}`);
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return [`${relPath}: top level must be an object`];
  const t = /** @type {Record<string, unknown>} */ (obj);
  for (const k of ['source', 'edition']) {
    if (typeof t[k] !== 'string' || t[k].trim() === '') e(`missing or empty "${k}"`);
  }
  if (!Array.isArray(t.ledgerIds) || t.ledgerIds.length === 0 || !t.ledgerIds.every((x) => typeof x === 'string' && x))
    e('"ledgerIds" must be a non-empty array of strings');
  const status = t.status;
  if (typeof status !== 'string' || !ALLOWED_STATUS.includes(status))
    e(`"status" must be one of ${ALLOWED_STATUS.join('|')}`);
  if (typeof t.verifiedBy !== 'string') e('"verifiedBy" must be a string');
  else if (t.verifiedBy === '' && status === 'VERIFIED') e('"verifiedBy" may not be empty when status is VERIFIED');
  if (typeof status === 'string' && status !== 'VERIFIED' && t.bannerRequired !== true)
    e('non-VERIFIED table requires "bannerRequired": true');
  const isFab = /fab-profile[^/]*\.json$/i.test(relPath) || relPath.includes('data/fab-profiles/');
  if (isFab) {
    if (
      typeof t.profileDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(t.profileDate) ||
      Number.isNaN(Date.parse(t.profileDate))
    )
      e('fab profile needs "profileDate" (ISO date YYYY-MM-DD)');
    if (typeof t.fabricator !== 'string' || t.fabricator.trim() === '') e('fab profile needs "fabricator"');
  }
  return errs;
}

/** @returns {{count:number, errors:string[]}} */
export function auditDataTables(root, dirs = DATA_DIRS) {
  const seen = new Set();
  const errors = [];
  for (const d of dirs) {
    for (const file of walk(join(root, d))) {
      if (!file.toLowerCase().endsWith('.json') || seen.has(file)) continue;
      seen.add(file);
      const rel = posix(relative(root, file));
      let obj;
      try {
        obj = JSON.parse(readFileSync(file, 'utf8'));
      } catch (err) {
        errors.push(`${rel}: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
        continue;
      }
      errors.push(...validateTable(obj, rel));
    }
  }
  return { count: seen.size, errors };
}

/** Ledger IDs: S-001, or sub-rows like S-011a. */
const LEDGER_ID_RE = /S-\d{3}[a-z]?/g;
const idNum = (id) => Number(id.slice(2, 5));

/**
 * Parse the ledger markdown tables. Ranges like "S-020…S-028" cover every ID in between.
 * The status cell is located by the "Status" header of the current table (falls back to the last column).
 */
export function parseLedger(text) {
  const ids = new Set();
  const ranges = [];
  const errors = [];
  let rows = 0;
  let statusCol = -1;
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim().startsWith('|')) {
      statusCol = -1;
      return;
    }
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    const idCell = cells[0] ?? '';
    const found = idCell.match(LEDGER_ID_RE);
    if (!found) {
      const h = cells.indexOf('Status');
      if (h >= 0) statusCol = h;
      return; // header / separator
    }
    rows++;
    const status = cells[statusCol >= 0 ? statusCol : cells.length - 1] ?? '';
    if (!LEDGER_STATUS.includes(status))
      errors.push(`LEDGER.md line ${i + 1} (${idCell}): status "${status}" not in ${LEDGER_STATUS.join('|')}`);
    if (found.length >= 2) ranges.push([idNum(found[0] ?? 'S-000'), idNum(found[found.length - 1] ?? 'S-000')]);
    for (const id of found) ids.add(id);
  });
  if (rows === 0) errors.push('LEDGER.md: no ledger rows found');
  return { ids, ranges, rows, errors };
}

export function ledgerCovers(ledger, id) {
  if (ledger.ids.has(id)) return true;
  // A parent ID (S-011) is covered by its sub-rows (S-011a, S-011b, ...).
  for (const known of ledger.ids) if (known.startsWith(id) && known.length === id.length + 1) return true;
  const n = idNum(id);
  return ledger.ranges.some(([a, b]) => n >= a && n <= b);
}

/** Every ledger ID (S-001, S-011a) referenced in src/** must exist in the ledger. */
export function auditLedgerRefs(root, ledger, srcDir = 'src') {
  const errors = [];
  for (const file of walk(join(root, srcDir))) {
    const rel = posix(relative(root, file));
    if (!TEXT_EXT.test(rel)) continue;
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((text, i) => {
        for (const m of text.matchAll(LEDGER_ID_RE))
          if (!ledgerCovers(ledger, m[0]))
            errors.push(`${rel}:${i + 1}: ledger ID ${m[0]} not found in docs/sources/LEDGER.md`);
      });
  }
  return errors;
}

/** Run everything. Fixture roots without a ledger file may pass `ledgerText`. */
export function runAudit(root, opts = {}) {
  const errors = [];
  for (const h of scanForbiddenPhrases(root))
    errors.push(`${h.file}:${h.line}: forbidden compliance phrase "${h.phrase}" (only src/core/gate.ts and its test may contain it)`);
  const data = auditDataTables(root);
  errors.push(...data.errors);
  let ledgerText = opts.ledgerText;
  if (ledgerText === undefined) {
    const p = join(root, 'docs/sources/LEDGER.md');
    if (existsSync(p)) ledgerText = readFileSync(p, 'utf8');
    else errors.push('docs/sources/LEDGER.md not found');
  }
  let ledgerRows = 0;
  if (ledgerText !== undefined) {
    const ledger = parseLedger(ledgerText);
    ledgerRows = ledger.rows;
    errors.push(...ledger.errors);
    errors.push(...auditLedgerRefs(root, ledger));
  }
  return { errors, tables: data.count, ledgerRows };
}

/** Test helper: absolute path of tests/fixtures/audit/<name> relative to a test file's import.meta.url. */
export function fixtureRoot(testFileUrl, name) {
  return join(fileURLToPath(new URL('./fixtures/audit/', testFileUrl)), name);
}
