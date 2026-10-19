import { rateConfidence } from '../confidence';
import type { Confidence, DataStatus } from '../confidence';
import { DIM, q, sameDim } from '../units';
import type { Dim, Quantity } from '../units';
import type { CalcError, CalcInput, CalcWarning, Result } from '../result';
import { SHIPPED_TABLES, UNIT_SLIP_WINDOWS, dataStateOf, emptyTableMessage, findRule, isTableEmpty, isTableSet, ruleIsChecked, ruleValueSi } from './tables';
import type { LookupOutcome, SpacingTable, SpacingTableSet } from './tables';
import { WAVEFORM_SHAPES, resolveVoltage } from './waveform';
import type { ResolvedVoltage, VoltageBasis, VoltageSpec } from './waveform';

/*
 * Shared gating for the three spacing calculators (clearance, creepage, IPC spacing). Pure; no table value lives here.
 * Policy (docs/research/spacing-structure-and-gating.md, skill iec60664-gating):
 *  - a missing mandatory input gives "Insufficient inputs: <list>" and no number;
 *  - an empty table, a table of another edition or a missing cell gives "INSUFFICIENT DATA: ..." and no number;
 *  - data that is entered but not verified gives a red UNVERIFIED banner and the prefix "indicative only";
 *  - this module never writes compliance wording; only src/core/gate.ts may.
 */

export const PRODUCT_STANDARD_BANNER =
  'IEC 60664-1 is an insulation-coordination framework; product-specific safety standards may impose additional requirements.';
export const UNVERIFIED_BANNER =
  'UNVERIFIED: the table data behind this result was entered by a user and has not been verified by a named person. This result is indicative only.';
export const PAYWALLED_NOTE =
  'The table values come from a licensed standard that this application does not hold or verify (ledger status PAYWALLED-USER-MUST-VERIFY); they are exactly what the user entered.';
export const SOLDERMASK_NOTE =
  'Solder mask is not conformal coating (IEC 60664-3 coating, S-030g): no coating credit is ever given for solder mask.';
export const HF_NOT_CHECKED_TEXT =
  'high-frequency applicability (IEC 60664-4) not checked: no frequency limit is recorded in table T7. Above the frequency limit of IEC 60664-1 the IEC 60664-4 values apply instead (S-031, S-031a).';
export const CATEGORY_CONFLICT_NOTE =
  'The meaning of overvoltage categories II and III differs between public sources (S-030c, CONFLICT); the product standard decides which category applies.';
export const INDICATIVE_PREFIX = 'indicative only';

export const INSULATION_TYPES = ['functional', 'basic', 'supplementary', 'reinforced'] as const;
export type InsulationType = (typeof INSULATION_TYPES)[number];
export const COATING_CREDITS = ['none', 'type1', 'type2'] as const;
export type CoatingCredit = (typeof COATING_CREDITS)[number];
export type PollutionDegree = 1 | 2 | 3 | 4;

export type Raw = Readonly<Record<string, unknown>>;
export function isRaw(x: unknown): x is Raw {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// ---- field readers -------------------------------------------------------------------------------------------------------

export type Field<T> = { readonly kind: 'missing' } | { readonly kind: 'ok'; readonly value: T } | { readonly kind: 'error'; readonly error: CalcError };
const missing = { kind: 'missing' } as const;
const bad = (code: CalcError['code'], field: string, message: string): Field<never> => ({ kind: 'error', error: { code, field, message } });

const isBlank = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function hasDim(qty: Quantity, dim: Dim): boolean {
  try {
    return sameDim(qty, { si: 1, dim } as Quantity);
  } catch {
    return false;
  }
}

export interface QuantityOpts {
  readonly allowZero?: boolean;
  readonly allowNegative?: boolean;
  /** Unit-slip window in SI (a plausibility check for the wrong unit, never a standard limit). */
  readonly window?: readonly [number, number];
}
export function readQuantity(raw: Raw, name: string, dim: Dim, dimName: string, o: QuantityOpts = {}): Field<Quantity> {
  const v = raw[name];
  if (isBlank(v)) return missing;
  if (typeof v !== 'object' || v === null || typeof (v as Quantity).si !== 'number' || typeof (v as Quantity).dim !== 'object' || (v as Quantity).dim === null) {
    return bad('INVALID_INPUT', name, `${name} must be a quantity with a numeric value and a dimension.`);
  }
  const qty = v as Quantity;
  if (!hasDim(qty, dim)) return bad('DIMENSION', name, `${name} must be a ${dimName}.`);
  const n = qty.si;
  if (Number.isNaN(n)) return bad('INVALID_INPUT', name, `${name} is NaN (not a number); it must be a finite number.`);
  if (!Number.isFinite(n)) return bad('INVALID_INPUT', name, `${name} is infinite; it must be a finite number.`);
  if (n < 0 && o.allowNegative !== true) return bad('INVALID_INPUT', name, `${name} is negative; it must be ${o.allowZero === true ? 'zero or greater' : 'greater than zero'}.`);
  if (n === 0 && o.allowZero !== true) return bad('INVALID_INPUT', name, `${name} is zero; it must be a finite number greater than zero.`);
  if (o.window !== undefined && (n < o.window[0] || n > o.window[1])) {
    return bad('OUT_OF_DOMAIN', name, `${name} (${String(n)} in SI units) is outside the plausible range ${String(o.window[0])} to ${String(o.window[1])}; check the unit. This is a unit-slip check, not a standard limit.`);
  }
  return { kind: 'ok', value: qty };
}

export function readEnum<T extends string>(raw: Raw, name: string, allowed: readonly T[]): Field<T> {
  const v = raw[name];
  if (isBlank(v)) return missing;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) return bad('INVALID_INPUT', name, `${name} must be one of ${allowed.join(', ')}.`);
  return { kind: 'ok', value: v as T };
}

export function readPollution(raw: Raw, name = 'pollutionDegree'): Field<PollutionDegree> {
  const v = raw[name];
  if (isBlank(v)) return missing;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 4) return bad('INVALID_INPUT', name, `${name} must be the whole number 1, 2, 3 or 4.`);
  return { kind: 'ok', value: v as PollutionDegree };
}

export function readEdition(raw: Raw): Field<string> {
  const v = raw['edition'];
  if (isBlank(v)) return missing;
  if (typeof v !== 'string') return bad('INVALID_INPUT', 'edition', 'edition must be text naming the standard edition of the data set.');
  if (v.length > 200) return bad('INVALID_INPUT', 'edition', 'edition is too long.');
  return { kind: 'ok', value: v.trim() };
}

export function readFlag(raw: Raw, name: string): Field<boolean> {
  const v = raw[name];
  if (v === undefined || v === null) return { kind: 'ok', value: false };
  if (typeof v !== 'boolean') return bad('INVALID_INPUT', name, `${name} must be true or false.`);
  return { kind: 'ok', value: v };
}

export function readTables(raw: Raw): Result<SpacingTableSet, CalcError> {
  const t = raw['tables'];
  if (t === undefined) return { ok: true, value: SHIPPED_TABLES };
  if (!isTableSet(t)) {
    return { ok: false, error: { code: 'INVALID_INPUT', field: 'tables', message: 'tables must be a table set produced by the validator (importSpacingTables or makeTableSet).' } };
  }
  return { ok: true, value: t };
}

/** Collects fields: remembers the first invalid value and the names of the missing mandatory inputs. */
export class Collector {
  readonly missing: string[] = [];
  error: CalcError | undefined;
  take<T>(f: Field<T>, listedAs: string): T | undefined {
    if (f.kind === 'ok') return f.value;
    if (f.kind === 'missing') this.missing.push(listedAs);
    else if (this.error === undefined) this.error = f.error;
    return undefined;
  }
  /** Optional field: missing is fine, invalid is remembered. */
  opt<T>(f: Field<T>): T | undefined {
    if (f.kind === 'ok') return f.value;
    if (f.kind === 'error' && this.error === undefined) this.error = f.error;
    return undefined;
  }
  note(e: CalcError): void {
    if (this.error === undefined) this.error = e;
  }
}

export function insufficientInputs(list: readonly string[]): CalcError {
  return { code: 'INVALID_INPUT', gate: 'INSUFFICIENT_INPUTS', missing: [...list], message: `Insufficient inputs: ${list.join(', ')}` };
}

export function insufficientData(messages: readonly string[]): CalcError {
  return { code: 'OUT_OF_DOMAIN', gate: 'INSUFFICIENT_DATA', message: messages.join('; ') };
}

/** Maps a failed table lookup to an error value. A value above the table is out of scope; everything else is insufficient data. */
export function lookupError(l: Extract<LookupOutcome, { ok: false }>): CalcError {
  if (l.reason === 'ABOVE_TABLE') return { code: 'OUT_OF_DOMAIN', gate: 'OUT_OF_SCOPE', message: l.message };
  if (l.reason === 'BAD_REQUEST') return { code: 'INVALID_INPUT', message: l.message };
  return { code: 'OUT_OF_DOMAIN', gate: 'INSUFFICIENT_DATA', message: l.message };
}

/** All empty tables among those required, as one INSUFFICIENT DATA error naming each; undefined if none is empty. */
export function emptyTablesError(required: readonly SpacingTable[]): CalcError | undefined {
  const empties = required.filter(isTableEmpty);
  return empties.length === 0 ? undefined : insufficientData(empties.map(emptyTableMessage));
}

/** T7 is optional where a rule is not needed, but a non-empty T7 of another edition is never consulted silently. */
export function rulesEditionError(t7: SpacingTable, edition: string): CalcError | undefined {
  if (isTableEmpty(t7)) return undefined;
  if (t7.edition.trim() !== edition.trim()) {
    return insufficientData([`INSUFFICIENT DATA: table ${t7.name} holds edition "${t7.edition}", which differs from the selected edition "${edition}"`]);
  }
  return undefined;
}

export function ruleMissingError(t7: SpacingTable, rule: string): CalcError {
  return insufficientData([`INSUFFICIENT DATA: rule "${rule}" is not entered in table ${t7.name} (enter it from your licensed copy)`]);
}

// ---- scope, coating --------------------------------------------------------------------------------------------------------

export interface ValidityCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}
export interface ScopeOutcome {
  readonly refusal?: CalcError;
  readonly warnings: CalcWarning[];
  readonly checks: ValidityCheck[];
  /** Names of scope checks that could not be done (they lower confidence as safety-relevant assumptions). */
  readonly unchecked: string[];
}

/**
 * Frequency and voltage scope from the T7 records (the limits are user-entered, never code). Frequency above the recorded limit:
 * no number, IEC 60664-4 named. No recorded limit: generic "not checked" warning when a frequency above zero is given.
 */
export function checkScope(t7: SpacingTable, a: { frequencyHz: number; rmsV?: number | undefined; peakV?: number | undefined }): ScopeOutcome {
  const warnings: CalcWarning[] = [];
  const checks: ValidityCheck[] = [];
  const unchecked: string[] = [];
  const dc = a.frequencyHz === 0;

  const fRule = findRule(t7, 'scope-max-frequency');
  if (fRule !== undefined) {
    const limit = ruleValueSi(fRule) as number;
    if (a.frequencyHz > limit) {
      return {
        refusal: {
          code: 'OUT_OF_DOMAIN',
          gate: 'OUT_OF_SCOPE',
          field: 'frequency',
          message: `The frequency ${String(a.frequencyHz)} Hz is above the limit ${String(limit)} Hz recorded in table T7 (${fRule.source}). No IEC 60664-1 number is given: IEC 60664-4 (high-frequency insulation coordination) applies above that limit (S-031).`,
        },
        warnings,
        checks,
        unchecked,
      };
    }
    checks.push({ name: 'frequency within the limit recorded in T7', ok: true, detail: `${String(a.frequencyHz)} Hz is at or below ${String(limit)} Hz (user-entered record, ${fRule.source}).` });
  } else if (a.frequencyHz > 0) {
    warnings.push({ severity: 'warning', message: HF_NOT_CHECKED_TEXT, code: 'HF_NOT_CHECKED' });
    unchecked.push('high-frequency applicability (IEC 60664-4) not checked');
  }

  const vRule = findRule(t7, dc ? 'scope-max-voltage-dc' : 'scope-max-voltage-ac-rms');
  const vValue = dc ? (a.peakV ?? a.rmsV) : a.rmsV;
  if (vRule !== undefined && vValue !== undefined) {
    const limit = ruleValueSi(vRule) as number;
    if (vValue > limit) {
      return {
        refusal: {
          code: 'OUT_OF_DOMAIN',
          gate: 'OUT_OF_SCOPE',
          field: 'workingVoltage',
          message: `The ${dc ? 'DC' : 'rms'} working voltage ${String(vValue)} V is above the limit ${String(limit)} V recorded in table T7 (${vRule.source}); the table values are outside their recorded scope.`,
        },
        warnings,
        checks,
        unchecked,
      };
    }
    checks.push({ name: `${dc ? 'DC' : 'rms'} working voltage within the limit recorded in T7`, ok: true, detail: `${String(vValue)} V is at or below ${String(limit)} V (user-entered record).` });
  } else {
    const why = vRule === undefined ? 'no voltage limit is recorded in table T7' : 'the rms voltage is unknown (give an rms value or a declared waveform)';
    unchecked.push('voltage scope not checked');
    warnings.push({ severity: 'caution', message: `Voltage scope not checked: ${why}.`, code: 'SCOPE_NOT_CHECKED' });
  }
  return { warnings, checks, unchecked };
}

export interface CoatingDecision {
  readonly factor: number;
  readonly applied: boolean;
  readonly warnings: CalcWarning[];
  readonly note?: string;
}
/** Coating credit (IEC 60664-3) only when the user selects it AND T7 is VERIFIED and holds the rule record for that type. */
export function coatingDecision(t7: SpacingTable, wanted: CoatingCredit): CoatingDecision {
  if (wanted === 'none') return { factor: 1, applied: false, warnings: [] };
  const rule = findRule(t7, 'coating-credit', { coatingType: wanted });
  const notApplied = (why: string): CoatingDecision => ({
    factor: 1,
    applied: false,
    warnings: [{ severity: 'warning', message: `Coating credit ${wanted} was selected but is NOT applied: ${why}. The distance shown has no coating credit.`, code: 'COATING_CREDIT_NOT_APPLIED' }],
  });
  if (rule === undefined) return notApplied(`no "${wanted}" coating-credit record is entered in table T7`);
  if (dataStateOf(t7) !== 'VERIFIED' || !ruleIsChecked(rule)) return notApplied('the T7 rule record is not verified by a named person');
  const factor = ruleValueSi(rule) as number;
  return { factor, applied: true, warnings: [], note: `Coating credit ${wanted}: distance multiplied by ${String(factor)} (verified T7 record, ${rule.source}).` };
}

// ---- result pieces ------------------------------------------------------------------------------------------------------------

export function anyUnverified(tables: readonly SpacingTable[]): boolean {
  return tables.some((t) => dataStateOf(t) !== 'VERIFIED');
}

export function commonWarnings(opts: { unverified: boolean; iec: boolean }): CalcWarning[] {
  const w: CalcWarning[] = [];
  if (opts.unverified) w.push({ severity: 'critical', message: UNVERIFIED_BANNER, code: 'UNVERIFIED_TABLE_DATA' });
  w.push({ severity: 'warning', message: PRODUCT_STANDARD_BANNER, code: 'PRODUCT_STANDARD' });
  w.push({ severity: 'caution', message: PAYWALLED_NOTE, code: 'PAYWALLED_TABLE_DATA' });
  if (opts.iec) w.push({ severity: 'caution', message: SOLDERMASK_NOTE, code: 'SOLDERMASK_NOT_COATING' });
  return w;
}

/** Rule-based confidence for table lookups: unverified entries rate as an estimate, signed entries as analytical; paywalled data keeps it below high. */
export function spacingConfidence(a: { verified: boolean; safetyRelevantDefaults: readonly string[]; dataStatus: DataStatus }): Confidence {
  return rateConfidence({
    outOfRangeInputs: [],
    defaultedAssumptions: [],
    safetyRelevantDefaults: a.safetyRelevantDefaults,
    accuracyClass: a.verified ? 'analytical' : 'estimate',
    dataStatus: a.dataStatus,
  });
}

/** One traceability line per looked-up value: which table, row, column, printed text, source and who entered/checked it. */
export function provenanceLine(table: SpacingTable, l: Extract<LookupOutcome, { ok: true }>): string {
  const c = l.cells[0];
  const who = c === undefined ? '' : `; entered by ${c.enteredBy} on ${c.enteredDate}; ${c.checkedBy !== undefined ? `checked by ${c.checkedBy}` : 'not checked'}`;
  const printed = c === undefined ? '' : `, printed "${c.printed}", source ${c.source}`;
  return `${table.table} (${table.name.replace(/^T\d /, '')}), edition ${table.edition}: ${l.method} row "${l.rowKey}", column "${l.column}"${printed}${who}.`;
}

export const dimless = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);

export function userInput(name: string, value: Quantity, detail?: string): CalcInput {
  return { name, value, source: 'user', ...(detail !== undefined ? { sourceDetail: detail } : {}) };
}

export const WINDOWS = {
  voltage: UNIT_SLIP_WINDOWS.voltageSi,
  length: UNIT_SLIP_WINDOWS.lengthSi,
  /** Altitude plausibility (unit slip only): the Dead Sea shore to well above the stratosphere. Not a standard limit. */
  altitude: [-500, 100_000] as const,
  /** Frequency: zero is DC. Upper bound only catches a unit slip. */
  frequency: [0, 1e12] as const,
  cti: [Number.MIN_VALUE, UNIT_SLIP_WINDOWS.ctiV[1]] as const,
};

// ---- working voltage (direct value or a declared waveform) -------------------------------------------------------------------

function readWaveform(raw: Raw): Field<NonNullable<VoltageSpec['waveform']>> {
  const w = raw['waveform'];
  if (w === undefined || w === null) return missing;
  if (!isRaw(w)) return bad('INVALID_INPUT', 'waveform', 'waveform must be an object { shape, basis, value }.');
  const shape = readEnum(w, 'shape', WAVEFORM_SHAPES);
  if (shape.kind === 'error') return bad(shape.error.code, 'waveform.shape', shape.error.message.replace(/^shape/, 'waveform.shape'));
  const basis = readEnum<VoltageBasis>(w, 'basis', ['peak', 'rms']);
  if (basis.kind === 'error') return bad(basis.error.code, 'waveform.basis', basis.error.message.replace(/^basis/, 'waveform.basis'));
  const value = readQuantity(w, 'value', DIM.VOLTAGE, 'voltage', { window: UNIT_SLIP_WINDOWS.voltageSi });
  if (value.kind === 'error') return bad(value.error.code, 'waveform.value', value.error.message.replace(/^value/, 'waveform.value'));
  if (shape.kind === 'missing' || basis.kind === 'missing' || value.kind === 'missing') {
    return bad('INVALID_INPUT', 'waveform', 'waveform needs shape, basis and value.');
  }
  return { kind: 'ok', value: { shape: shape.value, basis: basis.value, value: value.value } };
}

/** Peak and rms working voltage from direct entries or a declared waveform. Invalid values are recorded on the collector. */
export function readWorkingVoltage(raw: Raw, c: Collector, names: { peak: string; rms: string }): ResolvedVoltage {
  const peak = c.opt(readQuantity(raw, names.peak, DIM.VOLTAGE, 'voltage', { window: UNIT_SLIP_WINDOWS.voltageSi }));
  const rms = c.opt(readQuantity(raw, names.rms, DIM.VOLTAGE, 'voltage', { window: UNIT_SLIP_WINDOWS.voltageSi }));
  const waveform = c.opt(readWaveform(raw));
  const r = resolveVoltage({ peak, rms, waveform });
  if (!r.ok) {
    c.note(r.error);
    return { how: 'none' };
  }
  return r.value;
}
