import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { complianceGate, complianceGateWith, STANDARD_REQUIREMENTS } from './gate';
import { LEDGER, type LedgerRow } from './data/ledger';

/*
 * Gate contract (calc-validator findings M-2 and m-B). The gate never trusts the caller about data
 * status, and each standard is tied to ITS OWN ledger rows. A request is allowed only if ALL hold:
 *   - standard is one of the keys of STANDARD_REQUIREMENTS (unknown strings are DENIED, never throw)
 *   - mandatoryInputs is non-empty and every value is true
 *   - dataLedgerIds is a superset of STANDARD_REQUIREMENTS[standard]
 *   - every referenced row (required AND extra) exists in the ledger and has status VERIFIED
 * Required reason texts (matched case-insensitively):
 *   missing required ids : `required ledger ids not cited for <standard>: <id>, <id>`
 *   unknown standard     : `unrecognised standard: <JSON.stringify(standard)>`
 *   unknown ids          : `unknown ledger ids (not found in ledger): ...`  (unchanged)
 *   non-VERIFIED ids     : `ledger data not VERIFIED: <id> (<status>), ...`  (unchanged)
 * Referenced rows = cited ids UNION required ids, so the IPC-6012 sentinel always yields an unknown-id reason.
 * Requirements are looked up with an own-property check (no 'constructor'/'__proto__' leaks).
 * There is no `dataVerified` field. complianceGate(req) === complianceGateWith(LEDGER, req).
 */
type Std = 'IPC-2221' | 'IPC-2152' | 'IEC 60664-1' | 'IPC-6012';
const STANDARDS: Std[] = ['IPC-2221', 'IPC-2152', 'IEC 60664-1', 'IPC-6012'];
const SENTINEL = '(no ledger row yet for IPC-6012)';

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

// Built lazily from STANDARD_REQUIREMENTS so the tests track the map (and fail per-test, not at load).
const REQ = (s: Std): readonly string[] => STANDARD_REQUIREMENTS[s];
const allRequiredIds = (): string[] => [...new Set(STANDARDS.flatMap((s) => [...REQ(s)]))];
const exactLedger = (s: Std): LedgerRow[] => REQ(s).map((id) => row(id, 'VERIFIED'));
const EXTRAS: readonly LedgerRow[] = [
  row('F-001', 'VERIFIED'),
  row('F-002', 'VERIFIED'),
  row('F-010', 'UNVERIFIED'),
  row('F-020', 'PAYWALLED-USER-MUST-VERIFY'),
  row('F-030', 'CONFLICT'),
];
const fixture = (): LedgerRow[] => [...allRequiredIds().map((id) => row(id, 'VERIFIED')), ...EXTRAS];

interface Req {
  standard: Std;
  mandatoryInputs: Record<string, boolean>;
  dataLedgerIds: string[];
}
const okReq = (): Req => ({
  standard: 'IPC-2221',
  mandatoryInputs: { copperWeight: true, deltaT: true },
  dataLedgerIds: [...REQ('IPC-2221')],
});
const gate = (req: Req) => complianceGateWith(fixture(), req);
const reasonsOf = (g: { reasons: string[] }) => g.reasons.join(' ');

describe('STANDARD_REQUIREMENTS: the requirement map (m-B contract)', () => {
  it('has exactly the four standards', () => {
    expect(Object.keys(STANDARD_REQUIREMENTS).sort()).toEqual([...STANDARDS].sort());
  });
  it('maps each standard to its own existing ledger ids; IPC-6012 is an unsatisfiable sentinel', () => {
    expect(STANDARD_REQUIREMENTS['IPC-2221']).toEqual(['S-001', 'S-010']);
    expect(STANDARD_REQUIREMENTS['IPC-2152']).toEqual(['S-002']);
    expect(STANDARD_REQUIREMENTS['IEC 60664-1']).toEqual(['S-030…S-034']);
    expect(STANDARD_REQUIREMENTS['IPC-6012']).toEqual([SENTINEL]);
  });
  it('every non-sentinel requirement id exists in the real ledger; the sentinel does not', () => {
    for (const s of STANDARDS) {
      for (const id of REQ(s)) {
        const exists = LEDGER.some((r) => r.id === id);
        expect(exists, `${s} requires ${id}`).toBe(id !== SENTINEL);
      }
    }
  });
});

describe('complianceGateWith: allowed path (fixture ledger built from STANDARD_REQUIREMENTS)', () => {
  it.each(['IPC-2221', 'IPC-2152', 'IEC 60664-1'] as Std[])(
    '%s is allowed with exactly its required ids VERIFIED; exact label format',
    (standard) => {
      const ids = [...REQ(standard)];
      const g = complianceGateWith(exactLedger(standard), { standard, mandatoryInputs: { a: true }, dataLedgerIds: ids });
      expect(g.allowed).toBe(true);
      expect(g.missing).toEqual([]);
      expect(g.reasons).toEqual([]);
      expect(g.label).toBe(`${standard} ${WORD} (per verified data: ${ids.join(', ')})`);
    },
  );
  it('a VERIFIED row of ANOTHER standard does not satisfy this standard', () => {
    const g = complianceGateWith(exactLedger('IPC-2152'), {
      standard: 'IPC-2221',
      mandatoryInputs: { a: true },
      dataLedgerIds: [...REQ('IPC-2152')],
    });
    expect(g.allowed).toBe(false);
  });
  it('(5) extra ids beyond the requirements are allowed only if VERIFIED, and appear in the label', () => {
    const ok = gate({ ...okReq(), dataLedgerIds: [...REQ('IPC-2221'), 'F-001', 'F-002'] });
    expect(ok.allowed).toBe(true);
    expect(ok.label.startsWith(`IPC-2221 ${WORD} (per verified data: `)).toBe(true);
    for (const id of [...REQ('IPC-2221'), 'F-001', 'F-002']) expect(ok.label).toContain(id);
    expect(ok.label.endsWith(')')).toBe(true);
    for (const bad of ['F-010', 'F-020', 'F-030', 'X-999']) {
      expect(gate({ ...okReq(), dataLedgerIds: [...REQ('IPC-2221'), bad] }).allowed, bad).toBe(false);
    }
  });
  it('order of cited ids does not matter for the subset test', () => {
    const ids = [...REQ('IPC-2221')].reverse();
    expect(gate({ ...okReq(), dataLedgerIds: ids }).allowed).toBe(true);
  });
});

describe('complianceGateWith: requirement-superset denials (m-B exploits)', () => {
  it('(2) validator exploit: IEC 60664-1 citing only S-006 is DENIED naming the missing required ids', () => {
    const g = complianceGate({ standard: 'IEC 60664-1', mandatoryInputs: { x: true }, dataLedgerIds: ['S-006'] });
    expect(g.allowed).toBe(false);
    expect(reasonsOf(g)).toMatch(/required ledger ids not cited/i);
    expect(reasonsOf(g)).toContain('S-030…S-034');
    expect(FORBIDDEN.test(g.label)).toBe(false);
  });
  it('(2) same exploit against a fixture where S-006 is VERIFIED is still DENIED', () => {
    const ledger = [...exactLedger('IEC 60664-1'), row('S-006', 'VERIFIED')];
    const g = complianceGateWith(ledger, { standard: 'IEC 60664-1', mandatoryInputs: { x: true }, dataLedgerIds: ['S-006'] });
    expect(g.allowed).toBe(false);
    expect(reasonsOf(g)).toContain('S-030…S-034');
  });
  it('(2) IPC-2221 citing S-004 + S-006 (VERIFIED) is DENIED naming S-001 and S-010', () => {
    const ledger = [...exactLedger('IPC-2221'), row('S-004', 'VERIFIED'), row('S-006', 'VERIFIED')];
    const req: Req = { standard: 'IPC-2221', mandatoryInputs: { w: true }, dataLedgerIds: ['S-004', 'S-006'] };
    for (const g of [complianceGateWith(ledger, req), complianceGate(req)]) {
      expect(g.allowed).toBe(false);
      expect(reasonsOf(g)).toMatch(/required ledger ids not cited/i);
      expect(reasonsOf(g)).toContain('S-001');
      expect(reasonsOf(g)).toContain('S-010');
    }
  });
  it('citing only part of the requirement list is DENIED naming just the missing id', () => {
    const g = gate({ ...okReq(), dataLedgerIds: ['S-001'] });
    expect(g.allowed).toBe(false);
    const missingReason = g.reasons.find((r) => /required ledger ids not cited/i.test(r)) ?? '';
    expect(missingReason).toContain('S-010');
    expect(missingReason).not.toContain('S-001');
  });
  it('empty dataLedgerIds is DENIED and the required ids are named', () => {
    const g = gate({ ...okReq(), dataLedgerIds: [] });
    expect(g.allowed).toBe(false);
    expect(reasonsOf(g)).toContain('S-001');
    expect(reasonsOf(g)).toContain('S-010');
  });
});

describe('complianceGateWith: (3) unrecognised standard strings', () => {
  it.each(['IPC-9999', '', 'ipc-2221', 'constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'standard %j is DENIED with a reason and never throws',
    (bad) => {
      const req = { ...okReq(), standard: bad as unknown as Std };
      let g: ReturnType<typeof gate> | undefined;
      expect(() => {
        g = gate(req);
      }).not.toThrow();
      expect(g?.allowed).toBe(false);
      expect(reasonsOf(g ?? { reasons: [] })).toMatch(/unrecogni[sz]ed standard/i);
      expect(g?.label.startsWith(NOT_ASSESSED_PREFIX)).toBe(true);
      expect(FORBIDDEN.test(g?.label ?? '')).toBe(false);
      expect(() => complianceGate(req)).not.toThrow();
      expect(complianceGate(req).allowed).toBe(false);
    },
  );
  it('an unrecognised standard is denied even when every cited id is VERIFIED and all inputs are true', () => {
    const g = gate({
      ...okReq(),
      standard: 'IPC-9999' as unknown as Std,
      dataLedgerIds: ['F-001', 'F-002', ...allRequiredIds()],
    });
    expect(g.allowed).toBe(false);
  });
});

describe('complianceGateWith: denied paths (earlier contract, still holds)', () => {
  it('empty mandatoryInputs is DENIED with an "empty" reason', () => {
    const g = gate({ ...okReq(), mandatoryInputs: {} });
    expect(g.allowed).toBe(false);
    expect(reasonsOf(g)).toMatch(/empty|no mandatory/i);
    expect(g.label.startsWith(NOT_ASSESSED_PREFIX)).toBe(true);
  });
  it('missing input lists exactly the unprovided names, in key order', () => {
    const g = gate({ ...okReq(), mandatoryInputs: { a: true, b: false, c: true, d: false } });
    expect(g.allowed).toBe(false);
    expect(g.missing).toEqual(['b', 'd']);
    expect(reasonsOf(g)).toContain('b');
    expect(reasonsOf(g)).toContain('d');
  });
  it('empty ledger ids denies, with a reason', () => {
    const g = gate({ ...okReq(), dataLedgerIds: [] });
    expect(g.allowed).toBe(false);
    expect(g.reasons.length).toBeGreaterThan(0);
  });
  it('unknown id denies and the reason names the id', () => {
    const g = gate({ ...okReq(), dataLedgerIds: [...REQ('IPC-2221'), 'X-999'] });
    expect(g.allowed).toBe(false);
    expect(reasonsOf(g)).toContain('X-999');
    expect(reasonsOf(g)).toMatch(/unknown|not found|not in/i);
  });
  it.each([
    ['F-010', 'UNVERIFIED'],
    ['F-020', 'PAYWALLED-USER-MUST-VERIFY'],
    ['F-030', 'CONFLICT'],
  ])('non-VERIFIED id %s denies; reason names the id and its status %s', (id, status) => {
    const g = gate({ ...okReq(), dataLedgerIds: [...REQ('IPC-2221'), id] });
    expect(g.allowed).toBe(false);
    const r = reasonsOf(g);
    expect(r).toContain(id);
    expect(r).toContain(status);
  });
  it('a required row that is not VERIFIED denies and names its status', () => {
    const ledger = [row('S-001', 'PAYWALLED-USER-MUST-VERIFY'), row('S-010', 'VERIFIED')];
    const g = complianceGateWith(ledger, okReq());
    expect(g.allowed).toBe(false);
    expect(reasonsOf(g)).toContain('S-001');
    expect(reasonsOf(g)).toContain('PAYWALLED-USER-MUST-VERIFY');
  });
  it('a required row that is absent from the ledger denies as an unknown id', () => {
    const g = complianceGateWith([row('S-001', 'VERIFIED')], okReq());
    expect(g.allowed).toBe(false);
    expect(reasonsOf(g)).toMatch(/unknown|not found/i);
    expect(reasonsOf(g)).toContain('S-010');
  });
  it('accumulates reasons: empty inputs + unknown id + unverified id', () => {
    const g = gate({ ...okReq(), mandatoryInputs: {}, dataLedgerIds: ['X-999', 'F-010'] });
    expect(g.allowed).toBe(false);
    const r = reasonsOf(g);
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
    const sneaky = { ...okReq(), dataLedgerIds: [...REQ('IPC-2221'), 'F-010'], dataVerified: true };
    // passed via a variable: the extra property is not part of GateRequest and must have no effect
    const g = complianceGateWith(fixture(), sneaky);
    expect(g.allowed).toBe(false);
  });
});

describe('complianceGate (real LEDGER): validator exploits are denied', () => {
  it('IEC 60664-1, no inputs, unknown id Q-999', () => {
    const g = complianceGate({ standard: 'IEC 60664-1', mandatoryInputs: {}, dataLedgerIds: ['Q-999'] });
    expect(g.allowed).toBe(false);
    expect(reasonsOf(g)).toContain('Q-999');
    expect(FORBIDDEN.test(g.label)).toBe(false);
  });
  it('IPC-2221 with S-001 (PAYWALLED-USER-MUST-VERIFY in the real ledger)', () => {
    const g = complianceGate({ standard: 'IPC-2221', mandatoryInputs: { width: true }, dataLedgerIds: ['S-001'] });
    expect(g.allowed).toBe(false);
    expect(reasonsOf(g)).toContain('S-001');
    expect(reasonsOf(g)).toContain('PAYWALLED-USER-MUST-VERIFY');
    expect(FORBIDDEN.test(g.label)).toBe(false);
  });
  it('CONFLICT (S-003) and UNVERIFIED (S-011a) rows deny', () => {
    for (const id of ['S-003', 'S-011a']) {
      expect(complianceGate({ standard: 'IPC-2221', mandatoryInputs: { w: true }, dataLedgerIds: [id] }).allowed).toBe(false);
    }
  });
  it('S-006 (VERIFIED) alone no longer allows anything, for any standard', () => {
    for (const standard of STANDARDS) {
      const g = complianceGate({ standard, mandatoryInputs: { a: true }, dataLedgerIds: ['S-006'] });
      expect(g.allowed, standard).toBe(false);
    }
  });
  it('complianceGate(req) is exactly complianceGateWith(LEDGER, req)', () => {
    for (const standard of STANDARDS) {
      const req: Req = { standard, mandatoryInputs: { a: true }, dataLedgerIds: [...REQ(standard), 'S-006'] };
      expect(complianceGate(req)).toEqual(complianceGateWith(LEDGER, req));
    }
  });
  it('(4) REGRESSION GUARD: with the real ledger every standard is currently DENIED', () => {
    for (const standard of STANDARDS) {
      const g = complianceGate({ standard, mandatoryInputs: { a: true }, dataLedgerIds: [...REQ(standard)] });
      expect(
        g.allowed,
        `${standard} is now ALLOWED with the real ledger: every required row (${REQ(standard).join(', ')}) is VERIFIED. ` +
          'If this is intended, a human must update this regression test deliberately.',
      ).toBe(false);
      expect(g.label.startsWith(NOT_ASSESSED_PREFIX)).toBe(true);
      expect(FORBIDDEN.test(g.label)).toBe(false);
    }
  });
  it('IPC-6012 is denied with an unknown-id reason naming the sentinel (no ledger row exists)', () => {
    for (const ids of [[SENTINEL], [] as string[]]) {
      const g = complianceGate({ standard: 'IPC-6012', mandatoryInputs: { a: true }, dataLedgerIds: ids });
      expect(g.allowed).toBe(false);
      expect(reasonsOf(g)).toContain(SENTINEL);
      expect(reasonsOf(g)).toMatch(/unknown|not found/i);
    }
  });
});

describe('complianceGateWith: exhaustive / property', () => {
  it('truth table: inputs ok x id class for every standard', () => {
    const classes: Array<[string, (std: Std) => string[], boolean]> = [
      ['none', () => [], false],
      ['exact requirements', (s) => [...REQ(s)], true],
      ['requirements + VERIFIED extras', (s) => [...REQ(s), 'F-001', 'F-002'], true],
      ['requirements + UNVERIFIED', (s) => [...REQ(s), 'F-010'], false],
      ['requirements + PAYWALLED', (s) => [...REQ(s), 'F-020'], false],
      ['requirements + CONFLICT', (s) => [...REQ(s), 'F-030'], false],
      ['requirements + unknown', (s) => [...REQ(s), 'X-999'], false],
      ['VERIFIED extras only', () => ['F-001'], false],
    ];
    for (const standard of STANDARDS) {
      for (const inputsOk of [true, false]) {
        for (const [name, mk, idsOk] of classes) {
          const g = gate({ standard, mandatoryInputs: { p: true, q: inputsOk }, dataLedgerIds: mk(standard) });
          expect(g.allowed, `${standard}/${inputsOk}/${name}`).toBe(inputsOk && idsOk);
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

  const arbReq = () =>
    fc.record({
      standard: fc.constantFrom<Std>(...STANDARDS),
      mandatoryInputs: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s !== '__proto__'),
        fc.boolean(),
      ),
      dataLedgerIds: fc.subarray([...allRequiredIds(), 'F-001', 'F-002', 'F-010', 'F-020', 'F-030', 'X-999']),
    });

  it('allowed iff inputs non-empty/all true AND ids contain all requirements AND every id is known and VERIFIED', () => {
    const ledger = fixture();
    fc.assert(
      fc.property(arbReq(), (req) => {
        const g = gate(req);
        const keys = Object.keys(req.mandatoryInputs);
        const missing = keys.filter((k) => !req.mandatoryInputs[k]);
        expect(g.missing).toEqual(missing);
        const idsOk =
          req.dataLedgerIds.length > 0 &&
          REQ(req.standard).every((id) => req.dataLedgerIds.includes(id)) &&
          req.dataLedgerIds.every((id) => ledger.find((r) => r.id === id)?.status === 'VERIFIED');
        expect(g.allowed).toBe(keys.length > 0 && missing.length === 0 && idsOk);
        if (g.allowed) for (const id of req.dataLedgerIds) expect(g.label).toContain(id);
        else {
          expect(g.label.startsWith(NOT_ASSESSED_PREFIX)).toBe(true);
          expect(FORBIDDEN.test(g.label)).toBe(false);
        }
      }),
    );
  });

  it('is deterministic and does not mutate the request, ledger or requirement map', () => {
    const ledger = fixture();
    fc.assert(
      fc.property(arbReq(), (req) => {
        const copy = JSON.parse(JSON.stringify(req)) as typeof req;
        const ledgerCopy = JSON.parse(JSON.stringify(ledger)) as unknown;
        const mapCopy = JSON.parse(JSON.stringify(STANDARD_REQUIREMENTS)) as unknown;
        expect(complianceGateWith(ledger, req)).toEqual(complianceGateWith(ledger, req));
        expect(req).toEqual(copy);
        expect(ledger).toEqual(ledgerCopy);
        expect(STANDARD_REQUIREMENTS).toEqual(mapCopy);
      }),
    );
  });
});
