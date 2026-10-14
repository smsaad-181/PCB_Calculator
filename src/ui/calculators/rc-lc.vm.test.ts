import { describe, expect, it } from 'vitest';
import { meta } from '../../core/calculators/rc-lc/meta';
import { CALCULATOR_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import { CALCULATOR_ID, DEFAULT_STATE, WRITTEN_KEYS, activeFields, computeView, fromHashState, liveSummary, toHashState, type RcLcState } from './rc-lc.vm';

const st = (p: Partial<RcLcState>): RcLcState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;

function ok(s: RcLcState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}
const rows = (v: ReturnType<typeof ok>): Record<string, string> => Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));

describe('no default for the family', () => {
  it('starts empty and asks for a choice', () => {
    expect(DEFAULT_STATE.family).toBe('');
    const v = computeView(DEFAULT_STATE);
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/RC or LC/);
  });
  it('a family with no values asks for two of three, using the core message', () => {
    const v = computeView(st({ family: 'rc' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/Give exactly two of resistance, capacitance, frequency/);
  });
});

describe('RC family', () => {
  const RC = st({ family: 'rc', resistance: '1 kΩ', capacitance: '1 µF' });
  it('1 kΩ and 1 µF give tau 1 ms and fc 159.155 Hz', () => {
    const v = ok(RC);
    const r = rows(v);
    expect(v.result.headline.label).toBe('Cut-off frequency fc, -3 dB (solved)');
    expect(v.result.headline.text).toBe('159.155 Hz');
    expect(r['Time constant τ']).toBe('1 ms');
    expect(r['Resistance R (given)']).toBe('1 kΩ');
    expect(r['Capacitance C (given)']).toBe('1 µF');
  });
  it('solves the resistance or the capacitance from fc', () => {
    const a = ok(st({ family: 'rc', frequency: '159.155 Hz', capacitance: '1 µF' }));
    expect(a.result.headline.label).toBe('Resistance R (solved)');
    expect(a.result.headline.text).toMatch(/^1\.0000\d* kΩ$|^1 kΩ$|^999\.99\d* Ω$/);
    const b = ok(st({ family: 'rc', frequency: '1 kHz', resistance: '1 kΩ' }));
    expect(b.result.headline.label).toBe('Capacitance C (solved)');
    expect(b.result.headline.text).toMatch(/nF$/);
  });
  it('the formula comes from the metadata of the family and the ledger is S-019 only', () => {
    const v = ok(RC);
    expect(v.result.details.formula).toBe(meta.formula.rc);
    expect(v.result.ledger.entries.map((e) => e.id)).toEqual(['S-019']);
    expect(v.ledgerRows.map((r) => [r.id, r.status])).toEqual([['S-019', 'VERIFIED']]);
    expect(v.result.ledger.unverifiedIds).toEqual([]);
  });
  it('the ideal-parts caution is a callout with the core text, not repeated in the list', () => {
    const v = ok(RC);
    expect(v.callout?.heading).toMatch(/Ideal parts/);
    expect(v.callout?.text).toMatch(/parasitics are ignored/);
    expect(v.result.warnings.some((w) => w.message === v.callout?.text)).toBe(false);
  });
  it('inactive fields are not read', () => {
    const v = ok({ ...RC, inductance: 'garbage', frequency: '' });
    expect(v.result.headline.text).toBe('159.155 Hz');
    expect(activeFields('rc')).toEqual(['resistance', 'capacitance', 'frequency']);
  });
});

describe('LC family', () => {
  const LC = st({ family: 'lc', inductance: '10 µH', capacitance: '100 nF' });
  it('solves f0 and shows the square root of L over C with the UNVERIFIED naming row', () => {
    const v = ok(LC);
    expect(v.result.headline.label).toBe('Resonant frequency f0 (solved)');
    expect(v.result.headline.text).toMatch(/kHz$/);
    expect(Object.keys(rows(v)).some((l) => l.startsWith('√(L/C)'))).toBe(true);
    expect(v.result.details.formula).toBe(meta.formula.lc);
    expect(v.ledgerRows.map((r) => [r.id, r.status])).toEqual([['S-019', 'VERIFIED'], ['S-019b', 'UNVERIFIED']]);
    expect(v.result.ledger.unverifiedIds).toEqual(['S-019b']);
  });
});

describe('over-specified and invalid input', () => {
  it('three given is an inline error with the core message, never a number', () => {
    const v = computeView(st({ family: 'rc', resistance: '1 kΩ', capacitance: '1 µF', frequency: '159.155 Hz' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.problems.join(' ')).toMatch(/over-specified/);
  });
  it('an inconsistent set is said to be inconsistent', () => {
    const v = computeView(st({ family: 'rc', resistance: '1 kΩ', capacitance: '1 µF', frequency: '1 kHz' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.problems.join(' ')).toMatch(/inconsistent/);
  });
  it('a wrong dimension, zero, negative and garbage are errors on the field', () => {
    for (const bad of ['1 V', '0', '-1 kΩ', 'abc', 'NaN', '1e999 Ω']) {
      const v = computeView(st({ family: 'rc', resistance: bad, capacitance: '1 µF' }));
      expect(v.status, bad).toBe('error');
      if (v.status === 'error') expect(Object.keys(v.fieldErrors), bad).toContain('resistance');
    }
  });
  it('a result outside the representable range is an error value, not a number', () => {
    const v = computeView(st({ family: 'rc', resistance: '1e300 Ω', capacitance: '1e300 F' }));
    expect(v.status).not.toBe('ok');
  });
});

describe('hash state', () => {
  it('round-trips through the real hash, only the active family fields', () => {
    const s = st({ family: 'lc', inductance: '10 µH', capacitance: '100 nF', resistance: '1 kΩ' });
    const h = toHashState(s);
    expect(h).toEqual({ fm: 'lc', l: '10 µH', c: '100 nF' });
    const back = fromHashState(parseHash(serializeHash(ROUTE, h)).state);
    expect(back.notices).toEqual([]);
    expect(back.state).toEqual({ ...DEFAULT_STATE, family: 'lc', inductance: '10 µH', capacitance: '100 nF' });
  });
  it('a default state writes nothing', () => {
    expect(toHashState(DEFAULT_STATE)).toEqual({});
  });
  it('unknown family and over-long text fall back with a notice', () => {
    const a = fromHashState({ fm: 'xx', r: 'y'.repeat(41) });
    expect(a.state.family).toBe('');
    expect(a.state.resistance).toBe('');
    expect(a.notices).toHaveLength(2);
  });
  it('written keys are documented and the table is complete', () => {
    expect(Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]).sort()).toEqual([...WRITTEN_KEYS].sort());
    expect([...WRITTEN_KEYS].sort()).toEqual(['c', 'f', 'fm', 'l', 'r']);
  });
});

describe('live summary', () => {
  it('states the outcome in words for all three statuses', () => {
    expect(liveSummary(computeView(DEFAULT_STATE))).toMatch(/^No result yet/);
    expect(liveSummary(computeView(st({ family: 'rc', resistance: 'x' })))).toMatch(/^No result\./);
    expect(liveSummary(computeView(st({ family: 'rc', resistance: '1 kΩ', capacitance: '1 µF' })))).toMatch(/^Result: Cut-off frequency fc, -3 dB \(solved\) 159\.155 Hz\. Confidence/);
  });
});
