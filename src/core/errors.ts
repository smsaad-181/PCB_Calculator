export { InvalidValueError, DimensionError, UnitError } from './units';

export type ConvergenceFailureReason = 'NO_BRACKET' | 'MAX_ITER' | 'NON_FINITE' | 'INVALID_ARGS' | 'RUNAWAY';

/** Thrown at API boundaries that cannot carry a value-style failure (solvers return values). */
export class ConvergenceError extends Error {
  readonly iterations: number;
  readonly reason: ConvergenceFailureReason;

  constructor(message: string, iterations: number, reason: ConvergenceFailureReason) {
    super(message);
    this.name = 'ConvergenceError';
    this.iterations = iterations;
    this.reason = reason;
    Object.setPrototypeOf(this, ConvergenceError.prototype);
  }
}
