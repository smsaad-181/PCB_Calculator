/**
 * Cross-check runner: loads tests/crosscheck/*.json (not starting with "_"),
 * validates shape, and compares against our calculators via adapters.
 * Values come from real tool runs only. A pass never verifies a ledger row.
 */
import { describe, expect, it } from 'vitest';
import { CROSSCHECK_ADAPTERS } from './crosscheck/adapters';
import {
  evaluateCase,
  formatObtained,
  formatSummary,
  summarize,
  validateRecord,
  type CaseResult,
  type CrosscheckRecord,
} from './crosscheck/runner';

const modules = import.meta.glob('./crosscheck/*.json', { eager: true, import: 'default' });

const files = Object.entries(modules)
  .map(([path, data]) => ({ file: path.slice(path.lastIndexOf('/') + 1), data }))
  .filter((f) => !f.file.startsWith('_'))
  .sort((a, b) => a.file.localeCompare(b.file));

describe('cross-check records', () => {
  const valid: { file: string; record: CrosscheckRecord }[] = [];
  const results: CaseResult[] = [];
  const perFileResults = new Map<string, CaseResult[]>();

  for (const { file, data } of files) {
    describe(file, () => {
      const v = validateRecord(data);
      it('has a valid shape', () => {
        expect(v.ok ? [] : v.errors, `malformed record ${file}`).toEqual([]);
      });
      if (!v.ok) return;
      valid.push({ file, record: v.record });
      const fileResults: CaseResult[] = [];
      perFileResults.set(file, fileResults);
      for (const c of v.record.cases) {
        const r = evaluateCase(c, CROSSCHECK_ADAPTERS);
        results.push(r);
        fileResults.push(r);
        it(`case ${c.id}: ${r.status}`, () => {
          if (r.status === 'pending') return;
          expect(r.status, `${file} / ${c.id}\n${r.messages.join('\n')}`).toBe('pass');
        });
      }
    });
  }

  it('prints summary', () => {
    const line = formatSummary(summarize(files.length, results));
    const perFile = valid.map((f) => formatObtained(f.file, perFileResults.get(f.file) ?? []));
    const obtained = results.filter((r) => r.status !== 'pending').length;
    const skipped = obtained === 0 && results.length > 0 ? ' (all skipped: no tool data recorded yet)' : '';
    const total = `TOTAL: ${String(obtained)} of ${String(results.length)} cases obtained${skipped}`;
    console.log([line, ...perFile, total].join('\n'));
    expect(line.length).toBeGreaterThan(0);
  });
});
