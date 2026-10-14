import { DIM } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';
import { err, guardEnum, isRecord } from '../circuit-shared';
import type { Kind } from './meta';

export type Field = 'reactance' | 'frequency' | 'component';
export const KINDS: readonly Kind[] = ['inductive', 'capacitive'];
export const FIELDS: readonly Field[] = ['reactance', 'frequency', 'component'];
const COMPONENT_NAME: Record<Kind, 'inductance' | 'capacitance'> = { inductive: 'inductance', capacitive: 'capacitance' };
const OTHER_NAME: Record<Kind, 'inductance' | 'capacitance'> = { inductive: 'capacitance', capacitive: 'inductance' };

export interface ValidInputs {
  readonly kind: Kind;
  readonly given: Partial<Record<Field, Quantity>>;
  readonly unknown: Field;
}

/** Reactance magnitude from f and the component value (si numbers), used only to say whether an over-specified set is consistent. */
const impliedX = (kind: Kind, f: number, c: number): number => (kind === 'inductive' ? 2 * Math.PI * f * c : 1 / (2 * Math.PI * f * c));

export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };
  const k = guardEnum('kind', raw['kind'], KINDS);
  if (!k.ok) return { ok: false, error: err('INVALID_INPUT', 'kind', 'kind must be exactly "inductive" or "capacitive"; it is never defaulted.') };
  const kind = k.value;
  const comp = COMPONENT_NAME[kind];
  const other = OTHER_NAME[kind];
  if (raw[other] !== undefined) {
    return { ok: false, error: err('INVALID_INPUT', other, `${other} is not used for ${kind} reactance; give the ${comp}.`) };
  }
  const spec: Record<Field, { key: string; dim: Quantity['dim']; name: string }> = {
    reactance: { key: 'reactance', dim: DIM.RESISTANCE, name: 'reactance magnitude (ohm)' },
    frequency: { key: 'frequency', dim: DIM.FREQUENCY, name: 'frequency (Hz)' },
    component: { key: comp, dim: kind === 'inductive' ? DIM.INDUCTANCE : DIM.CAPACITANCE, name: kind === 'inductive' ? 'inductance (H)' : 'capacitance (F)' },
  };
  const given: Partial<Record<Field, Quantity>> = {};
  for (const f of FIELDS) {
    const s = spec[f];
    if (raw[s.key] === undefined) continue;
    const g = guardQuantity(s.key, raw[s.key], s.dim, s.name);
    if (!g.ok) return g;
    given[f] = g.value;
  }
  const names = FIELDS.filter((f) => given[f] !== undefined);
  const list = `reactance, frequency, ${comp}`;
  if (names.length < 2) return { ok: false, error: err('INVALID_INPUT', 'inputs', `Give exactly two of ${list}; ${String(names.length)} given.`) };
  if (names.length > 2) {
    const x = impliedX(kind, (given.frequency as Quantity).si, (given.component as Quantity).si);
    const target = (given.reactance as Quantity).si;
    const consistent = Math.abs(x - target) <= 1e-9 * Math.abs(x);
    return { ok: false, error: err('INVALID_INPUT', 'inputs', `Give exactly two of ${list}; 3 given, so the problem is over-specified${consistent ? '' : ' and the values are inconsistent'}.`) };
  }
  return { ok: true, value: { kind, given, unknown: FIELDS.find((f) => given[f] === undefined) as Field } };
}
