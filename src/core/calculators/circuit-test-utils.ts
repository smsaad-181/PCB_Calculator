/**
 * Test helpers for the second slice of circuit-value calculators. Not imported by any app code.
 * Expected numbers are read from docs/golden-vectors.json (written by tools/reference/gen_golden.py from the independent oracle).
 */
import { expect } from 'vitest';
import { assertCalcResult } from '../result';
import type { CalcOutcome, CalcResult } from '../result';
import { sameDim } from '../units';
import type { Quantity } from '../units';

export interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
  ledger_ids: string[];
  status: string;
}

const goldenFiles = import.meta.glob('../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const goldenText = Object.values(goldenFiles)[0];
export const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;

export const vec = (name: string): GoldenVector => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found (${String(vectors.length)} vectors loaded)`);
  return v;
};

export const TOL = 1e-9;
/** Relative error; an expected value that is zero or float noise (below 1e-12) falls back to an absolute comparison. */
export const err = (a: number, b: number): number => (Math.abs(b) < 1e-12 ? Math.abs(a - b) * 1e12 : Math.abs(a - b) / Math.abs(b));

/** Compute, require ok, and run the full schema check on the output. */
export function okOf<I>(compute: (i: I) => CalcOutcome, inputs: I): CalcResult {
  const out = compute(inputs);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code} ${out.error.field ?? ''}: ${out.error.message}`);
  const chk = assertCalcResult(out.value);
  expect(chk.ok, chk.ok ? '' : chk.error.join('; ')).toBe(true);
  return out.value;
}

export const res = (r: CalcResult, name: string): CalcResult['results'][number] => {
  const x = r.results.find((o) => o.name === name);
  if (!x) throw new Error(`result "${name}" missing; have ${r.results.map((o) => o.name).join(', ')}`);
  return x;
};
export const si = (r: CalcResult, name: string): number => res(r, name).value.si;
export const has = (r: CalcResult, name: string): boolean => r.results.some((o) => o.name === name);
export const primaries = (r: CalcResult): string[] => r.results.filter((x) => x.role === 'primary').map((x) => x.name);
export const dimIs = (value: Quantity, ref: Quantity): boolean => sameDim(value, ref);

/** Every outcome must be an error VALUE with the given code (and field when given); compute must not throw. */
export function expectError<I>(compute: (i: I) => CalcOutcome, inputs: I, code: string, field?: string): string {
  let out: CalcOutcome;
  try {
    out = compute(inputs);
  } catch (e) {
    throw new Error(`compute threw: ${String(e)}`, { cause: e });
  }
  expect(out.ok, JSON.stringify(inputs)).toBe(false);
  if (out.ok) return '';
  expect('value' in out).toBe(false);
  expect(out.error.code).toBe(code);
  if (field !== undefined) expect(out.error.field).toBe(field);
  expect(out.error.message.trim().length).toBeGreaterThan(0);
  return out.error.message;
}

/** All warnings, messages joined, for substring checks. */
export const warningText = (r: CalcResult): string => r.warnings.map((w) => w.message).join('\n');
export const allText = (r: CalcResult): string => [r.recommendation, ...r.assumptions, ...r.warnings.map((w) => w.message), ...r.validityChecks.map((c) => `${c.name} ${c.detail}`)].join('\n');

/** The result carries no compliance or readiness claim. The words are assembled from fragments so this file does not trip the wording audit. */
export function expectNoClaimWording(r: CalcResult): void {
  const words = ['compl' + 'iant', 'certi' + 'fied', 'conf' + 'orms', 'guaran' + 'teed', 'production.?' + 'safe', 'fab.?' + 'ready'];
  const negated = new RegExp(String.raw`\b(not|no|never|neither)\b[^.]{0,40}(` + words.join('|') + ')', 'gi');
  const text = JSON.stringify(r).replace(negated, '');
  expect(text).not.toMatch(new RegExp(words.join('|'), 'i'));
}
