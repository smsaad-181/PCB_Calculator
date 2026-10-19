import { describe, expect, it } from 'vitest';
import vmSrc from './stripline.vm.ts?raw';
import pageSrc from './Stripline.tsx?raw';
import { IMPEDANCE_BANNER } from '../../core/calculators/impedance-shared';
import { parseHash, serializeHash } from '../../state/hash';
import { CALCULATOR_STATE_KEYS } from '../../state/state-key-docs';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  WRITTEN_KEYS,
  computeView,
  fromHashState,
  thicknessOptions,
  toHashState,
  type StriplineState,
} from './stripline.vm';

const BANNED_WORDS = new RegExp(String.raw`${'compl'}iant|production[- ]${'saf'}e|${'cert'}ified`, 'i');
const st = (p: Partial<StriplineState>): StriplineState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
// w/b = 0.5, er = 4: Z0 = 50.04 ohm (ledger S-021). TEST values, never page defaults.
const EXAMPLE = st({ width: '0.5 mm', spacing: '1 mm', er: '4', erSource: 'test value (w/b 0.5, er 4)' });

function ok(s: StriplineState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}
const rowsOf = (v: ReturnType<typeof ok>) => Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));

describe('golden example (w 0.5 mm, b 1 mm, er 4)', () => {
  it('headline is Z0 of about 50.04 ohm and eps_eff equals er', () => {
    const v = ok(EXAMPLE);
    expect(v.result.headline.text).toBe('50 Ω');
    expect(rowsOf(v)['Effective permittivity']).toMatch(/^4(\.0+)?$/);
    expect(v.result.headline.label).toMatch(/characteristic impedance/i);
  });
  it('delay is the core note in ps/mm and ps/in; S-021 is VERIFIED and listed', () => {
    const v = ok(EXAMPLE);
    expect(rowsOf(v)['Delay per length']).toBe(v.raw.results.find((r) => r.name === 'delay per length')?.note);
    expect(v.ledgerRows.find((r) => r.id === 'S-021')?.status).toBe('VERIFIED');
    expect(v.ledgerRows.find((r) => r.id === 'S-021a')).toBeUndefined();
  });
  it('has the banner, a confidence at most medium, and the formula from the core', () => {
    const v = ok(EXAMPLE);
    expect(v.banner.text).toBe(IMPEDANCE_BANNER);
    expect(['medium', 'low']).toContain(v.result.confidence.level);
    expect(v.result.details.formula).toBe(v.raw.formula);
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

describe('thickness model', () => {
  it('offers zero thickness (default) and the Cohn wide strip variant with a CONFLICT badge', () => {
    const o = thicknessOptions();
    expect(o.map((x) => x.value)).toEqual(['none', 'cohn-wide']);
    expect(o[0]?.label).toMatch(/zero thickness \(default\)/i);
    expect(o[1]?.label).toMatch(/Cohn wide strip/);
    expect(o[1]?.conflict).toBe(true);
  });
  it('the variant needs a thickness, then shows S-021a CONFLICT and the core conflict warning', () => {
    expect(computeView(st({ ...EXAMPLE, thicknessModel: 'cohn-wide' })).status).toBe('needs-input');
    const v = ok(st({ ...EXAMPLE, thickness: '17 um', thicknessModel: 'cohn-wide' }));
    expect(v.ledgerRows.find((r) => r.id === 'S-021a')?.status).toBe('CONFLICT');
    const w = v.raw.warnings.find((x) => x.code === 'THICKNESS_VARIANT_CONFLICT');
    expect(w).toBeDefined();
    expect(v.result.warnings.some((x) => x.message === w?.message)).toBe(true);
  });
  it('a narrow strip with the variant is refused by the core with the reason', () => {
    const v = computeView(st({ ...EXAMPLE, width: '0.1 mm', thickness: '17 um', thicknessModel: 'cohn-wide' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.problems.join(' ')).toMatch(/narrow strips/i);
  });
});

describe('solve for width', () => {
  const S = st({ ...EXAMPLE, width: '', solveFor: 'width', targetZ0: '50 ohm' });
  it('gives the width in mm and mil near 0.5 mm', () => {
    const v = ok(S);
    expect(v.result.headline.label).toMatch(/width/i);
    expect(v.result.headline.text).toBe('0.501 mm (19.72 mil)');
    expect(v.netClass).toContain(v.result.headline.text);
  });
  it('an unreachable target is the core message as an error', () => {
    const v = computeView(st({ ...S, targetZ0: '900 ohm' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.problems.join(' ')).toMatch(/unreachable/);
  });
});

describe('invalid input', () => {
  it.each([
    ['zero width', { width: '0 mm' }],
    ['negative spacing', { spacing: '-1 mm' }],
    ['er text', { er: 'x' }],
    ['er below 1', { er: '0.9' }],
    ['thickness not below spacing', { thickness: '2 mm' }],
  ])('%s gives an error and no number', (_n, p) => {
    const v = computeView(st({ ...EXAMPLE, ...p }));
    expect(v.status).toBe('error');
    expect(JSON.stringify(v)).not.toMatch(/NaN/);
  });
});

describe('hash state', () => {
  it('round-trips, uses documented keys only, and falls back on corrupt input', () => {
    const s = st({ ...EXAMPLE, thickness: '17 um', thicknessModel: 'cohn-wide', frequency: '2 GHz', length: '20 mm', mismatch: '0.5 mm', units: 'imperial' });
    const back = fromHashState(parseHash(serializeHash(ROUTE, toHashState(s))).state);
    expect(back.notices).toEqual([]);
    expect(back.state).toEqual(s);
    for (const k of WRITTEN_KEYS) expect([...Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]), 'fp', 'u']).toContain(k);
    expect(fromHashState({ sf: 'zz', tm: 'hj-procedure-A' }).notices.length).toBe(2);
    expect(fromHashState(parseHash('#/calc/stripline?v=1&b=%E0%A4%A').state).state).toEqual(DEFAULT_STATE);
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
