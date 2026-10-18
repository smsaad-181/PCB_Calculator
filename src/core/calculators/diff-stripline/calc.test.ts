import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcResult } from '../../result';
import { detectForbidden } from '../../../../tools/audit-lib.mjs';
import { ETA0_OHM } from '../../data/constants';
import { IMPEDANCE_BANNER, STANDING_ASSUMPTION, dimensionless } from '../impedance-shared';
import { compute as computeStripline } from '../stripline/calc';
import { compute, cohnEven, cohnOdd, cohnInfinity } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 2 task 2/4 part B: edge-coupled differential stripline, Cohn approximate even/odd forms (ledger S-022a
// PAYWALLED-USER-MUST-VERIFY; S-022b VERIFIED definitions). TESTS FIRST. Expected numbers come from the independent oracle
// (tools/reference/ref_impedance.py, mirrored in docs/golden-vectors.json) or from the S-022a equations restated by hand below.
// No published worked example exists, so these tests check the implementation against the recorded formula only.
//
// Hand-checkable case: w/b = 0.5, er = 4, pi s / (2 b) = 1 (s = 2b/pi = 636.62 um for b = 1000 um); tanh 1 = 0.761594,
// coth 1 = 1.313035; ln 2 / pi = 0.220636; prefactor (eta0/4)/sqrt(er) = 94.18258/2 = 47.09129 ohm (Q-1; the note prints 94.15).
//   Zeven = 47.09129 / (0.5 + 0.220636 + ln(1.761594)/pi)  = 47.09129 / (0.720636 + 0.180187) = 52.2732 ohm
//   Zodd  = 47.09129 / (0.5 + 0.220636 + ln(2.313035)/pi)  = 47.09129 / (0.720636 + 0.267036) = 47.6846 ohm
//   Zdiff = 2 Zodd = 95.3692 ohm; Zcommon = Zeven / 2 = 26.1366 ohm; weak-coupling limit (s to infinity) = 47.09129/0.941271 = 50.0295 ohm

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
const g = (x: number): string => String(Number(x.toPrecision(6))); // Python's %g, as the oracle names its vectors
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
const EE = 'effective permittivity';
const Z0 = 'isolated-line impedance Z0 (single-ended, no coupling)';
const ZINF = 'weak-coupling limit of the Cohn forms (s to infinity)';
const RATIO = 'coupling ratio Zdiff / (2 Z0)';
const SOLVE_S = 'edge spacing for target Zdiff';
const SOLVE_W = 'strip width for target Zdiff';
const analysis = (w: number, s: number, b: number, e: number, extra: Partial<Inputs> = {}): Inputs => ({ width: um(w), edgeSpacing: um(s), planeSpacing: um(b), er: er(e), ...extra });

const S1 = 636.6197723675814;
const DS_CASES: [number, number, number, number][] = [
  [500, S1, 1000, 4.0], [300, 200, 1000, 4.0], [200, 200, 500, 4.2], [150, 150, 600, 3.66], [500, 400, 1000, 4.5],
  [100, 100, 400, 4.2], [250, 2000, 800, 4.0], [400, 50, 1000, 4.0], [150, 1000, 400, 4.2],
];
const SOLVE_S_CASES: [number, number, number, number][] = [[100, 200, 1000, 4.0], [90, 150, 600, 4.2], [110, 300, 800, 3.66]];
const SOLVE_W_CASES: [number, number, number, number][] = [[100, 200, 1000, 4.0], [90, 150, 600, 4.2], [110, 300, 800, 3.66]];
const tag = (w: number, s: number, b: number, e: number): string => `w${g(w)}um_s${g(s)}um_b${g(b)}um_er${g(e)}`;

describe('golden vectors (oracle): S-022a coupled stripline, analysis', () => {
  for (const [w, s, b, e] of DS_CASES) {
    it(`w ${g(w)}, s ${g(s)}, b ${g(b)} um, er ${g(e)}`, () => {
      const t = tag(w, s, b, e);
      const zo = vec(`diffstripline_zodd_ohm_${t}`);
      expect(zo.ledger_ids).toEqual(expect.arrayContaining(['S-022a', 'S-022b', 'S-021', 'S-013', 'S-029', 'S-029a']));
      expect(zo.status).toBe('PAYWALLED-USER-MUST-VERIFY');
      const r = ok(analysis(w, s, b, e));
      for (const [name, key] of [[ZO, 'zodd_ohm'], [ZE, 'zeven_ohm'], [ZD, 'zdiff_ohm'], [ZC, 'zcommon_ohm'], [ZINF, 'zinf_ohm']] as const) {
        expect(relErr(res(r, name).value.si, vec(`diffstripline_${key}_${t}`).pinned_expected), `${name} ${t}`).toBeLessThanOrEqual(TOL);
      }
      expect(sameDim(res(r, ZD).value, q(1, DIM.RESISTANCE))).toBe(true);
      expect(res(r, ZD).role).toBe('primary');
      expect(res(r, ZD).bound).toBe('nominal');
      expect(res(r, EE).value.si).toBe(e); // homogeneous dielectric: eps_eff = er for both modes
      expect(res(r, ZD).value.si).toBe(2 * res(r, ZO).value.si);
      expect(res(r, ZC).value.si).toBe(res(r, ZE).value.si / 2);
      expect(relErr(cohnOdd(w / b, s / b, e), vec(`diffstripline_zodd_ohm_${t}`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(cohnEven(w / b, s / b, e), vec(`diffstripline_zeven_ohm_${t}`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(cohnInfinity(w / b, e), vec(`diffstripline_zinf_ohm_${t}`).pinned_expected)).toBeLessThanOrEqual(TOL);
    });
  }
});

describe('hand-checkable case: w/b = 0.5, er = 4, pi s / 2b = 1', () => {
  const r = ok(analysis(500, S1, 1000, 4));
  it('matches the equations of the research note restated by hand (eta0/4 prefactor)', () => {
    const p = ETA0_OHM / 4 / 2;
    expect(relErr(res(r, ZE).value.si, p / (0.5 + Math.LN2 / Math.PI + Math.log(1 + Math.tanh(1)) / Math.PI))).toBeLessThan(1e-12);
    expect(relErr(res(r, ZO).value.si, p / (0.5 + Math.LN2 / Math.PI + Math.log(1 + 1 / Math.tanh(1)) / Math.PI))).toBeLessThan(1e-12);
    expect(res(r, ZE).value.si).toBeCloseTo(52.2732, 3);
    expect(res(r, ZO).value.si).toBeCloseTo(47.6846, 3);
    expect(res(r, ZD).value.si).toBeCloseTo(95.3692, 3);
    expect(res(r, ZC).value.si).toBeCloseTo(26.1366, 3);
    expect(res(r, ZINF).value.si).toBeCloseTo(50.0295, 3);
  });
  it('the printed 94.15 constant would give a result 0.034 % lower; the eta0/4 choice (decision Q-1) is stated', () => {
    const printed = (94.15 / 2 / (0.5 + Math.LN2 / Math.PI + Math.log(1 + 1 / Math.tanh(1)) / Math.PI)) * 2;
    expect(relErr(printed, res(r, ZD).value.si)).toBeLessThan(5e-4);
    expect(printed).toBeLessThan(res(r, ZD).value.si);
    expect(r.assumptions.join(' ')).toMatch(/94\.15/);
  });
});

describe('isolated-line reference (part A stripline) and the coupling reduction', () => {
  it('Z0 is exactly the part A stripline value; it is reported next to the Cohn weak-coupling limit', () => {
    for (const [w, s, b, e] of DS_CASES) {
      const r = ok(analysis(w, s, b, e));
      const a = computeStripline({ width: um(w), spacing: um(b), er: er(e) });
      if (!a.ok) throw new Error('part A failed');
      expect(res(r, Z0).value.si).toBe(a.value.results.find((x) => x.name === 'characteristic impedance Z0')?.value.si);
      expect(res(r, RATIO).value.si).toBe(res(r, ZD).value.si / (2 * res(r, Z0).value.si));
    }
  });
  it('Zodd < Zinf < Zeven always; against the part A line it holds for wide strips with real coupling, and a mismatch warning explains the rest', () => {
    for (const [w, s, b, e] of DS_CASES) {
      const r = ok(analysis(w, s, b, e));
      expect(res(r, ZO).value.si).toBeLessThan(res(r, ZINF).value.si);
      expect(res(r, ZE).value.si).toBeGreaterThan(res(r, ZINF).value.si);
    }
    const strong = ok(analysis(500, 400, 1000, 4.5));
    expect(res(strong, ZO).value.si).toBeLessThan(res(strong, Z0).value.si);
    expect(res(strong, ZE).value.si).toBeGreaterThan(res(strong, Z0).value.si);
    expect(strong.warnings.map((k) => k.code)).not.toContain('ISOLATED_MODEL_MISMATCH');
    // narrow strip, weak coupling: part A uses a narrow-strip effective-width correction that the Cohn forms do not have
    const narrow = ok(analysis(100, 1500, 1000, 4));
    expect(narrow.warnings.map((k) => k.code)).toContain('ISOLATED_MODEL_MISMATCH');
    expect(narrow.validityChecks.some((c) => /Zodd < Z0 < Zeven/.test(c.name) && !c.ok)).toBe(true);
    // ... and the coupling ordering against the model's own limit still holds
    expect(res(narrow, ZO).value.si).toBeLessThan(res(narrow, ZINF).value.si);
  });
});

describe('golden vectors (oracle): spacing for a target Zdiff (bracketed Brent, 0.001 <= s/b <= 30)', () => {
  for (const [zd, w, b, e] of SOLVE_S_CASES) {
    it(`Zdiff ${g(zd)} ohm, w ${g(w)}, b ${g(b)} um, er ${g(e)}`, () => {
      const v = vec(`diffstripline_solve_s_um_Zd${g(zd)}ohm_w${g(w)}um_b${g(b)}um_er${g(e)}`);
      const r = ok({ targetZdiff: ohm(zd), width: um(w), planeSpacing: um(b), er: er(e) });
      const s = res(r, SOLVE_S);
      expect(s.role).toBe('primary');
      expect(relErr(toUnit(s.value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, ZD).value.si, zd)).toBeLessThanOrEqual(1e-9);
      expect(res(r, ZD).role).toBe('secondary');
    });
  }
  it('a target below Zdiff at s/b = 0.001 or at/above the weak-coupling limit 2 Zinf is an error stating the range', () => {
    const x = um(200).si / um(1000).si; // the ratio exactly as the calculator forms it
    const lo = 2 * cohnOdd(x, 0.001, 4);
    const hi = 2 * cohnOdd(x, 30, 4);
    const a = fail({ targetZdiff: ohm(lo * 0.999), width: um(200), planeSpacing: um(1000), er: er(4) });
    expect(a.code).toBe('OUT_OF_DOMAIN');
    expect(a.field).toBe('targetZdiff');
    expect(a.message).toMatch(/unreachable/);
    expect(a.message).toMatch(/0\.001/);
    const b = fail({ targetZdiff: ohm(hi * 1.001), width: um(200), planeSpacing: um(1000), er: er(4) });
    expect(b.code).toBe('OUT_OF_DOMAIN');
    expect(b.message).toMatch(/unreachable/);
    expect(b.message).toMatch(/weak-coupling limit/);
    expect(compute({ targetZdiff: ohm(lo), width: um(200), planeSpacing: um(1000), er: er(4) }).ok).toBe(true);
    expect(compute({ targetZdiff: ohm(hi), width: um(200), planeSpacing: um(1000), er: er(4) }).ok).toBe(true);
  });
});

describe('golden vectors (oracle): width for a target Zdiff (bracketed Brent, w/b from 0.05)', () => {
  for (const [zd, s, b, e] of SOLVE_W_CASES) {
    it(`Zdiff ${g(zd)} ohm, s ${g(s)}, b ${g(b)} um, er ${g(e)}`, () => {
      const v = vec(`diffstripline_solve_w_um_Zd${g(zd)}ohm_s${g(s)}um_b${g(b)}um_er${g(e)}`);
      const r = ok({ targetZdiff: ohm(zd), edgeSpacing: um(s), planeSpacing: um(b), er: er(e) });
      const w = res(r, SOLVE_W);
      expect(w.role).toBe('primary');
      expect(relErr(toUnit(w.value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, ZD).value.si, zd)).toBeLessThanOrEqual(1e-9);
    });
  }
  it('a target above Zdiff at w/b = 0.05 is an error stating the range; the end point is reachable; a very low target expands the bracket', () => {
    const y = um(200).si / um(1000).si;
    const hi = 2 * cohnOdd(0.05, y, 4);
    const a = fail({ targetZdiff: ohm(hi * 1.001), edgeSpacing: um(200), planeSpacing: um(1000), er: er(4) });
    expect(a.code).toBe('OUT_OF_DOMAIN');
    expect(a.message).toMatch(/unreachable/);
    expect(a.message).toMatch(/0\.05/);
    expect(compute({ targetZdiff: ohm(hi), edgeSpacing: um(200), planeSpacing: um(1000), er: er(4) }).ok).toBe(true);
    const low = ok({ targetZdiff: ohm(2), edgeSpacing: um(200), planeSpacing: um(1000), er: er(4) });
    expect(relErr(res(low, ZD).value.si, 2)).toBeLessThan(1e-9);
    expect(fail({ targetZdiff: ohm(1e-12), edgeSpacing: um(200), planeSpacing: um(1000), er: er(4) }).code).toBe('OUT_OF_DOMAIN');
  });
});

describe('result schema, banner, confidence, status, warnings', () => {
  const r = ok(analysis(300, 200, 1000, 4.5, { frequency: fromUnit(2, 'GHz'), length: fromUnit(30, 'mm'), lengthMismatch: fromUnit(1, 'mm') }));
  const plain = ok(analysis(300, 200, 1000, 4.5));
  it('every required field is filled and passes assertCalcResult', () => {
    expect(r.method).toBe(meta.method);
    expect(r.formula).toBe(meta.formula);
    expect(r.assumptions.length).toBeGreaterThan(0);
    expect(r.steps.length).toBeGreaterThan(5);
    expect(r.validityChecks.length).toBeGreaterThan(0);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-022a', 'S-022b', 'S-021', 'S-013', 'S-029', 'S-029a']));
    expect(meta.method).toMatch(/Cohn approximation \(zero thickness\)/);
  });
  it('the mandatory banner is in the recommendation verbatim, on analysis and on both solves', () => {
    expect(r.recommendation.startsWith(IMPEDANCE_BANNER)).toBe(true);
    expect(ok({ targetZdiff: ohm(100), width: um(200), planeSpacing: um(1000), er: er(4) }).recommendation).toContain(IMPEDANCE_BANNER);
    expect(ok({ targetZdiff: ohm(100), edgeSpacing: um(200), planeSpacing: um(1000), er: er(4) }).recommendation).toContain(IMPEDANCE_BANNER);
  });
  it('status is PAYWALLED (S-022a); empirical 1 + standing assumption 1 + paywalled 2 = 4, so low, never medium or high', () => {
    expect(plain.dataStatus).toBe('PAYWALLED');
    expect(plain.confidence.score).toBe(4);
    expect(plain.confidence.level).toBe('low');
    expect(plain.confidence.reasons.join(' ')).toContain(STANDING_ASSUMPTION);
    expect(plain.confidence.reasons.join(' ')).toContain('PAYWALLED');
    expect(r.confidence.score).toBe(4);
  });
  it('states the model limits: no recorded range or accuracy, centred symmetric pair, homogeneous dielectric, TEM, no thickness', () => {
    const t = plain.assumptions.join(' ');
    expect(t).toMatch(/no accuracy|none is recorded|no validity range/i);
    expect(t).toMatch(/centred|symmetric/i);
    expect(t).toMatch(/homogeneous/);
    expect(t).toMatch(/TEM/);
    expect(t).toMatch(/not verified against the fabricator/);
    expect(t).toMatch(/Offset stripline|offset stripline/);
    const codes = plain.warnings.map((k) => k.code);
    expect(codes).toContain('MODEL_UNVERIFIED');
    expect(plain.warnings.find((k) => k.code === 'MODEL_UNVERIFIED')?.message).toMatch(/Caspers/);
  });
  it('t > 0 is not used: the warning says so and the numbers do not change; t >= b is refused', () => {
    const x = ok(analysis(300, 200, 1000, 4.5, { thickness: um(35) }));
    const w = x.warnings.find((k) => k.code === 'FINITE_THICKNESS_NOT_MODELLED');
    expect(w?.message).toMatch(/finite thickness is not modelled for the coupled model/i);
    expect(w?.message).toMatch(/NOT used/);
    expect(res(x, ZD).value.si).toBe(res(plain, ZD).value.si);
    expect(plain.warnings.map((k) => k.code)).not.toContain('FINITE_THICKNESS_NOT_MODELLED');
    const e = fail(analysis(300, 200, 1000, 4.5, { thickness: um(1000) }));
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.field).toBe('thickness');
  });
  it('delay: eps_eff = er for both modes; propagation delay, wavelength and intra-pair skew on request', () => {
    const c = 299792458;
    expect(relErr(res(r, 'delay per length').value.si, Math.sqrt(4.5) / c)).toBeLessThan(1e-12);
    expect(res(r, 'delay per length').bound).toBe('prediction');
    expect(res(r, 'delay per length').note).toMatch(/ps\/mm \(.* ps\/in\)/);
    expect(relErr(toUnit(res(r, 'propagation delay').value, 's'), (0.03 * Math.sqrt(4.5)) / c)).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'guided wavelength').value, 'm'), c / 2e9 / Math.sqrt(4.5))).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'intra-pair skew from length mismatch').value, 's'), (0.001 * Math.sqrt(4.5)) / c)).toBeLessThan(1e-12);
    expect(plain.results.some((x) => /propagation delay|guided wavelength|skew/.test(x.name))).toBe(false);
    expect(r.reference.ledgerIds).toContain('S-029b');
    expect(r.dataStatus).toBe('PAYWALLED');
    expect(r.confidence.score).toBe(4);
  });
  it('validity: no range is recorded for S-022a; decision Q-5 applies the nearest recorded stripline range (S-021a, w/b above 0.05) and flags w/b below 0.35', () => {
    const wide = ok(analysis(500, 200, 1000, 4.5));
    expect(wide.validityChecks.every((c) => c.ok)).toBe(true);
    expect(wide.warnings.map((k) => k.code)).not.toContain('NARROW_STRIP_FORM');
    const narrow = ok(analysis(200, 200, 1000, 4.5)); // w/b = 0.2: inside 0.05, below 0.35
    expect(narrow.warnings.map((k) => k.code)).toContain('NARROW_STRIP_FORM');
    expect(narrow.warnings.find((k) => k.code === 'NARROW_STRIP_FORM')?.message).toMatch(/not a sourced limit|inference|unsourced/i);
    expect(narrow.validityChecks.every((c) => c.ok)).toBe(true);
    const out = ok(analysis(40, 200, 1000, 4.5)); // w/b = 0.04
    expect(out.validityChecks.some((c) => !c.ok && /w\/b/.test(c.name))).toBe(true);
    expect(out.warnings.some((k) => k.code === 'OUT_OF_RANGE')).toBe(true);
    expect(out.confidence.level).toBe('low');
    expect(out.confidence.reasons.join(' ')).toMatch(/outside the model's validity range/);
    expect(ok(analysis(50, 200, 1000, 4.5)).validityChecks.find((c) => /w\/b/.test(c.name))?.ok).toBe(true); // the boundary itself
  });
  it('inputs carry provenance and labels', () => {
    const x = ok(analysis(300, 200, 1000, 4.5, { erSource: 'user-entered, datasheet Y', geometrySource: 'stackup "demo", layer S' }));
    expect(x.inputs.find((i) => i.name === 'er')?.sourceDetail).toContain('datasheet Y');
    expect(x.inputs.find((i) => i.name === 'plane spacing')?.sourceDetail).toContain('layer S');
    expect(x.inputs.every((i) => i.source === 'user')).toBe(true);
  });
  it('no compliance wording', () => {
    const text = JSON.stringify([r, ok({ targetZdiff: ohm(100), width: um(200), planeSpacing: um(1000), er: er(4) })]);
    for (const line of text.split(/(?<=[.;])/)) expect(detectForbidden(line)).toEqual([]);
  });
});

describe('properties (fast-check)', () => {
  const xArb = fc.double({ min: 0.05, max: 20, noNaN: true });
  const yArb = fc.double({ min: 0.001, max: 30, noNaN: true });
  const erArb = fc.double({ min: 1, max: 128, noNaN: true });
  it('Zodd < Zinf < Zeven for every spacing, and Zdiff < 2 Zinf', () => {
    fc.assert(
      fc.property(xArb, yArb, erArb, (x, y, e) => {
        fc.pre(y < 5); // beyond about 11 both modes equal Zinf to double precision
        expect(cohnOdd(x, y, e)).toBeLessThan(cohnInfinity(x, e));
        expect(cohnEven(x, y, e)).toBeGreaterThan(cohnInfinity(x, e));
      }),
      { numRuns: 300 },
    );
  });
  it('Zdiff increases with the spacing and tends to 2 Zinf as s grows', () => {
    fc.assert(
      fc.property(xArb, fc.double({ min: 0.001, max: 3, noNaN: true }), fc.double({ min: 0.001, max: 3, noNaN: true }), erArb, (x, a, b, e) => {
        fc.pre(Math.abs(a - b) > 1e-6);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        expect(cohnOdd(x, hi, e)).toBeGreaterThan(cohnOdd(x, lo, e));
      }),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(xArb, erArb, (x, e) => {
        expect(relErr(2 * cohnOdd(x, 30, e), 2 * cohnInfinity(x, e))).toBeLessThan(1e-12);
        expect(relErr(cohnEven(x, 30, e), cohnInfinity(x, e))).toBeLessThan(1e-12);
      }),
      { numRuns: 100 },
    );
  });
  it('Zdiff decreases as the width grows; scales exactly as 1 / sqrt(er)', () => {
    fc.assert(
      fc.property(xArb, xArb, fc.double({ min: 0.001, max: 5, noNaN: true }), erArb, (a, b, y, e) => {
        fc.pre(Math.abs(a - b) > 1e-6);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        expect(cohnOdd(hi, y, e)).toBeLessThan(cohnOdd(lo, y, e));
      }),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(xArb, yArb, erArb, erArb, (x, y, e1, e2) => {
        expect(relErr(cohnOdd(x, y, e1) / cohnOdd(x, y, e2), Math.sqrt(e2 / e1))).toBeLessThanOrEqual(1e-13);
      }),
      { numRuns: 200 },
    );
  });
  it('depends only on w/b and s/b (scale invariance) and Zdiff = 2 Zodd, Zcommon = Zeven / 2 exactly', () => {
    fc.assert(
      fc.property(fc.double({ min: 60, max: 2000, noNaN: true }), fc.double({ min: 20, max: 2000, noNaN: true }), fc.double({ min: 300, max: 2000, noNaN: true }), erArb, (w, s, b, e) => {
        fc.pre(w / b >= 0.05);
        const a = ok(analysis(w, s, b, e));
        const c = ok(analysis(w * 3, s * 3, b * 3, e));
        expect(relErr(res(c, ZD).value.si, res(a, ZD).value.si)).toBeLessThan(1e-12);
        expect(res(a, ZD).value.si).toBe(2 * res(a, ZO).value.si);
        expect(res(a, ZC).value.si).toBe(res(a, ZE).value.si / 2);
      }),
      { numRuns: 100 },
    );
  });
  it('spacing solve round trip: Zdiff(s(Z)) = Z within 1e-9', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.05, max: 0.95, noNaN: true }), fc.double({ min: 0.06, max: 2, noNaN: true }), fc.double({ min: 200, max: 2000, noNaN: true }), fc.double({ min: 1.5, max: 12, noNaN: true }), (frac, x, b, e) => {
        const lo = 2 * cohnOdd(x, 0.001, e);
        const hi = 2 * cohnOdd(x, 30, e);
        const z = lo + frac * (hi - lo);
        const sol = ok({ targetZdiff: ohm(z), width: um(x * b), planeSpacing: um(b), er: er(e) });
        const back = ok({ width: um(x * b), edgeSpacing: res(sol, SOLVE_S).value, planeSpacing: um(b), er: er(e) });
        expect(relErr(res(back, ZD).value.si, z)).toBeLessThanOrEqual(1e-9);
      }),
      { numRuns: 120 },
    );
  });
  it('width solve round trip: Zdiff(w(Z)) = Z within 1e-9', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.05, max: 0.95, noNaN: true }), fc.double({ min: 0.01, max: 3, noNaN: true }), fc.double({ min: 200, max: 2000, noNaN: true }), fc.double({ min: 1.5, max: 12, noNaN: true }), (frac, y, b, e) => {
        const hi = 2 * cohnOdd(0.05, y, e);
        const lo = 2 * cohnOdd(10, y, e);
        const z = lo + frac * (hi - lo);
        const sol = ok({ targetZdiff: ohm(z), edgeSpacing: um(y * b), planeSpacing: um(b), er: er(e) });
        const back = ok({ width: res(sol, SOLVE_W).value, edgeSpacing: um(y * b), planeSpacing: um(b), er: er(e) });
        expect(relErr(res(back, ZD).value.si, z)).toBeLessThanOrEqual(1e-9);
      }),
      { numRuns: 120 },
    );
  });
  it('directional bounds: the solved spacing grows with the target Zdiff, the solved width shrinks with it', () => {
    const s = (z: number): number => toUnit(res(ok({ targetZdiff: ohm(z), width: um(200), planeSpacing: um(1000), er: er(4) }), SOLVE_S).value, 'um');
    expect(s(95)).toBeGreaterThan(s(90));
    expect(s(105)).toBeGreaterThan(s(95));
    const w = (z: number): number => toUnit(res(ok({ targetZdiff: ohm(z), edgeSpacing: um(200), planeSpacing: um(1000), er: er(4) }), SOLVE_W).value, 'um');
    expect(w(95)).toBeLessThan(w(90));
    expect(w(105)).toBeLessThan(w(95));
  });
  it('never returns NaN or Infinity for random in-domain inputs', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 5000, noNaN: true }), fc.double({ min: 1, max: 5000, noNaN: true }), fc.double({ min: 10, max: 5000, noNaN: true }), erArb, (w, s, b, e) => {
        const out = compute(analysis(w, s, b, e));
        if (out.ok) for (const o of out.value.results) expect(Number.isFinite(o.value.si)).toBe(true);
        else expect(['OUT_OF_DOMAIN']).toContain(out.error.code);
      }),
      { numRuns: 300 },
    );
  });
});

describe('guards: errors are values, never thrown', () => {
  const base = (): Inputs => analysis(300, 200, 1000, 4.5);
  const bad: [string, number][] = [['NaN', Number.NaN], ['+Infinity', Number.POSITIVE_INFINITY], ['-Infinity', Number.NEGATIVE_INFINITY], ['zero', 0], ['negative', -1e-4]];
  for (const name of ['width', 'edgeSpacing', 'planeSpacing', 'thickness', 'frequency', 'length', 'lengthMismatch', 'targetZdiff'] as const) {
    for (const [label, si] of bad) {
      it(`${name} ${label} returns INVALID_INPUT with the field name`, () => {
        const dim = name === 'frequency' ? DIM.FREQUENCY : name === 'targetZdiff' ? DIM.RESISTANCE : DIM.LENGTH;
        const input = name === 'targetZdiff' ? { width: um(200), planeSpacing: um(1000), er: er(4), targetZdiff: { si, dim } } : { ...base(), [name]: { si, dim } };
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
    expect(fail({ width: um(300), edgeSpacing: um(200), planeSpacing: um(1000) }).field).toBe('er');
  });
  it('dimension mixing is a DIMENSION error', () => {
    expect(fail({ ...base(), width: fromUnit(25, 'degC') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), edgeSpacing: fromUnit(1, 'GHz') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), planeSpacing: fromUnit(1, 'ohm') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), er: um(4) }).code).toBe('DIMENSION');
    expect(fail({ width: um(200), planeSpacing: um(1000), er: er(4), targetZdiff: um(50) }).code).toBe('DIMENSION');
  });
  it('mode selection: width and edgeSpacing (analysis), or targetZdiff with exactly one of them; planeSpacing and er are required', () => {
    const msg = /width and edgeSpacing|targetZdiff with exactly one/;
    expect(fail({ planeSpacing: um(1000), er: er(4) }).message).toMatch(msg);
    expect(fail({ width: um(300), planeSpacing: um(1000), er: er(4) }).message).toMatch(msg);
    expect(fail({ ...base(), targetZdiff: ohm(100) }).message).toMatch(msg);
    expect(fail({ width: um(300), edgeSpacing: um(200), er: er(4) }).field).toBe('planeSpacing');
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
    for (const [w, s, b] of [[1e300, 1e-300, 1], [1e-300, 1e300, 1], [1, 1, 1e-300], [1e-9, 1e-9, 1e300], [1, 1e300, 1]] as const) {
      const out = compute({ width: { si: w, dim: DIM.LENGTH }, edgeSpacing: { si: s, dim: DIM.LENGTH }, planeSpacing: { si: b, dim: DIM.LENGTH }, er: er(4) });
      if (out.ok) for (const o of out.value.results) expect(Number.isFinite(o.value.si)).toBe(true);
      else expect(['OUT_OF_DOMAIN', 'INVALID_INPUT']).toContain(out.error.code);
    }
  });
});

describe('performance', () => {
  it('10 000 computes (analysis and both solves) stay within a 5 s total budget', () => {
    const a = analysis(300, 200, 1000, 4.5);
    const s: Inputs = { targetZdiff: ohm(100), width: um(200), planeSpacing: um(1000), er: er(4) };
    const w: Inputs = { targetZdiff: ohm(100), edgeSpacing: um(200), planeSpacing: um(1000), er: er(4) };
    const mix = [a, s, w];
    for (const x of mix) compute(x);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(mix[i % 3] as Inputs).ok) n++;
    expect(n).toBe(10_000);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
