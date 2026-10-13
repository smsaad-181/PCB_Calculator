import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, toUnit } from '../../units';
import type { Quantity } from '../../units';
import type { CalcResult } from '../../result';
import { formatResult, formatStep } from '../../format-result';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 1 validation findings PCB-3, PCB-9, F-1 (trace width). Expected values come from the formula and the
// margin definition, not from the implementation.

type Layer = 'outer' | 'inner';
const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const mil = (n: number): Quantity => fromUnit(n, 'mil');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const dT = (n: number): Quantity => fromUnit(n, 'ddegC');
const one = (n: number): Quantity => ({ si: n, dim: DIM.DIMENSIONLESS }) as Quantity;
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

const solveWidth = (l: Layer, I: number, d: number, o: number): Inputs => ({ mode: 'B', layer: l, current: amp(I), deltaT: dT(d), copperWeight: oz(o) });
const solveCurrent = (l: Layer, w: number, d: number, o: number): Inputs => ({ mode: 'B', layer: l, width: mil(w), deltaT: dT(d), copperWeight: oz(o) });
const solveDT = (l: Layer, I: number, w: number, o: number): Inputs => ({ mode: 'B', layer: l, current: amp(I), width: mil(w), copperWeight: oz(o) });

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

describe('PCB-3: one margin basis (current); recommended width round-trips', () => {
  const roundTrip = (inp: Inputs): { requested: number; back: number } => {
    const r = ok(inp);
    const w = r.designValues[0]?.recommended;
    if (!w) throw new Error('no recommended width');
    const back = ok({ mode: 'B', layer: inp.layer, width: w, deltaT: inp.deltaT as Quantity, ...(inp.copperWeight ? { copperWeight: inp.copperWeight } : {}) });
    return { requested: toUnit(inp.current as Quantity, 'A'), back: toUnit(res(back, 'current capacity').value, 'A') };
  };
  it('recommended width for 2 A, solved back, carries at least 2 A (exactly margin x 2 A)', () => {
    const { requested, back } = roundTrip(solveWidth('outer', 2, 10, 1));
    expect(back).toBeGreaterThanOrEqual(requested);
    expect(relErr(back, requested * 1.25)).toBeLessThanOrEqual(1e-9);
  });
  it('round trip holds for user margins, both layers, several currents', () => {
    for (const layer of ['outer', 'inner'] as const) {
      for (const I of [0.5, 2, 10]) {
        for (const m of [1, 1.25, 2]) {
          const { requested, back } = roundTrip({ ...solveWidth(layer, I, 20, 2), designMargin: one(m) });
          expect(back).toBeGreaterThanOrEqual(requested * (1 - 1e-12));
          expect(relErr(back, requested * m)).toBeLessThanOrEqual(1e-9);
        }
      }
    }
  });
  it('default current margin and default current derating are reciprocal (1.25 x 0.8 = 1)', () => {
    expect(meta.defaults.designMargin * meta.defaults.currentDerating).toBeCloseTo(1, 12);
  });
  it('rationale labels the margin as a current margin and mentions the width', () => {
    const t = ok(solveWidth('outer', 2, 10, 1)).designValues[0]?.derating.rationale ?? '';
    expect(t).toMatch(/margin x1\.25 on the current/i);
    expect(t).toMatch(/width/i);
  });
});

describe('PCB-9: steps print with the same direction as the headline', () => {
  it('a step that repeats a result carries that result bound, so formatStep equals formatResult', () => {
    const opts = { accuracyClass: meta.accuracyClass } as const;
    const pairs: [string, string][] = [
      ['Required width', 'width'],
      ['Cross-section area', 'cross-section area'],
      ['Current capacity', 'current capacity'],
      ['Temperature rise', 'temperature rise'],
      ['Current density', 'current density'],
      ['Maximum conductor temperature', 'maximum conductor temperature'],
    ];
    let compared = 0;
    for (const inp of [solveWidth('outer', 2, 10, 1), solveCurrent('outer', 40, 20, 1), solveDT('outer', 2, 30, 1)]) {
      const r = ok(inp);
      for (const [label, name] of pairs) {
        const st = r.steps.find((x) => x.label === label);
        if (!st) continue;
        compared += 1;
        expect(formatStep(st, opts), label).toBe(formatResult(res(r, name), opts));
      }
    }
    expect(compared).toBeGreaterThanOrEqual(10);
  });
});

describe('F-1: inner-layer current above 17.5 A (S-010 CONFLICT) caution; 35 A stays the hard limit', () => {
  const code = 'INNER_CURRENT_ABOVE_17_5A';
  const has = (r: CalcResult): boolean => r.warnings.some((w) => w.code === code);
  it('inner, 20 A, 100 dT, 3 oz warns and cites S-010 as a conflict', () => {
    const r = ok(solveWidth('inner', 20, 100, 3));
    const w = r.warnings.find((x) => x.code === code);
    expect(w?.severity).toBe('caution');
    expect(w?.message).toMatch(/S-010/);
    expect(w?.message).toMatch(/CONFLICT/);
    expect(w?.message).toMatch(/17\.5/);
    expect(r.warnings.some((x) => x.code === 'OUT_OF_CHART_RANGE')).toBe(false);
  });
  it('no warning at 17.5 A or below and none for outer layers; applies when current is the solved value', () => {
    expect(has(ok(solveWidth('inner', 17.5, 50, 3)))).toBe(false);
    expect(has(ok(solveWidth('inner', 15, 50, 3)))).toBe(false);
    expect(has(ok(solveWidth('outer', 30, 80, 3)))).toBe(false);
    expect(has(ok(solveCurrent('inner', 395, 100, 3)))).toBe(true);
  });
  it('above 35 A the hard limit still applies as well', () => {
    const r = ok(solveWidth('inner', 36, 50, 3));
    expect(has(r)).toBe(true);
    expect(r.warnings.some((w) => w.code === 'OUT_OF_CHART_RANGE')).toBe(true);
  });
});
