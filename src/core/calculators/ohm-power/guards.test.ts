import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, q } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcError } from '../../result';
import { compute } from './calc';
import type { Inputs } from './calc';

// Phase 1 task 8, calculator 1 (Ohm / power) guards: errors are values (no `value` key), compute never throws, and an
// invalid input never yields a numeric result. EXACTLY two of voltage, current, resistance, power may be given.
//
// CONTRACT: giving zero, one, three or four quantities is INVALID_INPUT with field 'inputs' and a message containing
// "give exactly two" and naming all four fields (voltage, current, resistance, power). Three or four quantities (an
// over-specification) add the word "over-specified"; when the extra value disagrees with the others by more than 1e-9
// relative, the message also says "inconsistent" (a consistent over-specification must NOT say "inconsistent").
// Per-field guards run BEFORE the count: a bad value names its own field. Dimension slips are DIMENSION errors naming the field.

const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const I = (n: number): Quantity => q(n, DIM.CURRENT);
const R = (n: number): Quantity => q(n, DIM.RESISTANCE);
const P = (n: number): Quantity => q(n, DIM.POWER);
const raw = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;

function fail(inputs: unknown): CalcError {
  let out: ReturnType<typeof compute> | undefined;
  expect(() => {
    out = compute(inputs as Inputs);
  }).not.toThrow();
  if (!out || out.ok) throw new Error('expected an error outcome, got a result');
  expect('value' in out).toBe(false);
  return out.error;
}

describe('sanity: valid inputs compute and pass the schema check', () => {
  it.each([
    [{ voltage: V(12), current: I(0.5) }],
    [{ voltage: V(12), resistance: R(24) }],
    [{ voltage: V(12), power: P(6) }],
    [{ current: I(0.5), resistance: R(24) }],
    [{ current: I(0.5), power: P(6) }],
    [{ resistance: R(24), power: P(6) }],
  ])('%j', (inp) => {
    const out = compute(inp as Inputs);
    expect(out.ok).toBe(true);
    if (out.ok) expect(assertCalcResult(out.value).ok).toBe(true);
  });
  it('units parsed at the UI boundary work too (fromUnit)', () => {
    const out = compute({ voltage: fromUnit(12, 'V'), resistance: fromUnit(4.7, 'kohm') });
    expect(out.ok).toBe(true);
  });
});

describe('exactly two quantities', () => {
  const ALL = ['voltage', 'current', 'resistance', 'power'];
  const names = (e: CalcError): void => {
    for (const n of ALL) expect(e.message).toContain(n);
  };
  it('none given: INVALID_INPUT, give exactly two, names all four fields', () => {
    const e = fail({});
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'inputs']);
    expect(e.message).toMatch(/give exactly two/i);
    names(e);
  });
  it.each([
    ['voltage', { voltage: V(12) }],
    ['current', { current: I(1) }],
    ['resistance', { resistance: R(1) }],
    ['power', { power: P(1) }],
  ])('only %s given: INVALID_INPUT, give exactly two, names all four fields', (_n, inp) => {
    const e = fail(inp);
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'inputs']);
    expect(e.message).toMatch(/give exactly two/i);
    names(e);
  });
  const consistent: [string, Record<string, Quantity>][] = [
    ['voltage, current, resistance', { voltage: V(12), current: I(0.5), resistance: R(24) }],
    ['voltage, current, power', { voltage: V(12), current: I(0.5), power: P(6) }],
    ['voltage, resistance, power', { voltage: V(12), resistance: R(24), power: P(6) }],
    ['current, resistance, power', { current: I(0.5), resistance: R(24), power: P(6) }],
    ['all four', { voltage: V(12), current: I(0.5), resistance: R(24), power: P(6) }],
  ];
  it.each(consistent)('%s, mutually consistent: still an error, over-specified, give exactly two, not "inconsistent"', (_n, inp) => {
    const e = fail(inp);
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'inputs']);
    expect(e.message).toMatch(/give exactly two/i);
    expect(e.message).toMatch(/over-specified/i);
    expect(e.message).not.toMatch(/inconsistent/i);
    names(e);
  });
  it('a third value consistent within 1e-9 relative is still a consistent over-specification', () => {
    const e = fail({ voltage: V(12), current: I(0.5), resistance: R(24 * (1 + 1e-10)) });
    expect(e.message).toMatch(/over-specified/i);
    expect(e.message).not.toMatch(/inconsistent/i);
  });
  const inconsistent: [string, Record<string, Quantity>][] = [
    ['voltage, current, resistance', { voltage: V(12), current: I(0.5), resistance: R(25) }],
    ['voltage, current, power', { voltage: V(12), current: I(0.5), power: P(7) }],
    ['voltage, resistance, power', { voltage: V(12), resistance: R(24), power: P(6.000006) }],
    ['current, resistance, power', { current: I(0.5), resistance: R(24), power: P(5) }],
    ['all four', { voltage: V(12), current: I(0.5), resistance: R(24), power: P(7) }],
  ];
  it.each(inconsistent)('%s, disagreeing by more than 1e-9: an error that says over-specified and inconsistent', (_n, inp) => {
    const e = fail(inp);
    expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'inputs']);
    expect(e.message).toMatch(/give exactly two/i);
    expect(e.message).toMatch(/over-specified/i);
    expect(e.message).toMatch(/inconsistent/i);
  });
  it('a third value off by 1e-6 relative is inconsistent', () => {
    expect(fail({ voltage: V(12), current: I(0.5), resistance: R(24 * (1 + 1e-6)) }).message).toMatch(/inconsistent/i);
  });
  it('undefined fields count as not given (an explicit undefined is the same as absent)', () => {
    const out = compute({ voltage: V(12), current: I(0.5), resistance: undefined, power: undefined } as unknown as Inputs);
    expect(out.ok).toBe(true);
  });
});

describe('numeric guards: NaN, +-Infinity, zero, negative, negative zero (per-field, before the count)', () => {
  const bad: [string, number][] = [
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['zero', 0],
    ['negative zero', -0],
    ['negative', -1],
  ];
  const FIELDS: [string, (n: number) => Quantity, Quantity['dim'], Record<string, Quantity>][] = [
    ['voltage', V, DIM.VOLTAGE, { current: I(0.5) }],
    ['current', I, DIM.CURRENT, { voltage: V(12) }],
    ['resistance', R, DIM.RESISTANCE, { voltage: V(12) }],
    ['power', P, DIM.POWER, { voltage: V(12) }],
  ];
  for (const [field, , dim, other] of FIELDS) {
    it.each(bad)(`${field} %s is INVALID_INPUT naming ${field}`, (_n, v) => {
      const e = fail({ ...other, [field]: raw(v, dim) });
      expect([e.code, e.field]).toEqual(['INVALID_INPUT', field]);
      expect(e.message).toContain(field);
    });
    it(`${field} bad plus three other valid quantities: the field error wins over the count error`, () => {
      const three: Record<string, Quantity> = { voltage: V(12), current: I(0.5), resistance: R(24), power: P(6) };
      delete three[field];
      const e = fail({ ...three, [field]: raw(NaN, dim) });
      expect(e.field).toBe(field);
    });
  }
  it('a tiny positive resistance is accepted (only zero is rejected)', () => {
    expect(compute({ current: I(1), resistance: R(1e-300) }).ok).toBe(true);
    expect(fail({ current: I(1), resistance: R(0) }).field).toBe('resistance');
  });
});

describe('dimension guards', () => {
  it.each([
    ['voltage', { voltage: I(1), resistance: R(1) }],
    ['current', { current: V(1), resistance: R(1) }],
    ['resistance', { voltage: V(1), resistance: P(1) }],
    ['power', { voltage: V(1), power: R(1) }],
    ['voltage', { voltage: q(1, DIM.DIMENSIONLESS), resistance: R(1) }],
    ['resistance', { voltage: V(1), resistance: q(1, DIM.RESISTIVITY) }],
    ['current', { current: q(1, DIM.TEMPERATURE_DIFFERENCE), resistance: R(1) }],
    ['voltage', { voltage: q(1, DIM.ABS_TEMPERATURE), resistance: R(1) }],
  ])('a wrong dimension for %s is DIMENSION naming the field', (field, inp) => {
    const e = fail(inp);
    expect([e.code, e.field]).toEqual(['DIMENSION', field]);
  });
});

describe('robustness', () => {
  it('never throws for malformed input objects and never returns a numeric result for them', () => {
    const junk: unknown[] = [
      null,
      undefined,
      5,
      'x',
      [],
      { voltage: 12, current: 0.5 },
      { voltage: { si: 'a', dim: DIM.VOLTAGE }, current: I(1) },
      { voltage: { si: 1 }, current: I(1) },
      { voltage: { si: 12, dim: null }, current: I(1) },
      { voltage: null, current: I(1) },
      { voltage: V(1), current: {} },
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
