import { describe, expect, it } from 'vitest';
import vmSrc from './copper-converter.vm.ts?raw';
import pageSrc from './CopperConverter.tsx?raw';
import viewSrc from '../components/view.ts?raw';
import resultsSrc from '../components/ResultsPanel.tsx?raw';
import stepsSrc from '../components/StepsList.tsx?raw';
import provSrc from '../components/InputsProvenance.tsx?raw';
import confSrc from '../components/ConfidenceBadge.tsx?raw';
import formulaSrc from '../components/FormulaPanel.tsx?raw';
import warnSrc from '../components/WarningList.tsx?raw';
import fieldSrc from '../components/QuantityField.tsx?raw';
import { meta } from '../../core/calculators/copper-converter/meta';
import { formatResult } from '../../core/format-result';
import { parseHash, serializeHash, CALCULATOR_STATE_KEYS, RESERVED_STATE_KEYS } from '../../state/hash';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  WRITTEN_KEYS,
  computeView,
  echoPrefs,
  fromHashState,
  headlinePrefs,
  toHashState,
  type ConverterState,
} from './copper-converter.vm';

const st = (p: Partial<ConverterState>): ConverterState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;

describe('no layer chosen', () => {
  it('the default state has no layer and no result', () => {
    expect(DEFAULT_STATE.layer).toBe('');
    const v = computeView(st({ weight: '1 oz' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/Choose a copper layer/);
  });
  it('an empty form asks for the value and the layer, with no number', () => {
    const v = computeView(DEFAULT_STATE);
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs).toHaveLength(2);
  });
  it('a hash without a layer never produces one', () => {
    expect(fromHashState({ w: '1 oz' }).state.layer).toBe('');
    expect(fromHashState({ ly: 'middle' }).state.layer).toBe('');
  });
});

describe('weight to thickness', () => {
  const v = computeView(st({ weight: '1 oz', layer: 'outer' }));
  it('gives the nominal 35 um as the dual headline', () => {
    expect(v.status).toBe('ok');
    if (v.status !== 'ok') return;
    expect(v.result.headline.label).toBe('Copper thickness');
    expect(v.result.headline.text).toBe('0.035 mm (1.38 mil)');
    expect(v.result.headline.meaning).toMatch(/Nominal/);
  });
  it('shows the UNVERIFIED data status (S-003 conflict, S-009 paywalled)', () => {
    if (v.status !== 'ok') throw new Error('expected ok');
    expect(v.result.ledger.unverifiedIds).toEqual(expect.arrayContaining(['S-003', 'S-009']));
    expect(v.result.ledger.worst).toBe('CONFLICT');
  });
  it('confidence carries its score and reasons', () => {
    if (v.status !== 'ok') throw new Error('expected ok');
    expect(v.result.confidence.reasons.length).toBeGreaterThan(0);
    expect(v.result.confidence.score).toBe(v.raw.confidence.score);
  });
  it('warnings are ordered most severe first', () => {
    if (v.status !== 'ok') throw new Error('expected ok');
    const rank = { critical: 0, warning: 1, caution: 2, info: 3 } as const;
    const r = v.result.warnings.map((w) => rank[w.severity]);
    expect(r).toEqual([...r].sort((a, b) => a - b));
    expect(v.result.warnings.length).toBeGreaterThan(0);
    for (const w of v.result.warnings) expect(w.label.length + w.icon.length).toBeGreaterThan(0);
  });
  it('the formula shown is the exported metadata text', () => {
    if (v.status !== 'ok') throw new Error('expected ok');
    expect(v.result.details.formula).toBe(meta.formula);
  });
  it('marks the defaulted convention as a default in the provenance table', () => {
    if (v.status !== 'ok') throw new Error('expected ok');
    const conv = v.result.details.inputs.find((i) => i.label === 'Foil convention');
    expect(conv?.source).toBe('default');
    expect(v.result.details.inputs.find((i) => i.label === 'Copper layer')?.source).toBe('user');
  });
  it('an explicitly chosen convention is a user choice and changes the answer', () => {
    const w = computeView(st({ weight: '1 oz', layer: 'inner', convention: 'nominal-1.35mil' }));
    if (w.status !== 'ok' || v.status !== 'ok') throw new Error('expected ok');
    expect(w.result.details.inputs.find((i) => i.label === 'Foil convention')?.source).toBe('user');
    expect(w.result.headline.text).not.toBe(v.result.headline.text);
  });
  it('adds an estimated finished thickness for plating on the outer layer', () => {
    const w = computeView(st({ weight: '1 oz', layer: 'outer', plating: '25 um' }));
    if (w.status !== 'ok') throw new Error('expected ok');
    expect(w.result.rows.some((r) => r.label.startsWith('Estimated finished thickness'))).toBe(true);
  });
  it('ignores plating on an inner layer and says so', () => {
    const w = computeView(st({ weight: '1 oz', layer: 'inner', plating: '25 um' }));
    expect(w.status).toBe('ok');
    expect(w.notes.join(' ')).toMatch(/ignored for an inner layer/);
  });
});

describe('thickness to weight', () => {
  it('solves the weight and makes it the headline', () => {
    const v = computeView(st({ by: 'thickness', thickness: '35 um', layer: 'inner' }));
    expect(v.status).toBe('ok');
    if (v.status !== 'ok') return;
    expect(v.result.headline.label).toBe('Copper weight');
    expect(v.result.headline.text).toBe('1 oz/ft²');
    expect(v.result.details.inputs.find((i) => i.label === 'Thickness basis')?.source).toBe('default');
  });
  it('a finished basis is a user choice', () => {
    const v = computeView(st({ by: 'thickness', thickness: '1.4 mil', layer: 'outer', basis: 'finished' }));
    if (v.status !== 'ok') throw new Error('expected ok');
    expect(v.result.details.inputs.find((i) => i.label === 'Thickness basis')?.source).toBe('user');
  });
  it('uses only the active field: the other field text is not read', () => {
    const v = computeView(st({ by: 'thickness', weight: 'garbage', thickness: '35 um', layer: 'inner' }));
    expect(v.status).toBe('ok');
  });
});

describe('error mapping: invalid input never gives a number', () => {
  const bad = ['abc', '0 oz', '-1 oz', '1,5 oz', '1/2 oz', '1 furlong', 'NaN', 'Infinity oz', '1e999 oz', '1 mm'];
  for (const text of bad) {
    it(`rejects weight "${text}" with a named message`, () => {
      const v = computeView(st({ weight: text, layer: 'outer' }));
      expect(v.status).toBe('error');
      if (v.status !== 'error') return;
      expect(v.problems[0]).toMatch(/^Copper weight: /);
      expect(v).not.toHaveProperty('result');
      expect(v).not.toHaveProperty('raw');
    });
  }
  it('names the thickness field and carries the parser hint', () => {
    const v = computeView(st({ by: 'thickness', thickness: '35 mills', layer: 'outer' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') {
      expect(v.problems[0]).toMatch(/^Copper thickness: /);
      expect(v.problems[0]).toMatch(/Unknown unit|Did you mean/);
    }
  });
  it('maps a core guard error (zero length) to its field and message', () => {
    const v = computeView(st({ by: 'thickness', thickness: '0 um', layer: 'outer' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') {
      expect(v.problems[0]).toMatch(/Copper thickness: .*zero/);
      expect(v.fieldErrors.thickness).toMatch(/zero/);
    }
  });
  it('rejects an over-large plating as an error, not a number', () => {
    const v = computeView(st({ weight: '1 oz', layer: 'outer', plating: '500 um' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.fieldErrors.plating).toMatch(/200 um/);
  });
  it('a bad plating text names the plating field', () => {
    const v = computeView(st({ weight: '1 oz', layer: 'outer', plating: 'lots' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.problems[0]).toMatch(/^Plating thickness: /);
  });
  it('an over-long text is rejected', () => {
    const v = computeView(st({ weight: '1'.repeat(200) + ' oz', layer: 'outer' }));
    expect(v.status).toBe('error');
  });
});

describe('headline formatting goes through format-result', () => {
  const v = computeView(st({ weight: '1.37 oz', layer: 'outer', plating: '25 um' }));
  it('every row and the headline equal formatResult output with the result bound', () => {
    if (v.status !== 'ok') throw new Error('expected ok');
    const opts = { accuracyClass: meta.accuracyClass, prefs: headlinePrefs('metric') };
    const byLabel = new Map(v.raw.results.map((r) => [r.name, formatResult(r, opts)]));
    const head = v.raw.results.find((r) => r.name === 'thickness');
    expect(v.result.headline.text).toBe(formatResult(head as NonNullable<typeof head>, opts));
    for (const row of v.result.rows) {
      expect([...byLabel.values()]).toContain(row.text);
    }
  });
  it('the headline is dual mm (mil)', () => {
    if (v.status !== 'ok') throw new Error('expected ok');
    expect(v.result.headline.text).toMatch(/^[\d.]+ mm \([\d.]+ mil\)$/);
  });
  it('the unit preference does not change the dual headline', () => {
    const a = computeView(st({ weight: '1 oz', layer: 'outer', units: 'metric' }));
    const b = computeView(st({ weight: '1 oz', layer: 'outer', units: 'imperial' }));
    if (a.status !== 'ok' || b.status !== 'ok') throw new Error('expected ok');
    expect(a.result.headline.text).toBe(b.result.headline.text);
  });
  it('the echo unit follows the preference (um, or mil)', () => {
    expect(echoPrefs('metric').length).toBe('um');
    expect(echoPrefs('imperial').length).toBe('mil');
  });
  const SRC_FILES: Record<string, string> = {
    vm: vmSrc, page: pageSrc, view: viewSrc, results: resultsSrc, steps: stepsSrc, prov: provSrc,
    conf: confSrc, formula: formulaSrc, warn: warnSrc, field: fieldSrc,
  };
  it('no UI source calls formatFor/formatDual directly or requests nearest rounding', () => {
    for (const [f, text] of Object.entries(SRC_FILES)) {
      const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, f).not.toMatch(/\bformatFor\b|\bformatDual\b/);
      expect(code, f).not.toMatch(/round\s*:\s*['"]nearest['"]/);
    }
  });
  it('the builder only prints numbers via formatResult / formatDesignValue', () => {
    const text = viewSrc;
    expect(text).toMatch(/formatResult/);
    expect(text).not.toMatch(/toFixed|toPrecision|Math\.round/);
  });
});

describe('hash state round trip', () => {
  const full = st({ by: 'thickness', thickness: '1.4 mil', weight: '2 oz', layer: 'outer', convention: 'mass-density', basis: 'finished', plating: '25 um', units: 'imperial' });
  it('round-trips every field through serializeHash / parseHash', () => {
    const hash = serializeHash(ROUTE, toHashState(full));
    const p = parseHash(hash);
    expect(p.stateDiscarded).toBe(false);
    expect(p.notes).toEqual([]);
    const back = fromHashState(p.state);
    expect(back.notices).toEqual([]);
    expect(back.state).toEqual(full);
  });
  it('the default state has a clean URL', () => {
    expect(serializeHash(ROUTE, toHashState(DEFAULT_STATE))).toBe('#/calc/copper-converter');
  });
  it('writes only documented keys, and never a reserved key other than u', () => {
    const keys = Object.keys(toHashState(full));
    const documented = new Set([...Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]), 'u']);
    for (const k of keys) expect(documented.has(k)).toBe(true);
    for (const k of WRITTEN_KEYS) expect(documented.has(k)).toBe(true);
    const reservedUsed = keys.filter((k) => Object.prototype.hasOwnProperty.call(RESERVED_STATE_KEYS, k));
    expect(reservedUsed).toEqual(['u']);
  });
  it('survives special characters in the typed text', () => {
    const s = st({ weight: '1 oz & 2=3 #%', layer: 'inner' });
    const back = fromHashState(parseHash(serializeHash(ROUTE, toHashState(s))).state);
    expect(back.state.weight).toBe(s.weight);
  });
});

describe('malformed hash state falls back safely', () => {
  it('unknown values become defaults with notices naming the setting', () => {
    const { state, notices } = fromHashState({ by: 'x', ly: 'middle', conv: 'bogus', tb: 'wrong', u: 'furlongs' });
    expect(state).toEqual(DEFAULT_STATE);
    expect(notices).toHaveLength(4);
    expect(notices.join(' ')).toMatch(/layer/i);
    expect(notices.join(' ')).not.toMatch(/\bby\b=|\bly\b|\bconv\b|\btb\b/);
  });
  it('an over-long text is dropped with a notice', () => {
    const { state, notices } = fromHashState({ w: 'x'.repeat(500) });
    expect(state.weight).toBe('');
    expect(notices).toHaveLength(1);
  });
  it('prototype keys and empty state never throw', () => {
    expect(() => fromHashState({})).not.toThrow();
    expect(fromHashState({ __proto__: 'x', constructor: 'y', toString: 'z' } as never).state).toEqual(DEFAULT_STATE);
  });
  it('a corrupt or foreign-version hash gives the default state', () => {
    for (const h of ['#/calc/copper-converter?v=1&w=%E0%A4%A', '#/calc/copper-converter?v=9&w=1%20oz&ly=outer', '#/calc/copper-converter?w=1%20oz', '#/calc/copper-converter?v=1&' + 'a=1&'.repeat(80)]) {
      const p = parseHash(h);
      expect(fromHashState(p.state).state).toEqual(DEFAULT_STATE);
    }
  });
  it('a hostile value is only ever text: it parses to an error, never a number', () => {
    const { state } = fromHashState({ w: '<img src=x onerror=alert(1)>', ly: 'outer' });
    const v = computeView(state);
    expect(v.status).toBe('error');
  });
  it('the unused fc key does not change the state', () => {
    const p = parseHash('#/calc/copper-converter?v=1&fc=35&w=1%20oz&ly=outer');
    const s = fromHashState(p.state).state;
    expect(s.convention).toBe('');
    expect(s.weight).toBe('1 oz');
  });
});

describe('speed', () => {
  it('a closed-form compute plus view build stays well under a frame', () => {
    const s = st({ weight: '1 oz', layer: 'outer', plating: '25 um' });
    computeView(s);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) computeView(s);
    expect((performance.now() - t0) / 200).toBeLessThan(2);
  });
});
