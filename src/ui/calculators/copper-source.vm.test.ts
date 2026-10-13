import { describe, expect, it } from 'vitest';
import converterPage from './CopperConverter.tsx?raw';
import widthPage from './TraceWidth.tsx?raw';
import resPage from './TraceResistance.tsx?raw';
import guidanceSrc from '../components/FinishedCopperGuidance.tsx?raw';
import profileJson from '../../core/data/fab-profiles/jlcpcb-2026-10-06.json';
import * as conv from './copper-converter.vm';
import * as tw from './trace-width.vm';
import * as tr from './trace-resistance.vm';
import { FINISHED_NEEDS, NOT_ANSWERED_NOTE, WEIGHT_SOURCE_OPTIONS, WEIGHT_SOURCE_QUESTION, finishedGuidance, weightSourceFromHash } from './copper-source';
import { CALCULATOR_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';

describe('the question', () => {
  it('is asked with the two options and no preselected answer', () => {
    expect(WEIGHT_SOURCE_QUESTION).toBe('Where does this weight come from?');
    expect(WEIGHT_SOURCE_OPTIONS.map((o) => o.label)).toEqual(['Foil spec (base foil)', 'Fab order form (finished copper)']);
    expect(conv.DEFAULT_STATE.weightSource).toBe('');
    expect(tw.DEFAULT_STATE.weightSource).toBe('');
    expect(tr.DEFAULT_STATE.weightSource).toBe('');
  });
  it('is on all three pages, and the finished guidance is shown only for that answer', () => {
    for (const src of [converterPage, widthPage, resPage]) {
      expect(src).toMatch(/WEIGHT_SOURCE_QUESTION/);
      expect(src).toMatch(/state\.weightSource === 'finished' && <FinishedCopperGuidance \/>/);
    }
    expect(widthPage).not.toMatch(/Nominal foil, not finished copper/);
  });
  it('unknown hash values are dropped with a notice', () => {
    const n: string[] = [];
    expect(weightSourceFromHash('bogus', n)).toBe('');
    expect(n).toHaveLength(1);
    expect(weightSourceFromHash(undefined, n)).toBe('');
    expect(weightSourceFromHash('finished', n)).toBe('finished');
    expect(n).toHaveLength(1);
  });
});

describe('finished guidance comes only from the profile data', () => {
  it('lists exactly the profile keys, as UNVERIFIED with the ledger id', () => {
    const g = finishedGuidance();
    expect(g).not.toBeNull();
    if (g === null) return;
    expect(g.rows.map((r) => r.label)).toEqual(['Outer layer, ordered 1 oz', 'Inner layer, ordered 0.5 oz', 'Inner layer, ordered 1 oz']);
    expect(g.rows.map((r) => r.text)).toEqual(['1.6 mil (40.6 µm)', '0.6 mil (15.2 µm)', '1.2 mil (30.5 µm)']);
    const lim = profileJson.limits;
    expect([lim.finishedCopperOuter1oz.value, lim.finishedCopperInner0p5oz.value, lim.finishedCopperInner1oz.value]).toEqual([1.6, 0.6, 1.2]);
    expect(g.status).toBe('UNVERIFIED');
    expect(g.ledgerIds).toEqual(['S-019c']);
    expect(g.caveat).toMatch(/UNVERIFIED/);
    expect(g.caveat).toMatch(/unconfirmed/);
  });
  it('the component hardcodes no thickness number', () => {
    expect(guidanceSrc).not.toMatch(/\d\.\d\s*(mil|µm|um)/);
  });
});

describe('copper converter', () => {
  const base = { ...conv.DEFAULT_STATE, weight: '1 oz', layer: 'outer' as const };
  it('finished weight gives no number and no thickness basis is sent; guidance in words', () => {
    const v = conv.computeView({ ...base, weightSource: 'finished' });
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs).toEqual([FINISHED_NEEDS]);
    expect('result' in v).toBe(false);
  });
  it('foil spec converts as before with no note and no F-2 error', () => {
    const v = conv.computeView({ ...base, weightSource: 'foil', basis: 'finished' });
    expect(v.status).toBe('ok');
    expect(v.notes).not.toContain(NOT_ANSWERED_NOTE);
  });
  it('not answered still converts but says so, with a default provenance row', () => {
    const v = conv.computeView(base);
    expect(v.status).toBe('ok');
    expect(v.notes).toContain(NOT_ANSWERED_NOTE);
    if (v.status === 'ok') expect(JSON.stringify(v.result.details)).toMatch(/Weight source/);
  });
  it('the answer is ignored when a thickness is entered', () => {
    const v = conv.computeView({ ...conv.DEFAULT_STATE, by: 'thickness', thickness: '35 um', layer: 'inner', weightSource: 'finished' });
    expect(v.status).toBe('ok');
  });
  it('round-trips through the hash and is documented', () => {
    const s = { ...base, weightSource: 'finished' as const };
    const h = conv.toHashState(s);
    expect(h['wsrc']).toBe('finished');
    expect(Object.keys(CALCULATOR_STATE_KEYS['copper-converter'])).toContain('wsrc');
    expect(conv.fromHashState(parseHash(serializeHash({ name: 'calc', id: 'copper-converter' }, h)).state).state).toEqual(s);
    expect(conv.toHashState(conv.DEFAULT_STATE)).toEqual({});
    expect([...conv.WRITTEN_KEYS].sort()).toEqual([...Object.keys(CALCULATOR_STATE_KEYS['copper-converter']), 'u'].sort());
    expect(conv.fromHashState({ wsrc: 'x' }).notices).toHaveLength(1);
  });
});

describe('trace pages', () => {
  it('trace width: finished weight gives needs-input, not a number', () => {
    const s = { ...tw.DEFAULT_STATE, solveFor: 'width' as const, current: '1 A', deltaT: '10 K', layer: 'outer' as const, copperWeight: '1 oz' };
    const open = tw.computeView(s);
    expect(open.status).toBe('ok');
    expect(open.notes).toContain(NOT_ANSWERED_NOTE);
    const fin = tw.computeView({ ...s, weightSource: 'finished' });
    expect(fin.status).toBe('needs-input');
    expect(tw.computeView({ ...s, weightSource: 'foil' }).notes).not.toContain(NOT_ANSWERED_NOTE);
    expect(tw.fromHashState(parseHash(serializeHash({ name: 'calc', id: 'trace-width' }, tw.toHashState({ ...s, weightSource: 'finished' }))).state).state.weightSource).toBe('finished');
    expect([...tw.WRITTEN_KEYS].sort()).toEqual([...Object.keys(CALCULATOR_STATE_KEYS['trace-width']), 'u'].sort());
  });
  it('trace resistance: finished weight gives needs-input, not a number', () => {
    const s = { ...tr.DEFAULT_STATE, length: '100 mm', width: '0.25 mm', layer: 'outer' as const, copperWeight: '1 oz' };
    expect(tr.computeView(s).status).toBe('ok');
    expect(tr.computeView({ ...s, weightSource: 'finished' }).status).toBe('needs-input');
    expect(tr.fromHashState(parseHash(serializeHash({ name: 'calc', id: 'trace-resistance' }, tr.toHashState({ ...s, weightSource: 'foil' }))).state).state.weightSource).toBe('foil');
    expect([...tr.WRITTEN_KEYS].sort()).toEqual([...Object.keys(CALCULATOR_STATE_KEYS['trace-resistance']), 'u'].sort());
  });
});
