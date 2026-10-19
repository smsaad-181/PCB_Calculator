import { describe, expect, it } from 'vitest';
import { importSpacingTables, lookupGrid, parseSpacingTable, ruleIsChecked, ruleValueSi, unitFactorSi, findRule, findGroupForCti, makeTableSet, SHIPPED_TABLES } from './tables';
import type { TableId } from './tables';
import { rawSynthetic, synthTable } from './synthetic-tables.testutil';
import type { Rec } from './synthetic-tables.testutil';

// SYNTHETIC TEST DATA, not from any standard. Malformed-shape coverage for the strict table validator: every case must be
// refused with at least one message and never throw.

const msg = (r: { ok: boolean; error?: string[] }): string => (r.ok ? '' : (r.error ?? []).join(' | '));
const refused = (id: TableId, over: Rec, contains: string, o: { verified?: boolean } = {}): void => {
  const r = parseSpacingTable({ ...rawSynthetic(id, o), ...over });
  expect(r.ok, `${id} ${JSON.stringify(over).slice(0, 80)}`).toBe(false);
  expect(msg(r)).toContain(contains);
};
const first = (id: TableId, key: string): Rec => (rawSynthetic(id)[key] as Rec[])[0] as Rec;
const rest = (id: TableId, key: string): Rec[] => (rawSynthetic(id)[key] as Rec[]).slice(1);

describe('validator: wrong container types and element types', () => {
  it.each([
    ['rows', 'x', 'rows must be an array'],
    ['columns', 'x', 'columns must be an array'],
    ['cells', 'x', 'cells must be an array'],
    ['notes', 'x', 'notes must be'],
    ['notes', [5], 'notes must be'],
    ['ledgerIds', 'S-030b', 'ledgerIds'],
    ['units', 'mm', 'units must be an object'],
    ['entered', 'yes', 'entered must be true or false'],
    ['bannerRequired', 'yes', 'bannerRequired must be true or false'],
    ['source', 5, 'source must be a string'],
    ['standard', 'IPC-2221', 'standard for T2'],
    ['enteredDate', '2026-02-30', 'enteredDate'],
    ['clause', 'x'.repeat(2001), 'too long'],
  ])('T2 %s = %j is refused', (key, value, text) => {
    refused('T2', { [key]: value }, text);
  });
  it.each([
    ['rows', [5], 'rows[0] must be an object'],
    ['rows', [{ key: 'a', value: 'x' }], 'finite number'],
    ['rows', [{ key: 'a', value: 1, perVolt: 'yes' }], 'perVolt'],
    ['rows', [{ key: 'a', value: 1e12 }], 'unit slip'],
    ['columns', [5], 'columns[0] must be an object'],
    ['columns', [{ key: 'a', selectors: 'x' }], 'selectors must be an object'],
    ['columns', [{ key: 'a', selectors: { bogus: 1 } }], 'not used by table'],
    ['cells', [5], 'cells[0] must be an object'],
    ['groups', [first('T6', 'groups')], 'does not use groups'],
    ['rules', [first('T7', 'rules')], 'does not use rules'],
  ])('T2 %s = %j is refused', (key, value, text) => {
    refused('T2', { [key]: value }, text);
  });
  it('too many rows, columns, groups, rules, notes, ledger ids', () => {
    const rows = Array.from({ length: 201 }, (_, i) => ({ key: String(i), value: i + 1 }));
    refused('T2', { rows }, 'too many rows');
    const columns = Array.from({ length: 101 }, (_, i) => ({ key: String(i), selectors: {} }));
    refused('T2', { columns }, 'too many columns');
    refused('T2', { notes: Array.from({ length: 51 }, () => 'n') }, 'notes must be');
    refused('T2', { ledgerIds: Array.from({ length: 21 }, () => 'S-030b') }, 'too many entries');
    const groups = Array.from({ length: 21 }, () => first('T6', 'groups'));
    refused('T6', { groups }, 'too many groups');
    const rules = Array.from({ length: 51 }, () => first('T7', 'rules'));
    refused('T7', { rules }, 'too many rules');
  });
  it('T1, T4 and T6 kind mismatches', () => {
    refused('T6', { cells: [first('T2', 'cells')] }, 'does not use');
    refused('T6', { rows: [{ key: 'a', value: 1 }] }, 'does not use rows');
    refused('T7', { groups: [first('T6', 'groups')] }, 'does not use groups');
    refused('T1', { rules: [first('T7', 'rules')] }, 'does not use rules');
  });
  it('cell provenance variants', () => {
    const c = first('T2', 'cells');
    const withCell = (over: Rec): ReturnType<typeof parseSpacingTable> => parseSpacingTable({ ...rawSynthetic('T2'), cells: [{ ...c, ...over }, ...rest('T2', 'cells')] });
    expect(msg(withCell({ checkedBy: 'x' }))).toContain('both be given');
    expect(msg(withCell({ checkedDate: '2026-01-02' }))).toContain('both be given');
    expect(msg(withCell({ checkedBy: 'x', checkedDate: 'bad' }))).toContain('checkedDate');
    expect(msg(withCell({ page: 'x'.repeat(3000) }))).toContain('too long');
    expect(msg(withCell({ page: 'p. 7' }))).toBe('');
    expect(msg(withCell({ unit: 'mil', value: 1 }))).toBe('');
    expect(msg(withCell({ unit: undefined }))).toContain('unit');
    expect(msg(withCell({ value: 'x' }))).toContain('value');
    expect(msg(withCell({ row: undefined }))).toContain('row');
  });
  it('T4 cell below the structural minimum and a per-volt cell with the wrong unit', () => {
    const t4 = rawSynthetic('T4');
    const c = (t4['cells'] as Rec[])[0] as Rec;
    expect(msg(parseSpacingTable({ ...t4, cells: [{ ...c, value: 0.9 }] }))).toContain('structural minimum');
    const t8 = rawSynthetic('T8');
    const pv = (t8['cells'] as Rec[]).find((x) => x['row'] === 'per volt') as Rec;
    expect(msg(parseSpacingTable({ ...t8, cells: [{ ...pv, unit: 'mm' }] }))).toContain('not allowed here');
    expect(msg(parseSpacingTable({ ...t8, cells: [{ ...pv, value: 5000 }] }))).toContain('unit slip');
  });
});

describe('validator: T6 and T7 shapes', () => {
  const g = (over: Rec): ReturnType<typeof parseSpacingTable> => parseSpacingTable({ ...rawSynthetic('T6'), groups: [{ ...first('T6', 'groups'), ...over }] });
  const r = (id: string, over: Rec): ReturnType<typeof parseSpacingTable> => {
    const rule = (rawSynthetic('T7')['rules'] as Rec[]).find((x) => x['rule'] === id) as Rec;
    return parseSpacingTable({ ...rawSynthetic('T7'), rules: [{ ...rule, ...over }] });
  };
  it('groups', () => {
    expect(msg(g({ unit: 'mV' }))).toContain('unit must be "V"');
    expect(msg(g({ ctiMax: 10, maxInclusive: undefined }))).toContain('maxInclusive');
    expect(msg(g({ maxInclusive: true }))).toContain('without ctiMax');
    expect(msg(g({ ctiMin: 'x' }))).toContain('ctiMin');
    expect(msg(g({ ctiMin: 5, minInclusive: false, ctiMax: 9, maxInclusive: false }))).toBe('');
    expect(msg(parseSpacingTable({ ...rawSynthetic('T6'), groups: [5] }))).toContain('groups[0] must be an object');
    expect(msg(parseSpacingTable({ ...rawSynthetic('T6'), groups: 'x' }))).toContain('groups must be an array');
  });
  it('rules', () => {
    expect(msg(r('reinforced-creepage-multiplier', { unit: 'V' }))).toContain('unit must be "1"');
    expect(msg(r('reinforced-clearance', { value: 3 }))).toContain('must be absent');
    expect(msg(r('reinforced-clearance', { mode: 'multiplier', value: 3, unit: 'V' }))).toContain('unit must be "1"');
    expect(msg(r('reinforced-clearance', { mode: 'multiplier', value: 3, unit: '1', series: undefined }))).toBe('');
    expect(msg(r('scope-max-frequency', { value: 0 }))).toContain('value');
    expect(msg(r('scope-max-frequency', { value: 1e30 }))).toContain('unit slip');
    expect(msg(r('scope-max-voltage-dc', { unit: 'A' }))).toContain('unit must be one of');
    expect(msg(r('scope-max-voltage-dc', { value: 0 }))).toContain('value');
    expect(msg(r('scope-max-voltage-dc', { value: 1e30 }))).toContain('unit slip');
    expect(msg(r('scope-max-voltage-ac-rms', { unit: 'kV', value: 5 }))).toBe('');
    expect(msg(r('coating-credit', { value: 0 }))).toContain('value');
    expect(msg(r('coating-credit', { unit: 'V' }))).toContain('unit must be "1"');
    expect(msg(r('scope-max-frequency', { checkedBy: 'x' }))).toContain('both be given');
    expect(msg(parseSpacingTable({ ...rawSynthetic('T7'), rules: [5] }))).toContain('rules[0] must be an object');
    expect(msg(parseSpacingTable({ ...rawSynthetic('T7'), rules: 'x' }))).toContain('rules must be an array');
    expect(msg(r('scope-max-frequency', { page: 'x'.repeat(3000) }))).toContain('too long');
  });
  it('elevation breakpoint shape', () => {
    const t8 = rawSynthetic('T8');
    const bp = t8['elevationBreakpoint'] as Rec;
    expect(msg(parseSpacingTable({ ...t8, elevationBreakpoint: 5 }))).toContain('must be an object');
    expect(msg(parseSpacingTable({ ...t8, elevationBreakpoint: { ...bp, extra: 1 } }))).toContain('unknown key');
    expect(msg(parseSpacingTable({ ...t8, elevationBreakpoint: { ...bp, printed: '' } }))).toContain('printed');
    expect(msg(parseSpacingTable({ ...t8, elevationBreakpoint: { ...bp, unit: 'km', value: 3 } }))).toBe('');
  });
  it('verified tables need the breakpoint and rules checked too', () => {
    const t8 = rawSynthetic('T8', { verified: true });
    const bp = t8['elevationBreakpoint'] as Rec;
    const { checkedBy: _c, ...noCheck } = bp;
    void _c;
    expect(msg(parseSpacingTable({ ...t8, elevationBreakpoint: noCheck }))).toContain('checkedBy');
    const t7 = rawSynthetic('T7', { verified: true });
    const rules = (t7['rules'] as Rec[]).map((x, i) => {
      if (i !== 0) return x;
      const { checkedBy: _d, checkedDate: _e, ...r } = x;
      void _d;
      void _e;
      return r;
    });
    expect(msg(parseSpacingTable({ ...t7, rules }))).toContain('checkedBy');
    const t6 = rawSynthetic('T6', { verified: true });
    const groups = (t6['groups'] as Rec[]).map((x, i) => {
      if (i !== 0) return x;
      const { checkedBy: _d, checkedDate: _e, ...r } = x;
      void _d;
      void _e;
      return r;
    });
    expect(msg(parseSpacingTable({ ...t6, groups }))).toContain('checkedBy');
  });
  it('empty VERIFIED shell and today handling', () => {
    expect(msg(parseSpacingTable({ ...rawSynthetic('T4', { verified: true }), cells: [], entered: false }))).toContain('empty table cannot be VERIFIED');
    expect(msg(parseSpacingTable(rawSynthetic('T4'), { today: 'bad' }))).toContain('today');
    expect(msg(parseSpacingTable(rawSynthetic('T4'), { today: '2026-10-19' }))).toBe('');
    expect(msg(parseSpacingTable({ ...rawSynthetic('T4'), verifiedDate: '2027-01-01', status: 'UNVERIFIED' }, { today: '2026-10-19' }))).toContain('in the future');
    expect(msg(parseSpacingTable({ ...rawSynthetic('T4'), table: undefined }))).toContain('table must be one of');
  });
});

describe('importer, helpers and lookup edge cases', () => {
  it('importer rejects a non-string, a bad base, a wrong bundle schema and a tables count above eight', () => {
    expect(msg(importSpacingTables(5 as never))).toContain('string');
    expect(msg(importSpacingTables(JSON.stringify(rawSynthetic('T4')), { base: { tables: SHIPPED_TABLES.tables } as never }))).toContain('base');
    expect(msg(importSpacingTables(JSON.stringify({ schema: 'x', schemaVersion: 1, tables: [rawSynthetic('T4')] })))).toContain('bundle schema');
    const nine = Array.from({ length: 9 }, () => rawSynthetic('T4'));
    expect(msg(importSpacingTables(JSON.stringify({ schema: 'pcb-calc/safety-table-set@1', schemaVersion: 1, tables: nine })))).toContain('more tables than exist');
    const label = importSpacingTables(JSON.stringify({ schema: 'pcb-calc/safety-table-set@1', schemaVersion: 1, tables: [5] }));
    expect(msg(label)).toContain('table #1');
  });
  it('unit and rule helpers', () => {
    expect(unitFactorSi('mm')).toBe(1e-3);
    expect(unitFactorSi('mil')).toBeCloseTo(25.4e-6, 15);
    expect(unitFactorSi('furlong')).toBeUndefined();
    const t7 = synthTable('T7');
    const f = findRule(t7, 'scope-max-frequency');
    expect(f && ruleValueSi(f)).toBe(7000);
    expect(f && ruleIsChecked(f)).toBe(false);
    const rf = findRule(synthTable('T7', { verified: true }), 'reinforced-clearance');
    expect(rf && ruleValueSi(rf)).toBeUndefined();
    expect(rf && ruleIsChecked(rf)).toBe(true);
  });
  it('lookup guards: wrong table kind, bad request, T6 misuse, km rows, edition-less requests', () => {
    expect(lookupGrid(synthTable('T6'), { rowSi: 1, selectors: {}, edition: 'SYNTH-ED-1' })).toMatchObject({ ok: false, reason: 'BAD_REQUEST' });
    expect(lookupGrid(synthTable('T4'), { selectors: {}, edition: 'SYNTH-ED-1' })).toMatchObject({ ok: false, reason: 'BAD_REQUEST' });
    expect(lookupGrid(synthTable('T4'), { rowSi: Number.NaN, selectors: {}, edition: 'SYNTH-ED-1' })).toMatchObject({ ok: false, reason: 'BAD_REQUEST' });
    expect(findGroupForCti(synthTable('T2'), 5, 'SYNTH-ED-1')).toMatchObject({ ok: false, reason: 'BAD_REQUEST' });
    expect(findGroupForCti(synthTable('T6'), Number.NaN, 'SYNTH-ED-1')).toMatchObject({ ok: false, reason: 'BAD_REQUEST' });
    const km = rawSynthetic('T4');
    const rows = (km['rows'] as Rec[]).map((r) => ({ ...r, value: (r['value'] as number) / 1000 }));
    const p = parseSpacingTable({ ...km, rows, units: { row: 'km', cell: '1' } });
    expect(p.ok).toBe(true);
    if (p.ok) expect(lookupGrid(p.value, { rowSi: 2000, selectors: {}, edition: 'SYNTH-ED-1' })).toMatchObject({ ok: true, valueSi: 2 });
    expect(lookupGrid(synthTable('T4'), { rowSi: 2000, selectors: {}, edition: undefined as never })).toMatchObject({ ok: false, reason: 'EDITION' });
  });
  it('a bounds-exclusive CTI group and a one-sided group', () => {
    const raw6 = rawSynthetic('T6');
    const groups = [
      { ...(raw6['groups'] as Rec[])[0], ctiMin: 90, minInclusive: false },
      { ...(raw6['groups'] as Rec[])[1], ctiMin: 50, minInclusive: true, ctiMax: 90, maxInclusive: false },
    ];
    const p = parseSpacingTable({ ...raw6, groups });
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(findGroupForCti(p.value, 90, 'SYNTH-ED-1')).toMatchObject({ ok: false });
      expect(findGroupForCti(p.value, 91, 'SYNTH-ED-1')).toMatchObject({ ok: true, group: 'I' });
      expect(findGroupForCti(p.value, 89, 'SYNTH-ED-1')).toMatchObject({ ok: true, group: 'II' });
    }
    const only = parseSpacingTable({ ...raw6, groups: [{ ...(raw6['groups'] as Rec[])[0], ctiMin: undefined, minInclusive: undefined, ctiMax: 40, maxInclusive: false }] });
    expect(only.ok).toBe(true);
    if (only.ok) expect(findGroupForCti(only.value, 39, 'SYNTH-ED-1')).toMatchObject({ ok: true });
  });
  it('makeTableSet with a base set keeps its tables', () => {
    const a = makeTableSet({ T4: synthTable('T4') });
    expect(a.ok).toBe(true);
    if (a.ok) {
      const b = makeTableSet({ T2: synthTable('T2') }, a.value);
      expect(b.ok && b.value.tables.T4.cells.length > 0).toBe(true);
    }
  });
});
