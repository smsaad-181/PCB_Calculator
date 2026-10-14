import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { LEDGER } from '../../data/ledger';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';
import { TOL, allText, err, expectError, expectNoClaimWording, okOf, primaries, res, si, vec, vectors, warningText } from '../circuit-test-utils';

// Phase 1 task 8 slice 2, calculator 4 of 4: reactance of an ideal inductor or capacitor. TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py: x_l, x_c and the solves; vectors xl_*, xc_* in
// docs/golden-vectors.json) or from the textbook relations restated below: X_L = 2 pi f L, X_C = 1/(2 pi f C).
//
// CONTRACT: Inputs { kind: 'inductive' | 'capacitive' (required), reactance?, frequency?, inductance? (inductive) | capacitance? (capacitive) }.
//  Exactly two of reactance, frequency and the component value. Results always: reactance, frequency, inductance|capacitance (all
//  nominal); the solved one is primary. Reactance is a magnitude.

const mk = (n: number, dim: Quantity['dim']): Quantity => (Number.isFinite(n) ? q(n, dim) : ({ si: n, dim } as Quantity));
const X = (n: number): Quantity => mk(n, DIM.RESISTANCE);
const F = (n: number): Quantity => mk(n, DIM.FREQUENCY);
const L = (n: number): Quantity => mk(n, DIM.INDUCTANCE);
const C = (n: number): Quantity => mk(n, DIM.CAPACITANCE);
const ok = (i: Inputs) => okOf(compute, i);
const bad = (i: unknown, code: string, field?: string): string => expectError((x: unknown) => compute(x as Inputs), i, code, field);

// Mirrors tools/reference/ref_calcs.py case tables.
const XL_CASES: [number, number][] = [[1e3, 1e-3], [100e3, 10e-6], [50, 1], [2.4e9, 1e-9]];
const XC_CASES: [number, number][] = [[1e3, 1e-6], [100e6, 100e-12], [50, 100e-6], [1e6, 100e-9]];
const XL_SOLVE_F: [number, number][] = [[6.283185307179586, 1e-3], [100, 10e-6]];
const XL_SOLVE_L: [number, number][] = [[62.83185307179586, 1e3], [1, 1e6]];
const XC_SOLVE_F: [number, number][] = [[159.1549430918954, 1e-6], [1, 100e-12]];
const XC_SOLVE_C: [number, number][] = [[159.1549430918954, 1e3], [10, 1e6]];

describe('golden vectors (oracle)', () => {
  it('vectors loaded: all S-019 VERIFIED, tolerance 1e-9', () => {
    const own = vectors.filter((v) => v.name.startsWith('xl_') || v.name.startsWith('xc_'));
    expect(own).toHaveLength(XL_CASES.length + XC_CASES.length + XL_SOLVE_F.length + XL_SOLVE_L.length + XC_SOLVE_F.length + XC_SOLVE_C.length);
    for (const v of own) {
      expect(v.ledger_ids, v.name).toEqual(['S-019']);
      expect(v.status, v.name).toBe('VERIFIED');
      expect(v.rel_tol).toBeLessThanOrEqual(TOL);
    }
  });
  XL_CASES.forEach(([f, l], ci) => {
    it(`X_L case ${String(ci)}: f ${String(f)}, L ${String(l)}`, () => {
      const r = ok({ kind: 'inductive', frequency: F(f), inductance: L(l) });
      expect(err(si(r, 'reactance'), vec(`xl_c${String(ci)}_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(r)).toEqual(['reactance']);
      expect(r.dataStatus).toBe('VERIFIED');
      expect(r.reference.ledgerIds).toEqual(['S-019']);
      expect(r.confidence.level).toBe('high');
    });
  });
  XC_CASES.forEach(([f, c], ci) => {
    it(`X_C case ${String(ci)}: f ${String(f)}, C ${String(c)}`, () => {
      const r = ok({ kind: 'capacitive', frequency: F(f), capacitance: C(c) });
      expect(err(si(r, 'reactance'), vec(`xc_c${String(ci)}_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(r)).toEqual(['reactance']);
    });
  });
  XL_SOLVE_F.forEach(([x, l], ci) => {
    it(`X_L solve f, case ${String(ci)}`, () => {
      const r = ok({ kind: 'inductive', reactance: X(x), inductance: L(l) });
      expect(err(si(r, 'frequency'), vec(`xl_solve_f_c${String(ci)}_Hz`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(r)).toEqual(['frequency']);
    });
  });
  XL_SOLVE_L.forEach(([x, f], ci) => {
    it(`X_L solve L, case ${String(ci)}`, () => {
      const r = ok({ kind: 'inductive', reactance: X(x), frequency: F(f) });
      expect(err(si(r, 'inductance'), vec(`xl_solve_l_c${String(ci)}_H`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(r)).toEqual(['inductance']);
    });
  });
  XC_SOLVE_F.forEach(([x, c], ci) => {
    it(`X_C solve f, case ${String(ci)}`, () => {
      const r = ok({ kind: 'capacitive', reactance: X(x), capacitance: C(c) });
      expect(err(si(r, 'frequency'), vec(`xc_solve_f_c${String(ci)}_Hz`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(r)).toEqual(['frequency']);
    });
  });
  XC_SOLVE_C.forEach(([x, f], ci) => {
    it(`X_C solve C, case ${String(ci)}`, () => {
      const r = ok({ kind: 'capacitive', reactance: X(x), frequency: F(f) });
      expect(err(si(r, 'capacitance'), vec(`xc_solve_c_c${String(ci)}_F`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(r)).toEqual(['capacitance']);
    });
  });
});

describe('hand-checkable worked examples', () => {
  it('X_L of 1 mH at 1 kHz = 2 pi x 1000 x 0.001 = 6.2832 ohm; the same X_L needs 1 kHz back from 1 mH', () => {
    const r = ok({ kind: 'inductive', frequency: F(1e3), inductance: L(1e-3) });
    expect(err(si(r, 'reactance'), 6.283185307179586)).toBeLessThanOrEqual(1e-12);
    const back = ok({ kind: 'inductive', reactance: X(si(r, 'reactance')), inductance: L(1e-3) });
    expect(err(si(back, 'frequency'), 1e3)).toBeLessThanOrEqual(1e-12);
  });
  it('X_C of 1 uF at 1 kHz = 1/(2 pi x 1000 x 1e-6) = 159.155 ohm; 159.155 ohm at 1 uF is 1 kHz', () => {
    const r = ok({ kind: 'capacitive', frequency: F(1e3), capacitance: C(1e-6) });
    expect(err(si(r, 'reactance'), 159.15494309189535)).toBeLessThanOrEqual(1e-12);
  });
  it('a 10 uH inductor and a 100 nF capacitor have equal reactance (10 ohm) at their f0 = 159.155 kHz', () => {
    const f0 = 159154.94309189534;
    const l = ok({ kind: 'inductive', frequency: F(f0), inductance: L(10e-6) });
    const c = ok({ kind: 'capacitive', frequency: F(f0), capacitance: C(100e-9) });
    expect(err(si(l, 'reactance'), 10)).toBeLessThanOrEqual(1e-9);
    expect(err(si(c, 'reactance'), 10)).toBeLessThanOrEqual(1e-9);
  });
});

describe('contract details', () => {
  it('results are exactly reactance, frequency and the component (inductance or capacitance), all nominal', () => {
    const l = ok({ kind: 'inductive', frequency: F(1e3), inductance: L(1e-3) });
    expect(l.results.map((x) => x.name)).toEqual(['reactance', 'frequency', 'inductance']);
    const c = ok({ kind: 'capacitive', frequency: F(1e3), capacitance: C(1e-6) });
    expect(c.results.map((x) => x.name)).toEqual(['reactance', 'frequency', 'capacitance']);
    for (const x of [...l.results, ...c.results]) expect(x.bound).toBe('nominal');
    expect(res(l, 'reactance').value.dim).toEqual(DIM.RESISTANCE);
    expect(res(l, 'frequency').value.dim).toEqual(DIM.FREQUENCY);
  });
  it('says reactance is a magnitude, in assumptions and a warning, and keeps the 2 pi factor in the assumptions', () => {
    const r = ok({ kind: 'capacitive', frequency: F(1e3), capacitance: C(1e-6) });
    expect(r.assumptions.join(' ')).toContain('magnitude');
    expect(warningText(r)).toContain('magnitude');
    expect(r.warnings.some((w) => w.code === 'MAGNITUDE_ONLY')).toBe(true);
    expect(r.assumptions.join(' ')).toContain('2π');
  });
  it('ideal-component caution: no ESR, ESL or self-resonant frequency, with no built-in frequency threshold', () => {
    const r = ok({ kind: 'inductive', frequency: F(100e6), inductance: L(1e-6) });
    const t = warningText(r);
    expect(t).toContain('ESR');
    expect(t).toContain('ESL');
    expect(t).toContain('self-resonant');
    expect(r.warnings.some((w) => w.code === 'IDEAL_COMPONENT')).toBe(true);
    expect(allText(r)).toContain('manufacturer data');
  });
  it('formula text comes from meta per kind', () => {
    expect(ok({ kind: 'inductive', frequency: F(1e3), inductance: L(1e-3) }).formula).toBe(meta.formula.inductive);
    expect(ok({ kind: 'capacitive', frequency: F(1e3), capacitance: C(1e-6) }).formula).toBe(meta.formula.capacitive);
    expect(meta.formula.inductive).toContain('X_L = 2π × f × L');
    expect(meta.formula.capacitive).toContain('X_C = 1 / (2π × f × C)');
  });
  it('inputs are echoed with source user, only the two givens, named by the component', () => {
    const r = ok({ kind: 'capacitive', reactance: X(100), frequency: F(1e3) });
    expect(r.inputs.map((i) => i.name).sort()).toEqual(['frequency', 'reactance']);
    for (const i of r.inputs) expect(i.source).toBe('user');
    const l = ok({ kind: 'inductive', reactance: X(100), inductance: L(1e-3) });
    expect(l.inputs.map((i) => i.name).sort()).toEqual(['inductance', 'reactance']);
  });
  it('implausible values are flagged and rate low: 1 THz, or 1e-9 uF-style slips such as 1 fF', () => {
    expect(ok({ kind: 'inductive', frequency: F(1e12), inductance: L(1e-6) }).confidence.level).toBe('low');
    const r = ok({ kind: 'capacitive', frequency: F(1e3), capacitance: C(1e-16) });
    expect(r.confidence.level).toBe('low');
    expect(r.validityChecks.some((c) => !c.ok)).toBe(true);
  });
  it('steps labelled, non-empty and finite; no design values; no envelope', () => {
    const r = ok({ kind: 'inductive', reactance: X(10), frequency: F(1e6) });
    expect(r.steps.length).toBeGreaterThanOrEqual(1);
    for (const s of r.steps) {
      expect(s.label.trim().length).toBeGreaterThan(0);
      expect(s.expr.trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(s.value.si)).toBe(true);
    }
    expect(r.designValues).toEqual([]);
    expect(r.envelope).toBeUndefined();
  });
});

describe('errors are values (guards)', () => {
  const xl = { kind: 'inductive' as const, frequency: F(1e3), inductance: L(1e-3) };
  const xc = { kind: 'capacitive' as const, frequency: F(1e3), capacitance: C(1e-6) };
  it('kind is required and must be inductive or capacitive', () => {
    bad({ frequency: F(1e3), inductance: L(1e-3) }, 'INVALID_INPUT', 'kind');
    bad({ ...xl, kind: 'resistive' }, 'INVALID_INPUT', 'kind');
    bad({ ...xl, kind: 'L' }, 'INVALID_INPUT', 'kind');
    bad({ ...xl, kind: 1 }, 'INVALID_INPUT', 'kind');
    bad(null, 'INVALID_INPUT', 'inputs');
    bad([], 'INVALID_INPUT');
  });
  it('each quantity rejects zero, negative, NaN, Infinity and the wrong dimension', () => {
    for (const x of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      bad({ ...xl, frequency: F(x) }, 'INVALID_INPUT', 'frequency');
      bad({ ...xl, inductance: L(x) }, 'INVALID_INPUT', 'inductance');
      bad({ ...xc, capacitance: C(x) }, 'INVALID_INPUT', 'capacitance');
      bad({ kind: 'inductive', reactance: X(x), frequency: F(1e3) }, 'INVALID_INPUT', 'reactance');
    }
    bad({ ...xl, frequency: L(1) }, 'DIMENSION', 'frequency');
    bad({ ...xl, inductance: C(1) }, 'DIMENSION', 'inductance');
    bad({ ...xc, capacitance: L(1) }, 'DIMENSION', 'capacitance');
    bad({ kind: 'inductive', reactance: F(1), frequency: F(1e3) }, 'DIMENSION', 'reactance');
    bad({ ...xl, inductance: q(Number.MIN_VALUE / 2, DIM.INDUCTANCE) }, 'INVALID_INPUT', 'inductance');
  });
  it('exactly two of three: zero, one, or three given (consistent or not) is rejected with a clear message', () => {
    expect(bad({ kind: 'inductive' }, 'INVALID_INPUT', 'inputs')).toContain('exactly two');
    bad({ kind: 'capacitive', frequency: F(1) }, 'INVALID_INPUT', 'inputs');
    const x = 2 * Math.PI * 1e3 * 1e-3;
    expect(bad({ ...xl, reactance: X(x) }, 'INVALID_INPUT', 'inputs')).toContain('over-specified');
    expect(bad({ ...xl, reactance: X(x) }, 'INVALID_INPUT', 'inputs')).not.toContain('inconsistent');
    expect(bad({ ...xl, reactance: X(5) }, 'INVALID_INPUT', 'inputs')).toContain('inconsistent');
    const xcv = 1 / (2 * Math.PI * 1e3 * 1e-6);
    expect(bad({ ...xc, reactance: X(xcv) }, 'INVALID_INPUT', 'inputs')).not.toContain('inconsistent');
    expect(bad({ ...xc, reactance: X(5) }, 'INVALID_INPUT', 'inputs')).toContain('inconsistent');
  });
  it('the wrong component for the kind is rejected by name', () => {
    expect(bad({ ...xl, capacitance: C(1e-6) }, 'INVALID_INPUT', 'capacitance')).toContain('not used for inductive');
    expect(bad({ ...xc, inductance: L(1e-3) }, 'INVALID_INPUT', 'inductance')).toContain('not used for capacitive');
  });
  it('overflow and underflow are error values', () => {
    bad({ kind: 'inductive', frequency: F(Number.MAX_VALUE), inductance: L(Number.MAX_VALUE) }, 'OUT_OF_DOMAIN');
    bad({ kind: 'inductive', frequency: F(1e-300), inductance: L(1e-300) }, 'OUT_OF_DOMAIN');
    bad({ kind: 'inductive', reactance: X(1e-300), inductance: L(Number.MAX_VALUE) }, 'OUT_OF_DOMAIN');
    bad({ kind: 'inductive', reactance: X(Number.MAX_VALUE), frequency: F(1e-300) }, 'OUT_OF_DOMAIN');
    bad({ kind: 'capacitive', frequency: F(Number.MAX_VALUE), capacitance: C(Number.MAX_VALUE) }, 'OUT_OF_DOMAIN');
    bad({ kind: 'capacitive', frequency: F(1e-300), capacitance: C(1e-300) }, 'OUT_OF_DOMAIN');
    bad({ kind: 'capacitive', reactance: X(Number.MAX_VALUE), capacitance: C(Number.MAX_VALUE) }, 'OUT_OF_DOMAIN');
    bad({ kind: 'capacitive', reactance: X(Number.MAX_VALUE), frequency: F(Number.MAX_VALUE) }, 'OUT_OF_DOMAIN');
  });
});

describe('properties (fast-check)', () => {
  const dec = (lo: number, hi: number) => fc.double({ min: lo, max: hi, noNaN: true }).map((e) => 10 ** e);
  const fA = dec(0, 9);
  const lA = dec(-9, -2);
  const cA = dec(-12, -3);
  const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

  it('X_L round trip: (f, L) -> X; (X, L) -> f; (X, f) -> L (1e-12)', () => {
    fc.assert(
      fc.property(fA, lA, (f, l) => {
        const a = ok({ kind: 'inductive', frequency: F(f), inductance: L(l) });
        expect(rel(si(ok({ kind: 'inductive', reactance: X(si(a, 'reactance')), inductance: L(l) }), 'frequency'), f)).toBeLessThanOrEqual(1e-12);
        expect(rel(si(ok({ kind: 'inductive', reactance: X(si(a, 'reactance')), frequency: F(f) }), 'inductance'), l)).toBeLessThanOrEqual(1e-12);
      }),
      { numRuns: 300 },
    );
  });
  it('X_C round trip: (f, C) -> X; (X, C) -> f; (X, f) -> C (1e-12)', () => {
    fc.assert(
      fc.property(fA, cA, (f, c) => {
        const a = ok({ kind: 'capacitive', frequency: F(f), capacitance: C(c) });
        expect(rel(si(ok({ kind: 'capacitive', reactance: X(si(a, 'reactance')), capacitance: C(c) }), 'frequency'), f)).toBeLessThanOrEqual(1e-12);
        expect(rel(si(ok({ kind: 'capacitive', reactance: X(si(a, 'reactance')), frequency: F(f) }), 'capacitance'), c)).toBeLessThanOrEqual(1e-12);
      }),
      { numRuns: 300 },
    );
  });
  it('X_L rises with f and L; X_C falls with f and C; doubling f doubles X_L and halves X_C (1e-12)', () => {
    fc.assert(
      fc.property(fA, lA, cA, fc.double({ min: 1.01, max: 10, noNaN: true }), (f, l, c, k) => {
        const xl0 = si(ok({ kind: 'inductive', frequency: F(f), inductance: L(l) }), 'reactance');
        expect(si(ok({ kind: 'inductive', frequency: F(f * k), inductance: L(l) }), 'reactance')).toBeGreaterThan(xl0);
        expect(si(ok({ kind: 'inductive', frequency: F(f), inductance: L(l * k) }), 'reactance')).toBeGreaterThan(xl0);
        expect(rel(si(ok({ kind: 'inductive', frequency: F(2 * f), inductance: L(l) }), 'reactance'), 2 * xl0)).toBeLessThanOrEqual(1e-12);
        const xc0 = si(ok({ kind: 'capacitive', frequency: F(f), capacitance: C(c) }), 'reactance');
        expect(si(ok({ kind: 'capacitive', frequency: F(f * k), capacitance: C(c) }), 'reactance')).toBeLessThan(xc0);
        expect(si(ok({ kind: 'capacitive', frequency: F(f), capacitance: C(c * k) }), 'reactance')).toBeLessThan(xc0);
        expect(rel(si(ok({ kind: 'capacitive', frequency: F(2 * f), capacitance: C(c) }), 'reactance'), xc0 / 2)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
  it('X_L x X_C at the same f equals L / C (the sqrt(L/C) identity), and equal reactances occur at f0 = 1/(2 pi sqrt(L C))', () => {
    fc.assert(
      fc.property(fA, lA, cA, (f, l, c) => {
        const xl = si(ok({ kind: 'inductive', frequency: F(f), inductance: L(l) }), 'reactance');
        const xc = si(ok({ kind: 'capacitive', frequency: F(f), capacitance: C(c) }), 'reactance');
        expect(rel(xl * xc, l / c)).toBeLessThanOrEqual(1e-12);
        const f0 = 1 / (2 * Math.PI * Math.sqrt(l * c));
        const a = si(ok({ kind: 'inductive', frequency: F(f0), inductance: L(l) }), 'reactance');
        const b = si(ok({ kind: 'capacitive', frequency: F(f0), capacitance: C(c) }), 'reactance');
        expect(rel(a, b)).toBeLessThanOrEqual(1e-9);
      }),
    );
  });
  it('no NaN or Infinity anywhere for in-range inputs; deterministic; inputs never mutated', () => {
    fc.assert(
      fc.property(fA, lA, cA, (f, l, c) => {
        for (const input of [{ kind: 'inductive', frequency: F(f), inductance: L(l) }, { kind: 'capacitive', frequency: F(f), capacitance: C(c) }] as Inputs[]) {
          const before = JSON.stringify(input);
          expect(JSON.stringify(compute(input))).toBe(JSON.stringify(compute(input)));
          expect(JSON.stringify(input)).toBe(before);
          const x = ok(input);
          for (const o of x.results) expect(Number.isFinite(o.value.si) && o.value.si > 0).toBe(true);
          for (const s of x.steps) expect(Number.isFinite(s.value.si)).toBe(true);
        }
      }),
    );
  });
});

describe('wording, performance, meta', () => {
  it('no compliance or readiness claim anywhere in a result', () => {
    for (const i of [{ kind: 'inductive', frequency: F(1e3), inductance: L(1e-3) }, { kind: 'capacitive', frequency: F(1e3), capacitance: C(1e-6) }] as Inputs[]) expectNoClaimWording(ok(i));
  });
  it('10 000 computes take under 1 s in total', () => {
    const input: Inputs = { kind: 'capacitive', frequency: F(1e3), capacitance: C(1e-6) };
    compute(input);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(input).ok) n++;
    expect(n).toBe(10_000);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  it('meta: id, accuracy class, ledger S-019 only and it exists, no tolerance inputs', () => {
    expect(meta.id).toBe('reactance');
    expect(meta.accuracyClass).toBe('exact');
    expect([...meta.ledgerIds]).toEqual(['S-019']);
    expect([...meta.reference.ledgerIds]).toEqual(['S-019']);
    for (const id of meta.ledgerIds) expect(LEDGER.some((x) => x.id === id), id).toBe(true);
    expect(meta.toleranceInputs).toEqual([]);
  });
});
