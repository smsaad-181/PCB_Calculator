import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { LEDGER } from '../../data/ledger';
import { nearest } from '../../eseries';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';
import { TOL, allText, err, expectError, expectNoClaimWording, has, okOf, primaries, res, si, vec, vectors, warningText } from '../circuit-test-utils';

// Phase 1 task 8 slice 2, calculator 2 of 4: LED series resistor. TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py: led_design; vectors led_c<i>_<series>_<key> in
// docs/golden-vectors.json) or from the relation restated below: R = (Vs - N Vf)/If, snapped UP to the series, I' = (Vs - N Vf)/R'.
// Vf values are TEST values, not LED datasheet values. Nothing here verifies ledger S-016 (PAYWALLED-USER-MUST-VERIFY).
//
// CONTRACT: Inputs { vs, vf (ONE LED), current (target), nLeds? (default 1), series? ('none' default, E6..E192), resistorRating? }.
//  Results always: resistor (primary, min-requirement), led current (prediction), current error vs target (signed fraction, nominal),
//  voltage across resistor, power in resistor, power in each led, power in all leds, source power, current change per 0.1 V Vf shift
//  per led; plus ideal resistor with a series; total forward voltage when N > 1; utilisation and margin only with a rating.

const V = (n: number): Quantity => (Number.isFinite(n) ? q(n, DIM.VOLTAGE) : ({ si: n, dim: DIM.VOLTAGE } as Quantity));
const A = (n: number): Quantity => (Number.isFinite(n) ? q(n, DIM.CURRENT) : ({ si: n, dim: DIM.CURRENT } as Quantity));
const W = (n: number): Quantity => (Number.isFinite(n) ? q(n, DIM.POWER) : ({ si: n, dim: DIM.POWER } as Quantity));
const ok = (i: Inputs) => okOf(compute, i);
const bad = (i: unknown, code: string, field?: string): string => expectError((x: unknown) => compute(x as Inputs), i, code, field);

type Series = 'none' | 'E12' | 'E24' | 'E96' | 'E192';
const SERIES: Series[] = ['none', 'E12', 'E24', 'E96', 'E192'];
// Mirrors tools/reference/ref_calcs.py LED_CASES: (vs, vf, n, if)
const LED_CASES: [number, number, number, number][] = [[5, 2.1, 1, 0.01], [3.3, 1.8, 1, 0.02], [12, 3.2, 3, 0.02], [24, 2, 4, 0.015], [5, 2, 1, 0.01]];
const KEYS: [string, string, string][] = [
  ['r', 'ohm', 'resistor'],
  ['i', 'A', 'led current'],
  ['err', 'frac', 'current error vs target'],
  ['p_r', 'W', 'power in resistor'],
  ['p_led', 'W', 'power in each led'],
  ['p_leds', 'W', 'power in all leds'],
  ['p_src', 'W', 'source power'],
  ['di_per_100mV', 'A', 'current change per 0.1 V Vf shift per led'],
];

describe('golden vectors (oracle)', () => {
  it('vectors loaded: S-019 VERIFIED without a series, S-019 + S-016 PAYWALLED with one, tolerance 1e-9', () => {
    const own = vectors.filter((v) => v.name.startsWith('led_c'));
    expect(own.length).toBe(5 * (9 + 4 * 8));
    for (const v of own) {
      const none = v.name.includes('_none_');
      expect(v.ledger_ids, v.name).toEqual(none ? ['S-019'] : ['S-019', 'S-016']);
      expect(v.status, v.name).toBe(none ? 'VERIFIED' : 'PAYWALLED-USER-MUST-VERIFY');
      expect(v.rel_tol).toBeLessThanOrEqual(TOL);
    }
  });
  LED_CASES.forEach(([vs, vf, n, i], ci) => {
    for (const s of SERIES) {
      it(`case ${String(ci)} (Vs ${String(vs)}, Vf ${String(vf)} x ${String(n)}, If ${String(i)}) series ${s}`, () => {
        const r = ok({ vs: V(vs), vf: V(vf), current: A(i), nLeds: n, series: s });
        const tag = `led_c${String(ci)}_${s}`;
        for (const [key, unit, name] of KEYS) {
          expect(err(si(r, name), vec(`${tag}_${key}_${unit}`).pinned_expected), `${tag} ${name}`).toBeLessThanOrEqual(TOL);
        }
        if (s === 'none') expect(err(si(r, 'resistor'), vec(`${tag}_ideal_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
        else expect(err(si(r, 'ideal resistor'), vec(`led_c${String(ci)}_none_ideal_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
        expect(primaries(r)).toEqual(['resistor']);
        expect(res(r, 'resistor').bound).toBe('min-requirement');
        expect(res(r, 'led current').bound).toBe('prediction');
        expect(res(r, 'power in resistor').bound).toBe('prediction');
        expect(res(r, 'current error vs target').bound).toBe('nominal');
        expect(r.dataStatus).toBe(s === 'none' ? 'VERIFIED' : 'PAYWALLED');
        expect(r.reference.ledgerIds).toEqual(s === 'none' ? ['S-019'] : ['S-019', 'S-016']);
        // rounding up never exceeds the target current
        if (s !== 'none') expect(si(r, 'led current')).toBeLessThanOrEqual(i * (1 + 2e-12));
      });
    }
  });
});

describe('hand-checkable worked example', () => {
  it('5 V supply, Vf 2.1 V, 10 mA: R = 2.9 V / 10 mA = 290 ohm; E24 rounds up to 300 ohm; I = 2.9/300 = 9.667 mA (-3.33 %); P(R) = 28.03 mW; P(LED) = 20.30 mW; source 48.33 mW', () => {
    const exact = ok({ vs: V(5), vf: V(2.1), current: A(0.01) });
    expect(err(si(exact, 'resistor'), 290)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(si(exact, 'current error vs target'))).toBeLessThan(1e-12);
    const r = ok({ vs: V(5), vf: V(2.1), current: A(0.01), series: 'E24' });
    expect(si(r, 'resistor')).toBe(300);
    expect(err(si(r, 'led current'), 2.9 / 300)).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, 'current error vs target'), 2.9 / 300 / 0.01 - 1)).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, 'power in resistor'), (2.9 / 300) ** 2 * 300)).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, 'power in each led'), (2.1 * 2.9) / 300)).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, 'source power'), (5 * 2.9) / 300)).toBeLessThanOrEqual(1e-12);
    expect(allText(r)).toMatch(/-3\.333 %/);
  });
  it('3 LEDs of 3.2 V on 12 V at 20 mA: R = (12 - 9.6) / 0.02 = 120 ohm, a series value (stays 120); P(R) = 48 mW; all LEDs 192 mW; source 240 mW', () => {
    const r = ok({ vs: V(12), vf: V(3.2), current: A(0.02), nLeds: 3, series: 'E24' });
    expect(si(r, 'resistor')).toBe(120);
    expect(err(si(r, 'power in resistor'), 0.048)).toBeLessThanOrEqual(1e-9);
    expect(err(si(r, 'power in all leds'), 0.192)).toBeLessThanOrEqual(1e-9);
    expect(err(si(r, 'source power'), 0.24)).toBeLessThanOrEqual(1e-9);
    expect(err(si(r, 'total forward voltage'), 9.6)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(si(r, 'current error vs target'))).toBeLessThanOrEqual(1e-9);
  });
  it('sensitivity: 0.1 V of Vf shift per LED changes the current by N x 0.1 / R (one LED, 300 ohm: 0.333 mA)', () => {
    const r = ok({ vs: V(5), vf: V(2.1), current: A(0.01), series: 'E24' });
    expect(err(si(r, 'current change per 0.1 V Vf shift per led'), 0.1 / 300)).toBeLessThanOrEqual(1e-12);
  });
});

describe('contract details', () => {
  it('a stock value that is exactly the ideal value stays (float noise never moves it up): 300 ohm for 3 V at 10 mA stays 300 in E24; E96 has no 3.00 (301) and E12 none (330)', () => {
    const base = { vs: V(5), vf: V(2), current: A(0.01) };
    expect(si(ok({ ...base, series: 'E24' }), 'resistor')).toBe(300);
    expect(si(ok({ ...base, series: 'E96' }), 'resistor')).toBe(301);
    expect(si(ok({ ...base, series: 'E12' }), 'resistor')).toBe(330);
  });
  it('rounding up gives a current below the target and a negative signed error (or zero)', () => {
    for (const s of ['E6', 'E12', 'E24', 'E48', 'E96', 'E192'] as const) {
      const r = ok({ vs: V(5), vf: V(2.1), current: A(0.0137), series: s });
      expect(si(r, 'current error vs target')).toBeLessThanOrEqual(0);
      expect(si(r, 'resistor')).toBeGreaterThanOrEqual(si(r, 'ideal resistor') * (1 - 1e-12));
    }
  });
  it('no typical Vf is assumed: vf is a required input echoed as user-supplied', () => {
    const r = ok({ vs: V(5), vf: V(2.1), current: A(0.01) });
    const vf = r.inputs.find((i) => i.name === 'vf');
    expect(vf?.source).toBe('user');
    expect(vf?.sourceDetail).toContain('no typical value is assumed');
    expect(r.inputs.every((i) => i.source === 'user')).toBe(true);
    expect(r.confidence.level).toBe('high');
    expect(r.warnings.some((w) => w.code === 'VF_NOT_CONSTANT')).toBe(true);
    expect(warningText(r)).toContain('not constant');
  });
  it('without a rating the resistor power is not checked and says so; no utilisation or margin results', () => {
    const r = ok({ vs: V(5), vf: V(2.1), current: A(0.01) });
    expect(r.warnings.some((w) => w.code === 'RESISTOR_RATING_NOT_CHECKED')).toBe(true);
    expect(has(r, 'resistor power utilisation')).toBe(false);
    expect(has(r, 'resistor power margin')).toBe(false);
  });
  it('with a rating: utilisation = P/rating (prediction), margin = rating - P (max-capacity); over the rating is a warning', () => {
    // 290 ohm exact, 10 mA: P = 29 mW
    const fine = ok({ vs: V(5), vf: V(2.1), current: A(0.01), resistorRating: W(0.125) });
    expect(err(si(fine, 'resistor power utilisation'), 0.029 / 0.125)).toBeLessThanOrEqual(1e-9);
    expect(err(si(fine, 'resistor power margin'), 0.125 - 0.029)).toBeLessThanOrEqual(1e-9);
    expect(res(fine, 'resistor power utilisation').bound).toBe('prediction');
    expect(res(fine, 'resistor power margin').bound).toBe('max-capacity');
    expect(fine.warnings.some((w) => w.code === 'RESISTOR_POWER_MARGIN' && w.severity === 'info')).toBe(true);
    expect(warningText(fine)).toContain('No derating is applied');
    const over = ok({ vs: V(5), vf: V(2.1), current: A(0.01), resistorRating: W(0.02) });
    expect(si(over, 'resistor power margin')).toBeLessThan(0);
    expect(si(over, 'resistor power utilisation')).toBeGreaterThan(1);
    expect(over.warnings.some((w) => w.code === 'RESISTOR_POWER' && w.severity === 'warning')).toBe(true);
    expect(over.inputs.some((i) => i.name === 'resistorRating')).toBe(true);
  });
  it('N LEDs: total forward voltage is a result only when N > 1, and every LED power is per LED and in total', () => {
    expect(has(ok({ vs: V(5), vf: V(2.1), current: A(0.01) }), 'total forward voltage')).toBe(false);
    const r = ok({ vs: V(24), vf: V(2), current: A(0.015), nLeds: 4 });
    expect(err(si(r, 'power in all leds'), 4 * si(r, 'power in each led'))).toBeLessThanOrEqual(1e-12);
    expect(r.assumptions.join(' ')).toContain('4 identical LEDs');
  });
  it('assumptions mention the S-016 list status when snapping and the Vf and tolerance caveats always', () => {
    const t = allText(ok({ vs: V(5), vf: V(2.1), current: A(0.01), series: 'E24' }));
    expect(t).toContain('S-016');
    expect(t).toContain('PAYWALLED-USER-MUST-VERIFY');
    expect(t).toContain('rounded UP');
    const plain = allText(ok({ vs: V(5), vf: V(2.1), current: A(0.01) }));
    expect(plain).toContain('not a stock value');
    expect(plain).toContain('Vf spread');
  });
  it('snapped results are not high confidence (S-016 PAYWALLED shows through the rule-based score)', () => {
    const r = ok({ vs: V(5), vf: V(2.1), current: A(0.01), series: 'E96' });
    expect(r.confidence.level).toBe('medium');
    expect(r.confidence.score).toBe(2);
    expect(r.confidence.reasons.join(' ')).toContain('PAYWALLED');
  });
  it('implausible inputs are flagged and rate low, never an error: Vf 500 V, 20 A, or R below 0.1 ohm', () => {
    expect(ok({ vs: V(900), vf: V(500), current: A(0.01) }).confidence.level).toBe('low');
    expect(ok({ vs: V(5), vf: V(2), current: A(20) }).confidence.level).toBe('low');
    const tiny = ok({ vs: V(5), vf: V(2), current: A(100) });
    expect(tiny.validityChecks.filter((c) => !c.ok).length).toBeGreaterThanOrEqual(2);
  });
  it('steps are labelled, non-empty and finite; no design values and no envelope', () => {
    const r = ok({ vs: V(5), vf: V(2.1), current: A(0.01), series: 'E24' });
    expect(r.steps.length).toBeGreaterThanOrEqual(5);
    for (const s of r.steps) {
      expect(s.label.trim().length).toBeGreaterThan(0);
      expect(s.expr.trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(s.value.si)).toBe(true);
    }
    expect(r.designValues).toEqual([]);
    expect(r.envelope).toBeUndefined();
  });
});

describe('errors are values (guards)', () => {
  const base = { vs: V(5), vf: V(2.1), current: A(0.01) };
  it('Vs <= N x Vf is rejected with a clear message (equal, below, and the series total)', () => {
    expect(bad({ ...base, vs: V(2.1) }, 'OUT_OF_DOMAIN', 'vs')).toContain('Vs <= N × Vf');
    bad({ ...base, vs: V(2) }, 'OUT_OF_DOMAIN', 'vs');
    const m = bad({ vs: V(9.6), vf: V(3.2), current: A(0.02), nLeds: 3 }, 'OUT_OF_DOMAIN', 'vs');
    expect(m).toContain('total forward voltage');
    bad({ vs: V(12), vf: V(3.2), current: A(0.02), nLeds: 4 }, 'OUT_OF_DOMAIN', 'vs');
  });
  it('vs, vf, current and rating reject zero, negative, NaN, Infinity and the wrong dimension', () => {
    for (const x of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      bad({ ...base, vs: V(x) }, 'INVALID_INPUT', 'vs');
      bad({ ...base, vf: V(x) }, 'INVALID_INPUT', 'vf');
      bad({ ...base, current: A(x) }, 'INVALID_INPUT', 'current');
      bad({ ...base, resistorRating: W(x) }, 'INVALID_INPUT', 'resistorRating');
    }
    bad({ ...base, vs: A(5) }, 'DIMENSION', 'vs');
    bad({ ...base, vf: A(2) }, 'DIMENSION', 'vf');
    bad({ ...base, current: V(0.01) }, 'DIMENSION', 'current');
    bad({ ...base, resistorRating: V(1) }, 'DIMENSION', 'resistorRating');
    bad({ ...base, current: q(Number.MIN_VALUE / 2, DIM.CURRENT) }, 'INVALID_INPUT', 'current');
  });
  it('missing required inputs are named', () => {
    bad({ vf: V(2), current: A(0.01) }, 'INVALID_INPUT', 'vs');
    expect(bad({ vs: V(5), current: A(0.01) }, 'INVALID_INPUT', 'vf')).toContain('no typical value');
    bad({ vs: V(5), vf: V(2) }, 'INVALID_INPUT', 'current');
    bad(null, 'INVALID_INPUT', 'inputs');
    bad(7, 'INVALID_INPUT', 'inputs');
  });
  it('series and nLeds are validated', () => {
    bad({ ...base, series: 'E7' }, 'INVALID_INPUT', 'series');
    bad({ ...base, series: 24 }, 'INVALID_INPUT', 'series');
    for (const n of [0, -1, 1.5, 1001, Number.NaN, '3']) bad({ ...base, nLeds: n }, 'INVALID_INPUT', 'nLeds');
  });
  it('overflow and underflow are error values', () => {
    bad({ vs: V(Number.MAX_VALUE), vf: V(1), current: A(1e-300) }, 'OUT_OF_DOMAIN');
    bad({ vs: V(5), vf: V(2), current: A(Number.MAX_VALUE) , nLeds: 1 }, 'OUT_OF_DOMAIN');
    bad({ vs: V(1e300), vf: V(1), current: A(1e-5), series: 'E24' }, 'OUT_OF_DOMAIN', 'current');
    bad({ vs: V(5), vf: V(2), current: A(1e300), series: 'E24' }, 'OUT_OF_DOMAIN');
  });
});

describe('properties (fast-check)', () => {
  const dec = (lo: number, hi: number) => fc.double({ min: lo, max: hi, noNaN: true }).map((e) => 10 ** e);
  const vfA = dec(-0.3, 1); // 0.5 .. 10 V
  const iA = dec(-4, -1); // 0.1 mA .. 100 mA
  const extra = dec(-0.5, 1.5); // headroom above N Vf: 0.3 .. 30 V
  const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

  it('exact mode: the resistor carries exactly the target current (1e-12) and Vs = N Vf + I R', () => {
    fc.assert(
      fc.property(vfA, extra, iA, fc.integer({ min: 1, max: 6 }), (vf, head, i, n) => {
        const vs = n * vf + head;
        const r = ok({ vs: V(vs), vf: V(vf), current: A(i), nLeds: n });
        expect(rel(si(r, 'led current'), i)).toBeLessThanOrEqual(1e-9);
        expect(rel(n * vf + si(r, 'led current') * si(r, 'resistor'), vs)).toBeLessThanOrEqual(1e-9);
        expect(rel(si(r, 'source power'), vs * si(r, 'led current'))).toBeLessThanOrEqual(1e-12);
        // energy balance: source = resistor + LEDs
        expect(rel(si(r, 'source power'), si(r, 'power in resistor') + si(r, 'power in all leds'))).toBeLessThanOrEqual(1e-9);
      }),
      { numRuns: 300 },
    );
  });
  it('stock mode: the resistor is a series value at or above the ideal; the current never exceeds the target; the error is within the series gap', () => {
    fc.assert(
      fc.property(vfA, extra, iA, fc.constantFrom('E12' as const, 'E24' as const, 'E96' as const, 'E192' as const), (vf, head, i, s) => {
        const r = ok({ vs: V(vf + head), vf: V(vf), current: A(i), series: s });
        const used = si(r, 'resistor');
        const ideal = si(r, 'ideal resistor');
        expect(used).toBeGreaterThanOrEqual(ideal * (1 - 1e-12));
        const n = nearest(used, s, 'nearest');
        expect(n.ok && n.value.value === used).toBe(true);
        expect(si(r, 'led current')).toBeLessThanOrEqual(i * (1 + 2e-12));
        // eseries.ts treats a computed ideal within 1e-12 (relative) of a series value as that value, so the current may exceed the target by that noise only
        expect(si(r, 'current error vs target')).toBeLessThanOrEqual(2e-12);
        // widest relative gap in each list bounds the shortfall: 1 - lower/upper (E12 1.2 -> 1.5, E24 1.3 -> 1.5), with margin
        const gap = { E12: 0.21, E24: 0.14, E96: 0.04, E192: 0.02 }[s];
        expect(si(r, 'current error vs target')).toBeGreaterThan(-gap);
      }),
      { numRuns: 300 },
    );
  });
  it('monotonic: a larger target current needs a smaller or equal resistor; a larger Vf needs a smaller resistor; a larger supply needs a larger one', () => {
    fc.assert(
      fc.property(vfA, extra, iA, fc.double({ min: 1.01, max: 3, noNaN: true }), (vf, head, i, f) => {
        const base = si(ok({ vs: V(vf + head), vf: V(vf), current: A(i) }), 'resistor');
        expect(si(ok({ vs: V(vf + head), vf: V(vf), current: A(i * f) }), 'resistor')).toBeLessThan(base);
        expect(si(ok({ vs: V(vf + head + 1), vf: V(vf), current: A(i) }), 'resistor')).toBeGreaterThan(base);
        expect(si(ok({ vs: V(vf + head + 0.5), vf: V(vf + 0.25), current: A(i) }), 'resistor')).toBeLessThan(si(ok({ vs: V(vf + head + 0.5), vf: V(vf), current: A(i) }), 'resistor'));
      }),
    );
  });
  it('scaling: doubling the headroom and the current keeps R; doubling only the current halves it (1e-12)', () => {
    fc.assert(
      fc.property(vfA, extra, iA, (vf, head, i) => {
        const a = si(ok({ vs: V(vf + head), vf: V(vf), current: A(i) }), 'resistor');
        const b = si(ok({ vs: V(vf + 2 * head), vf: V(vf), current: A(2 * i) }), 'resistor');
        const c = si(ok({ vs: V(vf + head), vf: V(vf), current: A(2 * i) }), 'resistor');
        expect(rel(b, a)).toBeLessThanOrEqual(1e-12);
        expect(rel(c, a / 2)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
  it('no NaN or Infinity anywhere for in-range inputs; deterministic; inputs never mutated', () => {
    fc.assert(
      fc.property(vfA, extra, iA, (vf, head, i) => {
        const input: Inputs = { vs: V(vf + head), vf: V(vf), current: A(i), series: 'E24', resistorRating: W(0.25) };
        const before = JSON.stringify(input);
        expect(JSON.stringify(compute(input))).toBe(JSON.stringify(compute(input)));
        expect(JSON.stringify(input)).toBe(before);
        const r = ok(input);
        for (const o of r.results) expect(Number.isFinite(o.value.si)).toBe(true);
        for (const s of r.steps) expect(Number.isFinite(s.value.si)).toBe(true);
      }),
    );
  });
});

describe('wording, performance, meta', () => {
  it('no compliance or readiness claim anywhere in a result', () => {
    expectNoClaimWording(ok({ vs: V(5), vf: V(2.1), current: A(0.01), series: 'E24', resistorRating: W(0.125), nLeds: 1 }));
  });
  it('10 000 computes take under 1 s in total', () => {
    const input: Inputs = { vs: V(5), vf: V(2.1), current: A(0.01), series: 'E96' };
    compute(input);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(input).ok) n++;
    expect(n).toBe(10_000);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  it('meta: formula text, ledger rows exist, accuracy class, no tolerance inputs', () => {
    for (const s of ['R = (Vs − N × Vf) / If', 'If′ = (Vs − N × Vf) / R′', 'P(LED) = Vf × If′']) expect(meta.formula).toContain(s);
    const r = ok({ vs: V(5), vf: V(2.1), current: A(0.01) });
    expect(r.formula).toBe(meta.formula);
    expect(r.method).toBe(meta.method);
    expect(meta.id).toBe('led-resistor');
    expect(meta.accuracyClass).toBe('analytical');
    expect([...meta.ledgerIds]).toEqual(['S-019', 'S-016']);
    for (const id of meta.ledgerIds) expect(LEDGER.some((x) => x.id === id), id).toBe(true);
    expect(meta.toleranceInputs).toEqual([]);
  });
});
