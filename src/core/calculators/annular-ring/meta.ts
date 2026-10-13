import type { AccuracyClass } from '../../confidence';

/**
 * Annular ring and drill calculator (task 7b). Pure geometry: nominal ring AR = (pad - hole)/2, stated against the FINISHED
 * hole or against the DRILL (they differ by the plating and any drill allowance). The worst case is a linear stack-up,
 * AR_wc = AR - (pad_tol/2 + hole_tol_plus/2 + position_tol), listing every term and its source; a tolerance that is not
 * supplied is omitted and said so, never assumed. Fabricator minimums and tolerances come only from a scoped fab profile
 * (exact hole type, layer count, copper weight; UNVERIFIED unless the profile says otherwise) or from the user. No limit is
 * known to this code. IPC-6012 acceptance criteria (breakout allowance by class) are paywalled and are not evaluated.
 *
 * Rounding bounds (see format-result.ts): the nominal ring is nominal geometry; the worst-case ring and every margin are
 * capacity-like guarantees (print rounded down); a required minimum prints rounded up.
 */
export const meta = {
  id: 'annular-ring',
  title: 'Annular ring, drill reference and tolerance stack-up',
  method: 'Geometry: nominal ring from pad and hole diameters; linear worst-case tolerance stack-up; comparison with scoped fab-profile or user-entered ring minimums',
  reference: {
    standard: 'Plane geometry; fabricator limits from the selected fab profile (scoped, ledger S-019i, S-019j, S-019m); unit conversions NIST SP 811 (S-006)',
    edition: 'n/a',
    ledgerIds: ['S-006', 'S-019i', 'S-019j', 'S-019m'],
  },
  formula:
    'AR = (D_pad - D_hole)/2; worst case AR_wc = AR - (tol_pad/2 + tol_hole_plus/2 + tol_position) with every supplied term added (linear worst case, not statistical); D_hole = finished hole or drill diameter as chosen; drill reference: finished hole = drill - 2 x plating when no allowance applies',
  ledgerIds: ['S-006', 'S-019i', 'S-019j', 'S-019m'],
  accuracyClass: 'exact' as AccuracyClass,
  toleranceInputs: ['hole size tolerance (+)', 'position tolerance', 'pad size tolerance (+/-)'] as string[],
} as const;
