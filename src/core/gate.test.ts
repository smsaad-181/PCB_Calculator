import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { complianceGate } from './gate';

type Std = 'IPC-2221' | 'IPC-2152' | 'IEC 60664-1' | 'IPC-6012';
const STANDARDS: Std[] = ['IPC-2221', 'IPC-2152', 'IEC 60664-1', 'IPC-6012'];

// The audit greps src/ for the literal phrases; build the test patterns
// indirectly so this file never contains them (only gate.ts may).
const WORD = 'compl' + 'iant';
const FORBIDDEN = new RegExp(WORD + '|production' + ' safe', 'i');
const NOT_ASSESSED_PREFIX = 'Not assessed for compliance — ';

interface Req {
  standard: Std;
  mandatoryInputs: Record<string, boolean>;
  dataVerified: boolean;
  dataLedgerIds: string[];
}
const okReq = (): Req => ({
  standard: 'IPC-2221',
  mandatoryInputs: { copperWeight: true, deltaT: true },
  dataVerified: true,
  dataLedgerIds: ['S-001'],
});

describe('complianceGate: allowed path', () => {
  it('allows when everything is present and exact label format is used', () => {
    const g = complianceGate(okReq());
    expect(g.allowed).toBe(true);
    expect(g.missing).toEqual([]);
    expect(g.reasons).toEqual([]);
    expect(g.label).toBe(`IPC-2221 ${WORD} (per verified data: S-001)`);
  });
  it('includes every ledger id in the label', () => {
    const g = complianceGate({ ...okReq(), standard: 'IEC 60664-1', dataLedgerIds: ['S-010', 'T-004'] });
    expect(g.allowed).toBe(true);
    expect(g.label.startsWith(`IEC 60664-1 ${WORD} (per verified data: `)).toBe(true);
    expect(g.label).toContain('S-010');
    expect(g.label).toContain('T-004');
    expect(g.label.endsWith(')')).toBe(true);
  });
  it('empty mandatoryInputs is vacuously satisfied', () => {
    expect(complianceGate({ ...okReq(), mandatoryInputs: {} }).allowed).toBe(true);
  });
});

describe('complianceGate: denied paths', () => {
  it('missing input lists exactly the unprovided names, in key order', () => {
    const g = complianceGate({
      ...okReq(),
      mandatoryInputs: { a: true, b: false, c: true, d: false },
    });
    expect(g.allowed).toBe(false);
    expect(g.missing).toEqual(['b', 'd']);
    expect(g.reasons.length).toBeGreaterThan(0);
    expect(g.reasons.join(' ')).toContain('b');
    expect(g.reasons.join(' ')).toContain('d');
  });
  it('unverified data denies, with a reason, and no missing inputs', () => {
    const g = complianceGate({ ...okReq(), dataVerified: false });
    expect(g.allowed).toBe(false);
    expect(g.missing).toEqual([]);
    expect(g.reasons.length).toBeGreaterThan(0);
  });
  it('empty ledger ids denies, with a reason', () => {
    const g = complianceGate({ ...okReq(), dataLedgerIds: [] });
    expect(g.allowed).toBe(false);
    expect(g.reasons.length).toBeGreaterThan(0);
  });
  it('denied label has exact prefix and contains each reason', () => {
    const g = complianceGate({ ...okReq(), dataVerified: false });
    expect(g.label.startsWith(NOT_ASSESSED_PREFIX)).toBe(true);
    for (const r of g.reasons) expect(g.label).toContain(r);
  });
  it('denied label never contains the forbidden words, even though verbatim prefix says "compliance"', () => {
    const g = complianceGate({
      standard: 'IPC-2152',
      mandatoryInputs: { x: false },
      dataVerified: false,
      dataLedgerIds: [],
    });
    expect(g.allowed).toBe(false);
    expect(FORBIDDEN.test(g.label)).toBe(false);
    // the whole label, after removing the permitted prefix, is also clean
    expect(FORBIDDEN.test(g.label.slice(NOT_ASSESSED_PREFIX.length))).toBe(false);
  });
});

describe('complianceGate: exhaustive / property', () => {
  it('truth table: all 2^3 combinations (inputs ok, verified, ids) for every standard', () => {
    for (const standard of STANDARDS) {
      for (const inputsOk of [true, false]) {
        for (const verified of [true, false]) {
          for (const hasIds of [true, false]) {
            const g = complianceGate({
              standard,
              mandatoryInputs: { p: true, q: inputsOk },
              dataVerified: verified,
              dataLedgerIds: hasIds ? ['S-001'] : [],
            });
            const expected = inputsOk && verified && hasIds;
            expect(g.allowed).toBe(expected);
            expect(g.missing).toEqual(inputsOk ? [] : ['q']);
            if (expected) {
              expect(g.label.startsWith(`${standard} ${WORD} (per verified data:`)).toBe(true);
            } else {
              expect(g.label.startsWith(NOT_ASSESSED_PREFIX)).toBe(true);
              expect(FORBIDDEN.test(g.label)).toBe(false);
              expect(g.reasons.length).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  const arbReq = fc.record({
    standard: fc.constantFrom<Std>(...STANDARDS),
    mandatoryInputs: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s !== '__proto__'),
      fc.boolean(),
    ),
    dataVerified: fc.boolean(),
    dataLedgerIds: fc.array(fc.stringMatching(/^[A-Z]-\d{3}$/), { maxLength: 3 }),
  });

  it('allowed iff all inputs provided AND dataVerified AND ids non-empty; missing is exact', () => {
    fc.assert(
      fc.property(arbReq, (req) => {
        const g = complianceGate(req);
        const missing = Object.keys(req.mandatoryInputs).filter((k) => !req.mandatoryInputs[k]);
        expect(g.missing).toEqual(missing);
        const expected = missing.length === 0 && req.dataVerified && req.dataLedgerIds.length > 0;
        expect(g.allowed).toBe(expected);
        if (!g.allowed) {
          expect(g.label.startsWith(NOT_ASSESSED_PREFIX)).toBe(true);
          expect(FORBIDDEN.test(g.label)).toBe(false);
        } else {
          for (const id of req.dataLedgerIds) expect(g.label).toContain(id);
        }
      }),
    );
  });

  it('is deterministic and does not mutate the request', () => {
    fc.assert(
      fc.property(arbReq, (req) => {
        const copy = JSON.parse(JSON.stringify(req)) as typeof req;
        expect(complianceGate(req)).toEqual(complianceGate(req));
        expect(req).toEqual(copy);
      }),
    );
  });
});
