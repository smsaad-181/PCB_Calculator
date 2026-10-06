/**
 * Pure logic for the cross-check runner (no I/O, no globals).
 * See tests/crosscheck/README.md. A passing record never verifies a ledger row.
 */
import type { CrosscheckAdapter, CrosscheckInputs } from './adapters';

export interface CompareSpec {
  readonly output: string;
  readonly relTol: number;
  readonly why: string;
}

export interface CrosscheckCase {
  readonly id: string;
  readonly calculator: string;
  readonly inputs: CrosscheckInputs;
  readonly toolOutputs: Readonly<Record<string, number | null>>;
  readonly compare: readonly CompareSpec[];
}

export interface CrosscheckRecord {
  readonly tool: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly retrieved: string;
  readonly obtainedBy: 'human' | 'agent';
  readonly method: string;
  readonly cases: readonly CrosscheckCase[];
}

export type ValidationResult =
  | { readonly ok: true; readonly record: CrosscheckRecord }
  | { readonly ok: false; readonly errors: readonly string[] };

export type CaseStatus = 'pass' | 'fail' | 'pending';

export interface CaseResult {
  readonly caseId: string;
  readonly status: CaseStatus;
  readonly messages: readonly string[];
}

const PLACEHOLDER = 'REPLACE';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function containsPlaceholder(v: unknown): boolean {
  if (typeof v === 'string') return v.includes(PLACEHOLDER);
  if (Array.isArray(v)) return v.some(containsPlaceholder);
  if (isObject(v)) {
    return Object.entries(v).some(([k, x]) => k.includes(PLACEHOLDER) || containsPlaceholder(x));
  }
  return false;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Validate the runtime shape of a parsed JSON record. Never throws. */
export function validateRecord(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ['record is not a JSON object'] };

  if (containsPlaceholder(raw)) errors.push(`contains placeholder value "${PLACEHOLDER}" (template not filled in)`);

  for (const key of ['tool', 'toolId', 'toolVersion', 'method'] as const) {
    if (!nonEmptyString(raw[key])) errors.push(`"${key}" must be a non-empty string`);
  }
  if (typeof raw['retrieved'] !== 'string' || !isRealDate(raw['retrieved'])) {
    errors.push('"retrieved" must be a valid YYYY-MM-DD date');
  }
  if (raw['obtainedBy'] !== 'human' && raw['obtainedBy'] !== 'agent') {
    errors.push('"obtainedBy" must be "human" or "agent"');
  }

  const cases = raw['cases'];
  if (!Array.isArray(cases)) {
    errors.push('"cases" must be an array');
  } else {
    const seen = new Set<string>();
    cases.forEach((c: unknown, i: number) => {
      const where = `cases[${i}]`;
      if (!isObject(c)) {
        errors.push(`${where} is not an object`);
        return;
      }
      if (!nonEmptyString(c['id'])) errors.push(`${where}.id must be a non-empty string`);
      else if (seen.has(c['id'])) errors.push(`${where}.id "${c['id']}" is duplicated`);
      else seen.add(c['id']);
      if (!nonEmptyString(c['calculator'])) errors.push(`${where}.calculator must be a non-empty string`);
      if (!isObject(c['inputs'])) errors.push(`${where}.inputs must be an object`);

      const outs = c['toolOutputs'];
      if (!isObject(outs)) {
        errors.push(`${where}.toolOutputs must be an object`);
      } else {
        for (const [k, v] of Object.entries(outs)) {
          if (v !== null && !(typeof v === 'number' && Number.isFinite(v))) {
            errors.push(`${where}.toolOutputs.${k} must be a finite number or null`);
          }
        }
      }

      const cmp = c['compare'];
      if (!Array.isArray(cmp) || cmp.length === 0) {
        errors.push(`${where}.compare must be a non-empty array`);
      } else {
        cmp.forEach((e: unknown, j: number) => {
          const w = `${where}.compare[${j}]`;
          if (!isObject(e)) {
            errors.push(`${w} is not an object`);
            return;
          }
          if (!nonEmptyString(e['output'])) errors.push(`${w}.output must be a non-empty string`);
          else if (isObject(outs) && !Object.prototype.hasOwnProperty.call(outs, e['output'])) {
            errors.push(`${w}.output "${e['output']}" is not a key of toolOutputs`);
          }
          if (typeof e['relTol'] !== 'number' || !Number.isFinite(e['relTol']) || e['relTol'] < 0) {
            errors.push(`${w}.relTol must be a finite number >= 0`);
          }
          if (!nonEmptyString(e['why'])) errors.push(`${w}.why must be a non-empty string (tolerances need a stated reason)`);
        });
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, record: raw as unknown as CrosscheckRecord };
}

/** Evaluate one case against the adapter map. */
export function evaluateCase(
  c: CrosscheckCase,
  adapters: Readonly<Record<string, CrosscheckAdapter>>,
): CaseResult {
  const active = c.compare.filter((e) => c.toolOutputs[e.output] !== null && c.toolOutputs[e.output] !== undefined);
  if (active.length === 0) {
    return { caseId: c.id, status: 'pending', messages: ['all compared toolOutputs are null (not yet obtained)'] };
  }

  const adapter = Object.prototype.hasOwnProperty.call(adapters, c.calculator) ? adapters[c.calculator] : undefined;
  if (adapter === undefined) {
    return {
      caseId: c.id,
      status: 'fail',
      messages: [
        `calculator "${c.calculator}" has no adapter in tests/crosscheck/adapters.ts, but the case contains real tool data; add the adapter, do not drop the data`,
      ],
    };
  }

  let ours: Record<string, number>;
  try {
    ours = adapter(c.inputs);
  } catch (err) {
    return {
      caseId: c.id,
      status: 'fail',
      messages: [`adapter for "${c.calculator}" threw: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const failures: string[] = [];
  const passes: string[] = [];
  for (const e of active) {
    const tool = c.toolOutputs[e.output] as number;
    const mine = Object.prototype.hasOwnProperty.call(ours, e.output) ? ours[e.output] : undefined;
    if (mine === undefined || !Number.isFinite(mine)) {
      failures.push(`${e.output}: our adapter returned ${mine === undefined ? 'no value' : String(mine)}`);
      continue;
    }
    const absErr = Math.abs(mine - tool);
    const allowed = e.relTol * Math.abs(tool);
    const rel = tool === 0 ? (absErr === 0 ? 0 : Infinity) : absErr / Math.abs(tool);
    const line = `${e.output}: ours=${mine} tool=${tool} relErr=${rel} relTol=${e.relTol}`;
    if (absErr <= allowed) passes.push(line);
    else failures.push(`${line} (outside tolerance; report to calc-validator, do not widen)`);
  }
  return failures.length > 0
    ? { caseId: c.id, status: 'fail', messages: [...failures, ...passes] }
    : { caseId: c.id, status: 'pass', messages: passes };
}

export interface Summary {
  readonly records: number;
  readonly cases: number;
  readonly passed: number;
  readonly pending: number;
  readonly failed: number;
}

export function summarize(recordCount: number, results: readonly CaseResult[]): Summary {
  return {
    records: recordCount,
    cases: results.length,
    passed: results.filter((r) => r.status === 'pass').length,
    pending: results.filter((r) => r.status === 'pending').length,
    failed: results.filter((r) => r.status === 'fail').length,
  };
}

export function formatSummary(s: Summary): string {
  if (s.records === 0) return '0 cross-check records';
  return `${s.records} cross-check records, ${s.cases} cases: ${s.passed} passed, ${s.pending} pending (null), ${s.failed} failed`;
}
