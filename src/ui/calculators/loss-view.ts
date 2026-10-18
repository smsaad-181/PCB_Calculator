// View-model for the "Loss estimate" block of the impedance results. Pure: no DOM, no engineering math.
// Every loss number comes from the core result (src/core/calculators/loss-shared.ts); this file only picks the entries, prints them
// through format-result and groups the core warnings. dB/m is the number of the core quantity written with its unit.
import { LOSS_LABEL } from '../../core/calculators/loss-shared';
import { formatResult } from '../../core/format-result';
import type { CalcResult, CalcWarning } from '../../core/result';
import { DIM, q, type Quantity } from '../../core/units';
import type { LedgerRowBadge } from '../components/LedgerRowBadges';
import { ledgerView, orderWarnings, type WarningView } from '../components/view';
import { EXT_LEDGER_ROLE } from './impedance-ext.vm';

/** Shown beside the numbers whenever there are loss numbers, and in the block caption. The text is the core constant. */
export const LOSS_CAPTION = LOSS_LABEL;
export const LOSS_HEADING = 'Loss estimate';
export const LOSS_RANK = 'estimate' as const;

/** Core result names (prefixes: a coupled pair appends " (odd mode)" or " (even mode)") that belong to the loss block. */
const LOSS_NAMES: readonly { readonly prefix: string; readonly label: string; readonly unit: 'dB/m' | 'dB' | 'length' | 'ohm' }[] = [
  { prefix: 'dielectric loss alpha_d', label: 'Dielectric loss alpha_d', unit: 'dB/m' },
  { prefix: 'dielectric loss over length', label: 'Dielectric loss over the line length', unit: 'dB' },
  { prefix: 'conductor loss alpha_c', label: 'Conductor loss alpha_c', unit: 'dB/m' },
  { prefix: 'conductor loss over length', label: 'Conductor loss over the line length', unit: 'dB' },
  { prefix: 'total loss alpha', label: 'Total loss (dielectric + conductor)', unit: 'dB/m' },
  { prefix: 'total loss over length', label: 'Total loss over the line length', unit: 'dB' },
  { prefix: 'skin depth', label: 'Skin depth', unit: 'length' },
  { prefix: 'surface resistance Rs', label: 'Surface resistance Rs', unit: 'ohm' },
];

export const isLossName = (name: string): boolean => LOSS_NAMES.some((n) => name.startsWith(n.prefix));

export const LOSS_CODES: readonly string[] = [
  'LOSS_APPROXIMATE',
  'CONDUCTOR_LOSS_NOT_MODELLED',
  'RESISTIVITY_UNUSED',
  'CONDUCTOR_LOSS_WIDE_STRIP',
  'SKIN_DEPTH_NOT_CHECKED',
  'SKIN_DEPTH_COMPARABLE',
];

const PROMINENT_HEADING: Readonly<Record<string, string>> = {
  CONDUCTOR_LOSS_NOT_MODELLED: 'Conductor loss is not modelled for this geometry',
  SKIN_DEPTH_COMPARABLE: 'Skin depth is comparable to the conductor size',
};

export interface LossRowView {
  readonly label: string;
  /** Number and unit, for example "4.4 dB/m". */
  readonly text: string;
  /** The core note: the label, the ledger rows it relies on and the value with more digits (with dB/in). */
  readonly hint: string | undefined;
}

export interface LossNotice {
  readonly code: string;
  readonly heading: string;
  readonly message: string;
}

export interface LossView {
  readonly heading: string;
  readonly caption: string;
  readonly rows: readonly LossRowView[];
  /** Notices that must not be missed (conductor loss not modelled; skin depth comparable to the conductor). */
  readonly notices: readonly LossNotice[];
  /** The other loss warnings (approximation, wide-strip, resistivity unused, skin depth not checked). */
  readonly notes: readonly WarningView[];
  readonly ledgerRows: readonly LedgerRowBadge[];
}

const LOSS_LEDGER_IDS: readonly string[] = ['S-029d', 'S-029e', 'S-029f'];

function numberText(value: Quantity, bound: CalcResult['results'][number]['bound']): string {
  return formatResult({ value: q(value.si, DIM.DIMENSIONLESS), bound }, { accuracyClass: LOSS_RANK });
}

/** The loss block of a core result, or undefined when the result carries no loss outputs. */
export function buildLossView(raw: CalcResult, roleOf: (id: string) => string | undefined): LossView | undefined {
  const rows: LossRowView[] = [];
  for (const n of LOSS_NAMES) {
    for (const r of raw.results.filter((x) => x.name.startsWith(n.prefix))) {
      const suffix = r.name.includes(' (odd mode)') ? ' (odd mode)' : r.name.includes(' (even mode)') ? ' (even mode)' : '';
      const unitText = n.unit === 'dB/m' ? 'dB/m' : n.unit === 'dB' ? 'dB' : '';
      let text: string;
      if (n.unit === 'length') text = formatResult({ value: r.value, bound: r.bound }, { accuracyClass: LOSS_RANK, lengthRole: 'thickness' });
      else if (n.unit === 'ohm') text = `${formatResult({ value: r.value, bound: r.bound }, { accuracyClass: LOSS_RANK })} per square`;
      else text = `${numberText(r.value, r.bound)} ${unitText}`;
      rows.push({ label: `${n.label}${suffix}${unitText !== '' ? ` (${unitText})` : ''}`, text, hint: r.note });
    }
  }
  const ws: CalcWarning[] = raw.warnings.filter((w) => w.code !== undefined && LOSS_CODES.includes(w.code));
  if (rows.length === 0 && ws.length === 0) return undefined;
  const notices: LossNotice[] = ws
    .filter((w) => w.code !== undefined && PROMINENT_HEADING[w.code] !== undefined)
    .map((w) => ({ code: w.code as string, heading: PROMINENT_HEADING[w.code as string] as string, message: w.message }));
  const rest = ws.filter((w) => w.code === undefined || PROMINENT_HEADING[w.code] === undefined);
  const ids = raw.reference.ledgerIds.filter((id) => LOSS_LEDGER_IDS.includes(id));
  const ledgerRows = ledgerView(ids).entries.map((e): LedgerRowBadge => ({ id: e.id, status: e.status, role: roleOf(e.id) ?? EXT_LEDGER_ROLE[e.id] ?? e.item }));
  return { heading: LOSS_HEADING, caption: LOSS_CAPTION, rows, notices, notes: orderWarnings(rest), ledgerRows };
}
