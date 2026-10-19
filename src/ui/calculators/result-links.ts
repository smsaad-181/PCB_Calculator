// Plumbing between a core result value and the page: the quarter-wave hand-off link and the signed percent of a ratio. No engineering
// math: the value is carried over unrounded (a link) or printed by format-result (a percent).
import { formatSignedPercent } from '../../core/format-result';
import type { AccuracyClass } from '../../core/confidence';
import type { Quantity } from '../../core/units';
import { serializeHash } from '../../state/hash';

/** Plain link to the quarter-wave page carrying only eps_eff (state key ee), unrounded. */
export function epsHandoffHref(eps: Quantity): string {
  return serializeHash({ name: 'calc', id: 'quarter-wave' }, { ee: String(eps.si) });
}

/** A dimensionless difference (for example -0.0297) as a signed percent, printed by format-result. */
export function signedPercentText(ratio: Quantity, accuracyClass: AccuracyClass): string {
  return formatSignedPercent(ratio, { accuracyClass });
}
