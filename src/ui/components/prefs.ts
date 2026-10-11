// Display-preference and choice helpers shared by calculator view-models. Pure: no DOM, no engineering math.
import { DEFAULT_FOIL_CONVENTION, foilSpreadPercent } from '../../core/data/constants';
import type { CopperBasisKind } from '../../core/result';
import { DEFAULT_DISPLAY_PREFS, FOIL_CONVENTIONS, type DisplayPrefs, type FoilConvention } from '../../core/units';

export type Units = 'metric' | 'imperial';
export type CopperLayer = 'outer' | 'inner';

export const CONVENTION_IDS = Object.keys(FOIL_CONVENTIONS) as FoilConvention[];
export const BASES: readonly CopperBasisKind[] = ['nominal', 'finished', 'measured'];
export const LAYERS: readonly CopperLayer[] = ['outer', 'inner'];

/** Headline preferences: geometry and thickness are always dual; this chooses the temperature unit only. */
export function headlinePrefs(units: Units): DisplayPrefs {
  return units === 'imperial' ? { ...DEFAULT_DISPLAY_PREFS, length: 'mil', area: 'mil2', temperature: 'F' } : { ...DEFAULT_DISPLAY_PREFS };
}

/** Echo units for what the user typed. Lengths echo in mm or mil; copper thickness in um or mil. */
export function echoPrefs(units: Units, kind: 'width' | 'thickness' | 'other' = 'other'): DisplayPrefs {
  const imperial = units === 'imperial';
  const length = imperial ? 'mil' : kind === 'thickness' ? 'um' : 'mm';
  return { ...DEFAULT_DISPLAY_PREFS, length, area: imperial ? 'mil2' : 'mm2', temperature: imperial ? 'F' : 'C' };
}

export function conventionSpreadText(): string {
  return `${foilSpreadPercent().toFixed(2)} %`;
}

export function conventionOptionLabel(id: FoilConvention | ''): string {
  if (id === '') return `Default: ${FOIL_CONVENTIONS[DEFAULT_FOIL_CONVENTION].label} (default assumption)`;
  return FOIL_CONVENTIONS[id].label;
}

export const BASIS_LABEL: Readonly<Record<CopperBasisKind, string>> = {
  nominal: 'Nominal (default)',
  finished: 'Finished (from your fabricator)',
  measured: 'Measured (for example a micro-section)',
};
