import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult, highestWarningSeverity } from '../../result';
import type { CalcResult } from '../../result';
import { formatDesignValue, formatResult } from '../../format-result';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 1 task 2: result contract of the legacy IPC-2221 trace-width calculator (Mode B only).
// Margin 1.25 and current derating 0.8 are engineering defaults, NOT values from a standard.
// The level is 'low' in every case today, because the formula source (S-001, S-010) is PAYWALLED secondary data;
// it can become 'medium' only after a human marks S-001 VERIFIED against the standard. Nothing here upgrades a ledger row.

type Layer = 'outer' | 'inner';
const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const um = (n: number): Quantity => fromUnit(n, 'um');
const mil = (n: number): Quantity => fromUnit(n, 'mil');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const dT = (n: number): Quantity => fromUnit(n, 'ddegC');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const one = (n: number): Quantity => ({ si: n, dim: DIM.DIMENSIONLESS }) as Quantity;
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

const solveWidth = (l: Layer, I: number, d: number, o: number): Inputs => ({ mode: 'B', layer: l, current: amp(I), deltaT: dT(d), copperWeight: oz(o) });
const solveCurrent = (l: Layer, w: number, d: number, o: number): Inputs => ({ mode: 'B', layer: l, width: mil(w), deltaT: dT(d), copperWeight: oz(o) });
const solveDT = (l: Layer, I: number, w: number, o: number): Inputs => ({ mode: 'B', layer: l, current: amp(I), width: mil(w), copperWeight: oz(o) });

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

const MANDATORY =
  'Legacy IPC-2221 method, for compatibility and comparison. Not a substitute for IPC-2152-based analysis. Temperature rise alone does not prove reliability.';
const RECOMMENDATION =
  'Calculated limit and recommended design value are different numbers: use the recommended value (margin shown above, an engineering default unless you set it) and confirm finished copper thickness with your fabricator.';

describe('result metadata', () => {
  const r = ok(solveWidth('outer', 3, 10, 1));
  it('result.formula === meta.formula', () => {
    expect(r.formula).toBe(meta.formula);
    expect(ok(solveWidth('inner', 3, 10, 1)).formula).toBe(meta.formula);
  });
  it('method and reference (secondary sources only; the standard was not read)', () => {
    expect(r.method).toBe('IPC-2221 legacy (KiCad-compatible)');
    expect(meta.method).toBe(r.method);
    expect(r.reference.standard).toBe('IPC-2221 (legacy curve fit; secondary sources only)');
    expect(r.reference.edition).toBe('IPC-2221B/C not read');
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-001', 'S-010', 'S-006', 'S-003']));
  });
  it('S-018 (internal traces run cooler, secondhand) is cited for inner layers only', () => {
    expect(r.reference.ledgerIds).not.toContain('S-018');
    expect(ok(solveWidth('inner', 3, 10, 1)).reference.ledgerIds).toContain('S-018');
  });
  it('meta contract', () => {
    expect(meta.id.trim().length).toBeGreaterThan(0);
    expect(meta.title.trim().length).toBeGreaterThan(0);
    expect(meta.accuracyClass).toBe('empirical');
    for (const id of ['S-001', 'S-010', 'S-006', 'S-003', 'S-018']) expect(meta.ledgerIds).toContain(id);
  });
  it('the legacy method is always labelled legacy', () => {
    expect(r.method).toMatch(/legacy/i);
    expect(r.warnings[0]?.message).toMatch(/Legacy/);
  });
  it('exactly one primary result in every solve direction', () => {
    for (const inp of [solveWidth('outer', 3, 10, 1), solveCurrent('inner', 40, 20, 1), solveDT('outer', 2, 30, 1)]) {
      expect(ok(inp).results.filter((o) => o.role === 'primary')).toHaveLength(1);
    }
  });
  it('absent optional sections: limitingElement, fabProfile, exports, elements; envelope is empty (task 9)', () => {
    expect(r.limitingElement).toBeUndefined();
    expect(r.fabProfile).toBeUndefined();
    expect(r.exports).toBeUndefined();
    expect(r.elements).toBeUndefined();
    expect(r.envelope ?? []).toEqual([]);
  });
  it('recommendation is the fixed text, calculated vs recommended stated as different numbers', () => {
    for (const inp of [solveWidth('outer', 3, 10, 1), solveCurrent('inner', 40, 20, 1), solveDT('outer', 2, 30, 1)]) {
      expect(ok(inp).recommendation).toBe(RECOMMENDATION);
    }
  });
  it('dataStatus is PAYWALLED for both layers (S-001, S-010 paywalled; S-018 UNVERIFIED does not lower it; S-003 excluded)', () => {
    expect(r.dataStatus).toBe('PAYWALLED');
    expect(ok(solveWidth('inner', 3, 10, 1)).dataStatus).toBe('PAYWALLED');
  });
});

describe('copperBasis', () => {
  it('weight input: nominal basis, layer and thickness (35 um per oz) recorded', () => {
    for (const l of ['outer', 'inner'] as const) {
      const r = ok(solveWidth(l, 3, 10, 2));
      expect(r.copperBasis?.layer).toBe(l);
      expect(r.copperBasis?.basis).toBe('nominal');
      expect(relErr(r.copperBasis?.thickness.si ?? 0, 70e-6)).toBeLessThanOrEqual(1e-12);
      expect(r.copperBasis?.weightOzFt2).toBe(2);
    }
  });
  it('thickness input: basis defaults to nominal (source default); finished and measured are kept as entered', () => {
    const d = ok({ mode: 'B', layer: 'outer', current: amp(3), deltaT: dT(10), copperThickness: um(35) });
    expect(d.copperBasis?.basis).toBe('nominal');
    for (const b of ['finished', 'measured'] as const) {
      const r = ok({ mode: 'B', layer: 'inner', current: amp(3), deltaT: dT(10), copperThickness: um(40), copperBasis: b });
      expect(r.copperBasis?.basis).toBe(b);
      expect(r.copperBasis?.layer).toBe('inner');
      expect(relErr(r.copperBasis?.thickness.si ?? 0, 40e-6)).toBeLessThanOrEqual(1e-12);
    }
  });
});

describe('inputs and assumptions', () => {
  it('every quantity input is listed with its source; defaults are marked default', () => {
    const r = ok(solveWidth('outer', 3, 10, 1));
    const src = (n: string) => r.inputs.find((i) => i.name === n)?.source;
    expect(src('current')).toBe('user');
    expect(src('deltaT')).toBe('user');
    expect(src('copperWeight')).toBe('user');
    expect(src('ambient')).toBe('default');
    expect(src('designMargin')).toBe('default');
    expect(src('currentDerating')).toBe('default');
    expect(relErr(r.inputs.find((i) => i.name === 'designMargin')?.value.si ?? 0, 1.25)).toBeLessThanOrEqual(1e-12);
    expect(relErr(r.inputs.find((i) => i.name === 'currentDerating')?.value.si ?? 0, 0.8)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(toUnit(r.inputs.find((i) => i.name === 'ambient')?.value ?? one(0), 'degC') - 25)).toBeLessThan(1e-9);
  });
  it('user-supplied optional inputs are marked user', () => {
    const r = ok({
      ...solveWidth('outer', 3, 10, 1),
      ambient: degC(40),
      designMargin: one(1.5),
      currentDerating: one(0.7),
      maxAllowedTemp: degC(105),
    });
    for (const n of ['ambient', 'designMargin', 'currentDerating', 'maxAllowedTemp']) {
      expect(r.inputs.find((i) => i.name === n)?.source).toBe('user');
    }
  });
  it('assumptions name the foil convention (nominal), the defaults used, and that margin and derating are not from a standard', () => {
    const a = ok(solveWidth('outer', 3, 10, 1)).assumptions.join(' ');
    expect(a).toMatch(/nominal-35um/);
    expect(a).toMatch(/nominal/i);
    expect(a).toMatch(/ambient/i);
    expect(a).toMatch(/25\s?(°C|degC|C)/);
    expect(a).toMatch(/1\.25/);
    expect(a).toMatch(/0\.8/);
    expect(a).toMatch(/engineering default/i);
    expect(a).toMatch(/not from a standard/i);
  });
});

describe('design values', () => {
  it('width solved: one min-requirement design value, recommended = calculated x 1.25 (default)', () => {
    const r = ok(solveWidth('outer', 3, 10, 1));
    expect(r.designValues).toHaveLength(1);
    const dv = r.designValues[0];
    expect(dv?.name).toBe('width');
    expect(dv?.direction).toBe('min-requirement');
    expect(dv?.calculated.si).toBe(res(r, 'width').value.si);
    expect(dv?.derating.factor).toBe(1.25);
    expect(relErr(dv?.recommended.si ?? 0, (dv?.calculated.si ?? 0) * 1.25)).toBeLessThanOrEqual(1e-12);
    expect(dv?.derating.rationale).toMatch(/engineering default, not from a standard/);
    expect(dv?.recommended.si).toBeGreaterThan(dv?.calculated.si ?? Infinity);
  });
  it('width solved with a user margin: factor is the user value; margin 1 gives recommended = calculated', () => {
    const r = ok({ ...solveWidth('inner', 3, 10, 1), designMargin: one(1.5) });
    expect(r.designValues[0]?.derating.factor).toBe(1.5);
    expect(relErr(r.designValues[0]?.recommended.si ?? 0, (r.designValues[0]?.calculated.si ?? 0) * 1.5)).toBeLessThanOrEqual(1e-12);
    const r1 = ok({ ...solveWidth('inner', 3, 10, 1), designMargin: one(1) });
    expect(r1.designValues[0]?.recommended.si).toBeCloseTo(r1.designValues[0]?.calculated.si ?? NaN, 15);
  });
  it('current solved: one max-limit design value, recommended = calculated x 0.8 (default)', () => {
    const r = ok(solveCurrent('outer', 50, 30, 2));
    expect(r.designValues).toHaveLength(1);
    const dv = r.designValues[0];
    expect(dv?.name).toMatch(/current/);
    expect(dv?.direction).toBe('max-limit');
    expect(dv?.calculated.si).toBe(res(r, 'current capacity').value.si);
    expect(dv?.derating.factor).toBe(0.8);
    expect(relErr(dv?.recommended.si ?? 0, (dv?.calculated.si ?? 0) * 0.8)).toBeLessThanOrEqual(1e-12);
    expect(dv?.derating.rationale).toMatch(/engineering default, not from a standard/);
  });
  it('current solved with a user derating uses that factor', () => {
    const r = ok({ ...solveCurrent('outer', 50, 30, 2), currentDerating: one(0.5) });
    expect(r.designValues[0]?.derating.factor).toBe(0.5);
    expect(relErr(r.designValues[0]?.recommended.si ?? 0, (r.designValues[0]?.calculated.si ?? 0) * 0.5)).toBeLessThanOrEqual(1e-12);
  });
  it('temperature rise solved: no design values', () => {
    expect(ok(solveDT('outer', 3, 40, 1)).designValues).toEqual([]);
  });
});

describe('headline formatting never rounds against the reader', () => {
  const opts = { accuracyClass: 'empirical' } as const;
  it('width (min-requirement) 0.30038 mm prints at or above the SI value, in both mm and mil', () => {
    const r = ok({ mode: 'B', layer: 'outer', current: amp(1), deltaT: dT(10), copperThickness: um(35), copperBasis: 'nominal' });
    const w = res(r, 'width');
    const s = formatResult(w, opts);
    const m = /^([\d.]+) mm \(([\d.]+) mil\)$/.exec(s);
    expect(m, s).not.toBeNull();
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(toUnit(w.value, 'mm') * (1 - 1e-12));
    expect(Number(m?.[2])).toBeGreaterThanOrEqual(toUnit(w.value, 'mil') * (1 - 1e-12));
  });
  it('recommended width prints at or above its SI value; recommended current prints at or below', () => {
    const r = ok(solveWidth('outer', 3, 10, 1));
    const dv = r.designValues[0];
    if (!dv) throw new Error('design value missing');
    const m = /^([\d.]+) mm \(([\d.]+) mil\)$/.exec(formatDesignValue(dv, 'recommended', opts));
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(toUnit(dv.recommended, 'mm') * (1 - 1e-12));
    const rc = ok(solveCurrent('outer', 50, 30, 2));
    const cv = rc.designValues[0];
    if (!cv) throw new Error('design value missing');
    const c = /^([\d.]+) A$/.exec(formatDesignValue(cv, 'recommended', opts));
    expect(c, formatDesignValue(cv, 'recommended', opts)).not.toBeNull();
    expect(Number(c?.[1])).toBeLessThanOrEqual(toUnit(cv.recommended, 'A') * (1 + 1e-12));
    const cc = /^([\d.]+) A$/.exec(formatResult(res(rc, 'current capacity'), opts));
    expect(Number(cc?.[1])).toBeLessThanOrEqual(toUnit(res(rc, 'current capacity').value, 'A') * (1 + 1e-12));
  });
});

describe('validity checks (S-010 chart range, secondhand and paywalled) and exact bounds', () => {
  const REG = {
    current: /current within chart range \(.*35 A/,
    dT: /temperature rise within chart range \(.*100/,
    weight: /copper weight within chart range \(0\.5-3/,
    width: /width within chart range \(.*400 mil/,
    maxT: /maximum conductor temperature within allowed/,
  };
  it('in-range case: all four checks present and ok, each detail names its bound and S-010; no maxAllowedTemp check', () => {
    const r = ok(solveWidth('outer', 3, 10, 1));
    for (const re of [REG.current, REG.dT, REG.weight, REG.width]) {
      const c = checkNamed(r, re);
      expect(c.ok).toBe(true);
      expect(c.detail).toMatch(/S-010/);
    }
    expect(checkNamed(r, REG.current).detail).toMatch(/35/);
    expect(checkNamed(r, REG.dT).detail).toMatch(/100/);
    expect(checkNamed(r, REG.width).detail).toMatch(/400/);
    expect(checkNamed(r, REG.weight).detail).toMatch(/0\.5/);
    expect(r.validityChecks.some((c) => REG.maxT.test(c.name))).toBe(false);
    expect(r.validityChecks.every((c) => c.ok)).toBe(true);
  });
  it('current is checked up to 35 A inclusive; just above fails', () => {
    expect(checkNamed(ok(solveWidth('outer', 35, 50, 1)), REG.current).ok).toBe(true);
    expect(checkNamed(ok(solveWidth('outer', 35.001, 50, 1)), REG.current).ok).toBe(false);
  });
  it('temperature rise is checked up to 100 C inclusive; just above fails', () => {
    expect(checkNamed(ok(solveWidth('outer', 3, 100, 1)), REG.dT).ok).toBe(true);
    expect(checkNamed(ok(solveWidth('outer', 3, 100.01, 1)), REG.dT).ok).toBe(false);
  });
  it('copper weight 0.5 to 3 oz/ft2 inclusive (equivalent of the thickness); outside fails', () => {
    for (const o of [0.5, 3]) expect(checkNamed(ok(solveWidth('outer', 3, 30, o)), REG.weight).ok).toBe(true);
    for (const o of [0.49, 3.01]) expect(checkNamed(ok(solveWidth('outer', 3, 30, o)), REG.weight).ok).toBe(false);
    // Thickness entry is converted to its oz-equivalent (35 um per oz): 17.5 um = 0.5 oz and 105 um = 3 oz pass, 17 um and 106 um fail.
    const t = (u: number): CalcResult => ok({ mode: 'B', layer: 'outer', current: amp(3), deltaT: dT(30), copperThickness: um(u), copperBasis: 'finished' });
    for (const u of [17.5, 35, 105]) expect(checkNamed(t(u), REG.weight).ok).toBe(true);
    for (const u of [17, 106]) expect(checkNamed(t(u), REG.weight).ok).toBe(false);
  });
  it('width is checked up to 400 mil inclusive, whether given or solved; just above fails', () => {
    expect(checkNamed(ok(solveCurrent('outer', 400, 30, 1)), REG.width).ok).toBe(true);
    expect(checkNamed(ok(solveCurrent('outer', 400.1, 30, 1)), REG.width).ok).toBe(false);
    // Solved width: 20 A at 10 C on 0.5 oz needs about 1474 mil (oracle ipc2221_width_mil(20, 10, outer, 17.5) = 1473.67).
    const r = ok(solveWidth('outer', 20, 10, 0.5));
    expect(toUnit(res(r, 'width').value, 'mil')).toBeGreaterThan(400);
    expect(checkNamed(r, REG.width).ok).toBe(false);
  });
  it('the current check applies to a solved current too (width 400 mil, dT 100 C, 3 oz outer gives about 78.4 A)', () => {
    const r = ok(solveCurrent('outer', 400, 100, 3));
    expect(checkNamed(r, REG.current).ok).toBe(false);
    expect(checkNamed(r, REG.width).ok).toBe(true);
    expect(checkNamed(r, REG.dT).ok).toBe(true);
  });
  it('the temperature rise check applies to a solved rise (inner 5 A on 60 mil 1 oz gives about 129 C)', () => {
    const r = ok(solveDT('inner', 5, 60, 1));
    expect(toUnit(res(r, 'temperature rise').value, 'ddegC')).toBeGreaterThan(100);
    expect(checkNamed(r, REG.dT).ok).toBe(false);
  });
  it('a dT below 10 C is not a failing check; it adds one info warning citing S-010 (one source says the chart starts at 10 C)', () => {
    const r = ok(solveWidth('outer', 1, 5, 1));
    expect(r.validityChecks.every((c) => c.ok)).toBe(true);
    const w = r.warnings.filter((x) => x.severity === 'info' && /S-010/.test(x.message) && /10/.test(x.message));
    expect(w).toHaveLength(1);
    expect(r.confidence.score).toBe(9); // width solve, all defaults (see confidence tests)
    expect(ok(solveWidth('outer', 1, 10, 1)).warnings.filter((x) => /starts at 10/.test(x.message))).toHaveLength(0);
  });
  it('out of range: level low, input named with its bound in the reasons, and a warning-level extrapolation notice', () => {
    const cases: [Inputs, RegExp, RegExp][] = [
      [solveWidth('outer', 40, 50, 1), /current/i, /35 A/],
      [solveWidth('outer', 3, 120, 1), /temperature rise|deltaT/i, /100/],
      [solveWidth('outer', 3, 30, 4), /copper|weight/i, /0\.5.*3/],
      [solveCurrent('outer', 450, 30, 1), /width/i, /400 mil/],
    ];
    for (const [inp, name, bound] of cases) {
      const r = ok(inp);
      expect(r.validityChecks.some((c) => !c.ok)).toBe(true);
      expect(r.confidence.level).toBe('low');
      const reasons = r.confidence.reasons.join(' ');
      expect(reasons).toMatch(name);
      expect(reasons).toMatch(bound);
      const w = r.warnings.filter((x) => x.severity === 'warning' && /extrapolat/i.test(x.message) && /chart range/i.test(x.message));
      expect(w.length).toBeGreaterThan(0);
    }
  });
  it('in range: no warning-level or critical entries (highest severity is caution)', () => {
    expect(highestWarningSeverity(ok(solveWidth('outer', 3, 10, 1)).warnings)).toBe('caution');
  });
  it('maxAllowedTemp: check present; ambient 25 C + dT 30 C = 55 C against 100 C ok, against 50 C fails (level low, input named)', () => {
    const good = ok({ ...solveWidth('outer', 3, 30, 1), maxAllowedTemp: degC(100) });
    expect(checkNamed(good, REG.maxT).ok).toBe(true);
    expect(checkNamed(good, REG.maxT).detail.length).toBeGreaterThan(0);
    expect(good.inputs.find((i) => i.name === 'maxAllowedTemp')?.source).toBe('user');
    const bad = ok({ ...solveWidth('outer', 3, 30, 1), maxAllowedTemp: degC(50) });
    expect(checkNamed(bad, REG.maxT).ok).toBe(false);
    expect(bad.confidence.level).toBe('low');
    expect(bad.confidence.reasons.join(' ')).toMatch(/maxAllowedTemp|maximum conductor temperature/i);
    const amb = ok({ ...solveWidth('outer', 3, 30, 1), ambient: degC(80), maxAllowedTemp: degC(100) });
    expect(checkNamed(amb, REG.maxT).ok).toBe(false); // 80 + 30 = 110 C
  });
});

describe('warnings', () => {
  it('first warning is the caution with the exact mandatory legacy text, for every layer and direction', () => {
    for (const inp of [solveWidth('outer', 3, 10, 1), solveWidth('inner', 3, 10, 1), solveCurrent('outer', 40, 20, 1), solveDT('inner', 2, 30, 1)]) {
      const w = ok(inp).warnings[0];
      expect(w?.severity).toBe('caution');
      expect(w?.message).toBe(MANDATORY);
    }
  });
  it('inner layer: caution that k = 0.024 is half the external 0.048 and IPC-2152 testing reports cooler internal traces (S-018, secondhand)', () => {
    const r = ok(solveWidth('inner', 3, 10, 1));
    const w = r.warnings.filter((x) => x.severity === 'caution' && /0\.024/.test(x.message));
    expect(w.length).toBeGreaterThan(0);
    const t = w.map((x) => x.message).join(' ');
    expect(t).toMatch(/0\.048/);
    expect(t).toMatch(/IPC-2152/);
    expect(t).toMatch(/cooler/i);
    expect(t).toMatch(/S-018/);
    expect(t).toMatch(/secondhand|unverified/i);
  });
  it('outer layer has no internal-constant caution', () => {
    const r = ok(solveWidth('outer', 3, 10, 1));
    expect(r.warnings.filter((x) => /S-018/.test(x.message))).toHaveLength(0);
    expect(r.warnings.filter((x) => /0\.024/.test(x.message))).toHaveLength(0);
  });
  it('no compliance wording anywhere in the result (negated phrasings stripped)', () => {
    for (const inp of [
      solveWidth('outer', 3, 10, 1),
      solveWidth('inner', 40, 120, 4),
      solveCurrent('inner', 40, 20, 1),
      solveDT('outer', 2, 30, 1),
      { ...solveWidth('outer', 3, 30, 1), maxAllowedTemp: degC(50) },
    ]) {
      // The forbidden words are assembled from fragments so this file does not itself trip the wording audit.
      const words = ['compl' + 'iant', 'certi' + 'fied', 'conf' + 'orms'];
      const negated = new RegExp(String.raw`\b(not|no|never|neither)\b[^.]{0,40}(` + words.join('|') + ')', 'gi');
      const forbidden = new RegExp(words.join('|') + '|production.?safe', 'i');
      const text = JSON.stringify(ok(inp)).replace(negated, '');
      expect(text).not.toMatch(forbidden);
    }
  });
});

describe('confidence (rule-based, exact scores; only defaults the chosen solve USES count)', () => {
  // Score = 2 x out-of-range + 1 x ordinary defaults + 2 x safety-relevant defaults + accuracy (empirical 1) + data status (PAYWALLED 2).
  // Safety-relevant defaults that count: nominal copper basis (copperBasisFactors); ambient (used in every direction, it sets the
  // maximum conductor temperature); designMargin only when WIDTH is solved; currentDerating only when CURRENT is solved.
  // Defaulted but unused inputs stay listed in inputs[] (source 'default') but add no points and do not appear in the reasons.
  const explicit = { ambient: degC(25), designMargin: one(1.25), currentDerating: one(0.8) };
  const BASE = 1 + 2; // empirical 1 + PAYWALLED 2
  it('full defaults, width solved: ambient 2 + margin 2 + nominal copper 2 + empirical 1 + PAYWALLED 2 = 9 => low', () => {
    for (const inp of [solveWidth('outer', 3, 10, 1), solveWidth('inner', 3, 10, 1)]) {
      const r = ok(inp);
      expect(r.confidence.score).toBe(2 + 2 + 2 + BASE);
      expect(r.confidence.score).toBe(9);
      expect(r.confidence.level).toBe('low');
    }
  });
  it('full defaults, current solved: ambient 2 + derating 2 + nominal copper 2 + 1 + 2 = 9 => low', () => {
    const r = ok(solveCurrent('outer', 40, 20, 1));
    expect(r.confidence.score).toBe(9);
    expect(r.confidence.level).toBe('low');
  });
  it('full defaults, temperature rise solved: ambient 2 + nominal copper 2 + 1 + 2 = 7 => low (neither margin nor derating is used)', () => {
    const r = ok(solveDT('outer', 2, 30, 1));
    expect(r.confidence.score).toBe(7);
    expect(r.confidence.level).toBe('low');
  });
  it('full defaults, thickness mode with the default nominal basis: same scores (9 width, 9 current, 7 temperature rise)', () => {
    const t = { mode: 'B', layer: 'outer', copperThickness: um(35) } as const;
    expect(ok({ ...t, current: amp(3), deltaT: dT(10) }).confidence.score).toBe(9);
    expect(ok({ ...t, width: mil(40), deltaT: dT(20) }).confidence.score).toBe(9);
    expect(ok({ ...t, current: amp(2), width: mil(40) }).confidence.score).toBe(7);
  });
  it('reasons name each USED safety-relevant default, the empirical class and the PAYWALLED data', () => {
    const w = ok(solveWidth('outer', 3, 10, 1)).confidence.reasons.join(' ');
    expect(w).toMatch(/ambient/);
    expect(w).toMatch(/designMargin/);
    expect(w).toMatch(/nominal copper thickness/i);
    expect(w).toMatch(/empirical/i);
    expect(w).toMatch(/PAYWALLED/);
    const c = ok(solveCurrent('outer', 40, 20, 1)).confidence.reasons.join(' ');
    expect(c).toMatch(/ambient/);
    expect(c).toMatch(/currentDerating/);
  });
  it('unused defaults are absent from the reasons but still present in inputs[] with source default', () => {
    const w = ok(solveWidth('outer', 3, 10, 1));
    expect(w.confidence.reasons.join(' ')).not.toMatch(/currentDerating/);
    expect(w.inputs.find((i) => i.name === 'currentDerating')?.source).toBe('default');
    const c = ok(solveCurrent('outer', 40, 20, 1));
    expect(c.confidence.reasons.join(' ')).not.toMatch(/designMargin/);
    expect(c.inputs.find((i) => i.name === 'designMargin')?.source).toBe('default');
    const d = ok(solveDT('outer', 2, 30, 1));
    const rd = d.confidence.reasons.join(' ');
    expect(rd).not.toMatch(/designMargin/);
    expect(rd).not.toMatch(/currentDerating/);
    expect(d.inputs.find((i) => i.name === 'designMargin')?.source).toBe('default');
    expect(d.inputs.find((i) => i.name === 'currentDerating')?.source).toBe('default');
    expect(rd).toMatch(/ambient/);
  });
  it('width solved: explicit ambient 7, explicit margin 7, explicit derating (unused) still 9, all explicit 5', () => {
    expect(ok({ ...solveWidth('outer', 3, 10, 1), ambient: explicit.ambient }).confidence.score).toBe(9 - 2);
    expect(ok({ ...solveWidth('outer', 3, 10, 1), designMargin: explicit.designMargin }).confidence.score).toBe(9 - 2);
    expect(ok({ ...solveWidth('outer', 3, 10, 1), currentDerating: explicit.currentDerating }).confidence.score).toBe(9);
    // All explicit: nominal copper 2 + empirical 1 + PAYWALLED 2 = 5.
    expect(ok({ ...solveWidth('outer', 3, 10, 1), ...explicit }).confidence.score).toBe(5);
  });
  it('current solved: explicit derating 7, explicit margin (unused) still 9, all explicit 5', () => {
    expect(ok({ ...solveCurrent('outer', 40, 20, 1), currentDerating: explicit.currentDerating }).confidence.score).toBe(7);
    expect(ok({ ...solveCurrent('outer', 40, 20, 1), designMargin: explicit.designMargin }).confidence.score).toBe(9);
    expect(ok({ ...solveCurrent('outer', 40, 20, 1), ...explicit }).confidence.score).toBe(5);
  });
  it('temperature rise solved: explicit ambient 5; explicit margin and derating (unused) still 7', () => {
    expect(ok({ ...solveDT('outer', 2, 30, 1), ambient: explicit.ambient }).confidence.score).toBe(5);
    expect(ok({ ...solveDT('outer', 2, 30, 1), designMargin: explicit.designMargin, currentDerating: explicit.currentDerating }).confidence.score).toBe(7);
    expect(ok({ ...solveDT('outer', 2, 30, 1), ...explicit }).confidence.score).toBe(5);
  });
  it.each(['finished', 'measured'] as const)('all inputs explicit with %s copper: 1 (empirical) + 2 (PAYWALLED) = 3 => low', (b) => {
    // The level would become medium only after S-001 is VERIFIED by a human (then the score drops to 1).
    const r = ok({ mode: 'B', layer: 'inner', current: amp(3), deltaT: dT(10), copperThickness: um(35), copperBasis: b, ...explicit });
    expect(r.confidence.score).toBe(3);
    expect(r.confidence.level).toBe('low');
    expect(r.confidence.reasons.length).toBeGreaterThan(0);
    // Finished copper, width solved, margin defaulted (used) and ambient explicit: 3 + 2 = 5 (derating unused).
    const m = ok({ mode: 'B', layer: 'inner', current: amp(3), deltaT: dT(10), copperThickness: um(35), copperBasis: b, ambient: explicit.ambient });
    expect(m.confidence.score).toBe(3 + 2);
  });
  it('level is low whatever the inputs are (formula source is paywalled secondary data)', () => {
    for (const inp of [
      solveWidth('outer', 1, 10, 1),
      { mode: 'B', layer: 'outer', width: mil(30), current: amp(1), copperThickness: um(35), copperBasis: 'measured', ...explicit } as Inputs,
    ]) {
      expect(ok(inp).confidence.level).toBe('low');
    }
  });
  it('one out-of-range input adds 2: all explicit with finished copper and 36 A = 3 + 2 = 5; width solve with full defaults = 9 + 2 = 11', () => {
    const a = ok({ mode: 'B', layer: 'outer', current: amp(36), deltaT: dT(30), copperThickness: um(35), copperBasis: 'finished', ...explicit });
    expect(a.confidence.score).toBe(5);
    expect(a.confidence.level).toBe('low');
    expect(a.confidence.reasons.join(' ')).toMatch(/current/);
    expect(ok(solveWidth('outer', 36, 30, 1)).confidence.score).toBe(11);
  });
  it('the S-018 row (inner layers) does not lower the data status further than PAYWALLED: inner and outer score the same', () => {
    expect(ok(solveWidth('inner', 3, 10, 1)).confidence.score).toBe(ok(solveWidth('outer', 3, 10, 1)).confidence.score);
  });
});
