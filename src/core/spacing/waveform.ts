import { DIM, q, sameDim } from '../units';
import type { Quantity } from '../units';
import type { CalcError, Result } from '../result';

/*
 * Working-voltage waveform helpers (Phase 3 core). Pure textbook relations, ledger S-035 (VERIFIED):
 *   V_rms = sqrt((1/T) integral v(t)^2 dt) over one period;
 *   sine: V_pk = sqrt(2) V_rms;  symmetric square: V_rms = V_pk;  symmetric triangle or sawtooth: V_pk = sqrt(3) V_rms;
 *   DC: V_rms = V_pk = V_dc;  DC plus a zero-mean sine: V_rms = sqrt(V_dc^2 + V_ac,rms^2), V_pk = V_dc + V_ac,pk (derived from the definition);
 *   unipolar rectangular pulse 0 to V_pk with duty D: V_rms = V_pk sqrt(D) (S-019e).
 * They apply only when the user DECLARES the waveform; the app never guesses a shape.
 * Nothing here knows an IEC 60664-1 or IPC-2221 table value.
 */

export const WAVEFORM_SHAPES = ['dc', 'sine', 'square', 'triangle'] as const;
export type WaveformShape = (typeof WAVEFORM_SHAPES)[number];
export type VoltageBasis = 'peak' | 'rms';

/** Peak divided by RMS for each declared shape (S-035). */
export const CREST_FACTOR: Readonly<Record<WaveformShape, number>> = Object.freeze({
  dc: 1,
  sine: Math.SQRT2,
  square: 1,
  triangle: Math.sqrt(3),
});

export interface PeakAndRms {
  readonly peak: Quantity;
  readonly rms: Quantity;
}

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
const VOLT_REF = { si: 1, dim: DIM.VOLTAGE } as Quantity;

function isVoltage(x: Quantity): boolean {
  try {
    return sameDim(x, VOLT_REF);
  } catch {
    return false;
  }
}

function guardVolts(field: string, v: unknown): Result<Quantity, CalcError> {
  const x = v as Partial<Quantity> | null | undefined;
  if (typeof x !== 'object' || x === null || typeof x.si !== 'number' || typeof x.dim !== 'object' || x.dim === null) {
    return { ok: false, error: err('INVALID_INPUT', field, `${field} must be a voltage quantity.`) };
  }
  if (!isVoltage(x as Quantity)) return { ok: false, error: err('DIMENSION', field, `${field} must be a voltage.`) };
  if (Number.isNaN(x.si)) return { ok: false, error: err('INVALID_INPUT', field, `${field} is NaN (not a number); it must be a finite voltage greater than zero.`) };
  if (!Number.isFinite(x.si)) return { ok: false, error: err('INVALID_INPUT', field, `${field} is infinite; it must be a finite voltage greater than zero.`) };
  if (x.si <= 0) return { ok: false, error: err('INVALID_INPUT', field, `${field} is ${x.si === 0 ? 'zero' : 'negative'}; it must be a finite voltage greater than zero.`) };
  return { ok: true, value: x as Quantity };
}

/** Peak and RMS of a declared waveform from one of them. Never throws. */
export function voltageFromWaveform(shape: WaveformShape, basis: VoltageBasis, value: Quantity): Result<PeakAndRms, CalcError> {
  if (!(WAVEFORM_SHAPES as readonly string[]).includes(shape)) {
    return { ok: false, error: err('INVALID_INPUT', 'waveform.shape', `waveform shape must be one of ${WAVEFORM_SHAPES.join(', ')}.`) };
  }
  if (basis !== 'peak' && basis !== 'rms') {
    return { ok: false, error: err('INVALID_INPUT', 'waveform.basis', 'waveform basis must be "peak" or "rms".') };
  }
  const g = guardVolts('waveform.value', value);
  if (!g.ok) return g;
  const cf = CREST_FACTOR[shape];
  const peak = basis === 'peak' ? g.value.si : g.value.si * cf;
  const rms = basis === 'rms' ? g.value.si : g.value.si / cf;
  if (!Number.isFinite(peak) || !Number.isFinite(rms)) {
    return { ok: false, error: err('OUT_OF_DOMAIN', 'waveform.value', 'waveform.value is too large to convert.') };
  }
  return { ok: true, value: { peak: q(peak, DIM.VOLTAGE), rms: q(rms, DIM.VOLTAGE) } };
}

/** DC plus a zero-mean sine: V_rms = sqrt(V_dc^2 + V_ac,rms^2), V_pk = V_dc + sqrt(2) V_ac,rms (S-035 definition). */
export function dcPlusSine(dc: Quantity, acRms: Quantity): Result<PeakAndRms, CalcError> {
  const a = guardVolts('dc', dc);
  if (!a.ok) return a;
  const b = guardVolts('acRms', acRms);
  if (!b.ok) return b;
  const rms = Math.hypot(a.value.si, b.value.si);
  const peak = a.value.si + Math.SQRT2 * b.value.si;
  if (!Number.isFinite(rms) || !Number.isFinite(peak)) {
    return { ok: false, error: err('OUT_OF_DOMAIN', 'dc', 'the voltages are too large to combine.') };
  }
  return { ok: true, value: { peak: q(peak, DIM.VOLTAGE), rms: q(rms, DIM.VOLTAGE) } };
}

/** RMS of a unipolar rectangular pulse from 0 to the peak at duty D in (0, 1] (S-019e). */
export function pulseRms(peak: Quantity, duty: number): Result<Quantity, CalcError> {
  const g = guardVolts('peak', peak);
  if (!g.ok) return g;
  if (typeof duty !== 'number' || !Number.isFinite(duty) || duty <= 0 || duty > 1) {
    return { ok: false, error: err('INVALID_INPUT', 'duty', 'duty must be a finite number greater than 0 and at most 1.') };
  }
  return { ok: true, value: q(g.value.si * Math.sqrt(duty), DIM.VOLTAGE) };
}

export interface VoltageSpec {
  readonly peak?: Quantity | undefined;
  readonly rms?: Quantity | undefined;
  readonly waveform?: { readonly shape: WaveformShape; readonly basis: VoltageBasis; readonly value: Quantity } | undefined;
}

export interface ResolvedVoltage {
  readonly peak?: Quantity;
  readonly rms?: Quantity;
  /** How the numbers were obtained, for the result's input provenance. */
  readonly how: 'direct' | 'waveform' | 'none';
  readonly waveformShape?: WaveformShape;
  readonly waveformBasis?: VoltageBasis;
}

/**
 * Peak and/or RMS working voltage from direct entries (either or both) or from a declared waveform, never both routes.
 * Returns how:'none' (no peak and no rms) when nothing was given, so the caller can list it as a missing input.
 */
export function resolveVoltage(spec: VoltageSpec): Result<ResolvedVoltage, CalcError> {
  const direct = spec.peak !== undefined || spec.rms !== undefined;
  if (direct && spec.waveform !== undefined) {
    return {
      ok: false,
      error: err('INVALID_INPUT', 'waveform', 'Give the voltage directly (peak and/or rms) or as a declared waveform, not both.'),
    };
  }
  if (spec.waveform !== undefined) {
    const w = voltageFromWaveform(spec.waveform.shape, spec.waveform.basis, spec.waveform.value);
    if (!w.ok) return w;
    return { ok: true, value: { peak: w.value.peak, rms: w.value.rms, how: 'waveform', waveformShape: spec.waveform.shape, waveformBasis: spec.waveform.basis } };
  }
  if (!direct) return { ok: true, value: { how: 'none' } };
  let peak: Quantity | undefined;
  let rms: Quantity | undefined;
  if (spec.peak !== undefined) {
    const g = guardVolts('peak voltage', spec.peak);
    if (!g.ok) return g;
    peak = g.value;
  }
  if (spec.rms !== undefined) {
    const g = guardVolts('rms voltage', spec.rms);
    if (!g.ok) return g;
    rms = g.value;
  }
  if (peak !== undefined && rms !== undefined && peak.si < rms.si * (1 - 1e-12)) {
    return { ok: false, error: err('INVALID_INPUT', 'peak voltage', 'peak voltage cannot be below the rms voltage of the same waveform.') };
  }
  return { ok: true, value: { ...(peak !== undefined ? { peak } : {}), ...(rms !== undefined ? { rms } : {}), how: 'direct' } };
}
