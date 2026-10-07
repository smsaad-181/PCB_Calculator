import { describe, expect, it } from 'vitest';
import { DIM, formatQuantity, parseQuantity, q, sameDim, type Dim } from './index';

const OHM = 'Ω';
const MU = 'µ';

function relErr(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

function expectParsed(text: string, si: number, dim?: Dim, expectedDim?: Dim): void {
  const r = expectedDim === undefined ? parseQuantity(text) : parseQuantity(text, expectedDim);
  expect(r.ok, `parse "${text}"`).toBe(true);
  if (r.ok) {
    expect(relErr(r.value.si, si), `si of "${text}"`).toBeLessThanOrEqual(1e-12);
    if (dim) expect(sameDim(r.value, q(1, dim))).toBe(true);
  }
}

describe('parseQuantity: accepted forms', () => {
  it('lengths: "10mil", "10 mil", "0.3 mm"', () => {
    expectParsed('10mil', 254e-6, DIM.LENGTH);
    expectParsed('10 mil', 254e-6, DIM.LENGTH);
    expectParsed('0.3 mm', 0.3e-3, DIM.LENGTH);
    expectParsed('0.3 mm', 0.3e-3, DIM.LENGTH, DIM.LENGTH);
  });
  it('length: "35u" with expectedDim LENGTH is now REJECTED (gate G-4: bare prefix); "35um" is 35 um', () => {
    const r = parseQuantity('35u', DIM.LENGTH);
    expect(r.ok).toBe(false);
    expectParsed('35um', 35e-6, DIM.LENGTH, DIM.LENGTH);
  });
  it('resistance: "1.5k" with expectedDim RESISTANCE is 1500 ohm', () => {
    expectParsed('1.5k', 1500, DIM.RESISTANCE, DIM.RESISTANCE);
  });
  it('"2.2uF" is 2.2e-6 F, "100nH" is 1e-7 H, "10MHz" is 1e7 Hz', () => {
    expectParsed('2.2uF', 2.2e-6, DIM.CAPACITANCE);
    expectParsed('100nH', 1e-7, DIM.INDUCTANCE);
    expectParsed('10MHz', 1e7, DIM.FREQUENCY);
  });
  it('m vs M is case-sensitive: "1mΩ" = 1e-3, "1MΩ" = 1e6', () => {
    expectParsed(`1m${OHM}`, 1e-3, DIM.RESISTANCE);
    expectParsed(`1M${OHM}`, 1e6, DIM.RESISTANCE);
    expectParsed(`1m${OHM}`, 1e-3, DIM.RESISTANCE, DIM.RESISTANCE);
    expectParsed(`1M${OHM}`, 1e6, DIM.RESISTANCE, DIM.RESISTANCE);
  });
  it('micro sign and "u" prefixes agree', () => {
    expectParsed(`35${MU}m`, 35e-6, DIM.LENGTH);
    expectParsed('35um', 35e-6, DIM.LENGTH);
  });
  it('surrounding whitespace, scientific notation, signs', () => {
    expectParsed('  10 mil  ', 254e-6, DIM.LENGTH);
    expectParsed('1e3 mm', 1, DIM.LENGTH);
    expectParsed('2.5E-3 A', 2.5e-3, DIM.CURRENT);
    expectParsed('-5 mm', -5e-3, DIM.LENGTH);
    expectParsed('+5 mm', 5e-3, DIM.LENGTH);
  });
  it('other electrical units', () => {
    expectParsed('500 mA', 0.5, DIM.CURRENT);
    expectParsed('3.3 V', 3.3, DIM.VOLTAGE);
    expectParsed('250 mW', 0.25, DIM.POWER);
    expectParsed('2.4 GHz', 2.4e9, DIM.FREQUENCY);
    expectParsed('10 kHz', 1e4, DIM.FREQUENCY);
  });
});

describe('parseQuantity: rejected forms never throw and carry a message', () => {
  const bad = ['', '   ', 'abc', 'NaN', 'Infinity', '-Infinity', '1e400', '1..2', '--5 mm', '1,5 mm', 'mm'];
  for (const text of bad) {
    it(`rejects ${JSON.stringify(text)}`, () => {
      for (const expected of [undefined, DIM.LENGTH]) {
        const r = expected === undefined ? parseQuantity(text) : parseQuantity(text, expected);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(typeof r.error.message).toBe('string');
          expect(r.error.message.length).toBeGreaterThan(0);
        }
      }
    });
  }
  it('rejects dimension mismatch with expectedDim', () => {
    for (const [text, dim] of [
      ['10mil', DIM.RESISTANCE],
      ['5 A', DIM.LENGTH],
      ['10MHz', DIM.LENGTH],
      ['2.2uF', DIM.INDUCTANCE],
      [`1m${OHM}`, DIM.VOLTAGE],
    ] as Array<[string, Dim]>) {
      const r = parseQuantity(text, dim);
      expect(r.ok, `${text} as expected dim`).toBe(false);
    }
  });
  it('rejects an unknown unit suffix', () => {
    expect(parseQuantity('5 furlong').ok).toBe(false);
  });
  it('result object is a discriminated union (ok:true has value, ok:false has error)', () => {
    const good = parseQuantity('1 mm');
    const badR = parseQuantity('abc');
    expect(good.ok).toBe(true);
    expect('value' in good).toBe(true);
    expect(badR.ok).toBe(false);
    expect('error' in badR).toBe(true);
  });
});

describe('formatQuantity', () => {
  it('chooses an engineering prefix: 35e-6 m -> "35 um" (micro sign)', () => {
    expect(formatQuantity(q(35e-6, DIM.LENGTH))).toMatch(new RegExp(`^35(\\.0*)? ${MU}m$`));
  });
  it('1500 ohm -> "1.5 k ohm"', () => {
    expect(formatQuantity(q(1500, DIM.RESISTANCE))).toMatch(new RegExp(`^1\\.5(0*) k${OHM}$`));
  });
  it('0.5 A -> "500 mA"; 2.4e9 Hz -> "2.4 GHz"; 1e-7 H -> "100 nH"', () => {
    expect(formatQuantity(q(0.5, DIM.CURRENT))).toMatch(/^500(\.0*)? mA$/);
    expect(formatQuantity(q(2.4e9, DIM.FREQUENCY))).toMatch(/^2\.4(0*) GHz$/);
    expect(formatQuantity(q(1e-7, DIM.INDUCTANCE))).toMatch(/^100(\.0*)? nH$/);
  });
  it('explicit unit: no prefix selection, converts to the unit', () => {
    expect(formatQuantity(q(0.0254, DIM.LENGTH), { unit: 'mil' })).toMatch(/^1000(\.0*)? mil$/);
    expect(formatQuantity(q(0.0254, DIM.LENGTH), { unit: 'mm' })).toMatch(/^25\.4(0*) mm$/);
  });
  it('sig controls significant digits', () => {
    expect(formatQuantity(q(1234.5678, DIM.RESISTANCE), { sig: 6 })).toMatch(new RegExp(`^1\\.23457 k${OHM}$`));
    expect(formatQuantity(q(1234.5678, DIM.RESISTANCE), { sig: 3 })).toMatch(new RegExp(`^1\\.23 k${OHM}$`));
  });
  it('zero and negative values', () => {
    expect(formatQuantity(q(0, DIM.LENGTH))).toMatch(/^0(\.0*)? ?m?$/);
    expect(formatQuantity(q(-0.5, DIM.CURRENT))).toMatch(/^-500(\.0*)? mA$/);
  });
  it('never outputs NaN or Infinity even for forged non-finite quantities', () => {
    for (const si of [Number.NaN, Infinity, -Infinity]) {
      const forged = { si, dim: DIM.LENGTH };
      let text: string | undefined;
      try {
        text = formatQuantity(forged);
      } catch {
        text = undefined; // throwing is acceptable
      }
      if (text !== undefined) expect(text).not.toMatch(/NaN|Infinity/);
    }
  });
});
