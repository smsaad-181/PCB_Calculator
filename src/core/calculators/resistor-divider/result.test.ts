import { describe, expect, it } from 'vitest';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult, highestWarningSeverity } from '../../result';
import type { CalcResult } from '../../result';
import { formatResult } from '../../format-result';
import { compute } from './calc';
import type { Inputs } from './calc';

// Phase 1 task 8, calculator 2 (resistor divider): result contract. Exact confidence scores are pinned with their arithmetic.
// Accuracy class exact (0). Data status: S-019 (VERIFIED, 0) always; S-016 (E-series lists, PAYWALLED-USER-MUST-VERIFY, +2) ONLY when
// a series snap is used. Nothing is defaulted (series 'none' and no tolerance are not assumptions), so a plain run scores 0 (high)
// and a snapped run scores 2 (medium). Plausibility ranges are validity checks, not standards: a failure forces 'low' (2 each).
//
// CONTRACT beyond calc.test.ts:
//  - validityChecks: exactly two, always: /^vin/i ('vin up to 1000 V') and /^resistances/i ('resistances between 1 ohm and 1e9 ohm'),
//    the second covering every resistor used (r1, r2, load; the solved or snapped value included). Details say plausibility and
//    "not a standard". Each offending input is its own out-of-range entry, named r1 / r2 / load / vin, 2 points each.
//  - warnings: always exactly one info warning with code 'POWER_RATING' (message mentions the power rating); plus a 'caution' with
//    code 'LOAD_ERROR' when a load lowers Vout by more than 1 % of the unloaded Vout, message containing
//    "load changes the output by x %" (case-insensitive) with x printed to 3 significant figures. A plain run has no other warnings.
//  - reference ledger ids ['S-019'] (['S-019', 'S-016'] when a series is used); dataStatus 'VERIFIED' | 'PAYWALLED'.
//  - assumptions state the series and the snapping direction when a series is used ("E96" and "S-016" appear), and that the
//    resistors are ideal.
//  - recommendation: the fixed text below.

const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const R = (n: number): Quantity => q(n, DIM.RESISTANCE);
const frac = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);

const fwd = (vin: number, r1: number, r2: number, extra: Partial<Inputs> = {}): Inputs => ({ solveFor: 'vout', vin: V(vin), r1: R(r1), r2: R(r2), ...extra });
const solve1 = (vin: number, target: number, r2: number, extra: Partial<Inputs> = {}): Inputs => ({ solveFor: 'r1', vin: V(vin), target: V(target), r2: R(r2), ...extra });
const solve2 = (vin: number, target: number, r1: number, extra: Partial<Inputs> = {}): Inputs => ({ solveFor: 'r2', vin: V(vin), target: V(target), r1: R(r1), ...extra });

function ok(inputs: Inputs): CalcResult {
  const out = compute(inputs);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code} ${out.error.field ?? ''}: ${out.error.message}`);
  const chk = assertCalcResult(out.value);
  expect(chk.ok, chk.ok ? '' : chk.error.join('; ')).toBe(true);
  return out.value;
}
const res = (r: CalcResult, name: string) => {
  const x = r.results.find((o) => o.name === name);
  if (!x) throw new Error(`result "${name}" missing; have ${r.results.map((o) => o.name).join(', ')}`);
  return x;
};
const checkNamed = (r: CalcResult, re: RegExp) => {
  const c = r.validityChecks.find((x) => re.test(x.name));
  if (!c) throw new Error(`no validity check matching ${String(re)}; have ${r.validityChecks.map((x) => x.name).join(' | ')}`);
  return c;
};
const par = (a: number, b: number): number => (a * b) / (a + b);

const clean = fwd(12, 47e3, 10e3);
const RECOMMENDATION =
  'Values are exact for the stated inputs and ideal resistors. Check the power rating of each resistor against the dissipation shown, and use the tolerance envelope for real parts.';

describe('result metadata', () => {
  const r = ok(clean);
  it('recommendation is the fixed text, designValues is empty (a hint, not a design value)', () => {
    for (const inp of [clean, solve1(12, 3.3, 10e3, { series: 'E96' }), fwd(5, 1e3, 1e3, { load: R(1e3) })]) {
      const x = ok(inp);
      expect(x.recommendation).toBe(RECOMMENDATION);
      expect(x.designValues).toEqual([]);
    }
  });
  it('reference ledger ids: S-019 only for a plain run, S-019 and S-016 when a series is used; dataStatus VERIFIED / PAYWALLED', () => {
    expect(r.reference.ledgerIds).toEqual(['S-019']);
    expect(r.dataStatus).toBe('VERIFIED');
    expect(r.reference.standard.trim().length).toBeGreaterThan(0);
    expect(r.reference.edition.trim().length).toBeGreaterThan(0);
    for (const s of ['E24', 'E96', 'E192'] as const) {
      const x = ok(solve1(12, 3.3, 10e3, { series: s }));
      expect([...x.reference.ledgerIds].sort()).toEqual(['S-016', 'S-019']);
      expect(x.dataStatus).toBe('PAYWALLED');
    }
    const none = ok(solve1(12, 3.3, 10e3, { series: 'none' }));
    expect(none.reference.ledgerIds).toEqual(['S-019']);
    expect(none.dataStatus).toBe('VERIFIED');
  });
  it('inputs hold quantities only, all source user; series and snap are not inputs', () => {
    const x = ok(solve1(12, 3.3, 10e3, { series: 'E96', snap: 'up', load: R(1e5), tolerance: frac(0.01), loadTolerance: frac(0.02), vinTolerance: frac(0.02) }));
    expect(x.inputs.map((i) => i.name).sort()).toEqual(['load', 'loadTolerance', 'r2', 'target', 'tolerance', 'vin', 'vinTolerance']);
    for (const i of x.inputs) expect(i.source).toBe('user');
  });
  it('absent optional sections: no elements, fabProfile, exports, limitingElement, copperBasis', () => {
    expect(r.elements).toBeUndefined();
    expect(r.fabProfile).toBeUndefined();
    expect(r.exports).toBeUndefined();
    expect(r.limitingElement).toBeUndefined();
    expect(r.copperBasis).toBeUndefined();
    expect(r.envelope ?? []).toEqual([]);
  });
  it('assumptions say the resistors are ideal; with a series they name the series, the S-016 row and the direction', () => {
    expect(r.assumptions.join(' ')).toMatch(/ideal/i);
    expect(r.assumptions.join(' ')).toMatch(/S-019/);
    const x = ok(solve1(12, 3.3, 10e3, { series: 'E96', snap: 'down' }));
    const text = x.assumptions.join(' ');
    expect(text).toMatch(/E96/);
    expect(text).toMatch(/S-016/);
    expect(text).toMatch(/down/i);
    expect(x.assumptions.every((a) => a.trim().length > 0)).toBe(true);
  });
  it('steps are non-empty with finite quantities', () => {
    for (const inp of [clean, solve1(12, 3.3, 10e3, { series: 'E24', load: R(1e5) })]) {
      const x = ok(inp);
      expect(x.steps.length).toBeGreaterThan(0);
      for (const s of x.steps) {
        expect(s.label.trim().length).toBeGreaterThan(0);
        expect(s.expr.trim().length).toBeGreaterThan(0);
        expect(Number.isFinite(s.value.si)).toBe(true);
      }
    }
  });
  it('no compliance wording anywhere in the result (negated phrasings stripped)', () => {
    for (const inp of [clean, solve1(12, 3.3, 10e3, { series: 'E192', load: R(1e4), tolerance: frac(0.01) }), fwd(2000, 1, 1)]) {
      // The forbidden words are assembled from fragments so this file does not itself trip the wording audit.
      const words = ['compl' + 'iant', 'certi' + 'fied', 'conf' + 'orms'];
      const negated = new RegExp(String.raw`\b(not|no|never|neither)\b[^.]{0,40}(` + words.join('|') + ')', 'gi');
      const forbidden = new RegExp(words.join('|') + '|production.?safe', 'i');
      const text = JSON.stringify(ok(inp)).replace(negated, '');
      expect(text).not.toMatch(forbidden);
    }
  });
});

describe('warnings', () => {
  it('a plain run carries only info warnings: power rating, resistor voltage not checked, creepage not checked (PCB-5)', () => {
    const r = ok(clean);
    expect(r.warnings.map((w) => w.code)).toEqual(['POWER_RATING', 'RESISTOR_VOLTAGE_NOT_CHECKED', 'CREEPAGE_NOT_CHECKED']);
    expect(r.warnings.every((w) => w.severity === 'info')).toBe(true);
    expect(r.warnings[0]?.message).toMatch(/power rating/i);
    expect(highestWarningSeverity(r.warnings)).toBe('info');
  });
  it('the info hint is present for every mode, with a load, and with snapping', () => {
    for (const inp of [solve1(12, 3.3, 10e3), solve2(12, 3.3, 47e3, { series: 'E24' }), fwd(5, 10e3, 10e3, { load: R(1e7) })]) {
      expect(ok(inp).warnings.some((w) => w.code === 'POWER_RATING' && w.severity === 'info')).toBe(true);
    }
  });
  it('a load that lowers Vout by more than 1 % adds a caution LOAD_ERROR with the percentage (3 s.f.); a light load adds none', () => {
    // 10 k / 10 k from 5 V: RL = 300 k lowers Vout by 1.639 %, RL = 1 M by 0.4975 %, RL = 100 k by 4.762 %
    const lossPct = (rl: number): number => (1 - ((par(10e3, rl) / (10e3 + par(10e3, rl))) / 0.5)) * 100;
    for (const rl of [300e3, 100e3, 10e3]) {
      const r = ok(fwd(5, 10e3, 10e3, { load: R(rl) }));
      const w = r.warnings.filter((x) => x.code === 'LOAD_ERROR');
      expect(w, String(rl)).toHaveLength(1);
      expect(w[0]?.severity).toBe('caution');
      const m = /load changes the output by ([\d.]+) %/i.exec(w[0]?.message ?? '');
      expect(m, w[0]?.message).not.toBeNull();
      expect(Math.abs(Number(m?.[1]) - lossPct(rl)) / lossPct(rl)).toBeLessThanOrEqual(0.005);
      expect(highestWarningSeverity(r.warnings)).toBe('caution');
    }
    for (const rl of [1e6, 1e7, 1e9]) {
      const r = ok(fwd(5, 10e3, 10e3, { load: R(rl) }));
      expect(r.warnings.some((x) => x.code === 'LOAD_ERROR'), String(rl)).toBe(false);
      expect(highestWarningSeverity(r.warnings)).toBe('info');
    }
  });
  it('the load warning does not change the confidence score', () => {
    expect(ok(fwd(5, 10e3, 10e3, { load: R(100e3) })).confidence.score).toBe(0);
  });
});

describe('validity checks (plausibility ranges, not standards)', () => {
  const VIN = /^vin/i;
  const RES = /^resistances/i;
  it('always exactly two checks (vin, resistances); in range: ok, details say plausibility and not a standard', () => {
    for (const inp of [clean, solve1(12, 3.3, 10e3), fwd(5, 1e3, 1e3, { load: R(1e3) })]) {
      const r = ok(inp);
      expect(r.validityChecks).toHaveLength(2);
      for (const re of [VIN, RES]) {
        const c = checkNamed(r, re);
        expect(c.ok).toBe(true);
        expect(c.detail).toMatch(/plausib/i);
        expect(c.detail).toMatch(/not a standard/i);
      }
      expect(checkNamed(r, VIN).name).toMatch(/1000 V/);
      expect(checkNamed(r, RES).name).toMatch(/1e9/);
    }
  });
  it('boundaries are inclusive, just outside fails: vin 1000 / 1001 V; resistors 1 ohm / 0.99 ohm and 1e9 / 1.1e9 ohm (given r1, r2 and load)', () => {
    expect(checkNamed(ok(fwd(1000, 10e3, 10e3)), VIN).ok).toBe(true);
    expect(checkNamed(ok(fwd(1001, 10e3, 10e3)), VIN).ok).toBe(false);
    for (const [inp, want] of [
      [fwd(5, 1, 1e3), true],
      [fwd(5, 0.99, 1e3), false],
      [fwd(5, 1e3, 1), true],
      [fwd(5, 1e3, 0.99), false],
      [fwd(5, 1e9, 1e6), true],
      [fwd(5, 1.1e9, 1e6), false],
      [fwd(5, 1e3, 1e9), true],
      [fwd(5, 1e3, 1.1e9), false],
      [fwd(5, 1e3, 1e3, { load: R(1) }), true],
      [fwd(5, 1e3, 1e3, { load: R(0.99) }), false],
      [fwd(5, 1e3, 1e3, { load: R(1e9) }), true],
      [fwd(5, 1e3, 1e3, { load: R(1.1e9) }), false],
    ] as [Inputs, boolean][]) {
      expect(checkNamed(ok(inp), RES).ok, JSON.stringify(inp)).toBe(want);
    }
  });
  it('a failed check still returns a numeric result, forces low, scores 2 per offending input and names it in the reasons', () => {
    const cases: [Inputs, number, RegExp][] = [
      [fwd(1001, 10e3, 10e3), 2, /vin/],
      [fwd(5, 2e9, 1e6), 2, /r1/],
      [fwd(5, 1e3, 0.5), 2, /r2/],
      [fwd(5, 1e3, 1e3, { load: R(2e9) }), 2, /load/],
      [fwd(5, 2e9, 0.5), 4, /r1/], // r1 and r2 both out of range
      [fwd(1001, 2e9, 1e6), 4, /vin/], // vin and r1
    ];
    for (const [inp, score, name] of cases) {
      const r = ok(inp);
      expect(r.validityChecks.some((c) => !c.ok)).toBe(true);
      expect(r.confidence.level).toBe('low');
      expect(r.confidence.score).toBe(score);
      expect(r.confidence.reasons.join(' ')).toMatch(name);
      for (const x of r.results) expect(Number.isFinite(x.value.si)).toBe(true);
    }
    const both = ok(fwd(5, 2e9, 0.5)).confidence.reasons.join(' ');
    expect(both).toMatch(/r1/);
    expect(both).toMatch(/r2/);
  });
  it('a SOLVED resistor out of range counts under its own name: 5 V to 4.999999 V with r2 = 1 M needs r1 = 0.2 ohm', () => {
    const r = ok(solve1(5, 4.999999, 1e6));
    expect(checkNamed(r, /^resistances/i).ok).toBe(false);
    expect(r.confidence.score).toBe(2);
    expect(r.confidence.level).toBe('low');
    expect(r.confidence.reasons.join(' ')).toMatch(/r1/);
  });
  it('a snapped value is checked too: a failed range plus the PAYWALLED series row scores 2 + 2 = 4', () => {
    const r = ok(solve1(5, 4.999999, 1e6, { series: 'E24' }));
    expect(r.confidence.score).toBe(4);
    expect(r.confidence.level).toBe('low');
  });
});

describe('confidence (rule-based, exact scores)', () => {
  // Score = 2 x out-of-range + 1 x defaults + 2 x safety defaults + accuracy (exact 0) + data status (VERIFIED 0, PAYWALLED 2 only with a series).
  it('plain forward case: 0 => high; nothing is defaulted (every input source is user)', () => {
    const r = ok(clean);
    expect(r.confidence.score).toBe(0);
    expect(r.confidence.level).toBe('high');
    for (const i of r.inputs) expect(i.source).toBe('user');
  });
  it('solving for r1 or r2 without a series, with a load, a tolerance, or vinTolerance: still 0 => high', () => {
    for (const inp of [
      solve1(12, 3.3, 10e3),
      solve2(12, 3.3, 47e3),
      solve1(12, 3.3, 10e3, { series: 'none' }),
      fwd(5, 10e3, 10e3, { load: R(1e6), tolerance: frac(0.01), vinTolerance: frac(0.05) }),
    ]) {
      const r = ok(inp);
      expect(r.confidence.score).toBe(0);
      expect(r.confidence.level).toBe('high');
    }
  });
  it.each([['E24'], ['E96'], ['E192']] as const)('snapped to %s: PAYWALLED +2 => 2 => medium, and the reasons say PAYWALLED', (s) => {
    for (const snap of ['nearest', 'up', 'down'] as const) {
      const r = ok(solve1(12, 3.3, 10e3, { series: s, snap }));
      expect(r.confidence.score).toBe(2);
      expect(r.confidence.level).toBe('medium');
      expect(r.confidence.reasons.join(' ')).toMatch(/PAYWALLED/);
    }
    expect(ok(solve2(12, 3.3, 47e3, { series: s })).confidence.score).toBe(2);
  });
  it('score and level agree (0 high, 1-2 medium, 3 or more low); any failed plausibility check forces low whatever the score', () => {
    for (const inp of [clean, solve1(12, 3.3, 10e3, { series: 'E96' }), fwd(1001, 10e3, 10e3), solve1(5, 4.999999, 1e6, { series: 'E24' })]) {
      const r = ok(inp);
      const failed = r.validityChecks.some((x) => !x.ok);
      expect(r.confidence.level).toBe(failed ? 'low' : r.confidence.score === 0 ? 'high' : r.confidence.score <= 2 ? 'medium' : 'low');
    }
  });
});

describe('headline formatting never rounds against the reader (powers and current are predictions: print up)', () => {
  const PREFIX: Record<string, number> = { '': 1, m: 1e-3, µ: 1e-6, k: 1e3, M: 1e6, n: 1e-9, p: 1e-12 };
  const parse = (s: string, unit: string): number => {
    const mt = new RegExp(`^([\\d.]+(?:e[+-]?\\d+)?) ([mµkMnp]?)${unit}$`).exec(s);
    if (!mt) throw new Error(`cannot parse "${s}" as ${unit}`);
    return Number(mt[1]) * (PREFIX[mt[2] ?? ''] ?? NaN);
  };
  it('power in r1, power in r2, total power and divider current print at or above their SI values for several magnitudes', () => {
    for (const inp of [
      fwd(12, 47e3, 10e3),
      fwd(3.3, 2.2e3, 1e3, { load: R(4.7e3) }),
      fwd(24, 100e3, 6.8e3),
      fwd(48, 220e3, 4.7e3),
      fwd(5, 330, 330),
      fwd(1.8, 1e6, 2e6),
      solve1(12, 3.3, 10e3, { series: 'E96' }),
    ]) {
      const r = ok(inp);
      for (const [n, unit] of [['power in r1', 'W'], ['power in r2', 'W'], ['total power', 'W'], ['divider current', 'A']] as const) {
        const x = res(r, n);
        expect(x.bound).toBe('prediction');
        expect(parse(formatResult(x, { accuracyClass: 'exact' }), unit), n).toBeGreaterThanOrEqual(x.value.si * (1 - 1e-12));
      }
    }
  });
  it('the 12 V / 47 k / 10 k divider: current 210.5 uA, r1 dissipates 2.083 mW (hand-checkable, printed up)', () => {
    const r = ok(clean);
    expect(Math.abs(res(r, 'divider current').value.si - 12 / 57e3)).toBeLessThanOrEqual(1e-15);
    expect(Math.abs(res(r, 'power in r1').value.si - (12 / 57e3) ** 2 * 47e3)).toBeLessThanOrEqual(1e-12);
  });
});
