import { DIM, sameDim } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';

export type SolveFor = 'vout' | 'r1' | 'r2';
export type SeriesChoice = 'E24' | 'E96' | 'E192' | 'none';
export type SnapMode = 'nearest' | 'up' | 'down';

export interface ValidInputs {
  readonly solveFor: SolveFor;
  readonly vin: Quantity;
  readonly r1?: Quantity;
  readonly r2?: Quantity;
  readonly target?: Quantity;
  readonly load?: Quantity;
  readonly series: SeriesChoice;
  readonly snap: SnapMode;
  readonly tolerance?: Quantity;
  readonly vinTolerance?: Quantity;
}

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const SOLVE: readonly string[] = ['vout', 'r1', 'r2'];
const SERIES: readonly string[] = ['E24', 'E96', 'E192', 'none'];
const SNAPS: readonly string[] = ['nearest', 'up', 'down'];

type QField = 'vin' | 'r1' | 'r2' | 'target' | 'load';
const SPEC: Record<QField, { dim: Quantity['dim']; name: string }> = {
  vin: { dim: DIM.VOLTAGE, name: 'voltage (V)' },
  r1: { dim: DIM.RESISTANCE, name: 'resistance (ohm)' },
  r2: { dim: DIM.RESISTANCE, name: 'resistance (ohm)' },
  target: { dim: DIM.VOLTAGE, name: 'voltage (V)' },
  load: { dim: DIM.RESISTANCE, name: 'resistance (ohm)' },
};

function guardFraction(field: string, v: unknown): Result<Quantity, CalcError> {
  if (!isRecord(v) || typeof v['si'] !== 'number' || !isRecord(v['dim'])) {
    return { ok: false, error: err('INVALID_INPUT', field, `${field} must be a quantity with a numeric value and a dimension.`) };
  }
  const qty = v as unknown as Quantity;
  const same = ((): boolean => {
    try {
      return sameDim(qty, { si: 1, dim: DIM.DIMENSIONLESS } as Quantity);
    } catch {
      return false;
    }
  })();
  if (!same) return { ok: false, error: err('DIMENSION', field, `${field} must be a dimensionless fraction (0.01 is 1 %).`) };
  const n = qty.si;
  if (!Number.isFinite(n) || n < 0 || n >= 0.5) {
    return { ok: false, error: err('INVALID_INPUT', field, `${field} must be a finite fraction from 0 up to, but not including, 0.5 (0.01 is 1 %).`) };
  }
  return { ok: true, value: qty };
}

export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };
  const solveFor = raw['solveFor'];
  if (typeof solveFor !== 'string' || !SOLVE.includes(solveFor)) {
    return { ok: false, error: err('INVALID_INPUT', 'solveFor', 'solveFor must be exactly "vout", "r1" or "r2".') };
  }
  const seriesRaw = raw['series'];
  if (seriesRaw !== undefined && (typeof seriesRaw !== 'string' || !SERIES.includes(seriesRaw))) {
    return { ok: false, error: err('INVALID_INPUT', 'series', 'series must be "E24", "E96", "E192" or "none".') };
  }
  const snapRaw = raw['snap'];
  if (snapRaw !== undefined && (typeof snapRaw !== 'string' || !SNAPS.includes(snapRaw))) {
    return { ok: false, error: err('INVALID_INPUT', 'snap', 'snap must be "nearest", "up" or "down".') };
  }
  const out: Partial<Record<QField, Quantity>> = {};
  for (const f of ['vin', 'r1', 'r2', 'target', 'load'] as const) {
    if (raw[f] === undefined) continue;
    const g = guardQuantity(f, raw[f], SPEC[f].dim, SPEC[f].name);
    if (!g.ok) return g;
    out[f] = g.value;
  }
  const frs: Partial<Record<'tolerance' | 'vinTolerance', Quantity>> = {};
  for (const f of ['tolerance', 'vinTolerance'] as const) {
    if (raw[f] === undefined) continue;
    const g = guardFraction(f, raw[f]);
    if (!g.ok) return g;
    frs[f] = g.value;
  }
  const need: Record<SolveFor, QField[]> = { vout: ['vin', 'r1', 'r2'], r1: ['vin', 'target', 'r2'], r2: ['vin', 'target', 'r1'] };
  const mode = solveFor as SolveFor;
  for (const f of need[mode]) {
    if (out[f] === undefined) return { ok: false, error: err('INVALID_INPUT', f, `${f} is required when solving for ${mode}.`) };
  }
  for (const f of ['r1', 'r2', 'target'] as const) {
    if (!need[mode].includes(f) && out[f] !== undefined) {
      const why = f === mode ? `${f} is the unknown when solving for ${mode}; do not give it.` : `${f} is not used when solving for ${mode}.`;
      return { ok: false, error: err('INVALID_INPUT', f, why) };
    }
  }
  const series = (seriesRaw as SeriesChoice | undefined) ?? 'none';
  if (mode === 'vout' && series !== 'none') {
    return { ok: false, error: err('INVALID_INPUT', 'series', 'series snapping applies to a solved resistor; use solveFor r1 or r2.') };
  }
  return {
    ok: true,
    value: {
      solveFor: mode,
      vin: out.vin as Quantity,
      ...(out.r1 !== undefined ? { r1: out.r1 } : {}),
      ...(out.r2 !== undefined ? { r2: out.r2 } : {}),
      ...(out.target !== undefined ? { target: out.target } : {}),
      ...(out.load !== undefined ? { load: out.load } : {}),
      series,
      snap: (snapRaw as SnapMode | undefined) ?? 'nearest',
      ...(frs.tolerance !== undefined ? { tolerance: frs.tolerance } : {}),
      ...(frs.vinTolerance !== undefined ? { vinTolerance: frs.vinTolerance } : {}),
    },
  };
}
