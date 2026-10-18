import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcResult } from '../../result';
import { detectForbidden } from '../../../../tools/audit-lib.mjs';
import { IMPEDANCE_BANNER, STANDING_ASSUMPTION, dimensionless } from '../impedance-shared';
import { compute, epsEffZeroThickness, z01, z0ZeroThickness } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 2 task 3: microstrip (ledger S-020 VERIFIED; thickness variant S-020a CONFLICT). TESTS FIRST.
// Every expected number comes from the independent oracle (tools/reference/ref_impedance.py, written from the equations in
// docs/sources/notes/impedance-models.md and mirrored in docs/golden-vectors.json) or from the S-020 equations restated by hand
// below. The implementation is never consulted. These tests compare the implementation with the recorded formulas; they do not
// verify the H-J paper (not read) or any ledger row.
//
// Hand-checkable case (er = 1, w/h = 1): eps_e = (1+1)/2 + 0 = 1 exactly; F1 = 6 + (2 pi - 6) exp(-30.666^0.7528) = 6.0000005;
// Z01 = (eta0/2pi) ln(6.0000005 + sqrt 5) = 59.9584916 x ln 8.2360685 = 59.9584916 x 2.108523 = 126.4239 ohm = Z0.

interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
  ledger_ids: string[];
  status: string;
}
const goldenFiles = import.meta.glob('../../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const goldenText = Object.values(goldenFiles)[0];
const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;
const vec = (name: string): GoldenVector => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found (${String(vectors.length)} vectors loaded)`);
  return v;
};

const um = (n: number): Quantity => fromUnit(n, 'um');
const er = (n: number): Quantity => dimensionless(n);
const ohm = (n: number): Quantity => fromUnit(n, 'ohm');
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const g = (x: number): string => String(x);
const TOL = 1e-9;

function ok(inputs: Inputs): CalcResult {
  const out = compute(inputs);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code} ${out.error.field ?? ''}: ${out.error.message}`);
  const chk = assertCalcResult(out.value);
  expect(chk.ok, chk.ok ? '' : chk.error.join('; ')).toBe(true);
  return out.value;
}
function fail(inputs: unknown): CalcError {
  const out = compute(inputs as Inputs);
  if (out.ok) throw new Error('expected an error');
  return out.error;
}
const res = (r: CalcResult, name: string) => {
  const x = r.results.find((o) => o.name === name);
  if (!x) throw new Error(`result "${name}" missing; have ${r.results.map((o) => o.name).join(', ')}`);
  return x;
};
const Z0 = 'characteristic impedance Z0';
const EE = 'effective permittivity';
const Z01N = 'air-line impedance Z01';
const WIDTH = 'trace width for target Z0';
const analysis = (w: number, h: number, e: number, extra: Partial<Inputs> = {}): Inputs => ({ width: um(w), height: um(h), er: er(e), ...extra });

// Case tables mirror tools/reference/ref_impedance.py (vector names are built from the inputs, so a mismatch fails loudly).
const MS_CASES: [number, number, number][] = [
  [600, 635, 4.1], [3150, 1575, 4.5], [300, 150, 4.2], [100, 200, 3.66], [1000, 200, 2.2], [6350, 635, 9.8],
  [10, 1000, 4.5], [100000, 1000, 4.5], [635, 635, 1.0], [500, 500, 128.0], [250, 1000, 4.4], [1500, 300, 3.48],
];
const MS_THICK_CASES: [number, number, number, number][] = [[3150, 1575, 35, 4.5], [150, 100, 18, 4.2], [400, 200, 35, 3.66], [2000, 200, 70, 4.5]];
const MS_SOLVE_CASES: [number, number, number][] = [[50, 200, 4.2], [75, 635, 4.1], [50, 1575, 4.5], [100, 300, 3.48], [30, 500, 4.5]];
const MS_SOLVE_THICK_CASES: [number, number, number, number][] = [[50, 200, 35, 4.2], [60, 300, 18, 4.5]];
const tag = (w: number, h: number, e: number): string => `w${g(w)}um_h${g(h)}um_er${g(e)}`;

describe('golden vectors (oracle): zero-thickness S-020', () => {
  for (const [w, h, e] of MS_CASES) {
    it(`w ${g(w)} um, h ${g(h)} um, er ${g(e)}`, () => {
      const vz = vec(`microstrip_z0_ohm_${tag(w, h, e)}`);
      const ve = vec(`microstrip_eeff_${tag(w, h, e)}`);
      const v1 = vec(`microstrip_z01_ohm_${tag(w, h, e)}`);
      expect(vz.ledger_ids).toEqual(expect.arrayContaining(['S-020', 'S-013', 'S-029', 'S-029a']));
      expect(vz.status).toBe('VERIFIED');
      expect(vz.rel_tol).toBeLessThanOrEqual(TOL);
      const r = ok(analysis(w, h, e));
      const z = res(r, Z0);
      expect(sameDim(z.value, q(1, DIM.RESISTANCE))).toBe(true);
      expect(z.role).toBe('primary');
      expect(z.bound).toBe('nominal');
      expect(relErr(z.value.si, vz.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, EE).value.si, ve.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, Z01N).value.si, v1.pinned_expected)).toBeLessThanOrEqual(TOL);
      // The exported model functions agree with the same vectors.
      expect(relErr(z0ZeroThickness(w / h, e), vz.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(epsEffZeroThickness(w / h, e), ve.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(z01(w / h), v1.pinned_expected)).toBeLessThanOrEqual(TOL);
    });
  }
});

describe('R1: Steer Example 2 (published) and the hand-checkable case', () => {
  it('w 600 um, h 635 um, er 4.1, t = 0: published eps_e 2.967, Z0,air 129.7, Z0 75.3 (prefactor 60); ours uses eta0/2pi (75.267)', () => {
    const r = ok(analysis(600, 635, 4.1));
    expect(Math.abs(res(r, EE).value.si - 2.967)).toBeLessThan(5e-4);
    expect(relErr(res(r, Z01N).value.si, 129.7)).toBeLessThan(1e-3);
    expect(relErr(res(r, Z0).value.si, 75.3)).toBeLessThan(1e-3);
    // Researcher hand check with eta0/(2 pi) = 59.95849: Z0 = 75.267 ohm (impedance-models note, S-020).
    expect(Math.abs(res(r, Z0).value.si - 75.267)).toBeLessThan(2e-3);
    // The prefactor-60 value 75.318 is 0.07 % higher: the decision Q-1 is visible in the number.
    expect(res(r, Z0).value.si).toBeLessThan(75.318);
  });
  it('er = 1, w/h = 1: eps_e is exactly 1 and Z0 = Z01 = 126.4239 ohm', () => {
    const r = ok(analysis(635, 635, 1));
    expect(res(r, EE).value.si).toBe(1);
    expect(res(r, Z0).value.si).toBe(res(r, Z01N).value.si);
    expect(Math.abs(res(r, Z0).value.si - 126.4239)).toBeLessThan(2e-4);
  });
});

describe('golden vectors (oracle): thickness variants A and B (S-020a, CONFLICT)', () => {
  for (const [w, h, t, e] of MS_THICK_CASES) {
    const tg = `${tag(w, h, e)}_t${g(t)}um`;
    it(`w ${g(w)}, h ${g(h)}, t ${g(t)} um, er ${g(e)}`, () => {
      for (const [variant, key] of [['hj-procedure-A', 'A'], ['hj-procedure-B', 'B']] as const) {
        const vz = vec(`microstrip_thick${key}_z0_ohm_${tg}`);
        const ve = vec(`microstrip_thick${key}_eeff_${tg}`);
        expect(vz.status).toBe('CONFLICT');
        const r = ok(analysis(w, h, e, { thickness: um(t), thicknessModel: variant }));
        expect(relErr(res(r, Z0).value.si, vz.pinned_expected)).toBeLessThanOrEqual(TOL);
        expect(relErr(res(r, EE).value.si, ve.pinned_expected)).toBeLessThanOrEqual(TOL);
      }
    });
  }
  it('procedure A and B give the same Z0 (algebra of the recorded equations) and A has the lower eps_e', () => {
    const [w, h, t, e] = MS_THICK_CASES[0] as [number, number, number, number];
    const a = ok(analysis(w, h, e, { thickness: um(t), thicknessModel: 'hj-procedure-A' }));
    const b = ok(analysis(w, h, e, { thickness: um(t), thicknessModel: 'hj-procedure-B' }));
    expect(relErr(res(a, Z0).value.si, res(b, Z0).value.si)).toBeLessThan(1e-12);
    expect(res(a, EE).value.si).toBeLessThan(res(b, EE).value.si);
  });
  it('the thickness variant carries CONFLICT, names the procedure, and the base model does not carry S-020a', () => {
    const [w, h, t, e] = MS_THICK_CASES[0] as [number, number, number, number];
    const a = ok(analysis(w, h, e, { thickness: um(t), thicknessModel: 'hj-procedure-A' }));
    expect(a.dataStatus).toBe('CONFLICT');
    expect(a.reference.ledgerIds).toContain('S-020a');
    expect(a.method).toMatch(/procedure A/);
    expect(a.warnings.some((x) => x.code === 'THICKNESS_VARIANT_CONFLICT')).toBe(true);
    expect(a.confidence.level).toBe('low');
    const b = ok(analysis(w, h, e, { thickness: um(t) }));
    expect(b.dataStatus).toBe('VERIFIED');
    expect(b.reference.ledgerIds).not.toContain('S-020a');
  });
});

describe('golden vectors (oracle): width for a target Z0 (bracketed Brent on the analysis function)', () => {
  for (const [z, h, e] of MS_SOLVE_CASES) {
    it(`Z0 ${g(z)} ohm, h ${g(h)} um, er ${g(e)}`, () => {
      const v = vec(`microstrip_solve_w_um_Z${g(z)}ohm_h${g(h)}um_er${g(e)}`);
      const r = ok({ targetZ0: ohm(z), height: um(h), er: er(e) });
      const w = res(r, WIDTH);
      expect(w.role).toBe('primary');
      expect(relErr(toUnit(w.value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      // round trip through the analysis path
      const back = ok(analysis(toUnit(w.value, 'um'), h, e));
      expect(relErr(res(back, Z0).value.si, z)).toBeLessThanOrEqual(TOL);
    });
  }
  for (const [z, h, t, e] of MS_SOLVE_THICK_CASES) {
    for (const [variant, key] of [['hj-procedure-A', 'A'], ['hj-procedure-B', 'B']] as const) {
      it(`thickness variant ${key}: Z0 ${g(z)} ohm, h ${g(h)} um, t ${g(t)} um, er ${g(e)}`, () => {
        const v = vec(`microstrip_solve_thick${key}_w_um_Z${g(z)}ohm_h${g(h)}um_t${g(t)}um_er${g(e)}`);
        const r = ok({ targetZ0: ohm(z), height: um(h), er: er(e), thickness: um(t), thicknessModel: variant });
        expect(relErr(toUnit(res(r, WIDTH).value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      });
    }
  }
  it('an unreachable target is an error that states the reachable range inside 0.01 <= w/h <= 100', () => {
    const hi = z0ZeroThickness(0.01, 4.2);
    const lo = z0ZeroThickness(100, 4.2);
    for (const z of [hi * 1.001, lo * 0.999, 1e4, 0.01]) {
      const e = fail({ targetZ0: ohm(z), height: um(200), er: er(4.2) });
      expect(e.code).toBe('OUT_OF_DOMAIN');
      expect(e.message).toMatch(/0\.01/);
      expect(e.message).toMatch(/unreachable|outside the range/);
    }
    // the end points themselves are reachable (inclusive bracket)
    expect(compute({ targetZ0: ohm(hi), height: um(200), er: er(4.2) }).ok).toBe(true);
    expect(compute({ targetZ0: ohm(lo), height: um(200), er: er(4.2) }).ok).toBe(true);
  });
  it('the solve result reports the Z0 it solved for and the bracket in the steps', () => {
    const r = ok({ targetZ0: ohm(50), height: um(200), er: er(4.2) });
    expect(res(r, Z0).bound).toBe('nominal');
    expect(relErr(res(r, Z0).value.si, 50)).toBeLessThan(1e-9);
    expect(r.steps.some((s) => /bracket/i.test(s.label) || /bracket/i.test(s.expr))).toBe(true);
    expect(r.inputs.find((i) => i.name === 'target Z0')?.source).toBe('user');
  });
});

describe('result schema, banner, confidence, status, warnings', () => {
  const r = ok(analysis(3150, 1575, 4.5, { frequency: fromUnit(1, 'GHz'), length: fromUnit(50, 'mm'), lengthMismatch: fromUnit(2, 'mm') }));
  it('every required field is filled and passes assertCalcResult', () => {
    expect(r.method).toBe(meta.method);
    expect(r.formula).toBe(meta.formula);
    expect(r.reference.standard).toBe(meta.reference.standard);
    expect(r.inputs.length).toBeGreaterThanOrEqual(6);
    expect(r.assumptions.length).toBeGreaterThan(0);
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.validityChecks.length).toBeGreaterThan(0);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.designValues).toEqual([]);
  });
  it('the mandatory banner is in the recommendation verbatim', () => {
    expect(IMPEDANCE_BANNER).toBe(
      "Approximate. Final controlled impedance must be verified against the PCB manufacturer's actual stackup and, where required, field-solver/TDR data.",
    );
    expect(r.recommendation.startsWith(IMPEDANCE_BANNER)).toBe(true);
    for (const x of [ok(analysis(600, 635, 4.1)), ok({ targetZ0: ohm(50), height: um(200), er: er(4.2) })]) expect(x.recommendation).toContain(IMPEDANCE_BANNER);
  });
  it('confidence is rule-based, never high, and medium for an in-range zero-thickness result; the standing assumption is listed', () => {
    expect(r.confidence.level).toBe('medium');
    expect(r.confidence.score).toBe(2);
    expect(r.confidence.reasons.join(' ')).toContain(STANDING_ASSUMPTION);
    expect(r.confidence.reasons.join(' ')).toMatch(/empirical/);
    expect(r.assumptions.join(' ')).toContain('Standing assumption');
  });
  it('base data status is VERIFIED (S-020, S-013, S-029, S-029a); a skew result adds S-029b and is UNVERIFIED', () => {
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-020', 'S-029', 'S-029a', 'S-029b']));
    const plain = ok(analysis(3150, 1575, 4.5));
    expect(plain.dataStatus).toBe('VERIFIED');
    expect(plain.reference.ledgerIds).not.toContain('S-029b');
  });
  it('dispersion and soldermask are flagged as not modelled on every result, with the frequency when given', () => {
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('DISPERSION_NOT_MODELLED');
    expect(codes).toContain('SOLDERMASK_NOT_MODELLED');
    const d = r.warnings.find((w) => w.code === 'DISPERSION_NOT_MODELLED');
    expect(d?.message).toMatch(/not modelled/);
    expect(d?.message).toMatch(/1 GHz|1e\+?9|1000000000/);
    const plain = ok(analysis(600, 635, 4.1));
    expect(plain.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['DISPERSION_NOT_MODELLED', 'SOLDERMASK_NOT_MODELLED']));
    expect(plain.warnings.find((w) => w.code === 'DISPERSION_NOT_MODELLED')?.message).toMatch(/no frequency/i);
  });
  it('t > 0 with the thickness variant off warns "zero-thickness model"; t absent does not', () => {
    const w1 = ok(analysis(3150, 1575, 4.5, { thickness: um(35) }));
    expect(w1.warnings.map((w) => w.code)).toContain('ZERO_THICKNESS_MODEL');
    expect(w1.warnings.find((w) => w.code === 'ZERO_THICKNESS_MODEL')?.message).toMatch(/zero-thickness/);
    const w2 = ok(analysis(3150, 1575, 4.5));
    expect(w2.warnings.map((w) => w.code)).not.toContain('ZERO_THICKNESS_MODEL');
    // the thickness is ignored by the base model: same Z0 with and without t
    expect(res(w1, Z0).value.si).toBe(res(w2, Z0).value.si);
  });
  it('delay per length is a prediction with the ps/mm and ps/in dual text; line delay, guided wavelength and skew follow S-029/S-029a/S-029b', () => {
    const ee = res(r, EE).value.si;
    const d = res(r, 'delay per length');
    expect(d.bound).toBe('prediction');
    expect(relErr(d.value.si * 1e9, (Math.sqrt(ee) / 299792458) * 1e9)).toBeLessThan(1e-12);
    expect(d.note).toMatch(/ps\/mm \(.* ps\/in\)/);
    expect(relErr(toUnit(res(r, 'propagation delay').value, 's'), (0.05 * Math.sqrt(ee)) / 299792458)).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'guided wavelength').value, 'm'), 299792458 / 1e9 / Math.sqrt(ee))).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'skew from length mismatch').value, 's'), (0.002 * Math.sqrt(ee)) / 299792458)).toBeLessThan(1e-12);
    expect(r.warnings.map((w) => w.code)).toContain('SKEW_SCOPE');
  });
  it('without optional inputs there is no line delay, wavelength or skew (no hidden defaults)', () => {
    const p = ok(analysis(600, 635, 4.1));
    for (const n of ['propagation delay', 'guided wavelength', 'skew from length mismatch']) expect(p.results.some((x) => x.name === n)).toBe(false);
  });
  it('inputs carry provenance: user inputs, and the er and geometry source labels when given', () => {
    const x = ok(analysis(600, 635, 4.1, { erSource: 'user-entered, datasheet X rev A @ 1 GHz', geometrySource: 'stackup "demo", layer L1' }));
    const e = x.inputs.find((i) => i.name === 'er');
    expect(e?.source).toBe('user');
    expect(e?.sourceDetail).toContain('datasheet X rev A');
    expect(x.inputs.find((i) => i.name === 'width')?.sourceDetail).toContain('layer L1');
    expect(x.inputs.every((i) => i.source === 'user')).toBe(true);
  });
  it('assumptions state the prefactor decision, the accuracy as recorded, and what is not modelled', () => {
    const text = r.assumptions.join(' ');
    expect(text).toMatch(/eta0|η0/);
    expect(text).toMatch(/59\.9/);
    expect(text).toMatch(/0\.2 %/);
    expect(text).toMatch(/0\.1 %/);
    expect(text).toMatch(/roughness/);
    expect(text).toMatch(/embedded/i);
  });
  it('no compliance wording anywhere in the result', () => {
    const text = JSON.stringify([r, ok(analysis(3150, 1575, 4.5, { thickness: um(35), thicknessModel: 'hj-procedure-B' }))]);
    for (const line of text.split(/(?<=[.;])/)) expect(detectForbidden(line)).toEqual([]);
  });
});

describe('validity ranges are enforced with a warning and a low confidence', () => {
  it('w/h below 0.01 or above 100 fails its check, forces confidence low, and warns', () => {
    for (const w of [5, 100500]) {
      const x = ok(analysis(w, 1000, 4.2));
      const chk = x.validityChecks.find((c) => /w\/h/.test(c.name));
      expect(chk?.ok).toBe(false);
      expect(x.confidence.level).toBe('low');
      expect(x.confidence.reasons.join(' ')).toMatch(/w\/h/);
      expect(x.warnings.some((m) => m.code === 'OUT_OF_RANGE' && m.severity === 'warning')).toBe(true);
    }
  });
  it('the ends w/h = 0.01 and w/h = 100 are inside', () => {
    for (const w of [10, 100000]) expect(ok(analysis(w, 1000, 4.2)).validityChecks.find((c) => /w\/h/.test(c.name))?.ok).toBe(true);
  });
  it('er above 128 fails its check (low); er = 1 and 128 pass', () => {
    const x = ok(analysis(600, 635, 130));
    expect(x.validityChecks.find((c) => /er/.test(c.name))?.ok).toBe(false);
    expect(x.confidence.level).toBe('low');
    for (const e of [1, 128]) expect(ok(analysis(600, 635, e)).validityChecks.find((c) => /er/.test(c.name))?.ok).toBe(true);
  });
  it('t/h is reported when t is given (no range is recorded for it, and the check says so)', () => {
    const x = ok(analysis(600, 635, 4.1, { thickness: um(35) }));
    const c = x.validityChecks.find((v) => /t\/h/.test(v.name));
    expect(c?.ok).toBe(true);
    expect(c?.detail).toMatch(/no range/i);
  });
  it('w/h of 1000 or more is refused (Z01 is quoted for w/h < 1000)', () => {
    const e = fail(analysis(1000000, 1000, 4.2));
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.message).toMatch(/1000/);
  });
});

describe('properties (fast-check)', () => {
  const uArb = fc.double({ min: 0.01, max: 100, noNaN: true });
  const erArb = fc.double({ min: 1, max: 128, noNaN: true });
  it('Z0 decreases as w/h grows (fixed er)', () => {
    fc.assert(
      fc.property(uArb, uArb, erArb, (a, b, e) => {
        fc.pre(Math.abs(Math.log(a / b)) > 1e-3);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        expect(z0ZeroThickness(hi, e)).toBeLessThan(z0ZeroThickness(lo, e));
      }),
      { numRuns: 300 },
    );
  });
  it('Z0 increases with h at fixed w and decreases with er at fixed w/h (through compute)', () => {
    fc.assert(
      fc.property(fc.double({ min: 50, max: 2000, noNaN: true }), fc.double({ min: 50, max: 1500, noNaN: true }), erArb, (w, h, e) => {
        fc.pre(w / h >= 0.01 && w / (h * 1.1) <= 100 && w / h <= 100);
        const z1 = res(ok(analysis(w, h, e)), Z0).value.si;
        const z2 = res(ok(analysis(w, h * 1.1, e)), Z0).value.si;
        expect(z2).toBeGreaterThan(z1);
        fc.pre(e < 120);
        const z3 = res(ok(analysis(w, h, e * 1.05)), Z0).value.si;
        expect(z3).toBeLessThan(z1);
      }),
      { numRuns: 120 },
    );
  });
  it('eps_e stays between (er+1)/2 and er, rises with w/h and er; er = 1 gives 1', () => {
    fc.assert(
      fc.property(uArb, erArb, (u, e) => {
        const ee = epsEffZeroThickness(u, e);
        expect(ee).toBeGreaterThanOrEqual((e + 1) / 2 - 1e-12);
        expect(ee).toBeLessThanOrEqual(e + 1e-12);
        if (e > 1.01) {
          expect(epsEffZeroThickness(u * 1.2, e)).toBeGreaterThan(ee);
        }
      }),
      { numRuns: 300 },
    );
    expect(epsEffZeroThickness(2, 1)).toBe(1);
  });
  it('Z01 does not depend on er, and Z0 = Z01 / sqrt(eps_e)', () => {
    fc.assert(
      fc.property(uArb, erArb, (u, e) => {
        expect(relErr(z0ZeroThickness(u, e), z01(u) / Math.sqrt(epsEffZeroThickness(u, e)))).toBeLessThanOrEqual(1e-14);
      }),
      { numRuns: 200 },
    );
  });
  it('width solve round trip: Z0(w(Z)) = Z within 1e-9 for targets inside the reachable range', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.05, max: 0.95, noNaN: true }), fc.double({ min: 50, max: 1600, noNaN: true }), fc.double({ min: 1.5, max: 20, noNaN: true }), (frac, h, e) => {
        const hi = z0ZeroThickness(0.01, e);
        const lo = z0ZeroThickness(100, e);
        const z = lo + frac * (hi - lo);
        const sol = ok({ targetZ0: ohm(z), height: um(h), er: er(e) });
        const w = res(sol, WIDTH).value;
        const back = ok({ width: w, height: um(h), er: er(e) });
        expect(relErr(res(back, Z0).value.si, z)).toBeLessThanOrEqual(1e-9);
      }),
      { numRuns: 150 },
    );
  });
  it('the thickness variant lowers Z0 (a wider effective strip); A and B agree on Z0', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.3, max: 20, noNaN: true }), fc.double({ min: 0.001, max: 0.1, noNaN: true }), fc.double({ min: 1.5, max: 20, noNaN: true }), (u, tn, e) => {
        const h = 500;
        const base = z0ZeroThickness(u, e);
        const a = res(ok(analysis(u * h, h, e, { thickness: um(tn * h), thicknessModel: 'hj-procedure-A' })), Z0).value.si;
        const b = res(ok(analysis(u * h, h, e, { thickness: um(tn * h), thicknessModel: 'hj-procedure-B' })), Z0).value.si;
        expect(a).toBeLessThan(base);
        expect(relErr(a, b)).toBeLessThan(1e-12);
      }),
      { numRuns: 120 },
    );
  });
  it('only the ratio w/h matters: scaling w and h together (um vs mil spellings) leaves Z0 and eps_e unchanged', () => {
    const a = ok({ width: fromUnit(24, 'mil'), height: fromUnit(10, 'mil'), er: er(4.2) });
    const b = ok({ width: fromUnit(24 * 25.4, 'um'), height: fromUnit(254, 'um'), er: er(4.2) });
    expect(relErr(res(a, Z0).value.si, res(b, Z0).value.si)).toBeLessThan(1e-12);
    expect(relErr(res(a, EE).value.si, res(b, EE).value.si)).toBeLessThan(1e-12);
  });
  it('delay rises with er at fixed geometry (directional bound)', () => {
    const lo = res(ok(analysis(600, 635, 3)), 'delay per length').value.si;
    const hi = res(ok(analysis(600, 635, 4.5)), 'delay per length').value.si;
    expect(hi).toBeGreaterThan(lo);
  });
  it('never returns NaN or Infinity in any result for random in-domain inputs', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 5000, noNaN: true }), fc.double({ min: 10, max: 5000, noNaN: true }), erArb, (w, h, e) => {
        fc.pre(w / h < 1000);
        const x = ok(analysis(w, h, e));
        for (const o of x.results) expect(Number.isFinite(o.value.si)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe('guards: errors are values, never thrown', () => {
  const base = (): Inputs => analysis(600, 635, 4.1);
  const bad: [string, number][] = [
    ['NaN', Number.NaN],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['zero', 0],
    ['negative', -1e-4],
  ];
  const q1 = (name: 'width' | 'height' | 'thickness' | 'frequency' | 'length' | 'lengthMismatch' | 'targetZ0', si: number): unknown => {
    const dim = name === 'frequency' ? DIM.FREQUENCY : name === 'targetZ0' ? DIM.RESISTANCE : DIM.LENGTH;
    const extra: Record<string, unknown> = name === 'width' ? {} : { width: um(600) };
    if (name === 'targetZ0') {
      delete extra['width'];
      return { ...base(), width: undefined, targetZ0: { si, dim } };
    }
    return { ...base(), ...extra, [name]: { si, dim } };
  };
  for (const name of ['width', 'height', 'thickness', 'frequency', 'length', 'lengthMismatch', 'targetZ0'] as const) {
    for (const [label, si] of bad) {
      it(`${name} ${label} returns INVALID_INPUT with the field name`, () => {
        const e = fail(q1(name, si));
        expect(e.code).toBe('INVALID_INPUT');
        expect(e.field).toBe(name);
        expect(e.message).toContain(name);
      });
    }
  }
  it('er that is NaN, infinite, zero or negative is INVALID_INPUT; below 1 is OUT_OF_DOMAIN', () => {
    for (const [, si] of bad) expect(fail({ ...base(), er: { si, dim: DIM.DIMENSIONLESS } }).code).toBe('INVALID_INPUT');
    const e = fail({ ...base(), er: er(0.5) });
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.field).toBe('er');
  });
  it('dimension mixing is a DIMENSION error: a temperature as a width, a length as er, a length as a frequency, a plain number', () => {
    expect(fail({ ...base(), width: fromUnit(25, 'degC') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), height: fromUnit(5, 'ddegC') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), er: um(4) }).code).toBe('DIMENSION');
    expect(fail({ ...base(), frequency: um(4) }).code).toBe('DIMENSION');
    expect(fail({ ...base(), targetZ0: um(50), width: undefined }).code).toBe('DIMENSION');
    expect(fail({ ...base(), width: 600e-6 }).code).toBe('INVALID_INPUT');
  });
  it('exactly one of width and targetZ0; height and er are required', () => {
    expect(fail({ ...base(), targetZ0: ohm(50) }).message).toMatch(/exactly one of width or targetZ0/);
    expect(fail({ height: um(635), er: er(4.1) }).message).toMatch(/exactly one of width or targetZ0/);
    expect(fail({ width: um(600), er: er(4.1) }).field).toBe('height');
    expect(fail({ width: um(600), height: um(635) }).field).toBe('er');
  });
  it('thicknessModel must be a known value and needs a thickness; an unknown option is refused', () => {
    expect(fail({ ...base(), thicknessModel: 'wheeler' }).field).toBe('thicknessModel');
    expect(fail({ ...base(), thicknessModel: 'hj-procedure-A' }).message).toMatch(/thickness/);
    expect(compute({ ...base(), thicknessModel: 'none' } as Inputs).ok).toBe(true);
  });
  it('labels must be non-empty text', () => {
    expect(fail({ ...base(), erSource: '' }).field).toBe('erSource');
    expect(fail({ ...base(), geometrySource: 5 }).field).toBe('geometrySource');
  });
  it('a non-object input is an error value', () => {
    for (const x of [null, undefined, 5, 'x', []]) expect(fail(x).code).toBe('INVALID_INPUT');
  });
  it('compute never throws on arbitrary junk', () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const out = compute(x as Inputs);
        expect(typeof out.ok).toBe('boolean');
      }),
      { numRuns: 300 },
    );
  });
  it('overflowing geometry returns an error value, not NaN (w/h from absurd lengths)', () => {
    const e = fail({ width: { si: 1e300, dim: DIM.LENGTH }, height: { si: 1e-300, dim: DIM.LENGTH }, er: er(4) });
    expect(['OUT_OF_DOMAIN', 'INVALID_INPUT']).toContain(e.code);
  });
});

describe('performance', () => {
  it('10 000 computes (analysis and solve) stay within a 5 s total budget', () => {
    const a = analysis(600, 635, 4.1);
    const s: Inputs = { targetZ0: ohm(50), height: um(200), er: er(4.2) };
    compute(a);
    compute(s);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(i % 2 === 0 ? a : s).ok) n++;
    const dt = performance.now() - t0;
    expect(n).toBe(10_000);
    expect(dt).toBeLessThan(5000);
  });
});
