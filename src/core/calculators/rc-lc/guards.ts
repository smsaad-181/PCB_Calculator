import { DIM } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';
import { err, guardEnum, isRecord } from '../circuit-shared';
import type { Family } from './meta';

export type Field = 'resistance' | 'capacitance' | 'inductance' | 'frequency';
export const FAMILIES: readonly Family[] = ['rc', 'lc'];
export const FIELDS_OF: Record<Family, readonly Field[]> = { rc: ['resistance', 'capacitance', 'frequency'], lc: ['inductance', 'capacitance', 'frequency'] };
const ALL: readonly Field[] = ['resistance', 'capacitance', 'inductance', 'frequency'];
const SPEC: Record<Field, { dim: Quantity['dim']; name: string }> = {
  resistance: { dim: DIM.RESISTANCE, name: 'resistance (ohm)' },
  capacitance: { dim: DIM.CAPACITANCE, name: 'capacitance (F)' },
  inductance: { dim: DIM.INDUCTANCE, name: 'inductance (H)' },
  frequency: { dim: DIM.FREQUENCY, name: 'frequency (Hz)' },
};

export interface ValidInputs {
  readonly family: Family;
  readonly given: Partial<Record<Field, Quantity>>;
  /** The one field that was not given. */
  readonly unknown: Field;
}

const fcName = (family: Family): string => (family === 'rc' ? 'the cut-off frequency fc' : 'the resonant frequency f0');

export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };
  const fam = guardEnum('family', raw['family'], FAMILIES);
  if (!fam.ok) return fam;
  const family = fam.value;
  const allowed = FIELDS_OF[family];
  for (const f of ALL) {
    if (raw[f] !== undefined && !allowed.includes(f)) {
      return { ok: false, error: err('INVALID_INPUT', f, `${f} is not used by the ${family.toUpperCase()} family; give two of ${allowed.join(', ')} (frequency is ${fcName(family)}).`) };
    }
  }
  const given: Partial<Record<Field, Quantity>> = {};
  for (const f of allowed) {
    if (raw[f] === undefined) continue;
    const g = guardQuantity(f, raw[f], SPEC[f].dim, SPEC[f].name);
    if (!g.ok) return g;
    given[f] = g.value;
  }
  const names = allowed.filter((f) => given[f] !== undefined);
  if (names.length !== 2) {
    const list = allowed.join(', ');
    if (names.length < 2) return { ok: false, error: err('INVALID_INPUT', 'inputs', `Give exactly two of ${list} (frequency is ${fcName(family)}); ${String(names.length)} given.`) };
    const c = (given.capacitance as Quantity).si;
    const si = (k: Field): number => (given[k] as Quantity).si;
    const implied = family === 'rc' ? 1 / (2 * Math.PI * si('resistance') * c) : 1 / (2 * Math.PI * Math.sqrt(si('inductance') * c));
    const consistent = Math.abs(implied - si('frequency')) <= 1e-9 * Math.abs(implied);
    return { ok: false, error: err('INVALID_INPUT', 'inputs', `Give exactly two of ${list}; 3 given, so the problem is over-specified${consistent ? '' : ' and the values are inconsistent'}.`) };
  }
  const unknown = allowed.find((f) => given[f] === undefined) as Field;
  return { ok: true, value: { family, given, unknown } };
}
