import type { Quantity } from './units';
import type { Confidence, DataStatus } from './confidence';

/** Errors-as-values container. Calculators never return NaN; they return `{ ok: false }`. */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export interface CalcError {
  code: 'INVALID_INPUT' | 'OUT_OF_DOMAIN' | 'DIMENSION' | 'NO_CONVERGENCE' | 'INTERNAL';
  field?: string;
  message: string;
}

export interface CalcResult {
  method: string;
  reference: { standard: string; edition: string; ledgerIds: string[] };
  formula: string;
  inputs: { name: string; value: Quantity; defaulted: boolean }[];
  assumptions: string[];
  steps: { label: string; expr: string; value: Quantity }[];
  results: { name: string; value: Quantity; role: 'primary' | 'secondary' }[];
  validityChecks: { name: string; ok: boolean; detail: string }[];
  warnings: string[];
  confidence: Confidence;
  recommendation: string;
  dataStatus: DataStatus;
}

export type CalcOutcome = Result<CalcResult, CalcError>;

function invalid(name: string, what: string): CalcError {
  return {
    code: 'INVALID_INPUT',
    field: name,
    message: `${name} is ${what}; it must be a finite number greater than zero.`,
  };
}

function classify(n: number): string | null {
  if (Number.isNaN(n)) return 'NaN (not a number)';
  if (!Number.isFinite(n)) return n > 0 ? 'infinite (+Infinity)' : 'infinite (-Infinity)';
  if (n === 0) return 'zero';
  if (n < 0) return `negative (${String(n)})`;
  return null;
}

export function guardPositiveFiniteNumber(name: string, n: number): Result<number, CalcError> {
  const bad = classify(n);
  return bad === null ? { ok: true, value: n } : { ok: false, error: invalid(name, bad) };
}

export function guardPositiveFinite(name: string, qty: Quantity): Result<Quantity, CalcError> {
  const bad = classify(qty.si);
  return bad === null ? { ok: true, value: qty } : { ok: false, error: invalid(name, bad) };
}

/** Throws if any Quantity in inputs, steps or results is NaN or infinite. Zero and negatives are allowed. */
export function assertNoNonFinite(r: CalcResult): void {
  const check = (where: string, name: string, v: Quantity): void => {
    if (!Number.isFinite(v.si)) {
      throw new Error(`Non-finite value (${String(v.si)}) in ${where} "${name}"`);
    }
  };
  for (const i of r.inputs) check('inputs', i.name, i.value);
  for (const s of r.steps) check('steps', s.label, s.value);
  for (const o of r.results) check('results', o.name, o.value);
}
