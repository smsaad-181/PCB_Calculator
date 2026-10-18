import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcResult } from '../../result';
import { detectForbidden } from '../../../../tools/audit-lib.mjs';
import { Z_PREFACTOR_OHM } from '../../data/constants';
import { IMPEDANCE_BANNER, STANDING_ASSUMPTION, dimensionless } from '../impedance-shared';
import { compute, coaxZ0, diameterRatioForZ0 } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 2 task 3: coaxial line (ledger S-024 VERIFIED). TESTS FIRST. Expected numbers come from the independent oracle
// (tools/reference/ref_impedance.py, mirrored in docs/golden-vectors.json) or from the S-024 equation restated by hand.
//
// Hand-checkable case: D/d = e and er = 1 give Z0 = (eta0/2 pi) ln e = 59.9585 ohm (mu0 c x 2e-7 ... = 2e-7 x 299792458 x ... : 2e-7 c
// = 59.9584916). With the textbook 60 it would be 60. A second hand case: er = 2.25 gives sqrt(er) = 1.5, so Z0 = 59.9585/1.5 ln(D/d) = 39.9723 ln(D/d); D/d = 4 gives 55.4134 ohm.

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

const mm = (n: number): Quantity => fromUnit(n, 'mm');
const er = (n: number): Quantity => dimensionless(n);
const ohm = (n: number): Quantity => fromUnit(n, 'ohm');
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
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
const analysis = (D: number, d: number, e: number, extra: Partial<Inputs> = {}): Inputs => ({ outerDiameter: mm(D), innerDiameter: mm(d), er: er(e), ...extra });

// [D mm, d mm, er, the oracle's %g spelling of D used in the vector name]
const CASES: [number, number, number, string][] = [
  [2.718281828459045, 1.0, 1.0, '2.71828'],
  [3.5, 1.0, 2.1, '3.5'],
  [4.6, 1.5, 2.25, '4.6'],
  [9.0, 2.7, 1.0, '9'],
  [7.25, 2.0, 2.2, '7.25'],
];
const SOLVE: [number, number, number][] = [[50, 1.0, 2.1], [75, 0.5, 2.25]];
const g = (x: number): string => String(x);

describe('golden vectors (oracle): S-024', () => {
  for (const [D, d, e, dTag] of CASES) {
    it(`D ${g(D)} mm, d ${g(d)} mm, er ${g(e)}`, () => {
      const v = vec(`coax_z0_ohm_D${dTag}mm_d${g(d)}mm_er${g(e)}`);
      expect(v.ledger_ids).toEqual(expect.arrayContaining(['S-024', 'S-013', 'S-029', 'S-029a']));
      expect(v.status).toBe('VERIFIED');
      const r = ok(analysis(D, d, e));
      const z = res(r, Z0);
      expect(sameDim(z.value, q(1, DIM.RESISTANCE))).toBe(true);
      expect(z.role).toBe('primary');
      expect(z.bound).toBe('nominal');
      expect(relErr(z.value.si, v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(coaxZ0(D / d, e), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(res(r, 'effective permittivity').value.si).toBe(e);
      expect(relErr(res(r, 'diameter ratio D/d').value.si, D / d)).toBeLessThanOrEqual(1e-14);
    });
  }
  it('hand-checkable: D/d = e, er = 1 gives eta0/(2 pi) = 59.9585 ohm, not 60', () => {
    const z = res(ok(analysis(Math.E, 1, 1)), Z0).value.si;
    expect(relErr(z, Z_PREFACTOR_OHM)).toBeLessThan(1e-14);
    expect(Math.abs(z - 59.9585)).toBeLessThan(1e-4);
    expect(z).not.toBe(60);
  });
  it('hand-checkable: er = 2.25, D/d = 4 gives 39.9723 x ln 4 = 55.4134 ohm', () => {
    expect(Math.abs(res(ok(analysis(4, 1, 2.25)), Z0).value.si - 55.4134)).toBeLessThan(5e-4);
  });
});

describe('golden vectors (oracle): diameter for a target Z0 (closed-form inverse)', () => {
  for (const [z, d, e] of SOLVE) {
    it(`outer diameter for Z0 ${g(z)} ohm, d ${g(d)} mm, er ${g(e)}`, () => {
      const v = vec(`coax_solve_D_mm_Z${g(z)}ohm_d${g(d)}mm_er${g(e)}`);
      const r = ok({ targetZ0: ohm(z), innerDiameter: mm(d), er: er(e) });
      const D = res(r, 'outer diameter for target Z0');
      expect(D.role).toBe('primary');
      expect(relErr(toUnit(D.value, 'mm'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, Z0).value.si, z)).toBeLessThanOrEqual(1e-12);
      expect(relErr(res(ok(analysis(toUnit(D.value, 'mm'), d, e)), Z0).value.si, z)).toBeLessThanOrEqual(1e-12);
    });
  }
  it('the inner diameter for a target Z0 and a given outer diameter is the inverse (round trip)', () => {
    const r = ok({ targetZ0: ohm(50), outerDiameter: mm(4.6), er: er(2.1) });
    const d = res(r, 'inner diameter for target Z0');
    expect(relErr(res(ok(analysis(4.6, toUnit(d.value, 'mm'), 2.1)), Z0).value.si, 50)).toBeLessThanOrEqual(1e-12);
    expect(toUnit(d.value, 'mm')).toBeLessThan(4.6);
  });
  it('an absurd target that overflows exp is an error value, not Infinity', () => {
    const e = fail({ targetZ0: ohm(1e6), innerDiameter: mm(1), er: er(2) });
    expect(e.code).toBe('OUT_OF_DOMAIN');
  });
  it('the diameter ratio is reported with the reference function in the steps', () => {
    expect(relErr(diameterRatioForZ0(50, 2.1), Math.exp((50 * Math.sqrt(2.1)) / Z_PREFACTOR_OHM))).toBeLessThanOrEqual(1e-15);
  });
});

describe('result schema, banner, confidence, status, warnings', () => {
  const r = ok(analysis(3.5, 1, 2.1, { frequency: fromUnit(1, 'GHz'), length: fromUnit(1, 'm'), lengthMismatch: fromUnit(1, 'mm') }));
  const plain = ok(analysis(3.5, 1, 2.1));
  it('every required field is filled and passes assertCalcResult', () => {
    expect(r.method).toBe(meta.method);
    expect(r.formula).toBe(meta.formula);
    expect(r.assumptions.length).toBeGreaterThan(0);
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.validityChecks.length).toBeGreaterThan(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('the mandatory banner is in the recommendation verbatim', () => {
    expect(r.recommendation.startsWith(IMPEDANCE_BANNER)).toBe(true);
  });
  it('confidence: analytical (0) + standing assumption (1) = medium, never high', () => {
    expect(plain.confidence.level).toBe('medium');
    expect(plain.confidence.score).toBe(1);
    expect(plain.confidence.reasons.join(' ')).toContain(STANDING_ASSUMPTION);
    expect(plain.dataStatus).toBe('VERIFIED');
    expect(r.dataStatus).toBe('UNVERIFIED'); // skew row S-029b
    expect(r.confidence.score).toBe(1);
  });
  it('warns TEM only and that higher-order modes are not checked', () => {
    const w = plain.warnings.find((x) => x.code === 'TEM_ONLY');
    expect(w?.message).toMatch(/TEM only/);
    expect(w?.message).toMatch(/higher-order modes/i);
    expect(w?.severity).toBe('caution');
  });
  it('delay, wavelength and skew follow S-029/S-029a/S-029b with eps_eff = er', () => {
    expect(relErr(res(r, 'delay per length').value.si, Math.sqrt(2.1) / 299792458)).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'propagation delay').value, 's'), Math.sqrt(2.1) / 299792458)).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'guided wavelength').value, 'm'), 299792458 / 1e9 / Math.sqrt(2.1))).toBeLessThan(1e-12);
    expect(res(r, 'delay per length').note).toMatch(/ps\/mm \(.* ps\/in\)/);
  });
  it('states the prefactor decision', () => {
    expect(plain.assumptions.join(' ')).toMatch(/59\.9/);
  });
  it('no compliance wording', () => {
    for (const line of JSON.stringify([r, ok({ targetZ0: ohm(50), innerDiameter: mm(1), er: er(2.1) })]).split(/(?<=[.;])/)) expect(detectForbidden(line)).toEqual([]);
  });
  it('inputs carry provenance and labels', () => {
    const x = ok(analysis(3.5, 1, 2.1, { erSource: 'user-entered, PTFE datasheet', geometrySource: 'cable drawing' }));
    expect(x.inputs.find((i) => i.name === 'er')?.sourceDetail).toContain('PTFE');
    expect(x.inputs.every((i) => i.source === 'user')).toBe(true);
  });
});

describe('properties (fast-check)', () => {
  const ratioArb = fc.double({ min: 1.01, max: 50, noNaN: true });
  const erArb = fc.double({ min: 1, max: 128, noNaN: true });
  it('Z0 is proportional to ln(D/d): squaring the ratio doubles Z0', () => {
    fc.assert(
      fc.property(ratioArb, erArb, (ratio, e) => {
        expect(relErr(coaxZ0(ratio * ratio, e), 2 * coaxZ0(ratio, e))).toBeLessThanOrEqual(1e-13);
      }),
      { numRuns: 300 },
    );
  });
  it('Z0 scales as 1/sqrt(er) and rises with D, falls with d (through compute)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1.5, max: 20, noNaN: true }), fc.double({ min: 0.1, max: 1.4, noNaN: true }), erArb, (D, d, e) => {
        const z = res(ok(analysis(D, d, e)), Z0).value.si;
        expect(relErr(res(ok(analysis(D, d, e * 4)), Z0).value.si, z / 2)).toBeLessThanOrEqual(1e-12);
        expect(res(ok(analysis(D * 1.1, d, e)), Z0).value.si).toBeGreaterThan(z);
        expect(res(ok(analysis(D, d * 1.05, e)), Z0).value.si).toBeLessThan(z);
      }),
      { numRuns: 100 },
    );
  });
  it('only the ratio matters (mm vs mil spellings of the same geometry)', () => {
    const a = ok({ outerDiameter: fromUnit(180, 'mil'), innerDiameter: fromUnit(50, 'mil'), er: er(2.1) });
    const b = ok({ outerDiameter: fromUnit(180 * 25.4, 'um'), innerDiameter: fromUnit(50 * 25.4, 'um'), er: er(2.1) });
    expect(relErr(res(a, Z0).value.si, res(b, Z0).value.si)).toBeLessThan(1e-12);
  });
  it('solve round trip: Z0(D(Z)) = Z within 1e-12 for reachable targets', () => {
    fc.assert(
      fc.property(fc.double({ min: 5, max: 200, noNaN: true }), fc.double({ min: 0.1, max: 3, noNaN: true }), erArb, (z, d, e) => {
        const sol = ok({ targetZ0: ohm(z), innerDiameter: mm(d), er: er(e) });
        const back = ok({ outerDiameter: res(sol, 'outer diameter for target Z0').value, innerDiameter: mm(d), er: er(e) });
        expect(relErr(res(back, Z0).value.si, z)).toBeLessThanOrEqual(1e-12);
      }),
      { numRuns: 150 },
    );
  });
  it('never returns NaN or Infinity for random in-domain inputs', () => {
    fc.assert(
      fc.property(fc.double({ min: 1.001, max: 100, noNaN: true }), fc.double({ min: 0.01, max: 1, noNaN: true }), erArb, (D, d, e) => {
        for (const o of ok(analysis(D, d, e)).results) expect(Number.isFinite(o.value.si)).toBe(true);
      }),
      { numRuns: 150 },
    );
  });
});

describe('guards: errors are values, never thrown', () => {
  const base = (): Inputs => analysis(3.5, 1, 2.1);
  const bad: [string, number][] = [['NaN', Number.NaN], ['+Infinity', Number.POSITIVE_INFINITY], ['-Infinity', Number.NEGATIVE_INFINITY], ['zero', 0], ['negative', -1e-4]];
  for (const name of ['outerDiameter', 'innerDiameter', 'frequency', 'length', 'lengthMismatch'] as const) {
    for (const [label, si] of bad) {
      it(`${name} ${label} returns INVALID_INPUT with the field name`, () => {
        const dim = name === 'frequency' ? DIM.FREQUENCY : DIM.LENGTH;
        const e = fail({ ...base(), [name]: { si, dim } });
        expect(e.code).toBe('INVALID_INPUT');
        expect(e.field).toBe(name);
        expect(e.message).toContain(name);
      });
    }
  }
  for (const [label, si] of bad) {
    it(`targetZ0 ${label} returns INVALID_INPUT`, () => {
      const e = fail({ innerDiameter: mm(1), er: er(2), targetZ0: { si, dim: DIM.RESISTANCE } });
      expect(e.code).toBe('INVALID_INPUT');
      expect(e.field).toBe('targetZ0');
    });
  }
  it('er that is NaN, infinite, zero or negative is INVALID_INPUT; below 1 is OUT_OF_DOMAIN', () => {
    for (const [, si] of bad) expect(fail({ ...base(), er: { si, dim: DIM.DIMENSIONLESS } }).code).toBe('INVALID_INPUT');
    expect(fail({ ...base(), er: er(0.99) }).code).toBe('OUT_OF_DOMAIN');
  });
  it('D must exceed d: equal and inverted diameters are OUT_OF_DOMAIN', () => {
    expect(fail(analysis(1, 1, 2)).code).toBe('OUT_OF_DOMAIN');
    const e = fail(analysis(1, 2, 2));
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.message).toMatch(/D > d/);
  });
  it('dimension mixing is a DIMENSION error', () => {
    expect(fail({ ...base(), outerDiameter: fromUnit(25, 'degC') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), innerDiameter: fromUnit(1, 'ohm') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), er: mm(2) }).code).toBe('DIMENSION');
    expect(fail({ outerDiameter: mm(3), er: er(2), targetZ0: mm(50) }).code).toBe('DIMENSION');
  });
  it('mode rules: both diameters, or targetZ0 with exactly one', () => {
    expect(fail({ outerDiameter: mm(3), er: er(2) }).message).toMatch(/both outerDiameter and innerDiameter/);
    expect(fail({ er: er(2) }).message).toMatch(/both outerDiameter and innerDiameter/);
    expect(fail({ ...base(), targetZ0: ohm(50) }).message).toMatch(/exactly one diameter/);
    expect(fail({ targetZ0: ohm(50), er: er(2) }).message).toMatch(/exactly one diameter/);
    expect(fail({ outerDiameter: mm(3), innerDiameter: mm(1) }).field).toBe('er');
  });
  it('labels must be non-empty text', () => {
    expect(fail({ ...base(), erSource: '  ' }).field).toBe('erSource');
  });
  it('non-object input is an error value; junk never throws', () => {
    for (const x of [null, undefined, 5, 'x', []]) expect(fail(x).code).toBe('INVALID_INPUT');
    fc.assert(fc.property(fc.anything(), (x) => typeof compute(x as Inputs).ok === 'boolean'), { numRuns: 300 });
  });
  it('overflowing ratio returns an error value', () => {
    const e = fail({ outerDiameter: { si: 1e300, dim: DIM.LENGTH }, innerDiameter: { si: 1e-300, dim: DIM.LENGTH }, er: er(2) });
    expect(['OUT_OF_DOMAIN', 'INVALID_INPUT']).toContain(e.code);
  });
});

describe('performance', () => {
  it('10 000 computes stay within a 5 s total budget', () => {
    const a = analysis(3.5, 1, 2.1);
    compute(a);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(a).ok) n++;
    expect(n).toBe(10_000);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
