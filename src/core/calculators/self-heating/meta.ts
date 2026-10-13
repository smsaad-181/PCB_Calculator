import type { AccuracyClass } from '../../confidence';

/**
 * Self-heating of a copper trace: steady-state temperature rise with the temperature-dependent resistance coupled into
 * the heating. Core only (Phase 1 task 4); the UI comes later.
 *
 * Model: R(T) = R20 x (1 + alpha x (T - 20 C)) with the S-004 constants; P = I^2 x R(T) (S-019); dT = theta x P (thermal
 * resistance, S-019d VERIFIED as a definition only). The coupled fixed point dT = theta x P(dT) (S-019g, UNVERIFIED, DERIVED
 * algebra, so every result cites it and stays UNVERIFIED) is solved by the existing
 * bracketed Brent root finder (src/core/solvers/rootfind.ts) on [0, dT_max].
 *
 * Thermal law (an explicit choice, never defaulted):
 *  - 'user-theta': theta (K/W) or theta per length (K m/W) is supplied by the user and is labelled user-supplied.
 *  - 'legacy-ipc2221-calibrated': theta_eff = dT_ipc(I) / P0, with dT_ipc from the legacy IPC-2221 relation (the trace-width
 *    core function, S-001 PAYWALLED-USER-MUST-VERIFY) and P0 = I^2 x R20 (the 20 C reference). The legacy relation is a
 *    curve fit to a chart, not a heat-flow model, so the coupling is an extrapolation. No IPC-2152 fit is used (Mode A is
 *    blocked by R-8).
 *
 * Out of scope: fusing (Onderdonk / Preece) is a different calculator with its own sources; transient heating and the
 * thermal time constant; skin effect and AC resistance (DC resistance only).
 */
export const meta = {
  id: 'self-heating',
  title: 'Trace self-heating with temperature-dependent resistance',
  method: 'Steady-state self-heating fixed point dT = theta x P(dT), R(T) linear in temperature (user theta, or legacy IPC-2221 calibrated)',
  reference: {
    standard: 'Copper resistivity (NBS Circular 31 / Handbook 100), circuit relations, thermal resistance definition',
    edition: 'n/a; thermal-resistance definition S-019d is VERIFIED, but the coupled fixed point and runaway criterion (S-019g) are UNVERIFIED (derived); pulse rows S-019e VERIFIED, S-019f UNVERIFIED',
    ledgerIds: ['S-004', 'S-019', 'S-019d', 'S-019g', 'S-006', 'S-003'],
  },
  /** Added to the references when a pulse is given. */
  pulseLedgerIds: ['S-019e', 'S-019f'],
  legacyLedgerIds: ['S-001', 'S-010'],
  formula:
    'R(T) = R20 x (1 + alpha x (T - 20 C)); P = I^2 x R(T); dT = theta x P(dT), solved for dT in [0, dT_max] (Brent, max 50 iterations, relative tolerance 1e-6); T = T_ambient + dT; V = I x R(T); uncoupled (alpha = 0) dT0 = theta x I^2 x R20; legacy theta_eff = dT_ipc(I) / (I^2 x R20); pulse I_rms = I_pk x sqrt(D) gives the MEAN (duty-averaged) rise, only when the user declares the period much shorter than the thermal time constant (the peak rise is higher and is not computed); R20, alpha from ledger S-004',
  ledgerIds: ['S-004', 'S-019', 'S-019d', 'S-019g', 'S-006', 'S-003', 'S-019e', 'S-019f', 'S-001', 'S-010'],
  validity: {
    // The same plausibility ranges as trace-resistance (engineering ranges, not from a standard).
    conductorTempC: [-55, 150],
    lengthM: 10,
    widthM: 0.1,
  },
  solver: { maxIterations: 50, relativeTolerance: 1e-6 },
  defaults: { ambientC: 25 },
  resultNames: {
    deltaT: 'temperature rise',
    deltaTMean: 'mean temperature rise (duty-averaged)',
    deltaTPeak: 'temperature rise at peak current held continuously (not an rms result)',
    conductorTemperature: 'conductor temperature',
    resistance: 'resistance at conductor temperature',
    power: 'power dissipated',
    voltageDrop: 'voltage drop',
    deltaTUncoupled: 'temperature rise without resistance coupling (alpha = 0)',
    couplingEffect: 'coupling effect on temperature rise (percent)',
    theta: 'thermal resistance used',
    effectiveCurrent: 'effective current used for heating',
    iterations: 'solver iterations',
    residual: 'solver residual',
    searchLimit: 'search limit dT_max (no steady state found below it)',
  },
  accuracyClass: 'estimate' as AccuracyClass,
  toleranceInputs: [] as string[],
} as const;
