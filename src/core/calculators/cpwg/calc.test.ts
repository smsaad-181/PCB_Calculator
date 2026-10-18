import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcResult } from '../../result';
import { detectForbidden } from '../../../../tools/audit-lib.mjs';
import { IMPEDANCE_BANNER, STANDING_ASSUMPTION, dimensionless } from '../impedance-shared';
import { cpwModel, cpwgModel } from '../cpw-shared';
import { compute as computeCpw } from '../cpw/calc';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 2 task 5b: conductor-backed coplanar waveguide (ledger S-023a PAYWALLED-USER-MUST-VERIFY; K by AGM, S-023b VERIFIED). TESTS FIRST.
// Every expected number comes from the independent oracle (tools/reference/ref_impedance.py part C, 60-digit decimal K, mirrored in
// docs/golden-vectors.json) or from the S-023a equations restated by hand below. The implementation is never consulted. These tests
// compare the implementation with the recorded formulas (the Qucs transcription of Ghione-Naldi); they do not verify the paper
// (not read) and no ledger row. No published worked example exists for S-023a.
//
// Hand-checkable case (er = 1, W = 500 um, s = 200 um, h = 500 um): eps_e = 1 exactly,
// k = 5/9 so K(k)/K(k') = 0.833315; k3 = tanh(pi/4)/tanh(9 pi/16) = 0.655794/0.888281 = 0.738274, K(k3)/K(k3') = 1.0 ... (oracle b);
// Z0 = (eta0/2) / (K(k)/K(k') + K(k3)/K(k3')) = 188.3652 / (0.833315 + b) = 100.438 ohm.

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

const CASES: [number, number, number, number][] = [
  [500, 200, 500, 1.0], [500, 200, 500, 12.85], [300, 200, 200, 4.2], [250, 150, 1000, 4.2], [200, 150, 160, 4.35], [150, 100, 100, 3.66],
  [400, 300, 1600, 4.5], [500, 200, 100000, 4.5], [100, 50, 50, 3.48], [1000, 500, 300, 4.5], [300, 300, 300, 128.0],
];
const SOLVE_S: [number, number, number, number][] = [[50, 300, 200, 4.2], [60, 250, 1000, 4.2], [75, 200, 800, 3.66], [40, 400, 1600, 4.5]];
const SOLVE_W: [number, number, number, number][] = [[50, 150, 200, 4.2], [60, 150, 1000, 4.2], [75, 300, 800, 3.66], [40, 200, 1600, 4.5]];

describe('golden vectors (oracle): CPWG analysis, Ghione-Naldi (S-023a, PAYWALLED-USER-MUST-VERIFY)', () => {
  for (const [w, s, h, e] of CASES) {
    it(`W ${g(w)} um, s ${g(s)} um, h ${g(h)} um, er ${g(e)}`, () => {
      const t = tag(w, s, h, e);
      const vz = vec(`cpwg_z0_ohm_${t}`);
      const ve = vec(`cpwg_eeff_${t}`);
      const vk3 = vec(`cpwg_k3_${t}`);
      const vq = vec(`cpwg_q_${t}`);
      expect(vz.ledger_ids).toEqual(expect.arrayContaining(['S-023a', 'S-023b', 'S-013', 'S-029', 'S-029a']));
      expect(vz.status).toBe('PAYWALLED-USER-MUST-VERIFY');
      expect(vz.rel_tol).toBeLessThanOrEqual(TOL);
      const r = ok(analysis(w, s, h, e));
      const z = res(r, Z0);
      expect(sameDim(z.value, q(1, DIM.RESISTANCE))).toBe(true);
      expect(z.role).toBe('primary');
      expect(z.bound).toBe('nominal');
      expect(relErr(z.value.si, vz.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, EE).value.si, ve.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, 'modulus k3').value.si, vk3.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, 'filling factor q').value.si, vq.pinned_expected)).toBeLessThanOrEqual(TOL);
      const m = cpwgModel(w * 1e-6, s * 1e-6, h * 1e-6, e);
      expect(relErr(m.z0, vz.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(m.epsEff, ve.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(m.k3, vk3.pinned_expected)).toBeLessThanOrEqual(TOL);
    });
  }
});

describe('hand-checkable cases and the S-023a structure', () => {
  it('er = 1: eps_e is exactly 1 and Z0 = (eta0/2) / (K(k)/K(k\') + K(k3)/K(k3\')) = 100.44 ohm', () => {
    const r = ok(analysis(500, 200, 500, 1));
    expect(res(r, EE).value.si).toBe(1);
    const a = r.steps.find((s) => s.label === "Elliptic ratio K(k)/K(k')")?.value.si as number;
    const b = r.steps.find((s) => s.label === "Elliptic ratio K(k3)/K(k3')")?.value.si as number;
    expect(relErr(res(r, Z0).value.si, ETA0 / 2 / (a + b))).toBeLessThan(1e-13);
    expect(Math.abs(res(r, Z0).value.si - 100.438)).toBeLessThan(2e-3);
    // k = 5/9: K(k)/K(k') = 0.833315 (elliptic vectors at k = 0.555556)
    expect(relErr(a, vec('elliptic_K_k0.555556').pinned_expected / vec('elliptic_Kprime_k0.555556').pinned_expected)).toBeLessThan(1e-5);
  });
  it('k3 uses the quarter-width argument (Qucs, KiCad, patent), not the factor-2 form of one calculator page', () => {
    const w = 500e-6;
    const s = 200e-6;
    const h = 500e-6;
    const hand = Math.tanh((Math.PI * w) / (4 * h)) / Math.tanh((Math.PI * (w + 2 * s)) / (4 * h));
    const factor2 = Math.tanh((Math.PI * w) / (2 * h)) / Math.tanh((Math.PI * (w + 2 * s)) / (2 * h));
    expect(relErr(cpwgModel(w, s, h, 4.5).k3, hand)).toBeLessThan(1e-14);
    expect(Math.abs(cpwgModel(w, s, h, 4.5).k3 - factor2)).toBeGreaterThan(0.05);
  });
  it('as h grows the model tends to the infinite-substrate CPW: eps_e = (er + 1)/2 and the same Z0 as the CPW model', () => {
    for (const e of [2.2, 4.5, 12.85]) {
      const a = ok(analysis(500, 200, 1e8, e));
      const c = cpwModel(500e-6, 200e-6, 100, e);
      expect(Math.abs(res(a, EE).value.si - (e + 1) / 2)).toBeLessThan(1e-6);
      expect(relErr(res(a, Z0).value.si, c.z0)).toBeLessThan(1e-6);
    }
  });
  it('the S-023 and S-023a forms are coherent: CPWG Z0 is below CPW Z0 for the same geometry (follows from k3 > k and k1 < k)', () => {
    for (const [w, s, h, e] of [...CASES, [100, 100, 100, 1], [1000, 50, 60, 2]] as [number, number, number, number][]) {
      const z = res(ok(analysis(w, s, h, e)), Z0).value.si;
      const c = computeCpw(analysis(w, s, h, e));
      if (!c.ok) throw new Error('cpw failed');
      expect(z).toBeLessThan(res(c.value, Z0).value.si);
    }
  });
  it('the k ratio steps are reported: k, k\', k3, k3\', both elliptic ratios and q', () => {
    const r = ok(analysis(500, 200, 500, 4.5));
    const labels = r.steps.map((s) => s.label).join(' | ');
    for (const part of ['Modulus k', "Complementary modulus k'", 'Modulus k3', "Complementary modulus k3'", "K(k)/K(k')", "K(k3)/K(k3')", 'Filling factor q']) expect(labels).toContain(part);
    expect(r.steps.find((s) => s.label === 'Modulus k')?.value.si).toBeCloseTo(5 / 9, 14);
  });
});

describe('golden vectors (oracle): gap and width for a target Z0 (bracketed Brent on the analysis function)', () => {
  for (const [z, w, h, e] of SOLVE_S) {
    it(`gap: Z0 ${g(z)} ohm, W ${g(w)} um, h ${g(h)} um, er ${g(e)}`, () => {
      const v = vec(`cpwg_solve_s_um_Z${g(z)}ohm_w${g(w)}um_h${g(h)}um_er${g(e)}`);
      const r = ok({ targetZ0: ohm(z), width: um(w), height: um(h), er: er(e) });
      const s = res(r, GAP);
      expect(s.role).toBe('primary');
      expect(relErr(toUnit(s.value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, Z0).value.si, z)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(ok(analysis(w, toUnit(s.value, 'um'), h, e)), Z0).value.si, z)).toBeLessThanOrEqual(TOL);
    });
  }
  for (const [z, s, h, e] of SOLVE_W) {
    it(`width: Z0 ${g(z)} ohm, s ${g(s)} um, h ${g(h)} um, er ${g(e)}`, () => {
      const v = vec(`cpwg_solve_w_um_Z${g(z)}ohm_s${g(s)}um_h${g(h)}um_er${g(e)}`);
      const r = ok({ targetZ0: ohm(z), gap: um(s), height: um(h), er: er(e) });
      const w = res(r, WIDTH);
      expect(w.role).toBe('primary');
      expect(relErr(toUnit(w.value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(ok(analysis(toUnit(w.value, 'um'), s, h, e)), Z0).value.si, z)).toBeLessThanOrEqual(TOL);
    });
  }
  it('an unreachable target is OUT_OF_DOMAIN and states the reachable range and the bracket (gap solve and width solve)', () => {
    const W = 300e-6;
    const S = 200e-6;
    const h = 200e-6;
    const zGapLo = cpwgModel(W, 0.01 * W, h, 4.2).z0;
    const zGapHi = cpwgModel(W, 100 * W, h, 4.2).z0;
    for (const z of [zGapLo * 0.99, zGapHi * 1.01, 1e5, 0.01]) {
      const e = fail({ targetZ0: ohm(z), width: um(300), height: um(200), er: er(4.2) });
      expect(e.code).toBe('OUT_OF_DOMAIN');
      expect(e.field).toBe('targetZ0');
      expect(e.message).toMatch(/unreachable/);
      expect(e.message).toMatch(/0\.01 <= s\/W <= 100/);
    }
    const zWHi = cpwgModel(0.01 * S, S, h, 4.2).z0;
    const zWLo = cpwgModel(100 * S, S, h, 4.2).z0;
    for (const z of [zWHi * 1.01, zWLo * 0.99]) {
      const e = fail({ targetZ0: ohm(z), gap: um(200), height: um(200), er: er(4.2) });
      expect(e.code).toBe('OUT_OF_DOMAIN');
      expect(e.message).toMatch(/0\.01 <= W\/s <= 100/);
    }
    expect(compute({ targetZ0: ohm(zGapLo), width: um(300), height: um(200), er: er(4.2) }).ok).toBe(true);
    expect(compute({ targetZ0: ohm(zGapHi), width: um(300), height: um(200), er: er(4.2) }).ok).toBe(true);
  });
  it('the solve result reports the Z0 it solved for, the bracket in the steps, and the target as a user input', () => {
    const r = ok({ targetZ0: ohm(50), width: um(300), height: um(200), er: er(4.2) });
    expect(relErr(res(r, Z0).value.si, 50)).toBeLessThan(1e-9);
    expect(r.steps.some((s) => /bracket/i.test(s.label) || /bracket/i.test(s.expr))).toBe(true);
    expect(r.inputs.find((i) => i.name === 'target Z0')?.source).toBe('user');
  });
});

describe('result schema, banner, confidence, status, warnings', () => {
  const r = ok(analysis(300, 200, 200, 4.2, { frequency: fromUnit(1, 'GHz'), length: fromUnit(50, 'mm'), lengthMismatch: fromUnit(2, 'mm'), thickness: um(35) }));
  it('every required field is filled and passes assertCalcResult', () => {
    expect(r.method).toBe(meta.method);
    expect(r.formula).toBe(meta.formula);
    expect(r.reference.standard).toBe(meta.reference.standard);
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-023a', 'S-023b']));
    expect(r.reference.ledgerIds).not.toContain('S-023');
    expect(r.inputs.length).toBeGreaterThanOrEqual(7);
    expect(r.assumptions.length).toBeGreaterThan(0);
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.validityChecks.length).toBeGreaterThan(0);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.designValues).toEqual([]);
  });
  it('the mandatory banner is in the recommendation verbatim, for analysis and solve', () => {
    expect(r.recommendation.startsWith(IMPEDANCE_BANNER)).toBe(true);
    expect(ok({ targetZ0: ohm(50), width: um(300), height: um(200), er: er(4.2) }).recommendation).toContain(IMPEDANCE_BANNER);
  });
  it('data status is PAYWALLED (S-023a) and the confidence is what the rule says: low, score 3, reasons list the status and the standing assumption', () => {
    expect(r.dataStatus).toBe('PAYWALLED');
    expect(r.confidence.level).toBe('low');
    expect(r.confidence.score).toBe(3);
    expect(r.confidence.reasons.join(' ')).toContain(STANDING_ASSUMPTION);
    expect(r.confidence.reasons.join(' ')).toMatch(/PAYWALLED/);
  });
  it('the unverified status is a visible warning that names the paper, the source of the equations and the k3 conflict', () => {
    const w = r.warnings.find((x) => x.code === 'MODEL_UNVERIFIED');
    expect(w?.severity).toBe('warning');
    expect(w?.message).toMatch(/S-023a/);
    expect(w?.message).toMatch(/PAYWALLED-USER-MUST-VERIFY/);
    expect(w?.message).toMatch(/NextPCB/);
  });
  it('stitching vias, dispersion, soldermask and finite thickness are flagged as not modelled; the frequency is stated when given', () => {
    const codes = r.warnings.map((x) => x.code);
    for (const c of ['STITCHING_VIAS_NOT_MODELLED', 'DISPERSION_NOT_MODELLED', 'SOLDERMASK_NOT_MODELLED', 'FINITE_THICKNESS_NOT_MODELLED', 'COPLANAR_GROUND_WIDTH_ASSUMED']) expect(codes).toContain(c);
    expect(r.warnings.find((x) => x.code === 'STITCHING_VIAS_NOT_MODELLED')?.message).toMatch(/not modelled/);
    expect(r.warnings.find((x) => x.code === 'STITCHING_VIAS_NOT_MODELLED')?.message).toMatch(/no statement/);
    expect(r.warnings.find((x) => x.code === 'DISPERSION_NOT_MODELLED')?.message).toMatch(/1 GHz|1e\+?9|1000000000/);
    const plain = ok(analysis(300, 200, 200, 4.2));
    expect(plain.warnings.find((x) => x.code === 'DISPERSION_NOT_MODELLED')?.message).toMatch(/no frequency/i);
    expect(plain.warnings.find((x) => x.code === 'FINITE_THICKNESS_NOT_MODELLED')?.message).toMatch(/zero thickness/i);
  });
  it('the entered thickness is echoed but does not change any number', () => {
    const a = ok(analysis(300, 200, 200, 4.2, { thickness: um(35) }));
    const b = ok(analysis(300, 200, 200, 4.2));
    expect(a.inputs.find((i) => i.name === 'thickness')?.source).toBe('user');
    expect(res(a, Z0).value.si).toBe(res(b, Z0).value.si);
  });
  it('no numeric validity range is invented: the checks are informational and say so; a thin or a thick substrate never fails one', () => {
    for (const x of [r, ok(analysis(500, 200, 20, 4.5)), ok(analysis(100, 50, 5000, 4.5))]) {
      expect(x.validityChecks.every((v) => v.ok)).toBe(true);
      expect(x.validityChecks.map((v) => v.detail).join(' ')).toMatch(/No numeric validity range is recorded/);
    }
  });
  it('delay, line delay, guided wavelength and skew follow S-029/S-029a/S-029b from the CPWG eps_e', () => {
    const ee = res(r, EE).value.si;
    expect(res(r, 'delay per length').bound).toBe('prediction');
    expect(relErr(toUnit(res(r, 'propagation delay').value, 's'), (0.05 * Math.sqrt(ee)) / 299792458)).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'guided wavelength').value, 'm'), 299792458 / 1e9 / Math.sqrt(ee))).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'skew from length mismatch').value, 's'), (0.002 * Math.sqrt(ee)) / 299792458)).toBeLessThan(1e-12);
    const p = ok(analysis(300, 200, 200, 4.2));
    for (const n of ['propagation delay', 'guided wavelength', 'skew from length mismatch']) expect(p.results.some((x) => x.name === n)).toBe(false);
  });
  it('inputs carry provenance: user inputs, and the er and geometry source labels when given', () => {
    const x = ok(analysis(300, 200, 200, 4.2, { erSource: 'user-entered, datasheet X rev A @ 1 GHz', geometrySource: 'stackup "demo", layer L1' }));
    expect(x.inputs.find((i) => i.name === 'er')?.sourceDetail).toContain('datasheet X rev A');
    expect(x.inputs.find((i) => i.name === 'height')?.sourceDetail).toContain('layer L1');
    expect(x.inputs.every((i) => i.source === 'user')).toBe(true);
  });
  it('assumptions state the model, the k3 convention, the prefactor decision and what is not modelled', () => {
    const text = r.assumptions.join(' ');
    expect(text).toMatch(/lower ground plane/);
    expect(text).toMatch(/NextPCB|factor-2/);
    expect(text).toMatch(/eta0|η0/);
    expect(text).toMatch(/188\.4/);
    expect(text).toMatch(/stitching/);
    expect(text).toMatch(/roughness/);
    expect(text).toMatch(/No accuracy figure and no validity range/);
  });
  it('no compliance wording anywhere in the result', () => {
    const text = JSON.stringify([r, ok({ targetZ0: ohm(50), width: um(300), height: um(200), er: er(4.2) })]);
    for (const line of text.split(/(?<=[.;])/)) expect(detectForbidden(line)).toEqual([]);
  });
});

describe('domain errors are hard; everything else is a result', () => {
  it('a width and gap so small that s (W + s) underflows is OUT_OF_DOMAIN and says modulus', () => {
    const e = fail({ width: { si: 1e-200, dim: DIM.LENGTH }, gap: { si: 1e-200, dim: DIM.LENGTH }, height: { si: 1e-3, dim: DIM.LENGTH }, er: er(4.5) });
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.message).toMatch(/modulus/);
  });
  it('a wide strip over a thin substrate (k3 within 1e-13 of 1) is still a finite result through the complementary modulus', () => {
    const x = ok(analysis(1000, 500, 50, 4.5));
    expect(Number.isFinite(res(x, Z0).value.si)).toBe(true);
    expect(res(x, Z0).value.si).toBeGreaterThan(0);
    expect(res(x, EE).value.si).toBeGreaterThan(res(ok(analysis(1000, 500, 5000, 4.5)), EE).value.si);
  });
  it('a strip hundreds of substrate thicknesses wide (k3 within 1e-300 of 1, k3′ underflows) uses the large-modulus asymptote and stays finite', () => {
    const x = ok(analysis(1000, 500, 1, 4.5));
    expect(Number.isFinite(res(x, Z0).value.si)).toBe(true);
    expect(res(x, Z0).value.si).toBeGreaterThan(0);
    expect(res(x, EE).value.si).toBeGreaterThan(res(ok(analysis(1000, 500, 50, 4.5)), EE).value.si);
    expect(res(x, EE).value.si).toBeLessThan(4.5);
    const one = ok(analysis(1000, 500, 1, 1));
    expect(res(one, EE).value.si).toBe(1);
  });
  it("the asymptote is the AGM result: just above the switch (k3' about 5e-8, AGM path) K(k3)/K(k3') equals (2/pi) ln(4/k3') to 1e-12", () => {
    const edge = cpwgModel(213e-6, 10e-6, 10e-6, 4.5);
    expect(edge.k3p).toBeGreaterThan(1e-8);
    expect(edge.k3p).toBeLessThan(2e-7);
    expect(relErr(edge.ratioK3, (2 / Math.PI) * Math.log(4 / edge.k3p))).toBeLessThan(1e-12);
  });
  it('overflowing ratios (W/h of 1e300) are an error value, not NaN', () => {
    const e = fail({ width: { si: 1e300, dim: DIM.LENGTH }, gap: um(100), height: { si: 1e-300, dim: DIM.LENGTH }, er: er(4) });
    expect(['OUT_OF_DOMAIN', 'INVALID_INPUT']).toContain(e.code);
  });
});

describe('properties (fast-check)', () => {
  const lenArb = fc.double({ min: 20e-6, max: 3000e-6, noNaN: true });
  const erArb = fc.double({ min: 1, max: 128, noNaN: true });
  const z0 = (w: number, s: number, h: number, e: number): number => cpwgModel(w, s, h, e).z0;
  it('Z0 decreases as W grows and increases as s grows (fixed h, er)', () => {
    fc.assert(
      fc.property(lenArb, lenArb, lenArb, erArb, (w, s, h, e) => {
        expect(z0(w * 1.05, s, h, e)).toBeLessThan(z0(w, s, h, e));
        expect(z0(w, s * 1.05, h, e)).toBeGreaterThan(z0(w, s, h, e));
      }),
      { numRuns: 300 },
    );
  });
  it('Z0 increases with h (the lower ground moves away) and decreases with er, through compute', () => {
    fc.assert(
      fc.property(fc.double({ min: 50, max: 800, noNaN: true }), fc.double({ min: 50, max: 800, noNaN: true }), fc.double({ min: 50, max: 3000, noNaN: true }), fc.double({ min: 1.5, max: 100, noNaN: true }), (w, s, h, e) => {
        const z1 = res(ok(analysis(w, s, h, e)), Z0).value.si;
        expect(res(ok(analysis(w, s, h * 1.1, e)), Z0).value.si).toBeGreaterThan(z1);
        expect(res(ok(analysis(w, s, h, e * 1.05)), Z0).value.si).toBeLessThan(z1);
      }),
      { numRuns: 100 },
    );
  });
  it('eps_e stays in [(er + 1)/2, er] (q between 1/2 and 1 because k3 > k), rises with er, and falls toward (er + 1)/2 as h grows', () => {
    fc.assert(
      fc.property(lenArb, lenArb, lenArb, erArb, (w, s, h, e) => {
        const m = cpwgModel(w, s, h, e);
        expect(m.q).toBeGreaterThan(0.5 - 1e-12);
        expect(m.q).toBeLessThan(1);
        expect(m.epsEff).toBeGreaterThanOrEqual((e + 1) / 2 - 1e-9);
        expect(m.epsEff).toBeLessThanOrEqual(e + 1e-12);
        if (e > 1.01) {
          expect(cpwgModel(w, s, h, e * 1.05).epsEff).toBeGreaterThan(m.epsEff);
          expect(cpwgModel(w, s, h * 1.5, e).epsEff).toBeLessThan(m.epsEff);
        }
      }),
      { numRuns: 300 },
    );
  });
  it('CPWG Z0 is below CPW Z0 for any geometry and er (the lower ground adds capacitance)', () => {
    fc.assert(
      fc.property(lenArb, lenArb, lenArb, erArb, (w, s, h, e) => {
        expect(z0(w, s, h, e)).toBeLessThan(cpwModel(w, s, h, e).z0);
      }),
      { numRuns: 300 },
    );
  });
  it('Z0 = (eta0/2) / sqrt(eps_e) / (K(k)/K(k\') + K(k3)/K(k3\')); the moduli satisfy k^2 + k\'^2 = 1', () => {
    fc.assert(
      fc.property(lenArb, lenArb, lenArb, erArb, (w, s, h, e) => {
        const m = cpwgModel(w, s, h, e);
        expect(relErr(m.z0, ETA0 / 2 / Math.sqrt(m.epsEff) / (m.ratioK + m.ratioK3))).toBeLessThanOrEqual(1e-14);
        expect(m.k3).toBeGreaterThan(m.k);
        expect(m.k3 * m.k3 + m.k3p * m.k3p).toBeCloseTo(1, 12);
        expect(m.k * m.k + m.kp * m.kp).toBeCloseTo(1, 12);
      }),
      { numRuns: 200 },
    );
  });
  it('gap solve and width solve round trips: Z0 of the solution equals the target within 1e-9', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.05, max: 0.95, noNaN: true }), fc.double({ min: 100, max: 600, noNaN: true }), fc.double({ min: 100, max: 3000, noNaN: true }), fc.double({ min: 1.5, max: 20, noNaN: true }), (frac, fixedUm, h, e) => {
        const f = fixedUm * 1e-6;
        const hh = h * 1e-6;
        const zLo = z0(f, 0.01 * f, hh, e);
        const zHi = z0(f, 100 * f, hh, e);
        const z = zLo + frac * (zHi - zLo);
        const sol = ok({ targetZ0: ohm(z), width: um(fixedUm), height: um(h), er: er(e) });
        const back = ok({ width: um(fixedUm), gap: res(sol, GAP).value, height: um(h), er: er(e) });
        expect(relErr(res(back, Z0).value.si, z)).toBeLessThanOrEqual(1e-9);
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
    const a = ok({ width: fromUnit(12, 'mil'), gap: fromUnit(8, 'mil'), height: fromUnit(8, 'mil'), er: er(4.2) });
    const b = ok({ width: fromUnit(12 * 25.4, 'um'), gap: fromUnit(8 * 25.4, 'um'), height: fromUnit(8 * 25.4, 'um'), er: er(4.2) });
    expect(relErr(res(a, Z0).value.si, res(b, Z0).value.si)).toBeLessThan(1e-12);
    expect(relErr(res(a, EE).value.si, res(b, EE).value.si)).toBeLessThan(1e-12);
  });
  it('delay rises with er at fixed geometry (directional bound)', () => {
    expect(res(ok(analysis(300, 200, 200, 4.5)), 'delay per length').value.si).toBeGreaterThan(res(ok(analysis(300, 200, 200, 3)), 'delay per length').value.si);
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
  const base = (): Inputs => analysis(300, 200, 200, 4.2);
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
  it('dimension mixing is a DIMENSION error', () => {
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
      { height: um(200), er: er(4.2), width: um(300) },
      { height: um(200), er: er(4.2), gap: um(200) },
      { height: um(200), er: er(4.2) },
      { height: um(200), er: er(4.2), targetZ0: ohm(50) },
    ]) {
      const e = fail(x);
      expect(e.code).toBe('INVALID_INPUT');
      expect(e.message).toMatch(/targetZ0/);
    }
    expect(fail({ width: um(300), gap: um(200), er: er(4.2) }).field).toBe('height');
    expect(fail({ width: um(300), gap: um(200), height: um(200) }).field).toBe('er');
  });
  it('labels must be non-empty text; a non-object input is an error value; junk never throws', () => {
    expect(fail({ ...base(), erSource: '' }).field).toBe('erSource');
    for (const x of [null, undefined, 5, 'x', []]) expect(fail(x).code).toBe('INVALID_INPUT');
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
    const a = analysis(300, 200, 200, 4.2);
    const s: Inputs = { targetZ0: ohm(50), width: um(300), height: um(200), er: er(4.2) };
    const w: Inputs = { targetZ0: ohm(50), gap: um(200), height: um(200), er: er(4.2) };
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
