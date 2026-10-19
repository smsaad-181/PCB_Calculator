/*
 * SYNTHETIC TEST DATA, not from any standard.
 * Test-only builders for spacing tables. Every number here is an obviously fake round number chosen so that the gating
 * and lookup LOGIC can be exercised; none of them is, or approximates, a value of IEC 60664-1 or IPC-2221. The "units"
 * are real units (V, kV, mm, m) only because the schema validates dimensions. Nothing in this file is imported by shipping code.
 */
import { makeTableSet, parseSpacingTable } from './tables';
import type { SpacingTable, SpacingTableSet, TableId } from './tables';

export const SYNTH = 'SYNTHETIC TEST DATA, not from any standard';
const PROV = { source: SYNTH, printed: 'synthetic', enteredBy: 'test-author', enteredDate: '2026-01-01' } as const;
const CHECK = { checkedBy: 'test-checker', checkedDate: '2026-01-02' } as const;

export type Rec = Record<string, unknown>;

// ---- fake cell formulas (the tests recompute expectations from these, never from the implementation) --------------------
/** T1 cell (kV): category index 1..4, row index 1..2. */
export const t1 = (rowIdx: number, cat: number): number => rowIdx + cat - 1 + 0;
/** T2 cell (mm): impulse row index 1..5, pollution degree 1..3, inhomogeneous or not. */
export const t2 = (rowIdx: number, pd: number, inhomogeneous: boolean): number => rowIdx * 2 + pd + (inhomogeneous ? 1 : 0);
/** T3 cell (mm): row index 1..3. */
export const t3 = (rowIdx: number, inhomogeneous: boolean): number => rowIdx * 3 + (inhomogeneous ? 1 : 0);
/** T4 factor by row index 1..3 (altitude rows 1000, 3000, 5000 m, all fake). */
export const T4_FACTORS = [1, 2, 3] as const;
export const T4_ROWS_M = [1000, 3000, 5000] as const;
/** T5 cell (mm): row index 1..3 (100, 200, 300 V), pollution degree 1..3, group index I=1, II=2, other surface. */
export const t5 = (rowIdx: number, pd: number, g: number): number => rowIdx * 5 + pd + g;
export const T5_PRINTED_PD1_GROUP_I = 1; // the one printed-wiring column, any row: fake value in mm
export const T1_ROWS_V = [100, 200] as const;
export const T2_ROWS_KV = [1, 2, 3, 4, 5] as const;
export const T3_ROWS_KV = [1, 2, 3] as const;
export const T5_ROWS_V = [100, 200, 300] as const;
export const T8_ROWS_V = [10, 20, 30] as const;
export const T8_PER_VOLT_MM = 0.25;
export const T8_BREAKPOINT_M = 3000;
export const T7_REINFORCED_CREEPAGE = 3;
export const T7_SCOPE_FREQUENCY_HZ = 7000;
export const T7_SCOPE_AC_RMS_V = 5000;
export const T7_SCOPE_DC_V = 8000;
export const T7_COATING_TYPE1 = 0.75;
export const T7_REINFORCED_CLEARANCE_MULTIPLIER = 4;
/** Fake preferred impulse series (kV). It deliberately skips the 3 kV row of T2, so a one-row step in T2 and a one-step move in the series differ. */
export const T7_IMPULSE_SERIES_KV = [1, 2, 4, 5] as const;
export const T7_REINFORCED_STEADY_MULTIPLIER = 3;

const cell = (row: string, col: string, value: number, unit: string, verified: boolean): Rec => ({
  row,
  col,
  value,
  unit,
  ...PROV,
  ...(verified ? CHECK : {}),
});

const header = (id: TableId, name: string, standard: string, ledger: string[], units: { row: string; cell: string }, over: Rec): Rec => ({
  schema: 'pcb-calc/safety-table@1',
  schemaVersion: 1,
  table: id,
  name,
  standard,
  source: SYNTH,
  edition: 'SYNTH-ED-1',
  clause: 'synthetic',
  tableNumber: 'synthetic',
  ledgerIds: ledger,
  status: 'UNVERIFIED',
  entered: true,
  enteredBy: 'test-author',
  enteredDate: '2026-01-01',
  verifiedBy: '',
  verifiedDate: '',
  bannerRequired: true,
  units,
  interpolation: 'none',
  interpolationSource: '',
  notes: [SYNTH],
  ...over,
});

function stamp(raw: Rec, verified: boolean): Rec {
  if (!verified) return raw;
  return { ...raw, status: 'VERIFIED', verifiedBy: 'test-verifier', verifiedDate: '2026-01-03', bannerRequired: false };
}

export interface SynthOptions {
  verified?: boolean;
  edition?: string;
  interpolation?: 'none' | 'linear';
}

/** Raw (unparsed) synthetic table for an id. */
export function rawSynthetic(id: TableId, o: SynthOptions = {}): Rec {
  const v = o.verified === true;
  const interp: Rec = o.interpolation === 'linear' ? { interpolation: 'linear', interpolationSource: 'synthetic clause permitting it' } : {};
  const ed: Rec = o.edition !== undefined ? { edition: o.edition } : {};
  const mk = (raw: Rec): Rec => stamp({ ...raw, ...interp, ...ed }, v);
  switch (id) {
    case 'T1': {
      const rows = T1_ROWS_V.map((x) => ({ key: String(x), value: x }));
      const cats = ['I', 'II', 'III', 'IV'];
      const columns = cats.map((c) => ({ key: `cat ${c}`, selectors: { overvoltageCategory: c } }));
      const cells = T1_ROWS_V.flatMap((x, ri) => cats.map((c, ci) => cell(String(x), `cat ${c}`, t1(ri + 1, ci + 1), 'kV', v)));
      return mk(header('T1', 'T1 rated impulse voltage', 'IEC 60664-1', ['S-030b', 'S-030c'], { row: 'V', cell: 'kV' }, { rows, columns, cells }));
    }
    case 'T2': {
      const rows = T2_ROWS_KV.map((x) => ({ key: String(x), value: x }));
      const columns: Rec[] = [];
      const cells: Rec[] = [];
      for (const inh of [true, false]) {
        for (const pd of [1, 2, 3]) {
          const key = `PD${String(pd)} ${inh ? 'inh' : 'hom'}`;
          columns.push({ key, selectors: { pollutionDegree: pd, fieldCondition: inh ? 'inhomogeneous' : 'homogeneous' } });
          T2_ROWS_KV.forEach((x, ri) => cells.push(cell(String(x), key, t2(ri + 1, pd, inh), 'mm', v)));
        }
      }
      return mk(header('T2', 'T2 clearance to withstand transient overvoltages', 'IEC 60664-1', ['S-030b', 'S-030d'], { row: 'kV', cell: 'mm' }, { rows, columns, cells }));
    }
    case 'T3': {
      const rows = T3_ROWS_KV.map((x) => ({ key: String(x), value: x }));
      const columns: Rec[] = [];
      const cells: Rec[] = [];
      for (const inh of [true, false]) {
        const key = inh ? 'inh' : 'hom';
        columns.push({ key, selectors: { fieldCondition: inh ? 'inhomogeneous' : 'homogeneous' } });
        T3_ROWS_KV.forEach((x, ri) => cells.push(cell(String(x), key, t3(ri + 1, inh), 'mm', v)));
      }
      return mk(header('T3', 'T3 clearance for steady-state and recurring peak voltages', 'IEC 60664-1', ['S-030b'], { row: 'kV', cell: 'mm' }, { rows, columns, cells }));
    }
    case 'T4': {
      const rows = T4_ROWS_M.map((x) => ({ key: String(x), value: x }));
      const columns = [{ key: 'factor', selectors: {} }];
      const cells = T4_ROWS_M.map((x, i) => cell(String(x), 'factor', T4_FACTORS[i] as number, '1', v));
      return mk(header('T4', 'T4 altitude correction factor (clearance)', 'IEC 60664-1', ['S-032'], { row: 'm', cell: '1' }, { rows, columns, cells }));
    }
    case 'T5': {
      const rows = T5_ROWS_V.map((x) => ({ key: String(x), value: x }));
      const columns: Rec[] = [];
      const cells: Rec[] = [];
      for (const pd of [1, 2, 3]) {
        [
          ['I', 1],
          ['II', 2],
        ].forEach(([g, gi]) => {
          const key = `PD${String(pd)} ${String(g)}`;
          columns.push({ key, selectors: { pollutionDegree: pd, materialGroup: g, surface: 'other' } });
          T5_ROWS_V.forEach((x, ri) => cells.push(cell(String(x), key, t5(ri + 1, pd, gi as number), 'mm', v)));
        });
      }
      columns.push({ key: 'PWB PD1 I', selectors: { pollutionDegree: 1, materialGroup: 'I', surface: 'printed-wiring' } });
      T5_ROWS_V.forEach((x) => cells.push(cell(String(x), 'PWB PD1 I', T5_PRINTED_PD1_GROUP_I, 'mm', v)));
      return mk(header('T5', 'T5 creepage distance (basic insulation)', 'IEC 60664-1', ['S-030b', 'S-030d', 'S-030e'], { row: 'V', cell: 'mm' }, { rows, columns, cells }));
    }
    case 'T6': {
      const rec = (group: string, lo: number | undefined, hi: number | undefined): Rec => ({
        group,
        ...(lo !== undefined ? { ctiMin: lo, minInclusive: true } : {}),
        ...(hi !== undefined ? { ctiMax: hi, maxInclusive: true } : {}),
        unit: 'V',
        ...PROV,
        ...(v ? CHECK : {}),
      });
      const groups = [rec('I', 90, undefined), rec('II', 50, 89), rec('IIIa', 20, 49), rec('IIIb', 0, 19)];
      return mk(header('T6', 'T6 material groups by CTI', 'IEC 60664-1', ['S-030e'], { row: 'V', cell: 'V' }, { groups }));
    }
    case 'T7': {
      const base = { clauseText: SYNTH, source: SYNTH, enteredBy: 'test-author', enteredDate: '2026-01-01', ...(v ? CHECK : {}) };
      const rules = [
        { rule: 'reinforced-creepage-multiplier', value: T7_REINFORCED_CREEPAGE, unit: '1', ...base },
        { rule: 'reinforced-clearance', mode: 'next-preferred-impulse-step', series: [...T7_IMPULSE_SERIES_KV], unit: 'kV', ...base },
        { rule: 'reinforced-clearance-steady-state', mode: 'multiplier', value: T7_REINFORCED_STEADY_MULTIPLIER, unit: '1', ...base },
        { rule: 'scope-max-frequency', value: T7_SCOPE_FREQUENCY_HZ, unit: 'Hz', ...base },
        { rule: 'scope-max-voltage-ac-rms', value: T7_SCOPE_AC_RMS_V, unit: 'V', ...base },
        { rule: 'scope-max-voltage-dc', value: T7_SCOPE_DC_V, unit: 'V', ...base },
        { rule: 'coating-credit', coatingType: 'type1', value: T7_COATING_TYPE1, unit: '1', ...base },
      ];
      return mk(header('T7', 'T7 rule records', 'IEC 60664-1', ['S-030a', 'S-030f', 'S-031a'], { row: 'V', cell: '1' }, { rules }));
    }
    case 'T8': {
      const rows: Rec[] = [...T8_ROWS_V.map((x) => ({ key: String(x), value: x })), { key: 'per volt', perVolt: true }];
      const cols: [string, Rec][] = [
        ['B1', { location: 'internal' }],
        ['B2', { location: 'external', conductorKind: 'bare-board', coating: 'uncoated', elevation: 'below-breakpoint' }],
        ['B3', { location: 'external', conductorKind: 'bare-board', coating: 'uncoated', elevation: 'above-breakpoint' }],
        ['B4', { location: 'external', conductorKind: 'bare-board', coating: 'permanent-polymer-or-solder-mask' }],
      ];
      const columns = cols.map(([key, selectors]) => ({ key, selectors }));
      const cells: Rec[] = [];
      cols.forEach(([key], ci) => {
        T8_ROWS_V.forEach((x, ri) => cells.push(cell(String(x), key, (ci + 1) * 2 + ri, 'mm', v)));
        cells.push(cell('per volt', key, T8_PER_VOLT_MM, 'mm/V', v));
      });
      const bp = { value: T8_BREAKPOINT_M, unit: 'm', ...PROV, ...(v ? CHECK : {}), source: SYNTH };
      return mk(header('T8', 'T8 IPC-2221 Table 6-1 electrical conductor spacing', 'IPC-2221', ['S-033', 'S-033a'], { row: 'V', cell: 'mm' }, { rows, columns, cells, elevationBreakpoint: bp }));
    }
    default: {
      const never: never = id;
      throw new Error(String(never));
    }
  }
}

/** Fake T8 cell (mm) by column index 0..3 and row index 0..2. */
export const t8 = (colIdx: number, rowIdx: number): number => (colIdx + 1) * 2 + rowIdx;

export function synthTable(id: TableId, o: SynthOptions = {}): SpacingTable {
  const r = parseSpacingTable(rawSynthetic(id, o));
  if (!r.ok) throw new Error(`synthetic ${id} failed to parse: ${r.error.join('; ')}`);
  return r.value;
}

/** A table set with the listed synthetic tables populated; the others stay empty. */
export function synthSet(ids: readonly TableId[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'], o: SynthOptions = {}): SpacingTableSet {
  const tables: Partial<Record<TableId, SpacingTable>> = {};
  for (const id of ids) tables[id] = synthTable(id, o);
  const r = makeTableSet(tables);
  if (!r.ok) throw new Error(r.error.join('; '));
  return r.value;
}
