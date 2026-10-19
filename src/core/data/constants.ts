import { DIM, FOIL_CONVENTIONS, foilThickness, fromUnit, q, toUnit, type FoilConvention, type Quantity } from '../units';
import { LEDGER, type LedgerStatus } from './ledger';
import type { CopperBasis } from '../result';
import { finishedVsNominal } from './finished-copper';

function ledgerStatus(id: string): LedgerStatus {
  const row = LEDGER.find((r) => r.id === id);
  if (!row) throw new Error(`ledger row ${id} missing from src/core/data/ledger.ts`);
  return row.status;
}

/** Copper resistivity at 20 C, ohm*m: the IACS defining value 1/58 ohm*mm2/m [S-004, VERIFIED]. */
export const COPPER_RESISTIVITY_20C = 1 / 58e6;
/** Temperature coefficient of resistance of copper at 20 C, per K [S-004, VERIFIED]. */
export const COPPER_ALPHA_20C = 0.00393;

/**
 * Vacuum permeability mu0, H/m: 4 pi x 1e-7. Ledger S-013 (VERIFIED) states this value for the skin-depth relation and records
 * that it deviates from CODATA 2022 (1.256 637 061 27e-6) by less than 1e-9 relative (docs/sources/notes/skin-depth.md).
 */
export const MU0_H_PER_M = 4e-7 * Math.PI;
export const MU0_LEDGER_ID = 'S-013';

export type CopperKMaterial = 'pure-401' | 'c11000-391';
export const DEFAULT_COPPER_K_MATERIAL: CopperKMaterial = 'pure-401';

const K_TABLE: Readonly<Record<CopperKMaterial, { readonly k: number; readonly label: string }>> = {
  'pure-401': { k: 401, label: 'pure copper' },
  'c11000-391': { k: 391, label: 'C11000 (ETP) copper' },
};

export class UnknownMaterialError extends Error {
  constructor(material: string) {
    super(`Unknown copper material "${material}"; expected one of ${Object.keys(K_TABLE).join(', ')}`);
    this.name = 'UnknownMaterialError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface CopperThermalConductivity {
  readonly value: Quantity;
  readonly ledgerId: 'S-007';
  readonly status: LedgerStatus;
  readonly assumption: string;
}

/** Copper thermal conductivity, W/(m.K). Ledger S-007 is in CONFLICT; the caller must surface the status. */
export function copperThermalConductivity(material: CopperKMaterial): CopperThermalConductivity {
  if (typeof material !== 'string' || !Object.prototype.hasOwnProperty.call(K_TABLE, material)) {
    throw new UnknownMaterialError(String(material));
  }
  const e = K_TABLE[material];
  const status = ledgerStatus('S-007');
  return {
    value: q(e.k, DIM.THERMAL_CONDUCTIVITY),
    ledgerId: 'S-007',
    status,
    assumption: `Assumed ${e.label} thermal conductivity ${String(e.k)} W/m.K (ledger S-007, status ${status}; sources disagree by a few percent). The highest conductivity is the non-conservative choice for via temperature rise, because it understates the rise.`,
  };
}

export const DEFAULT_FOIL_CONVENTION: FoilConvention = 'nominal-35um';

/** Spread of the three foil thickness conventions at 1 oz/ft2, as a percent of the smallest (a pure function of the fixed convention table, computed once at load). */
function computeFoilSpreadPercent(): number {
  const oneOz = fromUnit(1, 'oz/ft2');
  const t = (Object.keys(FOIL_CONVENTIONS) as FoilConvention[]).map((c) => foilThickness(oneOz, c).thickness.si);
  const lo = Math.min(...t);
  const hi = Math.max(...t);
  return ((hi - lo) / lo) * 100;
}
const FOIL_SPREAD_PERCENT: number = computeFoilSpreadPercent();

export function foilSpreadPercent(): number {
  return FOIL_SPREAD_PERCENT;
}

export function foilAssumptionText(): string {
  const info = FOIL_CONVENTIONS[DEFAULT_FOIL_CONVENTION];
  return `Assumed foil thickness convention: 1 oz/ft2 = ${String(info.value)} um (${info.label.split(':')[0] ?? ''}). Other conventions differ by up to ${foilSpreadPercent().toFixed(2)} %, so copper thickness and everything derived from it carries that spread (ledger S-003, status ${info.status}).`;
}

/** Ledger rows rated separately (the foil convention is shown as its own assumption), so they do not set dataStatus. */
export const FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE: readonly string[] = ['S-003'];

/** Nominal copper basis from a foil weight; the source text names the convention and the spread, never a standard. */
export function copperBasisFromFoil(
  layer: 'outer' | 'inner',
  weight: Quantity,
  convention: FoilConvention = DEFAULT_FOIL_CONVENTION,
): CopperBasis {
  if (layer !== 'outer' && layer !== 'inner') {
    throw new Error(`Unknown copper layer "${String(layer)}"; expected outer or inner.`);
  }
  const t = foilThickness(weight, convention).thickness; // throws for non-areal-mass, non-finite, non-positive
  const oneOzUm = foilThickness(fromUnit(1, 'oz/ft2'), convention).thickness.si * 1e6;
  return {
    layer,
    basis: 'nominal',
    thickness: t,
    weightOzFt2: Number(toUnit(weight, 'oz/ft2').toFixed(9)),
    source: `Nominal thickness from foil weight using the ${convention} convention (1 oz/ft2 = ${oneOzUm.toFixed(2)} um). Conventions differ by up to ${foilSpreadPercent().toFixed(2)} %, and finished copper differs from nominal.`,
  };
}

export interface CopperBasisFactors {
  readonly defaultedAssumptions: string[];
  readonly safetyRelevantDefaults: string[];
}

const signedRounded = (v: number): string => {
  const r = Math.round(v);
  return r === 0 ? '0' : `${r < 0 ? '-' : '+'}${String(Math.abs(r))}`;
};

/** Per layer and weight text from ledger S-009 (secondhand minimums, not typical values), against the actual nominal thickness. */
function nominalCopperText(basis: CopperBasis): string {
  const lead = 'Nominal copper thickness used instead of finished copper';
  const nominalUm = basis.thickness.si * 1e6;
  const f = basis.weightOzFt2 === undefined ? undefined : finishedVsNominal(basis.layer, basis.weightOzFt2, nominalUm);
  if (f === undefined || basis.weightOzFt2 === undefined) {
    return `${lead}: there is no S-009 figure for this weight, so the finished thickness is unknown and current capacity and resistance are uncertain; thinner than nominal is the non-conservative direction for current capacity and heating.`;
  }
  const w = String(basis.weightOzFt2);
  const nom = `${nominalUm.toFixed(1)} um`;
  const figure = `the finished ${basis.layer}-layer minimum for ${w} oz/ft2 is ${f.minimumUm.toFixed(1)} um (${f.class}), ${signedRounded(f.percentVsNominal)} % against the nominal ${nom} used here (secondhand figure from IPC-6012 minimums, ledger S-009, not read from the standard; these are minimums, not typical values)`;
  const direction =
    basis.layer === 'inner'
      ? 'thinner than nominal is the non-conservative direction for current capacity and heating'
      : 'thicker than nominal lowers resistance but plated outer copper is not uniform';
  return `${lead}: ${figure}; ${direction}.`;
}

/** Ledger row behind every finished-versus-nominal copper statement (secondhand IPC-6012 minimums, PAYWALLED-USER-MUST-VERIFY). */
export const FINISHED_COPPER_LEDGER_ID = 'S-009';

/**
 * True when the copper basis makes the result print an S-009-based statement (a finished-copper minimum in um and its percent
 * against the nominal thickness): a nominal basis from a foil weight that the S-009 table covers. A thickness entry, a finished
 * or measured basis, and a weight without a table figure make no S-009 statement, so they do not cite S-009.
 */
export function usesFinishedCopperStatement(basis: CopperBasis): boolean {
  if (basis.basis !== 'nominal' || basis.weightOzFt2 === undefined) return false;
  return finishedVsNominal(basis.layer, basis.weightOzFt2, basis.thickness.si * 1e6) !== undefined;
}

/** Confidence factors implied by a copper basis. Only a nominal basis is a safety-relevant default. */
export function copperBasisFactors(basis: CopperBasis): CopperBasisFactors {
  return {
    defaultedAssumptions: [],
    safetyRelevantDefaults: basis.basis === 'nominal' ? [nominalCopperText(basis)] : [],
  };
}

/** Speed of light in vacuum, m/s: exact by the SI definition of the metre [S-029, VERIFIED]. Never 3e8 or an app-note figure (Q-16). */
export const C_M_PER_S = 299792458;
export const C_LEDGER_ID = 'S-029';

/**
 * Impedance of free space eta0 = mu0 x c, ohm (about 376.730). mu0 is the S-013 value (4 pi x 1e-7 H/m) and c is exact
 * [S-029]. Phase 2 decision Q-1 (OPEN_RISKS.md): the transmission-line prefactors use eta0 from these constants instead of the
 * rounded 60 ohm or 30 pi ohm printed in textbooks; the difference is about 0.07 % in Z0.
 */
export const ETA0_OHM = MU0_H_PER_M * C_M_PER_S;
/** eta0 / (2 pi), ohm (about 59.958): the microstrip air-line and coax prefactor that textbooks round to 60. */
export const Z_PREFACTOR_OHM = ETA0_OHM / (2 * Math.PI);
/** eta0 / 4, ohm (about 94.18): the stripline prefactor that textbooks write as 30 pi (94.25). */
export const Z_STRIPLINE_PREFACTOR_OHM = ETA0_OHM / 4;

/** Copper density at 20 degC, kg/m3: IACS reference value 8.89 g/cm3 [S-003d, VERIFIED]. */
export const COPPER_DENSITY_KG_M3 = 8890;
/** Copper melting (freezing) point, degC: ITS-90 fixed point 1357.77 K = 1084.62 degC [S-042c, VERIFIED]. Pure copper. */
export const COPPER_MELTING_POINT_C = 1084.62;

/**
 * Copper specific heat near room temperature, J/(kg K) [S-042d, CONFLICT]. The sourced values disagree by 0.7 percent and none is
 * preferred by the ledger; the default 'pppl-300k' (385.00) is a product choice (it matches the value used in the published
 * derivation, S-042a) and is shown as a default with the conflict stated. Never averaged.
 */
export type CopperSpecificHeatSource = 'pppl-293k' | 'pppl-300k' | 'hyperphysics-20c';
export const DEFAULT_COPPER_SPECIFIC_HEAT: CopperSpecificHeatSource = 'pppl-300k';
const CP_TABLE: Readonly<Record<CopperSpecificHeatSource, { readonly c: number; readonly label: string }>> = {
  'pppl-293k': { c: 383.48, label: 'PPPL pure-copper table at 293 K' },
  'pppl-300k': { c: 385.0, label: 'PPPL pure-copper table at 300 K' },
  'hyperphysics-20c': { c: 386, label: 'HyperPhysics at 20 degC' },
};

export class UnknownSpecificHeatError extends Error {
  constructor(source: string) {
    super(`Unknown copper specific heat source "${source}"; expected one of ${Object.keys(CP_TABLE).join(', ')}`);
    this.name = 'UnknownSpecificHeatError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface CopperSpecificHeat {
  readonly valueJPerKgK: number;
  readonly ledgerId: 'S-042d';
  readonly status: LedgerStatus;
  readonly label: string;
}

/** Copper specific heat for a chosen sourced value. The caller must surface the CONFLICT status. */
export function copperSpecificHeat(source: CopperSpecificHeatSource): CopperSpecificHeat {
  if (typeof source !== 'string' || !Object.prototype.hasOwnProperty.call(CP_TABLE, source)) throw new UnknownSpecificHeatError(String(source));
  const e = CP_TABLE[source];
  return { valueJPerKgK: e.c, ledgerId: 'S-042d', status: ledgerStatus('S-042d'), label: e.label };
}

/** Onderdonk constants as printed in the source [S-042, UNVERIFIED]: 33 (I/A)^2 s = log10((Tm + 234)/(Ta + 234)), A in circular mils. */
export const ONDERDONK_DIVISOR = 33;
export const ONDERDONK_OFFSET_C = 234;
/** One circular mil in m2: (pi/4) mil^2, mil = 25.4e-6 m exactly [S-006]. */
export const CIRCULAR_MIL_M2 = (Math.PI / 4) * 25.4e-6 * 25.4e-6;
/** Preece copper constant for a wire diameter in INCHES [S-042b, VERIFIED form]: I = a d^1.5. Historical reference only. */
export const PREECE_COPPER_A_INCH = 10244;
