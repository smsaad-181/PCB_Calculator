import { DIM } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';
import { err, guardEnum, guardFraction, guardNote, isRecord } from '../circuit-shared';

export type SolveMode = 'vout' | 'r1' | 'r2' | 'pair';
export type SeriesChoice = 'none' | 'E12' | 'E24' | 'E48' | 'E96' | 'E192';
export type SnapMode = 'nearest' | 'up' | 'down';
export type BiasDirection = 'into-pin' | 'out-of-pin';

export const SERIES_CHOICES: readonly SeriesChoice[] = ['none', 'E12', 'E24', 'E48', 'E96', 'E192'];
export const SNAP_MODES: readonly SnapMode[] = ['nearest', 'up', 'down'];
export const BIAS_DIRECTIONS: readonly BiasDirection[] = ['into-pin', 'out-of-pin'];
export const MAX_PAIRS = 10;
export const DEFAULT_PAIRS = 5;

export interface ValidInputs {
  readonly mode: SolveMode;
  readonly vref: Quantity;
  readonly vrefSource?: string;
  readonly r1?: Quantity;
  readonly r2?: Quantity;
  readonly vout?: Quantity;
  readonly series: SeriesChoice;
  readonly snap: SnapMode;
  readonly pairs: number;
  readonly tolerance?: Quantity;
  readonly vrefTolerance?: Quantity;
  readonly fbBiasCurrent?: Quantity;
  readonly fbBiasDirection?: BiasDirection;
}

type QField = 'vref' | 'r1' | 'r2' | 'vout' | 'fbBiasCurrent';
const SPEC: Record<QField, { dim: Quantity['dim']; name: string }> = {
  vref: { dim: DIM.VOLTAGE, name: 'voltage (V)' },
  r1: { dim: DIM.RESISTANCE, name: 'resistance (ohm)' },
  r2: { dim: DIM.RESISTANCE, name: 'resistance (ohm)' },
  vout: { dim: DIM.VOLTAGE, name: 'voltage (V)' },
  fbBiasCurrent: { dim: DIM.CURRENT, name: 'current (A)' },
};

/** Vout from r1, r2 (si numbers); used only to say whether an over-specified set is consistent. */
const voutOf = (vref: number, r1: number, r2: number): number => vref * (1 + r1 / r2);

export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };
  const out: Partial<Record<QField, Quantity>> = {};
  for (const f of ['vref', 'r1', 'r2', 'vout', 'fbBiasCurrent'] as const) {
    if (raw[f] === undefined) continue;
    const g = guardQuantity(f, raw[f], SPEC[f].dim, SPEC[f].name);
    if (!g.ok) return g;
    out[f] = g.value;
  }
  if (out.vref === undefined) return { ok: false, error: err('INVALID_INPUT', 'vref', 'vref is required: enter the reference voltage from the regulator datasheet (the app embeds no IC parameters).') };
  const series = guardEnum('series', raw['series'], SERIES_CHOICES, 'none');
  if (!series.ok) return series;
  const snap = guardEnum('snap', raw['snap'], SNAP_MODES, 'nearest');
  if (!snap.ok) return snap;
  const note = guardNote('vrefSource', raw['vrefSource']);
  if (!note.ok) return note;
  const frs: Partial<Record<'tolerance' | 'vrefTolerance', Quantity>> = {};
  for (const f of ['tolerance', 'vrefTolerance'] as const) {
    if (raw[f] === undefined) continue;
    const g = guardFraction(f, raw[f]);
    if (!g.ok) return g;
    frs[f] = g.value;
  }
  let pairs = DEFAULT_PAIRS;
  if (raw['pairs'] !== undefined) {
    const p = raw['pairs'];
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 1 || p > MAX_PAIRS) {
      return { ok: false, error: err('INVALID_INPUT', 'pairs', `pairs must be a whole number from 1 to ${String(MAX_PAIRS)}.`) };
    }
    pairs = p;
  }

  // Bias current: the sign matters, so the direction is required with the current and never defaulted.
  const dirRaw = raw['fbBiasDirection'];
  if (out.fbBiasCurrent === undefined && dirRaw !== undefined) {
    return { ok: false, error: err('INVALID_INPUT', 'fbBiasDirection', 'fbBiasDirection needs fbBiasCurrent; give the bias current or remove the direction.') };
  }
  let direction: BiasDirection | undefined;
  if (out.fbBiasCurrent !== undefined) {
    const d = guardEnum('fbBiasDirection', dirRaw, BIAS_DIRECTIONS);
    if (!d.ok) {
      return { ok: false, error: err('INVALID_INPUT', 'fbBiasDirection', 'fbBiasDirection must be exactly "into-pin" or "out-of-pin" when a bias current is given; the sign of the shift depends on it and it is never defaulted.') };
    }
    direction = d.value;
  }

  const given = (['r1', 'r2', 'vout'] as const).filter((f) => out[f] !== undefined);
  let mode: SolveMode;
  if (given.length === 3) {
    const v = voutOf(out.vref.si, (out.r1 as Quantity).si, (out.r2 as Quantity).si);
    const target = (out.vout as Quantity).si;
    const consistent = Math.abs(v - target) <= 1e-9 * Math.abs(target);
    return {
      ok: false,
      error: err('INVALID_INPUT', 'inputs', `Give exactly two of r1, r2, vout; 3 given, so the problem is over-specified${consistent ? '' : ' and the values are inconsistent'}.`),
    };
  } else if (given.length === 2) {
    mode = out.vout === undefined ? 'vout' : out.r1 === undefined ? 'r1' : 'r2';
  } else if (given.length === 1 && out.vout !== undefined) {
    if (series.value === 'none') {
      return { ok: false, error: err('INVALID_INPUT', 'series', 'With only vout given, choose a series (E12, E24, E48, E96 or E192) to search for the best R1 and R2 pair; otherwise give one resistor.') };
    }
    mode = 'pair';
  } else {
    return { ok: false, error: err('INVALID_INPUT', 'inputs', `Give exactly two of r1, r2, vout (or vout alone with a series for a best-pair search); ${String(given.length)} given.`) };
  }
  if (mode === 'vout' && series.value !== 'none') {
    return { ok: false, error: err('INVALID_INPUT', 'series', 'series snapping applies to a solved resistor; give vout and one resistor, or vout alone for a pair search.') };
  }
  return {
    ok: true,
    value: {
      mode,
      vref: out.vref,
      ...(note.value !== undefined ? { vrefSource: note.value } : {}),
      ...(out.r1 !== undefined ? { r1: out.r1 } : {}),
      ...(out.r2 !== undefined ? { r2: out.r2 } : {}),
      ...(out.vout !== undefined ? { vout: out.vout } : {}),
      series: series.value,
      snap: snap.value,
      pairs,
      ...(frs.tolerance !== undefined ? { tolerance: frs.tolerance } : {}),
      ...(frs.vrefTolerance !== undefined ? { vrefTolerance: frs.vrefTolerance } : {}),
      ...(out.fbBiasCurrent !== undefined && direction !== undefined ? { fbBiasCurrent: out.fbBiasCurrent, fbBiasDirection: direction } : {}),
    },
  };
}
