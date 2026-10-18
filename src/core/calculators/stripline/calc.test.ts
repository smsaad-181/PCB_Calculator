import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcResult } from '../../result';
import { detectForbidden } from '../../../../tools/audit-lib.mjs';
import { ETA0_OHM } from '../../data/constants';
import { IMPEDANCE_BANNER, STANDING_ASSUMPTION, dimensionless } from '../impedance-shared';
import { deriveStripline, validateStackup } from '../../stackup';
import { compute, z0CohnWide, z0ZeroThickness } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 2 task 3: symmetric stripline (ledger S-021 VERIFIED; finite-thickness wide-strip variant S-021a CONFLICT). TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_impedance.py, mirrored in docs/golden-vectors.json) or
// from the S-021 equation restated by hand below. Steer's stripline Example 1 (printed 42.77 ohm, formula 42.32 ohm) is NOT used:
// it is internally inconsistent (OPEN_RISKS P2-3, Q-20). The implementation is never consulted for an expected value.
//
// Hand-checkable case (w/b = 0.5, er = 4): w/b >= 0.35 so We/b = 0.5; Z0 = (eta0/4)/2 / (0.5 + 0.441) = 94.1826/2/0.941
// = 47.0913/0.941 = 50.0439 ohm. (With the textbook 30 pi = 94.2478 it would be 50.0786 ohm.)

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
const WIDTH = 'strip width for target Z0';
const analysis = (w: number, b: number, e: number, extra: Partial<Inputs> = {}): Inputs => ({ width: um(w), spacing: um(b), er: er(e), ...extra });

const SL_CASES: [number, number, number][] = [[500, 1000, 4.0], [200, 1000, 4.0], [100, 500, 4.2], [1500, 1000, 3.66], [50, 1000, 4.0], [300, 1000, 4.5], [350, 1000, 4.0], [5000, 1000, 4.0]];
const COHN_CASES: [number, number, number, number][] = [[500, 1000, 20, 4.0], [900, 800, 18, 4.2], [400, 500, 17.5, 3.66], [350, 1000, 20, 4.0]];
const SOLVE_CASES: [number, number, number][] = [[50, 500, 4.2], [50, 1000, 4.0], [75, 600, 4.5], [30, 400, 3.66]];
const COHN_SOLVE_CASES: [number, number, number, number][] = [[50, 800, 18, 4.2], [40, 600, 17.5, 4.0]];

describe('golden vectors (oracle): zero-thickness S-021', () => {
  for (const [w, b, e] of SL_CASES) {
    it(`w ${g(w)} um, b ${g(b)} um, er ${g(e)}`, () => {
      const v = vec(`stripline_z0_ohm_w${g(w)}um_b${g(b)}um_er${g(e)}`);
      expect(v.ledger_ids).toEqual(expect.arrayContaining(['S-021', 'S-013', 'S-029', 'S-029a']));
      expect(v.status).toBe('VERIFIED');
      const r = ok(analysis(w, b, e));
      const z = res(r, Z0);
      expect(sameDim(z.value, q(1, DIM.RESISTANCE))).toBe(true);
      expect(z.role).toBe('primary');
      expect(z.bound).toBe('nominal');
      expect(relErr(z.value.si, v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(res(r, EE).value.si).toBe(e); // homogeneous dielectric: eps_eff = er
      expect(relErr(z0ZeroThickness(w / b, e), v.pinned_expected)).toBeLessThanOrEqual(TOL);
    });
  }
  it('hand-checkable: w/b = 0.5, er = 4 gives 50.0439 ohm (eta0/4 prefactor), not 50.0786 (30 pi)', () => {
    const z = res(ok(analysis(500, 1000, 4)), Z0).value.si;
    expect(Math.abs(z - 50.0439)).toBeLessThan(5e-4);
    expect(relErr(z, ETA0_OHM / 4 / 2 / 0.941)).toBeLessThan(1e-12);
    expect(z).toBeLessThan(50.0786);
  });
  it('the narrow-strip effective width branch (w/b < 0.35) and the wide branch meet at w/b = 0.35', () => {
    const below = z0ZeroThickness(0.35 - 1e-12, 4);
    const at = z0ZeroThickness(0.35, 4);
    expect(relErr(below, at)).toBeLessThan(1e-9);
  });
});

describe('golden vectors (oracle): finite-thickness wide-strip variant S-021a (CONFLICT)', () => {
  for (const [w, b, t, e] of COHN_CASES) {
    it(`w ${g(w)}, b ${g(b)}, t ${g(t)} um, er ${g(e)}`, () => {
      const v = vec(`stripline_cohnwide_z0_ohm_w${g(w)}um_b${g(b)}um_t${g(t)}um_er${g(e)}`);
      expect(v.status).toBe('CONFLICT');
      const r = ok(analysis(w, b, e, { thickness: um(t), thicknessModel: 'cohn-wide' }));
      expect(relErr(res(r, Z0).value.si, v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(z0CohnWide(w / b, t / b, e), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(r.dataStatus).toBe('CONFLICT');
      expect(r.reference.ledgerIds).toContain('S-021a');
      expect(r.warnings.map((x) => x.code)).toContain('THICKNESS_VARIANT_CONFLICT');
    });
  }
  it('tends to the zero-thickness value as t -> 0 (0.441 vs 2 ln2/pi: well inside 0.1 %)', () => {
    expect(relErr(z0CohnWide(0.5, 1e-9, 4), z0ZeroThickness(0.5, 4))).toBeLessThan(1e-3);
  });
  it('narrow strips (w/b < 0.35) with finite thickness are refused: not offered', () => {
    const e = fail(analysis(200, 1000, 4, { thickness: um(20), thicknessModel: 'cohn-wide' }));
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.message).toMatch(/narrow strips with finite thickness are not offered/);
  });
  it('outside the recorded accuracy range t/b < 0.025 the variant fails its check and rates low', () => {
    const x = ok(analysis(500, 400, 4, { thickness: um(35), thicknessModel: 'cohn-wide' }));
    expect(x.validityChecks.some((c) => /t\/b/.test(c.name) && !c.ok)).toBe(true);
    expect(x.confidence.level).toBe('low');
  });
});

describe('golden vectors (oracle): width for a target Z0 (bracketed Brent)', () => {
  for (const [z, b, e] of SOLVE_CASES) {
    it(`Z0 ${g(z)} ohm, b ${g(b)} um, er ${g(e)}`, () => {
      const v = vec(`stripline_solve_w_um_Z${g(z)}ohm_b${g(b)}um_er${g(e)}`);
      const r = ok({ targetZ0: ohm(z), spacing: um(b), er: er(e) });
      const w = res(r, WIDTH);
      expect(w.role).toBe('primary');
      expect(relErr(toUnit(w.value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(ok(analysis(toUnit(w.value, 'um'), b, e)), Z0).value.si, z)).toBeLessThanOrEqual(TOL);
    });
  }
  for (const [z, b, t, e] of COHN_SOLVE_CASES) {
    it(`wide-strip variant: Z0 ${g(z)} ohm, b ${g(b)} um, t ${g(t)} um, er ${g(e)}`, () => {
      const v = vec(`stripline_cohnwide_solve_w_um_Z${g(z)}ohm_b${g(b)}um_t${g(t)}um_er${g(e)}`);
      const r = ok({ targetZ0: ohm(z), spacing: um(b), er: er(e), thickness: um(t), thicknessModel: 'cohn-wide' });
      expect(relErr(toUnit(res(r, WIDTH).value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
    });
  }
  it('a target above the highest Z0 of the bracket (w/b = 0.05) is an error stating the range; the end point itself is reachable', () => {
    const hi = z0ZeroThickness(0.05, 4.2);
    const e = fail({ targetZ0: ohm(hi * 1.001), spacing: um(500), er: er(4.2) });
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.message).toMatch(/0\.05/);
    expect(e.message).toMatch(/unreachable|outside the range/);
    expect(compute({ targetZ0: ohm(hi), spacing: um(500), er: er(4.2) }).ok).toBe(true);
  });
  it('a very low target needs a very wide strip but is still solved (upper bracket expands)', () => {
    const r = ok({ targetZ0: ohm(2), spacing: um(500), er: er(4.2) });
    expect(relErr(res(r, Z0).value.si, 2)).toBeLessThan(1e-9);
  });
  it('an absurdly low target is an error, not NaN', () => {
    const e = fail({ targetZ0: ohm(1e-12), spacing: um(500), er: er(4.2) });
    expect(e.code).toBe('OUT_OF_DOMAIN');
  });
});

describe('result schema, banner, confidence, status, warnings', () => {
  const r = ok(analysis(300, 1000, 4.5, { frequency: fromUnit(2, 'GHz'), length: fromUnit(30, 'mm'), lengthMismatch: fromUnit(1, 'mm') }));
  const plain = ok(analysis(300, 1000, 4.5));
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
    expect(ok({ targetZ0: ohm(50), spacing: um(500), er: er(4.2) }).recommendation).toContain(IMPEDANCE_BANNER);
  });
  it('confidence: empirical (1) + standing assumption (1) = medium, never high; skew does not change it but is shown', () => {
    expect(plain.confidence.level).toBe('medium');
    expect(plain.confidence.score).toBe(2);
    expect(plain.confidence.reasons.join(' ')).toContain(STANDING_ASSUMPTION);
    expect(r.confidence.score).toBe(2);
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(plain.dataStatus).toBe('VERIFIED');
    expect(r.reference.ledgerIds).toContain('S-029b');
  });
  it('states the geometry limits: centred strip, offset stripline not offered, homogeneous dielectric, TEM only', () => {
    const t = plain.assumptions.join(' ');
    expect(t).toMatch(/centred/i);
    expect(t).toMatch(/offset stripline not offered/i);
    expect(t).toMatch(/homogeneous/);
    expect(t).toMatch(/TEM/);
    expect(t).toMatch(/30 pi|30π/);
  });
  it('t > 0 with the thickness variant off warns "zero-thickness model" and the result does not use t', () => {
    const x = ok(analysis(300, 1000, 4.5, { thickness: um(18) }));
    expect(x.warnings.map((w) => w.code)).toContain('ZERO_THICKNESS_MODEL');
    expect(res(x, Z0).value.si).toBe(res(plain, Z0).value.si);
    expect(plain.warnings.map((w) => w.code)).not.toContain('ZERO_THICKNESS_MODEL');
  });
  it('delay: eps_eff = er, per-length delay is a prediction with ps/mm and ps/in text, skew and wavelength are given on request', () => {
    const d = res(r, 'delay per length');
    expect(d.bound).toBe('prediction');
    expect(relErr(d.value.si, Math.sqrt(4.5) / 299792458)).toBeLessThan(1e-12);
    expect(d.note).toMatch(/ps\/mm \(.* ps\/in\)/);
    expect(relErr(toUnit(res(r, 'guided wavelength').value, 'm'), 299792458 / 2e9 / Math.sqrt(4.5))).toBeLessThan(1e-12);
    expect(relErr(toUnit(res(r, 'skew from length mismatch').value, 's'), (0.001 * Math.sqrt(4.5)) / 299792458)).toBeLessThan(1e-12);
    expect(plain.results.some((x) => x.name === 'guided wavelength')).toBe(false);
  });
  it('validity: w/(b-t) > 0.05 is checked; below it the result rates low with a warning', () => {
    const x = ok(analysis(40, 1000, 4.2));
    expect(x.validityChecks.some((c) => /w\/\(b-t\)/.test(c.name) && !c.ok)).toBe(true);
    expect(x.confidence.level).toBe('low');
    expect(x.warnings.some((w) => w.code === 'OUT_OF_RANGE')).toBe(true);
    const edge = ok(analysis(50, 1000, 4.2));
    expect(edge.validityChecks.find((c) => /w\/\(b-t\)/.test(c.name))?.ok).toBe(true);
  });
  it('inputs carry provenance and labels', () => {
    const x = ok(analysis(300, 1000, 4.5, { erSource: 'user-entered, datasheet Y', geometrySource: 'stackup "demo", layer S' }));
    expect(x.inputs.find((i) => i.name === 'er')?.sourceDetail).toContain('datasheet Y');
    expect(x.inputs.find((i) => i.name === 'spacing')?.sourceDetail).toContain('layer S');
    expect(x.inputs.every((i) => i.source === 'user')).toBe(true);
  });
  it('no compliance wording', () => {
    const text = JSON.stringify([r, ok(analysis(500, 1000, 4, { thickness: um(20), thicknessModel: 'cohn-wide' }))]);
    for (const line of text.split(/(?<=[.;])/)) expect(detectForbidden(line)).toEqual([]);
  });
});

describe('stackup wiring: geometry derived from a stackup feeds the calculator, mirrored stacks agree (symmetry)', () => {
  const stack = (above: number, below: number) => {
    const s = validateStackup({
      name: 'sym',
      layers: [
        { kind: 'copper', name: 'P1', thickness: um(35) },
        { kind: 'dielectric', name: 'top', thickness: um(above), er: 4.2, source: 'user-entered demo' },
        { kind: 'copper', name: 'S', thickness: um(18) },
        { kind: 'dielectric', name: 'bot', thickness: um(below), er: 4.2, source: 'user-entered demo' },
        { kind: 'copper', name: 'P2', thickness: um(35) },
      ],
    });
    if (!s.ok) throw new Error('stack');
    return s.value;
  };
  it('b = 2h + t from the stackup gives the same Z0 as entering b directly', () => {
    const d = deriveStripline(stack(200, 200), 'S');
    if (!d.ok) throw new Error(d.error.message);
    const viaStack = ok({ width: um(150), spacing: d.value.b, er: er(d.value.er), thickness: d.value.t, geometrySource: 'stackup "sym", layer S', erSource: d.value.erSource });
    const direct = ok(analysis(150, 200 + 18 + 200, 4.2));
    expect(res(viaStack, Z0).value.si).toBe(res(direct, Z0).value.si);
  });
  it('an off-centre stack is refused by the derivation, so no number is produced', () => {
    const d = deriveStripline(stack(150, 250), 'S');
    expect(d.ok).toBe(false);
  });
});

describe('properties (fast-check)', () => {
  const xArb = fc.double({ min: 0.05, max: 20, noNaN: true });
  const erArb = fc.double({ min: 1, max: 128, noNaN: true });
  it('Z0 decreases as w/b grows', () => {
    fc.assert(
      fc.property(xArb, xArb, erArb, (a, b, e) => {
        fc.pre(Math.abs(a - b) > 1e-6);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        expect(z0ZeroThickness(hi, e)).toBeLessThan(z0ZeroThickness(lo, e));
      }),
      { numRuns: 300 },
    );
  });
  it('Z0 scales exactly as 1/sqrt(er)', () => {
    fc.assert(
      fc.property(xArb, erArb, erArb, (x, e1, e2) => {
        expect(relErr(z0ZeroThickness(x, e1) / z0ZeroThickness(x, e2), Math.sqrt(e2 / e1))).toBeLessThanOrEqual(1e-13);
      }),
      { numRuns: 200 },
    );
  });
  it('Z0 rises with the spacing b at fixed w (through compute) and depends only on w/b (scale invariance)', () => {
    fc.assert(
      fc.property(fc.double({ min: 60, max: 2000, noNaN: true }), fc.double({ min: 300, max: 2000, noNaN: true }), erArb, (w, b, e) => {
        fc.pre(w / b >= 0.05);
        const z1 = res(ok(analysis(w, b, e)), Z0).value.si;
        const z2 = res(ok(analysis(w, b * 1.1, e)), Z0).value.si;
        expect(z2).toBeGreaterThan(z1);
        const z3 = res(ok(analysis(w * 3, b * 3, e)), Z0).value.si;
        expect(relErr(z3, z1)).toBeLessThan(1e-12);
      }),
      { numRuns: 100 },
    );
  });
  it('width solve round trip: Z0(w(Z)) = Z within 1e-9', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.05, max: 0.95, noNaN: true }), fc.double({ min: 200, max: 2000, noNaN: true }), fc.double({ min: 1.5, max: 20, noNaN: true }), (frac, b, e) => {
        const hi = z0ZeroThickness(0.05, e);
        const lo = z0ZeroThickness(2, e);
        const z = lo + frac * (hi - lo);
        const sol = ok({ targetZ0: ohm(z), spacing: um(b), er: er(e) });
        const back = ok({ width: res(sol, WIDTH).value, spacing: um(b), er: er(e) });
        expect(relErr(res(back, Z0).value.si, z)).toBeLessThanOrEqual(1e-9);
      }),
      { numRuns: 150 },
    );
  });
  it('the finite-thickness wide-strip Z0 is below the zero-thickness one for the same w/b (copper fills the gap)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.35, max: 5, noNaN: true }), fc.double({ min: 0.001, max: 0.1, noNaN: true }), erArb, (x, tn, e) => {
        // Z0 with thickness uses (1 - t) in the numerator and Cf in the denominator; check against the closed form restated here.
        const cf = (2 / Math.PI) * Math.log(1 / (1 - tn) + 1) - (tn / Math.PI) * Math.log(1 / (1 - tn) ** 2 - 1);
        const expected = (ETA0_OHM / 4 / Math.sqrt(e)) * (1 - tn) / (x + cf);
        expect(relErr(z0CohnWide(x, tn, e), expected)).toBeLessThanOrEqual(1e-12);
      }),
      { numRuns: 200 },
    );
  });
  it('never returns NaN or Infinity for random in-domain inputs', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 5000, noNaN: true }), fc.double({ min: 10, max: 5000, noNaN: true }), erArb, (w, b, e) => {
        const x = ok(analysis(w, b, e));
        for (const o of x.results) expect(Number.isFinite(o.value.si)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe('guards: errors are values, never thrown', () => {
  const base = (): Inputs => analysis(300, 1000, 4.5);
  const bad: [string, number][] = [['NaN', Number.NaN], ['+Infinity', Number.POSITIVE_INFINITY], ['-Infinity', Number.NEGATIVE_INFINITY], ['zero', 0], ['negative', -1e-4]];
  for (const name of ['width', 'spacing', 'thickness', 'frequency', 'length', 'lengthMismatch', 'targetZ0'] as const) {
    for (const [label, si] of bad) {
      it(`${name} ${label} returns INVALID_INPUT with the field name`, () => {
        const dim = name === 'frequency' ? DIM.FREQUENCY : name === 'targetZ0' ? DIM.RESISTANCE : DIM.LENGTH;
        const input = name === 'targetZ0' ? { ...base(), width: undefined, targetZ0: { si, dim } } : { ...base(), [name]: { si, dim } };
        const e = fail(input);
        expect(e.code).toBe('INVALID_INPUT');
        expect(e.field).toBe(name);
        expect(e.message).toContain(name);
      });
    }
  }
  it('er that is NaN, infinite, zero or negative is INVALID_INPUT; below 1 is OUT_OF_DOMAIN', () => {
    for (const [, si] of bad) expect(fail({ ...base(), er: { si, dim: DIM.DIMENSIONLESS } }).code).toBe('INVALID_INPUT');
    expect(fail({ ...base(), er: er(0.9) }).code).toBe('OUT_OF_DOMAIN');
  });
  it('dimension mixing is a DIMENSION error', () => {
    expect(fail({ ...base(), width: fromUnit(25, 'degC') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), spacing: fromUnit(1, 'GHz') }).code).toBe('DIMENSION');
    expect(fail({ ...base(), er: um(4) }).code).toBe('DIMENSION');
    expect(fail({ ...base(), width: undefined, targetZ0: um(50) }).code).toBe('DIMENSION');
  });
  it('exactly one of width and targetZ0; spacing and er are required; thickness must be below b', () => {
    expect(fail({ ...base(), targetZ0: ohm(50) }).message).toMatch(/exactly one of width or targetZ0/);
    expect(fail({ width: um(300), er: er(4) }).field).toBe('spacing');
    expect(fail({ width: um(300), spacing: um(1000) }).field).toBe('er');
    const e = fail({ ...base(), thickness: um(1000) });
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.field).toBe('thickness');
  });
  it('thicknessModel must be known and needs a thickness', () => {
    expect(fail({ ...base(), thicknessModel: 'cohn-narrow' }).field).toBe('thicknessModel');
    expect(fail({ ...base(), thicknessModel: 'cohn-wide' }).field).toBe('thickness');
  });
  it('non-object input is an error value; junk never throws', () => {
    for (const x of [null, undefined, 5, 'x', []]) expect(fail(x).code).toBe('INVALID_INPUT');
    fc.assert(fc.property(fc.anything(), (x) => typeof compute(x as Inputs).ok === 'boolean'), { numRuns: 300 });
  });
  it('overflowing geometry returns an error value', () => {
    const e = fail({ width: { si: 1e300, dim: DIM.LENGTH }, spacing: { si: 1e-300, dim: DIM.LENGTH }, er: er(4) });
    expect(['OUT_OF_DOMAIN', 'INVALID_INPUT']).toContain(e.code);
  });
});

describe('performance', () => {
  it('10 000 computes stay within a 5 s total budget', () => {
    const a = analysis(300, 1000, 4.5);
    const s: Inputs = { targetZ0: ohm(50), spacing: um(500), er: er(4.2) };
    compute(a);
    compute(s);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(i % 2 === 0 ? a : s).ok) n++;
    expect(n).toBe(10_000);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
