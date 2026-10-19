import { describe, expect, it } from 'vitest';
import vmSrc from './thermal-via.vm.ts?raw';
import pageSrc from './ThermalVia.tsx?raw';
import { parseHash, serializeHash } from '../../state/hash';
import { CALCULATOR_STATE_KEYS } from '../../state/state-key-docs';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  STATUS_LINES,
  VIA_COUNT_HINT_FROM,
  WRITTEN_KEYS,
  computeView,
  diameterPlaceholder,
  fromHashState,
  kOptions,
  liveSummary,
  toHashState,
  type ThermalViaState,
} from './thermal-via.vm';

const st = (p: Partial<ThermalViaState>): ThermalViaState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
const BASE: Partial<ThermalViaState> = { diameter: '0.3 mm', diameterBasis: 'finished', plating: '25 um', length: '1.6 mm', count: '4', kMaterial: 'pure-401', fill: 'none' };

function ok(s: ThermalViaState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}

describe('mandatory inputs start blank and nothing is assumed', () => {
  it('the default state is empty and needs every mandatory input', () => {
    const v = computeView(DEFAULT_STATE);
    expect(v.status).toBe('needs-input');
    if (v.status !== 'needs-input') return;
    const t = v.needs.join(' | ');
    for (const w of [/hole diameter/i, /plating thickness/i, /barrel length/i, /number of vias/i, /conductivity/i, /fill/i, /diameter basis/i]) expect(t).toMatch(w);
    expect(Object.values(DEFAULT_STATE).filter((x) => x !== '' && x !== 'metric' && x !== 'user')).toEqual([]);
  });
  it('the diameter basis is required, starts blank and the core is not called without it', () => {
    const v = computeView(st({ ...BASE, diameterBasis: '' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/diameter basis.*no default/i);
    expect(vmSrc).not.toMatch(/diameterBasis:\s*'(finished|drill)'/);
  });
  it('the placeholder is neutral: never a typical drill size, only a finished-size example on the finished basis', () => {
    expect(diameterPlaceholder('')).not.toMatch(/\d/);
    expect(diameterPlaceholder('drill')).not.toMatch(/\d/);
    expect(diameterPlaceholder('finished')).toBe('0.25 mm');
    expect(pageSrc).not.toMatch(/placeholder="0\.3/);
    expect(vmSrc).not.toMatch(/0\.3 mm/);
  });
  it('no choice is pre-selected in source', () => {
    expect(vmSrc).not.toMatch(/kMaterial:\s*'(pure|c11000)/);
    expect(vmSrc).not.toMatch(/fill:\s*'(none|filled)'/);
  });
  it('a filled via needs the fill conductivity, and says it has no built-in value', () => {
    const v = computeView(st({ ...BASE, fill: 'filled' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/fill.*conductivity.*datasheet/i);
  });
  it('the conductivity choices come from core data and carry the CONFLICT note', () => {
    const o = kOptions();
    expect(o.map((x) => x.value)).toEqual(['pure-401', 'c11000-391']);
    for (const x of o) expect(x.label).toMatch(/W\/\(m·K\).*CONFLICT/);
  });
});

describe('a result for a worked case', () => {
  it('prints the array resistance with the 1-D lower-bound and not-theta-JA statements always present', () => {
    const v = ok(st(BASE));
    expect(v.result.headline.label).toMatch(/via array/i);
    expect(v.result.headline.text).toMatch(/K\/W$/);
    expect(v.result.headline.text).not.toMatch(/NaN|Infinity/);
    const t = v.callouts.map((c) => c.text).join(' ');
    expect(t).toMatch(/lower bound/i);
    expect(t).toMatch(/not theta-JA/i);
    const s = STATUS_LINES.join(' ');
    expect(s).toMatch(/estimate/i);
    expect(s).toMatch(/low confidence/i);
    expect(s).toMatch(/lower bound/i);
    expect(s).toMatch(/not theta-JA/i);
    expect(s).toMatch(/not a design constant/i);
  });
  it('a drill basis gives a smaller finished hole, shown as its own result row with the basis stated', () => {
    const f = ok(st(BASE));
    const d = ok(st({ ...BASE, diameterBasis: 'drill' }));
    const rowOf = (v: typeof f) => v.result.rows.find((r) => /finished hole diameter used/i.test(r.label));
    expect(rowOf(f)).toBeDefined();
    expect(rowOf(d)?.text).not.toBe(rowOf(f)?.text);
    expect(rowOf(d)?.hint).toMatch(/DRILL/);
    expect(d.result.details.inputs.some((i) => /hole diameter as entered/i.test(i.label) && /DRILL/.test(i.detail ?? ''))).toBe(true);
    expect(d.result.headline.text).not.toBe(f.result.headline.text);
  });
  it('a plating of half the drill or more is an error on the diameter', () => {
    const v = computeView(st({ ...BASE, diameterBasis: 'drill', plating: '0.2 mm' }));
    expect(v.status).toBe('error');
  });
  it('the thermal-relief warning is shown at warning level, ahead of every caution', () => {
    const v = ok(st(BASE));
    const w = v.result.warnings;
    const i = w.findIndex((x) => /thermal-relief|connect style/i.test(x.message));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(w[i]?.severity).toBe('warning');
    expect(w.slice(0, i).every((x) => x.severity === 'warning' || x.severity === 'critical')).toBe(true);
  });
  it('"lower bound" is never unqualified in page text', () => {
    expect(vmSrc).not.toMatch(/(?<!usually a )lower bound/i);
    expect(liveSummary(ok(st(BASE)))).toMatch(/usually a lower bound/);
    expect(ok(st(BASE)).result.headline.label).toMatch(/usually a lower bound/);
  });
  it('a very large via count adds a fit and wicking hint; a normal count does not', () => {
    expect(ok(st({ ...BASE, count: String(VIA_COUNT_HINT_FROM) })).notes.join(' ')).toMatch(/hole-to-hole.*wick/i);
    expect(ok(st(BASE)).notes).toEqual([]);
  });
  it('confidence is low and its reasons are listed', () => {
    const v = ok(st(BASE));
    expect(v.result.confidence.level).toBe('low');
    expect(v.result.confidence.reasons.length).toBeGreaterThan(0);
  });
  it('shows UNVERIFIED status rows with a role for each ledger id', () => {
    const v = ok(st(BASE));
    expect(v.result.ledger.unverifiedIds.length).toBeGreaterThan(0);
    expect(v.ledgerRows.map((r) => r.id)).toEqual(expect.arrayContaining(['S-007', 'S-041', 'S-041c']));
    for (const r of v.ledgerRows) expect(r.role.length).toBeGreaterThan(5);
  });
  it('the formula and steps come from the core result', () => {
    const v = ok(st(BASE));
    expect(v.result.details.formula).toBe(v.raw.formula);
    expect(v.result.details.steps.map((s) => s.label)).toContain('Via array (ideal parallel)');
  });
  it('a filled via and a power give the fill rows and the temperature difference', () => {
    const v = ok(st({ ...BASE, fill: 'filled', fillK: '1.5 W/mK', power: '2 W' }));
    const labels = v.result.rows.map((r) => r.label).join('|');
    expect(labels).toMatch(/fill core/i);
    expect(labels).toMatch(/temperature difference/i);
  });
  it('plating prints as um in the inputs table', () => {
    const v = ok(st(BASE));
    const row = v.result.details.inputs.find((i) => /plating/i.test(i.label));
    expect(row?.value).toMatch(/µm|um/);
  });
  it('a fabricator average is flagged with its caution and the fab-profile source', () => {
    const v = ok(st({ ...BASE, platingSource: 'fab-profile-average' }));
    expect(v.raw.warnings.map((w) => w.code)).toContain('FAB_AVERAGE_PLATING');
    expect(v.result.details.inputs.some((i) => i.source === 'fab-profile')).toBe(true);
  });
  it('plating larger than the hole is shown as a pinned warning first', () => {
    const v = ok(st({ ...BASE, plating: '0.4 mm' }));
    expect(v.result.warnings[0]?.message).toMatch(/at or above the finished hole/i);
  });
  it('the live summary states the estimate and never invents a number when blank', () => {
    expect(liveSummary(ok(st(BASE)))).toMatch(/estimate.*lower bound/i);
    expect(liveSummary(computeView(DEFAULT_STATE))).toMatch(/^No result yet/);
    expect(liveSummary(computeView(st({ diameter: 'abc' })))).toMatch(/^No result\./);
  });
});

describe('invalid input never gives a number', () => {
  it.each([
    [{ diameter: '-1 mm' }],
    [{ diameter: '0 mm' }],
    [{ plating: 'NaN' }],
    [{ length: 'abc' }],
    [{ count: '1.5' }],
    [{ count: '0' }],
    [{ count: '-2' }],
    [{ diameter: '5 A' }],
    [{ power: '-3 W' }],
    [{ diameter: '1e400 mm' }],
  ])('%j is an error with a field message', (p) => {
    const v = computeView(st({ ...BASE, ...p }));
    expect(v.status).toBe('error');
    if (v.status === 'error') {
      expect(v.problems.length).toBeGreaterThan(0);
      expect(Object.keys(v.fieldErrors).length).toBeGreaterThan(0);
    }
  });
  it('a fill conductivity typed while the fill is "none" is ignored, not passed to the core', () => {
    const v = ok(st({ ...BASE, fill: 'none', fillK: '5 W/mK' }));
    expect(v.raw.inputs.some((i) => /fill/.test(i.name))).toBe(false);
  });
  it('a bad fill conductivity is an error on its own field', () => {
    const v = computeView(st({ ...BASE, fill: 'filled', fillK: '0 W/mK' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.fieldErrors.fillK).toBeDefined();
  });
});

describe('hash state', () => {
  const full = st({ ...BASE, diameterBasis: 'drill', fill: 'filled', fillK: '2 W/mK', power: '1 W', platingSource: 'fab-profile-average', units: 'imperial' });
  it('round-trips through the URL hash', () => {
    const p = parseHash(serializeHash(ROUTE, toHashState(full)));
    expect(fromHashState(p.state).state).toEqual(full);
  });
  it('the default state writes nothing, and no choice is ever invented', () => {
    expect(serializeHash(ROUTE, toHashState(DEFAULT_STATE))).toBe('#/calc/thermal-via');
    const h = fromHashState({ d: '1 mm' }).state;
    expect(h.diameterBasis).toBe('');
    expect(h.kMaterial).toBe('');
    expect(h.fill).toBe('');
  });
  it('writes only documented keys', () => {
    const documented = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);
    for (const k of Object.keys(toHashState(full))) expect([...documented, 'u']).toContain(k);
    for (const k of WRITTEN_KEYS) expect([...documented, 'u']).toContain(k);
  });
  it('unknown values fall back to blank with notices; corrupt hashes give the defaults', () => {
    const { state, notices } = fromHashState({ db: 'both', km: 'gold', fl: 'half', ps: 'x', u: 'furlongs' });
    expect(state).toEqual(DEFAULT_STATE);
    expect(notices.length).toBeGreaterThanOrEqual(4);
    expect(fromHashState({ d: 'x'.repeat(500) }).notices.join(' ')).toMatch(/Hole diameter/);
    expect(() => fromHashState({ __proto__: 'x', constructor: 'y' } as never)).not.toThrow();
    for (const h of ['#/calc/thermal-via?v=1&d=%E0%A4%A', '#/calc/thermal-via?v=99&d=1%20mm', '#/calc/thermal-via?v=1&=&&&']) {
      expect(fromHashState(parseHash(h).state).state).toEqual(DEFAULT_STATE);
    }
  });
  it('hostile text is just text', () => {
    const { state } = fromHashState({ d: '<img src=x onerror=alert(1)>' });
    expect(computeView(state).status).toBe('error');
  });
});

describe('page source', () => {
  it('has labelled inputs, a live region, the shared debounced state and no raw HTML', () => {
    expect(pageSrc).toMatch(/role="status" aria-live="polite" aria-atomic="true"/);
    expect(pageSrc).toMatch(/aria-label="Thermal via inputs"/);
    expect(pageSrc).toMatch(/aria-labelledby="result-h"/);
    expect(pageSrc).toMatch(/useCalcState/);
    expect(pageSrc).not.toMatch(/style=|dangerouslySetInnerHTML|innerHTML|<script/);
    expect(pageSrc.match(/unitHint="/g)?.length).toBeGreaterThanOrEqual(5);
  });
  it('contains no engineering math (the repository phrase audit covers compliance wording)', () => {
    for (const src of [vmSrc, pageSrc]) {
      expect(src).not.toMatch(/Math\.(PI|pow|sqrt|log|exp)\b/);
    }
  });
});
