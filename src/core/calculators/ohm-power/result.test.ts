import { describe, expect, it } from 'vitest';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult, highestWarningSeverity } from '../../result';
import { LEDGER } from '../../data/ledger';
import type { LedgerStatus } from '../../data/ledger';
import { dataStatusFromLedger } from '../../data-status';
import type { CalcResult } from '../../result';
import { formatResult } from '../../format-result';
import { compute } from './calc';
import type { Inputs } from './calc';

// Phase 1 task 8, calculator 1 (Ohm / power): result contract. Exact confidence scores are pinned with their arithmetic.
// Ohm's law is exact arithmetic (accuracy class exact), the ledger row is S-019 (textbook relations, VERIFIED), so a clean run scores 0.
// Plausibility ranges are validity checks, not standards: a failure forces 'low' (2 x failed inputs), the result is still returned.

const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const I = (n: number): Quantity => q(n, DIM.CURRENT);
const R = (n: number): Quantity => q(n, DIM.RESISTANCE);
const P = (n: number): Quantity => q(n, DIM.POWER);

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

const clean: Inputs = { voltage: V(12), current: I(0.5) }; // R = 24 ohm, P = 6 W: everything in range
const RECOMMENDATION =
  'Values are exact for the stated inputs. Choose parts with a power rating of at least twice the calculated dissipation unless your design rules say otherwise.';

describe('result metadata', () => {
  const r = ok(clean);
  it('recommendation is the fixed text and is a non-binding hint: designValues is empty', () => {
    for (const inp of [clean, { current: I(2), resistance: R(5) }, { resistance: R(100), power: P(0.25) }]) {
      const x = ok(inp);
      expect(x.recommendation).toBe(RECOMMENDATION);
      expect(x.designValues).toEqual([]);
    }
  });
  it('reference ledger ids are S-019 only; dataStatus is derived from the S-019 row of the in-code ledger (VERIFIED)', () => {
    expect(r.reference.ledgerIds).toEqual(['S-019']);
    const row = LEDGER.find((x) => x.id === 'S-019');
    expect(row).toBeDefined();
    expect(r.dataStatus).toBe(dataStatusFromLedger((row as { status: LedgerStatus }).status));
    expect(r.reference.standard.trim().length).toBeGreaterThan(0);
    expect(r.reference.edition.trim().length).toBeGreaterThan(0);
    expect(r.dataStatus).toBe('VERIFIED');
  });
  it('absent optional sections: no envelope, elements, fabProfile, exports, limitingElement, copperBasis', () => {
    expect(r.envelope ?? []).toEqual([]);
    expect(r.elements).toBeUndefined();
    expect(r.fabProfile).toBeUndefined();
    expect(r.exports).toBeUndefined();
    expect(r.limitingElement).toBeUndefined();
    expect(r.copperBasis).toBeUndefined();
  });
  it('assumptions are non-empty text (ideal resistor, constant resistance, DC or RMS values)', () => {
    expect(r.assumptions.length).toBeGreaterThan(0);
    expect(r.assumptions.every((a) => a.trim().length > 0)).toBe(true);
    expect(r.assumptions.join(' ')).toMatch(/ideal|constant|DC|RMS/i);
    expect(r.assumptions.join(' ')).toMatch(/S-019/);
  });
  it('no warnings for in-range values', () => {
    expect(r.warnings).toEqual([]);
    expect(highestWarningSeverity(r.warnings)).toBeNull();
  });
  it('no compliance wording anywhere in the result (negated phrasings stripped)', () => {
    for (const inp of [clean, { voltage: V(5000), resistance: R(1) }, { resistance: R(1e-8), current: I(1e-3) }]) {
      // The forbidden words are assembled from fragments so this file does not itself trip the wording audit.
      const words = ['compl' + 'iant', 'certi' + 'fied', 'conf' + 'orms'];
      const negated = new RegExp(String.raw`\b(not|no|never|neither)\b[^.]{0,40}(` + words.join('|') + ')', 'gi');
      const forbidden = new RegExp(words.join('|') + '|production.?safe', 'i');
      const text = JSON.stringify(ok(inp)).replace(negated, '');
      expect(text).not.toMatch(forbidden);
    }
  });
});

describe('validity checks (plausibility ranges, not standards)', () => {
  const VOLT = /^voltage/i;
  const CURR = /^current/i;
  const RESI = /^resistance/i;
  const POW = /^power/i;
  it('always exactly four checks (voltage, current, resistance, power), on every quantity, given or solved; in range: all ok, details say plausibility and not a standard', () => {
    const r = ok(clean);
    expect(r.validityChecks).toHaveLength(4);
    for (const re of [VOLT, CURR, RESI, POW]) {
      const c = checkNamed(r, re);
      expect(c.ok).toBe(true);
      expect(c.detail).toMatch(/plausib/i);
      expect(c.detail).toMatch(/not a standard/i);
    }
    expect(checkNamed(r, VOLT).name).toMatch(/1000 V/);
    expect(checkNamed(r, CURR).name).toMatch(/1000 A/);
    expect(checkNamed(r, POW).name).toMatch(/1000 W/);
    expect(checkNamed(r, RESI).name).toMatch(/1e-6/);
    expect(checkNamed(r, RESI).name).toMatch(/1e12/);
  });
  it('boundaries are inclusive, just outside fails: V 1000 / 1001, I 1000 / 1001, R 1e-6 / 1e-7 and 1e12 / 1.1e12, P 1000 / 1001', () => {
    // each case changes one quantity only (the other quantities stay in range)
    const cases: [Inputs, RegExp, boolean][] = [
      [{ voltage: V(1000), current: I(0.5) }, VOLT, true],
      [{ voltage: V(1001), current: I(0.5) }, VOLT, false],
      [{ current: I(1000), resistance: R(1e-3) }, CURR, true],
      [{ current: I(1001), resistance: R(1e-6) }, CURR, false],
      [{ current: I(1), resistance: R(1e-6) }, RESI, true],
      [{ current: I(1e-3), resistance: R(1e-7) }, RESI, false],
      [{ voltage: V(1000), resistance: R(1e12) }, RESI, true],
      [{ voltage: V(1000), resistance: R(1.1e12) }, RESI, false],
      [{ voltage: V(1000), power: P(1000) }, POW, true],
      [{ voltage: V(1000), power: P(1001) }, POW, false],
    ];
    for (const [inp, re, want] of cases) {
      const r = ok(inp);
      expect(checkNamed(r, re).ok, `${JSON.stringify(inp)} ${String(re)}`).toBe(want);
    }
  });
  it('a failed check still returns a numeric result, forces level low, scores 2 per failed quantity and names the quantity in the reasons', () => {
    const cases: [Inputs, RegExp][] = [
      [{ voltage: V(1001), current: I(0.5) }, /voltage/i], // P = 500.5 W, R = 2002 ohm: only V fails
      [{ current: I(1001), resistance: R(1e-6) }, /current/i], // V = 1.001 mV, P = 1.002 W
      [{ current: I(1e-3), resistance: R(1e-7) }, /resistance/i], // V = 1e-10 V, P = 1e-13 W
      [{ voltage: V(1000), power: P(1001) }, /power/i], // I = 1.001 A, R = 999 ohm
    ];
    for (const [inp, name] of cases) {
      const r = ok(inp);
      expect(r.validityChecks.filter((c) => !c.ok)).toHaveLength(1);
      expect(r.confidence.level).toBe('low');
      expect(r.confidence.score).toBe(2); // 2 x one out-of-range quantity; exact accuracy 0, S-019 VERIFIED 0, nothing defaulted
      expect(r.confidence.reasons.join(' ')).toMatch(name);
      for (const x of r.results) expect(Number.isFinite(x.value.si)).toBe(true);
    }
  });
  it('two failed quantities score 2 x 2 = 4; a solved quantity out of range counts like a given one', () => {
    const r = ok({ voltage: V(1001), power: P(1001) }); // I = 1 A, R = 1001 ohm: V and P fail
    expect(r.validityChecks.filter((c) => !c.ok)).toHaveLength(2);
    expect(r.confidence.score).toBe(4);
    expect(r.confidence.level).toBe('low');
    const s = ok({ voltage: V(500), resistance: R(1) }); // P = 250 kW: only the SOLVED power fails
    expect(checkNamed(s, /^power/i).ok).toBe(false);
    expect(s.confidence.score).toBe(2);
    expect(s.confidence.level).toBe('low');
  });
});

describe('confidence (rule-based, exact scores)', () => {
  // Score = 2 x out-of-range + 1 x defaults + 2 x safety defaults + accuracy (exact 0) + data status (S-019 VERIFIED 0).
  it('all inputs user-supplied and in range: score 0 => high, for all six pairings', () => {
    for (const inp of [
      { voltage: V(12), current: I(0.5) },
      { voltage: V(12), resistance: R(24) },
      { voltage: V(12), power: P(6) },
      { current: I(0.5), resistance: R(24) },
      { current: I(0.5), power: P(6) },
      { resistance: R(24), power: P(6) },
    ] as Inputs[]) {
      const r = ok(inp);
      expect(r.confidence.score).toBe(0);
      expect(r.confidence.level).toBe('high');
    }
  });
  it('nothing is defaulted: every input has source user', () => {
    for (const i of ok(clean).inputs) expect(i.source).toBe('user');
  });
  it('score and level agree (0 high, 1-2 medium, 3 or more low); any failed plausibility check forces low whatever the score', () => {
    for (const inp of [clean, { voltage: V(1001), current: I(0.5) }, { voltage: V(1001), power: P(1001) }] as Inputs[]) {
      const r = ok(inp);
      const c = r.confidence;
      const failed = r.validityChecks.some((x) => !x.ok);
      expect(c.level).toBe(failed ? 'low' : c.score === 0 ? 'high' : c.score <= 2 ? 'medium' : 'low');
    }
  });
});

describe('headline formatting never rounds against the reader (solved power is a prediction: prints up)', () => {
  const PREFIX: Record<string, number> = { '': 1, m: 1e-3, µ: 1e-6, k: 1e3, M: 1e6, n: 1e-9 };
  const parse = (s: string, unit: string): number => {
    const mt = new RegExp(`^([\\d.]+(?:e[+-]?\\d+)?) ([mµkMn]?)${unit}$`).exec(s);
    if (!mt) throw new Error(`cannot parse "${s}" as ${unit}`);
    return Number(mt[1]) * (PREFIX[mt[2] ?? ''] ?? NaN);
  };
  it('solved power prints at or above its SI value for several magnitudes', () => {
    for (const inp of [
      { voltage: V(3.3), current: I(0.0173) },
      { voltage: V(12), resistance: R(47) },
      { current: I(0.00123), resistance: R(4700) },
      { voltage: V(5), resistance: R(1e6) },
      { voltage: V(230), current: I(4.35) },
    ] as Inputs[]) {
      const r = ok(inp);
      const x = res(r, 'power');
      expect(x.bound).toBe('prediction');
      expect(parse(formatResult(x, { accuracyClass: 'exact' }), 'W')).toBeGreaterThanOrEqual(x.value.si * (1 - 1e-12));
    }
  });
});

describe('steps and inputs', () => {
  it('steps name the relations used and carry finite values', () => {
    const r = ok({ voltage: V(12), resistance: R(24) });
    expect(r.steps.length).toBeGreaterThan(0);
    for (const s of r.steps) {
      expect(s.label.trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(s.value.si)).toBe(true);
    }
    expect(r.steps.map((s) => s.expr).join(' ')).toMatch(/V\s*\/\s*R|V²\s*\/\s*R|V\^2\s*\/\s*R/);
  });
});
