import t1Json from '../data/iec60664/T1-impulse-voltage.json';
import t2Json from '../data/iec60664/T2-clearance-transient.json';
import t3Json from '../data/iec60664/T3-clearance-steady-state.json';
import t4Json from '../data/iec60664/T4-altitude-factor.json';
import t5Json from '../data/iec60664/T5-creepage.json';
import t6Json from '../data/iec60664/T6-material-groups.json';
import t7Json from '../data/iec60664/T7-rules.json';
import t8Json from '../data/ipc2221-spacing.json';
import { LEDGER } from '../data/ledger';
import { dayNumber, isRec, nonEmpty } from '../fab/parse-util';
import type { Rec } from '../fab/parse-util';
import type { Result } from '../result';

/*
 * Safety-spacing tables (Phase 3 core): typed loader, strict schema validator, importer and lookup.
 *
 * HARD RULE (CLAUDE.md, docs/phases/phase-3.md): no numeric value of IEC 60664-1 or IPC-2221 lives in this repository.
 * The shipped tables (src/core/data/iec60664/*.json, src/core/data/ipc2221-spacing.json) are EMPTY shells. The human enters
 * values from licensed copies into a JSON file and imports it (importSpacingTables). Every entered cell carries its own
 * provenance (printed text, source clause, who entered it and when, who checked it and when).
 *
 * Data state of a table (dataStateOf):
 *   EMPTY               nothing entered
 *   ENTERED_UNVERIFIED  something entered, not signed off: results are "indicative only" with a red UNVERIFIED banner
 *   VERIFIED            status VERIFIED with verifiedBy, verifiedDate, no banner and every record checked by a named person
 * VERIFIED cannot be produced by code: it is derived from the data a person signed, and tables are frozen after validation.
 * A table object that did not come from parseSpacingTable is never trusted (WeakSet registry).
 *
 * Plausibility windows (UNIT_SLIP_WINDOWS) only catch unit slips (mm entered as m, kV as V); they are not standard limits.
 */

export const SCHEMA_ID = 'pcb-calc/safety-table@1';
export const SET_SCHEMA_ID = 'pcb-calc/safety-table-set@1';
/** Largest accepted import text, in characters. A full eight-table set is far smaller. */
export const MAX_IMPORT_CHARS = 524_288;

export const TABLE_IDS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'] as const;
export type TableId = (typeof TABLE_IDS)[number];
export type DataState = 'EMPTY' | 'ENTERED_UNVERIFIED' | 'VERIFIED';
export type TableStatus = 'PAYWALLED-USER-MUST-VERIFY' | 'UNVERIFIED' | 'VERIFIED';
export type Interpolation = 'none' | 'linear';

export const RULE_IDS = [
  'reinforced-creepage-multiplier',
  'reinforced-clearance',
  'scope-max-frequency',
  'scope-max-voltage-ac-rms',
  'scope-max-voltage-dc',
  'coating-credit',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const MATERIAL_GROUPS = ['I', 'II', 'IIIa', 'IIIb'] as const;
export type MaterialGroup = (typeof MATERIAL_GROUPS)[number];

export type SelectorValue = string | number;
export type Selectors = Readonly<Record<string, SelectorValue>>;

export interface Provenance {
  readonly source: string;
  readonly printed: string;
  readonly page?: string;
  readonly enteredBy: string;
  readonly enteredDate: string;
  readonly checkedBy?: string;
  readonly checkedDate?: string;
}
export interface SpacingRow {
  readonly key: string;
  /** In the table's row unit. Absent for the per-volt row. */
  readonly value?: number;
  readonly perVolt: boolean;
}
export interface SpacingColumn {
  readonly key: string;
  readonly selectors: Selectors;
}
export interface SpacingCell extends Provenance {
  readonly row: string;
  readonly col: string;
  readonly value: number;
  readonly unit: string;
}
export interface MaterialGroupRecord extends Provenance {
  readonly group: MaterialGroup;
  readonly ctiMin?: number;
  readonly ctiMax?: number;
  readonly minInclusive?: boolean;
  readonly maxInclusive?: boolean;
  readonly unit: 'V';
}
export interface RuleRecord {
  readonly rule: RuleId;
  readonly mode?: string;
  readonly coatingType?: string;
  readonly value?: number;
  readonly unit?: string;
  readonly clauseText: string;
  readonly source: string;
  readonly page?: string;
  readonly enteredBy: string;
  readonly enteredDate: string;
  readonly checkedBy?: string;
  readonly checkedDate?: string;
}
export interface ElevationBreakpoint extends Provenance {
  readonly value: number;
  readonly unit: string;
}
export interface SpacingTable {
  readonly schema: typeof SCHEMA_ID;
  readonly schemaVersion: 1;
  readonly table: TableId;
  /** Display name from the table spec (the file's own "name" is informational and ignored). */
  readonly name: string;
  readonly standard: string;
  readonly source: string;
  readonly edition: string;
  readonly clause: string;
  readonly tableNumber: string;
  readonly ledgerIds: readonly string[];
  readonly status: TableStatus;
  readonly entered: boolean;
  readonly enteredBy: string;
  readonly enteredDate: string;
  readonly verifiedBy: string;
  readonly verifiedDate: string;
  readonly bannerRequired: boolean;
  readonly units: { readonly row: string; readonly cell: string };
  readonly interpolation: Interpolation;
  readonly interpolationSource: string;
  readonly rows: readonly SpacingRow[];
  readonly columns: readonly SpacingColumn[];
  readonly cells: readonly SpacingCell[];
  readonly groups: readonly MaterialGroupRecord[];
  readonly rules: readonly RuleRecord[];
  readonly elevationBreakpoint?: ElevationBreakpoint;
  readonly notes: readonly string[];
}
export interface SpacingTableSet {
  readonly tables: Readonly<Record<TableId, SpacingTable>>;
}

// ---- specs ------------------------------------------------------------------------------------------------------------

type Kind = 'grid' | 'groups' | 'rules';
interface TableSpec {
  readonly name: string;
  readonly standard: 'IEC 60664-1' | 'IPC-2221';
  readonly kind: Kind;
  readonly rowUnits: readonly string[];
  readonly cellUnits: readonly string[];
  readonly selectors: readonly string[];
  /** Structural minimum of a cell value (T4: a correction factor never shrinks a clearance). */
  readonly minCell?: number;
}
const VOLT_UNITS = ['V', 'kV'];
const LENGTH_UNITS = ['mm', 'mil', 'um', 'm'];
const PER_VOLT_UNITS = ['mm/V', 'mil/V', 'um/V', 'm/V'];

export const TABLE_SPECS: Readonly<Record<TableId, TableSpec>> = Object.freeze({
  T1: { name: 'T1 rated impulse voltage', standard: 'IEC 60664-1', kind: 'grid', rowUnits: ['V'], cellUnits: VOLT_UNITS, selectors: ['overvoltageCategory'] },
  T2: {
    name: 'T2 clearance to withstand transient overvoltages',
    standard: 'IEC 60664-1',
    kind: 'grid',
    rowUnits: VOLT_UNITS,
    cellUnits: LENGTH_UNITS,
    selectors: ['pollutionDegree', 'fieldCondition'],
  },
  T3: {
    name: 'T3 clearance for steady-state and recurring peak voltages',
    standard: 'IEC 60664-1',
    kind: 'grid',
    rowUnits: VOLT_UNITS,
    cellUnits: LENGTH_UNITS,
    selectors: ['pollutionDegree', 'fieldCondition'],
  },
  T4: { name: 'T4 altitude correction factor (clearance only)', standard: 'IEC 60664-1', kind: 'grid', rowUnits: ['m', 'km'], cellUnits: ['1'], selectors: [], minCell: 1 },
  T5: {
    name: 'T5 creepage distance (basic insulation)',
    standard: 'IEC 60664-1',
    kind: 'grid',
    rowUnits: ['V'],
    cellUnits: LENGTH_UNITS,
    selectors: ['pollutionDegree', 'materialGroup', 'surface'],
  },
  T6: { name: 'T6 material groups by CTI', standard: 'IEC 60664-1', kind: 'groups', rowUnits: ['V'], cellUnits: ['V'], selectors: [] },
  T7: { name: 'T7 rule records', standard: 'IEC 60664-1', kind: 'rules', rowUnits: ['V'], cellUnits: ['1'], selectors: [] },
  T8: {
    name: 'T8 IPC-2221 Table 6-1 electrical conductor spacing',
    standard: 'IPC-2221',
    kind: 'grid',
    rowUnits: ['V'],
    cellUnits: LENGTH_UNITS,
    selectors: ['location', 'conductorKind', 'coating', 'elevation'],
  },
});

export const SELECTOR_VALUES: Readonly<Record<string, readonly SelectorValue[]>> = Object.freeze({
  overvoltageCategory: ['I', 'II', 'III', 'IV'],
  pollutionDegree: [1, 2, 3, 4],
  fieldCondition: ['inhomogeneous', 'homogeneous'],
  materialGroup: [...MATERIAL_GROUPS],
  surface: ['printed-wiring', 'other'],
  location: ['internal', 'external'],
  conductorKind: ['bare-board', 'component-lead'],
  coating: ['uncoated', 'permanent-polymer-or-solder-mask', 'conformal-coating'],
  elevation: ['below-breakpoint', 'above-breakpoint', 'vacuum'],
});

/** Unit to SI factor. mil is exactly 25.4 um (ledger S-006). */
const UNIT_SI: Readonly<Record<string, number>> = Object.freeze({
  V: 1,
  kV: 1e3,
  m: 1,
  km: 1e3,
  mm: 1e-3,
  um: 1e-6,
  mil: 25.4e-6,
  '1': 1,
  Hz: 1,
  kHz: 1e3,
  MHz: 1e6,
  'm/V': 1,
  'mm/V': 1e-3,
  'um/V': 1e-6,
  'mil/V': 25.4e-6,
});
export const unitFactorSi = (unit: string): number | undefined => (Object.prototype.hasOwnProperty.call(UNIT_SI, unit) ? UNIT_SI[unit] : undefined);

/** Unit-slip windows in SI. They catch mm-versus-m or kV-versus-V mistakes; they are NOT standard limits. */
export const UNIT_SLIP_WINDOWS = Object.freeze({
  voltageSi: [1e-3, 1e8] as const,
  lengthSi: [1e-6, 1] as const,
  perVoltSi: [1e-9, 1] as const,
  altitudeSi: [-1e3, 1e6] as const,
  factor: [1, 1e3] as const,
  ctiV: [0, 2e3] as const,
  frequencyHz: [1e-3, 1e12] as const,
});

const MAX_STRING = 2000;
const LIMITS = { cells: 5000, rows: 200, columns: 100, groups: 20, rules: 50, notes: 50, ledgerIds: 20 } as const;

// ---- registry (a table or set is trusted only if the validator produced it) ---------------------------------------------

const PARSED = new WeakSet<object>();
const SETS = new WeakSet<object>();

function deepFreeze<T>(x: T): T {
  if (typeof x === 'object' && x !== null && !Object.isFrozen(x)) {
    for (const v of Object.values(x as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(x);
  }
  return x;
}

// ---- validation helpers --------------------------------------------------------------------------------------------------

const TOP_KEYS = [
  'schema', 'schemaVersion', 'table', 'name', 'standard', 'source', 'edition', 'clause', 'tableNumber', 'ledgerIds', 'status',
  'entered', 'enteredBy', 'enteredDate', 'verifiedBy', 'verifiedDate', 'bannerRequired', 'units', 'interpolation',
  'interpolationSource', 'rows', 'columns', 'cells', 'groups', 'rules', 'elevationBreakpoint', 'notes',
];
const ROW_KEYS = ['key', 'value', 'perVolt', 'printed'];
const COL_KEYS = ['key', 'selectors'];
const PROV_KEYS = ['source', 'printed', 'page', 'enteredBy', 'enteredDate', 'checkedBy', 'checkedDate'];
const CELL_KEYS = ['row', 'col', 'value', 'unit', ...PROV_KEYS];
const GROUP_KEYS = ['group', 'ctiMin', 'ctiMax', 'minInclusive', 'maxInclusive', 'unit', ...PROV_KEYS];
const RULE_KEYS = ['rule', 'mode', 'coatingType', 'value', 'unit', 'clauseText', 'source', 'page', 'enteredBy', 'enteredDate', 'checkedBy', 'checkedDate'];
const BP_KEYS = ['value', 'unit', ...PROV_KEYS];

interface Ctx {
  readonly errors: string[];
  readonly today: number | undefined;
}

function getKey(o: Rec, k: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}
function unknownKeys(o: Rec, allowed: readonly string[], path: string, c: Ctx): void {
  for (const k of Object.keys(o)) {
    if (o[k] !== undefined && !allowed.includes(k)) c.errors.push(`${path}: unknown key "${k}"`);
  }
}
function str(o: Rec, k: string, path: string, c: Ctx, required: boolean): string {
  const v = getKey(o, k);
  if (v === undefined || v === null) {
    if (required) c.errors.push(`${path}.${k} is required`);
    return '';
  }
  if (typeof v !== 'string') {
    c.errors.push(`${path}.${k} must be a string`);
    return '';
  }
  if (v.length > MAX_STRING) {
    c.errors.push(`${path}.${k} is too long (more than ${String(MAX_STRING)} characters)`);
    return '';
  }
  if (required && v.trim() === '') c.errors.push(`${path}.${k} must not be empty`);
  return v;
}
function dateField(o: Rec, k: string, path: string, c: Ctx, required: boolean): string {
  const v = str(o, k, path, c, required);
  if (v === '') return v;
  const d = dayNumber(v);
  if (d === undefined) {
    c.errors.push(`${path}.${k} must be a real calendar date YYYY-MM-DD`);
    return '';
  }
  if (c.today !== undefined && d > c.today) c.errors.push(`${path}.${k} (${v}) is in the future`);
  return v;
}
function finiteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function inWindow(x: number, w: readonly [number, number]): boolean {
  return x >= w[0] && x <= w[1];
}

function provenance(o: Rec, path: string, c: Ctx): Provenance & { checked: boolean } {
  const source = str(o, 'source', path, c, true);
  const printed = str(o, 'printed', path, c, true);
  const page = str(o, 'page', path, c, false);
  const enteredBy = str(o, 'enteredBy', path, c, true);
  const enteredDate = dateField(o, 'enteredDate', path, c, true);
  const checkedBy = str(o, 'checkedBy', path, c, false);
  const checkedDate = dateField(o, 'checkedDate', path, c, false);
  if ((checkedBy.trim() === '') !== (checkedDate === '')) c.errors.push(`${path}: checkedBy and checkedDate must both be given or both be absent`);
  return {
    source,
    printed,
    ...(page !== '' ? { page } : {}),
    enteredBy,
    enteredDate,
    ...(checkedBy.trim() !== '' ? { checkedBy } : {}),
    ...(checkedDate !== '' ? { checkedDate } : {}),
    checked: checkedBy.trim() !== '' && checkedDate !== '',
  };
}

function rowWindow(unit: string): readonly [number, number] {
  return unit === 'm' || unit === 'km' ? UNIT_SLIP_WINDOWS.altitudeSi : UNIT_SLIP_WINDOWS.voltageSi;
}
function cellWindow(unit: string): readonly [number, number] {
  if (VOLT_UNITS.includes(unit)) return UNIT_SLIP_WINDOWS.voltageSi;
  if (LENGTH_UNITS.includes(unit)) return UNIT_SLIP_WINDOWS.lengthSi;
  if (PER_VOLT_UNITS.includes(unit)) return UNIT_SLIP_WINDOWS.perVoltSi;
  return UNIT_SLIP_WINDOWS.factor;
}

function parseRows(o: Rec, id: TableId, rowUnit: string, c: Ctx): SpacingRow[] {
  const raw = getKey(o, 'rows');
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    c.errors.push('rows must be an array');
    return [];
  }
  if (raw.length > LIMITS.rows) c.errors.push(`too many rows (more than ${String(LIMITS.rows)})`);
  const out: SpacingRow[] = [];
  const keys = new Set<string>();
  const values = new Set<number>();
  let perVoltRows = 0;
  raw.slice(0, LIMITS.rows).forEach((r: unknown, i) => {
    const p = `rows[${String(i)}]`;
    if (!isRec(r)) {
      c.errors.push(`${p} must be an object`);
      return;
    }
    unknownKeys(r, ROW_KEYS, p, c);
    const key = str(r, 'key', p, c, true);
    if (keys.has(key)) c.errors.push(`${p}: duplicate row key "${key}"`);
    keys.add(key);
    const pv = getKey(r, 'perVolt');
    const value = getKey(r, 'value');
    if (pv !== undefined && typeof pv !== 'boolean') c.errors.push(`${p}.perVolt must be true or absent`);
    if (pv === true) {
      perVoltRows++;
      if (id !== 'T8') c.errors.push(`${p}: a per-volt row is allowed only in T8`);
      else if (perVoltRows > 1) c.errors.push(`${p}: only one per-volt row is allowed`);
      if (value !== undefined) c.errors.push(`${p}: a perVolt row must not carry a value`);
      out.push({ key, perVolt: true });
      return;
    }
    if (!finiteNumber(value)) {
      c.errors.push(`${p}.value must be a finite number (the row value in ${rowUnit})`);
      return;
    }
    const f = unitFactorSi(rowUnit) ?? 1;
    const w = rowWindow(rowUnit);
    if (!inWindow(value * f, w)) c.errors.push(`${p}.value ${String(value)} ${rowUnit} is outside the unit slip window (check the unit); this is not a standard limit`);
    if (values.has(value)) c.errors.push(`${p}: duplicate row value ${String(value)}`);
    values.add(value);
    out.push({ key, value, perVolt: false });
  });
  return out;
}

function parseColumns(o: Rec, spec: TableSpec, id: TableId, c: Ctx): SpacingColumn[] {
  const raw = getKey(o, 'columns');
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    c.errors.push('columns must be an array');
    return [];
  }
  if (raw.length > LIMITS.columns) c.errors.push(`too many columns (more than ${String(LIMITS.columns)})`);
  const out: SpacingColumn[] = [];
  const keys = new Set<string>();
  const sets: string[] = [];
  raw.slice(0, LIMITS.columns).forEach((r: unknown, i) => {
    const p = `columns[${String(i)}]`;
    if (!isRec(r)) {
      c.errors.push(`${p} must be an object`);
      return;
    }
    unknownKeys(r, COL_KEYS, p, c);
    const key = str(r, 'key', p, c, true);
    if (keys.has(key)) c.errors.push(`${p}: duplicate column key "${key}"`);
    keys.add(key);
    const sel = getKey(r, 'selectors');
    const selectors: Record<string, SelectorValue> = {};
    if (sel === undefined) {
      /* no selectors: a wildcard column */
    } else if (!isRec(sel)) {
      c.errors.push(`${p}.selectors must be an object`);
    } else {
      for (const k of Object.keys(sel).sort()) {
        const v = sel[k];
        if (!spec.selectors.includes(k)) {
          c.errors.push(`${p}: selector ${k} is not used by table ${id}`);
          continue;
        }
        const allowed = SELECTOR_VALUES[k] ?? [];
        if (!(typeof v === 'string' || typeof v === 'number') || !allowed.includes(v)) {
          c.errors.push(`${p}: selector ${k} has an unsupported value ${JSON.stringify(v)} (allowed: ${allowed.join(', ')})`);
          continue;
        }
        selectors[k] = v;
      }
    }
    const sig = JSON.stringify(Object.entries(selectors));
    if (sets.includes(sig)) c.errors.push(`${p}: column "${key}" has the same selectors as another column`);
    sets.push(sig);
    out.push({ key, selectors });
  });
  return out;
}

function parseCells(
  o: Rec,
  spec: TableSpec,
  id: TableId,
  rows: readonly SpacingRow[],
  columns: readonly SpacingColumn[],
  c: Ctx,
): { cells: SpacingCell[]; allChecked: boolean } {
  const raw = getKey(o, 'cells');
  if (raw === undefined) return { cells: [], allChecked: true };
  if (!Array.isArray(raw)) {
    c.errors.push('cells must be an array');
    return { cells: [], allChecked: true };
  }
  if (raw.length > LIMITS.cells) {
    c.errors.push(`too many cells (more than ${String(LIMITS.cells)})`);
    return { cells: [], allChecked: true };
  }
  const out: SpacingCell[] = [];
  const seen = new Set<string>();
  let allChecked = true;
  raw.forEach((r: unknown, i) => {
    const p = `cells[${String(i)}]`;
    if (!isRec(r)) {
      c.errors.push(`${p} must be an object`);
      return;
    }
    unknownKeys(r, CELL_KEYS, p, c);
    const row = str(r, 'row', p, c, true);
    const col = str(r, 'col', p, c, true);
    const rowRec = rows.find((x) => x.key === row);
    if (row !== '' && rowRec === undefined) c.errors.push(`${p}: row "${row}" is not a row key of this table`);
    if (col !== '' && !columns.some((x) => x.key === col)) c.errors.push(`${p}: column "${col}" is not a column key of this table`);
    const k = JSON.stringify([row, col]);
    if (seen.has(k)) c.errors.push(`${p}: duplicate cell for row "${row}" column "${col}"`);
    seen.add(k);
    const unit = str(r, 'unit', p, c, true);
    const perVoltRow = rowRec?.perVolt === true;
    const allowedUnits = perVoltRow ? PER_VOLT_UNITS : spec.cellUnits;
    if (unit !== '' && !allowedUnits.includes(unit)) c.errors.push(`${p}.unit "${unit}" is not allowed here (allowed: ${allowedUnits.join(', ')})`);
    const value = getKey(r, 'value');
    if (!finiteNumber(value) || value <= 0) {
      c.errors.push(`${p}.value must be a finite number greater than zero (an absent cell means no data; omit it)`);
    } else if (unit !== '' && allowedUnits.includes(unit)) {
      const si = value * (unitFactorSi(unit) ?? 1);
      if (!inWindow(si, cellWindow(unit))) c.errors.push(`${p}.value ${String(value)} ${unit} is outside the unit slip window (check the unit); this is not a standard limit`);
      if (spec.minCell !== undefined && value < spec.minCell) c.errors.push(`${p}.value ${String(value)} is below the structural minimum ${String(spec.minCell)} for ${id}`);
    }
    const prov = provenance(r, p, c);
    if (!prov.checked) allChecked = false;
    if (finiteNumber(value)) {
      const { checked: _checked, ...rest } = prov;
      void _checked;
      out.push({ row, col, value, unit, ...rest });
    }
  });
  return { cells: out, allChecked };
}

function parseGroups(o: Rec, c: Ctx): { groups: MaterialGroupRecord[]; allChecked: boolean } {
  const raw = getKey(o, 'groups');
  if (raw === undefined) return { groups: [], allChecked: true };
  if (!Array.isArray(raw)) {
    c.errors.push('groups must be an array');
    return { groups: [], allChecked: true };
  }
  if (raw.length > LIMITS.groups) c.errors.push(`too many groups (more than ${String(LIMITS.groups)})`);
  const out: MaterialGroupRecord[] = [];
  const seen = new Set<string>();
  let allChecked = true;
  raw.slice(0, LIMITS.groups).forEach((r: unknown, i) => {
    const p = `groups[${String(i)}]`;
    if (!isRec(r)) {
      c.errors.push(`${p} must be an object`);
      return;
    }
    unknownKeys(r, GROUP_KEYS, p, c);
    const group = getKey(r, 'group');
    if (typeof group !== 'string' || !(MATERIAL_GROUPS as readonly string[]).includes(group)) c.errors.push(`${p}.group must be one of ${MATERIAL_GROUPS.join(', ')}`);
    else if (seen.has(group)) c.errors.push(`${p}: duplicate group ${group}`);
    else seen.add(group);
    const unit = getKey(r, 'unit');
    if (unit !== 'V') c.errors.push(`${p}.unit must be "V" (CTI is a voltage)`);
    const bound = (k: 'ctiMin' | 'ctiMax', inc: 'minInclusive' | 'maxInclusive'): number | undefined => {
      const v = getKey(r, k);
      const iv = getKey(r, inc);
      if (v === undefined) {
        if (iv !== undefined) c.errors.push(`${p}.${inc} is given without ${k}`);
        return undefined;
      }
      if (!finiteNumber(v) || !inWindow(v, UNIT_SLIP_WINDOWS.ctiV)) {
        c.errors.push(`${p}.${k} must be a finite number inside the unit slip window (check the unit); this is not a standard limit`);
        return undefined;
      }
      if (typeof iv !== 'boolean') c.errors.push(`${p}.${inc} must be true or false when ${k} is given`);
      return v;
    };
    const lo = bound('ctiMin', 'minInclusive');
    const hi = bound('ctiMax', 'maxInclusive');
    if (getKey(r, 'ctiMin') === undefined && getKey(r, 'ctiMax') === undefined) c.errors.push(`${p}: at least one CTI bound (ctiMin or ctiMax) is required`);
    if (lo !== undefined && hi !== undefined && lo > hi) c.errors.push(`${p}: ctiMin must not exceed ctiMax`);
    const prov = provenance(r, p, c);
    if (!prov.checked) allChecked = false;
    const { checked: _checked, ...rest } = prov;
    void _checked;
    if (typeof group === 'string' && (MATERIAL_GROUPS as readonly string[]).includes(group)) {
      out.push({
        group: group as MaterialGroup,
        ...(lo !== undefined ? { ctiMin: lo, minInclusive: getKey(r, 'minInclusive') === true } : {}),
        ...(hi !== undefined ? { ctiMax: hi, maxInclusive: getKey(r, 'maxInclusive') === true } : {}),
        unit: 'V',
        ...rest,
      });
    }
  });
  return { groups: out, allChecked };
}

const FREQ_UNITS = ['Hz', 'kHz', 'MHz'];
function parseRules(o: Rec, c: Ctx): { rules: RuleRecord[]; allChecked: boolean } {
  const raw = getKey(o, 'rules');
  if (raw === undefined) return { rules: [], allChecked: true };
  if (!Array.isArray(raw)) {
    c.errors.push('rules must be an array');
    return { rules: [], allChecked: true };
  }
  if (raw.length > LIMITS.rules) c.errors.push(`too many rules (more than ${String(LIMITS.rules)})`);
  const out: RuleRecord[] = [];
  const seen = new Set<string>();
  let allChecked = true;
  raw.slice(0, LIMITS.rules).forEach((r: unknown, i) => {
    const p = `rules[${String(i)}]`;
    if (!isRec(r)) {
      c.errors.push(`${p} must be an object`);
      return;
    }
    unknownKeys(r, RULE_KEYS, p, c);
    const rule = getKey(r, 'rule');
    if (typeof rule !== 'string' || !(RULE_IDS as readonly string[]).includes(rule)) {
      c.errors.push(`${p}.rule must be one of ${RULE_IDS.join(', ')}`);
      return;
    }
    const clauseText = str(r, 'clauseText', p, c, true);
    const source = str(r, 'source', p, c, true);
    const page = str(r, 'page', p, c, false);
    const enteredBy = str(r, 'enteredBy', p, c, true);
    const enteredDate = dateField(r, 'enteredDate', p, c, true);
    const checkedBy = str(r, 'checkedBy', p, c, false);
    const checkedDate = dateField(r, 'checkedDate', p, c, false);
    if ((checkedBy.trim() === '') !== (checkedDate === '')) c.errors.push(`${p}: checkedBy and checkedDate must both be given or both be absent`);
    if (checkedBy.trim() === '' || checkedDate === '') allChecked = false;
    const value = getKey(r, 'value');
    const unit = getKey(r, 'unit');
    const mode = getKey(r, 'mode');
    const coatingType = getKey(r, 'coatingType');
    const num = (min: number, max: number, what: string): number | undefined => {
      if (!finiteNumber(value) || value < min || value > max) {
        c.errors.push(`${p}.value must be a finite number ${what}`);
        return undefined;
      }
      return value;
    };
    let ok = true;
    let outValue: number | undefined;
    let outUnit: string | undefined;
    let outMode: string | undefined;
    let outCoating: string | undefined;
    switch (rule as RuleId) {
      case 'reinforced-creepage-multiplier': {
        outValue = num(1, 1e3, 'of at least 1 (a reinforced distance is never below basic)');
        if (unit !== '1') c.errors.push(`${p}.unit must be "1" (a multiplier)`);
        outUnit = '1';
        ok = outValue !== undefined && unit === '1';
        break;
      }
      case 'reinforced-clearance': {
        if (mode !== 'next-higher-row' && mode !== 'multiplier') {
          c.errors.push(`${p}.mode must be "next-higher-row" or "multiplier"`);
          ok = false;
        } else {
          outMode = mode;
          if (mode === 'multiplier') {
            outValue = num(1, 1e3, 'of at least 1 (a reinforced distance is never below basic)');
            if (unit !== '1') c.errors.push(`${p}.unit must be "1" (a multiplier)`);
            outUnit = '1';
            ok = outValue !== undefined && unit === '1';
          } else if (value !== undefined) {
            c.errors.push(`${p}.value must be absent for mode next-higher-row`);
            ok = false;
          }
        }
        break;
      }
      case 'scope-max-frequency': {
        if (typeof unit !== 'string' || !FREQ_UNITS.includes(unit)) {
          c.errors.push(`${p}.unit must be one of ${FREQ_UNITS.join(', ')}`);
          ok = false;
        } else {
          outUnit = unit;
          outValue = num(Number.MIN_VALUE, Infinity, 'greater than zero');
          if (outValue !== undefined && !inWindow(outValue * (unitFactorSi(unit) ?? 1), UNIT_SLIP_WINDOWS.frequencyHz)) {
            c.errors.push(`${p}.value is outside the unit slip window (check the unit); this is not a standard limit`);
            ok = false;
          }
          ok = ok && outValue !== undefined;
        }
        break;
      }
      case 'scope-max-voltage-ac-rms':
      case 'scope-max-voltage-dc': {
        if (typeof unit !== 'string' || !VOLT_UNITS.includes(unit)) {
          c.errors.push(`${p}.unit must be one of ${VOLT_UNITS.join(', ')}`);
          ok = false;
        } else {
          outUnit = unit;
          outValue = num(Number.MIN_VALUE, Infinity, 'greater than zero');
          if (outValue !== undefined && !inWindow(outValue * (unitFactorSi(unit) ?? 1), UNIT_SLIP_WINDOWS.voltageSi)) {
            c.errors.push(`${p}.value must be inside the unit slip window (check the unit); this is not a standard limit`);
            ok = false;
          }
          ok = ok && outValue !== undefined;
        }
        break;
      }
      case 'coating-credit': {
        if (coatingType !== 'type1' && coatingType !== 'type2') {
          c.errors.push(`${p}.coatingType must be "type1" or "type2"`);
          ok = false;
        } else {
          outCoating = coatingType;
        }
        outValue = num(Number.MIN_VALUE, 1, 'greater than 0 and at most 1 (a credit never increases a distance)');
        if (unit !== '1') c.errors.push(`${p}.unit must be "1" (a multiplier)`);
        outUnit = '1';
        ok = ok && outValue !== undefined && unit === '1';
        break;
      }
    }
    const dupKey = rule === 'coating-credit' ? `${rule}:${String(coatingType)}` : rule;
    if (seen.has(dupKey)) c.errors.push(`${p}: duplicate rule record ${dupKey}`);
    seen.add(dupKey);
    if (ok) {
      out.push({
        rule: rule as RuleId,
        ...(outMode !== undefined ? { mode: outMode } : {}),
        ...(outCoating !== undefined ? { coatingType: outCoating } : {}),
        ...(outValue !== undefined ? { value: outValue } : {}),
        ...(outUnit !== undefined ? { unit: outUnit } : {}),
        clauseText,
        source,
        ...(page !== '' ? { page } : {}),
        enteredBy,
        enteredDate,
        ...(checkedBy.trim() !== '' ? { checkedBy } : {}),
        ...(checkedDate !== '' ? { checkedDate } : {}),
      });
    }
  });
  return { rules: out, allChecked };
}

function parseBreakpoint(o: Rec, id: TableId, c: Ctx): { bp: ElevationBreakpoint | undefined; checked: boolean } {
  const raw = getKey(o, 'elevationBreakpoint');
  if (raw === undefined) return { bp: undefined, checked: true };
  if (id !== 'T8') {
    c.errors.push('elevationBreakpoint is allowed only in T8');
    return { bp: undefined, checked: true };
  }
  const p = 'elevationBreakpoint';
  if (!isRec(raw)) {
    c.errors.push(`${p} must be an object`);
    return { bp: undefined, checked: true };
  }
  unknownKeys(raw, BP_KEYS, p, c);
  const value = getKey(raw, 'value');
  const unit = getKey(raw, 'unit');
  const before = c.errors.length;
  if (unit !== 'm' && unit !== 'km') c.errors.push(`${p}.unit must be "m" or "km"`);
  if (!finiteNumber(value) || value <= 0 || !inWindow(value * (unitFactorSi(String(unit)) ?? 1), UNIT_SLIP_WINDOWS.altitudeSi)) {
    c.errors.push(`${p}.value must be a finite number greater than zero inside the unit slip window (check the unit)`);
  }
  const prov = provenance(raw, p, c);
  if (c.errors.length > before || !finiteNumber(value) || typeof unit !== 'string') return { bp: undefined, checked: prov.checked };
  const { checked, ...rest } = prov;
  return { bp: { value, unit, ...rest }, checked };
}

function isEmptyParts(kind: Kind, n: { cells: number; groups: number; rules: number }): boolean {
  return kind === 'grid' ? n.cells === 0 : kind === 'groups' ? n.groups === 0 : n.rules === 0;
}

/** Strict validator. Reports every problem; never throws. A returned table is deep-frozen and registered as validated. */
export function parseSpacingTable(raw: unknown, opts: { today?: string } = {}): Result<SpacingTable, string[]> {
  const todayN = opts.today === undefined ? undefined : dayNumber(opts.today);
  if (opts.today !== undefined && todayN === undefined) return { ok: false, error: ['today must be a real calendar date YYYY-MM-DD'] };
  const c: Ctx = { errors: [], today: todayN };
  if (!isRec(raw)) return { ok: false, error: ['a table must be a JSON object'] };
  unknownKeys(raw, TOP_KEYS, 'table', c);
  if (getKey(raw, 'schema') !== SCHEMA_ID) c.errors.push(`schema must be "${SCHEMA_ID}"`);
  if (getKey(raw, 'schemaVersion') !== 1) c.errors.push('schemaVersion must be 1');
  const idRaw = getKey(raw, 'table');
  const id = (TABLE_IDS as readonly unknown[]).includes(idRaw) ? (idRaw as TableId) : undefined;
  if (id === undefined) {
    c.errors.push(`table must be one of ${TABLE_IDS.join(', ')}`);
    return { ok: false, error: c.errors };
  }
  const spec = TABLE_SPECS[id];
  const standard = str(raw, 'standard', 'table', c, true);
  if (standard !== '' && standard !== spec.standard) c.errors.push(`standard for ${id} must be "${spec.standard}"`);
  const source = str(raw, 'source', 'table', c, true);
  const edition = str(raw, 'edition', 'table', c, true);
  const clause = str(raw, 'clause', 'table', c, false);
  const tableNumber = str(raw, 'tableNumber', 'table', c, false);
  void str(raw, 'name', 'table', c, false);

  const ledgerRaw = getKey(raw, 'ledgerIds');
  const ledgerIds: string[] = [];
  if (!Array.isArray(ledgerRaw) || ledgerRaw.length === 0) c.errors.push('ledgerIds must be a non-empty array of ledger ids');
  else if (ledgerRaw.length > LIMITS.ledgerIds) c.errors.push('ledgerIds has too many entries');
  else {
    for (const x of ledgerRaw) {
      if (typeof x !== 'string' || !/^S-\d{3}[a-z]?$/.test(x)) c.errors.push(`ledgerIds entry ${JSON.stringify(x)} is not a ledger id`);
      else if (!LEDGER.some((r) => r.id === x)) c.errors.push(`ledgerIds entry ${x} is not in the source ledger`);
      else ledgerIds.push(x);
    }
  }

  const statusRaw = getKey(raw, 'status');
  const status: TableStatus | undefined =
    statusRaw === 'PAYWALLED-USER-MUST-VERIFY' || statusRaw === 'UNVERIFIED' || statusRaw === 'VERIFIED' ? statusRaw : undefined;
  if (status === undefined) c.errors.push('status must be PAYWALLED-USER-MUST-VERIFY, UNVERIFIED or VERIFIED');
  const enteredRaw = getKey(raw, 'entered');
  if (typeof enteredRaw !== 'boolean') c.errors.push('entered must be true or false');
  const bannerRaw = getKey(raw, 'bannerRequired');
  if (typeof bannerRaw !== 'boolean') c.errors.push('bannerRequired must be true or false');
  const enteredBy = str(raw, 'enteredBy', 'table', c, false);
  const enteredDate = dateField(raw, 'enteredDate', 'table', c, false);
  const verifiedBy = str(raw, 'verifiedBy', 'table', c, false);
  const verifiedDate = dateField(raw, 'verifiedDate', 'table', c, false);

  const unitsRaw = getKey(raw, 'units');
  let unitRow = spec.rowUnits[0] ?? 'V';
  let unitCell = spec.cellUnits[0] ?? '1';
  if (!isRec(unitsRaw)) c.errors.push('units must be an object { row, cell }');
  else {
    unknownKeys(unitsRaw, ['row', 'cell'], 'units', c);
    const r = getKey(unitsRaw, 'row');
    const cl = getKey(unitsRaw, 'cell');
    if (typeof r !== 'string' || !spec.rowUnits.includes(r)) c.errors.push(`units.row must be one of ${spec.rowUnits.join(', ')} for ${id}`);
    else unitRow = r;
    if (typeof cl !== 'string' || !spec.cellUnits.includes(cl)) c.errors.push(`units.cell must be one of ${spec.cellUnits.join(', ')} for ${id}`);
    else unitCell = cl;
  }

  const interpRaw = getKey(raw, 'interpolation') ?? 'none';
  const interpolation: Interpolation = interpRaw === 'linear' ? 'linear' : 'none';
  if (interpRaw !== 'none' && interpRaw !== 'linear') c.errors.push('interpolation must be "none" or "linear"');
  const interpolationSource = str(raw, 'interpolationSource', 'table', c, false);
  if (interpolation === 'linear' && interpolationSource.trim() === '') c.errors.push('interpolationSource (the clause that permits linear interpolation) is required when interpolation is "linear"');

  const notesRaw = getKey(raw, 'notes');
  const notes: string[] = [];
  if (notesRaw !== undefined) {
    if (!Array.isArray(notesRaw) || notesRaw.length > LIMITS.notes || !notesRaw.every((n) => typeof n === 'string' && n.length <= MAX_STRING)) c.errors.push('notes must be an array of short strings');
    else notes.push(...(notesRaw as string[]));
  }

  const rows = parseRows(raw, id, unitRow, c);
  const columns = parseColumns(raw, spec, id, c);
  const { cells, allChecked: cellsChecked } = parseCells(raw, spec, id, rows, columns, c);
  const { groups, allChecked: groupsChecked } = parseGroups(raw, c);
  const { rules, allChecked: rulesChecked } = parseRules(raw, c);
  const { bp, checked: bpChecked } = parseBreakpoint(raw, id, c);

  if (spec.kind !== 'grid' && (rows.length > 0 || columns.length > 0 || cells.length > 0)) c.errors.push(`${id} does not use rows, columns or cells`);
  if (spec.kind !== 'groups' && groups.length > 0) c.errors.push(`${id} does not use groups`);
  if (spec.kind !== 'rules' && rules.length > 0) c.errors.push(`${id} does not use rules`);

  const empty = isEmptyParts(spec.kind, { cells: cells.length, groups: groups.length, rules: rules.length });
  if (typeof enteredRaw === 'boolean' && enteredRaw === empty) {
    c.errors.push(empty ? 'entered is true but the table holds no values' : 'entered is false but the table holds values; set entered to true');
  }
  if (!empty) {
    if (edition.trim() === '' || edition.trim().toLowerCase() === 'not entered') c.errors.push('edition must name the standard edition the values were read from (it is "not entered")');
    if (enteredBy.trim() === '') c.errors.push('table.enteredBy is required when values are entered');
    if (enteredDate === '') c.errors.push('table.enteredDate is required when values are entered');
  }

  if (status === 'VERIFIED') {
    if (verifiedBy.trim() === '') c.errors.push('status VERIFIED requires verifiedBy (the person who verified the values)');
    if (verifiedDate === '') c.errors.push('status VERIFIED requires verifiedDate');
    if (bannerRaw !== false) c.errors.push('status VERIFIED requires bannerRequired false');
    if (empty) c.errors.push('an empty table cannot be VERIFIED');
    if (!(cellsChecked && groupsChecked && rulesChecked && bpChecked)) c.errors.push('status VERIFIED requires checkedBy and checkedDate on every entered record');
  } else if (status !== undefined) {
    if (bannerRaw !== true) c.errors.push('a table that is not VERIFIED must set bannerRequired to true');
    if (verifiedBy.trim() !== '' || verifiedDate !== '') c.errors.push('verifiedBy/verifiedDate are present but status is not VERIFIED; set status to VERIFIED to claim verification');
  }

  if (c.errors.length > 0 || status === undefined) return { ok: false, error: c.errors };
  const table: SpacingTable = {
    schema: SCHEMA_ID,
    schemaVersion: 1,
    table: id,
    name: spec.name,
    standard,
    source,
    edition,
    clause,
    tableNumber,
    ledgerIds,
    status,
    entered: enteredRaw === true,
    enteredBy,
    enteredDate,
    verifiedBy,
    verifiedDate,
    bannerRequired: bannerRaw === true,
    units: { row: unitRow, cell: unitCell },
    interpolation,
    interpolationSource,
    rows,
    columns,
    cells,
    groups,
    rules,
    ...(bp !== undefined ? { elevationBreakpoint: bp } : {}),
    notes,
  };
  deepFreeze(table);
  PARSED.add(table);
  return { ok: true, value: table };
}

// ---- state ---------------------------------------------------------------------------------------------------------------

export function isTableEmpty(t: SpacingTable): boolean {
  return isEmptyParts(TABLE_SPECS[t.table].kind, { cells: t.cells.length, groups: t.groups.length, rules: t.rules.length });
}

/**
 * Derived, never stored: a table that did not come from parseSpacingTable is never VERIFIED.
 * VERIFIED needs the signed fields AND every record checked, re-derived here as defence in depth.
 */
export function dataStateOf(t: SpacingTable): DataState {
  const cached = STATE_CACHE.get(t);
  if (cached !== undefined) return cached;
  const state = computeState(t);
  STATE_CACHE.set(t, state); // tables are frozen, so the state never changes
  return state;
}

const STATE_CACHE = new WeakMap<SpacingTable, DataState>();

function computeState(t: SpacingTable): DataState {
  if (isTableEmpty(t)) return 'EMPTY';
  const records: { checkedBy?: string | undefined; checkedDate?: string | undefined }[] = [...t.cells, ...t.groups, ...t.rules];
  if (t.elevationBreakpoint !== undefined) records.push(t.elevationBreakpoint);
  const allChecked = records.every((r) => nonEmpty(r.checkedBy) && nonEmpty(r.checkedDate));
  const signed = t.status === 'VERIFIED' && nonEmpty(t.verifiedBy) && nonEmpty(t.verifiedDate) && t.bannerRequired === false;
  return PARSED.has(t) && signed && allChecked ? 'VERIFIED' : 'ENTERED_UNVERIFIED';
}

export function emptyTableMessage(t: SpacingTable): string {
  return `INSUFFICIENT DATA: table ${t.name} is empty (enter values from your licensed copy)`;
}

// ---- table sets ----------------------------------------------------------------------------------------------------------

export function isTableSet(x: unknown): x is SpacingTableSet {
  return typeof x === 'object' && x !== null && SETS.has(x);
}

/** Builds a set from validated tables; tables that are not given stay as the shipped (empty) ones. */
export function makeTableSet(tables: Partial<Record<TableId, SpacingTable>> = {}, base?: SpacingTableSet): Result<SpacingTableSet, string[]> {
  const errors: string[] = [];
  const start = base ?? SHIPPED_TABLES;
  const out = {} as Record<TableId, SpacingTable>;
  for (const id of TABLE_IDS) {
    const t = tables[id] ?? start.tables[id];
    if (!PARSED.has(t)) errors.push(`table ${id} was not produced by the validator (parseSpacingTable)`);
    else if (t.table !== id) errors.push(`table ${id} holds the data of ${t.table}`);
    out[id] = t;
  }
  if (errors.length > 0) return { ok: false, error: errors };
  const set: SpacingTableSet = Object.freeze({ tables: Object.freeze(out) });
  SETS.add(set);
  return { ok: true, value: set };
}

// ---- import / export -----------------------------------------------------------------------------------------------------

export interface ImportOutcome {
  readonly tables: SpacingTableSet;
  readonly imported: readonly { readonly table: TableId; readonly state: DataState; readonly records: number }[];
}

/**
 * Importer for the JSON file the human edits: either one table object or a bundle
 * { schema: "pcb-calc/safety-table-set@1", schemaVersion: 1, tables: [...] }. Strict: size cap, schema and version, unknown keys
 * rejected, units checked, VERIFIED refused without verifiedBy and a checker on every record. Returns the merged set; the
 * input base (default: the shipped empty set) is never modified. `today` (YYYY-MM-DD) is injected so future dates can be refused.
 */
export function importSpacingTables(jsonText: string, opts: { today?: string; base?: SpacingTableSet } = {}): Result<ImportOutcome, string[]> {
  if (typeof jsonText !== 'string') return { ok: false, error: ['import text must be a string'] };
  if (jsonText.length > MAX_IMPORT_CHARS) return { ok: false, error: [`import text is too large (more than ${String(MAX_IMPORT_CHARS)} characters)`] };
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, error: [`import text is not valid JSON (${e instanceof Error ? e.message : String(e)})`] };
  }
  if (!isRec(data)) return { ok: false, error: ['import must be a JSON object (one table or a table-set bundle)'] };
  if (opts.base !== undefined && !isTableSet(opts.base)) return { ok: false, error: ['base is not a validated table set'] };
  const popts = opts.today !== undefined ? { today: opts.today } : {};
  let rawTables: unknown[];
  const errors: string[] = [];
  if (Object.prototype.hasOwnProperty.call(data, 'tables') && !Object.prototype.hasOwnProperty.call(data, 'table')) {
    const c: Ctx = { errors, today: undefined };
    unknownKeys(data, ['schema', 'schemaVersion', 'tables'], 'bundle', c);
    if (data['schema'] !== SET_SCHEMA_ID) errors.push(`bundle schema must be "${SET_SCHEMA_ID}"`);
    if (data['schemaVersion'] !== 1) errors.push('bundle schemaVersion must be 1');
    const t = data['tables'];
    if (!Array.isArray(t)) return { ok: false, error: [...errors, 'bundle tables must be an array'] };
    if (t.length === 0) return { ok: false, error: [...errors, 'bundle tables must contain at least one table'] };
    if (t.length > TABLE_IDS.length) return { ok: false, error: [...errors, 'bundle holds more tables than exist'] };
    rawTables = t;
  } else {
    rawTables = [data];
  }
  const parsed: SpacingTable[] = [];
  rawTables.forEach((rt, i) => {
    const r = parseSpacingTable(rt, popts);
    if (!r.ok) {
      const label = isRec(rt) && typeof rt['table'] === 'string' ? rt['table'] : `#${String(i + 1)}`;
      errors.push(...r.error.map((m) => `table ${label}: ${m}`));
    } else if (parsed.some((p) => p.table === r.value.table)) errors.push(`table ${r.value.table} appears twice in the bundle`);
    else parsed.push(r.value);
  });
  if (errors.length > 0) return { ok: false, error: errors };
  const patch: Partial<Record<TableId, SpacingTable>> = {};
  for (const t of parsed) patch[t.table] = t;
  const set = makeTableSet(patch, opts.base);
  if (!set.ok) return set;
  return {
    ok: true,
    value: {
      tables: set.value,
      imported: parsed.map((t) => ({ table: t.table, state: dataStateOf(t), records: t.cells.length + t.groups.length + t.rules.length })),
    },
  };
}

/** The whole set as the bundle JSON text that importSpacingTables accepts (for saving what was imported). */
export function serializeTableSet(set: SpacingTableSet): string {
  return JSON.stringify({ schema: SET_SCHEMA_ID, schemaVersion: 1, tables: TABLE_IDS.map((id) => set.tables[id]) }, null, 2);
}

// ---- lookup --------------------------------------------------------------------------------------------------------------

export type LookupFailReason = 'EMPTY' | 'EDITION' | 'NO_COLUMN' | 'AMBIGUOUS_COLUMN' | 'ABOVE_TABLE' | 'NO_CELL' | 'BAD_REQUEST';
export type LookupMethod = 'exact' | 'next-higher-row' | 'below-first-row' | 'linear' | 'per-volt-extension';
export interface LookupRequest {
  /** Requested row value in SI (V for voltage rows, m for altitude). */
  readonly rowSi?: number;
  readonly selectors: Selectors;
  /** The edition the user selected; a table of another edition is never used. */
  readonly edition: string;
}
export type LookupOutcome =
  | {
      readonly ok: true;
      readonly valueSi: number;
      readonly method: LookupMethod;
      readonly rowKey: string;
      readonly column: string;
      readonly state: DataState;
      readonly cells: readonly SpacingCell[];
    }
  | { readonly ok: false; readonly reason: LookupFailReason; readonly message: string };

interface TableIndex {
  readonly numeric: readonly { readonly key: string; readonly si: number }[];
  readonly cells: ReadonlyMap<string, SpacingCell>;
  readonly perVoltRow: SpacingRow | undefined;
}
const INDEX_CACHE = new WeakMap<SpacingTable, TableIndex>();
/** Sorted numeric rows and a cell map, built once per (frozen) table so lookups stay cheap. */
function indexOf(t: SpacingTable): TableIndex {
  const hit = INDEX_CACHE.get(t);
  if (hit !== undefined) return hit;
  const factor = unitFactorSi(t.units.row) ?? 1;
  const numeric = t.rows
    .filter((r) => !r.perVolt && r.value !== undefined)
    .map((r) => ({ key: r.key, si: (r.value as number) * factor }))
    .sort((a, b) => a.si - b.si);
  const cells = new Map<string, SpacingCell>();
  for (const c of t.cells) cells.set(`${c.row} ${c.col}`, c);
  const built: TableIndex = { numeric, cells, perVoltRow: t.rows.find((r) => r.perVolt) };
  INDEX_CACHE.set(t, built);
  return built;
}

const REL = 1e-12;
const fail = (reason: LookupFailReason, message: string): LookupOutcome => ({ ok: false, reason, message });
const cellSi = (c: SpacingCell): number => c.value * (unitFactorSi(c.unit) ?? 1);

function matchColumns(t: SpacingTable, sel: Selectors): SpacingColumn[] {
  return t.columns.filter((col) => Object.entries(col.selectors).every(([k, v]) => Object.prototype.hasOwnProperty.call(sel, k) && sel[k] === v));
}

function editionOk(t: SpacingTable, edition: string): boolean {
  return typeof edition === 'string' && t.edition.trim() !== '' && t.edition.trim() === edition.trim();
}

/**
 * Looks one value up in a grid table. Policy (conservative, no hidden defaults):
 *  - the table must be non-empty and of the selected edition;
 *  - exactly one column must match the selectors (a column's absent selector is a wildcard);
 *  - the row is the exact row, else the next HIGHER row; below the first row the first row is used; above the last row it is refused
 *    (T8 alone may extend with its per-volt row);
 *  - linear interpolation only if the table record says "linear"; an absent cell is "no data", never zero;
 *  - stepUp reads the row after the matched one (used by a rule record such as reinforced insulation).
 */
export function lookupGrid(t: SpacingTable, req: LookupRequest, opts: { stepUp?: boolean } = {}): LookupOutcome {
  if (TABLE_SPECS[t.table].kind !== 'grid') return fail('BAD_REQUEST', `table ${t.name} is not a grid table`);
  if (req.rowSi === undefined || !Number.isFinite(req.rowSi)) return fail('BAD_REQUEST', 'the requested row value must be a finite number');
  if (isTableEmpty(t)) return fail('EMPTY', emptyTableMessage(t));
  if (!editionOk(t, req.edition)) {
    return fail('EDITION', `INSUFFICIENT DATA: table ${t.name} holds edition "${t.edition}", which differs from the selected edition "${String(req.edition)}"`);
  }
  const idx0 = indexOf(t);
  const cols = matchColumns(t, req.selectors);
  if (cols.length === 0) {
    return fail('NO_COLUMN', `INSUFFICIENT DATA: table ${t.name} has no column for ${JSON.stringify(req.selectors)}`);
  }
  if (cols.length > 1) {
    return fail('AMBIGUOUS_COLUMN', `INSUFFICIENT DATA: table ${t.name} has ${String(cols.length)} columns matching ${JSON.stringify(req.selectors)} (${cols.map((x) => x.key).join(', ')})`);
  }
  const col = cols[0] as SpacingColumn;
  const numeric = idx0.numeric;
  const cellOf = (rowKey: string): SpacingCell | undefined => idx0.cells.get(`${rowKey} ${col.key}`);
  const noCell = (rowKey: string): LookupOutcome => fail('NO_CELL', `INSUFFICIENT DATA: table ${t.name} has no entered cell for row "${rowKey}" column "${col.key}"`);
  const x = req.rowSi;
  const tol = Math.abs(x) * REL;
  const idx = numeric.findIndex((r) => r.si >= x - tol);
  const done = (method: LookupMethod, rowKey: string, valueSi: number, cells: SpacingCell[]): LookupOutcome => ({
    ok: true,
    valueSi,
    method,
    rowKey,
    column: col.key,
    state: dataStateOf(t),
    cells,
  });
  if (idx === -1) {
    const top = numeric[numeric.length - 1];
    const pvRow = idx0.perVoltRow;
    if (!opts.stepUp && top !== undefined && pvRow !== undefined) {
      const topCell = cellOf(top.key);
      const pvCell = cellOf(pvRow.key);
      if (topCell === undefined) return noCell(top.key);
      if (pvCell === undefined) return noCell(pvRow.key);
      return done('per-volt-extension', top.key, cellSi(topCell) + (x - top.si) * cellSi(pvCell), [topCell, pvCell]);
    }
    return fail('ABOVE_TABLE', `OUT OF TABLE RANGE: the requested value is above the last row of table ${t.name}; no extrapolation is done`);
  }
  const row = numeric[idx] as { key: string; si: number };
  if (opts.stepUp) {
    const next = numeric[idx + 1];
    if (next === undefined) return fail('ABOVE_TABLE', `OUT OF TABLE RANGE: there is no row above the matched row of table ${t.name}`);
    const cell = cellOf(next.key);
    return cell === undefined ? noCell(next.key) : done('next-higher-row', next.key, cellSi(cell), [cell]);
  }
  const exact = Math.abs(row.si - x) <= tol;
  if (!exact && t.interpolation === 'linear' && idx > 0) {
    const lo = numeric[idx - 1] as { key: string; si: number };
    const cLo = cellOf(lo.key);
    const cHi = cellOf(row.key);
    if (cLo === undefined) return noCell(lo.key);
    if (cHi === undefined) return noCell(row.key);
    const f = (x - lo.si) / (row.si - lo.si);
    return done('linear', row.key, cellSi(cLo) + f * (cellSi(cHi) - cellSi(cLo)), [cLo, cHi]);
  }
  const cell = cellOf(row.key);
  if (cell === undefined) return noCell(row.key);
  return done(exact ? 'exact' : idx === 0 ? 'below-first-row' : 'next-higher-row', row.key, cellSi(cell), [cell]);
}

export type GroupOutcome =
  | { readonly ok: true; readonly group: MaterialGroup; readonly record: MaterialGroupRecord; readonly state: DataState }
  | { readonly ok: false; readonly reason: LookupFailReason; readonly message: string };

/** Material group from CTI, using ONLY the human-entered definitions of T6 (no band is known to the code). */
export function findGroupForCti(t6: SpacingTable, ctiV: number, edition: string): GroupOutcome {
  if (t6.table !== 'T6') return { ok: false, reason: 'BAD_REQUEST', message: 'findGroupForCti needs table T6' };
  if (!Number.isFinite(ctiV)) return { ok: false, reason: 'BAD_REQUEST', message: 'CTI must be a finite number' };
  if (isTableEmpty(t6)) return { ok: false, reason: 'EMPTY', message: emptyTableMessage(t6) };
  if (!editionOk(t6, edition)) {
    return { ok: false, reason: 'EDITION', message: `INSUFFICIENT DATA: table ${t6.name} holds edition "${t6.edition}", which differs from the selected edition "${String(edition)}"` };
  }
  const hits = t6.groups.filter((g) => {
    const lo = g.ctiMin === undefined ? true : g.minInclusive === true ? ctiV >= g.ctiMin : ctiV > g.ctiMin;
    const hi = g.ctiMax === undefined ? true : g.maxInclusive === true ? ctiV <= g.ctiMax : ctiV < g.ctiMax;
    return lo && hi;
  });
  if (hits.length === 0) return { ok: false, reason: 'NO_CELL', message: `INSUFFICIENT DATA: no material group of table ${t6.name} contains CTI ${String(ctiV)} V` };
  if (hits.length > 1) {
    return { ok: false, reason: 'AMBIGUOUS_COLUMN', message: `INSUFFICIENT DATA: CTI ${String(ctiV)} V falls in more than one material group of table ${t6.name} (${hits.map((h) => h.group).join(', ')})` };
  }
  const h = hits[0] as MaterialGroupRecord;
  return { ok: true, group: h.group, record: h, state: dataStateOf(t6) };
}

/** The T7 rule record for a rule id (and coating type), or undefined. */
export function findRule(t7: SpacingTable, rule: RuleId, filter: { coatingType?: string } = {}): RuleRecord | undefined {
  return t7.rules.find((r) => r.rule === rule && (filter.coatingType === undefined || r.coatingType === filter.coatingType));
}

/** True if the rule record itself carries a named checker (used before any credit is applied). */
export function ruleIsChecked(r: RuleRecord): boolean {
  return nonEmpty(r.checkedBy) && nonEmpty(r.checkedDate);
}

/** Value of a rule record converted to SI (Hz, V or dimensionless). */
export function ruleValueSi(r: RuleRecord): number | undefined {
  if (r.value === undefined) return undefined;
  return r.value * (unitFactorSi(r.unit ?? '1') ?? 1);
}

// ---- shipped (empty) tables ----------------------------------------------------------------------------------------------


function loadShipped(): SpacingTableSet {
  const raws: Record<TableId, unknown> = { T1: t1Json, T2: t2Json, T3: t3Json, T4: t4Json, T5: t5Json, T6: t6Json, T7: t7Json, T8: t8Json };
  const out = {} as Record<TableId, SpacingTable>;
  for (const id of TABLE_IDS) {
    const r = parseSpacingTable(raws[id]);
    if (!r.ok) throw new Error(`shipped table ${id} is invalid: ${r.error.join('; ')}`);
    out[id] = r.value;
  }
  const set: SpacingTableSet = Object.freeze({ tables: Object.freeze(out) });
  SETS.add(set);
  return set;
}

/** The tables the app ships: all EMPTY (human-owned open item). */
export const SHIPPED_TABLES: SpacingTableSet = loadShipped();
