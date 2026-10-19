import type { AccuracyClass } from '../../confidence';

/**
 * Thermal via: one-dimensional conduction ESTIMATE (Phase 4 core). Thermal resistance of one plated barrel
 * theta = L/(k·π·t·(d + t)) with d the FINISHED (inside) hole diameter, t the plating thickness and L the barrel length (S-041,
 * formula VERIFIED); optional fill as a core cylinder in parallel with the barrel (S-041a, DERIVED, fill conductivity is a user
 * input only); N identical vias in ideal parallel theta/N (S-041b); optional temperature difference theta x P for a power the
 * user says flows through the vias (S-019d). k comes from copperThermalConductivity (S-007, CONFLICT) and is a required choice.
 * Conduction along the barrel and fill only: spreading in pads and planes, the package, solder, interface and convection are
 * ignored, so the result is a lower bound on the real resistance (S-041c, CONFLICT on how useful thermal vias are). It is not
 * a design constant and it is not a JEDEC package metric (S-040). Plating thickness comes from the user or a fab profile
 * AVERAGE and is never pre-filled. No fab limit is held here.
 *
 * Rounding bounds (directional rounding, format-result.ts): resistances and the temperature difference are 'prediction'
 * (print rounded up); the barrel area is 'nominal' geometry.
 */
export const meta = {
  id: 'thermal-via',
  title: 'Thermal via array: 1-D conduction estimate (lower bound, not a design constant)',
  method:
    'Via-array conduction estimate (1-D): plated barrel as a copper annulus, optional fill core in parallel, N identical vias in ideal parallel; ignores spreading',
  reference: {
    standard: 'One-dimensional conduction along the via barrel (TI SPRADB7; Guenin, Electronics Cooling 2004); copper thermal conductivity (S-007)',
    edition: 'n/a',
    ledgerIds: ['S-007', 'S-019d', 'S-040', 'S-041', 'S-041a', 'S-041b', 'S-041c', 'S-041d'],
  },
  formula:
    'A = π·t·(d + t); θ_barrel = L/(k·A); θ_core = L/(k_fill·π·d²/4) (filled only); θ_via = θ_barrel, or 1/(1/θ_barrel + 1/θ_core); θ_array = θ_via/N; ΔT = θ_array × P; d = finished hole diameter, t = plating thickness, L = barrel length, N = via count; 1-D conduction estimate that ignores spreading',
  ledgerIds: ['S-007', 'S-019d', 'S-040', 'S-041', 'S-041a', 'S-041b', 'S-041c', 'S-041d'],
  accuracyClass: 'estimate' as AccuracyClass,
  /** The result set has no envelope and no hidden tolerance; none is taken from a fab profile. */
  toleranceInputs: [] as string[],
} as const;
