import type { AccuracyClass } from '../../confidence';

/**
 * Fusing (Phase 4 core): adiabatic time to reach the copper melting point for a rectangular current pulse, or the current that
 * reaches it in a given time, or the fraction of the melting action integral I²t for a non-rectangular pulse. This is a different
 * question from steady-state trace heating: it has its own meta, own ledger ids, and shares no code or inputs with the
 * steady-state calculators.
 *
 * Primary model (S-042a, DERIVED, UNVERIFIED): I²·t = A²·K·ln[(Tm + β20)/(Ta + β20)], K = D·c/(ρ20·α20), β20 = 1/α20 − 20 °C.
 * D (S-003d, VERIFIED), ρ20 and α20 (S-004, VERIFIED), Tm = 1084.62 °C (S-042c, VERIFIED, no override), c from S-042d (CONFLICT:
 * the sourced values 383.48, 385.00 and 386 J/(kg·K) are selectable, never averaged; the default is a product choice and is shown
 * as a default). Secondary check: Onderdonk (S-042, UNVERIFIED, attributed, origin unknown), 33·(I/A)²·t = log10[(Tm + 234)/(Ta + 234)]
 * with A in circular mils. Historical reference only: Preece I = 10244·d^1.5 (S-042b), no time term, wire in still air.
 * The result is the time to REACH the melting point (heat of fusion excluded). It is never a fuse rating, a safe current or an
 * overload limit. On a PCB the board cools the trace within about 1 to 1.5 s and published simulations put trace fusing currents
 * at 1.5 to 6 times the Onderdonk value (S-042e, one author group). IPC trace-current methods address steady-state heating and
 * are not used here; whether the IPC documents say anything on fusing is a PAYWALLED condition (S-042f).
 *
 * Time thresholds (1 s and 10 s) are PRODUCT CHOICES based on S-042e, not sourced limits. Plausibility ranges are engineering
 * ranges, not values from a standard. Rounding bounds: all outputs are 'nominal' (an adiabatic estimate has no sourced safety
 * direction, so no result is rounded toward a presumed safe side).
 */
export const meta = {
  id: 'fusing',
  title: 'Fusing: adiabatic time to reach the copper melting point (estimate, not a fuse rating)',
  method:
    'Adiabatic heating of a copper conductor from the initial temperature to the melting point (time to reach it, heat of fusion excluded), with Onderdonk as a secondary check and Preece as a historical reference',
  reference: {
    standard: 'Adiabatic energy balance with copper constants (S-003d, S-004, S-042c, S-042d); Onderdonk equation (attributed); Preece equation (1888)',
    edition: 'n/a',
    ledgerIds: ['S-003d', 'S-004', 'S-006', 'S-042', 'S-042a', 'S-042b', 'S-042c', 'S-042d', 'S-042e', 'S-042f'],
  },
  formula:
    'I²·t = A²·K·ln[(Tm + β20)/(Ta + β20)]; K = D·c/(ρ20·α20); β20 = 1/α20 − 20 °C; Onderdonk: 33·(I/A)²·t = log10[(Tm + 234)/(Ta + 234)] with A in circular mils; Preece (historical, no time): I = 10244·d^1.5, d in inches; t = I²t/I²; I = √(I²t/t)',
  ledgerIds: ['S-003d', 'S-004', 'S-006', 'S-042', 'S-042a', 'S-042b', 'S-042c', 'S-042d', 'S-042e', 'S-042f'],
  accuracyClass: 'estimate' as AccuracyClass,
  /** Engineering plausibility ranges (not from a standard); a value outside fails a validity check. */
  validity: {
    initialTempC: [-55, 150] as readonly [number, number],
    traceThicknessM: [5e-6, 500e-6] as readonly [number, number],
  },
  /** PRODUCT CHOICES based on S-042e (one author group), not sourced limits. */
  timeWarnings: { overSeconds: 1, strongSeconds: 10 },
  toleranceInputs: [] as string[],
} as const;
