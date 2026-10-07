/**
 * Phase 1 task 0: unit/locale parity test class. Targets the bug classes from the Saturn changelog
 * (docs/research/reference-systems-survey.md): "/1000 error for inches", "Temprise C vs F scale",
 * "comma as dp issues".
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, formatFor, fromUnit, parseQuantity, q, sameDim, toUnit, type Dim } from './index';

const MICRO = 'µ';
const DEG = '°';
const DELTA = 'Δ';

function relErr(actual: number, expected: number): number {
  if (expected === 0) return Math.abs(actual);
  return Math.abs(actual - expected) / Math.abs(expected);
}

function si(text: string, dim?: Dim): number {
  const r = dim === undefined ? parseQuantity(text) : parseQuantity(text, dim);
  if (!r.ok) throw new Error(`${text}: ${r.error.message}`);
  return r.value.si;
}

describe('imperial / metric parity', () => {
  it('100 mil = 2.54 mm, 1 in = 25.4 mm, 0.1 in = 100 mil, 1 mil = 25.4 um', () => {
    expect(relErr(si('100 mil'), si('2.54 mm'))).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('1 in'), si('25.4 mm'))).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('0.1 in'), si('100 mil'))).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('1 mil'), si(`25.4 ${MICRO}m`))).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('1 mil'), si('25.4 um'))).toBeLessThanOrEqual(1e-12);
  });
  it('no /1000 error: 0.001 in = 1 mil = 0.0254 mm, 1000 mil = 1 in', () => {
    expect(relErr(si('0.001 in'), si('1 mil'))).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('0.001 in'), si('0.0254 mm'))).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('1000 mil'), si('1 in'))).toBeLessThanOrEqual(1e-12);
  });
  it('aliases agree in every length spelling', () => {
    for (const u of ['mil', 'mils', 'thou']) expect(relErr(si(`7 ${u}`), 7 * 25.4e-6)).toBeLessThanOrEqual(1e-12);
    for (const u of [`${MICRO}m`, 'um', 'μm']) expect(relErr(si(`7 ${u}`), 7e-6)).toBeLessThanOrEqual(1e-12);
  });
  it('property: mil -> mm -> um -> in -> mil round trip within 1e-12', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-3, max: 1e5, noNaN: true }), (v) => {
        const x = fromUnit(v, 'mil');
        const mm = toUnit(x, 'mm');
        const um = toUnit(fromUnit(mm, 'mm'), 'um');
        const inch = toUnit(fromUnit(um, 'um'), 'in');
        const back = toUnit(fromUnit(inch, 'in'), 'mil');
        expect(relErr(back, v)).toBeLessThanOrEqual(1e-12);
        expect(relErr(mm, v * 0.0254)).toBeLessThanOrEqual(1e-12);
        expect(relErr(um, v * 25.4)).toBeLessThanOrEqual(1e-12);
        expect(relErr(inch, v / 1000)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
  it('property: parse(formatFor(length, mil prefs)) agrees with parse(formatFor(length, mm prefs))', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-5, max: 0.5, noNaN: true }), (v) => {
        const x = q(v, DIM.LENGTH);
        const a = si(formatFor(x, { prefs: { length: 'mil', temperature: 'C', area: 'mm2' } }), DIM.LENGTH);
        const b = si(formatFor(x, { prefs: { length: 'mm', temperature: 'C', area: 'mm2' } }), DIM.LENGTH);
        // G-1: geometry prints at fab resolution (mil 0.01, mm 0.001), so the bound is absolute, not 6 significant figures
        expect(Math.abs(a - v)).toBeLessThanOrEqual(0.5 * 0.01 * 25.4e-6 * (1 + 1e-9) + 1e-12 * v);
        expect(Math.abs(b - v)).toBeLessThanOrEqual(0.5 * 1e-6 * (1 + 1e-9) + 1e-12 * v);
      }),
    );
  });
  it('areas: 1 mil2 = (25.4 um)^2 and 1 in2 consistent with 1e6 mil2', () => {
    expect(relErr(si('1 mil2'), 25.4e-6 * 25.4e-6)).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('1000000 mil2'), 0.0254 * 0.0254)).toBeLessThanOrEqual(1e-12);
  });
});

describe('temperature rise vs absolute: C vs F scale parity', () => {
  const DT = DIM.TEMPERATURE_DIFFERENCE;
  const T = DIM.ABS_TEMPERATURE;
  it('18 degF rise = 10 K rise = 10 degC rise', () => {
    expect(relErr(si('18 °F', DT), 10)).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('10 K', DT), 10)).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('10 °C', DT), 10)).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('18 °F', DT), si('10 °C', DT))).toBeLessThanOrEqual(1e-12);
  });
  it('50 degF absolute = 10 degC absolute = 283.15 K', () => {
    expect(relErr(si('50 °F', T), 283.15)).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('10 °C', T), 283.15)).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('283.15 K', T), 283.15)).toBeLessThanOrEqual(1e-12);
  });
  it('the SAME text means different things in the two fields (absolute vs rise)', () => {
    expect(relErr(si('50 °F', T), 283.15)).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('50 °F', DT), 250 / 9)).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('25 °C', T), 298.15)).toBeLessThanOrEqual(1e-12);
    expect(relErr(si('25 °C', DT), 25)).toBeLessThanOrEqual(1e-12);
  });
  it('K rise and degC rise are equal for any value; never offset-converted', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e3, max: 1e3, noNaN: true }), (v) => {
        expect(si(`${String(v)} K`, DT)).toBe(si(`${String(v)} °C`, DT));
        expect(fromUnit(v, `${DELTA}${DEG}C`).si).toBe(v);
        expect(relErr(fromUnit(v, `${DELTA}${DEG}F`).si, (v * 5) / 9)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
  it('a zero rise in any scale is 0 K (no 32 or 273.15 offset leaks in)', () => {
    for (const u of ['K', '°C', '°F', 'degC', 'degF', `${DELTA}${DEG}F`]) {
      expect(si(`0 ${u}`, DT), u).toBe(0);
    }
    expect(fromUnit(0, `${DELTA}${DEG}F`).si).toBe(0);
  });
  it('degF <-> degC absolute conversion goes through K with offsets; delta units refuse absolute targets', () => {
    expect(toUnit(fromUnit(50, `${DEG}F`), `${DEG}C`)).toBeCloseTo(10, 10);
    expect(() => toUnit(fromUnit(10, `${DELTA}${DEG}C`), `${DEG}F`)).toThrow();
    expect(sameDim(fromUnit(10, `${DELTA}${DEG}C`), q(1, DT))).toBe(true);
  });
  it('formatFor shows the same rise in both scales consistently (10 K = 18 dF)', () => {
    const x = q(10, DT);
    expect(formatFor(x, { prefs: { length: 'mm', temperature: 'C', area: 'mm2' } })).toBe(`10 ${DELTA}${DEG}C`);
    expect(formatFor(x, { prefs: { length: 'mm', temperature: 'F', area: 'mm2' } })).toBe(`18 ${DELTA}${DEG}F`);
  });
});

describe('decimal separator: "." only, comma never accepted or emitted', () => {
  it('"0.254 mm" parses, "0,254 mm" is rejected with a decimal-comma message', () => {
    expect(relErr(si('0.254 mm'), 254e-6)).toBeLessThanOrEqual(1e-12);
    const r = parseQuantity('0,254 mm', DIM.LENGTH);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toMatch(/decimal comma/i);
      expect(r.error.message).toContain('0.254 mm');
    }
  });
  it('property: any decimal-comma spelling of a valid number is rejected, never read as a different number', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), fc.integer({ min: 1, max: 999 }), (a, b) => {
        for (const dim of [undefined, DIM.LENGTH]) {
          const text = `${String(a)},${String(b)} mm`;
          const r = dim === undefined ? parseQuantity(text) : parseQuantity(text, dim);
          expect(r.ok, text).toBe(false);
        }
      }),
    );
  });
  it('output never contains a comma or locale grouping, whatever the magnitude', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1e-9, max: 1e12, noNaN: true }),
        fc.constantFrom(DIM.LENGTH, DIM.RESISTANCE, DIM.AREA, DIM.CURRENT, DIM.POWER),
        (v, dim) => {
          expect(formatFor(q(v, dim))).not.toContain(',');
        },
      ),
    );
    expect(formatFor(q(1234.5, DIM.LENGTH))).toBe('1234500 mm');
  });
});
