import type { AccuracyClass } from '../../confidence';

/**
 * Current path and load calculator (Phase 1 task 6): a SERIES path from a source to one load. Every element carries the
 * same current. For each element the calculator reports resistance, drop, power loss and share of the total drop, and, when
 * the element has a current limit, the utilisation I_applied / I_allowed and the margin I_allowed - I_applied. The weakest
 * link is the rated element with the highest utilisation.
 *
 * Where each limit comes from (nothing here is a rating the tool invents):
 *  - trace: the LEGACY IPC-2221 current capacity at the allowed temperature rise the user enters (trace-width calculator,
 *    Mode B; ledger S-001 and S-010, both PAYWALLED-USER-MUST-VERIFY). Always labelled legacy; it is not IPC-2152.
 *  - via: a rating the USER supplies, with its source note. The via calculator deliberately derives no rating from hole
 *    size, so a via with no rating is UNRATED.
 *  - connector, pad, spoke, pour-neck, cable, resistance: the user's resistance and (optionally) the user's rated current
 *    with its datasheet or source note.
 *  Elements without a rating are excluded from the ranking and listed with a caution: they may be the real limit.
 *
 * One utilisation basis: current. A limit given as a temperature rise is converted to a current limit (trace: the legacy
 * equation) before ranking. An absolute-temperature element is rejected; limits are never mixed across bases.
 *
 * Voltage drop, loss, load voltage, efficiency and the constant-power load model are those of the voltage-drop calculator
 * (ledger S-019, S-019h, S-004), reused as is. Via barrel resistance is the via calculator's (S-004; plated copper S-012
 * UNVERIFIED). Net-class export: recommended minimum width from the trace-width solve at the user's rise with that
 * calculator's design margin (an engineering default, not from a standard); via drill and pad are echoes of user entries;
 * clearance only from a user-selected fab profile that publishes a value for the exact scope.
 *
 * Deferred (not in this round): parallel branches and current division (a via ARRAY inside one via element is supported),
 * self-heating coupling (R(T) with the dissipated power; use the self-heating calculator), AC, skin and proximity effects,
 * unequal current sharing in via arrays, thermal coupling between elements.
 *
 * Rounding bounds (see format-result.ts): drops, losses, resistances, utilisation and required widths round up (never
 * understate a load or a requirement); load voltage, delivered power, efficiency, limit capacities and margins round down.
 */
export const meta = {
  id: 'path-load',
  title: 'Current path and load: weakest link, voltage drop and net-class export',
  method: 'Series DC path of traces, vias and user-rated elements feeding one load; utilisation I/I_allowed per rated element',
  reference: {
    standard:
      "Ohm's law and series resistance (S-019); constant-power load (S-019h); copper resistivity (S-004); trace current limit: IPC-2221 legacy curve fit (S-001, S-010, secondary sources only, PAYWALLED); via and other ratings: user-supplied",
    edition: 'IPC-2221B/C not read',
    ledgerIds: ['S-019', 'S-004', 'S-006', 'S-003', 'S-001', 'S-010'],
  },
  formula:
    'R_path = ΣR_k; I from the load (I given; V_source/(R_path + R_load); (V_source − V_load)/R_path; or the low-current root of R_path·I² − V_source·I + P = 0); ' +
    'V_drop,k = I·R_k; P_loss,k = I²·R_k; V_load = V_source − I·R_path; trace R = ρ(T)·L/(w·t); via R = ρ(T)·L/(N·π·t·(d + t)); ' +
    'trace limit (legacy): I_allowed = k·ΔT^0.44·A^0.725 (A in mil², ΔT in °C rise, k = 0.048 external, 0.024 internal); other limits: user rating; ' +
    'utilisation_k = I/I_allowed,k; margin_k = I_allowed,k − I; weakest link = rated element with the largest utilisation; ' +
    'recommended trace width: A = (M·I/(k·ΔT^0.44))^(1/0.725), width = A/t, M = design margin on current',
  ledgerIds: ['S-019', 'S-019h', 'S-004', 'S-006', 'S-003', 'S-001', 'S-010', 'S-012', 'S-018'],
  validity: {
    /** At most this many elements in the forward list and in the return list. */
    maxForwardElements: 12,
    maxReturnElements: 12,
    /** Plausibility range of a user-entered current rating (A); a unit-slip screen, not a standard. */
    ratedCurrentA: [1e-6, 1e4],
    labelMaxLength: 80,
    noteMaxLength: 200,
    viaCountMax: 100000,
  },
  defaults: { conductorTemperatureC: 25 },
  /** Worst case: a trace limit comes from an empirical curve fit. Paths without a trace limit are analytical (user ratings carry their own status). */
  accuracyClass: 'empirical' as AccuracyClass,
  accuracyClassNoTraceLimit: 'analytical' as AccuracyClass,
  toleranceInputs: [] as string[],
} as const;

export const PATH_LOAD_DEFERRED = [
  'parallel branches and current division',
  'self-heating coupling (use the self-heating calculator)',
  'AC, skin and proximity effects',
  'unequal current sharing inside a via array',
] as const;
