/**
 * Findings G4-c / G-8: HeadlineOpts gains `lengthRole?: 'geometry' | 'thickness'` (default 'geometry', behaviour unchanged).
 * With 'thickness', LENGTH values in formatResult, formatDesignValue and formatMargin print as formatDualThickness
 * ("<µm, 2 decimals> µm (<mil, 2 decimals> mil)"; geometry form from 1 mm up, never "1000 µm") in the direction implied by
 * the bound. Other dimensions (including AREA) ignore the role. Magnitude, not sign, decides the 1 mm switch for margins.
 * There is still no `round` override.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatDesignValue, formatMargin, formatResult, type HeadlineOpts } from './format-result';
import type { Bound, DesignDirection, DesignValue, ElementResult } from './result';
import {
  DIM,
  formatDual,
  formatDualThickness,
  parseQuantity,
  q,
  roundDirectionFor,
  type AccuracyClass,
  type DisplayPrefs,
  type Quantity,
} from './units';

const T: Pick<HeadlineOpts, 'lengthRole'> = { lengthRole: 'thickness' };
const CLASSES: AccuracyClass[] = ['exact', 'analytical', 'empirical', 'estimate'];
const BOUNDS: Bound[] = ['min-requirement', 'max-capacity', 'nominal', 'prediction'];
const PREFS: DisplayPrefs[] = [
  { length: 'mm', temperature: 'C', area: 'mm2' },
  { length: 'mil', temperature: 'F', area: 'mil2' },
  { length: 'um', temperature: 'K', area: 'mm2' },
];

function dv(direction: DesignDirection, calculated: Quantity, factor: number): DesignValue {
  return { name: 'x', direction, calculated, recommended: q(calculated.si * factor, calculated.dim), derating: { factor, rationale: 'test' } };
}
function el(load: Quantity, limit: Quantity): ElementResult {
  return { id: 'e1', name: 'E1', kind: 'trace', load, limit, utilisation: load.si / limit.si, margin: q(limit.si - load.si, limit.dim) };
}

describe('formatResult with lengthRole thickness', () => {
  it('prints the three copper conventions as distinct µm strings (nearest)', () => {
    const f = (si: number): string => formatResult({ value: q(si, DIM.LENGTH), bound: 'nominal' }, { accuracyClass: 'estimate', ...T });
    expect(f(35e-6)).toBe('35 µm (1.38 mil)');
    expect(f(34.29e-6)).toBe('34.29 µm (1.35 mil)');
    expect(f(34.3253e-6)).toBe('34.33 µm (1.35 mil)');
  });
  it('geometry role (explicit or default) is unchanged and still hides the difference', () => {
    for (const opts of [{ accuracyClass: 'estimate' as const }, { accuracyClass: 'estimate' as const, lengthRole: 'geometry' as const }]) {
      expect(formatResult({ value: q(34.29e-6, DIM.LENGTH), bound: 'nominal' }, opts)).toBe('0.034 mm (1.35 mil)');
      expect(formatResult({ value: q(34.3253e-6, DIM.LENGTH), bound: 'nominal' }, opts)).toBe('0.034 mm (1.35 mil)');
      expect(formatResult({ value: q(0.4e-6, DIM.LENGTH), bound: 'nominal' }, opts)).toMatch(/^0 mm /);
    }
  });
  it('direction follows the bound: requirement and prediction up, capacity down, nominal nearest', () => {
    const v = q(34.3253e-6, DIM.LENGTH);
    const expected: Record<Bound, string> = {
      'min-requirement': '34.33 µm (1.36 mil)',
      prediction: '34.33 µm (1.36 mil)',
      'max-capacity': '34.32 µm (1.35 mil)',
      nominal: '34.33 µm (1.35 mil)',
    };
    for (const bound of BOUNDS) {
      for (const accuracyClass of CLASSES) {
        expect(formatResult({ value: v, bound }, { accuracyClass, ...T })).toBe(expected[bound]);
      }
    }
  });
  it('equals formatDualThickness with the mapped direction; prefs and accuracy class do not alter it', () => {
    const v = q(0.2341e-3, DIM.LENGTH);
    for (const bound of BOUNDS) {
      for (const accuracyClass of CLASSES) {
        for (const prefs of PREFS) {
          expect(formatResult({ value: v, bound }, { accuracyClass, prefs, ...T })).toBe(formatDualThickness(v, { round: roundDirectionFor(bound) }));
        }
      }
    }
  });
  it('switches to the geometry form at 1 mm and never prints "1000 µm"', () => {
    const x = q(999.996e-6, DIM.LENGTH);
    expect(formatResult({ value: x, bound: 'min-requirement' }, { accuracyClass: 'exact', ...T })).toBe('1 mm (39.37 mil)');
    expect(formatResult({ value: x, bound: 'nominal' }, { accuracyClass: 'exact', ...T })).toBe('1 mm (39.37 mil)');
    expect(formatResult({ value: x, bound: 'max-capacity' }, { accuracyClass: 'exact', ...T })).toBe('999.99 µm (39.36 mil)');
    const big = q(1.5e-3, DIM.LENGTH);
    for (const bound of BOUNDS) {
      expect(formatResult({ value: big, bound }, { accuracyClass: 'exact', ...T })).toBe(
        formatDual(big, { round: roundDirectionFor(bound), accuracyClass: 'exact' }),
      );
    }
  });
  it('non-length dimensions ignore the role (area stays dual mm2, current and temperature as before)', () => {
    const cases: Quantity[] = [q(2.96, DIM.CURRENT), q(377.19, DIM.ABS_TEMPERATURE), q(1.2345e-6, DIM.AREA), q(10.04, DIM.TEMPERATURE_DIFFERENCE)];
    for (const v of cases) {
      for (const bound of BOUNDS) {
        for (const prefs of PREFS) {
          expect(formatResult({ value: v, bound }, { accuracyClass: 'estimate', prefs, ...T })).toBe(
            formatResult({ value: v, bound }, { accuracyClass: 'estimate', prefs }),
          );
        }
      }
    }
  });
  it('still accepts no round override', () => {
    const never = (): void => {
      // @ts-expect-error no round override, also with a lengthRole
      formatResult({ value: q(1e-6, DIM.LENGTH), bound: 'nominal' }, { accuracyClass: 'exact', lengthRole: 'thickness', round: 'nearest' });
      // @ts-expect-error lengthRole is a closed union
      formatResult({ value: q(1e-6, DIM.LENGTH), bound: 'nominal' }, { accuracyClass: 'exact', lengthRole: 'width' });
      // @ts-expect-error no round override
      formatDesignValue(dv('min-requirement', q(1e-6, DIM.LENGTH), 1), 'calculated', { accuracyClass: 'exact', lengthRole: 'thickness', round: 'up' });
      // @ts-expect-error no round override
      formatMargin(el(q(1e-6, DIM.LENGTH), q(2e-6, DIM.LENGTH)), { accuracyClass: 'exact', lengthRole: 'thickness', round: 'up' });
    };
    expect(typeof never).toBe('function');
  });
  it('accuracyClass stays required even with a lengthRole', () => {
    const never = (): void => {
      // @ts-expect-error accuracyClass is required
      formatResult({ value: q(1e-6, DIM.LENGTH), bound: 'nominal' }, { lengthRole: 'thickness' });
    };
    expect(typeof never).toBe('function');
  });
});

describe('formatDesignValue with lengthRole thickness', () => {
  it('min-requirement rounds both values up, max-limit both down, in µm', () => {
    const c = q(34.3253e-6, DIM.LENGTH);
    const up = dv('min-requirement', c, 1);
    const dn = dv('max-limit', c, 1);
    expect(formatDesignValue(up, 'calculated', { accuracyClass: 'estimate', ...T })).toBe('34.33 µm (1.36 mil)');
    expect(formatDesignValue(dn, 'calculated', { accuracyClass: 'estimate', ...T })).toBe('34.32 µm (1.35 mil)');
    for (const which of ['calculated', 'recommended'] as const) {
      const hi = dv('min-requirement', c, 1.5);
      const lo = dv('max-limit', c, 0.5);
      expect(formatDesignValue(hi, which, { accuracyClass: 'empirical', ...T })).toBe(formatDualThickness(hi[which], { round: 'up' }));
      expect(formatDesignValue(lo, which, { accuracyClass: 'empirical', ...T })).toBe(formatDualThickness(lo[which], { round: 'down' }));
    }
  });
  it('default role is unchanged geometry', () => {
    const v = dv('min-requirement', q(0.2341e-3, DIM.LENGTH), 1.5);
    expect(formatDesignValue(v, 'calculated', { accuracyClass: 'empirical' })).toMatch(/^[\d.]+ mm \([\d.]+ mil\)$/);
  });
});

/** Display rounding absorbs float noise up to 4 ulp (relative) of a rounding boundary (src/core/units/round-guard.ts). */
const NOISE = 4 * Number.EPSILON;
const noLess = (x: number): number => x - NOISE * Math.abs(x);
const noMore = (x: number): number => x + NOISE * Math.abs(x);

describe('formatMargin with lengthRole thickness', () => {
  it('positive margin: plus sign, rounded down, µm form, no over-limit', () => {
    const e = el(q(30e-6, DIM.LENGTH), q(35e-6, DIM.LENGTH));
    const s = formatMargin(e, { accuracyClass: 'estimate', ...T });
    expect(s).toMatch(/^\+[\d.]+ µm \([\d.]+ mil\)$/);
    expect(s).not.toContain('over limit');
    const head = (s.split(' (')[0] as string).replace(/^\+/, '');
    const r = parseQuantity(head, DIM.LENGTH);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.si).toBeLessThanOrEqual(noMore(e.margin.si));
  });
  it('exact value: margin 5.5 µm prints "+5.5 µm" with the mil part rounded down from SI', () => {
    const e = el(q(0, DIM.LENGTH), q(5.5e-6, DIM.LENGTH)); // margin = 5.5e-6, 0.216535 mil
    expect(formatMargin(e, { accuracyClass: 'estimate', ...T })).toBe('+5.5 µm (0.21 mil)');
  });
  it('negative margin: minus sign, rounded toward minus infinity, over-limit suffix', () => {
    const e = el(q(40.005e-6, DIM.LENGTH), q(35e-6, DIM.LENGTH)); // margin about -5.005 µm
    const s = formatMargin(e, { accuracyClass: 'estimate', ...T });
    expect(s).toMatch(/^-[\d.]+ µm \(-[\d.]+ mil\) \(over limit\)$/);
    const head = s.split(' (')[0] as string;
    const r = parseQuantity(head, DIM.LENGTH);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.si).toBeLessThanOrEqual(noMore(e.margin.si));
  });
  it('a margin of 1 mm or more (either sign) uses the geometry form', () => {
    const pos = formatMargin(el(q(0.5e-3, DIM.LENGTH), q(2e-3, DIM.LENGTH)), { accuracyClass: 'estimate', ...T });
    expect(pos.startsWith('+')).toBe(true);
    expect(pos).toMatch(/ mm \(/);
    expect(pos).not.toContain('µm');
    const neg = formatMargin(el(q(3e-3, DIM.LENGTH), q(1e-3, DIM.LENGTH)), { accuracyClass: 'estimate', ...T });
    expect(neg.startsWith('-')).toBe(true);
    expect(neg).toMatch(/ mm \(-/);
    expect(neg.endsWith(' (over limit)')).toBe(true);
    expect(neg).not.toContain('µm');
  });
  it('non-length margins ignore the role', () => {
    const e = el(q(0.0791, DIM.CURRENT), q(0.1, DIM.CURRENT));
    expect(formatMargin(e, { accuracyClass: 'estimate', ...T })).toBe('+20 mA');
  });
});

describe('thickness role: properties', () => {
  const thickness = fc.oneof(
    fc.double({ min: 0, max: 1, noNaN: true }).map((t) => 10 ** (-7 + t * (Math.log10(9.99e-4) + 7))),
    fc.integer({ min: 10, max: 99900 }).map((n) => n * 1e-8),
  );
  const bound = fc.constantFrom<Bound>(...BOUNDS);
  const accuracyClass = fc.constantFrom(...CLASSES);
  const primarySi = (text: string): number => {
    const head = (text.split(' (')[0] as string).replace(/^\+/, '');
    const r = parseQuantity(head, DIM.LENGTH);
    if (!r.ok) throw new Error(`unparseable "${head}" from "${text}"`);
    return r.value.si;
  };

  it('formatResult: min-requirement/prediction never print below, max-capacity never above; equals formatDualThickness', () => {
    fc.assert(
      fc.property(thickness, bound, accuracyClass, (v, b, c) => {
        const x = q(v, DIM.LENGTH);
        const s = formatResult({ value: x, bound: b }, { accuracyClass: c, lengthRole: 'thickness' });
        expect(s).not.toMatch(/NaN|Infinity|,|\^|<|1000 µm/);
        expect(s).toBe(formatDualThickness(x, { round: roundDirectionFor(b) }));
        if (b === 'min-requirement' || b === 'prediction') expect(primarySi(s)).toBeGreaterThanOrEqual(noLess(v));
        if (b === 'max-capacity') expect(primarySi(s)).toBeLessThanOrEqual(noMore(v));
      }),
      { numRuns: 500 },
    );
  });
  it('formatMargin: a printed margin never exceeds the true margin; sign and over-limit text consistent', () => {
    fc.assert(
      fc.property(thickness, fc.boolean(), (v, neg) => {
        const m = q(neg ? -v : v, DIM.LENGTH);
        const limit = q(v * 10, DIM.LENGTH);
        const e: ElementResult = { id: 'e', name: 'E', kind: 'trace', load: q(limit.si - m.si, DIM.LENGTH), limit, utilisation: (limit.si - m.si) / limit.si, margin: m };
        const s = formatMargin(e, { accuracyClass: 'estimate', lengthRole: 'thickness' });
        expect(s).not.toMatch(/NaN|Infinity|,|\^|<|1000 µm/);
        expect(primarySi(s)).toBeLessThanOrEqual(noMore(m.si));
        expect(s.startsWith(neg ? '-' : '+')).toBe(true);
        expect(s.includes('over limit')).toBe(neg);
      }),
      { numRuns: 500 },
    );
  });
});
