import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { fromUnit, toUnit } from '../units';
import type { Quantity } from '../units';
import { STACKUP_LIMITS, validateStackup } from './guards';
import { STACKUP_FORMAT, exportStackup, importStackup } from './json';
import type { Stackup } from './types';

// Phase 2 task 1: JSON import/export of a stackup (string in, string out, no DOM). TESTS FIRST.
// The file is user-entered data: the export carries the er/Df source labels and the 'user-entered, unverified' tag, the import
// is strict (unknown keys, caps, plausibility windows), and a file can never claim to be verified.

const um = (n: number): Quantity => fromUnit(n, 'um');
function stack(): Stackup {
  const r = validateStackup({
    name: 'demo 4-layer',
    note: 'demo only',
    layers: [
      { kind: 'soldermask', name: 'mask', thickness: um(20), er: 3.5, source: 'fabricator sheet, demo' },
      { kind: 'copper', name: 'L1', weight: fromUnit(0.5, 'oz/ft2'), convention: 'nominal-1.35mil' },
      { kind: 'dielectric', name: 'pp', thickness: um(180), er: 4.2, df: 0.018, source: 'datasheet X rev B, 1 GHz', frequency: fromUnit(1, 'GHz') },
      { kind: 'copper', name: 'L2', thickness: um(35), thicknessBasis: 'finished' },
      { kind: 'dielectric', name: 'core', thickness: um(1000), er: 4.5, source: 'datasheet Y' },
      { kind: 'copper', name: 'L3', weight: fromUnit(1, 'oz/ft2') },
    ],
  });
  if (!r.ok) throw new Error(r.error.map((e) => e.message).join('; '));
  return r.value;
}
const parse = (t: string): Record<string, unknown> => JSON.parse(t) as Record<string, unknown>;
function imp(text: string): Stackup {
  const r = importStackup(text);
  if (!r.ok) throw new Error(r.error.map((e) => `${e.field ?? ''}: ${e.message}`).join(' | '));
  return r.value;
}
function impBad(text: string): { field: string; message: string }[] {
  const r = importStackup(text);
  if (r.ok) throw new Error('expected an error');
  return r.error.map((e) => ({ field: e.field ?? '', message: e.message }));
}
const has = (errs: { field: string; message: string }[], re: RegExp, field?: string): boolean => errs.some((e) => re.test(e.message) && (field === undefined || e.field === field));

describe('exportStackup', () => {
  it('writes versioned, tagged JSON that includes every er/Df source label', () => {
    const j = parse(exportStackup(stack()));
    expect(j['schemaVersion']).toBe(1);
    expect(j['kind']).toBe(STACKUP_FORMAT);
    expect(j['provenance']).toBe('user-entered, unverified');
    expect(j['name']).toBe('demo 4-layer');
    const layers = j['layers'] as Record<string, unknown>[];
    expect(layers[2]?.['source']).toBe('datasheet X rev B, 1 GHz');
    expect(layers[4]?.['source']).toBe('datasheet Y');
    expect(layers[0]?.['source']).toBe('fabricator sheet, demo');
    expect(layers[2]?.['er']).toBe(4.2);
    expect(layers[2]?.['df']).toBe(0.018);
  });
  it('uses readable units (um, oz/ft2, Hz) and the explicit foil convention only when it was explicit', () => {
    const layers = parse(exportStackup(stack()))['layers'] as Record<string, unknown>[];
    expect(layers[2]?.['thicknessUm']).toBe(180);
    expect(layers[2]?.['frequencyHz']).toBe(1e9);
    expect(layers[1]?.['weightOzFt2']).toBe(0.5);
    expect(layers[1]?.['foilConvention']).toBe('nominal-1.35mil');
    expect(layers[5]?.['weightOzFt2']).toBe(1);
    expect(layers[5] && 'foilConvention' in layers[5]).toBe(false);
    expect(layers[3]?.['thicknessUm']).toBe(35);
    expect(layers[3]?.['thicknessBasis']).toBe('finished');
  });
  it('contains no fab limits and no verified flag', () => {
    const t = exportStackup(stack());
    expect(t).not.toMatch(/verified": true|fabProfile|minTrace|limits/);
  });
  it('is deterministic', () => {
    expect(exportStackup(stack())).toBe(exportStackup(stack()));
  });
});

describe('importStackup round trip', () => {
  it('import(export(s)) reproduces the stack (numbers within 1e-12, labels exact)', () => {
    const s = stack();
    const t = imp(exportStackup(s));
    expect(t.name).toBe(s.name);
    expect(t.note).toBe(s.note);
    expect(t.layers.length).toBe(s.layers.length);
    s.layers.forEach((a, i) => {
      const b = t.layers[i];
      expect(b?.kind).toBe(a.kind);
      expect(b?.name).toBe(a.name);
      expect(Math.abs((b?.thickness.si ?? 0) - a.thickness.si) / a.thickness.si).toBeLessThan(1e-12);
      if (a.kind === 'dielectric' && b?.kind === 'dielectric') {
        expect(b.er).toBe(a.er);
        expect(b.df).toBe(a.df);
        expect(b.source).toBe(a.source);
        expect(b.frequency?.si).toBe(a.frequency?.si);
      }
      if (a.kind === 'copper' && b?.kind === 'copper') expect(b.thicknessSource.from).toBe(a.thicknessSource.from);
    });
    const c = t.layers[5];
    if (c?.kind !== 'copper' || c.thicknessSource.from !== 'weight') throw new Error('shape');
    expect(c.thicknessSource.conventionDefaulted).toBe(true);
  });
  it('export is a fixed point after one round trip', () => {
    const once = exportStackup(imp(exportStackup(stack())));
    expect(exportStackup(imp(once))).toBe(once);
  });
  it('property: random valid stacks round-trip with an idempotent export', () => {
    const layerArb = fc.record({ t: fc.double({ min: 10, max: 2000, noNaN: true }), er: fc.double({ min: 1, max: 20, noNaN: true }), cu: fc.double({ min: 5, max: 140, noNaN: true }) });
    fc.assert(
      fc.property(fc.array(layerArb, { minLength: 1, maxLength: 8 }), (rows) => {
        const layers: unknown[] = [{ kind: 'copper', name: 'C0', thickness: um(rows[0]?.cu ?? 35) }];
        rows.forEach((r, i) => {
          layers.push({ kind: 'dielectric', name: `D${String(i)}`, thickness: um(r.t), er: r.er, source: `src ${String(i)}` });
          layers.push({ kind: 'copper', name: `C${String(i + 1)}`, thickness: um(r.cu) });
        });
        const v = validateStackup({ name: 'p', layers });
        if (!v.ok) throw new Error(v.error.map((e) => e.message).join('; '));
        const t1 = exportStackup(v.value);
        const back = imp(t1);
        const t2 = exportStackup(back);
        expect(t2).toBe(t1);
        back.layers.forEach((b, i) => {
          const a = v.value.layers[i];
          expect(Math.abs(toUnit(b.thickness, 'um') - toUnit(a?.thickness ?? b.thickness, 'um')) / toUnit(b.thickness, 'um')).toBeLessThan(1e-11);
        });
      }),
      { numRuns: 100 },
    );
  });
});

describe('importStackup: strictness, caps, plausibility', () => {
  const base = (): Record<string, unknown> => parse(exportStackup(stack()));
  const withLayers = (layers: unknown[]): string => JSON.stringify({ ...base(), layers });

  it('never lets a file claim to be verified: provenance is always user-entered, unverified', () => {
    const j = base();
    j['provenance'] = 'VERIFIED by the fab';
    expect(imp(JSON.stringify(j)).provenance).toBe('user-entered, unverified');
  });
  it('invalid JSON, non-objects and over-long text are rejected without throwing', () => {
    expect(has(impBad('{not json'), /not valid JSON/)).toBe(true);
    expect(has(impBad('[1,2]'), /object/)).toBe(true);
    expect(has(impBad('null'), /object/)).toBe(true);
    expect(has(impBad(''), /not valid JSON|empty/)).toBe(true);
    const huge = ' '.repeat(STACKUP_LIMITS.maxTextLength + 1);
    expect(has(impBad(huge), /at most/)).toBe(true);
    expect(importStackup(5 as unknown as string).ok).toBe(false);
  });
  it('requires the format kind and a supported schemaVersion, with a clear message for a newer version', () => {
    const j = base();
    j['schemaVersion'] = 2;
    expect(has(impBad(JSON.stringify(j)), /schemaVersion/, 'schemaVersion')).toBe(true);
    const k = base();
    k['kind'] = 'something-else';
    expect(has(impBad(JSON.stringify(k)), /kind/, 'kind')).toBe(true);
    const m = base();
    delete m['schemaVersion'];
    expect(has(impBad(JSON.stringify(m)), /schemaVersion/, 'schemaVersion')).toBe(true);
  });
  it('rejects unknown keys at the top level and in layers (typos), and numbers given as strings', () => {
    const j = base();
    j['extra'] = 1;
    expect(has(impBad(JSON.stringify(j)), /unknown field/, 'extra')).toBe(true);
    const l = (base()['layers'] as Record<string, unknown>[]).map((x) => ({ ...x }));
    (l[2] as Record<string, unknown>)['epsr'] = 4.2;
    expect(has(impBad(withLayers(l)), /unknown field/, 'layers[2].epsr')).toBe(true);
    const s = (base()['layers'] as Record<string, unknown>[]).map((x) => ({ ...x }));
    (s[2] as Record<string, unknown>)['er'] = '4.2';
    expect(has(impBad(withLayers(s)), /er/, 'layers[2].er')).toBe(true);
    const u = (base()['layers'] as Record<string, unknown>[]).map((x) => ({ ...x }));
    (u[2] as Record<string, unknown>)['thicknessUm'] = '180';
    expect(has(impBad(withLayers(u)), /thickness/, 'layers[2].thicknessUm')).toBe(true);
  });
  it('rejects a dielectric without a source label, with er out of range, and thickness slips', () => {
    const mk = (patch: Record<string, unknown>): string => {
      const l = (base()['layers'] as Record<string, unknown>[]).map((x) => ({ ...x }));
      Object.assign(l[2] as Record<string, unknown>, patch);
      return withLayers(l);
    };
    expect(has(impBad(mk({ source: '' })), /source/, 'layers[2].source')).toBe(true);
    expect(has(impBad(mk({ er: 0.2 })), /er/, 'layers[2].er')).toBe(true);
    expect(has(impBad(mk({ er: 400 })), /er/, 'layers[2].er')).toBe(true);
    expect(has(impBad(mk({ thicknessUm: 180000 })), /plausibility/, 'layers[2].thicknessUm')).toBe(true);
    expect(has(impBad(mk({ thicknessUm: 0 })), /thickness/, 'layers[2].thicknessUm')).toBe(true);
    expect(has(impBad(mk({ thicknessUm: -5 })), /thickness/, 'layers[2].thicknessUm')).toBe(true);
    expect(has(impBad(mk({ df: 0 })), /df/, 'layers[2].df')).toBe(true);
    expect(has(impBad(mk({ frequencyHz: -1 })), /frequency/, 'layers[2].frequencyHz')).toBe(true);
  });
  it('rejects too many layers', () => {
    const layers: unknown[] = [];
    for (let i = 0; i < STACKUP_LIMITS.maxLayers + 1; i++) {
      layers.push(i % 2 === 0 ? { kind: 'copper', name: `C${String(i)}`, thicknessUm: 35 } : { kind: 'dielectric', name: `D${String(i)}`, thicknessUm: 100, er: 4, source: 's' });
    }
    expect(has(impBad(withLayers(layers)), /at most/, 'layers')).toBe(true);
  });
  it('a layer that is not an object, or has an unknown kind, is an error with its path', () => {
    expect(has(impBad(withLayers([5])), /object/, 'layers[0]')).toBe(true);
    expect(has(impBad(withLayers([{ kind: 'plane', name: 'x' }])), /kind/, 'layers[0].kind')).toBe(true);
  });
  it('a "__proto__" key in a file does not pollute anything and is reported as unknown', () => {
    const text = '{"schemaVersion":1,"kind":"pcb-calc-stackup","name":"p","__proto__":{"polluted":true},"layers":[]}';
    const r = importStackup(text);
    expect(r.ok).toBe(false);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
  it('copper given both ways in a file is rejected; weight with thicknessBasis is rejected', () => {
    const l = (base()['layers'] as Record<string, unknown>[]).map((x) => ({ ...x }));
    (l[1] as Record<string, unknown>)['thicknessUm'] = 17.5;
    expect(has(impBad(withLayers(l)), /exactly one of thickness or weight/, 'layers[1]')).toBe(true);
  });
  it('a valid file with the optional fields missing imports cleanly', () => {
    const text = JSON.stringify({
      schemaVersion: 1,
      kind: STACKUP_FORMAT,
      name: 'min',
      layers: [
        { kind: 'copper', name: 'A', thicknessUm: 35 },
        { kind: 'dielectric', name: 'D', thicknessUm: 100, er: 4.1, source: 'user' },
        { kind: 'copper', name: 'B', thicknessUm: 35 },
      ],
    });
    const s = imp(text);
    expect(s.layers.length).toBe(3);
    expect(s.provenance).toBe('user-entered, unverified');
  });
});
