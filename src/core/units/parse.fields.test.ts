/**
 * Phase 1 task 0(b): field-aware parsing, copper weight, aliases, resistor/component codes, errors with hints.
 * Written BEFORE the implementation (tests-first). Contract: parseQuantity(text, expectedDim?) never throws.
 * Domain review P-3, m-5, m-7.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, InvalidValueError, parseQuantity, q, sameDim, type Dim } from './index';

const OHM_GREEK = 'Ω'; // Greek capital omega
const OHM_SIGN = 'Ω'; // OHM SIGN
const MICRO = 'µ'; // micro sign
const MU_GREEK = 'μ'; // Greek small mu

function relErr(actual: number, expected: number): number {
  if (expected === 0) return Math.abs(actual);
  return Math.abs(actual - expected) / Math.abs(expected);
}

function expectParsed(text: string, si: number, dim: Dim, expectedDim?: Dim): void {
  const r = expectedDim === undefined ? parseQuantity(text) : parseQuantity(text, expectedDim);
  expect(r.ok, `parse ${JSON.stringify(text)}${r.ok ? '' : ': ' + r.error.message}`).toBe(true);
  if (r.ok) {
    expect(
      relErr(r.value.si, si),
      `si of ${JSON.stringify(text)} = ${String(r.value.si)}, want ${String(si)}`,
    ).toBeLessThanOrEqual(1e-12);
    expect(sameDim(r.value, q(1, dim)), `dimension of ${JSON.stringify(text)}`).toBe(true);
  }
}

function expectRejected(text: string, expectedDim?: Dim): string {
  const r = expectedDim === undefined ? parseQuantity(text) : parseQuantity(text, expectedDim);
  expect(r.ok, `${JSON.stringify(text)} must be rejected`).toBe(false);
  if (r.ok) return '';
  expect(r.error.message.length).toBeGreaterThan(0);
  return r.error.message;
}

describe('field-aware temperature difference (expectedDim TEMPERATURE_DIFFERENCE)', () => {
  const DT = (): Dim => DIM.TEMPERATURE_DIFFERENCE;
  it('bare K and degC / degF are RISES, never absolute', () => {
    expectParsed('10 K', 10, DT(), DT());
    expectParsed('10 °C', 10, DT(), DT());
    expectParsed('10 degC', 10, DT(), DT());
    expectParsed('10K', 10, DT(), DT());
    expectParsed('10°C', 10, DT(), DT());
  });
  it('degF rise is scaled by 5/9 with NO 32 offset', () => {
    expectParsed('10 °F', (10 * 5) / 9, DT(), DT());
    expectParsed('10 degF', (10 * 5) / 9, DT(), DT());
    expectParsed('18 °F', 10, DT(), DT());
    expectParsed('0 °F', 0, DT(), DT());
    expectParsed('32 °F', (32 * 5) / 9, DT(), DT());
    expectParsed('-5 °F', (-5 * 5) / 9, DT(), DT());
  });
  it('explicit delta units still work in a rise field', () => {
    expectParsed('10 Δ°C', 10, DT(), DT());
    expectParsed('10 ΔK', 10, DT(), DT());
    expectParsed('10 Δ°F', (10 * 5) / 9, DT(), DT());
    expectParsed('10 ddegC', 10, DT(), DT());
    expectParsed('10 dK', 10, DT(), DT());
    expectParsed('10 ddegF', (10 * 5) / 9, DT(), DT());
  });
  it('a rise field still rejects non-temperature units', () => {
    expectRejected('10 mm', DT());
    expectRejected('10 A', DT());
  });
  it('WITHOUT expectedDim "10 degC" and "10 K" stay ABSOLUTE (existing behaviour)', () => {
    expectParsed('10 °C', 283.15, DIM.ABS_TEMPERATURE);
    expectParsed('10 K', 10, DIM.ABS_TEMPERATURE);
    expectParsed('50 °F', 283.15, DIM.ABS_TEMPERATURE);
  });
  it('property: rise in degF = v*5/9, rise in degC/K = v, for any value', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e4, max: 1e4, noNaN: true }), (v) => {
        const f = parseQuantity(`${String(v)} °F`, DT());
        const c = parseQuantity(`${String(v)} °C`, DT());
        const k = parseQuantity(`${String(v)} K`, DT());
        expect(f.ok && c.ok && k.ok).toBe(true);
        if (f.ok && c.ok && k.ok) {
          expect(relErr(f.value.si, (v * 5) / 9)).toBeLessThanOrEqual(1e-12);
          // The text "-0" prints as "0", so a negative zero cannot survive the text round trip: normalise it.
          expect(c.value.si).toBe(v + 0);
          expect(k.value.si).toBe(v + 0);
          expect(sameDim(f.value, q(1, DIM.TEMPERATURE_DIFFERENCE))).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('field-aware absolute temperature (expectedDim ABS_TEMPERATURE)', () => {
  const T = (): Dim => DIM.ABS_TEMPERATURE;
  it('25 degC is 298.15 K; degF and K are absolute', () => {
    expectParsed('25 °C', 298.15, T(), T());
    expectParsed('25 degC', 298.15, T(), T());
    expectParsed('77 °F', 298.15, T(), T());
    expectParsed('298.15 K', 298.15, T(), T());
  });
  it('below absolute zero is rejected with InvalidValueError', () => {
    for (const text of ['-300 °C', '-500 °F', '-1 K']) {
      const r = parseQuantity(text, T());
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.error).toBeInstanceOf(InvalidValueError);
    }
  });
  it('a delta unit is a dimension mismatch that suggests removing the delta', () => {
    for (const text of ['10 Δ°C', '10 ΔK', '10 Δ°F']) {
      const msg = expectRejected(text, T());
      expect(msg, text).toMatch(/Δ/);
      expect(msg, text).toMatch(/remov/i);
    }
  });
});

describe('copper weight (expectedDim AREAL_MASS)', () => {
  const OZ = 0.028349523125 / (0.3048 * 0.3048); // 0.30515172727 kg/m2
  const M = (): Dim => DIM.AREAL_MASS;
  it('1 oz is 1 oz/ft2 = 0.30515172727 kg/m2', () => {
    expect(OZ).toBeCloseTo(0.30515172727, 10);
    expectParsed('1 oz', OZ, M(), M());
    expectParsed('1oz', OZ, M(), M());
    expectParsed('0.5oz', 0.5 * OZ, M(), M());
    expectParsed('0.5 oz', 0.5 * OZ, M(), M());
    expectParsed('2 oz/ft²', 2 * OZ, M(), M());
    expectParsed('3 oz/ft2', 3 * OZ, M(), M());
  });
  it('explicit areal-mass units are unchanged', () => {
    expectParsed('1 oz/ft2', OZ, M());
    expectParsed('0.3 kg/m2', 0.3, M(), M());
    expectParsed('305 g/m²', 0.305, M(), M());
  });
  it('bare oz WITHOUT expectedDim is rejected with a copper-weight hint', () => {
    const msg = expectRejected('1 oz');
    expect(msg).toMatch(/did you mean/i);
    expect(msg).toContain('oz/ft²');
    expect(msg).toMatch(/copper/i);
  });
  it('oz with expectedDim MASS stays a mass (not silently reinterpreted)', () => {
    expectParsed('1 oz', 0.028349523125, DIM.MASS, DIM.MASS);
  });
  it('oz is not accepted where a length is expected', () => {
    expectRejected('1 oz', DIM.LENGTH);
  });
});

describe('aliases', () => {
  it('mils / mil / thou are the same length (25.4 um)', () => {
    for (const u of ['mils', 'mil', 'thou']) {
      expectParsed(`10 ${u}`, 254e-6, DIM.LENGTH);
      expectParsed(`10${u}`, 254e-6, DIM.LENGTH, DIM.LENGTH);
    }
  });
  it('Ohm / ohm / ohms / both omega code points', () => {
    for (const u of ['Ohm', 'ohm', 'ohms', OHM_GREEK, OHM_SIGN]) {
      expectParsed(`4.7 ${u}`, 4.7, DIM.RESISTANCE);
      expectParsed(`4.7${u}`, 4.7, DIM.RESISTANCE, DIM.RESISTANCE);
    }
    expectParsed('2 kOhm', 2000, DIM.RESISTANCE, DIM.RESISTANCE);
  });
  it('uF / micro-sign F / greek-mu F', () => {
    for (const u of ['uF', `${MICRO}F`, `${MU_GREEK}F`]) {
      expectParsed(`100 ${u}`, 100e-6, DIM.CAPACITANCE);
      expectParsed(`100${u}`, 100e-6, DIM.CAPACITANCE, DIM.CAPACITANCE);
    }
  });
  it('inch parity (no /1000 error): 1 in = 25.4 mm, 0.001 in = 1 mil', () => {
    expectParsed('1 in', 0.0254, DIM.LENGTH);
    expectParsed('1 inch', 0.0254, DIM.LENGTH);
    expectParsed('0.001 in', 25.4e-6, DIM.LENGTH);
  });
});

describe('resistor / component code notation (only with an expectedDim)', () => {
  const R = (): Dim => DIM.RESISTANCE;
  it('RESISTANCE codes', () => {
    const cases: Array<[string, number]> = [
      ['4k7', 4700],
      ['4R7', 4.7],
      ['R47', 0.47],
      ['0R5', 0.5],
      ['1M2', 1.2e6],
      ['2k2', 2200],
      ['10R', 10],
      ['10k', 10000],
      ['100R', 100],
      ['4.7k', 4700],
      ['1R0', 1],
    ];
    for (const [text, si] of cases) expectParsed(text, si, R(), R());
  });
  it('CAPACITANCE codes', () => {
    const C = DIM.CAPACITANCE;
    expectParsed('4n7', 4.7e-9, C, C);
    expectParsed('4u7', 4.7e-6, C, C);
    expectParsed(`4${MICRO}7`, 4.7e-6, C, C);
    expectParsed(`4${MU_GREEK}7`, 4.7e-6, C, C);
    expectParsed('4p7', 4.7e-12, C, C);
  });
  it('INDUCTANCE codes', () => {
    const L = DIM.INDUCTANCE;
    expectParsed('4u7', 4.7e-6, L, L);
    expectParsed('2n2', 2.2e-9, L, L);
  });
  it('without expectedDim the codes are rejected and the message names the needed field', () => {
    expect(expectRejected('4k7')).toMatch(/resistance/i);
    expect(expectRejected('4R7')).toMatch(/resistance/i);
    expect(expectRejected('1M2')).toMatch(/resistance/i);
    expect(expectRejected('4n7')).toMatch(/capacitance|inductance/i);
    expect(expectRejected('4u7')).toMatch(/capacitance|inductance/i);
  });
  it('codes are rejected in a field of the wrong kind', () => {
    expectRejected('4k7', DIM.LENGTH);
    expectRejected('4R7', DIM.CAPACITANCE);
    expectRejected('4n7', DIM.RESISTANCE);
    expectRejected('4R7', DIM.VOLTAGE);
  });
  it('garbage is rejected', () => {
    for (const text of ['4k7k', 'k7', '4R7R', 'R', 'k', '4k7k7', 'RR7', '4R77R', '4 k 7x']) {
      expectRejected(text, R());
    }
    for (const text of ['4n7n', 'n7', '4n7p']) expectRejected(text, DIM.CAPACITANCE);
  });
});

describe('decimal comma and thousands separators (never silently reinterpreted)', () => {
  it('"0,254 mm" fails, says "decimal comma" and suggests "0.254 mm"', () => {
    for (const expected of [undefined, DIM.LENGTH]) {
      const msg = expectRejected('0,254 mm', expected);
      expect(msg).toMatch(/decimal comma/i);
      expect(msg).toContain('0.254 mm');
    }
    expect(expectRejected('1,5 mil')).toContain('1.5 mil');
    expect(expectRejected('1,5 mm')).toMatch(/decimal comma/i);
  });
  it('thousands separators are rejected with a helpful message, never parsed', () => {
    for (const text of ['1,000 mm', '1 000 mm', '1,234.5 mm', '1.000,5 mm', '1 000 000 mm']) {
      for (const expected of [undefined, DIM.LENGTH]) {
        const msg = expectRejected(text, expected);
        expect(msg, text).toMatch(/thousands|separator|decimal comma/i);
      }
    }
  });
  it('a comma without a unit is rejected too', () => {
    expectRejected('0,5', DIM.DIMENSIONLESS);
    expectRejected('1,5', DIM.LENGTH);
  });
});

describe('errors suggest the accepted spelling', () => {
  it('"mill" suggests mil', () => {
    for (const expected of [undefined, DIM.LENGTH]) {
      expect(expectRejected('5 mill', expected)).toMatch(/did you mean[^a-z]*"?mil/i);
    }
  });
  it('"ohmz" suggests ohm', () => {
    for (const expected of [undefined, DIM.RESISTANCE]) {
      expect(expectRejected('5 ohmz', expected)).toMatch(/did you mean[^a-z]*"?ohm/i);
    }
  });
  it('a totally unknown unit lists the accepted units for the field and makes no suggestion', () => {
    const lenMsg = expectRejected('5 furlong', DIM.LENGTH);
    expect(lenMsg).not.toMatch(/did you mean/i);
    expect(lenMsg).toContain('mm');
    expect(lenMsg).toContain('mil');
    const resMsg = expectRejected('5 furlong', DIM.RESISTANCE);
    expect(resMsg).toMatch(/ohm|Ω/);
    const tMsg = expectRejected('5 furlong', DIM.TEMPERATURE_DIFFERENCE);
    expect(tMsg).toMatch(/K/);
  });
  it('without expectedDim a totally unknown unit is still rejected with a message', () => {
    expect(expectRejected('5 furlong').length).toBeGreaterThan(0);
  });
});

describe('safety (R-13): zero handling and no non-finite output', () => {
  it('"-0 mm" and "1e-400 mm" parse to 0 (documented; callers guard zero)', () => {
    for (const text of ['-0 mm', '1e-400 mm']) {
      const r = parseQuantity(text);
      expect(r.ok, text).toBe(true);
      if (r.ok) expect(r.value.si === 0).toBe(true);
    }
  });
  it('fuzz: 500 weird strings never throw and never yield NaN/Infinity', () => {
    const fragments = [
      '', ' ', '0', '-0', '1', '4k7', 'R47', '1e999', '1e-999', 'NaN', 'Infinity', '-Infinity', '.', ',', '0,5', '1 000',
      'mm', 'mil', 'mils', 'thou', 'oz', 'oz/ft2', '%', '/K', 'K/W', '°C', '°F', 'Δ', 'K', OHM_GREEK,
      'ohm', MICRO, 'u', 'k', 'M', '²', '2', '*', '-', '/', 'e', 'E', '+', '\u0000', '😀', 'sq mil',
      'ppm/K', 'A/mm2',
    ];
    const weird = fc.array(fc.constantFrom(...fragments), { minLength: 0, maxLength: 6 }).map((a) => a.join(''));
    const dims: Array<Dim | undefined> = [
      undefined,
      DIM.LENGTH,
      DIM.RESISTANCE,
      DIM.CAPACITANCE,
      DIM.INDUCTANCE,
      DIM.ABS_TEMPERATURE,
      DIM.TEMPERATURE_DIFFERENCE,
      DIM.AREAL_MASS,
      DIM.DIMENSIONLESS,
      DIM.AREA,
    ];
    fc.assert(
      fc.property(
        fc.oneof(weird, fc.string({ maxLength: 12 })),
        fc.constantFrom(...dims),
        (text, dim) => {
          const r = dim === undefined ? parseQuantity(text) : parseQuantity(text, dim);
          if (r.ok) {
            expect(Number.isFinite(r.value.si)).toBe(true);
            expect(Number.isNaN(r.value.si)).toBe(false);
          } else {
            expect(r.error.message.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
