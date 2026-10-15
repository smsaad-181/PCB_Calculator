import type { AccuracyClass } from '../../confidence';

/**
 * Trace resistance with temperature and a skin-depth screen. Constants: copper resistivity at 20 degC and its linear
 * temperature coefficient (S-004, VERIFIED), unit conversions (S-006), skin depth formula (S-013, VERIFIED). Plated copper
 * resistivity (S-012) is UNVERIFIED and only enters through a user override. The foil convention (S-003, CONFLICT) is
 * rated as its own labelled assumption. The plausibility ranges are engineering ranges, not values from a standard.
 */
export const meta = {
  id: 'trace-resistance',
  title: 'Trace resistance, voltage drop and power loss',
  method: 'DC resistance of a rectangular copper conductor, R(T) with the linear 20 °C temperature coefficient',
  reference: {
    standard: 'Annealed copper resistivity (NBS Circular 31 / Handbook 100)',
    edition: 'n/a',
    ledgerIds: ['S-004', 'S-006', 'S-003'],
  },
  formula:
    'ρ(T) = ρ20 × (1 + α × (T − 20 °C)); R(T) = ρ(T) × L/(w·t); V = I × R(T); P = I² × R(T); δ = √(ρ(T) / (π × f × μ0)); ρ20 and α from ledger S-004',
  ledgerIds: ['S-004', 'S-006', 'S-003', 'S-013', 'S-012'],
  validity: {
    conductorTempC: [-55, 150],
    lengthM: 10,
    widthM: 0.1,
    frequencyHz: [1, 1e9],
  },
  defaults: { ambientC: 25 },
  accuracyClass: 'analytical' as AccuracyClass,
  toleranceInputs: ['length', 'width', 'copperThickness', 'ambient', 'resistivity', 'current'] as string[],
  /**
   * Min/typ/max envelope and normalised sensitivities (task 9), optional, only when the user supplies tolerances. Generic
   * helper: src/core/sensitivity.ts (no physics). Worst-case corner range over the listed tolerances (2^k corners, k <= 6)
   * plus axis probes; resistance, drop and power are monotone in every tolerated input, so corners are exact. Sensitivities are
   * d ln(output)/d ln(input) (exactly 1, -1, -1 for length, width, thickness of R; 1 and 2 for current on drop and power) and
   * the temperature one is the semi-log alpha / (1 + alpha (T - 20)) per kelvin. All three outputs are predictions and round up.
   * The thickness tolerance may be an explicit S-003 foil-convention spread or S-009 finished-copper minimum (thin side only).
   * No tolerance is taken from a fab profile for resistance.
   */
  envelope: {
    method: 'Worst-case corner analysis of the tolerance box with axis monotonicity probes; local log-log sensitivities by central difference.',
    maxToleratedInputs: 6,
    sensitivityRelativeStep: 1e-4,
    outputs: ['resistance at conductor temperature', 'voltage drop', 'power loss'],
    thicknessChoices: { 'foil-convention-spread': 'S-003', 'finished-copper-s009': 'S-009' },
  },
} as const;
