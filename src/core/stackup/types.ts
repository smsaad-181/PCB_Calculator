import type { CopperBasisKind } from '../result';
import type { FoilConvention, Quantity } from '../units';

/**
 * Shared stackup model (Phase 2 task 1). A stack is an ordered list of layers, top to bottom. Pure data: SI Quantities,
 * no DOM. Everything in it is user-entered and unverified: er and Df are NEVER pre-filled, every dielectric carries a
 * required `source` label, and no fab limit lives here (fab limits come only from a fab profile).
 */

export const STACKUP_SCHEMA_VERSION = 1;
/** Provenance tag carried by every stack and its JSON export. A stack is never marked verified by this code. */
export const STACKUP_PROVENANCE = 'user-entered, unverified';

/** How a copper thickness was obtained. A weight is always nominal (the foil convention is the labelled assumption). */
export type CopperThicknessSource =
  | {
      readonly from: 'weight';
      readonly weight: Quantity;
      readonly weightOzFt2: number;
      readonly convention: FoilConvention;
      /** True when the stack did not name a convention and the project default was used (shown as an assumption). */
      readonly conventionDefaulted: boolean;
    }
  | { readonly from: 'thickness'; readonly basis: CopperBasisKind };

export interface CopperLayer {
  readonly kind: 'copper';
  readonly name: string;
  readonly thickness: Quantity;
  readonly thicknessSource: CopperThicknessSource;
}

export interface DielectricLayer {
  readonly kind: 'dielectric';
  readonly name: string;
  readonly thickness: Quantity;
  readonly er: number;
  /** Loss tangent; absent stays absent (no default). */
  readonly df?: number;
  /** Where er and Df came from (datasheet and revision, test frequency, fabricator stackup ...). Required, never pre-filled. */
  readonly source: string;
  /** Frequency at which er and Df apply, when known. */
  readonly frequency?: Quantity;
}

/** Soldermask is stored but NOT modelled by the impedance calculators (they say so). */
export interface SoldermaskLayer {
  readonly kind: 'soldermask';
  readonly name: string;
  readonly thickness: Quantity;
  readonly er?: number;
  readonly source?: string;
}

export type StackupLayer = CopperLayer | DielectricLayer | SoldermaskLayer;

export interface Stackup {
  readonly schemaVersion: typeof STACKUP_SCHEMA_VERSION;
  readonly provenance: typeof STACKUP_PROVENANCE;
  readonly name: string;
  readonly note?: string;
  readonly layers: readonly StackupLayer[];
}
