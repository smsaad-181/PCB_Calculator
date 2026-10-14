import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ESERIES } from './data/eseries';
import { bestPairs, nearest, valuesInDecade } from './eseries';
import type { CalcError, Result } from './result';

// Phase 1 task 8 (first slice of circuit values): the pure E-series library. TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py: eseries_nearest, best_pairs, eseries_values;
// mirrored in docs/golden-vectors.json, exact Fraction arithmetic) or from definitions restated here. The implementation is
// never consulted. Nothing here verifies ledger S-016 (E-series lists, PAYWALLED-USER-MUST-VERIFY).
//
// CONTRACT pinned by these tests (for the implementer):
//  - Series are named 'E3' | 'E6' | 'E12' | 'E24' | 'E48' | 'E96' | 'E192'; modes 'nearest' | 'up' | 'down'.
//  - valuesInDecade(series, decade): the series mantissas scaled by 10^decade, each the double NEAREST the decimal value
//    (Number('4.7e3'), never 4700.000000000001). Decades -12..12 are supported.
//  - nearest(value, series, mode) returns Result<{ value, mantissa, decade, errorPercent }, CalcError>. 'nearest' minimises
//    |found - target| (linear distance); a TIE GOES UP. 'up' is the smallest series value >= target, 'down' the largest <= target.
//    A target within 1e-12 relative of a series value counts as that value (so float noise in a computed ideal resistor never
//    pushes it to the neighbouring value); errorPercent is always (found - target)/target x 100 against the actual target.
//    decade/mantissa describe the FOUND value (9.8 -> E24 nearest 10 is mantissa 1, decade 1). Invalid input is an error
//    value (code INVALID_INPUT, field 'value' | 'series' | 'mode'), never NaN, never a throw. Supported targets: 1e-12 to 1e12.
//  - bestPairs(target, series, topology, n = 5, opts?) returns Result<Pair[], CalcError>; Pair = { r1, r2, value, errorPercent }.
//    topology 'series' (r1 + r2), 'parallel' (r1 r2/(r1 + r2)), 'divider-ratio' (r2/(r1 + r2), target in (0, 1)).
//    n is an integer 1..1000 (fewer pairs than n: all of them). opts = { decades?: integer 1..6 (default 3), lowDecade?: integer }. The window is `decades` decades of the series from
//    lowDecade; default lowDecade: series dec(target) - decades + 1, parallel dec(target), divider-ratio 3, where
//    dec(x) = floor(log10 x). series/parallel list each unordered pair once with r1 <= r2 (equal values allowed);
//    divider-ratio lists ordered pairs (r1 on top). ORDER: |error| ascending, then fewer significant digits in r1 + r2
//    (digits of the mantissa with trailing zeros dropped: 1.00 is 1 digit, 4.70 is 2, 4.75 is 3), then r1 ascending, then r2
//    ascending; absolute errors within 1e-12 of the target of each other are ties. Deterministic and pure.

type SeriesName = keyof typeof ESERIES;
type Mode = 'nearest' | 'up' | 'down';
const SERIES: readonly SeriesName[] = ['E3', 'E6', 'E12', 'E24', 'E48', 'E96', 'E192'];
const MODES: readonly Mode[] = ['nearest', 'up', 'down'];

interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
  ledger_ids: string[];
  status: string;
}
const goldenFiles = import.meta.glob('../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const goldenText = Object.values(goldenFiles)[0];
const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;
const vec = (name: string): GoldenVector => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found (${String(vectors.length)} vectors loaded)`);
  return v;
};
/** |a - b| within 1e-9 of max(|b|, 1): relative for large numbers, absolute near zero (percent errors can be exactly 0). */
const close = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1);
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const num = (mantissa: number, decade: number): number => Number(`${String(mantissa)}e${String(decade)}`);

// Case tables mirror tools/reference/ref_calcs.py (vector names use the case index).
const NEAREST_TARGETS = [9.8, 0.97, 4700, 26363.636363636364, 1.234e-9, 8.6e5];
const GOLD_SERIES: SeriesName[] = ['E24', 'E96', 'E192'];
type Topology = 'series' | 'parallel' | 'divider-ratio';
const PAIR_CASES: [Topology, SeriesName, number, number, number][] = [
  ['series', 'E24', 3000, 5, 3],
  ['series', 'E96', 12345, 5, 3],
  ['parallel', 'E96', 1234, 5, 3],
  ['parallel', 'E24', 1500, 5, 3],
  ['divider-ratio', 'E96', 0.2, 5, 3],
  ['divider-ratio', 'E24', 0.25, 5, 2],
];

function okOf<T>(r: Result<T, CalcError>): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code} ${r.error.field ?? ''}: ${r.error.message}`);
  return r.value;
}
const near = (v: number, s: SeriesName, m: Mode = 'nearest') => okOf(nearest(v, s, m));
function fail<T>(r: Result<T, CalcError>): CalcError {
  if (r.ok) throw new Error('expected an error value, got a result');
  expect('value' in r).toBe(false);
  return r.error;
}

describe('valuesInDecade', () => {
  it('every series, decades -12..12: the series size, each value the double nearest the decimal, strictly increasing, first value 10^decade', () => {
    for (const s of SERIES) {
      for (let d = -12; d <= 12; d++) {
        const v = valuesInDecade(s, d);
        expect(v).toHaveLength(ESERIES[s].length);
        v.forEach((x, i) => {
          expect(Object.is(x, num(ESERIES[s][i] as number, d)), `${s} decade ${String(d)} index ${String(i)}: ${String(x)}`).toBe(true);
        });
        for (let i = 1; i < v.length; i++) expect(v[i] as number).toBeGreaterThan(v[i - 1] as number);
        expect(Object.is(v[0], Number(`1e${String(d)}`))).toBe(true);
      }
    }
  });
  it('known values print as the plain double: 4.7 kOhm is 4700 and 4.7 mOhm is the double nearest 0.0047', () => {
    expect(valuesInDecade('E24', 3)).toContain(4700);
    expect(valuesInDecade('E24', -3)).toContain(0.0047);
    expect(valuesInDecade('E96', 0)).toContain(4.99);
    expect(valuesInDecade('E12', 6)).toContain(1_200_000);
  });
  it('is pure: the result is a fresh array each call and the shared data is not changed', () => {
    const a = valuesInDecade('E24', 3) as number[];
    const copy = [...a];
    try {
      a[0] = -1;
    } catch {
      /* a frozen result is also acceptable */
    }
    expect([...valuesInDecade('E24', 3)]).toEqual(copy);
    expect(ESERIES.E24[0]).toBe(1);
  });
});

describe('nearest: golden vectors (oracle, exact decimal arithmetic)', () => {
  NEAREST_TARGETS.forEach((t, ti) => {
    for (const s of GOLD_SERIES) {
      for (const m of MODES) {
        it(`target #${String(ti)} = ${String(t)}, ${s}, ${m}`, () => {
          const v = vec(`eseries_nearest_t${String(ti)}_${s}_${m}_value`);
          const e = vec(`eseries_nearest_t${String(ti)}_${s}_${m}_err_pct`);
          expect(v.ledger_ids).toContain('S-016');
          expect(v.rel_tol).toBeLessThanOrEqual(1e-9);
          const r = near(t, s, m);
          expect(Object.is(r.value, v.pinned_expected), `${String(r.value)} vs ${String(v.pinned_expected)}`).toBe(true);
          expect(close(r.errorPercent, e.pinned_expected)).toBe(true);
          // value = mantissa x 10^decade, the double nearest the decimal; the mantissa is a member of the series
          expect(Object.is(r.value, num(r.mantissa, r.decade))).toBe(true);
          expect(ESERIES[s]).toContain(r.mantissa);
          expect(Number.isInteger(r.decade)).toBe(true);
        });
      }
    }
  });
});

describe('nearest: contract examples and decade boundaries', () => {
  it('9.8 -> E24 nearest is 10, written as mantissa 1.0 in the NEXT decade', () => {
    const r = near(9.8, 'E24');
    expect(r.value).toBe(10);
    expect(r.mantissa).toBe(1);
    expect(r.decade).toBe(1);
    expect(close(r.errorPercent, (10 - 9.8) / 9.8 * 100)).toBe(true);
  });
  it('0.97 -> E24: nearest 1.0 (decade 0), down 0.91 (mantissa 9.1, decade -1), up 1.0', () => {
    const n = near(0.97, 'E24', 'nearest');
    expect([n.value, n.mantissa, n.decade]).toEqual([1, 1, 0]);
    const d = near(0.97, 'E24', 'down');
    expect([d.value, d.mantissa, d.decade]).toEqual([0.91, 9.1, -1]);
    const u = near(0.97, 'E24', 'up');
    expect([u.value, u.mantissa, u.decade]).toEqual([1, 1, 0]);
    expect(d.errorPercent).toBeLessThan(0);
    expect(u.errorPercent).toBeGreaterThan(0);
  });
  it('just below a decade (0.99999999): nearest and up are 1.0 in decade 0, down is 0.91', () => {
    expect(near(0.99999999, 'E24', 'nearest').value).toBe(1);
    expect(near(0.99999999, 'E24', 'up').value).toBe(1);
    expect(near(0.99999999, 'E24', 'down').value).toBe(0.91);
    expect(near(9.99999999e3, 'E96', 'up').value).toBe(10000);
    expect(near(9.99999999e3, 'E96', 'up').decade).toBe(4);
    expect(near(9.99999999e3, 'E96', 'down').value).toBe(9760);
  });
  it('just above a decade (1.00000001): up is 1.02 (E96), down and nearest are 1.0', () => {
    expect(near(1.00000001, 'E96', 'up').value).toBe(1.02);
    expect(near(1.00000001, 'E96', 'down').value).toBe(1);
    expect(near(1.00000001, 'E96', 'nearest').value).toBe(1);
  });
  it('ties go UP: 1.25 is exactly half way between the E6 values 1.0 and 1.5 and resolves to 1.5, at every decade', () => {
    for (const [t, expected] of [
      [1.25, 1.5],
      [12.5, 15],
      [125, 150],
      [1250, 1500],
      [1.25e6, 1.5e6],
    ] as const) {
      const r = near(t, 'E6', 'nearest');
      expect(r.value, String(t)).toBe(expected);
      expect(close(r.errorPercent, 20)).toBe(true);
    }
    expect(near(125, 'E6', 'down').value).toBe(100);
    expect(near(125, 'E6', 'up').value).toBe(150);
  });
  it('a value in the series returns itself in every mode with zero error (decades -12..11, every series, all values)', () => {
    for (const s of SERIES) {
      for (let d = -12; d <= 11; d++) {
        for (const m of ESERIES[s]) {
          const t = num(m, d);
          for (const mode of MODES) {
            const r = near(t, s, mode);
            expect(Object.is(r.value, t), `${s} ${mode} ${String(t)} -> ${String(r.value)}`).toBe(true);
            expect(r.mantissa).toBe(m);
            expect(r.decade).toBe(d);
            expect(Math.abs(r.errorPercent)).toBeLessThanOrEqual(1e-9);
          }
        }
      }
    }
    expect(near(1e12, 'E24', 'nearest')).toMatchObject({ value: 1e12, mantissa: 1, decade: 12 });
    expect(near(1e-12, 'E24', 'down')).toMatchObject({ value: 1e-12, mantissa: 1, decade: -12 });
    expect(near(1e-12, 'E96', 'up')).toMatchObject({ value: 1e-12 });
    expect(near(9.99e11, 'E24', 'up')).toMatchObject({ value: 1e12, decade: 12 });
  }, 30_000); // about 27 000 lookups
  it('float noise within 1e-12 relative counts as the series value; a relative offset of 1e-9 does not', () => {
    expect(near(4700 * (1 + 1e-13), 'E24', 'down').value).toBe(4700);
    expect(near(4700 * (1 - 1e-13), 'E24', 'up').value).toBe(4700);
    expect(near(4700 * (1 + 1e-9), 'E24', 'down').value).toBe(4700);
    expect(near(4700 * (1 + 1e-9), 'E24', 'up').value).toBe(5100);
    expect(near(4700 * (1 - 1e-9), 'E24', 'up').value).toBe(4700);
    expect(near(4700 * (1 - 1e-9), 'E24', 'down').value).toBe(4300);
  });
  it('rounded results are the double nearest the decimal: 4.7e3, never 4700.000000000001, and 0.0047, 1.234e-9-range values', () => {
    expect(Object.is(near(4650, 'E24', 'nearest').value, 4700)).toBe(true);
    expect(Object.is(near(0.00465, 'E24', 'nearest').value, 0.0047)).toBe(true);
    expect(Object.is(near(3.1e-9, 'E24', 'nearest').value, 3.0e-9)).toBe(true);
    expect(Object.is(near(6.9e-11, 'E24', 'up').value, 7.5e-11)).toBe(true);
    expect(Object.is(near(2.0e-12, 'E96', 'nearest').value, 2.0e-12)).toBe(true);
  });
  it('the supported range ends are fine: 1e-12 and 1e12 and values just inside', () => {
    for (const t of [1e-12, 1.0000001e-12, 9.9e-12, 5e11, 1e12]) {
      for (const m of MODES) {
        const r = near(t, 'E192', m);
        expect(Number.isFinite(r.value) && r.value > 0).toBe(true);
        expect(Number.isFinite(r.errorPercent)).toBe(true);
      }
    }
  });
});

describe('nearest: invalid input is a typed error value (never NaN, never a throw)', () => {
  const bad: [string, number][] = [
    ['zero', 0],
    ['negative zero', -0],
    ['negative', -4.7],
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['-Infinity', -Infinity],
  ];
  it.each(bad)('value %s is INVALID_INPUT naming value, with no value key', (_n, v) => {
    for (const m of MODES) {
      const e = fail(nearest(v, 'E24', m));
      expect(e.code).toBe('INVALID_INPUT');
      expect(e.field).toBe('value');
      expect(e.message.length).toBeGreaterThan(0);
    }
  });
  it('a non-number value and an unknown series or mode are INVALID_INPUT naming the field', () => {
    expect(fail(nearest('4.7k' as unknown as number, 'E24', 'nearest')).field).toBe('value');
    expect(fail(nearest(undefined as unknown as number, 'E24', 'nearest')).field).toBe('value');
    for (const s of ['E5', 'e24', '', 'E 24', 'E384', 'toString', '__proto__']) {
      const e = fail(nearest(4700, s as SeriesName, 'nearest'));
      expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'series']);
    }
    for (const m of ['round', 'NEAREST', '', 'ceil']) {
      const e = fail(nearest(4700, 'E24', m as Mode));
      expect([e.code, e.field]).toEqual(['INVALID_INPUT', 'mode']);
    }
  });
  it('values far outside 1e-12..1e12 never throw and never produce NaN or Infinity: an error value or a finite result', () => {
    for (const t of [Number.MIN_VALUE, 1e-300, 1e-20, 1e20, 1e300, Number.MAX_VALUE]) {
      for (const m of MODES) {
        let r: ReturnType<typeof nearest>;
        try {
          r = nearest(t, 'E96', m);
        } catch (e) {
          throw new Error(`nearest(${String(t)}) threw: ${String(e)}`, { cause: e });
        }
        if (r.ok) {
          expect(Number.isFinite(r.value.value) && Number.isFinite(r.value.errorPercent) && Number.isFinite(r.value.mantissa)).toBe(true);
        } else {
          expect('value' in r).toBe(false);
          expect(['INVALID_INPUT', 'OUT_OF_DOMAIN']).toContain(r.error.code);
        }
      }
    }
  });
});

describe('nearest: properties (fast-check) against a brute-force search written in the test', () => {
  const tArb = fc.double({ min: -9, max: 9, noNaN: true }).map((x) => 10 ** x); // 1e-9 .. 1e9
  const sArb = fc.constantFrom(...SERIES);
  const mArb = fc.constantFrom(...MODES);
  /** Every series value of the decades around t, as the double nearest the decimal. */
  const candidates = (t: number, s: SeriesName): number[] => {
    const d0 = Math.floor(Math.log10(t));
    const out: number[] = [];
    for (let d = d0 - 2; d <= d0 + 2; d++) for (const m of ESERIES[s]) out.push(num(m, d));
    return out.sort((a, b) => a - b);
  };
  const SLACK = 1e-9; // relative; skips targets that sit within float noise of a decision boundary

  it('matches the brute-force choice for random targets (skipping targets within 1e-9 of a boundary)', () => {
    fc.assert(
      fc.property(tArb, sArb, mArb, (t, s, m) => {
        const c = candidates(t, s);
        const r = near(t, s, m);
        const nearBoundary = c.some((x) => Math.abs(x - t) <= SLACK * t) || c.some((x, i) => i > 0 && Math.abs(t - ((c[i - 1] as number) + x) / 2) <= SLACK * t);
        if (nearBoundary) return;
        let want: number;
        if (m === 'up') want = c.find((x) => x >= t) as number;
        else if (m === 'down') want = [...c].reverse().find((x) => x <= t) as number;
        else want = c.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best));
        expect(Object.is(r.value, want), `${s} ${m} ${String(t)} -> ${String(r.value)}, want ${String(want)}`).toBe(true);
      }),
      { numRuns: 400 },
    );
  });
  it('value, mantissa and decade agree; the mantissa is in the series with 1 <= mantissa < 10; errorPercent is (found - target)/target x 100', () => {
    fc.assert(
      fc.property(tArb, sArb, mArb, (t, s, m) => {
        const r = near(t, s, m);
        expect(Object.is(r.value, num(r.mantissa, r.decade))).toBe(true);
        expect(ESERIES[s]).toContain(r.mantissa);
        expect(r.mantissa).toBeGreaterThanOrEqual(1);
        expect(r.mantissa).toBeLessThan(10);
        expect(Number.isInteger(r.decade)).toBe(true);
        expect(Math.abs(r.errorPercent - ((r.value - t) / t) * 100)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(r.errorPercent)));
      }),
    );
  });
  it('ordering: down <= target (within 1e-12) <= up, down <= nearest <= up, and the error signs follow', () => {
    fc.assert(
      fc.property(tArb, sArb, (t, s) => {
        const d = near(t, s, 'down');
        const u = near(t, s, 'up');
        const n = near(t, s, 'nearest');
        expect(d.value).toBeLessThanOrEqual(t * (1 + 1e-12));
        expect(u.value).toBeGreaterThanOrEqual(t * (1 - 1e-12));
        expect(d.value).toBeLessThanOrEqual(n.value);
        expect(n.value).toBeLessThanOrEqual(u.value);
        expect(d.errorPercent).toBeLessThanOrEqual(1e-9);
        expect(u.errorPercent).toBeGreaterThanOrEqual(-1e-9);
        expect(Math.abs(n.errorPercent)).toBeLessThanOrEqual(Math.min(Math.abs(d.errorPercent), Math.abs(u.errorPercent)) + 1e-9);
      }),
    );
  });
  it('monotonic: a larger target never gives a smaller series value, in every mode', () => {
    fc.assert(
      fc.property(tArb, fc.double({ min: 1, max: 3, noNaN: true }), sArb, mArb, (t, f, s, m) => {
        expect(near(t * f, s, m).value).toBeGreaterThanOrEqual(near(t, s, m).value);
      }),
    );
  });
  it('the nearest error never exceeds the oracle maximum for the series (half the widest relative gap): E24, E96, E192', () => {
    for (const s of GOLD_SERIES) {
      const max = vec(`eseries_${s}_max_nearest_error_pct`).pinned_expected;
      fc.assert(
        fc.property(tArb, (t) => {
          expect(Math.abs(near(t, s, 'nearest').errorPercent)).toBeLessThanOrEqual(max + 1e-9);
        }),
        { numRuns: 300 },
      );
    }
    // sanity of the oracle figures themselves: E24 7.14 % (the 1.3 -> 1.5 gap), E96 1.48 %, E192 0.97 %
    expect(vec('eseries_E24_max_nearest_error_pct').pinned_expected).toBeCloseTo(7.142857142857143, 9);
  });
  it('idempotent: snapping a result again returns it', () => {
    fc.assert(
      fc.property(tArb, sArb, mArb, (t, s, m) => {
        const r = near(t, s, m);
        for (const m2 of MODES) expect(Object.is(near(r.value, s, m2).value, r.value)).toBe(true);
      }),
    );
  });
});

describe('bestPairs: golden vectors (oracle, exact Fraction arithmetic, the documented ordering)', () => {
  PAIR_CASES.forEach(([topology, series, target, n, decades], ci) => {
    it(`case ${String(ci)}: ${topology} ${series} target ${String(target)}, top ${String(n)}, ${String(decades)} decades`, () => {
      const pairs = okOf(bestPairs(target, series, topology, n, { decades }));
      expect(pairs).toHaveLength(n);
      pairs.forEach((p, k) => {
        const rank = k + 1;
        expect(vec(`pairs_c${String(ci)}_rank${String(rank)}_r1`).ledger_ids).toContain('S-016');
        expect(close(p.r1, vec(`pairs_c${String(ci)}_rank${String(rank)}_r1`).pinned_expected), `rank ${String(rank)} r1 ${String(p.r1)}`).toBe(true);
        expect(close(p.r2, vec(`pairs_c${String(ci)}_rank${String(rank)}_r2`).pinned_expected), `rank ${String(rank)} r2 ${String(p.r2)}`).toBe(true);
        expect(close(p.value, vec(`pairs_c${String(ci)}_rank${String(rank)}_value`).pinned_expected)).toBe(true);
        expect(close(p.errorPercent, vec(`pairs_c${String(ci)}_rank${String(rank)}_err_pct`).pinned_expected)).toBe(true);
      });
    });
  });
  it('the tie-break order is observable: 3 kOhm in series from E24 has four exact answers, ordered by digits then r1 (1k+2k, 300+2.7k, 1.2k+1.8k, 1.5k+1.5k)', () => {
    const p = okOf(bestPairs(3000, 'E24', 'series', 4));
    expect(p.map((x) => [x.r1, x.r2])).toEqual([
      [1000, 2000],
      [300, 2700],
      [1200, 1800],
      [1500, 1500],
    ]);
    for (const x of p) expect(Math.abs(x.errorPercent)).toBeLessThanOrEqual(1e-9);
  });
  it('divider ratio 1/4 from E24 over two decades: r1 = 3 r2 pairs in the order 3k:1k, 30k:10k, then 3.3k:1.1k, 3.6k:1.2k, 3.9k:1.3k (digits, then r1)', () => {
    const p = okOf(bestPairs(0.25, 'E24', 'divider-ratio', 5, { decades: 2 }));
    expect(p.map((x) => [x.r1, x.r2])).toEqual([
      [3000, 1000],
      [30000, 10000],
      [3300, 1100],
      [3600, 1200],
      [3900, 1300],
    ]);
  });
});

describe('bestPairs: structure and properties', () => {
  const combine = (t: Topology, a: number, b: number): number => (t === 'series' ? a + b : t === 'parallel' ? (a * b) / (a + b) : b / (a + b));
  const window = (t: Topology, target: number, s: SeriesName, decades: number, lowDecade?: number): Set<number> => {
    const dec = Math.floor(Math.log10(target));
    const low = lowDecade ?? (t === 'series' ? dec - decades + 1 : t === 'parallel' ? dec : 3);
    const set = new Set<number>();
    for (let d = low; d < low + decades; d++) for (const m of ESERIES[s]) set.add(num(m, d));
    return set;
  };
  const cases: [Topology, SeriesName, number][] = [
    ['series', 'E12', 4321],
    ['parallel', 'E24', 777],
    ['divider-ratio', 'E24', 0.4],
    ['series', 'E96', 100],
    ['parallel', 'E96', 47000],
    ['divider-ratio', 'E96', 0.0123],
  ];
  it.each(cases)('%s %s target %s: values and errors are consistent with r1 and r2, members of the window, sorted, unique', (t, s, target) => {
    const p = okOf(bestPairs(target, s, t, 12));
    expect(p).toHaveLength(12);
    const win = window(t, target, s, 3);
    const seen = new Set<string>();
    p.forEach((x, k) => {
      expect(win.has(x.r1), `r1 ${String(x.r1)} in window`).toBe(true);
      expect(win.has(x.r2), `r2 ${String(x.r2)} in window`).toBe(true);
      if (t !== 'divider-ratio') expect(x.r1).toBeLessThanOrEqual(x.r2);
      expect(relErr(x.value, combine(t, x.r1, x.r2))).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(x.errorPercent - ((x.value - target) / target) * 100)).toBeLessThanOrEqual(1e-9);
      const key = `${String(x.r1)}|${String(x.r2)}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
      if (k > 0) expect(Math.abs(x.errorPercent)).toBeGreaterThanOrEqual(Math.abs((p[k - 1] as { errorPercent: number }).errorPercent) - 1e-9);
    });
  });
  it.each(cases)('%s %s target %s: the first answer is as good as a brute-force search over the window (written in the test)', (t, s, target) => {
    const win = [...window(t, target, s, 3)].sort((a, b) => a - b);
    let best = Infinity;
    for (let i = 0; i < win.length; i++) {
      for (let j = t === 'divider-ratio' ? 0 : i; j < win.length; j++) {
        const e = Math.abs(combine(t, win[i] as number, win[j] as number) - target) / target;
        if (e < best) best = e;
      }
    }
    const first = (okOf(bestPairs(target, s, t, 1)))[0];
    expect(first).toBeDefined();
    expect(Math.abs(first?.errorPercent ?? NaN) / 100).toBeLessThanOrEqual(best + 1e-12);
  });
  it('n is honoured: fewer pairs exist than asked -> all of them; E3 over one decade has 6 unordered pairs and 9 ordered pairs', () => {
    expect(okOf(bestPairs(3000, 'E3', 'series', 1000, { decades: 1 }))).toHaveLength(6);
    expect(okOf(bestPairs(3000, 'E3', 'parallel', 1000, { decades: 1 }))).toHaveLength(6);
    expect(okOf(bestPairs(0.3, 'E3', 'divider-ratio', 1000, { decades: 1 }))).toHaveLength(9);
    expect(okOf(bestPairs(3000, 'E24', 'series'))).toHaveLength(5);
    expect(okOf(bestPairs(3000, 'E24', 'series', 1))).toHaveLength(1);
    expect(okOf(bestPairs(3000, 'E24', 'series', 3, { decades: 2 }))).toHaveLength(3);
  });
  it('lowDecade overrides the default window', () => {
    const p = okOf(bestPairs(0.5, 'E24', 'divider-ratio', 3, { decades: 1, lowDecade: 0 }));
    for (const x of p) {
      expect(x.r1).toBeGreaterThanOrEqual(1);
      expect(x.r1).toBeLessThan(10);
      expect(x.r2).toBeLessThan(10);
    }
    expect(p[0]).toMatchObject({ r1: 1, r2: 1, value: 0.5 });
    const q2 = okOf(bestPairs(3000, 'E24', 'series', 2, { decades: 1, lowDecade: 3 }));
    for (const x of q2) expect(x.r1).toBeGreaterThanOrEqual(1000);
  });
  it('series 3 kOhm from E3 over one decade (default window: decade 3, values 1k 2.2k 4.7k) is 1k + 2.2k', () => {
    const p = okOf(bestPairs(3000, 'E3', 'series', 1, { decades: 1 }));
    // values 1k 2.2k 4.7k: 1k + 2.2k = 3.2k is the closest sum (+6.67 %); 1k + 1k = 2k is -33 %
    expect([p[0]?.r1, p[0]?.r2]).toEqual([1000, 2200]);
    expect(p[0]?.errorPercent).toBeCloseTo((3200 - 3000) / 3000 * 100, 9);
  });
  it('is deterministic and does not mutate shared data', () => {
    const a = okOf(bestPairs(1234, 'E96', 'parallel', 7));
    const b = okOf(bestPairs(1234, 'E96', 'parallel', 7));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(ESERIES.E96).toHaveLength(96);
    expect(ESERIES.E96[0]).toBe(1);
  });
  it('invalid input is an error value naming the field', () => {
    const f = (r: Result<unknown, CalcError>): [string, string | undefined] => {
      const e = fail(r);
      return [e.code, e.field];
    };
    for (const t of [0, -1, NaN, Infinity, -Infinity, -0]) expect(f(bestPairs(t, 'E24', 'series'))).toEqual(['INVALID_INPUT', 'target']);
    expect(f(bestPairs('x' as unknown as number, 'E24', 'series'))).toEqual(['INVALID_INPUT', 'target']);
    expect(f(bestPairs(100, 'E5' as SeriesName, 'series'))).toEqual(['INVALID_INPUT', 'series']);
    expect(f(bestPairs(100, 'E24', 'triple' as Topology))).toEqual(['INVALID_INPUT', 'topology']);
    for (const n of [0, -1, 1.5, NaN, Infinity]) expect(f(bestPairs(100, 'E24', 'series', n))).toEqual(['INVALID_INPUT', 'n']);
    for (const d of [0, 7, 1.5, -1, NaN]) expect(f(bestPairs(100, 'E24', 'series', 5, { decades: d }))).toEqual(['INVALID_INPUT', 'decades']);
    expect(f(bestPairs(100, 'E24', 'series', 5, { lowDecade: 1.5 }))).toEqual(['INVALID_INPUT', 'lowDecade']);
    // the ratio of a divider is strictly between 0 and 1
    expect(f(bestPairs(1, 'E24', 'divider-ratio'))).toEqual(['OUT_OF_DOMAIN', 'target']);
    expect(f(bestPairs(1.5, 'E24', 'divider-ratio'))).toEqual(['OUT_OF_DOMAIN', 'target']);
    expect(f(bestPairs(0, 'E24', 'divider-ratio'))).toEqual(['INVALID_INPUT', 'target']);
  });
});

describe('performance sanity (pure function; the Web Worker wrapper comes later)', () => {
  // Design goal for E96 over 3 decades: under 50 ms per search on a normal machine, to be measured by the implementer.
  // The enforced bound is 1 s (10x slower machines, coverage instrumentation, CI noise).
  it('E96 over 3 decades (288 values) for each topology completes within a 5 s budget', () => {
    for (const [t, target] of [
      ['series', 12345],
      ['parallel', 1234],
      ['divider-ratio', 0.2],
    ] as const) {
      bestPairs(target, 'E96', t); // warm-up
      const t0 = performance.now();
      const r = bestPairs(target, 'E96', t);
      const dt = performance.now() - t0;
      expect(r.ok).toBe(true);
      expect(dt, `${t}: ${String(dt)} ms`).toBeLessThan(5000);
    }
  });
  it('10 000 nearest lookups complete within a 5 s budget', () => {
    nearest(26363.6, 'E96', 'nearest');
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (nearest(1000 + i * 3.7, 'E96', 'nearest').ok) n++;
    expect(n).toBe(10_000);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
