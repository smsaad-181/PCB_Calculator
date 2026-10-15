import { describe, expect, it } from 'vitest';
import { fromUnit } from '../../units';
import type { CalcResult } from '../../result';
import { okOf } from '../circuit-test-utils';
import { compute } from './calc';
import type { Inputs } from './calc';

// Phase 1 cleanup F-3: the converter always shows an S-009-based finished-copper caution (+37 % outer, -29 % inner,
// secondhand, PAYWALLED), so its dataStatus reflects S-009 and S-009 is cited. S-003 stays excluded from the rating.

const run = (i: Inputs): CalcResult => okOf(compute, i);

describe('F-3 copper converter: the S-009 caution is shown, so S-009 sets the status', () => {
  const cases: [string, Inputs][] = [
    ['outer by weight', { weight: fromUnit(1, 'oz/ft2'), layer: 'outer' }],
    ['inner by weight', { weight: fromUnit(1, 'oz/ft2'), layer: 'inner' }],
    ['outer by thickness', { thickness: fromUnit(35, 'um'), layer: 'outer', thicknessBasis: 'finished' }],
    ['inner by thickness', { thickness: fromUnit(35, 'um'), layer: 'inner', thicknessBasis: 'measured' }],
  ];
  for (const [name, i] of cases) {
    it(`${name}: S-009 cited, PAYWALLED`, () => {
      const r = run(i);
      expect(r.warnings.some((w) => /S-009/.test(w.message))).toBe(true);
      expect(r.reference.ledgerIds).toContain('S-009');
      expect(r.dataStatus).toBe('PAYWALLED');
    });
  }
  it('the foil-convention row S-003 is still excluded: without S-009 the rating would follow S-003d and S-006', () => {
    // The only rows are S-003 (excluded), S-003d, S-006 (VERIFIED) and S-009 (PAYWALLED): the worst remaining is S-009.
    expect(run(cases[0]?.[1] as Inputs).dataStatus).not.toBe('CONFLICT');
  });
});
