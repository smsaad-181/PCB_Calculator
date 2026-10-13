import { describe, expect, it } from 'vitest';
import { DIM, q, sameDim } from '../../units';
import type { Quantity } from '../../units';
import type { CalcResult } from '../../result';
import { compute } from './calc';
import type { Inputs } from './calc';

// Phase 1 PCB-domain findings PCB-5 (element voltage, working-voltage check, creepage) and PCB-7 (initial-tolerance corners,
// load tolerance as its own input). Expected values come from docs/golden-vectors.json (oracle) or hand arithmetic.

interface GoldenVector {
  name: string;
  pinned_expected: number;
}
const goldenFiles = import.meta.glob('../../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const goldenText = Object.values(goldenFiles)[0];
const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;
const vec = (name: string): number => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found`);
  return v.pinned_expected;
};

const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const R = (n: number): Quantity => q(n, DIM.RESISTANCE);
const frac = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const fwd = (vin: number, r1: number, r2: number, extra: Partial<Inputs> = {}): Inputs => ({ solveFor: 'vout', vin: V(vin), r1: R(r1), r2: R(r2), ...extra });
function ok(inputs: Inputs): CalcResult {
  const out = compute(inputs);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code}: ${out.error.message}`);
  return out.value;
}
const res = (r: CalcResult, name: string) => {
  const x = r.results.find((o) => o.name === name);
  if (!x) throw new Error(`result "${name}" missing`);
  return x;
};
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const vdiv = (vin: number, r1: number, r2: number, rl?: number): number => {
  const e = rl === undefined ? r2 : (r2 * rl) / (r2 + rl);
  return (vin * e) / (r1 + e);
};

describe('PCB-5: voltage across each resistor, working-voltage check, creepage', () => {
  const cases: [number, number, number, number | undefined][] = [[12, 47e3, 10e3, undefined], [12, 47e3, 10e3, 100e3], [5, 330, 330, undefined]];
  it('voltage across r1 and r2 match the oracle (R1 = Vin - Vout, R2 = Vout), bound prediction, dimension voltage', () => {
    cases.forEach(([vin, r1, r2, rl], ci) => {
      const r = ok(fwd(vin, r1, r2, rl === undefined ? {} : { load: R(rl) }));
      expect(rel(res(r, 'voltage across r1').value.si, vec(`divider_power_c${String(ci)}_v_r1_V`))).toBeLessThanOrEqual(1e-9);
      expect(rel(res(r, 'voltage across r2').value.si, vec(`divider_power_c${String(ci)}_v_r2_V`))).toBeLessThanOrEqual(1e-9);
      expect(res(r, 'voltage across r1').bound).toBe('prediction');
      expect(sameDim(res(r, 'voltage across r2').value, V(1))).toBe(true);
    });
  });
  it('no rated voltage: info warning with the exact statement, no caution, creepage stated as not checked', () => {
    const r = ok(fwd(400, 1.58e6, 10e3));
    const w = r.warnings.find((x) => x.code === 'RESISTOR_VOLTAGE_NOT_CHECKED');
    expect(w?.severity).toBe('info');
    expect(w?.message).toBe('resistor voltage rating not checked: enter the rated working voltage');
    expect(r.warnings.some((x) => x.code === 'RESISTOR_VOLTAGE')).toBe(false);
    const c = r.warnings.find((x) => x.code === 'CREEPAGE_NOT_CHECKED');
    expect(c?.severity).toBe('info');
    expect(c?.message).toMatch(/creepage/i);
    expect(c?.message).toMatch(/not checked/i);
    expect(r.inputs.some((i) => i.name === 'ratedVoltage')).toBe(false);
  });
  it('rated voltage given: no NOT_CHECKED warning; caution RESISTOR_VOLTAGE only when an element exceeds it; input recorded', () => {
    const over = ok(fwd(400, 1.58e6, 10e3, { ratedVoltage: V(75) }));
    expect(over.warnings.some((x) => x.code === 'RESISTOR_VOLTAGE_NOT_CHECKED')).toBe(false);
    const w = over.warnings.filter((x) => x.code === 'RESISTOR_VOLTAGE');
    expect(w).toHaveLength(1);
    expect(w[0]?.severity).toBe('caution');
    expect(w[0]?.message).toMatch(/r1/i);
    expect(over.inputs.find((i) => i.name === 'ratedVoltage')?.value.si).toBe(75);
    expect(over.inputs.find((i) => i.name === 'ratedVoltage')?.source).toBe('user');
    const fine = ok(fwd(12, 47e3, 10e3, { ratedVoltage: V(75) }));
    expect(fine.warnings.some((x) => x.code === 'RESISTOR_VOLTAGE')).toBe(false);
    expect(fine.warnings.some((x) => x.code === 'CREEPAGE_NOT_CHECKED')).toBe(true);
    const vr1 = res(ok(fwd(12, 47e3, 10e3)), 'voltage across r1').value.si;
    expect(ok(fwd(12, 47e3, 10e3, { ratedVoltage: V(vr1) })).warnings.some((x) => x.code === 'RESISTOR_VOLTAGE')).toBe(false);
    expect(ok(fwd(12, 47e3, 10e3, { ratedVoltage: V(vr1 * 0.99) })).warnings.some((x) => x.code === 'RESISTOR_VOLTAGE')).toBe(true);
  });
  it('rated voltage is guarded: zero, negative and a non-voltage are rejected', () => {
    for (const bad of [0, -1]) expect(compute(fwd(12, 47e3, 10e3, { ratedVoltage: V(bad) })).ok).toBe(false);
    expect(compute(fwd(12, 47e3, 10e3, { ratedVoltage: R(5) })).ok).toBe(false);
  });
});

describe('PCB-7: initial-tolerance corners; the load tolerance is its own input', () => {
  it('a load without loadTolerance is held at nominal (0 % extra), not at the resistor tolerance; the assumption says so', () => {
    const r = ok(fwd(12, 47e3, 10e3, { load: R(100e3), tolerance: frac(0.01) }));
    const e = r.envelope?.[0];
    const vals: number[] = [];
    for (const b of [0.99, 1.01]) for (const c of [0.99, 1.01]) vals.push(vdiv(12, 47e3 * b, 10e3 * c, 100e3));
    expect(rel(e?.min.si ?? NaN, Math.min(...vals))).toBeLessThanOrEqual(1e-12);
    expect(rel(e?.max.si ?? NaN, Math.max(...vals))).toBeLessThanOrEqual(1e-12);
    expect(e?.toleranceInputs).toEqual(['r1', 'r2']);
    expect(r.assumptions.join(' ')).toMatch(/load tolerance.*unspecified.*0 %/i);
  });
  it('loadTolerance alone gives a load-only envelope, is recorded as an input and needs a load', () => {
    const r = ok(fwd(12, 47e3, 10e3, { load: R(100e3), loadTolerance: frac(0.05) }));
    expect(r.envelope?.[0]?.toleranceInputs).toEqual(['load']);
    expect(r.inputs.find((i) => i.name === 'loadTolerance')?.value.si).toBe(0.05);
    expect(r.assumptions.join(' ')).not.toMatch(/load tolerance.*unspecified/i);
    expect(compute(fwd(12, 47e3, 10e3, { loadTolerance: frac(0.05) })).ok).toBe(false);
    expect(compute(fwd(12, 47e3, 10e3, { load: R(100e3), loadTolerance: frac(0.5) })).ok).toBe(false);
  });
  it('assumptions say initial tolerance only, TCR and leakage excluded; no "worst case" wording anywhere', () => {
    const r = ok(fwd(12, 47e3, 10e3, { tolerance: frac(0.01) }));
    const t = r.assumptions.join(' ');
    expect(t).toMatch(/initial.tolerance/i);
    expect(t).toMatch(/TCR/);
    expect(t).toMatch(/leakage/i);
    expect(JSON.stringify(r)).not.toMatch(/worst.case/i);
  });
});
