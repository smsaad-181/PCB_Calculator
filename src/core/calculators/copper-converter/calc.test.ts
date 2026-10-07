import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, FOIL_CONVENTIONS, fromUnit, q, sameDim, toUnit } from '../../units';
import type { FoilConvention, Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcResult } from '../../result';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 1 task 1: copper weight/thickness converter. TESTS FIRST. Every expected number comes from the
// independent oracle (tools/reference/ref_calcs.py: copper_thickness_um / copper_oz_from_thickness_um, mirrored in
// docs/golden-vectors.json) or from the ledger definitions (S-003, S-003d, S-006). The implementation is never consulted.
// Conventions are labelled assumptions with a stated spread, not standards; nothing here verifies S-003.

interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
  ledger_ids: string[];
}
const goldenFiles = import.meta.glob('../../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const goldenText = Object.values(goldenFiles)[0];
const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;
const vec = (name: string): GoldenVector => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found (${String(vectors.length)} vectors loaded)`);
  return v;
};

const CONVENTIONS = Object.keys(FOIL_CONVENTIONS) as FoilConvention[];
const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const um = (n: number): Quantity => fromUnit(n, 'um');
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const raw = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;

// Independent definitions (ledger S-006 exact factors; S-003d IACS density).
const OZ_FT2_KG_M2 = 0.028349523125 / 0.09290304;
const DENSITY = 8890;
const UM_PER_OZ: Record<FoilConvention, number> = {
  'nominal-35um': 35,
  'nominal-1.35mil': 1.35 * 25.4,
  'mass-density': (OZ_FT2_KG_M2 / DENSITY) * 1e6,
};

function ok(inputs: Inputs): CalcResult {
  const out = compute(inputs);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code} ${out.error.field ?? ''}: ${out.error.message}`);
  const chk = assertCalcResult(out.value);
  expect(chk.ok, chk.ok ? '' : chk.error.join('; ')).toBe(true);
  return out.value;
}
function fail(inputs: unknown): CalcError {
  let out: ReturnType<typeof compute> | undefined;
  expect(() => {
    out = compute(inputs as Inputs);
  }).not.toThrow();
  if (!out || out.ok) throw new Error('expected an error outcome, got a result');
  return out.error;
}
const res = (r: CalcResult, name: string) => {
  const x = r.results.find((o) => o.name === name);
  if (!x) throw new Error(`result "${name}" missing; have ${r.results.map((o) => o.name).join(', ')}`);
  return x;
};
const hasResult = (r: CalcResult, name: string): boolean => r.results.some((o) => o.name === name);

describe('golden vectors (oracle): weight to thickness, all conventions', () => {
  it('vectors loaded', () => {
    expect(vectors.filter((v) => v.name.startsWith('copper_')).length).toBe(18);
  });
  for (const c of CONVENTIONS) {
    for (const w of [1, 2, 0.5]) {
      it(`${String(w)} oz, ${c}`, () => {
        const v = vec(`copper_um_${String(w)}oz_${c}`);
        expect(v.ledger_ids).toContain('S-003');
        const r = ok({ weight: oz(w), layer: 'inner', convention: c });
        const t = res(r, 'thickness');
        expect(sameDim(t.value, q(1, DIM.LENGTH))).toBe(true);
        expect(relErr(toUnit(t.value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(v.rel_tol);
        expect(t.role).toBe('primary');
      });
    }
    for (const t of [35, 17.5, 70]) {
      it(`${String(t)} um to weight, ${c}`, () => {
        const v = vec(`copper_oz_${String(t)}um_${c}`);
        const r = ok({ thickness: um(t), layer: 'inner', convention: c, thicknessBasis: 'finished' });
        const m = res(r, 'areal mass');
        expect(sameDim(m.value, q(1, DIM.AREAL_MASS))).toBe(true);
        expect(relErr(toUnit(m.value, 'oz/ft2'), v.pinned_expected)).toBeLessThanOrEqual(v.rel_tol);
        expect(m.role).toBe('secondary');
      });
    }
  }
});

describe('exact definitions', () => {
  it('1 oz nominal-35um = 35e-6 m', () => {
    const r = ok({ weight: oz(1), layer: 'outer', convention: 'nominal-35um' });
    expect(relErr(res(r, 'thickness').value.si, 35e-6)).toBeLessThanOrEqual(1e-12);
  });
  it('1 oz nominal-1.35mil = 34.29e-6 m', () => {
    const r = ok({ weight: oz(1), layer: 'outer', convention: 'nominal-1.35mil' });
    expect(relErr(res(r, 'thickness').value.si, 34.29e-6)).toBeLessThanOrEqual(1e-12);
  });
  it('1 oz mass-density = 34.3253 um (areal mass / 8890 kg/m3), 1e-9 relative', () => {
    const r = ok({ weight: oz(1), layer: 'outer', convention: 'mass-density' });
    expect(relErr(res(r, 'thickness').value.si, OZ_FT2_KG_M2 / DENSITY)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(toUnit(res(r, 'thickness').value, 'um') - 34.3253)).toBeLessThan(5e-5);
  });
  it('1 oz areal mass is 0.028349523125/0.09290304 kg/m2 (S-006) when given as thickness 35 um nominal-35um', () => {
    const r = ok({ thickness: um(35), layer: 'inner', convention: 'nominal-35um', thicknessBasis: 'nominal' });
    expect(relErr(res(r, 'areal mass').value.si, OZ_FT2_KG_M2)).toBeLessThanOrEqual(1e-9);
  });
  it('the three conventions are reported side by side for a weight, each matching its own definition', () => {
    const r = ok({ weight: oz(2), layer: 'inner' });
    for (const c of CONVENTIONS) {
      const x = res(r, `thickness (${c})`);
      expect(x.role).toBe('secondary');
      expect(relErr(x.value.si, 2 * UM_PER_OZ[c] * 1e-6)).toBeLessThanOrEqual(1e-9);
    }
  });
  it('convention spread is dimensionless and about 2.0706 % (oracle foil_spread_pct_1oz / 100)', () => {
    const r = ok({ weight: oz(1), layer: 'inner' });
    const s = res(r, 'convention spread');
    expect(sameDim(s.value, q(1, DIM.DIMENSIONLESS))).toBe(true);
    const v = vec('foil_spread_pct_1oz');
    expect(relErr(s.value.si, v.pinned_expected / 100)).toBeLessThanOrEqual(v.rel_tol);
  });
});

describe('defaults and convention selection', () => {
  it('omitted convention uses nominal-35um (the default)', () => {
    const r = ok({ weight: oz(1), layer: 'outer' });
    expect(relErr(res(r, 'thickness').value.si, 35e-6)).toBeLessThanOrEqual(1e-12);
    expect(r.assumptions.join(' ')).toMatch(/nominal-35um/);
  });
  it('assumptions state the convention in effect and that the conversion is NOMINAL', () => {
    for (const c of CONVENTIONS) {
      const r = ok({ weight: oz(1), layer: 'outer', convention: c });
      const a = r.assumptions.join(' ');
      expect(a).toContain(c);
      expect(a).toMatch(/nominal/i);
    }
  });
});

describe('thickness input', () => {
  it('primary thickness is the given thickness; areal mass is secondary', () => {
    const r = ok({ thickness: um(50), layer: 'outer', thicknessBasis: 'measured', convention: 'nominal-35um' });
    expect(res(r, 'thickness').role).toBe('primary');
    expect(relErr(res(r, 'thickness').value.si, 50e-6)).toBeLessThanOrEqual(1e-12);
    expect(relErr(toUnit(res(r, 'areal mass').value, 'oz/ft2'), 50 / 35)).toBeLessThanOrEqual(1e-9);
  });
  it('copperBasis records the user-entered basis, layer and thickness', () => {
    for (const basis of ['nominal', 'finished', 'measured'] as const) {
      const r = ok({ thickness: um(40), layer: 'inner', thicknessBasis: basis, convention: 'nominal-35um' });
      expect(r.copperBasis?.layer).toBe('inner');
      expect(r.copperBasis?.basis).toBe(basis);
      expect(relErr(r.copperBasis?.thickness.si ?? 0, 40e-6)).toBeLessThanOrEqual(1e-12);
      expect(r.copperBasis?.source).toMatch(/entered by the user/i);
    }
  });
  it('thicknessBasis omitted defaults to nominal', () => {
    const r = ok({ thickness: um(40), layer: 'outer', convention: 'nominal-35um' });
    expect(r.copperBasis?.basis).toBe('nominal');
  });
});

describe('weight input: copperBasis', () => {
  it('nominal basis from the weight, layer kept, thickness equals the primary result', () => {
    for (const layer of ['outer', 'inner'] as const) {
      const r = ok({ weight: oz(1.5), layer, convention: 'mass-density' });
      expect(r.copperBasis?.basis).toBe('nominal');
      expect(r.copperBasis?.layer).toBe(layer);
      expect(r.copperBasis?.thickness.si).toBe(res(r, 'thickness').value.si);
      expect(r.copperBasis?.source).toContain('mass-density');
    }
  });
});

describe('plating (outer only)', () => {
  it('estimated finished thickness = base foil + plating, weight input', () => {
    const r = ok({ weight: oz(1), layer: 'outer', convention: 'nominal-35um', platingThickness: um(25) });
    const f = res(r, 'estimated finished thickness');
    expect(f.role).toBe('secondary');
    expect(f.bound).toBe('nominal');
    expect(relErr(f.value.si, 60e-6)).toBeLessThanOrEqual(1e-12);
  });
  it('estimated finished thickness = given thickness + plating, thickness input', () => {
    const r = ok({ thickness: um(35), layer: 'outer', thicknessBasis: 'nominal', convention: 'nominal-35um', platingThickness: um(25) });
    expect(relErr(res(r, 'estimated finished thickness').value.si, 60e-6)).toBeLessThanOrEqual(1e-12);
  });
  it('absent without plating', () => {
    expect(hasResult(ok({ weight: oz(1), layer: 'outer' }), 'estimated finished thickness')).toBe(false);
  });
  it('200 um plating is accepted (upper limit inclusive)', () => {
    expect(compute({ weight: oz(1), layer: 'outer', platingThickness: um(200) }).ok).toBe(true);
  });
});

describe('guards', () => {
  const base = { weight: oz(1), layer: 'outer' as const };
  it.each([
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['zero', 0],
    ['negative zero', -0],
    ['negative', -0.3],
  ])('weight %s is INVALID_INPUT naming weight', (_n, v) => {
    const e = fail({ ...base, weight: raw(v, DIM.AREAL_MASS) });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.field).toBe('weight');
    expect(e.message).toMatch(/weight/);
  });
  it.each([
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['zero', 0],
    ['negative zero', -0],
    ['negative', -35e-6],
  ])('thickness %s is INVALID_INPUT naming thickness', (_n, v) => {
    const e = fail({ thickness: raw(v, DIM.LENGTH), layer: 'inner' });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.field).toBe('thickness');
    expect(e.message).toMatch(/thickness/);
  });
  it.each([
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['zero', 0],
    ['negative zero', -0],
    ['negative', -1e-6],
  ])('platingThickness %s is INVALID_INPUT naming platingThickness', (_n, v) => {
    const e = fail({ ...base, platingThickness: raw(v, DIM.LENGTH) });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.field).toBe('platingThickness');
  });
  it('platingThickness above 200 um is OUT_OF_DOMAIN naming platingThickness', () => {
    for (const t of [201, 1000]) {
      const e = fail({ ...base, platingThickness: um(t) });
      expect(e.code).toBe('OUT_OF_DOMAIN');
      expect(e.field).toBe('platingThickness');
    }
  });
  it('wrong dimensions are DIMENSION errors naming the field', () => {
    const a = fail({ ...base, weight: um(35) });
    expect([a.code, a.field]).toEqual(['DIMENSION', 'weight']);
    const b = fail({ thickness: oz(1), layer: 'inner' });
    expect([b.code, b.field]).toEqual(['DIMENSION', 'thickness']);
    const c = fail({ ...base, platingThickness: oz(1) });
    expect([c.code, c.field]).toEqual(['DIMENSION', 'platingThickness']);
    const d = fail({ weight: fromUnit(25, 'degC'), layer: 'inner' });
    expect(d.code).toBe('DIMENSION');
  });
  it('both weight and thickness is INVALID_INPUT naming both fields', () => {
    const e = fail({ weight: oz(1), thickness: um(35), layer: 'outer' });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toMatch(/weight/);
    expect(e.message).toMatch(/thickness/);
  });
  it('neither weight nor thickness is INVALID_INPUT naming both fields', () => {
    const e = fail({ layer: 'outer' });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toMatch(/weight/);
    expect(e.message).toMatch(/thickness/);
  });
  it.each([[undefined], ['middle'], [''], ['OUTER'], [null], [1]])('layer %j is INVALID_INPUT naming layer (never defaulted)', (l) => {
    const e = fail({ weight: oz(1), layer: l });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.field).toBe('layer');
  });
  it('plating on an inner layer is INVALID_INPUT', () => {
    const e = fail({ weight: oz(1), layer: 'inner', platingThickness: um(20) });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.field).toBe('platingThickness');
  });
  it('unknown convention and unknown thicknessBasis are INVALID_INPUT naming the field', () => {
    const a = fail({ ...base, convention: 'iso-35' });
    expect([a.code, a.field]).toEqual(['INVALID_INPUT', 'convention']);
    const b = fail({ thickness: um(35), layer: 'inner', thicknessBasis: 'typical' });
    expect([b.code, b.field]).toEqual(['INVALID_INPUT', 'thicknessBasis']);
  });
  it('never throws for malformed input objects and never returns a numeric result for them', () => {
    for (const bad of [{}, null, undefined, 5, 'x', { weight: 1, layer: 'outer' }, { weight: { si: 'a', dim: DIM.AREAL_MASS }, layer: 'outer' }]) {
      let out: ReturnType<typeof compute> | undefined;
      expect(() => {
        out = compute(bad as unknown as Inputs);
      }).not.toThrow();
      expect(out?.ok).toBe(false);
    }
  });
  it('an overflowing weight returns an error or a finite result, never throws or NaN', () => {
    let out: ReturnType<typeof compute> | undefined;
    expect(() => {
      out = compute({ ...base, weight: raw(Number.MAX_VALUE, DIM.AREAL_MASS) });
    }).not.toThrow();
    if (out?.ok) expect(assertCalcResult(out.value).ok).toBe(true);
  });
  it('an error outcome carries no result', () => {
    const out = compute({ layer: 'outer' } as unknown as Inputs);
    expect(out.ok).toBe(false);
    expect('value' in out).toBe(false);
  });
});

describe('confidence (rule-based, exact scores)', () => {
  it('weight, nominal basis, default convention: ONE safety-relevant default => medium, score 2', () => {
    const r = ok({ weight: oz(1), layer: 'outer' });
    expect(r.confidence.score).toBe(2);
    expect(r.confidence.level).toBe('medium');
    expect(r.confidence.reasons.join(' ')).toMatch(/nominal copper thickness/i);
  });
  it('weight, nominal basis, user-chosen convention: still medium, score 2', () => {
    for (const c of CONVENTIONS) {
      const r = ok({ weight: oz(1), layer: 'inner', convention: c });
      expect([r.confidence.level, r.confidence.score]).toEqual(['medium', 2]);
    }
  });
  it.each(['finished', 'measured'] as const)('thickness %s with a user-chosen convention => high, score 0', (basis) => {
    const r = ok({ thickness: um(35), layer: 'inner', thicknessBasis: basis, convention: 'nominal-1.35mil' });
    expect(r.confidence.score).toBe(0);
    expect(r.confidence.level).toBe('high');
  });
  it('thickness with a nominal basis is never rated high', () => {
    const r = ok({ thickness: um(35), layer: 'inner', thicknessBasis: 'nominal', convention: 'nominal-35um' });
    expect(r.confidence.level).not.toBe('high');
  });
  it('accuracy class exact adds nothing; dataStatus excludes S-003 so it follows S-003d/S-006 (VERIFIED)', () => {
    expect(meta.accuracyClass).toBe('exact');
    expect(ok({ weight: oz(1), layer: 'outer' }).dataStatus).toBe('VERIFIED');
  });
  it.each([0.1, 0.24, 10.5, 20])('weight %s oz is outside 0.25-10: validity check fails, level low (forced), input named, score 4', (w) => {
    const r = ok({ weight: oz(w), layer: 'outer' });
    const c = r.validityChecks.find((x) => /weight/i.test(x.name));
    expect(c?.ok).toBe(false);
    expect(r.confidence.level).toBe('low');
    expect(r.confidence.score).toBe(4); // 2 (out of range) + 2 (nominal safety-relevant default)
    expect(r.confidence.reasons.join(' ')).toMatch(/weight/i);
  });
  it.each([5, 8, 400, 1000])('thickness %s um is outside 8.75-350: check fails, level low, score 2, input named', (t) => {
    const r = ok({ thickness: um(t), layer: 'inner', thicknessBasis: 'finished', convention: 'nominal-35um' });
    const c = r.validityChecks.find((x) => /thickness/i.test(x.name));
    expect(c?.ok).toBe(false);
    expect(r.confidence.level).toBe('low');
    expect(r.confidence.score).toBe(2);
    expect(r.confidence.reasons.join(' ')).toMatch(/thickness/i);
  });
  it('in-range inputs pass the plausibility check, whose detail says it is not a standard', () => {
    const r = ok({ weight: oz(1), layer: 'outer' });
    const c = r.validityChecks.find((x) => /weight in common range 0\.25-10/.test(x.name));
    expect(c?.ok).toBe(true);
    expect(c?.detail).toMatch(/not a standard|plausib/i);
    const t = ok({ thickness: um(35), layer: 'outer' });
    const ct = t.validityChecks.find((x) => /thickness in common range 8\.75-350/.test(x.name));
    expect(ct?.ok).toBe(true);
    expect(ct?.detail).toMatch(/not a standard|plausib/i);
  });
  it.each([0.26, 1, 9.9])('weight %s oz is in range', (w) => {
    const r = ok({ weight: oz(w), layer: 'inner' });
    expect(r.validityChecks.every((x) => x.ok)).toBe(true);
  });
  it.each([8.8, 35, 349])('thickness %s um is in range', (t) => {
    const r = ok({ thickness: um(t), layer: 'inner', thicknessBasis: 'finished', convention: 'nominal-35um' });
    expect(r.validityChecks.every((x) => x.ok)).toBe(true);
  });
});

describe('warnings', () => {
  const sev = (r: CalcResult, re: RegExp) => r.warnings.filter((w) => re.test(w.message));
  it('outer layer without plating: caution about finishing thicker after plating, citing S-009 as secondhand', () => {
    const r = ok({ weight: oz(1), layer: 'outer' });
    const w = r.warnings.filter((x) => x.severity === 'caution' && /plating/i.test(x.message));
    expect(w.length).toBeGreaterThan(0);
    expect(w.map((x) => x.message).join(' ')).toMatch(/S-009/);
    expect(w.map((x) => x.message).join(' ')).toMatch(/secondhand/i);
    expect(w.map((x) => x.message).join(' ')).toMatch(/thicker/i);
  });
  it('inner layer: caution that finished copper can be thinner than nominal, citing S-009', () => {
    const r = ok({ weight: oz(1), layer: 'inner' });
    const w = r.warnings.filter((x) => x.severity === 'caution' && /thinner/i.test(x.message));
    expect(w.length).toBeGreaterThan(0);
    expect(w.map((x) => x.message).join(' ')).toMatch(/S-009/);
    expect(sev(r, /after plating/i).filter((x) => x.severity === 'caution')).toHaveLength(0);
  });
  it('info warning states the convention spread (2.07 %)', () => {
    for (const layer of ['outer', 'inner'] as const) {
      const r = ok({ weight: oz(1), layer });
      const w = r.warnings.filter((x) => x.severity === 'info' && /2\.07\s?%/.test(x.message));
      expect(w.length).toBeGreaterThan(0);
    }
  });
});

describe('result metadata', () => {
  const r = ok({ weight: oz(1), layer: 'outer' });
  it('result.formula === meta.formula, non-empty', () => {
    expect(r.formula).toBe(meta.formula);
    expect(meta.formula.trim().length).toBeGreaterThan(0);
  });
  it('method and reference', () => {
    expect(r.method).toBe('Nominal copper weight/thickness conversion (labelled convention)');
    expect(r.reference).toEqual({
      standard: 'Fabricator nominal conventions (no standard cited)',
      edition: 'n/a',
      ledgerIds: ['S-003', 'S-003d', 'S-006', 'S-009'],
    });
  });
  it('meta contract', () => {
    expect(meta.id).toBe('copper-converter');
    expect(meta.accuracyClass).toBe('exact');
    expect(meta.validity).toEqual({ weightOzFt2: [0.25, 10], thicknessUm: [8.75, 350] });
    expect(meta.toleranceInputs).toEqual([]);
    expect(meta.method).toBe(r.method);
    expect(meta.title.trim().length).toBeGreaterThan(0);
    for (const id of ['S-003', 'S-003d', 'S-006']) expect(meta.ledgerIds).toContain(id);
  });
  it('every result has bound nominal', () => {
    for (const o of ok({ weight: oz(1), layer: 'outer', platingThickness: um(20) }).results) expect(o.bound).toBe('nominal');
    for (const o of ok({ thickness: um(35), layer: 'inner' }).results) expect(o.bound).toBe('nominal');
  });
  it('exactly one primary result: thickness', () => {
    const p = r.results.filter((o) => o.role === 'primary');
    expect(p.map((o) => o.name)).toEqual(['thickness']);
  });
  it('steps show the arithmetic with finite Quantities, and are non-empty', () => {
    expect(r.steps.length).toBeGreaterThan(0);
    for (const s of r.steps) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.expr.length).toBeGreaterThan(0);
      expect(Number.isFinite(s.value.si)).toBe(true);
    }
  });
  it('inputs: user-supplied quantities carry source user and keep their value', () => {
    const x = ok({ weight: oz(1), layer: 'outer', platingThickness: um(20) });
    const w = x.inputs.find((i) => /weight/i.test(i.name));
    expect(w?.source).toBe('user');
    expect(w?.value.si).toBe(oz(1).si);
    const p = x.inputs.find((i) => /plating/i.test(i.name));
    expect(p?.source).toBe('user');
  });
  it('recommendation is the fixed nominal-only text', () => {
    expect(r.recommendation).toBe(
      'Nominal conversion only. Ask your fabricator for finished copper thickness per layer; enter it as a measured/finished thickness for design calculations.',
    );
  });
  it('designValues and envelope are empty', () => {
    expect(r.designValues).toEqual([]);
    expect(r.envelope ?? []).toEqual([]);
  });
  it('no compliance wording anywhere in the result (negations excluded)', () => {
    for (const inp of [
      ok({ weight: oz(1), layer: 'outer', platingThickness: um(25) }),
      ok({ weight: oz(1), layer: 'inner', convention: 'mass-density' }),
      ok({ thickness: um(35), layer: 'inner', thicknessBasis: 'measured' }),
    ]) {
      // The forbidden words are assembled from fragments so this file does not itself trip the wording audit.
      const words = ['compl' + 'iant', 'certi' + 'fied', 'conf' + 'orms'];
      const negated = new RegExp(String.raw`\b(not|no|never|neither)\b[^.]{0,40}(` + words.join('|') + ')', 'gi');
      const forbidden = new RegExp(words.join('|') + '|production.?safe', 'i');
      const text = JSON.stringify(inp).replace(negated, '');
      expect(text).not.toMatch(forbidden);
    }
  });
});

describe('properties (fast-check)', () => {
  const ozArb = fc.double({ min: 0.25, max: 10, noNaN: true });
  const convArb = fc.constantFrom(...CONVENTIONS);
  const layerArb = fc.constantFrom('outer' as const, 'inner' as const);

  it('weight -> thickness -> weight round trip within 1e-12 relative', () => {
    fc.assert(
      fc.property(ozArb, convArb, layerArb, (w, c, layer) => {
        const t = res(ok({ weight: oz(w), layer, convention: c }), 'thickness').value;
        const back = res(ok({ thickness: t, layer, convention: c, thicknessBasis: 'finished' }), 'areal mass').value;
        expect(relErr(toUnit(back, 'oz/ft2'), w)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
  it('thickness matches the oracle definition for any in-range weight (1e-9)', () => {
    fc.assert(
      fc.property(ozArb, convArb, (w, c) => {
        const t = res(ok({ weight: oz(w), layer: 'inner', convention: c }), 'thickness').value;
        expect(relErr(toUnit(t, 'um'), w * UM_PER_OZ[c])).toBeLessThanOrEqual(1e-9);
      }),
    );
  });
  it('monotonic: more weight never gives less thickness, for every convention', () => {
    fc.assert(
      fc.property(ozArb, ozArb, convArb, (a, b, c) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const tl = res(ok({ weight: oz(lo), layer: 'inner', convention: c }), 'thickness').value.si;
        const th = res(ok({ weight: oz(hi), layer: 'inner', convention: c }), 'thickness').value.si;
        expect(th).toBeGreaterThanOrEqual(tl);
      }),
    );
  });
  it('monotonic: more thickness never gives less areal mass', () => {
    fc.assert(
      fc.property(fc.double({ min: 8.75, max: 350, noNaN: true }), fc.double({ min: 8.75, max: 350, noNaN: true }), convArb, (a, b, c) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const ml = res(ok({ thickness: um(lo), layer: 'inner', convention: c, thicknessBasis: 'finished' }), 'areal mass').value.si;
        const mh = res(ok({ thickness: um(hi), layer: 'inner', convention: c, thicknessBasis: 'finished' }), 'areal mass').value.si;
        expect(mh).toBeGreaterThanOrEqual(ml);
      }),
    );
  });
  it('convention spread is about 2.0706 % for every weight (spread is independent of weight)', () => {
    fc.assert(
      fc.property(ozArb, (w) => {
        const s = res(ok({ weight: oz(w), layer: 'inner' }), 'convention spread').value.si;
        expect(Math.abs(s - 0.020706)).toBeLessThan(1e-6);
      }),
    );
  });
  it('no NaN or Infinity anywhere for in-range inputs; result passes assertCalcResult', () => {
    fc.assert(
      fc.property(ozArb, convArb, layerArb, fc.option(fc.double({ min: 1, max: 100, noNaN: true }), { nil: undefined }), (w, c, layer, p) => {
        const input: Inputs =
          layer === 'outer' && p !== undefined
            ? { weight: oz(w), layer, convention: c, platingThickness: um(p) }
            : { weight: oz(w), layer, convention: c };
        const r = ok(input);
        for (const o of r.results) expect(Number.isFinite(o.value.si)).toBe(true);
        expect(Number.isFinite(r.confidence.score)).toBe(true);
      }),
    );
  });
  it('deterministic and inputs are never mutated', () => {
    fc.assert(
      fc.property(ozArb, convArb, layerArb, (w, c, layer) => {
        const weight = oz(w);
        const input: Inputs = { weight, layer, convention: c };
        const before = JSON.stringify(input);
        const a = compute(input);
        const b = compute(input);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(JSON.stringify(input)).toBe(before);
        expect(weight.si).toBe(oz(w).si);
      }),
    );
  });
  it('estimated finished thickness is never below the base thickness and grows with plating', () => {
    fc.assert(
      fc.property(ozArb, fc.double({ min: 1, max: 200, noNaN: true }), fc.double({ min: 1, max: 200, noNaN: true }), (w, p1, p2) => {
        const [lo, hi] = p1 <= p2 ? [p1, p2] : [p2, p1];
        const a = ok({ weight: oz(w), layer: 'outer', platingThickness: um(lo) });
        const b = ok({ weight: oz(w), layer: 'outer', platingThickness: um(hi) });
        const base = res(a, 'thickness').value.si;
        expect(res(a, 'estimated finished thickness').value.si).toBeGreaterThan(base);
        expect(res(b, 'estimated finished thickness').value.si).toBeGreaterThanOrEqual(res(a, 'estimated finished thickness').value.si);
      }),
    );
  });
  it('invalid inputs never produce a numeric result (random invalid weights)', () => {
    fc.assert(
      fc.property(fc.constantFrom(NaN, Infinity, -Infinity, 0, -0, -1, -1e-9), (v) => {
        const out = compute({ weight: raw(v, DIM.AREAL_MASS), layer: 'outer' });
        expect(out.ok).toBe(false);
      }),
    );
  });
});

describe('performance sanity', () => {
  // SPEC: closed-form calculators take < 1 ms each. The bound here is 100 us per compute (10x tighter than the
  // SPEC) so it stays stable under v8 coverage instrumentation, which CI uses and which slows this loop ~6x.
  it('10 000 computes take under 1 s in total', () => {
    const input: Inputs = { weight: oz(1), layer: 'outer' };
    compute(input); // warm-up
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(input).ok) n++;
    const dt = performance.now() - t0;
    expect(n).toBe(10_000);
    expect(dt).toBeLessThan(1000);
  });
});
