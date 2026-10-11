import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, q } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcError } from '../../result';
import { compute } from './calc';
import type { Inputs } from './calc';

// Phase 1 task 3 guards: errors are values (no `value` key), compute never throws, and an invalid input never yields a
// numeric result. layer is required and never defaulted. A delta T is never accepted where an absolute temperature is
// expected, and vice versa.

const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const um = (n: number): Quantity => fromUnit(n, 'um');
const mm = (n: number): Quantity => fromUnit(n, 'mm');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const dT = (n: number): Quantity => fromUnit(n, 'ddegC');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const hz = (n: number): Quantity => fromUnit(n, 'Hz');
const raw = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;

// A valid run; each test overrides one field.
const base = { layer: 'outer', length: mm(100), width: mm(0.254), copperWeight: oz(1) } as const;

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
  it('computes and passes the schema check', () => {
    const out = compute(base);
    expect(out.ok).toBe(true);
    if (out.ok) expect(assertCalcResult(out.value).ok).toBe(true);
  });
  it('every optional input at once is valid', () => {
    const out = compute({
      layer: 'inner',
      length: mm(100),
      width: mm(0.254),
      copperThickness: um(35),
      copperBasis: 'measured',
      ambient: degC(25),
      deltaT: dT(20),
      resistivity: q(1.9e-8, DIM.RESISTIVITY),
      alpha: q(0.0036, DIM.PER_KELVIN),
      frequency: hz(1e6),
      current: amp(2),
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(assertCalcResult(out.value).ok).toBe(true);
  });
});

describe('layer is required and never defaulted', () => {
  it.each([[undefined], [null], ['middle'], [''], ['OUTER'], [1]])('layer %j is INVALID_INPUT naming layer', (l) => {
    const e = fail({ ...base, layer: l });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.field).toBe('layer');
  });
  it('a missing layer is an error even when everything else is valid', () => {
    const { layer: _drop, ...rest } = base;
    void _drop;
    expect(fail(rest).field).toBe('layer');
  });
});

describe('copper: weight XOR thickness, basis and convention', () => {
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
  it.each(['nominal-35um', 'nominal-1.35mil', 'mass-density'])('convention %s is accepted', (c) => {
    expect(compute({ ...base, convention: c } as Inputs).ok).toBe(true);
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
  const { copperWeight: _w, ...noCopper } = base;
  void _w;
  const thin = { ...noCopper, copperThickness: um(35) };
  it.each(bad)('length %s is INVALID_INPUT naming length', (_n, v) => {
    const e = fail({ ...base, length: raw(v, DIM.LENGTH) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'length']);
    expect(e.message).toMatch(/length/);
  });
  it.each(bad)('width %s is INVALID_INPUT naming width', (_n, v) => {
    const e = fail({ ...base, width: raw(v, DIM.LENGTH) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'width']);
  });
  it.each(bad)('copperThickness %s is INVALID_INPUT naming copperThickness', (_n, v) => {
    const e = fail({ ...thin, copperThickness: raw(v, DIM.LENGTH) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'copperThickness']);
  });
  it.each(bad)('copperWeight %s is INVALID_INPUT naming copperWeight', (_n, v) => {
    const e = fail({ ...base, copperWeight: raw(v, DIM.AREAL_MASS) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'copperWeight']);
  });
  it.each(bad)('resistivity %s is INVALID_INPUT naming resistivity', (_n, v) => {
    const e = fail({ ...base, resistivity: raw(v, DIM.RESISTIVITY) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'resistivity']);
  });
  it.each(bad)('alpha %s is INVALID_INPUT naming alpha (the coefficient of copper is positive)', (_n, v) => {
    const e = fail({ ...base, alpha: raw(v, DIM.PER_KELVIN) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'alpha']);
  });
  it.each(bad)('frequency %s is INVALID_INPUT naming frequency', (_n, v) => {
    const e = fail({ ...base, frequency: raw(v, DIM.FREQUENCY) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'frequency']);
  });
  it.each(bad)('current %s is INVALID_INPUT naming current', (_n, v) => {
    const e = fail({ ...base, current: raw(v, DIM.CURRENT) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'current']);
  });
  it.each([
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['-Infinity', -Infinity],
  ])('deltaT %s is INVALID_INPUT naming deltaT', (_n, v) => {
    const e = fail({ ...base, deltaT: raw(v, DIM.TEMPERATURE_DIFFERENCE) });
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'deltaT']);
  });
  it.each([
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['below 0 K', -1],
  ])('ambient %s is rejected naming ambient', (_n, v) => {
    const e = fail({ ...base, ambient: raw(v, DIM.ABS_TEMPERATURE) });
    expect(e.field).toBe('ambient');
    expect(['INVALID_INPUT', 'OUT_OF_DOMAIN']).toContain(e.code);
  });
});

describe('dimension guards', () => {
  it('wrong dimensions are DIMENSION errors naming the field', () => {
    const { copperWeight: _w, ...noCopper } = base;
    void _w;
    const cases: [string, Record<string, unknown>][] = [
      ['length', { length: amp(1) }],
      ['width', { width: amp(1) }],
      ['copperWeight', { copperWeight: um(35) }],
      ['resistivity', { resistivity: fromUnit(1, 'ohm') }],
      ['alpha', { alpha: raw(0.0039, DIM.DIMENSIONLESS) }],
      ['frequency', { frequency: mm(1) }],
      ['current', { current: mm(1) }],
    ];
    for (const [field, patch] of cases) {
      const e = fail({ ...base, ...patch });
      expect([e.code, e.field]).toEqual(['DIMENSION', field]);
    }
    const t = fail({ ...noCopper, copperThickness: oz(1) });
    expect([t.code, t.field]).toEqual(['DIMENSION', 'copperThickness']);
  });
  it('an absolute temperature passed as deltaT, and a temperature difference passed as ambient, are DIMENSION errors', () => {
    const a = fail({ ...base, deltaT: degC(10) });
    expect([a.code, a.field]).toEqual(['DIMENSION', 'deltaT']);
    const b = fail({ ...base, ambient: dT(25) });
    expect([b.code, b.field]).toEqual(['DIMENSION', 'ambient']);
  });
  it('a resistivity given in ohms (not ohm metres) and an alpha given in kelvin are both caught', () => {
    expect(fail({ ...base, resistivity: raw(1.9e-8, DIM.RESISTANCE) }).code).toBe('DIMENSION');
    expect(fail({ ...base, alpha: raw(0.0039, DIM.TEMPERATURE_DIFFERENCE) }).code).toBe('DIMENSION');
  });
});

describe('plausibility: conductor temperature below absolute zero is impossible', () => {
  it('ambient 25 C + deltaT -400 K would be below 0 K: OUT_OF_DOMAIN, no result', () => {
    const e = fail({ ...base, ambient: degC(25), deltaT: dT(-400) });
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.field).toMatch(/deltaT|conductor temperature|ambient/);
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
      { layer: 'outer' },
      { ...base, length: 0.1 },
      { ...base, length: { si: 'a', dim: DIM.LENGTH } },
      { ...base, width: { si: 1 } },
      { ...base, resistivity: { si: 1.7e-8, dim: null } },
      { ...base, alpha: 'big' },
      { ...base, frequency: {} },
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
});
