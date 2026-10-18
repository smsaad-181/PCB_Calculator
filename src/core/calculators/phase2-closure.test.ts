import { describe, expect, it } from 'vitest';
import { detectForbidden } from '../../../tools/audit-lib.mjs';
import { LEDGER } from '../data/ledger';
import { MU0_LEDGER_DISPLAY, SOLDERMASK_WORDING, paywalledPaperIds, paywalledPaperRole } from '../data/impedance-wording';
import { parseFabProfile } from '../fab/profile';
import type { ParsedFabProfile } from '../fab/profile';
import { formatSignedPercent } from '../format-result';
import type { CalcOutcome, CalcResult } from '../result';
import { assertCalcResult } from '../result';
import { fromUnit } from '../units';
import type { Quantity } from '../units';
import { deriveMicrostrip, deriveStripline, validateStackup } from '../stackup';
import { compute as coax } from './coax/calc';
import { compute as cpw } from './cpw/calc';
import { compute as cpwg } from './cpwg/calc';
import { compute as diffMicrostrip } from './diff-microstrip/calc';
import { compute as diffStripline } from './diff-stripline/calc';
import type { ProfileScope } from './impedance-envelope';
import { SOLDERMASK_MESSAGE, dimensionless } from './impedance-shared';
import { LOSS_LABEL, MICROSTRIP_CONDUCTOR_DIRECTION } from './loss-shared';
import { COHN_WIDE_DIFF, COHN_WIDE_Z0, compute as stripline } from './stripline/calc';
import { VARIANT_A_DIFF, VARIANT_A_EE, VARIANT_A_Z0, compute as microstrip } from './microstrip/calc';

// Phase 2 closure, core part (calc F-1..F-3, PCB2-2, PCB2-4, PCB2-5, PCB2-8). TESTS FIRST. Expected variant numbers come from
// docs/golden-vectors.json (independent oracle), not from the implementation.

interface GoldenVector {
  name: string;
  pinned_expected: number;
}
const goldenFiles = import.meta.glob('../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const goldenText = Object.values(goldenFiles)[0];
const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;
const vec = (name: string): number => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found`);
  return v.pinned_expected;
};

const um = (n: number): Quantity => fromUnit(n, 'um');
const mm = (n: number): Quantity => fromUnit(n, 'mm');
const ohm = (n: number): Quantity => fromUnit(n, 'ohm');
const dl = dimensionless;
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

function okOf(out: CalcOutcome): CalcResult {
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code} ${out.error.field ?? ''}: ${out.error.message}`);
  const chk = assertCalcResult(out.value);
  expect(chk.ok, chk.ok ? '' : chk.error.join('; ')).toBe(true);
  return out.value;
}
function errOf(out: CalcOutcome) {
  if (out.ok) throw new Error('expected an error');
  return out.error;
}
const res = (r: CalcResult, name: string) => {
  const x = r.results.find((o) => o.name === name);
  if (!x) throw new Error(`result "${name}" missing; have ${r.results.map((o) => o.name).join(', ')}`);
  return x;
};
const has = (r: CalcResult, name: string): boolean => r.results.some((o) => o.name === name);
const warn = (r: CalcResult, code: string) => r.warnings.find((w) => w.code === code);
const Z0 = 'characteristic impedance Z0';

// ---- the seven calculators with a loss request -----------------------------------------------------------------------------

const LOSS = { frequency: fromUnit(1, 'GHz'), lossTangent: dl(0.02), lossTangentSource: 'test laminate sheet' };
const microstripLoss = (x: Record<string, unknown> = {}): CalcOutcome => microstrip({ width: um(300), height: um(150), er: dl(4.2), ...LOSS, ...x } as never);
const seven: [string, (extra?: Record<string, unknown>) => CalcOutcome][] = [
  ['microstrip', (x = {}) => microstrip({ width: um(300), height: um(150), er: dl(4.2), ...LOSS, ...x } as never)],
  ['stripline', (x = {}) => stripline({ width: um(200), spacing: um(500), er: dl(4.2), ...LOSS, ...x } as never)],
  ['coax', (x = {}) => coax({ outerDiameter: mm(3.5), innerDiameter: mm(1), er: dl(2.1), ...LOSS, ...x } as never)],
  ['diff-microstrip', (x = {}) => diffMicrostrip({ width: um(150), edgeSpacing: um(150), height: um(150), er: dl(4.2), ...LOSS, ...x } as never)],
  ['diff-stripline', (x = {}) => diffStripline({ width: um(150), edgeSpacing: um(200), planeSpacing: um(500), er: dl(4.2), ...LOSS, ...x } as never)],
  ['cpw', (x = {}) => cpw({ width: um(300), gap: um(150), height: um(1600), er: dl(4.2), ...LOSS, ...x } as never)],
  ['cpwg', (x = {}) => cpwg({ width: um(300), gap: um(150), height: um(400), er: dl(4.2), ...LOSS, ...x } as never)],
];

describe('F-1 / PCB2-10: the loss label and the conductor-loss direction', () => {
  it('the shared label states the direction without calling anything a bound', () => {
    expect(LOSS_LABEL).toBe('approximate estimate; roughness not modelled raises conductor loss; dispersion not modelled');
    expect(LOSS_LABEL).not.toMatch(/lower bound|optimistic/i);
    expect(MICROSTRIP_CONDUCTOR_DIRECTION).toBe(
      'overestimates for smooth copper per the recorded refinements, underestimates for rough copper (roughness not modelled); an approximate estimate, not a bound',
    );
  });
  it('the microstrip warning and the conductor-loss note give the true direction', () => {
    const r = okOf(microstripLoss());
    const w = warn(r, 'CONDUCTOR_LOSS_WIDE_STRIP');
    expect(w?.message).toContain(MICROSTRIP_CONDUCTOR_DIRECTION);
    expect(w?.message).toMatch(/Qucs eq\. 11\.82/);
    expect(w?.message).toMatch(/Steer eq\. 22/);
    expect(w?.message).not.toMatch(/optimistic/i);
    expect(res(r, 'conductor loss alpha_c').note).toContain(MICROSTRIP_CONDUCTOR_DIRECTION);
  });
  it('no result of the seven calculators calls the loss a bound or optimistic, and every loss note carries the single label', () => {
    for (const [name, run] of seven) {
      const r = okOf(run());
      const text = JSON.stringify(r);
      expect(text, name).not.toMatch(/lower bound|optimistic for narrow/i);
      for (const o of r.results.filter((x) => x.name.startsWith('dielectric loss') || x.name.startsWith('conductor loss alpha'))) expect(o.note, `${name} ${o.name}`).toContain(LOSS_LABEL);
    }
  });
});

describe('F-2: er = 1 with a loss tangent above zero is refused', () => {
  for (const [name, run] of seven) {
    it(`${name}: refused as INVALID_INPUT on er with a clear message`, () => {
      const e = errOf(run({ er: dl(1) }));
      expect(e.code).toBe('INVALID_INPUT');
      expect(e.field).toBe('er');
      expect(e.message).toMatch(/lossy dielectric needs er > 1: er = 1 is vacuum/i);
    });
    it(`${name}: er = 1 without a loss request (or with tan delta 0) is still accepted`, () => {
      const base = run({ er: dl(1), lossTangent: undefined, lossTangentSource: undefined, frequency: undefined });
      expect(base.ok, name).toBe(true);
      expect(run({ er: dl(1), lossTangent: dl(0) }).ok, name).toBe(true);
    });
  }
  it('er just above 1 still works (no discontinuity is hidden by a refusal at 1)', () => {
    expect(microstripLoss({ er: dl(1.000001) }).ok).toBe(true);
  });
});

describe('F-3: the thickness variants have a defensive domain guard', () => {
  const base = { width: um(1000), height: um(1000), er: dl(4.4) };
  for (const model of ['hj-procedure-A', 'hj-procedure-B'] as const) {
    it(`microstrip ${model}: t = 2h and t = h are refused with the geometric-guard wording`, () => {
      for (const t of [2000, 1000]) {
        const e = errOf(microstrip({ ...base, thickness: um(t), thicknessModel: model }));
        expect(e.code).toBe('OUT_OF_DOMAIN');
        expect(e.field).toBe('thickness');
        expect(e.message).toMatch(/outside the thickness correction's domain \(geometric guard, not a sourced range\)/);
      }
    });
    it(`microstrip ${model}: t just below h is accepted (the guard is geometric, no range is invented)`, () => {
      const r = okOf(microstrip({ ...base, thickness: um(999), thicknessModel: model }));
      const c = r.validityChecks.find((x) => x.name === 't/h reported');
      expect(c?.ok).toBe(true);
      expect(c?.detail).toMatch(/no validity range recorded for the thickness correction/);
    });
  }
  it('microstrip solve mode obeys the same guard', () => {
    const e = errOf(microstrip({ targetZ0: ohm(50), height: um(100), er: dl(4.4), thickness: um(150), thicknessModel: 'hj-procedure-A' }));
    expect(e.field).toBe('thickness');
  });
  it('stripline keeps its t >= b guard and now says it is geometric', () => {
    const e = errOf(stripline({ width: um(500), spacing: um(500), er: dl(4), thickness: um(500), thicknessModel: 'cohn-wide' }));
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.message).toMatch(/smaller than the plane-to-plane spacing b/);
    expect(e.message).toMatch(/geometric guard, not a sourced range/);
  });
});

describe('PCB2-2: thickness entered with the zero-thickness model gives a labelled variant-A secondary', () => {
  const CASES: [number, number, number, number][] = [[3150, 1575, 35, 4.5], [150, 100, 18, 4.2], [400, 200, 35, 3.66], [2000, 200, 70, 4.5]];
  for (const [w, h, t, e] of CASES) {
    it(`w ${String(w)}, h ${String(h)}, t ${String(t)} um, er ${String(e)}: equals the variant-A golden vectors, headline and confidence unchanged`, () => {
      const tag = `w${String(w)}um_h${String(h)}um_er${String(e)}_t${String(t)}um`;
      const withT = okOf(microstrip({ width: um(w), height: um(h), er: dl(e), thickness: um(t) }));
      const without = okOf(microstrip({ width: um(w), height: um(h), er: dl(e) }));
      expect(relErr(res(withT, VARIANT_A_Z0).value.si, vec(`microstrip_thickA_z0_ohm_${tag}`))).toBeLessThan(1e-9);
      expect(relErr(res(withT, VARIANT_A_EE).value.si, vec(`microstrip_thickA_eeff_${tag}`))).toBeLessThan(1e-9);
      const diff = res(withT, VARIANT_A_DIFF);
      expect(diff.value.si).toBeCloseTo(vec(`microstrip_thickA_z0_ohm_${tag}`) / res(withT, Z0).value.si - 1, 12);
      expect(diff.note).toContain(formatSignedPercent(diff.value.si, { accuracyClass: 'empirical' }));
      // headline, status and confidence are the zero-thickness ones
      expect(res(withT, Z0).value.si).toBe(res(without, Z0).value.si);
      expect(res(withT, Z0).role).toBe('primary');
      expect(res(withT, VARIANT_A_Z0).role).toBe('secondary');
      expect(withT.confidence.level).toBe(without.confidence.level);
      expect(withT.confidence.score).toBe(without.confidence.score);
      expect(withT.dataStatus).toBe(without.dataStatus);
      expect(withT.reference.ledgerIds).toEqual(without.reference.ledgerIds);
      expect(warn(withT, 'THICKNESS_VARIANT_SECONDARY')?.severity).toBe('info');
      expect(diff.value.si).toBeLessThan(0);
    });
  }
  it('names carry the CONFLICT label and the ledger id', () => {
    expect(VARIANT_A_Z0).toBe('Z0 with thickness variant A (CONFLICT, S-020a)');
    expect(VARIANT_A_EE).toMatch(/CONFLICT, S-020a/);
  });
  it('without a thickness, or with a variant chosen, there is no secondary', () => {
    const none = okOf(microstrip({ width: um(300), height: um(150), er: dl(4.2) }));
    expect(has(none, VARIANT_A_Z0)).toBe(false);
    const chosen = okOf(microstrip({ width: um(300), height: um(150), er: dl(4.2), thickness: um(35), thicknessModel: 'hj-procedure-A' }));
    expect(has(chosen, VARIANT_A_Z0)).toBe(false);
  });
  it('solve mode: the secondary is evaluated at the solved width', () => {
    const r = okOf(microstrip({ targetZ0: ohm(50), height: um(200), er: dl(4.2), thickness: um(35) }));
    const w = res(r, 'trace width for target Z0').value;
    const same = okOf(microstrip({ width: w, height: um(200), er: dl(4.2), thickness: um(35) }));
    expect(res(r, VARIANT_A_Z0).value.si).toBeCloseTo(res(same, VARIANT_A_Z0).value.si, 9);
  });
  it('t at or above h with the zero-thickness model is not refused: the secondary is skipped with a reason', () => {
    const r = okOf(microstrip({ width: um(300), height: um(150), er: dl(4.2), thickness: um(300) }));
    expect(has(r, VARIANT_A_Z0)).toBe(false);
    expect(warn(r, 'THICKNESS_VARIANT_NOT_SHOWN')?.message).toMatch(/geometric guard, not a sourced range/);
  });
  it('the envelope path keeps the secondary and does not change the headline', () => {
    const r = okOf(microstrip({ width: um(300), height: um(150), er: dl(4.2), thickness: um(35), tolerances: { er: dl(0.05) } }));
    expect(has(r, VARIANT_A_Z0)).toBe(true);
  });

  const SL_CASES: [number, number, number, number][] = [[500, 1000, 20, 4.0], [900, 800, 18, 4.2], [400, 500, 17.5, 3.66], [350, 1000, 20, 4.0]];
  for (const [w, b, t, e] of SL_CASES) {
    it(`stripline w ${String(w)}, b ${String(b)}, t ${String(t)} um: cohn-wide secondary equals the golden vector`, () => {
      const r = okOf(stripline({ width: um(w), spacing: um(b), er: dl(e), thickness: um(t) }));
      const plain = okOf(stripline({ width: um(w), spacing: um(b), er: dl(e) }));
      const gv = vec(`stripline_cohnwide_z0_ohm_w${String(w)}um_b${String(b)}um_t${String(t)}um_er${String(e)}`);
      expect(relErr(res(r, COHN_WIDE_Z0).value.si, gv)).toBeLessThan(1e-9);
      expect(res(r, COHN_WIDE_DIFF).value.si).toBeCloseTo(gv / res(r, Z0).value.si - 1, 12);
      expect(res(r, Z0).value.si).toBe(res(plain, Z0).value.si);
      expect(r.confidence.score).toBe(plain.confidence.score);
      expect(r.dataStatus).toBe(plain.dataStatus);
      expect(warn(r, 'THICKNESS_VARIANT_SECONDARY')).toBeDefined();
    });
  }
  it('stripline: a narrow strip (w/b < 0.35) gets a note saying why there is no secondary', () => {
    const r = okOf(stripline({ width: um(200), spacing: um(1000), er: dl(4), thickness: um(20) }));
    expect(has(r, COHN_WIDE_Z0)).toBe(false);
    expect(warn(r, 'THICKNESS_VARIANT_NOT_SHOWN')?.message).toMatch(/w\/b of at least 0\.35/);
  });
  it('stripline: t/b outside the recorded accuracy range is said in the note', () => {
    const r = okOf(stripline({ width: um(500), spacing: um(1000), er: dl(4), thickness: um(100) }));
    expect(res(r, COHN_WIDE_Z0).note).toMatch(/outside the recorded accuracy range t\/b < 0\.025/);
  });
});

describe('PCB2-2: one soldermask wording in every outer-layer model', () => {
  it('the constant is the exact agreed sentence and is not quantified', () => {
    expect(SOLDERMASK_MESSAGE).toBe(SOLDERMASK_WORDING);
    expect(SOLDERMASK_WORDING).toBe('Soldermask/coating not modelled: it typically lowers Z0 of an outer-layer line; the size depends on mask thickness and Dk (not sourced here)');
    expect(SOLDERMASK_WORDING).not.toMatch(/\d\s?%/);
  });
  it('microstrip, diff microstrip, cpw and cpwg warn with exactly that sentence', () => {
    for (const [name, run] of seven.filter(([n]) => ['microstrip', 'diff-microstrip', 'cpw', 'cpwg'].includes(n))) {
      expect(warn(okOf(run()), 'SOLDERMASK_NOT_MODELLED')?.message, name).toBe(SOLDERMASK_WORDING);
    }
  });
  it('the stackup derivation note uses the same sentence', () => {
    const st = validateStackup({
      name: 'x',
      layers: [
        { kind: 'soldermask', name: 'mask', thickness: um(20) },
        { kind: 'copper', name: 'A', thickness: um(35) },
        { kind: 'dielectric', name: 'd', thickness: um(200), er: 4.2, source: 'user' },
        { kind: 'copper', name: 'B', thickness: um(35) },
      ],
    } as never);
    if (!st.ok) throw new Error(JSON.stringify(st.error));
    const d = deriveMicrostrip(st.value, 'A');
    if (!d.ok) throw new Error(d.error.message);
    expect(d.value.notes).toContain(`${SOLDERMASK_WORDING}.`);
  });
});

// ---- PCB2-4 -----------------------------------------------------------------------------------------------------------------

const scopedMin = (key: 'traceWidth' | 'traceSpace', value: number, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  key,
  kind: 'min',
  published: true,
  value: { value, unit: 'um' },
  holeType: 'any',
  sizeBasis: 'not-applicable',
  layerCount: 'multilayer',
  copperOz: 1,
  layerSide: 'unstated',
  ledgerId: 'S-019l',
  quote: 'test wording, not fabricator data',
  retrievedOn: '2026-10-13',
  ...over,
});
function profile(scoped: unknown[], over: Record<string, unknown> = {}): ParsedFabProfile {
  const r = parseFabProfile({
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
  if (!r.ok) throw new Error(r.error.join(' | '));
  return r.value;
}
const scope: ProfileScope = { layerCount: 'multilayer', layerSide: 'outer', copperWeight: fromUnit(1, 'oz/ft2') };
const prof = profile([scopedMin('traceWidth', 90), scopedMin('traceSpace', 100)]);
const withProf = { fabProfile: prof, today: '2026-10-18', profileScope: scope };

describe('PCB2-4: fab-profile minimum check for widths, spacings and gaps', () => {
  it('microstrip: an entered width below the minimum gets a warning with profile id, status, ledger id and age', () => {
    const r = okOf(microstrip({ width: um(60), height: um(150), er: dl(4.2), ...withProf }));
    const w = warn(r, 'BELOW_PROFILE_MINIMUM');
    expect(w?.severity).toBe('warning');
    expect(w?.message).toMatch(/below the profile minimum 0\.09 mm/);
    expect(w?.message).toMatch(/for this scope/);
    expect(w?.message).toMatch(/profile test-fab/);
    expect(w?.message).toMatch(/UNVERIFIED/);
    expect(w?.message).toMatch(/S-019l/);
    expect(w?.message).toMatch(/5 days old/);
    expect(r.reference.ledgerIds).toContain('S-019l');
    expect(warn(r, 'MEETS_PROFILE_MINIMUM')).toBeUndefined();
  });
  it('a width at or above the minimum "meets" it (info), never a pass', () => {
    for (const w of [90, 300]) {
      const r = okOf(microstrip({ width: um(w), height: um(150), er: dl(4.2), ...withProf }));
      const m = warn(r, 'MEETS_PROFILE_MINIMUM');
      expect(m?.severity).toBe('info');
      expect(m?.message).toMatch(/meets the profile minimum/);
      expect(m?.message).not.toMatch(/\bpass/i);
      expect(warn(r, 'BELOW_PROFILE_MINIMUM')).toBeUndefined();
    }
  });
  it('a solved width is checked too and marked as solved', () => {
    // 50 ohm on 40 um of dielectric needs a width well below 0.09 mm
    const r = okOf(microstrip({ targetZ0: ohm(50), height: um(40), er: dl(4.2), ...withProf }));
    expect(res(r, 'trace width for target Z0').value.si).toBeLessThan(90e-6);
    expect(warn(r, 'BELOW_PROFILE_MINIMUM')?.message).toMatch(/^Trace width \(solved\)/);
  });
  it('stripline strip width', () => {
    const r = okOf(stripline({ width: um(60), spacing: um(300), er: dl(4.2), ...withProf }));
    expect(warn(r, 'BELOW_PROFILE_MINIMUM')?.message).toMatch(/^Strip width/);
  });
  it('diff microstrip and diff stripline: width and spacing are checked separately', () => {
    for (const run of [
      () => diffMicrostrip({ width: um(150), edgeSpacing: um(50), height: um(150), er: dl(4.2), ...withProf }),
      () => diffStripline({ width: um(150), edgeSpacing: um(50), planeSpacing: um(400), er: dl(4.2), ...withProf }),
    ]) {
      const r = okOf(run());
      const below = r.warnings.filter((w) => w.code === 'BELOW_PROFILE_MINIMUM');
      const meets = r.warnings.filter((w) => w.code === 'MEETS_PROFILE_MINIMUM');
      expect(below).toHaveLength(1);
      expect(below[0]?.message).toMatch(/^Edge spacing/);
      expect(meets).toHaveLength(1);
      expect(meets[0]?.message).toMatch(/width/i);
    }
  });
  it('diff solve modes check the solved spacing and the solved width', () => {
    const sp = okOf(diffMicrostrip({ targetZdiff: ohm(100), width: um(200), height: um(210), er: dl(4.4), ...withProf }));
    expect(sp.warnings.some((w) => w.code === 'BELOW_PROFILE_MINIMUM' && /^Edge spacing \(solved\)/.test(w.message))).toBe(true);
    const wd = okOf(diffStripline({ targetZdiff: ohm(100), edgeSpacing: um(200), planeSpacing: um(500), er: dl(4.2), ...withProf }));
    expect(wd.warnings.some((w) => /^Strip width \(solved\)/.test(w.message))).toBe(true);
  });
  it('cpw and cpwg: width and gap', () => {
    for (const run of [
      () => cpw({ width: um(300), gap: um(60), height: um(1600), er: dl(4.2), ...withProf }),
      () => cpwg({ width: um(300), gap: um(60), height: um(400), er: dl(4.2), ...withProf }),
    ]) {
      const r = okOf(run());
      expect(r.warnings.find((w) => w.code === 'BELOW_PROFILE_MINIMUM')?.message).toMatch(/^Gap/);
      expect(warn(r, 'MEETS_PROFILE_MINIMUM')?.message).toMatch(/^Trace width/);
    }
  });
  it('coax has no minimum check even with a profile', () => {
    const r = okOf(coax({ outerDiameter: mm(3.5), innerDiameter: mm(1), er: dl(2.1), ...withProf }));
    expect(r.warnings.some((w) => /PROFILE_MINIMUM/.test(w.code ?? ''))).toBe(false);
  });
  it('no profile, no note', () => {
    const r = okOf(microstrip({ width: um(60), height: um(150), er: dl(4.2) }));
    expect(r.warnings.some((w) => /PROFILE_MINIMUM/.test(w.code ?? ''))).toBe(false);
  });
  it('another layer count or copper weight is not substituted: "not available for this scope"', () => {
    for (const other of [{ ...scope, layerCount: '2' }, { ...scope, copperWeight: fromUnit(2, 'oz/ft2') }, { layerCount: 'multilayer', layerSide: 'outer' }] as ProfileScope[]) {
      const r = okOf(microstrip({ width: um(60), height: um(150), er: dl(4.2), fabProfile: prof, today: '2026-10-18', profileScope: other }));
      const n = warn(r, 'PROFILE_MINIMUM_NOT_AVAILABLE');
      expect(n?.message).toMatch(/not available for this scope/);
      expect(warn(r, 'BELOW_PROFILE_MINIMUM')).toBeUndefined();
    }
  });
  it('an entry that says not published is reported as such', () => {
    const np = profile([scopedMin('traceWidth', 90, { published: false, value: undefined })]);
    const r = okOf(microstrip({ width: um(60), height: um(150), er: dl(4.2), fabProfile: np, today: '2026-10-18', profileScope: scope }));
    expect(warn(r, 'PROFILE_MINIMUM_NOT_PUBLISHED')?.message).toMatch(/not published/);
    expect(r.reference.ledgerIds).toContain('S-019l');
  });
  it('a missing date or scope is said, not guessed; a stale profile is called out of date', () => {
    const noToday = okOf(microstrip({ width: um(60), height: um(150), er: dl(4.2), fabProfile: prof, profileScope: scope }));
    expect(warn(noToday, 'PROFILE_MINIMUM_NOT_CHECKED')?.message).toMatch(/today/);
    const badToday = okOf(microstrip({ width: um(60), height: um(150), er: dl(4.2), fabProfile: prof, today: 'yesterday', profileScope: scope }));
    expect(warn(badToday, 'PROFILE_MINIMUM_NOT_CHECKED')).toBeDefined();
    const noScope = okOf(microstrip({ width: um(60), height: um(150), er: dl(4.2), fabProfile: prof, today: '2026-10-18' }));
    expect(warn(noScope, 'PROFILE_MINIMUM_NOT_CHECKED')?.message).toMatch(/profileScope/);
    const old = profile([scopedMin('traceWidth', 90, { retrievedOn: '2024-01-01' })], { profileDate: '2024-01-02' });
    const r = okOf(microstrip({ width: um(60), height: um(150), er: dl(4.2), fabProfile: old, today: '2026-10-18', profileScope: scope }));
    expect(warn(r, 'BELOW_PROFILE_MINIMUM')?.message).toMatch(/out of date/);
  });
  it('works together with the tolerance envelope and leaves the headline alone', () => {
    const a = okOf(microstrip({ width: um(60), height: um(150), er: dl(4.2), tolerances: { er: dl(0.05) }, ...withProf }));
    const b = okOf(microstrip({ width: um(60), height: um(150), er: dl(4.2) }));
    expect(res(a, Z0).value.si).toBe(res(b, Z0).value.si);
    expect(warn(a, 'BELOW_PROFILE_MINIMUM')).toBeDefined();
    expect(a.confidence.level).toBe(b.confidence.level);
  });
  it('the notes contain no forbidden compliance wording and an invalid profile object is ignored', () => {
    const r = okOf(microstrip({ width: um(60), height: um(150), er: dl(4.2), ...withProf }));
    expect(detectForbidden(JSON.stringify(r.warnings))).toEqual([]);
    const junk = okOf(microstrip({ width: um(60), height: um(150), er: dl(4.2), fabProfile: { nope: 1 } as never, today: '2026-10-18', profileScope: scope }));
    expect(junk.warnings.some((w) => /PROFILE_MINIMUM/.test(w.code ?? ''))).toBe(false);
  });
});

// ---- PCB2-5 -----------------------------------------------------------------------------------------------------------------

describe('PCB2-5: stackup derive messages are plain language with a next step and keep their codes', () => {
  const cu = (name: string) => ({ kind: 'copper' as const, name, thickness: um(35) });
  const d = (name: string, t: number, e = 4.2) => ({ kind: 'dielectric' as const, name, thickness: um(t), er: e, source: 'user' });
  const stack = (layers: unknown[]) => {
    const s = validateStackup({ name: 'x', layers } as never);
    if (!s.ok) throw new Error(JSON.stringify(s.error));
    return s.value;
  };
  it('an offset strip: not centred, the model does not apply, next step; no tolerance jargon', () => {
    const r = deriveStripline(stack([cu('P1'), d('a', 200), cu('S'), d('b', 300), cu('P2')]), 'S');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('OUT_OF_DOMAIN');
    expect(r.error.field).toBe('signalLayer');
    expect(r.error.message).toMatch(/not centred between its two planes \(offset 33\.33 %/);
    expect(r.error.message).toMatch(/symmetric stripline model does not apply/);
    expect(r.error.message).toMatch(/field-solver value/);
    expect(r.error.message).not.toMatch(/tolerance|1e-7/i);
  });
  it('different er above and below: plain wording, code kept', () => {
    const r = deriveStripline(stack([cu('P1'), d('a', 200, 4.6), cu('S'), d('b', 200, 4.4), cu('P2')]), 'S');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('OUT_OF_DOMAIN');
    expect(r.error.message).toMatch(/The dielectric above and below the strip has different er \(4\.6 above, 4\.4 below\)/);
    expect(r.error.message).toMatch(/field-solver value/);
  });
  it('mixed er inside one side (core plus prepreg) also says what to do next', () => {
    const r = deriveStripline(stack([cu('P1'), d('a1', 100, 4.6), d('a2', 100, 4.4), cu('S'), d('b', 200, 4.6), cu('P2')]), 'S');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/have different er/);
    expect(r.error.message).toMatch(/Next step/);
  });
});

// ---- PCB2-8 -----------------------------------------------------------------------------------------------------------------

describe('PCB2-8: status-correct wording for paywalled papers and the mu0 citation', () => {
  it('S-022, S-022a and S-023a are PAYWALLED rows and read as a paper that this project did not read', () => {
    expect(paywalledPaperIds()).toEqual(['S-022', 'S-022a', 'S-023a']);
    expect(paywalledPaperRole('S-022')).toBe('Primary source is a paywalled paper (Hammerstad and Jensen 1980); not read by this project: check it yourself');
    for (const id of paywalledPaperIds()) {
      expect(LEDGER.find((r) => r.id === id)?.status).toBe('PAYWALLED-USER-MUST-VERIFY');
      expect(paywalledPaperRole(id)).toMatch(/^Primary source is a paywalled paper \(.+\); not read by this project: check it yourself$/);
      expect(paywalledPaperRole(id)).not.toMatch(/standard|licensed copy/i);
    }
  });
  it('a row that is not a paywalled paper has no such role', () => {
    expect(paywalledPaperRole('S-020')).toBeUndefined();
    expect(paywalledPaperRole('S-001')).toBeUndefined();
    expect(paywalledPaperRole('not-a-row')).toBeUndefined();
  });
  it('S-013 is described by what the impedance calculators take from it', () => {
    expect(MU0_LEDGER_DISPLAY).toBe('S-013 (mu0 value)');
    expect(LEDGER.find((r) => r.id === 'S-013')?.item).toContain('S-013 (mu0 value)');
    expect(LEDGER.find((r) => r.id === 'S-013')?.status).toBe('VERIFIED');
  });
});
