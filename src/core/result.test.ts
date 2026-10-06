import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q } from './units';
import type { Quantity } from './units';
import { assertNoNonFinite, guardPositiveFinite, guardPositiveFiniteNumber } from './result';
import type { CalcError, CalcOutcome, CalcResult } from './result';

// Test-only numbers; nothing here is a physical claim.
const nonFiniteQ = (si: number): Quantity => ({ si, dim: DIM.LENGTH }) as Quantity;

function baseResult(): CalcResult {
  return {
    method: 'test method',
    reference: { standard: 'TEST', edition: 'n/a', ledgerIds: [] },
    formula: 'y = x',
    inputs: [{ name: 'x', value: q(1, DIM.LENGTH), defaulted: false }],
    assumptions: [],
    steps: [{ label: 's1', expr: 'x', value: q(1, DIM.LENGTH) }],
    results: [{ name: 'y', value: q(2, DIM.LENGTH), role: 'primary' }],
    validityChecks: [],
    warnings: [],
    confidence: { level: 'high', reasons: [] },
    recommendation: 'none',
    dataStatus: 'VERIFIED',
  };
}

describe('CalcResult schema (type-level + shape)', () => {
  it('accepts the documented shape including dataStatus', () => {
    const r = baseResult();
    expect(r.dataStatus).toBe('VERIFIED');
    const o: CalcOutcome = { ok: true, value: r };
    expect(o.ok).toBe(true);
  });
  it('CalcError code union is usable', () => {
    const codes: CalcError['code'][] = [
      'INVALID_INPUT',
      'OUT_OF_DOMAIN',
      'DIMENSION',
      'NO_CONVERGENCE',
      'INTERNAL',
    ];
    expect(codes).toHaveLength(5);
  });
});

describe('guardPositiveFinite (Quantity)', () => {
  it('accepts a positive finite quantity and returns it unchanged', () => {
    const x = q(0.5, DIM.LENGTH);
    const r = guardPositiveFinite('width', x);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.si).toBe(0.5);
  });
  it.each([
    ['zero', 0],
    ['negative', -1e-3],
    ['negative zero', -0],
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['-Infinity', -Infinity],
  ])('rejects %s with INVALID_INPUT naming the field', (_n, v) => {
    const r = guardPositiveFinite('trace width', nonFiniteQ(v));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INVALID_INPUT');
      expect(r.error.field).toBe('trace width');
      expect(r.error.message).toContain('trace width');
      expect(r.error.message.length).toBeGreaterThan(10);
    }
  });
  it('never returns ok for a non-positive or non-finite value (property)', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: false }), (v) => {
        const r = guardPositiveFinite('f', nonFiniteQ(v));
        expect(r.ok).toBe(Number.isFinite(v) && v > 0);
      }),
    );
  });
});

describe('guardPositiveFiniteNumber', () => {
  it('accepts positive finite numbers', () => {
    const r = guardPositiveFiniteNumber('n', 3.5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeDefined();
  });
  it.each([0, -0, -2, NaN, Infinity, -Infinity])('rejects %s', (v) => {
    const r = guardPositiveFiniteNumber('current', v);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INVALID_INPUT');
      expect(r.error.field).toBe('current');
      expect(r.error.message).toContain('current');
    }
  });
  it('ok iff finite and > 0 (property)', () => {
    fc.assert(
      fc.property(fc.double(), (v) => {
        expect(guardPositiveFiniteNumber('v', v).ok).toBe(Number.isFinite(v) && v > 0);
      }),
    );
  });
});

describe('assertNoNonFinite', () => {
  it('passes for a fully finite result', () => {
    expect(() => assertNoNonFinite(baseResult())).not.toThrow();
  });
  it.each([NaN, Infinity, -Infinity])('throws for %s in inputs', (v) => {
    const r = baseResult();
    r.inputs[0] = { name: 'x', value: nonFiniteQ(v), defaulted: false };
    expect(() => assertNoNonFinite(r)).toThrow();
  });
  it.each([NaN, Infinity, -Infinity])('throws for %s in steps', (v) => {
    const r = baseResult();
    r.steps[0] = { label: 's', expr: 'e', value: nonFiniteQ(v) };
    expect(() => assertNoNonFinite(r)).toThrow();
  });
  it.each([NaN, Infinity, -Infinity])('throws for %s in results', (v) => {
    const r = baseResult();
    r.results[0] = { name: 'y', value: nonFiniteQ(v), role: 'primary' };
    expect(() => assertNoNonFinite(r)).toThrow();
  });
  it('error message identifies the offending location', () => {
    const r = baseResult();
    r.results[0] = { name: 'ampacity', value: nonFiniteQ(NaN), role: 'primary' };
    expect(() => assertNoNonFinite(r)).toThrow(/ampacity/);
  });
  it('finite zero and negative values are not "non-finite"', () => {
    const r = baseResult();
    r.results.push({ name: 'neg', value: q(-5, DIM.LENGTH), role: 'secondary' });
    r.results.push({ name: 'zero', value: q(0, DIM.LENGTH), role: 'secondary' });
    expect(() => assertNoNonFinite(r)).not.toThrow();
  });
});
