import type { CalcWarning } from '../result';

/**
 * Rectangular-pulse heating helper shared by the self-heating and trace-width calculators (pure; no state).
 * I_rms = I_pk x sqrt(D) is ledger S-019e (VERIFIED). Reading it as the MEAN (duty-averaged) heating current needs the period to
 * be much shorter than the thermal time constant: that condition is ledger S-019f (UNVERIFIED, one source) and is the user's
 * declaration here, never a computed threshold.
 */
export type PeriodVsTau = 'much-shorter' | 'comparable-or-longer';
export const PERIOD_VS_TAU_CHOICES: readonly string[] = ['much-shorter', 'comparable-or-longer'];
export const PULSE_LEDGER_IDS: readonly string[] = ['S-019e', 'S-019f'];

export const RMS_INFO =
  'Pulse: I_rms = I_pk x sqrt(D) (ledger S-019e) is used because you stated that the period is much shorter than the thermal time constant. That statement is your declaration, not a computed or checked threshold, and the condition itself is UNVERIFIED (ledger S-019f).';
export const PEAK_HIGHER_WARNING =
  'Pulse: the result is the mean (duty-averaged) temperature rise, not the peak. The peak rise is higher by up to (1 - D) x P_pk x Z(t_on), where Z(t_on) is the transient thermal impedance over one on-time. That is not computed: there is no transient thermal impedance for a trace in this calculator. Peak temperature needs the peak power, not the average power.';
export const PEAK_WARNING =
  'Pulse: the period is comparable to or longer than the thermal time constant, so an rms-based result would be wrong and none is given. The value shown is the steady rise at the peak current held continuously, a conservative bound for that case, and not an rms result.';

/** Effective heating current in amperes: I_pk x sqrt(D) when the period is much shorter than tau, else the peak held continuously. */
export function effectiveHeatingCurrent(peakSi: number, dutySi: number, period: PeriodVsTau): number {
  return period === 'much-shorter' ? peakSi * Math.sqrt(dutySi) : peakSi;
}

/** The warnings every pulse result carries (PULSE_RMS_ASSUMPTION and PULSE_PEAK_HIGHER, or PULSE_PERIOD_NOT_SHORT). */
export function pulseWarnings(period: PeriodVsTau): CalcWarning[] {
  return period === 'much-shorter'
    ? [
        { severity: 'caution', message: RMS_INFO, code: 'PULSE_RMS_ASSUMPTION' },
        { severity: 'warning', message: PEAK_HIGHER_WARNING, code: 'PULSE_PEAK_HIGHER' },
      ]
    : [{ severity: 'warning', message: PEAK_WARNING, code: 'PULSE_PERIOD_NOT_SHORT' }];
}
