import { describe, expect, it } from 'vitest';
import pageSrc from './ESeries.tsx?raw';
import { ESERIES } from '../../core/data/eseries';
import { bestPairs, dropNoisePairs, nearest, nearestRatio, valuesInDecade } from '../../core/eseries';
import { parseQuantity, DIM } from '../../core/units';
import { parseHash, serializeHash } from '../../state/hash';
import { CALCULATOR_STATE_KEYS } from '../../state/state-key-docs';
import feedbackSrc from './FeedbackDivider.tsx?raw';
import dividerSrc from './ResistorDivider.tsx?raw';
import { NEAREST_NOTE, catalogResistance } from './circuit-choices';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  PAIR_COUNT,
  PAIR_FETCH,
  SEARCH_WINDOW_TEXT,
  SERIES_OPTIONS,
  SOURCE_ADVICE,
  SOURCE_LEDGER_IDS,
  SOURCE_STATUS,
  WRITTEN_KEYS,
  computeNearest,
  computePairs,
  planPairs,
  fromHashState,
  nearestSummary,
  pairTargetLabel,
  pairsSummary,
  toHashState,
  type ESeriesState,
} from './e-series.vm';

const st = (p: Partial<ESeriesState>): ESeriesState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
const ohms = (t: string): number => {
  const r = parseQuantity(t, DIM.RESISTANCE);
  if (!r.ok) throw new Error(t);
  return r.value.si;
};

describe('source status', () => {
  it('is the paywalled S-016 status read from the core data, and the page shows the badge and the advice', () => {
    expect(SOURCE_STATUS).toBe('PAYWALLED-USER-MUST-VERIFY');
    expect(SOURCE_LEDGER_IDS).toEqual(['S-016']);
    expect(SOURCE_ADVICE).toMatch(/not been checked against the standard/);
    expect(pageSrc).toMatch(/<UnverifiedBadge status=\{SOURCE_STATUS\} ledgerIds=\{SOURCE_LEDGER_IDS\}/);
    expect(pageSrc).toMatch(/pill-unverified">UNVERIFIED/);
    expect(pageSrc).toMatch(/Check against IEC 60063 yourself/);
    // The badge sits above both result sections.
    expect(pageSrc.indexOf('UnverifiedBadge status')).toBeLessThan(pageSrc.indexOf('id="near-h"'));
  });
  it('lists every series of the library with its count per decade', () => {
    expect(SERIES_OPTIONS.map((o) => o.value)).toEqual(Object.keys(ESERIES));
    expect(SERIES_OPTIONS.find((o) => o.value === 'E96')?.label).toBe('E96 (96 values per decade)');
  });
});

describe('nearest value', () => {
  it('4.7k in E96 gives 4.75 kΩ nearest and up, 4.64 kΩ down, with signed errors', () => {
    const v = computeNearest(st({ nearestTarget: '4.7k', nearestSeries: 'E96' }));
    if (v.status !== 'ok') throw new Error(v.status);
    expect(v.rows.map((r) => [r.label, r.value, r.error])).toEqual([
      ['Nearest', '4.75 kΩ', '+1.064 %'],
      ['Next up (at or above the target)', '4.75 kΩ', '+1.064 %'],
      ['Next down (at or below the target)', '4.64 kΩ', '-1.277 %'],
    ]);
    expect(v.exact).toBe(false);
  });
  it('a value that is in the series agrees in all three rows with zero error', () => {
    const v = computeNearest(st({ nearestTarget: '4k7', nearestSeries: 'E24' }));
    if (v.status !== 'ok') throw new Error(v.status);
    expect(v.rows.map((r) => r.value)).toEqual(['4.7 kΩ', '4.7 kΩ', '4.7 kΩ']);
    expect(v.rows.map((r) => r.error)).toEqual(['0 %', '0 %', '0 %']);
    expect(v.exact).toBe(true);
  });
  it('component codes and prefixes are the same target', () => {
    const a = computeNearest(st({ nearestTarget: '4k7' }));
    const b = computeNearest(st({ nearestTarget: '4.7 kΩ' }));
    const c = computeNearest(st({ nearestTarget: '4700' + ' Ω' }));
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(computeNearest(st({ nearestTarget: '2.2k' })).status).toBe('ok');
  });
  it('lists the mantissas of the chosen decade, from valuesInDecade, and marks the nearest', () => {
    const v = computeNearest(st({ nearestTarget: '4.7k', nearestSeries: 'E96' }));
    if (v.status !== 'ok') throw new Error(v.status);
    const decade = valuesInDecade('E96', 3);
    expect(v.decade.values).toHaveLength(96);
    expect(v.decade.values.map((x) => x.text)).toEqual(decade.map(catalogResistance));
    expect(v.decade.values.filter((x) => x.chosen).map((x) => x.text)).toEqual(['4.75 kΩ']);
    expect(v.decade.title).toBe('E96 values from 1 kΩ to 9.76 kΩ (96 values in this decade)');
  });
  it('every printed value is a catalog number that parses back to the library value', () => {
    for (const series of Object.keys(ESERIES) as (keyof typeof ESERIES)[]) {
      const v = computeNearest(st({ nearestTarget: '3.3k', nearestSeries: series }));
      if (v.status !== 'ok') throw new Error(v.status);
      const lib = nearest(3300, series, 'down');
      if (!lib.ok) throw new Error('lib');
      expect(ohms(v.rows[2]?.value ?? '')).toBe(lib.value.value);
    }
  });
  it('works across decades', () => {
    for (const t of ['1 mΩ', '47 Ω', '4.7 MΩ', '100 GΩ']) {
      const v = computeNearest(st({ nearestTarget: t }));
      expect(v.status, t).toBe('ok');
    }
  });
  it('empty asks for a value; invalid input is an inline error and never a value', () => {
    expect(computeNearest(DEFAULT_STATE).status).toBe('needs-input');
    for (const t of ['abc', '0 Ω', '-5 Ω', '330', 'NaN', '1e999 Ω', '5 V', '1e-30 Ω']) {
      const v = computeNearest(st({ nearestTarget: t }));
      expect(v.status, t).toBe('error');
      if (v.status === 'error') expect(v.problems[0], t).toMatch(/^Target resistance: /);
      expect('rows' in v, t).toBe(false);
    }
  });
  it('the summary is plain words', () => {
    expect(nearestSummary(computeNearest(st({ nearestTarget: '4.7k', nearestSeries: 'E96' })))).toMatch(
      /^Nearest-value lookup: Nearest 4\.75 kΩ, error \+1.064 %. Next up/,
    );
    expect(nearestSummary(computeNearest(DEFAULT_STATE))).toMatch(/no result yet/);
  });
});

describe('two-resistor search', () => {
  it('3.3k series pairs in E24: five rows, exact pairs first, matching the library', () => {
    const v = computePairs(st({ pairTarget: '3.3k', pairSeries: 'E24', topology: 'series' }));
    if (v.status !== 'ok') throw new Error(v.status);
    expect(v.rows).toHaveLength(PAIR_COUNT);
    const lib = bestPairs(3300, 'E24', 'series', PAIR_FETCH);
    if (!lib.ok) throw new Error('lib');
    const shown = dropNoisePairs(lib.value, 3300, 'series', PAIR_COUNT).kept;
    expect(v.rows.map((r) => [ohms(r.r1), ohms(r.r2)])).toEqual(shown.map((p) => [p.r1, p.r2]));
    expect(v.rows[0]?.error).toBe('0 %');
    expect(v.resultHeading).toBe('R1 + R2');
    for (const r of v.rows) expect(ohms(r.value)).toBeGreaterThan(3000);
  });
  it('parallel pairs: value equals the parallel combination of the printed parts', () => {
    const v = computePairs(st({ pairTarget: '3.3k', pairSeries: 'E24', topology: 'parallel' }));
    if (v.status !== 'ok') throw new Error(v.status);
    for (const r of v.rows) {
      const a = ohms(r.r1);
      const b = ohms(r.r2);
      expect(ohms(r.value)).toBeCloseTo((a * b) / (a + b), 0);
      expect(Math.min(a, b)).toBeGreaterThanOrEqual(3300);
    }
    expect(v.window).toBe(SEARCH_WINDOW_TEXT.parallel);
  });
  it('divider ratio: target as a fraction or percent, R1 top and R2 bottom, ratio column', () => {
    const a = computePairs(st({ pairTarget: '0.25', pairSeries: 'E24', topology: 'divider-ratio' }));
    const b = computePairs(st({ pairTarget: '25%', pairSeries: 'E24', topology: 'divider-ratio' }));
    if (a.status !== 'ok') throw new Error(a.status);
    expect(a).toEqual(b);
    expect(a.rows[0]?.value).toBe('0.25');
    expect(a.resultHeading).toMatch(/^R2 \/ \(R1 \+ R2\)/);
    for (const r of a.rows) {
      const top = ohms(r.r1);
      const bottom = ohms(r.r2);
      expect(top).toBeGreaterThanOrEqual(1000);
      expect(bottom).toBeLessThan(1e6);
    }
  });
  it('the printed windows are true: series parts lie in the three decades up to the target, parallel above it', () => {
    const s = computePairs(st({ pairTarget: '3.3k', pairSeries: 'E96', topology: 'series' }));
    if (s.status !== 'ok') throw new Error(s.status);
    for (const r of s.rows) for (const x of [ohms(r.r1), ohms(r.r2)]) expect(x).toBeGreaterThanOrEqual(10);
    for (const r of s.rows) for (const x of [ohms(r.r1), ohms(r.r2)]) expect(x).toBeLessThan(1e4);
  });
  it('a bare ratio above 1, a ratio of 1 and an unreadable value are inline errors', () => {
    const bare = computePairs(st({ pairTarget: '5', topology: 'divider-ratio' }));
    expect(bare.status).toBe('error');
    if (bare.status === 'error') expect(bare.problems[0]).toMatch(/write 5% or 0\.05/);
    const one = computePairs(st({ pairTarget: '1', topology: 'divider-ratio' }));
    expect(one.status).toBe('error');
    if (one.status === 'error') expect(one.problems[0]).toMatch(/strictly between 0 and 1/);
    for (const t of ['abc', '0 Ω', '-3k', '330']) expect(computePairs(st({ pairTarget: t })).status, t).toBe('error');
    expect(pairTargetLabel('divider-ratio')).toBe('Target ratio R2 / (R1 + R2)');
  });
  it('empty asks for a value, in the words of the chosen topology', () => {
    const a = computePairs(DEFAULT_STATE);
    const b = computePairs(st({ topology: 'divider-ratio' }));
    if (a.status !== 'needs-input' || b.status !== 'needs-input') throw new Error('expected needs-input');
    expect(a.needs[0]).toMatch(/resistance/);
    expect(b.needs[0]).toMatch(/ratio between 0 and 1/);
  });
  it('the summary names the best pair', () => {
    expect(pairsSummary(computePairs(st({ pairTarget: '3.3k' })))).toMatch(/^Two-resistor search: 5 best pairs\. Best is R1 300 Ω and R2 3 kΩ, giving 3\.3 kΩ, error 0 %\.$/);
  });
  it('every series stays within a 5 s synchronous budget (the page runs the search in a worker; E192 divider ratio is the worst case)', () => {
    for (const series of ['E96', 'E192'] as const) {
      const t0 = performance.now();
      const v = computePairs(st({ pairTarget: '0.3', pairSeries: series, topology: 'divider-ratio' }));
      const ms = performance.now() - t0;
      expect(v.status).toBe('ok');
      expect(ms, series).toBeLessThan(5000);
    }
  });
});

describe('hash state', () => {
  it('writes only non-default values under documented keys and round-trips', () => {
    expect(toHashState(DEFAULT_STATE)).toEqual({});
    const s = st({ nearestTarget: '4k7', nearestSeries: 'E96', pairTarget: '25%', topology: 'divider-ratio', pairSeries: 'E12' });
    const h = toHashState(s);
    expect(h).toEqual({ nt: '4k7', ns: 'E96', pt: '25%', pk: 'divider-ratio', ps: 'E12' });
    for (const k of Object.keys(h)) expect(Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID])).toContain(k);
    expect([...WRITTEN_KEYS].sort()).toEqual(Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]).sort());
    const back = fromHashState(parseHash(serializeHash(ROUTE, h)).state);
    expect(back.state).toEqual(s);
    expect(back.notices).toEqual([]);
  });
  it('unknown choices fall back to defaults and say so without internal key names', () => {
    const l = fromHashState({ ns: 'E999', ps: '__proto__', pk: 'triangle', nt: '4k7' });
    expect(l.state.nearestSeries).toBe('E24');
    expect(l.state.pairSeries).toBe('E24');
    expect(l.state.topology).toBe('series');
    expect(l.state.nearestTarget).toBe('4k7');
    expect(l.notices).toHaveLength(3);
    for (const n of l.notices) expect(n).not.toMatch(/\b(ns|ps|pk|nt|pt)\b/);
  });
  it('hostile and corrupt state falls back safely', () => {
    const hostile = [
      '#/calc/e-series?v=1&ns=%3Cscript%3E&pk=constructor&nt=' + 'x'.repeat(100),
      '#/calc/e-series?v=1&nt=%E0%A4%A',
      '#/calc/e-series?v=7&nt=4k7',
      '#/calc/e-series?nt=4k7',
    ];
    for (const h of hostile) {
      const l = fromHashState(parseHash(h).state);
      expect(l.state.nearestSeries).toBe('E24');
      expect(l.state.topology).toBe('series');
      expect(computeNearest(l.state).status).not.toBe('ok');
      expect(computePairs(l.state).status).not.toBe('ok');
    }
    expect(parseHash(hostile[1] as string).stateDiscarded).toBe(true);
    expect(fromHashState(parseHash(hostile[1] as string).state).state).toEqual(DEFAULT_STATE);
    expect(fromHashState(parseHash(hostile[0] as string).state).notices.join(' ')).toMatch(/lookup target was too long/);
  });
});

describe('F-4: nearest means the smallest difference in ohms', () => {
  it('E3 3.3 (as 3k3 against the E3 list): arithmetic nearest 2.2 kOhm and, labelled, the ratio nearest 4.7 kOhm', () => {
    const v = computeNearest(st({ nearestTarget: '3k3', nearestSeries: 'E3' }));
    if (v.status !== 'ok') throw new Error(v.status);
    expect(v.rows[0]?.value).toBe('2.2 kΩ');
    expect(v.ratio?.value).toBe('4.7 kΩ');
    expect(v.ratio?.label).toMatch(/ratio/i);
    expect(v.ratio?.error).toBe('+42.43 %');
    expect(v.arithmeticLabel).toMatch(/difference in ohms/i);
  });
  it('no ratio row when both agree, and the ratio value is the library helper', () => {
    const same = computeNearest(st({ nearestTarget: '4.7k', nearestSeries: 'E96' }));
    if (same.status !== 'ok') throw new Error(same.status);
    expect(same.ratio).toBeUndefined();
    const g = nearestRatio(3300, 'E3');
    if (!g.ok) throw new Error('lib');
    const v = computeNearest(st({ nearestTarget: '3k3', nearestSeries: 'E3' }));
    if (v.status !== 'ok') throw new Error(v.status);
    expect(ohms(v.ratio?.value ?? '')).toBe(g.value.value);
  });
  it('the note is shown on the E-series page and on both divider pages, in one wording', () => {
    expect(NEAREST_NOTE).toMatch(/smallest difference in ohms, not the smallest ratio/);
    for (const src of [pageSrc, dividerSrc, feedbackSrc]) expect(src).toContain('NEAREST_NOTE');
  });
});

describe('PCB-12: a single value, and no noise pairs', () => {
  const search = (p: Partial<ESeriesState>) => {
    const v = computePairs(st({ pairSeries: 'E12', topology: 'series', ...p }));
    if (v.status !== 'ok') throw new Error(v.status);
    return v;
  };
  it('3.3k series in E12: says a single E12 value matches, hides the 10 + 3.3k pair and reports the count', () => {
    const v = search({ pairTarget: '3.3k' });
    expect(v.single).toBe('A single E12 value matches: 3.3 kΩ (error 0 %).');
    expect(v.rows).toHaveLength(PAIR_COUNT);
    expect(v.rows.some((r) => [r.r1, r.r2].includes('10 Ω') && [r.r1, r.r2].includes('3.3 kΩ'))).toBe(false);
    expect(v.hidden).toBeGreaterThan(0);
    expect(v.hiddenText).toBe(`${String(v.hidden)} pair${v.hidden === 1 ? '' : 's'} hidden: one resistor has negligible effect.`);
  });
  it('the best pair is the library best pair', () => {
    const v = search({ pairTarget: '3.3k' });
    const lib = bestPairs(3300, 'E12', 'series', 1);
    if (!lib.ok) throw new Error('lib');
    expect([ohms(v.rows[0]?.r1 ?? ''), ohms(v.rows[0]?.r2 ?? '')]).toEqual([lib.value[0]?.r1, lib.value[0]?.r2]);
  });
  it('no single-value line when no stock value is that close, and none for a divider ratio', () => {
    expect(search({ pairTarget: '3.35k' }).single).toBeUndefined();
    expect(search({ pairTarget: '0.25', topology: 'divider-ratio' }).single).toBeUndefined();
    expect(search({ pairTarget: '0.25', topology: 'divider-ratio' }).hidden).toBe(0);
  });
  it('parallel works the same way', () => {
    const v = search({ pairTarget: '3.3k', topology: 'parallel' });
    expect(v.single).toMatch(/^A single E12 value matches: 3\.3 kΩ/);
  });
  it('the search asks the worker for more pairs than are shown, so filtering can still fill the list', () => {
    const p = planPairs(st({ pairTarget: '3.3k' }));
    if (p.kind !== 'search') throw new Error('expected a search');
    expect(PAIR_FETCH).toBeGreaterThan(PAIR_COUNT);
    expect(p.task.count).toBe(PAIR_FETCH);
  });
});
