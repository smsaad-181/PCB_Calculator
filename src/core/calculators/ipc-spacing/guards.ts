import { DIM } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { Collector, WINDOWS, insufficientInputs, isRaw, readEdition, readEnum, readQuantity, readTables, readWorkingVoltage } from '../../spacing/gating';
import type { SpacingTableSet } from '../../spacing/tables';

export const LOCATIONS = ['internal', 'external'] as const;
export type Location = (typeof LOCATIONS)[number];
export const CONDUCTOR_KINDS = ['bare-board', 'component-lead'] as const;
export type ConductorKind = (typeof CONDUCTOR_KINDS)[number];
export const COATINGS = ['uncoated', 'permanent-polymer-or-solder-mask', 'conformal-coating'] as const;
export type Coating = (typeof COATINGS)[number];

export type Elevation = { readonly kind: 'vacuum' } | { readonly kind: 'height'; readonly height: Quantity };

export interface ValidInputs {
  readonly tables: SpacingTableSet;
  readonly edition: string;
  readonly peak: Quantity;
  readonly voltageHow: 'direct' | 'waveform';
  readonly waveformShape?: string;
  readonly location: Location;
  readonly conductorKind?: ConductorKind;
  readonly coating?: Coating;
  readonly elevation?: Elevation;
}

function readElevation(raw: Readonly<Record<string, unknown>>, c: Collector): Elevation | undefined {
  const v = raw['elevation'];
  if (v === 'vacuum') return { kind: 'vacuum' };
  if (typeof v === 'string' && v.trim() !== '') {
    c.note({ code: 'INVALID_INPUT', field: 'elevation', message: 'elevation must be a length (metres above sea level) or the text "vacuum".' });
    return undefined;
  }
  const h = c.opt(readQuantity(raw, 'elevation', DIM.LENGTH, 'length (metres) or "vacuum"', { allowZero: true, allowNegative: true, window: WINDOWS.altitude }));
  return h === undefined ? undefined : { kind: 'height', height: h };
}

/**
 * Full input validation. Order: invalid values first, then the missing mandatory inputs. External conductors also need the
 * conductor kind and the coating; elevation is needed unless the coating is given and is not "uncoated". No defaults. Never throws.
 */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRaw(raw)) return { ok: false, error: { code: 'INVALID_INPUT', field: 'inputs', message: 'inputs must be an object.' } };
  const tables = readTables(raw);
  if (!tables.ok) return tables;
  const c = new Collector();
  const edition = c.take(readEdition(raw), 'edition');
  const v = readWorkingVoltage(raw, c, { peak: 'voltagePeak', rms: 'voltageRms' });
  if (v.peak === undefined) c.missing.push('voltagePeak');
  const location = c.take(readEnum(raw, 'location', LOCATIONS), 'location');

  // The optional-looking inputs are validated whenever given, so a garbage value is never silently ignored.
  const kind = c.opt(readEnum(raw, 'conductorKind', CONDUCTOR_KINDS));
  const coating = c.opt(readEnum(raw, 'coating', COATINGS));
  const elevation = readElevation(raw, c);
  if (location === 'external') {
    if (kind === undefined) c.missing.push('conductorKind');
    if (coating === undefined) c.missing.push('coating');
    if ((coating === undefined || coating === 'uncoated') && elevation === undefined) c.missing.push('elevation');
  }

  if (c.error !== undefined) return { ok: false, error: c.error };
  if (c.missing.length > 0) return { ok: false, error: insufficientInputs(c.missing) };
  const external = location === 'external';
  return {
    ok: true,
    value: {
      tables: tables.value,
      edition: edition as string,
      peak: v.peak as Quantity,
      voltageHow: v.how === 'waveform' ? 'waveform' : 'direct',
      ...(v.waveformShape !== undefined ? { waveformShape: v.waveformShape } : {}),
      location: location as Location,
      ...(external && kind !== undefined ? { conductorKind: kind } : {}),
      ...(external && coating !== undefined ? { coating } : {}),
      ...(external && elevation !== undefined && (coating === undefined || coating === 'uncoated') ? { elevation } : {}),
    },
  };
}
