import { DIM, dimEqual, describeDim } from './dim';
import { DimensionError, InvalidValueError } from './errors';
import { LEDGER_STATUS, type LedgerStatus } from './ledger';
import { type Quantity } from './quantity';
import { INCH_M, OZ_PER_FT2_KG_M2 } from './units-table';

export type FoilConvention = 'ipc-nominal' | 'mass-density';

export interface FoilConventionInfo {
  readonly id: FoilConvention;
  readonly label: string;
  /** Default constant. ipc-nominal: thickness of 1 oz/ft2 in mil. mass-density: copper density in kg/m3. */
  readonly value: number;
  readonly unit: string;
  readonly ledgerId: 'S-003';
  readonly status: LedgerStatus;
  readonly note: string;
}

/** Selectable thickness conversions for copper weight. Badge anything whose status is not VERIFIED. */
export const FOIL_CONVENTIONS: Readonly<Record<FoilConvention, FoilConventionInfo>> = {
  'ipc-nominal': {
    id: 'ipc-nominal',
    label: 'IPC nominal: 1 oz/ft2 = 1.378 mil (~35 um)',
    value: 1.378,
    unit: 'mil per oz/ft2',
    ledgerId: 'S-003',
    status: LEDGER_STATUS['S-003'],
    note: 'Convention from ledger S-003 (UNVERIFIED). Finished copper differs: outer-layer plating adds, etching removes.',
  },
  'mass-density': {
    id: 'mass-density',
    label: 'Mass/density: thickness = areal mass / 8960 kg/m3 (~34 um per oz/ft2)',
    value: 8960,
    unit: 'kg/m3',
    ledgerId: 'S-003',
    status: LEDGER_STATUS['S-003'],
    note: 'Copper density 8960 kg/m3 is a placeholder, UNVERIFIED (ledger S-003). Plausibility use only.',
  },
};

export interface FoilOptions {
  /** Override the default constant (mil per oz/ft2 for ipc-nominal, kg/m3 for mass-density). Must be > 0. */
  readonly constant?: number;
}

export interface FoilThickness {
  readonly thickness: Quantity;
  readonly convention: FoilConvention;
  /** The constant actually used, with unit, for display next to the result. */
  readonly constantUsed: { readonly value: number; readonly unit: string; readonly source: 'default' | 'user' };
  readonly statement: string;
  readonly ledgerId: 'S-003';
  /** Status of the default constant; a user override is always reported UNVERIFIED. */
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
  const info = FOIL_CONVENTIONS[convention];
  const user = opts.constant !== undefined;
  const value = opts.constant ?? info.value;
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new InvalidValueError('Foil thickness constant must be a finite number greater than zero');
  }
  const si =
    convention === 'ipc-nominal'
      ? (weight.si / OZ_PER_FT2_KG_M2) * value * (INCH_M / 1000)
      : weight.si / value;
  if (!Number.isFinite(si)) throw new InvalidValueError('Foil thickness overflows the representable range');
  return {
    thickness: { si, dim: DIM.LENGTH },
    convention,
    constantUsed: { value, unit: info.unit, source: user ? 'user' : 'default' },
    statement: `${info.label.split(':')[0] as string} convention, constant ${String(value)} ${info.unit} (${user ? 'user-supplied' : 'default'}, ledger ${info.ledgerId})`,
    ledgerId: info.ledgerId,
    status: user ? 'UNVERIFIED' : info.status,
  };
}
