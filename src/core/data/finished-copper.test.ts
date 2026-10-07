import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LEDGER } from './ledger';
import { FINISHED_COPPER_MIN_UM, FINISHED_COPPER_SOURCE, finishedVsNominal } from './finished-copper';

// Gate G2-a. Source: ledger S-009 (NCAB FAQ, retrieved 2026-10-06; IPC-6012 minimums read secondhand, not from the
// standard) and docs/sources/notes/finished-copper-plating.md. These are MINIMUMS, not typical values. The expected
// numbers below are typed from that note, never from the implementation.

const row = LEDGER.find((r) => r.id === 'S-009');
const pct = (min: number, nominal: number): number => (min / nominal - 1) * 100;
const close = (a: number, b: number, tol = 1e-9): void => {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
};

describe('FINISHED_COPPER_MIN_UM table (S-009)', () => {
  it('has exactly the secondhand NCAB minimums, in um', () => {
    expect(FINISHED_COPPER_MIN_UM).toEqual({
      inner: { 0.5: 11.4, 1: 24.9, 2: 55.7 },
      outerClass2: { 0.5: 33.4, 1: 47.9, 2: 78.7 },
      outerClass3: { 0.5: 38.4, 1: 52.9, 2: 83.7 },
    });
  });
  it('Class 3 outer minimum is 5 um above Class 2 for every weight (note: derived observation)', () => {
    for (const w of [0.5, 1, 2] as const) {
      close(FINISHED_COPPER_MIN_UM.outerClass3[w] - FINISHED_COPPER_MIN_UM.outerClass2[w], 5, 1e-9);
    }
  });
  it('minimums grow with weight in every row (monotonic)', () => {
    for (const k of ['inner', 'outerClass2', 'outerClass3'] as const) {
      const t = FINISHED_COPPER_MIN_UM[k];
      expect(t[0.5]).toBeLessThan(t[1]);
      expect(t[1]).toBeLessThan(t[2]);
    }
  });
  it('is exported with ledger id S-009 and the status read from the in-code ledger (PAYWALLED-USER-MUST-VERIFY)', () => {
    expect(row).toBeDefined();
    expect(FINISHED_COPPER_SOURCE.ledgerId).toBe('S-009');
    expect(FINISHED_COPPER_SOURCE.status).toBe(row?.status);
    expect(FINISHED_COPPER_SOURCE.status).toBe('PAYWALLED-USER-MUST-VERIFY');
  });
});

describe('finishedVsNominal', () => {
  const cases: [string, 'inner' | 'outer', number, number, number][] = [
    ['inner 1 oz', 'inner', 1, 35, 24.9],
    ['outer 1 oz (Class 2)', 'outer', 1, 35, 47.9],
    ['inner 0.5 oz', 'inner', 0.5, 17.5, 11.4],
    ['outer 0.5 oz (Class 2)', 'outer', 0.5, 17.5, 33.4],
    ['inner 2 oz', 'inner', 2, 70, 55.7],
    ['outer 2 oz (Class 2)', 'outer', 2, 70, 78.7],
  ];
  it.each(cases)('%s at the 35 um/oz nominal: minimum and percent from the ledger numbers', (_n, layer, oz, nominal, min) => {
    const r = finishedVsNominal(layer, oz, nominal);
    expect(r).toBeDefined();
    close(r?.minimumUm ?? NaN, min);
    close(r?.percentVsNominal ?? NaN, pct(min, nominal), 1e-9);
  });
  it('the headline percentages (inner -28.86, outer +36.86, inner 0.5 -34.86, outer 0.5 +90.86, inner 2 -20.43, outer 2 +12.43)', () => {
    const p = (layer: 'inner' | 'outer', oz: number): number => finishedVsNominal(layer, oz, 35 * oz)?.percentVsNominal ?? NaN;
    expect(p('inner', 1)).toBeCloseTo(-28.857, 2);
    expect(p('outer', 1)).toBeCloseTo(36.857, 2);
    expect(p('inner', 0.5)).toBeCloseTo(-34.857, 2);
    expect(p('outer', 0.5)).toBeCloseTo(90.857, 2);
    expect(p('inner', 2)).toBeCloseTo(-20.429, 2);
    expect(p('outer', 2)).toBeCloseTo(12.429, 2);
  });
  it('outer uses Class 2 and says so in class; inner has a non-empty class string', () => {
    expect(finishedVsNominal('outer', 1, 35)?.class).toMatch(/Class 2/);
    expect(finishedVsNominal('inner', 1, 35)?.class.length).toBeGreaterThan(0);
    expect(finishedVsNominal('inner', 1, 35)?.class).not.toMatch(/Class 3/);
  });
  it.each([3, 4, 0.25, 0.75, 1.5, 10, 0, -1, NaN, Infinity])('weight %s oz is not in the table: undefined (no invented numbers)', (w) => {
    expect(finishedVsNominal('inner', w, 35)).toBeUndefined();
    expect(finishedVsNominal('outer', w, 35)).toBeUndefined();
  });
  it('the minimum does not depend on the nominal thickness passed; the percent does (convention-dependent)', () => {
    const a = finishedVsNominal('inner', 1, 35);
    const b = finishedVsNominal('inner', 1, 34.29);
    expect(a?.minimumUm).toBe(b?.minimumUm);
    close(b?.percentVsNominal ?? NaN, pct(24.9, 34.29));
    expect(b?.percentVsNominal).not.toBe(a?.percentVsNominal);
  });
  it('is deterministic and finite for any positive nominal (property); percent sign follows layer for 1 oz', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 200, noNaN: true }), fc.constantFrom('inner', 'outer') as fc.Arbitrary<'inner' | 'outer'>, (nom, layer) => {
        const r = finishedVsNominal(layer, 1, nom);
        expect(r).toEqual(finishedVsNominal(layer, 1, nom));
        expect(Number.isFinite(r?.percentVsNominal)).toBe(true);
        close(r?.percentVsNominal ?? NaN, pct(layer === 'inner' ? 24.9 : 47.9, nom), 1e-9);
      }),
    );
  });
  it.each([0, -35, NaN, Infinity, -Infinity])('nominal %s is invalid: undefined, never a number', (nom) => {
    expect(finishedVsNominal('inner', 1, nom)).toBeUndefined();
  });
  it('an unknown layer returns undefined', () => {
    expect(finishedVsNominal('middle' as 'inner', 1, 35)).toBeUndefined();
  });
});
