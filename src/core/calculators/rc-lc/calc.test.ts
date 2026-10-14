import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { LEDGER } from '../../data/ledger';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';
import { TOL, allText, err, expectError, expectNoClaimWording, has, okOf, primaries, res, si, vec, vectors, warningText } from '../circuit-test-utils';

// Phase 1 task 8 slice 2, calculator 3 of 4: RC and LC. TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py: rc_*, lc_*; vectors rc_*, lc_* in
// docs/golden-vectors.json) or from the textbook relations restated below: tau = R C, fc = 1/(2 pi R C), f0 = 1/(2 pi sqrt(L C)),
// sqrt(L/C). The 10-90 % rise time and Q are deliberately not provided (no ledger row covers them).
//
// CONTRACT: Inputs { family: 'rc' | 'lc' (required), resistance?, capacitance?, inductance?, frequency? }.
//  Exactly two of {resistance, capacitance, frequency} (rc) or {inductance, capacitance, frequency} (lc); frequency is fc (rc) or f0 (lc).
//  rc results: resistance, capacitance, fc, tau. lc results: inductance, capacitance, f0, 'sqrt(L/C) (= X_L = X_C at f0)'.
//  Primary: the solved quantity. rc dataStatus VERIFIED (S-019); lc dataStatus UNVERIFIED (S-019b), so the lc confidence is at most medium.

const mk = (n: number, dim: Quantity['dim']): Quantity => (Number.isFinite(n) ? q(n, dim) : ({ si: n, dim } as Quantity));
const R = (n: number): Quantity => mk(n, DIM.RESISTANCE);
const C = (n: number): Quantity => mk(n, DIM.CAPACITANCE);
const L = (n: number): Quantity => mk(n, DIM.INDUCTANCE);
const F = (n: number): Quantity => mk(n, DIM.FREQUENCY);
const ok = (i: Inputs) => okOf(compute, i);
const bad = (i: unknown, code: string, field?: string): string => expectError((x: unknown) => compute(x as Inputs), i, code, field);
const Z0 = '√(L/C) (= X_L = X_C at f0)';

// Mirrors tools/reference/ref_calcs.py case tables.
const RC_CASES: [number, number][] = [[1e3, 1e-6], [10e3, 100e-9], [4.7e3, 47e-12], [500, 7e-6], [100, 10e-12]];
const RC_SOLVE_R: [number, number][] = [[1e3, 100e-9], [159.1549430918954, 1e-6], [10e6, 10e-12]];
const RC_SOLVE_C: [number, number][] = [[1e3, 1e3], [50, 10e3], [2.4e6, 50]];
const LC_CASES: [number, number][] = [[10e-6, 100e-9], [1e-3, 1e-6], [100e-9, 10e-12], [4.7e-6, 22e-6]];
const LC_SOLVE_L: [number, number][] = [[1e6, 100e-9], [50e3, 1e-6], [13.56e6, 100e-12]];
const LC_SOLVE_C: [number, number][] = [[1e6, 10e-6], [455e3, 1e-3], [100e6, 47e-9]];

describe('golden vectors (oracle): RC', () => {
  it('vectors loaded: all S-019 VERIFIED, tolerance 1e-9', () => {
    const own = vectors.filter((v) => v.name.startsWith('rc_'));
    expect(own).toHaveLength(RC_CASES.length * 2 + RC_SOLVE_R.length + RC_SOLVE_C.length);
    for (const v of own) {
      expect(v.ledger_ids, v.name).toEqual(['S-019']);
      expect(v.status, v.name).toBe('VERIFIED');
      expect(v.rel_tol).toBeLessThanOrEqual(TOL);
    }
  });
  RC_CASES.forEach(([r, c], ci) => {
    it(`tau and fc, case ${String(ci)}: R ${String(r)}, C ${String(c)}`, () => {
      const a = ok({ family: 'rc', resistance: R(r), capacitance: C(c) });
      expect(err(si(a, 'tau'), vec(`rc_c${String(ci)}_tau_s`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(err(si(a, 'fc'), vec(`rc_c${String(ci)}_fc_Hz`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(a)).toEqual(['fc']);
      expect(a.dataStatus).toBe('VERIFIED');
      expect(a.reference.ledgerIds).toEqual(['S-019']);
      // the same circuit from (R, fc) and (C, fc) returns the other component
      const b = ok({ family: 'rc', resistance: R(r), frequency: F(si(a, 'fc')) });
      expect(err(si(b, 'capacitance'), c)).toBeLessThanOrEqual(1e-12);
      expect(primaries(b)).toEqual(['capacitance']);
      const d = ok({ family: 'rc', capacitance: C(c), frequency: F(si(a, 'fc')) });
      expect(err(si(d, 'resistance'), r)).toBeLessThanOrEqual(1e-12);
    });
  });
  RC_SOLVE_R.forEach(([fc, c], ci) => {
    it(`solve R, case ${String(ci)}`, () => {
      const a = ok({ family: 'rc', frequency: F(fc), capacitance: C(c) });
      expect(err(si(a, 'resistance'), vec(`rc_solve_r_c${String(ci)}_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(a)).toEqual(['resistance']);
      expect(err(si(a, 'fc'), fc)).toBeLessThanOrEqual(1e-12);
    });
  });
  RC_SOLVE_C.forEach(([fc, r], ci) => {
    it(`solve C, case ${String(ci)}`, () => {
      const a = ok({ family: 'rc', frequency: F(fc), resistance: R(r) });
      expect(err(si(a, 'capacitance'), vec(`rc_solve_c_c${String(ci)}_F`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(a)).toEqual(['capacitance']);
    });
  });
});

describe('golden vectors (oracle): LC', () => {
  it('vectors loaded: f0 and the solved L, C are S-019 VERIFIED; every sqrt(L/C) vector adds S-019b and is UNVERIFIED', () => {
    const own = vectors.filter((v) => v.name.startsWith('lc_'));
    expect(own).toHaveLength(LC_CASES.length * 2 + LC_SOLVE_L.length * 2 + LC_SOLVE_C.length * 2);
    for (const v of own) {
      const z = v.name.endsWith('_z0_ohm');
      expect(v.ledger_ids, v.name).toEqual(z ? ['S-019', 'S-019b'] : ['S-019']);
      expect(v.status, v.name).toBe(z ? 'UNVERIFIED' : 'VERIFIED');
      expect(v.rel_tol).toBeLessThanOrEqual(TOL);
    }
  });
  LC_CASES.forEach(([l, c], ci) => {
    it(`f0 and sqrt(L/C), case ${String(ci)}: L ${String(l)}, C ${String(c)}`, () => {
      const a = ok({ family: 'lc', inductance: L(l), capacitance: C(c) });
      expect(err(si(a, 'f0'), vec(`lc_c${String(ci)}_f0_Hz`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(err(si(a, Z0), vec(`lc_c${String(ci)}_z0_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(a)).toEqual(['f0']);
      expect(a.dataStatus).toBe('UNVERIFIED');
      expect(a.reference.ledgerIds).toEqual(['S-019', 'S-019b']);
      // X_L = X_C = sqrt(L/C) at f0 (the identity behind the label)
      expect(err(2 * Math.PI * si(a, 'f0') * l, si(a, Z0))).toBeLessThanOrEqual(1e-12);
      expect(err(1 / (2 * Math.PI * si(a, 'f0') * c), si(a, Z0))).toBeLessThanOrEqual(1e-12);
    });
  });
  LC_SOLVE_L.forEach(([f0, c], ci) => {
    it(`solve L, case ${String(ci)}`, () => {
      const a = ok({ family: 'lc', frequency: F(f0), capacitance: C(c) });
      expect(err(si(a, 'inductance'), vec(`lc_solve_l_c${String(ci)}_H`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(err(si(a, Z0), vec(`lc_solve_l_c${String(ci)}_z0_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(a)).toEqual(['inductance']);
      expect(err(si(a, 'f0'), f0)).toBeLessThanOrEqual(1e-12);
    });
  });
  LC_SOLVE_C.forEach(([f0, l], ci) => {
    it(`solve C, case ${String(ci)}`, () => {
      const a = ok({ family: 'lc', frequency: F(f0), inductance: L(l) });
      expect(err(si(a, 'capacitance'), vec(`lc_solve_c_c${String(ci)}_F`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(err(si(a, Z0), vec(`lc_solve_c_c${String(ci)}_z0_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(a)).toEqual(['capacitance']);
    });
  });
});

describe('hand-checkable worked examples', () => {
  it('RC: 1 kohm and 1 uF give tau = 1 ms and fc = 1/(2 pi x 1e-3) = 159.155 Hz', () => {
    const r = ok({ family: 'rc', resistance: R(1e3), capacitance: C(1e-6) });
    expect(err(si(r, 'tau'), 1e-3)).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, 'fc'), 159.15494309189535)).toBeLessThanOrEqual(1e-12);
  });
  it('RC: 500 ohm and 7 uF give 45.4728 Hz, the worked value in the textbook source (ledger S-019 note)', () => {
    const r = ok({ family: 'rc', resistance: R(500), capacitance: C(7e-6) });
    expect(err(si(r, 'fc'), 45.4728)).toBeLessThan(1e-5);
  });
  it('LC: 10 uH and 100 nF give f0 = 1/(2 pi sqrt(1e-12)) = 159.155 kHz and sqrt(L/C) = sqrt(100) = 10 ohm', () => {
    const r = ok({ family: 'lc', inductance: L(10e-6), capacitance: C(100e-9) });
    expect(err(si(r, 'f0'), 159154.94309189534)).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, Z0), 10)).toBeLessThanOrEqual(1e-12);
  });
  it('LC: 1 MHz with 100 nF needs L = 1/((2 pi 1e6)^2 x 1e-7) = 253.3 nH', () => {
    const r = ok({ family: 'lc', frequency: F(1e6), capacitance: C(100e-9) });
    expect(err(si(r, 'inductance'), 2.533029591058444e-7)).toBeLessThanOrEqual(1e-12);
  });
});

describe('contract details', () => {
  it('RC results are exactly resistance, capacitance, fc, tau (all nominal); no rise time and no Q', () => {
    const r = ok({ family: 'rc', resistance: R(1e3), capacitance: C(1e-6) });
    expect(r.results.map((x) => x.name)).toEqual(['resistance', 'capacitance', 'fc', 'tau']);
    for (const x of r.results) expect(x.bound).toBe('nominal');
    expect(has(r, 'rise time')).toBe(false);
    expect(allText(r)).toContain('10-90 % rise time is not provided');
    expect(JSON.stringify(r)).not.toContain('2.197');
  });
  it('LC results are exactly inductance, capacitance, f0 and the sqrt(L/C) result; no Q', () => {
    const r = ok({ family: 'lc', inductance: L(10e-6), capacitance: C(100e-9) });
    expect(r.results.map((x) => x.name)).toEqual(['inductance', 'capacitance', 'f0', Z0]);
    expect(res(r, Z0).value.dim).toEqual(DIM.RESISTANCE);
    expect(allText(r)).toContain('Q is not provided');
  });
  it('the sqrt(L/C) result is labelled as sqrt(L/C) (= X_L = X_C at f0); "characteristic impedance" appears only in the naming note, never as a result name, and the note says it is not a line impedance', () => {
    const r = ok({ family: 'lc', inductance: L(10e-6), capacitance: C(100e-9) });
    for (const x of r.results) expect(x.name.toLowerCase()).not.toContain('characteristic');
    for (const s of r.steps) expect(s.label.toLowerCase()).not.toContain('characteristic');
    const note = r.warnings.find((w) => w.code === 'Z0_NAMING');
    expect(note?.message).toContain('S-019b');
    expect(note?.message).toContain('UNVERIFIED');
    expect(note?.message).toContain('not a transmission-line impedance');
  });
  it('LC confidence is lower than RC confidence for the same-size problem because S-019b is UNVERIFIED (rule-based: RC high, LC medium)', () => {
    const rc = ok({ family: 'rc', resistance: R(1e3), capacitance: C(1e-6) });
    const lc = ok({ family: 'lc', inductance: L(10e-6), capacitance: C(100e-9) });
    expect(rc.confidence.level).toBe('high');
    expect(rc.confidence.score).toBe(0);
    expect(lc.confidence.level).toBe('medium');
    expect(lc.confidence.score).toBe(1);
    expect(lc.confidence.reasons.join(' ')).toContain('UNVERIFIED');
  });
  it('parasitics-ignored warning appears in both families and in assumptions', () => {
    for (const r of [ok({ family: 'rc', resistance: R(1e3), capacitance: C(1e-6) }), ok({ family: 'lc', inductance: L(10e-6), capacitance: C(100e-9) })]) {
      expect(r.warnings.some((w) => w.code === 'PARASITICS_IGNORED')).toBe(true);
      expect(warningText(r)).toContain('ESR');
      expect(warningText(r)).toContain('self-resonant');
      expect(r.assumptions.join(' ')).toContain('parasitics are ignored');
    }
  });
  it('RC assumptions: fc is the -3 dB point of a single unloaded first-order section', () => {
    const t = ok({ family: 'rc', resistance: R(1e3), capacitance: C(1e-6) }).assumptions.join(' ');
    expect(t).toContain('−3 dB');
    expect(t).toContain('Single unloaded first-order');
  });
  it('inputs are echoed with source user, only the two givens', () => {
    const r = ok({ family: 'lc', inductance: L(10e-6), frequency: F(1e6) });
    expect(r.inputs.map((i) => i.name).sort()).toEqual(['frequency', 'inductance']);
    for (const i of r.inputs) expect(i.source).toBe('user');
  });
  it('implausible values are flagged and rate low: 10 THz, 1 fH, 1e15 ohm', () => {
    const a = ok({ family: 'lc', inductance: L(1e-15), capacitance: C(1e-15) });
    expect(a.confidence.level).toBe('low');
    expect(a.validityChecks.some((c) => !c.ok)).toBe(true);
    expect(ok({ family: 'rc', resistance: R(1e15), capacitance: C(1e-6) }).confidence.level).toBe('low');
  });
  it('steps are labelled, non-empty and finite; no design values and no envelope', () => {
    for (const r of [ok({ family: 'rc', frequency: F(1e3), capacitance: C(1e-7) }), ok({ family: 'lc', frequency: F(1e6), capacitance: C(1e-7) })]) {
      expect(r.steps.length).toBeGreaterThanOrEqual(2);
      for (const s of r.steps) {
        expect(s.label.trim().length).toBeGreaterThan(0);
        expect(s.expr.trim().length).toBeGreaterThan(0);
        expect(Number.isFinite(s.value.si)).toBe(true);
      }
      expect(r.designValues).toEqual([]);
      expect(r.envelope).toBeUndefined();
    }
  });
});

describe('errors are values (guards)', () => {
  const rc = { family: 'rc' as const, resistance: R(1e3), capacitance: C(1e-6) };
  const lc = { family: 'lc' as const, inductance: L(10e-6), capacitance: C(100e-9) };
  it('family is required and must be rc or lc', () => {
    bad({ resistance: R(1e3), capacitance: C(1e-6) }, 'INVALID_INPUT', 'family');
    bad({ ...rc, family: 'rlc' }, 'INVALID_INPUT', 'family');
    bad({ ...rc, family: 'RC' }, 'INVALID_INPUT', 'family');
    bad({ ...rc, family: 3 }, 'INVALID_INPUT', 'family');
    bad(null, 'INVALID_INPUT', 'inputs');
    bad('rc', 'INVALID_INPUT', 'inputs');
  });
  it('each quantity rejects zero, negative, NaN, Infinity and the wrong dimension, in both families', () => {
    for (const x of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      bad({ ...rc, resistance: R(x) }, 'INVALID_INPUT', 'resistance');
      bad({ ...rc, capacitance: C(x) }, 'INVALID_INPUT', 'capacitance');
      bad({ family: 'rc', resistance: R(1e3), frequency: F(x) }, 'INVALID_INPUT', 'frequency');
      bad({ ...lc, inductance: L(x) }, 'INVALID_INPUT', 'inductance');
      bad({ ...lc, capacitance: C(x) }, 'INVALID_INPUT', 'capacitance');
      bad({ family: 'lc', inductance: L(10e-6), frequency: F(x) }, 'INVALID_INPUT', 'frequency');
    }
    bad({ ...rc, resistance: C(1e-6) }, 'DIMENSION', 'resistance');
    bad({ ...rc, capacitance: R(1e3) }, 'DIMENSION', 'capacitance');
    bad({ ...lc, inductance: C(1e-6) }, 'DIMENSION', 'inductance');
    bad({ family: 'lc', inductance: L(10e-6), frequency: R(1) }, 'DIMENSION', 'frequency');
    bad({ ...rc, resistance: q(Number.MIN_VALUE / 2, DIM.RESISTANCE) }, 'INVALID_INPUT', 'resistance');
  });
  it('exactly two of three: zero, one, or three given (consistent or not) is rejected with a clear message', () => {
    expect(bad({ family: 'rc' }, 'INVALID_INPUT', 'inputs')).toContain('exactly two');
    bad({ family: 'rc', resistance: R(1) }, 'INVALID_INPUT', 'inputs');
    bad({ family: 'lc', frequency: F(1) }, 'INVALID_INPUT', 'inputs');
    const fc = 1 / (2 * Math.PI * 1e3 * 1e-6);
    expect(bad({ ...rc, frequency: F(fc) }, 'INVALID_INPUT', 'inputs')).toContain('over-specified');
    expect(bad({ ...rc, frequency: F(fc) }, 'INVALID_INPUT', 'inputs')).not.toContain('inconsistent');
    expect(bad({ ...rc, frequency: F(50) }, 'INVALID_INPUT', 'inputs')).toContain('inconsistent');
    const f0 = 1 / (2 * Math.PI * Math.sqrt(10e-6 * 100e-9));
    expect(bad({ ...lc, frequency: F(f0) }, 'INVALID_INPUT', 'inputs')).not.toContain('inconsistent');
    expect(bad({ ...lc, frequency: F(1) }, 'INVALID_INPUT', 'inputs')).toContain('inconsistent');
  });
  it('a quantity that belongs to the other family is rejected by name (inductance in rc, resistance in lc)', () => {
    expect(bad({ ...rc, inductance: L(1e-6) }, 'INVALID_INPUT', 'inductance')).toContain('not used by the RC family');
    expect(bad({ ...lc, resistance: R(1) }, 'INVALID_INPUT', 'resistance')).toContain('not used by the LC family');
  });
  it('overflow and underflow are error values', () => {
    bad({ family: 'rc', resistance: R(Number.MAX_VALUE), capacitance: C(Number.MAX_VALUE) }, 'OUT_OF_DOMAIN');
    bad({ family: 'rc', resistance: R(1e-300), capacitance: C(1e-300) }, 'OUT_OF_DOMAIN');
    bad({ family: 'lc', inductance: L(1e-300), capacitance: C(1e-300) }, 'OUT_OF_DOMAIN');
    bad({ family: 'lc', inductance: L(Number.MAX_VALUE), capacitance: C(Number.MAX_VALUE) }, 'OUT_OF_DOMAIN');
    bad({ family: 'lc', frequency: F(Number.MAX_VALUE), capacitance: C(1e-3) }, 'OUT_OF_DOMAIN');
    bad({ family: 'lc', frequency: F(Number.MAX_VALUE), inductance: L(1e-3) }, 'OUT_OF_DOMAIN');
    bad({ family: 'rc', frequency: F(Number.MAX_VALUE), capacitance: C(Number.MAX_VALUE) }, 'OUT_OF_DOMAIN');
    bad({ family: 'rc', frequency: F(Number.MIN_VALUE * 4), capacitance: C(1e-300) }, 'OUT_OF_DOMAIN');
  });
});

describe('properties (fast-check)', () => {
  const dec = (lo: number, hi: number) => fc.double({ min: lo, max: hi, noNaN: true }).map((e) => 10 ** e);
  const rA = dec(0, 7);
  const cA = dec(-12, -3);
  const lA = dec(-9, -2);
  const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

  it('RC round trip: (R, C) -> fc; (R, fc) -> C; (C, fc) -> R; all agree (1e-12); fc x tau = 1 / (2 pi)', () => {
    fc.assert(
      fc.property(rA, cA, (r, c) => {
        const a = ok({ family: 'rc', resistance: R(r), capacitance: C(c) });
        expect(rel(si(a, 'fc') * si(a, 'tau'), 1 / (2 * Math.PI))).toBeLessThanOrEqual(1e-12);
        expect(rel(si(ok({ family: 'rc', resistance: R(r), frequency: F(si(a, 'fc')) }), 'capacitance'), c)).toBeLessThanOrEqual(1e-12);
        expect(rel(si(ok({ family: 'rc', capacitance: C(c), frequency: F(si(a, 'fc')) }), 'resistance'), r)).toBeLessThanOrEqual(1e-12);
      }),
      { numRuns: 300 },
    );
  });
  it('LC round trip: (L, C) -> f0; (f0, C) -> L; (f0, L) -> C; all agree (1e-9, the square root and square lose a few ulps)', () => {
    fc.assert(
      fc.property(lA, cA, (l, c) => {
        const a = ok({ family: 'lc', inductance: L(l), capacitance: C(c) });
        expect(rel(si(ok({ family: 'lc', frequency: F(si(a, 'f0')), capacitance: C(c) }), 'inductance'), l)).toBeLessThanOrEqual(1e-9);
        expect(rel(si(ok({ family: 'lc', frequency: F(si(a, 'f0')), inductance: L(l) }), 'capacitance'), c)).toBeLessThanOrEqual(1e-9);
        // f0 x sqrt(L/C) x 2 pi x C = 1
        expect(rel(2 * Math.PI * si(a, 'f0') * si(a, Z0) * c, 1)).toBeLessThanOrEqual(1e-9);
      }),
      { numRuns: 300 },
    );
  });
  it('monotonic: more R or C lowers fc; more L or C lowers f0; fc and f0 scale as 1/x and 1/sqrt(x)', () => {
    fc.assert(
      fc.property(rA, cA, lA, fc.double({ min: 1.01, max: 10, noNaN: true }), (r, c, l, k) => {
        const fc0 = si(ok({ family: 'rc', resistance: R(r), capacitance: C(c) }), 'fc');
        const fc1 = si(ok({ family: 'rc', resistance: R(r * k), capacitance: C(c) }), 'fc');
        expect(fc1).toBeLessThan(fc0);
        expect(rel(fc1 * k, fc0)).toBeLessThanOrEqual(1e-12);
        const f0 = si(ok({ family: 'lc', inductance: L(l), capacitance: C(c) }), 'f0');
        const f1 = si(ok({ family: 'lc', inductance: L(l * k), capacitance: C(c) }), 'f0');
        expect(f1).toBeLessThan(f0);
        expect(rel(f1 * Math.sqrt(k), f0)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
  it('no NaN or Infinity anywhere for in-range inputs; deterministic; inputs never mutated', () => {
    fc.assert(
      fc.property(rA, cA, lA, (r, c, l) => {
        for (const input of [{ family: 'rc', resistance: R(r), capacitance: C(c) }, { family: 'lc', inductance: L(l), capacitance: C(c) }] as Inputs[]) {
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
    for (const i of [{ family: 'rc', resistance: R(1e3), capacitance: C(1e-6) }, { family: 'lc', inductance: L(10e-6), capacitance: C(100e-9) }] as Inputs[]) expectNoClaimWording(ok(i));
  });
  it('10 000 computes stay within a 5 s total budget', () => {
    const input: Inputs = { family: 'lc', inductance: L(10e-6), capacitance: C(100e-9) };
    compute(input);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(input).ok) n++;
    expect(n).toBe(10_000);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
  it('meta: formula text per family, ledger rows exist, accuracy class, S-019b only on the LC family', () => {
    expect(meta.formula.rc).toContain('fc = 1 / (2π × R × C)');
    expect(meta.formula.rc).toContain('τ = R × C');
    expect(meta.formula.lc).toContain('f0 = 1 / (2π × √(L × C))');
    expect(meta.formula.lc).toContain('√(L/C)');
    expect(ok({ family: 'rc', resistance: R(1e3), capacitance: C(1e-6) }).formula).toBe(meta.formula.rc);
    expect(ok({ family: 'lc', inductance: L(10e-6), capacitance: C(100e-9) }).formula).toBe(meta.formula.lc);
    expect(meta.id).toBe('rc-lc');
    expect(meta.accuracyClass).toBe('exact');
    expect([...meta.ledgerIds]).toEqual(['S-019', 'S-019b']);
    expect([...meta.familyLedgerIds.rc]).toEqual(['S-019']);
    expect([...meta.familyLedgerIds.lc]).toEqual(['S-019', 'S-019b']);
    for (const id of meta.ledgerIds) expect(LEDGER.some((x) => x.id === id), id).toBe(true);
    expect([...meta.omitted]).toEqual(['rise time 10-90 %', 'Q']);
  });
});
