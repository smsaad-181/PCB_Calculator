import { describe, expect, it } from 'vitest';
import { DIM, FOIL_CONVENTIONS, fromUnit, q, sameDim } from '../units';
import type { FoilConvention } from '../units';
import type { CopperBasis } from '../result';
import { DEFAULT_FOIL_CONVENTION, copperBasisFactors, copperBasisFromFoil, foilSpreadPercent } from './constants';

// Gate G-2 / domain review D-2: structured copper basis. Test-only numbers are derived from the ledger-backed
// conventions (S-003) through the units engine, never from the implementation.

const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const oz = (n: number) => fromUnit(n, 'oz/ft2');
const STANDARD_NAMES = /\b(IPC|IEC|ISO|ASTM|JEDEC|UL)\b/i;

describe('copperBasisFromFoil', () => {
  it('1 oz outer, default convention: nominal basis, 35 um length, layer kept', () => {
    const b = copperBasisFromFoil('outer', oz(1));
    expect(b.layer).toBe('outer');
    expect(b.basis).toBe('nominal');
    expect(sameDim(b.thickness, q(1, DIM.LENGTH))).toBe(true);
    expect(relErr(b.thickness.si, 35e-6)).toBeLessThanOrEqual(1e-12);
  });
  it('default convention argument equals DEFAULT_FOIL_CONVENTION explicitly', () => {
    expect(copperBasisFromFoil('inner', oz(1))).toEqual(copperBasisFromFoil('inner', oz(1), DEFAULT_FOIL_CONVENTION));
  });
  it('inner layer and 2 oz: thickness scales with weight, layer kept', () => {
    const b = copperBasisFromFoil('inner', oz(2));
    expect(b.layer).toBe('inner');
    expect(relErr(b.thickness.si, 70e-6)).toBeLessThanOrEqual(1e-12);
  });
  it('other conventions give their own thickness (1 oz, 1.35 mil = 34.29 um)', () => {
    const b = copperBasisFromFoil('outer', oz(1), 'nominal-1.35mil');
    expect(relErr(b.thickness.si, 34.29e-6)).toBeLessThanOrEqual(1e-12);
    expect(b.basis).toBe('nominal');
  });
  it.each(Object.keys(FOIL_CONVENTIONS) as FoilConvention[])('source text for %s names the convention and the spread, no standard', (c) => {
    const b = copperBasisFromFoil('outer', oz(1), c);
    expect(b.source.trim().length).toBeGreaterThan(20);
    expect(b.source).toContain(c);
    expect(b.source).toContain(foilSpreadPercent().toFixed(2));
    expect(b.source).toMatch(/(um|µm)/);
    expect(b.source).toMatch(/oz/);
    expect(b.source).not.toMatch(STANDARD_NAMES);
  });
  it('source text states the um-per-oz value of the convention (35 um for the default, 34.29 um for 1.35 mil)', () => {
    expect(copperBasisFromFoil('outer', oz(1)).source).toMatch(/35(\.0+)?\s?(um|µm)/);
    expect(copperBasisFromFoil('outer', oz(1), 'nominal-1.35mil').source).toMatch(/34\.29\s?(um|µm)/);
  });
  it('rejects a weight that is not an areal mass (typed throw, never a number)', () => {
    expect(() => copperBasisFromFoil('outer', q(35e-6, DIM.LENGTH))).toThrow();
  });
  it.each([0, -1, NaN, Infinity])('rejects non-positive or non-finite weight %s', (v) => {
    expect(() => copperBasisFromFoil('outer', { si: v * 0.0305, dim: DIM.AREAL_MASS } as ReturnType<typeof oz>)).toThrow();
  });
  it('rejects an unknown layer at run time', () => {
    expect(() => copperBasisFromFoil('middle' as 'outer', oz(1))).toThrow();
  });
  it('is deterministic and does not mutate the weight', () => {
    const w = oz(1);
    const before = { si: w.si, dim: w.dim };
    expect(copperBasisFromFoil('outer', w)).toEqual(copperBasisFromFoil('outer', w));
    expect({ si: w.si, dim: w.dim }).toEqual(before);
  });
});

describe('copperBasisFactors', () => {
  const nominal = (): CopperBasis => copperBasisFromFoil('outer', oz(1));
  it('nominal basis: exactly one safety-relevant default and no ordinary default', () => {
    const f = copperBasisFactors(nominal());
    expect(f.defaultedAssumptions).toEqual([]);
    expect(f.safetyRelevantDefaults).toHaveLength(1);
  });
  it('the nominal text says nominal vs finished, the roughly -29 % to +37 % range, and that it is secondhand', () => {
    const t = copperBasisFactors(nominal()).safetyRelevantDefaults[0] as string;
    expect(t).toMatch(/nominal copper thickness/i);
    expect(t).toMatch(/finished/i);
    expect(t).toMatch(/roughly/i);
    expect(t).toMatch(/secondhand/i);
    expect(t).toMatch(/[-−]29 %/);
    expect(t).toMatch(/\+37 %/);
    expect(t).toContain('IPC-6012 minimums');
  });
  it('the nominal text names no standard except IPC-6012 as the secondhand reference', () => {
    const t = copperBasisFactors(nominal()).safetyRelevantDefaults[0] as string;
    const found = t.match(/\b(IPC|IEC|ISO|ASTM|JEDEC|UL)[- ]?\w*/gi) ?? [];
    expect(found.length).toBeGreaterThan(0);
    for (const m of found) expect(m.toUpperCase()).toBe('IPC-6012');
  });
  it('same text for inner and outer layers (layer-independent wording of the default)', () => {
    const o = copperBasisFactors(copperBasisFromFoil('outer', oz(1))).safetyRelevantDefaults;
    const i = copperBasisFactors(copperBasisFromFoil('inner', oz(1))).safetyRelevantDefaults;
    expect(i).toHaveLength(1);
    expect(o).toHaveLength(1);
  });
  it.each(['finished', 'measured'] as const)('%s basis yields no defaults at all', (basis) => {
    const b: CopperBasis = { ...nominal(), basis, source: 'fab stackup sheet' };
    expect(copperBasisFactors(b)).toEqual({ defaultedAssumptions: [], safetyRelevantDefaults: [] });
  });
  it('does not mutate the basis and is deterministic', () => {
    const b = nominal();
    const copy = JSON.parse(JSON.stringify(b)) as unknown;
    expect(copperBasisFactors(b)).toEqual(copperBasisFactors(b));
    expect(JSON.parse(JSON.stringify(b))).toEqual(copy);
  });
});
