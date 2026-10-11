import { describe, expect, it } from 'vitest';
import { LEDGER } from './ledger';
import { ESERIES, ESERIES_SOURCE } from './eseries';

// Phase 1 task 8 (first slice of circuit values): the E-series data module. TESTS FIRST.
// Reference data: ledger S-016 (IEC 60063 preferred values, status PAYWALLED-USER-MUST-VERIFY). The lists below were copied
// from the S-016 ledger row (docs/sources/LEDGER.md), and a test re-reads that row at run time so the copy cannot drift.
// Nothing here verifies S-016 (the standard was not read; the lists come from tertiary sources). The tests check the module
// against the ledger text and against the preferred-number definition 10^(n/N); the oracle (tools/reference/ref_calcs.py)
// recomputed the definition with exact-decimal arithmetic and its findings are pinned below.

type Name = 'E3' | 'E6' | 'E12' | 'E24' | 'E48' | 'E96' | 'E192';
const NAMES: readonly Name[] = ['E3', 'E6', 'E12', 'E24', 'E48', 'E96', 'E192'];
const SIZE: Record<Name, number> = { E3: 3, E6: 6, E12: 12, E24: 24, E48: 48, E96: 96, E192: 192 };
const SIG: Record<Name, number> = { E3: 2, E6: 2, E12: 2, E24: 2, E48: 3, E96: 3, E192: 3 };

// ---- literal copies of the S-016 ledger lists ----
const LEDGER_E3 = [1.0, 2.2, 4.7];
const LEDGER_E6 = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];
const LEDGER_E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const LEDGER_E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
const LEDGER_E96 = [
  1.0, 1.02, 1.05, 1.07, 1.1, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.3, 1.33, 1.37, 1.4, 1.43, 1.47, 1.5, 1.54, 1.58, 1.62, 1.65, 1.69, 1.74, 1.78,
  1.82, 1.87, 1.91, 1.96, 2.0, 2.05, 2.1, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.8, 2.87, 2.94, 3.01, 3.09, 3.16, 3.24,
  3.32, 3.4, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12, 4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.9,
  6.04, 6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32, 7.5, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76,
];

// ---- run-time re-read of the ledger row (guards the literal copies above) ----
const ledgerFiles = import.meta.glob('../../../docs/sources/LEDGER.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const ledgerText = Object.values(ledgerFiles)[0] ?? '';
const s016Row = ledgerText.split(/\r?\n/).find((l) => l.startsWith('| S-016')) ?? '';
const fromRow = (name: string, next: string): number[] => {
  const m = new RegExp(`${name}: ([0-9. ]+?)\\. ${next}`).exec(s016Row);
  return m?.[1] === undefined ? [] : m[1].split(' ').map(Number);
};

// ---- golden vectors (oracle) ----
interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
  ledger_ids: string[];
  status: string;
}
const goldenFiles = import.meta.glob('../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const goldenText = Object.values(goldenFiles)[0];
const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;
const vec = (name: string): GoldenVector => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found (${String(vectors.length)} vectors loaded)`);
  return v;
};
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

/** The preferred-number definition, rounded to `sig` significant figures (doubles; the oracle's tie distance is above 1e-3 of a unit). */
const formula = (n: number, N: number, sig: number): number => Number((10 ** (n / N)).toPrecision(sig));

/**
 * Indices where the published list differs from round(10^(n/N)). PINNED from the oracle's exact-decimal recomputation
 * (tools/reference/ref_calcs.py: eseries_formula_deviations; golden vectors eseries_<S>_formula_deviation_count).
 * The researcher note (docs/sources/notes/e-series.md) names only E24 n = 10-16, 22 and E192 n = 185. The oracle finds the
 * same for E24, E48, E96 (none) and E192, and ALSO exceptions in E3 (n = 2), E6 (n = 3, 4) and E12 (n = 5, 6, 7, 8, 11),
 * which the note does not list: published 3.3 4.7 (E6) and 2.7 3.3 3.9 4.7 8.2 (E12) against the formula 3.2 4.6 and 2.6 3.2 3.8 4.6 8.3.
 */
const DEVIATIONS: Record<Name, number[]> = {
  E3: [2],
  E6: [3, 4],
  E12: [5, 6, 7, 8, 11],
  E24: [10, 11, 12, 13, 14, 15, 16, 22],
  E48: [],
  E96: [],
  E192: [185],
};

describe('ESERIES: shape and ledger agreement', () => {
  it('has exactly the seven series, sizes 3/6/12/24/48/96/192', () => {
    expect(Object.keys(ESERIES).sort()).toEqual([...NAMES].sort());
    for (const n of NAMES) expect(ESERIES[n]).toHaveLength(SIZE[n]);
  });
  it('E3, E6, E12, E24 and E96 are EXACTLY the S-016 ledger lists', () => {
    expect([...ESERIES.E3]).toEqual(LEDGER_E3);
    expect([...ESERIES.E6]).toEqual(LEDGER_E6);
    expect([...ESERIES.E12]).toEqual(LEDGER_E12);
    expect([...ESERIES.E24]).toEqual(LEDGER_E24);
    expect([...ESERIES.E96]).toEqual(LEDGER_E96);
  });
  it('the literal copies in this test equal the S-016 ledger row as it is now (run-time re-read)', () => {
    expect(s016Row.length).toBeGreaterThan(0);
    expect(fromRow('E3', 'E6')).toEqual(LEDGER_E3);
    expect(fromRow('E6', 'E12')).toEqual(LEDGER_E6);
    expect(fromRow('E12', 'E24')).toEqual(LEDGER_E12);
    expect(fromRow('E24', 'E96')).toEqual(LEDGER_E24);
    expect(fromRow('E96', 'E48')).toEqual(LEDGER_E96);
  });
  it('E48 is every second E96 value (indices 0, 2, 4, ...)', () => {
    expect([...ESERIES.E48]).toEqual(LEDGER_E96.filter((_v, i) => i % 2 === 0));
  });
  it('E192 is the 3 s.f. definition with the single published exception n = 185 (9.20, formula 9.19)', () => {
    const expected = Array.from({ length: 192 }, (_v, n) => (n === 185 ? 9.2 : formula(n, 192, 3)));
    expect([...ESERIES.E192]).toEqual(expected);
    expect(ESERIES.E192[185]).toBe(9.2);
    expect(formula(185, 192, 3)).toBe(9.19);
  });
  it('the series are nested the way the ledger describes them: E3 in E6 in E12 in E24 (every second value), E96 = every second E192, E48 = every second E96', () => {
    const evens = (a: readonly number[]): number[] => a.filter((_v, i) => i % 2 === 0);
    expect(evens(ESERIES.E6)).toEqual([...ESERIES.E3]);
    expect(evens(ESERIES.E12)).toEqual([...ESERIES.E6]);
    expect(evens(ESERIES.E24)).toEqual([...ESERIES.E12]);
    expect(evens(ESERIES.E192)).toEqual([...ESERIES.E96]); // oracle finding, not in the researcher note: the lists agree
    expect(evens(ESERIES.E96)).toEqual([...ESERIES.E48]);
  });
});

describe('ESERIES: decade mantissa invariants', () => {
  for (const n of NAMES) {
    it(`${n}: first value 1.0, last value below 10, strictly increasing, finite, no duplicates`, () => {
      const a = ESERIES[n];
      expect(a[0]).toBe(1);
      expect(a[a.length - 1] as number).toBeLessThan(10);
      expect(a[a.length - 1] as number).toBeGreaterThan(4); // E3 ends at 4.7, E6 at 6.8, E12 at 8.2, the others above 9
      for (let i = 1; i < a.length; i++) expect(a[i] as number).toBeGreaterThan(a[i - 1] as number);
      for (const v of a) expect(Number.isFinite(v)).toBe(true);
      expect(new Set(a).size).toBe(a.length);
    });
    it(`${n}: every value has at most ${String(SIG[n])} significant figures (the mantissa is the double nearest its decimal)`, () => {
      for (const v of ESERIES[n]) expect(Number(v.toPrecision(SIG[n]))).toBe(v);
    });
  }
  it('adjacent ratios stay within the series step: no gap is larger than twice the nominal step 10^(1/N) (catches a dropped value)', () => {
    for (const n of NAMES) {
      const a = [...ESERIES[n], 10];
      const step = 10 ** (1 / SIZE[n]);
      for (let i = 1; i < a.length; i++) {
        const ratio = (a[i] as number) / (a[i - 1] as number);
        // E3/E6/E12/E24 are rounded coarsely (2 s.f.), so allow up to 1 + 2 (step - 1) plus the rounding of 2 s.f. near 1.0.
        expect(ratio, `${n} index ${String(i)}`).toBeLessThan(1 + 2.2 * (step - 1));
        expect(ratio).toBeGreaterThan(1);
      }
    }
  });
});

describe('ESERIES versus the preferred-number definition (oracle findings, pinned)', () => {
  for (const n of NAMES) {
    it(`${n}: published list differs from round(10^(k/N)) at exactly the pinned indices`, () => {
      const N = SIZE[n];
      const found = ESERIES[n].map((v, k) => (v === formula(k, N, SIG[n]) ? -1 : k)).filter((k) => k >= 0);
      expect(found).toEqual(DEVIATIONS[n]);
      expect(vec(`eseries_${n}_formula_deviation_count`).pinned_expected).toBe(DEVIATIONS[n].length);
    });
  }
  it('the E24 exceptions are the published ones: 2.7 3.0 3.3 3.6 3.9 4.3 4.7 8.2 where the formula gives 2.6 2.9 3.2 3.5 3.8 4.2 4.6 8.3', () => {
    const pub = DEVIATIONS.E24.map((k) => ESERIES.E24[k]);
    const calc = DEVIATIONS.E24.map((k) => formula(k, 24, 2));
    expect(pub).toEqual([2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 8.2]);
    expect(calc).toEqual([2.6, 2.9, 3.2, 3.5, 3.8, 4.2, 4.6, 8.3]);
  });
  it('the E96 position the researcher flagged as an online typo (n = 32) is 2.15, not 2.16', () => {
    expect(ESERIES.E96[32]).toBe(2.15);
    expect(formula(32, 96, 3)).toBe(2.15);
  });
});

describe('ESERIES versus the golden vectors (sizes and mantissa sums, 1e-9)', () => {
  for (const n of NAMES) {
    it(`${n}: size and mantissa sum`, () => {
      const size = vec(`eseries_${n}_size`);
      const sum = vec(`eseries_${n}_mantissa_sum`);
      expect(size.ledger_ids).toContain('S-016');
      expect(size.status).toBe('PAYWALLED-USER-MUST-VERIFY');
      expect(sum.rel_tol).toBeLessThanOrEqual(1e-9);
      expect(ESERIES[n].length).toBe(size.pinned_expected);
      expect(relErr(ESERIES[n].reduce((s, v) => s + v, 0), sum.pinned_expected)).toBeLessThanOrEqual(1e-9);
    });
  }
});

describe('ESERIES_SOURCE and immutability', () => {
  const row = LEDGER.find((r) => r.id === 'S-016');
  it('is ledger S-016 with the status read from the in-code ledger (PAYWALLED-USER-MUST-VERIFY: the UI shows the badge)', () => {
    expect(row).toBeDefined();
    expect(ESERIES_SOURCE.ledgerId).toBe('S-016');
    expect(ESERIES_SOURCE.status).toBe(row?.status);
    expect(ESERIES_SOURCE.status).toBe('PAYWALLED-USER-MUST-VERIFY');
  });
  it('the module data cannot be changed at run time (frozen, like the ledger)', () => {
    expect(Object.isFrozen(ESERIES)).toBe(true);
    for (const n of NAMES) expect(Object.isFrozen(ESERIES[n]), n).toBe(true);
    expect(Object.isFrozen(ESERIES_SOURCE)).toBe(true);
  });
});
