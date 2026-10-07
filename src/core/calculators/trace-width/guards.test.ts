import { describe, expect, it } from 'vitest';
import { DIM, fromUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcError } from '../../result';
import { compute } from './calc';
import type { Inputs } from './calc';

// Phase 1 task 2 guards: errors are values, compute never throws, and an invalid input never yields a numeric result.
// The estimate mode (Mode A) is deliberately disabled until the human decides (R-8); it is never silently substituted.

const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const um = (n: number): Quantity => fromUnit(n, 'um');
const mil = (n: number): Quantity => fromUnit(n, 'mil');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const dT = (n: number): Quantity => fromUnit(n, 'ddegC');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const raw = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;

// A valid width solve; each test overrides one field.
const base = { mode: 'B', layer: 'outer', current: amp(3), deltaT: dT(10), copperWeight: oz(1) } as const;

function fail(inputs: unknown): CalcError {
  let out: ReturnType<typeof compute> | undefined;
  expect(() => {
    out = compute(inputs as Inputs);
  }).not.toThrow();
  if (!out || out.ok) throw new Error('expected an error outcome, got a result');
  expect('value' in out).toBe(false);
  return out.error;
}

describe('sanity: the base input is valid', () => {
  it('computes', () => {
    const out = compute(base);
    expect(out.ok).toBe(true);
    if (out.ok) expect(assertCalcResult(out.value).ok).toBe(true);
  });
});

describe('mode: only legacy Mode B is available', () => {
  it("mode 'A' is OUT_OF_DOMAIN naming mode, saying the estimate mode is not available and citing R-8", () => {
    const e = fail({ ...base, mode: 'A' });
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.field).toBe('mode');
    expect(e.message).toMatch(/not available/);
    expect(e.message).toMatch(/R-8/);
  });
  it.each([[undefined], [null], ['b'], ['C'], [''], [1], ['IPC-2152']])('mode %j is OUT_OF_DOMAIN naming mode (never defaulted, never substituted)', (m) => {
    const e = fail({ ...base, mode: m });
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.field).toBe('mode');
  });
});

describe('exactly two of width, current, deltaT', () => {
  const w = mil(20);
  const cases: [string, Record<string, unknown>][] = [
    ['none', {}],
    ['only width', { width: w }],
    ['only current', { current: amp(3) }],
    ['only deltaT', { deltaT: dT(10) }],
    ['all three', { width: w, current: amp(3), deltaT: dT(10) }],
  ];
  it.each(cases)('%s is INVALID_INPUT naming width, current and deltaT', (_n, given) => {
    const e = fail({ mode: 'B', layer: 'outer', copperWeight: oz(1), ...given });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toMatch(/width/);
    expect(e.message).toMatch(/current/);
    expect(e.message).toMatch(/deltaT/);
  });
  it.each([
    ['width + current', { width: w, current: amp(3) }],
    ['width + deltaT', { width: w, deltaT: dT(10) }],
    ['current + deltaT', { current: amp(3), deltaT: dT(10) }],
  ])('%s is accepted', (_n, given) => {
    expect(compute({ mode: 'B', layer: 'outer', copperWeight: oz(1), ...given } as Inputs).ok).toBe(true);
  });
});

describe('copper: weight XOR thickness', () => {
  it('both is INVALID_INPUT naming both fields', () => {
    const e = fail({ ...base, copperThickness: um(35) });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toMatch(/copperWeight/);
    expect(e.message).toMatch(/copperThickness/);
  });
  it('neither is INVALID_INPUT naming both fields', () => {
    const { copperWeight: _drop, ...noCopper } = base;
    void _drop;
    const e = fail(noCopper);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toMatch(/copperWeight/);
    expect(e.message).toMatch(/copperThickness/);
  });
  it('copperBasis is only allowed together with copperThickness', () => {
    const e = fail({ ...base, copperBasis: 'finished' });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.field).toBe('copperBasis');
  });
  it.each(['nominal', 'finished', 'measured'])('copperBasis %s with copperThickness is accepted', (b) => {
    const { copperWeight: _drop, ...rest } = base;
    void _drop;
    expect(compute({ ...rest, copperThickness: um(35), copperBasis: b } as Inputs).ok).toBe(true);
  });
  it('unknown copperBasis and unknown convention are INVALID_INPUT naming the field', () => {
    const { copperWeight: _drop, ...rest } = base;
    void _drop;
    const a = fail({ ...rest, copperThickness: um(35), copperBasis: 'typical' });
    expect([a.code, a.field]).toEqual(['INVALID_INPUT', 'copperBasis']);
    const b = fail({ ...base, convention: 'iso-35' });
    expect([b.code, b.field]).toEqual(['INVALID_INPUT', 'convention']);
  });
});

describe('layer is required and never defaulted', () => {
  it.each([[undefined], [null], ['middle'], [''], ['OUTER'], [1]])('layer %j is INVALID_INPUT naming layer', (l) => {
    const e = fail({ ...base, layer: l });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.field).toBe('layer');
  });
});

describe('numeric guards: NaN, +-Infinity, zero, negative', () => {
  const bad: [string, number][] = [
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['zero', 0],
    ['negative zero', -0],
    ['negative', -1],
  ];
  it.each(bad)('width %s is INVALID_INPUT naming width', (_n, v) => {
    const e = fail({ mode: 'B', layer: 'outer', deltaT: dT(10), copperWeight: oz(1), width: raw(v, DIM.LENGTH) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'width']);
    expect(e.message).toMatch(/width/);
  });
  it.each(bad)('current %s is INVALID_INPUT naming current', (_n, v) => {
    const e = fail({ ...base, current: raw(v, DIM.CURRENT) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'current']);
  });
  it.each(bad)('deltaT %s is INVALID_INPUT naming deltaT', (_n, v) => {
    const e = fail({ ...base, deltaT: raw(v, DIM.TEMPERATURE_DIFFERENCE) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'deltaT']);
  });
  it.each(bad)('copperWeight %s is INVALID_INPUT naming copperWeight', (_n, v) => {
    const e = fail({ ...base, copperWeight: raw(v, DIM.AREAL_MASS) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'copperWeight']);
  });
  it.each(bad)('copperThickness %s is INVALID_INPUT naming copperThickness', (_n, v) => {
    const { copperWeight: _drop, ...rest } = base;
    void _drop;
    const e = fail({ ...rest, copperThickness: raw(v, DIM.LENGTH) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'copperThickness']);
  });
  it.each([
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['zero', 0],
    ['below one', 0.99],
    ['negative', -1.25],
  ])('designMargin %s is INVALID_INPUT naming designMargin', (_n, v) => {
    const e = fail({ ...base, designMargin: raw(v, DIM.DIMENSIONLESS) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'designMargin']);
  });
  it.each([
    ['NaN', NaN],
    ['zero', 0],
    ['negative', -0.5],
    ['above one', 1.0001],
    ['+Infinity', Infinity],
  ])('currentDerating %s is INVALID_INPUT naming currentDerating', (_n, v) => {
    const e = fail({ ...base, currentDerating: raw(v, DIM.DIMENSIONLESS) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'currentDerating']);
  });
  it('designMargin = 1 and currentDerating = 1 are accepted (bounds inclusive)', () => {
    expect(compute({ ...base, designMargin: raw(1, DIM.DIMENSIONLESS), currentDerating: raw(1, DIM.DIMENSIONLESS) }).ok).toBe(true);
  });
  it('ambient and maxAllowedTemp below 0 K or NaN are rejected naming the field', () => {
    for (const field of ['ambient', 'maxAllowedTemp'] as const) {
      for (const v of [-1, NaN, -Infinity]) {
        const e = fail({ ...base, [field]: raw(v, DIM.ABS_TEMPERATURE) });
        expect(e.field).toBe(field);
      }
    }
  });
});

describe('dimension guards', () => {
  it('wrong dimensions are DIMENSION errors naming the field', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['current', { current: mil(20) }],
      ['deltaT', { deltaT: amp(10) }],
      ['copperWeight', { copperWeight: um(35) }],
      ['designMargin', { designMargin: mil(1) }],
      ['currentDerating', { currentDerating: amp(1) }],
    ];
    for (const [field, patch] of cases) {
      const e = fail({ ...base, ...patch });
      expect([e.code, e.field]).toEqual(['DIMENSION', field]);
    }
    const w = fail({ mode: 'B', layer: 'outer', deltaT: dT(10), copperWeight: oz(1), width: amp(3) });
    expect([w.code, w.field]).toEqual(['DIMENSION', 'width']);
    const t = fail({ mode: 'B', layer: 'outer', current: amp(3), deltaT: dT(10), copperThickness: oz(1) });
    expect([t.code, t.field]).toEqual(['DIMENSION', 'copperThickness']);
  });
  it('an absolute temperature passed as deltaT, and a temperature difference passed as ambient or maxAllowedTemp, are DIMENSION errors', () => {
    const a = fail({ ...base, deltaT: degC(10) });
    expect([a.code, a.field]).toEqual(['DIMENSION', 'deltaT']);
    const b = fail({ ...base, ambient: dT(25) });
    expect([b.code, b.field]).toEqual(['DIMENSION', 'ambient']);
    const c = fail({ ...base, maxAllowedTemp: dT(100) });
    expect([c.code, c.field]).toEqual(['DIMENSION', 'maxAllowedTemp']);
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
      { mode: 'B' },
      { ...base, current: 3 },
      { ...base, current: { si: 'a', dim: DIM.CURRENT } },
      { ...base, current: { si: 3 } },
      { ...base, deltaT: { si: 10, dim: null } },
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
  it('an overflowing or underflowing input returns an error or an all-finite valid result, never throws or NaN', () => {
    const extremes: Inputs[] = [
      { ...base, current: raw(Number.MAX_VALUE, DIM.CURRENT) },
      { ...base, current: raw(Number.MIN_VALUE, DIM.CURRENT) },
      { ...base, deltaT: raw(Number.MAX_VALUE, DIM.TEMPERATURE_DIFFERENCE) },
      { ...base, deltaT: raw(Number.MIN_VALUE, DIM.TEMPERATURE_DIFFERENCE) },
      { ...base, copperWeight: raw(Number.MIN_VALUE, DIM.AREAL_MASS) },
      { ...base, copperWeight: raw(Number.MAX_VALUE, DIM.AREAL_MASS) },
      { mode: 'B', layer: 'inner', current: amp(1), deltaT: dT(10), copperThickness: raw(Number.MIN_VALUE, DIM.LENGTH), copperBasis: 'measured' },
      { mode: 'B', layer: 'outer', width: raw(Number.MAX_VALUE, DIM.LENGTH), deltaT: dT(10), copperWeight: oz(1) },
      { mode: 'B', layer: 'outer', width: raw(Number.MIN_VALUE, DIM.LENGTH), current: amp(1), copperWeight: oz(1) },
    ];
    for (const inp of extremes) {
      let out: ReturnType<typeof compute> | undefined;
      expect(() => {
        out = compute(inp);
      }).not.toThrow();
      if (out?.ok) {
        expect(assertCalcResult(out.value).ok).toBe(true);
        for (const r of out.value.results) expect(Number.isFinite(r.value.si)).toBe(true);
      } else {
        expect(out && 'value' in out).toBe(false);
      }
    }
  });
});
