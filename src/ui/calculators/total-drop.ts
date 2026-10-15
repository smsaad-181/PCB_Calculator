// Name matching for the total-drop result. The core names it 'total voltage drop' when the return path is counted
// and 'total voltage drop (forward path only)' when it is not. Lookups here accept both, so the page never loses the row.
import type { CalcResult } from '../../core/result';

export const TOTAL_DROP_RE = /^total voltage drop(?: \(forward path only\))?$/;

export const isTotalDropName = (name: string): boolean => TOTAL_DROP_RE.test(name);

/** The core's total-drop entry, whichever of the two names it carries. */
export function findTotalDrop(results: CalcResult['results']): CalcResult['results'][number] | undefined {
  return results.find((r) => isTotalDropName(r.name));
}

/** Display label: the core name with a leading capital (the forward-only qualifier stays). */
export const totalDropLabel = (name: string): string => `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
