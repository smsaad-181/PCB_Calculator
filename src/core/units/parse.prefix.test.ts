/**
 * Gate G-4: bare SI prefixes (number + prefix letter, no base unit) and upper-case K.
 * Contract: parseQuantity(text, expectedDim?) -> { ok:false, error } with message containing
 *   "bare prefix", "write the unit" and a concrete suggestion (e.g. "10 mm").
 * Bare prefixes stay valid for component-style fields (RESISTANCE, CAPACITANCE, INDUCTANCE, FREQUENCY, VOLTAGE, CURRENT, POWER).
 * Upper-case K for RESISTANCE: error contains "lower-case k" and "kelvin".
 */
import { describe, expect, it } from 'vitest';
import { DIM, parseQuantity, type Dim } from './index';

function err(text: string, dim?: Dim): string {
  const r = dim === undefined ? parseQuantity(text) : parseQuantity(text, dim);
  expect(r.ok, `"${text}" should be rejected`).toBe(false);
  return r.ok ? '' : r.error.message;
}

const FORBIDDEN: Array<[string, Dim]> = [
  ['LENGTH', DIM.LENGTH],
  ['AREA', DIM.AREA],
  ['RESISTIVITY', DIM.RESISTIVITY],
  ['CURRENT_DENSITY', DIM.CURRENT_DENSITY],
  ['PER_KELVIN', DIM.PER_KELVIN],
  ['THERMAL_RESISTANCE', DIM.THERMAL_RESISTANCE],
  ['AREAL_MASS', DIM.AREAL_MASS],
  ['DIMENSIONLESS', DIM.DIMENSIONLESS],
  ['TEMPERATURE_DIFFERENCE', DIM.TEMPERATURE_DIFFERENCE],
  ['ABS_TEMPERATURE', DIM.ABS_TEMPERATURE],
  ['MASS', DIM.MASS],
  ['TIME', DIM.TIME],
  ['THERMAL_CONDUCTIVITY', DIM.THERMAL_CONDUCTIVITY],
];

// "m" is excluded: it is also the real unit metre (LENGTH) and is covered separately.
const BARE = ['10 M', '10 k', '35u', '35µ', '1.72 u', '2 n', '10M', '3 G', '4 p', '0.5 k'];

describe('G-4: bare prefix rejected in non-component fields', () => {
  for (const [name, dim] of FORBIDDEN) {
    it(`${name}: bare prefixes rejected with an actionable message`, () => {
      for (const text of BARE) {
        const m = err(text, dim);
        expect(m, text).toMatch(/bare prefix/i);
        expect(m, text).toMatch(/write the unit/i);
        // at least one concrete suggestion: the number followed by a spelled-out unit
        expect(m, text).toMatch(/\d\s?[A-Za-zµΩΔ°]/);
      }
    });
  }

  it('LENGTH "10 M" suggests explicit spellings such as "10 mm"', () => {
    const m = err('10 M', DIM.LENGTH);
    expect(m).toContain('10 mm');
  });

  it('LENGTH "35u" suggests um', () => {
    expect(err('35u', DIM.LENGTH)).toMatch(/35 ?(um|µm)/);
  });

  it('RESISTIVITY "1.72 u" is rejected (not silently micro-ohm-metre)', () => {
    expect(err('1.72 u', DIM.RESISTIVITY)).toMatch(/bare prefix/i);
  });

  it('LENGTH "5 m" stays metre (m is a real unit) and is not a bare-prefix error', () => {
    const r = parseQuantity('5 m', DIM.LENGTH);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.si).toBe(5);
  });

  it('non-length fields reject "5 m" (no metre there) with an error', () => {
    for (const dim of [DIM.AREA, DIM.RESISTIVITY, DIM.PER_KELVIN, DIM.DIMENSIONLESS, DIM.AREAL_MASS]) {
      expect(parseQuantity('5 m', dim).ok).toBe(false);
    }
  });

  it('explicit spellings stay valid', () => {
    expect(parseQuantity('10 mm', DIM.LENGTH).ok).toBe(true);
    expect(parseQuantity('35 um', DIM.LENGTH).ok).toBe(true);
    expect(parseQuantity('10 Mm', DIM.LENGTH).ok).toBe(true);
    expect(parseQuantity('1.72 uΩ·cm', DIM.RESISTIVITY).ok).toBe(true);
    expect(parseQuantity('5 %', DIM.DIMENSIONLESS).ok).toBe(true);
  });

  it('no expectedDim: bare prefix is rejected as ambiguous and names the fields needed', () => {
    for (const text of ['10 M', '10 k', '35u', '1.72 u', '2 n']) {
      const m = err(text);
      expect(m, text).toMatch(/bare prefix|component-code|needs a field/i);
      expect(m, text).toMatch(/resistance|capacitance|inductance|field/i);
    }
    expect(err('10 k')).toMatch(/bare prefix/i);
    expect(err('35u')).toMatch(/bare prefix/i);
  });

  it('no expectedDim: "1m" is still a metre (a real unit, not a bare prefix)', () => {
    const r = parseQuantity('1m');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.si).toBe(1);
  });
});

describe('G-4: bare prefixes REMAIN accepted for component-style fields', () => {
  const cases: Array<[string, Dim, number]> = [
    ['1.5k', DIM.RESISTANCE, 1500],
    ['10M', DIM.RESISTANCE, 1e7],
    ['10 M', DIM.RESISTANCE, 1e7],
    ['10 k', DIM.RESISTANCE, 1e4],
    ['1 m', DIM.RESISTANCE, 1e-3],
    ['100n', DIM.CAPACITANCE, 1e-7],
    ['10u', DIM.CAPACITANCE, 1e-5],
    ['4.7 p', DIM.CAPACITANCE, 4.7e-12],
    ['100n', DIM.INDUCTANCE, 1e-7],
    ['2.2u', DIM.INDUCTANCE, 2.2e-6],
    ['10 M', DIM.FREQUENCY, 1e7],
    ['100 k', DIM.FREQUENCY, 1e5],
    ['5 k', DIM.VOLTAGE, 5000],
    ['500 m', DIM.VOLTAGE, 0.5],
    ['500 m', DIM.CURRENT, 0.5],
    ['10 u', DIM.CURRENT, 1e-5],
    ['2 k', DIM.POWER, 2000],
    ['500 m', DIM.POWER, 0.5],
  ];
  for (const [text, dim, si] of cases) {
    it(`"${text}" -> ${String(si)} SI`, () => {
      const r = parseQuantity(text, dim);
      expect(r.ok).toBe(true);
      if (r.ok) expect(Math.abs(r.value.si - si) / si).toBeLessThan(1e-12);
    });
  }
});

describe('G-4: upper-case K in a resistance field is kelvin, not kilo', () => {
  for (const text of ['4K7', '10K', '10 KΩ', '10 Kohm', '1.5K', '10 K']) {
    it(`"${text}" with RESISTANCE is rejected with a lower-case k / kelvin hint`, () => {
      const m = err(text, DIM.RESISTANCE);
      expect(m).toContain('lower-case k');
      expect(m.toLowerCase()).toContain('kelvin');
    });
  }
  it('"10 K" stays valid for temperature fields', () => {
    const dt = parseQuantity('10 K', DIM.TEMPERATURE_DIFFERENCE);
    expect(dt.ok).toBe(true);
    if (dt.ok) expect(dt.value.si).toBe(10);
    const abs = parseQuantity('10 K', DIM.ABS_TEMPERATURE);
    expect(abs.ok).toBe(true);
    if (abs.ok) expect(abs.value.si).toBe(10);
    expect(parseQuantity('10 K').ok).toBe(true);
  });
  it('lower-case spellings still work', () => {
    expect(parseQuantity('4k7', DIM.RESISTANCE).ok).toBe(true);
    expect(parseQuantity('10 kΩ', DIM.RESISTANCE).ok).toBe(true);
    expect(parseQuantity('10 kohm', DIM.RESISTANCE).ok).toBe(true);
  });
});
