/**
 * Gate G-4: parseFraction(text): Result<number, ParseError> for duty cycle / efficiency / ratios.
 * Contract (exported from ./index): returns { ok: true; value: number } with value in (0, 1], or { ok: false; error: Error }.
 */
import { describe, expect, it } from 'vitest';
import { DIM, parseFraction, parseQuantity } from './index';

function val(text: string): number {
  const r = parseFraction(text);
  expect(r.ok, `"${text}"`).toBe(true);
  return r.ok ? r.value : NaN;
}
function msg(text: string): string {
  const r = parseFraction(text);
  expect(r.ok, `"${text}" should be rejected`).toBe(false);
  return r.ok ? '' : r.error.message;
}

describe('parseFraction', () => {
  it('accepts percent and plain fractions', () => {
    expect(val('50%')).toBeCloseTo(0.5, 15);
    expect(val('0.5')).toBe(0.5);
    expect(val('50 %')).toBeCloseTo(0.5, 15);
    expect(val('100%')).toBe(1);
    expect(val('1')).toBe(1);
    expect(val('0.05')).toBeCloseTo(0.05, 15);
    expect(val('92.5%')).toBeCloseTo(0.925, 15);
    expect(val('  75% ')).toBeCloseTo(0.75, 15);
  });
  it('rejects bare "50" as ambiguous', () => {
    expect(msg('50')).toContain('write 50% or 0.5');
  });
  it('rejects out-of-range, zero, negative, empty and non-finite', () => {
    for (const t of ['150%', '-5%', '0%', '0', '', '   ', 'NaN', '1e400', 'Infinity', '-0.5', '1.5', '2', '100.01%', '%', 'abc']) {
      expect(parseFraction(t).ok, t).toBe(false);
    }
  });
  it('error messages are non-empty strings', () => {
    for (const t of ['150%', '', 'NaN']) expect(msg(t).length).toBeGreaterThan(0);
  });
  it('fuzz 500 strings: never throws, ok implies strictly in (0,1]', () => {
    let s = 987654321;
    const rnd = (): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const alphabet = '0123456789.+-eE% NaInfty,/½∞٣ ​';
    for (let i = 0; i < 500; i++) {
      const len = Math.floor(rnd() * 10);
      let t = '';
      for (let j = 0; j < len; j++) t += alphabet.charAt(Math.floor(rnd() * alphabet.length));
      const r = parseFraction(t);
      if (r.ok) {
        expect(Number.isFinite(r.value), t).toBe(true);
        expect(r.value, t).toBeGreaterThan(0);
        expect(r.value, t).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('G-4: fractional copper weights are rejected with a decimal hint', () => {
  it('"1/2 oz", "1/2oz", "½ oz", "1 1/2 oz" -> ok:false, message says write 0.5 oz style', () => {
    for (const t of ['1/2 oz', '1/2oz', '½ oz', '1 1/2 oz']) {
      const r = parseQuantity(t, DIM.AREAL_MASS);
      expect(r.ok, t).toBe(false);
      if (!r.ok) {
        expect(r.error.message, t).toMatch(/write 0\.5 oz|write 1\.5 oz|write \d+(\.\d+)? oz/);
        expect(r.error.message, t).toMatch(/\d\.\d oz|0\.5 oz/);
      }
    }
  });
  it('"1/2 oz" hint is exactly "write 0.5 oz"', () => {
    const r = parseQuantity('1/2 oz', DIM.AREAL_MASS);
    expect(!r.ok && r.error.message).toContain('write 0.5 oz');
  });
  it('"0.5 oz" is valid with AREAL_MASS', () => {
    const r = parseQuantity('0.5 oz', DIM.AREAL_MASS);
    expect(r.ok).toBe(true);
  });
});
