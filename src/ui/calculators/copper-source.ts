// Where a copper WEIGHT comes from. Fabs sell FINISHED copper (order-form weight), foil datasheets give BASE foil.
// The two are not the same thickness, so the page asks and never assumes. Pure: no DOM, no engineering math.
// Finished thicknesses shown here come only from the bundled fab profile data (UNVERIFIED, ledger S-019c).
import profileJson from '../../core/data/fab-profiles/jlcpcb-2026-10-13.json';
import { parseFabProfile, type ParsedFabProfile } from '../../core/fab/profile';
import { toUnit, type Quantity } from '../../core/units';

export type WeightSource = '' | 'foil' | 'finished';

export const WEIGHT_SOURCE_QUESTION = 'Where does this weight come from?';
export const WEIGHT_SOURCE_OPTIONS: readonly { readonly value: 'foil' | 'finished'; readonly label: string }[] = [
  { value: 'foil', label: 'Foil spec (base foil)' },
  { value: 'finished', label: 'Fab order form (finished copper)' },
];
export const NOT_ANSWERED_NOTE =
  'You have not said where the weight comes from. It is converted as base foil (nominal). If it is the weight on a fab order form it is finished copper: choose that option.';
export const FINISHED_NEEDS =
  'A finished-copper weight cannot be converted to a thickness here: the thickness depends on the fab and the layer. Use the fab\'s published finished thickness (listed below when the fab profile has it), or switch to entering a thickness with the basis "Finished".';

export function isWeightSource(v: string): v is 'foil' | 'finished' {
  return v === 'foil' || v === 'finished';
}

/** Hash value to state. Unknown values are dropped with a notice by the caller. */
export function weightSourceFromHash(v: string | undefined, notices: string[]): WeightSource {
  if (v === undefined) return '';
  if (isWeightSource(v)) return v;
  notices.push('Where the copper weight comes from was not recognised: it is treated as not answered. Choose foil spec or fab order form.');
  return '';
}

export interface FinishedRow {
  readonly label: string;
  readonly text: string;
}
export interface FinishedGuidance {
  readonly fabricator: string;
  readonly profileDate: string;
  readonly status: string;
  readonly ledgerIds: readonly string[];
  readonly source: string;
  readonly rows: readonly FinishedRow[];
  readonly caveat: string;
}

const KEYS = [
  { key: 'finishedCopperOuter1oz', label: 'Outer layer, ordered 1 oz' },
  { key: 'finishedCopperInner0p5oz', label: 'Inner layer, ordered 0.5 oz' },
  { key: 'finishedCopperInner1oz', label: 'Inner layer, ordered 1 oz' },
] as const;

function show(q: Quantity): string {
  const um = toUnit(q, 'um');
  const mil = toUnit(q, 'mil');
  return `${Number(mil.toPrecision(3))} mil (${Number(um.toPrecision(3))} µm)`;
}

/** Guidance from a parsed profile; rows exist only for thicknesses the profile contains. */
export function finishedGuidanceOf(p: ParsedFabProfile): FinishedGuidance {
  const rows: FinishedRow[] = [];
  for (const { key, label } of KEYS) {
    const q = p.limits[key];
    if (q !== undefined) rows.push({ label, text: show(q) });
  }
  return {
    fabricator: p.fabricator,
    profileDate: p.profileDate,
    status: p.status,
    ledgerIds: p.ledgerIds.filter((id) => id === 'S-019c'),
    source: p.source,
    rows,
    caveat: 'UNVERIFIED: the pairing of label and value is unconfirmed and it is not stated whether plating is included. Confirm on the fab\'s own page and in your order. Fab data is date-stamped and changes without notice.',
  };
}

let cached: FinishedGuidance | null | undefined;
/** Guidance from the bundled fab profile, or null when the profile does not parse. */
export function finishedGuidance(): FinishedGuidance | null {
  if (cached === undefined) {
    const r = parseFabProfile(profileJson);
    cached = r.ok ? finishedGuidanceOf(r.value) : null;
  }
  return cached;
}
