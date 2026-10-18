import { C_M_PER_S } from '../data/constants';
import type { Bound } from '../result';
import { DIM, div, q, sameDim } from '../units';
import type { Quantity } from '../units';
import { roundDirectionFor } from '../units/display';
import { INCH_M } from '../units/units-table';
import { ceilGuarded, floorGuarded } from '../units/round-guard';

/**
 * Delay, guided wavelength and skew helpers shared by the impedance calculators.
 *   delay per length  t_pd = sqrt(eps_eff) / c            ledger S-029a (VERIFIED), c exact S-029 (VERIFIED)
 *   guided wavelength lambda_g = lambda0 / sqrt(eps_eff)  ledger S-029a, lambda0 = c / f
 *   skew              = |delta L| x t_pd                  ledger S-029b (derived, UNVERIFIED)
 * c is the exact SI value 299 792 458 m/s (decision Q-16); never 3e8, 0.0118 in/ps or 85 ps/in.
 * eps_eff is whatever the selected model returned; the helpers inherit that model's accuracy and badge.
 */

export const DELAY_LEDGER_IDS: readonly string[] = ['S-029', 'S-029a'];
export const SKEW_LEDGER_ID = 'S-029b';

/** Dimension of a delay per length (s/m). The units table has no such dimension; it is derived from time / length. */
export const TIME_PER_LENGTH = div(q(1, DIM.TIME), q(1, DIM.LENGTH)).dim;

export class DelayDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DelayDomainError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function checkEps(epsEff: number): number {
  if (typeof epsEff !== 'number' || !Number.isFinite(epsEff) || epsEff < 1) {
    throw new DelayDomainError(`eps_eff must be a finite number of at least 1; got ${String(epsEff)}.`);
  }
  return epsEff;
}

/** Propagation delay per unit length, t_pd = sqrt(eps_eff)/c, in s/m. */
export function delayPerLength(epsEff: number): Quantity {
  return q(Math.sqrt(checkEps(epsEff)) / C_M_PER_S, TIME_PER_LENGTH);
}

/** Guided wavelength lambda_g = c / (f sqrt(eps_eff)). */
export function guidedWavelength(epsEff: number, frequency: Quantity): Quantity {
  const e = checkEps(epsEff);
  if (!sameDim(frequency, q(1, DIM.FREQUENCY)) || !Number.isFinite(frequency.si) || !(frequency.si > 0)) {
    throw new DelayDomainError('frequency must be a finite positive frequency.');
  }
  return q(C_M_PER_S / (frequency.si * Math.sqrt(e)), DIM.LENGTH);
}

/** Skew from a length mismatch: |delta L| x t_pd (S-029b). Both traces are assumed to share the same eps_eff. */
export function skewFromMismatch(deltaLength: Quantity, epsEff: number): Quantity {
  const e = checkEps(epsEff);
  if (!sameDim(deltaLength, q(1, DIM.LENGTH)) || !Number.isFinite(deltaLength.si)) {
    throw new DelayDomainError('the length mismatch must be a finite length.');
  }
  return q((Math.abs(deltaLength.si) * Math.sqrt(e)) / C_M_PER_S, DIM.TIME);
}

const SIG = 4;

function decimalsFor(v: number): number {
  return SIG - 1 - Math.floor(Math.log10(Math.abs(v)));
}

/** v to SIG significant figures in the direction implied by the bound (never below the SI value for a prediction). */
function shown(v: number, dir: 'up' | 'down' | 'nearest'): string {
  const dec = decimalsFor(v);
  const scale = 10 ** dec;
  const t = v * scale;
  const n = dir === 'up' ? ceilGuarded(t) : dir === 'down' ? floorGuarded(t) : Math.round(t);
  const r = n / scale;
  return r.toFixed(Math.max(decimalsFor(r), 0));
}

/** "5.746 ps/mm (145.9 ps/in)": both units from the SI value, each rounded from it in the bound's direction (4 significant figures). */
export function formatDelayPerLength(x: Quantity, bound: Bound): string {
  if (!sameDim(x, q(1, TIME_PER_LENGTH)) || !Number.isFinite(x.si) || !(x.si > 0)) {
    throw new DelayDomainError('a delay per length must be a finite positive time per length.');
  }
  const dir = roundDirectionFor(bound);
  const psMm = x.si * 1e9;
  const psIn = x.si * 1e12 * INCH_M;
  return `${shown(psMm, dir)} ps/mm (${shown(psIn, dir)} ps/in)`;
}
