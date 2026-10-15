import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, q } from '../../units';
import type { Quantity } from '../../units';
import type { CalcResult } from '../../result';
import { okOf } from '../circuit-test-utils';
import { compute } from './calc';
import type { Inputs } from './calc';

// Phase 1 cleanup F-3: a result that emits an S-009-based caution or number cites S-009 and its dataStatus reflects it
// (PAYWALLED-USER-MUST-VERIFY). S-003 (foil convention) stays excluded from the rating. The status flips only when an
// S-009-based statement is present. Nothing here verifies S-009.

const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const um = (n: number): Quantity => fromUnit(n, 'um');
const mm = (n: number): Quantity => fromUnit(n, 'mm');
const frac = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const hz = (n: number): Quantity => fromUnit(n, 'Hz');

const base = { layer: 'outer', length: mm(100), width: mm(0.254) } as const;
const byWeight = (o: number, layer: 'outer' | 'inner' = 'outer'): Inputs => ({ ...base, layer, copperWeight: oz(o) });
const byThickness = (basis?: 'nominal' | 'finished' | 'measured'): Inputs => ({ ...base, copperThickness: um(35), ...(basis !== undefined ? { copperBasis: basis } : {}) });
const run = (i: Inputs): CalcResult => okOf(compute, i);

describe('F-3 trace resistance: S-009 statement present -> S-009 cited and status PAYWALLED', () => {
  it('nominal copper by weight with an S-009 figure (0.5, 1, 2 oz; outer and inner)', () => {
    for (const o of [0.5, 1, 2]) {
      for (const l of ['outer', 'inner'] as const) {
        const r = run(byWeight(o, l));
        expect(r.reference.ledgerIds, `${l} ${String(o)} oz`).toContain('S-009');
        expect(r.dataStatus).toBe('PAYWALLED');
        expect(r.confidence.reasons.join('\n')).toMatch(/S-009/); // the statement itself is still shown
      }
    }
  });
  it('no S-009 statement: finished or measured thickness, a nominal thickness (no weight), or a weight the table lacks (3 oz) keep VERIFIED', () => {
    for (const i of [byThickness('finished'), byThickness('measured'), byThickness('nominal'), byThickness(), byWeight(3)]) {
      const r = run(i);
      expect(r.reference.ledgerIds).not.toContain('S-009');
      expect(r.dataStatus).toBe('VERIFIED');
    }
  });
  it('S-003 stays excluded: the status is not CONFLICT for a finished thickness', () => {
    expect(run(byThickness('finished')).dataStatus).toBe('VERIFIED');
  });
  it('combines with the other rows: a resistivity override stays UNVERIFIED only without S-009, PAYWALLED with it (worst wins)', () => {
    const rho = q(1.9e-8, DIM.RESISTIVITY);
    expect(run({ ...byThickness('finished'), resistivity: rho }).dataStatus).toBe('UNVERIFIED');
    expect(run({ ...byWeight(1), resistivity: rho }).dataStatus).toBe('PAYWALLED');
    expect(run({ ...byThickness('finished'), frequency: hz(1e6) }).dataStatus).toBe('VERIFIED');
    expect(run({ ...byWeight(1), frequency: hz(1e6) }).reference.ledgerIds).toEqual(expect.arrayContaining(['S-009', 'S-013']));
  });
  it('the finished-copper-s009 thickness tolerance choice cites S-009 once and flips the status', () => {
    const r = run({ ...byWeight(1), tolerances: { copperThickness: { source: 'finished-copper-s009' } } });
    expect(r.reference.ledgerIds.filter((x) => x === 'S-009').length).toBe(1);
    expect(r.dataStatus).toBe('PAYWALLED');
    const plain = run({ ...byThickness('finished'), tolerances: { width: frac(0.1) } });
    expect(plain.dataStatus).toBe('VERIFIED');
    expect(plain.reference.ledgerIds).not.toContain('S-009');
  });
});
