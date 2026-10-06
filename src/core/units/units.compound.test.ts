/**
 * Phase 1 task 0(b): compound units parse and convert (K/W, ohm.m, /K, ppm/K, %, A/mm2, mil2, ...).
 * Tests use DIM.CURRENT_DENSITY (A/m2); the implementer must add and export it.
 * Dimensions are looked up lazily by name so a missing constant fails each case, not the whole file.
 */
import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, parseQuantity, q, sameDim, toUnit, type Dim } from './index';

type DimName = 'THERMAL_RESISTANCE' | 'RESISTIVITY' | 'PER_KELVIN' | 'DIMENSIONLESS' | 'CURRENT_DENSITY' | 'AREA';

const dimOf = (n: DimName): Dim => {
  const d = (DIM as unknown as Record<string, Dim | undefined>)[n];
  if (d === undefined) throw new Error(`DIM.${n} is not exported`);
  return d;
};

function relErr(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

const OHM = 'Ω';
const MICRO = 'µ';
const DEG = '°';
const SQ = '²';

const UNIT_SI: Array<[unit: string, siPerUnit: number, dim: DimName]> = [
  ['K/W', 1, 'THERMAL_RESISTANCE'],
  [`${DEG}C/W`, 1, 'THERMAL_RESISTANCE'],
  ['degC/W', 1, 'THERMAL_RESISTANCE'],
  [`${OHM}·m`, 1, 'RESISTIVITY'],
  ['ohm.m', 1, 'RESISTIVITY'],
  ['ohm*m', 1, 'RESISTIVITY'],
  ['ohm-m', 1, 'RESISTIVITY'],
  [`${OHM} m`, 1, 'RESISTIVITY'],
  [`${MICRO}${OHM}·cm`, 1e-8, 'RESISTIVITY'],
  ['uohm.cm', 1e-8, 'RESISTIVITY'],
  ['/K', 1, 'PER_KELVIN'],
  ['1/K', 1, 'PER_KELVIN'],
  [`/${DEG}C`, 1, 'PER_KELVIN'],
  ['ppm/K', 1e-6, 'PER_KELVIN'],
  [`ppm/${DEG}C`, 1e-6, 'PER_KELVIN'],
  ['%', 0.01, 'DIMENSIONLESS'],
  ['A/mm2', 1e6, 'CURRENT_DENSITY'],
  [`A/mm${SQ}`, 1e6, 'CURRENT_DENSITY'],
  ['mil2', 6.4516e-10, 'AREA'],
  [`mil${SQ}`, 6.4516e-10, 'AREA'],
  ['sq mil', 6.4516e-10, 'AREA'],
  ['sqmil', 6.4516e-10, 'AREA'],
  ['mm2', 1e-6, 'AREA'],
  [`mm${SQ}`, 1e-6, 'AREA'],
  ['cm2', 1e-4, 'AREA'],
];

describe('compound units: parse', () => {
  for (const [unit, per, dn] of UNIT_SI) {
    it(`parses "2.5 ${unit}" as 2.5 * ${String(per)} SI with the exact named dimension`, () => {
      for (const text of unit.startsWith('1/') ? [`2.5 ${unit}`] : [`2.5 ${unit}`, `2.5${unit}`]) {
        for (const expected of [undefined, dimOf(dn)]) {
          const r = expected === undefined ? parseQuantity(text) : parseQuantity(text, expected);
          expect(
            r.ok,
            `${text} (${expected === undefined ? 'no field' : dn})${r.ok ? '' : ': ' + r.error.message}`,
          ).toBe(true);
          if (r.ok) {
            expect(relErr(r.value.si, 2.5 * per), text).toBeLessThanOrEqual(1e-12);
            expect(sameDim(r.value, q(1, dimOf(dn))), `dim of ${text}`).toBe(true);
          }
        }
      }
    });
  }
  it('thermal resistance carries the K exponent: 20 K/W has exp[4] = 1', () => {
    const r = parseQuantity('20 K/W', dimOf('THERMAL_RESISTANCE'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.dim.exp[4]).toBe(1);
  });
  it('1 mil2 is exactly (25.4e-6)^2 = 6.4516e-10 m2', () => {
    const r = parseQuantity(`1 mil${SQ}`, dimOf('AREA'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(relErr(r.value.si, 6.4516e-10)).toBeLessThanOrEqual(1e-14);
  });
  it('1 A/mm2 = 1e6 A/m2', () => {
    const r = parseQuantity(`1 A/mm${SQ}`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.si).toBe(1e6);
  });
  it('realistic values: copper rho 1.724 uohm.cm = 1.724e-8 ohm.m; TCR 3930 ppm/K = 0.00393 /K', () => {
    const rho = parseQuantity(`1.724 ${MICRO}${OHM}·cm`, dimOf('RESISTIVITY'));
    const tcr = parseQuantity('3930 ppm/K', dimOf('PER_KELVIN'));
    expect(rho.ok && tcr.ok).toBe(true);
    if (rho.ok && tcr.ok) {
      expect(relErr(rho.value.si, 1.724e-8)).toBeLessThanOrEqual(1e-12);
      expect(relErr(tcr.value.si, 0.00393)).toBeLessThanOrEqual(1e-12);
    }
  });
});

describe('percent', () => {
  it('"5%" and "5 %" are 0.05, dimensionless, with and without the field', () => {
    for (const text of ['5%', '5 %']) {
      for (const expected of [undefined, DIM.DIMENSIONLESS]) {
        const r = expected === undefined ? parseQuantity(text) : parseQuantity(text, expected);
        expect(r.ok, text).toBe(true);
        if (r.ok) {
          expect(relErr(r.value.si, 0.05)).toBeLessThanOrEqual(1e-12);
          expect(sameDim(r.value, q(1, DIM.DIMENSIONLESS))).toBe(true);
        }
      }
    }
  });
  it('"%" with any other expected dimension is a mismatch error', () => {
    for (const dim of [DIM.LENGTH, DIM.RESISTANCE, DIM.PER_KELVIN, DIM.VOLTAGE, DIM.TEMPERATURE_DIFFERENCE]) {
      const r = parseQuantity('5%', dim);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message.length).toBeGreaterThan(0);
    }
  });
  it('negative and fractional percent', () => {
    const r = parseQuantity('-0.5 %', DIM.DIMENSIONLESS);
    expect(r.ok).toBe(true);
    if (r.ok) expect(relErr(r.value.si, -0.005)).toBeLessThanOrEqual(1e-12);
  });
});

describe('compound unit dimension mismatches are errors', () => {
  it('K/W is not a plain length / resistance / deltaT / per-kelvin', () => {
    for (const dim of [DIM.LENGTH, DIM.RESISTANCE, DIM.TEMPERATURE_DIFFERENCE, DIM.PER_KELVIN]) {
      expect(parseQuantity('5 K/W', dim).ok).toBe(false);
    }
  });
  it('/K is not a thermal resistance; A/mm2 is not a current; ohm.m is not a resistance; mil2 is not a length', () => {
    expect(parseQuantity('5 /K', dimOf('THERMAL_RESISTANCE')).ok).toBe(false);
    expect(parseQuantity('5 A/mm2', DIM.CURRENT).ok).toBe(false);
    expect(parseQuantity(`5 ${OHM}·m`, DIM.RESISTANCE).ok).toBe(false);
    expect(parseQuantity('5 mil2', DIM.LENGTH).ok).toBe(false);
  });
});

describe('toUnit / fromUnit accept the same spellings and round trip', () => {
  for (const [unit, per, dn] of UNIT_SI) {
    it(`fromUnit(v, "${unit}") scale and round trip`, () => {
      for (const v of [1, 2.5, -3.75, 1234.5678, 1e-3]) {
        const x = fromUnit(v, unit);
        expect(sameDim(x, q(1, dimOf(dn)))).toBe(true);
        expect(relErr(x.si, v * per)).toBeLessThanOrEqual(1e-12);
        expect(relErr(toUnit(x, unit), v)).toBeLessThanOrEqual(1e-12);
      }
    });
  }
  it('alias spellings: mils, thou, Ohm, ohms, uF, micro-sign F', () => {
    expect(relErr(fromUnit(1, 'mils').si, 25.4e-6)).toBeLessThanOrEqual(1e-12);
    expect(relErr(fromUnit(1, 'thou').si, 25.4e-6)).toBeLessThanOrEqual(1e-12);
    expect(fromUnit(1, 'Ohm').si).toBe(1);
    expect(fromUnit(1, 'ohms').si).toBe(1);
    expect(relErr(fromUnit(1, 'uF').si, 1e-6)).toBeLessThanOrEqual(1e-12);
    expect(relErr(fromUnit(1, `${MICRO}F`).si, 1e-6)).toBeLessThanOrEqual(1e-12);
    for (const u of ['mils', 'thou', 'Ohm', 'ohms', 'uF', `${MICRO}F`]) {
      const x = fromUnit(3.3, u);
      expect(relErr(toUnit(x, u), 3.3)).toBeLessThanOrEqual(1e-12);
    }
  });
  it('toUnit with the wrong dimension still throws', () => {
    expect(() => toUnit(fromUnit(1, 'K/W'), `${OHM}·m`)).toThrow();
    expect(() => toUnit(fromUnit(1, '/K'), 'K/W')).toThrow();
    expect(() => toUnit(fromUnit(1, '%'), 'mm')).toThrow();
  });
  it('K and degC stay ABSOLUTE in toUnit/fromUnit (field-awareness is a parse-only feature)', () => {
    expect(fromUnit(10, `${DEG}C`).si).toBeCloseTo(283.15, 12);
    expect(() => toUnit(fromUnit(10, `Δ${DEG}C`), 'K')).toThrow();
  });
});
