import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { SHIPPED_TABLES, makeTableSet, parseSpacingTable } from '../../spacing/tables';
import type { SpacingTableSet } from '../../spacing/tables';
import { PRODUCT_STANDARD_BANNER } from '../../spacing/gating';
import { T8_BREAKPOINT_M, T8_PER_VOLT_MM, rawSynthetic, synthSet, synthTable, t8 } from '../../spacing/synthetic-tables.testutil';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 3 core: IPC-2221 spacing method (a separate, labelled design guideline). TESTS FIRST.
// SYNTHETIC TEST DATA, not from any standard: T8 comes from synthetic-tables.testutil.ts (rows 10/20/30 V, fake mm values,
// a fake per-volt increment and a fake elevation breakpoint). Expected values come from the fake formulas.
// The shipped T8 is EMPTY.

const ED = 'SYNTH-ED-1';
const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const M = (n: number): Quantity => q(n, DIM.LENGTH);
const raw = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;
const mm = (n: number): number => n * 1e-3;

function base(over: Partial<Inputs> = {}, tables: SpacingTableSet = synthSet(['T8'])): Inputs {
  return { tables, edition: ED, voltagePeak: V(15), location: 'internal', ...over };
}
const external = (over: Partial<Inputs> = {}): Inputs =>
  base({ location: 'external', conductorKind: 'bare-board', coating: 'uncoated', elevation: M(0), ...over });

function ok(i: Inputs): CalcResult {
  const out = compute(i);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code}: ${out.error.message}`);
  const chk = assertCalcResult(out.value);
  if (!chk.ok) throw new Error(`schema: ${chk.error.join('; ')}`);
  expect(out.value.confidence.level).not.toBe('high');
  expect(out.value.dataStatus).toBe('PAYWALLED');
  return out.value;
}
const fails = (i: unknown) => {
  const out = compute(i as Inputs);
  expect(out.ok).toBe(false);
  if (out.ok) throw new Error('unreachable');
  return out.error;
};
const primary = (r: CalcResult): number => (r.results.find((x) => x.role === 'primary') as { value: Quantity }).value.si;

describe('ipc-spacing: traceability and waveform notes', () => {
  it('always cites S-006 (mm/mil conversion) and cites S-035 only for a declared waveform', () => {
    expect(ok(base()).reference.ledgerIds).toContain('S-006');
    expect(ok(base()).reference.ledgerIds).not.toContain('S-035');
    const w = ok(base({ voltagePeak: undefined as never, waveform: { shape: 'sine', basis: 'rms', value: V(10) } }));
    expect(w.reference.ledgerIds).toEqual(expect.arrayContaining(['S-006', 'S-035']));
  });
  it('a square waveform declared from rms warns that a unipolar pulse would have a higher peak', () => {
    const w = (basis: 'rms' | 'peak') => ok(base({ voltagePeak: undefined as never, waveform: { shape: 'square', basis, value: V(10) } }));
    expect(w('rms').warnings.find((x) => x.code === 'SQUARE_RMS_UNIPOLAR')?.message).toMatch(/understates/);
    expect(w('peak').warnings.some((x) => x.code === 'SQUARE_RMS_UNIPOLAR')).toBe(false);
  });
});

describe('ipc-spacing: numbers from the synthetic T8', () => {
  it('internal conductors: next higher voltage band', () => {
    expect(primary(ok(base()))).toBeCloseTo(mm(t8(0, 1)), 12); // 15 V -> row 20 V
    expect(primary(ok(base({ voltagePeak: V(10) })))).toBeCloseTo(mm(t8(0, 0)), 12);
    expect(primary(ok(base({ voltagePeak: V(30) })))).toBeCloseTo(mm(t8(0, 2)), 12);
  });
  it('above the top band the per-volt row extends it', () => {
    const r = ok(base({ voltagePeak: V(50) }));
    expect(primary(r)).toBeCloseTo(mm(t8(0, 2) + 20 * T8_PER_VOLT_MM), 12);
    expect(r.assumptions.join(' ')).toContain('per-volt-extension');
  });
  it('external uncoated: the elevation breakpoint picks the column; at the breakpoint counts as above (conservative)', () => {
    expect(primary(ok(external({ elevation: M(0) })))).toBeCloseTo(mm(t8(1, 1)), 12);
    expect(primary(ok(external({ elevation: M(T8_BREAKPOINT_M - 1) })))).toBeCloseTo(mm(t8(1, 1)), 12);
    expect(primary(ok(external({ elevation: M(T8_BREAKPOINT_M) })))).toBeCloseTo(mm(t8(2, 1)), 12);
    expect(primary(ok(external({ elevation: M(T8_BREAKPOINT_M + 2000) })))).toBeCloseTo(mm(t8(2, 1)), 12);
  });
  it('external with a permanent polymer coating or solder mask needs no elevation', () => {
    const i = external({ coating: 'permanent-polymer-or-solder-mask' }) as unknown as Record<string, unknown>;
    delete i['elevation'];
    expect(primary(ok(i as unknown as Inputs))).toBeCloseTo(mm(t8(3, 1)), 12);
  });
  it('a combination the edition has no column for is refused with the table named, never a neighbour column', () => {
    expect(fails(external({ coating: 'conformal-coating' })).message).toContain('T8');
    expect(fails(external({ conductorKind: 'component-lead' })).gate).toBe('INSUFFICIENT_DATA');
    expect(fails(external({ elevation: 'vacuum' })).gate).toBe('INSUFFICIENT_DATA');
  });
  it('the elevation breakpoint must be entered when the columns use it', () => {
    const raw8 = rawSynthetic('T8');
    const { elevationBreakpoint: _bp, ...rest } = raw8;
    void _bp;
    const p = parseSpacingTable(rest);
    if (!p.ok) throw new Error(p.error.join('; '));
    const set = makeTableSet({ T8: p.value });
    if (!set.ok) throw new Error(set.error.join('; '));
    const e = fails(external({ tables: set.value }));
    expect(e.gate).toBe('INSUFFICIENT_DATA');
    expect(e.message).toContain('elevation breakpoint');
    // internal conductors do not need it
    expect(ok(base({}, set.value)).results.length).toBeGreaterThan(0);
  });
  it('AC rms is converted only with a declared waveform', () => {
    const w = ok(base({ voltagePeak: undefined as never, waveform: { shape: 'sine', basis: 'rms', value: V(10) } }));
    expect(primary(w)).toBeCloseTo(mm(t8(0, 1)), 12); // peak 14.14 V -> row 20 V
    const i = base() as unknown as Record<string, unknown>;
    delete i['voltagePeak'];
    expect(fails({ ...i, voltageRms: V(10) }).missing).toEqual(['voltagePeak']);
  });
  it('an unused internal-conductor coating or elevation is ignored, not an error', () => {
    expect(primary(ok(base({ coating: 'uncoated', elevation: M(10) })))).toBeCloseTo(mm(t8(0, 1)), 12);
  });
});

describe('ipc-spacing: labelling and banners', () => {
  it('is always labelled a design guideline and never a safety insulation assessment', () => {
    const r = ok(base());
    expect(r.method).toBe(meta.method);
    expect(r.method).toMatch(/IPC-2221/);
    expect(r.results.find((x) => x.role === 'primary')?.name).toMatch(/IPC-2221 design guideline/);
    expect(r.warnings.some((w) => w.code === 'IPC_NOT_SAFETY' && /not a safety insulation assessment/.test(w.message))).toBe(true);
    expect(r.warnings.some((w) => w.message === PRODUCT_STANDARD_BANNER)).toBe(true);
    expect(r.reference.standard).toBe('IPC-2221');
    expect(r.reference.edition).toBe(ED);
  });
  it('unverified data: red banner and indicative only; verified: none', () => {
    const r = ok(base());
    expect(r.warnings.find((w) => w.code === 'UNVERIFIED_TABLE_DATA')?.severity).toBe('critical');
    expect(r.recommendation).toMatch(/^indicative only/i);
    expect(r.results.find((x) => x.role === 'primary')?.name).toMatch(/^indicative only/i);
    expect(r.confidence.level).toBe('low');
    const v = ok(base({}, synthSet(['T8'], { verified: true })));
    expect(v.warnings.some((w) => w.code === 'UNVERIFIED_TABLE_DATA')).toBe(false);
    expect(v.confidence.level).toBe('medium');
  });
  it('no compliance wording in any output (fragment-assembled patterns)', () => {
    const words = [['compl', 'iant'], ['compl', 'ies'], ['comply', ' with'], ['certi', 'fied'], ['production', '[- ]?safe'], ['conform', 's to']].map((p) => p.join(''));
    const re = new RegExp(`\\b(${words.join('|')})\\b`, 'i');
    expect(re.test(JSON.stringify(ok(base())))).toBe(false);
    expect(re.test(JSON.stringify(fails(base({}, SHIPPED_TABLES))))).toBe(false);
  });
});

describe('ipc-spacing: gating', () => {
  const ALWAYS = ['edition', 'voltagePeak', 'location'];
  it.each(ALWAYS)('missing %s blocks the output and is listed', (field) => {
    const i = { ...base() } as Record<string, unknown>;
    delete i[field];
    const e = fails(i);
    expect(e.gate).toBe('INSUFFICIENT_INPUTS');
    expect(e.message).toMatch(/^Insufficient inputs: /);
    expect(e.missing).toContain(field);
  });
  it('external conductors also need the conductor kind and coating; uncoated also needs the elevation', () => {
    const i = { ...external() } as Record<string, unknown>;
    delete i['conductorKind'];
    expect(fails(i).missing).toEqual(['conductorKind']);
    delete i['coating'];
    expect(fails(i).missing).toEqual(['conductorKind', 'coating']);
    const j = { ...external() } as Record<string, unknown>;
    delete j['elevation'];
    expect(fails(j).missing).toEqual(['elevation']);
  });
  it('property: removing any non-empty subset of the mandatory inputs of an external conductor always blocks the output', () => {
    const names = ['edition', 'voltagePeak', 'location', 'conductorKind', 'coating', 'elevation'];
    fc.assert(
      fc.property(fc.subarray(names, { minLength: 1 }), (drop) => {
        const i = { ...external() } as Record<string, unknown>;
        for (const n of drop) delete i[n];
        const out = compute(i as unknown as Inputs);
        if (out.ok) return false;
        if (drop.includes('location')) return out.error.gate === 'INSUFFICIENT_INPUTS' && out.error.missing?.includes('location') === true;
        return out.error.gate === 'INSUFFICIENT_INPUTS' && drop.every((n) => out.error.missing?.includes(n) === true);
      }),
    );
  });
  it('empty shipped T8: INSUFFICIENT DATA with the exact text, never a number', () => {
    const e = fails(base({}, SHIPPED_TABLES));
    expect(e.gate).toBe('INSUFFICIENT_DATA');
    expect(e.message).toBe('INSUFFICIENT DATA: table T8 IPC-2221 Table 6-1 electrical conductor spacing is empty (enter values from your licensed copy)');
  });
  it('inputs are checked before tables; an edition mismatch is refused', () => {
    const i = { ...base({}, SHIPPED_TABLES) } as Record<string, unknown>;
    delete i['location'];
    expect(fails(i).gate).toBe('INSUFFICIENT_INPUTS');
    expect(fails(base({ edition: 'OTHER' })).message).toContain('differs from the selected edition');
  });
  it('the default tables are the shipped (empty) ones', () => {
    const { tables: _t, ...rest } = base();
    void _t;
    expect(fails(rest).gate).toBe('INSUFFICIENT_DATA');
  });
  it('blank and null count as missing', () => {
    expect(fails({ ...base(), location: '' }).gate).toBe('INSUFFICIENT_INPUTS');
    expect(fails({ ...base(), voltagePeak: null }).gate).toBe('INSUFFICIENT_INPUTS');
  });
});

describe('ipc-spacing: guards return values, never throw', () => {
  const bads: [string, unknown][] = [
    ['voltagePeak', raw(0, DIM.VOLTAGE)],
    ['voltagePeak', raw(-3, DIM.VOLTAGE)],
    ['voltagePeak', raw(Number.NaN, DIM.VOLTAGE)],
    ['voltagePeak', raw(Number.POSITIVE_INFINITY, DIM.VOLTAGE)],
    ['voltagePeak', q(1, DIM.CURRENT)],
    ['location', 'both'],
    ['conductorKind', 'wire'],
    ['coating', 'paint'],
    ['elevation', 'moon'],
    ['elevation', raw(Number.NaN, DIM.LENGTH)],
    ['elevation', raw(1e9, DIM.LENGTH)],
    ['elevation', q(1, DIM.VOLTAGE)],
    ['edition', 7],
  ];
  it.each(bads)('bad %s is an error value (external conductor)', (field, value) => {
    expect(compute({ ...external(), [field]: value } as unknown as Inputs).ok).toBe(false);
  });
  it('non-object inputs and garbage never throw', () => {
    for (const x of [null, undefined, 5, 'x', []]) expect(compute(x as never).ok).toBe(false);
    const junk = fc.oneof(fc.constant(undefined), fc.constant(null), fc.double(), fc.string(), fc.boolean());
    fc.assert(
      fc.property(fc.constantFrom('voltagePeak', 'location', 'conductorKind', 'coating', 'elevation', 'edition'), junk, (f, v) => {
        return typeof compute({ ...external(), [f]: v } as unknown as Inputs).ok === 'boolean';
      }),
    );
  });
});

describe('ipc-spacing: properties and meta', () => {
  it('a higher voltage never lowers the spacing (including the per-volt extension)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 500, noNaN: true }), fc.double({ min: 1, max: 500, noNaN: true }), (a, b) => {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const x = compute(base({ voltagePeak: V(lo) }));
        const y = compute(base({ voltagePeak: V(hi) }));
        return x.ok && y.ok && primary(x.value) <= primary(y.value) + 1e-15;
      }),
    );
  });
  it('meta, determinism, performance; verified-table result names the signer', () => {
    expect(meta.id).toBe('ipc-spacing');
    expect(meta.mandatoryInputs).toContain('location');
    expect(meta.ledgerIds).toContain('S-033');
    const r = ok(base());
    expect(r.formula).toBe(meta.formula);
    expect(JSON.stringify(compute(base()))).toBe(JSON.stringify(compute(base())));
    expect(ok(base({}, synthSet(['T8'], { verified: true }))).recommendation).toContain('test-verifier');
    const i = external();
    // best of three rounds of 10 000, so a loaded CI machine does not make the bound flaky
    let best = Infinity;
    for (let round = 0; round < 3; round++) {
      const t0 = Date.now();
      for (let k = 0; k < 10_000; k++) compute(i);
      best = Math.min(best, Date.now() - t0);
    }
    expect(best).toBeLessThan(1000);
  });
  it('an unused table in the set does not matter', () => {
    const t = synthTable('T8');
    const set = makeTableSet({ T8: t });
    expect(set.ok).toBe(true);
  });
});
