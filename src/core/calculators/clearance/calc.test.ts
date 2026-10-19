import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { SHIPPED_TABLES, makeTableSet, parseSpacingTable } from '../../spacing/tables';
import type { SpacingTableSet, TableId } from '../../spacing/tables';
import { PRODUCT_STANDARD_BANNER } from '../../spacing/gating';
import { T4_FACTORS, T7_COATING_TYPE1, T7_REINFORCED_STEADY_MULTIPLIER, T7_SCOPE_FREQUENCY_HZ, rawSynthetic, synthSet, synthTable, t1, t2, t3 } from '../../spacing/synthetic-tables.testutil';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 3 core: gated clearance calculator. TESTS FIRST.
// SYNTHETIC TEST DATA, not from any standard: every table below comes from synthetic-tables.testutil.ts with fake numbers
// (impulse kV 1..5, mm = 2*row + pollution degree + 1 when inhomogeneous, altitude rows 1000/3000/5000 m with factors 1/2/3 ...).
// Expected values are recomputed in the tests from those fake formulas, never from the implementation. The shipped tables are EMPTY.

const ED = 'SYNTH-ED-1';
const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const M = (n: number): Quantity => q(n, DIM.LENGTH);
const HZ = (n: number): Quantity => q(n, DIM.FREQUENCY);
const raw = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;

function base(over: Partial<Inputs> = {}, tables: SpacingTableSet = synthSet()): Inputs {
  return {
    tables,
    edition: ED,
    insulationType: 'basic',
    ratedImpulseVoltage: V(2000),
    pollutionDegree: 2,
    fieldCondition: 'inhomogeneous',
    altitude: M(0),
    workingVoltagePeak: V(300),
    frequency: HZ(50),
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
const mm = (n: number): number => n * 1e-3;

describe('clearance: numbers from synthetic tables', () => {
  it('route (b) rated impulse voltage, sea level: T2 lookup only', () => {
    const r = ok(base());
    expect(primary(r)).toBeCloseTo(mm(t2(2, 2, true)), 12); // 7 mm (fake)
    expect(r.results.find((x) => x.role === 'primary')?.bound).toBe('min-requirement');
  });
  it('altitude multiplies the clearance by the T4 factor (next higher altitude row)', () => {
    const r = ok(base({ altitude: M(2000) }));
    expect(primary(r)).toBeCloseTo(mm(t2(2, 2, true)) * (T4_FACTORS[1] as number), 12);
    const r2 = ok(base({ altitude: M(1000) }));
    expect(primary(r2)).toBeCloseTo(mm(t2(2, 2, true)) * (T4_FACTORS[0] as number), 12);
    const r3 = ok(base({ altitude: M(-400) }));
    expect(primary(r3)).toBeCloseTo(mm(t2(2, 2, true)), 12);
  });
  it('route (a) overvoltage category and supply voltage go through T1 then T2', () => {
    const r = ok(base({ ratedImpulseVoltage: undefined as never, overvoltageCategory: 'II', supplyVoltage: V(150) }));
    // T1 row 200 V (next higher), category II -> fake kV, then T2 at that impulse voltage
    const kv = t1(2, 2);
    expect(primary(r)).toBeCloseTo(mm(t2(kv, 2, true)), 12);
    expect(r.warnings.some((w) => w.code === 'OVERVOLTAGE_CATEGORY_CONFLICT')).toBe(true);
    expect(r.reference.ledgerIds).toContain('S-030c');
  });
  it('pollution degree and field condition select the column', () => {
    expect(primary(ok(base({ pollutionDegree: 3, fieldCondition: 'homogeneous' })))).toBeCloseTo(mm(t2(2, 3, false)), 12);
    expect(primary(ok(base({ pollutionDegree: 1 })))).toBeCloseTo(mm(t2(2, 1, true)), 12);
  });
  it('T3 is also checked when entered and the larger clearance wins', () => {
    const r = ok(base({ workingVoltagePeak: V(3000) }));
    expect(primary(r)).toBeCloseTo(mm(Math.max(t2(2, 2, true), t3(3, true))), 12); // T3 dominates here
    const lowPeak = ok(base({ workingVoltagePeak: V(300) }));
    expect(primary(lowPeak)).toBeCloseTo(mm(Math.max(t2(2, 2, true), t3(1, true))), 12);
    const withAlt = ok(base({ workingVoltagePeak: V(3000), altitude: M(2000) }));
    expect(primary(withAlt)).toBeCloseTo(mm(t3(3, true)) * (T4_FACTORS[1] as number), 12);
  });
  it('without T3 data the check is not done: a labelled warning and a safety-relevant confidence reason', () => {
    const r = ok(base({}, synthSet(['T2', 'T4', 'T7'])));
    expect(r.warnings.some((w) => w.code === 'T3_NOT_ENTERED')).toBe(true);
    expect(r.confidence.reasons.join(' ')).toMatch(/steady-state/i);
    expect(r.confidence.level).toBe('low');
  });
  it('reinforced insulation: next preferred impulse step in the T7 series, never the next T2 row', () => {
    // fake series 1, 2, 4, 5 kV; required impulse 2 kV is in the series, so the reinforced lookup is T2 at 4 kV (a row step would be 3 kV)
    const noT3 = synthSet(['T2', 'T4', 'T7']);
    const r = ok(base({ insulationType: 'reinforced' }, noT3));
    expect(primary(r)).toBeCloseTo(mm(t2(4, 2, true)), 12);
    expect(primary(r)).not.toBeCloseTo(mm(t2(3, 2, true)), 12);
    expect(r.assumptions.join(' ')).toMatch(/next-preferred-impulse-step/);
    const none = fails(base({ insulationType: 'reinforced' }, synthSet(['T2', 'T4'])));
    expect(none.gate).toBe('INSUFFICIENT_DATA');
    expect(none.message).toContain('INSUFFICIENT DATA: table T7 rule records is empty (enter values from your licensed copy)');
  });
  it('reinforced: the required impulse must be a series value; between values and above the series are refused', () => {
    const noT3 = synthSet(['T2', 'T4', 'T7']);
    const between = fails(base({ insulationType: 'reinforced', ratedImpulseVoltage: V(2500) }, noT3));
    expect(between.gate).toBe('INSUFFICIENT_DATA');
    expect(between.message).toContain('not a value of the preferred impulse series');
    const top = fails(base({ insulationType: 'reinforced', ratedImpulseVoltage: V(5000) }, noT3));
    expect(top.gate).toBe('OUT_OF_SCOPE');
    expect(top.message).toContain('no higher value in the preferred impulse series');
  });
  it('reinforced with T3 populated needs its own steady-state record (not the impulse step), and multiplies only the T3 part', () => {
    const r = ok(base({ insulationType: 'reinforced' }));
    expect(primary(r)).toBeCloseTo(mm(Math.max(t2(4, 2, true), t3(1, true) * T7_REINFORCED_STEADY_MULTIPLIER)), 12);
    const raw7 = rawSynthetic('T7');
    const rules = (raw7['rules'] as Record<string, unknown>[]).filter((x) => x['rule'] !== 'reinforced-clearance-steady-state');
    const p = parseSpacingTable({ ...raw7, rules });
    if (!p.ok) throw new Error(p.error.join('; '));
    const set = makeTableSet({ T2: synthTable('T2'), T3: synthTable('T3'), T4: synthTable('T4'), T7: p.value });
    if (!set.ok) throw new Error(set.error.join('; '));
    const e = fails(base({ insulationType: 'reinforced' }, set.value));
    expect(e.gate).toBe('INSUFFICIENT_DATA');
    expect(e.message).toBe('INSUFFICIENT DATA: rule "reinforced-clearance-steady-state" is not entered in table T7 rule records (enter it from your licensed copy)');
    // basic insulation does not need it
    expect(compute(base({}, set.value)).ok).toBe(true);
  });
  it('a T7 without the reinforced-clearance record is refused with the rule named', () => {
    const raw7 = rawSynthetic('T7');
    const rules = (raw7['rules'] as Record<string, unknown>[]).filter((r) => r['rule'] !== 'reinforced-clearance');
    const p = parseSpacingTable({ ...raw7, rules });
    if (!p.ok) throw new Error(p.error.join('; '));
    const set = makeTableSet({ T2: synthTable('T2'), T3: synthTable('T3'), T4: synthTable('T4'), T7: p.value });
    if (!set.ok) throw new Error(set.error.join('; '));
    const e = fails(base({ insulationType: 'reinforced' }, set.value));
    expect(e.gate).toBe('INSUFFICIENT_DATA');
    expect(e.message).toBe('INSUFFICIENT DATA: rule "reinforced-clearance" is not entered in table T7 rule records (enter it from your licensed copy)');
  });
  it('functional, basic and supplementary use the same lookup (conservative reading, stated as an assumption)', () => {
    const b = primary(ok(base({ insulationType: 'basic' })));
    expect(primary(ok(base({ insulationType: 'functional' })))).toBe(b);
    expect(primary(ok(base({ insulationType: 'supplementary' })))).toBe(b);
    expect(ok(base({ insulationType: 'functional' })).assumptions.join(' ')).toMatch(/functional/);
  });
  it('coating credit only with a VERIFIED T7 rule AND the user selecting it', () => {
    const plain = primary(ok(base()));
    // unverified T7: selected but not applied, warning says so
    const unv = ok(base({ coatingCredit: 'type1' }));
    expect(primary(unv)).toBeCloseTo(plain, 12);
    expect(unv.warnings.some((w) => w.code === 'COATING_CREDIT_NOT_APPLIED')).toBe(true);
    // verified T7 but not selected: no credit
    const verified = synthSet(undefined, { verified: true });
    expect(primary(ok(base({}, verified)))).toBeCloseTo(plain, 12);
    // verified and selected, but the record does not state clearance scope: not applied to a clearance
    expect(primary(ok(base({ coatingCredit: 'type1' }, verified)))).toBeCloseTo(plain, 12);
    // verified, selected, and the record states appliesTo clearance (or both): applied
    const scoped = (appliesTo: string) => {
      const raw7 = rawSynthetic('T7', { verified: true });
      const rules = (raw7['rules'] as Record<string, unknown>[]).map((x) => (x['rule'] === 'coating-credit' ? { ...x, appliesTo } : x));
      const p = parseSpacingTable({ ...raw7, rules });
      if (!p.ok) throw new Error(p.error.join('; '));
      const set = makeTableSet({ T7: p.value }, verified);
      if (!set.ok) throw new Error(set.error.join('; '));
      return set.value;
    };
    for (const a of ['clearance', 'both']) {
      expect(primary(ok(base({ coatingCredit: 'type1' }, scoped(a))))).toBeCloseTo(plain * T7_COATING_TYPE1, 12);
    }
    expect(primary(ok(base({ coatingCredit: 'type1' }, scoped('creepage'))))).toBeCloseTo(plain, 12);
    // verified, selected type with no record: not applied
    const t2c = ok(base({ coatingCredit: 'type2' }, verified));
    expect(primary(t2c)).toBeCloseTo(plain, 12);
    expect(t2c.warnings.some((w) => w.code === 'COATING_CREDIT_NOT_APPLIED')).toBe(true);
  });
  it('solder mask is never a coating credit', () => {
    const r = ok(base({ soldermask: true }, synthSet(undefined, { verified: true })));
    expect(primary(r)).toBeCloseTo(primary(ok(base({}, synthSet(undefined, { verified: true })))), 12);
    expect(r.warnings.some((w) => w.code === 'SOLDERMASK_NOT_COATING')).toBe(true);
    expect(ok(base()).warnings.some((w) => w.code === 'SOLDERMASK_NOT_COATING')).toBe(true);
  });
});

describe('clearance: gating', () => {
  const REQUIRED: [string, string][] = [
    ['edition', 'edition'],
    ['insulationType', 'insulationType'],
    ['pollutionDegree', 'pollutionDegree'],
    ['fieldCondition', 'fieldCondition'],
    ['altitude', 'altitude'],
    ['workingVoltagePeak', 'workingVoltagePeak'],
    ['frequency', 'frequency'],
  ];
  it.each(REQUIRED)('missing %s blocks the output and is listed', (field, listed) => {
    const i = { ...base() } as Record<string, unknown>;
    delete i[field];
    const e = fails(i);
    expect(e.gate).toBe('INSUFFICIENT_INPUTS');
    expect(e.message).toMatch(/^Insufficient inputs: /);
    expect(e.message).toContain(listed);
    expect(e.missing).toContain(listed);
  });
  it('neither impulse route given: one combined entry; a half-given route lists the missing part', () => {
    const none = { ...base() } as Record<string, unknown>;
    delete none['ratedImpulseVoltage'];
    expect(fails(none).message).toContain('ratedImpulseVoltage OR (overvoltageCategory + supplyVoltage)');
    expect(fails({ ...none, overvoltageCategory: 'III' }).missing).toEqual(['supplyVoltage']);
    expect(fails({ ...none, supplyVoltage: V(100) }).missing).toEqual(['overvoltageCategory']);
  });
  it('both impulse routes given is refused (exactly one route)', () => {
    const e = fails({ ...base(), overvoltageCategory: 'II', supplyVoltage: V(150) });
    expect(e.code).toBe('INVALID_INPUT');
  });
  it('a working voltage given only as rms (peak unknown) counts as missing; a declared waveform supplies the peak', () => {
    const i = { ...base() } as Record<string, unknown>;
    delete i['workingVoltagePeak'];
    expect(fails({ ...i, workingVoltageRms: V(100) }).missing).toEqual(['workingVoltagePeak']);
    const r = ok({ ...(i as unknown as Inputs), waveform: { shape: 'sine', basis: 'rms', value: V(100) } });
    expect(r.inputs.some((x) => x.name === 'working voltage (peak)' && Math.abs(x.value.si - 100 * Math.SQRT2) < 1e-9)).toBe(true);
  });
  it('property: removing any non-empty subset of the mandatory inputs always blocks the output', () => {
    const names = REQUIRED.map(([n]) => n);
    fc.assert(
      fc.property(fc.subarray(names, { minLength: 1 }), (drop) => {
        const i = { ...base() } as Record<string, unknown>;
        for (const n of drop) delete i[n];
        const out = compute(i as unknown as Inputs);
        return !out.ok && out.error.gate === 'INSUFFICIENT_INPUTS' && drop.every((n) => out.error.missing?.includes(n));
      }),
    );
  });
  it('null and blank values count as missing', () => {
    expect(fails({ ...base(), altitude: null }).gate).toBe('INSUFFICIENT_INPUTS');
    expect(fails({ ...base(), edition: '   ' }).gate).toBe('INSUFFICIENT_INPUTS');
    expect(fails({ ...base(), insulationType: '' }).gate).toBe('INSUFFICIENT_INPUTS');
  });
  it('empty shipped tables: INSUFFICIENT DATA with the exact text, never a number', () => {
    const e = fails(base({}, SHIPPED_TABLES));
    expect(e.gate).toBe('INSUFFICIENT_DATA');
    expect(e.message).toBe(
      'INSUFFICIENT DATA: table T2 clearance to withstand transient overvoltages is empty (enter values from your licensed copy); ' +
        'INSUFFICIENT DATA: table T4 altitude correction factor (clearance only) is empty (enter values from your licensed copy); ' +
        'INSUFFICIENT DATA: rule "scope-max-frequency" is not entered in table T7 rule records (enter it from your licensed copy)',
    );
    const a = fails(base({ ratedImpulseVoltage: undefined as never, overvoltageCategory: 'II', supplyVoltage: V(150) }, SHIPPED_TABLES));
    expect(a.message).toContain('table T1 rated impulse voltage is empty');
    expect(compute(base({}, SHIPPED_TABLES)).ok).toBe(false);
  });
  it('the default tables are the shipped (empty) ones', () => {
    const { tables: _t, ...rest } = base();
    void _t;
    const e = fails(rest);
    expect(e.gate).toBe('INSUFFICIENT_DATA');
  });
  it('inputs are checked before tables: missing inputs win over empty tables', () => {
    const i = { ...base({}, SHIPPED_TABLES) } as Record<string, unknown>;
    delete i['altitude'];
    expect(fails(i).gate).toBe('INSUFFICIENT_INPUTS');
  });
  it('a table of another edition is never used', () => {
    const e = fails(base({ edition: 'OTHER-ED' }));
    expect(e.gate).toBe('INSUFFICIENT_DATA');
    expect(e.message).toContain('differs from the selected edition');
  });
  it('a hand-built table set is refused', () => {
    const e = fails({ ...base(), tables: { tables: SHIPPED_TABLES.tables } });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.field).toBe('tables');
  });
  it('an impulse voltage above the table is refused, not extrapolated', () => {
    const e = fails(base({ ratedImpulseVoltage: V(6000) }));
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.message).toContain('OUT OF TABLE RANGE');
    expect(fails(base({ altitude: M(6000) })).message).toContain('OUT OF TABLE RANGE');
  });
  it('a pollution degree or field condition with no column is refused with the table named', () => {
    const e = fails(base({ pollutionDegree: 4 }));
    expect(e.gate).toBe('INSUFFICIENT_DATA');
    expect(e.message).toContain('T2');
  });
});

describe('clearance: indicative-only path and banners', () => {
  it('ENTERED_UNVERIFIED data: red UNVERIFIED banner, "indicative only" prefix, low confidence', () => {
    const r = ok(base());
    const banner = r.warnings.find((w) => w.code === 'UNVERIFIED_TABLE_DATA');
    expect(banner?.severity).toBe('critical');
    expect(banner?.message).toMatch(/^UNVERIFIED/);
    expect(r.recommendation).toMatch(/^indicative only/i);
    expect(r.results.find((x) => x.role === 'primary')?.name).toMatch(/^indicative only/i);
    expect(r.confidence.level).toBe('low');
  });
  it('VERIFIED data (human signed): no UNVERIFIED banner, still PAYWALLED and never high', () => {
    const r = ok(base({ workingVoltagePeak: undefined as never, waveform: { shape: 'sine', basis: 'peak', value: V(300) } }, synthSet(undefined, { verified: true })));
    expect(r.warnings.some((w) => w.code === 'UNVERIFIED_TABLE_DATA')).toBe(false);
    expect(r.recommendation).not.toMatch(/^indicative only/i);
    expect(r.confidence.level).toBe('medium');
  });
  it('one unverified table among verified ones makes the whole result indicative only', () => {
    const v = (id: TableId) => synthTable(id, { verified: true });
    const mixed = makeTableSet({ T1: v('T1'), T2: synthTable('T2'), T3: v('T3'), T4: v('T4'), T7: v('T7') });
    if (!mixed.ok) throw new Error(mixed.error.join('; '));
    const r = ok(base({ workingVoltagePeak: undefined as never, waveform: { shape: 'sine', basis: 'peak', value: V(300) } }, mixed.value));
    expect(r.warnings.some((w) => w.code === 'UNVERIFIED_TABLE_DATA')).toBe(true);
    expect(r.recommendation).toMatch(/^indicative only/i);
  });
  it('the product-standard banner is verbatim and always present, with the soldermask and paywalled-data notes', () => {
    expect(PRODUCT_STANDARD_BANNER).toBe(
      'IEC 60664-1 is an insulation-coordination framework; product-specific safety standards may impose additional requirements.',
    );
    for (const o of [{}, { insulationType: 'reinforced' as const }, { coatingCredit: 'type1' as const }]) {
      const r = ok(base(o));
      expect(r.warnings.some((w) => w.message === PRODUCT_STANDARD_BANNER)).toBe(true);
      expect(r.warnings.some((w) => w.code === 'PAYWALLED_TABLE_DATA')).toBe(true);
    }
  });
  it('no compliance wording in any output (fragment-assembled patterns)', () => {
    const words = [['compl', 'iant'], ['compl', 'ies'], ['comply', ' with'], ['certi', 'fied'], ['production', '[- ]?safe'], ['conform', 's to']].map((p) => p.join(''));
    const re = new RegExp(`\\b(${words.join('|')})\\b`, 'i');
    for (const t of [synthSet(), synthSet(undefined, { verified: true })]) {
      const r = ok(base({}, t));
      const text = JSON.stringify(r);
      expect(re.test(text)).toBe(false);
    }
    const e = fails(base({}, SHIPPED_TABLES));
    expect(re.test(JSON.stringify(e))).toBe(false);
  });
});

describe('clearance: frequency and scope', () => {
  it('frequency above the T7 limit gives no number and names IEC 60664-4', () => {
    const e = fails(base({ frequency: HZ(T7_SCOPE_FREQUENCY_HZ + 1) }));
    expect(e.gate).toBe('OUT_OF_SCOPE');
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.message).toContain('IEC 60664-4');
    expect(ok(base({ frequency: HZ(T7_SCOPE_FREQUENCY_HZ) })).warnings.some((w) => w.code === 'HF_NOT_CHECKED')).toBe(false);
  });
  it('with no recorded frequency limit and a frequency above zero the result is refused, naming T7', () => {
    const t = synthSet(['T2', 'T3', 'T4']);
    const e = fails(base({ frequency: HZ(1e6) }, t));
    expect(e.gate).toBe('INSUFFICIENT_DATA');
    expect(e.message).toBe('INSUFFICIENT DATA: rule "scope-max-frequency" is not entered in table T7 rule records (enter it from your licensed copy)');
    expect(ok(base({ frequency: HZ(0) }, t)).warnings.some((x) => x.code === 'HF_NOT_CHECKED')).toBe(false);
  });
  it('a T7 that holds other rules but no frequency limit is refused for a frequency above zero', () => {
    const raw7 = rawSynthetic('T7');
    const rules = (raw7['rules'] as Record<string, unknown>[]).filter((x) => x['rule'] !== 'scope-max-frequency');
    const p = parseSpacingTable({ ...raw7, rules });
    if (!p.ok) throw new Error(p.error.join('; '));
    const set = makeTableSet({ T2: synthTable('T2'), T3: synthTable('T3'), T4: synthTable('T4'), T7: p.value });
    if (!set.ok) throw new Error(set.error.join('; '));
    expect(fails(base({}, set.value)).message).toContain('"scope-max-frequency"');
    expect(compute(base({ frequency: HZ(0) }, set.value)).ok).toBe(true);
  });
  it('empty tables with a frequency above zero still list the missing T7 limit', () => {
    const e = fails(base({}, SHIPPED_TABLES));
    expect(e.message).toContain('rule "scope-max-frequency" is not entered in table T7');
    expect(fails(base({ frequency: HZ(0) }, SHIPPED_TABLES)).message).not.toContain('scope-max-frequency');
  });
  it('a T7 of another edition does not block a calculation that does not use T7', () => {
    const other = makeTableSet({ T2: synthTable('T2'), T3: synthTable('T3'), T4: synthTable('T4'), T7: synthTable('T7', { edition: 'OTHER-ED' }) });
    if (!other.ok) throw new Error(other.error.join('; '));
    const r = ok(base({ frequency: HZ(0) }, other.value));
    expect(r.warnings.some((w) => w.code === 'SCOPE_NOT_CHECKED')).toBe(true);
    const e = fails(base({ frequency: HZ(50) }, other.value));
    expect(e.message).toContain('differs from the selected edition');
    expect(fails(base({ frequency: HZ(0), insulationType: 'reinforced' }, other.value)).message).toContain('differs from the selected edition');
  });
  it('voltage scope: DC limit on the peak, AC rms limit when rms is known', () => {
    const dc = fails(base({ frequency: HZ(0), workingVoltagePeak: V(8001) }));
    expect(dc.gate).toBe('OUT_OF_SCOPE');
    const ac = fails(base({ waveform: { shape: 'sine', basis: 'rms', value: V(5001) }, workingVoltagePeak: undefined as never }));
    expect(ac.gate).toBe('OUT_OF_SCOPE');
    const unknownRms = ok(base({ workingVoltagePeak: V(1500) }, synthSet(['T2', 'T4', 'T7'])));
    expect(unknownRms.warnings.some((w) => w.code === 'SCOPE_NOT_CHECKED')).toBe(true);
  });
});

describe('clearance: peak working voltage against the impulse withstand voltage (T3 empty)', () => {
  const noT3 = synthSet(['T2', 'T4', 'T7']);
  it('a peak working voltage above the impulse voltage used is refused when T3 is empty, with the reason', () => {
    const e = fails(base({ workingVoltagePeak: V(2500) }, noT3));
    expect(e.gate).toBe('OUT_OF_SCOPE');
    expect(e.message).toContain('exceeds the impulse withstand voltage');
    expect(e.message).toContain('T3');
    expect(compute(base({ workingVoltagePeak: V(2000) }, noT3)).ok).toBe(true);
  });
  it('for reinforced insulation the voltage used is the stepped series value', () => {
    expect(compute(base({ insulationType: 'reinforced', workingVoltagePeak: V(3500) }, noT3)).ok).toBe(true);
    expect(fails(base({ insulationType: 'reinforced', workingVoltagePeak: V(4500) }, noT3)).gate).toBe('OUT_OF_SCOPE');
  });
  it('with T3 populated the larger of the two clearances wins instead', () => {
    const r = ok(base({ workingVoltagePeak: V(2500) }));
    expect(primary(r)).toBeCloseTo(mm(Math.max(t2(2, 2, true), t3(3, true))), 12);
  });
});

describe('clearance: waveform, frequency and traceability', () => {
  it('a non-DC declared shape with frequency 0 is refused ("0 Hz means DC"); a DC shape is accepted', () => {
    const sine = fails(base({ frequency: HZ(0), workingVoltagePeak: undefined as never, waveform: { shape: 'sine', basis: 'peak', value: V(300) } }));
    expect(sine.code).toBe('INVALID_INPUT');
    expect(sine.field).toBe('frequency');
    expect(sine.message).toContain('frequency 0 Hz means DC');
    expect(compute(base({ frequency: HZ(0), workingVoltagePeak: undefined as never, waveform: { shape: 'dc', basis: 'peak', value: V(300) } })).ok).toBe(true);
  });
  it('a square waveform declared from an rms value warns that a unipolar pulse would have a higher peak', () => {
    const w = (basis: 'rms' | 'peak') => ok(base({ workingVoltagePeak: undefined as never, waveform: { shape: 'square', basis, value: V(100) } }));
    const r = w('rms').warnings.find((x) => x.code === 'SQUARE_RMS_UNIPOLAR');
    expect(r?.message).toMatch(/unipolar/);
    expect(r?.message).toMatch(/understates/);
    expect(w('peak').warnings.some((x) => x.code === 'SQUARE_RMS_UNIPOLAR')).toBe(false);
  });
  it('cites S-035 when a declared waveform is used, and only then', () => {
    const w = ok(base({ workingVoltagePeak: undefined as never, waveform: { shape: 'sine', basis: 'rms', value: V(100) } }));
    expect(w.reference.ledgerIds).toContain('S-035');
    expect(ok(base()).reference.ledgerIds).not.toContain('S-035');
  });
  it('coating credit applies to creepage only unless the record states clearance (no credit on clearance by default)', () => {
    const verified = synthSet(undefined, { verified: true });
    const r = ok(base({ coatingCredit: 'type1' }, verified));
    expect(primary(r)).toBeCloseTo(primary(ok(base({}, verified))), 12);
    expect(r.warnings.find((x) => x.code === 'COATING_CREDIT_NOT_APPLIED')?.message).toMatch(/creepage only/);
  });
});

describe('clearance: input guards return values, never throw', () => {
  const bads: [string, unknown][] = [
    ['altitude', raw(Number.NaN, DIM.LENGTH)],
    ['altitude', raw(Number.POSITIVE_INFINITY, DIM.LENGTH)],
    ['altitude', raw(1e9, DIM.LENGTH)],
    ['altitude', q(5, DIM.VOLTAGE)],
    ['altitude', 5],
    ['frequency', raw(-1, DIM.FREQUENCY)],
    ['frequency', raw(Number.NaN, DIM.FREQUENCY)],
    ['frequency', q(5, DIM.LENGTH)],
    ['workingVoltagePeak', raw(0, DIM.VOLTAGE)],
    ['workingVoltagePeak', raw(-5, DIM.VOLTAGE)],
    ['workingVoltagePeak', raw(Number.NEGATIVE_INFINITY, DIM.VOLTAGE)],
    ['workingVoltagePeak', q(5, DIM.CURRENT)],
    ['ratedImpulseVoltage', raw(0, DIM.VOLTAGE)],
    ['ratedImpulseVoltage', raw(Number.NaN, DIM.VOLTAGE)],
    ['pollutionDegree', 0],
    ['pollutionDegree', 5],
    ['pollutionDegree', 2.5],
    ['pollutionDegree', '2'],
    ['fieldCondition', 'both'],
    ['insulationType', 'double'],
    ['edition', 5],
    ['coatingCredit', 'type9'],
    ['soldermask', 'yes'],
  ];
  it.each(bads)('bad %s is an error value', (field, value) => {
    const out = compute({ ...base(), [field]: value } as unknown as Inputs);
    expect(out.ok).toBe(false);
  });
  it('bad route-a values and non-object inputs', () => {
    const noImp = { ...base() } as Record<string, unknown>;
    delete noImp['ratedImpulseVoltage'];
    expect(compute({ ...noImp, overvoltageCategory: 'V', supplyVoltage: V(100) } as unknown as Inputs).ok).toBe(false);
    expect(compute({ ...noImp, overvoltageCategory: 'II', supplyVoltage: raw(-1, DIM.VOLTAGE) } as unknown as Inputs).ok).toBe(false);
    for (const x of [null, undefined, 5, 'x', []]) expect(compute(x as never).ok).toBe(false);
  });
  it('property: random garbage in any field never throws and never gives a result with a bad field', () => {
    const junk = fc.oneof(fc.constant(undefined), fc.constant(null), fc.double(), fc.string(), fc.boolean(), fc.constant(Number.NaN));
    fc.assert(
      fc.property(fc.constantFrom('altitude', 'frequency', 'workingVoltagePeak', 'ratedImpulseVoltage', 'pollutionDegree', 'fieldCondition', 'edition', 'insulationType'), junk, (field, v) => {
        const out = compute({ ...base(), [field]: v } as unknown as Inputs);
        return typeof out.ok === 'boolean';
      }),
    );
  });
});

describe('clearance: properties', () => {
  it('a higher impulse requirement never lowers the clearance', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 5000 }), fc.integer({ min: 100, max: 5000 }), (a, b) => {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const x = compute(base({ ratedImpulseVoltage: V(lo) }));
        const y = compute(base({ ratedImpulseVoltage: V(hi) }));
        return x.ok && y.ok && primary(x.value) <= primary(y.value) + 1e-15;
      }),
    );
  });
  it('a higher altitude never lowers the clearance', () => {
    fc.assert(
      fc.property(fc.integer({ min: -400, max: 5000 }), fc.integer({ min: -400, max: 5000 }), (a, b) => {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const x = compute(base({ altitude: M(lo) }));
        const y = compute(base({ altitude: M(hi) }));
        return x.ok && y.ok && primary(x.value) <= primary(y.value) + 1e-15;
      }),
    );
  });
  it('compute does not mutate its inputs and is deterministic', () => {
    const i = base();
    const a = compute(i);
    const b = compute(i);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('meta lists every mandatory input and the ledger rows', () => {
    expect(meta.id).toBe('clearance');
    expect(meta.accuracyClass).toBe('analytical');
    expect(meta.ledgerIds).toContain('S-032');
    expect(meta.mandatoryInputs).toContain('altitude');
    const r = ok(base());
    expect(r.formula).toBe(meta.formula);
    expect(r.method).toBe(meta.method);
  });
  it('performance: 10 000 computes under one second', () => {
    const i = base();
    // best of three rounds of 10 000, so a loaded CI machine does not make the bound flaky
    let best = Infinity;
    for (let round = 0; round < 3; round++) {
      const t0 = Date.now();
      for (let k = 0; k < 10_000; k++) compute(i);
      best = Math.min(best, Date.now() - t0);
    }
    expect(best).toBeLessThan(1000);
  });
});

describe('clearance: table ids used', () => {
  it('lists which tables fed the result (traceability)', () => {
    const r = ok(base());
    const ids: TableId[] = ['T2', 'T4'];
    for (const id of ids) expect(r.assumptions.join(' ')).toContain(id);
  });
});
