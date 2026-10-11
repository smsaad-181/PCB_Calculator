import { describe, expect, it } from 'vitest';
import vmSrc from './trace-width.vm.ts?raw';
import pageSrc from './TraceWidth.tsx?raw';
import viewSrc from '../components/view.ts?raw';
import resultsSrc from '../components/ResultsPanel.tsx?raw';
import designSrc from '../components/DesignValuesPanel.tsx?raw';
import validitySrc from '../components/ValidityChecksList.tsx?raw';
import radioSrc from '../components/RadioGroup.tsx?raw';
import fieldSrc from '../components/QuantityField.tsx?raw';
import stepsSrc from '../components/StepsList.tsx?raw';
import provSrc from '../components/InputsProvenance.tsx?raw';
import confSrc from '../components/ConfidenceBadge.tsx?raw';
import formulaSrc from '../components/FormulaPanel.tsx?raw';
import warnSrc from '../components/WarningList.tsx?raw';
import { meta } from '../../core/calculators/trace-width/meta';
import { formatDesignValue, formatResult } from '../../core/format-result';
import { DIM } from '../../core/units';
import { parseHash, serializeHash, CALCULATOR_STATE_KEYS, RESERVED_STATE_KEYS } from '../../state/hash';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  FAILED_CHECK_HINT,
  MODE_A_HINT,
  MODE_A_NOTICE,
  WRITTEN_KEYS,
  activeFields,
  computeView,
  copperBasisLine,
  echoPrefs,
  fieldDim,
  fromHashState,
  headlinePrefs,
  parseFieldOf,
  toHashState,
  type TraceWidthState,
} from './trace-width.vm';

const st = (p: Partial<TraceWidthState>): TraceWidthState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
const OUTER_W: Partial<TraceWidthState> = { solveFor: 'width', current: '1 A', deltaT: '10 °C', copperWeight: '1 oz', layer: 'outer' };

function ok(s: TraceWidthState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}`);
  return v;
}

describe('solve-for switching', () => {
  it('shows the other two quantities as the number fields', () => {
    expect(activeFields({ solveFor: 'width', copperBy: 'weight' }).slice(0, 2)).toEqual(['current', 'deltaT']);
    expect(activeFields({ solveFor: 'current', copperBy: 'weight' }).slice(0, 2)).toEqual(['width', 'deltaT']);
    expect(activeFields({ solveFor: 'deltaT', copperBy: 'weight' }).slice(0, 2)).toEqual(['width', 'current']);
  });
  it('the factor field shown matches the solve: margin for width, derating for current, none for rise', () => {
    expect(activeFields({ solveFor: 'width', copperBy: 'weight' })).toContain('designMargin');
    expect(activeFields({ solveFor: 'width', copperBy: 'weight' })).not.toContain('derating');
    expect(activeFields({ solveFor: 'current', copperBy: 'weight' })).toContain('derating');
    expect(activeFields({ solveFor: 'current', copperBy: 'weight' })).not.toContain('designMargin');
    const rise = activeFields({ solveFor: 'deltaT', copperBy: 'weight' });
    expect(rise).not.toContain('designMargin');
    expect(rise).not.toContain('derating');
  });
  it('copper weight vs thickness switches the copper field', () => {
    expect(activeFields({ solveFor: 'width', copperBy: 'weight' })).toContain('copperWeight');
    expect(activeFields({ solveFor: 'width', copperBy: 'thickness' })).toContain('copperThickness');
    expect(activeFields({ solveFor: 'width', copperBy: 'thickness' })).not.toContain('copperWeight');
  });
  it('fields carry the right expected dimensions, and the rise is a temperature DIFFERENCE', () => {
    expect(fieldDim('width')).toBe(DIM.LENGTH);
    expect(fieldDim('current')).toBe(DIM.CURRENT);
    expect(fieldDim('deltaT')).toBe(DIM.TEMPERATURE_DIFFERENCE);
    expect(fieldDim('ambient')).toBe(DIM.ABS_TEMPERATURE);
    expect(fieldDim('maxTemp')).toBe(DIM.ABS_TEMPERATURE);
    expect(fieldDim('designMargin')).toBe(DIM.DIMENSIONLESS);
    expect(fieldDim('copperWeight')).toBe(DIM.AREAL_MASS);
    const rise = parseFieldOf(st({ deltaT: '10 °C' }), 'deltaT');
    expect(rise.status).toBe('ok');
    if (rise.status === 'ok') expect(rise.echo).toMatch(/temperature rise/);
    expect(parseFieldOf(st({ deltaT: '10 K' }), 'deltaT').status).toBe('ok');
    expect(parseFieldOf(st({ deltaT: '18 °F' }), 'deltaT').status).toBe('ok');
  });
  it('solves width for 1 A, rise 10 °C, 1 oz: outer about 0.30 mm, inner about 0.78 mm', () => {
    const o = ok(st(OUTER_W));
    expect(o.result.headline.label).toBe('Minimum trace width');
    expect(o.result.headline.text).toBe('0.301 mm (11.83 mil)');
    expect(o.result.headline.meaning).toMatch(/Minimum required \(rounded up\)/);
    const i = ok(st({ ...OUTER_W, layer: 'inner' }));
    expect(i.result.headline.text).toBe('0.782 mm (30.77 mil)');
  });
  it('solves current capacity (rounded down) and temperature rise (rounded up)', () => {
    const c = ok(st({ solveFor: 'current', width: '0.3 mm', deltaT: '10 K', copperWeight: '1 oz', layer: 'outer' }));
    expect(c.result.headline.label).toBe('Maximum current capacity');
    expect(c.result.headline.text).toBe('999 mA');
    expect(c.result.headline.meaning).toMatch(/rounded down/);
    const r = ok(st({ solveFor: 'deltaT', width: '0.3 mm', current: '1 A', copperWeight: '1 oz', layer: 'outer' }));
    expect(r.result.headline.label).toBe('Predicted temperature rise');
    expect(r.result.headline.text).toMatch(/^\d+(\.\d+)? Δ°C$/);
    expect(r.result.headline.meaning).toMatch(/rounded up/);
  });
  it('does not read the field that is solved or hidden', () => {
    const v = computeView(st({ ...OUTER_W, width: 'garbage' }));
    expect(v.status).toBe('ok');
    const w = computeView(st({ solveFor: 'current', width: '0.3 mm', deltaT: '10 K', current: 'garbage', copperWeight: '1 oz', layer: 'outer' }));
    expect(w.status).toBe('ok');
  });
  it('the entered quantities are not repeated as result rows', () => {
    const v = ok(st(OUTER_W));
    expect(v.result.rows.map((r) => r.label)).not.toContain('Current');
    expect(v.result.rows.map((r) => r.label)).toEqual(
      expect.arrayContaining(['Cross-section area', 'Copper thickness', 'Maximum conductor temperature (ambient + rise)', 'Current density', 'Copper used']),
    );
  });
  it('a thickness entry with a basis works and the basis choice is provenance', () => {
    const v = ok(st({ ...OUTER_W, copperBy: 'thickness', copperThickness: '40 um', copperWeight: '', basis: 'finished' }));
    expect(v.result.details.inputs.find((r) => r.label === 'Thickness basis')?.source).toBe('user');
    expect(copperBasisLine(v.raw, headlinePrefs('metric'))).toBe('outer layer, finished basis, 40 µm (1.57 mil)');
  });
});

describe('the layer is never defaulted', () => {
  it('the default state has no layer and no result, even with everything else entered', () => {
    expect(DEFAULT_STATE.layer).toBe('');
    const v = computeView(st({ ...OUTER_W, layer: '' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/Choose a copper layer/);
    expect(v).not.toHaveProperty('result');
  });
  it('an empty form asks for every missing value and the layer', () => {
    const v = computeView(DEFAULT_STATE);
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs).toHaveLength(4);
  });
  it('a hash without a layer, or with a bad one, never produces one', () => {
    expect(fromHashState({ i: '1 A', dt: '10 °C', cw: '1 oz' }).state.layer).toBe('');
    expect(fromHashState({ ly: 'middle' }).state.layer).toBe('');
    expect(fromHashState({ ly: 'middle' }).notices.join(' ')).toMatch(/layer/i);
  });
  it('the default state never writes ly, and neither does any state without a chosen layer', () => {
    expect(toHashState(DEFAULT_STATE)).not.toHaveProperty('ly');
    expect(toHashState(st({ ...OUTER_W, layer: '' }))).not.toHaveProperty('ly');
    expect(toHashState(st({ layer: 'inner' }))['ly']).toBe('inner');
  });
  it('the page select has an empty placeholder and no preselected layer', () => {
    expect(pageSrc).toMatch(/placeholderOption="Choose a layer…"/);
    expect(pageSrc).not.toMatch(/layer:\s*'outer'/);
  });
});

describe('error mapping: invalid input never gives a number', () => {
  const field = (k: string) => ({ width: 'Trace width', current: 'Current', deltaT: 'Temperature rise' })[k];
  it('names the field for a parse error', () => {
    const cases: [Partial<TraceWidthState>, string][] = [
      [{ current: 'abc' }, 'Current'],
      [{ current: '1 V' }, 'Current'],
      [{ deltaT: 'ten' }, 'Temperature rise'],
      [{ deltaT: '0 °C' }, 'Temperature rise'],
      [{ copperWeight: '1/2 oz' }, 'Copper weight'],
      [{ ambient: '10 Δ°C' }, 'Ambient temperature'],
      [{ designMargin: '1.2.3' }, 'Design margin'],
      [{ maxTemp: 'hot' }, 'Maximum allowed conductor temperature'],
    ];
    for (const [p, label] of cases) {
      const v = computeView(st({ ...OUTER_W, ...p }));
      expect(v.status, JSON.stringify(p)).toBe('error');
      if (v.status !== 'error') continue;
      expect(v.problems[0]).toMatch(new RegExp(`^${label}: `));
      expect(v).not.toHaveProperty('result');
      expect(v).not.toHaveProperty('raw');
    }
  });
  it('rejects NaN, infinity, zero and negatives with a message, never a number', () => {
    for (const text of ['NaN', 'Infinity A', '-1 A', '0 A', '1e999 A', '1 A A']) {
      const v = computeView(st({ ...OUTER_W, current: text }));
      expect(v.status, text).toBe('error');
    }
  });
  it('a width in the wrong dimension is an error', () => {
    const v = computeView(st({ solveFor: 'current', width: '1 A', deltaT: '10 K', copperWeight: '1 oz', layer: 'outer' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.problems[0]).toMatch(new RegExp(`^${String(field('width'))}: `));
  });
  it('maps a core guard error to its field (margin below 1, derating above 1)', () => {
    const a = computeView(st({ ...OUTER_W, designMargin: '0.5' }));
    expect(a.status).toBe('error');
    if (a.status === 'error') {
      expect(a.fieldErrors.designMargin).toMatch(/at least 1/);
      expect(a.problems[0]).toMatch(/^Design margin: /);
    }
    const b = computeView(st({ solveFor: 'current', width: '0.3 mm', deltaT: '10 K', copperWeight: '1 oz', layer: 'outer', derating: '1.5' }));
    expect(b.status).toBe('error');
    if (b.status === 'error') expect(b.fieldErrors.derating).toMatch(/\(0, 1\]/);
  });
  it('a margin typed while solving something else is not read and cannot block', () => {
    const v = computeView(st({ solveFor: 'current', width: '0.3 mm', deltaT: '10 K', copperWeight: '1 oz', layer: 'outer', designMargin: '0.5' }));
    expect(v.status).toBe('ok');
  });
  it('an over-long text is rejected', () => {
    expect(computeView(st({ ...OUTER_W, current: '1'.repeat(200) + ' A' })).status).toBe('error');
  });
  it('an absurd unit slip is an error value, not a number or a throw', () => {
    expect(() => computeView(st({ ...OUTER_W, current: '1e300 A' }))).not.toThrow();
    const v = computeView(st({ ...OUTER_W, current: '1e300 A' }));
    if (v.status === 'ok') expect(Number.isFinite(v.raw.results[0]?.value.si)).toBe(true);
  });
});

describe('headline formatting goes through format-result', () => {
  const v = ok(st(OUTER_W));
  const cur = ok(st({ solveFor: 'current', width: '0.3 mm', deltaT: '10 K', copperWeight: '1 oz', layer: 'outer' }));
  const prefs = headlinePrefs('metric');
  const optsG = { accuracyClass: meta.accuracyClass, prefs, lengthRole: 'geometry' } as const;
  const optsT = { accuracyClass: meta.accuracyClass, prefs, lengthRole: 'thickness' } as const;

  it('the headline equals formatResult of the primary result with its bound', () => {
    const head = v.raw.results.find((r) => r.role === 'primary');
    expect(head?.bound).toBe('min-requirement');
    expect(v.result.headline.text).toBe(formatResult(head as NonNullable<typeof head>, optsG));
    const chead = cur.raw.results.find((r) => r.role === 'primary');
    expect(chead?.bound).toBe('max-capacity');
    expect(cur.result.headline.text).toBe(formatResult(chead as NonNullable<typeof chead>, optsG));
  });
  it('copper thickness rows print as thickness (µm), geometry as mm', () => {
    const t = v.result.rows.find((r) => r.label === 'Copper thickness');
    expect(t?.text).toMatch(/^[\d.]+ µm \([\d.]+ mil\)$/);
    expect(v.result.headline.text).toMatch(/^[\d.]+ mm \([\d.]+ mil\)$/);
    const th = v.raw.results.find((r) => r.name === 'copper thickness');
    expect(t?.text).toBe(formatResult(th as NonNullable<typeof th>, optsT));
  });
  it('the copper basis line uses the thickness headline', () => {
    const row = v.result.rows.find((r) => r.label === 'Copper used');
    expect(row?.text).toBe('outer layer, nominal basis, 35 µm (1.38 mil)');
  });
  it('both design numbers are rendered with formatDesignValue, in their own directions', () => {
    expect(v.result.designValues).toHaveLength(1);
    const dv = v.raw.designValues[0];
    const view = v.result.designValues[0];
    if (dv === undefined || view === undefined) throw new Error('missing design value');
    expect(view.calculated).toBe(formatDesignValue(dv, 'calculated', optsG));
    expect(view.recommended).toBe(formatDesignValue(dv, 'recommended', optsG));
    expect(view.calculatedLabel).toBe('Calculated');
    expect(view.recommendedLabel).toBe('Recommended (calculated × 1.25 margin, engineering default)');
    expect(view.calculated).not.toBe(view.recommended);
    const cd = cur.result.designValues[0];
    expect(cd?.recommendedLabel).toBe('Recommended (calculated × 0.8 derating, engineering default)');
    expect(cd?.calculated).toBe('999 mA');
    expect(cd?.recommended).toBe('799 mA');
  });
  it('a margin you set is labelled as set by you, not as an engineering default', () => {
    const w = ok(st({ ...OUTER_W, designMargin: '1.5' }));
    expect(w.result.designValues[0]?.recommendedLabel).toBe('Recommended (calculated × 1.5 margin, set by you)');
  });
  it('a rise prediction has no design value and says so', () => {
    const r = computeView(st({ solveFor: 'deltaT', width: '0.3 mm', current: '1 A', copperWeight: '1 oz', layer: 'outer' }));
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.result.designValues).toHaveLength(0);
    expect(r.notes.join(' ')).toMatch(/no recommended design value/);
  });
  it('printed values never go below the SI minimum or above the SI capacity (width in mm, current in A)', () => {
    const w = Number.parseFloat(v.result.headline.text);
    const wSi = v.raw.results.find((r) => r.name === 'width')?.value.si ?? Number.NaN;
    expect(w / 1000).toBeGreaterThanOrEqual(wSi);
    const c = Number.parseFloat(cur.result.headline.text);
    const cSi = cur.raw.results.find((r) => r.name === 'current capacity')?.value.si ?? Number.NaN;
    expect(c / 1000).toBeLessThanOrEqual(cSi);
  });
  const SRC: Record<string, string> = {
    vm: vmSrc, page: pageSrc, view: viewSrc, results: resultsSrc, design: designSrc, validity: validitySrc, radio: radioSrc,
    steps: stepsSrc, prov: provSrc, conf: confSrc, formula: formulaSrc, warn: warnSrc, field: fieldSrc,
  };
  it('no UI source calls formatFor/formatDual or requests nearest rounding', () => {
    for (const [f, text] of Object.entries(SRC)) {
      const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, f).not.toMatch(/\bformatFor\b|\bformatDual\b|\bformatDualThickness\b/);
      expect(code, f).not.toMatch(/round\s*:\s*['"]nearest['"]/);
      expect(code, f).not.toMatch(/toPrecision|Math\.round|Math\.ceil|Math\.floor/);
    }
  });
  it('the design-value panel prints only what the view-model supplies', () => {
    expect(designSrc).toMatch(/dv\.calculated\b/);
    expect(designSrc).toMatch(/dv\.recommended\b/);
    expect(viewSrc).toMatch(/formatDesignValue\(dv, 'calculated'/);
    expect(viewSrc).toMatch(/formatDesignValue\(dv, 'recommended'/);
  });
});

describe('36 A example: out of the chart range', () => {
  const v = ok(st({ ...OUTER_W, current: '36 A' }));
  it('shows the failed current check with its exact bound text', () => {
    const failed = v.result.details.validity.filter((c) => !c.ok);
    expect(failed.map((c) => c.name)).toContain('current within chart range (up to 35 A)');
    const cur = failed.find((c) => c.name.startsWith('current'));
    expect(cur?.detail).toMatch(/up to 35 A/);
    expect(cur?.detail).toMatch(/36 A/);
  });
  it('confidence is low and the reasons name the out-of-range input', () => {
    expect(v.result.confidence.level).toBe('low');
    expect(v.result.confidence.reasons.join(' ')).toMatch(/current = 36 A \(allowed: up to 35 A\)/);
    expect(v.result.confidence.reasons.length).toBeGreaterThan(3);
  });
  it('the failed-check explanation says it is extrapolation outside the chart range', () => {
    expect(FAILED_CHECK_HINT).toMatch(/outside the chart range: extrapolation/i);
    expect(validitySrc).toMatch(/OUTSIDE RANGE/);
    expect(validitySrc).toMatch(/failedHint/);
    expect(pageSrc).toMatch(/FAILED_CHECK_HINT/);
  });
  it('failed checks are marked by words and a symbol, not colour alone', () => {
    expect(validitySrc).toMatch(/✖/);
    expect(validitySrc).toMatch(/✔/);
    expect(validitySrc).toMatch(/Within range/);
  });
  it('a within-range case has no failed check', () => {
    const w = ok(st(OUTER_W));
    expect(w.result.details.validity.every((c) => c.ok)).toBe(true);
    expect(w.result.confidence.level).toBe('low');
    expect(w.result.confidence.reasons.length).toBeGreaterThan(0);
  });
  it('the maximum allowed temperature is a check when given', () => {
    const w = ok(st({ ...OUTER_W, maxTemp: '30 °C' }));
    const c = w.result.details.validity.find((x) => x.name.startsWith('maximum conductor temperature'));
    expect(c?.ok).toBe(false);
    const n = ok(st({ ...OUTER_W, maxTemp: '105 °C' }));
    expect(n.result.details.validity.find((x) => x.name.startsWith('maximum conductor temperature'))?.ok).toBe(true);
  });
});

describe('warnings, badges, provenance', () => {
  const v = ok(st({ ...OUTER_W, current: '36 A' }));
  it('the mandatory legacy caution is the first warning, even when more severe warnings exist', () => {
    expect(v.result.warnings.some((w) => w.severity === 'warning')).toBe(true);
    expect(v.result.warnings[0]?.message).toMatch(/^Legacy IPC-2221 method/);
    expect(v.result.warnings[0]?.severity).toBe('caution');
    const rest = v.result.warnings.slice(1).map((w) => w.severity);
    const rank = { critical: 0, warning: 1, caution: 2, info: 3 } as const;
    const r = rest.map((s) => rank[s]);
    expect(r).toEqual([...r].sort((a, b) => a - b));
  });
  it('shows the UNVERIFIED data status (S-001, S-010 paywalled)', () => {
    expect(v.result.ledger.unverifiedIds).toEqual(expect.arrayContaining(['S-001', 'S-010']));
    expect(v.result.ledger.worst).not.toBe('VERIFIED');
    expect(resultsSrc).toMatch(/UNVERIFIED/);
  });
  it('the formula and method are the exported metadata and result text', () => {
    expect(v.result.details.formula).toBe(meta.formula);
    expect(v.result.details.method).toBe(meta.method);
    expect(v.result.details.reference).toContain('IPC-2221');
    expect(v.result.details.method).toMatch(/legacy/);
  });
  it('defaults are marked as defaults in the provenance, user entries as user', () => {
    const rows = v.result.details.inputs;
    expect(rows.find((r) => r.label === 'Ambient temperature')?.source).toBe('default');
    expect(rows.find((r) => r.label === 'Design margin')?.source).toBe('default');
    expect(rows.find((r) => r.label === 'Copper layer')?.source).toBe('user');
    expect(rows.find((r) => r.label === 'Current')?.source).toBe('user');
    expect(rows.find((r) => r.label === 'Foil convention')?.source).toBe('default');
    expect(rows.find((r) => r.label === 'Current derating')).toBeUndefined();
  });
  it('an ambient you typed is a user input', () => {
    const w = ok(st({ ...OUTER_W, ambient: '40 °C' }));
    expect(w.result.details.inputs.find((r) => r.label === 'Ambient temperature')?.source).toBe('user');
  });
  it('maximum conductor temperature and current density are shown', () => {
    const w = ok(st(OUTER_W));
    expect(w.result.rows.find((r) => r.label.startsWith('Maximum conductor temperature'))?.text).toBe('35 °C');
    expect(w.result.rows.find((r) => r.label === 'Current density')?.text).toMatch(/A\/mm²$/);
  });
  it('units preference changes echo and temperature prints, not the dual geometry', () => {
    expect(echoPrefs('metric', 'thickness').length).toBe('um');
    expect(echoPrefs('metric', 'width').length).toBe('mm');
    expect(echoPrefs('imperial', 'width').length).toBe('mil');
    const a = ok(st(OUTER_W));
    const b = ok(st({ ...OUTER_W, units: 'imperial' }));
    expect(a.result.headline.text).toBe(b.result.headline.text);
  });
});

describe('Mode A is shown disabled and is never selectable', () => {
  it('the page offers a visible disabled option with the stated reason', () => {
    expect(MODE_A_HINT).toBe('not available — waiting for a decision (OPEN_RISKS R-8)');
    expect(pageSrc).toMatch(/MODE_A_LABEL, disabled: true, hint: MODE_A_HINT/);
    expect(pageSrc).toMatch(/Method: IPC-2221 legacy \(Mode B\)|METHOD_TEXT/);
    expect(pageSrc).not.toMatch(/value="A"/);
  });
  it('the radio ignores a disabled option even if its handler fires', () => {
    expect(radioSrc).toMatch(/disabled=\{o\.disabled === true\}/);
    expect(radioSrc).toMatch(/if \(o\.disabled !== true\) p\.onChange/);
  });
  it('a link asking for mode A is ignored with a notice; B needs none; the state has no mode', () => {
    const a = fromHashState({ mode: 'A', i: '1 A' });
    expect(a.notices).toContain(MODE_A_NOTICE);
    expect(Object.keys(a.state)).not.toContain('mode');
    expect(fromHashState({ mode: 'B' }).notices).toEqual([]);
    expect(fromHashState({ mode: 'zzz' }).notices).toContain(MODE_A_NOTICE);
    const full = parseHash('#/calc/trace-width?v=1&mode=A&i=1%20A&dt=10%20%C2%B0C&cw=1%20oz&ly=outer');
    const loaded = fromHashState(full.state);
    expect(loaded.notices).toContain(MODE_A_NOTICE);
    const v = ok(loaded.state);
    expect(v.raw.method).toBe(meta.method);
    expect(v.raw.method).toMatch(/legacy/);
  });
  it('never writes a mode key', () => {
    expect(Object.keys(toHashState(st({ ...OUTER_W, units: 'imperial' })))).not.toContain('mode');
    expect(vmSrc).toMatch(/mode: 'B'/);
    expect(vmSrc).not.toMatch(/mode: 'A'/);
  });
});

describe('hash state', () => {
  const full = st({
    solveFor: 'current', width: '12 mil', deltaT: '10 K', layer: 'inner', copperBy: 'thickness', copperThickness: '1.4 mil', basis: 'finished',
    convention: 'mass-density', ambient: '40 °C', derating: '0.7', maxTemp: '105 °C', units: 'imperial', current: '2 A', copperWeight: '2 oz', designMargin: '1.5',
  });
  it('round-trips every field through serializeHash / parseHash', () => {
    const hash = serializeHash(ROUTE, toHashState(full));
    const p = parseHash(hash);
    expect(p.stateDiscarded).toBe(false);
    expect(p.notes).toEqual([]);
    const back = fromHashState(p.state);
    expect(back.notices).toEqual([]);
    expect(back.state).toEqual(full);
  });
  it('round-trips each solve-for value', () => {
    for (const sf of ['width', 'current', 'deltaT'] as const) {
      const back = fromHashState(parseHash(serializeHash(ROUTE, toHashState(st({ ...OUTER_W, solveFor: sf })))).state);
      expect(back.state.solveFor).toBe(sf);
    }
    expect(toHashState(st({ solveFor: 'deltaT' }))['sf']).toBe('rise');
  });
  it('the default state has a clean URL', () => {
    expect(serializeHash(ROUTE, toHashState(DEFAULT_STATE))).toBe('#/calc/trace-width');
  });
  it('writes only documented keys, and never a reserved key other than u', () => {
    const keys = Object.keys(toHashState(full));
    const documented = new Set([...Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]), 'u']);
    for (const k of keys) expect(documented.has(k)).toBe(true);
    for (const k of WRITTEN_KEYS) expect(documented.has(k)).toBe(true);
    expect(keys.filter((k) => Object.prototype.hasOwnProperty.call(RESERVED_STATE_KEYS, k))).toEqual(['u']);
    for (const k of Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID])) {
      expect(CALCULATOR_STATE_KEYS[CALCULATOR_ID][k as keyof (typeof CALCULATOR_STATE_KEYS)['trace-width']].length).toBeGreaterThan(20);
    }
  });
  it('survives special characters in the typed text', () => {
    const s = st({ current: '1 A & 2=3 #%', layer: 'inner' });
    expect(fromHashState(parseHash(serializeHash(ROUTE, toHashState(s))).state).state.current).toBe(s.current);
  });
  it('a shared link reproduces the example result', () => {
    const state = fromHashState(parseHash('#/calc/trace-width?v=1&cw=1%20oz&dt=10%20%C2%B0C&i=1%20A&ly=outer').state).state;
    expect(ok(state).result.headline.text).toBe('0.301 mm (11.83 mil)');
  });
});

describe('malformed hash state falls back safely', () => {
  it('unknown values become defaults with notices that use human words, not key names', () => {
    const { state, notices } = fromHashState({ sf: 'x', ly: 'middle', cs: 'y', cb: 'wrong', conv: 'bogus', u: 'furlongs' });
    expect(state).toEqual(DEFAULT_STATE);
    expect(notices).toHaveLength(5);
    expect(notices.join(' ')).not.toMatch(/\bsf\b|\bly\b|\bcs\b|\bcb\b|\bconv\b/);
  });
  it('an over-long text is dropped with a notice', () => {
    const { state, notices } = fromHashState({ i: 'x'.repeat(500), am: 'y'.repeat(41) });
    expect(state.current).toBe('');
    expect(state.ambient).toBe('');
    expect(notices).toHaveLength(2);
  });
  it('prototype keys and empty state never throw', () => {
    expect(() => fromHashState({})).not.toThrow();
    expect(fromHashState({ __proto__: 'x', constructor: 'y', toString: 'z' } as never).state).toEqual(DEFAULT_STATE);
  });
  it('a corrupt or foreign-version hash gives the default state', () => {
    for (const h of [
      '#/calc/trace-width?v=1&i=%E0%A4%A',
      '#/calc/trace-width?v=9&i=1%20A&ly=outer',
      '#/calc/trace-width?i=1%20A',
      '#/calc/trace-width?v=1&' + 'a=1&'.repeat(80),
    ]) {
      expect(fromHashState(parseHash(h).state).state).toEqual(DEFAULT_STATE);
    }
  });
  it('a hostile value is only ever text: it parses to an error, never a number', () => {
    const { state } = fromHashState({ i: '<img src=x onerror=alert(1)>', dt: '10 °C', cw: '1 oz', ly: 'outer' });
    expect(computeView(state).status).toBe('error');
    const s2 = fromHashState({ i: '1 A', dt: '10 °C', cw: '1 oz', ly: 'outer', am: "javascript:alert(1)//" }).state;
    expect(computeView(s2).status).toBe('error');
  });
  it('the unused fc key is noticed, not applied', () => {
    const l = fromHashState(parseHash('#/calc/trace-width?v=1&fc=35&i=1%20A').state);
    expect(l.state.convention).toBe('');
    expect(l.notices.join(' ')).toMatch(/foil thickness per oz\/ft²/);
  });
});

describe('speed', () => {
  it('a closed-form compute plus view build stays well under a frame', () => {
    const s = st(OUTER_W);
    computeView(s);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) computeView(s);
    expect((performance.now() - t0) / 200).toBeLessThan(2);
  });
});
