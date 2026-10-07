import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as units from './units';
import { DIM, q } from './units';
import type { Quantity } from './units';
import * as res from './result';
import { assertCalcResult, assertNoNonFinite, checkCopperBasis, checkElements, rankElements } from './result';
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
    fabProfile: { id: 'p', fabricator: 'F', profileDate: '2026-10-06', status: 'UNVERIFIED', ageDays: 3, stale: false },
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
