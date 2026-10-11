import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q, sameDim } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import { LEDGER } from '../../data/ledger';
import type { CalcResult } from '../../result';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 1 task 8, calculator 1 of 2: Ohm's law and power. TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py: ohm_solve; vectors
// ohm_<pair>_c<i>_<unit> in docs/golden-vectors.json) or from the textbook identities restated below. The implementation is
// never consulted. Ohm's law and P = VI are definitions, not ledger rows; the ledger row is S-019 (basic circuit relations, textbook, VERIFIED).
//
// CONTRACT pinned here (see also guards.test.ts and result.test.ts):
//  - Inputs { voltage?, current?, resistance?, power? } (VOLTAGE, CURRENT, RESISTANCE, POWER quantities): EXACTLY two given.
//  - results are always the four names 'voltage', 'current', 'resistance', 'power'. Givens are echoed unchanged with bound
//    'nominal'. Solved quantities: voltage, current and resistance have bound 'nominal'; solved power has bound 'prediction'
//    (so it prints rounded up). Exactly one primary: the FIRST solved quantity in the fixed order voltage, current,
//    resistance, power; the other solved quantity is secondary, as are the givens.

interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
  ledger_ids: string[];
  status: string;
}
const goldenFiles = import.meta.glob('../../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const goldenText = Object.values(goldenFiles)[0];
const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;
const vec = (name: string): GoldenVector => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found (${String(vectors.length)} vectors loaded)`);
  return v;
};

const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const I = (n: number): Quantity => q(n, DIM.CURRENT);
const R = (n: number): Quantity => q(n, DIM.RESISTANCE);
const P = (n: number): Quantity => q(n, DIM.POWER);
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const TOL = 1e-9;

type Key = 'v' | 'i' | 'r' | 'p';
const FIELD: Record<Key, 'voltage' | 'current' | 'resistance' | 'power'> = { v: 'voltage', i: 'current', r: 'resistance', p: 'power' };
const MAKE: Record<Key, (n: number) => Quantity> = { v: V, i: I, r: R, p: P };
const UNIT: Record<Key, string> = { v: 'V', i: 'A', r: 'ohm', p: 'W' };
const ORDER: Key[] = ['v', 'i', 'r', 'p'];
const NAMES = ['voltage', 'current', 'resistance', 'power'] as const;

// Mirrors tools/reference/ref_calcs.py OHM_CASES (pairing, givens).
const OHM_CASES: [string, Partial<Record<Key, number>>][] = [
  ['VI', { v: 12, i: 0.5 }],
  ['VI', { v: 3.3, i: 0.02 }],
  ['VR', { v: 5, r: 330 }],
  ['VR', { v: 24, r: 4700 }],
  ['VP', { v: 12, p: 6 }],
  ['VP', { v: 230, p: 1000 }],
  ['IR', { i: 0.02, r: 150 }],
  ['IR', { i: 3, r: 0.05 }],
  ['IP', { i: 2, p: 10 }],
  ['IP', { i: 0.001, p: 0.25 }],
  ['RP', { r: 100, p: 0.25 }],
  ['RP', { r: 4700, p: 1 }],
];
const pairOf = (k1: Key, a: number, k2: Key, b: number): Partial<Record<Key, number>> => {
  const g: Partial<Record<Key, number>> = {};
  g[k1] = a;
  g[k2] = b;
  return g;
};
const inputsOf = (given: Partial<Record<Key, number>>): Inputs => {
  const out: Record<string, Quantity> = {};
  for (const k of ORDER) {
    const x = given[k];
    if (x !== undefined) out[FIELD[k]] = MAKE[k](x);
  }
  return out as Inputs;
};

function ok(inputs: Inputs): CalcResult {
  const out = compute(inputs);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code} ${out.error.field ?? ''}: ${out.error.message}`);
  const chk = assertCalcResult(out.value);
  expect(chk.ok, chk.ok ? '' : chk.error.join('; ')).toBe(true);
  return out.value;
}
const res = (r: CalcResult, name: string) => {
  const x = r.results.find((o) => o.name === name);
  if (!x) throw new Error(`result "${name}" missing; have ${r.results.map((o) => o.name).join(', ')}`);
  return x;
};
const si = (r: CalcResult, name: string): number => res(r, name).value.si;

describe('golden vectors (oracle): all six pairings, two cases each', () => {
  it('vectors loaded: 24 ohm_ vectors, ledger S-019, status VERIFIED, tolerance 1e-9', () => {
    const own = vectors.filter((v) => v.name.startsWith('ohm_'));
    expect(own).toHaveLength(24);
    for (const v of own) {
      expect(v.ledger_ids).toEqual(['S-019']);
      expect(v.status).toBe('VERIFIED');
      expect(v.rel_tol).toBeLessThanOrEqual(TOL);
    }
  });
  OHM_CASES.forEach(([pair, given], ci) => {
    it(`${pair} case ${String(ci)}: ${JSON.stringify(given)}`, () => {
      const r = ok(inputsOf(given));
      const solved = ORDER.filter((k) => given[k] === undefined);
      expect(solved).toHaveLength(2);
      for (const k of solved) {
        const v = vec(`ohm_${pair}_c${String(ci)}_${UNIT[k]}`);
        expect(relErr(si(r, FIELD[k]), v.pinned_expected), `${FIELD[k]} = ${String(si(r, FIELD[k]))} vs ${String(v.pinned_expected)}`).toBeLessThanOrEqual(TOL);
      }
      // givens are echoed unchanged
      for (const k of ORDER) if (given[k] !== undefined) expect(si(r, FIELD[k])).toBe(given[k]);
      // dimensions
      for (const k of ORDER) expect(sameDim(res(r, FIELD[k]).value, MAKE[k](1))).toBe(true);
      // roles and bounds
      const primary = FIELD[solved[0] as Key];
      expect(r.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual([primary]);
      for (const k of ORDER) {
        const x = res(r, FIELD[k]);
        const solvedPower = k === 'p' && given.p === undefined;
        expect(x.bound, FIELD[k]).toBe(solvedPower ? 'prediction' : 'nominal');
      }
    });
  });
});

describe('result set', () => {
  it('always the four results voltage, current, resistance, power', () => {
    for (const [, given] of OHM_CASES) {
      const r = ok(inputsOf(given));
      expect([...r.results.map((x) => x.name)].sort()).toEqual([...NAMES].sort());
    }
  });
  it('the primary is the first solved quantity in the fixed order voltage, current, resistance, power (all six pairings)', () => {
    const want: Record<string, string> = { VI: 'resistance', VR: 'current', VP: 'current', IR: 'voltage', IP: 'voltage', RP: 'voltage' };
    for (const [pair, given] of OHM_CASES) {
      const r = ok(inputsOf(given));
      expect(r.results.filter((x) => x.role === 'primary').map((x) => x.name), pair).toEqual([want[pair]]);
    }
  });
  it('inputs lists exactly the two givens, source user, values unchanged', () => {
    const r = ok({ voltage: V(12), resistance: R(24) });
    expect(r.inputs.map((i) => i.name).sort()).toEqual(['resistance', 'voltage']);
    for (const i of r.inputs) expect(i.source).toBe('user');
    expect(r.inputs.find((i) => i.name === 'voltage')?.value.si).toBe(12);
    expect(r.inputs.find((i) => i.name === 'resistance')?.value.si).toBe(24);
  });
  it('hand-checkable: 12 V across 24 ohm is 0.5 A and 6 W; 12 V at 0.5 A is 24 ohm and 6 W; 2 A in 5 ohm is 10 V and 20 W; 100 ohm at 0.25 W is 5 V and 50 mA', () => {
    const a = ok({ voltage: V(12), resistance: R(24) });
    expect([si(a, 'current'), si(a, 'power')]).toEqual([0.5, 6]);
    const b = ok({ voltage: V(12), current: I(0.5) });
    expect([si(b, 'resistance'), si(b, 'power')]).toEqual([24, 6]);
    const c = ok({ current: I(2), resistance: R(5) });
    expect([si(c, 'voltage'), si(c, 'power')]).toEqual([10, 20]);
    const d = ok({ resistance: R(100), power: P(0.25) });
    expect(relErr(si(d, 'voltage'), 5)).toBeLessThanOrEqual(1e-12);
    expect(relErr(si(d, 'current'), 0.05)).toBeLessThanOrEqual(1e-12);
  });
  it('steps are non-empty, labelled, finite, and cover the solved quantities', () => {
    for (const [, given] of OHM_CASES) {
      const r = ok(inputsOf(given));
      expect(r.steps.length).toBeGreaterThan(0);
      for (const s of r.steps) {
        expect(s.label.trim().length).toBeGreaterThan(0);
        expect(s.expr.trim().length).toBeGreaterThan(0);
        expect(Number.isFinite(s.value.si)).toBe(true);
      }
    }
  });
  it('no design values and no envelope (a non-binding hint only)', () => {
    const r = ok({ voltage: V(12), current: I(0.5) });
    expect(r.designValues).toEqual([]);
    expect(r.envelope ?? []).toEqual([]);
  });
});

describe('properties (fast-check)', () => {
  const x = fc.double({ min: -3, max: 3, noNaN: true }).map((e) => 10 ** e); // 1e-3 .. 1e3
  const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

  it('V = I R and the three power identities hold within 1e-12 for every pairing', () => {
    fc.assert(
      fc.property(x, x, fc.integer({ min: 0, max: 5 }), (a, b, pairIdx) => {
        const pairs: [Key, Key][] = [['v', 'i'], ['v', 'r'], ['v', 'p'], ['i', 'r'], ['i', 'p'], ['r', 'p']];
        const [k1, k2] = pairs[pairIdx] as [Key, Key];
        const r = ok(inputsOf(pairOf(k1, a, k2, b)));
        const v = si(r, 'voltage');
        const i = si(r, 'current');
        const rr = si(r, 'resistance');
        const p = si(r, 'power');
        expect(rel(v, i * rr)).toBeLessThanOrEqual(1e-12);
        expect(rel(p, v * i)).toBeLessThanOrEqual(1e-12);
        expect(rel(p, i * i * rr)).toBeLessThanOrEqual(1e-12);
        expect(rel(p, (v * v) / rr)).toBeLessThanOrEqual(1e-12);
      }),
      { numRuns: 300 },
    );
  });
  it('round trip between pairings: (V, I) -> R, P; then (R, P) -> V, I; then (V, R) -> I, P; all agree within 1e-12', () => {
    fc.assert(
      fc.property(x, x, (v, i) => {
        const a = ok({ voltage: V(v), current: I(i) });
        const b = ok({ resistance: R(si(a, 'resistance')), power: P(si(a, 'power')) });
        expect(rel(si(b, 'voltage'), v)).toBeLessThanOrEqual(1e-12);
        expect(rel(si(b, 'current'), i)).toBeLessThanOrEqual(1e-12);
        const c = ok({ voltage: V(si(b, 'voltage')), resistance: R(si(a, 'resistance')) });
        expect(rel(si(c, 'current'), i)).toBeLessThanOrEqual(1e-12);
        expect(rel(si(c, 'power'), si(a, 'power'))).toBeLessThanOrEqual(1e-12);
        const d = ok({ current: I(si(c, 'current')), power: P(si(c, 'power')) });
        expect(rel(si(d, 'voltage'), v)).toBeLessThanOrEqual(1e-12);
        expect(rel(si(d, 'resistance'), si(a, 'resistance'))).toBeLessThanOrEqual(1e-12);
      }),
      { numRuns: 200 },
    );
  });
  it('monotonic: at fixed R, more V never lowers I or P; at fixed V, more R never raises I or P; at fixed I, more R raises V and P', () => {
    fc.assert(
      fc.property(x, x, fc.double({ min: 1, max: 5, noNaN: true }), (v, r, f) => {
        const lo = ok({ voltage: V(v), resistance: R(r) });
        const hi = ok({ voltage: V(v * f), resistance: R(r) });
        expect(si(hi, 'current')).toBeGreaterThanOrEqual(si(lo, 'current'));
        expect(si(hi, 'power')).toBeGreaterThanOrEqual(si(lo, 'power'));
        const bigR = ok({ voltage: V(v), resistance: R(r * f) });
        expect(si(bigR, 'current')).toBeLessThanOrEqual(si(lo, 'current'));
        expect(si(bigR, 'power')).toBeLessThanOrEqual(si(lo, 'power'));
        const a = ok({ current: I(v), resistance: R(r) });
        const b = ok({ current: I(v), resistance: R(r * f) });
        expect(si(b, 'voltage')).toBeGreaterThanOrEqual(si(a, 'voltage'));
        expect(si(b, 'power')).toBeGreaterThanOrEqual(si(a, 'power'));
      }),
    );
  });
  it('scaling: doubling V at fixed R doubles I and quadruples P (1e-12)', () => {
    fc.assert(
      fc.property(x, x, (v, r) => {
        const a = ok({ voltage: V(v), resistance: R(r) });
        const b = ok({ voltage: V(2 * v), resistance: R(r) });
        expect(rel(si(b, 'current'), 2 * si(a, 'current'))).toBeLessThanOrEqual(1e-12);
        expect(rel(si(b, 'power'), 4 * si(a, 'power'))).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
  it('no NaN or Infinity anywhere for in-range inputs, any pairing; every output passes assertCalcResult', () => {
    fc.assert(
      fc.property(x, x, fc.integer({ min: 0, max: 5 }), (a, b, pairIdx) => {
        const pairs: [Key, Key][] = [['v', 'i'], ['v', 'r'], ['v', 'p'], ['i', 'r'], ['i', 'p'], ['r', 'p']];
        const [k1, k2] = pairs[pairIdx] as [Key, Key];
        const r = ok(inputsOf(pairOf(k1, a, k2, b)));
        for (const o of r.results) expect(Number.isFinite(o.value.si) && o.value.si > 0).toBe(true);
        for (const s of r.steps) expect(Number.isFinite(s.value.si)).toBe(true);
        expect(Number.isFinite(r.confidence.score)).toBe(true);
      }),
    );
  });
  it('deterministic, and the inputs are never mutated', () => {
    fc.assert(
      fc.property(x, x, (v, i) => {
        const input: Inputs = { voltage: V(v), current: I(i) };
        const before = JSON.stringify(input);
        const a = compute(input);
        const b = compute(input);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(JSON.stringify(input)).toBe(before);
      }),
    );
  });
});

describe('robustness near the representable range', () => {
  it('a result that overflows or underflows is an error value (OUT_OF_DOMAIN), never Infinity, zero or NaN; tiny positive resistance is accepted when everything stays finite', () => {
    const cases: [Inputs, boolean][] = [
      [{ voltage: V(1), resistance: R(Number.MIN_VALUE) }, false], // I = 1 / 5e-324 = Infinity
      [{ voltage: V(Number.MAX_VALUE), resistance: R(1e-300) }, false],
      [{ current: I(Number.MAX_VALUE), resistance: R(Number.MAX_VALUE) }, false],
      [{ voltage: V(1e-300), current: I(1e-300) }, false], // P underflows to 0
      [{ current: I(1), resistance: R(1e-300) }, true],
    ];
    for (const [inp, shouldBeOk] of cases) {
      let out: ReturnType<typeof compute>;
      try {
        out = compute(inp);
      } catch (e) {
        throw new Error(`compute threw: ${String(e)}`, { cause: e });
      }
      expect(out.ok, JSON.stringify(inp)).toBe(shouldBeOk);
      if (out.ok) {
        expect(assertCalcResult(out.value).ok).toBe(true);
        for (const r of out.value.results) expect(Number.isFinite(r.value.si) && r.value.si > 0).toBe(true);
      } else {
        expect('value' in out).toBe(false);
        expect(out.error.code).toBe('OUT_OF_DOMAIN');
      }
    }
  });
});

describe('performance sanity', () => {
  it('10 000 computes take under 1 s in total (100 us each; the SPEC allows 1 ms)', () => {
    const input: Inputs = { voltage: V(12), resistance: R(330) };
    compute(input);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(input).ok) n++;
    expect(n).toBe(10_000);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('meta', () => {
  it('formula is the four relations as text, from meta.formula (shown in the UI), and ledger S-019 only', () => {
    for (const s of ['V = I × R', 'P = V × I', 'P = I² × R', 'P = V² / R']) expect(meta.formula).toContain(s);
    const r = ok({ voltage: V(12), current: I(0.5) });
    expect(r.formula).toBe(meta.formula);
    expect(r.method).toBe(meta.method);
    expect(meta.id).toBe('ohm-power');
    expect(meta.title.trim().length).toBeGreaterThan(0);
    expect(meta.method.trim().length).toBeGreaterThan(0);
    expect(meta.accuracyClass).toBe('exact');
    expect([...meta.ledgerIds]).toEqual(['S-019']);
    expect([...meta.reference.ledgerIds]).toEqual(['S-019']);
    for (const id of meta.reference.ledgerIds) expect(LEDGER.some((r) => r.id === id), id).toBe(true);
    expect(meta.toleranceInputs).toEqual([]);
    expect(meta.reference.standard.trim().length).toBeGreaterThan(0);
    expect(meta.reference.edition.trim().length).toBeGreaterThan(0);
  });
  it('plausibility ranges (not a standard): V up to 1 kV, I up to 1 kA, R 1e-6 to 1e12 ohm, P up to 1 kW', () => {
    expect(meta.validity).toEqual({ voltageV: 1000, currentA: 1000, resistanceOhm: [1e-6, 1e12], powerW: 1000 });
  });
});
