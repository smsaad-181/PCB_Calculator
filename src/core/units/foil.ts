import { DIM, dimEqual, describeDim } from './dim';
import { DimensionError, InvalidValueError } from './errors';
import { LEDGER_STATUS, type LedgerStatus } from './ledger';
import { q, type Quantity } from './quantity';
import { INCH_M, OZ_PER_FT2_KG_M2 } from './units-table';

export type FoilConvention = 'nominal-35um' | 'nominal-1.35mil' | 'mass-density';

export interface FoilConventionInfo {
  readonly id: FoilConvention;
  readonly label: string;
  /** Default constant. nominal-35um: um per oz/ft2. nominal-1.35mil: mil per oz/ft2. mass-density: kg/m3. */
  readonly value: number;
  readonly unit: string;
  readonly ledgerIds: readonly string[];
  /** Status of ledger row S-003 (the foil weight to thickness contract). */
  readonly status: LedgerStatus;
  readonly note: string;
}

/** Selectable thickness conversions for copper weight. Badge anything whose status is not VERIFIED. */
export const FOIL_CONVENTIONS: Readonly<Record<FoilConvention, FoilConventionInfo>> = {
  'nominal-35um': {
    id: 'nominal-35um',
    label: 'Common fabricator nominal: 1 oz/ft2 = 35 um (1.378 mil)',
    value: 35,
    unit: 'um per oz/ft2',
    ledgerIds: ['S-003'],
    status: LEDGER_STATUS['S-003'],
    note: 'A common fabricator nominal, not a standard. Ledger S-003 is in CONFLICT. Finished copper differs: plating adds, etching removes.',
  },
  'nominal-1.35mil': {
    id: 'nominal-1.35mil',
    label: 'Reported IPC-4562A nominal: 1 oz/ft2 = 1.35 mil (unverified, secondhand)',
    value: 1.35,
    unit: 'mil per oz/ft2',
    ledgerIds: ['S-003'],
    status: LEDGER_STATUS['S-003'],
    note: 'Value reported secondhand for IPC-4562A; the standard was not read. Ledger S-003 is in CONFLICT.',
  },
  'mass-density': {
    id: 'mass-density',
    label: 'Mass/density: thickness = areal mass / 8890 kg/m3 (IACS density, ~34.3 um per oz/ft2)',
    value: 8890,
    unit: 'kg/m3',
    ledgerIds: ['S-003', 'S-003d'],
    status: LEDGER_STATUS['S-003'],
    note: 'IACS reference density 8890 kg/m3 (ledger S-003d, VERIFIED). Pure-copper density is in CONFLICT (S-003e). Overall status follows S-003.',
  },
};

export interface FoilOptions {
  /** Override the default constant (um per oz/ft2, mil per oz/ft2, or kg/m3 depending on convention). Must be > 0. */
  readonly constant?: number;
}

export interface FoilThickness {
  readonly thickness: Quantity;
  readonly convention: FoilConvention;
  /** The constant actually used, with unit, for display next to the result. */
  readonly constantUsed: {
    readonly value: number;
    readonly unit: string;
    readonly source: 'default' | 'user';
    readonly ledgerId: string;
  };
  readonly statement: string;
  readonly ledgerId: 'S-003';
  /** Status of S-003; a user override is always reported UNVERIFIED. */
  readonly status: LedgerStatus;
}

/** Copper weight (areal mass) -> thickness. The only sanctioned path from areal mass to length. */
export function foilThickness(weight: Quantity, convention: FoilConvention, opts: FoilOptions = {}): FoilThickness {
  if (!dimEqual(weight.dim, DIM.AREAL_MASS)) {
    throw new DimensionError(`Foil weight must be an areal mass (oz/ft2), got ${describeDim(weight.dim)}`);
  }
  if (!(weight.si > 0) || !Number.isFinite(weight.si)) {
    throw new InvalidValueError('Foil weight must be a finite number greater than zero');
  }
  if (!Object.prototype.hasOwnProperty.call(FOIL_CONVENTIONS, convention)) {
    throw new InvalidValueError(`Unknown foil convention: ${String(convention)}`);
  }
  const info = FOIL_CONVENTIONS[convention];
  const user = opts.constant !== undefined;
  const value = opts.constant ?? info.value;
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new InvalidValueError('Foil thickness constant must be a finite number greater than zero');
  }
  const ozPerFt2 = weight.si / OZ_PER_FT2_KG_M2;
  const si =
    convention === 'nominal-35um'
      ? ozPerFt2 * value * 1e-6
      : convention === 'nominal-1.35mil'
        ? ozPerFt2 * value * (INCH_M / 1000)
        : weight.si / value;
  if (!Number.isFinite(si)) throw new InvalidValueError('Foil thickness overflows the representable range');
  const ledgerId = convention === 'mass-density' && !user ? 'S-003d' : 'S-003';
  return {
    thickness: q(si, DIM.LENGTH),
    convention,
    constantUsed: { value, unit: info.unit, source: user ? 'user' : 'default', ledgerId },
    statement: `${info.label.split(':')[0] as string} convention, constant ${String(value)} ${info.unit} (${user ? 'user-supplied' : 'default'}, ledger ${info.ledgerIds.join('+')})`,
    ledgerId: 'S-003',
    status: user ? 'UNVERIFIED' : info.status,
  };
}
