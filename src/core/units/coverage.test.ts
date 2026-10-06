import { describe, expect, it } from 'vitest';
import { LEDGER } from '../data/ledger';
import {
  DIM,
  DimensionError,
  FOIL_CONVENTIONS,
  InvalidValueError,
  div,
  foilThickness,
  formatQuantity,
  fromUnit,
  mul,
  parseQuantity,
  pow,
  q,
  sameDim,
  toUnit,
  unitInfo,
} from './index';

const OHM = 'Ω';

describe('foilThickness: guards and user override', () => {
  const oneOz = fromUnit(1, 'oz/ft2');

  it('user-supplied constant is used, reported source "user" and status UNVERIFIED', () => {
    const r = foilThickness(oneOz, 'nominal-1.35mil', { constant: 1.4 });
    expect(r.constantUsed.source).toBe('user');
    expect(r.constantUsed.value).toBe(1.4);
    expect(r.status).toBe('UNVERIFIED');
    expect(r.statement).toContain('user-supplied');
    // 1 oz/ft2 * 1.4 mil per oz/ft2 = 1.4 mil (1 mil = 25.4 um exactly, S-006)
    expect(toUnit(r.thickness, 'mil')).toBeCloseTo(1.4, 12);
  });

  it('user override of nominal-35um is in um per oz/ft2 and reported UNVERIFIED', () => {
    const r = foilThickness(oneOz, 'nominal-35um', { constant: 36 });
    expect(r.constantUsed.source).toBe('user');
    expect(r.status).toBe('UNVERIFIED');
    expect(r.thickness.si / 36e-6).toBeCloseTo(1, 12);
  });

  it('user override of the mass-density constant divides areal mass by it', () => {
    const r = foilThickness(oneOz, 'mass-density', { constant: 9000 });
    expect(r.constantUsed.source).toBe('user');
    expect(r.status).toBe('UNVERIFIED');
    expect(r.thickness.si / (oneOz.si / 9000)).toBeCloseTo(1, 12);
  });

  it.each(['nominal-35um', 'nominal-1.35mil', 'mass-density'] as const)(
    'default constant of %s is reported source "default" with the S-003 ledger status',
    (conv) => {
      const r = foilThickness(oneOz, conv);
      expect(r.constantUsed.source).toBe('default');
      expect(r.status).toBe(FOIL_CONVENTIONS[conv].status);
      expect(r.status).toBe(LEDGER.find((x) => x.id === 'S-003')?.status);
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid override constant %s',
    (c) => {
      expect(() => foilThickness(oneOz, 'nominal-35um', { constant: c })).toThrow(InvalidValueError);
      expect(() => foilThickness(oneOz, 'nominal-1.35mil', { constant: c })).toThrow(InvalidValueError);
      expect(() => foilThickness(oneOz, 'mass-density', { constant: c })).toThrow(InvalidValueError);
    },
  );

  it('rejects a non-finite or non-positive weight', () => {
    const inf = { si: Number.POSITIVE_INFINITY, dim: DIM.AREAL_MASS };
    expect(() => foilThickness(inf, 'nominal-35um')).toThrow(InvalidValueError);
    expect(() => foilThickness(q(0, DIM.AREAL_MASS), 'nominal-35um')).toThrow(InvalidValueError);
    expect(() => foilThickness(q(-1, DIM.AREAL_MASS), 'mass-density')).toThrow(InvalidValueError);
  });

  it('rejects a weight that is not an areal mass (a plain length cannot be used as foil weight)', () => {
    expect(() => foilThickness(q(1, DIM.LENGTH), 'nominal-35um')).toThrow(DimensionError);
  });

  it('throws instead of returning an infinite thickness on overflow', () => {
    expect(() => foilThickness(q(1e300, DIM.AREAL_MASS), 'mass-density', { constant: 1e-300 })).toThrow(
      InvalidValueError,
    );
  });
});

describe('formatQuantity: dimensions without a display entry', () => {
  it('falls back to an SI base-unit expression and applies no prefix', () => {
    // K/W = m^-2 kg^-1 s^3 K per the dimension vector for THERMAL_RESISTANCE
    expect(formatQuantity(q(2500, DIM.THERMAL_RESISTANCE))).toBe('2500 m^-2·kg^-1·s^3·K');
  });

  it('dimensionless values print as a bare number with no trailing unit or space', () => {
    expect(formatQuantity(q(0.25, DIM.DIMENSIONLESS))).toBe('0.25');
  });

  it('fallback works for a single base unit with exponent 1 mixed with exponents', () => {
    // RESISTIVITY has a display fallback too: ohm*m = m^3 kg s^-3 A^-2
    expect(formatQuantity(q(1.7e-8, DIM.RESISTIVITY))).toBe('1.7e-8 m^3·kg·s^-3·A^-2');
  });
});

describe('parseQuantity: dimensionless, bare prefixes and defensive paths', () => {
  it('unitless number is accepted when the expected dimension is dimensionless', () => {
    const r = parseQuantity('0.25', DIM.DIMENSIONLESS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.si).toBe(0.25);
      expect(sameDim(r.value, q(1, DIM.DIMENSIONLESS))).toBe(true);
    }
  });

  it('unitless number is rejected when a unit-bearing dimension is expected', () => {
    expect(parseQuantity('5', DIM.RESISTANCE).ok).toBe(false);
    expect(parseQuantity('5').ok).toBe(false);
  });

  it('"1m" with RESISTANCE expected parses as 1 milliohm, not 1 metre', () => {
    const r = parseQuantity('1m', DIM.RESISTANCE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.si).toBeCloseTo(1e-3, 15);
      expect(sameDim(r.value, q(1, DIM.RESISTANCE))).toBe(true);
    }
  });

  it('"1m" without expected dimension is still a metre', () => {
    const r = parseQuantity('1m');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.si).toBe(1);
      expect(sameDim(r.value, q(1, DIM.LENGTH))).toBe(true);
    }
  });

  it('bare prefix works with the expected unit supplied by the dimension', () => {
    const r = parseQuantity(`4.7k`, DIM.RESISTANCE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.si).toBeCloseTo(4700, 9);
    expect(OHM).toBe('Ω');
  });

  it('bare prefix that overflows is rejected with a clear error, never an Infinity result', () => {
    const r = parseQuantity('1e308k', DIM.RESISTANCE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidValueError);
  });

  it('a unit of the wrong dimension and not a bare prefix is a dimension error', () => {
    const r = parseQuantity('5mil', DIM.RESISTANCE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(DimensionError);
  });

  it('never throws: hostile input whose conversion to string throws an Error', () => {
    const hostile = {
      toString(): string {
        throw new Error('boom');
      },
    } as unknown as string;
    const r = parseQuantity(hostile);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('boom');
  });

  it('never throws: hostile input that throws a non-Error value', () => {
    const hostile = {
      toString(): string {
        throw 'plain string';
      },
    } as unknown as string;
    const r = parseQuantity(hostile);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(InvalidValueError);
      expect(r.error.message).toContain('plain string');
    }
  });
});

describe('quantity algebra: areal mass kind protection', () => {
  const oz = fromUnit(1, 'oz/ft2');
  const two = q(2, DIM.DIMENSIONLESS);

  it('scaling 1 oz/ft2 by a dimensionless 2 gives 2 oz/ft2, still an areal mass (either operand order)', () => {
    for (const r of [mul(oz, two), mul(two, oz)]) {
      expect(r.dim.kind).toBe('arealMass');
      expect(sameDim(r, oz)).toBe(true);
      expect(toUnit(r, 'oz/ft2')).toBeCloseTo(2, 12);
    }
  });

  it('dividing an areal mass by a dimensionless number keeps the kind', () => {
    const r = div(mul(oz, two), two);
    expect(r.dim.kind).toBe('arealMass');
    expect(toUnit(r, 'oz/ft2')).toBeCloseTo(1, 12);
    expect(toUnit(div(oz, q(4, DIM.DIMENSIONLESS)), 'oz/ft2')).toBeCloseTo(0.25, 12);
  });

  it('dimensionless / areal mass is rejected (the reciprocal is not an areal mass)', () => {
    expect(() => div(two, oz)).toThrow(DimensionError);
  });

  it('areal mass times or divided by a dimensioned quantity is rejected (use foilThickness)', () => {
    expect(() => mul(oz, q(1, DIM.LENGTH))).toThrow(DimensionError);
    expect(() => mul(q(1, DIM.LENGTH), oz)).toThrow(DimensionError);
    expect(() => div(oz, q(1, DIM.AREA))).toThrow(DimensionError);
    expect(() => div(oz, oz)).toThrow(DimensionError);
  });

  it('pow on an areal mass throws, even for exponent 1', () => {
    expect(() => pow(oz, 2)).toThrow(DimensionError);
    expect(() => pow(oz, 1)).toThrow(DimensionError);
  });

  it('scaling overflow is reported, not returned as Infinity', () => {
    expect(() => mul(q(1e300, DIM.AREAL_MASS), q(1e300, DIM.DIMENSIONLESS))).toThrow(InvalidValueError);
    expect(() => div(oz, q(0, DIM.DIMENSIONLESS))).toThrow(InvalidValueError);
  });
});

describe('unitInfo', () => {
  it('returns dimension and ledger rows for a known unit', () => {
    const info = unitInfo('mil');
    expect(info).toBeDefined();
    expect(info?.dim).toBe(DIM.LENGTH);
    expect(info?.ledgerIds).toContain('S-006');
  });

  it('resolves prefixed units and reports their base dimension', () => {
    const info = unitInfo('mm');
    expect(info?.dim).toBe(DIM.LENGTH);
  });

  it('foil weight unit is tied to the foil convention ledger row S-003', () => {
    expect(unitInfo('oz/ft2')?.ledgerIds).toContain('S-003');
  });

  it('returns undefined for unknown or wrong-case units', () => {
    expect(unitInfo('furlong')).toBeUndefined();
    expect(unitInfo('MIL')).toBeUndefined();
    expect(unitInfo('')).toBeUndefined();
  });
});
