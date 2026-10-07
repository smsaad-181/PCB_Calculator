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
  // NEW (contract C): the basis remembers the foil weight so the finished-copper text can be per weight.
  it.each([0.5, 1, 2, 3])('weightOzFt2 is set to the foil weight in oz/ft2 (%s)', (w) => {
    const b = copperBasisFromFoil('outer', oz(w));
    expect(b.weightOzFt2).toBeDefined();
    expect(relErr(b.weightOzFt2 ?? NaN, w)).toBeLessThanOrEqual(1e-9);
  });
  it('weightOzFt2 is the weight, not the thickness, and does not depend on the convention', () => {
    for (const c of Object.keys(FOIL_CONVENTIONS) as FoilConvention[]) {
      expect(relErr(copperBasisFromFoil('inner', oz(2), c).weightOzFt2 ?? NaN, 2)).toBeLessThanOrEqual(1e-9);
    }
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
  // CHANGED (contract C / G2-a): the generic "roughly -29 % to +37 %" sentence is replaced by per layer / per weight text
  // from ledger S-009 (secondhand IPC-6012 minimums). The pinned figures below are the S-009 numbers, not implementation output.
  const text = (layer: 'outer' | 'inner', w: number, conv?: FoilConvention): string => {
    const f = copperBasisFactors(copperBasisFromFoil(layer, oz(w), conv));
    expect(f.safetyRelevantDefaults).toHaveLength(1);
    return f.safetyRelevantDefaults[0] as string;
  };
  const S009_MIN: Record<'inner' | 'outer', Record<number, number>> = {
    inner: { 0.5: 11.4, 1: 24.9, 2: 55.7 },
    outer: { 0.5: 33.4, 1: 47.9, 2: 78.7 },
  };
  const NOMINAL_NOT_STD = /[-−]?\d+ %/;
  const rounded = (v: number): string => (Math.round(v) === 0 ? '0' : `${v < 0 ? '-' : '+'}${String(Math.abs(Math.round(v)))}`);
  const pctText = (layer: 'inner' | 'outer', w: number, nominalUm: number): string =>
    rounded(((S009_MIN[layer][w] as number) / nominalUm - 1) * 100);
  const norm = (t: string): string => t.replace(/−/g, '-');

  it.each([
    ['inner', 0.5],
    ['inner', 1],
    ['inner', 2],
    ['outer', 0.5],
    ['outer', 1],
    ['outer', 2],
  ] as const)('%s %s oz: nominal copper thickness, S-009 minimum in um, rounded percent, secondhand, S-009, not typical', (layer, w) => {
    const t = text(layer, w);
    expect(t).toMatch(/nominal copper thickness/i);
    expect(t).toMatch(/finished/i);
    const min = S009_MIN[layer][w] as number;
    expect(t).toMatch(new RegExp(`${String(min).replace('.', '\\.')}\\s?(um|µm)`));
    expect(norm(t)).toContain(`${pctText(layer, w, 35 * w)} %`);
    expect(t).toMatch(/secondhand/i);
    expect(t).toContain('S-009');
    expect(t).toMatch(/not typical/i);
    expect(t).toContain('IPC-6012 minimums');
  });
  it('the 1 oz cases read -29 % (inner) and +37 % (outer)', () => {
    expect(norm(text('inner', 1))).toContain('-29 %');
    expect(norm(text('outer', 1))).toContain('+37 %');
    expect(norm(text('inner', 1))).not.toContain('+37 %');
    expect(norm(text('outer', 1))).not.toContain('-29 %');
  });
  it('the other weights give their own percent: inner 0.5 -35 %, outer 0.5 +91 %, inner 2 -20 %, outer 2 +12 %', () => {
    expect(norm(text('inner', 0.5))).toContain('-35 %');
    expect(norm(text('outer', 0.5))).toContain('+91 %');
    expect(norm(text('inner', 2))).toContain('-20 %');
    expect(norm(text('outer', 2))).toContain('+12 %');
  });
  it('the percent follows the nominal thickness actually used (1.35 mil convention, 34.29 um)', () => {
    const t = norm(text('inner', 1, 'nominal-1.35mil'));
    expect(t).toContain(`${pctText('inner', 1, 34.29)} %`);
    expect(norm(text('outer', 1, 'nominal-1.35mil'))).toContain(`${pctText('outer', 1, 34.29)} %`);
  });
  it('the old generic "roughly -29 % to +37 %" sentence is gone', () => {
    for (const layer of ['inner', 'outer'] as const) {
      expect(norm(text(layer, 1))).not.toMatch(/-29 % to \+37 %/);
      expect(text(layer, 1)).not.toMatch(/roughly/i);
    }
  });
  it('inner direction: thinner than nominal is the non-conservative direction for current capacity and heating', () => {
    expect(text('inner', 1)).toContain('thinner than nominal is the non-conservative direction for current capacity and heating');
    expect(text('outer', 1)).not.toContain('non-conservative direction for current capacity and heating');
  });
  it('outer direction: thicker than nominal lowers resistance but plated outer copper is not uniform', () => {
    expect(text('outer', 1)).toContain('thicker than nominal lowers resistance but plated outer copper is not uniform');
    expect(text('inner', 1)).not.toContain('plated outer copper is not uniform');
  });
  it.each([
    ['inner', 3],
    ['outer', 3],
    ['inner', 4],
    ['outer', 1.5],
  ] as const)('%s %s oz is not in the S-009 table: says so and invents no numbers', (layer, w) => {
    const t = text(layer, w);
    expect(t).toMatch(/nominal copper thickness/i);
    expect(t).toContain('no S-009 figure for this weight');
    expect(t).not.toMatch(NOMINAL_NOT_STD);
    for (const row of [11.4, 24.9, 55.7, 33.4, 47.9, 78.7, 38.4, 52.9, 83.7]) expect(t).not.toContain(String(row));
  });
  it('a hand-built nominal basis without a weight is treated as "no S-009 figure for this weight"', () => {
    const b: CopperBasis = { layer: 'inner', basis: 'nominal', thickness: copperBasisFromFoil('inner', oz(1)).thickness, source: 'hand-built' };
    const t = copperBasisFactors(b).safetyRelevantDefaults[0] as string;
    expect(t).toContain('no S-009 figure for this weight');
    expect(t).toMatch(/nominal copper thickness/i);
  });
  it('the nominal text names no standard except IPC-6012 as the secondhand reference', () => {
    for (const [layer, w] of [['inner', 1], ['outer', 2], ['inner', 3]] as const) {
      const t = text(layer, w);
      const found = t.match(/\b(IPC|IEC|ISO|ASTM|JEDEC|UL)[- ]?\w*/gi) ?? [];
      for (const m of found) expect(m.toUpperCase()).toBe('IPC-6012');
    }
    expect(text('inner', 1).match(/\bIPC[- ]?\w*/gi)?.length ?? 0).toBeGreaterThan(0);
  });
  it('never presents the minimums as typical values, and never says the standard was read', () => {
    const t = text('outer', 1);
    expect(t).not.toMatch(/^(?!.*not typical).*\btypical\b/is);
    // Forbidden words are assembled from fragments so this file does not itself trip the wording audit.
    expect(t).not.toMatch(new RegExp(['verified', 'compl' + 'ies', 'compl' + 'iant'].join('|'), 'i'));
  });
  it('inner and outer wording differ (layer-specific text)', () => {
    expect(text('inner', 1)).not.toBe(text('outer', 1));
    expect(text('inner', 2)).not.toBe(text('inner', 1));
  });
  it('nominal basis: exactly one safety-relevant default for each layer and no ordinary default', () => {
    for (const layer of ['inner', 'outer'] as const) {
      const f = copperBasisFactors(copperBasisFromFoil(layer, oz(1)));
      expect(f.safetyRelevantDefaults).toHaveLength(1);
      expect(f.defaultedAssumptions).toEqual([]);
    }
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
