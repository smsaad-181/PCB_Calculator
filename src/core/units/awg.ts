import { DIM } from './dim';
import { InvalidValueError } from './errors';
import { LEDGER_STATUS } from './ledger';
import { type Quantity } from './quantity';

/** AWG formula metadata (ledger S-005, ASTM B258, UNVERIFIED). */
export const AWG_FORMULA = {
  formula: 'd(mm) = 0.127 * 92^((36 - n) / 39); area = pi * d^2 / 4',
  ledgerId: 'S-005',
  status: LEDGER_STATUS['S-005'],
  source: 'ASTM B258 (as recorded in docs/sources/LEDGER.md S-005)',
  minGauge: -3, // 0000 AWG
  maxGauge: 40,
} as const;

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
  return { si: 0.127e-3 * Math.pow(92, (36 - n) / 39), dim: DIM.LENGTH };
}

/** Conductor cross-section area, pi d^2 / 4. */
export function awgArea(n: number): Quantity {
  const d = awgDiameter(n).si;
  return { si: (Math.PI * d * d) / 4, dim: DIM.AREA };
}
