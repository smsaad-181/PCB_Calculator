import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q, sameDim } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import { LEDGER } from '../../data/ledger';
import type { CalcResult } from '../../result';
import { nearest } from '../../eseries';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 1 task 8, calculator 2 of 2: resistor divider (loaded, tolerance envelope, E-series snapping). TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py: divider_vout, divider_solve_r1/r2,
// divider_currents_powers, divider_envelope, divider_snap, eseries_nearest; vectors divider_* in docs/golden-vectors.json) or
// from the textbook formulas restated below. The implementation is never consulted. Nothing here verifies ledger S-016
// (E-series lists, PAYWALLED-USER-MUST-VERIFY): snapping rests on those lists and the result says so.
//
// CONTRACT pinned here (guards.test.ts and result.test.ts add the rest):
//  Inputs { solveFor: 'vout'|'r1'|'r2' (REQUIRED), vin, r1?, r2?, target?, load?, series?, snap?, tolerance?, vinTolerance? }.
//   solveFor 'vout' needs vin, r1, r2. 'r1' needs vin, target (Vout wanted), r2. 'r2' needs vin, target, r1.
//   With a load RL across r2, the solve ACCOUNTS FOR THE LOAD: the solved resistor makes the LOADED Vout equal the target
//   (Vout = Vin Re/(R1 + Re), Re = R2 || RL). series 'E24'|'E96'|'E192'|'none' (default none), snap 'nearest'|'up'|'down'
//   (default nearest); a solved resistor is snapped to the series (nearest/up/down of the exact solved value) and every
//   other number (vout, currents, powers, envelope) is computed from the snapped value. 'series' and 'snap' are NOT inputs[]
//   entries (inputs[] holds quantities only); the assumptions text states them.
//  Results (names exact): 'vout', 'r1', 'r2', 'divider current', 'power in r1', 'power in r2', 'total power',
//   'output impedance' ALWAYS; plus 'vout unloaded' and 'power in load' when a load is given; plus 'vout error vs target' and
//   'ideal r1' | 'ideal r2' (the exact solved value before snapping) when a series is used.
//   Primary (exactly one): vout for solveFor vout, else the solved resistor ('r1' or 'r2'). Everything else secondary.
//   Bounds: vout, r1, r2, ideal r*, vout unloaded, output impedance, vout error vs target: 'nominal'; divider current, all
//   powers: 'prediction' (print rounded up). r1/r2 results are the USED values (snapped when snapped).
//   divider current = current through r1 = (Vin - Vout)/R1 (includes the load current); power in r1 = I^2 R1;
//   power in r2 = Vout^2/R2; power in load = Vout^2/RL; total power = Vin x I(r1) = r1 + r2 + load powers;
//   output impedance = R1 || R2 (load not included); vout error vs target = (Vout - target)/target as a signed DIMENSIONLESS fraction.
//  Envelope (tolerance and/or vinTolerance given): one entry named 'vout', corners of R(1 +- tolerance) over r1, r2 (and load, same
//   fraction) and Vin(1 +- vinTolerance); typ = nominal Vout; toleranceInputs lists the inputs that carry a tolerance, in the order
//   'r1', 'r2', 'load' (a load given), all three only when `tolerance` is given, then 'vin' when `vinTolerance` is given
//   (vinTolerance alone gives ['vin'] and resistors at their exact values). No tolerance and no vinTolerance: no envelope entry.

interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
  ledger_ids: string[];
  status: string;
}
const goldenFiles = import.meta.glob('../../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const goldenText = Object.values(goldenFiles)[0];
const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;
const vec = (name: string): GoldenVector => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found (${String(vectors.length)} vectors loaded)`);
  return v;
};
const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const R = (n: number): Quantity => q(n, DIM.RESISTANCE);
const frac = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
/** Relative error; an expected value of exactly 0 falls back to an absolute 1e-12. */
const err = (a: number, b: number): number => (b === 0 ? Math.abs(a) * 1e12 : Math.abs(a - b) / Math.abs(b));
const TOL = 1e-9;

type Series = 'E24' | 'E96' | 'E192';
type Snap = 'nearest' | 'up' | 'down';
const SERIES: Series[] = ['E24', 'E96', 'E192'];
const SNAPS: Snap[] = ['nearest', 'up', 'down'];

// Case tables mirror tools/reference/ref_calcs.py (vector names use the case index).
const DIV_UNLOADED: [number, number, number][] = [[5, 10e3, 10e3], [12, 47e3, 10e3], [3.3, 2.2e3, 1e3], [24, 100e3, 6.8e3], [48, 220e3, 4.7e3], [1.8, 1e3, 2e3]];
const DIV_LOADED: [number, number, number, number][] = [[5, 10e3, 10e3, 100e3], [12, 47e3, 10e3, 10e3], [3.3, 2.2e3, 1e3, 4.7e3], [24, 100e3, 6.8e3, 1e6], [5, 1e3, 1e3, 1e3]];
const DIV_SOLVE_R1: [number, number, number, number | undefined][] = [[12, 3.3, 10e3, undefined], [5, 1.8, 10e3, undefined], [24, 5, 4.7e3, undefined], [3.3, 1.25, 10e3, undefined], [12, 3.3, 10e3, 100e3]];
const DIV_SOLVE_R2: [number, number, number, number | undefined][] = [[12, 3.3, 47e3, undefined], [5, 3.3, 10e3, undefined], [24, 5, 100e3, undefined], [5, 2.5, 10e3, 100e3]];
const DIV_POWER: [number, number, number, number | undefined][] = [[12, 47e3, 10e3, undefined], [12, 47e3, 10e3, 100e3], [5, 330, 330, undefined]];
const DIV_SNAP_CASES: ['r1' | 'r2', number, number, number][] = [['r1', 12, 3.3, 10e3], ['r2', 12, 3.3, 47e3]];
const DIV_ENV: [number, number, number, number | undefined, number, number][] = [
  [5, 10e3, 10e3, undefined, 0.01, 0],
  [12, 47e3, 10e3, undefined, 0.05, 0],
  [12, 47e3, 10e3, 100e3, 0.01, 0.02],
  [3.3, 2.2e3, 1e3, 4.7e3, 0.001, 0],
  [5, 10e3, 10e3, undefined, 0.1, 0.05],
];

// Restated textbook formulas (test side).
const par = (a: number, b: number): number => (a * b) / (a + b);
const vdiv = (vin: number, r1: number, r2: number, rl?: number): number => {
  const re = rl === undefined ? r2 : par(r2, rl);
  return (vin * re) / (r1 + re);
};

const withLoad = (rl: number | undefined): Partial<Inputs> => (rl === undefined ? {} : { load: R(rl) });
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
const si = (r: CalcResult, name: string): number => res(r, name).value.si;
const has = (r: CalcResult, name: string): boolean => r.results.some((o) => o.name === name);

const BASE = ['vout', 'r1', 'r2', 'divider current', 'power in r1', 'power in r2', 'total power', 'output impedance'];

describe('golden vectors (oracle): unloaded and loaded forward divider', () => {
  it('vectors loaded: ledger S-019, VERIFIED, tolerance 1e-9', () => {
    for (const v of vectors.filter((x) => /^divider_(unloaded|loaded|solve|power|env)/.test(x.name))) {
      expect(v.ledger_ids).toEqual(['S-019']);
      expect(v.status).toBe('VERIFIED');
      expect(v.rel_tol).toBeLessThanOrEqual(TOL);
    }
    for (const v of vectors.filter((x) => x.name.startsWith('divider_snap_'))) {
      expect(v.ledger_ids).toEqual(['S-019', 'S-016']);
      expect(v.status).toBe('PAYWALLED-USER-MUST-VERIFY');
    }
  });
  DIV_UNLOADED.forEach(([vin, r1, r2], ci) => {
    it(`unloaded case ${String(ci)}: ${String(vin)} V, ${String(r1)} / ${String(r2)} ohm`, () => {
      const r = ok(fwd(vin, r1, r2));
      expect(err(si(r, 'vout'), vec(`divider_unloaded_c${String(ci)}_vout_V`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(err(si(r, 'vout'), vdiv(vin, r1, r2))).toBeLessThanOrEqual(1e-12);
      expect(res(r, 'vout').role).toBe('primary');
      expect(res(r, 'vout').bound).toBe('nominal');
      expect(sameDim(res(r, 'vout').value, V(1))).toBe(true);
      expect([...r.results.map((x) => x.name)].sort()).toEqual([...BASE].sort());
      expect(si(r, 'r1')).toBe(r1);
      expect(si(r, 'r2')).toBe(r2);
    });
  });
  DIV_LOADED.forEach(([vin, r1, r2, rl], ci) => {
    it(`loaded case ${String(ci)}: ${String(vin)} V, ${String(r1)} / ${String(r2)} ohm, load ${String(rl)} ohm`, () => {
      const r = ok(fwd(vin, r1, r2, { load: R(rl) }));
      expect(err(si(r, 'vout'), vec(`divider_loaded_c${String(ci)}_vout_V`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(err(si(r, 'vout unloaded'), vdiv(vin, r1, r2))).toBeLessThanOrEqual(1e-12);
      expect(si(r, 'vout')).toBeLessThan(si(r, 'vout unloaded'));
      expect([...r.results.map((x) => x.name)].sort()).toEqual([...BASE, 'vout unloaded', 'power in load'].sort());
      expect(res(r, 'vout unloaded').role).toBe('secondary');
      expect(res(r, 'vout unloaded').bound).toBe('nominal');
      expect(si(r, 'r2')).toBe(r2); // r2 is the resistor, not r2 || load
    });
  });
});

describe('golden vectors (oracle): solving for r1 or r2 (the load, when given, is accounted for)', () => {
  DIV_SOLVE_R1.forEach(([vin, target, r2, rl], ci) => {
    it(`solve r1 case ${String(ci)}: ${String(vin)} V -> ${String(target)} V, r2 ${String(r2)}${rl === undefined ? '' : `, load ${String(rl)}`}`, () => {
      const r = ok(solve1(vin, target, r2, withLoad(rl)));
      expect(err(si(r, 'r1'), vec(`divider_solve_r1_c${String(ci)}_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(r.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual(['r1']);
      expect(res(r, 'r1').bound).toBe('nominal');
      expect(res(r, 'vout').role).toBe('secondary');
      expect(err(si(r, 'vout'), target)).toBeLessThanOrEqual(1e-9); // the solved resistor delivers the target (loaded when a load is given)
      expect(si(r, 'r2')).toBe(r2);
      expect(has(r, 'vout error vs target')).toBe(false);
      expect(has(r, 'ideal r1')).toBe(false);
      expect(r.inputs.map((i) => i.name).sort()).toEqual(['r2', 'target', 'vin', ...(rl === undefined ? [] : ['load'])].sort());
    });
  });
  DIV_SOLVE_R2.forEach(([vin, target, r1, rl], ci) => {
    it(`solve r2 case ${String(ci)}: ${String(vin)} V -> ${String(target)} V, r1 ${String(r1)}${rl === undefined ? '' : `, load ${String(rl)}`}`, () => {
      const r = ok(solve2(vin, target, r1, withLoad(rl)));
      expect(err(si(r, 'r2'), vec(`divider_solve_r2_c${String(ci)}_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(r.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual(['r2']);
      expect(res(r, 'r2').bound).toBe('nominal');
      expect(res(r, 'vout').role).toBe('secondary');
      expect(err(si(r, 'vout'), target)).toBeLessThanOrEqual(1e-9);
      expect(si(r, 'r1')).toBe(r1);
      expect(r.inputs.map((i) => i.name).sort()).toEqual(['r1', 'target', 'vin', ...(rl === undefined ? [] : ['load'])].sort());
    });
  });
});

describe('golden vectors (oracle): current and powers', () => {
  DIV_POWER.forEach(([vin, r1, r2, rl], ci) => {
    it(`case ${String(ci)}: ${String(vin)} V, ${String(r1)} / ${String(r2)} ohm${rl === undefined ? '' : `, load ${String(rl)}`}`, () => {
      const r = ok(fwd(vin, r1, r2, withLoad(rl)));
      const get = (k: string, u: string): number => vec(`divider_power_c${String(ci)}_${k}_${u}`).pinned_expected;
      expect(err(si(r, 'divider current'), get('i', 'A'))).toBeLessThanOrEqual(TOL);
      expect(err(si(r, 'power in r1'), get('p_r1', 'W'))).toBeLessThanOrEqual(TOL);
      expect(err(si(r, 'power in r2'), get('p_r2', 'W'))).toBeLessThanOrEqual(TOL);
      expect(err(si(r, 'total power'), get('p_total', 'W'))).toBeLessThanOrEqual(TOL);
      expect(err(si(r, 'output impedance'), get('rout', 'ohm'))).toBeLessThanOrEqual(TOL);
      if (rl !== undefined) expect(err(si(r, 'power in load'), get('p_load', 'W'))).toBeLessThanOrEqual(TOL);
      expect(sameDim(res(r, 'divider current').value, q(1, DIM.CURRENT))).toBe(true);
      for (const n of ['power in r1', 'power in r2', 'total power']) {
        expect(sameDim(res(r, n).value, q(1, DIM.POWER))).toBe(true);
        expect(res(r, n).bound, n).toBe('prediction');
        expect(res(r, n).role, n).toBe('secondary');
      }
      expect(res(r, 'divider current').bound).toBe('prediction');
      expect(sameDim(res(r, 'output impedance').value, R(1))).toBe(true);
      expect(res(r, 'output impedance').bound).toBe('nominal');
      if (rl !== undefined) expect(res(r, 'power in load').bound).toBe('prediction');
    });
  });
});

describe('golden vectors (oracle): snapping the solved resistor to E24 / E96 / E192 (nearest, up, down)', () => {
  DIV_SNAP_CASES.forEach(([kind, vin, target, other], ci) => {
    for (const s of SERIES) {
      for (const m of SNAPS) {
        it(`case ${String(ci)} (${kind}): ${s}, ${m}`, () => {
          const extra: Partial<Inputs> = { series: s, snap: m };
          const r = ok(kind === 'r1' ? solve1(vin, target, other, extra) : solve2(vin, target, other, extra));
          const tag = `divider_snap_c${String(ci)}_${s}_${m}`;
          const snapped = vec(`${tag}_ohm`).pinned_expected;
          // the snapped value is the double nearest the decimal series value: exact equality, not a tolerance
          expect(Object.is(si(r, kind), snapped), `${kind} ${String(si(r, kind))} vs ${String(snapped)}`).toBe(true);
          expect(err(si(r, 'vout'), vec(`${tag}_vout_V`).pinned_expected)).toBeLessThanOrEqual(TOL);
          expect(err(si(r, 'vout error vs target'), vec(`${tag}_err_frac`).pinned_expected)).toBeLessThanOrEqual(TOL);
          // the exact solved value is kept as a secondary result
          const ideal = kind === 'r1' ? (other * (vin - target)) / target : (other * target) / (vin - target);
          expect(err(si(r, `ideal ${kind}`), ideal)).toBeLessThanOrEqual(1e-12);
          expect(res(r, `ideal ${kind}`).role).toBe('secondary');
          expect(res(r, `ideal ${kind}`).bound).toBe('nominal');
          expect(res(r, 'vout error vs target').bound).toBe('nominal');
          expect(sameDim(res(r, 'vout error vs target').value, frac(1))).toBe(true);
          expect(r.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual([kind]);
          expect([...r.results.map((x) => x.name)].sort()).toEqual([...BASE, 'vout error vs target', `ideal ${kind}`].sort());
          // direction: up never goes below the exact value, down never above
          if (m === 'up') expect(si(r, kind)).toBeGreaterThanOrEqual(ideal * (1 - 1e-9));
          if (m === 'down') expect(si(r, kind)).toBeLessThanOrEqual(ideal * (1 + 1e-9));
        });
      }
    }
  });
  it('snap defaults to nearest when only the series is given; series none (explicit or default) is the exact solve with no error result', () => {
    const a = ok(solve1(12, 3.3, 10e3, { series: 'E96' }));
    const b = ok(solve1(12, 3.3, 10e3, { series: 'E96', snap: 'nearest' }));
    expect(si(a, 'r1')).toBe(si(b, 'r1'));
    for (const extra of [{ series: 'none' as const }, {}, { series: 'none' as const, snap: 'up' as const }]) {
      const c = ok(solve1(12, 3.3, 10e3, extra));
      expect(err(si(c, 'r1'), 10e3 * (12 - 3.3) / 3.3)).toBeLessThanOrEqual(1e-12);
      expect(has(c, 'vout error vs target')).toBe(false);
      expect(has(c, 'ideal r1')).toBe(false);
    }
  });
  it('the worked example: 12 V to 3.3 V with r2 = 10 k needs 26.36 k; E24 nearest 27 k gives 3.2432 V (-1.72 %), E96 nearest 26.1 k', () => {
    const e24 = ok(solve1(12, 3.3, 10e3, { series: 'E24' }));
    expect(si(e24, 'r1')).toBe(27000);
    expect(err(si(e24, 'vout'), 12 * 10 / 37)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(si(e24, 'vout error vs target') - ((12 * 10) / 37 - 3.3) / 3.3)).toBeLessThanOrEqual(1e-12);
    expect(si(e24, 'vout error vs target')).toBeLessThan(0);
    expect(si(ok(solve1(12, 3.3, 10e3, { series: 'E96' })), 'r1')).toBe(26100);
  });
  it('with a load and a series: the exact value is solved WITH the load, then snapped, then Vout is the loaded Vout of the snapped value', () => {
    const r = ok(solve2(5, 2.5, 10e3, { load: R(100e3), series: 'E24', snap: 'up' }));
    const ideal = 1 / (1 / 10e3 - 1 / 100e3); // Re = 10 k needs R2 || 100 k = 10 k -> R2 = 11.11 k
    expect(err(si(r, 'ideal r2'), ideal)).toBeLessThanOrEqual(1e-9);
    const snapped = si(r, 'r2');
    expect(snapped).toBe(12000); // next E24 value at or above 11 111 ohm
    expect(err(si(r, 'vout'), vdiv(5, 10e3, snapped, 100e3))).toBeLessThanOrEqual(1e-12);
    expect(err(si(r, 'vout error vs target'), (vdiv(5, 10e3, snapped, 100e3) - 2.5) / 2.5)).toBeLessThanOrEqual(1e-9);
  });
  it('a resistor already in the series snaps to itself with (almost) zero error: 10 k from 5 V to 2.5 V with r2 = 10 k', () => {
    const r = ok(solve1(5, 2.5, 10e3, { series: 'E96', snap: 'down' }));
    expect(si(r, 'r1')).toBe(10000);
    expect(Math.abs(si(r, 'vout error vs target'))).toBeLessThanOrEqual(1e-12);
  });
});

describe('golden vectors (oracle): tolerance envelope by corner analysis', () => {
  DIV_ENV.forEach(([vin, r1, r2, rl, tol, vtol], ci) => {
    it(`case ${String(ci)}: ${String(vin)} V, ${String(r1)} / ${String(r2)}${rl === undefined ? '' : `, load ${String(rl)}`}, +-${String(tol * 100)} %${vtol > 0 ? `, Vin +-${String(vtol * 100)} %` : ''}`, () => {
      const extra: Partial<Inputs> = { tolerance: frac(tol), ...withLoad(rl), ...(vtol > 0 ? { vinTolerance: frac(vtol) } : {}) };
      const r = ok(fwd(vin, r1, r2, extra));
      expect(r.envelope).toBeDefined();
      expect(r.envelope).toHaveLength(1);
      const e = (r.envelope ?? [])[0];
      expect(e?.name).toBe('vout');
      expect(e?.toleranceInputs).toEqual(['r1', 'r2', ...(rl === undefined ? [] : ['load']), ...(vtol > 0 ? ['vin'] : [])]);
      expect(err(e?.min.si ?? NaN, vec(`divider_env_c${String(ci)}_min_V`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(err(e?.max.si ?? NaN, vec(`divider_env_c${String(ci)}_max_V`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(err(e?.typ.si ?? NaN, si(r, 'vout'))).toBeLessThanOrEqual(1e-12);
      expect(e?.min.si).toBeLessThanOrEqual(e?.typ.si ?? NaN);
      expect(e?.typ.si).toBeLessThanOrEqual(e?.max.si ?? NaN);
      for (const x of [e?.min, e?.typ, e?.max]) expect(x !== undefined && sameDim(x, V(1))).toBe(true);
      expect(r.inputs.find((i) => i.name === 'tolerance')?.value.si).toBe(tol);
      if (vtol > 0) expect(r.inputs.find((i) => i.name === 'vinTolerance')?.value.si).toBe(vtol);
    });
  });
  it('no tolerance and no vinTolerance: no envelope; vinTolerance alone: envelope over vin only; tolerance 0: a degenerate envelope', () => {
    expect(ok(fwd(5, 10e3, 10e3)).envelope ?? []).toEqual([]);
    const v = ok(fwd(10, 10e3, 10e3, { vinTolerance: frac(0.02) }));
    expect(v.envelope).toHaveLength(1);
    expect(v.envelope?.[0]?.toleranceInputs).toEqual(['vin']);
    expect(err(v.envelope?.[0]?.min.si ?? NaN, 4.9)).toBeLessThanOrEqual(1e-12);
    expect(err(v.envelope?.[0]?.max.si ?? NaN, 5.1)).toBeLessThanOrEqual(1e-12);
    const z = ok(fwd(10, 10e3, 10e3, { tolerance: frac(0) }));
    expect(z.envelope).toHaveLength(1);
    expect(z.envelope?.[0]?.min.si).toBe(z.envelope?.[0]?.typ.si);
    expect(z.envelope?.[0]?.max.si).toBe(z.envelope?.[0]?.typ.si);
  });
  it('hand-checkable: 10 k / 10 k from 10 V at +-1 % has Vout between 4.9751 V and 5.0249 V (corners 9.9 k / 10.1 k and 10.1 k / 9.9 k)', () => {
    const e = ok(fwd(10, 10e3, 10e3, { tolerance: frac(0.01) })).envelope?.[0];
    expect(err(e?.min.si ?? NaN, (10 * 9.9) / 20)).toBeLessThanOrEqual(1e-12);
    expect(err(e?.max.si ?? NaN, (10 * 10.1) / 20)).toBeLessThanOrEqual(1e-12);
  });
  it('the envelope of a solved and snapped divider is built around the USED (snapped) resistors, and contains the nominal Vout', () => {
    const r = ok(solve1(12, 3.3, 10e3, { series: 'E24', tolerance: frac(0.01) }));
    const used = si(r, 'r1');
    const e = r.envelope?.[0];
    expect(err(e?.typ.si ?? NaN, vdiv(12, used, 10e3))).toBeLessThanOrEqual(1e-12);
    expect(err(e?.min.si ?? NaN, vdiv(12, used * 1.01, 10e3 * 0.99))).toBeLessThanOrEqual(1e-12);
    expect(err(e?.max.si ?? NaN, vdiv(12, used * 0.99, 10e3 * 1.01))).toBeLessThanOrEqual(1e-12);
  });
});

describe('properties (fast-check)', () => {
  const vinArb = fc.double({ min: 0.5, max: 100, noNaN: true });
  const rArb = fc.double({ min: 1, max: 7, noNaN: true }).map((e) => 10 ** e);
  const fracArb = fc.double({ min: 0.05, max: 0.95, noNaN: true });
  const tolArb = fc.double({ min: 0, max: 0.2, noNaN: true });

  it('forward Vout matches the formula (1e-12), lies strictly between 0 and Vin, and is the loaded value with a load', () => {
    fc.assert(
      fc.property(vinArb, rArb, rArb, rArb, (vin, r1, r2, rl) => {
        const a = ok(fwd(vin, r1, r2));
        expect(err(si(a, 'vout'), vdiv(vin, r1, r2))).toBeLessThanOrEqual(1e-12);
        expect(si(a, 'vout')).toBeGreaterThan(0);
        expect(si(a, 'vout')).toBeLessThan(vin);
        const b = ok(fwd(vin, r1, r2, { load: R(rl) }));
        expect(err(si(b, 'vout'), vdiv(vin, r1, r2, rl))).toBeLessThanOrEqual(1e-12);
        expect(si(b, 'vout')).toBeLessThanOrEqual(si(a, 'vout')); // a load never raises the output
        expect(si(b, 'vout')).toBeGreaterThan(0);
      }),
      { numRuns: 300 },
    );
  });
  it('monotonic: more r2 raises Vout, more r1 lowers it, a heavier load (smaller RL) lowers it, more Vin raises it', () => {
    fc.assert(
      fc.property(vinArb, rArb, rArb, rArb, fc.double({ min: 1.01, max: 4, noNaN: true }), (vin, r1, r2, rl, f) => {
        expect(si(ok(fwd(vin, r1, r2 * f)), 'vout')).toBeGreaterThan(si(ok(fwd(vin, r1, r2)), 'vout'));
        expect(si(ok(fwd(vin, r1 * f, r2)), 'vout')).toBeLessThan(si(ok(fwd(vin, r1, r2)), 'vout'));
        expect(si(ok(fwd(vin, r1, r2, { load: R(rl) })), 'vout')).toBeLessThanOrEqual(si(ok(fwd(vin, r1, r2, { load: R(rl * f) })), 'vout'));
        expect(si(ok(fwd(vin * f, r1, r2)), 'vout')).toBeGreaterThan(si(ok(fwd(vin, r1, r2)), 'vout'));
      }),
    );
  });
  it('solving then going forward returns the target (1e-9), with and without a load, for r1 and for r2', () => {
    fc.assert(
      fc.property(vinArb, fracArb, rArb, fc.option(rArb, { nil: undefined }), (vin, k, other, rl) => {
        const target = vin * k;
        const a = ok(solve1(vin, target, other, withLoad(rl)));
        expect(err(vdiv(vin, si(a, 'r1'), other, rl), target)).toBeLessThanOrEqual(1e-9);
        expect(err(si(a, 'vout'), target)).toBeLessThanOrEqual(1e-9);
        // r2 is solvable only when the load is heavier than the required Re
        const re = (other * target) / (vin - target);
        if (rl === undefined || rl > re * 1.001) {
          const b = ok(solve2(vin, target, other, withLoad(rl)));
          expect(err(vdiv(vin, other, si(b, 'r2'), rl), target)).toBeLessThanOrEqual(1e-9);
        }
      }),
      { numRuns: 300 },
    );
  });
  it('current, power and impedance identities: I = (Vin - Vout)/R1, P1 = I^2 R1, P2 = Vout^2/R2, total = Vin I = P1 + P2 + Pload, Rout = R1 || R2 (1e-9)', () => {
    fc.assert(
      fc.property(vinArb, rArb, rArb, fc.option(rArb, { nil: undefined }), (vin, r1, r2, rl) => {
        const r = ok(fwd(vin, r1, r2, withLoad(rl)));
        const vout = si(r, 'vout');
        const i = si(r, 'divider current');
        expect(err(i, (vin - vout) / r1)).toBeLessThanOrEqual(1e-9);
        expect(err(si(r, 'power in r1'), i * i * r1)).toBeLessThanOrEqual(1e-9);
        expect(err(si(r, 'power in r2'), (vout * vout) / r2)).toBeLessThanOrEqual(1e-9);
        expect(err(si(r, 'total power'), vin * i)).toBeLessThanOrEqual(1e-9);
        const pl = rl === undefined ? 0 : si(r, 'power in load');
        expect(err(si(r, 'total power'), si(r, 'power in r1') + si(r, 'power in r2') + pl)).toBeLessThanOrEqual(1e-9);
        expect(err(si(r, 'output impedance'), par(r1, r2))).toBeLessThanOrEqual(1e-12);
        if (rl !== undefined) expect(err(pl, (vout * vout) / rl)).toBeLessThanOrEqual(1e-9);
      }),
      { numRuns: 300 },
    );
  });
  it('snapping: the snapped value is a series member; nearest is within the oracle max error of the exact value; up is not below it; down is not above it; the error result matches', () => {
    for (const s of SERIES) {
      const max = vec(`eseries_${s}_max_nearest_error_pct`).pinned_expected;
      fc.assert(
        fc.property(vinArb, fracArb, rArb, fc.constantFrom(...SNAPS), (vin, k, other, m) => {
          const target = vin * k;
          const r = ok(solve1(vin, target, other, { series: s, snap: m }));
          const ideal = si(r, 'ideal r1');
          const used = si(r, 'r1');
          expect(err(ideal, (other * (vin - target)) / target)).toBeLessThanOrEqual(1e-12);
          const back = nearest(used, s, 'nearest');
          expect(back.ok && Object.is(back.value.value, used)).toBe(true); // a member of the series, exactly
          if (m === 'nearest') expect((Math.abs(used - ideal) / ideal) * 100).toBeLessThanOrEqual(max + 1e-9);
          if (m === 'up') expect(used).toBeGreaterThanOrEqual(ideal * (1 - 1e-9));
          if (m === 'down') expect(used).toBeLessThanOrEqual(ideal * (1 + 1e-9));
          expect(err(si(r, 'vout'), vdiv(vin, used, other))).toBeLessThanOrEqual(1e-12);
          expect(Math.abs(si(r, 'vout error vs target') - (si(r, 'vout') - target) / target)).toBeLessThanOrEqual(1e-9);
        }),
        { numRuns: 120 },
      );
    }
  });
  it('envelope: min <= typ <= max, typ is the nominal Vout, the corners match a restated corner search, and random points inside the tolerance box stay inside', () => {
    fc.assert(
      fc.property(vinArb, rArb, rArb, fc.option(rArb, { nil: undefined }), tolArb, tolArb, fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 4, maxLength: 4 }), (vin, r1, r2, rl, tol, vtol, u) => {
        const extra: Partial<Inputs> = { tolerance: frac(tol), vinTolerance: frac(vtol), ...withLoad(rl) };
        const r = ok(fwd(vin, r1, r2, extra));
        const e = r.envelope?.[0];
        expect(e).toBeDefined();
        if (!e) return;
        expect(e.min.si).toBeLessThanOrEqual(e.typ.si);
        expect(e.typ.si).toBeLessThanOrEqual(e.max.si);
        expect(err(e.typ.si, si(r, 'vout'))).toBeLessThanOrEqual(1e-12);
        const vals: number[] = [];
        for (const a of [1 - vtol, 1 + vtol]) for (const b of [1 - tol, 1 + tol]) for (const c of [1 - tol, 1 + tol]) for (const d of rl === undefined ? [1] : [1 - tol, 1 + tol]) {
          vals.push(vdiv(vin * a, r1 * b, r2 * c, rl === undefined ? undefined : rl * d));
        }
        expect(err(e.min.si, Math.min(...vals))).toBeLessThanOrEqual(1e-9);
        expect(err(e.max.si, Math.max(...vals))).toBeLessThanOrEqual(1e-9);
        const x = vdiv(vin * (1 + vtol * (u[0] as number)), r1 * (1 + tol * (u[1] as number)), r2 * (1 + tol * (u[2] as number)), rl === undefined ? undefined : rl * (1 + tol * (u[3] as number)));
        expect(x).toBeGreaterThanOrEqual(e.min.si * (1 - 1e-9));
        expect(x).toBeLessThanOrEqual(e.max.si * (1 + 1e-9));
      }),
      { numRuns: 200 },
    );
  });
  it('a larger tolerance never narrows the envelope', () => {
    fc.assert(
      fc.property(vinArb, rArb, rArb, tolArb, fc.double({ min: 1, max: 2, noNaN: true }), (vin, r1, r2, tol, f) => {
        const a = ok(fwd(vin, r1, r2, { tolerance: frac(tol) })).envelope?.[0];
        const b = ok(fwd(vin, r1, r2, { tolerance: frac(Math.min(tol * f, 0.4)) })).envelope?.[0];
        expect(b?.min.si).toBeLessThanOrEqual((a?.min.si ?? NaN) * (1 + 1e-12));
        expect(b?.max.si).toBeGreaterThanOrEqual((a?.max.si ?? NaN) * (1 - 1e-12));
      }),
    );
  });
  it('no NaN or Infinity anywhere for in-range inputs; deterministic; inputs never mutated', () => {
    fc.assert(
      fc.property(vinArb, rArb, rArb, rArb, tolArb, (vin, r1, r2, rl, tol) => {
        const input = fwd(vin, r1, r2, { load: R(rl), tolerance: frac(tol), vinTolerance: frac(tol / 2) });
        const before = JSON.stringify(input);
        const a = compute(input);
        const b = compute(input);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(JSON.stringify(input)).toBe(before);
        const r = ok(input);
        for (const x of r.results) expect(Number.isFinite(x.value.si)).toBe(true);
        for (const s of r.steps) expect(Number.isFinite(s.value.si)).toBe(true);
        expect(Number.isFinite(r.confidence.score)).toBe(true);
      }),
    );
  });
});

describe('robustness near the representable range', () => {
  it('extreme values return an error value or an all-finite valid result; never throw, never NaN', () => {
    const raw = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;
    const extremes: Inputs[] = [
      fwd(5, 10e3, 10e3, { load: raw(Number.MIN_VALUE, DIM.RESISTANCE) }),
      fwd(5, Number.MAX_VALUE, Number.MAX_VALUE),
      fwd(5, Number.MIN_VALUE, Number.MIN_VALUE),
      fwd(Number.MAX_VALUE, 1, 1),
      fwd(Number.MIN_VALUE, 1e3, 1e3),
      solve1(5, Number.MIN_VALUE, 1e3),
      solve1(1e300, 1e-300, 1e300),
      solve2(5, 4.999999999999999, Number.MAX_VALUE),
      fwd(5, 1e3, 1e3, { tolerance: frac(0.4999999999) }),
      fwd(5, 1e3, 1e3, { series: 'E96' as never }),
    ];
    for (const inp of extremes) {
      let out: ReturnType<typeof compute>;
      try {
        out = compute(inp);
      } catch (e) {
        throw new Error(`compute threw: ${String(e)}`, { cause: e });
      }
      if (out.ok) {
        expect(assertCalcResult(out.value).ok).toBe(true);
        for (const r of out.value.results) expect(Number.isFinite(r.value.si)).toBe(true);
      } else {
        expect('value' in out).toBe(false);
      }
    }
  });
});

describe('performance sanity', () => {
  it('10 000 loaded computes with a tolerance envelope take under 1 s in total', () => {
    const input = fwd(12, 47e3, 10e3, { load: R(100e3), tolerance: frac(0.01), vinTolerance: frac(0.02) });
    compute(input);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(input).ok) n++;
    expect(n).toBe(10_000);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  it('2 000 solved-and-snapped E192 computes take under 1 s in total', () => {
    const input = solve1(12, 3.3, 10e3, { series: 'E192', snap: 'nearest', load: R(100e3), tolerance: frac(0.01) });
    compute(input);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 2000; i++) if (compute(input).ok) n++;
    expect(n).toBe(2000);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('meta', () => {
  it('formula text from meta.formula (shown in the UI); ids, accuracy class, ledger ids, tolerance inputs, plausibility ranges', () => {
    expect(meta.formula).toContain('Vout = Vin × R2 / (R1 + R2)');
    expect(meta.formula).toContain('RL');
    const r = ok(fwd(5, 10e3, 10e3));
    expect(r.formula).toBe(meta.formula);
    expect(r.method).toBe(meta.method);
    expect(meta.id).toBe('resistor-divider');
    expect(meta.title.trim().length).toBeGreaterThan(0);
    expect(meta.method.trim().length).toBeGreaterThan(0);
    expect(meta.accuracyClass).toBe('exact');
    expect([...meta.ledgerIds]).toEqual(['S-019', 'S-016']);
    expect([...meta.reference.ledgerIds]).toEqual(['S-019', 'S-016']);
    for (const id of meta.reference.ledgerIds) expect(LEDGER.some((r) => r.id === id), id).toBe(true);
    expect([...meta.toleranceInputs]).toEqual(expect.arrayContaining(['r1', 'r2']));
    expect(meta.validity).toMatchObject({ vinV: 1000, resistanceOhm: [1, 1e9] });
  });
});
