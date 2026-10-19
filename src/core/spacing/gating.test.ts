import { describe, expect, it } from 'vitest';
import { DIM, q } from '../units';
import type { Quantity } from '../units';
import { compute as clearance } from '../calculators/clearance/calc';
import type { Inputs as ClearanceInputs } from '../calculators/clearance/calc';
import { compute as creepage } from '../calculators/creepage/calc';
import type { Inputs as CreepageInputs } from '../calculators/creepage/calc';
import { compute as ipc } from '../calculators/ipc-spacing/calc';
import type { Inputs as IpcInputs } from '../calculators/ipc-spacing/calc';
import {
  Collector,
  checkScope,
  coatingDecision,
  insufficientData,
  lookupError,
  provenanceLine,
  readEdition,
  readFlag,
  readPollution,
  readQuantity,
  readTables,
  readWorkingVoltage,
  requiredDataError,
  rulesEditionError,
  scopeTable,
  waveformFrequencyError,
  withWaveformRow,
} from './gating';
import { dcPlusSine, pulseRms, voltageFromWaveform } from './waveform';
import { COATING_RULE_KIND, SHIPPED_TABLES, lookupGrid, makeTableSet, parseSpacingTable } from './tables';
import { rawSynthetic, synthSet, synthTable } from './synthetic-tables.testutil';
import type { Rec } from './synthetic-tables.testutil';

// SYNTHETIC TEST DATA, not from any standard. Edge cases of the shared gate and the waveform guards.

const ED = 'SYNTH-ED-1';
const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const MM = (n: number): Quantity => q(n * 1e-3, DIM.LENGTH);
const HZ = (n: number): Quantity => q(n, DIM.FREQUENCY);

const cl = (over: Partial<ClearanceInputs> = {}): ClearanceInputs => ({
  tables: synthSet(),
  edition: ED,
  insulationType: 'basic',
  ratedImpulseVoltage: V(2000),
  pollutionDegree: 2,
  fieldCondition: 'inhomogeneous',
  altitude: q(0, DIM.LENGTH),
  workingVoltagePeak: V(300),
  frequency: HZ(50),
  ...over,
});
const cr = (over: Partial<CreepageInputs> = {}): CreepageInputs => ({
  tables: synthSet(),
  edition: ED,
  insulationType: 'basic',
  workingVoltageRms: V(150),
  pollutionDegree: 2,
  materialGroup: 'I',
  surface: 'other',
  frequency: HZ(50),
  associatedClearance: MM(5),
  ...over,
});
const ip = (over: Partial<IpcInputs> = {}): IpcInputs => ({ tables: synthSet(['T8']), edition: ED, voltagePeak: V(15), location: 'internal', ...over });

describe('waveform guard edge cases', () => {
  it('overflow, malformed quantities and a bad peak are refused as values', () => {
    expect(voltageFromWaveform('sine', 'rms', { si: 1.7e308, dim: DIM.VOLTAGE } as Quantity).ok).toBe(false);
    expect(dcPlusSine({ si: 1.7e308, dim: DIM.VOLTAGE } as Quantity, { si: 1.7e308, dim: DIM.VOLTAGE } as Quantity).ok).toBe(false);
    expect(voltageFromWaveform('sine', 'rms', 'abc' as never).ok).toBe(false);
    expect(voltageFromWaveform('sine', 'rms', null as never).ok).toBe(false);
    expect(voltageFromWaveform('sine', 'rms', { si: 1, dim: {} } as never)).toMatchObject({ ok: false, error: { code: 'DIMENSION' } });
    expect(pulseRms({ si: -1, dim: DIM.VOLTAGE } as Quantity, 0.5).ok).toBe(false);
  });
});

describe('gate readers and collector', () => {
  it('quantity with a malformed dimension is a DIMENSION error', () => {
    expect(readQuantity({ x: { si: 1, dim: {} } }, 'x', DIM.VOLTAGE, 'voltage')).toMatchObject({ kind: 'error', error: { code: 'DIMENSION' } });
    expect(readQuantity({ x: 5 }, 'x', DIM.VOLTAGE, 'voltage')).toMatchObject({ kind: 'error', error: { code: 'INVALID_INPUT' } });
    expect(readQuantity({}, 'x', DIM.VOLTAGE, 'voltage')).toEqual({ kind: 'missing' });
    expect(readQuantity({ x: { si: -1, dim: DIM.VOLTAGE } }, 'x', DIM.VOLTAGE, 'voltage', { allowZero: true })).toMatchObject({ kind: 'error' });
    expect(readQuantity({ x: { si: -1, dim: DIM.VOLTAGE } }, 'x', DIM.VOLTAGE, 'voltage', { allowNegative: true })).toMatchObject({ kind: 'ok' });
  });
  it('edition, pollution degree and flag readers', () => {
    expect(readEdition({ edition: 'x'.repeat(201) })).toMatchObject({ kind: 'error' });
    expect(readEdition({ edition: ' A ' })).toEqual({ kind: 'ok', value: 'A' });
    expect(readPollution({ pollutionDegree: 3 })).toEqual({ kind: 'ok', value: 3 });
    expect(readFlag({ f: 'x' }, 'f')).toMatchObject({ kind: 'error' });
    expect(readFlag({ f: true }, 'f')).toEqual({ kind: 'ok', value: true });
    expect(readFlag({}, 'f')).toEqual({ kind: 'ok', value: false });
    expect(readTables({ tables: 5 })).toMatchObject({ ok: false });
    expect(readTables({})).toMatchObject({ ok: true });
  });
  it('the collector keeps the FIRST invalid value and lists missing names', () => {
    const c = new Collector();
    c.take(readQuantity({ a: 5 }, 'a', DIM.VOLTAGE, 'voltage'), 'a');
    c.take(readQuantity({ b: 6 }, 'b', DIM.LENGTH, 'length'), 'b');
    c.opt(readQuantity({ c: 7 }, 'c', DIM.LENGTH, 'length'));
    c.note({ code: 'INVALID_INPUT', message: 'later' });
    c.take(readQuantity({}, 'd', DIM.LENGTH, 'length'), 'd');
    expect(c.error?.field).toBe('a');
    expect(c.missing).toEqual(['d']);
  });
  it('working voltage: direct plus waveform is refused; a bad waveform basis or value names its field', () => {
    const c = new Collector();
    readWorkingVoltage({ peak: V(10), waveform: { shape: 'sine', basis: 'rms', value: V(5) } }, c, { peak: 'peak', rms: 'rms' });
    expect(c.error?.field).toBe('waveform');
    const b = new Collector();
    readWorkingVoltage({ waveform: { shape: 'sine', basis: 'mean', value: V(5) } }, b, { peak: 'peak', rms: 'rms' });
    expect(b.error?.field).toBe('waveform.basis');
    const v = new Collector();
    readWorkingVoltage({ waveform: { shape: 'sine', basis: 'rms', value: V(-5) } }, v, { peak: 'peak', rms: 'rms' });
    expect(v.error?.field).toBe('waveform.value');
    const s = new Collector();
    readWorkingVoltage({ waveform: { shape: 'pulse', basis: 'rms', value: V(5) } }, s, { peak: 'peak', rms: 'rms' });
    expect(s.error?.field).toBe('waveform.shape');
  });
  it('error mapping: bad request is INVALID_INPUT, anything else INSUFFICIENT_DATA, above table OUT_OF_SCOPE', () => {
    expect(lookupError({ ok: false, reason: 'BAD_REQUEST', message: 'm' }).code).toBe('INVALID_INPUT');
    expect(lookupError({ ok: false, reason: 'NO_CELL', message: 'm' }).gate).toBe('INSUFFICIENT_DATA');
    expect(lookupError({ ok: false, reason: 'ABOVE_TABLE', message: 'm' }).gate).toBe('OUT_OF_SCOPE');
    expect(insufficientData(['a', 'b']).message).toBe('a; b');
  });
});

describe('scope, coating, provenance helpers', () => {
  const t7 = synthTable('T7');
  it('a frequency above zero with no recorded T7 limit is a refusal naming T7 (not a warning)', () => {
    const none = checkScope(SHIPPED_TABLES.tables.T7, { frequencyHz: 100 });
    expect(none.refusal?.gate).toBe('INSUFFICIENT_DATA');
    expect(none.refusal?.message).toContain('rule "scope-max-frequency" is not entered in table T7');
    expect(checkScope(SHIPPED_TABLES.tables.T7, { frequencyHz: 0 }).refusal).toBeUndefined();
  });
  it('DC working voltage within the recorded limit passes and is recorded as a check', () => {
    const s = checkScope(t7, { frequencyHz: 0, peakV: 100 });
    expect(s.refusal).toBeUndefined();
    expect(s.checks.some((c) => /DC working voltage/.test(c.name))).toBe(true);
    const a = checkScope(t7, { frequencyHz: 50, rmsV: 100 });
    expect(a.checks.some((c) => /rms working voltage/.test(c.name))).toBe(true);
    const unknown = checkScope(t7, { frequencyHz: 50 });
    expect(unknown.unchecked).toContain('voltage scope not checked');
  });
  it('a T7 of another edition is refused; an empty T7 is not consulted', () => {
    expect(rulesEditionError(t7, 'OTHER')?.gate).toBe('INSUFFICIENT_DATA');
    expect(rulesEditionError(t7, ED)).toBeUndefined();
    expect(rulesEditionError(SHIPPED_TABLES.tables.T7, 'OTHER')).toBeUndefined();
  });
  it('coating decision: none, missing record, unverified record, scope of the record', () => {
    expect(coatingDecision(t7, 'none', 'creepage')).toMatchObject({ applied: false, factor: 1 });
    expect(coatingDecision(t7, 'type2', 'creepage').warnings[0]?.code).toBe('COATING_CREDIT_NOT_APPLIED');
    expect(coatingDecision(t7, 'type1', 'creepage').applied).toBe(false);
    const v7 = synthTable('T7', { verified: true });
    expect(coatingDecision(v7, 'type1', 'creepage').applied).toBe(true);
    // a record that does not state its scope is a creepage rule only
    const d = coatingDecision(v7, 'type1', 'clearance');
    expect(d.applied).toBe(false);
    expect(d.warnings[0]?.message).toContain('creepage only');
    expect(d.warnings[0]?.message).toContain(COATING_RULE_KIND);
    expect(coatingDecision(v7, 'type1', 'creepage').note).toContain(COATING_RULE_KIND);
  });
  it('requiredDataError lists empty tables and the missing T7 frequency limit when a frequency above zero is given', () => {
    const empty = SHIPPED_TABLES.tables;
    expect(requiredDataError([empty.T2], empty.T7, 0)?.message).toBe('INSUFFICIENT DATA: table T2 clearance to withstand transient overvoltages is empty (enter values from your licensed copy)');
    expect(requiredDataError([], empty.T7, 0)).toBeUndefined();
    const withF = requiredDataError([empty.T2], empty.T7, 50);
    expect(withF?.gate).toBe('INSUFFICIENT_DATA');
    expect(withF?.message).toContain('table T2');
    expect(withF?.message).toContain('rule "scope-max-frequency" is not entered in table T7');
    // when T7 is itself listed as empty it is not named twice
    expect(requiredDataError([empty.T7], empty.T7, 50)?.message).toBe('INSUFFICIENT DATA: table T7 rule records is empty (enter values from your licensed copy)');
    expect(requiredDataError([], t7, 50)).toBeUndefined();
    expect(requiredDataError([], t7, 0)).toBeUndefined();
  });
  it('scopeTable consults T7 only when needed; a T7 of another edition is then left out (voltage scope reads not checked)', () => {
    const other = synthTable('T7', { edition: 'OTHER' });
    expect(scopeTable(other, ED, true).error?.gate).toBe('INSUFFICIENT_DATA');
    const ignored = scopeTable(other, ED, false);
    expect(ignored.error).toBeUndefined();
    expect(ignored.table).toBe(SHIPPED_TABLES.tables.T7);
    expect(scopeTable(t7, ED, false)).toEqual({ table: t7 });
    expect(scopeTable(t7, ED, true)).toEqual({ table: t7 });
  });
  it('withWaveformRow adds S-035 only for a declared waveform', () => {
    expect(withWaveformRow(['S-030'], false)).toEqual(['S-030']);
    expect(withWaveformRow(['S-030'], true)).toEqual(['S-030', 'S-035']);
  });
  it('frequency 0 Hz means DC: a non-DC shape is refused, a DC shape or no shape is not', () => {
    expect(waveformFrequencyError('sine', 0)?.message).toContain('frequency 0 Hz means DC');
    expect(waveformFrequencyError('sine', 0)?.field).toBe('frequency');
    expect(waveformFrequencyError('dc', 0)).toBeUndefined();
    expect(waveformFrequencyError(undefined, 0)).toBeUndefined();
    expect(waveformFrequencyError('sine', 50)).toBeUndefined();
  });
  it('a declared DC waveform with a frequency above 0 is refused: DC means 0 Hz', () => {
    const e = waveformFrequencyError('dc', 50);
    expect(e?.code).toBe('INVALID_INPUT');
    expect(e?.field).toBe('frequency');
    expect(e?.message).toContain('DC means 0 Hz');
    expect(waveformFrequencyError('dc', 1e-3)?.message).toContain('DC means 0 Hz');
  });
  it('provenance line without cells and with a checked cell', () => {
    const t = synthTable('T4', { verified: true });
    const l = lookupGrid(t, { rowSi: 1000, selectors: {}, edition: ED });
    if (!l.ok) throw new Error('lookup');
    expect(provenanceLine(t, l)).toContain('checked by test-checker');
    expect(provenanceLine(t, { ...l, cells: [] })).not.toContain('printed');
  });
});

describe('calculator paths not reached elsewhere', () => {
  it('clearance: T1 and T3 lookups can fail; the reinforced multiplier mode no longer exists; a hostile input object never throws', () => {
    const noImp = (o: Partial<ClearanceInputs>) => cl({ ratedImpulseVoltage: undefined as never, overvoltageCategory: 'II', ...o });
    const a = clearance(noImp({ supplyVoltage: V(500) }));
    expect(!a.ok && a.error.gate).toBe('OUT_OF_SCOPE');
    const b = clearance(cl({ workingVoltagePeak: V(4000) }));
    expect(!b.ok && b.error.gate).toBe('OUT_OF_SCOPE');
    const rawT7 = rawSynthetic('T7');
    const multMode = parseSpacingTable({
      ...rawT7,
      rules: (rawT7['rules'] as Rec[]).map((r) => (r['rule'] === 'reinforced-clearance' ? { ...r, mode: 'multiplier', value: 4, unit: '1', series: undefined } : r)),
    });
    expect(multMode.ok).toBe(false);
    if (!multMode.ok) expect(multMode.error.join(' ')).toContain('mode must be "next-preferred-impulse-step"');
    const boom = new Proxy({}, { get: () => { throw new Error('boom'); } });
    const out = clearance(boom as never);
    expect(!out.ok && out.error.code).toBe('INTERNAL');
    const out2 = creepage(boom as never);
    expect(!out2.ok && out2.error.code).toBe('INTERNAL');
    const out3 = ipc(boom as never);
    expect(!out3.ok && out3.error.code).toBe('INTERNAL');
  });
  it('clearance: a T7 of another edition and both voltage routes are refused; the declared waveform is echoed', () => {
    const other = makeTableSet({ T2: synthTable('T2'), T4: synthTable('T4'), T7: synthTable('T7', { edition: 'OTHER-ED' }) });
    if (!other.ok) throw new Error(other.error.join('; '));
    expect(clearance(cl({ tables: other.value })).ok).toBe(false);
    const both = clearance(cl({ waveform: { shape: 'sine', basis: 'rms', value: V(100) } }));
    expect(!both.ok && both.error.field).toBe('waveform');
    const w = clearance(cl({ workingVoltagePeak: undefined as never, waveform: { shape: 'triangle', basis: 'peak', value: V(100) } }));
    expect(w.ok && w.value.inputs.find((i) => i.name === 'working voltage (peak)')?.sourceDetail).toContain('triangle');
    const sm = clearance(cl({ soldermask: true, workingVoltageRms: V(100) }));
    expect(sm.ok && sm.value.warnings.some((x) => x.code === 'SOLDERMASK_DECLARED')).toBe(true);
    expect(sm.ok && sm.value.inputs.some((i) => i.name === 'working voltage (rms)')).toBe(true);
  });
  it('clearance: functional insulation with no assumptions beyond the default texts', () => {
    const r = clearance(cl({ insulationType: 'supplementary', coatingCredit: 'none' }));
    expect(r.ok && r.value.assumptions.some((a) => /No coating credit applied/.test(a))).toBe(true);
  });
  it('creepage: invalid tables, invalid flag, CTI with verified T6 (checked-by text), a peak echoed, waveform shape echoed', () => {
    expect(creepage(cr({ tables: 5 as never })).ok).toBe(false);
    expect(creepage({ ...cr(), soldermask: 'yes' } as never).ok).toBe(false);
    const verified = synthSet(undefined, { verified: true });
    const r = creepage(cr({ tables: verified, materialGroup: undefined as never, cti: V(95), workingVoltagePeak: V(212) }));
    expect(r.ok && r.value.assumptions.join(' ')).toContain('checked by test-checker');
    expect(r.ok && r.value.inputs.some((i) => i.name === 'working voltage (peak)')).toBe(true);
    const w = creepage(cr({ workingVoltageRms: undefined as never, waveform: { shape: 'square', basis: 'rms', value: V(150) } }));
    expect(w.ok && w.value.inputs.find((i) => i.name === 'working voltage (rms)')?.sourceDetail).toContain('square');
    const sm = creepage(cr({ soldermask: true }));
    expect(sm.ok && sm.value.warnings.some((x) => x.code === 'SOLDERMASK_DECLARED')).toBe(true);
    const insul = creepage(cr({ insulationType: 'functional', coatingCredit: 'none' }));
    expect(insul.ok && insul.value.assumptions.some((a) => /No coating credit applied/.test(a))).toBe(true);
    const other = makeTableSet({ T5: synthTable('T5'), T7: synthTable('T7', { edition: 'OTHER-ED' }) });
    if (!other.ok) throw new Error(other.error.join('; '));
    expect(creepage(cr({ tables: other.value })).ok).toBe(false);
  });
  it('ipc: invalid tables, a breakpoint in km, columns that do not use a breakpoint', () => {
    expect(ipc(ip({ tables: 5 as never })).ok).toBe(false);
    const raw8 = rawSynthetic('T8');
    const km = parseSpacingTable({ ...raw8, elevationBreakpoint: { ...(raw8['elevationBreakpoint'] as Rec), value: 3, unit: 'km' } });
    if (!km.ok) throw new Error(km.error.join('; '));
    const setKm = makeTableSet({ T8: km.value });
    if (!setKm.ok) throw new Error(setKm.error.join('; '));
    const ext = (h: number): IpcInputs => ip({ tables: setKm.value, location: 'external', conductorKind: 'bare-board', coating: 'uncoated', elevation: q(h, DIM.LENGTH) });
    const lo = ipc(ext(2999));
    const hi = ipc(ext(3000));
    expect(lo.ok && hi.ok && (lo.value.results[0]?.value.si ?? 0) < (hi.value.results[0]?.value.si ?? 0)).toBe(true);
    // columns without any elevation selector: the elevation is not used
    const cols = (raw8['columns'] as Rec[]).map((c) => ({ key: c['key'], selectors: { location: 'external', conductorKind: 'bare-board', coating: c['key'] === 'B4' ? 'permanent-polymer-or-solder-mask' : 'uncoated' } }));
    const flat = parseSpacingTable({ ...raw8, columns: [cols[1], cols[3]].map((c, i) => ({ ...c, key: i === 0 ? 'B2' : 'B4' })), cells: (raw8['cells'] as Rec[]).filter((c) => c['col'] === 'B2' || c['col'] === 'B4') });
    if (!flat.ok) throw new Error(flat.error.join('; '));
    const setFlat = makeTableSet({ T8: flat.value });
    if (!setFlat.ok) throw new Error(setFlat.error.join('; '));
    const f = ipc(ip({ tables: setFlat.value, location: 'external', conductorKind: 'bare-board', coating: 'uncoated', elevation: q(10, DIM.LENGTH) }));
    expect(f.ok).toBe(true);
    const vac = ipc(ip({ tables: setFlat.value, location: 'external', conductorKind: 'bare-board', coating: 'uncoated', elevation: 'vacuum' }));
    expect(vac.ok).toBe(false);
  });
  it('ipc: a coating given with an elevation that is not needed is ignored, and a wrong elevation text is refused', () => {
    const e = ipc(ip({ location: 'external', conductorKind: 'bare-board', coating: 'permanent-polymer-or-solder-mask', elevation: q(10, DIM.LENGTH) }));
    expect(e.ok).toBe(true);
    expect(ipc(ip({ location: 'external', conductorKind: 'bare-board', coating: 'uncoated', elevation: 'high' as never })).ok).toBe(false);
  });
});
