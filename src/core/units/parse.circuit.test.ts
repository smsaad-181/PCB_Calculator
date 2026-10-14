/**
 * Circuit-values units (Phase 1 task 8, slice 2): frequency, capacitance, inductance and time with SI prefixes, the way
 * they are typed for RC, LC and reactance work. Expected SI values are restated here from the prefix definitions
 * (p = 1e-12, n = 1e-9, u or micro sign = 1e-6, m = 1e-3, k = 1e3, M = 1e6, G = 1e9); the parser is never consulted.
 * Case matters: mHz is a millihertz, MHz a megahertz.
 */
import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, parseQuantity, sameDim, toUnit, type Dim } from './index';

const MU = 'µ';
const GREEK_MU = 'μ';

const CASES: Array<[string, number, Dim]> = [
  ['1 Hz', 1, DIM.FREQUENCY],
  ['100 kHz', 1e5, DIM.FREQUENCY],
  ['2.4 MHz', 2.4e6, DIM.FREQUENCY],
  ['1 GHz', 1e9, DIM.FREQUENCY],
  ['32.768 kHz', 32768, DIM.FREQUENCY],
  ['50 mHz', 0.05, DIM.FREQUENCY],
  ['10 pF', 1e-11, DIM.CAPACITANCE],
  ['100 nF', 1e-7, DIM.CAPACITANCE],
  ['4.7 uF', 4.7e-6, DIM.CAPACITANCE],
  [`4.7 ${MU}F`, 4.7e-6, DIM.CAPACITANCE],
  [`4.7 ${GREEK_MU}F`, 4.7e-6, DIM.CAPACITANCE],
  ['2 mF', 2e-3, DIM.CAPACITANCE],
  ['1 F', 1, DIM.CAPACITANCE],
  ['10 uH', 1e-5, DIM.INDUCTANCE],
  [`10 ${MU}H`, 1e-5, DIM.INDUCTANCE],
  ['33 nH', 3.3e-8, DIM.INDUCTANCE],
  ['2.2 mH', 2.2e-3, DIM.INDUCTANCE],
  ['1 H', 1, DIM.INDUCTANCE],
  ['1 s', 1, DIM.TIME],
  ['5 ms', 5e-3, DIM.TIME],
  ['20 us', 2e-5, DIM.TIME],
  [`20 ${MU}s`, 2e-5, DIM.TIME],
  ['1 ns', 1e-9, DIM.TIME],
  ['100 ps', 1e-10, DIM.TIME],
];

describe('circuit units: frequency, capacitance, inductance, time', () => {
  for (const [text, si, dim] of CASES) {
    it(`"${text}" parses to ${String(si)} SI with the right dimension`, () => {
      const r = parseQuantity(text, dim);
      expect(r.ok, text).toBe(true);
      if (r.ok) {
        expect(r.value.si).toBe(si);
        expect(sameDim(r.value, { si: 1, dim } as typeof r.value)).toBe(true);
      }
    });
  }
  it('a unit of the wrong dimension is rejected when a dimension is expected', () => {
    expect(parseQuantity('10 nF', DIM.INDUCTANCE).ok).toBe(false);
    expect(parseQuantity('10 uH', DIM.CAPACITANCE).ok).toBe(false);
    expect(parseQuantity('1 kHz', DIM.TIME).ok).toBe(false);
    expect(parseQuantity('1 ms', DIM.FREQUENCY).ok).toBe(false);
  });
  it('units are case sensitive: "khz" and "mhZ" are unknown units', () => {
    expect(parseQuantity('1 khz').ok).toBe(false);
    expect(parseQuantity('1 mhZ').ok).toBe(false);
    expect(parseQuantity('1 NF').ok).toBe(false);
  });
  it('fromUnit and toUnit round-trip for every circuit unit', () => {
    for (const unit of ['pF', 'nF', 'uF', 'mF', 'nH', 'uH', 'mH', 'Hz', 'kHz', 'MHz', 'GHz', 'ns', 'us', 'ms', 's']) {
      for (const v of [1, 2.2, 4.7, 33, 470]) {
        expect(toUnit(fromUnit(v, unit), unit)).toBeCloseTo(v, 12);
      }
    }
  });
});
