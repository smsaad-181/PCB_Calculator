import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { SHIPPED_TABLES, makeTableSet, parseSpacingTable } from '../../spacing/tables';
import type { SpacingTableSet, TableId } from '../../spacing/tables';
import { PRODUCT_STANDARD_BANNER } from '../../spacing/gating';
import { T5_PRINTED_PD1_GROUP_I, T7_COATING_TYPE1, T7_REINFORCED_CREEPAGE, T7_SCOPE_FREQUENCY_HZ, rawSynthetic, synthSet, synthTable, t5 } from '../../spacing/synthetic-tables.testutil';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 3 core: gated creepage calculator. TESTS FIRST.
// SYNTHETIC TEST DATA, not from any standard: tables come from synthetic-tables.testutil.ts (fake numbers). The expected
// values are recomputed here from the fake formulas, never from the implementation. The shipped tables are EMPTY.

const ED = 'SYNTH-ED-1';
const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const M = (n: number): Quantity => q(n, DIM.LENGTH);
const MM = (n: number): Quantity => q(n * 1e-3, DIM.LENGTH);
const HZ = (n: number): Quantity => q(n, DIM.FREQUENCY);
const raw = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;
const mm = (n: number): number => n * 1e-3;

function base(over: Partial<Inputs> = {}, tables: SpacingTableSet = synthSet()): Inputs {
  return {
    tables,
    edition: ED,
    insulationType: 'basic',
    workingVoltageRms: V(150),
    pollutionDegree: 2,
    materialGroup: 'I',
    surface: 'other',
    frequency: HZ(50),
    associatedClearance: MM(5),
    ...over,
  };
}
function ok(i: Inputs): CalcResult {
  const out = compute(i);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code}: ${out.error.message}`);
  const chk = assertCalcResult(out.value);
  if (!chk.ok) throw new Error(`schema: ${chk.error.join('; ')}`);
  expect(out.value.confidence.level).not.toBe('high');
  expect(out.value.dataStatus).toBe('PAYWALLED');
  return out.value;
}
const fails = (i: unknown) => {
  const out = compute(i as Inputs);
  expect(out.ok).toBe(false);
  if (out.ok) throw new Error('unreachable');
  return out.error;
};
const primary = (r: CalcResult): number => (r.results.find((x) => x.role === 'primary') as { value: Quantity }).value.si;

describe('creepage: numbers from synthetic tables', () => {
  it('T5 lookup by rms voltage (next higher row), pollution degree, material group', () => {
    const r = ok(base());
    expect(primary(r)).toBeCloseTo(mm(t5(2, 2, 1)), 12); // 13 mm (fake)
    expect(primary(ok(base({ workingVoltageRms: V(200) })))).toBeCloseTo(mm(t5(2, 2, 1)), 12);
    expect(primary(ok(base({ workingVoltageRms: V(50) })))).toBeCloseTo(mm(t5(1, 2, 1)), 12);
    expect(primary(ok(base({ pollutionDegree: 3, materialGroup: 'II' })))).toBeCloseTo(mm(t5(2, 3, 2)), 12);
    expect(r.results.find((x) => x.role === 'primary')?.bound).toBe('min-requirement');
  });
  it('a printed-wiring surface selects its own column', () => {
    const r = ok(base({ pollutionDegree: 1, surface: 'printed-wiring', associatedClearance: MM(0.5) }));
    expect(primary(r)).toBeCloseTo(mm(T5_PRINTED_PD1_GROUP_I), 12);
    expect(fails(base({ pollutionDegree: 2, surface: 'printed-wiring' })).message).toContain('T5');
  });
  it('a CTI maps to a material group through the T6 definitions only', () => {
    const viaGroup = primary(ok(base({ materialGroup: 'I' })));
    const viaCti = ok(base({ materialGroup: undefined as never, cti: V(95) }));
    expect(primary(viaCti)).toBeCloseTo(viaGroup, 12);
    expect(viaCti.assumptions.join(' ')).toMatch(/material group I from CTI/i);
    expect(primary(ok(base({ materialGroup: undefined as never, cti: V(55), workingVoltageRms: V(150) })))).toBeCloseTo(mm(t5(2, 2, 2)), 12);
    const gap = fails(base({ materialGroup: undefined as never, cti: raw(89.5, DIM.VOLTAGE) }));
    expect(gap.gate).toBe('INSUFFICIENT_DATA');
    const noT6 = fails(base({ materialGroup: undefined as never, cti: V(95) }, synthSet(['T5'])));
    expect(noT6.message).toContain('INSUFFICIENT DATA: table T6 material groups by CTI is empty (enter values from your licensed copy)');
  });
  it('a group that T5 has no column for (IIIa) is refused', () => {
    const e = fails(base({ materialGroup: 'IIIa' }));
    expect(e.gate).toBe('INSUFFICIENT_DATA');
  });
  it('material group and CTI together are refused', () => {
    expect(fails(base({ cti: V(95) })).code).toBe('INVALID_INPUT');
  });
  it('a declared waveform supplies the rms voltage', () => {
    const w = ok(base({ workingVoltageRms: undefined as never, waveform: { shape: 'sine', basis: 'peak', value: V(150 * Math.SQRT2) } }));
    expect(primary(w)).toBeCloseTo(primary(ok(base())), 12);
    expect(w.inputs.some((x) => x.name === 'working voltage (rms)' && Math.abs(x.value.si - 150) < 1e-9)).toBe(true);
  });
  it('a peak voltage alone is not an rms voltage: it counts as missing', () => {
    const i = base() as unknown as Record<string, unknown>;
    delete i['workingVoltageRms'];
    expect(fails({ ...i, workingVoltagePeak: V(212) }).missing).toEqual(['workingVoltageRms']);
  });
  it('reinforced insulation applies only the T7 multiplier record', () => {
    const r = ok(base({ insulationType: 'reinforced', associatedClearance: MM(1) }));
    expect(primary(r)).toBeCloseTo(mm(t5(2, 2, 1)) * T7_REINFORCED_CREEPAGE, 12);
    const step = r.steps.find((s) => s.label.startsWith('Reinforced multiplier'));
    expect(step?.value.si).toBe(T7_REINFORCED_CREEPAGE);
    expect(T7_REINFORCED_CREEPAGE).toBeGreaterThan(1);
    expect(r.steps.map((s) => s.label)).toContain('Creepage after the reinforced multiplier');
    expect(ok(base({ associatedClearance: MM(1) })).steps.some((s) => s.label.includes('multiplier'))).toBe(false);
    const e = fails(base({ insulationType: 'reinforced' }, synthSet(['T5'])));
    expect(e.message).toBe('INSUFFICIENT DATA: table T7 rule records is empty (enter values from your licensed copy)');
    const raw7 = rawSynthetic('T7');
    const rules = (raw7['rules'] as Record<string, unknown>[]).filter((x) => x['rule'] !== 'reinforced-creepage-multiplier');
    const p = parseSpacingTable({ ...raw7, rules });
    if (!p.ok) throw new Error(p.error.join('; '));
    const set = makeTableSet({ T5: synthTable('T5'), T7: p.value });
    if (!set.ok) throw new Error(set.error.join('; '));
    expect(fails(base({ insulationType: 'reinforced' }, set.value)).message).toContain('rule "reinforced-creepage-multiplier"');
  });
  it('functional and supplementary use the basic lookup, stated as an assumption', () => {
    const b = primary(ok(base()));
    expect(primary(ok(base({ insulationType: 'functional' })))).toBe(b);
    expect(primary(ok(base({ insulationType: 'supplementary' })))).toBe(b);
  });
  it('coating credit only with a VERIFIED T7 rule AND the user selecting it; solder mask never', () => {
    const plain = primary(ok(base()));
    const unv = ok(base({ coatingCredit: 'type1' }));
    expect(primary(unv)).toBeCloseTo(plain, 12);
    expect(unv.warnings.some((w) => w.code === 'COATING_CREDIT_NOT_APPLIED')).toBe(true);
    const verified = synthSet(undefined, { verified: true });
    expect(primary(ok(base({}, verified)))).toBeCloseTo(plain, 12);
    expect(primary(ok(base({ coatingCredit: 'type1', associatedClearance: MM(1) }, verified)))).toBeCloseTo(plain * T7_COATING_TYPE1, 12);
    const sm = ok(base({ soldermask: true }, verified));
    expect(primary(sm)).toBeCloseTo(plain, 12);
    expect(sm.warnings.some((w) => w.code === 'SOLDERMASK_NOT_COATING')).toBe(true);
  });
});

describe('creepage: invariants', () => {
  it('creepage below the associated clearance is raised to it and the reason is stated', () => {
    const r = ok(base({ associatedClearance: MM(20) }));
    expect(primary(r)).toBeCloseTo(mm(20), 12);
    const w = r.warnings.find((x) => x.code === 'CREEPAGE_RAISED_TO_CLEARANCE');
    expect(w?.message).toMatch(/not less than the associated clearance/);
    expect(r.steps.some((s) => /raised/i.test(s.label))).toBe(true);
    const plain = ok(base({ associatedClearance: MM(5) }));
    expect(plain.warnings.some((x) => x.code === 'CREEPAGE_RAISED_TO_CLEARANCE')).toBe(false);
    expect(r.validityChecks.some((c) => c.name === 'creepage not less than the associated clearance' && c.ok)).toBe(true);
  });
  it('property: creepage is never below the associated clearance', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 100, noNaN: true }), fc.integer({ min: 1, max: 300 }), (clr, v) => {
        const out = compute(base({ associatedClearance: MM(clr), workingVoltageRms: V(v) }));
        return out.ok && primary(out.value) >= mm(clr) * (1 - 1e-12);
      }),
    );
  });
  it('property: altitude never changes creepage', () => {
    fc.assert(
      fc.property(fc.double({ min: -400, max: 90000, noNaN: true }), (alt) => {
        const a = compute(base());
        const b = compute(base({ altitude: M(alt) }));
        if (!a.ok || !b.ok) return false;
        return JSON.stringify(a.value.results) === JSON.stringify(b.value.results) && JSON.stringify(a.value.steps) === JSON.stringify(b.value.steps);
      }),
    );
    const r = ok(base({ altitude: M(3000) }));
    expect(r.warnings.some((w) => w.code === 'ALTITUDE_NOT_USED' && /altitude does not change creepage/.test(w.message))).toBe(true);
    expect(ok(base()).warnings.some((w) => w.code === 'ALTITUDE_NOT_USED')).toBe(false);
  });
  it('property: a higher rms voltage never lowers the creepage', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300 }), fc.integer({ min: 1, max: 300 }), (a, b) => {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const x = compute(base({ workingVoltageRms: V(lo) }));
        const y = compute(base({ workingVoltageRms: V(hi) }));
        return x.ok && y.ok && primary(x.value) <= primary(y.value) + 1e-15;
      }),
    );
  });
  it('pollution degree and the material group or CTI are required', () => {
    const i = base() as unknown as Record<string, unknown>;
    delete i['materialGroup'];
    expect(fails(i).missing).toEqual(['materialGroup OR cti']);
    delete i['pollutionDegree'];
    expect(fails(i).missing).toEqual(['pollutionDegree', 'materialGroup OR cti']);
  });
});

describe('creepage: gating', () => {
  const REQUIRED = ['edition', 'insulationType', 'workingVoltageRms', 'pollutionDegree', 'materialGroup', 'surface', 'frequency', 'associatedClearance'];
  const listed = (n: string): string => (n === 'materialGroup' ? 'materialGroup OR cti' : n);
  it.each(REQUIRED)('missing %s blocks the output and is listed', (field) => {
    const i = { ...base() } as Record<string, unknown>;
    delete i[field];
    const e = fails(i);
    expect(e.gate).toBe('INSUFFICIENT_INPUTS');
    expect(e.message).toMatch(/^Insufficient inputs: /);
    expect(e.missing).toContain(listed(field));
  });
  it('property: removing any non-empty subset of the mandatory inputs always blocks the output', () => {
    fc.assert(
      fc.property(fc.subarray(REQUIRED, { minLength: 1 }), (drop) => {
        const i = { ...base() } as Record<string, unknown>;
        for (const n of drop) delete i[n];
        const out = compute(i as unknown as Inputs);
        return !out.ok && out.error.gate === 'INSUFFICIENT_INPUTS' && drop.every((n) => out.error.missing?.includes(listed(n)));
      }),
    );
  });
  it('empty shipped tables: INSUFFICIENT DATA with the exact text, never a number', () => {
    const e = fails(base({}, SHIPPED_TABLES));
    expect(e.gate).toBe('INSUFFICIENT_DATA');
    expect(e.message).toBe(
      'INSUFFICIENT DATA: table T5 creepage distance (basic insulation) is empty (enter values from your licensed copy); ' +
        'INSUFFICIENT DATA: rule "scope-max-frequency" is not entered in table T7 rule records (enter it from your licensed copy)',
    );
    const c = fails(base({ materialGroup: undefined as never, cti: V(95) }, SHIPPED_TABLES));
    expect(c.message).toContain('table T5');
    expect(c.message).toContain('table T6');
  });
  it('inputs are checked before tables; an edition mismatch is refused', () => {
    const i = { ...base({}, SHIPPED_TABLES) } as Record<string, unknown>;
    delete i['surface'];
    expect(fails(i).gate).toBe('INSUFFICIENT_INPUTS');
    expect(fails(base({ edition: 'OTHER' })).message).toContain('differs from the selected edition');
  });
  it('a voltage above the table is refused, not extrapolated', () => {
    expect(fails(base({ workingVoltageRms: V(301) })).message).toContain('OUT OF TABLE RANGE');
  });
  it('blank and null values count as missing', () => {
    expect(fails({ ...base(), surface: '' }).gate).toBe('INSUFFICIENT_INPUTS');
    expect(fails({ ...base(), associatedClearance: null }).gate).toBe('INSUFFICIENT_INPUTS');
  });
});

describe('creepage: banners, grooves, frequency', () => {
  it('unverified data: red banner, indicative only, low; verified: no banner, medium when scope is checked', () => {
    const r = ok(base());
    expect(r.warnings.find((w) => w.code === 'UNVERIFIED_TABLE_DATA')?.severity).toBe('critical');
    expect(r.recommendation).toMatch(/^indicative only/i);
    expect(r.results.find((x) => x.role === 'primary')?.name).toMatch(/^indicative only/i);
    expect(r.confidence.level).toBe('low');
    const v = ok(base({}, synthSet(undefined, { verified: true })));
    expect(v.warnings.some((w) => w.code === 'UNVERIFIED_TABLE_DATA')).toBe(false);
    expect(v.confidence.level).toBe('medium');
  });
  it('product-standard banner verbatim; grooves, slots and ribs are never credited (warning only)', () => {
    const r = ok(base({ grooves: 'present' }));
    expect(r.warnings.some((w) => w.message === PRODUCT_STANDARD_BANNER)).toBe(true);
    const g = r.warnings.find((w) => w.code === 'GROOVES_NOT_CREDITED');
    expect(g?.message).toMatch(/not credited/);
    expect(primary(r)).toBeCloseTo(primary(ok(base())), 12);
    expect(ok(base({ grooves: 'none' })).warnings.some((w) => w.code === 'GROOVES_NOT_CREDITED')).toBe(false);
    const withRule = ok(base({ grooves: 'present' }, synthSet(undefined, { verified: true })));
    expect(withRule.warnings.some((w) => w.code === 'GROOVES_NOT_CREDITED')).toBe(true);
  });
  it('frequency above the T7 limit gives no number; with no recorded limit and a frequency above zero it is refused naming T7', () => {
    const e = fails(base({ frequency: HZ(T7_SCOPE_FREQUENCY_HZ + 1) }));
    expect(e.gate).toBe('OUT_OF_SCOPE');
    expect(e.message).toContain('IEC 60664-4');
    const t = synthSet(['T5']);
    const n = fails(base({ frequency: HZ(1e6) }, t));
    expect(n.gate).toBe('INSUFFICIENT_DATA');
    expect(n.message).toBe('INSUFFICIENT DATA: rule "scope-max-frequency" is not entered in table T7 rule records (enter it from your licensed copy)');
    expect(ok(base({ frequency: HZ(0) }, t)).warnings.some((w) => w.code === 'HF_NOT_CHECKED')).toBe(false);
    expect(fails(base({}, SHIPPED_TABLES)).message).toContain('rule "scope-max-frequency" is not entered in table T7');
  });
  it('a T7 of another edition does not block a calculation that does not use T7', () => {
    const other = makeTableSet({ T5: synthTable('T5'), T7: synthTable('T7', { edition: 'OTHER-ED' }) });
    if (!other.ok) throw new Error(other.error.join('; '));
    expect(ok(base({ frequency: HZ(0) }, other.value)).warnings.some((w) => w.code === 'SCOPE_NOT_CHECKED')).toBe(true);
    expect(fails(base({ frequency: HZ(50) }, other.value)).message).toContain('differs from the selected edition');
  });
  it('a non-DC declared shape with frequency 0 is refused; a square waveform from rms warns about unipolar pulses; S-035 is cited', () => {
    const e = fails(base({ frequency: HZ(0), workingVoltageRms: undefined as never, waveform: { shape: 'triangle', basis: 'rms', value: V(150) } }));
    expect(e.field).toBe('frequency');
    expect(e.message).toContain('frequency 0 Hz means DC');
    const sq = ok(base({ workingVoltageRms: undefined as never, waveform: { shape: 'square', basis: 'rms', value: V(150) } }));
    expect(sq.warnings.find((w) => w.code === 'SQUARE_RMS_UNIPOLAR')?.message).toMatch(/understates/);
    expect(sq.reference.ledgerIds).toContain('S-035');
    expect(ok(base()).reference.ledgerIds).not.toContain('S-035');
  });
  it('voltage scope uses the rms (or DC) value against the T7 records', () => {
    expect(fails(base({ workingVoltageRms: V(5001) })).gate).toBe('OUT_OF_SCOPE');
    expect(fails(base({ workingVoltageRms: V(8001), frequency: HZ(0) })).gate).toBe('OUT_OF_SCOPE');
  });
  it('no compliance wording in any output (fragment-assembled patterns)', () => {
    const words = [['compl', 'iant'], ['compl', 'ies'], ['comply', ' with'], ['certi', 'fied'], ['production', '[- ]?safe'], ['conform', 's to']].map((p) => p.join(''));
    const re = new RegExp(`\\b(${words.join('|')})\\b`, 'i');
    expect(re.test(JSON.stringify(ok(base())))).toBe(false);
    expect(re.test(JSON.stringify(fails(base({}, SHIPPED_TABLES))))).toBe(false);
  });
});

describe('creepage: guards return values, never throw', () => {
  const bads: [string, unknown][] = [
    ['workingVoltageRms', raw(0, DIM.VOLTAGE)],
    ['workingVoltageRms', raw(-1, DIM.VOLTAGE)],
    ['workingVoltageRms', raw(Number.NaN, DIM.VOLTAGE)],
    ['workingVoltageRms', q(1, DIM.LENGTH)],
    ['pollutionDegree', 7],
    ['materialGroup', 'IV'],
    ['cti', raw(-5, DIM.VOLTAGE)],
    ['surface', 'both'],
    ['frequency', raw(-1, DIM.FREQUENCY)],
    ['associatedClearance', raw(0, DIM.LENGTH)],
    ['associatedClearance', raw(5, DIM.LENGTH)],
    ['associatedClearance', q(1, DIM.VOLTAGE)],
    ['altitude', raw(Number.NaN, DIM.LENGTH)],
    ['grooves', 'maybe'],
    ['coatingCredit', 'x'],
    ['waveform', 5],
    ['waveform', { shape: 'sine' }],
    ['waveform', { shape: 'pulse', basis: 'peak', value: V(1) }],
  ];
  it.each(bads)('bad %s is an error value', (field, value) => {
    const out = compute({ ...base(), [field]: value } as unknown as Inputs);
    expect(out.ok).toBe(false);
  });
  it('non-object inputs', () => {
    for (const x of [null, undefined, 5, 'x', []]) expect(compute(x as never).ok).toBe(false);
  });
  it('property: garbage never throws', () => {
    const junk = fc.oneof(fc.constant(undefined), fc.constant(null), fc.double(), fc.string(), fc.boolean());
    fc.assert(
      fc.property(fc.constantFrom('workingVoltageRms', 'pollutionDegree', 'materialGroup', 'surface', 'frequency', 'associatedClearance', 'edition'), junk, (f, v) => {
        return typeof compute({ ...base(), [f]: v } as unknown as Inputs).ok === 'boolean';
      }),
    );
  });
});

describe('creepage: meta and misc', () => {
  it('meta, determinism, performance', () => {
    expect(meta.id).toBe('creepage');
    expect(meta.mandatoryInputs).toContain('associatedClearance');
    expect(meta.ledgerIds).toContain('S-030e');
    const r = ok(base());
    expect(r.formula).toBe(meta.formula);
    expect(JSON.stringify(compute(base()))).toBe(JSON.stringify(compute(base())));
    const i = base();
    // best of three rounds of 10 000, so a loaded CI machine does not make the bound flaky
    let best = Infinity;
    for (let round = 0; round < 3; round++) {
      const t0 = Date.now();
      for (let k = 0; k < 10_000; k++) compute(i);
      best = Math.min(best, Date.now() - t0);
    }
    expect(best).toBeLessThan(5000);
  });
  it('uses ids T5 and T6 in the provenance lines', () => {
    const r = ok(base({ materialGroup: undefined as never, cti: V(95) }));
    const ids: TableId[] = ['T5', 'T6'];
    for (const id of ids) expect(r.assumptions.join(' ')).toContain(id);
  });
});
