/** Unit tests for tests/crosscheck/runner.ts using in-memory fixtures only. */
import { describe, expect, it } from 'vitest';
import type { CrosscheckAdapter } from './crosscheck/adapters';
import {
  evaluateCase,
  formatSummary,
  summarize,
  validateRecord,
  type CrosscheckCase,
} from './crosscheck/runner';

function rec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tool: 'fixture tool',
    toolId: 'X-99',
    toolVersion: '1.2.3',
    retrieved: '2026-01-31',
    obtainedBy: 'human',
    method: 'in-memory fixture',
    cases: [caseOf()],
    ...overrides,
  };
}

function caseOf(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c1',
    calculator: 'fx',
    inputs: { a: 1 },
    toolOutputs: { y: 100 },
    compare: [{ output: 'y', relTol: 0.01, why: 'fixture rounding' }],
    ...over,
  };
}

function asCase(over: Record<string, unknown> = {}): CrosscheckCase {
  const v = validateRecord(rec({ cases: [caseOf(over)] }));
  if (!v.ok) throw new Error(v.errors.join('; '));
  return v.record.cases[0] as CrosscheckCase;
}

const adapterOf = (y: number): Record<string, CrosscheckAdapter> => ({ fx: () => ({ y }) });

describe('validateRecord', () => {
  it('accepts a valid record', () => {
    expect(validateRecord(rec()).ok).toBe(true);
  });
  it('rejects non-objects', () => {
    expect(validateRecord(null).ok).toBe(false);
    expect(validateRecord([]).ok).toBe(false);
  });
  it('rejects missing toolVersion', () => {
    const r = rec();
    delete r['toolVersion'];
    const v = validateRecord(r);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join()).toContain('toolVersion');
  });
  it('rejects bad date, bad obtainedBy, empty cases entries', () => {
    expect(validateRecord(rec({ retrieved: 'YYYY-MM-DD' })).ok).toBe(false);
    expect(validateRecord(rec({ retrieved: '2026-02-30' })).ok).toBe(false);
    expect(validateRecord(rec({ obtainedBy: 'robot' })).ok).toBe(false);
    expect(validateRecord(rec({ cases: 'x' })).ok).toBe(false);
  });
  it('rejects the unfilled template', () => {
    const template = {
      tool: 'REPLACE',
      toolId: 'X-00',
      toolVersion: 'REPLACE',
      retrieved: 'YYYY-MM-DD',
      obtainedBy: 'human',
      method: 'REPLACE',
      cases: [
        {
          id: 'REPLACE',
          calculator: 'REPLACE',
          inputs: {},
          toolOutputs: { REPLACE: null },
          compare: [{ output: 'REPLACE', relTol: 0.0, why: 'REPLACE' }],
        },
      ],
    };
    const v = validateRecord(template);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join()).toContain('REPLACE');
  });
  it('rejects a single placeholder in an otherwise valid record', () => {
    expect(validateRecord(rec({ method: 'REPLACE' })).ok).toBe(false);
  });
  it('rejects compare.output missing from toolOutputs', () => {
    const v = validateRecord(rec({ cases: [caseOf({ compare: [{ output: 'z', relTol: 0.1, why: 'w' }] })] }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join()).toContain('not a key of toolOutputs');
  });
  it('rejects negative/NaN relTol and empty why', () => {
    for (const cmp of [
      { output: 'y', relTol: -0.1, why: 'w' },
      { output: 'y', relTol: Number.NaN, why: 'w' },
      { output: 'y', relTol: 0.1, why: '  ' },
      { output: 'y', relTol: 0.1 },
    ]) {
      expect(validateRecord(rec({ cases: [caseOf({ compare: [cmp] })] })).ok).toBe(false);
    }
  });
  it('rejects non-numeric toolOutputs and duplicate ids', () => {
    expect(validateRecord(rec({ cases: [caseOf({ toolOutputs: { y: '100' } })] })).ok).toBe(false);
    expect(validateRecord(rec({ cases: [caseOf(), caseOf()] })).ok).toBe(false);
  });
});

describe('evaluateCase', () => {
  it('null-only case is pending, even with no adapter', () => {
    const r = evaluateCase(asCase({ toolOutputs: { y: null } }), {});
    expect(r.status).toBe('pending');
  });
  it('non-null case with no adapter fails clearly', () => {
    const r = evaluateCase(asCase(), {});
    expect(r.status).toBe('fail');
    expect(r.messages.join()).toContain('no adapter');
  });
  it('passes within relTol', () => {
    expect(evaluateCase(asCase(), adapterOf(100.9)).status).toBe('pass');
  });
  it('fails outside relTol', () => {
    expect(evaluateCase(asCase(), adapterOf(102)).status).toBe('fail');
  });
  it('relTol 0 requires exact equality', () => {
    const c = asCase({ compare: [{ output: 'y', relTol: 0, why: 'exact' }] });
    expect(evaluateCase(c, adapterOf(100)).status).toBe('pass');
    expect(evaluateCase(c, adapterOf(100 + 1e-12)).status).toBe('fail');
  });
  it('fails when adapter omits output, returns NaN, or throws', () => {
    expect(evaluateCase(asCase(), { fx: () => ({}) }).status).toBe('fail');
    expect(evaluateCase(asCase(), adapterOf(Number.NaN)).status).toBe('fail');
    const boom: Record<string, CrosscheckAdapter> = {
      fx: () => {
        throw new Error('bad input');
      },
    };
    const r = evaluateCase(asCase(), boom);
    expect(r.status).toBe('fail');
    expect(r.messages.join()).toContain('bad input');
  });
  it('fails if any compared output is outside tolerance', () => {
    const c = asCase({
      toolOutputs: { y: 100, z: 5 },
      compare: [
        { output: 'y', relTol: 0.01, why: 'w' },
        { output: 'z', relTol: 0.01, why: 'w' },
      ],
    });
    const ad: Record<string, CrosscheckAdapter> = { fx: () => ({ y: 100, z: 6 }) };
    expect(evaluateCase(c, ad).status).toBe('fail');
  });
  it('does not treat inherited keys as adapters', () => {
    expect(evaluateCase(asCase({ calculator: 'toString' }), {}).status).toBe('fail');
  });
});

describe('summarize / formatSummary', () => {
  it('counts statuses', () => {
    const s = summarize(2, [
      { caseId: 'a', status: 'pass', messages: [] },
      { caseId: 'b', status: 'pending', messages: [] },
      { caseId: 'c', status: 'fail', messages: [] },
      { caseId: 'd', status: 'pending', messages: [] },
    ]);
    expect(s).toEqual({ records: 2, cases: 4, passed: 1, pending: 2, failed: 1 });
    expect(formatSummary(s)).toBe('2 cross-check records, 4 cases: 1 passed, 2 pending (null), 1 failed');
  });
  it('zero records prints the README message', () => {
    expect(formatSummary(summarize(0, []))).toBe('0 cross-check records');
  });
});
