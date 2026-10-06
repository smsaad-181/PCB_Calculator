import { describe, expect, it } from 'vitest';
import { ConvergenceError, DimensionError, InvalidValueError, UnitError } from './errors';

describe('errors', () => {
  it('ConvergenceError carries its iteration count and reason', () => {
    const e = new ConvergenceError('did not converge', 100, 'MAX_ITER');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ConvergenceError);
    expect(e.name).toBe('ConvergenceError');
    expect(e.message).toBe('did not converge');
    expect(e.iterations).toBe(100);
    expect(e.reason).toBe('MAX_ITER');
  });

  it('ConvergenceError accepts the F_THREW reason reported by the solvers', () => {
    expect(new ConvergenceError('callback threw', 0, 'F_THREW').reason).toBe('F_THREW');
  });

  it('re-exports the units error classes', () => {
    for (const E of [InvalidValueError, DimensionError, UnitError]) {
      expect(new E('x')).toBeInstanceOf(Error);
    }
  });
});
