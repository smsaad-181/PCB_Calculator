import { DIM } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';

export type Field = 'voltage' | 'current' | 'resistance' | 'power';
export const FIELDS: readonly Field[] = ['voltage', 'current', 'resistance', 'power'];
const SPEC: Record<Field, { dim: Quantity['dim']; name: string }> = {
  voltage: { dim: DIM.VOLTAGE, name: 'voltage (V)' },
  current: { dim: DIM.CURRENT, name: 'current (A)' },
  resistance: { dim: DIM.RESISTANCE, name: 'resistance (ohm)' },
  power: { dim: DIM.POWER, name: 'power (W)' },
};
export type ValidInputs = Partial<Record<Field, Quantity>>;

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const REL = 1e-9;

/** Solve all four from two known (si values); keys are the two given fields in FIELDS order. */
export function solveAll(g: Partial<Record<Field, number>>): Record<Field, number> | undefined {
  const { voltage: v, current: i, resistance: r, power: p } = g;
  if (v !== undefined && i !== undefined) return { voltage: v, current: i, resistance: v / i, power: v * i };
  if (v !== undefined && r !== undefined) return { voltage: v, current: v / r, resistance: r, power: (v * v) / r };
  if (v !== undefined && p !== undefined) return { voltage: v, current: p / v, resistance: (v * v) / p, power: p };
  if (i !== undefined && r !== undefined) return { voltage: i * r, current: i, resistance: r, power: i * i * r };
  if (i !== undefined && p !== undefined) return { voltage: p / i, current: i, resistance: p / (i * i), power: p };
  if (r !== undefined && p !== undefined) return { voltage: Math.sqrt(p * r), current: Math.sqrt(p / r), resistance: r, power: p };
  return undefined;
}

export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };
  const out: ValidInputs = {};
  for (const f of FIELDS) {
    if (raw[f] === undefined) continue;
    const g = guardQuantity(f, raw[f], SPEC[f].dim, SPEC[f].name);
    if (!g.ok) return g;
    out[f] = g.value;
  }
  const given = FIELDS.filter((f) => out[f] !== undefined);
  if (given.length !== 2) {
    const all = FIELDS.join(', ');
    if (given.length < 2) {
      return { ok: false, error: err('INVALID_INPUT', 'inputs', `Give exactly two of ${all}; ${String(given.length)} given.`) };
    }
    const si: Partial<Record<Field, number>> = {};
    for (const f of given) si[f] = (out[f] as Quantity).si;
    const first = given.slice(0, 2);
    const base: Partial<Record<Field, number>> = {};
    for (const f of first) base[f] = si[f] as number;
    const solved = solveAll(base);
    let consistent = true;
    if (solved) for (const f of given.slice(2)) if (Math.abs((si[f] as number) - solved[f]) > REL * Math.abs(solved[f])) consistent = false;
    return {
      ok: false,
      error: err(
        'INVALID_INPUT',
        'inputs',
        `Give exactly two of ${all}; ${String(given.length)} given, so the problem is over-specified${consistent ? '' : ' and the values are inconsistent'}.`,
      ),
    };
  }
  return { ok: true, value: out };
}
