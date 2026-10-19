import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MAX_IMPORT_CHARS,
  SHIPPED_TABLES,
  TABLE_IDS,
  dataStateOf,
  emptyTableMessage,
  findGroupForCti,
  findRule,
  importSpacingTables,
  isTableEmpty,
  isTableSet,
  lookupGrid,
  makeTableSet,
  nextPreferredImpulseStep,
  parseSpacingTable,
  ruleSeriesSi,
  serializeTableSet,
} from './tables';
import type { TableId } from './tables';
import { T4_FACTORS, T4_ROWS_M, rawSynthetic, synthSet, synthTable, t2, t5, t8, T8_PER_VOLT_MM } from './synthetic-tables.testutil';
import type { Rec } from './synthetic-tables.testutil';

// SYNTHETIC TEST DATA, not from any standard: every table below is built by synthetic-tables.testutil.ts with fake numbers.
// The shipped tables are EMPTY (human-owned, to be entered from licensed copies), so the shipped-set tests assert emptiness.

const ED = 'SYNTH-ED-1';
const errs = (r: { ok: boolean; error?: string[] }): string => (r.ok ? '' : (r.error ?? []).join(' | '));
const parseOk = (r: ReturnType<typeof parseSpacingTable>) => {
  if (!r.ok) throw new Error(r.error.join('; '));
  return r.value;
};

describe('shipped tables are empty shells (CLAUDE.md: no table value from memory)', () => {
  it.each(TABLE_IDS)('%s is EMPTY, unverified, banner required, no edition entered', (id) => {
    const t = SHIPPED_TABLES.tables[id];
    expect(isTableEmpty(t)).toBe(true);
    expect(dataStateOf(t)).toBe('EMPTY');
    expect(t.status).toBe('PAYWALLED-USER-MUST-VERIFY');
    expect(t.entered).toBe(false);
    expect(t.verifiedBy).toBe('');
    expect(t.bannerRequired).toBe(true);
    expect(t.interpolation).toBe('none');
    expect(t.edition.toLowerCase()).toBe('not entered');
    expect(t.ledgerIds.length).toBeGreaterThan(0);
    expect(t.cells).toHaveLength(0);
    expect(t.groups).toHaveLength(0);
    expect(t.rules).toHaveLength(0);
    expect(t.rows).toHaveLength(0);
  });
  it('the shipped set is a validated table set', () => {
    expect(isTableSet(SHIPPED_TABLES)).toBe(true);
    expect(isTableSet({ tables: SHIPPED_TABLES.tables })).toBe(false);
  });
  it('the empty-table message is exact', () => {
    expect(emptyTableMessage(SHIPPED_TABLES.tables.T2)).toBe(
      'INSUFFICIENT DATA: table T2 clearance to withstand transient overvoltages is empty (enter values from your licensed copy)',
    );
  });
});

describe('parseSpacingTable (strict schema)', () => {
  it.each(TABLE_IDS)('accepts the synthetic %s (unverified and verified forms)', (id) => {
    const a = parseSpacingTable(rawSynthetic(id));
    expect(errs(a)).toBe('');
    expect(a.ok && dataStateOf(a.value)).toBe('ENTERED_UNVERIFIED');
    const b = parseSpacingTable(rawSynthetic(id, { verified: true }));
    expect(errs(b)).toBe('');
    expect(b.ok && dataStateOf(b.value)).toBe('VERIFIED');
  });
  it('rejects non-objects, unknown keys at every level, wrong schema/version/table id', () => {
    expect(parseSpacingTable(null).ok).toBe(false);
    expect(parseSpacingTable([]).ok).toBe(false);
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), extra: 1 }))).toContain('unknown key "extra"');
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), __proto__x: 1 }))).toContain('unknown key');
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), schema: 'x' }))).toContain('schema');
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), schemaVersion: 2 }))).toContain('schemaVersion');
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), table: 'T9' }))).toContain('table');
    const raw = rawSynthetic('T4');
    const cells = (raw['cells'] as Rec[]).map((c) => ({ ...c, bogus: true }));
    expect(errs(parseSpacingTable({ ...raw, cells }))).toContain('unknown key "bogus"');
    const rows = (raw['rows'] as Rec[]).map((c) => ({ ...c, bogus: true }));
    expect(errs(parseSpacingTable({ ...raw, rows }))).toContain('unknown key "bogus"');
    const columns = (raw['columns'] as Rec[]).map((c) => ({ ...c, bogus: true }));
    expect(errs(parseSpacingTable({ ...raw, columns }))).toContain('unknown key "bogus"');
    const t7 = rawSynthetic('T7');
    const rules = (t7['rules'] as Rec[]).map((c) => ({ ...c, bogus: true }));
    expect(errs(parseSpacingTable({ ...t7, rules }))).toContain('unknown key "bogus"');
    const t6 = rawSynthetic('T6');
    const groups = (t6['groups'] as Rec[]).map((c) => ({ ...c, bogus: true }));
    expect(errs(parseSpacingTable({ ...t6, groups }))).toContain('unknown key "bogus"');
  });
  it('a selector key that the table does not use is rejected', () => {
    const raw = rawSynthetic('T4');
    const columns = [{ key: 'factor', selectors: { pollutionDegree: 1 } }];
    expect(errs(parseSpacingTable({ ...raw, columns }))).toContain('selector');
  });
  it('rejects a cell with a missing row/col, a duplicate, a bad unit, a unit slip, zero, NaN', () => {
    const raw = rawSynthetic('T2');
    const cells = raw['cells'] as Rec[];
    const first = cells[0] as Rec;
    const bad = (over: Rec): string => errs(parseSpacingTable({ ...raw, cells: [{ ...first, ...over }, ...cells.slice(1)] }));
    expect(bad({ row: 'nope' })).toContain('row');
    expect(bad({ col: 'nope' })).toContain('column');
    expect(bad({ unit: 'furlong' })).toContain('unit');
    expect(bad({ unit: 'V' })).toContain('unit');
    expect(bad({ value: 0 })).toContain('value');
    expect(bad({ value: -1 })).toContain('value');
    expect(bad({ value: Number.NaN })).toContain('value');
    expect(bad({ value: null })).toContain('value');
    expect(bad({ value: 5000 })).toContain('unit slip');
    expect(bad({ printed: '' })).toContain('printed');
    expect(bad({ enteredBy: '' })).toContain('enteredBy');
    expect(bad({ enteredDate: '2026-13-40' })).toContain('enteredDate');
    expect(errs(parseSpacingTable({ ...raw, cells: [first, ...cells] }))).toContain('duplicate');
  });
  it('requires strictly valid ledger ids that exist, and a known standard', () => {
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), ledgerIds: [] }))).toContain('ledgerIds');
    const unknownId = ['S', '999'].join('-'); // assembled so the repository ledger-reference audit does not read it as a citation
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), ledgerIds: [unknownId] }))).toContain(unknownId);
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), ledgerIds: ['bogus'] }))).toContain('ledgerIds');
  });
  it('status consistency: VERIFIED needs verifiedBy, date, no banner, every record checked', () => {
    const v = rawSynthetic('T4', { verified: true });
    expect(errs(parseSpacingTable({ ...v, verifiedBy: '' }))).toContain('verifiedBy');
    expect(errs(parseSpacingTable({ ...v, verifiedBy: '   ' }))).toContain('verifiedBy');
    expect(errs(parseSpacingTable({ ...v, verifiedDate: '' }))).toContain('verifiedDate');
    expect(errs(parseSpacingTable({ ...v, bannerRequired: true }))).toContain('bannerRequired');
    const cells = (v['cells'] as Rec[]).map((c) => {
      const { checkedBy: _cb, ...rest } = c;
      void _cb;
      return rest;
    });
    expect(errs(parseSpacingTable({ ...v, cells }))).toContain('checkedBy');
    const u = rawSynthetic('T4');
    expect(errs(parseSpacingTable({ ...u, bannerRequired: false }))).toContain('bannerRequired');
    expect(errs(parseSpacingTable({ ...u, verifiedBy: 'someone' }))).toContain('verifiedBy');
    expect(errs(parseSpacingTable({ ...u, status: 'MAYBE' }))).toContain('status');
  });
  it('entered must agree with the data, and an edition is needed with data', () => {
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), entered: false }))).toContain('entered');
    const empty = { ...rawSynthetic('T4'), cells: [], entered: true };
    expect(errs(parseSpacingTable(empty))).toContain('entered');
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), edition: 'not entered' }))).toContain('edition');
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), edition: '' }))).toContain('edition');
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), enteredBy: '' }))).toContain('enteredBy');
  });
  it('interpolation: only none or linear; linear needs the clause that permits it', () => {
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), interpolation: 'cubic' }))).toContain('interpolation');
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), interpolation: 'linear', interpolationSource: '' }))).toContain('interpolationSource');
    expect(errs(parseSpacingTable(rawSynthetic('T4', { interpolation: 'linear' })))).toBe('');
  });
  it('rows: unique keys and values, numeric except the per-volt row (T8 only)', () => {
    const raw = rawSynthetic('T4');
    const rows = raw['rows'] as Rec[];
    expect(errs(parseSpacingTable({ ...raw, rows: [...rows, rows[0]] }))).toContain('duplicate');
    expect(errs(parseSpacingTable({ ...raw, rows: [{ key: 'a', value: 1 }, { key: 'b', value: 1 }] }))).toContain('duplicate');
    expect(errs(parseSpacingTable({ ...raw, rows: [{ key: 'a' }] }))).toContain('value');
    expect(errs(parseSpacingTable({ ...raw, rows: [{ key: 'a', perVolt: true }] }))).toContain('per-volt');
    const t8 = rawSynthetic('T8');
    const r8 = t8['rows'] as Rec[];
    expect(errs(parseSpacingTable({ ...t8, rows: [...r8, { key: 'second', perVolt: true }] }))).toContain('per-volt');
    expect(errs(parseSpacingTable({ ...t8, rows: [{ key: 'x', value: 1, perVolt: true }] }))).toContain('perVolt');
  });
  it('units must be from the table allow-list (T4 rows are altitude, not voltage)', () => {
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), units: { row: 'V', cell: '1' } }))).toContain('units.row');
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), units: { row: 'm', cell: 'mm' } }))).toContain('units.cell');
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), units: { row: 'm' } }))).toContain('units');
  });
  it('T4 factor below 1 is refused as a structural impossibility (more altitude never shrinks a clearance)', () => {
    const raw = rawSynthetic('T4');
    const cells = (raw['cells'] as Rec[]).map((c, i) => (i === 0 ? { ...c, value: 0.5 } : c));
    expect(errs(parseSpacingTable({ ...raw, cells }))).toContain('value');
  });
  it('T6 groups: at least one CTI bound, inclusivity stated, no duplicate group, min <= max', () => {
    const raw = rawSynthetic('T6');
    const g = raw['groups'] as Rec[];
    const bad = (groups: Rec[]): string => errs(parseSpacingTable({ ...raw, groups }));
    expect(bad([{ ...(g[0] as Rec), ctiMin: undefined, minInclusive: undefined }])).toContain('bound');
    expect(bad([{ ...(g[0] as Rec), minInclusive: undefined }])).toContain('minInclusive');
    expect(bad([g[0] as Rec, g[0] as Rec])).toContain('duplicate');
    expect(bad([{ ...(g[1] as Rec), ctiMin: 90, ctiMax: 50 }])).toContain('ctiMin');
    expect(bad([{ ...(g[0] as Rec), group: 'V' }])).toContain('group');
    expect(bad([{ ...(g[0] as Rec), ctiMin: 99999 }])).toContain('unit slip');
  });
  it('T7 rules: closed id list, per-rule shape, one record per rule (coating per type)', () => {
    const raw = rawSynthetic('T7');
    const rules = raw['rules'] as Rec[];
    const bad = (rs: Rec[]): string => errs(parseSpacingTable({ ...raw, rules: rs }));
    const rule = (id: string): Rec => rules.find((r) => r['rule'] === id) as Rec;
    expect(bad([{ ...(rules[0] as Rec), rule: 'groove-credit' }])).toContain('rule');
    expect(bad([{ ...rule('reinforced-creepage-multiplier'), value: 0.5 }])).toContain('value');
    // a multiplier of exactly 1 would make reinforced equal basic silently: refused (strictly greater than 1)
    expect(bad([{ ...rule('reinforced-creepage-multiplier'), value: 1 }])).toContain('greater than 1');
    expect(bad([{ ...rule('reinforced-creepage-multiplier'), value: 1.0000001 }])).toBe('');
    expect(bad([{ ...rule('reinforced-creepage-multiplier'), value: undefined }])).toContain('value');
    // the multiplier mode of reinforced-clearance no longer exists: only the next preferred impulse step
    expect(bad([{ ...rule('reinforced-clearance'), mode: 'multiplier' }])).toContain('mode must be "next-preferred-impulse-step"');
    expect(bad([{ ...rule('reinforced-clearance'), mode: 'multiplier', value: 2, unit: '1', series: undefined }])).toContain('mode must be "next-preferred-impulse-step"');
    expect(bad([{ ...rule('reinforced-clearance'), mode: 'bogus' }])).toContain('mode');
    expect(bad([{ ...rule('reinforced-clearance'), mode: 'next-higher-row', series: undefined }])).toContain('next-preferred-impulse-step');
    expect(bad([{ ...rule('scope-max-frequency'), unit: 'kHz', value: 7 }])).toBe('');
    expect(bad([{ ...rule('scope-max-frequency'), unit: 'V' }])).toContain('unit');
    expect(bad([{ ...rule('coating-credit'), value: 1.5 }])).toContain('value');
    expect(bad([{ ...rule('coating-credit'), coatingType: 'type3' }])).toContain('coatingType');
    expect(bad([rule('coating-credit'), rule('coating-credit')])).toContain('duplicate');
    expect(bad([{ ...rule('scope-max-frequency'), clauseText: '' }])).toContain('clauseText');
    expect(bad([rule('scope-max-frequency'), rule('scope-max-frequency')])).toContain('duplicate');
  });
  it('T7 reinforced-clearance series mode: an ordered, unit-stated, strictly increasing list of impulse voltages', () => {
    const raw = rawSynthetic('T7');
    const base = (raw['rules'] as Rec[]).find((r) => r['rule'] === 'reinforced-clearance') as Rec;
    const bad = (over: Rec): string => errs(parseSpacingTable({ ...raw, rules: [{ ...base, ...over }] }));
    expect(bad({})).toBe('');
    expect(bad({ series: undefined })).toContain('series');
    expect(bad({ series: 'x' })).toContain('series');
    expect(bad({ series: [1] })).toContain('2 to 100');
    expect(bad({ series: Array.from({ length: 101 }, (_, i) => i + 1) })).toContain('2 to 100');
    expect(bad({ series: [1, 'a', 3] })).toContain('finite number');
    expect(bad({ series: [1, 3, 2] })).toContain('strictly increasing');
    expect(bad({ series: [1, 1, 2] })).toContain('strictly increasing');
    expect(bad({ series: [-1, 1, 2] })).toContain('finite number');
    expect(bad({ series: [1, 2, 1e12] })).toContain('unit slip');
    expect(bad({ unit: 'mm' })).toContain('unit must be one of');
    expect(bad({ unit: undefined })).toContain('unit must be one of');
    expect(bad({ value: 3 })).toContain('must be absent');
    expect(bad({ mode: 'multiplier', value: 2, unit: '1' })).toContain('series is only allowed');
    const other = (raw['rules'] as Rec[]).find((r) => r['rule'] === 'scope-max-frequency') as Rec;
    expect(errs(parseSpacingTable({ ...raw, rules: [{ ...other, series: [1, 2] }] }))).toContain('series is only allowed');
  });
  it('T7 reinforced-clearance-steady-state: its own multiplier record, strictly greater than 1', () => {
    const raw = rawSynthetic('T7');
    const base = (raw['rules'] as Rec[]).find((r) => r['rule'] === 'reinforced-clearance-steady-state') as Rec;
    const bad = (over: Rec): string => errs(parseSpacingTable({ ...raw, rules: [{ ...base, ...over }] }));
    expect(bad({})).toBe('');
    expect(bad({ mode: 'next-preferred-impulse-step' })).toContain('mode must be "multiplier"');
    expect(bad({ mode: undefined })).toContain('mode must be "multiplier"');
    expect(bad({ value: 0.5 })).toContain('greater than 1');
    expect(bad({ value: 1 })).toContain('greater than 1');
    expect(bad({ value: 1.5 })).toBe('');
    expect(bad({ unit: 'V' })).toContain('unit must be "1"');
    expect(bad({ series: [1, 2] })).toContain('series is only allowed');
  });
  it('T7 coating-credit multiplier: appliesTo is creepage, clearance or both, and only on that rule', () => {
    const raw = rawSynthetic('T7');
    const base = (raw['rules'] as Rec[]).find((r) => r['rule'] === 'coating-credit') as Rec;
    const bad = (over: Rec): string => errs(parseSpacingTable({ ...raw, rules: [{ ...base, ...over }] }));
    for (const a of ['creepage', 'clearance', 'both']) expect(bad({ appliesTo: a })).toBe('');
    expect(bad({ appliesTo: 'all' })).toContain('appliesTo must be');
    const other = (raw['rules'] as Rec[]).find((r) => r['rule'] === 'scope-max-frequency') as Rec;
    expect(errs(parseSpacingTable({ ...raw, rules: [{ ...other, appliesTo: 'both' }] }))).toContain('appliesTo is only allowed');
    expect(findRule(parseOk(parseSpacingTable({ ...raw, rules: [{ ...base, appliesTo: 'both' }] })), 'coating-credit')?.appliesTo).toBe('both');
  });
  it('T8 elevation breakpoint: only on T8, a length with provenance', () => {
    const raw = rawSynthetic('T8');
    expect(errs(parseSpacingTable({ ...rawSynthetic('T4'), elevationBreakpoint: raw['elevationBreakpoint'] }))).toContain('elevationBreakpoint');
    const bp = raw['elevationBreakpoint'] as Rec;
    expect(errs(parseSpacingTable({ ...raw, elevationBreakpoint: { ...bp, value: -1 } }))).toContain('elevationBreakpoint');
    expect(errs(parseSpacingTable({ ...raw, elevationBreakpoint: { ...bp, unit: 'V' } }))).toContain('elevationBreakpoint');
  });
  it('columns: unique keys and unique selector sets', () => {
    const raw = rawSynthetic('T1');
    const cols = raw['columns'] as Rec[];
    expect(errs(parseSpacingTable({ ...raw, columns: [...cols, cols[0]] }))).toContain('duplicate');
    expect(errs(parseSpacingTable({ ...raw, columns: [...cols, { key: 'x', selectors: (cols[0] as Rec)['selectors'] }] }))).toContain('selector');
    expect(errs(parseSpacingTable({ ...raw, columns: [{ key: 'x', selectors: { overvoltageCategory: 'V' } }] }))).toContain('selector');
  });
  it('size caps and non-finite JSON numbers never throw', () => {
    const raw = rawSynthetic('T4');
    const many = Array.from({ length: 6000 }, (_, i) => ({ ...(raw['cells'] as Rec[])[0], row: String(i) }));
    expect(errs(parseSpacingTable({ ...raw, cells: many }))).toContain('too many');
    expect(errs(parseSpacingTable({ ...raw, source: 'x'.repeat(5000) }))).toContain('too long');
  });
});

describe('table sets', () => {
  it('makeTableSet fills missing tables with the shipped empty ones and refuses an id mismatch', () => {
    const r = makeTableSet({ T4: synthTable('T4') });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(dataStateOf(r.value.tables.T4)).toBe('ENTERED_UNVERIFIED');
      expect(dataStateOf(r.value.tables.T2)).toBe('EMPTY');
    }
    const bad = makeTableSet({ T2: synthTable('T4') });
    expect(bad.ok).toBe(false);
  });
  it('refuses a hand-built table that did not come from the validator', () => {
    const fake = { ...synthTable('T4'), status: 'VERIFIED' } as never;
    expect(makeTableSet({ T4: fake }).ok).toBe(false);
  });
  it('tables are frozen: VERIFIED cannot be set after parsing', () => {
    const t = synthTable('T4');
    expect(() => {
      (t as { status: string }).status = 'VERIFIED';
    }).toThrow();
    expect(dataStateOf(t)).toBe('ENTERED_UNVERIFIED');
  });
  it('serialize and re-import round-trips', () => {
    const set = synthSet(['T2', 'T4']);
    const text = serializeTableSet(set);
    const r = importSpacingTables(text);
    expect(errs(r)).toBe('');
    if (r.ok) {
      expect(dataStateOf(r.value.tables.tables.T2)).toBe('ENTERED_UNVERIFIED');
      expect(dataStateOf(r.value.tables.tables.T1)).toBe('EMPTY');
      expect(r.value.imported.map((x) => x.table).sort()).toEqual([...TABLE_IDS].sort());
    }
  });
});

describe('importSpacingTables', () => {
  const bundle = (tables: unknown[], extra: Rec = {}): string =>
    JSON.stringify({ schema: 'pcb-calc/safety-table-set@1', schemaVersion: 1, tables, ...extra });
  it('accepts a single table object and a bundle, merges onto a base set', () => {
    const one = importSpacingTables(JSON.stringify(rawSynthetic('T4')));
    expect(errs(one)).toBe('');
    const base = synthSet(['T2']);
    const two = importSpacingTables(bundle([rawSynthetic('T4'), rawSynthetic('T5')]), { base });
    expect(errs(two)).toBe('');
    if (two.ok) {
      expect(dataStateOf(two.value.tables.tables.T2)).toBe('ENTERED_UNVERIFIED');
      expect(dataStateOf(two.value.tables.tables.T5)).toBe('ENTERED_UNVERIFIED');
      expect(two.value.imported.map((x) => x.table)).toEqual(['T4', 'T5']);
      expect(two.value.imported[0]?.records).toBe(T4_ROWS_M.length);
    }
  });
  it('rejects bad JSON, oversize text, wrong schema/version, unknown keys, duplicate table ids, empty bundle', () => {
    expect(errs(importSpacingTables('{not json'))).toContain('not valid JSON');
    expect(errs(importSpacingTables('x'.repeat(MAX_IMPORT_CHARS + 1)))).toContain('too large');
    expect(errs(importSpacingTables('[]'))).toContain('object');
    expect(errs(importSpacingTables(JSON.stringify({ schema: 'pcb-calc/safety-table-set@1', schemaVersion: 2, tables: [] })))).toContain('schemaVersion');
    expect(errs(importSpacingTables(bundle([rawSynthetic('T4')], { surprise: 1 })))).toContain('unknown key "surprise"');
    expect(errs(importSpacingTables(bundle([rawSynthetic('T4'), rawSynthetic('T4')])))).toContain('twice');
    expect(errs(importSpacingTables(bundle([])))).toContain('at least one');
    expect(errs(importSpacingTables(bundle('nope' as never)))).toContain('tables');
    expect(errs(importSpacingTables(bundle([{ ...rawSynthetic('T4'), extra: 1 }])))).toContain('unknown key "extra"');
  });
  it('refuses to mark anything VERIFIED unless verifiedBy is present', () => {
    const v = rawSynthetic('T4', { verified: true });
    expect(errs(importSpacingTables(JSON.stringify({ ...v, verifiedBy: '' })))).toContain('verifiedBy');
    expect(errs(importSpacingTables(JSON.stringify(v)))).toBe('');
    // a table that claims VERIFIED through banner or status alone is also refused
    expect(errs(importSpacingTables(JSON.stringify({ ...rawSynthetic('T4'), status: 'VERIFIED' })))).toContain('verifiedBy');
  });
  it('rejects future dates when today is injected, and reports all problems', () => {
    const raw = { ...rawSynthetic('T4'), enteredDate: '2030-01-01' };
    expect(errs(importSpacingTables(JSON.stringify(raw), { today: '2026-10-19' }))).toContain('in the future');
    const r = importSpacingTables(JSON.stringify({ ...rawSynthetic('T4'), extra: 1, status: 'MAYBE' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThanOrEqual(2);
    expect(errs(importSpacingTables(JSON.stringify(rawSynthetic('T4')), { today: 'bad' }))).toContain('today');
  });
  it('never throws on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = importSpacingTables(s);
        return typeof r.ok === 'boolean';
      }),
    );
    fc.assert(
      fc.property(fc.jsonValue(), (j) => {
        const r = importSpacingTables(JSON.stringify(j));
        return r.ok === false || r.value.imported.length > 0;
      }),
    );
  });
});

describe('lookupGrid', () => {
  const T2 = synthTable('T2');
  const sel = (pd: number, inh: boolean) => ({ pollutionDegree: pd, fieldCondition: inh ? 'inhomogeneous' : 'homogeneous' });
  const kv = (x: number): number => x * 1000;
  const mm = (x: number): number => x * 1e-3;

  it('exact row, next-higher row, below first row', () => {
    const exact = lookupGrid(T2, { rowSi: kv(2), selectors: sel(2, true), edition: ED });
    expect(exact.ok && exact.method).toBe('exact');
    expect(exact.ok && exact.valueSi).toBeCloseTo(mm(t2(2, 2, true)), 12);
    const mid = lookupGrid(T2, { rowSi: kv(2.0001), selectors: sel(2, true), edition: ED });
    expect(mid.ok && mid.method).toBe('next-higher-row');
    expect(mid.ok && mid.valueSi).toBeCloseTo(mm(t2(3, 2, true)), 12);
    const low = lookupGrid(T2, { rowSi: kv(0.1), selectors: sel(1, false), edition: ED });
    expect(low.ok && low.method).toBe('below-first-row');
    expect(low.ok && low.valueSi).toBeCloseTo(mm(t2(1, 1, false)), 12);
  });
  it('above the last row is refused, never extrapolated', () => {
    const r = lookupGrid(T2, { rowSi: kv(5.0001), selectors: sel(1, true), edition: ED });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('ABOVE_TABLE');
  });
  it('interpolation is off by default and linear only when the table record says so', () => {
    const off = lookupGrid(T2, { rowSi: kv(2.5), selectors: sel(1, true), edition: ED });
    expect(off.ok && off.method).toBe('next-higher-row');
    const lin = synthTable('T2', { interpolation: 'linear' });
    const on = lookupGrid(lin, { rowSi: kv(2.5), selectors: sel(1, true), edition: ED });
    expect(on.ok && on.method).toBe('linear');
    expect(on.ok && on.valueSi).toBeCloseTo(mm((t2(2, 1, true) + t2(3, 1, true)) / 2), 12);
  });
  it('column selection: missing, wrong or ambiguous selectors are refused', () => {
    expect(lookupGrid(T2, { rowSi: kv(1), selectors: { pollutionDegree: 1 }, edition: ED })).toMatchObject({ ok: false, reason: 'NO_COLUMN' });
    expect(lookupGrid(T2, { rowSi: kv(1), selectors: sel(4, true), edition: ED })).toMatchObject({ ok: false, reason: 'NO_COLUMN' });
    // two wildcard columns match everything: ambiguous
    const raw = rawSynthetic('T4');
    const amb = parseSpacingTable({
      ...raw,
      columns: [
        { key: 'factor', selectors: {} },
        { key: 'other', selectors: {} },
      ],
    });
    expect(amb.ok).toBe(false);
  });
  it('an absent cell is "no data", never zero', () => {
    const raw = rawSynthetic('T2');
    const cells = (raw['cells'] as Rec[]).filter((c) => !(c['row'] === '2' && c['col'] === 'PD2 inh'));
    const p = parseSpacingTable({ ...raw, cells });
    expect(p.ok).toBe(true);
    if (p.ok) {
      const r = lookupGrid(p.value, { rowSi: kv(2), selectors: sel(2, true), edition: ED });
      expect(r).toMatchObject({ ok: false, reason: 'NO_CELL' });
      const lin = parseSpacingTable({ ...rawSynthetic('T2', { interpolation: 'linear' }), cells });
      if (lin.ok) expect(lookupGrid(lin.value, { rowSi: kv(1.5), selectors: sel(2, true), edition: ED })).toMatchObject({ ok: false, reason: 'NO_CELL' });
    }
  });
  it('edition mismatch and empty tables are refused with distinct reasons', () => {
    expect(lookupGrid(T2, { rowSi: kv(1), selectors: sel(1, true), edition: 'OTHER' })).toMatchObject({ ok: false, reason: 'EDITION' });
    expect(lookupGrid(SHIPPED_TABLES.tables.T2, { rowSi: kv(1), selectors: sel(1, true), edition: ED })).toMatchObject({ ok: false, reason: 'EMPTY' });
  });
  it('lookupGrid takes no row step-up option: the reinforced rule uses the T7 series instead', () => {
    expect(lookupGrid.length).toBe(2);
  });
  it('next preferred impulse step: the next series value above the required impulse, never a T2 row step', () => {
    const rule = findRule(synthTable('T7'), 'reinforced-clearance');
    if (rule === undefined) throw new Error('no rule');
    expect(ruleSeriesSi(rule)).toEqual([1000, 2000, 4000, 5000]);
    const a = nextPreferredImpulseStep(rule, kv(2));
    expect(a).toMatchObject({ ok: true, valueSi: kv(4) });
    expect(nextPreferredImpulseStep(rule, kv(1))).toMatchObject({ ok: true, valueSi: kv(2) });
    expect(nextPreferredImpulseStep(rule, kv(4) * (1 + 1e-14))).toMatchObject({ ok: true, valueSi: kv(5) });
    expect(nextPreferredImpulseStep(rule, kv(5))).toMatchObject({ ok: false, above: true });
    expect(nextPreferredImpulseStep(rule, kv(3))).toMatchObject({ ok: false, above: false });
    expect(nextPreferredImpulseStep(rule, kv(0.5))).toMatchObject({ ok: false, above: false });
    const mult = findRule(synthTable('T7'), 'reinforced-creepage-multiplier');
    if (mult === undefined) throw new Error('no rule');
    expect(nextPreferredImpulseStep(mult, kv(2))).toMatchObject({ ok: false, above: false });
    expect(ruleSeriesSi(mult)).toBeUndefined();
  });
  it('property: the reinforced step is strictly above the required value and is a series value', () => {
    const rule = findRule(synthTable('T7'), 'reinforced-clearance');
    if (rule === undefined) throw new Error('no rule');
    const series = ruleSeriesSi(rule) as number[];
    fc.assert(
      fc.property(fc.double({ min: 1, max: 6000, noNaN: true }), (x) => {
        const r = nextPreferredImpulseStep(rule, x);
        return !r.ok || (r.valueSi > x && series.includes(r.valueSi));
      }),
    );
  });
  it('altitude table T4 and the T5 selectors', () => {
    const T4 = synthTable('T4');
    const a = lookupGrid(T4, { rowSi: 2000, selectors: {}, edition: ED });
    expect(a.ok && a.valueSi).toBe(T4_FACTORS[1]);
    expect(lookupGrid(T4, { rowSi: 6000, selectors: {}, edition: ED })).toMatchObject({ ok: false, reason: 'ABOVE_TABLE' });
    const T5 = synthTable('T5');
    const c = lookupGrid(T5, { rowSi: 150, selectors: { pollutionDegree: 2, materialGroup: 'II', surface: 'other' }, edition: ED });
    expect(c.ok && c.valueSi).toBeCloseTo(t5(2, 2, 2) * 1e-3, 12);
    const p = lookupGrid(T5, { rowSi: 150, selectors: { pollutionDegree: 1, materialGroup: 'I', surface: 'printed-wiring' }, edition: ED });
    expect(p.ok && p.column).toBe('PWB PD1 I');
  });
  it('T8 per-volt extension above the top band, and refusal when the per-volt cell is absent', () => {
    const T8 = synthTable('T8');
    const s = { location: 'internal' };
    const top = lookupGrid(T8, { rowSi: 30, selectors: s, edition: ED });
    expect(top.ok && top.valueSi).toBeCloseTo(t8(0, 2) * 1e-3, 12);
    const ext = lookupGrid(T8, { rowSi: 50, selectors: s, edition: ED });
    expect(ext.ok && ext.method).toBe('per-volt-extension');
    expect(ext.ok && ext.valueSi).toBeCloseTo((t8(0, 2) + 20 * T8_PER_VOLT_MM) * 1e-3, 12);
    const raw = rawSynthetic('T8');
    const cells = (raw['cells'] as Rec[]).filter((c) => c['row'] !== 'per volt');
    const p = parseSpacingTable({ ...raw, cells });
    expect(p.ok).toBe(true);
    if (p.ok) expect(lookupGrid(p.value, { rowSi: 50, selectors: s, edition: ED })).toMatchObject({ ok: false, reason: 'NO_CELL' });
    const noRow = parseSpacingTable({ ...raw, cells, rows: (raw['rows'] as Rec[]).filter((r) => r['perVolt'] !== true) });
    expect(noRow.ok).toBe(true);
    if (noRow.ok) expect(lookupGrid(noRow.value, { rowSi: 50, selectors: s, edition: ED })).toMatchObject({ ok: false, reason: 'ABOVE_TABLE' });
  });
  it('property: next-higher-row is monotone non-decreasing in the requested value (fake monotone table)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 5000, noNaN: true }), fc.double({ min: 1, max: 5000, noNaN: true }), (a, b) => {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const x = lookupGrid(T2, { rowSi: lo, selectors: sel(2, true), edition: ED });
        const y = lookupGrid(T2, { rowSi: hi, selectors: sel(2, true), edition: ED });
        if (!y.ok) return true;
        return x.ok && x.valueSi <= y.valueSi + 1e-15;
      }),
    );
  });
  it('property: the looked-up value is never below the cell for the next higher row value (conservative)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 5000, noNaN: true }), (x) => {
        const r = lookupGrid(T2, { rowSi: x, selectors: sel(1, false), edition: ED });
        if (!r.ok) return x > 5000 * (1 + 1e-12);
        const need = Math.min(5, Math.max(1, Math.ceil(x / 1000 - 1e-9)));
        return Math.abs(r.valueSi - t2(need, 1, false) * 1e-3) < 1e-12;
      }),
    );
  });
});

describe('material group and rule helpers', () => {
  const T6 = synthTable('T6');
  it('CTI maps to exactly one group using the table definitions only', () => {
    expect(findGroupForCti(T6, 95, ED)).toMatchObject({ ok: true, group: 'I' });
    expect(findGroupForCti(T6, 90, ED)).toMatchObject({ ok: true, group: 'I' });
    expect(findGroupForCti(T6, 89, ED)).toMatchObject({ ok: true, group: 'II' });
    expect(findGroupForCti(T6, 19, ED)).toMatchObject({ ok: true, group: 'IIIb' });
    expect(findGroupForCti(T6, 0, ED)).toMatchObject({ ok: true, group: 'IIIb' });
    expect(findGroupForCti(T6, 89.5, ED)).toMatchObject({ ok: false, reason: 'NO_CELL' });
    expect(findGroupForCti(T6, 95, 'OTHER')).toMatchObject({ ok: false, reason: 'EDITION' });
    expect(findGroupForCti(SHIPPED_TABLES.tables.T6, 95, ED)).toMatchObject({ ok: false, reason: 'EMPTY' });
  });
  it('overlapping group definitions are ambiguous and refused', () => {
    const raw = rawSynthetic('T6');
    const groups = raw['groups'] as Rec[];
    const p = parseSpacingTable({ ...raw, groups: [groups[0], { ...(groups[1] as Rec), ctiMax: 95 }] });
    expect(p.ok).toBe(true);
    if (p.ok) expect(findGroupForCti(p.value, 92, ED)).toMatchObject({ ok: false, reason: 'AMBIGUOUS_COLUMN' });
  });
  it('findRule returns the record or undefined', () => {
    const T7 = synthTable('T7');
    expect(findRule(T7, 'scope-max-frequency')?.rule).toBe('scope-max-frequency');
    expect(findRule(T7, 'coating-credit', { coatingType: 'type1' })?.coatingType).toBe('type1');
    expect(findRule(T7, 'coating-credit', { coatingType: 'type2' })).toBeUndefined();
    expect(findRule(SHIPPED_TABLES.tables.T7, 'scope-max-frequency')).toBeUndefined();
  });
  it('TABLE_IDS lists all eight tables', () => {
    expect(TABLE_IDS).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'] as TableId[]);
  });
});

describe('VERIFIED needs a second person (verifiedBy differs from every enteredBy and checkedBy, case-insensitive, trimmed)', () => {
  const v = (): Rec => rawSynthetic('T4', { verified: true });
  const cells = (over: Rec): Rec[] => (v()['cells'] as Rec[]).map((c, i) => (i === 0 ? { ...c, ...over } : c));
  it('a different verifier is accepted', () => {
    expect(errs(parseSpacingTable(v()))).toBe('');
  });
  it.each([
    ['table enteredBy', { enteredBy: 'Test-Verifier' }],
    ['table enteredBy with spaces', { enteredBy: '  TEST-VERIFIER ' }],
    ['a cell enteredBy', { cells: cells({ enteredBy: 'test-verifier' }) }],
    ['a cell checkedBy', { cells: cells({ checkedBy: 'TEST-verifier ' }) }],
    ['table enteredBy with inner spaces', { verifiedBy: 'Test   Verifier', enteredBy: '  test VERIFIER ' }],
    ['a cell enteredBy with a no-break space', { cells: cells({ enteredBy: 'test-verifier\u00a0' }) }],
    ['a cell checkedBy with a full-width letter (NFKC)', { cells: cells({ checkedBy: '\uff54est-verifier' }) }],
  ])('verifiedBy equal to %s is refused with a clear message', (_n, over) => {
    const m = errs(parseSpacingTable({ ...v(), ...over }));
    expect(m).toContain('second person');
    expect(m).toContain('verifiedBy');
  });
  it('rule, group and breakpoint records are covered as well', () => {
    const t7 = rawSynthetic('T7', { verified: true });
    const rules = (t7['rules'] as Rec[]).map((r, i) => (i === 0 ? { ...r, checkedBy: 'test-verifier' } : r));
    expect(errs(parseSpacingTable({ ...t7, rules }))).toContain('second person');
    const t6 = rawSynthetic('T6', { verified: true });
    const groups = (t6['groups'] as Rec[]).map((r, i) => (i === 0 ? { ...r, enteredBy: 'Test-Verifier' } : r));
    expect(errs(parseSpacingTable({ ...t6, groups }))).toContain('second person');
    const t8 = rawSynthetic('T8', { verified: true });
    const bp = { ...(t8['elevationBreakpoint'] as Rec), checkedBy: 'test-verifier' };
    expect(errs(parseSpacingTable({ ...t8, elevationBreakpoint: bp }))).toContain('second person');
  });
  it('the importer refuses it too, and an unverified table may keep any names', () => {
    expect(errs(importSpacingTables(JSON.stringify({ ...v(), enteredBy: 'test-verifier' })))).toContain('second person');
    const u = rawSynthetic('T4');
    expect(errs(parseSpacingTable({ ...u, enteredBy: 'someone', cells: (u['cells'] as Rec[]).map((c) => ({ ...c, checkedBy: 'someone', checkedDate: '2026-01-02' })) }))).toBe('');
  });
});

describe('source hygiene', () => {
  const files = import.meta.glob('./tables.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  it('tables.ts has no raw NUL byte (use an escape sequence)', () => {
    const text = files['./tables.ts'];
    expect(text).toBeDefined();
    expect((text as string).includes(String.fromCharCode(0))).toBe(false);
  });
});
