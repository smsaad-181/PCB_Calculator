import type { OutOfRangeInput } from '../confidence';
import { C_M_PER_S, COPPER_RESISTIVITY_20C, MU0_H_PER_M } from '../data/constants';
import { LEDGER } from '../data/ledger';
import type { CalcInput, CalcResult, CalcWarning } from '../result';
import { DIM, div, q } from '../units';
import type { Quantity } from '../units';
import { INCH_M } from '../units/units-table';
import type { CommonInputs } from './impedance-shared';

/**
 * Approximate loss estimate shared by the seven impedance calculators (Phase 2 core D, task 6; decision Q-17). Equations are
 * those recorded in docs/sources/notes/impedance-presets-and-data.md:
 *   S-013   skin depth delta = sqrt(rho / (pi f mu0)), VERIFIED; surface resistance Rs = rho / delta (S-029f)
 *   S-029d  low-loss line  alpha ~ R'/(2 Z0) + G' Z0 / 2 (Np/m), VERIFIED as an approximation; dB = 20 log10(e) x Np
 *   S-029e  dielectric loss alpha_d = (omega/c) tan(delta) er (ee - 1) / (2 sqrt(ee) (er - 1)) Np/m, UNVERIFIED
 *           (Steer eq. 26, "can be used with any TEM transmission line"); homogeneous limit pi f sqrt(er) tan(delta) / c
 *   S-029f  microstrip, wide strip, smooth copper: alpha_c ~ Rs / (Z0 w) Np/m, UNVERIFIED; coax: R' = Rs/(2 pi) (1/a + 1/b)
 *           (Ellingson, R' = 1/(2 pi a delta sigma) + 1/(2 pi b delta sigma)), alpha_c = R'/(2 Z0)
 * Validity recorded: t > 3 delta (Qucs, microstrip), smooth copper, no current crowding, tan(delta) and er taken at the analysis
 * frequency. NO roughness factor (Hammerstad K_r is a tier-4 source and decision Q-17 leaves it out), NO dispersion, NO conductor
 * loss for stripline, coupled or coplanar geometries (no form is recorded for them): those return a notice, never a formula.
 */

export const LOSS_LABEL = 'approximate estimate, lower bound for rough copper, no roughness, no dispersion';
/** dB per Np: 20 log10(e) (S-029d; arithmetic, no read source printed it). */
export const NP_TO_DB = 20 * Math.log10(Math.E);
/** Dimension of a loss per length (dB per metre is carried as a number with the dimension 1/length). */
export const LOSS_PER_LENGTH = div(q(1, DIM.DIMENSIONLESS), q(1, DIM.LENGTH)).dim;
/** The recorded validity of the skin-effect forms: conductor thickness above three skin depths (S-029f, Qucs). */
export const SKIN_DEPTH_MULTIPLE = 3;
/** tan(delta) at or above 1 is a unit slip (a percentage typed as a fraction), not a laminate. */
export const MAX_LOSS_TANGENT = 1;
/** Plausibility window for a conductor resistivity override, ohm metre (unit-slip guard, not a standard): good metals to poor alloys. */
export const RESISTIVITY_WINDOW: readonly [number, number] = [1e-9, 1e-6];

export const LOSS_DIELECTRIC_IDS: readonly string[] = ['S-029d', 'S-029e'];
export const LOSS_CONDUCTOR_IDS: readonly string[] = ['S-029f', 'S-013'];
export const DEFAULT_RESISTIVITY_LEDGER_ID = 'S-004';

// ---- pure functions --------------------------------------------------------------------------------------------------

/** Skin depth delta = sqrt(rho / (pi f mu0)) in metres (S-013). */
export function skinDepth(resistivity: number, frequency: number): number {
  return Math.sqrt(resistivity / (Math.PI * frequency * MU0_H_PER_M));
}

/** Surface resistance Rs = rho / delta = sqrt(pi f mu0 rho) in ohm per square (S-029f). */
export function surfaceResistance(resistivity: number, frequency: number): number {
  return resistivity / skinDepth(resistivity, frequency);
}

/**
 * Dielectric loss in Np/m (S-029e): (omega/c) tan(delta) er (ee - 1) / (2 sqrt(ee) (er - 1)). With er = 1 there is no dielectric,
 * so the loss is 0 (the quotient (ee - 1)/(er - 1) is the filling factor, which has no meaning without a dielectric).
 */
export function dielectricLossNpPerM(frequency: number, er: number, epsEff: number, tanDelta: number): number {
  if (!(er > 1) || tanDelta === 0) return 0;
  return ((2 * Math.PI * frequency) / C_M_PER_S) * tanDelta * ((er * (epsEff - 1)) / (2 * Math.sqrt(epsEff) * (er - 1)));
}

/** Microstrip conductor loss in Np/m (S-029f): Rs / (Z0 w), strip plus ground each about Rs / w. */
export function microstripConductorLossNpPerM(rs: number, z0: number, width: number): number {
  return rs / (z0 * width);
}

/** Coax conductor loss in Np/m (S-029d, S-029f): R' = Rs/(2 pi) (1/a + 1/b), alpha = R' / (2 Z0), a and b the radii. */
export function coaxConductorLossNpPerM(rs: number, z0: number, outerDiameter: number, innerDiameter: number): number {
  const rPrime = (rs / (2 * Math.PI)) * (1 / (innerDiameter / 2) + 1 / (outerDiameter / 2));
  return rPrime / (2 * z0);
}

// ---- the block merged into a calculator's result -----------------------------------------------------------------------

export type ConductorModel =
  | { readonly kind: 'microstrip'; readonly width: Quantity; readonly z0: number; readonly thickness?: Quantity }
  | { readonly kind: 'coax'; readonly outer: Quantity; readonly inner: Quantity; readonly z0: number }
  | { readonly kind: 'not-modelled'; readonly geometry: string };

export interface LossMode {
  /** Appended to result names: '' for a single line, ' (odd mode)' / ' (even mode)' for a pair. */
  readonly suffix: string;
  readonly epsEff: number;
}

export interface LossArgs {
  readonly common: CommonInputs;
  readonly er: number;
  readonly modes: readonly LossMode[];
  readonly conductor: ConductorModel;
}

export interface LossBlock {
  readonly inputs: CalcInput[];
  readonly steps: CalcResult['steps'];
  readonly results: CalcResult['results'];
  readonly warnings: CalcWarning[];
  readonly assumptions: string[];
  readonly validityChecks: CalcResult['validityChecks'];
  readonly outOfRange: OutOfRangeInput[];
  readonly ledgerIds: string[];
  /** Defaulted assumptions the confidence rule counts (the default copper resistivity). */
  readonly defaulted: string[];
}

const num = (x: number): string => String(Number(x.toPrecision(5)));
const status = (id: string): string => LEDGER.find((r) => r.id === id)?.status ?? 'MISSING';
const rows = (ids: readonly string[]): string => ids.map((id) => `${id} (${status(id)})`).join(', ');
const ohms = (x: number): Quantity => q(x, DIM.RESISTANCE);
const perLength = (dbPerM: number): Quantity => q(dbPerM, LOSS_PER_LENGTH);
const dB = (x: number): Quantity => q(x, DIM.DIMENSIONLESS);
const perInch = (dbPerM: number): string => num(dbPerM * INCH_M);

const APPROX_WARNING =
  `Loss is an ${LOSS_LABEL}. It uses the low-loss form alpha ~ R'/(2 Z0) + G' Z0/2 (valid for R' << omega L' and G' << omega C', ledger S-029d), a dielectric term from the entered tan(delta) and eps_eff (S-029e) and, where recorded, a smooth-copper skin-effect term (S-029f). ` +
  'tan(delta) and er must be the values at your analysis frequency (both vary with frequency, ledger S-027). Real foil and plating roughness add conductor loss that is not modelled, so a real conductor loss is higher than shown; dispersion and radiation are not modelled either.';

/**
 * Builds the loss outputs for a calculator whose model has already given a valid Z0 and eps_eff. Returns undefined when no loss
 * tangent was entered (no loss request). Inputs were validated by validateCommon (frequency present, tan(delta) in [0, 1), source
 * label present, resistivity inside its plausibility window).
 */
export function lossBlock(a: LossArgs): LossBlock | undefined {
  const c = a.common;
  if (c.lossTangent === undefined || c.frequency === undefined || c.lossTangentSource === undefined) return undefined;
  const f = c.frequency.si;
  const tand = c.lossTangent;
  const rhoUser = c.resistivity;
  const rho = rhoUser?.si ?? COPPER_RESISTIVITY_20C;

  const inputs: CalcInput[] = [
    { name: 'loss tangent tan(delta)', value: q(tand, DIM.DIMENSIONLESS), source: 'user', sourceDetail: c.lossTangentSource },
  ];
  const steps: CalcResult['steps'] = [];
  const results: CalcResult['results'] = [];
  const warnings: CalcWarning[] = [{ severity: 'caution', code: 'LOSS_APPROXIMATE', message: APPROX_WARNING }];
  const validityChecks: CalcResult['validityChecks'] = [];
  const outOfRange: OutOfRangeInput[] = [];
  const defaulted: string[] = [];
  const ledgerIds = [...LOSS_DIELECTRIC_IDS];
  const assumptions: string[] = [
    `Loss estimate (${LOSS_LABEL}) at ${num(f / 1e9)} GHz with tan(delta) = ${num(tand)} as entered (${c.lossTangentSource}).`,
    'dB = 20 log10(e) x Np, 8.685890 dB per Np (ledger S-029d).',
    'Dielectric loss uses the formula for a quasi-TEM line with the filling factor from eps_eff (ledger S-029e, Steer eq. 26: "can be used with any TEM transmission line"; one tier-2 source, UNVERIFIED).',
  ];

  const note = (ids: readonly string[]): string => `${LOSS_LABEL}. Relies on ledger ${rows(ids)}.`;
  const lenM = c.length?.si;

  if (rhoUser !== undefined) inputs.push({ name: 'conductor resistivity', value: rhoUser, source: 'user' });
  const dielectricNote = note(LOSS_DIELECTRIC_IDS);

  // dielectric loss, per mode
  const adByMode: { suffix: string; dbPerM: number }[] = [];
  for (const m of a.modes) {
    const np = dielectricLossNpPerM(f, a.er, m.epsEff, tand);
    const dbPerM = np * NP_TO_DB;
    adByMode.push({ suffix: m.suffix, dbPerM });
    steps.push({ label: `Dielectric loss${m.suffix}`, expr: 'alpha_d = (omega/c) tan(delta) er (ee - 1) / (2 sqrt(ee) (er - 1))  [Np/m]', value: q(np, LOSS_PER_LENGTH) });
    results.push({ name: `dielectric loss alpha_d${m.suffix}`, value: perLength(dbPerM), role: 'secondary', bound: 'prediction', note: `${dielectricNote} ${num(dbPerM)} dB/m (${perInch(dbPerM)} dB/in).` });
    if (lenM !== undefined) results.push({ name: `dielectric loss over length${m.suffix}`, value: dB(dbPerM * lenM), role: 'secondary', bound: 'prediction', note: `${dielectricNote} dB over the entered length.` });
  }
  if (a.modes.length > 1) {
    assumptions.push('For a coupled pair the single-line dielectric formula is applied to each mode with that mode\'s eps_e; the source records it for "any TEM transmission line", the coupled-mode use is an extension and carries the same UNVERIFIED status.');
  }

  // conductor loss
  if (a.conductor.kind === 'not-modelled') {
    warnings.push({
      severity: 'caution',
      code: 'CONDUCTOR_LOSS_NOT_MODELLED',
      message: `conductor loss not modelled for this geometry (${a.conductor.geometry}): the ledger records a conductor-loss form only for a wide microstrip strip (S-029f) and for a coaxial line (S-029d, S-029f), so none is invented here. Only the dielectric loss is given; it is a lower bound of the total loss and no total is shown.`,
    });
    if (rhoUser !== undefined) warnings.push({ severity: 'info', code: 'RESISTIVITY_UNUSED', message: 'The conductor resistivity you entered is not used: no conductor loss is modelled for this geometry.' });
  } else {
    ledgerIds.push(...LOSS_CONDUCTOR_IDS);
    if (rhoUser === undefined) {
      inputs.push({ name: 'conductor resistivity', value: q(COPPER_RESISTIVITY_20C, DIM.RESISTIVITY), source: 'default', sourceDetail: `copper at 20 degC, 1/58e6 ohm m (IACS, ledger ${DEFAULT_RESISTIVITY_LEDGER_ID}, ${status(DEFAULT_RESISTIVITY_LEDGER_ID)}); not corrected for conductor temperature` });
      ledgerIds.push(DEFAULT_RESISTIVITY_LEDGER_ID);
      defaulted.push('conductor resistivity (copper at 20 degC, S-004, not temperature-corrected)');
      assumptions.push('Conductor resistivity: default copper 1/58e6 ohm m at 20 degC (ledger S-004); a trace at a higher temperature has a higher resistivity and a higher conductor loss. Enter your own value to change it (plated copper is typically higher, ledger S-012).');
    } else {
      assumptions.push(`Conductor resistivity entered by the user: ${num(rho)} ohm m (not temperature-corrected).`);
    }
    const delta = skinDepth(rho, f);
    const rs = surfaceResistance(rho, f);
    const condNote = note(['S-029d', ...LOSS_CONDUCTOR_IDS]);
    steps.push({ label: 'Skin depth', expr: 'delta = sqrt(rho / (pi f mu0))', value: q(delta, DIM.LENGTH) }, { label: 'Surface resistance', expr: 'Rs = rho / delta', value: ohms(rs) });
    results.push(
      { name: 'skin depth', value: q(delta, DIM.LENGTH), role: 'secondary', bound: 'nominal', note: `Relies on ledger ${rows(['S-013'])}.` },
      { name: 'surface resistance Rs (ohm per square)', value: ohms(rs), role: 'secondary', bound: 'nominal', note: `Relies on ledger ${rows(['S-029f', 'S-013'])}.` },
    );
    let acNp: number;
    let reference: number;
    if (a.conductor.kind === 'microstrip') {
      acNp = microstripConductorLossNpPerM(rs, a.conductor.z0, a.conductor.width.si);
      reference = a.conductor.thickness === undefined ? 0 : a.conductor.thickness.si;
      steps.push({ label: 'Conductor loss (microstrip)', expr: 'alpha_c = Rs / (Z0 w)  [Np/m]', value: q(acNp, LOSS_PER_LENGTH) });
      warnings.push({
        severity: 'caution',
        code: 'CONDUCTOR_LOSS_WIDE_STRIP',
        message: 'The microstrip conductor loss Rs/(Z0 w) is the wide-strip, smooth-copper estimate (ledger S-029f): strip and ground plane each contribute about Rs/w, current crowding at the strip edges is not modelled, so it is optimistic for narrow traces and for rough foil.',
      });
      assumptions.push('Microstrip conductor loss alpha_c = Rs/(Z0 w) (strip plus ground each about Rs/w; Steer eqs. 21-23 structure, a low-frequency form, with the high-frequency Rs from the skin depth; ledger S-029f, UNVERIFIED).');
      if (a.conductor.thickness === undefined) {
        warnings.push({ severity: 'caution', code: 'SKIN_DEPTH_NOT_CHECKED', message: `No conductor thickness was entered, so the recorded validity t > ${String(SKIN_DEPTH_MULTIPLE)} skin depths (S-029f) is not checked (skin depth ${num(delta * 1e6)} um at this frequency). Enter the thickness to check it.` });
      }
    } else {
      acNp = coaxConductorLossNpPerM(rs, a.conductor.z0, a.conductor.outer.si, a.conductor.inner.si);
      reference = a.conductor.inner.si / 2;
      steps.push({ label: 'Conductor loss (coax)', expr: "R' = Rs/(2 pi) (1/a + 1/b); alpha_c = R'/(2 Z0)  [Np/m]", value: q(acNp, LOSS_PER_LENGTH) });
      assumptions.push("Coax conductor loss from R' = Rs/(2 pi) (1/a + 1/b) with a and b the inner and outer radii and alpha_c = R'/(2 Z0) (Ellingson via ledger S-029d and S-029f; smooth conductors, skin depth much smaller than the inner radius).");
    }
    const acDb = acNp * NP_TO_DB;
    results.push({ name: 'conductor loss alpha_c', value: perLength(acDb), role: 'secondary', bound: 'prediction', note: `${condNote} ${num(acDb)} dB/m (${perInch(acDb)} dB/in).` });
    if (lenM !== undefined) results.push({ name: 'conductor loss over length', value: dB(acDb * lenM), role: 'secondary', bound: 'prediction', note: `${condNote} dB over the entered length.` });
    // total: only for a single line (one dielectric value)
    const ad = adByMode[0];
    if (ad !== undefined && adByMode.length === 1) {
      const tot = ad.dbPerM + acDb;
      const totNote = note(['S-029d', ...LOSS_DIELECTRIC_IDS, ...LOSS_CONDUCTOR_IDS]);
      results.push({ name: 'total loss alpha (dielectric + conductor)', value: perLength(tot), role: 'secondary', bound: 'prediction', note: `${totNote} ${num(tot)} dB/m (${perInch(tot)} dB/in).` });
      if (lenM !== undefined) results.push({ name: 'total loss over length', value: dB(tot * lenM), role: 'secondary', bound: 'prediction', note: `${totNote} dB over the entered length.` });
    }
    // skin depth against the conductor size (the only comparison recorded: t > 3 delta, S-029f)
    if (reference > 0) {
      const ratio = reference / delta;
      const ok = ratio >= SKIN_DEPTH_MULTIPLE * (1 - 1e-12);
      const isCoax = a.conductor.kind === 'coax';
      const what = isCoax ? 'inner conductor radius' : 'conductor thickness';
      const name = `${what} at least ${String(SKIN_DEPTH_MULTIPLE)} skin depths`;
      const basis = isCoax
        ? `The recorded condition for the coax form is only "delta much smaller than the inner radius" (Ellingson, S-029f); no factor is recorded for coax, so the ${String(SKIN_DEPTH_MULTIPLE)} delta of the microstrip form is applied by analogy (not a sourced coax limit).`
        : `Recorded validity of the skin-effect form: strip thickness above ${String(SKIN_DEPTH_MULTIPLE)} skin depths (Qucs, ledger S-029f).`;
      validityChecks.push({ name, ok, detail: `${basis} ${what} / delta = ${num(ratio)} (delta ${num(delta * 1e6)} um).` });
      if (!ok) {
        outOfRange.push({ name: `${what} / skin depth`, value: num(ratio), bound: `at least ${String(SKIN_DEPTH_MULTIPLE)}` });
        warnings.push({
          severity: 'warning',
          code: 'SKIN_DEPTH_COMPARABLE',
          message: `The skin depth (${num(delta * 1e6)} um) is comparable to the ${what} (${what} / delta = ${num(ratio)}, recorded limit ${String(SKIN_DEPTH_MULTIPLE)}): the skin-effect conductor loss is outside its recorded validity and the estimate is not reliable. The value is shown unchanged; the confidence is lowered.`,
        });
      }
    }
  }
  if (lenM === undefined) {
    assumptions.push('No line length was entered, so the loss is given per unit length only.');
  }
  return { inputs, steps, results, warnings, assumptions, validityChecks, outOfRange, ledgerIds, defaulted };
}

/** The arrays of a calculator's result under construction, extended in place by mergeLoss. */
export interface LossTargets {
  readonly inputs: CalcInput[];
  readonly steps: CalcResult['steps'];
  readonly results: CalcResult['results'];
  readonly validityChecks: CalcResult['validityChecks'];
  readonly warnings: CalcWarning[];
  readonly outOfRange: OutOfRangeInput[];
  readonly assumptions: string[];
  readonly ledgerIds: string[];
}

/** Appends a loss block (when there is one) to the calculator's arrays; returns the defaulted assumptions for the confidence rule. */
export function mergeLoss(loss: LossBlock | undefined, t: LossTargets): readonly string[] {
  if (loss === undefined) return [];
  t.inputs.push(...loss.inputs);
  t.steps.push(...loss.steps);
  t.results.push(...loss.results);
  t.validityChecks.push(...loss.validityChecks);
  t.warnings.push(...loss.warnings);
  t.outOfRange.push(...loss.outOfRange);
  t.assumptions.push(...loss.assumptions);
  t.ledgerIds.push(...loss.ledgerIds);
  return loss.defaulted;
}
