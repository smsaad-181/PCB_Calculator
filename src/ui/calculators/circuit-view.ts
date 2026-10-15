// Helpers shared by the view-models of the second circuit-value slice (feedback divider, LED resistor, RC/LC, reactance).
// Pure: no DOM, no engineering math. Numbers are never formatted here; that is src/core/format-result through buildResultView.
import type { CalcResult } from '../../core/result';
import type { CalloutView } from '../components/Callout';
import type { LedgerRowBadge } from '../components/LedgerRowBadges';
import { MAX_FIELD_CHARS, type LedgerView } from '../components/view';

/** What each ledger row backs on these pages. Wording for the reader; status always comes from the ledger. */
export const LEDGER_ROLE: Readonly<Record<string, string>> = {
  'S-019': 'The basic circuit relations used here (textbook, two independent authors agree).',
  'S-019b': 'The name "characteristic impedance" for √(L/C) of a lumped LC rests on one weak source; the number itself follows from f0 and X_L = X_C.',
  'S-016': 'E-series preferred values (IEC 60063). The standard is paywalled and the lists were not checked against it: compare the value you pick with your own copy.',
};

/** One line per ledger row the result depends on, each with its own status. */
export function ledgerRowsOf(ledger: LedgerView): LedgerRowBadge[] {
  return ledger.entries.map((e) => ({ id: e.id, status: e.status, role: LEDGER_ROLE[e.id] ?? e.item }));
}

/** Moves one core warning (matched by code) out of the list and into a prominent callout. The text is the core's own. */
export function splitCallout(raw: CalcResult, code: string, heading: string): { readonly raw: CalcResult; readonly callout: CalloutView | undefined } {
  const w = raw.warnings.find((x) => x.code === code);
  if (w === undefined) return { raw, callout: undefined };
  return { raw: { ...raw, warnings: raw.warnings.filter((x) => x !== w) }, callout: { heading, text: w.message } };
}

// ---------------------------------------------------------------------------
// Hash reading
// ---------------------------------------------------------------------------
export const hasKey = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export function readText(h: Readonly<Record<string, string>>, key: string, label: string, notices: string[], max: number = MAX_FIELD_CHARS): string {
  if (!hasKey(h, key)) return '';
  const v = h[key] ?? '';
  if (v.length > max) {
    notices.push(`${label} was too long and is empty instead.`);
    return '';
  }
  return v;
}

/** A choice with no default: absent or unknown gives '' (not chosen); unknown also gives a notice. */
export function readChoice<T extends string>(h: Readonly<Record<string, string>>, key: string, is: (v: string) => v is T, notice: string, notices: string[]): T | '' {
  if (!hasKey(h, key)) return '';
  const v = h[key] ?? '';
  if (is(v)) return v;
  notices.push(notice);
  return '';
}
