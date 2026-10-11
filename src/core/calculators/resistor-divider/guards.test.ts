import { describe, expect, it } from 'vitest';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcError } from '../../result';
import { compute } from './calc';
import type { Inputs } from './calc';

// Phase 1 task 8, calculator 2 (resistor divider) guards: errors are values (no `value` key), compute never throws, and an
// invalid input never yields a numeric result.
//
// CONTRACT:
//  - solveFor is REQUIRED and exactly 'vout' | 'r1' | 'r2' (INVALID_INPUT, field 'solveFor').
//  - Required quantities by mode: vout -> vin, r1, r2; r1 -> vin, target, r2; r2 -> vin, target, r1. A missing required
//    quantity is INVALID_INPUT naming it. A quantity that is the unknown (r1 with solveFor r1, r2 with solveFor r2) or that the
//    mode does not use (target with solveFor vout) is INVALID_INPUT naming that field.
//  - Quantity guards: shape/dimension (DIMENSION), NaN, +-Infinity, zero, negative, negative zero (INVALID_INPUT naming the field);
//    these run per field before the cross-field rules.
//  - tolerance and vinTolerance: DIMENSIONLESS fractions in [0, 0.5): 0 is allowed; negative, 0.5 or more, NaN, Infinity are
//    INVALID_INPUT naming the field; a wrong dimension is DIMENSION.
//  - series is 'E24' | 'E96' | 'E192' | 'none'; snap is 'nearest' | 'up' | 'down' (anything else, including E12, is INVALID_INPUT
//    naming the field). A series other than 'none' with solveFor 'vout' is INVALID_INPUT naming 'series' (nothing is solved, so
//    nothing can be snapped). snap is validated even when series is 'none' or absent.
//  - target at or above vin is OUT_OF_DOMAIN naming 'target' with a message that names target and vin. target zero or negative is
//    rejected naming 'target' (INVALID_INPUT from the generic guard; OUT_OF_DOMAIN is also accepted).
//  - With a load, solving for r2 needs RL greater than the required Re = R1 Vt/(Vin - Vt); otherwise OUT_OF_DOMAIN naming 'load'.
//  - A solved resistor that cannot be snapped because it is outside 1e-12 .. 1e12 ohm is OUT_OF_DOMAIN naming the resistor
//    ('r1' or 'r2') when a series is used; with series none the exact value is returned (the plausibility check then fails).

const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const R = (n: number): Quantity => q(n, DIM.RESISTANCE);
const frac = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const raw = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;

const base = { solveFor: 'vout', vin: V(12), r1: R(47e3), r2: R(10e3) } as const;
const base1 = { solveFor: 'r1', vin: V(12), target: V(3.3), r2: R(10e3) } as const;
const base2 = { solveFor: 'r2', vin: V(12), target: V(3.3), r1: R(47e3) } as const;

function fail(inputs: unknown): CalcError {
  let out: ReturnType<typeof compute> | undefined;
  expect(() => {
    out = compute(inputs as Inputs);
  }).not.toThrow();
  if (!out || out.ok) throw new Error('expected an error outcome, got a result');
  expect('value' in out).toBe(false);
  return out.error;
}
const without = (o: object, k: string): Record<string, unknown> => {
  const c = { ...o } as Record<string, unknown>;
  delete c[k];
  return c;
};

describe('sanity: the base inputs are valid', () => {
  it.each([
    ['vout', base],
    ['r1', base1],
    ['r2', base2],
  ])('solveFor %s computes and passes the schema check', (_n, inp) => {
    const out = compute(inp as Inputs);
    expect(out.ok).toBe(true);
    if (out.ok) expect(assertCalcResult(out.value).ok).toBe(true);
  });
  it('every optional input at once is valid (solve r1 with a load, a series, a direction and both tolerances)', () => {
    const out = compute({ ...base1, load: R(100e3), series: 'E96', snap: 'up', tolerance: frac(0.01), vinTolerance: frac(0.02) });
    expect(out.ok).toBe(true);
    if (out.ok) expect(assertCalcResult(out.value).ok).toBe(true);
  });
});

describe('solveFor is required and exact', () => {
  it.each([[undefined], [null], [''], ['VOUT'], ['r3'], ['vin'], [1], ['load']])('solveFor %j is INVALID_INPUT naming solveFor', (v) => {
    const e = fail({ ...base, solveFor: v });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'solveFor']);
  });
  it('a missing solveFor is an error even when everything else is valid', () => {
    expect(fail(without(base, 'solveFor')).field).toBe('solveFor');
  });
});

describe('required, unknown and unused quantities by mode', () => {
  it.each([
    ['vout', base, 'vin'],
    ['vout', base, 'r1'],
    ['vout', base, 'r2'],
    ['r1', base1, 'vin'],
    ['r1', base1, 'target'],
    ['r1', base1, 'r2'],
    ['r2', base2, 'vin'],
    ['r2', base2, 'target'],
    ['r2', base2, 'r1'],
  ])('solveFor %s without %s is INVALID_INPUT naming it', (_m, inp, field) => {
    const e = fail(without(inp, field));
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', field]);
    expect(e.message).toContain(field);
  });
  it('the unknown must not be given: r1 with solveFor r1, r2 with solveFor r2', () => {
    expect(fail({ ...base1, r1: R(1e3) }).field).toBe('r1');
    expect(fail({ ...base2, r2: R(1e3) }).field).toBe('r2');
    expect(fail({ ...base1, r1: R(1e3) }).code).toBe('INVALID_INPUT');
  });
  it('target is not used when solving for vout', () => {
    const e = fail({ ...base, target: V(3.3) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'target']);
  });
  it('a given load, series, snap, tolerance and vinTolerance are always allowed except series with solveFor vout (below)', () => {
    expect(compute({ ...base, load: R(1e5), snap: 'up', tolerance: frac(0.01), vinTolerance: frac(0.01) }).ok).toBe(true);
  });
});

describe('numeric guards: NaN, +-Infinity, zero, negative, negative zero', () => {
  const bad: [string, number][] = [
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['zero', 0],
    ['negative zero', -0],
    ['negative', -1],
  ];
  it.each(bad)('vin %s is INVALID_INPUT naming vin (every mode)', (_n, v) => {
    for (const inp of [base, base1, base2]) {
      const e = fail({ ...inp, vin: raw(v, DIM.VOLTAGE) });
      expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'vin']);
      expect(e.message).toContain('vin');
    }
  });
  it.each(bad)('r1 %s is INVALID_INPUT naming r1 (solveFor vout and r2)', (_n, v) => {
    for (const inp of [base, base2]) {
      const e = fail({ ...inp, r1: raw(v, DIM.RESISTANCE) });
      expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'r1']);
    }
  });
  it.each(bad)('r2 %s is INVALID_INPUT naming r2 (solveFor vout and r1)', (_n, v) => {
    for (const inp of [base, base1]) {
      const e = fail({ ...inp, r2: raw(v, DIM.RESISTANCE) });
      expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'r2']);
    }
  });
  it.each(bad)('load %s is INVALID_INPUT naming load', (_n, v) => {
    const e = fail({ ...base, load: raw(v, DIM.RESISTANCE) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'load']);
  });
  it.each(bad.filter(([n]) => n === 'NaN' || n.includes('Infinity')))('target %s is INVALID_INPUT naming target', (_n, v) => {
    const e = fail({ ...base1, target: raw(v, DIM.VOLTAGE) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'target']);
  });
  it.each(bad.filter(([n]) => !(n === 'NaN' || n.includes('Infinity'))))('target %s is rejected naming target', (_n, v) => {
    const e = fail({ ...base1, target: raw(v, DIM.VOLTAGE) });
    expect(e.field).toBe('target');
    expect(['INVALID_INPUT', 'OUT_OF_DOMAIN']).toContain(e.code);
  });
  it('a bad value wins over a cross-field error (per-field guards first)', () => {
    expect(fail({ ...base, vin: raw(NaN, DIM.VOLTAGE), target: V(1) }).field).toBe('vin');
  });
});

describe('dimension guards', () => {
  it('wrong dimensions are DIMENSION errors naming the field', () => {
    const cases: [string, unknown, Record<string, unknown>][] = [
      ['vin', base, { vin: R(1) }],
      ['r1', base, { r1: V(1) }],
      ['r2', base, { r2: V(1) }],
      ['load', base, { load: V(1) }],
      ['target', base1, { target: R(1) }],
      ['tolerance', base, { tolerance: R(1) }],
      ['vinTolerance', base, { vinTolerance: V(1) }],
      ['vin', base, { vin: q(5, DIM.DIMENSIONLESS) }],
      ['r1', base, { r1: q(1, DIM.RESISTIVITY) }],
    ];
    for (const [field, inp, patch] of cases) {
      const e = fail({ ...(inp as object), ...patch });
      expect([e.code, e.field]).toEqual(['DIMENSION', field]);
    }
  });
});

describe('tolerance and vinTolerance: fractions in [0, 0.5)', () => {
  for (const f of ['tolerance', 'vinTolerance'] as const) {
    it.each([
      ['negative', -0.01],
      ['half', 0.5],
      ['above half', 0.75],
      ['one', 1],
      ['NaN', NaN],
      ['+Infinity', Infinity],
      ['-Infinity', -Infinity],
    ])(`${f} %s is INVALID_INPUT naming ${f}`, (_n, v) => {
      const e = fail({ ...base, [f]: raw(v, DIM.DIMENSIONLESS) });
      expect([e.code, e.field]).toEqual(['INVALID_INPUT', f]);
    });
    it.each([[0], [1e-6], [0.01], [0.25], [0.4999999]])(`${f} %s is accepted`, (v) => {
      expect(compute({ ...base, [f]: frac(v) } as Inputs).ok).toBe(true);
    });
  }
  it('a percent value entered as a plain number (1 for 1 %) is out of range, not silently scaled', () => {
    const e = fail({ ...base, tolerance: frac(1) });
    expect(e.field).toBe('tolerance');
  });
});

describe('series and snap', () => {
  it.each([['E12'], ['E48'], ['e24'], ['E 96'], [''], [5], [null], ['None'], ['E384']])('series %j is INVALID_INPUT naming series', (s) => {
    const e = fail({ ...base1, series: s });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'series']);
  });
  it.each([['E24'], ['E96'], ['E192'], ['none']])('series %s is accepted when solving', (s) => {
    expect(compute({ ...base1, series: s } as Inputs).ok).toBe(true);
    expect(compute({ ...base2, series: s } as Inputs).ok).toBe(true);
  });
  it.each([['round'], ['NEAREST'], [''], [5], [null], ['ceil']])('snap %j is INVALID_INPUT naming snap', (m) => {
    const e = fail({ ...base1, series: 'E96', snap: m });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'snap']);
  });
  it('snap is validated even without a series', () => {
    expect(fail({ ...base1, snap: 'sideways' }).field).toBe('snap');
    expect(fail({ ...base, snap: 'sideways' }).field).toBe('snap');
  });
  it.each([['up'], ['down'], ['nearest']])('snap %s is accepted', (m) => {
    expect(compute({ ...base1, series: 'E24', snap: m } as Inputs).ok).toBe(true);
  });
  it('a series other than none with solveFor vout is INVALID_INPUT naming series; none is fine', () => {
    for (const s of ['E24', 'E96', 'E192']) {
      const e = fail({ ...base, series: s });
      expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'series']);
    }
    expect(compute({ ...base, series: 'none' } as Inputs).ok).toBe(true);
  });
});

describe('domain: the target, the load and snapping range', () => {
  it('target at or above vin is OUT_OF_DOMAIN naming target; the message names target and vin', () => {
    for (const t of [12, 12.0001, 13, 1200]) {
      for (const inp of [base1, base2]) {
        const e = fail({ ...inp, target: V(t) });
        expect([e.code, e.field]).toEqual(['OUT_OF_DOMAIN', 'target']);
        expect(e.message).toMatch(/target/i);
        expect(e.message).toMatch(/vin/i);
      }
    }
  });
  it('target just below vin is fine (the solved resistor is huge or tiny but finite)', () => {
    expect(compute({ ...base1, target: V(11.99) }).ok).toBe(true);
    expect(compute({ ...base2, target: V(11.99) }).ok).toBe(true);
  });
  it('solving r2 with a load that is not heavier than the required Re is OUT_OF_DOMAIN naming load', () => {
    // 5 V -> 2.5 V with r1 = 10 k needs Re = 10 k: any load at or below 10 k cannot work
    for (const rl of [10e3, 9e3, 100]) {
      const e = fail({ solveFor: 'r2', vin: V(5), target: V(2.5), r1: R(10e3), load: R(rl) });
      expect([e.code, e.field]).toEqual(['OUT_OF_DOMAIN', 'load']);
      expect(e.message).toMatch(/load/i);
    }
    expect(compute({ solveFor: 'r2', vin: V(5), target: V(2.5), r1: R(10e3), load: R(10.001e3) }).ok).toBe(true);
  });
  it('solving r1 with any load is fine (a load only lowers Re)', () => {
    expect(compute({ ...base1, load: R(10) }).ok).toBe(true);
  });
  it('a solved resistor outside 1e-12..1e12 ohm with a series is OUT_OF_DOMAIN naming the resistor; without a series the exact value comes back', () => {
    // r1 = r2 (vin - t)/t = 1e9 x (1000 - 1e-9)/1e-9 = 1e21 ohm
    const huge = { solveFor: 'r1', vin: V(1000), target: V(1e-9), r2: R(1e9) } as const;
    const e = fail({ ...huge, series: 'E96' });
    expect([e.code, e.field]).toEqual(['OUT_OF_DOMAIN', 'r1']);
    const exact = compute(huge as Inputs);
    expect(exact.ok).toBe(true);
    if (exact.ok) {
      expect(exact.value.validityChecks.some((c: { ok: boolean }) => !c.ok)).toBe(true);
      expect(exact.value.confidence.level).toBe('low');
    }
    const tiny = { solveFor: 'r2', vin: V(1000), target: V(1e-9), r1: R(1e-3) } as const; // r2 = r1 t/(vin - t) = 1e-15 ohm
    expect(fail({ ...tiny, series: 'E24' }).field).toBe('r2');
    expect(compute(tiny as Inputs).ok).toBe(true);
  });
});

describe('robustness', () => {
  it('never throws for malformed input objects and never returns a numeric result for them', () => {
    const junk: unknown[] = [
      {},
      null,
      undefined,
      5,
      'x',
      [],
      { solveFor: 'vout' },
      { ...base, vin: 12 },
      { ...base, r1: { si: 'a', dim: DIM.RESISTANCE } },
      { ...base, r2: { si: 1 } },
      { ...base, load: { si: 1e3, dim: null } },
      { ...base, tolerance: 'big' },
      { ...base, vinTolerance: {} },
      { ...base1, target: null },
    ];
    for (const bad of junk) {
      let out: ReturnType<typeof compute> | undefined;
      expect(() => {
        out = compute(bad as Inputs);
      }).not.toThrow();
      expect(out?.ok).toBe(false);
      expect(out && 'value' in out).toBe(false);
    }
  });
  it('a non-object is INVALID_INPUT naming inputs', () => {
    for (const bad of [null, undefined, 5, 'x']) {
      const e = fail(bad);
      expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'inputs']);
    }
  });
});
