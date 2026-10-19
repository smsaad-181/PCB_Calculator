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
} from '../../spacing/gating';
import type { CoatingCredit, InsulationType, PollutionDegree } from '../../spacing/gating';
import { MATERIAL_GROUPS } from '../../spacing/tables';
import type { MaterialGroup, SpacingTableSet } from '../../spacing/tables';

export const SURFACES = ['printed-wiring', 'other'] as const;
export type Surface = (typeof SURFACES)[number];
export const GROOVE_STATES = ['none', 'present'] as const;
export type GrooveState = (typeof GROOVE_STATES)[number];

export interface ValidInputs {
  readonly tables: SpacingTableSet;
  readonly edition: string;
  readonly insulationType: InsulationType;
  readonly rms: Quantity;
  readonly peak?: Quantity;
  readonly voltageHow: 'direct' | 'waveform';
  readonly waveformShape?: string;
  readonly pollutionDegree: PollutionDegree;
  readonly materialGroup?: MaterialGroup;
  readonly cti?: Quantity;
  readonly surface: Surface;
  readonly frequency: Quantity;
  readonly associatedClearance: Quantity;
  readonly coating: CoatingCredit;
  readonly grooves: GrooveState;
  readonly soldermask: boolean;
  /** Echoed only; altitude never enters the creepage arithmetic. */
  readonly altitude?: Quantity;
}

/** Full input validation (invalid values first, then the missing mandatory inputs). No mandatory input has a default. Never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRaw(raw)) return { ok: false, error: { code: 'INVALID_INPUT', field: 'inputs', message: 'inputs must be an object.' } };
  const tables = readTables(raw);
  if (!tables.ok) return tables;
  const c = new Collector();
  const edition = c.take(readEdition(raw), 'edition');
  const insulationType = c.take(readEnum(raw, 'insulationType', INSULATION_TYPES), 'insulationType');
  const v = readWorkingVoltage(raw, c, { peak: 'workingVoltagePeak', rms: 'workingVoltageRms' });
  if (v.rms === undefined) c.missing.push('workingVoltageRms');
  const pollutionDegree = c.take(readPollution(raw), 'pollutionDegree');

  const group = c.opt(readEnum(raw, 'materialGroup', MATERIAL_GROUPS));
  const cti = c.opt(readQuantity(raw, 'cti', DIM.VOLTAGE, 'voltage (CTI in volts)', { window: WINDOWS.cti }));
  if (group !== undefined && cti !== undefined) {
    c.note({ code: 'INVALID_INPUT', field: 'cti', message: 'Give the material group or the CTI, not both.' });
  }
  if (group === undefined && cti === undefined) c.missing.push('materialGroup OR cti');

  const surface = c.take(readEnum(raw, 'surface', SURFACES), 'surface');
  const frequency = c.take(readQuantity(raw, 'frequency', DIM.FREQUENCY, 'frequency (Hz; 0 for DC)', { allowZero: true, window: WINDOWS.frequency }), 'frequency');
  const associatedClearance = c.take(readQuantity(raw, 'associatedClearance', DIM.LENGTH, 'length', { window: WINDOWS.length }), 'associatedClearance');
  const coating = c.opt(readEnum(raw, 'coatingCredit', COATING_CREDITS)) ?? 'none';
  const grooves = c.opt(readEnum(raw, 'grooves', GROOVE_STATES)) ?? 'none';
  const soldermask = c.opt(readFlag(raw, 'soldermask')) ?? false;
  const altitude = c.opt(readQuantity(raw, 'altitude', DIM.LENGTH, 'length (metres)', { allowZero: true, allowNegative: true, window: WINDOWS.altitude }));

  if (c.error !== undefined) return { ok: false, error: c.error };
  if (c.missing.length > 0) return { ok: false, error: insufficientInputs(c.missing) };
  return {
    ok: true,
    value: {
      tables: tables.value,
      edition: edition as string,
      insulationType: insulationType as InsulationType,
      rms: v.rms as Quantity,
      ...(v.peak !== undefined ? { peak: v.peak } : {}),
      voltageHow: v.how === 'waveform' ? 'waveform' : 'direct',
      ...(v.waveformShape !== undefined ? { waveformShape: v.waveformShape } : {}),
      pollutionDegree: pollutionDegree as PollutionDegree,
      ...(group !== undefined ? { materialGroup: group } : {}),
      ...(cti !== undefined ? { cti } : {}),
      surface: surface as Surface,
      frequency: frequency as Quantity,
      associatedClearance: associatedClearance as Quantity,
      coating,
      grooves,
      soldermask,
      ...(altitude !== undefined ? { altitude } : {}),
    },
  };
}
