/**
 * Gate G-1: formatDual(q, { prefs?, round?, accuracyClass? }).
 * LENGTH -> "<mm> (<mil>)", AREA -> "<mm2> (<mil2>)", each part rounded independently from the SI value in the
 * requested direction (never mil converted from the printed mm). Prefs do not change the pair. Any other
 * dimension returns exactly formatFor(q, opts).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, formatDual, formatFor, parseQuantity, q, type Dim, type DisplayPrefs } from './index';

const SQ = '²';
const MM: DisplayPrefs = { length: 'mm', temperature: 'C', area: 'mm2' };
const MIL: DisplayPrefs = { length: 'mil', temperature: 'F', area: 'mil2' };
const UM_K: DisplayPrefs = { length: 'um', temperature: 'K', area: 'mm2' };

describe('formatDual: length', () => {
  it('0.254 mm (10 mil)', () => {
    expect(formatDual(q(0.254e-3, DIM.LENGTH))).toBe('0.254 mm (10 mil)');
    expect(formatDual(q(0.254e-3, DIM.LENGTH), { round: 'up' })).toBe('0.254 mm (10 mil)');
  });
  it('parts are rounded independently from SI, in the given direction', () => {
    const x = q(1.1491e-3, DIM.LENGTH); // 45.2402 mil
    expect(formatDual(x, { round: 'up' })).toBe('1.15 mm (45.25 mil)');
    expect(formatDual(x, { round: 'down' })).toBe('1.149 mm (45.24 mil)');
    expect(formatDual(x, { round: 'nearest' })).toBe('1.149 mm (45.24 mil)');
  });
  it('independence: mil is not derived from the printed mm', () => {
    const x = q(0.2541e-3, DIM.LENGTH); // 10.00394 mil
    // printed mm 'up' is 0.255 mm = 10.0394 mil; the mil part must still be 10.01
    expect(formatDual(x, { round: 'up' })).toBe('0.255 mm (10.01 mil)');
    expect(formatDual(x, { round: 'down' })).toBe('0.254 mm (10 mil)');
  });
  it('prefs do not change the pair; accuracy class does not limit geometry', () => {
    const x = q(1.1491e-3, DIM.LENGTH);
    for (const prefs of [MM, MIL, UM_K]) {
      expect(formatDual(x, { prefs, round: 'up', accuracyClass: 'estimate' })).toBe('1.15 mm (45.25 mil)');
    }
  });
  it('property: both parts honour the direction against the SI value', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-7, max: 1e3, noNaN: true }), fc.constantFrom('up', 'down', 'nearest' as const), (v, round) => {
        const text = formatDual(q(v, DIM.LENGTH), { round });
        const m = /^(\S+ \S+) \((\S+ \S+)\)$/.exec(text);
        expect(m, text).not.toBeNull();
        const parts = [m?.[1] ?? '', m?.[2] ?? ''];
        for (const p of parts) {
          const r = parseQuantity(p, DIM.LENGTH);
          expect(r.ok, p).toBe(true);
          if (r.ok && round === 'up') expect(r.value.si >= v, `${text} up`).toBe(true);
          if (r.ok && round === 'down') expect(r.value.si <= v, `${text} down`).toBe(true);
        }
      }),
    );
  });
});

describe('formatDual: area', () => {
  it('mm2 (mil2), independent parts, directional', () => {
    const x = q(1e-6, DIM.AREA); // 1 mm2 = 1550.0031 mil2
    expect(formatDual(x, { round: 'nearest' })).toBe(`1 mm${SQ} (1550 mil${SQ})`);
    expect(formatDual(x, { round: 'down' })).toBe(`1 mm${SQ} (1550 mil${SQ})`);
    expect(formatDual(x, { round: 'up' })).toBe(`1 mm${SQ} (1550.01 mil${SQ})`);
  });
  it('prefs do not change the pair', () => {
    const x = q(8.891e-9, DIM.AREA);
    for (const prefs of [MM, MIL]) expect(formatDual(x, { prefs, round: 'up' })).toBe(formatDual(x, { round: 'up' }));
  });
});

describe('formatDual: any other dimension equals formatFor', () => {
  const CURRENT_DENSITY = (DIM as unknown as Record<string, Dim>).CURRENT_DENSITY as Dim;
  const CASES: Array<[Dim, number]> = [
    [DIM.CURRENT, 2.96],
    [DIM.VOLTAGE, 0.4949],
    [DIM.RESISTANCE, 999.9996],
    [DIM.ABS_TEMPERATURE, 377.19],
    [DIM.TEMPERATURE_DIFFERENCE, 10.04],
    [DIM.AREAL_MASS, 0.30515172727],
    [CURRENT_DENSITY, 2e6],
    [DIM.DIMENSIONLESS, 0.25],
  ];
  it('identical output for every direction, class and pref set', () => {
    for (const [dim, v] of CASES) {
      for (const round of ['up', 'down', 'nearest'] as const) {
        for (const prefs of [MM, MIL, UM_K]) {
          for (const accuracyClass of [undefined, 'estimate', 'analytical'] as const) {
            const opts = accuracyClass === undefined ? { prefs, round } : { prefs, round, accuracyClass };
            expect(formatDual(q(v, dim), opts)).toBe(formatFor(q(v, dim), opts));
          }
        }
      }
    }
  });
  it('options are optional', () => {
    expect(formatDual(q(3.3, DIM.VOLTAGE))).toBe('3.3 V');
  });
});
