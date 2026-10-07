import { sameDim } from './units';
import type { Quantity } from './units';
import type { Confidence, DataStatus } from './confidence';

/** Errors-as-values container. Calculators never return NaN; they return `{ ok: false }`. */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export interface CalcError {
  code: 'INVALID_INPUT' | 'OUT_OF_DOMAIN' | 'DIMENSION' | 'NO_CONVERGENCE' | 'INTERNAL';
  field?: string;
  message: string;
}

export type InputSource = 'user' | 'default' | 'fab-profile' | 'preset';
export type WarningSeverity = 'info' | 'caution' | 'warning' | 'critical';

export interface CalcInput {
  name: string;
  value: Quantity;
  source: InputSource;
  sourceDetail?: string;
}

export interface CalcWarning {
  severity: WarningSeverity;
  message: string;
  code?: string;
}

export type DesignDirection = 'max-limit' | 'min-requirement';

export interface DesignValue {
  name: string;
  direction: DesignDirection;
  calculated: Quantity;
  recommended: Quantity;
  derating: { factor: number; rationale: string };
}

export interface Envelope {
  name: string;
  min: Quantity;
  typ: Quantity;
  max: Quantity;
  toleranceInputs: string[];
}

export interface CalcResult {
  method: string;
  reference: { standard: string; edition: string; ledgerIds: string[] };
  formula: string;
  inputs: CalcInput[];
  assumptions: string[];
  steps: { label: string; expr: string; value: Quantity }[];
  results: { name: string; value: Quantity; role: 'primary' | 'secondary' }[];
  validityChecks: { name: string; ok: boolean; detail: string }[];
  warnings: CalcWarning[];
  confidence: Confidence;
  recommendation: string;
  dataStatus: DataStatus;
  designValue?: DesignValue;
  envelope?: Envelope[];
  fabProfile?: { id: string; fabricator: string; profileDate: string; status: DataStatus };
  limitingElement?: { id: string; name: string; reason: string };
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

/** Names of inputs not supplied by the user (default, fab profile, preset), in order. */
export function defaultedInputNames(inputs: readonly CalcInput[]): string[] {
  return inputs.filter((i) => i.source !== 'user').map((i) => i.name);
}

const SEVERITY_RANK: Readonly<Record<WarningSeverity, number>> = { info: 0, caution: 1, warning: 2, critical: 3 };

export function highestWarningSeverity(ws: readonly CalcWarning[]): WarningSeverity | null {
  let best: WarningSeverity | null = null;
  for (const w of ws) {
    if (best === null || SEVERITY_RANK[w.severity] > SEVERITY_RANK[best]) best = w.severity;
  }
  return best;
}

export function checkDesignValue(dv: DesignValue): Result<DesignValue, string> {
  const fail = (m: string): Result<DesignValue, string> => ({ ok: false, error: `Design value "${String(dv.name)}": ${m}` });
  const dir: unknown = (dv as { direction?: unknown }).direction;
  if (dir !== 'max-limit' && dir !== 'min-requirement') {
    return fail('direction must be "max-limit" or "min-requirement".');
  }
  const f = dv.derating.factor;
  if (dir === 'max-limit') {
    if (!Number.isFinite(f) || f <= 0 || f > 1) {
      return fail(`derating factor ${String(f)} is invalid for max-limit; it must be finite and in (0, 1].`);
    }
  } else if (!Number.isFinite(f) || f < 1) {
    return fail(`derating factor ${String(f)} is invalid for min-requirement; it must be finite and at least 1.`);
  }
  const c = dv.calculated;
  const r = dv.recommended;
  if (!Number.isFinite(c.si) || !Number.isFinite(r.si)) {
    return fail('calculated and recommended values must be finite.');
  }
  if (!sameDim(c, r)) return fail('calculated and recommended must have the same dimension.');
  if (dv.derating.rationale.trim() === '') return fail('derating rationale must not be empty.');
  const expected = c.si * f;
  if (Math.abs(r.si - expected) > 1e-12 * Math.max(Math.abs(expected), Math.abs(r.si))) {
    return fail('recommended value must equal calculated x factor.');
  }
  return { ok: true, value: dv };
}

export function checkEnvelope(e: Envelope): Result<Envelope, string> {
  const fail = (m: string): Result<Envelope, string> => ({ ok: false, error: `Envelope "${e.name}": ${m}` });
  if (!Number.isFinite(e.min.si) || !Number.isFinite(e.typ.si) || !Number.isFinite(e.max.si)) {
    return fail('min, typ and max must be finite.');
  }
  if (!sameDim(e.min, e.typ) || !sameDim(e.typ, e.max)) {
    return fail('min, typ and max must have the same dimension.');
  }
  if (e.min.si > e.typ.si) return fail('min must not exceed typ.');
  if (e.typ.si > e.max.si) return fail('typ must not exceed max.');
  return { ok: true, value: e };
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
  if (r.designValue) {
    check('designValue', r.designValue.name, r.designValue.calculated);
    check('designValue', r.designValue.name, r.designValue.recommended);
  }
  for (const e of r.envelope ?? []) {
    check('envelope', e.name, e.min);
    check('envelope', e.name, e.typ);
    check('envelope', e.name, e.max);
  }
}
