import { DIM, describeDim, dimEqual, isDimensionless, type Dim, type Exps } from './dim';
import { DimensionError, InvalidValueError } from './errors';

/** SI magnitude plus dimension. Display units are never stored. */
export interface Quantity {
  readonly si: number;
  readonly dim: Dim;
}

/** Throws InvalidValueError unless `v` is a finite number. */
export function assertFinite(v: number, what: string): void {
  if (!Number.isFinite(v)) {
    throw new InvalidValueError(`${what} is ${String(v)}; NaN and +/-Infinity are not allowed`);
  }
}

function result(si: number, dim: Dim, op: string): Quantity {
  if (!Number.isFinite(si)) {
    throw new InvalidValueError(`${op} produced a non-finite result (overflow or division by zero)`);
  }
  return { si, dim };
}

/** Create a quantity from an SI value. Zero and negative values are allowed; sign rules belong to calculators. */
export function q(si: number, dim: Dim): Quantity {
  assertFinite(si, 'Value');
  return { si, dim };
}

export function sameDim(a: Quantity, b: Quantity): boolean {
  return dimEqual(a.dim, b.dim);
}

function mismatch(op: string, a: Dim, b: Dim): DimensionError {
  return new DimensionError(`Cannot ${op} ${describeDim(a)} and ${describeDim(b)}`);
}

export function add(a: Quantity, b: Quantity): Quantity {
  const ka = a.dim.kind;
  const kb = b.dim.kind;
  if (dimEqual(a.dim, b.dim)) {
    if (ka === 'absTemp') throw new DimensionError('Cannot add two absolute temperatures; add a temperature difference instead');
    return result(a.si + b.si, a.dim, 'add');
  }
  if (ka === 'absTemp' && kb === 'deltaT') return result(a.si + b.si, a.dim, 'add');
  if (ka === 'deltaT' && kb === 'absTemp') return result(a.si + b.si, b.dim, 'add');
  throw mismatch('add', a.dim, b.dim);
}

export function sub(a: Quantity, b: Quantity): Quantity {
  const ka = a.dim.kind;
  const kb = b.dim.kind;
  if (dimEqual(a.dim, b.dim)) {
    return result(a.si - b.si, ka === 'absTemp' ? DIM.TEMPERATURE_DIFFERENCE : a.dim, 'subtract');
  }
  if (ka === 'absTemp' && kb === 'deltaT') return result(a.si - b.si, a.dim, 'subtract');
  throw mismatch('subtract', a.dim, b.dim);
}

export function neg(a: Quantity): Quantity {
  return { si: 0 - a.si, dim: a.dim };
}

export function abs(a: Quantity): Quantity {
  return { si: Math.abs(a.si), dim: a.dim };
}

/** Returns -1, 0 or 1. Throws DimensionError unless dimensions are identical. */
export function compare(a: Quantity, b: Quantity): -1 | 0 | 1 {
  if (!dimEqual(a.dim, b.dim)) throw mismatch('compare', a.dim, b.dim);
  return a.si < b.si ? -1 : a.si > b.si ? 1 : 0;
}

function makeDim(exp: Exps): Dim {
  // A pure K^1 exponent vector is a temperature difference (e.g. K/W * W).
  return exp[0] === 0 && exp[1] === 0 && exp[2] === 0 && exp[3] === 0 && exp[4] === 1 && exp[5] === 0 && exp[6] === 0
    ? DIM.TEMPERATURE_DIFFERENCE
    : { exp, kind: 'plain' };
}

/** Kind protection shared by mul/div. Returns the dim to keep for scaling an arealMass, else undefined. */
function guardMulDiv(op: string, a: Dim, b: Dim, isDiv: boolean): Dim | undefined {
  if (a.kind === 'absTemp' || b.kind === 'absTemp') {
    throw new DimensionError(`Cannot ${op} an absolute temperature; use a temperature difference`);
  }
  if (a.kind === 'arealMass' || b.kind === 'arealMass') {
    // Only pure scaling by a dimensionless number keeps an areal mass (foilThickness() is the only way to a length).
    if (a.kind === 'arealMass' && isDimensionless(b)) return a;
    if (!isDiv && b.kind === 'arealMass' && isDimensionless(a)) return b;
    throw new DimensionError(`Cannot ${op} areal mass (oz/ft2) with ${describeDim(a.kind === 'arealMass' ? b : a)}; use foilThickness()`);
  }
  return undefined;
}

export function mul(a: Quantity, b: Quantity): Quantity {
  const keep = guardMulDiv('multiply', a.dim, b.dim, false);
  if (keep) return result(a.si * b.si, keep, 'multiply');
  const x = a.dim.exp;
  const y = b.dim.exp;
  const exp: Exps = [x[0] + y[0], x[1] + y[1], x[2] + y[2], x[3] + y[3], x[4] + y[4], x[5] + y[5], x[6] + y[6]];
  return result(a.si * b.si, makeDim(exp), 'multiply');
}

export function div(a: Quantity, b: Quantity): Quantity {
  const keep = guardMulDiv('divide', a.dim, b.dim, true);
  if (keep) return result(a.si / b.si, keep, 'divide');
  const x = a.dim.exp;
  const y = b.dim.exp;
  const exp: Exps = [x[0] - y[0], x[1] - y[1], x[2] - y[2], x[3] - y[3], x[4] - y[4], x[5] - y[5], x[6] - y[6]];
  return result(a.si / b.si, makeDim(exp), 'divide');
}

/** Integer power. Absolute temperature and areal mass are not powerable. */
export function pow(a: Quantity, n: number): Quantity {
  if (a.dim.kind === 'absTemp') throw new DimensionError('Cannot raise an absolute temperature to a power');
  if (a.dim.kind === 'arealMass') throw new DimensionError('Cannot raise areal mass (oz/ft2) to a power');
  if (!Number.isInteger(n)) throw new InvalidValueError(`Exponent must be a finite integer, got ${String(n)}`);
  const x = a.dim.exp;
  const exp: Exps = [x[0] * n + 0, x[1] * n + 0, x[2] * n + 0, x[3] * n + 0, x[4] * n + 0, x[5] * n + 0, x[6] * n + 0];
  return result(Math.pow(a.si, n), makeDim(exp), 'power');
}
