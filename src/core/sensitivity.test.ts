import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q } from './units';
import type { Quantity } from './units';
import type { CalcOutcome, CalcResult } from './result';
import { MAX_CORNER_INPUTS, analyse } from './sensitivity';
import type { OutputSpec, PerturbSpec } from './sensitivity';

// The helper has no physics, so these tests use analytic functions with known answers.

interface In {
  a: Quantity;
  b: Quantity;
  c?: Quantity;
  t?: Quantity;
}
const dl = (x: number): Quantity => q(x, DIM.DIMENSIONLESS);
const K = (x: number): Quantity => q(x, DIM.ABS_TEMPERATURE);

/** Minimal CalcResult carrying only what the helper reads (results and validityChecks). */
function wrap(values: Record<string, number>, failing: string[] = []): CalcOutcome {
  const r = {
    results: Object.entries(values).map(([name, v]) => ({ name, value: dl(v), role: 'primary', bound: 'nominal' })),
    validityChecks: failing.map((name) => ({ name, ok: false, detail: '' })),
  } as unknown as CalcResult;
  return { ok: true, value: r };
}
const fail = (m: string): CalcOutcome => ({ ok: false, error: { code: 'OUT_OF_DOMAIN', message: m } });
const rel = (input: string, minus: number, plus = minus): PerturbSpec => ({ input, kind: 'relative', minus, plus });
const out = (name: string, sensitivity = true): OutputSpec => ({ name, sensitivity });
const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

const powerLaw = (i: In): CalcOutcome => wrap({ y: i.a.si ** 1.5 * i.b.si ** -0.725 });
const base: In = { a: dl(2), b: dl(3) };

describe('sensitivities against analytic power laws', () => {
  it('equal the exponents (central difference in ln space)', () => {
    const r = must(analyse(powerLaw, base, [rel('a', 0.1), rel('b', 0.2)], [out('y')])).value;
    const s = r.sensitivities['y'] ?? [];
    expect(s.find((x) => x.input === 'a')?.value).toBeCloseTo(1.5, 9);
    expect(s.find((x) => x.input === 'b')?.value).toBeCloseTo(-0.725, 9);
    expect(s.every((x) => x.scheme === 'central')).toBe(true);
  });
  it('is independent of the tolerance and reported even for a zero tolerance', () => {
    const r = must(analyse(powerLaw, base, [rel('a', 0), rel('b', 0.5)], [out('y')])).value;
    expect(r.sensitivities['y']?.find((x) => x.input === 'a')?.value).toBeCloseTo(1.5, 9);
    expect(r.activeInputs).toEqual(['b']);
  });
  it('absolute inputs give the semi-log sensitivity per SI unit: y = exp(0.02 T) gives 0.02', () => {
    const f = (i: In): CalcOutcome => wrap({ y: Math.exp(0.02 * (i.t as Quantity).si) });
    const b = { ...base, t: K(300) };
    const r = must(analyse(f, b, [{ input: 't', kind: 'absolute', minus: 5, plus: 5 }], [out('y')])).value;
    expect(r.sensitivities['y']?.[0]?.value).toBeCloseTo(0.02, 7);
  });
  it('a non-positive output uses the linear difference; a zero output is unavailable', () => {
    const neg = must(analyse((i: In) => wrap({ y: -(i.a.si ** 2) }), base, [rel('a', 0.1)], [out('y')])).value;
    expect(neg.sensitivities['y']?.[0]?.value).toBeCloseTo(2, 6);
    expect(neg.sensitivities['y']?.[0]?.note).toMatch(/not positive/);
    const zero = must(analyse(() => wrap({ y: 0 }), base, [rel('a', 0.1)], [out('y')])).value;
    expect(zero.sensitivities['y']?.[0]?.value).toBeNull();
    expect(zero.sensitivities['y']?.[0]?.scheme).toBe('unavailable');
  });
  it('uses a one-sided difference, flagged, where one side is rejected (boundary), and is unavailable when both are', () => {
    const edge = (limit: number) => (i: In): CalcOutcome => (i.a.si > limit ? fail('above the boundary') : wrap({ y: i.a.si ** 2 }));
    const r = must(analyse(edge(2), base, [rel('a', 0.1)], [out('y')])).value;
    const e = r.sensitivities['y']?.[0];
    expect(e?.scheme).toBe('backward');
    expect(e?.value).toBeCloseTo(2, 3);
    expect(e?.note).toMatch(/one-sided/);
    const both = must(analyse((i: In) => (i.a.si === 2 ? wrap({ y: 1 }) : fail('x')), base, [rel('a', 0.1)], [out('y')])).value;
    expect(both.sensitivities['y']?.[0]?.scheme).toBe('unavailable');
  });
  it('sensitivity is skipped for outputs flagged sensitivity: false', () => {
    const r = must(analyse(powerLaw, base, [rel('a', 0.1)], [out('y', false)])).value;
    expect(r.sensitivities['y']).toBeUndefined();
  });
});

describe('corner envelope', () => {
  it('equals the closed form for a product (monotone) function', () => {
    // y = a^1.5 * b^-0.725 is increasing in a and decreasing in b.
    const r = must(analyse(powerLaw, base, [rel('a', 0.1, 0.2), rel('b', 0.3, 0.05)], [out('y')])).value;
    const e = r.envelopes[0];
    const f = (a: number, b: number): number => a ** 1.5 * b ** -0.725;
    expect(e?.typ).toBeCloseTo(f(2, 3), 12);
    expect(e?.min).toBeCloseTo(f(2 * 0.9, 3 * 1.05), 12);
    expect(e?.max).toBeCloseTo(f(2 * 1.2, 3 * 0.7), 12);
    expect(e?.monotone).toBe(true);
    expect(e?.label).toBe('corners-exact-for-monotone');
    expect(r.cornerCount).toBe(4);
    expect(r.incomplete).toEqual([]);
  });
  it('asymmetric tolerances are honoured and typ is the nominal evaluation', () => {
    const r = must(analyse((i: In) => wrap({ y: i.a.si * 10 }), base, [rel('a', 0.5, 0.25)], [out('y')])).value.envelopes[0];
    expect(r?.min).toBeCloseTo(10, 12);
    expect(r?.typ).toBeCloseTo(20, 12);
    expect(r?.max).toBeCloseTo(25, 12);
  });
  it('zero tolerance gives a point envelope equal to the nominal value', () => {
    const r = must(analyse(powerLaw, base, [rel('a', 0), rel('b', 0)], [out('y')])).value;
    expect(r.cornerCount).toBe(0);
    expect(r.envelopes[0]?.min).toBe(r.envelopes[0]?.typ);
    expect(r.envelopes[0]?.max).toBe(r.envelopes[0]?.typ);
  });
  it('an absolute tolerance perturbs by +- the SI amount', () => {
    const f = (i: In): CalcOutcome => wrap({ y: (i.t as Quantity).si });
    const r = must(analyse(f, { ...base, t: K(300) }, [{ input: 't', kind: 'absolute', minus: 5, plus: 10 }], [out('y', false)])).value.envelopes[0];
    expect([r?.min, r?.typ, r?.max]).toEqual([295, 300, 310]);
  });
  it('flags a non-monotone output and labels it corners-only', () => {
    // y = (a - 2)^2 has its minimum at the nominal a = 2 and equal corners: not monotone along the axis.
    const r = must(analyse((i: In) => wrap({ y: (i.a.si - 2) ** 2 + 1 }), base, [rel('a', 0.5)], [out('y')])).value.envelopes[0];
    expect(r?.monotone).toBe(false);
    expect(r?.nonMonotoneInputs).toEqual(['a']);
    expect(r?.label).toBe('corners-only');
    // the midpoint/nominal probe is part of the extremes, so min is the true minimum 1 here
    expect(r?.min).toBeCloseTo(1, 12);
    expect(r?.max).toBeCloseTo(2, 12);
  });
  it('a function monotone in one input and not in another is flagged for the right input only', () => {
    const f = (i: In): CalcOutcome => wrap({ y: i.a.si * ((i.b.si - 3) ** 2 + 1) });
    const r = must(analyse(f, base, [rel('a', 0.1), rel('b', 0.5)], [out('y', false)])).value.envelopes[0];
    expect(r?.nonMonotoneInputs).toEqual(['b']);
  });
  it('is monotone-labelled for several outputs independently', () => {
    const f = (i: In): CalcOutcome => wrap({ up: i.a.si, wiggle: (i.a.si - 2) ** 2 });
    const r = must(analyse(f, base, [rel('a', 0.5)], [out('up', false), out('wiggle', false)])).value.envelopes;
    expect(r.find((e) => e.output === 'up')?.monotone).toBe(true);
    expect(r.find((e) => e.output === 'wiggle')?.monotone).toBe(false);
  });
  it('min <= typ <= max for random tolerances of a random power law', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: 0, max: 0.9, noNaN: true }),
        fc.double({ min: 0, max: 3, noNaN: true }),
        fc.double({ min: 0, max: 0.9, noNaN: true }),
        fc.double({ min: 0, max: 3, noNaN: true }),
        (pa, pb, ma, xa, mb, xb) => {
          const f = (i: In): CalcOutcome => wrap({ y: i.a.si ** pa * i.b.si ** pb });
          const r = must(analyse(f, base, [rel('a', ma, xa), rel('b', mb, xb)], [out('y')])).value.envelopes[0];
          expect(r?.min).not.toBeNull();
          expect(r?.min as number).toBeLessThanOrEqual((r?.typ as number) * (1 + 1e-12));
          expect(r?.typ as number).toBeLessThanOrEqual((r?.max as number) * (1 + 1e-12));
          expect(r?.monotone).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('failure handling (never throws)', () => {
  it('a rejected corner is reported, and the bound it determines is omitted, not clamped', () => {
    // y = a, increasing; the a+ corner (a > 2.1) is rejected, so the max is omitted but the min is kept.
    const f = (i: In): CalcOutcome => (i.a.si > 2.1 ? fail('out of range at a high a') : wrap({ y: i.a.si }));
    const r = must(analyse(f, base, [rel('a', 0.1, 0.2)], [out('y', false)])).value;
    expect(r.incomplete.some((m) => /envelope incomplete at corner a\+/.test(m) && /out of range at a high a/.test(m))).toBe(true);
    const e = r.envelopes[0];
    expect(e?.max).toBeNull();
    expect(e?.min).toBeCloseTo(1.8, 12);
    expect(e?.typ).toBe(2);
  });
  it('a rejected corner that cannot set a bound (mixed signs) leaves both bounds', () => {
    // y = a / b: the corner a+, b+ is neither the min nor the max.
    const f = (i: In): CalcOutcome => (i.a.si > 2.1 && i.b.si > 3.1 ? fail('mixed corner rejected') : wrap({ y: i.a.si / i.b.si }));
    const r = must(analyse(f, base, [rel('a', 0.1), rel('b', 0.1)], [out('y', false)])).value;
    expect(r.incomplete.length).toBeGreaterThan(0);
    expect(r.envelopes[0]?.min).not.toBeNull();
    expect(r.envelopes[0]?.max).not.toBeNull();
  });
  it('a rejected min-side corner omits only the min', () => {
    const f = (i: In): CalcOutcome => (i.a.si < 1.9 && i.b.si > 3.1 ? fail('bad corner') : wrap({ y: i.a.si / i.b.si }));
    const r = must(analyse(f, base, [rel('a', 0.1), rel('b', 0.1)], [out('y', false)])).value;
    expect(r.envelopes[0]?.min).toBeNull();
    expect(r.envelopes[0]?.max).not.toBeNull();
  });
  it('a non-monotone output with a rejected corner omits both bounds', () => {
    const f = (i: In): CalcOutcome => (i.a.si > 2.9 ? fail('rejected') : wrap({ y: (i.a.si - 2) ** 2 }));
    const r = must(analyse(f, base, [rel('a', 0.5)], [out('y', false)])).value;
    expect(r.envelopes[0]?.min).toBeNull();
    expect(r.envelopes[0]?.max).toBeNull();
  });
  it('a compute that throws is reported as a failure value, not thrown', () => {
    const boom = (i: In): CalcOutcome => {
      if (i.a.si > 2.05) throw new Error('boom');
      return wrap({ y: i.a.si });
    };
    const r = must(analyse(boom, base, [rel('a', 0.1)], [out('y', false)])).value;
    expect(r.incomplete.join(' ')).toMatch(/boom/);
    const top = analyse(() => { throw new Error('always'); }, base, [rel('a', 0.1)], [out('y')]);
    expect(top.ok).toBe(false);
  });
  it('a failing nominal point is an error value', () => {
    const r = analyse(() => fail('nope'), base, [rel('a', 0.1)], [out('y')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nominal point could not be evaluated: nope/);
  });
  it('rejects bad specifications with an error value', () => {
    const bad = (p: PerturbSpec[], b: In = base): string => {
      const r = analyse(powerLaw, b, p, [out('y')]);
      expect(r.ok).toBe(false);
      return r.ok ? '' : r.error;
    };
    expect(bad([rel('a', 0.1), rel('a', 0.1)])).toMatch(/twice/);
    expect(bad([rel('zzz', 0.1)])).toMatch(/not a finite quantity/);
    expect(bad([rel('a', -0.1)])).toMatch(/finite and not negative/);
    expect(bad([rel('a', Number.NaN)])).toMatch(/finite/);
    expect(bad([rel('a', 1)])).toMatch(/below 1/);
    expect(bad([rel('a', 0.1)], { a: dl(0), b: dl(1) })).toMatch(/not positive/);
    expect(analyse(powerLaw, base, [rel('a', 0.1)], []).ok).toBe(false);
  });
  it('more than the corner limit of tolerated inputs is an error value', () => {
    const names = ['a', 'b', 'c', 't', 'd', 'e', 'f'];
    const b = Object.fromEntries(names.map((n) => [n, dl(2)]));
    const f = (): CalcOutcome => wrap({ y: 1 });
    const r = analyse(f, b, names.slice(0, MAX_CORNER_INPUTS + 1).map((n) => rel(n, 0.1)), [out('y')]);
    expect(r.ok).toBe(false);
    const okR = analyse(f, b, names.slice(0, MAX_CORNER_INPUTS).map((n) => rel(n, 0.1)), [out('y')]);
    expect(okR.ok).toBe(true);
    if (okR.ok) expect(okR.value.cornerCount).toBe(64);
  });
  it('flags corners that fail a validity check the nominal point passes', () => {
    const f = (i: In): CalcOutcome => wrap({ y: i.a.si }, i.a.si > 2.1 ? ['a in range'] : []);
    const r = must(analyse(f, base, [rel('a', 0.1, 0.2)], [out('y', false)])).value;
    expect(r.extrapolatedCorners).toContain('a+');
  });
  it('is deterministic', () => {
    const run = (): unknown => analyse(powerLaw, base, [rel('a', 0.1), rel('b', 0.2)], [out('y')]);
    expect(run()).toEqual(run());
  });
});

describe('further failure modes', () => {
  it('an output missing from the calculator result, or not finite, is an error at the nominal point or an incomplete corner', () => {
    const miss = analyse(() => wrap({ other: 1 }), base, [rel('a', 0.1)], [out('y')]);
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.error).toMatch(/result "y" is missing/);
    const nan = (i: In): CalcOutcome => {
      const o = wrap({ y: 1 });
      if (o.ok && i.a.si > 2.05) o.value.results[0] = { name: 'y', value: { si: Number.NaN, dim: DIM.DIMENSIONLESS } as Quantity, role: 'primary', bound: 'nominal' };
      return o;
    };
    const r = must(analyse(nan, base, [rel('a', 0.1)], [out('y', false)])).value;
    expect(r.incomplete.join(' ')).toMatch(/not finite/);
    expect(r.envelopes[0]?.max).toBeNull();
  });
  it('a forward one-sided difference where the lower side is rejected', () => {
    const f = (i: In): CalcOutcome => (i.a.si < 1.9999 ? fail('below the boundary') : wrap({ y: i.a.si ** 3 }));
    const r = must(analyse(f, base, [rel('a', 0.1)], [out('y')])).value;
    expect(r.sensitivities['y']?.[0]?.scheme).toBe('forward');
    expect(r.sensitivities['y']?.[0]?.value).toBeCloseTo(3, 3);
  });
  it('a thrown non-Error value is reported by its text; an overflowing perturbation is an error value', () => {
    const f = (i: In): CalcOutcome => {
      if (i.a.si > 2.05) throw 'plain string';
      return wrap({ y: i.a.si });
    };
    expect(must(analyse(f, base, [rel('a', 0.1)], [out('y', false)])).value.incomplete.join(' ')).toMatch(/plain string/);
    const huge = analyse((i: In) => wrap({ y: i.b.si }), { a: dl(1e308), b: dl(1) }, [rel('a', 0, 5)], [out('y')]);
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.error).toMatch(/analysis failed/);
  });
  it('an output that does not depend on a tolerated input has slope zero and a failing corner there changes nothing', () => {
    const f = (i: In): CalcOutcome => (i.a.si > 2.1 ? fail('a too high') : wrap({ y: i.b.si }));
    const r = must(analyse(f, base, [rel('a', 0.1), rel('b', 0.1)], [out('y', false)])).value;
    // the a+ corners fail: with b the only driver, (a+, b+) is the maximum candidate and (a+, b-) the minimum candidate
    expect(r.envelopes[0]?.max).toBeNull();
    expect(r.envelopes[0]?.min).toBeNull();
    const g = (i: In): CalcOutcome => (i.a.si > 2.1 ? fail('a too high') : wrap({ y: 5 }));
    const flat = must(analyse(g, base, [rel('a', 0.1, 0.15)], [out('y', false)])).value;
    expect(flat.envelopes[0]?.min).toBe(5);
    expect(flat.envelopes[0]?.max).toBe(5);
  });
  it('an axis end that coincides with the nominal value is one point (zero minus tolerance)', () => {
    const r = must(analyse(powerLaw, base, [rel('a', 0, 0.2)], [out('y', false)])).value;
    expect(r.envelopes[0]?.monotone).toBe(true);
    expect(r.envelopes[0]?.min).toBe(r.envelopes[0]?.typ);
  });
});
