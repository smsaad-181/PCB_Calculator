import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { LEDGER } from '../../data/ledger';
import type { CalcResult } from '../../result';
import { nearest } from '../../eseries';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';
import { TOL, allText, err, expectError, expectNoClaimWording, has, okOf, primaries, res, si, vec, vectors, warningText } from '../circuit-test-utils';

// Phase 1 task 8 slice 2, calculator 1 of 4: regulator feedback divider. TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py: fb_*; vectors fb_* in
// docs/golden-vectors.json) or from the textbook relation restated below: Vout = Vref (1 + R1/R2), R1 top (Vout to FB), R2 bottom.
// Nothing here verifies ledger S-016 (E-series lists, PAYWALLED-USER-MUST-VERIFY); snapping rests on those lists and says so.
// The Vref values are TEST values, not datasheet values.
//
// CONTRACT: Inputs { vref (required), vrefSource?, r1?, r2?, vout?, series?, snap?, pairs?, tolerance?, vrefTolerance?, fbBiasCurrent?, fbBiasDirection? }.
//  Exactly two of r1, r2, vout (the third is solved), or vout alone with a series (best pair search). Three given is over-specified.
//  Results always: vout, r1, r2, voltage across r1, voltage across r2, divider current, power in r1, power in r2, total power.
//  Primary: vout, or the solved resistor, or r1 in a pair search. Bounds: voltages, resistances, errors nominal; current and powers prediction.

// q() refuses NaN and Infinity, so the helpers build the object directly: the calculator must still reject such values.
const mk = (n: number, dim: Quantity['dim']): Quantity => (Number.isFinite(n) ? q(n, dim) : ({ si: n, dim } as Quantity));
const V = (n: number): Quantity => mk(n, DIM.VOLTAGE);
const R = (n: number): Quantity => mk(n, DIM.RESISTANCE);
const I = (n: number): Quantity => mk(n, DIM.CURRENT);
const frac = (n: number): Quantity => mk(n, DIM.DIMENSIONLESS);
const ok = (i: Inputs): CalcResult => okOf(compute, i);
const bad = (i: unknown, code: string, field?: string): string => expectError((x: unknown) => compute(x as Inputs), i, code, field);

type Series = 'E24' | 'E96' | 'E192';
type Snap = 'nearest' | 'up' | 'down';
const SERIES: Series[] = ['E24', 'E96', 'E192'];
const SNAPS: Snap[] = ['nearest', 'up', 'down'];

// Case tables mirror tools/reference/ref_calcs.py (vector names use the case index).
const FB_VOUT: [number, number, number][] = [[0.8, 100e3, 10e3], [1.25, 22e3, 10e3], [0.6, 47e3, 10e3], [2.5, 10e3, 10e3], [0.5, 180e3, 20e3]];
const FB_SOLVE_R1: [number, number, number][] = [[0.8, 3.3, 10e3], [0.6, 5, 10e3], [1.25, 12, 4.7e3]];
const FB_SOLVE_R2: [number, number, number][] = [[0.8, 3.3, 100e3], [0.6, 1.8, 47e3], [1.25, 5, 33e3]];
const FB_POWER: [number, number, number][] = [[0.8, 100e3, 10e3], [1.25, 22e3, 10e3], [0.6, 1e3, 330]];
const FB_BIAS: [number, number, number, number, number][] = [[0.8, 100e3, 10e3, 50e-9, 1], [0.8, 100e3, 10e3, 50e-9, -1], [0.6, 1e6, 100e3, 1e-6, 1]];
const FB_SNAP_CASES: ['r1' | 'r2', number, number, number][] = [['r1', 0.8, 3.3, 10e3], ['r2', 0.8, 3.3, 91e3]];
const FB_PAIR_CASES: [number, number, 'E24' | 'E96'][] = [[0.8, 3.3, 'E24'], [0.8, 3.3, 'E96'], [0.6, 5, 'E96']];
const FB_ENV: [number, number, number, number, number, number, number][] = [
  [0.8, 100e3, 10e3, 0.01, 0, 0, 0],
  [0.8, 100e3, 10e3, 0.01, 0.01, 0, 0],
  [0.6, 47e3, 10e3, 0.05, 0.02, 0, 0],
  [0.8, 100e3, 10e3, 0.01, 0.01, 50e-9, 1],
  [0.8, 100e3, 10e3, 0.01, 0.01, 50e-9, -1],
];
const dirOf = (s: number): 'into-pin' | 'out-of-pin' => (s > 0 ? 'into-pin' : 'out-of-pin');

describe('golden vectors (oracle)', () => {
  it('vectors loaded: ledger S-019 (VERIFIED) for plain cases, S-019 + S-016 for snapping and pairs (PAYWALLED), tolerance 1e-9', () => {
    const own = vectors.filter((v) => v.name.startsWith('fb_'));
    expect(own.length).toBeGreaterThan(150);
    for (const v of own) {
      const snapping = v.name.startsWith('fb_snap_') || v.name.startsWith('fb_pair_');
      expect(v.ledger_ids, v.name).toEqual(snapping ? ['S-019', 'S-016'] : ['S-019']);
      expect(v.status, v.name).toBe(snapping ? 'PAYWALLED-USER-MUST-VERIFY' : 'VERIFIED');
      expect(v.rel_tol).toBeLessThanOrEqual(TOL);
    }
  });
  FB_VOUT.forEach(([vref, r1, r2], ci) => {
    it(`vout case ${String(ci)}: Vref ${String(vref)} V, R1 ${String(r1)}, R2 ${String(r2)}`, () => {
      const r = ok({ vref: V(vref), r1: R(r1), r2: R(r2) });
      expect(err(si(r, 'vout'), vec(`fb_vout_c${String(ci)}_V`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(r)).toEqual(['vout']);
      expect(res(r, 'vout').bound).toBe('nominal');
      expect(r.dataStatus).toBe('VERIFIED');
      expect(r.reference.ledgerIds).toEqual(['S-019']);
    });
  });
  FB_SOLVE_R1.forEach(([vref, t, r2], ci) => {
    it(`solve r1 case ${String(ci)} (exact, no series)`, () => {
      const r = ok({ vref: V(vref), vout: V(t), r2: R(r2) });
      expect(err(si(r, 'r1'), vec(`fb_solve_r1_c${String(ci)}_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(r)).toEqual(['r1']);
      expect(err(si(r, 'vout'), t)).toBeLessThanOrEqual(1e-12);
      expect(has(r, 'vout error vs target')).toBe(false);
      expect(r.reference.ledgerIds).toEqual(['S-019']);
    });
  });
  FB_SOLVE_R2.forEach(([vref, t, r1], ci) => {
    it(`solve r2 case ${String(ci)} (exact, no series)`, () => {
      const r = ok({ vref: V(vref), vout: V(t), r1: R(r1) });
      expect(err(si(r, 'r2'), vec(`fb_solve_r2_c${String(ci)}_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(primaries(r)).toEqual(['r2']);
      expect(err(si(r, 'vout'), t)).toBeLessThanOrEqual(1e-12);
    });
  });
  FB_POWER.forEach(([vref, r1, r2], ci) => {
    it(`current, voltages and powers, case ${String(ci)}`, () => {
      const r = ok({ vref: V(vref), r1: R(r1), r2: R(r2) });
      const map: [string, string][] = [
        ['divider current', 'i_A'],
        ['voltage across r1', 'v_r1_V'],
        ['voltage across r2', 'v_r2_V'],
        ['power in r1', 'p_r1_W'],
        ['power in r2', 'p_r2_W'],
        ['total power', 'p_total_W'],
      ];
      for (const [name, key] of map) expect(err(si(r, name), vec(`fb_power_c${String(ci)}_${key}`).pinned_expected), name).toBeLessThanOrEqual(TOL);
      for (const n of ['divider current', 'power in r1', 'power in r2', 'total power', 'voltage across r1', 'voltage across r2']) expect(res(r, n).bound, n).toBe('prediction');
      // total power = sum of the two resistor powers (both resistors carry the same current in an ideal divider with no bias)
      expect(err(si(r, 'total power'), si(r, 'power in r1') + si(r, 'power in r2'))).toBeLessThanOrEqual(1e-9);
    });
  });
  FB_BIAS.forEach(([vref, r1, r2, ib, sg], ci) => {
    it(`FB bias current, case ${String(ci)} (${dirOf(sg)})`, () => {
      const r = ok({ vref: V(vref), r1: R(r1), r2: R(r2), fbBiasCurrent: I(ib), fbBiasDirection: dirOf(sg) });
      expect(err(si(r, 'fb bias shift'), vec(`fb_bias_c${String(ci)}_shift_V`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(err(si(r, 'vout with fb bias'), vec(`fb_bias_c${String(ci)}_vout_V`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(err(si(r, 'divider current / fb bias current'), vec(`fb_bias_c${String(ci)}_ratio`).pinned_expected)).toBeLessThanOrEqual(TOL);
      // the headline vout stays the ideal relation
      expect(err(si(r, 'vout'), vref * (1 + r1 / r2))).toBeLessThanOrEqual(1e-12);
      expect(Math.sign(si(r, 'fb bias shift'))).toBe(sg);
    });
  });
  FB_SNAP_CASES.forEach(([kind, vref, t, other], ci) => {
    for (const s of SERIES) {
      for (const m of SNAPS) {
        it(`snap solved ${kind} to ${s} (${m}), case ${String(ci)}`, () => {
          const base = { vref: V(vref), vout: V(t), series: s, snap: m };
          const r = ok(kind === 'r1' ? { ...base, r2: R(other) } : { ...base, r1: R(other) });
          const p = `fb_snap_c${String(ci)}_${s}_${m}`;
          expect(err(si(r, kind), vec(`${p}_ohm`).pinned_expected), `${kind}`).toBeLessThanOrEqual(TOL);
          expect(err(si(r, 'vout'), vec(`${p}_vout_V`).pinned_expected), 'vout').toBeLessThanOrEqual(TOL);
          expect(err(si(r, 'vout error vs target'), vec(`${p}_err_frac`).pinned_expected), 'error').toBeLessThanOrEqual(TOL);
          expect(has(r, `ideal ${kind}`)).toBe(true);
          expect(r.dataStatus).toBe('PAYWALLED');
          expect(r.reference.ledgerIds).toEqual(['S-019', 'S-016']);
          expect(r.assumptions.join(' ')).toContain('S-016');
          expect(r.confidence.level).not.toBe('high');
        });
      }
    }
  });
  FB_PAIR_CASES.forEach(([vref, t, s], ci) => {
    it(`best pairs ${s}, case ${String(ci)}: five ranked pairs, window 1 kohm to 976 kohm`, () => {
      const r = ok({ vref: V(vref), vout: V(t), series: s });
      for (let k = 0; k < 5; k++) {
        const p = `fb_pair_c${String(ci)}_rank${String(k)}`;
        const n = String(k + 1);
        expect(err(si(r, `pair ${n} r1`), vec(`${p}_r1_ohm`).pinned_expected), `${p} r1`).toBeLessThanOrEqual(TOL);
        expect(err(si(r, `pair ${n} r2`), vec(`${p}_r2_ohm`).pinned_expected), `${p} r2`).toBeLessThanOrEqual(TOL);
        expect(err(si(r, `pair ${n} vout`), vec(`${p}_vout_V`).pinned_expected), `${p} vout`).toBeLessThanOrEqual(TOL);
        expect(err(si(r, `pair ${n} vout error vs target`), vec(`${p}_err_frac`).pinned_expected), `${p} err`).toBeLessThanOrEqual(TOL);
      }
      // the headline r1, r2, vout are rank 1
      expect(si(r, 'r1')).toBe(si(r, 'pair 1 r1'));
      expect(si(r, 'r2')).toBe(si(r, 'pair 1 r2'));
      expect(primaries(r)).toEqual(['r1']);
      expect(r.dataStatus).toBe('PAYWALLED');
      expect(has(r, 'vout error vs target')).toBe(true);
    });
  });
  FB_ENV.forEach(([vref, r1, r2, tol, vt, ib, sg], ci) => {
    it(`envelope case ${String(ci)}: resistor tolerance ${String(tol)}, Vref tolerance ${String(vt)}${ib > 0 ? `, bias ${dirOf(sg)}` : ''}`, () => {
      const base: Inputs = { vref: V(vref), r1: R(r1), r2: R(r2), tolerance: frac(tol) };
      let inp: Inputs = vt > 0 ? { ...base, vrefTolerance: frac(vt) } : base;
      if (ib > 0) inp = { ...inp, fbBiasCurrent: I(ib), fbBiasDirection: dirOf(sg) };
      const r = ok(inp);
      const e = r.envelope?.find((x) => x.name === (ib > 0 ? 'vout with fb bias' : 'vout'));
      expect(e).toBeDefined();
      expect(err(e?.min.si ?? 0, vec(`fb_env_c${String(ci)}_min_V`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(err(e?.max.si ?? 0, vec(`fb_env_c${String(ci)}_max_V`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(e?.toleranceInputs).toEqual(vt > 0 ? ['r1', 'r2', 'vref'] : ['r1', 'r2']);
    });
  });
});

describe('hand-checkable worked example', () => {
  it('Vref 0.8 V, R1 100 kohm, R2 10 kohm: Vout = 0.8 x 11 = 8.8 V; I = 0.8/10k = 80 uA; P(R1) = 8^2/100k = 0.64 mW; P(R2) = 0.64 mW/10 = 64 uW', () => {
    const r = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3) });
    expect(err(si(r, 'vout'), 8.8)).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, 'divider current'), 80e-6)).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, 'voltage across r1'), 8)).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, 'power in r1'), 0.64e-3)).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, 'power in r2'), 64e-6)).toBeLessThanOrEqual(1e-12);
  });
  it('the target 3.3 V with Vref 0.8 V and R2 10 kohm needs R1 = 10k x (3.3/0.8 - 1) = 31.25 kohm exactly; E24 nearest is 30 kohm giving 0.8 x (1 + 3) = 3.2 V (-3.0303 %)', () => {
    const exact = ok({ vref: V(0.8), vout: V(3.3), r2: R(10e3) });
    expect(err(si(exact, 'r1'), 31250)).toBeLessThanOrEqual(1e-12);
    const snapped = ok({ vref: V(0.8), vout: V(3.3), r2: R(10e3), series: 'E24' });
    expect(si(snapped, 'r1')).toBe(30000);
    expect(err(si(snapped, 'vout'), 3.2)).toBeLessThanOrEqual(1e-12);
    expect(err(si(snapped, 'vout error vs target'), 3.2 / 3.3 - 1)).toBeLessThanOrEqual(1e-12);
    expect(allText(snapped)).toMatch(/-3\.0303\d* %/);
  });
  it('FB bias: 50 nA into the pin through R1 = 100 kohm adds 5 mV to 8.8 V; out of the pin takes 5 mV off; ratio 80 uA / 50 nA = 1600', () => {
    const into = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3), fbBiasCurrent: I(50e-9), fbBiasDirection: 'into-pin' });
    expect(err(si(into, 'fb bias shift'), 5e-3)).toBeLessThanOrEqual(1e-9);
    expect(err(si(into, 'vout with fb bias'), 8.805)).toBeLessThanOrEqual(1e-12);
    expect(err(si(into, 'divider current / fb bias current'), 1600)).toBeLessThanOrEqual(1e-9);
    const out = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3), fbBiasCurrent: I(50e-9), fbBiasDirection: 'out-of-pin' });
    expect(err(si(out, 'vout with fb bias'), 8.795)).toBeLessThanOrEqual(1e-12);
    expect(si(out, 'fb bias shift')).toBeLessThan(0);
  });
});

describe('contract details', () => {
  it('echoes Vref as user-supplied with the source note, and states that no IC parameters are embedded', () => {
    const r = ok({ vref: V(0.8), vrefSource: 'datasheet rev C, table 5 (test value)', r1: R(100e3), r2: R(10e3) });
    const vref = r.inputs.find((i) => i.name === 'vref');
    expect(vref?.source).toBe('user');
    expect(vref?.sourceDetail).toContain('user-supplied');
    expect(vref?.sourceDetail).toContain('datasheet rev C, table 5 (test value)');
    expect(r.assumptions.join(' ')).toContain('datasheet rev C, table 5 (test value)');
    expect(r.assumptions.join(' ')).toContain('no IC parameters');
    const none = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3) });
    expect(none.inputs.find((i) => i.name === 'vref')?.sourceDetail).toContain('no source note');
    expect(none.assumptions.join(' ')).toContain('no source note was given');
    // a blank note counts as none
    expect(ok({ vref: V(0.8), vrefSource: '   ', r1: R(100e3), r2: R(10e3) }).inputs.find((i) => i.name === 'vref')?.sourceDetail).toContain('no source note');
  });
  it('states the resistor positions (R1 top, R2 bottom) and the naming caveat in assumptions and a warning', () => {
    const r = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3) });
    for (const s of [r.assumptions.join(' '), warningText(r)]) {
      expect(s).toContain('TOP resistor');
      expect(s).toContain('BOTTOM resistor');
      expect(s).toContain('inconsistently');
    }
    expect(r.warnings.some((w) => w.code === 'RESISTOR_NAMING')).toBe(true);
  });
  it('without bias, tolerance or series: no envelope, no bias results, high confidence, VERIFIED', () => {
    const r = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3) });
    expect(r.envelope).toBeUndefined();
    expect(has(r, 'fb bias shift')).toBe(false);
    expect(r.confidence.level).toBe('high');
    expect(r.dataStatus).toBe('VERIFIED');
    expect(r.designValues).toEqual([]);
  });
  it('the bias ratio is always reported with a bias; a ratio below 1 is a warning, above 1 an info with no built-in threshold', () => {
    const fine = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3), fbBiasCurrent: I(50e-9), fbBiasDirection: 'into-pin' });
    expect(fine.warnings.some((w) => w.code === 'FB_BIAS_RATIO' && w.severity === 'info')).toBe(true);
    expect(warningText(fine)).toContain('1600');
    expect(warningText(fine)).toContain('no threshold is built in');
    // 80 uA divider current, 100 uA bias: the bias dominates
    const dominated = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3), fbBiasCurrent: I(100e-6), fbBiasDirection: 'into-pin' });
    expect(dominated.warnings.some((w) => w.code === 'FB_BIAS_DOMINATES' && w.severity === 'warning')).toBe(true);
    expect(si(dominated, 'divider current / fb bias current')).toBeLessThan(1);
    // exactly 1: not "smaller", so the info form
    const equal = ok({ vref: V(0.8), r1: R(1e3), r2: R(10e3), fbBiasCurrent: I(80e-6), fbBiasDirection: 'into-pin' });
    expect(equal.warnings.some((w) => w.code === 'FB_BIAS_RATIO')).toBe(true);
    // no bias entered: no ratio and no bias warning
    expect(ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3) }).warnings.some((w) => w.code?.startsWith('FB_BIAS'))).toBe(false);
  });
  it('the shift as a percent of Vout is printed with the signed-percent formatter (magnitude rounds away from zero)', () => {
    const r = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3), fbBiasCurrent: I(50e-9), fbBiasDirection: 'out-of-pin' });
    expect(warningText(r)).toMatch(/-0\.0\d+ % of Vout|-0\.057/);
    expect(si(r, 'fb bias shift vs vout')).toBeLessThan(0);
  });
  it('the bias is NOT folded into the headline vout, which stays the ideal relation, and is solved from the ideal relation', () => {
    const r = ok({ vref: V(0.8), vout: V(3.3), r2: R(10e3), fbBiasCurrent: I(1e-6), fbBiasDirection: 'into-pin' });
    expect(err(si(r, 'r1'), 31250)).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, 'vout'), 3.3)).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, 'vout with fb bias'), 3.3 + 1e-6 * 31250)).toBeLessThanOrEqual(1e-12);
  });
  it('pairs: the count option limits the list; the default is five; every pair is in the chosen series and inside the window', () => {
    const three = ok({ vref: V(0.8), vout: V(3.3), series: 'E24', pairs: 3 });
    expect(has(three, 'pair 3 r1')).toBe(true);
    expect(has(three, 'pair 4 r1')).toBe(false);
    const dflt = ok({ vref: V(0.8), vout: V(3.3), series: 'E96' });
    expect(has(dflt, 'pair 5 r1')).toBe(true);
    expect(has(dflt, 'pair 6 r1')).toBe(false);
    for (let k = 1; k <= 5; k++) {
      for (const side of ['r1', 'r2']) {
        const x = si(dflt, `pair ${String(k)} ${side}`);
        expect(x).toBeGreaterThanOrEqual(1e3);
        expect(x).toBeLessThan(1e6);
        const n = nearest(x, 'E96', 'nearest');
        expect(n.ok && n.value.value === x).toBe(true);
      }
    }
    expect(dflt.assumptions.join(' ')).toContain('ranked by the divider-ratio error');
  });
  it('snapping notes: assumptions say nearest/up/down and S-016; the signed error is in the text', () => {
    const r = ok({ vref: V(0.8), vout: V(3.3), r2: R(10e3), series: 'E24', snap: 'down' });
    const t = allText(r);
    expect(t).toContain('direction down');
    expect(t).toContain('S-016');
    expect(t).toContain('PAYWALLED-USER-MUST-VERIFY');
    expect(t).toMatch(/error vs target after choosing stock values: [+-]/);
  });
  it('exact snapped value reports 0 % error', () => {
    // 31.25 kohm is not E24, but a target landing on a series value is: R1 = 30 kohm, R2 = 10 kohm, Vref 0.8 gives 3.2 V exactly
    const r = ok({ vref: V(0.8), vout: V(3.2), r2: R(10e3), series: 'E24' });
    expect(si(r, 'r1')).toBe(30000);
    expect(Math.abs(si(r, 'vout error vs target'))).toBeLessThanOrEqual(1e-12);
    // float noise in the computed ideal (31.25 kohm style arithmetic) never moves an exact series value up or down
    for (const m of ['up', 'down'] as const) expect(si(ok({ vref: V(0.8), vout: V(3.2), r2: R(10e3), series: 'E24', snap: m }), 'r1'), m).toBe(30000);
  });
  it('envelope toleranceInputs and rounding: only vref tolerance lists vref; only resistor tolerance lists r1, r2', () => {
    expect(ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3), vrefTolerance: frac(0.01) }).envelope?.[0]?.toleranceInputs).toEqual(['vref']);
    expect(ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3), tolerance: frac(0.01) }).envelope?.[0]?.toleranceInputs).toEqual(['r1', 'r2']);
    const zero = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3), tolerance: frac(0) });
    expect(zero.envelope?.[0]?.min.si).toBe(zero.envelope?.[0]?.max.si);
  });
  it('envelope with bias contains two entries and the bias one is shifted', () => {
    const r = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3), tolerance: frac(0.01), fbBiasCurrent: I(50e-9), fbBiasDirection: 'into-pin' });
    expect(r.envelope?.map((e) => e.name)).toEqual(['vout', 'vout with fb bias']);
    for (const e of r.envelope ?? []) {
      expect(e.min.si).toBeLessThanOrEqual(e.typ.si);
      expect(e.typ.si).toBeLessThanOrEqual(e.max.si);
    }
  });
  it('TCR and other effects are excluded and say so', () => {
    const r = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3), tolerance: frac(0.01) });
    expect(r.assumptions.join(' ')).toContain('TCR');
    expect(r.assumptions.join(' ')).toContain('initial tolerance corners only');
  });
  it('out-of-range plausibility (not an error): Vref 50 V, or R below 1 ohm, rates low with a structured reason', () => {
    const a = ok({ vref: V(50), r1: R(100e3), r2: R(10e3) });
    expect(a.confidence.level).toBe('low');
    expect(a.validityChecks.some((c) => !c.ok)).toBe(true);
    expect(a.confidence.reasons.join(' ')).toContain('vref');
    const b = ok({ vref: V(0.8), r1: R(0.5), r2: R(10e3) });
    expect(b.confidence.level).toBe('low');
  });
  it('a bias above the plausibility limit is flagged', () => {
    const r = ok({ vref: V(0.8), r1: R(100), r2: R(10e3), fbBiasCurrent: I(0.01), fbBiasDirection: 'into-pin' });
    expect(r.confidence.level).toBe('low');
  });
  it('steps are labelled, non-empty and finite', () => {
    const r = ok({ vref: V(0.8), vout: V(3.3), r2: R(10e3), fbBiasCurrent: I(50e-9), fbBiasDirection: 'into-pin' });
    expect(r.steps.length).toBeGreaterThanOrEqual(4);
    for (const s of r.steps) {
      expect(s.label.trim().length).toBeGreaterThan(0);
      expect(s.expr.trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(s.value.si)).toBe(true);
    }
  });
});

describe('errors are values (guards)', () => {
  const base = { vref: V(0.8), r1: R(100e3), r2: R(10e3) };
  it('vref is required and must be a positive finite voltage', () => {
    bad({ r1: R(100e3), r2: R(10e3) }, 'INVALID_INPUT', 'vref');
    for (const x of [0, -0.8, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) bad({ ...base, vref: V(x) }, 'INVALID_INPUT', 'vref');
    bad({ ...base, vref: R(0.8) }, 'DIMENSION', 'vref');
    bad({ ...base, vref: 0.8 }, 'INVALID_INPUT', 'vref');
  });
  it('resistors, vout and bias reject zero, negative, NaN, Infinity and the wrong dimension', () => {
    for (const x of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      bad({ ...base, r1: R(x) }, 'INVALID_INPUT', 'r1');
      bad({ ...base, r2: R(x) }, 'INVALID_INPUT', 'r2');
      bad({ vref: V(0.8), r2: R(10e3), vout: V(x) }, 'INVALID_INPUT', 'vout');
      bad({ ...base, fbBiasCurrent: I(x), fbBiasDirection: 'into-pin' }, 'INVALID_INPUT', 'fbBiasCurrent');
    }
    bad({ ...base, r1: V(1) }, 'DIMENSION', 'r1');
    bad({ vref: V(0.8), r2: R(10e3), vout: R(3) }, 'DIMENSION', 'vout');
    bad({ ...base, fbBiasCurrent: V(1e-6), fbBiasDirection: 'into-pin' }, 'DIMENSION', 'fbBiasCurrent');
  });
  it('underflow to zero is rejected like zero', () => {
    bad({ ...base, r1: R(0) }, 'INVALID_INPUT', 'r1');
    bad({ ...base, r1: q(Number.MIN_VALUE / 2, DIM.RESISTANCE) }, 'INVALID_INPUT', 'r1');
  });
  it('exactly two of r1, r2, vout: zero or one given, or three given (consistent or not) is rejected with a clear message', () => {
    expect(bad({ vref: V(0.8) }, 'INVALID_INPUT', 'inputs')).toContain('exactly two');
    bad({ vref: V(0.8), r1: R(1e3) }, 'INVALID_INPUT', 'inputs');
    bad({ vref: V(0.8), r2: R(1e3) }, 'INVALID_INPUT', 'inputs');
    expect(bad({ ...base, vout: V(8.8) }, 'INVALID_INPUT', 'inputs')).toContain('over-specified');
    expect(bad({ ...base, vout: V(8.8) }, 'INVALID_INPUT', 'inputs')).not.toContain('inconsistent');
    expect(bad({ ...base, vout: V(5) }, 'INVALID_INPUT', 'inputs')).toContain('inconsistent');
  });
  it('vout alone needs a series; a series with no unknown resistor is rejected', () => {
    bad({ vref: V(0.8), vout: V(3.3) }, 'INVALID_INPUT', 'series');
    bad({ ...base, series: 'E24' }, 'INVALID_INPUT', 'series');
    bad({ vref: V(0.8), r1: R(1e3), series: 'E24' }, 'INVALID_INPUT', 'inputs');
  });
  it('vout must be above vref when solving or searching; an equal or lower vout is OUT_OF_DOMAIN', () => {
    for (const t of [0.8, 0.5]) {
      bad({ vref: V(0.8), vout: V(t), r2: R(10e3) }, 'OUT_OF_DOMAIN', 'vout');
      bad({ vref: V(0.8), vout: V(t), r1: R(10e3) }, 'OUT_OF_DOMAIN', 'vout');
      bad({ vref: V(0.8), vout: V(t), series: 'E24' }, 'OUT_OF_DOMAIN', 'vout');
    }
  });
  it('enums, counts, fractions and notes are validated', () => {
    bad({ ...base, series: 'E7' }, 'INVALID_INPUT', 'series');
    bad({ vref: V(0.8), vout: V(3.3), r2: R(10e3), series: 'E24', snap: 'round' }, 'INVALID_INPUT', 'snap');
    for (const p of [0, 11, 2.5, Number.NaN, '5']) bad({ vref: V(0.8), vout: V(3.3), series: 'E24', pairs: p }, 'INVALID_INPUT', 'pairs');
    for (const t of [-0.01, 0.5, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      bad({ ...base, tolerance: frac(t) }, 'INVALID_INPUT', 'tolerance');
      bad({ ...base, vrefTolerance: frac(t) }, 'INVALID_INPUT', 'vrefTolerance');
    }
    bad({ ...base, tolerance: V(0.01) }, 'DIMENSION', 'tolerance');
    bad({ ...base, vrefSource: 42 }, 'INVALID_INPUT', 'vrefSource');
    bad({ ...base, vrefSource: 'a\nb' }, 'INVALID_INPUT', 'vrefSource');
    bad({ ...base, vrefSource: 'x'.repeat(201) }, 'INVALID_INPUT', 'vrefSource');
    bad(null, 'INVALID_INPUT', 'inputs');
    bad('x', 'INVALID_INPUT', 'inputs');
  });
  it('the bias direction is required with a current, never defaulted, and not allowed alone', () => {
    bad({ ...base, fbBiasCurrent: I(50e-9) }, 'INVALID_INPUT', 'fbBiasDirection');
    bad({ ...base, fbBiasCurrent: I(50e-9), fbBiasDirection: 'both' }, 'INVALID_INPUT', 'fbBiasDirection');
    bad({ ...base, fbBiasDirection: 'into-pin' }, 'INVALID_INPUT', 'fbBiasDirection');
  });
  it('a bias that pulls Vout to zero or below is OUT_OF_DOMAIN', () => {
    bad({ vref: V(0.8), r1: R(100e3), r2: R(10e3), fbBiasCurrent: I(1), fbBiasDirection: 'out-of-pin' }, 'OUT_OF_DOMAIN', 'fbBiasCurrent');
  });
  it('overflow and underflow are error values, never Infinity or NaN', () => {
    bad({ vref: V(Number.MAX_VALUE), r1: R(Number.MAX_VALUE), r2: R(1e-300) }, 'OUT_OF_DOMAIN');
    bad({ vref: V(1), vout: V(1e300), r2: R(1e300) }, 'OUT_OF_DOMAIN');
    bad({ vref: V(1), vout: V(1e12), r2: R(1e12), series: 'E24' }, 'OUT_OF_DOMAIN');
  });
  it('a solved resistor beyond the series range cannot be snapped', () => {
    bad({ vref: V(1), vout: V(1e15), r2: R(1e9), series: 'E24' }, 'OUT_OF_DOMAIN', 'r1');
  });
});

describe('properties (fast-check)', () => {
  const dec = (lo: number, hi: number) => fc.double({ min: lo, max: hi, noNaN: true }).map((e) => 10 ** e);
  const vrefA = dec(-1, 1); // 0.1 .. 10 V
  const rA = dec(2, 6); // 100 ohm .. 1 Mohm
  const ratio = fc.double({ min: 1.05, max: 50, noNaN: true });
  const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

  it('round trip: solve R1 for a target, then compute Vout from that R1, returns the target (1e-12)', () => {
    fc.assert(
      fc.property(vrefA, rA, ratio, (vref, r2, k) => {
        const target = vref * k;
        const a = ok({ vref: V(vref), vout: V(target), r2: R(r2) });
        const b = ok({ vref: V(vref), r1: R(si(a, 'r1')), r2: R(r2) });
        expect(rel(si(b, 'vout'), target)).toBeLessThanOrEqual(1e-12);
        const c = ok({ vref: V(vref), vout: V(target), r1: R(si(a, 'r1')) });
        expect(rel(si(c, 'r2'), r2)).toBeLessThanOrEqual(1e-12);
      }),
      { numRuns: 300 },
    );
  });
  it('Vout is above Vref, rises with R1, falls with R2 and is scale-free in the resistor pair (only the ratio matters)', () => {
    fc.assert(
      fc.property(vrefA, rA, rA, fc.double({ min: 1.01, max: 5, noNaN: true }), (vref, r1, r2, f) => {
        const base = si(ok({ vref: V(vref), r1: R(r1), r2: R(r2) }), 'vout');
        expect(base).toBeGreaterThan(vref);
        expect(si(ok({ vref: V(vref), r1: R(r1 * f), r2: R(r2) }), 'vout')).toBeGreaterThan(base);
        expect(si(ok({ vref: V(vref), r1: R(r1), r2: R(r2 * f) }), 'vout')).toBeLessThan(base);
        expect(rel(si(ok({ vref: V(vref), r1: R(r1 * f), r2: R(r2 * f) }), 'vout'), base)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
  it('snapped Vout error: up/down bracket the target (up gives Vout above the target for R1, below for R2); nearest is the smaller of the two', () => {
    fc.assert(
      fc.property(vrefA, rA, ratio, fc.constantFrom<Series>('E24', 'E96', 'E192'), (vref, r2, k, s) => {
        const target = vref * k;
        const up = ok({ vref: V(vref), vout: V(target), r2: R(r2), series: s, snap: 'up' });
        const down = ok({ vref: V(vref), vout: V(target), r2: R(r2), series: s, snap: 'down' });
        const near = ok({ vref: V(vref), vout: V(target), r2: R(r2), series: s, snap: 'nearest' });
        expect(si(up, 'vout error vs target')).toBeGreaterThanOrEqual(-1e-12);
        expect(si(down, 'vout error vs target')).toBeLessThanOrEqual(1e-12);
        const e = (x: CalcResult): number => Math.abs(si(x, 'r1') - si(x, 'ideal r1'));
        expect(e(near)).toBeLessThanOrEqual(Math.min(e(up), e(down)) * (1 + 1e-12));
        // the series error stays below the widest E24 gap (about 5 %) for R1, so Vout stays within 5 % x (Vout/Vref - 1)/(Vout/Vref)
        expect(Math.abs(si(near, 'vout error vs target'))).toBeLessThan(0.06);
      }),
      { numRuns: 200 },
    );
  });
  it('envelope brackets the nominal and equals the closed-form extremes (R1 high, R2 low, Vref high)', () => {
    fc.assert(
      fc.property(vrefA, rA, rA, fc.double({ min: 0, max: 0.2, noNaN: true }), fc.double({ min: 0, max: 0.2, noNaN: true }), (vref, r1, r2, t, vt) => {
        const r = ok({ vref: V(vref), r1: R(r1), r2: R(r2), tolerance: frac(t), vrefTolerance: frac(vt) });
        const e = r.envelope?.[0];
        const lo = vref * (1 - vt) * (1 + (r1 * (1 - t)) / (r2 * (1 + t)));
        const hi = vref * (1 + vt) * (1 + (r1 * (1 + t)) / (r2 * (1 - t)));
        expect(rel(e?.min.si ?? 0, lo)).toBeLessThanOrEqual(1e-12);
        expect(rel(e?.max.si ?? 0, hi)).toBeLessThanOrEqual(1e-12);
        expect(e?.min.si).toBeLessThanOrEqual(si(r, 'vout'));
        expect(e?.max.si).toBeGreaterThanOrEqual(si(r, 'vout'));
      }),
    );
  });
  it('bias shift is signed, linear in Ib and R1, and the two directions are mirror images', () => {
    fc.assert(
      fc.property(vrefA, rA, rA, dec(-9, -6), (vref, r1, r2, ib) => {
        const a = ok({ vref: V(vref), r1: R(r1), r2: R(r2), fbBiasCurrent: I(ib), fbBiasDirection: 'into-pin' });
        const b = ok({ vref: V(vref), r1: R(r1), r2: R(r2), fbBiasCurrent: I(ib), fbBiasDirection: 'out-of-pin' });
        expect(rel(si(a, 'fb bias shift'), ib * r1)).toBeLessThanOrEqual(1e-12);
        expect(si(b, 'fb bias shift')).toBe(-si(a, 'fb bias shift'));
        expect(rel(si(a, 'divider current / fb bias current'), vref / r2 / ib)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
  it('best pairs: sorted by divider-ratio error, every pair within the window, first pair never worse than the single-resistor snap error ratio', () => {
    fc.assert(
      fc.property(vrefA, ratio, fc.constantFrom<'E24' | 'E96'>('E24', 'E96'), (vref, k, s) => {
        const target = vref * k;
        const r = ok({ vref: V(vref), vout: V(target), series: s });
        let prev = -1;
        for (let n = 1; n <= 5; n++) {
          const r1 = si(r, `pair ${String(n)} r1`);
          const r2 = si(r, `pair ${String(n)} r2`);
          const ratioErr = Math.abs((r2 / (r1 + r2) - vref / target) / (vref / target));
          expect(ratioErr + 1e-12).toBeGreaterThanOrEqual(prev);
          prev = ratioErr;
        }
      }),
      { numRuns: 50 },
    );
  });
  it('no NaN or Infinity anywhere for in-range inputs; deterministic; inputs never mutated', () => {
    fc.assert(
      fc.property(vrefA, rA, rA, (vref, r1, r2) => {
        const input: Inputs = { vref: V(vref), r1: R(r1), r2: R(r2), tolerance: frac(0.01) };
        const before = JSON.stringify(input);
        const a = compute(input);
        const b = compute(input);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(JSON.stringify(input)).toBe(before);
        const r = ok(input);
        for (const o of r.results) expect(Number.isFinite(o.value.si)).toBe(true);
        for (const s of r.steps) expect(Number.isFinite(s.value.si)).toBe(true);
        expect(Number.isFinite(r.confidence.score)).toBe(true);
      }),
    );
  });
});

describe('wording, performance, meta', () => {
  it('no compliance or readiness claim anywhere in a result', () => {
    expectNoClaimWording(ok({ vref: V(0.8), vout: V(3.3), r2: R(10e3), series: 'E24', tolerance: frac(0.01), fbBiasCurrent: I(50e-9), fbBiasDirection: 'into-pin' }));
  });
  it('10 000 computes take under 1 s in total', () => {
    const input: Inputs = { vref: V(0.8), vout: V(3.3), r2: R(10e3), series: 'E96', tolerance: frac(0.01) };
    compute(input);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(input).ok) n++;
    expect(n).toBe(10_000);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  it('a pair search stays interactive: E96 under 0.5 s and E192 under 5 s per search even with coverage instrumentation (run it in a worker from the UI)', () => {
    for (const [series, limitMs] of [['E96', 500], ['E192', 5000]] as const) {
      const t0 = performance.now();
      expect(compute({ vref: V(0.8), vout: V(3.3), series }).ok).toBe(true);
      expect(performance.now() - t0, series).toBeLessThan(limitMs);
    }
  });
  it('meta: formula text from meta.formula, ledger rows exist, accuracy class exact, tolerance inputs listed', () => {
    for (const s of ['Vout = Vref × (1 + R1 / R2)', 'R1 (top)', 'R2 (bottom)', 'Ib × R1']) expect(meta.formula).toContain(s);
    const r = ok({ vref: V(0.8), r1: R(100e3), r2: R(10e3) });
    expect(r.formula).toBe(meta.formula);
    expect(r.method).toBe(meta.method);
    expect(meta.id).toBe('feedback-divider');
    expect(meta.accuracyClass).toBe('exact');
    expect([...meta.ledgerIds]).toEqual(['S-019', 'S-016']);
    for (const id of meta.ledgerIds) expect(LEDGER.some((x) => x.id === id), id).toBe(true);
    expect(meta.toleranceInputs).toEqual(['r1', 'r2', 'vref']);
    expect(meta.pairWindow).toEqual({ lowDecade: 3, decades: 3 });
  });
});
