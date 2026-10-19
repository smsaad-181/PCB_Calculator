import { describe, expect, it } from 'vitest';
import vmSrc from './coax.vm.ts?raw';
import pageSrc from './Coax.tsx?raw';
import { IMPEDANCE_BANNER } from '../../core/calculators/impedance-shared';
import { parseHash, serializeHash } from '../../state/hash';
import { CALCULATOR_STATE_KEYS } from '../../state/state-key-docs';
import { CALCULATOR_ID, DEFAULT_STATE, WRITTEN_KEYS, computeView, fromHashState, toHashState, type CoaxState } from './coax.vm';

const BANNED_WORDS = new RegExp(String.raw`${'compl'}iant|production[- ]${'saf'}e|${'cert'}ified`, 'i');
const st = (p: Partial<CoaxState>): CoaxState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
// D/d = 4, er = 2.25: Z0 = 55.41 ohm (ledger S-024). TEST values, never page defaults.
const EXAMPLE = st({ outerDiameter: '4 mm', innerDiameter: '1 mm', er: '2.25', erSource: 'test value (D/d 4, er 2.25)' });

function ok(s: CoaxState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}
const rowsOf = (v: ReturnType<typeof ok>) => Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));

describe('golden example (D 4 mm, d 1 mm, er 2.25)', () => {
  it('headline is Z0 of about 55.41 ohm; eps_eff equals er; ratio 4', () => {
    const v = ok(EXAMPLE);
    expect(v.result.headline.text).toMatch(/^55\.4\d* Ω$/);
    expect(rowsOf(v)['Effective permittivity']).toMatch(/^2\.25/);
    expect(rowsOf(v)['Diameter ratio D/d']).toMatch(/^4(\.0+)?$/);
    expect(v.banner.text).toBe(IMPEDANCE_BANNER);
  });
  it('S-024 VERIFIED is listed; the TEM-only caution is shown; confidence is at most medium', () => {
    const v = ok(EXAMPLE);
    expect(v.ledgerRows.find((r) => r.id === 'S-024')?.status).toBe('VERIFIED');
    expect(v.result.warnings.some((w) => /TEM only/.test(w.message))).toBe(true);
    expect(['medium', 'low']).toContain(v.result.confidence.level);
  });
  it('optional frequency, length and mismatch add rows; mismatch adds S-029b UNVERIFIED', () => {
    const v = ok(st({ ...EXAMPLE, frequency: '1 GHz', length: '1 m', mismatch: '5 mm' }));
    const rows = rowsOf(v);
    expect(rows['Guided wavelength']).toMatch(/mm/);
    expect(rows['Propagation delay']).toMatch(/ns|ps/);
    expect(rows['Skew from length mismatch']).toMatch(/ps/);
    expect(v.ledgerRows.find((r) => r.id === 'S-029b')?.status).toBe('UNVERIFIED');
  });
});

describe('er is never defaulted and its source is required', () => {
  it('empty er or empty source gives needs-input with the banner', () => {
    for (const p of [{ er: '' }, { erSource: '' }]) {
      const v = computeView(st({ ...EXAMPLE, ...p }));
      expect(v.status).toBe('needs-input');
      expect(v.banner.text).toBe(IMPEDANCE_BANNER);
    }
    expect(DEFAULT_STATE.er).toBe('');
    expect(toHashState(DEFAULT_STATE)).toEqual({});
  });
});

describe('solve for a diameter', () => {
  it('outer diameter from the inner diameter and the target Z0', () => {
    const v = ok(st({ ...EXAMPLE, outerDiameter: '', solveFor: 'outer', targetZ0: '55.4134 ohm' }));
    expect(v.result.headline.label).toMatch(/outer diameter/i);
    expect(v.result.headline.text).toBe('4 mm (157.48 mil)');
  });
  it('inner diameter from the outer diameter and the target Z0', () => {
    const v = ok(st({ ...EXAMPLE, innerDiameter: '', solveFor: 'inner', targetZ0: '55.4134 ohm' }));
    expect(v.result.headline.label).toMatch(/inner diameter/i);
    expect(v.result.headline.text).toBe('1 mm (39.37 mil)');
  });
  it('each mode asks only for what it uses', () => {
    const o = computeView(st({ ...EXAMPLE, outerDiameter: '', solveFor: 'outer', targetZ0: '' }));
    expect(o.status).toBe('needs-input');
    if (o.status === 'needs-input') {
      expect(o.needs.join(' ')).toMatch(/target/i);
      expect(o.needs.join(' ')).not.toMatch(/outer diameter/i);
    }
  });
  it('D not larger than d is a core error on the outer diameter', () => {
    const v = computeView(st({ ...EXAMPLE, outerDiameter: '1 mm', innerDiameter: '2 mm' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.fieldErrors.outerDiameter).toMatch(/larger/);
  });
});

describe('invalid input', () => {
  it.each([
    ['zero inner', { innerDiameter: '0 mm' }],
    ['negative outer', { outerDiameter: '-4 mm' }],
    ['er text', { er: 'nope' }],
    ['wrong unit', { outerDiameter: '3 V' }],
  ])('%s gives an error and no number', (_n, p) => {
    const v = computeView(st({ ...EXAMPLE, ...p }));
    expect(v.status).toBe('error');
    expect(JSON.stringify(v)).not.toMatch(/NaN/);
    expect(v.banner.text).toBe(IMPEDANCE_BANNER);
  });
});

describe('hash state', () => {
  it('round-trips with documented keys and falls back on corrupt input', () => {
    const s = st({ ...EXAMPLE, frequency: '1 GHz', length: '1 m', mismatch: '1 mm', units: 'imperial' });
    const back = fromHashState(parseHash(serializeHash(ROUTE, toHashState(s))).state);
    expect(back.notices).toEqual([]);
    expect(back.state).toEqual(s);
    for (const k of WRITTEN_KEYS) expect([...Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]), 'u']).toContain(k);
    expect(toHashState(st({ solveFor: 'outer' }))['sf']).toBe('outer');
    expect(fromHashState({ sf: 'bogus' }).notices.length).toBe(1);
    expect(fromHashState(parseHash('#/calc/coax?v=1&od=%E0%A4%A').state).state).toEqual(DEFAULT_STATE);
  });
});

describe('wording', () => {
  it('no engineering math, no retyped banner, no compliance wording', () => {
    const src = `${vmSrc}\n${pageSrc}`;
    expect(src).not.toMatch(/Math\.|toFixed|toPrecision|\.si\b/);
    expect(src).not.toMatch(/Final controlled impedance/);
    expect(src).not.toMatch(BANNED_WORDS);
  });
});
