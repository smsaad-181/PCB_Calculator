import { DIM, FOIL_CONVENTIONS, foilThickness, fromUnit, q, type FoilConvention, type Quantity } from '../units';
import { LEDGER, type LedgerStatus } from './ledger';
import type { CopperBasis } from '../result';

function ledgerStatus(id: string): LedgerStatus {
  const row = LEDGER.find((r) => r.id === id);
  if (!row) throw new Error(`ledger row ${id} missing from src/core/data/ledger.ts`);
  return row.status;
}

/** Copper resistivity at 20 C, ohm*m: the IACS defining value 1/58 ohm*mm2/m [S-004, VERIFIED]. */
export const COPPER_RESISTIVITY_20C = 1 / 58e6;
/** Temperature coefficient of resistance of copper at 20 C, per K [S-004, VERIFIED]. */
export const COPPER_ALPHA_20C = 0.00393;

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

/** Spread of the three foil thickness conventions at 1 oz/ft2, as a percent of the smallest. */
export function foilSpreadPercent(): number {
  const oneOz = fromUnit(1, 'oz/ft2');
  const t = (Object.keys(FOIL_CONVENTIONS) as FoilConvention[]).map((c) => foilThickness(oneOz, c).thickness.si);
  const lo = Math.min(...t);
  const hi = Math.max(...t);
  return ((hi - lo) / lo) * 100;
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
    source: `Nominal thickness from foil weight using the ${convention} convention (1 oz/ft2 = ${oneOzUm.toFixed(2)} um). Conventions differ by up to ${foilSpreadPercent().toFixed(2)} %, and finished copper differs from nominal.`,
  };
}

export interface CopperBasisFactors {
  readonly defaultedAssumptions: string[];
  readonly safetyRelevantDefaults: string[];
}

const NOMINAL_COPPER_DEFAULT =
  'Nominal copper thickness used instead of finished copper: finished thickness is roughly -29 % to +37 % of nominal (secondhand figure from IPC-6012 minimums, not read from the standard), so current capacity and resistance are uncertain by that range.';

/** Confidence factors implied by a copper basis. Only a nominal basis is a safety-relevant default. */
export function copperBasisFactors(basis: CopperBasis): CopperBasisFactors {
  return {
    defaultedAssumptions: [],
    safetyRelevantDefaults: basis.basis === 'nominal' ? [NOMINAL_COPPER_DEFAULT] : [],
  };
}
