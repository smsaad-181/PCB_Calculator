import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcResult } from '../../result';
import { detectForbidden } from '../../../../tools/audit-lib.mjs';
import { IMPEDANCE_BANNER, STANDING_ASSUMPTION, dimensionless } from '../impedance-shared';
import { cpwModel } from '../cpw-shared';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 2 task 5a: coplanar waveguide without a lower ground plane (ledger S-023 CONFLICT; K by AGM, S-023b VERIFIED). TESTS FIRST.
// Every expected number comes from the independent oracle (tools/reference/ref_impedance.py part C, written from the equations in
// docs/sources/notes/impedance-models.md with 60-digit decimal K, mirrored in docs/golden-vectors.json) or from the S-023
// equations restated by hand below. The implementation is never consulted. These tests compare the implementation with the
// recorded formulas; they do not verify the CPW literature (S-023 is a CONFLICT row) and no ledger row.
//
// Hand-checkable case (er = 1, W = 500 um, s = 200 um, h = 500 um): eps_e = 1 + 0 = 1 exactly for any h, k = 500/900 = 5/9,
// Z0 = (eta0/4) K(k')/K(k) = 94.18258 x 2.062819/1.718979 = 94.18258 x 1.200026 = 113.0215 ohm (K from the elliptic vectors).

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
const ETA0 = 4e-7 * Math.PI * 299792458;

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
const GAP = 'gap for target Z0';
const WIDTH = 'trace width for target Z0';
const analysis = (w: number, s: number, h: number, e: number, extra: Partial<Inputs> = {}): Inputs => ({ width: um(w), gap: um(s), height: um(h), er: er(e), ...extra });
const tag = (w: number, s: number, h: number, e: number): string => `w${g(w)}um_s${g(s)}um_h${g(h)}um_er${g(e)}`;

// Case tables mirror tools/reference/ref_impedance.py (vector names are built from the inputs, so a mismatch fails loudly).
const CASES: [number, number, number, number][] = [
  [500, 200, 500, 1.0], [500, 200, 500, 12.85], [300, 200, 1600, 4.5], [250, 150, 1000, 4.2], [100, 100, 200, 3.66], [200, 50, 1600, 4.5],
  [1000, 100, 1600, 4.3], [150, 500, 800, 4.2], [500, 200, 100000, 4.5], [500, 200, 20, 4.5], [300, 300, 300, 128.0], [100, 10, 1600, 4.5],
];
const SOLVE_S: [number, number, number, number][] = [[50, 300, 1600, 4.5], [60, 250, 1000, 4.2], [75, 200, 800, 3.66], [40, 500, 1600, 4.5]];
const SOLVE_W: [number, number, number, number][] = [[50, 200, 1600, 4.5], [60, 150, 1000, 4.2], [75, 300, 800, 3.66], [40, 150, 1600, 4.5]];

describe('golden vectors (oracle): CPW analysis, conformal map (S-023, CONFLICT)', () => {
  for (const [w, s, h, e] of CASES) {
    it(`W ${g(w)} um, s ${g(s)} um, h ${g(h)} um, er ${g(e)}`, () => {
      const t = tag(w, s, h, e);
      const vz = vec(`cpw_z0_ohm_${t}`);
      const ve = vec(`cpw_eeff_${t}`);
      const vk = vec(`cpw_k_${t}`);
      const vk1 = vec(`cpw_k1_${t}`);
      expect(vz.ledger_ids).toEqual(expect.arrayContaining(['S-023', 'S-023b', 'S-013', 'S-029', 'S-029a']));
      expect(vz.status).toBe('CONFLICT');
      expect(vz.rel_tol).toBeLessThanOrEqual(TOL);
      const r = ok(analysis(w, s, h, e));
      const z = res(r, Z0);
      expect(sameDim(z.value, q(1, DIM.RESISTANCE))).toBe(true);
      expect(z.role).toBe('primary');
      expect(z.bound).toBe('nominal');
      expect(relErr(z.value.si, vz.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, EE).value.si, ve.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, 'modulus k = W/(W + 2 s)').value.si, vk.pinned_expected)).toBeLessThanOrEqual(TOL);
      // The exported model function agrees with the same vectors (SI metres).
      const m = cpwModel(w * 1e-6, s * 1e-6, h * 1e-6, e);
      expect(relErr(m.z0, vz.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(m.epsEff, ve.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(m.k1, vk1.pinned_expected)).toBeLessThanOrEqual(TOL);
    });
  }
});

describe('hand-checkable cases and the S-023 structure', () => {
  it('er = 1: eps_e is exactly 1 and Z0 = (eta0/4) K(k\')/K(k) = 113.02 ohm for k = 5/9, whatever h is', () => {
    const kv = vec('elliptic_K_k0.555556').pinned_expected;
    const kpv = vec('elliptic_Kprime_k0.555556').pinned_expected;
    const hand = (ETA0 / 4) * (kpv / kv);
    for (const h of [100, 500, 100000]) {
      const r = ok(analysis(500, 200, h, 1));
      expect(res(r, EE).value.si).toBe(1);
      expect(relErr(res(r, Z0).value.si, hand)).toBeLessThan(1e-5); // the vector k is rounded to 6 digits
      expect(Math.abs(res(r, Z0).value.si - 113.0215)).toBeLessThan(2e-3);
    }
  });
  it('Steer geometry (W 500, s 200, h 500, er 12.85): the conformal-map eps_e is 6.24 against the 6.28 of Steer\'s empirical fit (the S-023 conflict, shown, not hidden)', () => {
    const r = ok(analysis(500, 200, 500, 12.85));
    expect(Math.abs(res(r, EE).value.si - 6.2397)).toBeLessThan(5e-4);
    expect(Math.abs(res(r, Z0).value.si - 45.246)).toBeLessThan(5e-3);
    // within 1 % of the published Z0 = 45.1 ohm (a different eps_e model, prefactor 94.2478)
    expect(relErr(res(r, Z0).value.si, 45.1)).toBeLessThan(1e-2);
  });
  it('a very thick substrate gives the infinite-substrate value (er + 1)/2; a very thin one tends to 1', () => {
    expect(Math.abs(res(ok(analysis(500, 200, 1e8, 4.5)), EE).value.si - 2.75)).toBeLessThan(1e-6);
    // logarithmic approach: k1 ~ exp(-pi s/2h), so eps_e is still 1.01 at h = 1 um (s = 200 um) and 1.19 at h = 20 um
    expect(res(ok(analysis(500, 200, 1, 4.5)), EE).value.si).toBeLessThan(1.02);
    expect(res(ok(analysis(500, 200, 20, 4.5)), EE).value.si).toBeGreaterThan(res(ok(analysis(500, 200, 1, 4.5)), EE).value.si);
  });
  it('the k ratio steps are reported: k, k\', k1, k1\' and the two elliptic ratios', () => {
    const r = ok(analysis(500, 200, 500, 4.5));
    const labels = r.steps.map((s) => s.label).join(' | ');
    for (const part of ['Modulus k', 'Complementary modulus k', 'Modulus k1', 'Complementary modulus k1', 'K(k\')/K(k)', 'K(k1\')/K(k1)']) expect(labels).toContain(part);
    const k = r.steps.find((s) => s.label === 'Modulus k');
    const kp = r.steps.find((s) => s.label === 'Complementary modulus k\'');
    expect(k?.value.si).toBeCloseTo(5 / 9, 14);
    expect(kp?.value.si).toBeCloseTo(Math.sqrt(1 - 25 / 81), 14);
  });
});

describe('golden vectors (oracle): gap and width for a target Z0 (bracketed Brent on the analysis function)', () => {
  for (const [z, w, h, e] of SOLVE_S) {
    it(`gap: Z0 ${g(z)} ohm, W ${g(w)} um, h ${g(h)} um, er ${g(e)}`, () => {
      const v = vec(`cpw_solve_s_um_Z${g(z)}ohm_w${g(w)}um_h${g(h)}um_er${g(e)}`);
      const r = ok({ targetZ0: ohm(z), width: um(w), height: um(h), er: er(e) });
      const s = res(r, GAP);
      expect(s.role).toBe('primary');
      expect(relErr(toUnit(s.value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, Z0).value.si, z)).toBeLessThanOrEqual(TOL);
      const back = ok(analysis(w, toUnit(s.value, 'um'), h, e));
      expect(relErr(res(back, Z0).value.si, z)).toBeLessThanOrEqual(TOL);
    });
  }
  for (const [z, s, h, e] of SOLVE_W) {
    it(`width: Z0 ${g(z)} ohm, s ${g(s)} um, h ${g(h)} um, er ${g(e)}`, () => {
      const v = vec(`cpw_solve_w_um_Z${g(z)}ohm_s${g(s)}um_h${g(h)}um_er${g(e)}`);
      const r = ok({ targetZ0: ohm(z), gap: um(s), height: um(h), er: er(e) });
      const w = res(r, WIDTH);
      expect(w.role).toBe('primary');
      expect(relErr(toUnit(w.value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      const back = ok(analysis(toUnit(w.value, 'um'), s, h, e));
      expect(relErr(res(back, Z0).value.si, z)).toBeLessThanOrEqual(TOL);
    });
  }
  it('an unreachable target is OUT_OF_DOMAIN and states the reachable range and the bracket (gap solve and width solve)', () => {
    const W = 300e-6;
    const S = 200e-6;
    const h = 1000e-6;
    const zGapLo = cpwModel(W, 0.01 * W, h, 4.2).z0;
    const zGapHi = cpwModel(W, 100 * W, h, 4.2).z0;
    for (const z of [zGapLo * 0.99, zGapHi * 1.01, 1e5, 0.01]) {
      const e = fail({ targetZ0: ohm(z), width: um(300), height: um(1000), er: er(4.2) });
      expect(e.code).toBe('OUT_OF_DOMAIN');
      expect(e.field).toBe('targetZ0');
      expect(e.message).toMatch(/unreachable/);
      expect(e.message).toMatch(/0\.01 <= s\/W <= 100/);
    }
    const zWHi = cpwModel(0.01 * S, S, h, 4.2).z0;
    const zWLo = cpwModel(100 * S, S, h, 4.2).z0;
    for (const z of [zWHi * 1.01, zWLo * 0.99]) {
      const e = fail({ targetZ0: ohm(z), gap: um(200), height: um(1000), er: er(4.2) });
      expect(e.code).toBe('OUT_OF_DOMAIN');
      expect(e.message).toMatch(/0\.01 <= W\/s <= 100/);
    }
    // the end points themselves are reachable (inclusive bracket)
    expect(compute({ targetZ0: ohm(zGapLo), width: um(300), height: um(1000), er: er(4.2) }).ok).toBe(true);
    expect(compute({ targetZ0: ohm(zGapHi), width: um(300), height: um(1000), er: er(4.2) }).ok).toBe(true);
  });
  it('the solve result reports the Z0 it solved for, the bracket in the steps, and the target as a user input', () => {
    const r = ok({ targetZ0: ohm(50), width: um(300), height: um(1600), er: er(4.5) });
    expect(res(r, Z0).bound).toBe('nominal');
    expect(relErr(res(r, Z0).value.si, 50)).toBeLessThan(1e-9);
    expect(r.steps.some((s) => /bracket/i.test(s.label) || /bracket/i.test(s.expr))).toBe(true);
    expect(r.inputs.find((i) => i.name === 'target Z0')?.source).toBe('user');
    expect(r.inputs.some((i) => i.name === 'gap')).toBe(false);
  });
});

describe('result schema, banner, confidence, status, warnings', () => {
  const r = ok(analysis(300, 200, 1600, 4.5, { frequency: fromUnit(1, 'GHz'), length: fromUnit(50, 'mm'), lengthMismatch: fromUnit(2, 'mm'), thickness: um(35) }));
  it('every required field is filled and passes assertCalcResult', () => {
    expect(r.method).toBe(meta.method);
    expect(r.formula).toBe(meta.formula);
    expect(r.reference.standard).toBe(meta.reference.standard);
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-023', 'S-023b']));
    expect(r.inputs.length).toBeGreaterThanOrEqual(7);
    expect(r.assumptions.length).toBeGreaterThan(0);
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.validityChecks.length).toBeGreaterThan(0);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.designValues).toEqual([]);
  });
  it('the mandatory banner is in the recommendation verbatim, for analysis and solve', () => {
    expect(r.recommendation.startsWith(IMPEDANCE_BANNER)).toBe(true);
    expect(ok({ targetZ0: ohm(50), width: um(300), height: um(1600), er: er(4.5) }).recommendation).toContain(IMPEDANCE_BANNER);
  });
  it('data status is CONFLICT (S-023) and the confidence is whatever the rule says: low, score 3, reasons list the conflict and the standing assumption', () => {
    expect(r.dataStatus).toBe('CONFLICT');
    expect(r.confidence.level).toBe('low');
    expect(r.confidence.score).toBe(3);
    expect(r.confidence.reasons.join(' ')).toContain(STANDING_ASSUMPTION);
    expect(r.confidence.reasons.join(' ')).toMatch(/CONFLICT/);
    expect(r.assumptions.join(' ')).toContain('Standing assumption');
  });
  it('the conflict is shown as a visible warning naming both eps_e models and the choice made', () => {
    const w = r.warnings.find((x) => x.code === 'MODEL_CONFLICT');
    expect(w?.severity).toBe('warning');
    expect(w?.message).toMatch(/S-023/);
    expect(w?.message).toMatch(/conformal/i);
    expect(w?.message).toMatch(/empirical/i);
  });
  it('dispersion, soldermask and finite thickness are flagged as not modelled on every result; the frequency is stated when given', () => {
    const codes = r.warnings.map((x) => x.code);
    for (const c of ['DISPERSION_NOT_MODELLED', 'SOLDERMASK_NOT_MODELLED', 'FINITE_THICKNESS_NOT_MODELLED', 'COPLANAR_GROUND_WIDTH_ASSUMED']) expect(codes).toContain(c);
    expect(r.warnings.find((x) => x.code === 'DISPERSION_NOT_MODELLED')?.message).toMatch(/1 GHz|1e\+?9|1000000000/);
    const plain = ok(analysis(300, 200, 1600, 4.5));
    expect(plain.warnings.map((x) => x.code)).toEqual(
      expect.arrayContaining(['DISPERSION_NOT_MODELLED', 'SOLDERMASK_NOT_MODELLED', 'FINITE_THICKNESS_NOT_MODELLED']),
    );
    expect(plain.warnings.find((x) => x.code === 'DISPERSION_NOT_MODELLED')?.message).toMatch(/no frequency/i);
    expect(plain.warnings.find((x) => x.code === 'FINITE_THICKNESS_NOT_MODELLED')?.message).toMatch(/zero thickness/i);
    expect(r.warnings.find((x) => x.code === 'FINITE_THICKNESS_NOT_MODELLED')?.message).toMatch(/not used/i);
  });
  it('the entered thickness is echoed but does not change any number', () => {
    const a = ok(analysis(300, 200, 1600, 4.5, { thickness: um(35) }));
    const b = ok(analysis(300, 200, 1600, 4.5));
    expect(a.inputs.find((i) => i.name === 'thickness')?.source).toBe('user');
    expect(res(a, Z0).value.si).toBe(res(b, Z0).value.si);
    expect(res(a, EE).value.si).toBe(res(b, EE).value.si);
  });
  it('delay per length is a prediction; line delay, guided wavelength and skew follow S-029/S-029a/S-029b from the CPW eps_e', () => {
    const ee = res(r, EE).value.si;
    const d = res(r, 'delay per length');
    expect(d.bound).toBe('prediction');
    expect(relErr(d.value.si * 1e9, (Math.sqrt(ee) / 299792458) * 1e9)).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'propagation delay').value, 's'), (0.05 * Math.sqrt(ee)) / 299792458)).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'guided wavelength').value, 'm'), 299792458 / 1e9 / Math.sqrt(ee))).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'skew from length mismatch').value, 's'), (0.002 * Math.sqrt(ee)) / 299792458)).toBeLessThan(1e-12);
    expect(r.dataStatus).toBe('CONFLICT');
    expect(r.reference.ledgerIds).toContain('S-029b');
  });
  it('without optional inputs there is no line delay, wavelength or skew (no hidden defaults)', () => {
    const p = ok(analysis(300, 200, 1600, 4.5));
    for (const n of ['propagation delay', 'guided wavelength', 'skew from length mismatch']) expect(p.results.some((x) => x.name === n)).toBe(false);
  });
  it('inputs carry provenance: user inputs, and the er and geometry source labels when given', () => {
    const x = ok(analysis(300, 200, 1600, 4.5, { erSource: 'user-entered, datasheet X rev A @ 1 GHz', geometrySource: 'stackup "demo", layer L1' }));
    expect(x.inputs.find((i) => i.name === 'er')?.sourceDetail).toContain('datasheet X rev A');
    expect(x.inputs.find((i) => i.name === 'gap')?.sourceDetail).toContain('layer L1');
    expect(x.inputs.every((i) => i.source === 'user')).toBe(true);
  });
  it('assumptions state the model, the prefactor decision, the chosen eps_e model and what is not modelled', () => {
    const text = r.assumptions.join(' ');
    expect(text).toMatch(/conformal/i);
    expect(text).toMatch(/eta0|η0/);
    expect(text).toMatch(/94\.18/);
    expect(text).toMatch(/Q-6/);
    expect(text).toMatch(/roughness/);
    expect(text).toMatch(/no lower ground/i);
    expect(text).toMatch(/3 ?W|ground width/i);
  });
  it('no compliance wording anywhere in the result', () => {
    const text = JSON.stringify([r, ok({ targetZ0: ohm(50), width: um(300), height: um(1600), er: er(4.5) })]);
    for (const line of text.split(/(?<=[.;])/)) expect(detectForbidden(line)).toEqual([]);
  });
});

describe('validity: h >= 2 max(W, s) (Steer guidance) warns and lowers the confidence; domain errors are hard', () => {
  it('a thin substrate fails the check, forces low, names the input and warns', () => {
    const x = ok(analysis(500, 200, 500, 4.5));
    const c = x.validityChecks.find((v) => /h\/max/.test(v.name));
    expect(c?.ok).toBe(false);
    expect(x.confidence.level).toBe('low');
    expect(x.confidence.reasons.join(' ')).toMatch(/h\/max\(W, s\)/);
    expect(x.warnings.some((m) => m.code === 'OUT_OF_RANGE' && m.severity === 'warning')).toBe(true);
  });
  it('h exactly 2 max(W, s) passes; between 2 and 3 passes with a caution; 3 and above has no caution', () => {
    const edge = ok(analysis(500, 200, 1000, 4.5));
    expect(edge.validityChecks.find((v) => /h\/max/.test(v.name))?.ok).toBe(true);
    expect(edge.warnings.some((m) => m.code === 'SUBSTRATE_THICKNESS_MARGINAL')).toBe(true);
    const wide = ok(analysis(500, 200, 1500, 4.5));
    expect(wide.validityChecks.find((v) => /h\/max/.test(v.name))?.ok).toBe(true);
    expect(wide.warnings.some((m) => m.code === 'SUBSTRATE_THICKNESS_MARGINAL')).toBe(false);
    expect(wide.warnings.some((m) => m.code === 'OUT_OF_RANGE')).toBe(false);
  });
  it('the solved geometry is checked too', () => {
    const x = ok({ targetZ0: ohm(50), width: um(300), height: um(100), er: er(4.5) });
    expect(x.validityChecks.find((v) => /h\/max/.test(v.name))?.ok).toBe(false);
  });
  it('a width and gap so small that s (W + s) underflows (kp = 0) is OUT_OF_DOMAIN and says modulus', () => {
    const e = fail({ width: { si: 1e-200, dim: DIM.LENGTH }, gap: { si: 1e-200, dim: DIM.LENGTH }, height: { si: 1e-3, dim: DIM.LENGTH }, er: er(4.5) });
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.message).toMatch(/modulus/);
  });
  it('a gap far below the width (k rounds to 1) still gives a finite, small Z0: the complement carries the information', () => {
    const x = ok({ width: um(1000), gap: { si: 1e-30, dim: DIM.LENGTH }, height: um(1000), er: er(4.5) });
    expect(Number.isFinite(res(x, Z0).value.si)).toBe(true);
    expect(res(x, Z0).value.si).toBeLessThan(10);
  });
  it('a gap 500 times the substrate height (k1 underflows) uses the small-modulus asymptote: eps_e stays just above 1 and Z0 is finite', () => {
    const x = ok(analysis(10, 5000, 10, 1));
    expect(res(x, EE).value.si).toBe(1);
    const y = ok(analysis(10, 5000, 10, 4.5));
    expect(res(y, EE).value.si).toBeGreaterThan(1);
    expect(res(y, EE).value.si).toBeLessThan(1.1);
    expect(Number.isFinite(res(y, Z0).value.si)).toBe(true);
    // the asymptote is the AGM result: just above the switch (k1 about 1e-7, AGM path) K(k1')/K(k1) equals (2/pi) ln(4/k1) to 1e-12
    const edge = cpwModel(10e-6, 105e-6, 10e-6, 4.5);
    expect(edge.k1).toBeGreaterThan(1e-8);
    expect(edge.k1).toBeLessThan(2e-7);
    expect(relErr(edge.rk1, (2 / Math.PI) * Math.log(4 / edge.k1))).toBeLessThan(1e-12);
  });
  it('a strip thousands of substrate thicknesses wide (W/h of 5000, sinh would overflow) is still a finite result with eps_e just above 1', () => {
    const x = ok(analysis(5000, 100, 1, 4.5));
    expect(Number.isFinite(res(x, Z0).value.si)).toBe(true);
    expect(res(x, EE).value.si).toBeGreaterThan(1);
    expect(res(x, EE).value.si).toBeLessThan(1.3);
  });
  it('a tiny W/s (k of about 1e-22) is still inside the domain and gives a finite Z0', () => {
    const x = ok({ width: { si: 1e-25, dim: DIM.LENGTH }, gap: um(1000), height: um(1000), er: er(4.5) });
    expect(Number.isFinite(res(x, Z0).value.si)).toBe(true);
    expect(res(x, Z0).value.si).toBeGreaterThan(200);
  });
  it('overflowing ratios (W/h of 1e300) are an error value, not NaN', () => {
    const e = fail({ width: { si: 1e300, dim: DIM.LENGTH }, gap: um(100), height: { si: 1e-300, dim: DIM.LENGTH }, er: er(4) });
    expect(['OUT_OF_DOMAIN', 'INVALID_INPUT']).toContain(e.code);
  });
  it('no recorded W/s or er range exists for the conformal map, so none is invented (er 128 and W/s of 0.02 pass)', () => {
    for (const x of [ok(analysis(300, 300, 3000, 128)), ok(analysis(10, 500, 3000, 4.5)), ok(analysis(5000, 100, 30000, 4.5))]) {
      expect(x.validityChecks.every((v) => v.ok)).toBe(true);
    }
  });
});

describe('properties (fast-check)', () => {
  const lenArb = fc.double({ min: 20e-6, max: 3000e-6, noNaN: true });
  const erArb = fc.double({ min: 1, max: 128, noNaN: true });
  const z0 = (w: number, s: number, h: number, e: number): number => cpwModel(w, s, h, e).z0;
  it('Z0 decreases as W grows and increases as s grows (fixed h, er)', () => {
    fc.assert(
      fc.property(lenArb, lenArb, lenArb, erArb, (w, s, h, e) => {
        expect(z0(w * 1.05, s, h, e)).toBeLessThan(z0(w, s, h, e));
        expect(z0(w, s * 1.05, h, e)).toBeGreaterThan(z0(w, s, h, e));
      }),
      { numRuns: 300 },
    );
  });
  it('Z0 decreases with h (more dielectric below the slots) and with er, through compute', () => {
    fc.assert(
      fc.property(fc.double({ min: 50, max: 800, noNaN: true }), fc.double({ min: 50, max: 800, noNaN: true }), fc.double({ min: 100, max: 3000, noNaN: true }), fc.double({ min: 1.5, max: 100, noNaN: true }), (w, s, h, e) => {
        const z1 = res(ok(analysis(w, s, h, e)), Z0).value.si;
        expect(res(ok(analysis(w, s, h * 1.1, e)), Z0).value.si).toBeLessThan(z1);
        expect(res(ok(analysis(w, s, h, e * 1.05)), Z0).value.si).toBeLessThan(z1);
      }),
      { numRuns: 100 },
    );
  });
  it('eps_e stays in (1, (er + 1)/2], rises with er, and approaches (er + 1)/2 as h grows', () => {
    fc.assert(
      fc.property(lenArb, lenArb, lenArb, erArb, (w, s, h, e) => {
        const ee = cpwModel(w, s, h, e).epsEff;
        expect(ee).toBeGreaterThanOrEqual(1);
        expect(ee).toBeLessThanOrEqual((e + 1) / 2 + 1e-12);
        if (e > 1.01) {
          expect(cpwModel(w, s, h, e * 1.05).epsEff).toBeGreaterThan(ee);
          expect(cpwModel(w, s, h * 1.2, e).epsEff).toBeGreaterThan(ee);
        }
      }),
      { numRuns: 300 },
    );
  });
  it('Z0 = (eta0/4) K(k\')/K(k) / sqrt(eps_e) for the model values (the S-023 relation restated)', () => {
    fc.assert(
      fc.property(lenArb, lenArb, lenArb, erArb, (w, s, h, e) => {
        const m = cpwModel(w, s, h, e);
        expect(relErr(m.z0, (ETA0 / 4 / Math.sqrt(m.epsEff)) * m.rk)).toBeLessThanOrEqual(1e-14);
        expect(m.k).toBeCloseTo(w / (w + 2 * s), 14);
        expect(m.k * m.k + m.kp * m.kp).toBeCloseTo(1, 12);
        expect(m.k1 * m.k1 + m.k1p * m.k1p).toBeCloseTo(1, 12);
      }),
      { numRuns: 200 },
    );
  });
  it('gap solve and width solve round trips: Z0 of the solution equals the target within 1e-9', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.05, max: 0.95, noNaN: true }), fc.double({ min: 100, max: 600, noNaN: true }), fc.double({ min: 200, max: 3000, noNaN: true }), fc.double({ min: 1.5, max: 20, noNaN: true }), (frac, fixedUm, h, e) => {
        const f = fixedUm * 1e-6;
        const hh = h * 1e-6;
        // gap solve: Z0 rises with s over s/W in [0.01, 100]
        const zLo = z0(f, 0.01 * f, hh, e);
        const zHi = z0(f, 100 * f, hh, e);
        const z = zLo + frac * (zHi - zLo);
        const sol = ok({ targetZ0: ohm(z), width: um(fixedUm), height: um(h), er: er(e) });
        const back = ok({ width: um(fixedUm), gap: res(sol, GAP).value, height: um(h), er: er(e) });
        expect(relErr(res(back, Z0).value.si, z)).toBeLessThanOrEqual(1e-9);
        // width solve: Z0 falls with W over W/s in [0.01, 100]
        const wHi = z0(0.01 * f, f, hh, e);
        const wLo = z0(100 * f, f, hh, e);
        const zw = wLo + frac * (wHi - wLo);
        const solW = ok({ targetZ0: ohm(zw), gap: um(fixedUm), height: um(h), er: er(e) });
        const backW = ok({ width: res(solW, WIDTH).value, gap: um(fixedUm), height: um(h), er: er(e) });
        expect(relErr(res(backW, Z0).value.si, zw)).toBeLessThanOrEqual(1e-9);
      }),
      { numRuns: 80 },
    );
  });
  it('Z0 is monotone over the whole solve bracket for a grid of h/W and er (the documented monotone ranges)', () => {
    for (const hOverW of [0.05, 0.5, 2, 20, 500]) {
      for (const e of [1, 2.2, 4.5, 12.85, 128]) {
        let prev = 0;
        for (let i = 0; i <= 60; i++) {
          const gRatio = 0.01 * 10 ** ((4 * i) / 60);
          const z = z0(1e-3, gRatio * 1e-3, hOverW * 1e-3, e);
          expect(z).toBeGreaterThan(prev);
          prev = z;
        }
      }
    }
  });
  it('only the ratios matter: scaling W, s and h together (um vs mil spellings) leaves Z0 and eps_e unchanged', () => {
    const a = ok({ width: fromUnit(12, 'mil'), gap: fromUnit(8, 'mil'), height: fromUnit(40, 'mil'), er: er(4.2) });
    const b = ok({ width: fromUnit(12 * 25.4, 'um'), gap: fromUnit(8 * 25.4, 'um'), height: fromUnit(40 * 25.4, 'um'), er: er(4.2) });
    expect(relErr(res(a, Z0).value.si, res(b, Z0).value.si)).toBeLessThan(1e-12);
    expect(relErr(res(a, EE).value.si, res(b, EE).value.si)).toBeLessThan(1e-12);
  });
  it('delay rises with er at fixed geometry (directional bound)', () => {
    expect(res(ok(analysis(300, 200, 1600, 4.5)), 'delay per length').value.si).toBeGreaterThan(res(ok(analysis(300, 200, 1600, 3)), 'delay per length').value.si);
  });
  it('never returns NaN or Infinity in any result for random in-domain inputs', () => {
    fc.assert(
      fc.property(fc.double({ min: 10, max: 5000, noNaN: true }), fc.double({ min: 10, max: 5000, noNaN: true }), fc.double({ min: 10, max: 5000, noNaN: true }), erArb, (w, s, h, e) => {
        const x = ok(analysis(w, s, h, e));
        for (const o of x.results) expect(Number.isFinite(o.value.si)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe('guards: errors are values, never thrown', () => {
  const base = (): Inputs => analysis(300, 200, 1600, 4.5);
  const bad: [string, number][] = [
    ['NaN', Number.NaN],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['zero', 0],
    ['negative', -1e-4],
  ];
  const names = ['width', 'gap', 'height', 'thickness', 'frequency', 'length', 'lengthMismatch', 'targetZ0'] as const;
  const q1 = (name: (typeof names)[number], si: number): unknown => {
    const dim = name === 'frequency' ? DIM.FREQUENCY : name === 'targetZ0' ? DIM.RESISTANCE : DIM.LENGTH;
    if (name === 'targetZ0') return { ...base(), gap: undefined, targetZ0: { si, dim } };
    return { ...base(), [name]: { si, dim } };
  };
  for (const name of names) {
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
    expect(fail({ ...base(), gap: fromUnit(5, 'ddegC') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), er: um(4) }).code).toBe('DIMENSION');
    expect(fail({ ...base(), frequency: um(4) }).code).toBe('DIMENSION');
    expect(fail({ ...base(), gap: undefined, targetZ0: um(50) }).code).toBe('DIMENSION');
    expect(fail({ ...base(), width: 300e-6 }).code).toBe('INVALID_INPUT');
  });
  it('mode selection: width and gap (analysis), or targetZ0 with exactly one of width or gap; anything else says so', () => {
    for (const x of [
      { ...base(), targetZ0: ohm(50) },
      { height: um(1600), er: er(4.5), width: um(300) },
      { height: um(1600), er: er(4.5), gap: um(200) },
      { height: um(1600), er: er(4.5) },
      { height: um(1600), er: er(4.5), targetZ0: ohm(50) },
      { height: um(1600), er: er(4.5), targetZ0: ohm(50), width: um(300), gap: um(200) },
    ]) {
      const e = fail(x);
      expect(e.code).toBe('INVALID_INPUT');
      expect(e.message).toMatch(/targetZ0/);
    }
    expect(fail({ width: um(300), gap: um(200), er: er(4.5) }).field).toBe('height');
    expect(fail({ width: um(300), gap: um(200), height: um(1600) }).field).toBe('er');
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
        expect(typeof compute(x as Inputs).ok).toBe('boolean');
      }),
      { numRuns: 300 },
    );
  });
});

describe('performance', () => {
  it('10 000 computes (analysis and both solves) stay within a 5 s total budget', () => {
    const a = analysis(300, 200, 1600, 4.5);
    const s: Inputs = { targetZ0: ohm(50), width: um(300), height: um(1600), er: er(4.5) };
    const w: Inputs = { targetZ0: ohm(50), gap: um(200), height: um(1600), er: er(4.5) };
    const set = [a, s, w];
    for (const x of set) compute(x);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(set[i % 3] as Inputs).ok) n++;
    const dt = performance.now() - t0;
    expect(n).toBe(10_000);
    expect(dt).toBeLessThan(5000);
  });
});
