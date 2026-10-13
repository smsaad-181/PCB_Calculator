/**
 * Percent formatters. Contract (src/core/format-result.ts):
 *   formatPercent(x: Quantity | number, bound: Bound, opts: { accuracyClass }): string
 *     x is a dimensionless fraction (0.07 = 7 %). Significant figures follow the accuracy class (analytical 4, empirical 3,
 *     estimate 2). Direction from the bound: prediction/min-requirement up, max-capacity down, nominal nearest. Up and down are
 *     toward +/- infinity, as everywhere else.
 *   formatSignedPercent(x, opts): an error or deviation. The magnitude rounds AWAY from zero (never understates), the sign is
 *     always printed ('+' or '-'); exact zero prints '0 %'.
 */
import { describe, expect, it } from 'vitest';
import { formatPercent, formatSignedPercent } from './format-result';
import { DIM, InvalidValueError, q } from './units';

const A = { accuracyClass: 'analytical' } as const; // 4 sig figs
const E = { accuracyClass: 'empirical' } as const; // 3 sig figs
const S = { accuracyClass: 'estimate' } as const; // 2 sig figs

describe('formatPercent', () => {
  it('prediction rounds up, max-capacity down, nominal nearest', () => {
    expect(formatPercent(0.06977, 'prediction', E)).toBe('6.98 %');
    expect(formatPercent(0.069721, 'prediction', E)).toBe('6.98 %');
    expect(formatPercent(0.069721, 'max-capacity', E)).toBe('6.97 %');
    expect(formatPercent(0.9302, 'max-capacity', A)).toBe('93.02 %');
    expect(formatPercent(0.93028, 'max-capacity', E)).toBe('93.0 %');
    expect(formatPercent(0.93028, 'prediction', E)).toBe('93.1 %');
    expect(formatPercent(0.06976, 'nominal', E)).toBe('6.98 %');
    expect(formatPercent(0.069749, 'nominal', E)).toBe('6.97 %');
    expect(formatPercent(0.06977, 'min-requirement', S)).toBe('7.0 %');
  });
  it('never prints above the value when rounding down and never below when rounding up', () => {
    for (const f of [0.0123456, 0.5, 0.987654, 1.5, 0.000123456, 12.3456]) {
      for (const cls of [A, E, S]) {
        expect(Number.parseFloat(formatPercent(f, 'prediction', cls))).toBeGreaterThanOrEqual(f * 100 * (1 - 1e-12));
        expect(Number.parseFloat(formatPercent(f, 'max-capacity', cls))).toBeLessThanOrEqual(f * 100 * (1 + 1e-12));
      }
    }
  });
  it('accepts a dimensionless Quantity and rejects other dimensions', () => {
    expect(formatPercent(q(0.05, DIM.DIMENSIONLESS), 'nominal', E)).toBe('5.00 %');
    expect(() => formatPercent(q(0.05, DIM.LENGTH), 'nominal', E)).toThrow(InvalidValueError);
  });
  it('exact decimal values are not pushed over by float noise', () => {
    expect(formatPercent(0.07, 'prediction', E)).toBe('7.00 %');
    expect(formatPercent(0.07, 'max-capacity', E)).toBe('7.00 %');
    expect(formatPercent(0.29, 'max-capacity', E)).toBe('29.0 %');
    expect(formatPercent(0.29, 'prediction', E)).toBe('29.0 %');
  });
  it('zero, 100 %, negatives', () => {
    expect(formatPercent(0, 'prediction', E)).toBe('0 %');
    expect(formatPercent(1, 'max-capacity', E)).toBe('100 %');
    expect(formatPercent(0.99999, 'max-capacity', E)).toBe('99.9 %');
    expect(formatPercent(0.99999, 'prediction', E)).toBe('100 %');
    expect(formatPercent(-0.01234, 'prediction', E)).toBe('-1.23 %'); // up = toward +infinity
    expect(formatPercent(-0.01234, 'max-capacity', E)).toBe('-1.24 %');
  });
  it('tiny and very large values', () => {
    expect(formatPercent(1.2345e-9, 'prediction', E)).toBe('0.000000124 %');
    expect(formatPercent(1.2345e-9, 'max-capacity', E)).toBe('0.000000123 %');
    expect(formatPercent(25, 'prediction', E)).toBe('2500 %');
    expect(formatPercent(12345, 'prediction', E)).toBe('1240000 %');
    expect(formatPercent(1e6 + 1, 'prediction', E)).toBe('101000000 %');
  });
  it('rejects NaN, infinities and unrepresentably large values', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(() => formatPercent(bad, 'nominal', E)).toThrow(InvalidValueError);
      expect(() => formatSignedPercent(bad, E)).toThrow(InvalidValueError);
    }
    expect(() => formatPercent(1e30, 'nominal', E)).toThrow(InvalidValueError);
  });
});

describe('formatSignedPercent (magnitude rounds away from zero)', () => {
  it('prints an explicit sign and rounds the magnitude up', () => {
    expect(formatSignedPercent(0.01234, E)).toBe('+1.24 %');
    expect(formatSignedPercent(-0.01234, E)).toBe('-1.24 %');
    expect(formatSignedPercent(-0.012301, E)).toBe('-1.24 %');
    expect(formatSignedPercent(0.012301, S)).toBe('+1.3 %');
  });
  it('zero and exact values', () => {
    expect(formatSignedPercent(0, E)).toBe('0 %');
    expect(formatSignedPercent(-0, E)).toBe('0 %');
    expect(formatSignedPercent(0.05, E)).toBe('+5.00 %');
    expect(formatSignedPercent(-0.05, E)).toBe('-5.00 %');
  });
  it('is symmetric in magnitude and handles tiny, 100 % and large values', () => {
    for (const f of [1.2345e-7, 0.4321, 1, 7.7]) expect(formatSignedPercent(f, E).slice(1)).toBe(formatSignedPercent(-f, E).slice(1));
    expect(formatSignedPercent(1, E)).toBe('+100 %');
    expect(formatSignedPercent(-1.2345e-9, E)).toBe('-0.000000124 %');
    expect(formatSignedPercent(12345, E)).toBe('+1240000 %');
  });
  it('accepts a dimensionless Quantity and rejects other dimensions', () => {
    expect(formatSignedPercent(q(-0.02, DIM.DIMENSIONLESS), E)).toBe('-2.00 %');
    expect(() => formatSignedPercent(q(0.02, DIM.VOLTAGE), E)).toThrow(InvalidValueError);
  });
});
