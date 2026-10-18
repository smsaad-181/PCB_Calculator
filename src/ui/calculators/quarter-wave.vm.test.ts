import { describe, expect, it } from 'vitest';
import vmSrc from './quarter-wave.vm.ts?raw';
import pageSrc from './QuarterWave.tsx?raw';
import { ANTENNA_MESSAGE, END_EFFECTS_MESSAGE } from '../../core/calculators/quarter-wave';
import { IMPEDANCE_BANNER } from '../../core/calculators/impedance-shared';
import { CALCULATOR_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import { findCalculator } from '../registry';
import {
  ANTENNA_HEADING,
  CALCULATOR_ID,
  DEFAULT_STATE,
  EPS_LABEL,
  MODE_OPTIONS,
  WRITTEN_KEYS,
  activeFields,
  computeView,
  fromHashState,
  liveSummary,
  toHashState,
  type QuarterWaveState,
} from './quarter-wave.vm';

// Built from pieces so this test file does not itself contain the phrases the repository audit searches for.
const BANNED = new RegExp(String.raw`${'compl'}iant|production[- ]${'saf'}e|${'cert'}ified|\b(passed?|fails?)\b`, 'i');
const st = (p: Partial<QuarterWaveState>): QuarterWaveState => ({ ...DEFAULT_STATE, ...p });
// eps_eff 2.967 is the microstrip example result (TEST value, never a page default).
const BY_F = st({ epsEff: '2.967', frequency: '5 GHz' });
const BY_L = st({ epsEff: '2.967', mode: 'length', length: '8.702 mm' });
const ok = (s: QuarterWaveState) => {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
};
const val = (v: ReturnType<typeof ok>, name: RegExp): number => v.raw.results.find((r) => name.test(r.name))?.value.si ?? Number.NaN;

describe('registry and defaults', () => {
  it('is a lazy impedance-category page with the requested id and title', async () => {
    const e = findCalculator('quarter-wave');
    expect(e?.category).toBe('impedance');
    expect(e?.title).toBe('Quarter-wave stub length (transmission line)');
    expect(typeof (await e?.load())?.default).toBe('function');
  });
  it('eps_eff has no default and no example, and nothing is written to the link by default', () => {
    expect(DEFAULT_STATE.epsEff).toBe('');
    expect(toHashState(DEFAULT_STATE)).toEqual({});
    expect(EPS_LABEL).toMatch(/from your impedance result/);
    expect(pageSrc).not.toMatch(/placeholder="[0-9]/);
  });
  it('the mode radio offers the two inputs and never both', () => {
    expect(MODE_OPTIONS.map((o) => o.value)).toEqual(['frequency', 'length']);
    expect(activeFields(BY_F)).toContain('frequency');
    expect(activeFields(BY_F)).not.toContain('length');
    expect(activeFields(BY_L)).toContain('length');
    expect(activeFields(BY_L)).not.toContain('frequency');
  });
});

describe('guided quarter-wave length from a frequency', () => {
  it('eps_eff 2.967 at 5 GHz gives 8.702 mm, shown in mm and mil, with the free-space value only as a comparison', () => {
    const v = ok(BY_F);
    expect(val(v, /guided quarter-wave length/)).toBeCloseTo(8.702e-3, 6);
    expect(v.result.headline.label).toMatch(/quarter-wave length/i);
    expect(v.result.headline.text).toMatch(/^8\.70\d mm \(\d+\.\d+ mil\)$/);
    const free = v.result.rows.find((r) => /Free-space/.test(r.label));
    expect(free?.label).toMatch(/comparison only/);
    expect(free?.label).toMatch(/not a stub or antenna length/);
    expect(free?.text).toMatch(/mm \(.* mil\)/);
    expect(val(v, /free-space quarter wavelength/)).toBeCloseTo(14.9896e-3, 6);
  });
});

describe('resonant frequency of a given length', () => {
  it('a length of 8.702 mm gives about 5 GHz', () => {
    const v = ok(BY_L);
    expect(val(v, /quarter-wave frequency/)).toBeCloseTo(5e9, -6);
    expect(v.result.headline.label).toMatch(/frequency/i);
    expect(v.result.headline.text).toMatch(/GHz/);
  });
  it('exactly one of frequency and length is used: the other, if typed, is ignored and not sent', () => {
    const both = ok(st({ ...BY_F, length: '10 mm' }));
    expect(both.raw.inputs.some((i) => i.name === 'length')).toBe(false);
    const other = ok(st({ ...BY_L, frequency: '1 GHz' }));
    expect(other.raw.inputs.some((i) => i.name === 'frequency')).toBe(false);
  });
});

describe('cautions and badges', () => {
  it('the antenna warning is an Important callout with the exact core sentence, and is not repeated in the warning list', () => {
    const v = ok(BY_F);
    const c = v.callouts?.find((x) => x.heading === ANTENNA_HEADING);
    expect(c?.text).toBe(ANTENNA_MESSAGE);
    expect(v.result.warnings.some((w) => w.message === ANTENNA_MESSAGE)).toBe(false);
    expect(ANTENNA_HEADING).toMatch(/not an antenna/i);
  });
  it('the end-effects caution is shown first in the warning list with the exact core sentence', () => {
    const v = ok(BY_F);
    expect(v.result.warnings[0]?.message).toBe(END_EFFECTS_MESSAGE);
    expect(v.result.warnings[0]?.label).toBe('Caution');
  });
  it('S-029c is shown UNVERIFIED and the result is not rated high', () => {
    const v = ok(BY_F);
    expect(v.result.ledger.unverifiedIds).toContain('S-029c');
    expect(v.ledgerRows.find((r) => r.id === 'S-029c')?.status).toBe('UNVERIFIED');
    expect(v.result.confidence.level).not.toBe('high');
    expect(v.raw.dataStatus).not.toBe('VERIFIED');
  });
  it('there is no antenna mode: nothing in the page or its model offers one, and the banner stays verbatim', () => {
    expect(MODE_OPTIONS.map((o) => o.label).join(' ')).not.toMatch(/antenna/i);
    expect(pageSrc).not.toMatch(/antenna length\b.*patch/i);
    for (const s of [BY_F, BY_L, DEFAULT_STATE, st({ ...BY_F, epsEff: '0.5' })]) {
      const v = computeView(s);
      expect(v.banner.text).toBe(IMPEDANCE_BANNER);
    }
    expect(vmSrc).not.toMatch(BANNED);
    expect(pageSrc).not.toMatch(BANNED);
  });
});

describe('invalid input never gives a number', () => {
  it('missing eps_eff or missing frequency says what to enter', () => {
    const a = computeView(st({ frequency: '5 GHz' }));
    expect(a.status).toBe('needs-input');
    if (a.status === 'needs-input') expect(a.needs.join(' ')).toMatch(/eps_eff/);
    const b = computeView(st({ epsEff: '2.9' }));
    expect(b.status).toBe('needs-input');
    if (b.status === 'needs-input') expect(b.needs.join(' ')).toMatch(/frequency/i);
    const c = computeView(st({ epsEff: '2.9', mode: 'length' }));
    expect(c.status).toBe('needs-input');
    if (c.status === 'needs-input') expect(c.needs.join(' ')).toMatch(/length/i);
  });
  it('eps_eff below 1, zero, negative or text is a message on the field', () => {
    for (const e of ['0.5', '0', '-2', 'abc', '1e999']) {
      const v = computeView(st({ ...BY_F, epsEff: e }));
      expect(v.status, e).toBe('error');
      if (v.status === 'error') expect(v.fieldErrors['epsEff'], e).toBeTruthy();
      expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity/);
    }
    const unitless = computeView(st({ ...BY_F, epsEff: '2.9 mm' }));
    expect(unitless.status).toBe('error');
  });
  it('a negative, zero or wrong-dimension frequency or length is refused', () => {
    for (const s of [st({ ...BY_F, frequency: '0 GHz' }), st({ ...BY_F, frequency: '-5 GHz' }), st({ ...BY_F, frequency: '5 mm' }), st({ ...BY_L, length: '0 mm' }), st({ ...BY_L, length: '5 GHz' })]) {
      const v = computeView(s);
      expect(v.status).toBe('error');
      expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity/);
    }
  });
  it('the live summary has no number for a problem and repeats the banner for a result', () => {
    expect(liveSummary(computeView(st({ ...BY_F, epsEff: 'x' })))).toMatch(/^No result/);
    expect(liveSummary(ok(BY_F))).toContain(IMPEDANCE_BANNER);
  });
});

describe('hash state', () => {
  it('round-trips every field and writes only documented keys', () => {
    const s = st({ mode: 'length', epsEff: '2.967', epsEffSource: 'microstrip page, 635 um', frequency: '5 GHz', length: '8.7 mm', units: 'imperial' });
    const h = toHashState(s);
    expect(Object.keys(h).sort()).toEqual(['ee', 'es', 'f', 'l', 'md', 'u']);
    const back = fromHashState(parseHash(serializeHash({ name: 'calc', id: CALCULATOR_ID }, h)).state);
    expect(back.notices).toEqual([]);
    expect(back.state).toEqual(s);
    for (const k of WRITTEN_KEYS) expect([...Object.keys(CALCULATOR_STATE_KEYS['quarter-wave']), 'u']).toContain(k);
  });
  it('writes no tolerance, loss or profile key (the page has none)', () => {
    for (const k of ['kw', 'ke', 'td', 'ds', 'rho', 'fp', 'pw']) expect(WRITTEN_KEYS).not.toContain(k);
  });
  it('an unknown mode or oversized text falls back with a notice', () => {
    const r = fromHashState({ md: 'antenna', ee: '9'.repeat(100), es: 'x'.repeat(300) });
    expect(r.state.mode).toBe('frequency');
    expect(r.state.epsEff).toBe('');
    expect(r.state.epsEffSource).toBe('');
    expect(r.notices.length).toBeGreaterThanOrEqual(3);
    expect(parseHash('#/calc/quarter-wave?v=1&ee=%E0%A4%A').stateDiscarded).toBe(true);
  });
});
