import { describe, expect, it } from 'vitest';
import vmSrc from './stackup.vm.ts?raw';
import editorSrc from './StackupEditor.tsx?raw';
import { DIM } from '../../core/units';
import { parseField } from './view';
import {
  EMPTY_DRAFT,
  NOT_IN_LINK,
  addLayer,
  deriveView,
  exportDraft,
  importDraft,
  loadStored,
  moveLayer,
  parseDraft,
  removeLayer,
  saveStored,
  updateLayer,
  type Draft,
  type StorageLike,
} from './stackup.vm';

// Test values only (never defaults): a 3-layer microstrip stack and a 5-layer stripline stack.
function build(layers: Partial<Draft['layers'][number]>[], signalLayer: string): Draft {
  let d: Draft = { ...EMPTY_DRAFT, signalLayer };
  for (const l of layers) {
    d = addLayer(d, l.kind ?? 'dielectric');
    d = updateLayer(d, d.layers.length - 1, l);
  }
  return d;
}
const cu = (name: string, thickness = '35 um'): Partial<Draft['layers'][number]> => ({ kind: 'copper', name, thickness, copperBy: 'thickness' });
const di = (name: string, thickness: string, er = '4.2'): Partial<Draft['layers'][number]> => ({ kind: 'dielectric', name, thickness, er, source: 'test value', df: '' });

const MICRO = build([cu('Top'), di('Core', '200 um'), cu('GND')], 'Top');
const STRIP = build([cu('GND1'), di('Up', '100 um'), cu('Sig', '17.5 um'), di('Down', '100 um'), cu('GND2')], 'Sig');

describe('the draft is empty by default and never pre-filled', () => {
  it('has no layers, no er and no source', () => {
    expect(EMPTY_DRAFT.layers).toEqual([]);
    expect(parseDraft(EMPTY_DRAFT).status).toBe('empty');
    expect(deriveView(EMPTY_DRAFT, 'microstrip').status).toBe('empty');
  });
  it('a new dielectric has empty er, Df and source (no defaults)', () => {
    const d = addLayer(EMPTY_DRAFT, 'dielectric');
    expect(d.layers[0]).toMatchObject({ kind: 'dielectric', er: '', df: '', source: '', thickness: '' });
  });
  it('new layers get unique names', () => {
    let d = EMPTY_DRAFT;
    for (let i = 0; i < 5; i++) d = addLayer(d, 'copper');
    expect(new Set(d.layers.map((l) => l.name)).size).toBe(5);
  });
});

describe('editing helpers', () => {
  it('rename follows the signal layer; remove and move work and ignore bad indexes', () => {
    const r = updateLayer(MICRO, 0, { name: 'Signal' });
    expect(r.signalLayer).toBe('Signal');
    expect(removeLayer(MICRO, 1).layers.length).toBe(2);
    expect(removeLayer(MICRO, 9)).toEqual(MICRO);
    expect(moveLayer(MICRO, 0, 1).layers.map((l) => l.name)).toEqual(['Core', 'Top', 'GND']);
    expect(moveLayer(MICRO, 0, -1)).toEqual(MICRO);
    expect(moveLayer(MICRO, 2, 1)).toEqual(MICRO);
  });
  it('removing the signal layer clears the choice', () => {
    expect(removeLayer(MICRO, 0).signalLayer).toBe('');
  });
});

describe('parseDraft goes through the core stackup guard and reports readable errors', () => {
  it('a valid stack parses', () => {
    const p = parseDraft(MICRO);
    expect(p.status).toBe('ok');
  });
  it('a dielectric without er or source is an error naming the layer', () => {
    const d = updateLayer(updateLayer(MICRO, 1, { er: '' }), 1, { source: '' });
    const p = parseDraft(d);
    expect(p.status).toBe('error');
    if (p.status === 'error') {
      const t = p.errors.join('\n');
      expect(t).toMatch(/Layer 2 \(Core\)/);
      expect(t).toMatch(/er/);
      expect(t).toMatch(/source/);
    }
  });
  it('a unit slip in a thickness is refused with the plausibility message, not a number', () => {
    const p = parseDraft(updateLayer(MICRO, 1, { thickness: '200 m' }));
    expect(p.status).toBe('error');
    if (p.status === 'error') expect(p.errors.join(' ')).toMatch(/plausibility|unit/i);
  });
  it('text that is not a number is an error on that field', () => {
    const p = parseDraft(updateLayer(MICRO, 1, { er: 'four' }));
    expect(p.status).toBe('error');
    const q = parseDraft(updateLayer(MICRO, 0, { thickness: 'thick' }));
    expect(q.status).toBe('error');
  });
  it('copper by weight parses an oz value', () => {
    const d = updateLayer(MICRO, 0, { copperBy: 'weight', thickness: '1 oz' });
    expect(parseDraft(d).status).toBe('ok');
  });
  it('duplicate names are refused by the core guard', () => {
    const p = parseDraft(updateLayer(MICRO, 2, { name: 'Top' }));
    expect(p.status).toBe('error');
    if (p.status === 'error') expect(p.errors.join(' ')).toMatch(/duplicate/i);
  });
});

describe('deriveView for microstrip', () => {
  it('shows h, t, er and the scalars the page will use', () => {
    const v = deriveView(MICRO, 'microstrip');
    if (v.status !== 'ok') throw new Error(JSON.stringify(v));
    const rows = Object.fromEntries(v.rows.map((r) => [r.label, r.text]));
    expect(rows['Dielectric height h']).toMatch(/^200(\.0+)? µm/);
    expect(rows['Trace thickness t']).toMatch(/^35(\.0+)? µm/);
    expect(rows['Relative permittivity er']).toBe('4.2');
    expect(v.scalars.er).toBe('4.2');
    expect(v.scalars.erSource).toBe('test value');
    expect(v.scalars.geometrySource).toMatch(/Top/);
    expect(v.scalars.size).toMatch(/200/);
    expect(v.scalars.thickness).toMatch(/35/);
  });
  it('the derived scalars parse back as lengths with the same value, so the link carries what the stackup derived', () => {
    const v = deriveView(MICRO, 'microstrip');
    if (v.status !== 'ok') throw new Error(JSON.stringify(v));
    const h = parseField(v.scalars.size, DIM.LENGTH);
    const t = parseField(v.scalars.thickness, DIM.LENGTH);
    expect(h.status).toBe('ok');
    expect(t.status).toBe('ok');
    if (h.status === 'ok') expect(h.echo).toMatch(/0.2 mm/);
    if (t.status === 'ok') expect(t.echo).toMatch(/0.035 mm/);
    const s = deriveView(STRIP, 'stripline');
    if (s.status !== 'ok') throw new Error(JSON.stringify(s));
    const b = parseField(s.scalars.size, DIM.LENGTH, { length: 'um', temperature: 'C', area: 'mm2' });
    expect(b.status === 'ok' && b.echo).toMatch(/217\.5/);
  });
  it('an inner layer is an embedded microstrip: the core error is shown', () => {
    const v = deriveView(updateLayer(STRIP, 0, {}), 'microstrip');
    expect(v.status).toBe('derive-error');
    if (v.status === 'derive-error') expect(v.message).toMatch(/embedded microstrip not offered/);
  });
  it('soldermask on the trace side is reported as a note, not modelled', () => {
    const mask = { kind: 'soldermask' as const, name: 'Mask', thickness: '20 um', copperBy: 'thickness' as const, er: '', df: '', source: '' };
    const v = deriveView({ ...MICRO, layers: [mask, ...MICRO.layers] }, 'microstrip');
    if (v.status !== 'ok') throw new Error(JSON.stringify(v));
    expect(v.notes.join(' ')).toMatch(/Soldermask/);
  });
  it('no signal layer chosen gives a prompt and no scalars', () => {
    const v = deriveView({ ...MICRO, signalLayer: '' }, 'microstrip');
    expect(v.status).toBe('no-signal');
    expect(v).not.toHaveProperty('scalars');
  });
  it('mixed er on the dielectric path is a core error', () => {
    const d = build([cu('Top'), di('A', '100 um', '4.0'), di('B', '100 um', '4.5'), cu('GND')], 'Top');
    const v = deriveView(d, 'microstrip');
    expect(v.status).toBe('derive-error');
    if (v.status === 'derive-error') expect(v.message).toMatch(/different er/);
  });
  it('an invalid stack shows the field errors, never derived numbers', () => {
    const v = deriveView(updateLayer(MICRO, 1, { er: '' }), 'microstrip');
    expect(v.status).toBe('error');
    expect(v).not.toHaveProperty('scalars');
  });
});

describe('deriveView for stripline', () => {
  it('shows b (plane to plane, including the strip), t and er', () => {
    const v = deriveView(STRIP, 'stripline');
    if (v.status !== 'ok') throw new Error(JSON.stringify(v));
    const rows = Object.fromEntries(v.rows.map((r) => [r.label, r.text]));
    expect(rows['Plane-to-plane spacing b']).toMatch(/217\.5/);
    expect(rows['Strip thickness t']).toMatch(/17\.5/);
    expect(v.scalars.size).toMatch(/217\.5/);
    expect(v.scalars.er).toBe('4.2');
  });
  it('an outer layer is not a stripline', () => {
    const v = deriveView(MICRO, 'stripline');
    expect(v.status).toBe('derive-error');
    if (v.status === 'derive-error') expect(v.message).toMatch(/not a stripline/);
  });
  it('an off-centre strip is refused: offset stripline is not offered', () => {
    const d = updateLayer(STRIP, 3, { thickness: '150 um' });
    const v = deriveView(d, 'stripline');
    expect(v.status).toBe('derive-error');
    if (v.status === 'derive-error') expect(v.message).toMatch(/offset stripline not offered/);
  });
});

describe('JSON export and import', () => {
  it('exports the core schema text with the er source and the unverified tag', () => {
    const t = exportDraft(MICRO);
    expect(t).toBeDefined();
    const j = JSON.parse(t ?? '{}') as Record<string, unknown>;
    expect(j['schemaVersion']).toBe(1);
    expect(j['provenance']).toBe('user-entered, unverified');
    expect(t).toMatch(/test value/);
  });
  it('an invalid draft has no export', () => {
    expect(exportDraft(EMPTY_DRAFT)).toBeUndefined();
    expect(exportDraft(updateLayer(MICRO, 1, { er: '' }))).toBeUndefined();
  });
  it('round-trips through import with the same derived result', () => {
    const t = exportDraft(MICRO) ?? '';
    const r = importDraft(t, 'Top');
    if (!r.ok) throw new Error(r.errors.join(';'));
    const a = deriveView(MICRO, 'microstrip');
    const b = deriveView(r.draft, 'microstrip');
    expect(b).toEqual(a);
  });
  it('import errors are listed with the field path and never produce a draft', () => {
    for (const text of ['', 'not json', '[]', '{"schemaVersion":2}', JSON.stringify({ schemaVersion: 1, kind: 'pcb-calc-stackup', name: 'x', layers: [{ kind: 'dielectric', name: 'a', thicknessUm: 100 }, { kind: 'copper', name: 'b', thicknessUm: 35 }] })]) {
      const r = importDraft(text, '');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
    }
  });
  it('an imported stack is not given a signal layer unless named and present', () => {
    const t = exportDraft(MICRO) ?? '';
    const r = importDraft(t, 'Nope');
    if (!r.ok) throw new Error('expected ok');
    expect(r.draft.signalLayer).toBe('');
  });
});

describe('session storage fallback is guarded', () => {
  const mem = (): StorageLike & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };
  it('round-trips a draft', () => {
    const s = mem();
    saveStored(s, 'k', MICRO);
    expect(loadStored(s, 'k')).toEqual(MICRO);
  });
  it('a throwing storage, a missing key and corrupt data all give the empty draft', () => {
    const boom: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadStored(boom, 'k')).toEqual(EMPTY_DRAFT);
    expect(() => saveStored(boom, 'k', MICRO)).not.toThrow();
    expect(loadStored(mem(), 'k')).toEqual(EMPTY_DRAFT);
    for (const bad of ['{', '[]', '"x"', '{"v":2}', '{"v":1,"draft":{"layers":"no"}}', '{"v":1,"draft":{"name":"n","signalLayer":"","layers":[{"kind":"alien"}]}}']) {
      const s = mem();
      s.setItem('k', bad);
      expect(loadStored(s, 'k')).toEqual(EMPTY_DRAFT);
    }
    expect(loadStored(null, 'k')).toEqual(EMPTY_DRAFT);
    expect(() => saveStored(null, 'k', MICRO)).not.toThrow();
  });
  it('an oversized stored value is ignored', () => {
    const s = mem();
    s.setItem('k', JSON.stringify({ v: 1, draft: { ...MICRO, name: 'x'.repeat(300_000) } }));
    expect(loadStored(s, 'k')).toEqual(EMPTY_DRAFT);
  });
});

describe('wording', () => {
  it('says the stackup is not part of the link', () => {
    expect(NOT_IN_LINK).toMatch(/not part of the link/i);
    expect(editorSrc).toMatch(/NOT_IN_LINK/);
  });
  it('no engineering math and no network in the helpers or the editor', () => {
    const src = `${vmSrc}\n${editorSrc}`;
    expect(src).not.toMatch(/Math\.|toFixed|toPrecision|\.si\b/);
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|import\(/);
  });
});
