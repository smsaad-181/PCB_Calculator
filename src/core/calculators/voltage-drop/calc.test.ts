import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { analyse, compute } from './calc';
import type { Inputs, PathElement } from './calc';
import { solvePath } from './solve';
import { meta } from './meta';

// Phase 1 task 5: voltage drop / power loss along a feed path. TESTS FIRST for the maths.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py: vd_solve, vectors vdrop_<case>_* in
// docs/golden-vectors.json) or from the identities restated below. The implementation is never consulted. Nothing here
// verifies S-019 or S-004: tests compare the implementation with the formulas, not the formulas with a standard.
//
// CONTRACT pinned here:
//  - Inputs: vsource, EXACTLY ONE of loadCurrent | loadPower | loadResistance | loadVoltage, returnPath (required),
//    elements (>= 1), optional returnElements (only with 'included-in-list'), optional dropBudgetPercent.
//  - Zero load quantities: 'Needs more input'. Two or more: 'over-specified' (+ 'inconsistent' when they disagree).
//  - Infeasible load (constant power above V^2/(4 R), current drop >= source, voltage >= source): error value.

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

const mm = (n: number): Quantity => fromUnit(n, 'mm');
const um = (n: number): Quantity => fromUnit(n, 'um');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const A = (n: number): Quantity => q(n, DIM.CURRENT);
const R = (n: number): Quantity => q(n, DIM.RESISTANCE);
const W = (n: number): Quantity => q(n, DIM.POWER);
/** Bypasses the q() constructor so non-finite values can reach the guards. */
const rawQ = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const TOL = 1e-9;

/** A trace with an explicit finished thickness (so the oracle's thickness in um applies directly). */
const trace = (label: string, L: number, w: number, t: number, T?: number, layer: 'outer' | 'inner' = 'outer'): PathElement => ({
  kind: 'trace',
  label,
  layer,
  length: mm(L),
  width: mm(w),
  copperThickness: um(t),
  copperBasis: 'finished',
  ...(T !== undefined ? { conductorTemperature: degC(T) } : {}),
});
const ohm = (label: string, r: number, note = 'datasheet typical'): PathElement => ({ kind: 'resistance', label, resistance: R(r), sourceNote: note });

function ok(inputs: Inputs): CalcResult {
  const out = compute(inputs);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code} ${out.error.field ?? ''}: ${out.error.message}`);
  const chk = assertCalcResult(out.value);
  expect(chk.ok, chk.ok ? '' : chk.error.join('; ')).toBe(true);
  return out.value;
}
function fail(inputs: unknown) {
  const out = compute(inputs as Inputs);
  if (out.ok) throw new Error('expected an error value, got a result');
  return out.error;
}
const res = (r: CalcResult, name: string) => {
  const x = r.results.find((o) => o.name === name);
  if (!x) throw new Error(`result "${name}" missing; have ${r.results.map((o) => o.name).join(', ')}`);
  return x;
};

// Mirrors tools/reference/ref_calcs.py VD_CASES (same order and numbers).
interface Case {
  name: string;
  inputs: Inputs;
}
const CASES: Case[] = [
  {
    name: 'A_constR_same',
    inputs: { vsource: V(12), loadResistance: R(10), returnPath: 'same-as-forward', elements: [trace('trace', 100, 1, 35, 25), ohm('connector', 0.05)] },
  },
  {
    name: 'B_constI_none',
    inputs: { vsource: V(5), loadCurrent: A(2), returnPath: 'not-counted', elements: [trace('trace', 200, 2, 70, 85), ohm('fuse', 0.02)] },
  },
  {
    name: 'C_constP_list',
    inputs: {
      vsource: V(12),
      loadPower: W(20),
      returnPath: 'included-in-list',
      elements: [trace('trace', 300, 3, 35, 55), ohm('connector', 0.1), ohm('cable', 0.03)],
      returnElements: [trace('return trace', 300, 5, 35, 55)],
    },
  },
  {
    name: 'D_constV_none',
    inputs: { vsource: V(3.3), loadVoltage: V(3.2), returnPath: 'not-counted', elements: [trace('trace', 150, 0.5, 35, 25), ohm('shunt', 0.01)] },
  },
  { name: 'E_pmax_edge', inputs: { vsource: V(5), loadPower: W(6.25), returnPath: 'not-counted', elements: [ohm('lump', 1)] } },
  {
    name: 'F_constP_heavy',
    inputs: { vsource: V(24), loadPower: W(100), returnPath: 'same-as-forward', elements: [trace('trace', 500, 4, 70, 105), ohm('cable', 0.2)] },
  },
];
const NELEM: Record<string, number> = { A_constR_same: 4, B_constI_none: 2, C_constP_list: 4, D_constV_none: 2, E_pmax_edge: 1, F_constP_heavy: 4 };

describe('golden vectors (oracle) for the six cases', () => {
  const totals: [string, string, string, string][] = [
    ['r_total_ohm', 'total path resistance', 'ohm', ''],
    ['i_A', 'load current', 'A', ''],
    ['drop_V', 'total voltage drop', 'V', ''],
    ['pct_frac', 'voltage drop percent of source', '', ''],
    ['v_load_V', 'load voltage', 'V', ''],
    ['p_loss_W', 'total power loss', 'W', ''],
    ['p_load_W', 'power delivered to load', 'W', ''],
    ['p_src_W', 'source power', 'W', ''],
    ['eff_frac', 'efficiency', '', ''],
    ['p_max_W', 'maximum deliverable power', 'W', ''],
  ];
  for (const c of CASES) {
    it(`${c.name}: totals match the oracle to 1e-9`, () => {
      const r = ok(c.inputs);
      for (const [suffix, name] of totals) {
        const want = vec(`vdrop_${c.name}_${suffix}`);
        expect(relErr(res(r, name).value.si, want.pinned_expected), `${c.name} ${name}`).toBeLessThanOrEqual(Math.max(TOL, want.rel_tol));
      }
    });
    it(`${c.name}: per-element resistance, drop and loss match the oracle`, () => {
      const a = analyse(c.inputs);
      if (!a.ok) throw new Error(a.error.message);
      const els = a.value.analysis.elements;
      expect(els.length).toBe(NELEM[c.name]);
      els.forEach((e, k) => {
        expect(relErr(e.resistance, vec(`vdrop_${c.name}_e${String(k)}_R_ohm`).pinned_expected)).toBeLessThanOrEqual(TOL);
        expect(relErr(e.drop, vec(`vdrop_${c.name}_e${String(k)}_drop_V`).pinned_expected)).toBeLessThanOrEqual(TOL);
        expect(relErr(e.loss, vec(`vdrop_${c.name}_e${String(k)}_loss_W`).pinned_expected)).toBeLessThanOrEqual(TOL);
      });
    });
  }
  it('every vdrop golden vector is exercised (no orphan names)', () => {
    const n = vectors.filter((x) => x.name.startsWith('vdrop_')).length;
    expect(n).toBe(CASES.length * 10 + Object.values(NELEM).reduce((a, b) => a + b * 3, 0));
  });
  it('a 1 oz/ft2 weight under the default convention (35 um) gives the same resistance as 35 um, with a nominal-copper default counted', () => {
    const base = ok(CASES[0]?.inputs as Inputs);
    const weight: PathElement = { kind: 'trace', label: 'trace', layer: 'outer', length: mm(100), width: mm(1), copperWeight: oz(1), conductorTemperature: degC(25) };
    const w = ok({ ...(CASES[0]?.inputs as Inputs), elements: [weight, ohm('connector', 0.05)] });
    expect(relErr(res(w, 'total path resistance').value.si, res(base, 'total path resistance').value.si)).toBeLessThanOrEqual(1e-12);
    expect(w.copperBasis?.basis).toBe('nominal');
    expect(w.confidence.reasons.join(' ')).toMatch(/nominal/i);
    expect(w.confidence.score).toBeGreaterThan(base.confidence.score);
  });
});

describe('hand-checkable worked example', () => {
  // 12 V, constant 10 ohm load, one 0.5 ohm cable and one 0.25 ohm connector (user-supplied), return not counted.
  // R_path = 0.75; I = 12 / 10.75; drop = I x 0.75; V_load = 10 I; P_loss = I^2 x 0.75; P_load = 10 I^2.
  it('matches the arithmetic done by hand', () => {
    const r = ok({ vsource: V(12), loadResistance: R(10), returnPath: 'not-counted', elements: [ohm('cable', 0.5), ohm('connector', 0.25)] });
    const I = 12 / 10.75;
    expect(res(r, 'load current').value.si).toBeCloseTo(I, 12);
    expect(res(r, 'total voltage drop').value.si).toBeCloseTo(0.75 * I, 12);
    expect(res(r, 'load voltage').value.si).toBeCloseTo(10 * I, 12);
    expect(res(r, 'total power loss').value.si).toBeCloseTo(0.75 * I * I, 12);
    expect(res(r, 'power delivered to load').value.si).toBeCloseTo(10 * I * I, 12);
    expect(res(r, 'efficiency').value.si).toBeCloseTo(10 / 10.75, 12);
    expect(res(r, 'voltage drop: cable').value.si).toBeCloseTo(0.5 * I, 12);
    expect(r.limitingElement?.name).toBe('cable');
  });
});

describe('load descriptions and the four relations', () => {
  const els = [trace('t', 100, 1, 35, 25), ohm('c', 0.05)];
  const base = (extra: Partial<Inputs>): Inputs => ({ vsource: V(12), returnPath: 'not-counted', elements: els, ...extra });
  it('every load kind returns a state in which V = I R and P = V I hold for the load', () => {
    for (const extra of [{ loadResistance: R(10) }, { loadCurrent: A(1.5) }, { loadPower: W(20) }, { loadVoltage: V(11.5) }] as Partial<Inputs>[]) {
      const r = ok(base(extra));
      const vl = res(r, 'load voltage').value.si;
      const i = res(r, 'load current').value.si;
      expect(relErr(res(r, 'load resistance').value.si, vl / i)).toBeLessThan(1e-12);
      expect(relErr(res(r, 'power delivered to load').value.si, vl * i)).toBeLessThan(1e-12);
    }
  });
  it('the given load quantity is echoed with bound nominal and not rounded', () => {
    expect(res(ok(base({ loadPower: W(20) })), 'power delivered to load').bound).toBe('nominal');
    expect(res(ok(base({ loadPower: W(20) })), 'power delivered to load').value.si).toBe(20);
    expect(res(ok(base({ loadCurrent: A(1.5) })), 'load current').bound).toBe('nominal');
    expect(res(ok(base({ loadVoltage: V(11.5) })), 'load voltage').value.si).toBe(11.5);
    expect(res(ok(base({ loadResistance: R(10) })), 'load resistance').value.si).toBe(10);
  });
  it('the solved quantities carry the directional bounds decided in meta', () => {
    const r = ok(base({ loadResistance: R(10) }));
    for (const n of ['total voltage drop', 'voltage drop percent of source', 'total power loss', 'total path resistance', 'source power', 'load current']) {
      expect(res(r, n).bound, n).toBe('prediction');
    }
    for (const n of ['load voltage', 'power delivered to load', 'efficiency', 'maximum deliverable power']) {
      expect(res(r, n).bound, n).toBe('max-capacity');
    }
    expect(r.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual(['total voltage drop']);
  });
  it('dimensions of the results are right', () => {
    const r = ok(base({ loadPower: W(20) }));
    expect(sameDim(res(r, 'total voltage drop').value, V(1))).toBe(true);
    expect(sameDim(res(r, 'load current').value, A(1))).toBe(true);
    expect(sameDim(res(r, 'total path resistance').value, R(1))).toBe(true);
    expect(sameDim(res(r, 'total power loss').value, W(1))).toBe(true);
    expect(sameDim(res(r, 'efficiency').value, q(1, DIM.DIMENSIONLESS))).toBe(true);
  });
});

describe('constant-power quadratic', () => {
  it('chooses the low-current (physical) root: the load voltage is above half the source', () => {
    const r = ok({ vsource: V(12), loadPower: W(20), returnPath: 'not-counted', elements: [ohm('lump', 0.5)] });
    // 0.5 I^2 - 12 I + 20 = 0 -> I = 12 - sqrt(144 - 40) over 1 = 12 - 10.198..., not 12 + 10.198
    const i = res(r, 'load current').value.si;
    expect(relErr(i, 12 - Math.sqrt(104))).toBeLessThan(1e-12);
    expect(res(r, 'load voltage').value.si).toBeGreaterThan(6);
  });
  it('the other root is rejected: no solution has more current than V/(2R)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 48, noNaN: true }), fc.double({ min: 0.001, max: 5, noNaN: true }), fc.double({ min: 0.001, max: 0.999, noNaN: true }), (vs, rp, f) => {
        const p = f * ((vs * vs) / (4 * rp));
        const out = solvePath(vs, rp, { kind: 'power', si: p });
        expect(out.ok).toBe(true);
        if (out.ok) {
          expect(out.value.current).toBeLessThanOrEqual((vs / (2 * rp)) * (1 + 1e-12));
          // it solves the quadratic
          expect(Math.abs(rp * out.value.current ** 2 - vs * out.value.current + p)).toBeLessThanOrEqual(1e-9 * Math.max(p, vs * out.value.current));
        }
      }),
    );
  });
  it('the boundary P = V^2/(4R) is supplied (I = V/(2R), 50 % efficient) and just above it cannot be', () => {
    const edge = ok({ vsource: V(5), loadPower: W(6.25), returnPath: 'not-counted', elements: [ohm('lump', 1)] });
    expect(res(edge, 'load current').value.si).toBe(2.5);
    expect(res(edge, 'efficiency').value.si).toBeCloseTo(0.5, 12);
    expect(edge.warnings.some((w) => w.code === 'NEAR_MAX_POWER')).toBe(true);
    const e = fail({ vsource: V(5), loadPower: W(6.2501), returnPath: 'not-counted', elements: [ohm('lump', 1)] });
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.message).toMatch(/cannot be supplied/);
    expect(e.message).toMatch(/6\.25/);
  });
  it('a 25 W load on 5 V through 1 ohm cannot be supplied and says the maximum is 6.25 W', () => {
    const e = fail({ vsource: V(5), loadPower: W(25), returnPath: 'not-counted', elements: [ohm('lump', 1)] });
    expect(e.code).toBe('OUT_OF_DOMAIN');
    expect(e.message).toMatch(/Maximum deliverable power: 6\.25 W/);
  });
});

describe('infeasible loads are error values', () => {
  it('constant current whose drop reaches the source voltage', () => {
    expect(fail({ vsource: V(5), loadCurrent: A(5), returnPath: 'not-counted', elements: [ohm('lump', 1)] }).code).toBe('OUT_OF_DOMAIN');
  });
  it('constant load voltage at or above the source', () => {
    expect(fail({ vsource: V(5), loadVoltage: V(5), returnPath: 'not-counted', elements: [ohm('lump', 1)] }).code).toBe('OUT_OF_DOMAIN');
    expect(fail({ vsource: V(5), loadVoltage: V(6), returnPath: 'not-counted', elements: [ohm('lump', 1)] }).code).toBe('OUT_OF_DOMAIN');
  });
});

describe('load quantity count (as ohm-power)', () => {
  const base = { vsource: V(12), returnPath: 'not-counted' as const, elements: [ohm('lump', 0.5)] };
  it('none: needs more input', () => {
    const e = fail(base);
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toMatch(/Needs more input/);
  });
  it('two consistent quantities are still over-specified', () => {
    // R_path 0.5, I = 12/10.5, V_load = 10 I
    const i = 12 / 10.5;
    const e = fail({ ...base, loadResistance: R(10), loadCurrent: A(i) });
    expect(e.message).toMatch(/over-specified/);
    expect(e.message).not.toMatch(/inconsistent/);
  });
  it('two inconsistent quantities say so and name the implied source voltage', () => {
    const e = fail({ ...base, loadResistance: R(10), loadCurrent: A(3) });
    expect(e.message).toMatch(/over-specified and the values are inconsistent/);
    expect(e.message).toMatch(/source voltage of 31\.5 V/);
  });
  it('three or four given are over-specified', () => {
    expect(fail({ ...base, loadResistance: R(10), loadCurrent: A(1), loadPower: W(5) }).message).toMatch(/3 given/);
    expect(fail({ ...base, loadResistance: R(10), loadCurrent: A(1), loadPower: W(5), loadVoltage: V(3) }).message).toMatch(/4 given/);
  });
});

describe('return path handling', () => {
  const t = [trace('t', 100, 1, 35, 25), ohm('c', 0.05)];
  const common = { vsource: V(12), loadResistance: R(10) };
  it('returnPath is required and never defaulted', () => {
    const e = fail({ ...common, elements: t });
    expect(e.field).toBe('returnPath');
    expect(fail({ ...common, elements: t, returnPath: 'yes' }).field).toBe('returnPath');
    expect(fail({ ...common, elements: t, returnPath: undefined }).field).toBe('returnPath');
  });
  it('same-as-forward exactly doubles the path resistance, with duplicated elements labelled as return', () => {
    const one = ok({ ...common, returnPath: 'not-counted', elements: t });
    const two = ok({ ...common, returnPath: 'same-as-forward', elements: t });
    expect(relErr(res(two, 'total path resistance').value.si, 2 * res(one, 'total path resistance').value.si)).toBeLessThan(1e-12);
    expect(two.results.some((x) => x.name === 'resistance: t (return, same as forward)')).toBe(true);
    expect(two.warnings.some((w) => w.code === 'RETURN_SAME_AS_FORWARD')).toBe(true);
  });
  it('not-counted never changes the resistance and warns', () => {
    const r = ok({ ...common, returnPath: 'not-counted', elements: t });
    expect(r.warnings.some((w) => w.code === 'RETURN_NOT_COUNTED')).toBe(true);
    expect(r.assumptions.join(' ')).toMatch(/not counted/);
  });
  it('included-in-list with an explicit return list adds exactly those elements', () => {
    const a = ok({ ...common, returnPath: 'included-in-list', elements: t, returnElements: [ohm('ret', 0.07)] });
    const f = ok({ ...common, returnPath: 'not-counted', elements: t });
    expect(res(a, 'total path resistance').value.si).toBeCloseTo(res(f, 'total path resistance').value.si + 0.07, 12);
  });
  it('included-in-list without a return list adds nothing (the user states the list already contains it)', () => {
    const a = ok({ ...common, returnPath: 'included-in-list', elements: t });
    const f = ok({ ...common, returnPath: 'not-counted', elements: t });
    expect(res(a, 'total path resistance').value.si).toBe(res(f, 'total path resistance').value.si);
    expect(a.assumptions.join(' ')).toMatch(/included in the element list/);
  });
  it('returnElements with any other choice is rejected (never silently doubled or halved)', () => {
    expect(fail({ ...common, returnPath: 'same-as-forward', elements: t, returnElements: [ohm('ret', 0.07)] }).field).toBe('returnElements');
    expect(fail({ ...common, returnPath: 'not-counted', elements: t, returnElements: [ohm('ret', 0.07)] }).field).toBe('returnElements');
  });
  it('labels must be unique across forward and return lists', () => {
    expect(fail({ ...common, returnPath: 'included-in-list', elements: t, returnElements: [ohm('C', 0.07)] }).message).toMatch(/unique/);
  });
});

describe('trace elements reuse the trace-resistance rules', () => {
  const common = { vsource: V(12), loadResistance: R(10), returnPath: 'not-counted' as const };
  it('layer is required, weight xor thickness, defaulted temperature is shown as a default', () => {
    const noLayer = { kind: 'trace', label: 't', length: mm(10), width: mm(1), copperThickness: um(35) };
    expect(fail({ ...common, elements: [noLayer] }).field).toBe('elements[0].layer');
    const both = { ...trace('t', 10, 1, 35), copperWeight: oz(1) };
    expect(fail({ ...common, elements: [both] }).code).toBe('INVALID_INPUT');
    const r = ok({ ...common, elements: [trace('t', 10, 1, 35)] });
    const inp = r.inputs.find((i) => i.name === 't.conductorTemperature');
    expect(inp?.source).toBe('default');
    expect(r.confidence.reasons.join(' ')).toMatch(/default/i);
    const r2 = ok({ ...common, elements: [trace('t', 10, 1, 35, 25)] });
    expect(r2.inputs.find((i) => i.name === 't.conductorTemperature')?.source).toBe('user');
    expect(r2.confidence.score).toBeLessThan(r.confidence.score);
  });
  it('conductor temperature must be an absolute temperature (a difference is rejected)', () => {
    const bad = { ...trace('t', 10, 1, 35), conductorTemperature: fromUnit(10, 'ddegC') };
    expect(fail({ ...common, elements: [bad] }).code).toBe('DIMENSION');
  });
  it('copper R(T): a hotter trace drops more', () => {
    const cold = ok({ ...common, elements: [trace('t', 100, 1, 35, 20)] });
    const hot = ok({ ...common, elements: [trace('t', 100, 1, 35, 120)] });
    expect(res(hot, 'total voltage drop').value.si).toBeGreaterThan(res(cold, 'total voltage drop').value.si);
  });
  it('an out-of-range trace temperature lowers confidence', () => {
    const r = ok({ ...common, elements: [trace('t', 100, 1, 35, 400)] });
    expect(r.confidence.level).toBe('low');
    expect(r.validityChecks.some((c) => !c.ok)).toBe(true);
  });
  it('nominal copper is a rated safety-relevant default; finished copper is not', () => {
    const w: PathElement = { kind: 'trace', label: 't', layer: 'outer', length: mm(10), width: mm(1), copperWeight: oz(1), conductorTemperature: degC(25) };
    const nominal = ok({ ...common, elements: [w] });
    const finished = ok({ ...common, elements: [trace('t', 10, 1, 35, 25)] });
    expect(nominal.confidence.score).toBe(finished.confidence.score + 2);
    expect(nominal.copperBasis?.layer).toBe('outer');
  });
  it('identical nominal-copper defaults on several traces are counted once', () => {
    const w = (l: string): PathElement => ({ kind: 'trace', label: l, layer: 'outer', length: mm(10), width: mm(1), copperWeight: oz(1), conductorTemperature: degC(25) });
    const one = ok({ ...common, elements: [w('a')] });
    const three = ok({ ...common, elements: [w('a'), w('b'), w('c')] });
    expect(three.confidence.score).toBe(one.confidence.score);
  });
});

describe('user-supplied resistances', () => {
  it('carry provenance text, no ledger status, and are not counted as defaulted', () => {
    const r = ok({ vsource: V(12), loadResistance: R(10), returnPath: 'not-counted', elements: [ohm('connector', 0.05, 'datasheet typical 50 mohm')] });
    const i = r.inputs.find((x) => x.name === 'connector.resistance');
    expect(i?.source).toBe('user');
    expect(i?.sourceDetail).toMatch(/user-supplied/);
    expect(i?.sourceDetail).toMatch(/datasheet typical/);
    expect(r.reference.ledgerIds).toEqual(['S-019']);
    expect(r.confidence.level).toBe('high');
    expect(r.warnings.some((w) => w.code === 'USER_RESISTANCE')).toBe(true);
  });
  it('a source note and a label are required', () => {
    const base = { vsource: V(12), loadResistance: R(10), returnPath: 'not-counted' };
    expect(fail({ ...base, elements: [{ kind: 'resistance', label: 'x', resistance: R(1) }] }).field).toBe('elements[0].sourceNote');
    expect(fail({ ...base, elements: [{ kind: 'resistance', label: ' ', resistance: R(1), sourceNote: 'n' }] }).field).toBe('elements[0].label');
  });
});

describe('warnings and the drop budget', () => {
  const base = { vsource: V(12), loadResistance: R(10), returnPath: 'not-counted' as const };
  it('always carries the scope caution and the AC note; traces add the self-heating note', () => {
    const r = ok({ ...base, elements: [trace('t', 100, 1, 35, 25)] });
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('PATH_SCOPE');
    expect(codes).toContain('AC_NOT_INCLUDED');
    expect(codes).toContain('SELF_HEATING_NOT_INCLUDED');
    expect(ok({ ...base, elements: [ohm('c', 0.1)] }).warnings.map((w) => w.code)).not.toContain('SELF_HEATING_NOT_INCLUDED');
    expect(r.warnings.find((w) => w.code === 'SELF_HEATING_NOT_INCLUDED')?.message).toMatch(/self-heating calculator/);
  });
  it('no budget means no budget warning and no invented limit', () => {
    expect(ok({ ...base, elements: [ohm('c', 5)] }).warnings.map((w) => w.code)).not.toContain('DROP_BUDGET_EXCEEDED');
  });
  it('warns when the drop exceeds the budget, not when it is at or below it', () => {
    // R_path 5, RL 10: drop = 12 x 5/15 = 4 V = 33.33 %
    const over = ok({ ...base, elements: [ohm('c', 5)], dropBudgetPercent: fromUnit(30, '%') });
    expect(over.warnings.some((w) => w.code === 'DROP_BUDGET_EXCEEDED' && w.severity === 'warning')).toBe(true);
    const under = ok({ ...base, elements: [ohm('c', 5)], dropBudgetPercent: fromUnit(40, '%') });
    expect(under.warnings.some((w) => w.code === 'DROP_BUDGET_EXCEEDED')).toBe(false);
    expect(over.inputs.some((i) => i.name === 'dropBudgetPercent')).toBe(true);
  });
  it('a budget over 100 % or non-positive is rejected', () => {
    expect(fail({ ...base, elements: [ohm('c', 5)], dropBudgetPercent: fromUnit(150, '%') }).code).toBe('OUT_OF_DOMAIN');
    expect(fail({ ...base, elements: [ohm('c', 5)], dropBudgetPercent: fromUnit(0, '%') }).code).toBe('INVALID_INPUT');
    expect(fail({ ...base, elements: [ohm('c', 5)], dropBudgetPercent: V(1) }).code).toBe('DIMENSION');
  });
});

describe('limiting element', () => {
  it('is the element with the largest drop; ties go to the first', () => {
    const r = ok({ vsource: V(12), loadResistance: R(10), returnPath: 'not-counted', elements: [ohm('a', 0.1), ohm('b', 0.3), ohm('c', 0.3)] });
    expect(r.limitingElement?.name).toBe('b');
    expect(r.limitingElement?.reason).toMatch(/Largest voltage drop/);
    const a = analyse({ vsource: V(12), loadResistance: R(10), returnPath: 'not-counted', elements: [ohm('a', 0.1), ohm('b', 0.3)] });
    if (!a.ok) throw new Error('x');
    expect(a.value.analysis.limiting.name).toBe('b');
    expect(a.value.analysis.elements.reduce((s, e) => s + e.dropShare, 0)).toBeCloseTo(1, 12);
  });
});

describe('input guards: errors are values', () => {
  const good = { vsource: V(12), loadResistance: R(10), returnPath: 'not-counted', elements: [ohm('c', 0.1)] };
  const bad: [string, unknown, string][] = [
    ['inputs not an object', null, 'INVALID_INPUT'],
    ['vsource NaN', { ...good, vsource: rawQ(NaN, DIM.VOLTAGE) }, 'INVALID_INPUT'],
    ['vsource Infinity', { ...good, vsource: rawQ(Infinity, DIM.VOLTAGE) }, 'INVALID_INPUT'],
    ['vsource zero', { ...good, vsource: V(0) }, 'INVALID_INPUT'],
    ['vsource negative', { ...good, vsource: V(-12) }, 'INVALID_INPUT'],
    ['vsource wrong dimension', { ...good, vsource: A(12) }, 'DIMENSION'],
    ['vsource absurd', { ...good, vsource: V(1e12) }, 'OUT_OF_DOMAIN'],
    ['load resistance zero', { ...good, loadResistance: R(0) }, 'INVALID_INPUT'],
    ['load resistance negative', { ...good, loadResistance: R(-1) }, 'INVALID_INPUT'],
    ['load current wrong dimension', { vsource: V(12), loadCurrent: V(1), returnPath: 'not-counted', elements: good.elements }, 'DIMENSION'],
    ['load power NaN', { vsource: V(12), loadPower: rawQ(NaN, DIM.POWER), returnPath: 'not-counted', elements: good.elements }, 'INVALID_INPUT'],
    ['elements missing', { ...good, elements: undefined }, 'INVALID_INPUT'],
    ['elements empty', { ...good, elements: [] }, 'INVALID_INPUT'],
    ['element not an object', { ...good, elements: [3] }, 'INVALID_INPUT'],
    ['element kind unknown', { ...good, elements: [{ kind: 'via', label: 'v' }] }, 'INVALID_INPUT'],
    ['element resistance zero', { ...good, elements: [{ kind: 'resistance', label: 'x', resistance: R(0), sourceNote: 'n' }] }, 'INVALID_INPUT'],
    ['element resistance negative', { ...good, elements: [{ kind: 'resistance', label: 'x', resistance: R(-1), sourceNote: 'n' }] }, 'INVALID_INPUT'],
    ['element resistance NaN', { ...good, elements: [{ kind: 'resistance', label: 'x', resistance: rawQ(NaN, DIM.RESISTANCE), sourceNote: 'n' }] }, 'INVALID_INPUT'],
    ['element resistance tiny (underflow-like)', { ...good, elements: [{ kind: 'resistance', label: 'x', resistance: R(1e-30), sourceNote: 'n' }] }, 'OUT_OF_DOMAIN'],
    ['element resistance wrong dimension', { ...good, elements: [{ kind: 'resistance', label: 'x', resistance: V(1), sourceNote: 'n' }] }, 'DIMENSION'],
    ['trace length zero', { ...good, elements: [trace('t', 0, 1, 35)] }, 'INVALID_INPUT'],
    ['trace width negative', { ...good, elements: [trace('t', 10, -1, 35)] }, 'INVALID_INPUT'],
    ['trace thickness Infinity', { ...good, elements: [{ ...trace('t', 10, 1, 35), copperThickness: rawQ(Infinity, DIM.LENGTH) }] }, 'INVALID_INPUT'],
    ['trace length wrong dimension', { ...good, elements: [{ ...trace('t', 10, 1, 35), length: V(1) }] }, 'DIMENSION'],
    ['too many elements', { ...good, elements: Array.from({ length: 201 }, (_, i) => ohm(`e${String(i)}`, 0.001)) }, 'OUT_OF_DOMAIN'],
  ];
  for (const [name, input, code] of bad) {
    it(`${name} returns ${code} and does not throw`, () => {
      expect(() => compute(input as Inputs)).not.toThrow();
      const out = compute(input as Inputs);
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.error.code).toBe(code);
        expect(out.error.message.length).toBeGreaterThan(0);
      }
    });
  }
  it('a representable-range overflow is an error value, not Infinity', () => {
    const out = compute({ vsource: V(5), loadResistance: R(10), returnPath: 'not-counted', elements: [trace('t', 1e300, 1e-300, 35)] });
    expect(out.ok).toBe(false);
  });
});

describe('properties', () => {
  const pos = (lo: number, hi: number) => fc.double({ min: lo, max: hi, noNaN: true, noDefaultInfinity: true });
  const elementsArb = fc.array(pos(0.001, 2), { minLength: 1, maxLength: 5 });
  const mk = (rs: number[]): PathElement[] => rs.map((r, i) => ohm(`e${String(i)}`, r));

  it('energy balance: Vsource x I = total loss + load power, for every load kind', () => {
    fc.assert(
      fc.property(pos(3, 60), elementsArb, pos(1, 100), fc.constantFrom('R', 'I', 'V', 'P'), (vs, rs, x, kind) => {
        const rp = rs.reduce((a, b) => a + b, 0);
        const inputs: Inputs = { vsource: V(vs), returnPath: 'not-counted', elements: mk(rs) };
        if (kind === 'R') inputs.loadResistance = R(x);
        if (kind === 'I') inputs.loadCurrent = A(Math.min(x / 100, (0.9 * vs) / rp));
        if (kind === 'V') inputs.loadVoltage = V(vs * (0.05 + (0.9 * x) / 100));
        if (kind === 'P') inputs.loadPower = W((x / 100) * 0.9 * ((vs * vs) / (4 * rp)));
        const out = compute(inputs);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(assertCalcResult(out.value).ok).toBe(true);
        const I = res(out.value, 'load current').value.si;
        const loss = res(out.value, 'total power loss').value.si;
        const pl = res(out.value, 'power delivered to load').value.si;
        expect(Math.abs(vs * I - (loss + pl))).toBeLessThanOrEqual(1e-9 * vs * I);
        // efficiency
        expect(relErr(res(out.value, 'efficiency').value.si, pl / (vs * I))).toBeLessThan(1e-9);
      }),
    );
  });
  it('per-element drops and losses add up to the totals; shares add to one; all outputs finite and positive', () => {
    fc.assert(
      fc.property(pos(3, 60), elementsArb, pos(0.5, 100), (vs, rs, rl) => {
        const out = analyse({ vsource: V(vs), loadResistance: R(rl), returnPath: 'same-as-forward', elements: mk(rs) });
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        const a = out.value.analysis;
        expect(a.elements.length).toBe(rs.length * 2);
        expect(Math.abs(a.elements.reduce((s, e) => s + e.drop, 0) - a.totalDrop)).toBeLessThanOrEqual(1e-12 * a.totalDrop);
        expect(Math.abs(a.elements.reduce((s, e) => s + e.loss, 0) - a.totalLoss)).toBeLessThanOrEqual(1e-12 * a.totalLoss);
        expect(Math.abs(a.elements.reduce((s, e) => s + e.dropShare, 0) - 1)).toBeLessThanOrEqual(1e-12);
        expect(Math.abs(a.totalDrop - a.current * a.totalResistance)).toBeLessThanOrEqual(1e-9 * a.totalDrop);
        for (const r of out.value.result.results) {
          expect(Number.isFinite(r.value.si)).toBe(true);
          expect(r.value.si).toBeGreaterThan(0);
        }
        expect(a.loadVoltage).toBeLessThan(vs);
        expect(a.efficiency).toBeLessThan(1);
        expect(a.limiting.drop).toBe(Math.max(...a.elements.map((e) => e.drop)));
      }),
    );
  });
  it('monotonic: a larger series resistance gives a larger drop and a lower load voltage', () => {
    fc.assert(
      fc.property(pos(3, 60), pos(0.01, 1), pos(1.01, 3), pos(1, 100), fc.constantFrom('R', 'I', 'P'), (vs, r, k, x, kind) => {
        const rp = r * k;
        const mkIn = (rr: number): Inputs => {
          const i: Inputs = { vsource: V(vs), returnPath: 'not-counted', elements: [ohm('a', rr)] };
          // Choose the load against the larger resistance so both are feasible.
          if (kind === 'R') i.loadResistance = R(x);
          if (kind === 'I') i.loadCurrent = A((0.9 * vs) / rp / (1 + x / 100));
          if (kind === 'P') i.loadPower = W(0.5 * (x / 100) * ((vs * vs) / (4 * rp)));
          return i;
        };
        const lo = compute(mkIn(r));
        const hi = compute(mkIn(rp));
        expect(lo.ok && hi.ok).toBe(true);
        if (!lo.ok || !hi.ok) return;
        expect(res(hi.value, 'total voltage drop').value.si).toBeGreaterThan(res(lo.value, 'total voltage drop').value.si);
        expect(res(hi.value, 'load voltage').value.si).toBeLessThan(res(lo.value, 'load voltage').value.si);
        // Loss I^2 R is monotonic for constant current and constant power; for a constant-R load it peaks at R_path = R_load.
        if (kind !== 'R') expect(res(hi.value, 'total power loss').value.si).toBeGreaterThan(res(lo.value, 'total power loss').value.si);
      }),
    );
  });
  it('constant-power feasibility boundary is exactly V^2/(4R): below is supplied, above is an error', () => {
    fc.assert(
      fc.property(pos(2, 60), pos(0.01, 5), (vs, rp) => {
        const pmax = (vs * vs) / (4 * rp);
        const below = compute({ vsource: V(vs), loadPower: W(pmax * (1 - 1e-6)), returnPath: 'not-counted', elements: [ohm('a', rp)] });
        const above = compute({ vsource: V(vs), loadPower: W(pmax * (1 + 1e-6)), returnPath: 'not-counted', elements: [ohm('a', rp)] });
        expect(below.ok).toBe(true);
        expect(above.ok).toBe(false);
      }),
    );
  });
  it('same-as-forward equals listing the elements twice explicitly', () => {
    fc.assert(
      fc.property(pos(3, 60), elementsArb, pos(0.5, 100), (vs, rs, rl) => {
        const same = compute({ vsource: V(vs), loadResistance: R(rl), returnPath: 'same-as-forward', elements: mk(rs) });
        const listed = compute({
          vsource: V(vs),
          loadResistance: R(rl),
          returnPath: 'included-in-list',
          elements: mk(rs),
          returnElements: rs.map((r, i) => ohm(`ret${String(i)}`, r)),
        });
        expect(same.ok && listed.ok).toBe(true);
        if (!same.ok || !listed.ok) return;
        for (const n of ['total voltage drop', 'load voltage', 'total power loss', 'efficiency']) {
          expect(relErr(res(same.value, n).value.si, res(listed.value, n).value.si)).toBeLessThan(1e-12);
        }
      }),
    );
  });
});

describe('result structure', () => {
  it('has the standard fields, formula from meta, a rule-based confidence and no compliance wording', () => {
    const r = ok(CASES[2]?.inputs as Inputs);
    expect(r.formula).toBe(meta.formula);
    expect(r.method).toBe(meta.method);
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-019', 'S-004']));
    expect(r.steps.length).toBeGreaterThan(3);
    expect(r.recommendation.length).toBeGreaterThan(0);
    expect(r.designValues).toEqual([]);
    expect(r.limitingElement).toBeDefined();
    expect(r.dataStatus).toBe('VERIFIED');
    const text = JSON.stringify(r).toLowerCase();
    // The audit test greps the sources for the forbidden phrases, so the pattern is assembled from pieces here.
    expect(text).not.toMatch(new RegExp(`(ipc|iec)[ -]?${'compl'}iant|production[ -]?${'sa'}fe`));
  });
  it('meta states the rounding decision for the load voltage', () => {
    expect(meta.id).toBe('voltage-drop');
    expect(meta.formula).toContain('S-004');
    expect(meta.formula).toContain('V_load');
  });
  it('results are deterministic', () => {
    const a = JSON.stringify(ok(CASES[0]?.inputs as Inputs));
    expect(JSON.stringify(ok(CASES[0]?.inputs as Inputs))).toBe(a);
  });
});

describe('performance sanity', () => {
  // SPEC: closed-form calculators take < 1 ms each. This composite runs the full trace-resistance calculation per trace plus the
  // schema check, so its bound is 300 us per compute (3x the 100 us used for single-formula calculators), measured under coverage.
  it('10 000 computes of a two-element path take under 3 s in total', () => {
    const input = CASES[1]?.inputs as Inputs;
    compute(input);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(input).ok) n++;
    const dt = performance.now() - t0;
    expect(n).toBe(10_000);
    expect(dt).toBeLessThan(3000);
  });
});
