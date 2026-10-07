/**
 * Gate G-1 (finding D-1): directional display rounding and fab-resolution geometry.
 * Contract (src/core/units/display.ts, exported from ./index):
 *   type RoundDirection = 'up' | 'down' | 'nearest'
 *   formatFor(q, { prefs?, accuracyClass?, unit?, round?: RoundDirection })   // default 'nearest'
 *   roundDirectionFor(bound: 'min-requirement' | 'max-capacity' | 'nominal' | 'prediction'): RoundDirection
 * 'up': parseQuantity(printed) >= SI value; 'down': <= SI value, exactly (no tolerance). For negative values
 * 'up' means toward +Infinity. Applies to every dimension and every prefix path, including prefix roll-over.
 * Fixed decimals (trailing zeros trimmed): LENGTH mm 3, mil 2, um 1; AREA mm2 4, mil2 2;
 * absolute temperature and delta-T 1 (any scale). All other dimensions keep sigFigsFor(accuracyClass), default 6.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DIM,
  formatFor,
  parseQuantity,
  q,
  roundDirectionFor,
  sigFigsFor,
  type AccuracyClass,
  type Dim,
  type DisplayPrefs,
  type RoundDirection,
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
const CLASSES: Array<AccuracyClass | undefined> = [undefined, 'exact', 'analytical', 'empirical', 'estimate'];
const DIRECTIONS: RoundDirection[] = ['up', 'down', 'nearest'];

describe('roundDirectionFor', () => {
  it('minimum requirements and predicted stresses round up, capacities down, nominal to nearest', () => {
    expect(roundDirectionFor('min-requirement')).toBe('up');
    expect(roundDirectionFor('max-capacity')).toBe('down');
    expect(roundDirectionFor('nominal')).toBe('nearest');
    expect(roundDirectionFor('prediction')).toBe('up');
  });
});

describe('geometry prints at fab resolution (fixed decimals), directional', () => {
  it('LENGTH in mm: 3 decimals, trailing zeros trimmed', () => {
    expect(formatFor(q(1.149e-3, DIM.LENGTH), { prefs: MM, round: 'up' })).toBe('1.149 mm');
    expect(formatFor(q(1.1491e-3, DIM.LENGTH), { prefs: MM, round: 'up' })).toBe('1.15 mm');
    expect(formatFor(q(1.1499e-3, DIM.LENGTH), { prefs: MM, round: 'down' })).toBe('1.149 mm');
    expect(formatFor(q(1.1499e-3, DIM.LENGTH), { prefs: MM, round: 'nearest' })).toBe('1.15 mm');
    expect(formatFor(q(0.254e-3, DIM.LENGTH), { prefs: MM })).toBe('0.254 mm');
  });
  it('the headline D-1 case: a 1.149 mm requirement is never shown as 1.1 mm, whatever the accuracy class', () => {
    for (const acc of CLASSES) {
      const opts = acc === undefined ? { prefs: MM, round: 'up' as const } : { prefs: MM, round: 'up' as const, accuracyClass: acc };
      expect(formatFor(q(1.149e-3, DIM.LENGTH), opts)).toBe('1.149 mm');
      expect(formatFor(q(0.254e-3, DIM.LENGTH), opts)).toBe('0.254 mm');
    }
  });
  it('LENGTH in mil: 2 decimals', () => {
    expect(formatFor(q(254e-6, DIM.LENGTH), { prefs: MIL })).toBe('10 mil');
    expect(formatFor(q(0.254e-3, DIM.LENGTH), { prefs: MIL, round: 'nearest' })).toBe('10 mil');
    expect(formatFor(q(0.2541e-3, DIM.LENGTH), { prefs: MIL, round: 'up' })).toBe('10.01 mil');
    expect(formatFor(q(0.2541e-3, DIM.LENGTH), { prefs: MIL, round: 'down' })).toBe('10 mil');
    expect(formatFor(q(0.2541e-3, DIM.LENGTH), { prefs: MIL, round: 'nearest' })).toBe('10 mil');
  });
  it('LENGTH in um: 1 decimal', () => {
    const w = q(35.04e-6, DIM.LENGTH);
    expect(formatFor(w, { prefs: UM_K, round: 'nearest' })).toBe(`35 ${MICRO}m`);
    expect(formatFor(w, { prefs: UM_K, round: 'up' })).toBe(`35.1 ${MICRO}m`);
    expect(formatFor(w, { prefs: UM_K, round: 'down' })).toBe(`35 ${MICRO}m`);
  });
  it('accuracy class no longer limits geometry digits: 0.0314 m in mil prints 1236.22 mil', () => {
    expect(formatFor(q(0.0314, DIM.LENGTH), { unit: 'mil', accuracyClass: 'empirical' })).toBe('1236.22 mil');
    expect(formatFor(q(0.0314, DIM.LENGTH), { prefs: MIL, accuracyClass: 'estimate' })).toBe('1236.22 mil');
  });
  it('AREA: mm2 4 decimals, mil2 2 decimals', () => {
    const a = q(8.891e-9, DIM.AREA); // 0.008891 mm2
    expect(formatFor(a, { prefs: MM, round: 'nearest' })).toBe(`0.0089 mm${SQ}`);
    expect(formatFor(a, { prefs: MM, round: 'up' })).toBe(`0.0089 mm${SQ}`);
    expect(formatFor(a, { prefs: MM, round: 'down' })).toBe(`0.0088 mm${SQ}`);
    const b = q(1e-9, DIM.AREA); // 1.5500031 mil2
    expect(formatFor(b, { prefs: MIL, round: 'nearest' })).toBe(`1.55 mil${SQ}`);
    expect(formatFor(b, { prefs: MIL, round: 'up' })).toBe(`1.56 mil${SQ}`);
    expect(formatFor(b, { prefs: MIL, round: 'down' })).toBe(`1.55 mil${SQ}`);
  });
});

describe('temperature prints 1 decimal (trimmed), directional', () => {
  const T = q(377.19, DIM.ABS_TEMPERATURE); // 104.04 C, 219.272 F
  it('Celsius', () => {
    expect(formatFor(q(377.15, DIM.ABS_TEMPERATURE), { prefs: MM })).toBe(`104 ${DEG}C`);
    expect(formatFor(T, { prefs: MM, round: 'nearest' })).toBe(`104 ${DEG}C`);
    expect(formatFor(T, { prefs: MM, round: 'up' })).toBe(`104.1 ${DEG}C`);
    expect(formatFor(T, { prefs: MM, round: 'down' })).toBe(`104 ${DEG}C`);
    expect(formatFor(q(377.21, DIM.ABS_TEMPERATURE), { prefs: MM, round: 'nearest' })).toBe(`104.1 ${DEG}C`);
    expect(formatFor(q(377.21, DIM.ABS_TEMPERATURE), { prefs: MM, round: 'down' })).toBe(`104 ${DEG}C`);
  });
  it('Fahrenheit and Kelvin', () => {
    expect(formatFor(T, { prefs: MIL, round: 'nearest' })).toBe(`219.3 ${DEG}F`);
    expect(formatFor(T, { prefs: MIL, round: 'up' })).toBe(`219.3 ${DEG}F`);
    expect(formatFor(T, { prefs: MIL, round: 'down' })).toBe(`219.2 ${DEG}F`);
    expect(formatFor(T, { prefs: UM_K, round: 'nearest' })).toBe('377.2 K');
    expect(formatFor(T, { prefs: UM_K, round: 'up' })).toBe('377.2 K');
    expect(formatFor(T, { prefs: UM_K, round: 'down' })).toBe('377.1 K');
  });
  it('a predicted 104.04 C is never shown as 100 C, whatever the accuracy class', () => {
    for (const acc of CLASSES) {
      const opts = acc === undefined ? { prefs: MM, round: 'up' as const } : { prefs: MM, round: 'up' as const, accuracyClass: acc };
      expect(formatFor(T, opts)).toBe(`104.1 ${DEG}C`);
    }
  });
  it('temperature difference: 1 decimal with delta', () => {
    const d = q(10.04, DIM.TEMPERATURE_DIFFERENCE);
    expect(formatFor(d, { prefs: MM, round: 'nearest' })).toBe(`10 ${DELTA}${DEG}C`);
    expect(formatFor(d, { prefs: MM, round: 'up' })).toBe(`10.1 ${DELTA}${DEG}C`);
    expect(formatFor(d, { prefs: MM, round: 'down' })).toBe(`10 ${DELTA}${DEG}C`);
    expect(formatFor(d, { prefs: UM_K, round: 'up' })).toBe(`10.1 ${DELTA}K`);
  });
});

describe('non-geometry dimensions keep class significant figures, now directional', () => {
  it('2.96 A estimate', () => {
    const i = q(2.96, DIM.CURRENT);
    expect(formatFor(i, { accuracyClass: 'estimate', round: 'nearest' })).toBe('3 A');
    expect(formatFor(i, { accuracyClass: 'estimate', round: 'up' })).toBe('3 A');
    expect(formatFor(i, { accuracyClass: 'estimate', round: 'down' })).toBe('2.9 A');
  });
  it('0.4949 V estimate (2 sf)', () => {
    const v = q(0.4949, DIM.VOLTAGE);
    expect(formatFor(v, { accuracyClass: 'estimate', round: 'nearest' })).toBe('490 mV');
    expect(formatFor(v, { accuracyClass: 'estimate', round: 'down' })).toBe('490 mV');
    expect(formatFor(v, { accuracyClass: 'estimate', round: 'up' })).toBe('500 mV');
  });
  it('1234.5678 ohm estimate', () => {
    const r = q(1234.5678, DIM.RESISTANCE);
    expect(formatFor(r, { accuracyClass: 'estimate', round: 'up' })).toBe(`1.3 k${OHM}`);
    expect(formatFor(r, { accuracyClass: 'estimate', round: 'down' })).toBe(`1.2 k${OHM}`);
  });
  it('negative values: up means toward +infinity', () => {
    const i = q(-2.96, DIM.CURRENT);
    expect(formatFor(i, { accuracyClass: 'estimate', round: 'up' })).toBe('-2.9 A');
    expect(formatFor(i, { accuracyClass: 'estimate', round: 'down' })).toBe('-3 A');
  });
  it('zero prints as zero in every direction', () => {
    for (const round of DIRECTIONS) expect(formatFor(q(0, DIM.VOLTAGE), { round })).toBe('0 V');
  });
});

describe('prefix roll-over under direction', () => {
  const x = q(999.9996, DIM.RESISTANCE);
  it("'down' never rolls over to 1 kohm (it must not exceed the SI value)", () => {
    expect(formatFor(x, { round: 'down' })).toBe(`999.999 ${OHM}`);
    expect(formatFor(x, { round: 'down', accuracyClass: 'analytical' })).toBe(`999.9 ${OHM}`);
    expect(formatFor(x, { round: 'down', accuracyClass: 'empirical' })).toBe(`999 ${OHM}`);
    expect(formatFor(x, { round: 'down', accuracyClass: 'estimate' })).toBe(`990 ${OHM}`);
  });
  it("'up' may roll over", () => {
    for (const acc of CLASSES) {
      expect(formatFor(x, acc === undefined ? { round: 'up' } : { round: 'up', accuracyClass: acc })).toBe(`1 k${OHM}`);
    }
  });
  it("'nearest' rolls over as before", () => {
    for (const acc of CLASSES) {
      expect(formatFor(x, acc === undefined ? {} : { accuracyClass: acc })).toBe(`1 k${OHM}`);
      expect(formatFor(x, acc === undefined ? { round: 'nearest' } : { round: 'nearest', accuracyClass: acc })).toBe(`1 k${OHM}`);
    }
  });
  it('geometry roll-over: 0.9999996 mm', () => {
    const l = q(0.9999996e-3, DIM.LENGTH);
    expect(formatFor(l, { prefs: MM, round: 'down' })).toBe('0.999 mm');
    expect(formatFor(l, { prefs: MM, round: 'up' })).toBe('1 mm');
  });
});

describe('no regression of the old nearest behaviour', () => {
  it('sigFigsFor', () => {
    expect([sigFigsFor('exact'), sigFigsFor('analytical'), sigFigsFor('empirical'), sigFigsFor('estimate')]).toEqual([6, 4, 3, 2]);
  });
  it("'nearest' is the default direction", () => {
    for (const [v, dim] of [
      [298.15, DIM.ABS_TEMPERATURE],
      [254e-6, DIM.LENGTH],
      [1234.5678, DIM.RESISTANCE],
      [2.96, DIM.CURRENT],
    ] as Array<[number, Dim]>) {
      for (const prefs of ALL_PREFS) {
        for (const acc of CLASSES) {
          const base = acc === undefined ? { prefs } : { prefs, accuracyClass: acc };
          expect(formatFor(q(v, dim), { ...base, round: 'nearest' })).toBe(formatFor(q(v, dim), base));
        }
      }
    }
  });
  it('298.15 K is "25 C", 254 um is "10 mil", 4700 ohm is "4.7 kohm"', () => {
    expect(formatFor(q(298.15, DIM.ABS_TEMPERATURE), { round: 'nearest' })).toBe(`25 ${DEG}C`);
    expect(formatFor(q(254e-6, DIM.LENGTH), { prefs: MIL, round: 'nearest' })).toBe('10 mil');
    expect(formatFor(q(4700, DIM.RESISTANCE), { round: 'nearest' })).toBe(`4.7 k${OHM}`);
  });
});

// ---------------------------------------------------------------- property tests

const CURRENT_DENSITY = (DIM as unknown as Record<string, Dim>).CURRENT_DENSITY as Dim;
const PROP_DIMS: Array<[string, Dim, 'sig' | 'length' | 'area' | 'temp']> = [
  ['LENGTH', DIM.LENGTH, 'length'],
  ['AREA', DIM.AREA, 'area'],
  ['CURRENT', DIM.CURRENT, 'sig'],
  ['VOLTAGE', DIM.VOLTAGE, 'sig'],
  ['RESISTANCE', DIM.RESISTANCE, 'sig'],
  ['POWER', DIM.POWER, 'sig'],
  ['ABS_TEMPERATURE', DIM.ABS_TEMPERATURE, 'temp'],
  ['TEMPERATURE_DIFFERENCE', DIM.TEMPERATURE_DIFFERENCE, 'temp'],
  ['FREQUENCY', DIM.FREQUENCY, 'sig'],
  ['CAPACITANCE', DIM.CAPACITANCE, 'sig'],
  ['INDUCTANCE', DIM.INDUCTANCE, 'sig'],
  ['RESISTIVITY', DIM.RESISTIVITY, 'sig'],
  ['THERMAL_RESISTANCE', DIM.THERMAL_RESISTANCE, 'sig'],
  ['CURRENT_DENSITY', CURRENT_DENSITY, 'sig'],
  ['AREAL_MASS', DIM.AREAL_MASS, 'sig'],
];

/** Half the printed resolution in SI for fixed-decimal dimensions. */
function halfResolutionSi(kind: 'length' | 'area' | 'temp', prefs: DisplayPrefs): number {
  if (kind === 'temp') return 0.5 * 0.1 * (prefs.temperature === 'F' ? 5 / 9 : 1);
  if (kind === 'length') return 0.5 * (prefs.length === 'mil' ? 0.01 * 25.4e-6 : prefs.length === 'um' ? 0.1e-6 : 1e-6);
  return 0.5 * (prefs.area === 'mil2' ? 0.01 * 6.4516e-10 : 1e-4 * 1e-6);
}

/** Magnitudes 1e-12 .. 1e9 (mantissa 1..10, decade -12..8, plus an exact 1e9 via mantissa 1 and decade 9). */
const magnitude = fc.tuple(fc.double({ min: 1, max: 10, noNaN: true, noDefaultInfinity: true }), fc.integer({ min: -12, max: 8 })).map(([m, e]) => m * Math.pow(10, e));

for (const [name, dim, kind] of PROP_DIMS) {
  describe(`property: directional rounding, ${name}`, () => {
    const absolute = dim.kind === 'absTemp';
    const signed = fc.boolean().map((neg) => (neg && !absolute ? -1 : 1));
    const arb = fc.tuple(magnitude, signed, fc.constantFrom(...ALL_PREFS), fc.constantFrom(...CLASSES), fc.constantFrom(...DIRECTIONS));

    it("'up' >= SI, 'down' <= SI (exact), 'nearest' within half a unit of the last place; text is clean", () => {
      fc.assert(
        fc.property(arb, ([mag, sign, prefs, acc, round]) => {
          const si = mag * sign;
          const x = q(si, dim);
          const opts = acc === undefined ? { prefs, round } : { prefs, round, accuracyClass: acc };
          const text = formatFor(x, opts);
          expect(text, text).not.toMatch(/NaN|Infinity|undefined|,|\^/);
          expect(text, text).not.toMatch(/^-0(\.0+)?( |$)/); // no negative zero
          const r = parseQuantity(text, dim);
          expect(r.ok, `${text}${r.ok ? '' : ': ' + r.error.message}`).toBe(true);
          if (!r.ok) return;
          const back = r.value.si;
          if (round === 'up') expect(back >= si, `up: "${text}" parsed ${String(back)} < ${String(si)}`).toBe(true);
          else if (round === 'down') expect(back <= si, `down: "${text}" parsed ${String(back)} > ${String(si)}`).toBe(true);
          else if (kind === 'sig') {
            const sig = acc === undefined ? 6 : sigFigsFor(acc);
            const tol = 0.5 * Math.pow(10, 1 - sig) * (1 + 1e-9);
            expect(Math.abs(back - si) / Math.abs(si), `nearest: "${text}" vs ${String(si)}`).toBeLessThanOrEqual(tol);
          } else {
            const half = halfResolutionSi(kind, prefs);
            expect(Math.abs(back - si), `nearest: "${text}" vs ${String(si)}`).toBeLessThanOrEqual(half * (1 + 1e-9) + 1e-12 * Math.abs(si));
          }
        }),
        { numRuns: 400 },
      );
    });

    it("'up' and 'down' bracket the value and differ by at most one unit in the last place", () => {
      fc.assert(
        fc.property(arb, ([mag, sign, prefs, acc]) => {
          const si = mag * sign;
          const x = q(si, dim);
          const base = acc === undefined ? { prefs } : { prefs, accuracyClass: acc };
          const up = parseQuantity(formatFor(x, { ...base, round: 'up' }), dim);
          const down = parseQuantity(formatFor(x, { ...base, round: 'down' }), dim);
          expect(up.ok && down.ok).toBe(true);
          if (up.ok && down.ok) expect(up.value.si >= down.value.si).toBe(true);
        }),
        { numRuns: 200 },
      );
    });
  });
}

describe("values on the fab print grid print as themselves (nearest)", () => {
  it('grid values are unchanged', () => {
    for (const mm of [0.001, 0.254, 1.149, 12.5, 100]) {
      const x = q(mm * 1e-3, DIM.LENGTH);
      const n = formatFor(x, { prefs: MM, round: 'nearest' });
      expect(n).toBe(`${String(mm)} mm`);
    }
  });
});
