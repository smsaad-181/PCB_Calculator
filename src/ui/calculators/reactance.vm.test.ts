import { describe, expect, it } from 'vitest';
import { meta } from '../../core/calculators/reactance/meta';
import { parseHash, serializeHash } from '../../state/hash';
import { CALCULATOR_STATE_KEYS } from '../../state/state-key-docs';
import { CALCULATOR_ID, DEFAULT_STATE, WRITTEN_KEYS, activeFields, computeView, fromHashState, liveSummary, toHashState, type ReactanceState } from './reactance.vm';

const st = (p: Partial<ReactanceState>): ReactanceState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;

function ok(s: ReactanceState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}
const rows = (v: ReturnType<typeof ok>): Record<string, string> => Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));

describe('no default for the kind', () => {
  it('starts empty and asks for a choice', () => {
    expect(DEFAULT_STATE.kind).toBe('');
    const v = computeView(DEFAULT_STATE);
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/inductive or capacitive/);
  });
  it('a kind with fewer than two values uses the core message', () => {
    const v = computeView(st({ kind: 'inductive', frequency: '1 kHz' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/Give exactly two of reactance, frequency, inductance; 1 given/);
  });
});

describe('inductive', () => {
  const XL = st({ kind: 'inductive', component: '1 mH', frequency: '1 kHz' });
  it('1 mH at 1 kHz is 6.28319 ohm, labelled a magnitude', () => {
    const v = ok(XL);
    expect(v.result.headline.label).toBe('Reactance magnitude |X_L| (solved)');
    expect(v.result.headline.text).toBe('6.28319 Ω');
    const r = rows(v);
    expect(r['Frequency (given)']).toBe('1 kHz');
    expect(r['Inductance L (given)']).toBe('1 mH');
  });
  it('solves the frequency or the inductance', () => {
    const f = ok(st({ kind: 'inductive', component: '1 mH', reactance: '6.28319 Ω' }));
    expect(f.result.headline.label).toBe('Frequency (solved)');
    expect(f.result.headline.text).toMatch(/^(1 kHz|999\.99\d* Hz|1\.0000\d* kHz)$/);
    const l = ok(st({ kind: 'inductive', frequency: '1 kHz', reactance: '6.28319 Ω' }));
    expect(l.result.headline.label).toBe('Inductance L (solved)');
  });
  it('the formula comes from the metadata of the kind', () => {
    expect(ok(XL).result.details.formula).toBe(meta.formula.inductive);
    expect(ok(st({ kind: 'capacitive', component: '100 nF', frequency: '1 kHz' })).result.details.formula).toBe(meta.formula.capacitive);
  });
  it('the ledger is S-019 only, VERIFIED, no badge', () => {
    const v = ok(XL);
    expect(v.ledgerRows.map((r) => [r.id, r.status])).toEqual([['S-019', 'VERIFIED']]);
    expect(v.result.ledger.unverifiedIds).toEqual([]);
  });
  it('the ideal-component caution is a callout with the core text; the magnitude note stays in the list', () => {
    const v = ok(XL);
    expect(v.callout?.heading).toMatch(/Ideal component/);
    expect(v.callout?.text).toMatch(/self-resonant frequency/);
    expect(v.result.warnings.some((w) => w.message === v.callout?.text)).toBe(false);
    expect(v.result.warnings.some((w) => /magnitude/.test(w.message))).toBe(true);
  });
});

describe('capacitive', () => {
  it('100 nF at 1 kHz is about 1.59 kohm', () => {
    const v = ok(st({ kind: 'capacitive', component: '100 nF', frequency: '1 kHz' }));
    expect(v.result.headline.label).toBe('Reactance magnitude |X_C| (solved)');
    expect(v.result.headline.text).toBe('1.59155 kΩ');
    expect(rows(v)['Capacitance C (given)']).toBe('100 nF');
  });
  it('a value of the other component is not read', () => {
    expect(activeFields('capacitive')).toEqual(['reactance', 'frequency', 'component']);
    const v = ok(st({ kind: 'capacitive', component: '100 nF', frequency: '1 kHz', reactance: '' }));
    expect(v.status).toBe('ok');
  });
});

describe('over-specified and invalid input', () => {
  it('three given: inline error with the core message; inconsistent is named', () => {
    const a = computeView(st({ kind: 'inductive', component: '1 mH', frequency: '1 kHz', reactance: '6.28319 Ω' }));
    expect(a.status).toBe('error');
    if (a.status === 'error') expect(a.problems.join(' ')).toMatch(/over-specified/);
    const b = computeView(st({ kind: 'inductive', component: '1 mH', frequency: '1 kHz', reactance: '10 Ω' }));
    if (b.status === 'error') expect(b.problems.join(' ')).toMatch(/inconsistent/);
    else throw new Error('expected error');
  });
  it('wrong dimension, zero, negative and garbage never give a number', () => {
    for (const bad of ['1 V', '0', '-1 Hz', 'abc', 'Infinity']) {
      const v = computeView(st({ kind: 'inductive', component: '1 mH', frequency: bad }));
      expect(v.status, bad).toBe('error');
      if (v.status === 'error') expect(Object.keys(v.fieldErrors), bad).toContain('frequency');
    }
  });
});

describe('hash state', () => {
  it('round-trips through the real hash', () => {
    const s = st({ kind: 'capacitive', component: '100 nF', frequency: '1 kHz' });
    const h = toHashState(s);
    expect(h).toEqual({ kd: 'capacitive', cv: '100 nF', f: '1 kHz' });
    const back = fromHashState(parseHash(serializeHash(ROUTE, h)).state);
    expect(back.notices).toEqual([]);
    expect(back.state).toEqual(s);
  });
  it('unknown kind and over-long text fall back with a notice; default writes nothing', () => {
    const a = fromHashState({ kd: 'both', x: 'y'.repeat(41) });
    expect(a.state.kind).toBe('');
    expect(a.state.reactance).toBe('');
    expect(a.notices).toHaveLength(2);
    expect(toHashState(DEFAULT_STATE)).toEqual({});
  });
  it('written keys are documented', () => {
    expect(Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]).sort()).toEqual([...WRITTEN_KEYS].sort());
    expect([...WRITTEN_KEYS].sort()).toEqual(['cv', 'f', 'kd', 'x']);
  });
});

describe('live summary', () => {
  it('states the outcome in words', () => {
    expect(liveSummary(computeView(DEFAULT_STATE))).toMatch(/^No result yet/);
    expect(liveSummary(computeView(st({ kind: 'inductive', frequency: 'x' })))).toMatch(/^No result\./);
    expect(liveSummary(computeView(st({ kind: 'inductive', component: '1 mH', frequency: '1 kHz' })))).toMatch(/^Result: Reactance magnitude \|X_L\| \(solved\) 6\.28319 Ω\./);
  });
});
