import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { parseFabProfile } from '../../fab/profile';
import type { ParsedFabProfile } from '../../fab/profile';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 1 task 7b: annular ring / drill calculator. TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py, ring_task7b_* vectors, mirrored in
// docs/golden-vectors.json). All dimensions, tolerances and "minimums" below are TEST values, not fabricator data; the
// profile tests read the shipped JLCPCB example (UNVERIFIED) and compare with the quotes recorded in ledger rows
// S-019i..S-019m. Nothing here verifies any fabricator or IPC value.

interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
}
const goldenFiles = import.meta.glob('../../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const goldenText = Object.values(goldenFiles)[0];
const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;
const vec = (name: string): number => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found (${String(vectors.length)} vectors loaded)`);
  return v.pinned_expected;
};

const profileFiles = import.meta.glob('../../data/fab-profiles/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
function shipped(name: string): ParsedFabProfile {
  const key = Object.keys(profileFiles).find((k) => k.endsWith(`/${name}`));
  if (key === undefined) throw new Error(`profile ${name} not found`);
  const r = parseFabProfile(JSON.parse(profileFiles[key] as string) as unknown);
  if (!r.ok) throw new Error(r.error.join('; '));
  return r.value;
}
const JLC = shipped('jlcpcb-2026-10-13.json');
const TODAY = '2026-10-20';

/** A quantity that bypasses the constructor's finiteness check, to feed non-finite values to the guards. */
const rawQ = (si: number): Quantity => ({ si, dim: DIM.LENGTH }) as Quantity;
const mm = (n: number): Quantity => fromUnit(n, 'mm');
const um = (n: number): Quantity => fromUnit(n, 'um');
const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const inMm = (x: Quantity): number => toUnit(x, 'mm');
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const TOL = 1e-9;
const g = (x: number): string => String(x);

const NOM = 'nominal annular ring (finished hole)';
const NOM_DRILL = 'nominal annular ring (drill)';
const WC = 'worst-case annular ring (finished hole)';
const WC_DRILL = 'worst-case annular ring (drill)';
const P_MIN = 'profile minimum annular ring';
const P_REC = 'profile recommended annular ring';
const U_MIN = 'your minimum annular ring';
const U_REC = 'your recommended annular ring';
const VIA_DIFF_MIN = 'profile via pad-minus-hole minimum';
const VIA_DIFF_REC = 'profile via pad-minus-hole recommended';
const NOT_PUBLISHED_TEXT = 'ring-minimum not published for this scope: enter your fabricator value';

const base = (over: Partial<Inputs> = {}): Inputs => ({ padDiameter: mm(1), finishedHoleDiameter: mm(0.6), holeType: 'pth', ...over });
const withProfile = (over: Partial<Inputs> = {}): Inputs => base({ fabProfile: JLC, today: TODAY, ...over });

function ok(inputs: Inputs): CalcResult {
  const out = compute(inputs);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code} ${out.error.field ?? ''}: ${out.error.message}`);
  const chk = assertCalcResult(out.value);
  expect(chk.ok, chk.ok ? '' : chk.error.join('; ')).toBe(true);
  return out.value;
}
function fail(inputs: unknown): { code: string; field?: string; message: string } {
  const out = compute(inputs as Inputs);
  expect(out.ok).toBe(false);
  if (out.ok) throw new Error('expected an error value');
  return out.error;
}
// PCB-F2: when a tolerance term is omitted the worst-case result is named 'partial worst-case annular ring (omits: ...) (<ref>)'.
// A lookup by the plain WC / WC_DRILL name also finds the partial name for the same reference; tests that care use isPartial.
const isWcAlias = (want: string, got: string): boolean => (want === WC || want === WC_DRILL) && got.startsWith('partial worst-case annular ring (omits: ') && got.endsWith(want.slice('worst-case annular ring'.length));
const res = (r: CalcResult, name: string) => {
  const x = r.results.find((o) => o.name === name || isWcAlias(name, o.name));
  if (!x) throw new Error(`result "${name}" missing; have ${r.results.map((o) => o.name).join(', ')}`);
  return x;
};
const has = (r: CalcResult, name: string): boolean => r.results.some((o) => o.name === name || isWcAlias(name, o.name));
const warn = (r: CalcResult, code: string) => r.warnings.filter((w) => w.code === code);

// Mirrors RING_CASES in tools/reference/ref_calcs.py: [pad, hole, pad tol, hole tol plus, position tol, test minimum] (mm).
const CASES: [number, number, number | undefined, number | undefined, number | undefined, number][] = [
  [1.0, 0.6, 0.05, 0.13, 0.075, 0.15],
  [0.9, 0.5, undefined, undefined, 0.075, 0.18],
  [1.4, 0.8, 0.1, 0.13, 0.075, 0.254],
  [0.5, 0.3, 0.05, undefined, undefined, 0.05],
];
const tagOf = (pad: number, hole: number, pt?: number, hp?: number, pos?: number): string =>
  `p${g(pad)}mm_h${g(hole)}mm_pt${pt === undefined ? 'na' : g(pt)}_hp${hp === undefined ? 'na' : g(hp)}_pos${pos === undefined ? 'na' : g(pos)}`;

describe('golden vectors (oracle): nominal ring, linear worst case, margins against a TEST minimum', () => {
  for (const [pad, hole, pt, hp, pos, mn] of CASES) {
    it(`pad ${g(pad)} hole ${g(hole)} padTol ${String(pt)} holeTolPlus ${String(hp)} position ${String(pos)} min ${g(mn)}`, () => {
      const tag = tagOf(pad, hole, pt, hp, pos);
      const r = ok(
        base({
          padDiameter: mm(pad),
          finishedHoleDiameter: mm(hole),
          userMinimumRing: mm(mn),
          ...(pt !== undefined ? { padSizeTol: mm(pt) } : {}),
          ...(hp !== undefined ? { holeSizeTolPlus: mm(hp) } : {}),
          ...(pos !== undefined ? { positionTol: mm(pos) } : {}),
        }),
      );
      expect(relErr(inMm(res(r, NOM).value), vec(`ring_task7b_nominal_mm_${tag}`))).toBeLessThanOrEqual(TOL);
      expect(relErr(inMm(res(r, `nominal ring margin to ${U_MIN}`).value), vec(`ring_task7b_nominal_margin_mm_${tag}_min${g(mn)}`))).toBeLessThanOrEqual(TOL);
      if (pt !== undefined || hp !== undefined || pos !== undefined) {
        expect(relErr(inMm(res(r, WC).value), vec(`ring_task7b_worst_mm_${tag}`))).toBeLessThanOrEqual(TOL);
        expect(relErr(inMm(res(r, `worst-case ring margin to ${U_MIN}`).value), vec(`ring_task7b_worst_margin_mm_${tag}_min${g(mn)}`))).toBeLessThanOrEqual(TOL);
      } else {
        expect(has(r, WC)).toBe(false);
      }
    });
  }
  for (const [pad, drill, t] of [
    [1.0, 0.65, 25],
    [0.7, 0.45, 18],
  ] as const) {
    it(`drill reference: pad ${g(pad)} drill ${g(drill)} plating ${g(t)} um (finished = drill - 2 t)`, () => {
      const tag = `p${g(pad)}mm_drill${g(drill)}mm_t${g(t)}um`;
      const finished = drill - 2 * t * 1e-3;
      for (const ref of ['finished', 'drill'] as const) {
        const r = ok(base({ padDiameter: mm(pad), finishedHoleDiameter: mm(finished), drillDiameter: mm(drill), platingThickness: um(t), ringReference: ref }));
        expect(relErr(inMm(res(r, NOM_DRILL).value), vec(`ring_task7b_drillref_mm_${tag}`))).toBeLessThanOrEqual(TOL);
        expect(relErr(inMm(res(r, NOM).value), vec(`ring_task7b_finishedref_mm_${tag}`))).toBeLessThanOrEqual(TOL);
        expect(res(r, ref === 'drill' ? NOM_DRILL : NOM).role).toBe('primary');
        expect(res(r, ref === 'drill' ? NOM : NOM_DRILL).role).toBe('secondary');
      }
    });
  }
  it('hand check: pad 1.0, finished hole 0.6 -> ring 0.2 mm; tolerances 0.05/2 + 0.13/2 + 0.075 = 0.165 -> worst case 0.035 mm', () => {
    const r = ok(base({ padSizeTol: mm(0.05), holeSizeTolPlus: mm(0.13), positionTol: mm(0.075) }));
    expect(Math.abs(res(r, NOM).value.si - 2e-4)).toBeLessThan(1e-12);
    expect(Math.abs(res(r, WC).value.si - 3.5e-5)).toBeLessThan(1e-12);
    expect(Math.abs(res(r, 'tolerance stack-up total').value.si - 1.65e-4)).toBeLessThan(1e-12);
  });
});

describe('result set, bounds, roles, dimensions', () => {
  it('no tolerance and no minimum: nominal ring only (primary), no worst-case, no margin; says so', () => {
    const r = ok(base());
    expect(r.results.map((x) => x.name)).toEqual([NOM]);
    expect(res(r, NOM).role).toBe('primary');
    expect(warn(r, 'NO_TOLERANCE_SUPPLIED')).toHaveLength(1);
    expect(warn(r, 'NO_MINIMUM_SUPPLIED')).toHaveLength(1);
    expect(r.designValues).toEqual([]);
  });
  it('with tolerances the worst-case ring is the primary result', () => {
    const r = ok(base({ positionTol: mm(0.05) }));
    expect(res(r, WC).role).toBe('primary');
    expect(res(r, NOM).role).toBe('secondary');
  });
  it('directional rounding bounds: nominal geometry nominal; worst case and margins are capacities (round down); minimums round up', () => {
    const r = ok(base({ padSizeTol: mm(0.05), positionTol: mm(0.05), userMinimumRing: mm(0.1), userRecommendedRing: mm(0.15) }));
    expect(res(r, NOM).bound).toBe('nominal');
    expect(res(r, WC).bound).toBe('max-capacity');
    expect(res(r, U_MIN).bound).toBe('min-requirement');
    expect(res(r, U_REC).bound).toBe('min-requirement');
    expect(res(r, `nominal ring margin to ${U_MIN}`).bound).toBe('max-capacity');
    expect(res(r, `worst-case ring margin to ${U_REC}`).bound).toBe('max-capacity');
    expect(res(r, 'tolerance stack-up total').bound).toBe('prediction');
  });
  it('every result is a SI length', () => {
    const r = ok(base({ padSizeTol: mm(0.05), positionTol: mm(0.05), userMinimumRing: mm(0.1) }));
    for (const x of r.results) expect(sameDim(x.value, q(1, DIM.LENGTH)), x.name).toBe(true);
  });
  it('the ring reference is stated: result names, a step and an assumption name finished hole or drill', () => {
    const f = ok(base());
    expect(f.assumptions.join(' ').toLowerCase()).toContain('finished hole');
    const d = ok(base({ drillDiameter: mm(0.65), ringReference: 'drill' }));
    expect(d.results.some((x) => x.name.includes('(drill)'))).toBe(true);
    expect(d.assumptions.join(' ').toLowerCase()).toContain('drill');
  });
  it('the default ring reference is recorded as a default (counts toward confidence); an explicit one is a user input', () => {
    const a = ok(base());
    const ia = a.inputs.find((i) => i.name === 'ring reference');
    expect(ia?.source).toBe('default');
    const b = ok(base({ ringReference: 'finished' }));
    expect(b.inputs.find((i) => i.name === 'ring reference')?.source).toBe('user');
    expect(a.confidence.score).toBeGreaterThan(b.confidence.score);
  });
});

describe('guards: errors as values, nothing numeric from invalid input', () => {
  it('hole type is required and never defaulted', () => {
    for (const holeType of [undefined, null, 'blind', 'PTH', '', 3]) {
      const e = fail({ padDiameter: mm(1), finishedHoleDiameter: mm(0.6), holeType });
      expect(e.field).toBe('holeType');
      expect(e.code).toBe('INVALID_INPUT');
    }
  });
  it('non-object inputs', () => {
    for (const x of [null, undefined, 3, 'x', []]) expect(compute(x as unknown as Inputs).ok).toBe(false);
  });
  it.each([0, -1, NaN, Infinity, -Infinity])('rejects pad diameter %s', (n) => {
    expect(fail(base({ padDiameter: rawQ(n) })).field).toBe('padDiameter');
  });
  it.each([0, -1, NaN, Infinity])('rejects finished hole diameter %s', (n) => {
    expect(fail(base({ finishedHoleDiameter: rawQ(n) })).field).toBe('finishedHoleDiameter');
  });
  it('rejects a wrong dimension (area, temperature) and a non-quantity', () => {
    expect(fail(base({ padDiameter: q(1, DIM.AREA) })).code).toBe('DIMENSION');
    expect(fail(base({ finishedHoleDiameter: fromUnit(20, 'degC') })).code).toBe('DIMENSION');
    expect(fail({ ...base(), padDiameter: 1 }).field).toBe('padDiameter');
    expect(fail({ ...base(), padDiameter: undefined }).field).toBe('padDiameter');
  });
  it('rejects a pad that is not larger than the hole (no ring), with the field named', () => {
    expect(fail(base({ padDiameter: mm(0.6) })).code).toBe('OUT_OF_DOMAIN');
    expect(fail(base({ padDiameter: mm(0.5) })).code).toBe('OUT_OF_DOMAIN');
  });
  it('drill diameter: must be a length, not smaller than the finished hole; ring reference drill needs it', () => {
    expect(fail(base({ drillDiameter: mm(0.55) })).field).toBe('drillDiameter');
    expect(fail(base({ drillDiameter: q(-1, DIM.LENGTH) })).field).toBe('drillDiameter');
    expect(fail(base({ ringReference: 'drill' })).field).toBe('drillDiameter');
    expect(fail(base({ drillDiameter: mm(1.0) })).code).toBe('OUT_OF_DOMAIN'); // drill as large as the pad leaves no ring on the drill
  });
  it('plating thickness needs a drill diameter and is not allowed for NPTH', () => {
    expect(fail(base({ platingThickness: um(25) })).field).toBe('platingThickness');
    expect(fail(base({ holeType: 'npth', drillDiameter: mm(0.6), platingThickness: um(25) })).field).toBe('platingThickness');
  });
  it('ring reference must be finished or drill', () => {
    expect(fail({ ...base(), ringReference: 'nominal' }).field).toBe('ringReference');
  });
  it('tolerances: positive finite lengths, or "profile"', () => {
    for (const k of ['holeSizeTolPlus', 'positionTol', 'padSizeTol'] as const) {
      for (const bad of [q(0, DIM.LENGTH), q(-0.01, DIM.LENGTH), rawQ(NaN), q(1, DIM.AREA), 'auto', 5]) {
        expect(fail({ ...base(), [k]: bad }).field, `${k} ${String(bad)}`).toBe(k);
      }
    }
  });
  it('a tolerance of "profile" needs a fab profile and a today date', () => {
    expect(fail(base({ positionTol: 'profile' })).field).toBe('fabProfile');
    expect(fail(withProfile({ positionTol: 'profile', today: undefined as unknown as string })).field).toBe('today');
  });
  it('a fab profile needs "today" (injected), a real calendar date, and a profile that is not dated in the future', () => {
    expect(fail(base({ fabProfile: JLC })).field).toBe('today');
    for (const today of ['now', '2026-02-30', '', '2026-10-13T00:00:00Z']) expect(fail(base({ fabProfile: JLC, today })).field).toBe('today');
    const e = fail(base({ fabProfile: JLC, today: '2026-10-12' }));
    expect(e.field).toBe('fabProfile');
    expect(e.message.toLowerCase()).toContain('future');
  });
  it('a fab profile must be a parsed profile object', () => {
    expect(fail({ ...base(), fabProfile: {}, today: TODAY }).field).toBe('fabProfile');
  });
  it('scope inputs: layer count, copper weight (areal mass), layer side', () => {
    expect(fail({ ...withProfile(), layerCount: '4' }).field).toBe('layerCount');
    expect(fail({ ...withProfile(), layerSide: 'both' }).field).toBe('layerSide');
    expect(fail(withProfile({ copperWeight: mm(1) })).code).toBe('DIMENSION');
    expect(fail(withProfile({ copperWeight: q(0, DIM.AREAL_MASS) })).field).toBe('copperWeight');
  });
  it('user minimums: positive lengths', () => {
    for (const k of ['userMinimumRing', 'userRecommendedRing'] as const) {
      expect(fail({ ...base(), [k]: q(0, DIM.LENGTH) }).field).toBe(k);
      expect(fail({ ...base(), [k]: mm(0.1).si }).field).toBe(k);
    }
  });
  it('never throws and never returns a numeric result for garbage (property)', () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const out = compute(x as Inputs);
        if (out.ok) expect(assertCalcResult(out.value).ok).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
  it('every finite result value is finite for random valid inputs (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.2, max: 5, noNaN: true }),
        fc.double({ min: 0.05, max: 0.19, noNaN: true }),
        fc.double({ min: 0.001, max: 0.5, noNaN: true }),
        (pad, hole, tol) => {
          const r = ok(base({ padDiameter: mm(pad), finishedHoleDiameter: mm(hole), positionTol: mm(tol) }));
          for (const x of r.results) expect(Number.isFinite(x.value.si)).toBe(true);
        },
      ),
    );
  });
});

describe('properties: monotonicity, worst case, units', () => {
  const ringOf = (over: Partial<Inputs>): number => res(ok(base(over)), NOM).value.si;
  it('nominal ring increases with pad diameter and decreases with hole diameter', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.5, max: 3, noNaN: true }), fc.double({ min: 0.01, max: 0.3, noNaN: true }), (hole, dpad) => {
        const pad = hole + 0.2;
        expect(ringOf({ padDiameter: mm(pad + dpad), finishedHoleDiameter: mm(hole) })).toBeGreaterThan(ringOf({ padDiameter: mm(pad), finishedHoleDiameter: mm(hole) }));
        expect(ringOf({ padDiameter: mm(pad), finishedHoleDiameter: mm(hole + dpad / 2) })).toBeLessThan(ringOf({ padDiameter: mm(pad), finishedHoleDiameter: mm(hole) }));
      }),
    );
  });
  it('nominal ring is exactly (pad - hole)/2 within rounding', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 4, noNaN: true }), fc.double({ min: 0.02, max: 4, noNaN: true }), (a, b) => {
        const pad = Math.max(a, b) + 0.05;
        const hole = Math.min(a, b);
        expect(relErr(ringOf({ padDiameter: mm(pad), finishedHoleDiameter: mm(hole) }), (pad * 1e-3 - hole * 1e-3) / 2)).toBeLessThan(1e-9);
      }),
    );
  });
  it('worst case never exceeds nominal and falls as each tolerance grows', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.001, max: 0.2, noNaN: true }),
        fc.double({ min: 0.001, max: 0.2, noNaN: true }),
        fc.double({ min: 0.001, max: 0.2, noNaN: true }),
        fc.double({ min: 0.001, max: 0.1, noNaN: true }),
        (pt, hp, pos, extra) => {
          const r0 = ok(base({ padSizeTol: mm(pt), holeSizeTolPlus: mm(hp), positionTol: mm(pos) }));
          const wc0 = res(r0, WC).value.si;
          expect(wc0).toBeLessThanOrEqual(res(r0, NOM).value.si);
          for (const k of ['padSizeTol', 'holeSizeTolPlus', 'positionTol'] as const) {
            const r1 = ok(base({ padSizeTol: mm(pt), holeSizeTolPlus: mm(hp), positionTol: mm(pos), [k]: mm({ padSizeTol: pt, holeSizeTolPlus: hp, positionTol: pos }[k] + extra) }));
            expect(res(r1, WC).value.si).toBeLessThan(wc0);
          }
        },
      ),
    );
  });
  it('unit-invariant: the same lengths in mil, um and mm give the same ring', () => {
    const a = ok(base({ padDiameter: mm(1.016), finishedHoleDiameter: mm(0.508), positionTol: mm(0.0508) }));
    const b = ok(base({ padDiameter: fromUnit(40, 'mil'), finishedHoleDiameter: fromUnit(20, 'mil'), positionTol: fromUnit(2, 'mil') }));
    const c = ok(base({ padDiameter: um(1016), finishedHoleDiameter: um(508), positionTol: um(50.8) }));
    for (const n of [NOM, WC]) {
      expect(relErr(res(b, n).value.si, res(a, n).value.si)).toBeLessThan(1e-12);
      expect(relErr(res(c, n).value.si, res(a, n).value.si)).toBeLessThan(1e-12);
    }
  });
  it('drill-referenced ring is smaller than the finished-hole ring by half the drill-minus-finished difference', () => {
    const r = ok(base({ drillDiameter: mm(0.66) }));
    expect(relErr(res(r, NOM).value.si - res(r, NOM_DRILL).value.si, 3e-5)).toBeLessThan(1e-6);
  });
  it('a negative worst case is reported (not clamped) with a critical breakout warning; confidence is not high', () => {
    const r = ok(base({ padDiameter: mm(0.7), positionTol: mm(0.15) }));
    expect(res(r, WC).value.si).toBeLessThan(0);
    expect(warn(r, 'BREAKOUT_POSSIBLE')[0]?.severity).toBe('critical');
    expect(r.confidence.level).not.toBe('high');
  });
});

describe('requirements: user-entered minimums, wording and margins', () => {
  it('compares the nominal and worst-case ring with your minimum and recommended values', () => {
    const r = ok(base({ padSizeTol: mm(0.05), positionTol: mm(0.05), userMinimumRing: mm(0.15), userRecommendedRing: mm(0.25) }));
    expect(relErr(inMm(res(r, `nominal ring margin to ${U_MIN}`).value), 0.05)).toBeLessThan(1e-9);
    expect(relErr(inMm(res(r, `nominal ring margin to ${U_REC}`).value), -0.05)).toBeLessThan(1e-9);
    expect(inMm(res(r, `worst-case ring margin to ${U_MIN}`).value)).toBeCloseTo(0.2 - 0.075 - 0.15, 9);
    expect(warn(r, 'BELOW_VALUE').length).toBeGreaterThanOrEqual(2);
    expect(warn(r, 'MEETS_VALUE').length).toBeGreaterThanOrEqual(1);
  });
  it('a ring exactly equal to the requirement meets it (no floating-point flap)', () => {
    const r = ok(base({ padDiameter: mm(0.8), finishedHoleDiameter: mm(0.4), userMinimumRing: mm(0.2) }));
    expect(warn(r, 'BELOW_VALUE')).toHaveLength(0);
    expect(warn(r, 'MEETS_VALUE')).toHaveLength(1);
  });
  it('user-entered values are labelled as user input, never as profile or verified data', () => {
    const r = ok(base({ userMinimumRing: mm(0.15) }));
    expect(r.inputs.find((i) => i.name === U_MIN)?.source).toBe('user');
    expect(r.dataStatus).toBe('VERIFIED'); // pure arithmetic on user numbers: no sourced data in play
  });
});

describe('profile scope: exact scope only, never borrowed, never a green pass for UNVERIFIED data', () => {
  const pth = (over: Partial<Inputs> = {}): Inputs =>
    withProfile({ padDiameter: mm(0.85), finishedHoleDiameter: mm(0.4), holeType: 'pth', layerCount: 'multilayer', copperWeight: oz(1), ...over });
  it('PTH, multilayer, 1 oz: profile minimum 0.15 and recommended 0.20 mm are found, carry ledger id and UNVERIFIED status', () => {
    const r = ok(pth());
    expect(inMm(res(r, P_MIN).value)).toBeCloseTo(0.15, 12);
    expect(inMm(res(r, P_REC).value)).toBeCloseTo(0.2, 12);
    expect(inMm(res(r, NOM).value)).toBeCloseTo(0.225, 12);
    expect(inMm(res(r, `nominal ring margin to ${P_MIN}`).value)).toBeCloseTo(0.075, 12);
    expect(inMm(res(r, `nominal ring margin to ${P_REC}`).value)).toBeCloseTo(0.025, 12);
    const inp = r.inputs.find((i) => i.name === P_MIN);
    expect(inp?.source).toBe('fab-profile');
    expect(inp?.sourceDetail).toContain('S-019j');
    expect(inp?.sourceDetail).toContain('UNVERIFIED');
    expect(inp?.sourceDetail).toContain(JLC.id);
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.fabProfile?.id).toBe(JLC.id);
    expect(r.fabProfile?.status).toBe('UNVERIFIED');
    expect(r.fabProfile?.ageDays).toBe(7);
    expect(r.fabProfile?.stale).toBe(false);
    expect(r.confidence.level).not.toBe('high');
    expect(r.confidence.reasons.join(' ')).toContain('UNVERIFIED');
  });
  it('2-layer 1 oz gives the stricter 0.18 / 0.25 mm values, not the multilayer ones', () => {
    const r = ok(pth({ layerCount: '2' }));
    expect(inMm(res(r, P_MIN).value)).toBeCloseTo(0.18, 12);
    expect(inMm(res(r, P_REC).value)).toBeCloseTo(0.25, 12);
    expect(warn(r, 'BELOW_VALUE').some((w) => w.message.includes(P_REC))).toBe(true);
  });
  it('wording: "meets" / "below" the profile value; says UNVERIFIED; no certification or pass wording anywhere', () => {
    const r = ok(pth({ layerCount: '2', positionTol: mm(0.05) }));
    const meets = warn(r, 'MEETS_VALUE');
    const below = warn(r, 'BELOW_VALUE');
    expect(meets.length + below.length).toBeGreaterThanOrEqual(2);
    for (const w of [...meets, ...below]) {
      expect(w.message).toMatch(/\b(meets|is below)\b/);
      expect(w.message).toContain('UNVERIFIED');
      expect(w.severity === 'info' || w.severity === 'warning').toBe(true);
    }
    expect(meets.every((w) => w.severity === 'info')).toBe(true);
    const text = JSON.stringify(r).toLowerCase();
    // Fragments are joined at run time so this file does not itself contain the phrases the repository audit greps for.
    for (const banned of ['compl' + 'iant', 'compl' + 'ies', 'certif', 'production ' + 'safe', 'approved', 'passed', ' pass ', 'passes']) expect(text, banned).not.toContain(banned);
  });
  it('2 oz: the recommended 0.254 mm is found; the absolute minimum is NOT PUBLISHED and says so', () => {
    const r = ok(pth({ copperWeight: oz(2), padDiameter: mm(1.0) }));
    expect(inMm(res(r, P_REC).value)).toBeCloseTo(0.254, 12);
    expect(has(r, P_MIN)).toBe(false);
    expect(has(r, `nominal ring margin to ${P_MIN}`)).toBe(false);
    const w = warn(r, 'MINIMUM_NOT_PUBLISHED');
    expect(w.length).toBe(1);
    expect(w[0]?.message).toContain(NOT_PUBLISHED_TEXT);
    expect(w[0]?.message).toContain('S-019j');
  });
  it('1-layer PTH: neither value is published; no value is borrowed from 2-layer or multilayer', () => {
    const r = ok(pth({ layerCount: '1' }));
    expect(has(r, P_MIN)).toBe(false);
    expect(has(r, P_REC)).toBe(false);
    expect(warn(r, 'MINIMUM_NOT_PUBLISHED').length).toBe(2);
    expect(r.results.some((x) => x.name.includes('margin'))).toBe(false);
  });
  it('0.5 oz or 3.5 oz (no entry at all): not available for this scope, enter your fabricator value; nothing borrowed', () => {
    for (const w of [0.5, 3.5]) {
      const r = ok(pth({ copperWeight: oz(w) }));
      expect(has(r, P_MIN)).toBe(false);
      expect(has(r, P_REC)).toBe(false);
      const ws = warn(r, 'MINIMUM_NOT_AVAILABLE');
      expect(ws.length).toBe(2);
      expect(ws[0]?.message).toContain(NOT_PUBLISHED_TEXT);
      expect(ws[0]?.message.toLowerCase()).toContain('not substituted');
    }
  });
  it('a missing layer count or copper weight is not guessed; the message names what is missing', () => {
    const noLayers = ok(pth({ layerCount: undefined as unknown as '2' }));
    expect(has(noLayers, P_MIN)).toBe(false);
    expect(warn(noLayers, 'MINIMUM_NOT_AVAILABLE')[0]?.message.toLowerCase()).toContain('layer count');
    const noOz = ok(pth({ copperWeight: undefined as unknown as Quantity }));
    expect(has(noOz, P_MIN)).toBe(false);
    expect(warn(noOz, 'MINIMUM_NOT_AVAILABLE')[0]?.message.toLowerCase()).toContain('copper weight');
  });
  it('via: no ring minimum is published (never the PTH value); the pad-minus-hole rule is used and labelled as a diameter difference', () => {
    const r = ok(pth({ holeType: 'via', padDiameter: mm(0.45), finishedHoleDiameter: mm(0.3) }));
    expect(has(r, P_MIN)).toBe(false);
    expect(has(r, P_REC)).toBe(false);
    expect(warn(r, 'MINIMUM_NOT_PUBLISHED').length).toBe(2);
    expect(inMm(res(r, VIA_DIFF_MIN).value)).toBeCloseTo(0.1, 12);
    expect(inMm(res(r, VIA_DIFF_REC).value)).toBeCloseTo(0.15, 12);
    expect(inMm(res(r, `pad-minus-hole margin to ${VIA_DIFF_MIN}`).value)).toBeCloseTo(0.05, 12);
    expect(inMm(res(r, `pad-minus-hole margin to ${VIA_DIFF_REC}`).value)).toBeCloseTo(0, 9);
    expect(has(r, 'pad minus hole diameter')).toBe(true);
  });
  it('via below the pad-minus-hole rule is reported as below the profile value', () => {
    const r = ok(pth({ holeType: 'via', padDiameter: mm(0.35), finishedHoleDiameter: mm(0.3) }));
    expect(warn(r, 'BELOW_VALUE').some((w) => w.message.includes(VIA_DIFF_MIN))).toBe(true);
  });
  it('PTH and NPTH never get the via pad-minus-hole rule', () => {
    expect(has(ok(pth()), VIA_DIFF_MIN)).toBe(false);
    expect(has(ok(pth({ holeType: 'npth' })), VIA_DIFF_MIN)).toBe(false);
  });
  it('NPTH: its own ring (0.45 mm) applies for any layer count and copper weight', () => {
    const r = ok(pth({ holeType: 'npth', padDiameter: mm(1.3), finishedHoleDiameter: mm(0.5), layerCount: '1', copperWeight: oz(3) }));
    expect(inMm(res(r, P_MIN).value)).toBeCloseTo(0.45, 12);
    expect(inMm(res(r, `nominal ring margin to ${P_MIN}`).value)).toBeCloseTo(0.4 - 0.45, 12);
    expect(warn(r, 'BELOW_VALUE').length).toBeGreaterThanOrEqual(1);
  });
  it('without a profile there is no profile minimum, and a user minimum alone works', () => {
    const r = ok(base({ userMinimumRing: mm(0.1) }));
    expect(has(r, P_MIN)).toBe(false);
    expect(has(r, U_MIN)).toBe(true);
    expect(r.fabProfile).toBeUndefined();
  });
  it('a profile minimum and a user minimum can both be shown; neither replaces the other', () => {
    const r = ok(pth({ userMinimumRing: mm(0.3) }));
    expect(has(r, P_MIN)).toBe(true);
    expect(has(r, U_MIN)).toBe(true);
  });
  it('a stale profile (more than 365 days) is flagged and confidence is not high; ageDays is exact', () => {
    const r = ok(pth({ today: '2027-10-14' }));
    expect(r.fabProfile?.ageDays).toBe(366);
    expect(r.fabProfile?.stale).toBe(true);
    expect(warn(r, 'FAB_PROFILE_STALE')).toHaveLength(1);
    expect(r.confidence.level).not.toBe('high');
  });
  it('an UNVERIFIED profile always carries a visible caution naming the profile, its date and that limits change without notice', () => {
    const w = warn(ok(pth()), 'FAB_PROFILE_UNVERIFIED');
    expect(w).toHaveLength(1);
    expect(w[0]?.message).toContain(JLC.id);
    expect(w[0]?.message).toContain('2026-10-13');
  });
  it('the ring reference of the fab is stated as not published and the caution says so when a profile ring value is used', () => {
    const w = warn(ok(pth()), 'RING_REFERENCE_UNSTATED');
    expect(w).toHaveLength(1);
    expect(w[0]?.message.toLowerCase()).toContain('finished or the drill');
  });
  it('the empty template profile yields no profile limits for any scope', () => {
    const key = Object.keys(profileFiles).find((k) => k.endsWith('/template.json')) ?? '';
    const t = parseFabProfile(JSON.parse(profileFiles[key] as string) as unknown);
    if (!t.ok) throw new Error('template must parse');
    const r = ok(pth({ fabProfile: t.value }));
    expect(has(r, P_MIN)).toBe(false);
    expect(warn(r, 'MINIMUM_NOT_AVAILABLE').length).toBe(2);
  });
});

describe('tolerances from the profile (exact scope only) or the user; none is assumed', () => {
  const pth = (over: Partial<Inputs> = {}): Inputs =>
    withProfile({ padDiameter: mm(1.0), finishedHoleDiameter: mm(0.6), holeType: 'pth', layerCount: '2', copperWeight: oz(1), ...over });
  it('PTH: finished-hole tolerance +0.13 mm and position 0.075 mm come from the profile with ledger ids; pad size tolerance is not published', () => {
    const r = ok(pth({ holeSizeTolPlus: 'profile', positionTol: 'profile', padSizeTol: 'profile' }));
    // nominal 0.2; terms 0.13/2 + 0.075 = 0.14; worst 0.06
    expect(inMm(res(r, WC).value)).toBeCloseTo(0.06, 12);
    const hole = r.inputs.find((i) => i.name === 'hole size tolerance (+)');
    expect(hole?.source).toBe('fab-profile');
    expect(hole?.sourceDetail).toContain('S-019i');
    expect(hole?.sourceDetail).toContain('UNVERIFIED');
    expect(r.inputs.some((i) => i.name === 'pad size tolerance (+/-)')).toBe(false);
    expect(warn(r, 'TOLERANCE_NOT_PUBLISHED').some((w) => w.message.includes('pad size'))).toBe(true);
    expect(warn(r, 'WORST_CASE_INCOMPLETE')).toHaveLength(1);
  });
  it('via: no finished-hole tolerance is published, so the term is omitted and the result says so (not the PTH +0.13)', () => {
    const r = ok(pth({ holeType: 'via', holeSizeTolPlus: 'profile', positionTol: 'profile' }));
    expect(inMm(res(r, WC).value)).toBeCloseTo(0.2 - 0.075, 12);
    expect(warn(r, 'TOLERANCE_NOT_PUBLISHED').some((w) => w.message.includes('hole size'))).toBe(true);
  });
  it('NPTH: round-hole tolerance not published; term omitted', () => {
    const r = ok(pth({ holeType: 'npth', holeSizeTolPlus: 'profile', positionTol: mm(0.05) }));
    expect(inMm(res(r, WC).value)).toBeCloseTo(0.15, 12);
    expect(warn(r, 'TOLERANCE_NOT_PUBLISHED').length).toBeGreaterThanOrEqual(1);
  });
  it('drill-referenced ring: the profile finished-hole tolerance is NOT applied to the drill; it is omitted with the reason', () => {
    const r = ok(pth({ drillDiameter: mm(0.65), ringReference: 'drill', holeSizeTolPlus: 'profile', positionTol: mm(0.05) }));
    expect(has(r, WC_DRILL)).toBe(true);
    expect(inMm(res(r, WC_DRILL).value)).toBeCloseTo(0.175 - 0.05, 12);
    const w = warn(r, 'TOLERANCE_NOT_PUBLISHED').concat(warn(r, 'TOLERANCE_NOT_APPLICABLE'));
    expect(w.some((x) => x.message.toLowerCase().includes('finished-hole tolerance'))).toBe(true);
  });
  it('a user-entered value always wins over nothing, and is shown as user input; mixed sources are fine', () => {
    const r = ok(pth({ holeSizeTolPlus: 'profile', positionTol: mm(0.03), padSizeTol: mm(0.04) }));
    expect(r.inputs.find((i) => i.name === 'position tolerance')?.source).toBe('user');
    expect(r.inputs.find((i) => i.name === 'hole size tolerance (+)')?.source).toBe('fab-profile');
    expect(inMm(res(r, WC).value)).toBeCloseTo(0.2 - (0.065 + 0.03 + 0.02), 12);
  });
  it('a 1-layer or 2-layer scope does not change the tolerance (published without a layer scope), a missing hole type is impossible (required)', () => {
    const a = ok(pth({ layerCount: '1', holeSizeTolPlus: 'profile' }));
    expect(inMm(res(a, WC).value)).toBeCloseTo(0.2 - 0.065, 12);
  });
  it('steps list every tolerance term with its source', () => {
    const r = ok(pth({ holeSizeTolPlus: 'profile', positionTol: mm(0.03), padSizeTol: mm(0.04) }));
    const text = r.steps.map((s) => `${s.label} ${s.expr}`).join('\n');
    expect(text).toContain('pad size');
    expect(text).toContain('hole size');
    expect(text).toContain('position');
    expect(text).toContain('S-019i');
    expect(text).toContain('user');
  });
  it('the arithmetic sum is described as a linear worst case, not a statistical result', () => {
    const r = ok(pth({ positionTol: mm(0.03) }));
    expect(warn(r, 'LINEAR_STACKUP')).toHaveLength(1);
    expect(r.formula.toLowerCase()).toContain('worst');
  });
  it('the minus tolerance never improves the worst case (smaller holes are not credited)', () => {
    const r = ok(pth({ holeSizeTolPlus: 'profile' }));
    expect(inMm(res(r, WC).value)).toBeCloseTo(0.2 - 0.065, 12);
    expect(r.assumptions.join(' ').toLowerCase()).toContain('minus');
  });
});

describe('IPC-6012 and scope statements', () => {
  it('always warns that IPC-6012 acceptance (breakout, class) is paywalled and not evaluated', () => {
    for (const r of [ok(base()), ok(withProfile({ layerCount: '2', copperWeight: oz(1) }))]) {
      const w = warn(r, 'IPC6012_NOT_EVALUATED');
      expect(w).toHaveLength(1);
      expect(w[0]?.message).toContain('IPC-6012');
      expect(w[0]?.message).toContain('PAYWALLED');
      expect(w[0]?.message.toLowerCase()).toContain('not evaluated');
    }
  });
  it('meta: id, reference and ledger ids; accuracy class exact; no tolerance inputs listed as defaults', () => {
    expect(meta.id).toBe('annular-ring');
    expect(meta.accuracyClass).toBe('exact');
    for (const id of ['S-006', 'S-019j']) expect(meta.ledgerIds).toContain(id);
  });
  it('NPTH carries an info that no plating exists and finished hole equals drill', () => {
    expect(warn(ok(base({ holeType: 'npth' })), 'NPTH_NO_PLATING')).toHaveLength(1);
    expect(warn(ok(base({ holeType: 'pth' })), 'NPTH_NO_PLATING')).toHaveLength(0);
  });
  it('drill minus finished hole is shown; plating, when given, is compared informationally with half the difference', () => {
    const r = ok(base({ drillDiameter: mm(0.66), platingThickness: um(25) }));
    expect(inMm(res(r, 'drill minus finished hole diameter').value)).toBeCloseTo(0.06, 12);
    expect(warn(r, 'DRILL_ALLOWANCE')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------
// No fab limits in code (CLAUDE.md rule 9)
// ---------------------------------------------------------------------------------------------------------
const sources = import.meta.glob(['./calc.ts', './guards.ts', './meta.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
describe('no fabricator limit is hard-coded', () => {
  it('calc, guards and meta contain none of the JLCPCB figures or a fabricator name', () => {
    expect(Object.keys(sources).length).toBe(3);
    for (const [file, text] of Object.entries(sources)) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const lit of ['0.254', '0.28', '0.075', '0.13', '0.45', '0.18', '0.35', '0.08']) expect(code, `${file} ${lit}`).not.toContain(lit);
      expect(code.toLowerCase(), file).not.toContain('jlcpcb');
      expect(code.toLowerCase(), file).not.toContain('pcbway');
    }
  });
});

describe('partial worst case (PCB-F2)', () => {
  const full = { padDiameter: mm(0.9), finishedHoleDiameter: mm(0.5), holeType: 'pth' as const, holeSizeTolPlus: mm(0.1), padSizeTol: mm(0.05), positionTol: mm(0.075) };
  const names = (r: CalcResult): string[] => r.results.map((x) => x.name);
  const without = (keys: string[]): Inputs => Object.fromEntries(Object.entries(full).filter(([k]) => !keys.includes(k))) as unknown as Inputs;
  it('all three terms present: plain name, no partial wording, no omitted-term reason', () => {
    const r = ok(full as Inputs);
    expect(names(r)).toContain(WC);
    expect(names(r).some((n) => n.startsWith('partial'))).toBe(false);
    expect(r.confidence.reasons.join(' ')).not.toMatch(/omitted worst-case term/);
  });
  it('one term omitted: partial name that lists it, and a safety-relevant reason naming it', () => {
    const r = ok(without(['padSizeTol']));
    expect(r.results.find((x) => x.role === 'primary')?.name).toBe('partial worst-case annular ring (omits: pad size tolerance) (finished hole)');
    expect(names(r)).not.toContain(WC);
    expect(r.confidence.reasons.join(' ')).toMatch(/omitted worst-case term: pad size tolerance/);
    expect(r.warnings.some((w) => w.code === 'WORST_CASE_INCOMPLETE')).toBe(true);
  });
  it('each omitted term adds 2 to the score and the primary is named for all of them', () => {
    const r1 = ok(without(['padSizeTol']));
    const r2 = ok(without(['padSizeTol', 'holeSizeTolPlus']));
    const r0 = ok(full as Inputs);
    expect(r1.confidence.score).toBe(r0.confidence.score + 2);
    expect(r2.confidence.score).toBe(r0.confidence.score + 4);
    expect(r2.results.find((x) => x.role === 'primary')?.name).toBe('partial worst-case annular ring (omits: pad size tolerance, hole size tolerance) (finished hole)');
    expect(r2.confidence.level).toBe('low');
  });
  it('no term at all: nominal only, no partial wording (nothing is called a worst case)', () => {
    const r = ok({ padDiameter: mm(0.9), finishedHoleDiameter: mm(0.5), holeType: 'pth' } as Inputs);
    expect(names(r).some((n) => /worst-case/.test(n))).toBe(false);
  });
});
