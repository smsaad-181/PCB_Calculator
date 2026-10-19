import { DIM } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import {
  COATING_CREDITS,
  Collector,
  INSULATION_TYPES,
  WINDOWS,
  insufficientInputs,
  isRaw,
  readEdition,
  readEnum,
  readFlag,
  readPollution,
  readQuantity,
  readTables,
  readWorkingVoltage,
  waveformFrequencyError,
} from '../../spacing/gating';
import type { CoatingCredit, InsulationType, PollutionDegree } from '../../spacing/gating';
import type { SpacingTableSet } from '../../spacing/tables';

export const OVERVOLTAGE_CATEGORIES = ['I', 'II', 'III', 'IV'] as const;
export type OvervoltageCategory = (typeof OVERVOLTAGE_CATEGORIES)[number];
export const FIELD_CONDITIONS = ['inhomogeneous', 'homogeneous'] as const;
export type FieldCondition = (typeof FIELD_CONDITIONS)[number];

export type ImpulseRoute =
  | { readonly kind: 'impulse'; readonly impulse: Quantity }
  | { readonly kind: 'category'; readonly category: OvervoltageCategory; readonly supply: Quantity };

export interface ValidInputs {
  readonly tables: SpacingTableSet;
  readonly edition: string;
  readonly insulationType: InsulationType;
  readonly route: ImpulseRoute;
  readonly pollutionDegree: PollutionDegree;
  readonly fieldCondition: FieldCondition;
  readonly altitude: Quantity;
  readonly peak: Quantity;
  readonly rms?: Quantity;
  readonly voltageHow: 'direct' | 'waveform';
  readonly waveformShape?: string;
  readonly waveformBasis?: string;
  readonly frequency: Quantity;
  readonly coating: CoatingCredit;
  readonly soldermask: boolean;
}

const ROUTE_B_OR_A = 'ratedImpulseVoltage OR (overvoltageCategory + supplyVoltage)';

/**
 * Full input validation. Order: an invalid value is reported first (with its field), then the list of missing mandatory inputs.
 * No mandatory input has a default; null and blank text count as missing. Never throws.
 */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRaw(raw)) return { ok: false, error: { code: 'INVALID_INPUT', field: 'inputs', message: 'inputs must be an object.' } };
  const tables = readTables(raw);
  if (!tables.ok) return tables;
  const c = new Collector();
  const edition = c.take(readEdition(raw), 'edition');
  const insulationType = c.take(readEnum(raw, 'insulationType', INSULATION_TYPES), 'insulationType');

  const impulse = c.opt(readQuantity(raw, 'ratedImpulseVoltage', DIM.VOLTAGE, 'voltage', { window: WINDOWS.voltage }));
  const category = c.opt(readEnum(raw, 'overvoltageCategory', OVERVOLTAGE_CATEGORIES));
  const supply = c.opt(readQuantity(raw, 'supplyVoltage', DIM.VOLTAGE, 'voltage', { window: WINDOWS.voltage }));
  if (impulse !== undefined && (category !== undefined || supply !== undefined)) {
    c.note({ code: 'INVALID_INPUT', field: 'ratedImpulseVoltage', message: 'Give the impulse requirement by exactly one route: ratedImpulseVoltage, or overvoltageCategory with supplyVoltage, not both.' });
  }
  let route: ImpulseRoute | undefined;
  if (impulse !== undefined) route = { kind: 'impulse', impulse };
  else if (category !== undefined && supply !== undefined) route = { kind: 'category', category, supply };
  else if (category === undefined && supply === undefined) c.missing.push(ROUTE_B_OR_A);
  else {
    if (category === undefined) c.missing.push('overvoltageCategory');
    if (supply === undefined) c.missing.push('supplyVoltage');
  }

  const pollutionDegree = c.take(readPollution(raw), 'pollutionDegree');
  const fieldCondition = c.take(readEnum(raw, 'fieldCondition', FIELD_CONDITIONS), 'fieldCondition');
  const altitude = c.take(readQuantity(raw, 'altitude', DIM.LENGTH, 'length (metres)', { allowZero: true, allowNegative: true, window: WINDOWS.altitude }), 'altitude');
  const v = readWorkingVoltage(raw, c, { peak: 'workingVoltagePeak', rms: 'workingVoltageRms' });
  if (v.peak === undefined) c.missing.push('workingVoltagePeak');
  const frequency = c.take(readQuantity(raw, 'frequency', DIM.FREQUENCY, 'frequency (Hz; 0 for DC)', { allowZero: true, window: WINDOWS.frequency }), 'frequency');
  const shapeError = frequency === undefined ? undefined : waveformFrequencyError(v.waveformShape, frequency.si);
  if (shapeError !== undefined) c.note(shapeError);
  const coating = c.opt(readEnum(raw, 'coatingCredit', COATING_CREDITS)) ?? 'none';
  const soldermask = c.opt(readFlag(raw, 'soldermask')) ?? false;

  if (c.error !== undefined) return { ok: false, error: c.error };
  if (c.missing.length > 0) return { ok: false, error: insufficientInputs(c.missing) };
  return {
    ok: true,
    value: {
      tables: tables.value,
      edition: edition as string,
      insulationType: insulationType as InsulationType,
      route: route as ImpulseRoute,
      pollutionDegree: pollutionDegree as PollutionDegree,
      fieldCondition: fieldCondition as FieldCondition,
      altitude: altitude as Quantity,
      peak: v.peak as Quantity,
      ...(v.rms !== undefined ? { rms: v.rms } : {}),
      voltageHow: v.how === 'waveform' ? 'waveform' : 'direct',
      ...(v.waveformShape !== undefined ? { waveformShape: v.waveformShape } : {}),
      ...(v.waveformBasis !== undefined ? { waveformBasis: v.waveformBasis } : {}),
      frequency: frequency as Quantity,
      coating,
      soldermask,
    },
  };
}
