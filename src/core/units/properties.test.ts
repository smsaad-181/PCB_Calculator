import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DIM,
  DimensionError,
  InvalidValueError,
  add,
  compare,
  div,
  formatQuantity,
  fromUnit,
  mul,
  parseQuantity,
  pow,
  q,
  sameDim,
  sub,
  toUnit,
  type Dim,
  type Quantity,
} from './index';

const DEG = '°';
const DELTA = 'Δ';
const OHM = 'Ω';
const MU = 'µ';

// Units whose conversion is a pure scale factor (no offset).
const SCALE_UNITS = [
  'm', 'mm', `${MU}m`, 'um', 'cm', 'mil', 'in', 'inch',
  'K', `${DELTA}K`, `${DELTA}${DEG}C`, 'ddegC', `${DELTA}${DEG}F`, 'ddegF',
  'A', 'mA', 'V', 'mV', OHM, 'ohm', `m${OHM}`, 'mohm', 'W', 'mW',
  'Hz', 'kHz', 'MHz', 'GHz', 'oz/ft2', 'kg/m2', 'g/m2',
];
// Units with an additive offset (absolute temperatures).
const OFFSET_UNITS = [`${DEG}C`, 'degC', `${DEG}F`, 'degF'];

const moderate = fc
  .tuple(fc.double({ min: 1e-3, max: 1e6, noNaN: true }), fc.boolean())
  .map(([v, neg]) => (neg ? -v : v));

// Absolute temperatures below 0 K are invalid (finding m-1). Generators for absolute-temperature
// quantities/units draw from a physically valid range with a margin above the floor.
const ABS_UNITS = new Set(['K', `${DEG}C`, 'degC', `${DEG}F`, 'degF']);
const ABS_FLOOR: Record<string, number> = { K: 0, [`${DEG}C`]: -273.15, degC: -273.15, [`${DEG}F`]: -459.67, degF: -459.67 };
const absValue = (unit: string): fc.Arbitrary<number> => {
  const lo = (ABS_FLOOR[unit] ?? 0) + 1;
  return fc.double({ min: lo, max: lo + 1e6, noNaN: true });
};
/** Value valid for the unit: full signed range, except absolute-temperature units. */
const valueFor = (unit: string): fc.Arbitrary<number> => (ABS_UNITS.has(unit) ? absValue(unit) : moderate);
const unitAndValue = (units: readonly string[]): fc.Arbitrary<[string, number]> =>
  fc.constantFrom(...units).chain((u) => valueFor(u).map((v): [string, number] => [u, v]));
/** Signed value valid for a dimension: absTemp gets si >= 1 K. */
const dimValue = (d: Dim): fc.Arbitrary<number> =>
  d.kind === 'absTemp' ? fc.double({ min: 1, max: 1e6, noNaN: true }) : moderate;
const dimAndValue = (dims: readonly Dim[]): fc.Arbitrary<[Dim, number]> =>
  fc.constantFrom(...dims).chain((d) => dimValue(d).map((v): [Dim, number] => [d, v]));

const wide = fc.double({ noNaN: true, noDefaultInfinity: true });

const PLAIN_DIMS: Dim[] = [
  DIM.DIMENSIONLESS, DIM.LENGTH, DIM.AREA, DIM.MASS, DIM.TIME, DIM.CURRENT, DIM.VOLTAGE,
  DIM.RESISTANCE, DIM.RESISTIVITY, DIM.POWER, DIM.DENSITY, DIM.FREQUENCY, DIM.CAPACITANCE, DIM.INDUCTANCE,
];
const ALL_DIMS: Dim[] = [
  ...PLAIN_DIMS, DIM.ABS_TEMPERATURE, DIM.TEMPERATURE_DIFFERENCE, DIM.AREAL_MASS,
  DIM.THERMAL_RESISTANCE, DIM.PER_KELVIN,
];
const plainDim = fc.constantFrom(...PLAIN_DIMS);

function isTempPair(a: Dim, b: Dim): boolean {
  const kinds = new Set([a.kind, b.kind]);
  return kinds.size === 2 && kinds.has('absTemp') && kinds.has('deltaT');
}

describe('property: unit round trip fromUnit -> toUnit', () => {
  it('scale units: relative error < 1e-12', () => {
    fc.assert(
      fc.property(unitAndValue(SCALE_UNITS), ([unit, v]) => {
        const back = toUnit(fromUnit(v, unit), unit);
        expect(Math.abs(back - v) / Math.abs(v)).toBeLessThan(1e-12);
      }),
    );
  });
  it('offset units (degC, degF): error < 1e-12 * (|v| + 300)', () => {
    fc.assert(
      fc.property(unitAndValue(OFFSET_UNITS), ([unit, v]) => {
        const back = toUnit(fromUnit(v, unit), unit);
        expect(Math.abs(back - v)).toBeLessThan(1e-12 * (Math.abs(v) + 300));
      }),
    );
  });
  it('every round trip result is finite and the quantity si is finite', () => {
    fc.assert(
      fc.property(unitAndValue([...SCALE_UNITS, ...OFFSET_UNITS]), ([unit, v]) => {
        expect(Number.isFinite(fromUnit(v, unit).si)).toBe(true);
      }),
    );
  });
  it('length chain mm -> mil -> in -> mm', () => {
    fc.assert(
      fc.property(moderate, (v) => {
        const mil = toUnit(fromUnit(v, 'mm'), 'mil');
        const inch = toUnit(fromUnit(mil, 'mil'), 'in');
        const mm = toUnit(fromUnit(inch, 'in'), 'mm');
        expect(Math.abs(mm - v) / Math.abs(v)).toBeLessThan(1e-12);
      }),
    );
  });
  it('delta temperature degC <-> degF: dF = 1.8 * dC and never shifted by 32', () => {
    fc.assert(
      fc.property(moderate, (v) => {
        const f = toUnit(fromUnit(v, `${DELTA}${DEG}C`), `${DELTA}${DEG}F`);
        expect(Math.abs(f - 1.8 * v) / Math.abs(1.8 * v)).toBeLessThan(1e-12);
      }),
    );
  });
  it('absolute temperature degC -> degF = 1.8 C + 32', () => {
    fc.assert(
      fc.property(fc.double({ min: -200, max: 1000, noNaN: true }), (c) => {
        const f = toUnit(fromUnit(c, `${DEG}C`), `${DEG}F`);
        expect(Math.abs(f - (1.8 * c + 32))).toBeLessThan(1e-9);
      }),
    );
  });
});

describe('property: absolute temperature below absolute zero', () => {
  it('fromUnit throws InvalidValueError for any value clearly below the floor', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ABS_UNITS).chain((u) =>
          fc.double({ min: 1e-3, max: 1e6, noNaN: true }).map((d): [string, number] => [u, (ABS_FLOOR[u] ?? 0) - d]),
        ),
        ([unit, v]) => {
          expect(() => fromUnit(v, unit)).toThrow(InvalidValueError);
        },
      ),
    );
  });
  it('q(<0, ABS_TEMPERATURE) throws InvalidValueError', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-3, max: 1e6, noNaN: true }), (d) => {
        expect(() => q(-d, DIM.ABS_TEMPERATURE)).toThrow(InvalidValueError);
      }),
    );
  });
});

describe('property: algebra', () => {
  const lenQ = moderate.map((v) => q(v, DIM.LENGTH));

  it('add is commutative (exactly) and keeps the dim', () => {
    fc.assert(
      fc.property(lenQ, lenQ, (a, b) => {
        expect(add(a, b).si).toBe(add(b, a).si);
        expect(sameDim(add(a, b), a)).toBe(true);
      }),
    );
  });
  it('add is associative within float tolerance', () => {
    fc.assert(
      fc.property(lenQ, lenQ, lenQ, (a, b, c) => {
        const l = add(add(a, b), c).si;
        const r = add(a, add(b, c)).si;
        const scale = Math.abs(a.si) + Math.abs(b.si) + Math.abs(c.si);
        expect(Math.abs(l - r)).toBeLessThanOrEqual(1e-12 * scale);
      }),
    );
  });
  it('sub is the inverse of add', () => {
    fc.assert(
      fc.property(lenQ, lenQ, (a, b) => {
        const r = sub(add(a, b), b).si;
        expect(Math.abs(r - a.si)).toBeLessThanOrEqual(1e-12 * (Math.abs(a.si) + Math.abs(b.si)));
      }),
    );
  });
  it('mul/div are inverse: (a*b)/b = a, with matching dims', () => {
    fc.assert(
      fc.property(moderate, plainDim, moderate, plainDim, (x, dx, y, dy) => {
        const a = q(x, dx);
        const b = q(y, dy);
        const r = div(mul(a, b), b);
        expect(Math.abs(r.si - x) / Math.abs(x)).toBeLessThan(1e-12);
        expect(sameDim(r, a)).toBe(true);
        const r2 = mul(div(a, b), b);
        expect(Math.abs(r2.si - x) / Math.abs(x)).toBeLessThan(1e-12);
        expect(sameDim(r2, a)).toBe(true);
      }),
    );
  });
  it('mul is commutative in value and dim', () => {
    fc.assert(
      fc.property(moderate, plainDim, moderate, plainDim, (x, dx, y, dy) => {
        const ab = mul(q(x, dx), q(y, dy));
        const ba = mul(q(y, dy), q(x, dx));
        expect(ab.si).toBe(ba.si);
        expect(sameDim(ab, ba)).toBe(true);
      }),
    );
  });
  it('x / x is dimensionless 1', () => {
    fc.assert(
      fc.property(moderate, plainDim, (x, d) => {
        const r = div(q(x, d), q(x, d));
        expect(r.si).toBe(1);
        expect(sameDim(r, q(1, DIM.DIMENSIONLESS))).toBe(true);
      }),
    );
  });
  it('pow(x, n) matches repeated mul for n = 2, 3 and pow(x,-1) = 1/x', () => {
    fc.assert(
      fc.property(moderate, plainDim, (x, d) => {
        const a = q(x, d);
        const sq = pow(a, 2);
        expect(Math.abs(sq.si - x * x) / (x * x)).toBeLessThan(1e-12);
        expect(sameDim(sq, mul(a, a))).toBe(true);
        expect(sameDim(pow(a, 3), mul(mul(a, a), a))).toBe(true);
        expect(Math.abs(pow(a, -1).si - 1 / x) / Math.abs(1 / x)).toBeLessThan(1e-12);
        expect(sameDim(pow(a, -1), div(q(1, DIM.DIMENSIONLESS), a))).toBe(true);
      }),
    );
  });
  it('compare is antisymmetric and consistent with sub', () => {
    fc.assert(
      fc.property(lenQ, lenQ, (a, b) => {
        expect(compare(a, b) + compare(b, a)).toBe(0);
        expect(compare(a, a)).toBe(0);
        const c = compare(a, b);
        expect(c === -1 || c === 0 || c === 1).toBe(true);
        expect(Math.sign(sub(a, b).si) + 0).toBe(c);
      }),
    );
  });
  it('monotonic: larger si compares greater', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-3, max: 1e6, noNaN: true }), fc.double({ min: 1e-3, max: 1e6, noNaN: true }), (a, b) => {
        fc.pre(a < b);
        expect(compare(q(a, DIM.LENGTH), q(b, DIM.LENGTH))).toBe(-1);
      }),
    );
  });
});

describe('property: dimension mismatch always throws', () => {
  it('add / sub throw DimensionError for any two different dims (except abs/delta temperature pair)', () => {
    fc.assert(
      fc.property(dimAndValue(ALL_DIMS), dimAndValue(ALL_DIMS), ([da, x], [db, y]) => {
        fc.pre(!sameDim(q(1, da), q(1, db)));
        fc.pre(!isTempPair(da, db));
        expect(() => add(q(x, da), q(y, db))).toThrow(DimensionError);
        expect(() => sub(q(x, da), q(y, db))).toThrow(DimensionError);
      }),
    );
  });
  it('compare throws DimensionError for any two different dims', () => {
    fc.assert(
      fc.property(dimAndValue(ALL_DIMS), dimAndValue(ALL_DIMS), ([da, x], [db, y]) => {
        fc.pre(!sameDim(q(1, da), q(1, db)));
        expect(() => compare(q(x, da), q(y, db))).toThrow(DimensionError);
      }),
    );
  });
  it('toUnit throws DimensionError when the unit dimension differs', () => {
    const unitDims: Array<[string, Dim]> = [
      ['mm', DIM.LENGTH], ['A', DIM.CURRENT], ['V', DIM.VOLTAGE], [OHM, DIM.RESISTANCE],
      ['W', DIM.POWER], ['Hz', DIM.FREQUENCY], ['oz/ft2', DIM.AREAL_MASS],
      [`${DEG}C`, DIM.ABS_TEMPERATURE], [`${DELTA}K`, DIM.TEMPERATURE_DIFFERENCE],
    ];
    fc.assert(
      fc.property(dimAndValue(ALL_DIMS), fc.constantFrom(...unitDims), ([d, x], [unit, ud]) => {
        fc.pre(!sameDim(q(1, d), q(1, ud)));
        expect(() => toUnit(q(x, d), unit)).toThrow(DimensionError);
      }),
    );
  });
  it('absolute temperature is never accepted by mul / div / pow', () => {
    fc.assert(
      fc.property(plainDim, moderate, fc.double({ min: 1, max: 1e6, noNaN: true }), (d, x, y) => {
        const t = q(y, DIM.ABS_TEMPERATURE);
        expect(() => mul(q(x, d), t)).toThrow(DimensionError);
        expect(() => mul(t, q(x, d))).toThrow(DimensionError);
        expect(() => div(q(x, d), t)).toThrow(DimensionError);
        expect(() => div(t, q(x, d))).toThrow(DimensionError);
      }),
    );
  });
});

describe('property: no operation yields a non-finite Quantity', () => {
  function finiteOrInvalid(f: () => Quantity): void {
    try {
      const r = f();
      expect(Number.isFinite(r.si)).toBe(true);
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidValueError);
    }
  }
  it('add / sub / mul / div over the full finite double range', () => {
    fc.assert(
      fc.property(wide, wide, (x, y) => {
        const a = q(x, DIM.LENGTH);
        const b = q(y, DIM.LENGTH);
        finiteOrInvalid(() => add(a, b));
        finiteOrInvalid(() => sub(a, b));
        finiteOrInvalid(() => mul(a, b));
        finiteOrInvalid(() => div(a, b));
      }),
    );
  });
  it('pow over the full finite range with integer exponents', () => {
    fc.assert(
      fc.property(wide, fc.integer({ min: -5, max: 5 }), (x, n) => {
        finiteOrInvalid(() => pow(q(x, DIM.LENGTH), n));
      }),
    );
  });
  it('fromUnit over the full finite range', () => {
    fc.assert(
      fc.property(fc.constantFrom(...SCALE_UNITS, ...OFFSET_UNITS), wide, (unit, x) => {
        finiteOrInvalid(() => fromUnit(x, unit));
      }),
    );
  });
  it('toUnit result is finite or InvalidValueError', () => {
    fc.assert(
      fc.property(fc.constantFrom('m', 'mm', `${MU}m`, 'mil', 'in'), wide, (unit, x) => {
        try {
          expect(Number.isFinite(toUnit(q(x, DIM.LENGTH), unit))).toBe(true);
        } catch (e) {
          expect(e).toBeInstanceOf(InvalidValueError);
        }
      }),
    );
  });
});

describe('property: parse(format(q)) ~ q', () => {
  const cases: Array<[Dim, string]> = [
    [DIM.LENGTH, 'm'],
    [DIM.RESISTANCE, OHM],
    [DIM.FREQUENCY, 'Hz'],
    [DIM.CURRENT, 'A'],
    [DIM.VOLTAGE, 'V'],
    [DIM.POWER, 'W'],
    [DIM.CAPACITANCE, 'F'],
    [DIM.INDUCTANCE, 'H'],
  ];
  const magnitude = fc.double({ min: 1e-9, max: 1e5, noNaN: true });
  it('round trip with sig = 12 and expected dimension', () => {
    fc.assert(
      fc.property(fc.constantFrom(...cases), magnitude, fc.boolean(), ([dim], m, negate) => {
        const x = q(negate ? -m : m, dim);
        const text = formatQuantity(x, { sig: 12 });
        expect(text).not.toMatch(/NaN|Infinity/);
        const parsed = parseQuantity(text, dim);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
          expect(sameDim(parsed.value, x)).toBe(true);
          expect(Math.abs(parsed.value.si - x.si) / Math.abs(x.si)).toBeLessThan(1e-9);
        }
      }),
    );
  });
  it('format output never contains NaN or Infinity for finite input', () => {
    fc.assert(
      fc.property(fc.constantFrom(...cases), wide, ([dim], x) => {
        const text = formatQuantity(q(x, dim));
        expect(text).not.toMatch(/NaN|Infinity/);
      }),
    );
  });
});
