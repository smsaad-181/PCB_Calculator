/**
 * Gate G1-a: safe rounding must not be opt-in. Contract for src/core/format-result.ts (pure; imports ./units, ./result):
 *
 *   formatResult(item: { value: Quantity; bound: Bound }, opts: { accuracyClass: AccuracyClass; prefs?: DisplayPrefs }): string
 *     direction = roundDirectionFor(bound); LENGTH and AREA print as formatDual(...); everything else as formatFor(...).
 *   formatDesignValue(dv: DesignValue, which: 'calculated' | 'recommended', opts: same): string
 *     direction from dv.direction ('min-requirement' -> up, 'max-limit' -> down), via boundForDesignDirection.
 *   formatMargin(el: ElementResult, opts: same): string
 *     margin is a capacity: rounds DOWN (toward -Infinity). Text starts with '+' (margin >= 0) or '-' (margin < 0);
 *     a negative margin ends with ' (over limit)'; a non-negative margin never contains 'over limit'.
 *     Geometry margins print dual: the first part (before ' (') is the mm/primary half.
 *   formatUtilisation(u: number): string        // 'NN.N %', rounds UP; u < 1 never prints as 100 or more
 *   boundForDesignDirection(d: DesignDirection): Bound
 *   designDirectionForBound(b: Bound): DesignDirection | undefined
 *   HEADLINE_FORMATTERS = [formatResult, formatDesignValue, formatMargin, formatUtilisation]
 * None of the headline formatters accepts a `round` override; accuracyClass is required.
 */
import { describe, expect, it } from 'vitest';
import {
  HEADLINE_FORMATTERS,
  boundForDesignDirection,
  designDirectionForBound,
  formatDesignValue,
  formatMargin,
  formatResult,
  formatUtilisation,
} from './format-result';
import type { Bound, DesignDirection, DesignValue, ElementResult } from './result';
import { DIM, InvalidValueError, formatDual, formatFor, q, roundDirectionFor, type AccuracyClass, type DisplayPrefs, type Quantity } from './units';

const MIL_PREFS: DisplayPrefs = { length: 'mil', temperature: 'F', area: 'mil2' };
const CLASSES: AccuracyClass[] = ['exact', 'analytical', 'empirical', 'estimate'];
const BOUNDS: Bound[] = ['min-requirement', 'max-capacity', 'nominal', 'prediction'];

function dv(direction: DesignDirection, calculated: Quantity, factor: number): DesignValue {
  return {
    name: 'x',
    direction,
    calculated,
    recommended: q(calculated.si * factor, calculated.dim),
    derating: { factor, rationale: 'test' },
  };
}

function el(load: Quantity, limit: Quantity): ElementResult {
  return {
    id: 'e1',
    name: 'E1',
    kind: 'trace',
    load,
    limit,
    utilisation: load.si / limit.si,
    margin: q(limit.si - load.si, limit.dim),
  };
}

describe('direction vocabulary mapping', () => {
  it('maps design direction to bound', () => {
    expect(boundForDesignDirection('min-requirement')).toBe('min-requirement');
    expect(boundForDesignDirection('max-limit')).toBe('max-capacity');
  });
  it('maps bound to design direction; nominal and prediction have none', () => {
    expect(designDirectionForBound('min-requirement')).toBe('min-requirement');
    expect(designDirectionForBound('max-capacity')).toBe('max-limit');
    expect(designDirectionForBound('nominal')).toBeUndefined();
    expect(designDirectionForBound('prediction')).toBeUndefined();
  });
  it('round trips and agrees with roundDirectionFor', () => {
    for (const d of ['min-requirement', 'max-limit'] as const) {
      expect(designDirectionForBound(boundForDesignDirection(d))).toBe(d);
      expect(roundDirectionFor(boundForDesignDirection(d))).toBe(d === 'min-requirement' ? 'up' : 'down');
    }
  });
});

describe('formatResult', () => {
  it('2.96 A at estimate class: capacity rounds down, requirement and prediction up, nominal nearest', () => {
    const v = q(2.96, DIM.CURRENT);
    expect(formatResult({ value: v, bound: 'max-capacity' }, { accuracyClass: 'estimate' })).toBe('2.9 A');
    expect(formatResult({ value: v, bound: 'min-requirement' }, { accuracyClass: 'estimate' })).toBe('3 A');
    expect(formatResult({ value: v, bound: 'prediction' }, { accuracyClass: 'estimate' })).toBe('3 A');
    expect(formatResult({ value: v, bound: 'nominal' }, { accuracyClass: 'estimate' })).toBe('3 A');
  });
  it('prefix roll-over goes the safe way (empirical)', () => {
    expect(formatResult({ value: q(0.9996, DIM.CURRENT), bound: 'min-requirement' }, { accuracyClass: 'empirical' })).toBe('1 A');
    expect(formatResult({ value: q(0.99996, DIM.CURRENT), bound: 'max-capacity' }, { accuracyClass: 'empirical' })).toBe('999 mA');
  });
  it('predicted temperature rounds up at fixed 0.1 resolution', () => {
    expect(formatResult({ value: q(104.04 + 273.15, DIM.ABS_TEMPERATURE), bound: 'prediction' }, { accuracyClass: 'estimate' })).toBe('104.1 °C');
  });
  it('length and area print dual, equal to formatDual with the mapped direction', () => {
    const len = q(6.35e-3, DIM.LENGTH);
    expect(formatResult({ value: len, bound: 'min-requirement' }, { accuracyClass: 'estimate' })).toBe('6.35 mm (250 mil)');
    const l2 = q(0.2341e-3, DIM.LENGTH);
    const a = q(1.2345e-6, DIM.AREA);
    for (const bound of BOUNDS) {
      const round = roundDirectionFor(bound);
      for (const accuracyClass of CLASSES) {
        expect(formatResult({ value: l2, bound }, { accuracyClass })).toBe(formatDual(l2, { round, accuracyClass }));
        expect(formatResult({ value: a, bound }, { accuracyClass })).toBe(formatDual(a, { round, accuracyClass }));
      }
    }
  });
  it('non-geometry equals formatFor with the mapped direction and honours prefs', () => {
    const t = q(300, DIM.ABS_TEMPERATURE);
    for (const bound of BOUNDS) {
      expect(formatResult({ value: t, bound }, { accuracyClass: 'analytical', prefs: MIL_PREFS })).toBe(
        formatFor(t, { round: roundDirectionFor(bound), accuracyClass: 'analytical', prefs: MIL_PREFS }),
      );
    }
  });
  it('accuracyClass and opts are required at the type level', () => {
    const never = (): void => {
      // @ts-expect-error accuracyClass is required
      formatResult({ value: q(1, DIM.CURRENT), bound: 'nominal' }, {});
      // @ts-expect-error opts is required
      formatResult({ value: q(1, DIM.CURRENT), bound: 'nominal' });
      // @ts-expect-error bound is required
      formatResult({ value: q(1, DIM.CURRENT) }, { accuracyClass: 'exact' });
    };
    expect(typeof never).toBe('function');
  });
  it('throws a typed error on non-finite values', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => formatResult({ value: { si: bad, dim: DIM.CURRENT } as Quantity, bound: 'nominal' }, { accuracyClass: 'exact' })).toThrow(InvalidValueError);
    }
  });
});

describe('formatDesignValue', () => {
  it('min-requirement rounds both values up, max-limit both down', () => {
    const c = q(2.96, DIM.CURRENT);
    const up = dv('min-requirement', c, 1.25); // recommended 3.7
    expect(formatDesignValue(up, 'calculated', { accuracyClass: 'estimate' })).toBe('3 A');
    expect(formatDesignValue(up, 'recommended', { accuracyClass: 'estimate' })).toBe('3.7 A');
    const dn = dv('max-limit', c, 0.8); // recommended 2.368
    expect(formatDesignValue(dn, 'calculated', { accuracyClass: 'estimate' })).toBe('2.9 A');
    expect(formatDesignValue(dn, 'recommended', { accuracyClass: 'estimate' })).toBe('2.3 A');
  });
  it('equals formatResult with the mapped bound, geometry dual', () => {
    const len = q(0.2341e-3, DIM.LENGTH);
    for (const d of ['min-requirement', 'max-limit'] as const) {
      const v = dv(d, len, d === 'min-requirement' ? 1.5 : 0.5);
      for (const which of ['calculated', 'recommended'] as const) {
        const expected = formatResult({ value: v[which], bound: boundForDesignDirection(d) }, { accuracyClass: 'empirical' });
        expect(formatDesignValue(v, which, { accuracyClass: 'empirical' })).toBe(expected);
        expect(expected).toMatch(/^[\d.]+ mm \([\d.]+ mil\)$/);
      }
    }
  });
  it('accuracyClass is required', () => {
    const never = (): void => {
      // @ts-expect-error accuracyClass is required
      formatDesignValue(dv('min-requirement', q(1, DIM.CURRENT), 1), 'calculated', {});
    };
    expect(typeof never).toBe('function');
  });
});

describe('formatMargin', () => {
  it('positive margin: explicit plus, rounded down, no over-limit text', () => {
    const e = el(q(0.0791, DIM.CURRENT), q(0.1, DIM.CURRENT)); // margin 0.0209 A
    const s = formatMargin(e, { accuracyClass: 'estimate' });
    expect(s).toBe('+20 mA');
    expect(s).not.toContain('over limit');
  });
  it('pessimistic: a printed margin never exceeds the true margin', () => {
    const e = el(q(2.0, DIM.CURRENT), q(2.9649, DIM.CURRENT)); // margin 0.9649 A
    expect(formatMargin(e, { accuracyClass: 'estimate' })).toBe('+960 mA');
  });
  it('negative margin rounds toward minus infinity, explicit sign, over limit', () => {
    const e = el(q(3.14, DIM.CURRENT), q(2.0, DIM.CURRENT)); // margin -1.14 A
    expect(formatMargin(e, { accuracyClass: 'estimate' })).toBe('-1.2 A (over limit)');
  });
  it('geometry margin prints dual with an over-limit suffix', () => {
    const e = el(q(0.3e-3, DIM.LENGTH), q(0.25e-3, DIM.LENGTH)); // margin -0.05 mm
    const s = formatMargin(e, { accuracyClass: 'estimate' });
    expect(s.startsWith('-')).toBe(true);
    expect(s).toMatch(/mm \(-[\d.]+ mil\)/);
    expect(s.endsWith(' (over limit)')).toBe(true);
  });
  it('accuracyClass is required', () => {
    const never = (): void => {
      // @ts-expect-error accuracyClass is required
      formatMargin(el(q(1, DIM.CURRENT), q(2, DIM.CURRENT)), {});
    };
    expect(typeof never).toBe('function');
  });
});

describe('formatUtilisation', () => {
  it('one decimal percent; exact on-grid values do not step up on float noise', () => {
    expect(formatUtilisation(0.791)).toBe('79.1 %');
    expect(formatUtilisation(0.5)).toBe('50.0 %');
    expect(formatUtilisation(0)).toBe('0.0 %');
    expect(formatUtilisation(1.25)).toBe('125.0 %');
  });
  it('rounds up, never down', () => {
    expect(formatUtilisation(0.7911)).toBe('79.2 %');
    expect(formatUtilisation(0.79101)).toBe('79.2 %');
    expect(formatUtilisation(1.0001)).toBe('100.1 %');
    expect(formatUtilisation(0.0001)).toBe('0.1 %');
  });
  it('an under-limit value never prints as 100 %', () => {
    expect(formatUtilisation(0.9996)).toBe('99.96 %');
    for (const u of [0.9991, 0.9999, 0.99991, 0.999999]) {
      const s = formatUtilisation(u);
      const p = Number(s.replace(' %', ''));
      expect(p).toBeLessThan(100);
      expect(p).toBeGreaterThanOrEqual(u * 100 * (1 - 4 * Number.EPSILON));
      expect(s.endsWith(' %')).toBe(true);
    }
    expect(formatUtilisation(1)).toBe('100.0 %');
  });
  it('throws InvalidValueError on non-finite input', () => {
    for (const bad of [NaN, Infinity, -Infinity]) expect(() => formatUtilisation(bad)).toThrow(InvalidValueError);
  });
});

describe('headline formatters', () => {
  it('lists exactly the four headline formatters', () => {
    expect(HEADLINE_FORMATTERS).toEqual([formatResult, formatDesignValue, formatMargin, formatUtilisation]);
  });
  it('none accepts a round override', () => {
    const never = (): void => {
      const v = q(1, DIM.CURRENT);
      // @ts-expect-error no round override
      formatResult({ value: v, bound: 'nominal' }, { accuracyClass: 'exact', round: 'nearest' });
      // @ts-expect-error no round override
      formatDesignValue(dv('min-requirement', v, 1), 'calculated', { accuracyClass: 'exact', round: 'nearest' });
      // @ts-expect-error no round override
      formatMargin(el(v, q(2, DIM.CURRENT)), { accuracyClass: 'exact', round: 'nearest' });
      // @ts-expect-error formatUtilisation takes exactly one argument
      formatUtilisation(0.5, { round: 'nearest' });
    };
    expect(typeof never).toBe('function');
  });
});
