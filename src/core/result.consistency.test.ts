import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q } from './units';
import type { Quantity } from './units';
import { assertCalcResult, defaultedInputNames } from './result';
import type { CalcInput, CalcResult } from './result';
import { confidenceFactorsFromInputs, provenanceNames, rateConfidence } from './confidence';
import type { AccuracyClass, DataStatus } from './confidence';
import { compute } from './calculators/copper-converter/calc';
import type { Inputs } from './calculators/copper-converter/calc';

// Gate G3-a/b: the confidence helpers, the provenance helpers and assertCalcResult must agree with each other, and
// real calculator output must satisfy the schema. Test-only numbers; nothing here is a physical claim.

const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const um = (n: number): Quantity => fromUnit(n, 'um');

function resultWith(confidence: CalcResult['confidence'], dataStatus: DataStatus, failedCheck: boolean): CalcResult {
  return {
    method: 'test',
    reference: { standard: 'TEST', edition: 'n/a', ledgerIds: [] },
    formula: 'y = x',
    inputs: [{ name: 'x', value: q(1, DIM.LENGTH), source: 'user' }],
    assumptions: [],
    steps: [{ label: 's', expr: 'x', value: q(1, DIM.LENGTH) }],
    results: [{ name: 'y', value: q(1, DIM.LENGTH), role: 'primary', bound: 'nominal' }],
    validityChecks: failedCheck ? [{ name: 'x in range', ok: false, detail: 'out' }] : [{ name: 'x in range', ok: true, detail: 'in' }],
    warnings: [],
    confidence,
    recommendation: 'none',
    dataStatus,
    designValues: [],
  };
}

describe('rateConfidence output always satisfies assertCalcResult (level vs score, reasons, validity checks)', () => {
  const arb = fc.record({
    oor: fc.uniqueArray(fc.constantFrom('width', 'current', 'dT'), { maxLength: 3 }),
    def: fc.uniqueArray(fc.constantFrom('alpha', 'ambient'), { maxLength: 2 }),
    safe: fc.uniqueArray(fc.constantFrom('maxTemp', 'Derating is fixed.'), { maxLength: 2 }),
    acc: fc.constantFrom<AccuracyClass>('exact', 'analytical', 'empirical', 'estimate'),
    ds: fc.constantFrom<DataStatus>('VERIFIED', 'UNVERIFIED', 'PAYWALLED', 'CONFLICT'),
  });
  it('property: a result carrying rateConfidence() and a failed check iff something is out of range is accepted', () => {
    fc.assert(
      fc.property(arb, (a) => {
        const c = rateConfidence({
          outOfRangeInputs: a.oor,
          defaultedAssumptions: a.def,
          safetyRelevantDefaults: a.safe,
          accuracyClass: a.acc,
          dataStatus: a.ds,
        });
        const out = assertCalcResult(resultWith(c, a.ds, a.oor.length > 0));
        expect(out.ok, out.ok ? '' : out.error.join('; ')).toBe(true);
      }),
    );
  });
  it('property: an out-of-range input the calculator forgot to pass is caught (failed check, level not low)', () => {
    const c = rateConfidence({ outOfRangeInputs: [], defaultedAssumptions: [], accuracyClass: 'exact', dataStatus: 'VERIFIED' });
    const out = assertCalcResult(resultWith(c, 'VERIFIED', true));
    expect(out.ok).toBe(false);
    expect(out.ok ? '' : out.error.join(' ').toLowerCase()).toContain('validity check');
  });
});

describe('provenance helpers agree (G3-b)', () => {
  const src = fc.constantFrom<CalcInput['source']>('user', 'default', 'fab-profile', 'preset');
  it('property: defaultedInputNames == defaulted + safety lists of confidenceFactorsFromInputs == provenanceNames default + preset', () => {
    fc.assert(
      fc.property(fc.array(src, { maxLength: 12 }), fc.nat(), (sources, k) => {
        const inputs: CalcInput[] = sources.map((s, i) => ({ name: `n${String(i)}`, value: q(1, DIM.LENGTH), source: s }));
        const eligible = inputs.filter((i) => i.source === 'default' || i.source === 'preset');
        const safety = eligible.filter((_, i) => i % 2 === k % 2).map((i) => i.name);
        const f = confidenceFactorsFromInputs({ inputs, safetyRelevant: safety, accuracyClass: 'exact', dataStatus: 'VERIFIED' });
        const fromFactors = [...f.defaultedAssumptions, ...(f.safetyRelevantDefaults ?? [])].sort();
        const names = defaultedInputNames(inputs).sort();
        const p = provenanceNames(inputs);
        expect(names).toEqual(fromFactors);
        expect([...p.default, ...p.preset].sort()).toEqual(names);
        for (const n of p.fabProfile) expect(names).not.toContain(n);
      }),
    );
  });
  it('a fab-profile input is neither defaulted nor safety-relevant: naming it safety-relevant is rejected', () => {
    const inputs: CalcInput[] = [{ name: 'plating', value: q(1, DIM.LENGTH), source: 'fab-profile' }];
    expect(defaultedInputNames(inputs)).toEqual([]);
    expect(() => confidenceFactorsFromInputs({ inputs, safetyRelevant: ['plating'], accuracyClass: 'exact', dataStatus: 'VERIFIED' })).toThrow();
  });
});

describe('copper converter output satisfies assertCalcResult', () => {
  const cases: [string, Inputs][] = [
    ['outer, 1 oz, nominal', { weight: oz(1), layer: 'outer' }],
    ['inner, 1 oz, nominal', { weight: oz(1), layer: 'inner' }],
    ['inner, 0.5 oz', { weight: oz(0.5), layer: 'inner' }],
    ['outer, 3 oz (not in the S-009 table)', { weight: oz(3), layer: 'outer' }],
    ['outer, 2 oz, other convention', { weight: oz(2), layer: 'outer', convention: 'nominal-1.35mil' }],
    ['outer with plating', { weight: oz(1), layer: 'outer', platingThickness: um(25) }],
    ['thickness, finished basis', { thickness: um(35), layer: 'inner', thicknessBasis: 'finished' }],
    ['thickness, nominal basis', { thickness: um(35), layer: 'outer', thicknessBasis: 'nominal' }],
    ['weight out of range (0.1 oz)', { weight: oz(0.1), layer: 'outer' }],
    ['weight out of range (20 oz)', { weight: oz(20), layer: 'inner' }],
    ['thickness out of range (5 um)', { thickness: um(5), layer: 'inner', thicknessBasis: 'finished' }],
    ['thickness out of range (1000 um)', { thickness: um(1000), layer: 'outer', thicknessBasis: 'measured' }],
  ];
  it.each(cases)('%s', (_name, input) => {
    const out = compute(input);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const chk = assertCalcResult(out.value);
    expect(chk.ok, chk.ok ? '' : chk.error.join('; ')).toBe(true);
    // the failed-check rule is real for this calculator: a failed check implies level low
    if (out.value.validityChecks.some((c) => !c.ok)) expect(out.value.confidence.level).toBe('low');
    // reasons never contain a doubled full stop and never use the retired phrase
    for (const r of out.value.confidence.reasons) {
      expect(r).not.toContain('..');
      expect(r).not.toMatch(/defaulted, not user-supplied/i);
    }
  });
  it('a nominal-basis weight result carries the new wording: "Safety-relevant assumption in effect:" and S-009', () => {
    const out = compute({ weight: oz(1), layer: 'inner' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const line = out.value.confidence.reasons.find((r) => r.startsWith('Safety-relevant assumption in effect: '));
    expect(line).toBeDefined();
    expect(line).toMatch(/nominal copper thickness/i);
    expect(line).toContain('S-009');
    expect(line?.endsWith('.')).toBe(true);
  });
  it('out-of-range reasons carry no "(outside validity range)" suffix', () => {
    const out = compute({ weight: oz(0.1), layer: 'outer' });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.confidence.reasons.join(' | ')).not.toMatch(/outside validity range\)/i);
  });
});
