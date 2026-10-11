/**
 * Findings G4-c / G-8: copper thickness needs a micrometre headline.
 *
 * Contract for src/core/units/display.ts (exported from ./index):
 *   formatDualThickness(x: Quantity, opts?: { readonly round?: RoundDirection }): string
 *     LENGTH -> "<um> µm (<mil> mil)": um at 2 decimals (0.01 µm, trailing zeros trimmed), mil at 2 decimals, each part
 *     rounded independently from the SI value in the requested direction (default 'nearest').
 *     Magnitudes below 1 mm print in µm. When the µm part would round to 1000 µm or more, or the magnitude is >= 1 mm,
 *     the geometry form formatDual(x, { round }) is printed instead ("<mm> mm (<mil> mil)"); never "1000 µm".
 *     Never prints "<". Non-LENGTH dimensions and non-finite values throw InvalidValueError.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, InvalidValueError, formatDual, formatDualThickness, parseQuantity, q, type Quantity, type RoundDirection } from './index';

const MIL = 25.4e-6; // m, by definition of the inch
const UM_UNIT = 1e-8; // 0.01 um in m
const MIL_UNIT = 0.01 * MIL;

describe('formatDualThickness: concrete cases', () => {
  it('copper weights and conventions, nearest (default)', () => {
    expect(formatDualThickness(q(35e-6, DIM.LENGTH))).toBe('35 µm (1.38 mil)');
    expect(formatDualThickness(q(34.29e-6, DIM.LENGTH))).toBe('34.29 µm (1.35 mil)');
    expect(formatDualThickness(q(34.3253e-6, DIM.LENGTH))).toBe('34.33 µm (1.35 mil)');
    expect(formatDualThickness(q(17.5e-6, DIM.LENGTH))).toBe('17.5 µm (0.69 mil)');
    expect(formatDualThickness(q(105e-6, DIM.LENGTH))).toBe('105 µm (4.13 mil)');
    expect(formatDualThickness(q(35e-6, DIM.LENGTH), { round: 'nearest' })).toBe('35 µm (1.38 mil)');
  });
  it('34.29 µm and 34.3253 µm are distinct strings (the 1.35 mil vs mass/density conventions)', () => {
    const a = formatDualThickness(q(34.29e-6, DIM.LENGTH));
    const b = formatDualThickness(q(34.3253e-6, DIM.LENGTH));
    const c = formatDualThickness(q(35e-6, DIM.LENGTH));
    expect(new Set([a, b, c]).size).toBe(3);
  });
  it('directional rounding, each part independent from SI (34.3253 µm = 1.35139 mil)', () => {
    const x = q(34.3253e-6, DIM.LENGTH);
    expect(formatDualThickness(x, { round: 'up' })).toBe('34.33 µm (1.36 mil)');
    expect(formatDualThickness(x, { round: 'down' })).toBe('34.32 µm (1.35 mil)');
    expect(formatDualThickness(x, { round: 'nearest' })).toBe('34.33 µm (1.35 mil)');
  });
  it('other directional cases', () => {
    expect(formatDualThickness(q(35e-6, DIM.LENGTH), { round: 'up' })).toBe('35 µm (1.38 mil)');
    expect(formatDualThickness(q(35e-6, DIM.LENGTH), { round: 'down' })).toBe('35 µm (1.37 mil)');
    expect(formatDualThickness(q(17.5e-6, DIM.LENGTH), { round: 'down' })).toBe('17.5 µm (0.68 mil)');
    expect(formatDualThickness(q(105e-6, DIM.LENGTH), { round: 'up' })).toBe('105 µm (4.14 mil)');
  });
  it('on-grid value does not step on float noise (34.29 µm = 1.35 mil exactly)', () => {
    expect(formatDualThickness(q(34.29e-6, DIM.LENGTH), { round: 'up' })).toBe('34.29 µm (1.35 mil)');
    expect(formatDualThickness(q(34.29e-6, DIM.LENGTH), { round: 'down' })).toBe('34.29 µm (1.35 mil)');
  });
  it('sub-micrometre values print fixed decimals, never "<" and never a bare "0 µm" for up', () => {
    const x = q(0.004e-6, DIM.LENGTH); // 0.004 µm = 0.000157 mil
    expect(formatDualThickness(x, { round: 'up' })).toBe('0.01 µm (0.01 mil)');
    expect(formatDualThickness(x, { round: 'down' })).toBe('0 µm (0 mil)');
    expect(formatDualThickness(x, { round: 'nearest' })).toBe('0 µm (0 mil)');
    for (const round of ['up', 'down', 'nearest'] as const) expect(formatDualThickness(x, { round })).not.toContain('<');
  });
  it('0.9995 mm stays in µm', () => {
    expect(formatDualThickness(q(0.9995e-3, DIM.LENGTH), { round: 'up' })).toBe('999.5 µm (39.36 mil)'); // 39.35039 mil
    expect(formatDualThickness(q(0.9995e-3, DIM.LENGTH), { round: 'down' })).toBe('999.5 µm (39.35 mil)');
  });
});

describe('formatDualThickness: switch to the geometry form at 1 mm, never "1000 µm"', () => {
  it('a value that rounds to 1000.00 µm prints in mm (up and nearest)', () => {
    const x = q(999.996e-6, DIM.LENGTH); // 39.36992 mil
    expect(formatDualThickness(x, { round: 'up' })).toBe('1 mm (39.37 mil)');
    expect(formatDualThickness(x, { round: 'nearest' })).toBe('1 mm (39.37 mil)');
    expect(formatDualThickness(x, { round: 'up' })).toBe(formatDual(x, { round: 'up' }));
    expect(formatDualThickness(x, { round: 'nearest' })).toBe(formatDual(x, { round: 'nearest' }));
  });
  it('the same value rounded down stays in µm', () => {
    expect(formatDualThickness(q(999.996e-6, DIM.LENGTH), { round: 'down' })).toBe('999.99 µm (39.36 mil)');
  });
  it('>= 1 mm equals formatDual for every direction', () => {
    for (const v of [1e-3, 1.5e-3, 1.6e-3, 0.0254, 0.5]) {
      for (const round of ['up', 'down', 'nearest'] as const) {
        const s = formatDualThickness(q(v, DIM.LENGTH), { round });
        expect(s).toBe(formatDual(q(v, DIM.LENGTH), { round }));
        expect(s).not.toContain('µm');
      }
    }
    expect(formatDualThickness(q(1e-3, DIM.LENGTH), { round: 'up' })).toBe('1 mm (39.38 mil)');
    expect(formatDualThickness(q(1e-3, DIM.LENGTH), { round: 'down' })).toBe('1 mm (39.37 mil)');
  });
  it('never contains "1000 µm" for any direction around the switch', () => {
    for (const v of [999.9e-6, 999.99e-6, 999.995e-6, 999.9999e-6, 1e-3, 1.0001e-3]) {
      for (const round of ['up', 'down', 'nearest'] as const) {
        expect(formatDualThickness(q(v, DIM.LENGTH), { round })).not.toMatch(/1000(\.0+)? µm/);
      }
    }
  });
});

describe('formatDualThickness: guards', () => {
  it('throws InvalidValueError for non-length dimensions', () => {
    for (const dim of [DIM.CURRENT, DIM.AREA, DIM.VOLTAGE, DIM.ABS_TEMPERATURE, DIM.TEMPERATURE_DIFFERENCE, DIM.AREAL_MASS, DIM.DIMENSIONLESS]) {
      expect(() => formatDualThickness(q(1, dim))).toThrow(InvalidValueError);
    }
  });
  it('throws InvalidValueError for non-finite lengths', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => formatDualThickness({ si: bad, dim: DIM.LENGTH } as Quantity)).toThrow(InvalidValueError);
    }
  });
  it('accepts no accuracyClass/prefs-driven change: output is a pure function of value and direction', () => {
    const x = q(34.3253e-6, DIM.LENGTH);
    const opts = { round: 'up' } as const;
    expect(formatDualThickness(x, opts)).toBe(formatDualThickness(x, opts));
    expect(formatDualThickness(x, {})).toBe(formatDualThickness(x, { round: 'nearest' }));
  });
});

const PATTERN = /^(\d+(?:\.\d+)?) µm \((\d+(?:\.\d+)?) mil\)$/;
const siOf = (text: string): number => {
  const r = parseQuantity(text, DIM.LENGTH);
  if (!r.ok) throw new Error(`unparseable "${text}"`);
  return r.value.si;
};

/** log-uniform 1e-7 .. 9.99e-4 m, plus on-grid values n x 1e-8 m (0.01 µm) that stress float-noise snapping. */
const thickness: fc.Arbitrary<number> = fc.oneof(
  fc.double({ min: 0, max: 1, noNaN: true }).map((t) => 10 ** (-7 + t * (Math.log10(9.99e-4) + 7))),
  fc.integer({ min: 10, max: 99900 }).map((n) => n * 1e-8),
  fc.integer({ min: 1, max: 3930 }).map((n) => n * MIL_UNIT), // on the 0.01 mil grid, up to 998 µm
);
const direction = fc.constantFrom<RoundDirection>('up', 'down', 'nearest');

describe('formatDualThickness: properties', () => {
  it('directions hold exactly for both parts; nearest within half a unit; bounded error otherwise', () => {
    fc.assert(
      fc.property(thickness, direction, (v, round) => {
        const text = formatDualThickness(q(v, DIM.LENGTH), { round });
        expect(text).not.toMatch(/NaN|Infinity|,|\^|</);
        const mm = /^(\S+) mm \((\S+) mil\)$/.exec(text);
        const m = PATTERN.exec(text);
        const parts: Array<[string, number]> = [];
        if (m) {
          expect(Number(m[1])).toBeLessThan(1000);
          parts.push([`${m[1]} µm`, UM_UNIT], [`${m[2]} mil`, MIL_UNIT]);
        } else {
          expect(mm, text).not.toBeNull();
          // geometry form only when the µm part would have reached 1000
          expect(v).toBeGreaterThan(999.9e-6);
          parts.push([`${mm?.[1]} mm`, 1e-6], [`${mm?.[2]} mil`, MIL_UNIT]);
        }
        for (const [p, unit] of parts) {
          const si = siOf(p);
          if (round === 'up') {
            expect(si >= v, `${text} up`).toBe(true);
            expect(si - v).toBeLessThan(unit * (1 + 1e-9));
          } else if (round === 'down') {
            expect(si <= v, `${text} down`).toBe(true);
            expect(v - si).toBeLessThan(unit * (1 + 1e-9));
          } else {
            expect(Math.abs(si - v)).toBeLessThanOrEqual(0.5 * unit * (1 + 1e-9));
          }
        }
      }),
      { numRuns: 1000 },
    );
  });
  it('down never leaves µm form below 1 mm (no premature switch)', () => {
    fc.assert(
      fc.property(thickness, (v) => {
        expect(formatDualThickness(q(v, DIM.LENGTH), { round: 'down' })).toMatch(PATTERN);
      }),
      { numRuns: 500 },
    );
  });
  it('monotone: a larger thickness never prints a smaller µm value (same direction)', () => {
    fc.assert(
      fc.property(thickness, thickness, direction, (a, b, round) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const t = (x: number): number => {
          const s = formatDualThickness(q(x, DIM.LENGTH), { round });
          const mm = /^(\S+) mm /.exec(s);
          return mm ? Number(mm[1]) * 1000 : Number((PATTERN.exec(s) as RegExpExecArray)[1]);
        };
        expect(t(lo)).toBeLessThanOrEqual(t(hi));
      }),
      { numRuns: 500 },
    );
  });
});
