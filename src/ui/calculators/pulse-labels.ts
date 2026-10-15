// Wording shared by the pages that offer a pulsed-current input (self-heating and trace width). Text only; no math.
export type PeriodChoice = '' | 'much-shorter' | 'comparable-or-longer';

export const PERIOD_LABEL: Readonly<Record<'much-shorter' | 'comparable-or-longer', string>> = {
  'much-shorter': 'Much shorter than the thermal time constant (result is a mean rise from the rms current)',
  'comparable-or-longer': 'Comparable to or longer than the thermal time constant (peak current held continuously, not an rms result)',
};

export const PERIOD_QUESTION = 'Pulse period compared with the thermal time constant (required, no default)';
export const PERIOD_HELP = 'The time constant is not computed here and your statement is not checked. If the period is not clearly much shorter, choose the second option.';
export const PERIOD_NEEDS = 'Say whether the pulse period is much shorter than the thermal time constant, or comparable to or longer. It is not assumed.';
export const PEAK_HIGHER_HEADING = 'Mean temperature rise only: the peak is higher';
