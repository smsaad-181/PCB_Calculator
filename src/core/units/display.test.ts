/**
 * Phase 1 task 0(c): per-field display units and significant figures tied to accuracy class (P-4).
 * New module src/core/units/display.ts, exported from ./index:
 *   type DisplayPrefs = { length: 'mm'|'mil'|'um'; temperature: 'C'|'K'|'F'; area: 'mm2'|'mil2' }
 *   const DEFAULT_DISPLAY_PREFS = { length: 'mm', temperature: 'C', area: 'mm2' }
 *   type AccuracyClass = 'exact'|'analytical'|'empirical'|'estimate'
 *   sigFigsFor(accuracyClass): number            // 6 / 4 / 3 / 2
 *   formatFor(q, opts?: { prefs?: DisplayPrefs; accuracyClass?: AccuracyClass; unit?: string }): string
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DEFAULT_DISPLAY_PREFS,
  DIM,
  InvalidValueError,
  formatFor,
  formatQuantity,
  parseQuantity,
  q,
  sameDim,
  sigFigsFor,
  type AccuracyClass,
  type Dim,
  type DisplayPrefs,
  type Quantity,
} from './index';

const OHM = 'Ω';
const MICRO = 'µ';
const DEG = '°';
const DELTA = 'Δ';
const SQ = '²';

const MM: DisplayPrefs = { length: 'mm', temperature: 'C', area: 'mm2' };
const MIL: DisplayPrefs = { length: 'mil', temperature: 'F', area: 'mil2' };
const UM_K: DisplayPrefs = { length: 'um', temperature: 'K', area: 'mm2' };
const ALL_PREFS: DisplayPrefs[] = [MM, MIL, UM_K, { length: 'mil', temperature: 'K', area: 'mm2' }, { length: 'mm', temperature: 'F', area: 'mil2' }];

describe('DEFAULT_DISPLAY_PREFS and sigFigsFor', () => {
  it('defaults are mm / C / mm2', () => {
    expect(DEFAULT_DISPLAY_PREFS).toEqual({ length: 'mm', temperature: 'C', area: 'mm2' });
  });
  it('significant figures by accuracy class: exact 6, analytical 4, empirical 3, estimate 2', () => {
    expect(sigFigsFor('exact')).toBe(6);
    expect(sigFigsFor('analytical')).toBe(4);
    expect(sigFigsFor('empirical')).toBe(3);
    expect(sigFigsFor('estimate')).toBe(2);
  });
});

describe('formatFor: unit chosen by dimension', () => {
  it('ambient 298.15 K shows as "25 degC" by default', () => {
    expect(formatFor(q(298.15, DIM.ABS_TEMPERATURE))).toBe(`25 ${DEG}C`);
    expect(formatFor(q(298.15, DIM.ABS_TEMPERATURE), { prefs: MM })).toBe(`25 ${DEG}C`);
  });
  it('absolute temperature per prefs', () => {
    expect(formatFor(q(298.15, DIM.ABS_TEMPERATURE), { prefs: UM_K })).toBe('298.15 K');
    expect(formatFor(q(298.15, DIM.ABS_TEMPERATURE), { prefs: MIL })).toBe(`77 ${DEG}F`);
  });
  it('temperature difference shows with a delta, per prefs (dK = dC)', () => {
    const dt = q(10, DIM.TEMPERATURE_DIFFERENCE);
    expect(formatFor(dt)).toBe(`10 ${DELTA}${DEG}C`);
    expect(formatFor(dt, { prefs: UM_K })).toBe(`10 ${DELTA}K`);
    expect(formatFor(dt, { prefs: MIL })).toBe(`18 ${DELTA}${DEG}F`);
  });
  it('length per prefs: 254 um', () => {
    const w = q(254e-6, DIM.LENGTH);
    expect(formatFor(w, { prefs: MIL })).toBe('10 mil');
    expect(formatFor(w, { prefs: MM })).toBe('0.254 mm');
    expect(formatFor(w, { prefs: UM_K })).toBe(`254 ${MICRO}m`);
    expect(formatFor(w)).toBe('0.254 mm');
  });
  it('35 um copper: 0.035 mm, 1.37795 mil (6 sf) or 1.38 mil (empirical)', () => {
    const t = q(35e-6, DIM.LENGTH);
    expect(formatFor(t, { prefs: MM })).toBe('0.035 mm');
    expect(formatFor(t, { prefs: MIL })).toBe('1.37795 mil');
    expect(formatFor(t, { prefs: MIL, accuracyClass: 'empirical' })).toBe('1.38 mil');
  });
  it('area per prefs: 6.4516e-10 m2 is 1 mil2 (area prefs mil2), 1 mm2 = 1e-6 m2', () => {
    expect(formatFor(q(6.4516e-10, DIM.AREA), { prefs: MIL })).toBe(`1 mil${SQ}`);
    expect(formatFor(q(1e-6, DIM.AREA), { prefs: MM })).toBe(`1 mm${SQ}`);
    expect(formatFor(q(8.89e-9, DIM.AREA), { prefs: MM })).toBe(`0.00889 mm${SQ}`);
  });
  it('resistance uses engineering prefixes', () => {
    expect(formatFor(q(0.193941, DIM.RESISTANCE))).toBe(`193.941 m${OHM}`);
    expect(formatFor(q(4.7, DIM.RESISTANCE))).toBe(`4.7 ${OHM}`);
    expect(formatFor(q(4700, DIM.RESISTANCE))).toBe(`4.7 k${OHM}`);
  });
  it('other electrical dimensions use engineering prefixes', () => {
    expect(formatFor(q(0.5, DIM.CURRENT))).toBe('500 mA');
    expect(formatFor(q(3.3, DIM.VOLTAGE))).toBe('3.3 V');
    expect(formatFor(q(0.25, DIM.POWER))).toBe('250 mW');
    expect(formatFor(q(2.4e9, DIM.FREQUENCY))).toBe('2.4 GHz');
    expect(formatFor(q(4.7e-6, DIM.CAPACITANCE))).toBe(`4.7 ${MICRO}F`);
    expect(formatFor(q(2.2e-9, DIM.INDUCTANCE))).toBe('2.2 nH');
  });
  it('compound dimensions', () => {
    expect(formatFor(q(20, DIM.THERMAL_RESISTANCE))).toBe('20 K/W');
    expect(formatFor(q(0.0039, DIM.PER_KELVIN))).toBe('0.0039 /K');
    expect(formatFor(q(2e6, (DIM as unknown as Record<string, Dim>).CURRENT_DENSITY as Dim))).toBe(`2 A/mm${SQ}`);
    expect(formatFor(q(0.30515172727, DIM.AREAL_MASS))).toBe(`1 oz/ft${SQ}`);
    expect(formatFor(q(1.724e-8, DIM.RESISTIVITY))).toContain(`${OHM}·m`);
  });
  it('dimensionless is a plain number', () => {
    expect(formatFor(q(0.25, DIM.DIMENSIONLESS))).toBe('0.25');
  });
});

describe('formatFor: explicit unit and significant figures', () => {
  it('explicit unit overrides prefs', () => {
    expect(formatFor(q(0.0254, DIM.LENGTH), { unit: 'mil' })).toBe('1000 mil');
    expect(formatFor(q(0.0254, DIM.LENGTH), { unit: 'mm', prefs: MIL })).toBe('25.4 mm');
    expect(formatFor(q(298.15, DIM.ABS_TEMPERATURE), { unit: 'K' })).toBe('298.15 K');
  });
  it('default is 6 significant figures; accuracy class sets it otherwise', () => {
    const r = q(1234.5678, DIM.RESISTANCE);
    expect(formatFor(r)).toBe(`1.23457 k${OHM}`);
    expect(formatFor(r, { accuracyClass: 'exact' })).toBe(`1.23457 k${OHM}`);
    expect(formatFor(r, { accuracyClass: 'analytical' })).toBe(`1.235 k${OHM}`);
    expect(formatFor(r, { accuracyClass: 'empirical' })).toBe(`1.23 k${OHM}`);
    expect(formatFor(r, { accuracyClass: 'estimate' })).toBe(`1.2 k${OHM}`);
  });
  it('accuracy class also applies with an explicit unit', () => {
    expect(formatFor(q(0.0314, DIM.LENGTH), { unit: 'mil', accuracyClass: 'empirical' })).toBe('1240 mil');
  });
  it('an estimate never shows more than 2 significant figures (false-precision guard)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-6, max: 1e6, noNaN: true }), (v) => {
        const text = formatFor(q(v, DIM.RESISTANCE), { accuracyClass: 'estimate' });
        const num = /^-?([0-9.]+)/.exec(text)?.[1] ?? '';
        const digits = num.replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
        expect(digits.length, text).toBeLessThanOrEqual(2);
      }),
    );
  });
});

describe('formatFor: never falls back to the SI-exponent form for dimensions that have a default', () => {
  const CURRENT_DENSITY = (DIM as unknown as Record<string, Dim>).CURRENT_DENSITY as Dim;
  const DIMS: Array<[string, Dim]> = [
    ['LENGTH', DIM.LENGTH],
    ['AREA', DIM.AREA],
    ['MASS', DIM.MASS],
    ['TIME', DIM.TIME],
    ['CURRENT', DIM.CURRENT],
    ['VOLTAGE', DIM.VOLTAGE],
    ['RESISTANCE', DIM.RESISTANCE],
    ['RESISTIVITY', DIM.RESISTIVITY],
    ['POWER', DIM.POWER],
    ['FREQUENCY', DIM.FREQUENCY],
    ['CAPACITANCE', DIM.CAPACITANCE],
    ['INDUCTANCE', DIM.INDUCTANCE],
    ['ABS_TEMPERATURE', DIM.ABS_TEMPERATURE],
    ['TEMPERATURE_DIFFERENCE', DIM.TEMPERATURE_DIFFERENCE],
    ['AREAL_MASS', DIM.AREAL_MASS],
    ['THERMAL_RESISTANCE', DIM.THERMAL_RESISTANCE],
    ['PER_KELVIN', DIM.PER_KELVIN],
    ['CURRENT_DENSITY', CURRENT_DENSITY],
    ['DIMENSIONLESS', DIM.DIMENSIONLESS],
  ];
  const VALUES = [1e-12, 3.7e-9, 2.5e-6, 0.0254, 1, 42.5, 1e3, 224972000, 1e9];
  for (const [name, dim] of DIMS) {
    it(`${name}: no "^" or SI base-unit expression for any prefs / magnitude`, () => {
      expect(dim, `DIM.${name}`).toBeDefined();
      for (const prefs of ALL_PREFS) {
        for (const v of VALUES) {
          const val = dim.kind === 'absTemp' ? v + 1 : v;
          const text = formatFor(q(val, dim), { prefs });
          expect(text, `${name} ${String(val)}`).not.toContain('^');
          expect(text).not.toMatch(/NaN|Infinity|undefined/);
          expect(text).not.toMatch(/kg|m·|s·/);
        }
      }
    });
  }
});

describe('formatFor: round trip through parseQuantity within the printed precision', () => {
  const CURRENT_DENSITY = (DIM as unknown as Record<string, Dim>).CURRENT_DENSITY as Dim;
  const RT: Array<[string, Dim, number[]]> = [
    ['LENGTH', DIM.LENGTH, [35e-6, 254e-6, 0.0254, 1.5e-3, 0.3]],
    ['AREA', DIM.AREA, [6.4516e-10, 8.89e-9, 1e-6, 2.5e-5]],
    ['RESISTANCE', DIM.RESISTANCE, [0.193941, 4.7, 4700, 1.2e6, 0.0005]],
    ['CURRENT', DIM.CURRENT, [0.5, 3.3, 12, 2.5e-6]],
    ['VOLTAGE', DIM.VOLTAGE, [3.3, 0.0012, 48]],
    ['POWER', DIM.POWER, [0.25, 12.5, 3e-5]],
    ['FREQUENCY', DIM.FREQUENCY, [2.4e9, 1e4, 50]],
    ['CAPACITANCE', DIM.CAPACITANCE, [4.7e-6, 1e-11, 0.001]],
    ['INDUCTANCE', DIM.INDUCTANCE, [2.2e-9, 4.7e-6, 0.01]],
    ['RESISTIVITY', DIM.RESISTIVITY, [1.724e-8, 1.68e-8]],
    ['THERMAL_RESISTANCE', DIM.THERMAL_RESISTANCE, [20, 162.8, 0.5]],
    ['PER_KELVIN', DIM.PER_KELVIN, [0.0039, 0.00393]],
    ['CURRENT_DENSITY', CURRENT_DENSITY, [2e6, 1.5e7, 3.3e5]],
    ['AREAL_MASS', DIM.AREAL_MASS, [0.30515172727, 0.1525758636, 0.915455]],
    ['DIMENSIONLESS', DIM.DIMENSIONLESS, [0.25, 0.05, 12]],
    ['TEMPERATURE_DIFFERENCE', DIM.TEMPERATURE_DIFFERENCE, [10, 55.5, 0.5]],
  ];
  for (const [name, dim, values] of RT) {
    it(`${name}: parse(formatFor(x), dim) = x for every pref set and accuracy class`, () => {
      for (const prefs of ALL_PREFS) {
        for (const acc of ['exact', 'analytical', 'empirical', 'estimate'] as AccuracyClass[]) {
          const sig = sigFigsFor(acc);
          for (const v of values) {
            const x = q(v, dim);
            const text = formatFor(x, { prefs, accuracyClass: acc });
            const r = parseQuantity(text, dim);
            expect(r.ok, `${text}${r.ok ? '' : ': ' + r.error.message}`).toBe(true);
            if (r.ok) {
              expect(sameDim(r.value, x)).toBe(true);
              // half a unit in the last printed digit, relative to a leading digit of 1
              const tol = 0.5 * Math.pow(10, 1 - sig) * (1 + 1e-9);
              expect(Math.abs(r.value.si - v) / v, `${text} vs ${String(v)}`).toBeLessThanOrEqual(tol);
            }
          }
        }
      }
    });
  }
  it('ABS_TEMPERATURE: parse(formatFor(T), ABS_TEMPERATURE) = T within 1e-3 K at 6 sf (250..400 K)', () => {
    for (const prefs of ALL_PREFS) {
      for (const k of [250, 273.15, 298.15, 358.15, 398.15]) {
        const x = q(k, DIM.ABS_TEMPERATURE);
        const text = formatFor(x, { prefs });
        const r = parseQuantity(text, DIM.ABS_TEMPERATURE);
        expect(r.ok, text).toBe(true);
        if (r.ok) expect(Math.abs(r.value.si - k), text).toBeLessThanOrEqual(1e-3);
      }
    }
  });
});

describe('rounding and robustness', () => {
  it('999.9996 rolls over to the next prefix at every significant-figure count', () => {
    for (const acc of [undefined, 'exact', 'analytical', 'empirical', 'estimate'] as Array<AccuracyClass | undefined>) {
      expect(formatFor(q(999.9996, DIM.RESISTANCE), acc ? { accuracyClass: acc } : {})).toBe(`1 k${OHM}`);
    }
    expect(formatQuantity(q(999.9996, DIM.RESISTANCE), { sig: 1 })).toBe(`1 k${OHM}`);
    expect(formatQuantity(q(999.9996, DIM.RESISTANCE))).toBe(`1 k${OHM}`);
    expect(formatFor(q(999.9996e-6, DIM.LENGTH), { prefs: MM })).toBe('1 mm');
  });
  it('zero and negative values', () => {
    expect(formatFor(q(0, DIM.RESISTANCE))).toMatch(/^0 ?/);
    expect(formatFor(q(-0.5, DIM.CURRENT))).toBe('-500 mA');
    expect(formatFor(q(-40 + 273.15, DIM.ABS_TEMPERATURE))).toBe(`-40 ${DEG}C`);
  });
  it('forged non-finite quantities never print NaN/Infinity (throwing InvalidValueError is acceptable)', () => {
    for (const si of [Number.NaN, Infinity, -Infinity]) {
      const forged = { si, dim: DIM.LENGTH } as Quantity;
      let text: string | undefined;
      try {
        text = formatFor(forged);
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidValueError);
      }
      if (text !== undefined) expect(text).not.toMatch(/NaN|Infinity/);
    }
  });
  it('property: finite lengths and areas always format without exponent-form SI fallback or non-finite text', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-9, max: 1e3, noNaN: true }), fc.constantFrom(...ALL_PREFS), (v, prefs) => {
        for (const dim of [DIM.LENGTH, DIM.AREA]) {
          const text = formatFor(q(v, dim), { prefs });
          expect(text).not.toMatch(/\^|NaN|Infinity/);
        }
      }),
    );
  });
});
