import type { AccuracyClass } from '../../confidence';

/**
 * Voltage drop and power loss along one feed path (source, series path elements, one load). Relations: Ohm's law, power
 * relations and series resistance (S-019, VERIFIED). Trace resistance at the conductor temperature comes from the
 * trace-resistance calculator (S-004 VERIFIED copper resistivity and linear coefficient, S-006 unit conversions). The foil
 * convention (S-003, CONFLICT) is rated as its own labelled assumption, as in trace-resistance. The constant-power load
 * quadratic, its feasibility bound P_max = V_source²/(4·R_path) (maximum power transfer) and efficiency = P_load/P_source
 * are ledger S-019h (VERIFIED; note docs/sources/notes/constant-power-load.md). Steady state only: S-019h's sources show a
 * constant-power load can be unstable even when this equilibrium exists; stability is not assessed here.
 * User-supplied resistances carry no ledger status. Plausibility ranges are engineering ranges, not values from a standard.
 *
 * Rounding bounds (directional rounding rules, see format-result.ts):
 *  - drops, losses, resistances, percent drop, source power: 'prediction' (print rounded up; never understate a loss).
 *  - load voltage, power delivered to the load, efficiency, maximum deliverable power: 'max-capacity' (print rounded
 *    down). The load voltage is the voltage a downstream part actually gets, so it must never be shown higher than
 *    calculated; the same holds for the power and efficiency the load receives. When one of these is a user input it is
 *    echoed unchanged with bound 'nominal'.
 */
export const meta = {
  id: 'voltage-drop',
  title: 'Voltage drop and power loss along a feed path',
  method: 'Series DC path of copper traces (R(T)) and user-given resistances feeding one load; self-consistent state',
  reference: {
    standard: "Ohm's law, power relations and series resistance (textbook relations, ledger S-019); constant-power load and maximum power transfer (S-019h); copper resistivity (S-004)",
    edition: 'n/a',
    ledgerIds: ['S-019', 'S-019h', 'S-004', 'S-006', 'S-003'],
  },
  formula:
    'R_path = ΣR_k (trace: ρ(T)·L/(w·t), ρ(T) = ρ20·(1 + α·(T − 20 °C)), ledger S-004); V_drop,k = I·R_k; P_loss,k = I²·R_k; V_load = V_source − I·R_path; ' +
    'load I: I given; load R: I = V_source/(R_path + R_load); load V: I = (V_source − V_load)/R_path; ' +
    'load P: R_path·I² − V_source·I + P = 0, I = (V_source − √(V_source² − 4·R_path·P))/(2·R_path), P_max = V_source²/(4·R_path)',
  ledgerIds: ['S-019', 'S-019h', 'S-004', 'S-006', 'S-003'],
  validity: {
    voltageV: 1000,
    currentA: 1000,
    powerW: 1000,
    elementResistanceOhm: [1e-6, 1e6],
    maxElements: 200,
  },
  defaults: { conductorTemperatureC: 25 },
  accuracyClass: 'analytical' as AccuracyClass,
  toleranceInputs: [] as string[],
} as const;
