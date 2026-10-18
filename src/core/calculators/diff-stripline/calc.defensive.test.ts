import { describe, expect, it, vi } from 'vitest';
import { DIM, fromUnit } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError } from '../../result';
import { dimensionless } from '../impedance-shared';
import { compute } from './calc';
import type { Inputs } from './calc';

// Defensive branches of the coupled stripline calculator: non-finite ratios from extreme units, models that cannot be
// evaluated, a solver that reports failure, and a throw inside the computation. None of them may produce a number.

const mock = vi.hoisted(() => ({ fail: false }));
vi.mock('../../solvers/rootfind', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../solvers/rootfind')>();
  return {
    ...actual,
    brent: (...a: Parameters<typeof actual.brent>) =>
      mock.fail ? ({ ok: false, reason: 'MAX_ITER', message: 'forced failure', iterations: 7 } as const) : actual.brent(...a),
  };
});

const um = (n: number): Quantity => fromUnit(n, 'um');
const len = (si: number): Quantity => ({ si, dim: DIM.LENGTH });
const er = dimensionless(4.2);
const ohm = (n: number): Quantity => fromUnit(n, 'ohm');
function err(inputs: unknown): CalcError {
  const out = compute(inputs as Inputs);
  if (out.ok) throw new Error('expected an error');
  return out.error;
}

describe('non-finite or unevaluable ratios are error values', () => {
  it('analysis: w/b or s/b overflowing to infinity', () => {
    expect(err({ width: len(1e300), edgeSpacing: um(100), planeSpacing: len(1e-300), er })).toMatchObject({ code: 'OUT_OF_DOMAIN', field: 'width' });
    expect(err({ width: um(100), edgeSpacing: len(1e300), planeSpacing: len(1e-300), er })).toMatchObject({ code: 'OUT_OF_DOMAIN', field: 'edgeSpacing' });
  });
  it('analysis: finite but absurd ratios never give a non-finite number', () => {
    for (const [w, s, b] of [[1e300, 1, 1], [1, 1e-300, 1], [1, 1, 1e300], [1, 1e300, 1]] as const) {
      const out = compute({ width: len(w), edgeSpacing: len(s), planeSpacing: len(b), er });
      if (out.ok) for (const r of out.value.results) expect(Number.isFinite(r.value.si)).toBe(true);
      else expect(out.error.code).toBe('OUT_OF_DOMAIN');
    }
  });
  it('spacing solve: infinite or unevaluable w/b', () => {
    expect(err({ targetZdiff: ohm(100), width: len(1e300), planeSpacing: len(1e-300), er })).toMatchObject({ code: 'OUT_OF_DOMAIN', field: 'width' });
    expect(err({ targetZdiff: ohm(100), width: len(1e300), planeSpacing: len(1), er }).code).toBe('OUT_OF_DOMAIN');
    // w/b = 1e308 with an absurd er underflows the impedance to zero: the model cannot be evaluated
    expect(err({ targetZdiff: ohm(100), width: len(1e300), planeSpacing: len(1e-8), er: dimensionless(1e300) })).toMatchObject({ code: 'OUT_OF_DOMAIN', field: 'width' });
  });
  it('width solve: infinite or unevaluable s/b', () => {
    expect(err({ targetZdiff: ohm(100), edgeSpacing: len(1e300), planeSpacing: len(1e-300), er })).toMatchObject({ code: 'OUT_OF_DOMAIN', field: 'edgeSpacing' });
    expect(err({ targetZdiff: ohm(100), edgeSpacing: len(1e-300), planeSpacing: len(1), er }).code).toBe('OUT_OF_DOMAIN');
    // s/b = 1e-320 (denormal): coth overflows, the denominator is infinite, the impedance underflows to zero
    expect(err({ targetZdiff: ohm(100), edgeSpacing: len(1e-320), planeSpacing: len(1), er })).toMatchObject({ code: 'OUT_OF_DOMAIN', field: 'edgeSpacing' });
  });
});

describe('a solver that reports failure is NO_CONVERGENCE, never a number', () => {
  it('spacing and width solves', () => {
    mock.fail = true;
    try {
      expect(err({ targetZdiff: ohm(100), width: um(200), planeSpacing: um(1000), er })).toMatchObject({ code: 'NO_CONVERGENCE', field: 'targetZdiff' });
      expect(err({ targetZdiff: ohm(100), edgeSpacing: um(200), planeSpacing: um(1000), er })).toMatchObject({ code: 'NO_CONVERGENCE', field: 'targetZdiff' });
    } finally {
      mock.fail = false;
    }
  });
});

describe('a throw inside the computation is caught and returned as an error value', () => {
  it('an Error and a non-Error', () => {
    const boom = (value: unknown): unknown => new Proxy({}, { get: () => { throw value; } });
    const a = compute(boom(new Error('boom')) as Inputs);
    const b = compute(boom('plain string') as Inputs);
    for (const x of [a, b]) {
      expect(x.ok).toBe(false);
      if (!x.ok) expect(x.error.message).toMatch(/could not be completed/);
    }
    if (!a.ok) expect(a.error.message).toContain('boom');
    if (!b.ok) expect(b.error.message).toContain('plain string');
  });
});
