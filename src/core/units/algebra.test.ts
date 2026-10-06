// NOTE: numeric literals such as 8960, 0.0039 and 1.724e-8 in this file are arbitrary test numbers used only
// to exercise dimension algebra. They are NOT ledger values (see docs/sources/LEDGER.md S-003d, S-003e, S-004).
import { describe, expect, it } from 'vitest';
import {
  DIM,
  DimensionError,
  InvalidValueError,
  abs,
  add,
  compare,
  div,
  foilThickness,
  fromUnit,
  mul,
  neg,
  pow,
  q,
  sameDim,
  sub,
  toUnit,
} from './index';

const DEG = '°';
const DELTA = 'Δ';

describe('guards (rule 10)', () => {
  it('q(NaN) throws InvalidValueError with a clear message', () => {
    expect(() => q(Number.NaN, DIM.LENGTH)).toThrow(InvalidValueError);
    expect(() => q(Number.NaN, DIM.LENGTH)).toThrow(/NaN/);
  });
  it('q(+Infinity) and q(-Infinity) throw InvalidValueError', () => {
    expect(() => q(Infinity, DIM.LENGTH)).toThrow(InvalidValueError);
    expect(() => q(Infinity, DIM.LENGTH)).toThrow(/Infinity/);
    expect(() => q(-Infinity, DIM.LENGTH)).toThrow(InvalidValueError);
  });
  it('fromUnit(NaN / Infinity) throws InvalidValueError', () => {
    expect(() => fromUnit(Number.NaN, 'mm')).toThrow(InvalidValueError);
    expect(() => fromUnit(Number.NaN, 'mm')).toThrow(/NaN/);
    expect(() => fromUnit(Infinity, 'mm')).toThrow(InvalidValueError);
    expect(() => fromUnit(-Infinity, `${DEG}C`)).toThrow(InvalidValueError);
  });
  it('fromUnit overflow after scaling throws InvalidValueError', () => {
    expect(() => fromUnit(1.7e308, 'GHz')).toThrow(InvalidValueError);
  });
  it('q accepts zero, negative zero and negative finite values (sign checks belong to calculators)', () => {
    expect(q(0, DIM.LENGTH).si).toBe(0);
    expect(q(-5, DIM.LENGTH).si).toBe(-5);
  });
  it('overflow / divide by zero in operations throws InvalidValueError', () => {
    const big = q(1e200, DIM.LENGTH);
    expect(() => mul(big, big)).toThrow(InvalidValueError);
    expect(() => pow(big, 2)).toThrow(InvalidValueError);
    expect(() => add(q(1.7e308, DIM.LENGTH), q(1.7e308, DIM.LENGTH))).toThrow(InvalidValueError);
    expect(() => sub(q(1.7e308, DIM.LENGTH), q(-1.7e308, DIM.LENGTH))).toThrow(InvalidValueError);
    expect(() => div(q(1, DIM.LENGTH), q(0, DIM.LENGTH))).toThrow(InvalidValueError);
    expect(() => div(q(0, DIM.LENGTH), q(0, DIM.LENGTH))).toThrow(InvalidValueError);
    expect(() => pow(q(0, DIM.LENGTH), -1)).toThrow(InvalidValueError);
  });
});

describe('basic algebra', () => {
  it('add/sub same dim keep the dim', () => {
    const r = add(q(2, DIM.LENGTH), q(3, DIM.LENGTH));
    expect(r.si).toBe(5);
    expect(sameDim(r, q(1, DIM.LENGTH))).toBe(true);
    expect(sub(q(2, DIM.LENGTH), q(3, DIM.LENGTH)).si).toBe(-1);
  });
  it('add/sub/compare with different dims throw DimensionError', () => {
    expect(() => add(q(1, DIM.LENGTH), q(1, DIM.AREA))).toThrow(DimensionError);
    expect(() => sub(q(1, DIM.CURRENT), q(1, DIM.VOLTAGE))).toThrow(DimensionError);
    expect(() => compare(q(1, DIM.LENGTH), q(1, DIM.TIME))).toThrow(DimensionError);
  });
  it('operations do not mutate operands', () => {
    const a = q(2, DIM.LENGTH);
    const b = q(3, DIM.LENGTH);
    add(a, b);
    mul(a, b);
    neg(a);
    expect(a.si).toBe(2);
    expect(b.si).toBe(3);
    expect(sameDim(a, q(1, DIM.LENGTH))).toBe(true);
  });
  it('neg and abs', () => {
    expect(neg(q(2, DIM.LENGTH)).si).toBe(-2);
    expect(abs(q(-2, DIM.LENGTH)).si).toBe(2);
    expect(abs(q(2, DIM.LENGTH)).si).toBe(2);
    expect(sameDim(neg(q(2, DIM.CURRENT)), q(1, DIM.CURRENT))).toBe(true);
    expect(sameDim(abs(q(-2, DIM.CURRENT)), q(1, DIM.CURRENT))).toBe(true);
    expect(sameDim(neg(q(2, DIM.TEMPERATURE_DIFFERENCE)), q(1, DIM.TEMPERATURE_DIFFERENCE))).toBe(true);
  });
  it('compare returns -1, 0, 1', () => {
    expect(compare(q(1, DIM.LENGTH), q(2, DIM.LENGTH))).toBe(-1);
    expect(compare(q(2, DIM.LENGTH), q(2, DIM.LENGTH))).toBe(0);
    expect(compare(q(3, DIM.LENGTH), q(2, DIM.LENGTH))).toBe(1);
    expect(compare(fromUnit(10, `${DEG}C`), fromUnit(51, `${DEG}F`))).toBe(-1);
  });
  it('sameDim', () => {
    expect(sameDim(q(1, DIM.LENGTH), q(9, DIM.LENGTH))).toBe(true);
    expect(sameDim(q(1, DIM.LENGTH), q(1, DIM.AREA))).toBe(false);
    expect(sameDim(q(1, DIM.ABS_TEMPERATURE), q(1, DIM.TEMPERATURE_DIFFERENCE))).toBe(false);
  });
});

describe('dimension bookkeeping through mul/div/pow', () => {
  it('length * length = area; area / length = length', () => {
    const a = mul(q(2, DIM.LENGTH), q(3, DIM.LENGTH));
    expect(a.si).toBe(6);
    expect(sameDim(a, q(1, DIM.AREA))).toBe(true);
    expect(sameDim(div(a, q(2, DIM.LENGTH)), q(1, DIM.LENGTH))).toBe(true);
  });
  it('Ohm law: I * R = V, V * I = P, V / I = R', () => {
    const v = mul(q(2, DIM.CURRENT), q(5, DIM.RESISTANCE));
    expect(v.si).toBe(10);
    expect(sameDim(v, q(1, DIM.VOLTAGE))).toBe(true);
    expect(sameDim(mul(v, q(2, DIM.CURRENT)), q(1, DIM.POWER))).toBe(true);
    expect(sameDim(div(v, q(2, DIM.CURRENT)), q(1, DIM.RESISTANCE))).toBe(true);
  });
  it('rho * L / A = R', () => {
    const r = div(mul(q(1.724e-8, DIM.RESISTIVITY), q(0.1, DIM.LENGTH)), q(1e-8, DIM.AREA));
    expect(sameDim(r, q(1, DIM.RESISTANCE))).toBe(true);
    expect(r.si).toBeCloseTo(0.1724, 12);
  });
  it('density * length^3 = mass', () => {
    const m = mul(q(8960, DIM.DENSITY), pow(q(1, DIM.LENGTH), 3));
    expect(sameDim(m, q(1, DIM.MASS))).toBe(true);
  });
  it('dimensionless results: x / x, f * t', () => {
    expect(sameDim(div(q(4, DIM.LENGTH), q(2, DIM.LENGTH)), q(1, DIM.DIMENSIONLESS))).toBe(true);
    expect(sameDim(mul(q(4, DIM.FREQUENCY), q(2, DIM.TIME)), q(1, DIM.DIMENSIONLESS))).toBe(true);
  });
  it('pow with integer exponents: 2, 0, -1, -2', () => {
    expect(sameDim(pow(q(3, DIM.LENGTH), 2), q(1, DIM.AREA))).toBe(true);
    expect(pow(q(3, DIM.LENGTH), 2).si).toBe(9);
    expect(sameDim(pow(q(3, DIM.LENGTH), 0), q(1, DIM.DIMENSIONLESS))).toBe(true);
    expect(pow(q(3, DIM.LENGTH), 0).si).toBe(1);
    expect(pow(q(4, DIM.LENGTH), -1).si).toBe(0.25);
    expect(sameDim(pow(q(4, DIM.TIME), -1), q(1, DIM.FREQUENCY))).toBe(true);
    expect(pow(q(2, DIM.LENGTH), -2).si).toBe(0.25);
  });
  it('pow rejects non-integer, NaN and Infinity exponents', () => {
    expect(() => pow(q(4, DIM.AREA), 0.5)).toThrow();
    expect(() => pow(q(4, DIM.AREA), Number.NaN)).toThrow();
    expect(() => pow(q(4, DIM.AREA), Infinity)).toThrow();
  });
  it('capacitance and inductance dims compose: 1/(L*C) is frequency^2', () => {
    const w2 = pow(mul(q(1, DIM.INDUCTANCE), q(1, DIM.CAPACITANCE)), -1);
    expect(sameDim(w2, pow(q(1, DIM.FREQUENCY), 2))).toBe(true);
  });
});

describe('temperature vs temperature difference (proof)', () => {
  it('a 10 delta-degC rise is 18 delta-degF (NOT 50)', () => {
    const rise = fromUnit(10, `${DELTA}${DEG}C`);
    expect(toUnit(rise, `${DELTA}${DEG}F`)).toBeCloseTo(18, 12);
    expect(toUnit(rise, `${DELTA}${DEG}F`)).not.toBeCloseTo(50, 0);
    expect(toUnit(rise, `${DELTA}K`)).toBe(10);
  });
  it('10 degC absolute is 50 degF', () => {
    expect(toUnit(fromUnit(10, `${DEG}C`), `${DEG}F`)).toBeCloseTo(50, 10);
    expect(toUnit(fromUnit(10, 'degC'), 'degF')).toBeCloseTo(50, 10);
  });
  it('absolute and difference quantities of equal si value are different dims', () => {
    expect(sameDim(fromUnit(10, `${DEG}C`), fromUnit(10, `${DELTA}${DEG}C`))).toBe(false);
    expect(fromUnit(10, `${DEG}C`).dim.kind).toBe('absTemp');
    expect(fromUnit(10, `${DELTA}${DEG}C`).dim.kind).toBe('deltaT');
    expect(DIM.ABS_TEMPERATURE.kind).toBe('absTemp');
    expect(DIM.TEMPERATURE_DIFFERENCE.kind).toBe('deltaT');
    expect(DIM.AREAL_MASS.kind).toBe('arealMass');
    expect(DIM.LENGTH.kind).toBe('plain');
  });
  it('adding two absolute temperatures throws DimensionError', () => {
    expect(() => add(fromUnit(20, `${DEG}C`), fromUnit(30, `${DEG}C`))).toThrow(DimensionError);
    expect(() => add(q(300, DIM.ABS_TEMPERATURE), q(300, DIM.ABS_TEMPERATURE))).toThrow(DimensionError);
  });
  it('absTemp - absTemp = deltaT', () => {
    const d = sub(fromUnit(60, `${DEG}C`), fromUnit(25, `${DEG}C`));
    expect(sameDim(d, q(1, DIM.TEMPERATURE_DIFFERENCE))).toBe(true);
    expect(toUnit(d, `${DELTA}${DEG}C`)).toBeCloseTo(35, 12);
    expect(toUnit(d, `${DELTA}${DEG}F`)).toBeCloseTo(63, 12);
  });
  it('absTemp + deltaT = absTemp (either order); absTemp - deltaT = absTemp', () => {
    const t = fromUnit(25, `${DEG}C`);
    const dt = fromUnit(10, `${DELTA}${DEG}C`);
    const a = add(t, dt);
    const b = add(dt, t);
    expect(sameDim(a, q(1, DIM.ABS_TEMPERATURE))).toBe(true);
    expect(sameDim(b, q(1, DIM.ABS_TEMPERATURE))).toBe(true);
    expect(toUnit(a, `${DEG}C`)).toBeCloseTo(35, 12);
    expect(toUnit(b, `${DEG}C`)).toBeCloseTo(35, 12);
    const c = sub(t, dt);
    expect(sameDim(c, q(1, DIM.ABS_TEMPERATURE))).toBe(true);
    expect(toUnit(c, `${DEG}C`)).toBeCloseTo(15, 12);
  });
  it('deltaT - absTemp throws DimensionError', () => {
    expect(() => sub(fromUnit(10, `${DELTA}K`), fromUnit(20, `${DEG}C`))).toThrow(DimensionError);
  });
  it('deltaT +/- deltaT = deltaT', () => {
    const a = fromUnit(10, `${DELTA}K`);
    const b = fromUnit(4, `${DELTA}${DEG}C`);
    expect(sameDim(add(a, b), q(1, DIM.TEMPERATURE_DIFFERENCE))).toBe(true);
    expect(add(a, b).si).toBe(14);
    expect(sameDim(sub(a, b), q(1, DIM.TEMPERATURE_DIFFERENCE))).toBe(true);
    expect(sub(a, b).si).toBe(6);
  });
  it('absTemp or deltaT vs plain dimension in add/sub throws DimensionError', () => {
    expect(() => add(q(1, DIM.ABS_TEMPERATURE), q(1, DIM.LENGTH))).toThrow(DimensionError);
    expect(() => add(q(1, DIM.TEMPERATURE_DIFFERENCE), q(1, DIM.LENGTH))).toThrow(DimensionError);
  });
  it('compare: absTemp vs absTemp ok; absTemp vs deltaT throws', () => {
    expect(compare(fromUnit(0, `${DEG}C`), fromUnit(33, `${DEG}F`))).toBe(-1);
    expect(compare(fromUnit(20, `${DEG}C`), fromUnit(30, `${DEG}C`))).toBe(-1);
    expect(() => compare(fromUnit(20, `${DEG}C`), fromUnit(30, `${DELTA}K`))).toThrow(DimensionError);
  });
  it('toUnit(absTemp, delta unit) and toUnit(deltaT, absolute unit) throw DimensionError', () => {
    const t = fromUnit(25, `${DEG}C`);
    const dt = fromUnit(25, `${DELTA}${DEG}C`);
    for (const u of [`${DELTA}${DEG}C`, `${DELTA}${DEG}F`, `${DELTA}K`, 'ddegC', 'ddegF']) {
      expect(() => toUnit(t, u)).toThrow(DimensionError);
    }
    for (const u of [`${DEG}C`, `${DEG}F`, 'K', 'degC', 'degF']) {
      expect(() => toUnit(dt, u)).toThrow(DimensionError);
    }
  });
  it('mul / div / pow involving absTemp throw DimensionError', () => {
    const t = q(300, DIM.ABS_TEMPERATURE);
    const x = q(2, DIM.LENGTH);
    expect(() => mul(t, x)).toThrow(DimensionError);
    expect(() => mul(x, t)).toThrow(DimensionError);
    expect(() => mul(t, t)).toThrow(DimensionError);
    expect(() => div(t, x)).toThrow(DimensionError);
    expect(() => div(x, t)).toThrow(DimensionError);
    expect(() => div(t, t)).toThrow(DimensionError);
    expect(() => pow(t, 2)).toThrow(DimensionError);
    expect(() => pow(t, 1)).toThrow(DimensionError);
    expect(() => pow(t, 0)).toThrow(DimensionError);
    expect(() => mul(t, q(2, DIM.DIMENSIONLESS))).toThrow(DimensionError);
  });
  it('thermal resistance (K/W) * power = deltaT', () => {
    const dt = mul(q(162.8, DIM.THERMAL_RESISTANCE), q(0.5, DIM.POWER));
    expect(sameDim(dt, q(1, DIM.TEMPERATURE_DIFFERENCE))).toBe(true);
    expect(dt.si).toBeCloseTo(81.4, 12);
  });
  it('deltaT / power = thermal resistance', () => {
    const th = div(q(20, DIM.TEMPERATURE_DIFFERENCE), q(2, DIM.POWER));
    expect(sameDim(th, q(1, DIM.THERMAL_RESISTANCE))).toBe(true);
  });
  it('temperature coefficient [1/dT] * deltaT = dimensionless', () => {
    const x = mul(q(0.0039, DIM.PER_KELVIN), fromUnit(10, `${DELTA}${DEG}C`));
    expect(sameDim(x, q(1, DIM.DIMENSIONLESS))).toBe(true);
    expect(x.si).toBeCloseTo(0.039, 14);
  });
  it('(1 + alpha*dT) scales a resistance; 1 + dimensionless works', () => {
    const f = add(q(1, DIM.DIMENSIONLESS), mul(q(0.0039, DIM.PER_KELVIN), q(10, DIM.TEMPERATURE_DIFFERENCE)));
    const r = mul(q(0.1642, DIM.RESISTANCE), f);
    expect(sameDim(r, q(1, DIM.RESISTANCE))).toBe(true);
    expect(r.si).toBeCloseTo(0.1642 * 1.039, 12);
  });
  it('deltaT / deltaT is dimensionless', () => {
    expect(sameDim(div(q(6, DIM.TEMPERATURE_DIFFERENCE), q(3, DIM.TEMPERATURE_DIFFERENCE)), q(1, DIM.DIMENSIONLESS))).toBe(true);
  });
});

describe('areal mass kind protection', () => {
  const am = fromUnit(1, 'oz/ft2');
  it('arealMass + arealMass ok', () => {
    expect(sameDim(add(am, am), q(1, DIM.AREAL_MASS))).toBe(true);
    expect(add(am, am).si).toBeCloseTo(2 * am.si, 14);
  });
  it('arealMass + plain mass / area throws DimensionError', () => {
    expect(() => add(am, q(1, DIM.MASS))).toThrow(DimensionError);
    expect(() => add(am, q(1, DIM.AREA))).toThrow(DimensionError);
    expect(() => sub(q(1, DIM.MASS), am)).toThrow(DimensionError);
    expect(() => compare(am, q(1, DIM.MASS))).toThrow(DimensionError);
  });
  it('plain kg/m2 (mass / area) is a different kind from arealMass', () => {
    const plain = div(q(1, DIM.MASS), q(1, DIM.AREA));
    expect(sameDim(plain, am)).toBe(false);
    expect(() => add(plain, am)).toThrow(DimensionError);
    expect(() => toUnit(plain, 'oz/ft2')).toThrow(DimensionError);
  });
  it('div(arealMass, density) throws; only foilThickness gives a length', () => {
    expect(() => div(am, q(8960, DIM.DENSITY))).toThrow(DimensionError);
    expect(sameDim(foilThickness(am, 'mass-density').thickness, q(1, DIM.LENGTH))).toBe(true);
  });
});
