import { DIM } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';
import { err, guardEnum, isRecord } from '../circuit-shared';
import { meta } from './meta';

export type SeriesChoice = 'none' | 'E6' | 'E12' | 'E24' | 'E48' | 'E96' | 'E192';
export const SERIES_CHOICES: readonly SeriesChoice[] = ['none', 'E6', 'E12', 'E24', 'E48', 'E96', 'E192'];

export interface ValidInputs {
  readonly vs: Quantity;
  readonly vf: Quantity;
  readonly current: Quantity;
  readonly nLeds: number;
  readonly series: SeriesChoice;
  readonly resistorRating?: Quantity;
}

type QField = 'vs' | 'vf' | 'current' | 'resistorRating';
const SPEC: Record<QField, { dim: Quantity['dim']; name: string }> = {
  vs: { dim: DIM.VOLTAGE, name: 'voltage (V)' },
  vf: { dim: DIM.VOLTAGE, name: 'voltage (V)' },
  current: { dim: DIM.CURRENT, name: 'current (A)' },
  resistorRating: { dim: DIM.POWER, name: 'power (W)' },
};

export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };
  const out: Partial<Record<QField, Quantity>> = {};
  for (const f of ['vs', 'vf', 'current', 'resistorRating'] as const) {
    if (raw[f] === undefined) {
      if (f !== 'resistorRating') {
        const what = f === 'vs' ? 'the supply voltage' : f === 'vf' ? 'the LED forward voltage from its datasheet (the app assumes no typical value)' : 'the target LED current';
        return { ok: false, error: err('INVALID_INPUT', f, `${f} is required: enter ${what}.`) };
      }
      continue;
    }
    const g = guardQuantity(f, raw[f], SPEC[f].dim, SPEC[f].name);
    if (!g.ok) return g;
    out[f] = g.value;
  }
  const series = guardEnum('series', raw['series'], SERIES_CHOICES, 'none');
  if (!series.ok) return series;
  let nLeds = 1;
  if (raw['nLeds'] !== undefined) {
    const n = raw['nLeds'];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > meta.validity.nLeds) {
      return { ok: false, error: err('INVALID_INPUT', 'nLeds', `nLeds must be a whole number from 1 to ${String(meta.validity.nLeds)}.`) };
    }
    nLeds = n;
  }
  const vs = out.vs as Quantity;
  const vf = out.vf as Quantity;
  const vfTotal = vf.si * nLeds;
  if (!(vs.si > vfTotal)) {
    const what = nLeds === 1 ? `the LED forward voltage (Vf ${String(vf.si)} V)` : `the total forward voltage (${String(nLeds)} × Vf ${String(vf.si)} V = ${String(vfTotal)} V)`;
    return {
      ok: false,
      error: err('OUT_OF_DOMAIN', 'vs', `The supply voltage (${String(vs.si)} V) must be above ${what}: no resistor value can set a current when Vs <= N × Vf. Use a higher supply, fewer LEDs in series, or a lower-Vf LED.`),
    };
  }
  return {
    ok: true,
    value: {
      vs,
      vf,
      current: out.current as Quantity,
      nLeds,
      series: series.value,
      ...(out.resistorRating !== undefined ? { resistorRating: out.resistorRating } : {}),
    },
  };
}
