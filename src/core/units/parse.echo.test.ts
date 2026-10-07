/**
 * Gate G-4: parseQuantityDetailed (plausibility warnings), describeParsed (parsed echo), and the fuzz contract.
 * Contract (all exported from ./index):
 *   parseQuantityDetailed(text, expectedDim?): { ok:true; value; warnings: string[] } | { ok:false; error: Error }
 *   describeParsed(q, expectedDim?, prefs?): string   // "= <formatFor value> (<field name>)"
 * Only substrings are asserted for describeParsed (display rounding is changing concurrently).
 */
import { describe, expect, it } from 'vitest';
import {
  DIM,
  describeParsed,
  parseQuantity,
  parseQuantityDetailed,
  q,
  type Dim,
} from './index';
import type { DisplayPrefs } from './display';

const MIL_PREFS: DisplayPrefs = { length: 'mil', temperature: 'C', area: 'mm2' };

function warnings(text: string, dim?: Dim): string[] {
  const r = dim === undefined ? parseQuantityDetailed(text) : parseQuantityDetailed(text, dim);
  expect(r.ok, `"${text}"`).toBe(true);
  return r.ok ? r.warnings : [];
}

describe('parseQuantityDetailed: component-marking warnings', () => {
  it('capacitance "MF" is flagged as megafarad, suggest uF', () => {
    for (const t of ['1 MF', '1MF', '10 MF']) {
      const w = warnings(t, DIM.CAPACITANCE).join(' | ');
      expect(w, t).toContain('megafarad');
      expect(w, t).toContain('uF');
    }
  });
  it('capacitance "1 mF" warns millifarad', () => {
    expect(warnings('1 mF', DIM.CAPACITANCE).join(' ')).toContain('millifarad');
  });
  it('resistance bare "1 m" warns milliohm', () => {
    expect(warnings('1 m', DIM.RESISTANCE).join(' ')).toContain('milliohm');
  });
  it('resistance "1 MΩ", "1 mΩ" explicit and "1500 mΩ" do not warn', () => {
    expect(warnings('1 MΩ', DIM.RESISTANCE)).toEqual([]);
    expect(warnings('1 mΩ', DIM.RESISTANCE)).toEqual([]);
    expect(warnings('1500 mΩ', DIM.RESISTANCE)).toEqual([]);
  });
  it('voltage >= 1 kV warns "kilovolts: check"', () => {
    expect(warnings('1 kV', DIM.VOLTAGE).join(' ')).toContain('kilovolts: check');
    expect(warnings('5 kV', DIM.VOLTAGE).join(' ')).toContain('kilovolts: check');
    expect(warnings('999 V', DIM.VOLTAGE)).toEqual([]);
  });
  it('length > 1 m warns "longer than 1 m"', () => {
    expect(warnings('2 m', DIM.LENGTH).join(' ')).toContain('longer than 1 m');
    expect(warnings('1500 mm', DIM.LENGTH).join(' ')).toContain('longer than 1 m');
    expect(warnings('999 mm', DIM.LENGTH)).toEqual([]);
  });
  it('current > 1000 A warns', () => {
    expect(warnings('2000 A', DIM.CURRENT).length).toBeGreaterThan(0);
    expect(warnings('1000 A', DIM.CURRENT)).toEqual([]);
  });
  it('resistivity outside 1e-9..1e-3 ohm.m warns "unusual resistivity"', () => {
    expect(warnings('1 Ω·m', DIM.RESISTIVITY).join(' ')).toContain('unusual resistivity');
    expect(warnings('1e-12 Ω·m', DIM.RESISTIVITY).join(' ')).toContain('unusual resistivity');
    expect(warnings('1.72e-8 Ω·m', DIM.RESISTIVITY)).toEqual([]);
    expect(warnings('1.72 µΩ·cm', DIM.RESISTIVITY)).toEqual([]);
  });
  it('a corpus of 40 typical inputs gives no warnings', () => {
    const corpus: Array<[string, Dim]> = [
      ['10 mil', DIM.LENGTH], ['0.3 mm', DIM.LENGTH], ['35 um', DIM.LENGTH], ['1.6 mm', DIM.LENGTH], ['100 mm', DIM.LENGTH],
      ['0.5 oz', DIM.AREAL_MASS], ['1 oz', DIM.AREAL_MASS], ['2 oz', DIM.AREAL_MASS],
      ['10 K', DIM.TEMPERATURE_DIFFERENCE], ['20 °C', DIM.TEMPERATURE_DIFFERENCE], ['25 °C', DIM.ABS_TEMPERATURE], ['85 °C', DIM.ABS_TEMPERATURE],
      ['4k7', DIM.RESISTANCE], ['10k', DIM.RESISTANCE], ['100 Ω', DIM.RESISTANCE], ['1 MΩ', DIM.RESISTANCE], ['0.47 Ω', DIM.RESISTANCE], ['10 mΩ', DIM.RESISTANCE],
      ['100 nF', DIM.CAPACITANCE], ['10 uF', DIM.CAPACITANCE], ['4n7', DIM.CAPACITANCE], ['22 pF', DIM.CAPACITANCE],
      ['2.2 uH', DIM.INDUCTANCE], ['100 nH', DIM.INDUCTANCE], ['10 uH', DIM.INDUCTANCE],
      ['3.3 V', DIM.VOLTAGE], ['12 V', DIM.VOLTAGE], ['48 V', DIM.VOLTAGE], ['500 mV', DIM.VOLTAGE], ['400 V', DIM.VOLTAGE],
      ['1 A', DIM.CURRENT], ['10 A', DIM.CURRENT], ['250 mA', DIM.CURRENT], ['35 A', DIM.CURRENT],
      ['100 MHz', DIM.FREQUENCY], ['500 kHz', DIM.FREQUENCY], ['2.4 GHz', DIM.FREQUENCY],
      ['1 W', DIM.POWER], ['250 mW', DIM.POWER], ['5 %', DIM.DIMENSIONLESS],
    ];
    expect(corpus.length).toBe(40);
    for (const [t, d] of corpus) {
      const r = parseQuantityDetailed(t, d);
      expect(r.ok, t).toBe(true);
      if (r.ok) expect(r.warnings, t).toEqual([]);
    }
  });
  it('parseQuantity itself still returns the plain result with no warnings field', () => {
    const r = parseQuantity('1 MF', DIM.CAPACITANCE);
    expect(r.ok).toBe(true);
    expect('warnings' in r).toBe(false);
  });
  it('failure carries an error like parseQuantity', () => {
    const r = parseQuantityDetailed('10 M', DIM.LENGTH);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/bare prefix/i);
  });
});

describe('parseQuantityDetailed == parseQuantity for every previously-valid input (corpus)', () => {
  const corpus: Array<[string, Dim | undefined]> = [
    ['10mil', undefined], ['0.3 mm', DIM.LENGTH], ['2.2uF', undefined], ['100nH', undefined], ['10MHz', undefined],
    ['4k7', DIM.RESISTANCE], ['1.5k', DIM.RESISTANCE], ['1 m', DIM.RESISTANCE], ['1MF', DIM.CAPACITANCE], ['5 kV', DIM.VOLTAGE],
    ['2 m', DIM.LENGTH], ['10 K', DIM.TEMPERATURE_DIFFERENCE], ['25 °C', DIM.ABS_TEMPERATURE], ['1 oz', DIM.AREAL_MASS],
    ['5 %', DIM.DIMENSIONLESS], ['0.05', DIM.DIMENSIONLESS], ['3930 ppm/K', DIM.PER_KELVIN], ['1.72 µΩ·cm', DIM.RESISTIVITY],
    ['2000 A', DIM.CURRENT], ['1 Ω·m', DIM.RESISTIVITY], ['4n7', DIM.CAPACITANCE], ['10 M', DIM.FREQUENCY], ['  7 mm ', DIM.LENGTH],
  ];
  it('same ok flag, same SI value and dimension', () => {
    for (const [t, d] of corpus) {
      const a = d === undefined ? parseQuantity(t) : parseQuantity(t, d);
      const b = d === undefined ? parseQuantityDetailed(t) : parseQuantityDetailed(t, d);
      expect(b.ok, t).toBe(a.ok);
      if (a.ok && b.ok) {
        expect(b.value.si, t).toBe(a.value.si);
        expect(b.value.dim, t).toEqual(a.value.dim);
      }
    }
  });
});

describe('describeParsed: parsed echo', () => {
  it('starts with "= " and names the field', () => {
    const s = describeParsed(q(1e-3, DIM.RESISTANCE), DIM.RESISTANCE);
    expect(s.startsWith('= ')).toBe(true);
    expect(s).toContain('1 mΩ');
    expect(s.toLowerCase()).toContain('resistance');
  });
  it('temperature rise', () => {
    const s = describeParsed(q(10, DIM.TEMPERATURE_DIFFERENCE), DIM.TEMPERATURE_DIFFERENCE);
    expect(s).toContain('10 Δ°C');
    expect(s.toLowerCase()).toContain('temperature rise');
  });
  it('absolute temperature', () => {
    const s = describeParsed(q(298.15, DIM.ABS_TEMPERATURE), DIM.ABS_TEMPERATURE);
    expect(s).toContain('25 °C');
    expect(s.toLowerCase()).toContain('absolute temperature');
  });
  it('length in mm and in mil', () => {
    const l = q(254e-6, DIM.LENGTH);
    const s = describeParsed(l, DIM.LENGTH);
    expect(s).toContain('0.254 mm');
    expect(s.toLowerCase()).toContain('length');
    expect(describeParsed(l, DIM.LENGTH, MIL_PREFS)).toContain('10 mil');
  });
  it('copper weight', () => {
    const r = parseQuantity('1 oz', DIM.AREAL_MASS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = describeParsed(r.value, DIM.AREAL_MASS);
      expect(s).toContain('oz/ft²');
      expect(s.toLowerCase()).toContain('copper weight');
    }
  });
  it('dimensionless ratio as percent', () => {
    const s = describeParsed(q(0.05, DIM.DIMENSIONLESS), DIM.DIMENSIONLESS);
    expect(s).toContain('5 %');
    expect(s.toLowerCase()).toContain('ratio');
  });
  it('never NaN and never throws, also for other/unknown dims and no expectedDim', () => {
    const dims: Array<Dim | undefined> = [undefined, ...Object.values(DIM)];
    for (const d of dims) {
      const x = q(1.234, d ?? DIM.DENSITY);
      let s = '';
      expect(() => {
        s = describeParsed(x, d);
      }).not.toThrow();
      expect(s).not.toMatch(/NaN|Infinity|undefined/);
      expect(s.length).toBeGreaterThan(0);
    }
    expect(() => describeParsed(q(5, DIM.DENSITY))).not.toThrow();
    expect(() => describeParsed(q(5, DIM.DENSITY), DIM.LENGTH)).not.toThrow();
  });
});

describe('fuzz: 20 000 random strings through parseQuantity and parseQuantityDetailed', () => {
  it('never throws, never NaN/Infinity, ok flags agree for every expectedDim', () => {
    let s = 20240607;
    const rnd = (): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
    const nums = ['0', '1', '10', '0.5', '35', '1e308', '1e400', '1e-400', '9e999', '-1', '+2', '.5', '5.', '1e+3', '٣', '１０', '1,5', '1 000', 'NaN', 'Infinity', '0x10'];
    const units = ['', 'mm', 'mil', 'm', 'M', 'k', 'K', 'u', 'µ', 'μ', 'n', 'p', 'G', 'Ω', 'Ω', 'ohm', 'kΩ', 'KΩ', 'MΩ', 'mΩ', 'F', 'MF', 'mF', 'uF', 'oz', 'oz/ft²', '°C', 'K', 'Δ°C', '%', '/K', 'ppm/K', 'A/mm2', 'K/W',
      'Ω·m', 'µΩ·cm', 'ℓ', 'ｍｍ', 'mm²', 'ˢ', '½', '1/2 oz', '​', ' ', 'Ом', 'А', '°С', 'V', 'kV', 'Hz', 'W', 'H', 'A'];
    const junk = ['', ' ', '  ', '\t', '4k7', '4R7', 'R47', '1M2', '4n7', '--', 'e', 'E', '\u0000', '😀', '﹣'];
    const dims: Array<Dim | undefined> = [undefined, ...Object.values(DIM)];
    const ok: boolean[] = [];
    for (let i = 0; i < 20000; i++) {
      const text = `${pick(junk)}${pick(nums)}${pick([' ', '', '  ', ' '])}${pick(units)}${rnd() < 0.2 ? pick(junk) : ''}`;
      for (let k = 0; k < 2; k++) {
        const d = pick(dims);
        const a = d === undefined ? parseQuantity(text) : parseQuantity(text, d);
        const b = d === undefined ? parseQuantityDetailed(text) : parseQuantityDetailed(text, d);
        expect(b.ok, `ok mismatch for ${JSON.stringify(text)}`).toBe(a.ok);
        if (a.ok) {
          expect(Number.isFinite(a.value.si), text).toBe(true);
        }
        if (b.ok) {
          expect(Number.isFinite(b.value.si), text).toBe(true);
          expect(Array.isArray(b.warnings)).toBe(true);
        } else {
          expect(b.error).toBeInstanceOf(Error);
        }
        ok.push(a.ok);
      }
    }
    expect(ok.some(Boolean)).toBe(true);
    expect(ok.some((v) => !v)).toBe(true);
  });
  it('random raw unicode strings never throw', () => {
    let s = 7;
    const rnd = (): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 2000; i++) {
      const len = Math.floor(rnd() * 12);
      let t = '';
      for (let j = 0; j < len; j++) t += String.fromCodePoint(Math.floor(rnd() * 0x2fff) + 1);
      for (const d of [undefined, DIM.LENGTH, DIM.RESISTANCE, DIM.DIMENSIONLESS]) {
        expect(() => (d === undefined ? parseQuantityDetailed(t) : parseQuantityDetailed(t, d))).not.toThrow();
      }
    }
  });
});
