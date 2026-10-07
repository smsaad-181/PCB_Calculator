import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as units from './units';
import { DIM, q } from './units';
import type { Quantity } from './units';
import * as res from './result';
import { FAB_PROFILE_MAX_AGE_DAYS, assertCalcResult, assertNoNonFinite, checkCopperBasis, checkElements, rankElements } from './result';
import type { Bound, CalcResult, CopperBasis, ElementResult } from './result';

// Gate G-2/G-3: result schema v2 (bound, designValues, elements, copperBasis, exports, fabProfile age) and
// assertCalcResult (every problem, never throws). Test-only numbers; nothing here is a physical claim.

const bad = (si: number, dim: Quantity['dim'] = DIM.LENGTH): Quantity => ({ si, dim }) as Quantity;
const el = (id: string, load: number, limit: number, extra: Partial<ElementResult> = {}): ElementResult => ({
  id,
  name: `element ${id}`,
  kind: 'trace',
  load: q(load, DIM.CURRENT),
  limit: q(limit, DIM.CURRENT),
  utilisation: load / limit,
  margin: q(limit - load, DIM.CURRENT),
  ...extra,
});
const cb = (): CopperBasis => ({ layer: 'outer', basis: 'finished', thickness: q(35e-6, DIM.LENGTH), source: 'fab stackup sheet' });

function good(): CalcResult {
  const elements = [el('a', 1, 4), el('b', 3, 4), el('c', 2, 4)];
  return {
    method: 'test',
    reference: { standard: 'TEST', edition: 'n/a', ledgerIds: [] },
    formula: 'y = x',
    inputs: [{ name: 'x', value: q(1, DIM.LENGTH), source: 'user' }],
    assumptions: [],
    steps: [{ label: 's1', expr: 'x', value: q(1, DIM.LENGTH) }],
    results: [
      { name: 'y', value: q(2, DIM.LENGTH), role: 'primary', bound: 'nominal' },
      { name: 'ampacity', value: q(3, DIM.CURRENT), role: 'secondary', bound: 'max-capacity' },
    ],
    validityChecks: [],
    warnings: [{ severity: 'info', message: 'fyi' }],
    confidence: { level: 'medium', reasons: ['r'], score: 1 },
    recommendation: 'none',
    dataStatus: 'VERIFIED',
    designValues: [
      {
        name: 'current limit',
        direction: 'max-limit',
        calculated: q(10, DIM.CURRENT),
        recommended: q(7, DIM.CURRENT),
        derating: { factor: 0.7, rationale: 'test' },
      },
    ],
    envelope: [{ name: 'width', min: q(1, DIM.LENGTH), typ: q(2, DIM.LENGTH), max: q(3, DIM.LENGTH), toleranceInputs: [] }],
    elements,
    limitingElement: { id: 'b', name: 'element b', reason: 'highest utilisation' },
    copperBasis: cb(),
    exports: [{ id: 'nc-1', kind: 'net-class', values: { width: q(0.2e-3, DIM.LENGTH) }, note: 'n' }],
    // CHANGED (contract A6): status was 'UNVERIFIED' with dataStatus 'VERIFIED', which is now an error (fab profile
    // status must not be better than the result's dataStatus). The fixture is now a VERIFIED profile.
    fabProfile: { id: 'p', fabricator: 'F', profileDate: '2026-10-06', status: 'VERIFIED', ageDays: 3, stale: false },
  };
}

/** Run assertCalcResult and return the error list (asserting failure). */
function errorsOf(r: CalcResult): string[] {
  const out = assertCalcResult(r);
  expect(out.ok).toBe(false);
  return out.ok ? [] : out.error;
}
const joined = (e: string[]): string => e.join(' | ').toLowerCase();

describe('Bound type and roundDirectionFor', () => {
  it('the four bounds are assignable to Bound', () => {
    const b: Bound[] = ['min-requirement', 'max-capacity', 'nominal', 'prediction'];
    expect(b).toHaveLength(4);
  });
  it('roundDirectionFor (if the units agent has added it) is a function covering every bound', () => {
    const f = (units as unknown as Record<string, unknown>)['roundDirectionFor'];
    if (f === undefined) return; // added by the units agent; not part of this file's contract
    expect(typeof f).toBe('function');
    for (const b of ['min-requirement', 'max-capacity', 'nominal', 'prediction'] as const) {
      expect((f as (x: Bound) => unknown)(b)).toBeDefined();
    }
  });
  it('results[] items require bound (compile-time)', () => {
    // @ts-expect-error bound is required
    const r: CalcResult['results'][number] = { name: 'y', value: q(1, DIM.LENGTH), role: 'primary' };
    expect(r).toBeDefined();
  });
});

describe('assertCalcResult: accepts a fully valid result', () => {
  it('returns ok with the same object', () => {
    const r = good();
    const out = assertCalcResult(r);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value).toBe(r);
  });
  it('a minimal result (no optional blocks, empty designValues) is ok', () => {
    const { elements: _e, limitingElement: _l, copperBasis: _c, exports: _x, fabProfile: _f, envelope: _v, ...rest } = good();
    void [_e, _l, _c, _x, _f, _v];
    expect(assertCalcResult({ ...rest, designValues: [] }).ok).toBe(true);
  });
  it('never throws, even on garbage numbers', () => {
    const r = good();
    r.inputs[0] = { name: 'x', value: bad(NaN), source: 'user' };
    expect(() => assertCalcResult(r)).not.toThrow();
  });
});

describe('assertCalcResult: non-finite quantities anywhere, each located by name', () => {
  it.each([NaN, Infinity, -Infinity])('inputs %s', (v) => {
    const r = good();
    r.inputs[0] = { name: 'badinput', value: bad(v), source: 'user' };
    expect(joined(errorsOf(r))).toContain('badinput');
  });
  it.each([NaN, Infinity, -Infinity])('steps %s', (v) => {
    const r = good();
    r.steps[0] = { label: 'badstep', expr: 'e', value: bad(v) };
    expect(joined(errorsOf(r))).toContain('badstep');
  });
  it.each([NaN, Infinity, -Infinity])('results %s', (v) => {
    const r = good();
    r.results[0] = { name: 'badresult', value: bad(v), role: 'primary', bound: 'nominal' };
    expect(joined(errorsOf(r))).toContain('badresult');
  });
  it.each([NaN, Infinity, -Infinity])('designValues %s', (v) => {
    const r = good();
    const dv = r.designValues[0];
    if (!dv) throw new Error('fixture');
    r.designValues = [{ ...dv, name: 'baddv', calculated: bad(v, DIM.CURRENT) }];
    expect(joined(errorsOf(r))).toContain('baddv');
  });
  it.each([NaN, Infinity, -Infinity])('envelope %s', (v) => {
    const r = good();
    r.envelope = [{ name: 'badenv', min: q(1, DIM.LENGTH), typ: q(2, DIM.LENGTH), max: bad(v), toleranceInputs: [] }];
    expect(joined(errorsOf(r))).toContain('badenv');
  });
  it.each([NaN, Infinity, -Infinity])('elements (load) %s', (v) => {
    const r = good();
    r.elements = [el('a', 1, 4), el('b', 3, 4, { load: bad(v, DIM.CURRENT) }), el('c', 2, 4)];
    expect(errorsOf(r).length).toBeGreaterThan(0);
    expect(joined(errorsOf(r))).toMatch(/\bb\b|element b/);
  });
  it.each([NaN, Infinity, -Infinity])('copperBasis.thickness %s', (v) => {
    const r = good();
    r.copperBasis = { ...cb(), thickness: bad(v) };
    expect(joined(errorsOf(r))).toContain('copper');
  });
  it.each([NaN, Infinity, -Infinity])('exports values %s', (v) => {
    const r = good();
    r.exports = [{ id: 'badexport', kind: 'net-class', values: { width: bad(v) }, note: 'n' }];
    expect(joined(errorsOf(r))).toContain('badexport');
  });
});

describe('assertCalcResult: other structural problems', () => {
  it.each([NaN, Infinity, -Infinity])('confidence.score %s', (v) => {
    const r = good();
    r.confidence = { level: 'low', reasons: ['r'], score: v };
    expect(joined(errorsOf(r))).toContain('score');
  });
  it('confidence level outside high/medium/low', () => {
    const r = good();
    r.confidence = { level: 'extreme' as unknown as 'low', reasons: [], score: 0 };
    expect(joined(errorsOf(r))).toContain('level');
  });
  it('unknown dataStatus', () => {
    const r = good();
    r.dataStatus = 'BOGUS' as unknown as CalcResult['dataStatus'];
    expect(joined(errorsOf(r))).toContain('datastatus');
  });
  it('a result item missing bound', () => {
    const r = good();
    r.results[1] = { name: 'nobound', value: q(1, DIM.CURRENT), role: 'secondary' } as unknown as CalcResult['results'][number];
    const e = joined(errorsOf(r));
    expect(e).toContain('bound');
    expect(e).toContain('nobound');
  });
  it('a result item with an unknown bound', () => {
    const r = good();
    r.results[1] = { name: 'oddbound', value: q(1, DIM.CURRENT), role: 'secondary', bound: 'upper' } as unknown as CalcResult['results'][number];
    expect(joined(errorsOf(r))).toContain('oddbound');
  });
  it('NaN derating factor', () => {
    const r = good();
    const dv = r.designValues[0];
    if (!dv) throw new Error('fixture');
    r.designValues = [{ ...dv, name: 'nanfactor', derating: { factor: NaN, rationale: 'r' } }];
    expect(joined(errorsOf(r))).toContain('nanfactor');
  });
  it('an inconsistent design value (recommended != calculated x factor)', () => {
    const r = good();
    const dv = r.designValues[0];
    if (!dv) throw new Error('fixture');
    r.designValues = [{ ...dv, name: 'inconsistent', recommended: q(9, DIM.CURRENT) }];
    expect(joined(errorsOf(r))).toContain('inconsistent');
  });
  it('a design value in absolute temperature', () => {
    const r = good();
    r.designValues = [
      {
        name: 'tmax',
        direction: 'max-limit',
        calculated: q(400, DIM.ABS_TEMPERATURE),
        recommended: q(280, DIM.ABS_TEMPERATURE),
        derating: { factor: 0.7, rationale: 'r' },
      },
    ];
    expect(joined(errorsOf(r))).toContain('absolute temperature');
  });
  it('an unsorted envelope (min > typ)', () => {
    const r = good();
    r.envelope = [{ name: 'unsorted', min: q(5, DIM.LENGTH), typ: q(2, DIM.LENGTH), max: q(3, DIM.LENGTH), toleranceInputs: [] }];
    expect(joined(errorsOf(r))).toContain('unsorted');
  });
  it('warning with an unknown severity', () => {
    const r = good();
    r.warnings = [{ severity: 'fatal' as unknown as 'info', message: 'boom' }];
    expect(joined(errorsOf(r))).toContain('severity');
  });
  it('limitingElement not equal to the top-ranked element', () => {
    const r = good();
    r.limitingElement = { id: 'a', name: 'element a', reason: 'wrong' };
    expect(joined(errorsOf(r))).toContain('limitingelement');
  });
  it('limitingElement absent while elements are present', () => {
    const r = good();
    delete r.limitingElement;
    expect(joined(errorsOf(r))).toContain('limitingelement');
  });
  it('limitingElement ties follow rankElements (ties by id ascending)', () => {
    const r = good();
    r.elements = [el('z', 2, 4), el('m', 2, 4)];
    r.limitingElement = { id: 'm', name: 'element m', reason: 'tie, lowest id' };
    expect(assertCalcResult(r).ok).toBe(true);
    r.limitingElement = { id: 'z', name: 'element z', reason: 'tie' };
    expect(assertCalcResult(r).ok).toBe(false);
  });
  it('an invalid element (utilisation inconsistent)', () => {
    const r = good();
    r.elements = [el('a', 1, 4), el('b', 3, 4, { utilisation: 0.1 }), el('c', 2, 4)];
    expect(assertCalcResult(r).ok).toBe(false);
  });
  it('an invalid copperBasis (missing layer)', () => {
    const r = good();
    const { layer: _l, ...rest } = cb();
    void _l;
    r.copperBasis = rest as unknown as CopperBasis;
    expect(joined(errorsOf(r))).toContain('layer');
  });
  it('fabProfile.ageDays negative, fractional or non-finite is flagged (error mentions ageDays)', () => {
    for (const age of [-1, 1.5, NaN, Infinity]) {
      const r = good();
      if (!r.fabProfile) throw new Error('fixture');
      r.fabProfile = { ...r.fabProfile, ageDays: age };
      expect(joined(errorsOf(r))).toContain('agedays');
    }
  });
  it('fabProfile.stale must be a boolean', () => {
    const r = good();
    if (!r.fabProfile) throw new Error('fixture');
    r.fabProfile = { ...r.fabProfile, stale: 'no' as unknown as boolean };
    expect(joined(errorsOf(r))).toContain('stale');
  });
  it('reports EVERY problem, not just the first', () => {
    const r = good();
    r.inputs[0] = { name: 'badinput', value: bad(NaN), source: 'user' };
    r.confidence = { level: 'extreme' as unknown as 'low', reasons: [], score: NaN };
    r.dataStatus = 'BOGUS' as unknown as CalcResult['dataStatus'];
    r.results[1] = { name: 'nobound', value: q(1, DIM.CURRENT), role: 'secondary' } as unknown as CalcResult['results'][number];
    r.warnings = [{ severity: 'fatal' as unknown as 'info', message: 'boom' }];
    r.limitingElement = { id: 'a', name: 'element a', reason: 'wrong' };
    const e = errorsOf(r);
    expect(e.length).toBeGreaterThanOrEqual(6);
    const j = joined(e);
    for (const k of ['badinput', 'score', 'level', 'datastatus', 'nobound', 'severity', 'limitingelement']) expect(j).toContain(k);
  });
  it('error entries are non-empty strings', () => {
    const r = good();
    r.dataStatus = 'BOGUS' as unknown as CalcResult['dataStatus'];
    for (const m of errorsOf(r)) {
      expect(typeof m).toBe('string');
      expect(m.trim().length).toBeGreaterThan(5);
    }
  });
});

describe('assertNoNonFinite keeps throwing and covers the new blocks', () => {
  it('passes for the valid fixture', () => {
    expect(() => assertNoNonFinite(good())).not.toThrow();
  });
  it('throws for NaN derating factor and confidence.score', () => {
    const r = good();
    const dv = r.designValues[0];
    if (!dv) throw new Error('fixture');
    r.designValues = [{ ...dv, derating: { factor: NaN, rationale: 'r' } }];
    expect(() => assertNoNonFinite(r)).toThrow();
    const r2 = good();
    r2.confidence = { level: 'low', reasons: [], score: NaN };
    expect(() => assertNoNonFinite(r2)).toThrow();
  });
  it('throws for non-finite elements, copperBasis and exports', () => {
    const a = good();
    a.elements = [el('b', 3, 4, { load: bad(NaN, DIM.CURRENT) })];
    expect(() => assertNoNonFinite(a)).toThrow();
    const b = good();
    b.copperBasis = { ...cb(), thickness: bad(Infinity) };
    expect(() => assertNoNonFinite(b)).toThrow();
    const c = good();
    c.exports = [{ id: 'e', kind: 'net-class', values: { w: bad(NaN) }, note: 'n' }];
    expect(() => assertNoNonFinite(c)).toThrow();
  });
});

describe('rankElements', () => {
  it('sorts by utilisation descending', () => {
    expect(rankElements([el('a', 1, 4), el('b', 3, 4), el('c', 2, 4)]).map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });
  it('ties are broken by id ascending', () => {
    expect(rankElements([el('z', 2, 4), el('m', 2, 4), el('a', 1, 4)]).map((e) => e.id)).toEqual(['m', 'z', 'a']);
  });
  it('over-limit elements (utilisation > 1) rank first', () => {
    expect(rankElements([el('a', 3, 4), el('b', 5, 4)])[0]?.id).toBe('b');
  });
  it('does not mutate its argument and returns a new array', () => {
    const input = [el('a', 1, 4), el('b', 3, 4)];
    const copy = input.map((e) => e.id);
    const out = rankElements(input);
    expect(input.map((e) => e.id)).toEqual(copy);
    expect(out).not.toBe(input);
  });
  it('accepts a frozen array and an empty array', () => {
    expect(() => rankElements(Object.freeze([el('a', 1, 4)]))).not.toThrow();
    expect(rankElements([])).toEqual([]);
  });
  it('is order independent and idempotent (property)', () => {
    const arb = fc.uniqueArray(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 10 });
    fc.assert(
      fc.property(arb, fc.array(fc.integer({ min: 1, max: 8 }), { minLength: 10, maxLength: 10 }), (ids, loads) => {
        const es = ids.map((n, i) => el(`e${String(n).padStart(2, '0')}`, loads[i] ?? 1, 8));
        const a = rankElements(es).map((e) => e.id);
        const b = rankElements([...es].reverse()).map((e) => e.id);
        expect(a).toEqual(b);
        expect(rankElements(rankElements(es)).map((e) => e.id)).toEqual(a);
        for (let i = 1; i < a.length; i++) {
          const prev = rankElements(es)[i - 1];
          const cur = rankElements(es)[i];
          expect((prev?.utilisation ?? 0) >= (cur?.utilisation ?? 0)).toBe(true);
        }
      }),
    );
  });
});

describe('checkElements', () => {
  const errs = (es: ElementResult[]): string => {
    const r = checkElements(es);
    expect(r.ok).toBe(false);
    return r.ok ? '' : r.error.join(' | ').toLowerCase();
  };
  it('accepts consistent elements and returns them', () => {
    const es = [el('a', 1, 4), el('b', 3, 4)];
    const r = checkElements(es);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toHaveLength(2);
  });
  it('accepts an over-limit element with negative margin', () => {
    expect(checkElements([el('a', 5, 4)]).ok).toBe(true);
  });
  it('accepts an empty list', () => {
    expect(checkElements([]).ok).toBe(true);
  });
  it('rejects load/limit of different dimensions (mentions "dimension")', () => {
    expect(errs([el('a', 1, 4, { limit: q(4, DIM.LENGTH) })])).toContain('dimension');
  });
  it('rejects margin of a different dimension', () => {
    expect(errs([el('a', 1, 4, { margin: q(3, DIM.LENGTH) })])).toContain('dimension');
  });
  it.each([0, -1, NaN, Infinity])('rejects limit %s (mentions "limit")', (v) => {
    expect(errs([el('a', 1, 4, { limit: bad(v, DIM.CURRENT) })])).toContain('limit');
  });
  it('rejects utilisation not equal to load/limit', () => {
    expect(errs([el('a', 1, 4, { utilisation: 0.5 })])).toContain('utilisation');
  });
  it('accepts utilisation within 1e-9 relative and rejects just outside', () => {
    expect(checkElements([el('a', 1, 4, { utilisation: 0.25 * (1 + 5e-10) })]).ok).toBe(true);
    expect(checkElements([el('a', 1, 4, { utilisation: 0.25 * (1 + 5e-9) })]).ok).toBe(false);
  });
  it('rejects margin != limit - load', () => {
    expect(errs([el('a', 1, 4, { margin: q(2, DIM.CURRENT) })])).toContain('margin');
  });
  it.each([NaN, Infinity])('rejects non-finite load %s', (v) => {
    expect(checkElements([el('a', 1, 4, { load: bad(v, DIM.CURRENT) })]).ok).toBe(false);
  });
  it('rejects an unknown kind and an empty id', () => {
    expect(errs([el('a', 1, 4, { kind: 'wire' as unknown as ElementResult['kind'] })])).toContain('kind');
    expect(errs([el('', 1, 4)])).toContain('id');
  });
  it('rejects duplicate ids', () => {
    expect(errs([el('a', 1, 4), el('a', 2, 4)])).toContain('duplicate');
  });
  it('returns ALL problems across all elements', () => {
    const r = checkElements([el('a', 1, 4, { utilisation: 0.9 }), el('b', 1, 4, { margin: q(0, DIM.CURRENT) }), el('c', 1, 0)]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.length).toBeGreaterThanOrEqual(3);
      const j = r.error.join(' | ');
      for (const id of ['a', 'b', 'c']) expect(j).toMatch(new RegExp(`\\b${id}\\b`));
    }
  });
  it('all seven kinds are accepted', () => {
    for (const kind of ['trace', 'via', 'pad', 'connector', 'spoke', 'pour-neck', 'other'] as const) {
      expect(checkElements([el('a', 1, 4, { kind })]).ok).toBe(true);
    }
  });
});

describe('checkCopperBasis', () => {
  const err = (b: unknown): string => {
    const r = checkCopperBasis(b as CopperBasis);
    expect(r.ok).toBe(false);
    return r.ok ? '' : String(r.error).toLowerCase();
  };
  it('accepts a valid basis for each layer and basis kind', () => {
    for (const layer of ['outer', 'inner'] as const) {
      for (const basis of ['nominal', 'finished', 'measured'] as const) {
        expect(checkCopperBasis({ ...cb(), layer, basis }).ok).toBe(true);
      }
    }
  });
  it('layer is REQUIRED (missing, unknown)', () => {
    const { layer: _l, ...rest } = cb();
    void _l;
    expect(err(rest)).toContain('layer');
    expect(err({ ...cb(), layer: 'middle' })).toContain('layer');
  });
  it('rejects unknown basis', () => {
    expect(err({ ...cb(), basis: 'rough' })).toContain('basis');
  });
  it.each([0, -35e-6, NaN, Infinity])('rejects thickness %s', (v) => {
    expect(err({ ...cb(), thickness: bad(v) })).toContain('thickness');
  });
  it('rejects a thickness that is not a length', () => {
    expect(err({ ...cb(), thickness: q(35e-6, DIM.CURRENT) })).toContain('thickness');
  });
  it.each(['', '   '])('rejects empty source %j', (s) => {
    expect(err({ ...cb(), source: s })).toContain('source');
  });
  it('layer is required at type level', () => {
    // @ts-expect-error layer is required
    const b: CopperBasis = { basis: 'nominal', thickness: q(35e-6, DIM.LENGTH), source: 's' };
    expect(b).toBeDefined();
  });
});

describe('schema exports exist', () => {
  it('result module exports the new functions', () => {
    for (const n of ['assertCalcResult', 'checkElements', 'rankElements', 'checkCopperBasis']) {
      expect(typeof (res as unknown as Record<string, unknown>)[n]).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Contract A (domain review G3-a/b/e): confidence, validity checks, primary result, negative minimum, fab profile.
// ---------------------------------------------------------------------------------------------------------
type Conf = CalcResult['confidence'];
const withConf = (c: Conf, mut?: (r: CalcResult) => void): CalcResult => {
  const r = good();
  r.confidence = c;
  mut?.(r);
  return r;
};
const failedCheck = (r: CalcResult): void => {
  r.validityChecks = [{ name: 'current in range', ok: false, detail: '40 A > 35 A' }];
};

describe('assertCalcResult A1: a failed validity check forces confidence low', () => {
  it.each([
    ['high', 0, []],
    ['medium', 1, ['r']],
  ] as const)('failed check with level %s is an error containing "validity check"', (level, score, reasons) => {
    const r = withConf({ level, reasons: [...reasons], score }, failedCheck);
    expect(joined(errorsOf(r))).toContain('validity check');
  });
  it('failed check with level low is accepted (even when the score alone would say medium)', () => {
    expect(assertCalcResult(withConf({ level: 'low', reasons: ['current = 40 A (allowed: <= 35 A)'], score: 1 }, failedCheck)).ok).toBe(true);
    expect(assertCalcResult(withConf({ level: 'low', reasons: ['r'], score: 2 }, failedCheck)).ok).toBe(true);
  });
  it('all checks ok: no validity-check error at any level', () => {
    const r = withConf({ level: 'high', reasons: [], score: 0 }, (x) => {
      x.validityChecks = [{ name: 'c', ok: true, detail: 'fine' }];
    });
    expect(assertCalcResult(r).ok).toBe(true);
  });
  it('one failed check among several ok ones still counts', () => {
    const r = withConf({ level: 'medium', reasons: ['r'], score: 1 }, (x) => {
      x.validityChecks = [
        { name: 'a', ok: true, detail: '' },
        { name: 'b', ok: false, detail: 'bad' },
        { name: 'c', ok: true, detail: '' },
      ];
    });
    expect(joined(errorsOf(r))).toContain('validity check');
  });
});

describe('assertCalcResult A2: level must match the score', () => {
  it.each([
    [0, 'high', []],
    [1, 'medium', ['r']],
    [2, 'medium', ['r']],
    [3, 'low', ['r']],
    [7, 'low', ['r']],
  ] as const)('score %s with level %s is accepted', (score, level, reasons) => {
    expect(assertCalcResult(withConf({ level, reasons: [...reasons], score })).ok).toBe(true);
  });
  it.each([
    [0, 'medium'],
    [0, 'low'],
    [1, 'high'],
    [1, 'low'],
    [2, 'high'],
    [2, 'low'],
    [3, 'high'],
    [3, 'medium'],
    [7, 'high'],
  ] as const)('score %s with level %s (no failed check) is an error naming "level" and "score"', (score, level) => {
    const e = joined(errorsOf(withConf({ level, reasons: ['r'], score })));
    expect(e).toContain('level');
    expect(e).toContain('score');
  });
  it('score 0 with level low is accepted when a validity check failed', () => {
    expect(assertCalcResult(withConf({ level: 'low', reasons: ['r'], score: 0 }, failedCheck)).ok).toBe(true);
  });
  it('a failed check does not excuse level high on a high score (both errors reported)', () => {
    const e = joined(errorsOf(withConf({ level: 'high', reasons: [], score: 7 }, failedCheck)));
    expect(e).toContain('validity check');
  });
  it('property: the level rateConfidence-style thresholds give is always accepted; any other level is rejected', () => {
    const levelFor = (s: number): Conf['level'] => (s === 0 ? 'high' : s <= 2 ? 'medium' : 'low');
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), fc.constantFrom<Conf['level']>('high', 'medium', 'low'), (score, level) => {
        const out = assertCalcResult(withConf({ level, reasons: level === 'high' ? [] : ['r'], score }));
        expect(out.ok).toBe(level === levelFor(score));
      }),
    );
  });
});

describe('assertCalcResult A3: reasons are non-empty unless the level is high', () => {
  it.each([
    ['medium', 1],
    ['low', 3],
  ] as const)('level %s with empty reasons is an error containing "reasons"', (level, score) => {
    expect(joined(errorsOf(withConf({ level, reasons: [], score })))).toContain('reasons');
  });
  it('level high with empty reasons is accepted', () => {
    expect(assertCalcResult(withConf({ level: 'high', reasons: [], score: 0 })).ok).toBe(true);
  });
  it('level low forced by a failed check still needs reasons', () => {
    expect(joined(errorsOf(withConf({ level: 'low', reasons: [], score: 2 }, failedCheck)))).toContain('reasons');
  });
});

describe('assertCalcResult A4: at least one primary result', () => {
  it('no results at all', () => {
    const r = good();
    r.results = [];
    expect(joined(errorsOf(r))).toContain('primary');
  });
  it('only secondary results', () => {
    const r = good();
    r.results = [{ name: 'y', value: q(2, DIM.LENGTH), role: 'secondary', bound: 'nominal' }];
    expect(joined(errorsOf(r))).toContain('primary');
  });
  it('one primary among secondaries is accepted; two primaries are accepted', () => {
    const r = good();
    r.results = [
      { name: 's', value: q(2, DIM.LENGTH), role: 'secondary', bound: 'nominal' },
      { name: 'p1', value: q(2, DIM.LENGTH), role: 'primary', bound: 'nominal' },
      { name: 'p2', value: q(3, DIM.CURRENT), role: 'primary', bound: 'max-capacity' },
    ];
    expect(assertCalcResult(r).ok).toBe(true);
  });
});

describe('assertCalcResult A5: no negative minimum requirement', () => {
  const withMin = (si: number, dim: Quantity['dim']): CalcResult => {
    const r = good();
    r.results = [
      { name: 'trace width', value: q(si, dim), role: 'primary', bound: 'min-requirement' },
      { name: 'ampacity', value: q(3, DIM.CURRENT), role: 'secondary', bound: 'max-capacity' },
    ];
    return r;
  };
  it.each([-1e-6, -0.001, -5])('min-requirement length %s is an error containing "negative minimum" naming the result', (v) => {
    const e = joined(errorsOf(withMin(v, DIM.LENGTH)));
    expect(e).toContain('negative minimum');
    expect(e).toContain('trace width');
  });
  it('min-requirement current and area are covered too', () => {
    expect(joined(errorsOf(withMin(-1, DIM.CURRENT)))).toContain('negative minimum');
    expect(joined(errorsOf(withMin(-1, DIM.AREA)))).toContain('negative minimum');
  });
  it('a positive minimum, and a zero minimum, are not "negative"', () => {
    expect(assertCalcResult(withMin(0.2e-3, DIM.LENGTH)).ok).toBe(true);
    expect(assertCalcResult(withMin(0, DIM.LENGTH)).ok).toBe(true);
  });
  it('a negative min-requirement temperature difference is allowed (temperature dimensions are exempt)', () => {
    const r = good();
    r.results = [{ name: 'margin', value: q(-5, DIM.TEMPERATURE_DIFFERENCE), role: 'primary', bound: 'min-requirement' }];
    const out = assertCalcResult(r);
    expect(out.ok ? '' : joined(out.error)).not.toContain('negative minimum');
  });
  it.each(['max-capacity', 'nominal', 'prediction'] as const)('a negative %s value is not flagged by this rule', (bound) => {
    const r = good();
    r.results = [{ name: 'v', value: q(-2, DIM.LENGTH), role: 'primary', bound }];
    const out = assertCalcResult(r);
    expect(out.ok ? '' : joined(out.error)).not.toContain('negative minimum');
  });
});

describe('assertCalcResult A6: fab profile age, status and staleness', () => {
  const fp = (r: CalcResult): NonNullable<CalcResult['fabProfile']> => {
    if (!r.fabProfile) throw new Error('fixture');
    return r.fabProfile;
  };
  it('FAB_PROFILE_MAX_AGE_DAYS is 365', () => {
    expect(FAB_PROFILE_MAX_AGE_DAYS).toBe(365);
  });
  it.each([
    [0, false],
    [364, false],
    [365, false],
    [366, true],
    [900, true],
  ])('ageDays %s with stale %s is consistent', (ageDays, stale) => {
    const r = good();
    r.fabProfile = { ...fp(r), ageDays, stale };
    r.confidence = { level: 'medium', reasons: ['r'], score: 1 };
    expect(assertCalcResult(r).ok).toBe(true);
  });
  it.each([
    [365, true],
    [10, true],
    [366, false],
    [900, false],
  ])('ageDays %s with stale %s is an error containing "stale"', (ageDays, stale) => {
    const r = good();
    r.fabProfile = { ...fp(r), ageDays, stale };
    expect(joined(errorsOf(r))).toContain('stale');
  });
  it('a stale profile forbids confidence high (error contains "stale")', () => {
    const r = good();
    r.fabProfile = { ...fp(r), ageDays: 400, stale: true };
    r.confidence = { level: 'high', reasons: [], score: 0 };
    expect(joined(errorsOf(r))).toContain('stale');
  });
  it('a stale profile with medium or low confidence is accepted', () => {
    const r = good();
    r.fabProfile = { ...fp(r), ageDays: 400, stale: true };
    expect(assertCalcResult(r).ok).toBe(true);
    r.confidence = { level: 'low', reasons: ['r'], score: 3 };
    expect(assertCalcResult(r).ok).toBe(true);
  });
  it('a non-stale VERIFIED profile may coexist with level high', () => {
    const r = good();
    r.confidence = { level: 'high', reasons: [], score: 0 };
    expect(assertCalcResult(r).ok).toBe(true);
  });
  it.each(['UNVERIFIED', 'PAYWALLED', 'CONFLICT'] as const)(
    'fab profile status %s with result.dataStatus VERIFIED is an error containing "fab profile"',
    (status) => {
      const r = good();
      r.fabProfile = { ...fp(r), status };
      r.dataStatus = 'VERIFIED';
      expect(joined(errorsOf(r))).toContain('fab profile');
    },
  );
  it.each(['UNVERIFIED', 'PAYWALLED', 'CONFLICT'] as const)(
    'fab profile status %s with result.dataStatus %s is accepted (confidence consistent)',
    (status) => {
      const r = good();
      r.fabProfile = { ...fp(r), status };
      r.dataStatus = status;
      r.confidence = { level: 'medium', reasons: ['r'], score: 1 };
      expect(assertCalcResult(r).ok).toBe(true);
    },
  );
});

describe('assertCalcResult: a legitimate fully populated trace-width-like result passes', () => {
  function traceWidthLike(): CalcResult {
    const r = good();
    r.results = [
      { name: 'minimum trace width', value: q(0.31e-3, DIM.LENGTH), role: 'primary', bound: 'min-requirement' },
      { name: 'current capacity at this width', value: q(3.2, DIM.CURRENT), role: 'secondary', bound: 'max-capacity' },
    ];
    r.designValues = [
      {
        name: 'recommended trace width',
        direction: 'min-requirement',
        calculated: q(0.31e-3, DIM.LENGTH),
        recommended: q(0.31e-3 * 1.25, DIM.LENGTH),
        derating: { factor: 1.25, rationale: 'test margin' },
      },
      {
        name: 'recommended continuous current',
        direction: 'max-limit',
        calculated: q(3.2, DIM.CURRENT),
        recommended: q(3.2 * 0.8, DIM.CURRENT),
        derating: { factor: 0.8, rationale: 'test margin' },
      },
    ];
    r.fabProfile = { id: 'p', fabricator: 'F', profileDate: '2026-09-26', status: 'VERIFIED', ageDays: 10, stale: false };
    r.dataStatus = 'VERIFIED';
    r.confidence = { level: 'medium', reasons: ['Safety-relevant assumption in effect: maxTemp.'], score: 2 };
    return r;
  }
  it('is ok', () => {
    const out = assertCalcResult(traceWidthLike());
    expect(out.ok, out.ok ? '' : out.error.join('; ')).toBe(true);
  });
  it('has the blocks the fixture claims (guards against the fixture rotting)', () => {
    const r = traceWidthLike();
    expect(r.results.map((x) => x.bound)).toEqual(['min-requirement', 'max-capacity']);
    expect(r.designValues.map((d) => d.direction)).toEqual(['min-requirement', 'max-limit']);
    expect(r.envelope).toBeDefined();
    expect(r.elements?.length).toBeGreaterThan(0);
    expect(r.copperBasis).toBeDefined();
    expect(r.fabProfile?.ageDays).toBe(10);
  });
});
