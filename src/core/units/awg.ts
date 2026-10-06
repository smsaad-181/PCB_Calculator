import { DIM } from './dim';
import { InvalidValueError } from './errors';
import { LEDGER_STATUS, type LedgerStatus } from './ledger';
import { q, type Quantity } from './quantity';

/** AWG formula metadata (ledger S-005; status is read from the ledger, not hard-coded). */
export interface AwgFormulaMeta {
  readonly formula: string;
  readonly ledgerId: 'S-005';
  readonly status: LedgerStatus;
  readonly source: string;
  readonly precisionNote: string;
  readonly rangeNote: string;
  readonly minGauge: number;
  readonly maxGauge: number;
}

export const AWG_FORMULA: AwgFormulaMeta = {
  formula: 'd(mm) = 0.127 * 92^((36 - n) / 39); area = pi * d^2 / 4',
  ledgerId: 'S-005',
  status: LEDGER_STATUS['S-005'],
  source:
    'NBS Circular 31 (1914) and NBS Handbook 100 (1966); ASTM B258 (paywalled) not read, not used as the source',
  precisionNote:
    'Diameters are unrounded formula values (exact geometric progression), not the rounded nominal values of wire tables. NBS Handbook 100 rounds tabulated diameters "to the nearest tenth of a mil for gages 0000 through 44"; that rounding is not applied here. ASTM B258 is paywalled and was not read, so its tabulated values may differ.',
  rangeNote:
    'Gauge range -3 (0000) to 40 is the table range used by this app, not a limit of the formula valid beyond this range (Handbook 100 defines gauges to 56).',
  minGauge: -3, // 0000 AWG
  maxGauge: 40,
};

function check(n: number): void {
  if (!Number.isInteger(n) || n < AWG_FORMULA.minGauge || n > AWG_FORMULA.maxGauge) {
    throw new InvalidValueError(
      `AWG gauge must be an integer from ${AWG_FORMULA.minGauge} (0000) to ${AWG_FORMULA.maxGauge}, got ${String(n)}`,
    );
  }
}

/** Bare conductor diameter for AWG n (-3 = 0000, -2 = 000, -1 = 00, 0 = 0). */
export function awgDiameter(n: number): Quantity {
  check(n);
  return q(0.127e-3 * Math.pow(92, (36 - n) / 39), DIM.LENGTH);
}

/** Conductor cross-section area, pi d^2 / 4. */
export function awgArea(n: number): Quantity {
  const d = awgDiameter(n).si;
  return q((Math.PI * d * d) / 4, DIM.AREA);
}
