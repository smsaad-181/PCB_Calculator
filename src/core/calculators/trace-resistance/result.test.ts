import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, q, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult, highestWarningSeverity } from '../../result';
import type { CalcResult } from '../../result';
import { formatResult } from '../../format-result';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 1 task 3: result contract of the trace resistance calculator.
// Exact confidence scores are pinned below with their arithmetic. The honest reading: the nominal copper thickness alone
// makes the resistance uncertain by tens of percent (S-009, secondhand), so a default run rates 'low'.
// Nothing here upgrades a ledger row: S-004 (copper resistivity, alpha) and S-013 (skin depth) are VERIFIED, S-012
// (plated copper) is UNVERIFIED, S-003 (foil convention, CONFLICT) is rated as its own labelled assumption.

const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const um = (n: number): Quantity => fromUnit(n, 'um');
const mm = (n: number): Quantity => fromUnit(n, 'mm');
const m = (n: number): Quantity => fromUnit(n, 'm');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const dT = (n: number): Quantity => fromUnit(n, 'ddegC');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const hz = (n: number): Quantity => fromUnit(n, 'Hz');
const rhoUohmCm = (n: number): Quantity => q(n * 1e-8, DIM.RESISTIVITY);
const perK = (n: number): Quantity => q(n, DIM.PER_KELVIN);
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

const RHO20 = 1 / 58e6;
const ALPHA = 0.00393;
const MU0 = 4e-7 * Math.PI;
const refRho = (T: number): number => RHO20 * (1 + ALPHA * (T - 20));
/** Frequency at which the skin depth equals half the copper thickness (rule-of-thumb threshold), thickness in um, T in degC. */
const fHalf = (tUm: number, T: number): number => refRho(T) / (Math.PI * MU0 * (tUm * 1e-6 * 0.5) ** 2);

const R_T = 'resistance at conductor temperature';

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
const hasCheck = (r: CalcResult, re: RegExp): boolean => r.validityChecks.some((x) => re.test(x.name));

// Weight mode, all defaults (ambient defaulted, nominal copper by weight).
const weightDefaults: Inputs = { layer: 'outer', length: mm(100), width: mm(0.254), copperWeight: oz(1) };
// Thickness mode, finished copper, explicit ambient: nothing defaulted, nothing safety-relevant.
const clean: Inputs = {
  layer: 'outer',
  length: mm(100),
  width: mm(0.254),
  copperThickness: um(35),
  copperBasis: 'finished',
  convention: 'nominal-35um',
  ambient: degC(25),
};
const withExtra = (extra: Partial<Inputs>, from: Inputs = clean): Inputs => ({ ...from, ...extra });

const RECOMMENDATION =
  'Resistance is a calculated value for the stated copper thickness. Use finished copper from your fabricator and the worst-case temperature for voltage-drop and heating checks.';

describe('result metadata', () => {
  const r = ok(clean);
  it('result.formula === meta.formula, method and reference come from meta', () => {
    expect(r.formula).toBe(meta.formula);
    expect(r.method).toBe(meta.method);
    expect(meta.method.trim().length).toBeGreaterThan(0);
    expect(r.reference.standard).toBe('Annealed copper resistivity (NBS Circular 31 / Handbook 100)');
    expect(r.reference.edition).toBe('n/a');
    expect(meta.reference.standard).toBe(r.reference.standard);
  });
  it('meta contract', () => {
    expect(meta.id).toBe('trace-resistance');
    expect(meta.title.trim().length).toBeGreaterThan(0);
    expect(meta.accuracyClass).toBe('analytical');
    for (const id of ['S-004', 'S-006', 'S-003', 'S-013', 'S-012']) expect(meta.ledgerIds).toContain(id);
    expect(meta.reference.ledgerIds).toEqual(expect.arrayContaining(['S-004', 'S-006', 'S-003']));
  });
  it('reference ledger ids: S-004, S-006, S-003 always; S-013 only with a frequency; S-012 only with a resistivity override', () => {
    expect([...r.reference.ledgerIds].sort()).toEqual(['S-003', 'S-004', 'S-006']);
    expect([...ok(withExtra({ frequency: hz(1e6) })).reference.ledgerIds].sort()).toEqual(['S-003', 'S-004', 'S-006', 'S-013']);
    expect([...ok(withExtra({ resistivity: rhoUohmCm(1.9) })).reference.ledgerIds].sort()).toEqual(['S-003', 'S-004', 'S-006', 'S-012']);
    expect([...ok(withExtra({ frequency: hz(1e6), resistivity: rhoUohmCm(1.9) })).reference.ledgerIds].sort()).toEqual([
      'S-003',
      'S-004',
      'S-006',
      'S-012',
      'S-013',
    ]);
  });
  it('exactly one primary result: the resistance at the conductor temperature (prediction)', () => {
    for (const inp of [clean, weightDefaults, withExtra({ frequency: hz(1e6), current: amp(2) })]) {
      const rr = ok(inp);
      expect(rr.results.filter((o) => o.role === 'primary').map((o) => o.name)).toEqual([R_T]);
      expect(res(rr, R_T).bound).toBe('prediction');
    }
  });
  it('absent optional sections: designValues [], envelope [] (task 9), no elements, fabProfile, exports, limitingElement', () => {
    expect(r.designValues).toEqual([]);
    expect(r.envelope ?? []).toEqual([]);
    expect(r.limitingElement).toBeUndefined();
    expect(r.fabProfile).toBeUndefined();
    expect(r.exports).toBeUndefined();
    expect(r.elements).toBeUndefined();
  });
  it('recommendation is the fixed text', () => {
    for (const inp of [clean, weightDefaults, withExtra({ frequency: hz(1e9) })]) expect(ok(inp).recommendation).toBe(RECOMMENDATION);
  });
  it('dataStatus: VERIFIED by default (S-004, S-006; S-003 excluded) and with a frequency (S-013 VERIFIED); UNVERIFIED with a resistivity override (S-012); a nominal weight with an S-009 figure adds S-009 (PAYWALLED), see finished-copper-status.test.ts', () => {
    expect(r.dataStatus).toBe('VERIFIED');
    expect(ok(weightDefaults).dataStatus).toBe('PAYWALLED');
    expect(ok(withExtra({ frequency: hz(1e6) })).dataStatus).toBe('VERIFIED');
    expect(ok(withExtra({ resistivity: rhoUohmCm(1.9) })).dataStatus).toBe('UNVERIFIED');
    expect(ok(withExtra({ resistivity: rhoUohmCm(1.9), frequency: hz(1e6) })).dataStatus).toBe('UNVERIFIED');
  });
});

describe('copperBasis', () => {
  it('weight input: nominal basis, layer and thickness (35 um per oz) recorded', () => {
    for (const l of ['outer', 'inner'] as const) {
      const r = ok({ ...weightDefaults, layer: l, copperWeight: oz(2) });
      expect(r.copperBasis?.layer).toBe(l);
      expect(r.copperBasis?.basis).toBe('nominal');
      expect(relErr(r.copperBasis?.thickness.si ?? 0, 70e-6)).toBeLessThanOrEqual(1e-12);
      expect(r.copperBasis?.weightOzFt2).toBe(2);
    }
  });
  it('thickness input: basis defaults to nominal (source default); finished and measured are kept as entered', () => {
    const { copperBasis: _b, ...noBasis } = clean;
    void _b;
    const d = ok(noBasis);
    expect(d.copperBasis?.basis).toBe('nominal');
    for (const b of ['finished', 'measured'] as const) {
      const r = ok({ ...clean, layer: 'inner', copperThickness: um(40), copperBasis: b });
      expect(r.copperBasis?.basis).toBe(b);
      expect(r.copperBasis?.layer).toBe('inner');
      expect(relErr(r.copperBasis?.thickness.si ?? 0, 40e-6)).toBeLessThanOrEqual(1e-12);
    }
  });
});

describe('inputs, provenance and assumptions', () => {
  it('every quantity input is listed with its source; the ambient default is marked default with a detail', () => {
    const r = ok(weightDefaults);
    const find = (n: string) => r.inputs.find((i) => i.name === n);
    expect(find('length')?.source).toBe('user');
    expect(find('width')?.source).toBe('user');
    expect(find('copperWeight')?.source).toBe('user');
    expect(find('ambient')?.source).toBe('default');
    expect((find('ambient')?.sourceDetail ?? '').length).toBeGreaterThan(0);
    expect(Math.abs(toUnit(find('ambient')?.value ?? q(0, DIM.ABS_TEMPERATURE), 'degC') - 25)).toBeLessThan(1e-9);
    // Optional inputs are listed only when given (a defaulted resistivity or alpha must not count as a defaulted assumption).
    for (const n of ['deltaT', 'resistivity', 'alpha', 'frequency', 'current', 'copperThickness']) expect(find(n)).toBeUndefined();
  });
  it('user-supplied optional inputs are marked user, with their quantities echoed', () => {
    const r = ok(
      withExtra({ ambient: degC(40), deltaT: dT(20), resistivity: rhoUohmCm(1.9), alpha: perK(0.0036), frequency: hz(1e6), current: amp(2) }),
    );
    for (const n of ['length', 'width', 'copperThickness', 'ambient', 'deltaT', 'resistivity', 'alpha', 'frequency', 'current']) {
      expect(r.inputs.find((i) => i.name === n)?.source, n).toBe('user');
    }
    expect(relErr(r.inputs.find((i) => i.name === 'resistivity')?.value.si ?? 0, 1.9e-8)).toBeLessThanOrEqual(1e-12);
    expect(relErr(r.inputs.find((i) => i.name === 'alpha')?.value.si ?? 0, 0.0036)).toBeLessThanOrEqual(1e-12);
  });
  it('assumptions state the ambient default (engineering default, not from a standard) or the user ambient', () => {
    const d = ok(weightDefaults).assumptions.join(' ');
    expect(d).toMatch(/ambient/i);
    expect(d).toMatch(/default/i);
    expect(ok(clean).assumptions.join(' ')).toMatch(/ambient/i);
    expect(ok(clean).assumptions.every((a) => a.trim().length > 0)).toBe(true);
  });
});

describe('warnings', () => {
  it('a default run carries the info warning that the coefficient is the linear 20 C coefficient for 100 % IACS copper (S-004)', () => {
    const r = ok(clean);
    const w = r.warnings.filter((x) => /linear/i.test(x.message));
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]?.severity).toBe('info');
    expect(w[0]?.message).toMatch(/S-004/);
    expect(w[0]?.message).toMatch(/100\s?% IACS/);
    expect(w[0]?.message).toMatch(/20\s?°C/);
    expect(w[0]?.message).toMatch(/not modelled/i);
    expect(highestWarningSeverity(r.warnings)).toBe('info');
  });
  it('the copper-thickness caution is carried by the confidence reasons, not duplicated as a warning', () => {
    const r = ok(weightDefaults);
    expect(r.warnings.some((x) => /nominal copper thickness/i.test(x.message))).toBe(false);
    expect(r.confidence.reasons.join(' ')).toMatch(/nominal copper thickness/i);
  });
  it('deltaT given: an info warning says the rise was supplied by the user and no self-heating iteration is performed', () => {
    const r = ok(withExtra({ deltaT: dT(20) }));
    const w = r.warnings.filter((x) => /supplied by the user/i.test(x.message));
    expect(w).toHaveLength(1);
    expect(w[0]?.severity).toBe('info');
    expect(w[0]?.message).toMatch(/no self-heating iteration/i);
    expect(ok(clean).warnings.some((x) => /self-heating/i.test(x.message))).toBe(false);
    expect(highestWarningSeverity(r.warnings)).toBe('info');
  });
  it('resistivity override: a caution that it replaces the ledger value (S-004) and that plated copper (S-012, UNVERIFIED) is not covered by the default', () => {
    const r = ok(withExtra({ resistivity: rhoUohmCm(1.9) }));
    const w = r.warnings.filter((x) => x.severity === 'caution' && /S-012/.test(x.message));
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]?.message).toMatch(/S-004/);
    expect(w[0]?.message).toMatch(/plated/i);
    expect(w[0]?.message).toMatch(/UNVERIFIED/);
    expect(w[0]?.message).toMatch(/replace/i);
    expect(highestWarningSeverity(r.warnings)).toBe('caution');
    expect(ok(clean).warnings.some((x) => /S-012/.test(x.message))).toBe(false);
  });
  it('alpha override: a caution that it replaces the S-004 temperature coefficient', () => {
    const r = ok(withExtra({ alpha: perK(0.0039) }));
    const w = r.warnings.filter((x) => x.severity === 'caution' && /temperature coefficient/i.test(x.message));
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]?.message).toMatch(/S-004/);
    expect(w[0]?.message).toMatch(/replace/i);
    expect(highestWarningSeverity(r.warnings)).toBe('caution');
  });
  it('no compliance wording anywhere in the result (negated phrasings stripped)', () => {
    for (const inp of [
      weightDefaults,
      clean,
      withExtra({ frequency: hz(1e8), current: amp(2), deltaT: dT(30), resistivity: rhoUohmCm(1.9), alpha: perK(0.0036) }),
      withExtra({ ambient: degC(200) }),
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

describe('validity checks (plausibility ranges, not standards)', () => {
  const TEMP = /^conductor temperature/i;
  const LEN = /^length/i;
  const WID = /^width/i;
  const SKIN = /skin depth vs copper thickness/i;
  it('in range, no frequency: exactly three checks (conductor temperature, length, width), all ok, details say plausibility and not a standard', () => {
    const r = ok(clean);
    expect(r.validityChecks).toHaveLength(3);
    for (const re of [TEMP, LEN, WID]) {
      const c = checkNamed(r, re);
      expect(c.ok).toBe(true);
      expect(c.detail).toMatch(/plausib/i);
      expect(c.detail).toMatch(/not a standard/i);
    }
    expect(checkNamed(r, TEMP).name).toMatch(/-55/);
    expect(checkNamed(r, TEMP).name).toMatch(/150/);
    expect(hasCheck(r, SKIN)).toBe(false);
  });
  it('conductor temperature -55 to 150 C inclusive; just outside fails (ambient alone, and ambient + deltaT)', () => {
    expect(checkNamed(ok(withExtra({ ambient: degC(150) })), TEMP).ok).toBe(true);
    expect(checkNamed(ok(withExtra({ ambient: degC(150.1) })), TEMP).ok).toBe(false);
    expect(checkNamed(ok(withExtra({ ambient: degC(-55) })), TEMP).ok).toBe(true);
    expect(checkNamed(ok(withExtra({ ambient: degC(-55.1) })), TEMP).ok).toBe(false);
    expect(checkNamed(ok(withExtra({ ambient: degC(25), deltaT: dT(125) })), TEMP).ok).toBe(true);
    expect(checkNamed(ok(withExtra({ ambient: degC(25), deltaT: dT(126) })), TEMP).ok).toBe(false);
  });
  it('length is checked up to 10 m inclusive; width up to 100 mm inclusive', () => {
    expect(checkNamed(ok(withExtra({ length: m(10) })), LEN).ok).toBe(true);
    expect(checkNamed(ok(withExtra({ length: m(10.001) })), LEN).ok).toBe(false);
    expect(checkNamed(ok(withExtra({ width: mm(100) })), WID).ok).toBe(true);
    expect(checkNamed(ok(withExtra({ width: mm(100.1) })), WID).ok).toBe(false);
  });
  it('a failed check still returns a numeric result (the formula holds), forces level low and names the input in the reasons', () => {
    const cases: [Inputs, RegExp][] = [
      [withExtra({ ambient: degC(200) }), /conductor temperature/i],
      [withExtra({ length: m(11) }), /length/i],
      [withExtra({ width: mm(150) }), /width/i],
    ];
    for (const [inp, name] of cases) {
      const r = ok(inp);
      expect(r.validityChecks.some((c) => !c.ok)).toBe(true);
      expect(r.confidence.level).toBe('low');
      expect(r.confidence.score).toBe(2); // one out-of-range input = 2 x 1; everything else is explicit, finished, analytical, VERIFIED
      expect(r.confidence.reasons.join(' ')).toMatch(name);
      expect(Number.isFinite(res(r, R_T).value.si)).toBe(true);
    }
  });
  it('two failed checks score 2 x 2 = 4', () => {
    expect(ok(withExtra({ length: m(11), width: mm(150) })).confidence.score).toBe(4);
  });
});

describe('skin-effect check: rule of thumb, current fills the conductor when skin depth >= half the copper thickness', () => {
  const SKIN = /skin depth vs copper thickness/i;
  const MSG = 'DC formula is optimistic: skin depth is below half the copper thickness';
  it('1 MHz on 35 um copper at 20 C (skin depth 66 um): check present and ok, no skin warning, four checks', () => {
    const r = ok(withExtra({ frequency: hz(1e6), ambient: degC(20) }));
    expect(r.validityChecks).toHaveLength(4);
    const c = checkNamed(r, SKIN);
    expect(c.ok).toBe(true);
    expect(c.detail).toMatch(/rule of thumb/i);
    expect(c.detail).toMatch(/not a standard/i);
    expect(r.warnings.some((x) => x.message.includes(MSG))).toBe(false);
  });
  it('100 MHz on 35 um copper (skin depth 6.6 um < 17.5 um): check fails, a warning-severity message with the exact wording, level low, the result is still returned', () => {
    const r = ok(withExtra({ frequency: hz(100e6), ambient: degC(20) }));
    expect(checkNamed(r, SKIN).ok).toBe(false);
    const w = r.warnings.filter((x) => x.message.includes(MSG));
    expect(w).toHaveLength(1);
    expect(w[0]?.severity).toBe('warning');
    expect(r.confidence.level).toBe('low');
    expect(r.confidence.score).toBe(2); // one out-of-range input (the frequency); nothing else adds
    expect(r.confidence.reasons.join(' ')).toMatch(/frequency|skin depth/i);
    expect(Number.isFinite(res(r, R_T).value.si)).toBe(true);
    expect(res(r, R_T).bound).toBe('prediction');
    expect(highestWarningSeverity(r.warnings)).toBe('warning');
  });
  it.each([20, 125])('threshold delta = thickness/2 uses rho(T) at the conductor temperature %i C: 0.1 % below the boundary frequency passes, 0.1 % above fails', (T) => {
    const f = fHalf(35, T);
    const below = ok(withExtra({ frequency: hz(f * 0.999), ambient: degC(T) }));
    expect(checkNamed(below, SKIN).ok).toBe(true);
    expect(below.warnings.some((x) => x.message.includes(MSG))).toBe(false);
    const above = ok(withExtra({ frequency: hz(f * 1.001), ambient: degC(T) }));
    expect(checkNamed(above, SKIN).ok).toBe(false);
    expect(above.warnings.some((x) => x.message.includes(MSG))).toBe(true);
  });
  it('the threshold scales with thickness: 105 um copper fails at a frequency where 17.5 um copper passes', () => {
    const f = fHalf(105, 20) * 1.5; // delta is below 52.5 um but above 8.75 um
    const thin = ok(withExtra({ copperThickness: um(17.5), frequency: hz(f), ambient: degC(20) }));
    const thick = ok(withExtra({ copperThickness: um(105), frequency: hz(f), ambient: degC(20) }));
    expect(checkNamed(thin, SKIN).ok).toBe(true);
    expect(checkNamed(thick, SKIN).ok).toBe(false);
  });
  it('the thickness used is the same one reported (weight mode: 1 oz = 35 um): boundary agrees with thickness mode', () => {
    const f = fHalf(35, 25);
    const w = ok({ ...weightDefaults, frequency: hz(f * 1.001) });
    expect(checkNamed(w, SKIN).ok).toBe(false);
    const w2 = ok({ ...weightDefaults, frequency: hz(f * 0.999) });
    expect(checkNamed(w2, SKIN).ok).toBe(true);
  });
  it('frequency outside 1 Hz to 1 GHz adds a caution about the frequency; 1 Hz and 1 GHz themselves do not', () => {
    const freqCaution = (r: CalcResult) => r.warnings.filter((x) => x.severity === 'caution' && /frequency/i.test(x.message));
    expect(freqCaution(ok(withExtra({ frequency: hz(0.5) })))).toHaveLength(1);
    expect(freqCaution(ok(withExtra({ frequency: hz(2e9) })))).toHaveLength(1);
    expect(freqCaution(ok(withExtra({ frequency: hz(1) })))).toHaveLength(0);
    expect(freqCaution(ok(withExtra({ frequency: hz(1e9) })))).toHaveLength(0);
    expect(freqCaution(ok(withExtra({ frequency: hz(1e6) })))).toHaveLength(0);
  });
  it('0.5 Hz: the frequency caution does not by itself change the score (skin check ok, finished copper, explicit ambient: 0 => high)', () => {
    const r = ok(withExtra({ frequency: hz(0.5) }));
    expect(checkNamed(r, SKIN).ok).toBe(true);
    expect(r.confidence.score).toBe(0);
    expect(r.confidence.level).toBe('high');
  });
});

describe('confidence (rule-based, exact scores)', () => {
  // Score = 2 x out-of-range + 1 x ordinary defaults + 2 x safety-relevant defaults + accuracy (analytical 0) + data status (VERIFIED 0).
  // Ambient is an ORDINARY default (+1; its effect on R is about 2 %). The nominal copper basis is the safety-relevant default (+2).
  // S-012 (plated copper, UNVERIFIED) adds +1 when a resistivity override is given.
  it('weight mode, all defaults: ambient 1 + nominal copper 2 = 3 => low', () => {
    const r = ok(weightDefaults);
    expect(r.confidence.score).toBe(1 + 2);
    expect(r.confidence.score).toBe(3);
    expect(r.confidence.level).toBe('low');
  });
  it('weight mode, explicit ambient: nominal copper 2 => 2 => medium', () => {
    const r = ok({ ...weightDefaults, ambient: degC(25) });
    expect(r.confidence.score).toBe(2);
    expect(r.confidence.level).toBe('medium');
  });
  it('weight mode with an explicit convention is still nominal copper: explicit ambient + convention => 2 => medium', () => {
    const r = ok({ ...weightDefaults, ambient: degC(25), convention: 'nominal-1.35mil' });
    expect(r.confidence.score).toBe(2);
    expect(r.confidence.level).toBe('medium');
  });
  it('thickness mode with the default nominal basis: ambient default 1 + nominal 2 = 3 (low); explicit ambient 2 (medium)', () => {
    const { copperBasis: _b, ...noBasis } = clean;
    void _b;
    const { ambient: _a, ...noAmbient } = noBasis;
    void _a;
    expect(ok(noAmbient).confidence.score).toBe(3);
    expect(ok(noAmbient).confidence.level).toBe('low');
    expect(ok(noBasis).confidence.score).toBe(2);
    expect(ok(noBasis).confidence.level).toBe('medium');
  });
  it.each(['finished', 'measured'] as const)('%s copper + explicit ambient + explicit convention: 0 => high', (b) => {
    const r = ok({ ...clean, copperBasis: b });
    expect(r.confidence.score).toBe(0);
    expect(r.confidence.level).toBe('high');
  });
  it('finished copper with the ambient defaulted: 1 => medium', () => {
    const { ambient: _a, ...noAmbient } = clean;
    void _a;
    const r = ok(noAmbient);
    expect(r.confidence.score).toBe(1);
    expect(r.confidence.level).toBe('medium');
    expect(r.confidence.reasons.join(' ')).toMatch(/ambient/i);
  });
  it('optional extras that are not overrides do not change the score: deltaT, current, a passing frequency', () => {
    for (const extra of [{ deltaT: dT(20) }, { current: amp(3) }, { frequency: hz(1e6) }, { deltaT: dT(20), current: amp(3), frequency: hz(1e6) }]) {
      const r = ok(withExtra(extra));
      expect(r.confidence.score).toBe(0);
      expect(r.confidence.level).toBe('high');
    }
  });
  it('resistivity override on plated copper: S-012 UNVERIFIED adds 1 => 1 => medium, and the reasons cite it', () => {
    const r = ok(withExtra({ resistivity: rhoUohmCm(1.9) }));
    expect(r.confidence.score).toBe(1);
    expect(r.confidence.level).toBe('medium');
    expect(r.confidence.reasons.join(' ')).toMatch(/S-012|UNVERIFIED/);
    expect(ok({ ...weightDefaults, resistivity: rhoUohmCm(1.9) }).confidence.score).toBe(1 + 2 + 1);
  });
  it('reasons name each safety-relevant default: the ambient default and the nominal copper thickness with the S-009 figures (secondhand)', () => {
    const reasons = ok(weightDefaults).confidence.reasons.join(' ');
    expect(reasons).toMatch(/ambient/);
    expect(reasons).toMatch(/nominal copper thickness/i);
    expect(reasons).toMatch(/S-009/);
    expect(reasons).toMatch(/\d+ %/);
    expect(reasons).toMatch(/resistance/i);
  });
  it('the S-003 foil convention (CONFLICT) is excluded from the data status and does not add to the score', () => {
    expect(ok(clean).confidence.score).toBe(0);
    expect(ok({ ...clean, convention: 'mass-density' }).confidence.score).toBe(0);
  });
  it('score and level agree for every default combination (0 high, 1-2 medium, >= 3 low)', () => {
    for (const inp of [weightDefaults, { ...weightDefaults, ambient: degC(25) }, clean, withExtra({ resistivity: rhoUohmCm(2) })]) {
      const c = ok(inp).confidence;
      expect(c.level).toBe(c.score === 0 ? 'high' : c.score <= 2 ? 'medium' : 'low');
    }
  });
});

describe('headline formatting never rounds against the reader (resistance, voltage drop, power loss are predictions: print up)', () => {
  const opts = { accuracyClass: 'analytical' } as const;
  const PREFIX: Record<string, number> = { '': 1, m: 1e-3, µ: 1e-6, k: 1e3, M: 1e6 };
  const parse = (s: string, unit: string): number => {
    const mt = new RegExp(`^([\\d.]+(?:e[+-]?\\d+)?) ([mµkM]?)${unit}$`).exec(s);
    if (!mt) throw new Error(`cannot parse "${s}" as ${unit}`);
    return Number(mt[1]) * (PREFIX[mt[2] ?? ''] ?? NaN);
  };
  it('R(T) for several magnitudes prints at or above the SI value', () => {
    for (const [L, w, t, T] of [
      [100, 0.254, 35, 85],
      [10, 5, 105, 25],
      [1000, 0.1, 17.5, 125],
      [100, 1, 35, 20],
    ] as const) {
      const r = ok({ ...clean, length: mm(L), width: mm(w), copperThickness: um(t), ambient: degC(T) });
      const x = res(r, R_T);
      const s = formatResult(x, opts);
      expect(parse(s, 'Ω')).toBeGreaterThanOrEqual(x.value.si * (1 - 1e-12));
    }
  });
  it('the 100 mm x 0.254 mm x 35 um trace at 85 C (0.243484 ohm) prints as 243.5 mOhm', () => {
    const s = formatResult(res(ok(withExtra({ ambient: degC(85) })), R_T), opts);
    expect(s).toBe('243.5 mΩ');
  });
  it('voltage drop and power loss print at or above their SI values', () => {
    const r = ok(withExtra({ ambient: degC(85), current: amp(3) }));
    const v = res(r, 'voltage drop');
    const p = res(r, 'power loss');
    expect(parse(formatResult(v, opts), 'V')).toBeGreaterThanOrEqual(v.value.si * (1 - 1e-12));
    expect(parse(formatResult(p, opts), 'W')).toBeGreaterThanOrEqual(p.value.si * (1 - 1e-12));
  });
});
