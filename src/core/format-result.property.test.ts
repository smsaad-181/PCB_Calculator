/** Safe-direction properties of the headline formatters (gate G1-a). Exact comparisons, no tolerance, except the stated float guard on percent. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatDesignValue, formatMargin, formatResult, formatUtilisation } from './format-result';
import type { DesignDirection, DesignValue, ElementResult } from './result';
import { DIM, parseQuantity, q, type AccuracyClass, type Dim, type DisplayPrefs, type Quantity } from './units';

const CLASSES: AccuracyClass[] = ['exact', 'analytical', 'empirical', 'estimate'];
const PREFS: DisplayPrefs[] = [
  { length: 'mm', temperature: 'C', area: 'mm2' },
  { length: 'mil', temperature: 'F', area: 'mil2' },
  { length: 'um', temperature: 'K', area: 'mm2' },
];
const RUNS = { numRuns: 400 };

const accuracyClass = fc.constantFrom(...CLASSES);
const prefs = fc.constantFrom(...PREFS);

/** [dim, min decade, max decade] of SI magnitudes. */
const DIMS: ReadonlyArray<readonly [Dim, number, number]> = [
  [DIM.LENGTH, -6, 0],
  [DIM.CURRENT, -9, 4],
  [DIM.VOLTAGE, -9, 4],
  [DIM.RESISTANCE, -6, 9],
  [DIM.POWER, -9, 6],
];

/** Positive quantities: log-uniform, plus on-grid decimals (n x 10^k) that stress float-noise snapping. */
const positiveQuantity: fc.Arbitrary<Quantity> = fc.oneof(
  fc
    .tuple(fc.integer({ min: 0, max: DIMS.length - 1 }), fc.double({ min: 0, max: 1, noNaN: true }))
    .map(([i, t]) => {
      const [dim, lo, hi] = DIMS[i] as readonly [Dim, number, number];
      return q(10 ** (lo + t * (hi - lo)), dim);
    }),
  fc
    .tuple(fc.integer({ min: 0, max: DIMS.length - 1 }), fc.integer({ min: 1, max: 99999 }), fc.integer({ min: -3, max: 1 }))
    .map(([i, n, k]) => {
      const [dim, lo] = DIMS[i] as readonly [Dim, number, number];
      return q(n * 10 ** (lo + 1 + k), dim);
    }),
);

const signedQuantity: fc.Arbitrary<Quantity> = fc.tuple(positiveQuantity, fc.boolean()).map(([x, neg]) => (neg ? q(-x.si, x.dim) : x));

/** SI value of the primary half of printed text (before the dual ' (' part), ignoring a leading '+'. */
function primarySi(text: string, dim: Dim): number {
  const head = (text.split(' (')[0] as string).replace(/^\+/, '');
  const r = parseQuantity(head, dim);
  if (!r.ok) throw new Error(`unparseable "${head}" from "${text}"`);
  return r.value.si;
}

function noBadTokens(text: string): void {
  expect(text).not.toMatch(/NaN|Infinity/);
}

function designValue(direction: DesignDirection, x: Quantity, factor: number): DesignValue {
  return { name: 'x', direction, calculated: x, recommended: q(x.si * factor, x.dim), derating: { factor, rationale: 'p' } };
}

describe('formatResult directions', () => {
  it('min-requirement and prediction never print below the SI value', () => {
    fc.assert(
      fc.property(positiveQuantity, accuracyClass, prefs, fc.constantFrom('min-requirement' as const, 'prediction' as const), (x, c, p, bound) => {
        const s = formatResult({ value: x, bound }, { accuracyClass: c, prefs: p });
        noBadTokens(s);
        expect(primarySi(s, x.dim)).toBeGreaterThanOrEqual(x.si);
      }),
      RUNS,
    );
  });
  it('max-capacity never prints above the SI value', () => {
    fc.assert(
      fc.property(positiveQuantity, accuracyClass, prefs, (x, c, p) => {
        const s = formatResult({ value: x, bound: 'max-capacity' }, { accuracyClass: c, prefs: p });
        noBadTokens(s);
        expect(primarySi(s, x.dim)).toBeLessThanOrEqual(x.si);
      }),
      RUNS,
    );
  });
});

describe('formatDesignValue directions', () => {
  it('min-requirement prints both values at or above, max-limit at or below', () => {
    fc.assert(
      fc.property(positiveQuantity, accuracyClass, prefs, fc.double({ min: 1, max: 3, noNaN: true }), fc.double({ min: 0.1, max: 1, noNaN: true }), (x, c, p, up, down) => {
        const hi = designValue('min-requirement', x, up);
        const lo = designValue('max-limit', x, down);
        for (const which of ['calculated', 'recommended'] as const) {
          const a = formatDesignValue(hi, which, { accuracyClass: c, prefs: p });
          const b = formatDesignValue(lo, which, { accuracyClass: c, prefs: p });
          noBadTokens(a);
          noBadTokens(b);
          expect(primarySi(a, x.dim)).toBeGreaterThanOrEqual(hi[which].si);
          expect(primarySi(b, x.dim)).toBeLessThanOrEqual(lo[which].si);
        }
      }),
      RUNS,
    );
  });
});

describe('formatMargin', () => {
  it('a printed margin never exceeds the true margin; sign and over-limit text are consistent', () => {
    fc.assert(
      fc.property(signedQuantity, accuracyClass, prefs, (m, c, p) => {
        const limit = q(Math.abs(m.si) * 10, m.dim);
        const e: ElementResult = {
          id: 'e',
          name: 'E',
          kind: 'trace',
          load: q(limit.si - m.si, m.dim),
          limit,
          utilisation: (limit.si - m.si) / limit.si,
          margin: m,
        };
        const s = formatMargin(e, { accuracyClass: c, prefs: p });
        noBadTokens(s);
        expect(primarySi(s, m.dim)).toBeLessThanOrEqual(m.si);
        expect(s.startsWith(m.si < 0 ? '-' : '+')).toBe(true);
        expect(s.includes('over limit')).toBe(m.si < 0);
      }),
      RUNS,
    );
  });
});

describe('formatUtilisation', () => {
  it('never prints below the true percent; under-limit never prints 100 or more', () => {
    const u = fc.oneof(
      fc.double({ min: 0, max: 5, noNaN: true }),
      fc.double({ min: 0.99, max: 1, noNaN: true }),
      fc.integer({ min: 0, max: 5000 }).map((n) => n / 1000),
    );
    fc.assert(
      fc.property(u, (v) => {
        const s = formatUtilisation(v);
        noBadTokens(s);
        expect(s).toMatch(/^\d+(\.\d+)? %$/);
        const printed = Number(s.replace(' %', ''));
        // 4 ulp guard only for the binary rounding of v * 100 itself; the direction claim is otherwise exact.
        expect(printed).toBeGreaterThanOrEqual(v * 100 * (1 - 4 * Number.EPSILON));
        if (v < 1) expect(printed).toBeLessThan(100);
      }),
      { numRuns: 1000 },
    );
  });
  it('is monotone: a larger utilisation never prints smaller', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 3, noNaN: true }), fc.double({ min: 0, max: 3, noNaN: true }), (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(Number(formatUtilisation(lo).replace(' %', ''))).toBeLessThanOrEqual(Number(formatUtilisation(hi).replace(' %', '')));
      }),
      RUNS,
    );
  });
});
