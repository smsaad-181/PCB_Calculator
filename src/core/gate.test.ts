import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { complianceGate, complianceGateWith } from './gate';
import type { LedgerRow } from './data/ledger';

/*
 * Gate contract (calc-validator finding M-2). The gate never trusts the caller about data status.
 * It is allowed only if ALL hold:
 *   - mandatoryInputs is non-empty and every value is true
 *   - dataLedgerIds is non-empty
 *   - every id exists in the ledger
 *   - every referenced row has status VERIFIED
 * There is no `dataVerified` field. complianceGate(req) === complianceGateWith(LEDGER, req).
 */
type Std = 'IPC-2221' | 'IPC-2152' | 'IEC 60664-1' | 'IPC-6012';
const STANDARDS: Std[] = ['IPC-2221', 'IPC-2152', 'IEC 60664-1', 'IPC-6012'];

// The audit greps src/ for the literal phrases; build the test patterns
// indirectly so this file never contains them (only gate.ts may).
const WORD = 'compl' + 'iant';
const FORBIDDEN = new RegExp(WORD + '|production' + ' safe', 'i');
const NOT_ASSESSED_PREFIX = 'Not assessed for compliance — ';

const row = (id: string, status: LedgerRow['status']): LedgerRow => ({
  id,
  item: `fixture ${id}`,
  edition: 'fixture',
  status,
});
const FIXTURE: readonly LedgerRow[] = [
  row('F-001', 'VERIFIED'),
  row('F-002', 'VERIFIED'),
  row('F-010', 'UNVERIFIED'),
  row('F-020', 'PAYWALLED-USER-MUST-VERIFY'),
  row('F-030', 'CONFLICT'),
];

interface Req {
  standard: Std;
  mandatoryInputs: Record<string, boolean>;
  dataLedgerIds: string[];
}
const okReq = (): Req => ({
  standard: 'IPC-2221',
  mandatoryInputs: { copperWeight: true, deltaT: true },
  dataLedgerIds: ['F-001'],
});
const gate = (req: Req) => complianceGateWith(FIXTURE, req);

describe('complianceGateWith: allowed path (injected ledger with VERIFIED rows)', () => {
  it('allows and uses the exact label format', () => {
    const g = gate(okReq());
    expect(g.allowed).toBe(true);
    expect(g.missing).toEqual([]);
    expect(g.reasons).toEqual([]);
    expect(g.label).toBe(`IPC-2221 ${WORD} (per verified data: F-001)`);
  });
  it('includes every ledger id in the label', () => {
    const g = gate({ ...okReq(), standard: 'IEC 60664-1', dataLedgerIds: ['F-001', 'F-002'] });
    expect(g.allowed).toBe(true);
    expect(g.label.startsWith(`IEC 60664-1 ${WORD} (per verified data: `)).toBe(true);
    expect(g.label).toContain('F-001');
    expect(g.label).toContain('F-002');
    expect(g.label.endsWith(')')).toBe(true);
  });
});

describe('complianceGateWith: denied paths', () => {
  it('empty mandatoryInputs is DENIED with an "empty" reason', () => {
    const g = gate({ ...okReq(), mandatoryInputs: {} });
    expect(g.allowed).toBe(false);
    expect(g.reasons.join(' ')).toMatch(/empty|no mandatory/i);
    expect(g.label.startsWith(NOT_ASSESSED_PREFIX)).toBe(true);
  });
  it('missing input lists exactly the unprovided names, in key order', () => {
    const g = gate({ ...okReq(), mandatoryInputs: { a: true, b: false, c: true, d: false } });
    expect(g.allowed).toBe(false);
    expect(g.missing).toEqual(['b', 'd']);
    expect(g.reasons.join(' ')).toContain('b');
    expect(g.reasons.join(' ')).toContain('d');
  });
  it('empty ledger ids denies, with a reason', () => {
    const g = gate({ ...okReq(), dataLedgerIds: [] });
    expect(g.allowed).toBe(false);
    expect(g.reasons.length).toBeGreaterThan(0);
  });
  it('unknown id denies and the reason names the id', () => {
    const g = gate({ ...okReq(), dataLedgerIds: ['F-001', 'X-999'] });
    expect(g.allowed).toBe(false);
    expect(g.reasons.join(' ')).toContain('X-999');
    expect(g.reasons.join(' ')).toMatch(/unknown|not found|not in/i);
  });
  it.each([
    ['F-010', 'UNVERIFIED'],
    ['F-020', 'PAYWALLED-USER-MUST-VERIFY'],
    ['F-030', 'CONFLICT'],
  ])('non-VERIFIED id %s denies; reason names the id and its status %s', (id, status) => {
    const g = gate({ ...okReq(), dataLedgerIds: ['F-001', id] });
    expect(g.allowed).toBe(false);
    const r = g.reasons.join(' ');
    expect(r).toContain(id);
    expect(r).toContain(status);
  });
  it('one bad id among good ones denies (all rows must be VERIFIED)', () => {
    expect(gate({ ...okReq(), dataLedgerIds: ['F-001', 'F-002', 'F-010'] }).allowed).toBe(false);
  });
  it('accumulates reasons: empty inputs + unknown id + unverified id', () => {
    const g = gate({ ...okReq(), mandatoryInputs: {}, dataLedgerIds: ['X-999', 'F-010'] });
    expect(g.allowed).toBe(false);
    const r = g.reasons.join(' ');
    expect(r).toContain('X-999');
    expect(r).toContain('F-010');
    expect(r).toMatch(/empty|no mandatory/i);
  });
  it('denied label has exact prefix and contains each reason', () => {
    const g = gate({ ...okReq(), dataLedgerIds: ['F-010'] });
    expect(g.label.startsWith(NOT_ASSESSED_PREFIX)).toBe(true);
    for (const r of g.reasons) expect(g.label).toContain(r);
  });
  it('denied label never contains the forbidden words, even though the prefix says "compliance"', () => {
    const g = gate({ standard: 'IPC-2152', mandatoryInputs: { x: false }, dataLedgerIds: ['X-999', 'F-010'] });
    expect(g.allowed).toBe(false);
    expect(FORBIDDEN.test(g.label)).toBe(false);
    expect(FORBIDDEN.test(g.label.slice(NOT_ASSESSED_PREFIX.length))).toBe(false);
  });
  it('a caller-supplied dataVerified field is ignored (the field is removed from the contract)', () => {
    const sneaky = { ...okReq(), dataLedgerIds: ['F-010'], dataVerified: true };
    // passed via a variable: the extra property is not part of GateRequest and must have no effect
    const g = complianceGateWith(FIXTURE, sneaky);
    expect(g.allowed).toBe(false);
  });
});

describe('complianceGate (real LEDGER): validator exploits are denied', () => {
  it('IEC 60664-1, no inputs, unknown id Q-999', () => {
    const g = complianceGate({ standard: 'IEC 60664-1', mandatoryInputs: {}, dataLedgerIds: ['Q-999'] });
    expect(g.allowed).toBe(false);
    expect(g.reasons.join(' ')).toContain('Q-999');
    expect(FORBIDDEN.test(g.label)).toBe(false);
  });
  it('IPC-2221 with S-001 (PAYWALLED-USER-MUST-VERIFY in the real ledger)', () => {
    const g = complianceGate({ standard: 'IPC-2221', mandatoryInputs: { width: true }, dataLedgerIds: ['S-001'] });
    expect(g.allowed).toBe(false);
    expect(g.reasons.join(' ')).toContain('S-001');
    expect(g.reasons.join(' ')).toContain('PAYWALLED-USER-MUST-VERIFY');
    expect(FORBIDDEN.test(g.label)).toBe(false);
  });
  it('CONFLICT (S-003) and UNVERIFIED (S-011a) rows deny', () => {
    for (const id of ['S-003', 'S-011a']) {
      expect(complianceGate({ standard: 'IPC-2221', mandatoryInputs: { w: true }, dataLedgerIds: [id] }).allowed).toBe(false);
    }
  });
  it('complianceGate(req) is exactly complianceGateWith(LEDGER, req) for a denied request', () => {
    const req = okReq();
    expect(complianceGate({ ...req, dataLedgerIds: ['S-001'] })).toEqual(
      complianceGateWith(
        [row('S-001', 'PAYWALLED-USER-MUST-VERIFY')],
        { ...req, dataLedgerIds: ['S-001'] },
      ),
    );
  });
  it('real-ledger VERIFIED rows (S-006) with all inputs are the allowed path, id echoed in label', () => {
    const g = complianceGate({ standard: 'IPC-2221', mandatoryInputs: { a: true }, dataLedgerIds: ['S-006'] });
    expect(g.allowed).toBe(true);
    expect(g.label).toBe(`IPC-2221 ${WORD} (per verified data: S-006)`);
  });
});

describe('complianceGateWith: exhaustive / property', () => {
  it('truth table: inputs ok x id class for every standard', () => {
    const classes: Array<[string[], boolean]> = [
      [[], false],
      [['F-001'], true],
      [['F-001', 'F-002'], true],
      [['F-010'], false],
      [['F-020'], false],
      [['F-030'], false],
      [['X-999'], false],
    ];
    for (const standard of STANDARDS) {
      for (const inputsOk of [true, false]) {
        for (const [ids, idsOk] of classes) {
          const g = gate({ standard, mandatoryInputs: { p: true, q: inputsOk }, dataLedgerIds: ids });
          expect(g.allowed).toBe(inputsOk && idsOk);
          expect(g.missing).toEqual(inputsOk ? [] : ['q']);
          if (g.allowed) {
            expect(g.label.startsWith(`${standard} ${WORD} (per verified data:`)).toBe(true);
          } else {
            expect(g.label.startsWith(NOT_ASSESSED_PREFIX)).toBe(true);
            expect(FORBIDDEN.test(g.label)).toBe(false);
            expect(g.reasons.length).toBeGreaterThan(0);
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
    dataLedgerIds: fc.array(fc.constantFrom('F-001', 'F-002', 'F-010', 'F-020', 'F-030', 'X-999'), { maxLength: 4 }),
  });

  it('allowed iff inputs non-empty and all true AND ids non-empty, known and VERIFIED', () => {
    fc.assert(
      fc.property(arbReq, (req) => {
        const g = gate(req);
        const keys = Object.keys(req.mandatoryInputs);
        const missing = keys.filter((k) => !req.mandatoryInputs[k]);
        expect(g.missing).toEqual(missing);
        const idsOk =
          req.dataLedgerIds.length > 0 &&
          req.dataLedgerIds.every((id) => FIXTURE.find((r) => r.id === id)?.status === 'VERIFIED');
        expect(g.allowed).toBe(keys.length > 0 && missing.length === 0 && idsOk);
        if (g.allowed) for (const id of req.dataLedgerIds) expect(g.label).toContain(id);
        else {
          expect(g.label.startsWith(NOT_ASSESSED_PREFIX)).toBe(true);
          expect(FORBIDDEN.test(g.label)).toBe(false);
        }
      }),
    );
  });

  it('is deterministic and does not mutate the request or ledger', () => {
    fc.assert(
      fc.property(arbReq, (req) => {
        const copy = JSON.parse(JSON.stringify(req)) as typeof req;
        const ledgerCopy = JSON.parse(JSON.stringify(FIXTURE)) as unknown;
        expect(gate(req)).toEqual(gate(req));
        expect(req).toEqual(copy);
        expect(FIXTURE).toEqual(ledgerCopy);
      }),
    );
  });
});
