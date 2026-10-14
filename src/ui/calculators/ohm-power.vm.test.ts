import { describe, expect, it } from 'vitest';
import pageSrc from './OhmPower.tsx?raw';
import { meta } from '../../core/calculators/ohm-power/meta';
import { CALCULATOR_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  FIELD_KEYS,
  HINT_TEXT,
  WRITTEN_KEYS,
  computeView,
  countStatus,
  countText,
  fieldPatch,
  fromHashState,
  liveSummary,
  toHashState,
  type OhmState,
} from './ohm-power.vm';

const st = (p: Partial<OhmState>): OhmState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;

function ok(s: OhmState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}

describe('solve flow', () => {
  it('5 V and 100 Ω solve to 50 mA and 250 mW', () => {
    const v = ok(st({ voltage: '5 V', resistance: '100 Ω' }));
    expect(v.result.headline.label).toBe('Current (solved)');
    expect(v.result.headline.text).toBe('50 mA');
    const rows = Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));
    expect(rows['Power (solved)']).toBe('250 mW');
    expect(rows['Voltage (given)']).toBe('5 V');
    expect(rows['Resistance (given)']).toBe('100 Ω');
    expect(v.solved).toEqual(['current', 'power']);
    expect(v.given).toEqual(['voltage', 'resistance']);
  });
  it('solved quantities come before the ones you gave', () => {
    const v = ok(st({ voltage: '5 V', resistance: '100 Ω' }));
    expect(v.result.rows.map((r) => r.label)).toEqual(['Power (solved)', 'Voltage (given)', 'Resistance (given)']);
  });
  it('a solved power rounds up (predicted value), a solved current rounds to nearest', () => {
    const v = ok(st({ voltage: '3.3 V', resistance: '47 Ω' }));
    expect(v.result.headline.meaning).toBe('Nominal value (rounded to nearest)');
    expect(v.raw.results.find((r) => r.name === 'power')?.bound).toBe('prediction');
  });
  it('all six pairs of givens solve the other two, and the headline is the first solved quantity', () => {
    const all = { voltage: '10 V', current: '2 A', resistance: '5 Ω', power: '20 W' } as const;
    const pairs: [keyof typeof all, keyof typeof all][] = [
      ['voltage', 'current'],
      ['voltage', 'resistance'],
      ['voltage', 'power'],
      ['current', 'resistance'],
      ['current', 'power'],
      ['resistance', 'power'],
    ];
    for (const [a, b] of pairs) {
      const v = ok(st({ [a]: all[a], [b]: all[b] }));
      expect(v.given).toEqual(FIELD_KEYS.filter((k) => k === a || k === b));
      expect(v.solved).toHaveLength(2);
      expect(v.result.headline.label).toMatch(/\(solved\)$/);
      expect(v.result.rows.filter((r) => r.label.endsWith('(solved)'))).toHaveLength(1);
      expect(v.result.rows).toHaveLength(3);
    }
  });
  it('accepts component codes and prefixes in the resistance field', () => {
    const v = ok(st({ current: '1 mA', resistance: '4k7' }));
    expect(v.result.rows.find((r) => r.label === 'Voltage (solved)')?.text ?? v.result.headline.text).toMatch(/4\.7 V/);
  });
});

describe('what the reader sees', () => {
  const v = ok(st({ voltage: '5 V', resistance: '100 Ω' }));
  it('shows confidence with level, score and reasons, plausibility checks and a recommendation', () => {
    expect(v.result.confidence.level).toBe('high');
    expect(v.result.confidence.score).toBe(0);
    expect(v.result.confidence.reasons).toEqual([]);
    expect(v.result.confidence.ruleText.length).toBeGreaterThan(20);
    expect(v.result.details.validity).toHaveLength(4);
    expect(v.result.details.validity.every((c) => c.ok)).toBe(true);
    expect(v.result.recommendation).toMatch(/power rating/);
  });
  it('renders the formula from the calculator metadata, with S-019 status VERIFIED (no badge)', () => {
    expect(v.result.details.formula).toBe(meta.formula);
    expect(v.result.details.steps.map((s) => s.expr)).toEqual(['I = V / R', 'P = V² / R']);
    expect(v.result.ledger.entries.map((e) => e.id)).toEqual(['S-019']);
    expect(v.result.ledger.unverifiedIds).toEqual([]);
    expect(v.result.details.assumptions.join(' ')).toMatch(/Ideal resistor/);
  });
  it('an out-of-range answer fails a visible check and lowers confidence to low', () => {
    const big = ok(st({ voltage: '2 kV', resistance: '1 Ω' }));
    expect(big.result.details.validity.some((c) => !c.ok)).toBe(true);
    expect(big.result.confidence.level).toBe('low');
    expect(big.result.confidence.reasons.length).toBeGreaterThan(0);
  });
});

describe('count state', () => {
  it('counts the fields that hold text and says what to do', () => {
    expect(countText(DEFAULT_STATE)).toBe('0 of 2 given');
    expect(countText(st({ voltage: '5 V' }))).toBe('1 of 2 given');
    expect(countText(st({ voltage: '5 V', current: '1 A' }))).toBe('2 of 2 given');
    expect(countText(st({ voltage: '5 V', current: '1 A', power: '5 W' }))).toBe('3 given: over-specified — remove one');
    expect(countText(st({ voltage: '5 V', current: '1 A', power: '5 W', resistance: '5 Ω' }))).toBe('4 given: over-specified — remove two');
    expect(countStatus(st({ voltage: '5 V' }))).toBe('short');
    expect(countStatus(st({ voltage: '5 V', current: '1 A' }))).toBe('ok');
    expect(countStatus(st({ voltage: '5 V', current: '1 A', power: '5 W' }))).toBe('over');
    expect(countText(st({ voltage: '   ' }))).toBe('0 of 2 given');
  });
  it('the page carries the exact hint', () => {
    expect(HINT_TEXT).toBe('Give exactly two; the other two are solved.');
    expect(pageSrc).toMatch(/HINT_TEXT/);
  });
});

describe('invalid input never gives a number', () => {
  it('fewer than two given asks for more', () => {
    const v = computeView(st({ voltage: '5 V' }));
    expect(v.status).toBe('needs-input');
    expect(computeView(DEFAULT_STATE).status).toBe('needs-input');
  });
  it('three given is an inline error, consistent or not', () => {
    const consistent = computeView(st({ voltage: '5 V', current: '50 mA', resistance: '100 Ω' }));
    expect(consistent.status).toBe('error');
    if (consistent.status === 'error') expect(consistent.problems.join(' ')).toMatch(/over-specified/);
    const inconsistent = computeView(st({ voltage: '5 V', current: '1 A', resistance: '100 Ω' }));
    expect(inconsistent.status).toBe('error');
    if (inconsistent.status === 'error') expect(inconsistent.problems.join(' ')).toMatch(/inconsistent/);
  });
  it('a bare number, zero, negative, NaN and wrong-dimension text are field errors', () => {
    for (const t of ['5', '0 V', '-5 V', 'NaN V', 'Infinity V', '5 A', '1e999 V', 'abc', '5 V V']) {
      const v = computeView(st({ voltage: t, resistance: '100 Ω' }));
      expect(v.status, t).toBe('error');
      if (v.status === 'error') expect(v.fieldErrors.voltage, t).toBeDefined();
    }
  });
  it('unrepresentable results are refused, not shown as Infinity', () => {
    const v = computeView(st({ voltage: '1e300 V', current: '1e-300 A' }));
    expect(v.status).toBe('error');
    expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity/);
  });
  it('the live summary states the count and the outcome in words', () => {
    const s = st({ voltage: '5 V', resistance: '100 Ω' });
    expect(liveSummary(s, computeView(s))).toMatch(/^2 of 2 given\. Result: Current \(solved\) 50 mA\. Power \(solved\) 250 mW\. Confidence high\. 0 validity checks failed\.$/);
    const bad = st({ voltage: '5 V', current: '1 A', power: '5 W' });
    expect(liveSummary(bad, computeView(bad))).toMatch(/^3 given: over-specified — remove one\. No result\./);
    expect(liveSummary(DEFAULT_STATE, computeView(DEFAULT_STATE))).toMatch(/^0 of 2 given\. No result yet\./);
  });
});

describe('hash state', () => {
  it('writes only what holds text, under documented keys', () => {
    expect(toHashState(DEFAULT_STATE)).toEqual({});
    const h = toHashState(st({ voltage: '5 V', resistance: '100 Ω' }));
    expect(h).toEqual({ vo: '5 V', r: '100 Ω' });
    for (const k of Object.keys(h)) expect(Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID])).toContain(k);
    expect([...WRITTEN_KEYS].sort()).toEqual(Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]).sort());
  });
  it('round-trips through serializeHash and parseHash', () => {
    const s = st({ voltage: '5 V', current: '', resistance: '4k7', power: '1/4 W' });
    const link = serializeHash(ROUTE, toHashState(s));
    expect(link).toMatch(/^#\/calc\/ohm-power\?v=1&/);
    const back = fromHashState(parseHash(link).state);
    expect(back.state).toEqual(s);
    expect(back.notices).toEqual([]);
  });
  it('hostile and corrupt state falls back to defaults without throwing', () => {
    const hostile = [
      '#/calc/ohm-power?v=1&vo=%3Cscript%3Ealert(1)%3C%2Fscript%3E&__proto__=x&constructor=y&r=' + 'x'.repeat(5000),
      '#/calc/ohm-power?v=1&vo=%E0%A4%A',
      '#/calc/ohm-power?v=99&vo=5%20V',
      '#/calc/ohm-power?vo=5%20V',
      '#/calc/ohm-power?v=1&' + Array.from({ length: 100 }, (_, i) => `k${String(i)}=1`).join('&'),
    ];
    for (const h of hostile) {
      const p = parseHash(h);
      const loaded = fromHashState(p.state);
      for (const k of FIELD_KEYS) expect(typeof loaded.state[k]).toBe('string');
      expect(computeView(loaded.state).status).not.toBe('ok');
      expect(Object.keys(loaded.state).sort()).toEqual([...FIELD_KEYS].sort());
    }
    const p = parseHash(hostile[1] as string);
    expect(p.stateDiscarded).toBe(true);
    expect(fromHashState(p.state).state).toEqual(DEFAULT_STATE);
  });
  it('markup in a field is an inline parse error, and text over 40 characters is dropped with a notice', () => {
    const l = fromHashState({ vo: '<img src=x onerror=1>', i: 'y'.repeat(41) });
    expect(l.state.voltage).toBe('<img src=x onerror=1>');
    expect(l.state.current).toBe('');
    expect(l.notices.join(' ')).toMatch(/Current was too long/);
    expect(computeView(st({ voltage: l.state.voltage, resistance: '1 Ω' })).status).toBe('error');
  });
  it('fieldPatch changes exactly one field', () => {
    expect(fieldPatch('power', '1 W')).toEqual({ power: '1 W' });
  });
});

describe('speed', () => {
  it('500 closed-form solves fit a generous total budget (coverage-safe)', () => {
    const s = st({ voltage: '5 V', resistance: '100 Ω' });
    computeView(s);
    const n = 500;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) computeView(s);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
