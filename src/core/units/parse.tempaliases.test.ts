import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DIM, type Dim } from './dim';
import { formatFor } from './display';
import { parseQuantity } from './parse';
import { BASELINE } from './parse.tempaliases.baseline';

const ABS = DIM.ABS_TEMPERATURE;
const DT = DIM.TEMPERATURE_DIFFERENCE;

function si(text: string, dim?: Dim): number {
  const r = parseQuantity(text, dim);
  if (!r.ok) throw r.error;
  return r.value.si;
}
function err(text: string, dim?: Dim): string {
  const r = parseQuantity(text, dim);
  if (r.ok) throw new Error(`expected rejection of "${text}"`);
  return r.error.message;
}

describe('bare C / F in temperature fields', () => {
  it.each([
    ['10 C', DT, 10],
    ['10C', DT, 10],
    ['18 F', DT, 10],
    ['18F', DT, 10],
    ['0 C', DT, 0],
    ['10 C', ABS, 283.15],
    ['10C', ABS, 283.15],
    ['0 C', ABS, 273.15],
    ['32 F', ABS, 273.15],
    ['212F', ABS, 373.15],
    ['-40 C', ABS, 233.15],
    ['-40 F', ABS, 233.15],
  ])('accepts %s in %#', (t, dim, k) => {
    expect(si(t, dim)).toBeCloseTo(k, 9);
  });

  it('matches the explicit spellings exactly (decimal-exact path kept)', () => {
    for (const v of ['0.1', '25', '37.7', '-12.3', '100', '1e1']) {
      expect(si(`${v} C`, ABS)).toBe(si(`${v} °C`, ABS));
      expect(si(`${v}F`, ABS)).toBe(si(`${v} °F`, ABS));
      expect(si(`${v} C`, DT)).toBe(si(`${v} Δ°C`, DT));
      expect(si(`${v} F`, DT)).toBe(si(`${v} Δ°F`, DT));
      expect(si(`${v} C`, DT)).toBe(si(`${v} degC`, DT));
    }
  });

  it('delta semantics: a rise has no offset, absolute has', () => {
    expect(si('10 C', DT)).toBe(10);
    expect(si('10 C', ABS)).not.toBe(10);
    expect(si('9 F', DT)).toBe(5);
  });

  it('rejects below absolute zero', () => {
    expect(() => si('-300 C', ABS)).toThrow(/absolute zero/);
    expect(() => si('-500 F', ABS)).toThrow(/absolute zero/);
    expect(si('-300 C', DT)).toBe(-300); // a fall of 300 K is fine
  });

  it('round trips through formatFor', () => {
    for (const t of ['25 C', '85C', '-40 C', '100 F']) {
      const a = parseQuantity(t, ABS);
      if (!a.ok) throw a.error;
      const back = parseQuantity(formatFor(a.value), ABS);
      expect(back.ok).toBe(true);
      if (back.ok) expect(back.value.si).toBeCloseTo(a.value.si, 1);
    }
    const d = parseQuantity('30 C', DT);
    if (!d.ok) throw d.error;
    const back = parseQuantity(formatFor(d.value), DT);
    expect(back.ok && Math.abs(back.value.si - 30) < 1e-6).toBe(true);
  });
});

describe('rejected / unchanged', () => {
  it.each([
    ['10 c', ABS],
    ['10c', DT],
    ['10 f', ABS],
    ['10f', DT],
    ['10 c', undefined],
    ['10 f', undefined],
    ['10 C', undefined],
    ['10 C', DIM.LENGTH],
    ['10 C', DIM.RESISTANCE],
    ['10 F', DIM.LENGTH],
    ['10 F', DIM.VOLTAGE],
  ])('%s with field %#', (t, dim) => {
    expect(parseQuantity(t, dim).ok).toBe(false);
  });

  it('no field: error names the field needed and suggests °C/degC', () => {
    const m = err('5 C');
    expect(m).toMatch(/needs a field|field/i);
    expect(m).toContain('°C');
    expect(m).toContain('degC');
    expect(si('5 F')).toBe(5); // no field: F stays farad
  });

  it('capacitance 10 F stays 10 farad; K unchanged', () => {
    expect(si('10 F', DIM.CAPACITANCE)).toBe(10);
    expect(si('10 F')).toBe(10);
    expect(si('300 K', ABS)).toBe(300);
    expect(si('10 K', DT)).toBe(10);
  });
});

const CORPUS: ReadonlyArray<readonly [string, Dim | undefined]> = (() => {
  const out: Array<readonly [string, Dim | undefined]> = [];
  const fields: ReadonlyArray<readonly [Dim | undefined, readonly string[]]> = [
    [DIM.CAPACITANCE, ['F', 'mF', 'uF', 'µF', 'nF', 'pF']],
    [DIM.LENGTH, ['mm', 'mil', 'um', 'in', 'cm', 'm']],
    [DIM.RESISTANCE, ['ohm', 'Ω', 'kΩ', 'mΩ', 'MΩ']],
    [DIM.CURRENT, ['A', 'mA', 'uA']],
    [DIM.VOLTAGE, ['V', 'mV', 'kV']],
    [DIM.FREQUENCY, ['Hz', 'kHz', 'MHz']],
    [DIM.INDUCTANCE, ['H', 'mH', 'uH', 'nH']],
    [DIM.POWER, ['W', 'mW', 'kW']],
    [undefined, ['mm', 'F', 'V', 'A', 'K', '°C', '°F', 'Hz']],
    [ABS, ['K', '°C', '°F', 'degC']],
    [DT, ['K', '°C', '°F', 'ΔK', 'degF']],
  ];
  const nums = ['1', '2.5', '10', '0.047', '100', '33', '4.7'];
  for (const [dim, units] of fields) {
    for (const u of units) for (const n of nums) out.push([`${n} ${u}`, dim]);
  }
  return out;
})();

describe('no other behaviour changes', () => {
  it('corpus of 300+ inputs is large enough', () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(300);
  });
  it('previously valid inputs parse identically with and without the alias path', () => {
    // Reference: the explicit spelling table. Inputs contain no bare C/F in temperature fields, so values must be pinned.
    for (const [t, dim] of CORPUS) {
      const r = parseQuantity(t, dim);
      if (!r.ok) continue; // only previously-valid ones matter
      const r2 = parseQuantity(` ${t}  `, dim);
      expect(r2.ok && r2.value.si === r.value.si).toBe(true);
      expect(Number.isFinite(r.value.si)).toBe(true);
    }
    // baseline recorded from the pre-change parser (value or error message per corpus entry)
    const now = CORPUS.map(([t, dim]) => {
      const r = parseQuantity(t, dim);
      return r.ok ? r.value.si : r.error.message;
    });
    expect(now).toEqual(BASELINE);
    // pinned values
    expect(si('2.5 mF', DIM.CAPACITANCE)).toBe(0.0025);
    expect(si('100 uF', DIM.CAPACITANCE)).toBeCloseTo(1e-4, 18);
    expect(si('10 °C', ABS)).toBeCloseTo(283.15, 9);
    expect(si('10 °C', DT)).toBe(10);
  });
  it('bare C/F outside temperature fields never become valid', () => {
    const others: Dim[] = [DIM.LENGTH, DIM.RESISTANCE, DIM.CURRENT, DIM.VOLTAGE, DIM.FREQUENCY, DIM.INDUCTANCE, DIM.POWER, DIM.AREA];
    for (const d of others) expect(parseQuantity('3 C', d).ok).toBe(false);
    expect(parseQuantity('3 F', DIM.LENGTH).ok).toBe(false);
  });
});

describe('fuzz', () => {
  it('never throws, never NaN', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.double({ noNaN: false }), fc.integer()),
        fc.constantFrom('C', 'F', 'c', 'f', ' C', 'K', 'degC', '°C', ''),
        fc.constantFrom(ABS, DT, undefined),
        (n, u, dim) => {
          const r = parseQuantity(`${String(n)}${u}`, dim);
          if (r.ok) expect(Number.isFinite(r.value.si)).toBe(true);
          else expect(r.error).toBeInstanceOf(Error);
        },
      ),
      { numRuns: 500 },
    );
  });
});
