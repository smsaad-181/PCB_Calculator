import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, q, toUnit } from '../units';
import type { Quantity } from '../units';
import { DEFAULT_FOIL_CONVENTION } from '../data/constants';
import { STACKUP_LIMITS, STACKUP_PROVENANCE, validateStackup } from './guards';
import type { Stackup } from './types';
import { deriveMicrostrip, deriveStripline } from './derive';

// Phase 2 task 1: shared stackup model. TESTS FIRST. Pure TypeScript, no DOM.
// Expected numbers: foil thickness per convention from the oracle (docs/golden-vectors.json copper_um_1oz_*, written by
// tools/reference/ref_calcs.py); everything else is arithmetic on the inputs written out in the test (sums of layer thicknesses).
// er and Df are never pre-filled: every dielectric must carry a source label. Nothing here is a fab limit.

const goldenFiles = import.meta.glob('../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const goldenText = Object.values(goldenFiles)[0];
const vectors = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: { name: string; pinned_expected: number }[] }).vectors;
const vec = (name: string): number => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found`);
  return v.pinned_expected;
};

const um = (n: number): Quantity => fromUnit(n, 'um');
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

const mask = (name = 'mask-top', t = 20) => ({ kind: 'soldermask' as const, name, thickness: um(t) });
const cu = (name: string, t = 35) => ({ kind: 'copper' as const, name, thickness: um(t) });
const diel = (name: string, t: number, er = 4.2, source = 'user-entered, datasheet X rev A @ 1 GHz') => ({
  kind: 'dielectric' as const,
  name,
  thickness: um(t),
  er,
  source,
});

/** 4-layer: mask / L1 signal / prepreg / L2 plane / core / L3 plane / prepreg / L4 signal / mask. */
const FOUR = (): unknown => ({
  name: 'test 4-layer',
  layers: [mask('mask-top'), cu('L1'), diel('pp1', 200), cu('L2'), diel('core', 1000, 4.5, 'user-entered, laminate Y'), cu('L3'), diel('pp2', 200), cu('L4'), mask('mask-bot')],
});

function ok(raw: unknown): Stackup {
  const r = validateStackup(raw);
  if (!r.ok) throw new Error(`expected ok: ${r.error.map((e) => `${e.field ?? ''}: ${e.message}`).join(' | ')}`);
  return r.value;
}
function bad(raw: unknown): { field: string; message: string; code: string }[] {
  const r = validateStackup(raw);
  if (r.ok) throw new Error('expected an error');
  return r.error.map((e) => ({ field: e.field ?? '', message: e.message, code: e.code }));
}
const has = (errs: { field: string; message: string }[], field: string, re: RegExp): boolean => errs.some((e) => e.field === field && re.test(e.message));

describe('validateStackup: a valid stack', () => {
  it('accepts the 4-layer example and tags it user-entered, unverified', () => {
    const s = ok(FOUR());
    expect(s.schemaVersion).toBe(1);
    expect(s.provenance).toBe(STACKUP_PROVENANCE);
    expect(STACKUP_PROVENANCE).toBe('user-entered, unverified');
    expect(s.layers.length).toBe(9);
    expect(s.layers.map((l) => l.kind)).toEqual(['soldermask', 'copper', 'dielectric', 'copper', 'dielectric', 'copper', 'dielectric', 'copper', 'soldermask']);
  });
  it('keeps er, df and the source label on a dielectric; never invents them', () => {
    const s = ok({ name: 'x', layers: [cu('A'), { ...diel('d', 100, 3.66, 'Rogers sheet, 10 GHz'), df: 0.0037, frequency: fromUnit(10, 'GHz') }, cu('B')] });
    const d = s.layers[1];
    expect(d?.kind).toBe('dielectric');
    if (d?.kind === 'dielectric') {
      expect(d.er).toBe(3.66);
      expect(d.df).toBe(0.0037);
      expect(d.source).toBe('Rogers sheet, 10 GHz');
      expect(d.frequency?.si).toBe(10e9);
    }
  });
  it('df is optional and absent stays absent (no default Df)', () => {
    const s = ok({ name: 'x', layers: [cu('A'), diel('d', 100), cu('B')] });
    const d = s.layers[1];
    expect(d !== undefined && d.kind === 'dielectric' && d.df === undefined).toBe(true);
  });
  it('a copper layer given as a foil weight converts with the default convention and records that it was defaulted', () => {
    const s = ok({ name: 'x', layers: [{ kind: 'copper', name: 'A', weight: fromUnit(1, 'oz/ft2') }, diel('d', 100), cu('B')] });
    const c = s.layers[0];
    expect(c?.kind).toBe('copper');
    if (c?.kind === 'copper') {
      expect(c.thicknessSource.from).toBe('weight');
      if (c.thicknessSource.from === 'weight') {
        expect(c.thicknessSource.convention).toBe(DEFAULT_FOIL_CONVENTION);
        expect(c.thicknessSource.conventionDefaulted).toBe(true);
        expect(c.thicknessSource.weightOzFt2).toBeCloseTo(1, 12);
      }
      expect(relErr(toUnit(c.thickness, 'um'), vec('copper_um_1oz_nominal-35um'))).toBeLessThan(1e-12);
    }
  });
  it('an explicit foil convention is used and is not marked defaulted (oracle thickness for mass-density)', () => {
    const s = ok({ name: 'x', layers: [{ kind: 'copper', name: 'A', weight: fromUnit(1, 'oz/ft2'), convention: 'mass-density' }, diel('d', 100), cu('B')] });
    const c = s.layers[0];
    if (c?.kind !== 'copper' || c.thicknessSource.from !== 'weight') throw new Error('expected a weight-based copper layer');
    expect(c.thicknessSource.conventionDefaulted).toBe(false);
    expect(relErr(toUnit(c.thickness, 'um'), vec('copper_um_1oz_mass-density'))).toBeLessThan(1e-12);
  });
  it('a copper thickness entry defaults its basis to nominal unless declared', () => {
    const s = ok({ name: 'x', layers: [{ ...cu('A'), thicknessBasis: 'finished' }, diel('d', 100), cu('B')] });
    const [a, , b] = s.layers;
    if (a?.kind !== 'copper' || b?.kind !== 'copper' || a.thicknessSource.from !== 'thickness' || b.thicknessSource.from !== 'thickness') throw new Error('shape');
    expect(a.thicknessSource.basis).toBe('finished');
    expect(b.thicknessSource.basis).toBe('nominal');
  });
  it('a soldermask may carry er with a source, or neither', () => {
    ok({ name: 'x', layers: [{ ...mask(), er: 3.5, source: 'fabricator sheet' }, cu('A'), diel('d', 100), cu('B')] });
    ok({ name: 'x', layers: [mask(), cu('A'), diel('d', 100), cu('B')] });
  });
});

describe('validateStackup: dielectric er / Df / source rules', () => {
  const withD = (patch: Record<string, unknown>): unknown => ({ name: 'x', layers: [cu('A'), { ...diel('d', 100), ...patch }, cu('B')] });
  it('a missing, empty or blank source label is rejected (never pre-filled)', () => {
    for (const source of [undefined, '', '   ', 5]) {
      const errs = bad(withD({ source }));
      expect(has(errs, 'layers[1].source', /source/)).toBe(true);
    }
  });
  it('a missing er is rejected', () => {
    const raw = withD({});
    const d = (raw as { layers: Record<string, unknown>[] }).layers[1] as Record<string, unknown>;
    delete d['er'];
    expect(has(bad(raw), 'layers[1].er', /er/)).toBe(true);
  });
  it('er that is NaN, infinite, zero, negative, below 1 or above 128 is rejected with the field path', () => {
    for (const er of [Number.NaN, Number.POSITIVE_INFINITY, 0, -4, 0.5, 128.5, '4.2']) {
      expect(has(bad(withD({ er })), 'layers[1].er', /er/), String(er)).toBe(true);
    }
  });
  it('er exactly 1 and exactly 128 are accepted (the recorded model range ends)', () => {
    ok(withD({ er: 1 }));
    ok(withD({ er: 128 }));
  });
  it('df that is NaN, infinite, zero, negative or above 1 is rejected', () => {
    for (const df of [Number.NaN, Number.POSITIVE_INFINITY, 0, -0.01, 1.5, '0.02']) {
      expect(has(bad(withD({ df })), 'layers[1].df', /df/), String(df)).toBe(true);
    }
  });
  it('a test frequency must be a positive frequency quantity', () => {
    expect(has(bad(withD({ frequency: um(5) })), 'layers[1].frequency', /frequency/)).toBe(true);
    expect(has(bad(withD({ frequency: fromUnit(0, 'Hz') })), 'layers[1].frequency', /frequency/)).toBe(true);
    expect(has(bad(withD({ frequency: 1e9 })), 'layers[1].frequency', /frequency/)).toBe(true);
  });
  it('a soldermask er needs a source label too', () => {
    const errs = bad({ name: 'x', layers: [{ ...mask(), er: 3.5 }, cu('A'), diel('d', 100), cu('B')] });
    expect(has(errs, 'layers[0].source', /source/)).toBe(true);
  });
});

describe('validateStackup: thickness and copper rules', () => {
  it('thickness must be a length: a temperature, a plain number and a missing value are rejected', () => {
    const t = fromUnit(25, 'degC');
    const bad1 = bad({ name: 'x', layers: [cu('A'), { ...diel('d', 100), thickness: t }, cu('B')] });
    expect(bad1.find((e) => e.field === 'layers[1].thickness')?.code).toBe('DIMENSION');
    expect(has(bad({ name: 'x', layers: [cu('A'), { ...diel('d', 100), thickness: 100e-6 }, cu('B')] }), 'layers[1].thickness', /thickness/)).toBe(true);
    const raw = { name: 'x', layers: [cu('A'), diel('d', 100), cu('B')] };
    delete (raw.layers[1] as Record<string, unknown>)['thickness'];
    expect(has(bad(raw), 'layers[1].thickness', /thickness/)).toBe(true);
  });
  it('zero, negative, NaN and infinite thickness are rejected', () => {
    for (const si of [0, -35e-6, Number.NaN, Number.POSITIVE_INFINITY]) {
      const th = { si, dim: DIM.LENGTH } as Quantity;
      const errs = bad({ name: 'x', layers: [cu('A'), { ...diel('d', 100), thickness: th }, cu('B')] });
      expect(has(errs, 'layers[1].thickness', /thickness/), String(si)).toBe(true);
    }
  });
  it('an implausible thickness (unit slip) is OUT_OF_DOMAIN: 200 mm dielectric, 35 m copper, 5 nm mask', () => {
    const a = bad({ name: 'x', layers: [cu('A'), diel('d', 200000), cu('B')] });
    expect(a.find((e) => e.field === 'layers[1].thickness')?.code).toBe('OUT_OF_DOMAIN');
    const b = bad({ name: 'x', layers: [{ kind: 'copper', name: 'A', thickness: q(35, DIM.LENGTH) }, diel('d', 100), cu('B')] });
    expect(b.find((e) => e.field === 'layers[0].thickness')?.code).toBe('OUT_OF_DOMAIN');
    const c = bad({ name: 'x', layers: [{ kind: 'soldermask', name: 'm', thickness: q(5e-9, DIM.LENGTH) }, cu('A'), diel('d', 100), cu('B')] });
    expect(c.find((e) => e.field === 'layers[0].thickness')?.code).toBe('OUT_OF_DOMAIN');
  });
  it('exactly one of thickness or weight on copper', () => {
    expect(has(bad({ name: 'x', layers: [{ kind: 'copper', name: 'A' }, diel('d', 100), cu('B')] }), 'layers[0]', /exactly one of thickness or weight/)).toBe(true);
    expect(has(bad({ name: 'x', layers: [{ ...cu('A'), weight: fromUnit(1, 'oz/ft2') }, diel('d', 100), cu('B')] }), 'layers[0]', /exactly one of thickness or weight/)).toBe(true);
  });
  it('a weight must be an areal mass; a length or a bare number is rejected', () => {
    const e1 = bad({ name: 'x', layers: [{ kind: 'copper', name: 'A', weight: um(35) }, diel('d', 100), cu('B')] });
    expect(e1.find((e) => e.field === 'layers[0].weight')?.code).toBe('DIMENSION');
    expect(has(bad({ name: 'x', layers: [{ kind: 'copper', name: 'A', weight: 1 }, diel('d', 100), cu('B')] }), 'layers[0].weight', /weight/)).toBe(true);
  });
  it('convention only with a weight; thicknessBasis only with a thickness; both must be known values', () => {
    expect(has(bad({ name: 'x', layers: [{ ...cu('A'), convention: 'nominal-35um' }, diel('d', 100), cu('B')] }), 'layers[0].convention', /weight/)).toBe(true);
    expect(has(bad({ name: 'x', layers: [{ kind: 'copper', name: 'A', weight: fromUnit(1, 'oz/ft2'), thicknessBasis: 'nominal' }, diel('d', 100), cu('B')] }), 'layers[0].thicknessBasis', /thickness/)).toBe(true);
    expect(has(bad({ name: 'x', layers: [{ kind: 'copper', name: 'A', weight: fromUnit(1, 'oz/ft2'), convention: 'bogus' }, diel('d', 100), cu('B')] }), 'layers[0].convention', /convention/)).toBe(true);
    expect(has(bad({ name: 'x', layers: [{ ...cu('A'), thicknessBasis: 'typical' }, diel('d', 100), cu('B')] }), 'layers[0].thicknessBasis', /thicknessBasis/)).toBe(true);
  });
});

describe('validateStackup: structure, caps and strictness', () => {
  it('rejects non-objects, a missing layers array, an empty stack and a stack without copper or dielectric', () => {
    for (const raw of [null, undefined, 5, 'x', [], { name: 'x' }, { name: 'x', layers: 'no' }]) bad(raw);
    expect(has(bad({ name: 'x', layers: [] }), 'layers', /at least/)).toBe(true);
    expect(has(bad({ name: 'x', layers: [diel('d', 100)] }), 'layers', /copper/)).toBe(true);
    expect(has(bad({ name: 'x', layers: [cu('A')] }), 'layers', /dielectric/)).toBe(true);
  });
  it('caps the layer count at the documented maximum', () => {
    const layers: unknown[] = [];
    for (let i = 0; i < STACKUP_LIMITS.maxLayers + 1; i++) layers.push(i % 2 === 0 ? cu(`C${String(i)}`) : diel(`D${String(i)}`, 100));
    expect(has(bad({ name: 'x', layers }), 'layers', /at most/)).toBe(true);
  });
  it('caps name and source length', () => {
    const long = 'a'.repeat(STACKUP_LIMITS.maxSourceLength + 1);
    expect(has(bad({ name: 'n'.repeat(STACKUP_LIMITS.maxNameLength + 1), layers: [cu('A'), diel('d', 100), cu('B')] }), 'name', /at most/)).toBe(true);
    expect(has(bad({ name: 'x', layers: [cu('A'), diel('d', 100, 4, long), cu('B')] }), 'layers[1].source', /at most/)).toBe(true);
  });
  it('rejects unknown keys (typos such as epsr) and unknown kinds', () => {
    expect(has(bad({ name: 'x', layers: [cu('A'), { ...diel('d', 100), epsr: 4 }, cu('B')] }), 'layers[1].epsr', /unknown/)).toBe(true);
    expect(has(bad({ name: 'x', layers: [cu('A'), diel('d', 100), cu('B')], extra: 1 }), 'extra', /unknown/)).toBe(true);
    expect(has(bad({ name: 'x', layers: [cu('A'), { kind: 'plane', name: 'p', thickness: um(10) }, cu('B')] }), 'layers[1].kind', /kind/)).toBe(true);
  });
  it('rejects duplicate and empty layer names', () => {
    expect(has(bad({ name: 'x', layers: [cu('A'), diel('d', 100), cu('A')] }), 'layers[2].name', /duplicate/)).toBe(true);
    expect(has(bad({ name: 'x', layers: [cu(''), diel('d', 100), cu('B')] }), 'layers[0].name', /name/)).toBe(true);
  });
  it('a soldermask is only allowed as the first or last layer', () => {
    expect(has(bad({ name: 'x', layers: [cu('A'), mask('m'), diel('d', 100), cu('B')] }), 'layers[1]', /soldermask/)).toBe(true);
  });
  it('two copper layers with no dielectric between them are rejected', () => {
    expect(has(bad({ name: 'x', layers: [cu('A'), cu('B'), diel('d', 100), cu('C')] }), 'layers[1]', /adjacent/)).toBe(true);
  });
  it('reports every problem, not just the first', () => {
    const errs = bad({ name: '', layers: [cu('A'), { ...diel('d', 100), er: 0, source: '' }, cu('B')] });
    expect(errs.length).toBeGreaterThanOrEqual(3);
  });
  it('an unsupported schemaVersion is rejected with a clear message', () => {
    expect(has(bad({ schemaVersion: 2, name: 'x', layers: [cu('A'), diel('d', 100), cu('B')] }), 'schemaVersion', /schemaVersion/)).toBe(true);
  });
  it('does not mutate its input and returns a stack independent of it', () => {
    const raw = FOUR() as { layers: { name: string }[] };
    const before = JSON.stringify(raw);
    const s = ok(raw);
    expect(JSON.stringify(raw)).toBe(before);
    expect(s.layers).not.toBe(raw.layers);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('deriveMicrostrip', () => {
  it('top-side trace: h = prepreg thickness to the reference plane, t = trace copper, er from the dielectric, mask flagged', () => {
    const r = deriveMicrostrip(ok(FOUR()), 'L1');
    if (!r.ok) throw new Error(r.error.message);
    expect(toUnit(r.value.h, 'um')).toBeCloseTo(200, 9);
    expect(toUnit(r.value.t, 'um')).toBeCloseTo(35, 9);
    expect(r.value.er).toBe(4.2);
    expect(r.value.referenceLayer).toBe('L2');
    expect(r.value.signalLayer).toBe('L1');
    expect(r.value.soldermask).toBe(true);
    expect(r.value.erSource).toContain('datasheet X rev A');
    expect(r.value.notes.join(' ')).toMatch(/soldermask/i);
    expect(r.value.copper.layer).toBe('outer');
  });
  it('bottom-side trace uses the dielectric above it', () => {
    const r = deriveMicrostrip(ok(FOUR()), 'L4');
    if (!r.ok) throw new Error(r.error.message);
    expect(toUnit(r.value.h, 'um')).toBeCloseTo(200, 9);
    expect(r.value.referenceLayer).toBe('L3');
  });
  it('the layer may be given by index', () => {
    const r = deriveMicrostrip(ok(FOUR()), 1);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.signalLayer).toBe('L1');
  });
  it('several dielectric layers of one er between trace and plane add up', () => {
    const s = ok({ name: 'x', layers: [cu('T'), diel('a', 60, 4.3, 'src'), diel('b', 90, 4.3, 'src'), cu('P')] });
    const r = deriveMicrostrip(s, 'T');
    if (!r.ok) throw new Error(r.error.message);
    expect(toUnit(r.value.h, 'um')).toBeCloseTo(150, 9);
    expect(r.value.er).toBe(4.3);
  });
  it('dielectric layers of different er between trace and plane are refused (inhomogeneous)', () => {
    const s = ok({ name: 'x', layers: [cu('T'), diel('a', 60, 4.3, 'src'), diel('b', 90, 4.6, 'src'), cu('P')] });
    const r = deriveMicrostrip(s, 'T');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('OUT_OF_DOMAIN');
      expect(r.error.message).toMatch(/different er/);
    }
  });
  it('a trace with dielectric on both sides is embedded microstrip or stripline: refused, "embedded microstrip not offered"', () => {
    const r = deriveMicrostrip(ok(FOUR()), 'L2');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/embedded microstrip not offered/);
  });
  it('an outer trace with no copper behind it has no reference plane', () => {
    const s = ok({ name: 'x', layers: [cu('T'), diel('a', 100, 4.3, 'src')] });
    const r = deriveMicrostrip(s, 'T');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/reference plane/);
  });
  it('unknown layer, non-copper layer, out-of-range index are errors', () => {
    const s = ok(FOUR());
    for (const sig of ['nope', 'pp1', 'mask-top', 99, -1, 1.5]) {
      const r = deriveMicrostrip(s, sig);
      expect(r.ok, String(sig)).toBe(false);
    }
  });
  it('an explicit reference layer must be the nearest copper layer', () => {
    const s = ok(FOUR());
    expect(deriveMicrostrip(s, 'L1', { referenceLayer: 'L2' }).ok).toBe(true);
    const r = deriveMicrostrip(s, 'L1', { referenceLayer: 'L3' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/nearest copper layer/);
  });
  it('carries Df when every dielectric between has the same df, drops it (with a note) when they differ', () => {
    const s = ok({ name: 'x', layers: [cu('T'), { ...diel('a', 60, 4.3, 'src'), df: 0.02 }, { ...diel('b', 90, 4.3, 'src'), df: 0.02 }, cu('P')] });
    const r = deriveMicrostrip(s, 'T');
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.df).toBe(0.02);
    const s2 = ok({ name: 'x', layers: [cu('T'), { ...diel('a', 60, 4.3, 'src'), df: 0.02 }, { ...diel('b', 90, 4.3, 'src'), df: 0.03 }, cu('P')] });
    const r2 = deriveMicrostrip(s2, 'T');
    if (!r2.ok) throw new Error(r2.error.message);
    expect(r2.value.df).toBeUndefined();
    expect(r2.value.notes.join(' ')).toMatch(/Df/);
  });
  it('copper from a foil weight is reported with its convention and the defaulted flag in the copper basis source', () => {
    const s = ok({ name: 'x', layers: [{ kind: 'copper', name: 'T', weight: fromUnit(1, 'oz/ft2') }, diel('a', 100, 4.3, 'src'), cu('P')] });
    const r = deriveMicrostrip(s, 'T');
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.copper.basis).toBe('nominal');
    expect(r.value.copper.weightOzFt2).toBeCloseTo(1, 9);
    expect(r.value.copper.source).toMatch(/nominal-35um/);
    expect(r.value.conventionDefaulted).toBe(true);
  });
});

describe('deriveStripline', () => {
  const SYM = (extra: Record<string, unknown> = {}): unknown => ({
    name: 'sym',
    layers: [cu('P1'), diel('top', 200, 4.2, 'src'), cu('S'), diel('bot', 200, 4.2, 'src'), cu('P2')],
    ...extra,
  });
  it('symmetric centred strip: b = h_above + t + h_below, er common, both planes named', () => {
    const r = deriveStripline(ok(SYM()), 'S');
    if (!r.ok) throw new Error(r.error.message);
    expect(toUnit(r.value.b, 'um')).toBeCloseTo(200 + 35 + 200, 9);
    expect(toUnit(r.value.t, 'um')).toBeCloseTo(35, 9);
    expect(toUnit(r.value.hAbove, 'um')).toBeCloseTo(200, 9);
    expect(toUnit(r.value.hBelow, 'um')).toBeCloseTo(200, 9);
    expect(r.value.er).toBe(4.2);
    expect(r.value.referenceAbove).toBe('P1');
    expect(r.value.referenceBelow).toBe('P2');
    expect(r.value.copper.layer).toBe('inner');
  });
  it('several prepreg layers of one er on a side add up', () => {
    const s = ok({ name: 'x', layers: [cu('P1'), diel('t1', 100, 4.2, 's'), diel('t2', 100, 4.2, 's'), cu('S'), diel('b', 200, 4.2, 's'), cu('P2')] });
    const r = deriveStripline(s, 'S');
    if (!r.ok) throw new Error(r.error.message);
    expect(toUnit(r.value.hAbove, 'um')).toBeCloseTo(200, 9);
  });
  it('an off-centre strip is refused in plain language: "not centred between its two planes"', () => {
    const s = ok({ name: 'x', layers: [cu('P1'), diel('top', 150, 4.2, 's'), cu('S'), diel('bot', 250, 4.2, 's'), cu('P2')] });
    const r = deriveStripline(s, 'S');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('OUT_OF_DOMAIN');
      expect(r.error.message).toMatch(/not centred between its two planes/);
      expect(r.error.message).toMatch(/150/);
    }
  });
  it('the symmetry tolerance is exact by default and can be widened explicitly', () => {
    const s = ok({ name: 'x', layers: [cu('P1'), diel('top', 200, 4.2, 's'), cu('S'), diel('bot', 201, 4.2, 's'), cu('P2')] });
    expect(deriveStripline(s, 'S').ok).toBe(false);
    const r = deriveStripline(s, 'S', { symmetryTolerance: 0.01 });
    if (!r.ok) throw new Error(r.error.message);
    expect(toUnit(r.value.b, 'um')).toBeCloseTo(200 + 35 + 201, 9);
    expect(r.value.notes.join(' ')).toMatch(/symmetry tolerance/);
    expect(deriveStripline(s, 'S', { symmetryTolerance: -1 }).ok).toBe(false);
    expect(deriveStripline(s, 'S', { symmetryTolerance: Number.NaN }).ok).toBe(false);
    expect(deriveStripline(s, 'S', { symmetryTolerance: 0.6 }).ok).toBe(false);
  });
  it('different er above and below is refused', () => {
    const s = ok({ name: 'x', layers: [cu('P1'), diel('top', 200, 4.2, 's'), cu('S'), diel('bot', 200, 4.5, 's'), cu('P2')] });
    const r = deriveStripline(s, 'S');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/different er/);
  });
  it('an outer layer is not a stripline', () => {
    const r = deriveStripline(ok(SYM()), 'P1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/microstrip/);
  });
  it('unknown or non-copper layers are errors', () => {
    for (const sig of ['nope', 'top', 7, -2]) expect(deriveStripline(ok(SYM()), sig).ok).toBe(false);
  });
  it('the four-layer example has no centred inner stripline: L2 sits between 200 and 1000 um dielectrics', () => {
    const r = deriveStripline(ok(FOUR()), 'L2');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/different er|not centred between its two planes/);
  });
});
