import { describe, expect, it } from 'vitest';
import { meta } from '../../core/calculators/led-resistor/meta';
import { CALCULATOR_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import { CALCULATOR_ID, DEFAULT_STATE, WRITTEN_KEYS, computeView, fromHashState, liveSummary, toHashState, type LedState } from './led-resistor.vm';

const st = (p: Partial<LedState>): LedState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
const BASE = { vs: '5 V', vf: '2.1 V', current: '10 mA' } as const;

function ok(s: LedState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}
const rows = (v: ReturnType<typeof ok>): Record<string, string> => Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));

describe('required inputs are never pre-filled', () => {
  it('the default state has no Vf, no supply, no current and no series chosen for snapping', () => {
    expect(DEFAULT_STATE.vf).toBe('');
    expect(DEFAULT_STATE.vs).toBe('');
    expect(DEFAULT_STATE.current).toBe('');
    expect(DEFAULT_STATE.series).toBe('none');
    const v = computeView(DEFAULT_STATE);
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') {
      expect(v.needs).toHaveLength(3);
      expect(v.needs.join(' ')).toMatch(/datasheet/);
    }
  });
});

describe('exact resistor', () => {
  it('5 V, 2.1 V, 10 mA gives exactly 290 ohm and no snapping rows', () => {
    const v = ok(st(BASE));
    expect(v.result.headline.label).toBe('Series resistor R, exact value (not a stock value)');
    expect(v.result.headline.text).toBe('290 Ω');
    expect(v.result.headline.meaning).toBe('Minimum required (rounded up)');
    const r = rows(v);
    expect(r['LED current with this resistor']).toBe('10 mA');
    expect(Object.keys(r).some((l) => /before rounding/.test(l))).toBe(false);
    expect(v.result.ledger.entries.map((e) => e.id)).toEqual(['S-019']);
    expect(v.result.ledger.unverifiedIds).toEqual([]);
  });
  it('the formula comes from the calculator metadata', () => {
    expect(ok(st(BASE)).result.details.formula).toBe(meta.formula);
  });
  it('several LEDs in series add their forward voltages', () => {
    const v = ok(st({ vs: '12 V', vf: '2 V', current: '20 mA', nLeds: '3' }));
    expect(v.result.headline.text).toBe('300 Ω');
    expect(rows(v)['Total forward voltage (N × Vf)']).toBe('6 V');
  });
});

describe('rounding up to a series', () => {
  const E24 = st({ ...BASE, series: 'E24' });
  it('E24 gives 300 ohm, 9.667 mA, a signed error and the paywalled ledger row', () => {
    const v = ok(E24);
    expect(v.result.headline.label).toBe('Series resistor R, rounded up to E24');
    expect(v.result.headline.text).toBe('300 Ω');
    const r = rows(v);
    expect(r['LED current with this resistor']).toBe('9.667 mA');
    expect(r['Current error vs target (signed; size rounded away from zero)']).toMatch(/^-3\.\d+ %$/);
    expect(r['Exact resistor before rounding up']).toBe('290 Ω');
    expect(v.ledgerRows.map((x) => [x.id, x.status])).toEqual([['S-019', 'VERIFIED'], ['S-016', 'PAYWALLED-USER-MUST-VERIFY']]);
    expect(v.result.ledger.unverifiedIds).toEqual(['S-016']);
  });
  it('the signed error is core formatSignedPercent of the core value', () => {
    const v = ok(E24);
    const e = v.raw.results.find((x) => x.name === 'current error vs target');
    expect(e).toBeDefined();
    expect(e?.value.si).toBeLessThan(0);
  });
});

describe('resistor rating', () => {
  it('shows the utilisation as a percent and the margin', () => {
    const v = ok(st({ ...BASE, series: 'E24', rating: '250 mW' }));
    const r = rows(v);
    expect(r['Resistor power utilisation (of the rating you entered)']).toMatch(/ %$/);
    expect(r['Resistor power margin (rating minus dissipation)']).toMatch(/mW$/);
  });
  it('a resistor above its rating is a warning, not a silent pass', () => {
    const v = ok(st({ ...BASE, rating: '1 mW' }));
    expect(v.result.warnings.some((w) => w.severity === 'warning' && /more than the rated power/.test(w.message))).toBe(true);
  });
  it('without a rating the page says so', () => {
    expect(ok(st(BASE)).result.warnings.some((w) => /not checked/.test(w.message))).toBe(true);
  });
});

describe('invalid input', () => {
  it('Vs at or below Vf is an inline error on the supply with the core message, never a number', () => {
    const v = computeView(st({ vs: '2 V', vf: '2.1 V', current: '10 mA' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') {
      expect(v.problems.join(' ')).toMatch(/must be above/);
      expect(Object.keys(v.fieldErrors)).toContain('vs');
    }
  });
  it('wrong dimension, zero, negative and garbage are field errors', () => {
    for (const [k, bad] of [['vs', '5 A'], ['vf', '0'], ['current', '-1 mA'], ['vs', 'abc'], ['current', 'NaN'], ['rating', '5 V']] as const) {
      const v = computeView(st({ ...BASE, [k]: bad }));
      expect(v.status, `${k} ${bad}`).toBe('error');
      if (v.status === 'error') expect(Object.keys(v.fieldErrors), `${k} ${bad}`).toContain(k);
    }
  });
  it('the LED count must be a whole number the calculator accepts', () => {
    for (const bad of ['0', '1.5', 'x', '-2', '1001']) {
      const v = computeView(st({ ...BASE, nLeds: bad }));
      expect(v.status, bad).toBe('error');
      if (v.status === 'error') expect(Object.keys(v.fieldErrors), bad).toContain('nLeds');
    }
  });
});

describe('hash state', () => {
  it('round-trips through the real hash', () => {
    const s = st({ ...BASE, series: 'E24', nLeds: '2', rating: '250 mW' });
    const h = toHashState(s);
    expect(h).toEqual({ vs: '5 V', vf: '2.1 V', i: '10 mA', n: '2', se: 'E24', pr: '250 mW' });
    const back = fromHashState(parseHash(serializeHash(ROUTE, h)).state);
    expect(back.notices).toEqual([]);
    expect(back.state).toEqual(s);
  });
  it('unknown series and over-long text fall back with notices; default writes nothing', () => {
    const a = fromHashState({ se: 'E5', vf: 'y'.repeat(41) });
    expect(a.state.series).toBe('none');
    expect(a.state.vf).toBe('');
    expect(a.notices).toHaveLength(2);
    expect(toHashState(DEFAULT_STATE)).toEqual({});
  });
  it('written keys are documented', () => {
    expect(Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]).sort()).toEqual([...WRITTEN_KEYS].sort());
  });
});

describe('live summary', () => {
  it('states the outcome in words', () => {
    expect(liveSummary(computeView(DEFAULT_STATE))).toMatch(/^No result yet/);
    expect(liveSummary(computeView(st({ ...BASE, vs: 'x' })))).toMatch(/^No result\./);
    expect(liveSummary(computeView(st(BASE)))).toMatch(/^Result: Series resistor R, exact value \(not a stock value\) 290 Ω\./);
  });
});
