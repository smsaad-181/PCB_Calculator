import type { AccuracyClass } from '../../confidence';

/**
 * Via barrel electrical resistance and axial thermal resistance (task 7a). Barrel copper area A = π·t·(d + t) with d the
 * FINISHED (inside) hole diameter and t the plating thickness: pure geometry. R(T) = ρ(T)·L/(N·A) with copper resistivity
 * at 20 degC and its linear temperature coefficient (S-004, VERIFIED); plated copper resistivity (S-012) is UNVERIFIED and
 * usually higher than pure copper, so the default is non-conservative for R and only a user override replaces it.
 * Axial thermal resistance θ = L/(k·N·A) with k from copperThermalConductivity (S-007, CONFLICT). The plating thickness
 * comes from the user (published fabricator and class values are S-015, PAYWALLED-USER-MUST-VERIFY) and is never pre-filled.
 * θ is conduction along the barrel only; it is not a trace-to-ambient resistance and no temperature rise or current
 * rating is derived. Plausibility ranges are engineering ranges, not values from a standard.
 *
 * Rounding bounds (directional rounding rules, see format-result.ts): resistances, voltage drop, power loss, axial thermal
 * resistances and conductor temperature are 'prediction' (print rounded up); barrel area is 'nominal' geometry.
 */
export const meta = {
  id: 'via',
  title: 'Via barrel resistance, voltage drop, power loss and axial thermal resistance',
  method: 'Plated barrel as a copper annulus: DC resistance with R(T) and axial thermal conduction; ideal parallel for N vias',
  reference: {
    standard: 'Annealed copper resistivity (NBS Circular 31 / Handbook 100); copper thermal conductivity (S-007)',
    edition: 'n/a',
    ledgerIds: ['S-004', 'S-007', 'S-012', 'S-015'],
  },
  formula:
    'A = π·t·(d + t); ρ(T) = ρ20 × (1 + α × (T − 20 °C)); R(T) = ρ(T) × L/(N·A); V = I × R(T); P = I² × R(T); θ = L/(k·N·A); d = finished hole diameter, t = plating thickness, L = barrel length, N = number of vias in parallel; ρ20 and α from ledger S-004, k from S-007',
  ledgerIds: ['S-004', 'S-007', 'S-012', 'S-015'],
  validity: {
    conductorTempC: [-55, 150],
  },
  defaults: { conductorTempC: 25 },
  accuracyClass: 'analytical' as AccuracyClass,
  toleranceInputs: ['finishedHoleDiameter', 'platingThickness', 'barrelLength', 'resistivity', 'conductorTemperature', 'current'] as string[],
  /**
   * Min/typ/max envelope and normalised sensitivities (task 9), optional, only when the user supplies tolerances. Generic
   * helper: src/core/sensitivity.ts (no physics). Worst-case corner range over the listed tolerances (2^k corners, k <= 6)
   * plus axis probes. R, theta, drop and power are monotone in every tolerated input, so corners are exact. Sensitivities:
   * barrel length 1, resistivity 1 (R only), finished hole -d/(d + t), plating thickness -(d + 2t)/(d + t) (from A = pi t (d + t)),
   * current 1 and 2 on drop and power, temperature the semi-log alpha / (1 + alpha (T - 20)) per kelvin on R and 0 on theta.
   * All outputs are predictions and round up. No tolerance is taken from a fab profile (vias are 'not controlled' by the
   * example fabricator, S-019i); the via count is exact.
   */
  envelope: {
    method: 'Worst-case corner analysis of the tolerance box with axis monotonicity probes; local log-log sensitivities by central difference.',
    maxToleratedInputs: 6,
    sensitivityRelativeStep: 1e-4,
    outputs: ['resistance at conductor temperature', 'axial thermal resistance (all barrels, ideal parallel)', 'voltage drop', 'power loss'],
  },
} as const;
