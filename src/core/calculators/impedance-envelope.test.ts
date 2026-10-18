import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q } from '../units';
import type { Quantity } from '../units';
import { parseFabProfile } from '../fab/profile';
import type { ParsedFabProfile } from '../fab/profile';
import type { CalcOutcome, CalcResult } from '../result';
import { err, expectError, expectNoClaimWording, has, okOf, res, si, vec, warningText } from './circuit-test-utils';
import { compute as coaxCompute } from './coax/calc';
import { compute as cpwCompute } from './cpw/calc';
import { compute as cpwgCompute } from './cpwg/calc';
import { compute as diffMicrostripCompute } from './diff-microstrip/calc';
import { compute as diffStriplineCompute } from './diff-stripline/calc';
import { compute as microstripCompute } from './microstrip/calc';
import { compute as striplineCompute } from './stripline/calc';

// Phase 2 core D, task 5: tolerance envelope and sensitivity readout on the seven impedance calculators. TESTS FIRST.
// Expected numbers come from the independent oracle (env_* and sens_* vectors in docs/golden-vectors.json): the envelope corners
// are evaluated there through the oracle's own model functions. Every tolerance in this file is a TEST value, not data.

type Compute = (i: Record<string, unknown>) => CalcOutcome;
const asCompute = (f: unknown): Compute => f as Compute;
const microstrip = asCompute(microstripCompute);
const stripline = asCompute(striplineCompute);
const coax = asCompute(coaxCompute);
const diffMicrostrip = asCompute(diffMicrostripCompute);
const diffStripline = asCompute(diffStriplineCompute);
const cpw = asCompute(cpwCompute);
const cpwg = asCompute(cpwgCompute);

const um = (n: number): Quantity => fromUnit(n, 'um');
const mm = (n: number): Quantity => fromUnit(n, 'mm');
const dl = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const hz = (n: number): Quantity => q(n, DIM.FREQUENCY);
const rawQ = (n: number, dim: Quantity['dim']): Quantity => ({ si: n, dim }) as Quantity;
const frac = dl;
const asym = (minus: number, plus: number): { minus: Quantity; plus: Quantity } => ({ minus: frac(minus), plus: frac(plus) });
const tolOf = (m: number, p: number): Quantity | { minus: Quantity; plus: Quantity } => (m === p ? frac(m) : asym(m, p));
const TOL = 1e-9;
/** Sensitivity comparison: central difference with a 1e-4 step against the oracle's 1e-6 step. */
const sensClose = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.abs(b) + 1e-8;

const env = (r: CalcResult, name: string): NonNullable<CalcResult['envelope']>[number] | undefined => r.envelope?.find((x) => x.name === name);
const sens = (r: CalcResult, out: string, label: string): number | undefined => r.results.find((x) => x.name === `sensitivity of ${out} to ${label}`)?.value.si;

const SINGLE = { z0: 'characteristic impedance Z0', eeff: 'effective permittivity', delay: 'delay per length' };
const DIFFMS = {
  zdiff: 'differential impedance Zdiff',
  zodd: 'odd-mode impedance Zodd',
  zeven: 'even-mode impedance Zeven',
  eeodd: 'odd-mode effective permittivity',
  eeeven: 'even-mode effective permittivity',
  delayodd: 'delay per length (odd mode)',
  delayeven: 'delay per length (even mode)',
};
const DIFFSL = { zdiff: DIFFMS.zdiff, zodd: DIFFMS.zodd, zeven: DIFFMS.zeven, eeff: 'effective permittivity', delay: 'delay per length' };

interface Tol {
  /** the oracle's key for the input */
  readonly key: string;
  /** the calculator's tolerance key and the label used in result names */
  readonly ts: string;
  readonly label: string;
  readonly minus: number;
  readonly plus: number;
}
interface Case {
  readonly calc: string;
  readonly tag: string;
  readonly compute: Compute;
  readonly inputs: Record<string, unknown>;
  readonly outs: Record<string, string>;
  readonly tols: readonly Tol[];
}
const t = (key: string, ts: string, label: string, minus: number, plus = minus): Tol => ({ key, ts, label, minus, plus });

const CASES: Case[] = [
  { calc: 'microstrip', tag: 'A', compute: microstrip, inputs: { width: um(300), height: um(150), er: dl(4.2) }, outs: SINGLE,
    tols: [t('w', 'width', 'width', 0.1), t('h', 'height', 'height', 0.05), t('er', 'er', 'er', 0.05)] },
  { calc: 'microstrip', tag: 'B', compute: microstrip, inputs: { width: um(600), height: um(635), er: dl(4.1) }, outs: SINGLE,
    tols: [t('w', 'width', 'width', 0.2, 0.05), t('er', 'er', 'er', 0, 0.1)] },
  { calc: 'microstrip', tag: 'T', compute: microstrip, inputs: { width: um(3150), height: um(1575), thickness: um(35), thicknessModel: 'hj-procedure-B', er: dl(4.5) }, outs: SINGLE,
    tols: [t('w', 'width', 'width', 0.1), t('t', 'thickness', 'thickness', 0.1), t('h', 'height', 'height', 0.05)] },
  { calc: 'stripline', tag: 'A', compute: stripline, inputs: { width: um(200), spacing: um(1000), er: dl(4) }, outs: SINGLE,
    tols: [t('w', 'width', 'width', 0.1), t('b', 'spacing', 'spacing', 0.05), t('er', 'er', 'er', 0.05)] },
  { calc: 'stripline', tag: 'T', compute: stripline, inputs: { width: um(500), spacing: um(1000), thickness: um(20), thicknessModel: 'cohn-wide', er: dl(4) }, outs: SINGLE,
    tols: [t('w', 'width', 'width', 0.1), t('t', 'thickness', 'thickness', 0.1, 0.2)] },
  { calc: 'coax', tag: 'A', compute: coax, inputs: { outerDiameter: mm(3.5), innerDiameter: mm(1), er: dl(2.1) }, outs: SINGLE,
    tols: [t('D', 'outerDiameter', 'outer diameter', 0.02), t('d', 'innerDiameter', 'inner diameter', 0.02), t('er', 'er', 'er', 0.03)] },
  { calc: 'diffmicrostrip', tag: 'A', compute: diffMicrostrip, inputs: { width: um(150), edgeSpacing: um(100), height: um(200), er: dl(4.5) }, outs: DIFFMS,
    tols: [t('w', 'width', 'width', 0.1), t('s', 'edgeSpacing', 'edge spacing', 0.1), t('h', 'height', 'height', 0.05), t('er', 'er', 'er', 0.05)] },
  { calc: 'diffmicrostrip', tag: 'B', compute: diffMicrostrip, inputs: { width: um(200), edgeSpacing: um(200), height: um(200), er: dl(4.5) }, outs: DIFFMS,
    tols: [t('w', 'width', 'width', 0.1, 0), t('s', 'edgeSpacing', 'edge spacing', 0.2)] },
  { calc: 'diffstripline', tag: 'A', compute: diffStripline, inputs: { width: um(300), edgeSpacing: um(200), planeSpacing: um(1000), er: dl(4) }, outs: DIFFSL,
    tols: [t('w', 'width', 'width', 0.1), t('s', 'edgeSpacing', 'edge spacing', 0.1), t('b', 'planeSpacing', 'plane spacing', 0.05), t('er', 'er', 'er', 0.05)] },
  { calc: 'cpw', tag: 'A', compute: cpw, inputs: { width: um(300), gap: um(200), height: um(1600), er: dl(4.5) }, outs: SINGLE,
    tols: [t('w', 'width', 'width', 0.1), t('s', 'gap', 'gap', 0.1), t('h', 'height', 'height', 0.05), t('er', 'er', 'er', 0.05)] },
  { calc: 'cpwg', tag: 'A', compute: cpwg, inputs: { width: um(300), gap: um(200), height: um(200), er: dl(4.2) }, outs: SINGLE,
    tols: [t('w', 'width', 'width', 0.1), t('s', 'gap', 'gap', 0.1), t('h', 'height', 'height', 0.05), t('er', 'er', 'er', 0.05)] },
];

const tolerancesOf = (c: Case): Record<string, unknown> => Object.fromEntries(c.tols.map((x) => [x.ts, tolOf(x.minus, x.plus)]));
const run = (c: Case, extra: Record<string, unknown> = {}): CalcResult => okOf(c.compute, { ...c.inputs, tolerances: tolerancesOf(c), ...extra });
const caseName = (c: Case): string => `${c.calc}_${c.tag}`;
/** delay is stored in ps/mm by the oracle; the result is s/m. */
const scaleFor = (o: string): number => (o.startsWith('delay') ? 1e9 : 1);

describe.each(CASES)('golden vectors (oracle): $calc $tag', (c) => {
  const r = run(c);
  it('envelope min / typ / max of every output through the oracle corners', () => {
    for (const [o, name] of Object.entries(c.outs)) {
      const e = env(r, name);
      const lo = vec(`env_${caseName(c)}_${o}_min`).pinned_expected;
      const ty = vec(`env_${caseName(c)}_${o}_typ`).pinned_expected;
      const hi = vec(`env_${caseName(c)}_${o}_max`).pinned_expected;
      if (e === undefined) {
        // a quantity that does not vary under the tolerances (stripline eps_eff without an er tolerance) has no envelope entry
        expect(err(lo, hi), name).toBeLessThan(TOL);
        continue;
      }
      expect(err(e.min.si * scaleFor(o), lo), `${name} min`).toBeLessThan(TOL);
      expect(err(e.typ.si * scaleFor(o), ty), `${name} typ`).toBeLessThan(TOL);
      expect(err(e.max.si * scaleFor(o), hi), `${name} max`).toBeLessThan(TOL);
      expect([...e.toleranceInputs].sort()).toEqual(c.tols.filter((x) => x.minus > 0 || x.plus > 0).map((x) => x.label).sort());
    }
    expect(env(r, Object.values(c.outs)[0] as string)).toBeDefined();
  });
  it('sensitivities S = d ln(out) / d ln(in) against the oracle', () => {
    for (const [o, name] of Object.entries(c.outs)) {
      for (const x of c.tols) {
        const expected = vec(`sens_${caseName(c)}_${o}_to_${x.key}`).pinned_expected;
        const got = sens(r, name, x.label);
        if (got === undefined) {
          expect(Math.abs(expected), `${name} to ${x.label} omitted only when constant`).toBeLessThan(1e-9);
          continue;
        }
        expect(sensClose(got, expected), `${name} to ${x.label}: ${String(got)} vs ${String(expected)}`).toBe(true);
      }
    }
  });
});

describe('closed-form sensitivities', () => {
  it('coax: S(Z0, D) = 1/ln(D/d), S(Z0, d) = -1/ln(D/d), S(Z0, er) = -1/2, S(eps, er) = 1, S(delay, er) = 1/2', () => {
    const c = CASES.find((x) => x.calc === 'coax') as Case;
    const r = run(c);
    const k = 1 / Math.log(3.5);
    expect(err(sens(r, SINGLE.z0, 'outer diameter') as number, k)).toBeLessThan(1e-7);
    expect(err(sens(r, SINGLE.z0, 'inner diameter') as number, -k)).toBeLessThan(1e-7);
    expect(err(sens(r, SINGLE.z0, 'er') as number, -0.5)).toBeLessThan(1e-8);
    expect(err(sens(r, SINGLE.eeff, 'er') as number, 1)).toBeLessThan(1e-8);
    expect(err(sens(r, SINGLE.delay, 'er') as number, 0.5)).toBeLessThan(1e-8);
    expect(res(r, `sensitivity of ${SINGLE.z0} to er`).value.dim).toEqual(DIM.DIMENSIONLESS);
  });
  it('stripline: S(Z0, er) = -1/2 (homogeneous dielectric), S(eps_eff, er) = 1', () => {
    const r = run(CASES.find((x) => x.calc === 'stripline' && x.tag === 'A') as Case);
    expect(err(sens(r, SINGLE.z0, 'er') as number, -0.5)).toBeLessThan(1e-8);
    expect(err(sens(r, SINGLE.eeff, 'er') as number, 1)).toBeLessThan(1e-8);
    // closed form for a wide strip: Z0 ~ 1/(w/b + 0.441), so S(Z0, w) = -(w/b)/(w/b + 0.441) for w/b >= 0.35
    const wide = okOf(stripline, { width: um(500), spacing: um(1000), er: dl(4), tolerances: { width: frac(0.05) } });
    expect(err(sens(wide, SINGLE.z0, 'width') as number, -0.5 / (0.5 + 0.441))).toBeLessThan(1e-7);
  });
  it('signs: microstrip Z0 falls with width and er and rises with height; coupled Zdiff rises with spacing and falls with width', () => {
    fc.assert(
      fc.property(fc.double({ min: 100, max: 1500, noNaN: true }), fc.double({ min: 100, max: 1000, noNaN: true }), fc.double({ min: 2, max: 10, noNaN: true }), (w, h, e) => {
        fc.pre(w / h > 0.1 && w / h < 10);
        const r = okOf(microstrip, { width: um(w), height: um(h), er: dl(e), tolerances: { width: frac(0.05), height: frac(0.05), er: frac(0.05) } });
        expect(sens(r, SINGLE.z0, 'width') as number).toBeLessThan(0);
        expect(sens(r, SINGLE.z0, 'height') as number).toBeGreaterThan(0);
        expect(sens(r, SINGLE.z0, 'er') as number).toBeLessThan(0);
        expect(sens(r, SINGLE.eeff, 'width') as number).toBeGreaterThan(0);
        // delay = sqrt(eps_eff)/c, so S(delay) = S(eps_eff)/2 exactly
        expect(Math.abs((sens(r, SINGLE.delay, 'width') as number) - 0.5 * (sens(r, SINGLE.eeff, 'width') as number))).toBeLessThan(1e-8);
      }),
      { numRuns: 30 },
    );
    const d = run(CASES.find((x) => x.calc === 'diffmicrostrip' && x.tag === 'A') as Case);
    expect(sens(d, DIFFMS.zdiff, 'edge spacing') as number).toBeGreaterThan(0);
    expect(sens(d, DIFFMS.zdiff, 'width') as number).toBeLessThan(0);
    const g = run(CASES.find((x) => x.calc === 'cpwg') as Case);
    expect(sens(g, SINGLE.z0, 'width') as number).toBeLessThan(0);
    expect(sens(g, SINGLE.z0, 'gap') as number).toBeGreaterThan(0);
  });
});

describe('hand check of an envelope from the model: coax Z0 = (eta0/2 pi) ln(D/d) / sqrt(er)', () => {
  it('D 3.5 mm +/-2 %, d 1 mm +/-2 %, er 2.1 +/-3 %: the extremes are the (D+, d-, er-) and (D-, d+, er+) corners', () => {
    const r = run(CASES.find((x) => x.calc === 'coax') as Case);
    const zp = 59.9584916;
    const hi = (zp * Math.log((3.5 * 1.02) / (1 * 0.98))) / Math.sqrt(2.1 * 0.97);
    const lo = (zp * Math.log((3.5 * 0.98) / (1 * 1.02))) / Math.sqrt(2.1 * 1.03);
    const z = env(r, SINGLE.z0);
    expect(z?.max.si).toBeCloseTo(hi, 6);
    expect(z?.min.si).toBeCloseTo(lo, 6);
    expect(z?.typ.si).toBeCloseTo((zp * Math.log(3.5)) / Math.sqrt(2.1), 6);
  });
});

describe('invariants (Phase 1 rules)', () => {
  it.each(CASES)('$calc $tag: absent or empty tolerances give no envelope and no sensitivity, identical to the plain result', (c) => {
    const plain = okOf(c.compute, c.inputs);
    expect(plain.envelope).toBeUndefined();
    expect(plain.results.some((x) => x.name.startsWith('sensitivity of'))).toBe(false);
    expect(okOf(c.compute, { ...c.inputs, tolerances: {} })).toEqual(plain);
  });
  it.each(CASES)('$calc $tag: tolerances change neither the nominal numbers nor the confidence; user tolerances are visible reasons', (c) => {
    const plain = okOf(c.compute, c.inputs);
    const r = run(c);
    for (const x of plain.results) expect(si(r, x.name)).toBe(x.value.si);
    expect(r.confidence.level).toBe(plain.confidence.level);
    expect(r.confidence.score).toBe(plain.confidence.score);
    expect(r.confidence.reasons.join(' ')).toMatch(/user-supplied/);
    expect(r.dataStatus).toBe(plain.dataStatus);
    expect(r.reference.ledgerIds).toEqual(plain.reference.ledgerIds);
    expect(r.confidence.level).not.toBe('high');
    expectNoClaimWording(r);
  });
  it.each(CASES)('$calc $tag: every user tolerance is echoed as an input and as an assumption, none is defaulted', (c) => {
    const r = run(c);
    for (const x of c.tols) {
      const names = r.inputs.filter((i) => i.name.startsWith(`${x.label} tolerance`)).map((i) => i.source);
      expect(names.length, x.label).toBeGreaterThan(0);
      expect(names.every((s) => s === 'user')).toBe(true);
    }
    expect(r.assumptions.join(' ')).toMatch(/never defaulted/);
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_SCOPE')).toBe(true);
  });
  it.each(CASES)('$calc $tag: zero tolerance gives a point envelope equal to the base', (c) => {
    const zero = Object.fromEntries(c.tols.map((x) => [x.ts, frac(0)]));
    const r = okOf(c.compute, { ...c.inputs, tolerances: zero });
    const first = Object.values(c.outs)[0] as string;
    const e = env(r, first);
    expect(e?.min.si).toBe(e?.typ.si);
    expect(e?.max.si).toBe(e?.typ.si);
    expect(e?.typ.si).toBe(si(r, first));
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_ZERO_TOLERANCE')).toBe(true);
  });
  it('min <= typ <= max for every enveloped output, and the corner count is 2^k for k <= 4', () => {
    for (const c of CASES) {
      const r = run(c);
      for (const e of r.envelope ?? []) {
        expect(e.min.si).toBeLessThanOrEqual(e.typ.si * (1 + 1e-12));
        expect(e.typ.si).toBeLessThanOrEqual(e.max.si * (1 + 1e-12));
        expect(e.toleranceInputs.length).toBeLessThanOrEqual(4);
      }
    }
    const all4 = run(CASES.find((x) => x.calc === 'diffmicrostrip' && x.tag === 'A') as Case);
    expect(all4.assumptions.join(' ')).toMatch(/16 corner\(s\)/);
  });
  it('property: a random zero-tolerance envelope equals the base for microstrip, coax and cpwg', () => {
    fc.assert(
      fc.property(fc.double({ min: 100, max: 1500, noNaN: true }), fc.double({ min: 100, max: 1000, noNaN: true }), fc.double({ min: 2, max: 10, noNaN: true }), (w, h, e) => {
        fc.pre(w / h > 0.1 && w / h < 10);
        const r = okOf(microstrip, { width: um(w), height: um(h), er: dl(e), tolerances: { width: frac(0), er: frac(0) } });
        const z = env(r, SINGLE.z0);
        expect(z?.min.si).toBe(z?.typ.si);
        expect(z?.max.si).toBe(z?.typ.si);
      }),
      { numRuns: 25 },
    );
  });
  it('property: the envelope contains the nominal and widens with the tolerance', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 0.1, noNaN: true }), (tol) => {
        const mk = (k: number): CalcResult => okOf(microstrip, { width: um(300), height: um(150), er: dl(4.2), tolerances: { width: frac(tol * k), er: frac(tol * k) } });
        const a = env(mk(1), SINGLE.z0);
        const b = env(mk(2), SINGLE.z0);
        expect(b?.max.si).toBeGreaterThanOrEqual((a?.max.si as number) * (1 - 1e-12));
        expect(b?.min.si).toBeLessThanOrEqual((a?.min.si as number) * (1 + 1e-12));
      }),
      { numRuns: 25 },
    );
  });
});

describe('rejections: errors are values', () => {
  const MS = { width: um(300), height: um(150), er: dl(4.2) };
  it('a tolerance on a quantity the user did not supply is rejected (the unknown of a solve mode)', () => {
    const m = expectError(microstrip, { targetZ0: q(50, DIM.RESISTANCE), height: um(200), er: dl(4.2), tolerances: { width: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.width');
    expect(m).toMatch(/unknown of the solve/);
    expectError(striplineCompute as unknown as Compute, { targetZ0: q(50, DIM.RESISTANCE), spacing: um(500), er: dl(4.2), tolerances: { width: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.width');
    expectError(coax, { targetZ0: q(50, DIM.RESISTANCE), innerDiameter: mm(1), er: dl(2.1), tolerances: { outerDiameter: frac(0.01) } }, 'INVALID_INPUT', 'tolerances.outerDiameter');
    expectError(diffMicrostrip, { targetZdiff: q(100, DIM.RESISTANCE), width: um(150), height: um(100), er: dl(4.2), tolerances: { edgeSpacing: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.edgeSpacing');
    expectError(diffStripline, { targetZdiff: q(100, DIM.RESISTANCE), edgeSpacing: um(200), planeSpacing: um(1000), er: dl(4), tolerances: { width: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.width');
    expectError(cpw, { targetZ0: q(50, DIM.RESISTANCE), width: um(300), height: um(1600), er: dl(4.5), tolerances: { gap: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.gap');
    expectError(cpwg, { targetZ0: q(50, DIM.RESISTANCE), gap: um(300), height: um(200), er: dl(4.2), tolerances: { width: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.width');
  });
  it('a thickness tolerance needs a thickness, and a thickness the model does not use cannot be toleranced', () => {
    expect(expectError(microstrip, { ...MS, tolerances: { thickness: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.thickness')).toMatch(/needs a thickness/);
    expect(expectError(microstrip, { ...MS, thickness: um(35), tolerances: { thickness: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.thickness')).toMatch(/does not use it/);
    expectError(diffMicrostrip, { width: um(150), edgeSpacing: um(100), height: um(200), er: dl(4.5), thickness: um(35), tolerances: { thickness: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.thickness');
    expectError(cpw, { width: um(300), gap: um(200), height: um(1600), er: dl(4.5), thickness: um(35), tolerances: { thickness: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.thickness');
    // the opt-in variants do use it
    const ok = okOf(microstrip, { ...MS, thickness: um(35), thicknessModel: 'hj-procedure-B', tolerances: { thickness: frac(0.1) } });
    expect(env(ok, SINGLE.z0)).toBeDefined();
  });
  it('keys the calculator does not know are rejected, not ignored', () => {
    expectError(microstrip, { ...MS, tolerances: { frequency: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.frequency');
    expectError(striplineCompute as unknown as Compute, { width: um(200), spacing: um(1000), er: dl(4), tolerances: { height: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.height');
    expectError(coax, { outerDiameter: mm(3.5), innerDiameter: mm(1), er: dl(2.1), tolerances: { width: frac(0.1) } }, 'INVALID_INPUT', 'tolerances.width');
    expectError(microstrip, { ...MS, tolerances: 'ten percent' }, 'INVALID_INPUT', 'tolerances');
    expectError(microstrip, { ...MS, tolerances: [frac(0.1)] }, 'INVALID_INPUT', 'tolerances');
  });
  it('malformed tolerances: negative, not finite, wrong dimension, 100 % or more down, silly plus', () => {
    for (const v of [rawQ(-0.1, DIM.DIMENSIONLESS), rawQ(Number.NaN, DIM.DIMENSIONLESS), rawQ(Infinity, DIM.DIMENSIONLESS)]) {
      expectError(microstrip, { ...MS, tolerances: { width: v } }, 'INVALID_INPUT', 'tolerances.width');
    }
    expectError(microstrip, { ...MS, tolerances: { width: um(5) } }, 'DIMENSION', 'tolerances.width');
    expectError(microstrip, { ...MS, tolerances: { width: frac(1) } }, 'OUT_OF_DOMAIN', 'tolerances.width');
    expectError(microstrip, { ...MS, tolerances: { width: asym(0.1, 6) } }, 'OUT_OF_DOMAIN', 'tolerances.width');
    // one side of an asymmetric pair alone is not a tolerance
    expectError(microstrip, { ...MS, tolerances: { width: { minus: frac(0.1) } } }, 'INVALID_INPUT', 'tolerances.width');
  });
  it('invalid base inputs with tolerances are the same error as without, and never a number', () => {
    expectError(microstrip, { width: um(300), er: dl(4.2), tolerances: { width: frac(0.1) } }, 'INVALID_INPUT', 'height');
    expectError(microstrip, { ...MS, er: dl(0.5), tolerances: { width: frac(0.1) } }, 'OUT_OF_DOMAIN', 'er');
  });
});

describe('non-monotone outputs are labelled corners-only; a failed corner is omitted, not clamped', () => {
  it('a corner the model rejects: its bound is omitted and the incomplete corner is reported', () => {
    const r = okOf(microstrip, { width: um(300), height: um(150), er: dl(1.5), tolerances: { er: asym(0.5, 0.1), width: frac(0.05) } });
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_INCOMPLETE' && /envelope incomplete at corner/.test(w.message))).toBe(true);
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_BOUND_OMITTED')).toBe(true);
    // Z0 falls with er, so its maximum sits at the rejected er- corner: no Z0 envelope is invented or clamped to the nominal
    expect(env(r, SINGLE.z0)).toBeUndefined();
    // eps_eff rises with er, so its minimum is the omitted one
    expect(env(r, SINGLE.eeff)).toBeUndefined();
    // the nominal result is untouched
    expect(has(r, SINGLE.z0)).toBe(true);
    expect(si(r, SINGLE.z0)).toBe(si(okOf(microstrip, { width: um(300), height: um(150), er: dl(1.5) }), SINGLE.z0));
  });
  it('coupled Zdiff is not monotone in the spacing at weak coupling: corners-only is stated', () => {
    const r = okOf(diffMicrostrip, { width: um(20), edgeSpacing: um(600), height: um(200), er: dl(9.8), tolerances: { edgeSpacing: asym(0.5, 5) } });
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_CORNERS_ONLY' && /not monotone in edgeSpacing/.test(w.message))).toBe(true);
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_EXTRAPOLATION' || w.code === 'ENVELOPE_INCOMPLETE')).toBe(true);
  });
});

describe('solve modes: the envelope is evaluated at the solved geometry', () => {
  it('microstrip: 50 ohm on 200 um, er 4.2 with height and er tolerances', () => {
    const r = okOf(microstrip, { targetZ0: q(50, DIM.RESISTANCE), height: um(200), er: dl(4.2), tolerances: { height: frac(0.05), er: frac(0.05) } });
    const z = env(r, SINGLE.z0);
    expect(err(z?.typ.si as number, 50)).toBeLessThan(1e-9);
    expect((z?.min.si as number) < 50 && (z?.max.si as number) > 50).toBe(true);
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_AT_SOLVED_GEOMETRY')).toBe(true);
    // the same envelope as an analysis at the solved width
    const w = res(r, 'trace width for target Z0').value;
    const a = okOf(microstrip, { width: w, height: um(200), er: dl(4.2), tolerances: { height: frac(0.05), er: frac(0.05) } });
    expect(err(z?.min.si as number, env(a, SINGLE.z0)?.min.si as number)).toBeLessThan(1e-12);
    expect(err(z?.max.si as number, env(a, SINGLE.z0)?.max.si as number)).toBeLessThan(1e-12);
    expect(si(r, 'trace width for target Z0')).toBe(si(okOf(microstrip, { targetZ0: q(50, DIM.RESISTANCE), height: um(200), er: dl(4.2) }), 'trace width for target Z0'));
  });
  it('coax (solved outer diameter), diff microstrip (solved spacing) and cpw (solved gap)', () => {
    const c = okOf(coax, { targetZ0: q(50, DIM.RESISTANCE), innerDiameter: mm(1), er: dl(2.1), tolerances: { innerDiameter: frac(0.02), er: frac(0.03) } });
    expect(env(c, SINGLE.z0)).toBeDefined();
    const d = okOf(diffMicrostrip, { targetZdiff: q(100, DIM.RESISTANCE), width: um(150), height: um(100), er: dl(4.2), tolerances: { width: frac(0.1), height: frac(0.05) } });
    expect(err(env(d, DIFFMS.zdiff)?.typ.si as number, 100)).toBeLessThan(1e-9);
    const p = okOf(cpw, { targetZ0: q(50, DIM.RESISTANCE), width: um(300), height: um(1600), er: dl(4.5), tolerances: { width: frac(0.1), er: frac(0.05) } });
    expect(err(env(p, SINGLE.z0)?.typ.si as number, 50)).toBeLessThan(1e-9);
  });
});

// ---- fab-profile tolerance ------------------------------------------------------------------------------------------------

const profileJson = (scoped: unknown[], over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schemaVersion: 1,
  id: 'test-fab',
  fabricator: 'Test Fab',
  profileDate: '2026-10-13',
  source: 'https://example.invalid/capabilities',
  status: 'UNVERIFIED',
  ledgerIds: ['S-019l'],
  verifiedBy: '',
  bannerRequired: true,
  limits: {},
  scopedLimits: scoped,
  ...over,
});
const tolEntry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  key: 'traceWidth',
  kind: 'tol-sym',
  published: true,
  value: { value: 20, unit: 'um' },
  holeType: 'any',
  sizeBasis: 'not-applicable',
  layerCount: '2',
  copperOz: 1,
  layerSide: 'outer',
  ledgerId: 'S-019l',
  quote: 'test wording, not fabricator data',
  retrievedOn: '2026-10-13',
  ...over,
});
function profile(scoped: unknown[], over: Record<string, unknown> = {}): ParsedFabProfile {
  const r = parseFabProfile(profileJson(scoped, over));
  if (!r.ok) throw new Error(r.error.join(' | '));
  return r.value;
}
const scope = { layerCount: '2', layerSide: 'outer', copperWeight: fromUnit(1, 'oz/ft2') };
const MSA = { width: um(300), height: um(150), er: dl(4.2) };

describe('fab-profile tolerance (exact scope, never a default)', () => {
  const p = profile([tolEntry(), tolEntry({ key: 'traceSpace', value: { value: 25, unit: 'um' } })]);
  it('a published width tolerance for the exact scope is used with its ledger id, status and age', () => {
    const r = okOf(microstrip, { ...MSA, tolerances: { width: 'profile', er: frac(0.05) }, fabProfile: p, today: '2026-10-18', profileScope: scope });
    const rel = 20e-6 / 300e-6;
    const same = okOf(microstrip, { ...MSA, tolerances: { width: frac(rel), er: frac(0.05) } });
    expect(err(env(r, SINGLE.z0)?.min.si as number, env(same, SINGLE.z0)?.min.si as number)).toBeLessThan(1e-12);
    expect(err(env(r, SINGLE.z0)?.max.si as number, env(same, SINGLE.z0)?.max.si as number)).toBeLessThan(1e-12);
    const echo = r.inputs.filter((i) => i.name.startsWith('width tolerance'));
    expect(echo.length).toBeGreaterThan(0);
    expect(echo.every((i) => i.source === 'fab-profile')).toBe(true);
    expect(echo[0]?.sourceDetail).toMatch(/S-019l/);
    expect(echo[0]?.sourceDetail).toMatch(/UNVERIFIED/);
    expect(r.reference.ledgerIds).toContain('S-019l');
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.fabProfile?.id).toBe('test-fab');
    expect(r.fabProfile?.ageDays).toBe(5);
    expect(r.fabProfile?.stale).toBe(false);
    expect(r.warnings.some((w) => w.code === 'FAB_PROFILE_UNVERIFIED')).toBe(true);
    // the er tolerance beside it is still a user value
    expect(r.inputs.filter((i) => i.name.startsWith('er tolerance')).every((i) => i.source === 'user')).toBe(true);
  });
  it('a published spacing tolerance is used for the edge spacing of a pair', () => {
    const r = okOf(diffMicrostrip, { width: um(150), edgeSpacing: um(100), height: um(200), er: dl(4.5), tolerances: { edgeSpacing: 'profile' }, fabProfile: p, today: '2026-10-18', profileScope: scope });
    const same = okOf(diffMicrostrip, { width: um(150), edgeSpacing: um(100), height: um(200), er: dl(4.5), tolerances: { edgeSpacing: frac(0.25) } });
    expect(err(env(r, DIFFMS.zdiff)?.max.si as number, env(same, DIFFMS.zdiff)?.max.si as number)).toBeLessThan(1e-12);
    expect(r.reference.ledgerIds).toContain('S-019l');
  });
  it('another layer count, copper weight or layer side is not substituted: tolerance not published, nothing assumed', () => {
    for (const other of [{ ...scope, layerCount: 'multilayer' }, { ...scope, copperWeight: fromUnit(2, 'oz/ft2') }, { ...scope, layerSide: 'inner' }]) {
      const r = okOf(microstrip, { ...MSA, tolerances: { width: 'profile', er: frac(0.05) }, fabProfile: p, today: '2026-10-18', profileScope: other });
      const w = r.warnings.find((x) => x.code === 'TOLERANCE_NOT_PUBLISHED');
      expect(w?.message).toMatch(/Tolerance not published/);
      expect(w?.message).toMatch(/none is assumed/);
      // only the user's er tolerance is in the envelope
      expect(env(r, SINGLE.z0)?.toleranceInputs).toEqual(['er']);
      expect(r.fabProfile).toBeUndefined();
    }
  });
  it('with only the profile tolerance and nothing published there is no envelope at all', () => {
    const empty = profile([]);
    const r = okOf(microstrip, { ...MSA, tolerances: { width: 'profile' }, fabProfile: empty, today: '2026-10-18', profileScope: scope });
    expect(r.envelope).toBeUndefined();
    expect(r.results.some((x) => x.name.startsWith('sensitivity of'))).toBe(false);
    expect(r.warnings.some((w) => w.code === 'TOLERANCE_NOT_PUBLISHED')).toBe(true);
  });
  it('an entry that says not published is reported as such', () => {
    const np = profile([tolEntry({ published: false, value: undefined })]);
    const r = okOf(microstrip, { ...MSA, tolerances: { width: 'profile', er: frac(0.05) }, fabProfile: np, today: '2026-10-18', profileScope: scope });
    expect(r.warnings.find((x) => x.code === 'TOLERANCE_NOT_PUBLISHED')?.message).toMatch(/does not publish/);
  });
  it('a stale profile is flagged', () => {
    const old = profile([tolEntry({ retrievedOn: '2024-01-01' })], { profileDate: '2024-01-02' });
    const r = okOf(microstrip, { ...MSA, tolerances: { width: 'profile' }, fabProfile: old, today: '2026-10-18', profileScope: scope });
    expect(r.fabProfile?.stale).toBe(true);
    expect(r.warnings.some((w) => w.code === 'FAB_PROFILE_STALE')).toBe(true);
  });
  it('a tolerance that is not a usable fraction of the width is refused with a warning, not applied', () => {
    const huge = profile([tolEntry({ value: { value: 4, unit: 'mm' } })]);
    const r = okOf(microstrip, { ...MSA, tolerances: { width: 'profile', er: frac(0.05) }, fabProfile: huge, today: '2026-10-18', profileScope: scope });
    expect(r.warnings.some((w) => w.code === 'TOLERANCE_NOT_USABLE')).toBe(true);
    expect(env(r, SINGLE.z0)?.toleranceInputs).toEqual(['er']);
  });
  it('needs the profile, the date and the scope; only a width or a spacing can take it', () => {
    expectError(microstrip, { ...MSA, tolerances: { width: 'profile' }, today: '2026-10-18', profileScope: scope }, 'INVALID_INPUT', 'fabProfile');
    expectError(microstrip, { ...MSA, tolerances: { width: 'profile' }, fabProfile: p, profileScope: scope }, 'INVALID_INPUT', 'today');
    expectError(microstrip, { ...MSA, tolerances: { width: 'profile' }, fabProfile: p, today: 'yesterday', profileScope: scope }, 'INVALID_INPUT', 'today');
    expectError(microstrip, { ...MSA, tolerances: { width: 'profile' }, fabProfile: p, today: '2026-10-18' }, 'INVALID_INPUT', 'profileScope');
    expectError(microstrip, { ...MSA, tolerances: { width: 'profile' }, fabProfile: p, today: '2026-10-18', profileScope: { ...scope, layerCount: '3' } }, 'INVALID_INPUT', 'profileScope.layerCount');
    expectError(microstrip, { ...MSA, tolerances: { width: 'profile' }, fabProfile: p, today: '2026-10-18', profileScope: { ...scope, layerSide: 'middle' } }, 'INVALID_INPUT', 'profileScope.layerSide');
    expectError(microstrip, { ...MSA, tolerances: { width: 'profile' }, fabProfile: p, today: '2026-10-18', profileScope: { ...scope, copperWeight: um(35) } }, 'INVALID_INPUT', 'profileScope.copperWeight');
    expectError(microstrip, { ...MSA, tolerances: { height: 'profile' }, fabProfile: p, today: '2026-10-18', profileScope: scope }, 'INVALID_INPUT', 'tolerances.height');
    expectError(microstrip, { ...MSA, tolerances: { er: 'profile' }, fabProfile: p, today: '2026-10-18', profileScope: scope }, 'INVALID_INPUT', 'tolerances.er');
    expectError(microstrip, { targetZ0: q(50, DIM.RESISTANCE), height: um(200), er: dl(4.2), tolerances: { width: 'profile' }, fabProfile: p, today: '2026-10-18', profileScope: scope }, 'INVALID_INPUT', 'tolerances.width');
  });
  it('there is no default: without tolerances a profile changes nothing', () => {
    const plain = okOf(microstrip, MSA);
    const withProfile = okOf(microstrip, { ...MSA, fabProfile: p, today: '2026-10-18', profileScope: scope });
    expect(withProfile).toEqual(plain);
    expect(withProfile.envelope).toBeUndefined();
  });
});

describe('the er tolerance is the user\'s own and is never applied silently', () => {
  it('no tolerance is applied to er unless it is entered (the laminate spread is user data)', () => {
    const r = okOf(microstrip, { ...MSA, tolerances: { width: frac(0.1) } });
    expect(env(r, SINGLE.z0)?.toleranceInputs).toEqual(['width']);
    expect(r.results.some((x) => x.name === `sensitivity of ${SINGLE.z0} to er`)).toBe(false);
    expect(r.assumptions.join(' ')).not.toMatch(/3\.8|5\.3/);
  });
});

describe('determinism and speed', () => {
  it('300 envelope computes of the heaviest model (coupled microstrip, four tolerances) inside a 5 s budget', () => {
    const c = CASES.find((x) => x.calc === 'diffmicrostrip' && x.tag === 'A') as Case;
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) {
      const out = c.compute({ ...c.inputs, tolerances: tolerancesOf(c), frequency: hz(1e8 * (1 + (i % 50))) });
      if (!out.ok) throw new Error(out.error.message);
    }
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(c.compute({ ...c.inputs, tolerances: tolerancesOf(c) })).toEqual(c.compute({ ...c.inputs, tolerances: tolerancesOf(c) }));
  });
  it('a result with an envelope never carries a compliance claim and keeps the mandatory banner', () => {
    for (const c of CASES) {
      const r = run(c);
      expectNoClaimWording(r);
      expect(r.recommendation).toMatch(/must be verified against the PCB manufacturer/);
      expect(warningText(r)).toMatch(/tolerance-corner range/);
    }
  });
});
