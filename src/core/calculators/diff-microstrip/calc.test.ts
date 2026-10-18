import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcResult } from '../../result';
import { detectForbidden } from '../../../../tools/audit-lib.mjs';
import { IMPEDANCE_BANNER, STANDING_ASSUMPTION, dimensionless } from '../impedance-shared';
import { compute as computeMicrostrip } from '../microstrip/calc';
import { compute, coupledModes } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 2 task 2/4 part B: edge-coupled differential microstrip (ledger S-022 PAYWALLED-USER-MUST-VERIFY; S-022b VERIFIED
// definitions). TESTS FIRST. Expected numbers come from the independent oracle (tools/reference/ref_impedance.py, mirrored in
// docs/golden-vectors.json) or from the equations of docs/sources/notes/impedance-models.md restated by hand below. No published
// worked example exists for the coupled model, so these tests check the implementation against the recorded formula; they
// verify nothing about the model itself. The implementation is never consulted for an expected value.
//
// Hand-checkable case: w = s = h (u = g = 1), er = 4.5. ln u = 0 removes the messy terms: phi_o = phi_e - theta/psi and f_o = f_o1.
//   psi(1) = 1 + 1/1.45 + 1/3.95 = 1.942820;      phi_e = 0.8645 / psi = 0.444972
//   theta(1) = 1.729 + 1.175 ln(1 + 0.627/1.327) = 2.183675;   phi_o = (0.8645 - 2.183675)/1.942820 = -0.679000
//   mu(1,1) = e^-1 + 21/11 = 2.276970;           f_o = f_o1(1) = 1 - exp(-0.179 - 0.328/ln(e + 7^-2.8)) = 0.397388
//   Z01(1) = (eta0/2pi) ln(6 + sqrt 5) = 126.4239; Z01e = Z01/(1 - Z01 phi_e/eta0) = 148.6158; Z01o = 102.9627
//   eps_e,even = 3.456299, eps_e,odd = 2.941182;  Zeven = 79.9391, Zodd = 60.0370, Zdiff = 2 Zodd = 120.0741, Zcommon = 39.9696

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
const ZD = 'differential impedance Zdiff';
const ZO = 'odd-mode impedance Zodd';
const ZE = 'even-mode impedance Zeven';
const ZC = 'common-mode impedance Zcommon';
const EE_E = 'even-mode effective permittivity';
const EE_O = 'odd-mode effective permittivity';
const Z0 = 'isolated-line impedance Z0 (single-ended, no coupling)';
const EE0 = 'isolated-line effective permittivity';
const RATIO = 'coupling ratio Zdiff / (2 Z0)';
const SOLVE_S = 'edge spacing for target Zdiff';
const SOLVE_W = 'trace width for target Zdiff';
const analysis = (w: number, s: number, h: number, e: number, extra: Partial<Inputs> = {}): Inputs => ({ width: um(w), edgeSpacing: um(s), height: um(h), er: er(e), ...extra });

const DM_CASES: [number, number, number, number][] = [
  [200, 200, 200, 4.5], [150, 100, 200, 4.5], [100, 50, 100, 3.66], [300, 200, 150, 4.2], [50, 50, 500, 4.2], [3000, 300, 300, 4.5],
  [100, 800, 200, 4.5], [200, 3, 200, 4.2], [150, 150, 150, 1.0], [150, 100, 150, 128.0], [635, 300, 635, 9.8], [120, 150, 100, 3.48],
];
const SOLVE_S_CASES: [number, number, number, number][] = [[100, 150, 100, 4.2], [90, 200, 150, 4.5], [110, 120, 100, 3.66], [85, 250, 200, 4.2]];
const SOLVE_W_CASES: [number, number, number, number][] = [[100, 150, 100, 4.2], [90, 200, 150, 4.5], [110, 120, 100, 3.66], [85, 200, 200, 4.2]];
const tag = (w: number, s: number, h: number, e: number): string => `w${g(w)}um_s${g(s)}um_h${g(h)}um_er${g(e)}`;

describe('golden vectors (oracle): S-022 coupled microstrip, analysis', () => {
  for (const [w, s, h, e] of DM_CASES) {
    it(`w ${g(w)}, s ${g(s)}, h ${g(h)} um, er ${g(e)}`, () => {
      const t = tag(w, s, h, e);
      const zo = vec(`diffmicrostrip_zodd_ohm_${t}`);
      expect(zo.ledger_ids).toEqual(expect.arrayContaining(['S-022', 'S-022b', 'S-020', 'S-013', 'S-029', 'S-029a']));
      expect(zo.status).toBe('PAYWALLED-USER-MUST-VERIFY');
      const r = ok(analysis(w, s, h, e));
      for (const [name, key] of [[ZO, 'zodd_ohm'], [ZE, 'zeven_ohm'], [ZD, 'zdiff_ohm'], [ZC, 'zcommon_ohm'], [EE_E, 'eeven'], [EE_O, 'eodd']] as const) {
        expect(relErr(res(r, name).value.si, vec(`diffmicrostrip_${key}_${t}`).pinned_expected), `${name} ${t}`).toBeLessThanOrEqual(TOL);
      }
      expect(sameDim(res(r, ZD).value, q(1, DIM.RESISTANCE))).toBe(true);
      expect(res(r, ZD).role).toBe('primary');
      expect(res(r, ZD).bound).toBe('nominal');
      // S-022b definitions are exact: Zdiff = 2 Zodd, Zcommon = Zeven / 2
      expect(res(r, ZD).value.si).toBe(2 * res(r, ZO).value.si);
      expect(res(r, ZC).value.si).toBe(res(r, ZE).value.si / 2);
      const m = coupledModes(w / h, s / h, e);
      expect(relErr(m.z0o, vec(`diffmicrostrip_zodd_ohm_${t}`).pinned_expected)).toBeLessThanOrEqual(TOL);
    });
  }
  it('er = 1 gives equal even and odd effective permittivity of 1 (no dielectric to differ)', () => {
    const r = ok(analysis(150, 150, 150, 1));
    expect(res(r, EE_E).value.si).toBe(1);
    expect(res(r, EE_O).value.si).toBe(1);
  });
});

describe('hand-checkable case u = g = 1, er = 4.5 (equations of the research note restated)', () => {
  const m = coupledModes(1, 1, 4.5);
  it('closed pieces', () => {
    expect(m.psi).toBeCloseTo(1.94282, 5);
    expect(m.phiE).toBeCloseTo(0.444972, 6);
    expect(m.theta).toBeCloseTo(2.183675, 6);
    expect(m.phiO).toBeCloseTo(-0.6790004, 6);
    expect(m.mu).toBeCloseTo(2.27697, 5);
    expect(m.fo).toBeCloseTo(0.397388, 6);
    expect(relErr(m.fo, m.fo1)).toBeLessThan(1e-14); // ln u = 0
    expect(m.z01).toBeCloseTo(126.4239, 4);
    expect(m.z01e).toBeCloseTo(148.6158, 4);
    expect(m.z01o).toBeCloseTo(102.9627, 4);
  });
  it('outputs', () => {
    expect(m.eeE).toBeCloseTo(3.456299, 5);
    expect(m.eeO).toBeCloseTo(2.941182, 5);
    expect(m.z0e).toBeCloseTo(79.9391, 3);
    expect(m.z0o).toBeCloseTo(60.0370, 3);
    const r = ok(analysis(200, 200, 200, 4.5));
    expect(res(r, ZD).value.si).toBeCloseTo(120.0741, 3);
    expect(res(r, ZC).value.si).toBeCloseTo(39.9696, 3);
  });
  it('independent restatement of phi_o and eps_e,odd from the closed pieces', () => {
    const psi = 1 + 1 / 1.45 + 1 / 3.95;
    const theta = 1.729 + 1.175 * Math.log(1 + 0.627 / (1 + 0.327));
    expect(relErr(m.phiO, (0.8645 - theta) / psi)).toBeLessThan(1e-12);
    const fo1 = 1 - Math.exp(-0.179 - 0.328 / Math.log(Math.E + (1 / 7) ** 2.8));
    const ab = 0.9926885621015908 * 0.5424814467110398; // a(1) b(4.5), single-line S-020 values restated from the oracle
    expect(relErr(m.eeO, 2.75 + 1.75 * fo1 * (1 + 10) ** -ab)).toBeLessThan(1e-9);
  });
});

describe('isolated-line reference (part A microstrip) and the coupling reduction', () => {
  it('the isolated-line Z0 and eps_eff are exactly the part A microstrip values for the same u', () => {
    for (const [w, s, h, e] of DM_CASES) {
      const r = ok(analysis(w, s, h, e));
      const a = computeMicrostrip({ width: um(w), height: um(h), er: er(e) });
      if (!a.ok) throw new Error('part A failed');
      const z0a = a.value.results.find((x) => x.name === 'characteristic impedance Z0')?.value.si as number;
      const eea = a.value.results.find((x) => x.name === 'effective permittivity')?.value.si as number;
      expect(res(r, Z0).value.si).toBe(z0a);
      expect(res(r, EE0).value.si).toBe(eea);
    }
  });
  it('Zodd < Z0 < Zeven and Zdiff < 2 Z0 < ... for strongly coupled cases; ratio = Zdiff / (2 Z0)', () => {
    for (const [w, s, h, e] of DM_CASES.filter(([, ss, hh]) => ss / hh <= 3)) {
      const r = ok(analysis(w, s, h, e));
      const z0 = res(r, Z0).value.si;
      expect(res(r, ZO).value.si).toBeLessThan(z0);
      expect(res(r, ZE).value.si).toBeGreaterThan(z0);
      expect(res(r, RATIO).value.si).toBe(res(r, ZD).value.si / (2 * z0));
      expect(res(r, RATIO).value.si).toBeLessThan(1);
    }
  });
});

describe('golden vectors (oracle): spacing for a target Zdiff (bracketed Brent, 0.01 <= s/h <= 5)', () => {
  for (const [zd, w, h, e] of SOLVE_S_CASES) {
    it(`Zdiff ${g(zd)} ohm, w ${g(w)}, h ${g(h)} um, er ${g(e)}`, () => {
      const v = vec(`diffmicrostrip_solve_s_um_Zd${g(zd)}ohm_w${g(w)}um_h${g(h)}um_er${g(e)}`);
      const r = ok({ targetZdiff: ohm(zd), width: um(w), height: um(h), er: er(e) });
      const s = res(r, SOLVE_S);
      expect(s.role).toBe('primary');
      expect(relErr(toUnit(s.value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, ZD).value.si, zd)).toBeLessThanOrEqual(1e-9);
      expect(res(r, ZD).role).toBe('secondary');
      const back = ok(analysis(w, toUnit(s.value, 'um'), h, e));
      expect(relErr(res(back, ZD).value.si, zd)).toBeLessThanOrEqual(1e-9);
    });
  }
  it('a target below the lowest reachable Zdiff (s/h = 0.01) is an error stating the range; the end point itself is reachable', () => {
    const u = um(150).si / um(100).si; // the ratio exactly as the calculator forms it
    const lo = coupledModes(u, 0.01, 4.2).z0o * 2;
    const e = fail({ targetZdiff: ohm(lo * 0.999), width: um(150), height: um(100), er: er(4.2) });
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.field).toBe('targetZdiff');
    expect(e.message).toMatch(/unreachable/);
    expect(e.message).toMatch(/0\.01/);
    expect(compute({ targetZdiff: ohm(lo), width: um(150), height: um(100), er: er(4.2) }).ok).toBe(true);
  });
  it('a target above Zdiff at s/h = 5 (about 2 Z0) is an error naming the weak-coupling limit', () => {
    const u = um(150).si / um(100).si;
    const hi = coupledModes(u, 5, 4.2).z0o * 2;
    const e = fail({ targetZdiff: ohm(hi * 1.001), width: um(150), height: um(100), er: er(4.2) });
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.message).toMatch(/unreachable/);
    expect(e.message).toMatch(/2 \* Z0|2 Z0/);
    expect(compute({ targetZdiff: ohm(hi), width: um(150), height: um(100), er: er(4.2) }).ok).toBe(true);
  });
});

describe('golden vectors (oracle): width for a target Zdiff (bracketed Brent, 0.1 <= w/h <= 10)', () => {
  for (const [zd, s, h, e] of SOLVE_W_CASES) {
    it(`Zdiff ${g(zd)} ohm, s ${g(s)}, h ${g(h)} um, er ${g(e)}`, () => {
      const v = vec(`diffmicrostrip_solve_w_um_Zd${g(zd)}ohm_s${g(s)}um_h${g(h)}um_er${g(e)}`);
      const r = ok({ targetZdiff: ohm(zd), edgeSpacing: um(s), height: um(h), er: er(e) });
      const w = res(r, SOLVE_W);
      expect(w.role).toBe('primary');
      expect(relErr(toUnit(w.value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, ZD).value.si, zd)).toBeLessThanOrEqual(1e-9);
      const back = ok(analysis(toUnit(w.value, 'um'), s, h, e));
      expect(relErr(res(back, ZD).value.si, zd)).toBeLessThanOrEqual(1e-9);
    });
  }
  it('a target outside the reachable range is an error stating both ends; the end points are reachable', () => {
    const gg = um(50).si / um(100).si;
    const hi = coupledModes(0.1, gg, 4.2).z0o * 2;
    const lo = coupledModes(10, gg, 4.2).z0o * 2;
    const a = fail({ targetZdiff: ohm(hi * 1.001), edgeSpacing: um(50), height: um(100), er: er(4.2) });
    expect(a.code).toBe('OUT_OF_DOMAIN');
    expect(a.message).toMatch(/unreachable/);
    expect(a.message).toMatch(/0\.1/);
    const b = fail({ targetZdiff: ohm(lo * 0.999), edgeSpacing: um(50), height: um(100), er: er(4.2) });
    expect(b.code).toBe('OUT_OF_DOMAIN');
    expect(compute({ targetZdiff: ohm(hi), edgeSpacing: um(50), height: um(100), er: er(4.2) }).ok).toBe(true);
    expect(compute({ targetZdiff: ohm(lo), edgeSpacing: um(50), height: um(100), er: er(4.2) }).ok).toBe(true);
  });
});

describe('result schema, banner, confidence, status, warnings', () => {
  const r = ok(analysis(200, 200, 200, 4.5, { frequency: fromUnit(2, 'GHz'), length: fromUnit(30, 'mm'), lengthMismatch: fromUnit(1, 'mm') }));
  const plain = ok(analysis(200, 200, 200, 4.5));
  it('every required field is filled and passes assertCalcResult', () => {
    expect(r.method).toBe(meta.method);
    expect(r.formula).toBe(meta.formula);
    expect(r.assumptions.length).toBeGreaterThan(0);
    expect(r.steps.length).toBeGreaterThan(10);
    expect(r.validityChecks.length).toBeGreaterThan(0);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-022', 'S-022b', 'S-020', 'S-013', 'S-029', 'S-029a']));
  });
  it('the mandatory banner is in the recommendation verbatim, on analysis and on both solves', () => {
    expect(r.recommendation.startsWith(IMPEDANCE_BANNER)).toBe(true);
    expect(ok({ targetZdiff: ohm(100), width: um(150), height: um(100), er: er(4.2) }).recommendation).toContain(IMPEDANCE_BANNER);
    expect(ok({ targetZdiff: ohm(100), edgeSpacing: um(150), height: um(100), er: er(4.2) }).recommendation).toContain(IMPEDANCE_BANNER);
  });
  it('status is PAYWALLED (S-022); the rule gives empirical 1 + standing assumption 1 + paywalled 2 = 4, so low, never medium or high', () => {
    expect(plain.dataStatus).toBe('PAYWALLED');
    expect(plain.confidence.score).toBe(4);
    expect(plain.confidence.level).toBe('low');
    expect(plain.confidence.reasons.join(' ')).toContain(STANDING_ASSUMPTION);
    expect(plain.confidence.reasons.join(' ')).toContain('PAYWALLED');
    expect(r.confidence.score).toBe(4); // skew (S-029b) does not change the score
  });
  it('the always-on model warnings, and the standing statements in the assumptions', () => {
    const codes = plain.warnings.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['DISPERSION_NOT_MODELLED', 'SOLDERMASK_NOT_MODELLED', 'MODEL_UNVERIFIED']));
    const t = plain.assumptions.join(' ');
    expect(t).toMatch(/symmetric/i);
    expect(t).toMatch(/air-filled/i);
    expect(t).toMatch(/Zdiff = 2 \* Zodd|2 Zodd/);
    expect(t).toMatch(/not verified against the fabricator/);
    expect(t).toMatch(/1 %/);
    expect(plain.warnings.find((x) => x.code === 'DISPERSION_NOT_MODELLED')?.message).toMatch(/no frequency was entered/);
    expect(r.warnings.find((x) => x.code === 'DISPERSION_NOT_MODELLED')?.message).toMatch(/2/);
  });
  it('t > 0 is not used: the warning says so and the numbers do not change', () => {
    const x = ok(analysis(200, 200, 200, 4.5, { thickness: um(35) }));
    const w = x.warnings.find((k) => k.code === 'FINITE_THICKNESS_NOT_MODELLED');
    expect(w?.message).toMatch(/finite thickness is not modelled for the coupled model/i);
    expect(w?.message).toMatch(/NOT used/);
    expect(res(x, ZD).value.si).toBe(res(plain, ZD).value.si);
    expect(plain.warnings.map((k) => k.code)).not.toContain('FINITE_THICKNESS_NOT_MODELLED');
    expect(x.inputs.some((i) => i.name === 'thickness')).toBe(true);
  });
  it('delay: odd-mode (differential) and even-mode per-length delay, propagation delay, wavelength, intra-pair skew', () => {
    const m = coupledModes(1, 1, 4.5);
    const c = 299792458;
    expect(relErr(res(r, 'delay per length (odd mode)').value.si, Math.sqrt(m.eeO) / c)).toBeLessThan(1e-12);
    expect(relErr(res(r, 'delay per length (even mode)').value.si, Math.sqrt(m.eeE) / c)).toBeLessThan(1e-12);
    expect(res(r, 'delay per length (odd mode)').bound).toBe('prediction');
    expect(res(r, 'delay per length (odd mode)').note).toMatch(/ps\/mm \(.* ps\/in\)/);
    expect(relErr(toUnit(res(r, 'propagation delay (odd mode)').value, 's'), (0.03 * Math.sqrt(m.eeO)) / c)).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'propagation delay (even mode)').value, 's'), (0.03 * Math.sqrt(m.eeE)) / c)).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'guided wavelength (odd mode)').value, 'm'), c / 2e9 / Math.sqrt(m.eeO))).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'intra-pair skew from length mismatch (odd mode)').value, 's'), (0.001 * Math.sqrt(m.eeO)) / c)).toBeLessThan(1e-12);
    expect(plain.results.some((x) => /propagation delay|guided wavelength|skew/.test(x.name))).toBe(false);
    expect(r.reference.ledgerIds).toContain('S-029b');
    expect(r.dataStatus).toBe('PAYWALLED');
  });
  it('validity: w/h in [0.1, 10], s/h above 0.01, er in [1, 128] are checked; failures warn and force low', () => {
    const inside = ok(analysis(200, 200, 200, 4.5));
    expect(inside.validityChecks.every((c) => c.ok)).toBe(true);
    for (const [w, s, h, e, what] of [[10, 200, 200, 4.5, 'w/h'], [3000, 200, 200, 4.5, 'w/h'], [200, 1, 200, 4.5, 's/h'], [200, 200, 200, 200, 'er']] as const) {
      const x = ok(analysis(w, s, h, e));
      expect(x.validityChecks.some((c) => !c.ok && c.name.includes(what)), `${what} ${g(w)}/${g(s)}`).toBe(true);
      expect(x.warnings.some((k) => k.code === 'OUT_OF_RANGE')).toBe(true);
      expect(x.confidence.level).toBe('low');
      expect(x.confidence.reasons.join(' ')).toMatch(/outside the model's validity range/);
    }
    // the boundary values themselves are inside the recorded ranges
    expect(ok(analysis(20, 200, 200, 4.5)).validityChecks.find((c) => c.name.includes('w/h'))?.ok).toBe(true);
    expect(ok(analysis(2000, 200, 200, 4.5)).validityChecks.find((c) => c.name.includes('w/h'))?.ok).toBe(true);
    expect(ok(analysis(200, 2, 200, 4.5)).validityChecks.find((c) => c.name.includes('s/h'))?.ok).toBe(true);
  });
  it('very weak coupling (s/h above 3) warns that the fit resolution may exceed the coupling and the ordering check reports it', () => {
    const x = ok(analysis(200, 1000, 100, 4.5)); // g = 10
    expect(x.warnings.map((k) => k.code)).toContain('WEAK_COUPLING_FIT');
    expect(x.validityChecks.some((c) => /Zodd < Z0 < Zeven/.test(c.name))).toBe(true);
    expect(plain.warnings.map((k) => k.code)).not.toContain('WEAK_COUPLING_FIT');
  });
  it('inputs carry provenance and labels', () => {
    const x = ok(analysis(200, 200, 200, 4.5, { erSource: 'user-entered, datasheet Y', geometrySource: 'stackup "demo", layer S' }));
    expect(x.inputs.find((i) => i.name === 'er')?.sourceDetail).toContain('datasheet Y');
    expect(x.inputs.find((i) => i.name === 'edge spacing')?.sourceDetail).toContain('layer S');
    expect(x.inputs.every((i) => i.source === 'user')).toBe(true);
  });
  it('no compliance wording', () => {
    const text = JSON.stringify([r, ok({ targetZdiff: ohm(100), width: um(150), height: um(100), er: er(4.2) })]);
    for (const line of text.split(/(?<=[.;])/)) expect(detectForbidden(line)).toEqual([]);
  });
});

describe('properties (fast-check)', () => {
  const uArb = fc.double({ min: 0.1, max: 10, noNaN: true });
  const gArb = fc.double({ min: 0.01, max: 3, noNaN: true });
  const erArb = fc.double({ min: 1, max: 128, noNaN: true });
  it('Zodd < Z0 < Zeven inside the strongly coupled range s/h <= 3', () => {
    fc.assert(
      fc.property(uArb, gArb, erArb, (u, gg, e) => {
        const m = coupledModes(u, gg, e);
        const z0 = res(ok(analysis(u * 100, gg * 100, 100, e)), Z0).value.si;
        expect(m.z0o).toBeLessThan(z0);
        expect(m.z0e).toBeGreaterThan(z0);
      }),
      { numRuns: 300 },
    );
  });
  it('Zdiff increases with the spacing (0.01 <= s/h <= 5) and approaches 2 Z0 (within 3 % at s/h = 5; the fit overshoots it by up to about 0.65 %, found by scan)', () => {
    fc.assert(
      fc.property(uArb, fc.double({ min: 0.01, max: 5, noNaN: true }), fc.double({ min: 0.01, max: 5, noNaN: true }), erArb, (u, a, b, e) => {
        fc.pre(Math.abs(a - b) > 1e-6);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        expect(coupledModes(u, hi, e).z0o).toBeGreaterThan(coupledModes(u, lo, e).z0o);
      }),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(uArb, erArb, (u, e) => {
        const z0 = res(ok(analysis(u * 100, 500, 100, e)), Z0).value.si;
        const zd5 = 2 * coupledModes(u, 5, e).z0o;
        expect(zd5).toBeLessThan(2 * z0 * 1.01);
        expect(Math.abs(zd5 - 2 * z0) / (2 * z0)).toBeLessThan(0.03);
      }),
      { numRuns: 100 },
    );
  });
  it('Zdiff decreases as the width grows (fixed s/h)', () => {
    fc.assert(
      fc.property(uArb, uArb, fc.double({ min: 0.01, max: 5, noNaN: true }), erArb, (a, b, gg, e) => {
        fc.pre(Math.abs(a - b) > 1e-6);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        expect(coupledModes(hi, gg, e).z0o).toBeLessThan(coupledModes(lo, gg, e).z0o);
      }),
      { numRuns: 300 },
    );
  });
  it('depends only on the ratios w/h and s/h (scale invariance) and Zdiff = 2 Zodd, Zcommon = Zeven / 2 exactly', () => {
    fc.assert(
      fc.property(fc.double({ min: 50, max: 500, noNaN: true }), fc.double({ min: 20, max: 500, noNaN: true }), fc.double({ min: 100, max: 500, noNaN: true }), erArb, (w, s, h, e) => {
        fc.pre(w / h >= 0.1 && w / h <= 10);
        const a = ok(analysis(w, s, h, e));
        const b = ok(analysis(w * 3, s * 3, h * 3, e));
        expect(relErr(res(b, ZD).value.si, res(a, ZD).value.si)).toBeLessThan(1e-12);
        expect(res(a, ZD).value.si).toBe(2 * res(a, ZO).value.si);
        expect(res(a, ZC).value.si).toBe(res(a, ZE).value.si / 2);
      }),
      { numRuns: 100 },
    );
  });
  it('spacing solve round trip: Zdiff(s(Z)) = Z within 1e-9', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 0.9, noNaN: true }), fc.double({ min: 0.3, max: 5, noNaN: true }), fc.double({ min: 100, max: 400, noNaN: true }), fc.double({ min: 2, max: 12, noNaN: true }), (frac, u, h, e) => {
        const lo = 2 * coupledModes(u, 0.01, e).z0o;
        const hi = 2 * coupledModes(u, 5, e).z0o;
        const z = lo + frac * (hi - lo);
        const sol = ok({ targetZdiff: ohm(z), width: um(u * h), height: um(h), er: er(e) });
        const back = ok({ width: um(u * h), edgeSpacing: res(sol, SOLVE_S).value, height: um(h), er: er(e) });
        expect(relErr(res(back, ZD).value.si, z)).toBeLessThanOrEqual(1e-9);
      }),
      { numRuns: 120 },
    );
  });
  it('width solve round trip: Zdiff(w(Z)) = Z within 1e-9', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 0.9, noNaN: true }), fc.double({ min: 0.05, max: 3, noNaN: true }), fc.double({ min: 100, max: 400, noNaN: true }), fc.double({ min: 2, max: 12, noNaN: true }), (frac, gg, h, e) => {
        const hi = 2 * coupledModes(0.1, gg, e).z0o;
        const lo = 2 * coupledModes(10, gg, e).z0o;
        const z = lo + frac * (hi - lo);
        const sol = ok({ targetZdiff: ohm(z), edgeSpacing: um(gg * h), height: um(h), er: er(e) });
        const back = ok({ width: res(sol, SOLVE_W).value, edgeSpacing: um(gg * h), height: um(h), er: er(e) });
        expect(relErr(res(back, ZD).value.si, z)).toBeLessThanOrEqual(1e-9);
      }),
      { numRuns: 120 },
    );
  });
  it('directional bounds: the solved spacing grows with the target Zdiff, the solved width shrinks with it', () => {
    const s = (z: number): number => toUnit(res(ok({ targetZdiff: ohm(z), width: um(150), height: um(100), er: er(4.2) }), SOLVE_S).value, 'um');
    expect(s(95)).toBeGreaterThan(s(90));
    expect(s(100)).toBeGreaterThan(s(95));
    const w = (z: number): number => toUnit(res(ok({ targetZdiff: ohm(z), edgeSpacing: um(150), height: um(100), er: er(4.2) }), SOLVE_W).value, 'um');
    expect(w(95)).toBeLessThan(w(90));
    expect(w(100)).toBeLessThan(w(95));
  });
  it('never returns NaN or Infinity for random in-domain inputs', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 5000, noNaN: true }), fc.double({ min: 1, max: 5000, noNaN: true }), fc.double({ min: 10, max: 2000, noNaN: true }), erArb, (w, s, h, e) => {
        const out = compute(analysis(w, s, h, e));
        if (out.ok) for (const o of out.value.results) expect(Number.isFinite(o.value.si)).toBe(true);
        else expect(['OUT_OF_DOMAIN']).toContain(out.error.code);
      }),
      { numRuns: 300 },
    );
  });
});

describe('guards: errors are values, never thrown', () => {
  const base = (): Inputs => analysis(200, 200, 200, 4.5);
  const bad: [string, number][] = [['NaN', Number.NaN], ['+Infinity', Number.POSITIVE_INFINITY], ['-Infinity', Number.NEGATIVE_INFINITY], ['zero', 0], ['negative', -1e-4]];
  for (const name of ['width', 'edgeSpacing', 'height', 'thickness', 'frequency', 'length', 'lengthMismatch', 'targetZdiff'] as const) {
    for (const [label, si] of bad) {
      it(`${name} ${label} returns INVALID_INPUT with the field name`, () => {
        const dim = name === 'frequency' ? DIM.FREQUENCY : name === 'targetZdiff' ? DIM.RESISTANCE : DIM.LENGTH;
        const input = name === 'targetZdiff' ? { width: um(150), height: um(100), er: er(4.2), targetZdiff: { si, dim } } : { ...base(), [name]: { si, dim } };
        const e = fail(input);
        expect(e.code).toBe('INVALID_INPUT');
        expect(e.field).toBe(name);
        expect(e.message).toContain(name);
      });
    }
  }
  it('er that is NaN, infinite, zero or negative is INVALID_INPUT; below 1 is OUT_OF_DOMAIN; er is required', () => {
    for (const [, si] of bad) expect(fail({ ...base(), er: { si, dim: DIM.DIMENSIONLESS } }).code).toBe('INVALID_INPUT');
    expect(fail({ ...base(), er: er(0.9) }).code).toBe('OUT_OF_DOMAIN');
    expect(fail({ width: um(200), edgeSpacing: um(200), height: um(200) }).field).toBe('er');
  });
  it('dimension mixing is a DIMENSION error', () => {
    expect(fail({ ...base(), width: fromUnit(25, 'degC') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), edgeSpacing: fromUnit(1, 'GHz') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), height: fromUnit(1, 'ohm') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), er: um(4) }).code).toBe('DIMENSION');
    expect(fail({ width: um(150), height: um(100), er: er(4.2), targetZdiff: um(50) }).code).toBe('DIMENSION');
    expect(fail({ ...base(), frequency: um(5) }).code).toBe('DIMENSION');
  });
  it('mode selection: width and edgeSpacing (analysis), or targetZdiff with exactly one of them', () => {
    const msg = /width and edgeSpacing|targetZdiff with exactly one/;
    expect(fail({ height: um(200), er: er(4.5) }).message).toMatch(msg);
    expect(fail({ width: um(200), height: um(200), er: er(4.5) }).message).toMatch(msg);
    expect(fail({ edgeSpacing: um(200), height: um(200), er: er(4.5) }).message).toMatch(msg);
    expect(fail({ ...base(), targetZdiff: ohm(100) }).message).toMatch(msg);
    expect(fail({ height: um(200), er: er(4.5), targetZdiff: ohm(100) }).message).toMatch(msg);
    expect(fail({ width: um(200), edgeSpacing: um(200), er: er(4.5) }).field).toBe('height');
  });
  it('labels must be non-empty text', () => {
    expect(fail({ ...base(), erSource: '' }).field).toBe('erSource');
    expect(fail({ ...base(), geometrySource: 5 }).field).toBe('geometrySource');
  });
  it('non-object input is an error value; junk never throws', () => {
    for (const x of [null, undefined, 5, 'x', []]) expect(fail(x).code).toBe('INVALID_INPUT');
    fc.assert(fc.property(fc.anything(), (x) => typeof compute(x as Inputs).ok === 'boolean'), { numRuns: 300 });
  });
  it('overflowing or undefined geometry returns an error value, never NaN', () => {
    for (const [w, s, h] of [[1e300, 1e-300, 1], [1e-300, 1e300, 1], [1, 1, 1e-300], [1e-9, 1e-9, 1e300]] as const) {
      const out = compute({ width: { si: w, dim: DIM.LENGTH }, edgeSpacing: { si: s, dim: DIM.LENGTH }, height: { si: h, dim: DIM.LENGTH }, er: er(4) });
      if (out.ok) for (const o of out.value.results) expect(Number.isFinite(o.value.si)).toBe(true);
      else expect(['OUT_OF_DOMAIN', 'INVALID_INPUT']).toContain(out.error.code);
    }
  });
});

describe('performance', () => {
  it('10 000 computes (analysis and both solves) stay within a 5 s total budget', () => {
    const a = analysis(200, 200, 200, 4.5);
    const s: Inputs = { targetZdiff: ohm(100), width: um(150), height: um(100), er: er(4.2) };
    const w: Inputs = { targetZdiff: ohm(100), edgeSpacing: um(150), height: um(100), er: er(4.2) };
    const mix = [a, s, w];
    for (const x of mix) compute(x);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(mix[i % 3] as Inputs).ok) n++;
    expect(n).toBe(10_000);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
