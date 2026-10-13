import { describe, expect, it } from 'vitest';
import vmSrc from './trace-resistance.vm.ts?raw';
import pageSrc from './TraceResistance.tsx?raw';
import viewSrc from '../components/view.ts?raw';
import prefsSrc from '../components/prefs.ts?raw';
import resultsSrc from '../components/ResultsPanel.tsx?raw';
import calloutSrc from '../components/Callout.tsx?raw';
import validitySrc from '../components/ValidityChecksList.tsx?raw';
import fieldSrc from '../components/QuantityField.tsx?raw';
import confSrc from '../components/ConfidenceBadge.tsx?raw';
import { meta } from '../../core/calculators/trace-resistance/meta';
import { formatResult } from '../../core/format-result';
import { DIM } from '../../core/units';
import { CALCULATOR_STATE_KEYS, RESERVED_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import { headlinePrefs } from '../components/prefs';
import {
  ADVANCED_CAUTION,
  CALCULATOR_ID,
  DEFAULT_STATE,
  RANGE_HINT,
  SKIN_CHECK_NAME,
  SKIN_HINT,
  WRITTEN_KEYS,
  activeFields,
  computeView,
  copperBasisLine,
  fieldDim,
  fromHashState,
  hintForCheck,
  parseFieldOf,
  toHashState,
  type TraceResistanceState,
} from './trace-resistance.vm';

const st = (p: Partial<TraceResistanceState>): TraceResistanceState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
const BASE: Partial<TraceResistanceState> = { length: '100 mm', width: '0.254 mm', copperWeight: '1 oz', layer: 'outer', weightSource: 'foil' };
const SKIN_WARNING = 'DC formula is optimistic: skin depth is below half the copper thickness';

function ok(s: TraceResistanceState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}

/** Printed ohm text ("197.8 mΩ") back to ohms, for comparison with the SI value only. */
function ohms(text: string): number {
  const m = /^([\d.]+) ([mµkM]?)Ω$/.exec(text);
  if (m === null) throw new Error(`not a resistance: ${text}`);
  const f: Record<string, number> = { '': 1, m: 1e-3, µ: 1e-6, k: 1e3, M: 1e6 };
  return Number(m[1]) * (f[m[2] ?? ''] ?? Number.NaN);
}

describe('solve flow', () => {
  it('100 mm x 0.254 mm, 1 oz outer, default ambient: resistance at 25 degC', () => {
    const v = ok(st(BASE));
    expect(v.result.headline.label).toBe('Resistance at conductor temperature');
    expect(v.result.headline.text).toBe('197.8 mΩ');
    expect(v.result.headline.meaning).toBe('Predicted value (rounded up)');
    const rows = Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));
    expect(rows['Resistance at 20 °C']).toBe('193.9 mΩ');
    expect(rows['Conductor temperature']).toBe('25 °C');
    expect(rows['Copper thickness']).toBe('35 µm (1.38 mil)');
    expect(rows['Cross-section area']).toMatch(/mm² \(.* mil²\)$/);
    expect(rows['Resistivity at conductor temperature']).toMatch(/Ω·m$/);
    expect(rows['Copper used']).toBe('outer layer, nominal basis, 35 µm (1.38 mil)');
    expect(Object.keys(rows)).not.toContain('Skin depth');
    expect(Object.keys(rows)).not.toContain('Voltage drop');
  });
  it('a temperature rise raises the resistance and is a supplied value, not a solved one', () => {
    const cold = ok(st(BASE));
    const hot = ok(st({ ...BASE, deltaT: '20 °C' }));
    expect(ohms(hot.result.headline.text)).toBeGreaterThan(ohms(cold.result.headline.text));
    expect(hot.result.rows.find((r) => r.label === 'Conductor temperature')?.text).toBe('45 °C');
    expect(hot.notes).toEqual([]);
    expect(cold.notes.join(' ')).toMatch(/no self-heating/);
    expect(hot.result.warnings.map((w) => w.message).join(' ')).toMatch(/no self-heating iteration is performed/);
    expect(pageSrc).toMatch(/Supplied by you; no self-heating iteration is performed/);
  });
  it('a current adds voltage drop and power loss; a frequency adds the skin depth', () => {
    const v = ok(st({ ...BASE, current: '2 A', frequency: '1 kHz' }));
    const rows = Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));
    expect(rows['Voltage drop']).toMatch(/mV$/);
    expect(rows['Power loss']).toMatch(/mW$/);
    expect(rows['Skin depth']).toMatch(/^[\d.]+ (mm|µm) \([\d.]+ mil\)$/);
  });
  it('copper by thickness with a basis works and the basis is provenance', () => {
    const v = ok(st({ ...BASE, copperBy: 'thickness', copperThickness: '40 um', copperWeight: '', basis: 'finished' }));
    expect(v.result.details.inputs.find((r) => r.label === 'Thickness basis')?.source).toBe('user');
    expect(copperBasisLine(v.raw, headlinePrefs('metric'))).toBe('outer layer, finished basis, 40 µm (1.57 mil)');
    const n = ok(st({ ...BASE, copperBy: 'thickness', copperThickness: '40 um', copperWeight: '' }));
    expect(n.result.details.inputs.find((r) => r.label === 'Thickness basis')?.source).toBe('default');
  });
  it('does not read the copper field that is hidden', () => {
    expect(computeView(st({ ...BASE, copperThickness: 'garbage' })).status).toBe('ok');
    expect(computeView(st({ ...BASE, copperBy: 'thickness', copperThickness: '35 um', copperWeight: 'garbage' })).status).toBe('ok');
    expect(activeFields({ copperBy: 'weight' })).not.toContain('copperThickness');
    expect(activeFields({ copperBy: 'thickness' })).not.toContain('copperWeight');
  });
  it('fields carry the right expected dimensions; the rise is a temperature DIFFERENCE', () => {
    expect(fieldDim('length')).toBe(DIM.LENGTH);
    expect(fieldDim('width')).toBe(DIM.LENGTH);
    expect(fieldDim('deltaT')).toBe(DIM.TEMPERATURE_DIFFERENCE);
    expect(fieldDim('ambient')).toBe(DIM.ABS_TEMPERATURE);
    expect(fieldDim('resistivity')).toBe(DIM.RESISTIVITY);
    expect(fieldDim('alpha')).toBe(DIM.PER_KELVIN);
    expect(fieldDim('frequency')).toBe(DIM.FREQUENCY);
    expect(fieldDim('current')).toBe(DIM.CURRENT);
    expect(fieldDim('copperWeight')).toBe(DIM.AREAL_MASS);
    for (const t of ['100 mm', '4 in', '250 mil', '10 cm', '0.1 m']) expect(parseFieldOf(st({ length: t }), 'length').status, t).toBe('ok');
    expect(parseFieldOf(st({ deltaT: '20 K' }), 'deltaT').status).toBe('ok');
  });
  it('the empty form asks for length, width, copper and the layer', () => {
    const v = computeView(DEFAULT_STATE);
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs).toHaveLength(4);
  });
});

describe('the layer is never defaulted', () => {
  it('no layer, no result, even with everything else entered', () => {
    expect(DEFAULT_STATE.layer).toBe('');
    const v = computeView(st({ ...BASE, layer: '' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/Choose a copper layer/);
    expect(v).not.toHaveProperty('result');
  });
  it('a hash without a layer, or with a bad one, never produces one', () => {
    expect(fromHashState({ l: '100 mm', cw: '1 oz' }).state.layer).toBe('');
    expect(fromHashState({ ly: 'middle' }).state.layer).toBe('');
    expect(fromHashState({ ly: 'middle' }).notices.join(' ')).toMatch(/layer/i);
  });
  it('never writes ly without a user choice', () => {
    expect(toHashState(DEFAULT_STATE)).not.toHaveProperty('ly');
    expect(toHashState(st({ ...BASE, layer: '' }))).not.toHaveProperty('ly');
    expect(toHashState(st({ layer: 'inner' }))['ly']).toBe('inner');
  });
  it('the page select has an empty placeholder and no preselected layer', () => {
    expect(pageSrc).toMatch(/placeholderOption="Choose a layer…"/);
    expect(pageSrc).not.toMatch(/layer:\s*'outer'/);
    expect(vmSrc).not.toMatch(/layer:\s*'(outer|inner)'/);
  });
});

describe('error mapping: invalid input never gives a number', () => {
  it('names the field for a parse error', () => {
    const cases: [Partial<TraceResistanceState>, string][] = [
      [{ length: 'abc' }, 'Trace length'],
      [{ length: '1 A' }, 'Trace length'],
      [{ width: '0 mm' }, 'Trace width'],
      [{ width: '-1 mm' }, 'Trace width'],
      [{ copperWeight: '1/2 oz' }, 'Copper weight'],
      [{ ambient: '10 Δ°C' }, 'Ambient temperature'],
      [{ deltaT: 'ten' }, 'Temperature rise'],
      [{ resistivity: 'copper' }, 'Resistivity override'],
      [{ alpha: '0.004 V' }, 'Temperature coefficient override'],
      [{ frequency: '0 Hz' }, 'Frequency'],
      [{ frequency: 'fast' }, 'Frequency'],
      [{ current: '-2 A' }, 'Current'],
    ];
    for (const [p, label] of cases) {
      const v = computeView(st({ ...BASE, ...p }));
      expect(v.status, JSON.stringify(p)).toBe('error');
      if (v.status !== 'error') continue;
      expect(v.problems[0]).toMatch(new RegExp(`^${label}: `));
      expect(Object.values(v.fieldErrors).length).toBeGreaterThan(0);
      expect(v).not.toHaveProperty('result');
      expect(v).not.toHaveProperty('raw');
    }
  });
  it('the thickness field names itself when copper is a thickness', () => {
    const v = computeView(st({ ...BASE, copperBy: 'thickness', copperWeight: '', copperThickness: 'thick' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.problems[0]).toMatch(/^Copper thickness: /);
  });
  it('rejects NaN, infinity, zero, negatives and over-long text', () => {
    for (const text of ['NaN', 'Infinity mm', '-1 mm', '0 mm', '1e999 mm', '1 mm mm', '1'.repeat(200) + ' mm']) {
      expect(computeView(st({ ...BASE, length: text })).status, text).toBe('error');
    }
  });
  it('maps a core error to its field (conductor below absolute zero)', () => {
    const v = computeView(st({ ...BASE, deltaT: '-400 K' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') {
      expect(v.problems[0]).toMatch(/^Temperature rise: /);
      expect(v.fieldErrors.deltaT).toBeDefined();
    }
  });
  it('a unit slip that overflows is an error value, never a throw or NaN', () => {
    expect(() => computeView(st({ ...BASE, length: '1e300 m' }))).not.toThrow();
    const v = computeView(st({ ...BASE, length: '1e300 m' }));
    if (v.status === 'ok') expect(Number.isFinite(v.raw.results[0]?.value.si)).toBe(true);
    else expect(v.status).toBe('error');
  });
  it('a bad optional field blocks the result instead of being ignored', () => {
    expect(computeView(st({ ...BASE, current: 'lots' })).status).toBe('error');
  });
});

describe('headline formatting goes through format-result', () => {
  const prefs = headlinePrefs('metric');
  const optsG = { accuracyClass: meta.accuracyClass, prefs, lengthRole: 'geometry' } as const;
  const optsT = { accuracyClass: meta.accuracyClass, prefs, lengthRole: 'thickness' } as const;
  const v = ok(st({ ...BASE, current: '2 A', frequency: '1 kHz', deltaT: '20 °C' }));

  it('the headline equals formatResult of the primary result, which is a prediction (rounds up)', () => {
    const head = v.raw.results.find((r) => r.role === 'primary');
    expect(head?.bound).toBe('prediction');
    expect(v.result.headline.text).toBe(formatResult(head as NonNullable<typeof head>, optsG));
  });
  it('every row equals formatResult of its result', () => {
    for (const r of v.raw.results.filter((x) => x.role !== 'primary')) {
      const want = formatResult(r, /thickness|skin/.test(r.name) ? optsT : optsG);
      expect(
        v.result.rows.some((row) => row.text === want),
        r.name,
      ).toBe(true);
    }
  });
  it('the resistance headline is never printed below its SI value', () => {
    const lens = ['1 mm', '3 mm', '10 mm', '100 mm', '1 m', '4 in', '250 mil'];
    const widths = ['0.1 mm', '0.254 mm', '0.3 mm', '2 mm', '10 mil', '50 mil'];
    for (const length of lens) {
      for (const width of widths) {
        for (const copperWeight of ['0.5 oz', '1 oz', '2 oz']) {
          for (const deltaT of ['', '10 °C', '37 °C']) {
            const w = ok(st({ ...BASE, length, width, copperWeight, deltaT }));
            const si = w.raw.results.find((r) => r.role === 'primary')?.value.si ?? Number.NaN;
            expect(ohms(w.result.headline.text), `${length} ${width} ${copperWeight} ${deltaT}`).toBeGreaterThanOrEqual(si * (1 - 1e-12));
          }
        }
      }
    }
  });
  it('copper thickness and skin depth print as micrometres, geometry as mm and mil', () => {
    expect(v.result.rows.find((r) => r.label === 'Copper thickness')?.text).toMatch(/^[\d.]+ µm \([\d.]+ mil\)$/);
    expect(v.result.details.inputs.find((r) => r.label === 'Trace length')?.value).toMatch(/^[\d.]+ mm \([\d.]+ mil\)$/);
    const s = ok(st({ ...BASE, frequency: '1 GHz' }));
    expect(s.result.rows.find((r) => r.label === 'Skin depth')?.text).toMatch(/^[\d.]+ µm \([\d.]+ mil\)$/);
  });
  it('the units preference changes echo and temperature prints, not the dual geometry or the headline', () => {
    const a = ok(st(BASE));
    const b = ok(st({ ...BASE, units: 'imperial' }));
    expect(a.result.headline.text).toBe(b.result.headline.text);
    expect(a.result.rows.find((r) => r.label === 'Conductor temperature')?.text).toBe('25 °C');
    expect(b.result.rows.find((r) => r.label === 'Conductor temperature')?.text).toMatch(/°F$/);
  });
  const SRC: Record<string, string> = {
    vm: vmSrc, page: pageSrc, view: viewSrc, prefs: prefsSrc, results: resultsSrc, callout: calloutSrc, validity: validitySrc, field: fieldSrc, conf: confSrc,
  };
  it('no UI source calls formatFor/formatDual or requests nearest rounding or rounds by hand', () => {
    for (const [f, text] of Object.entries(SRC)) {
      const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, f).not.toMatch(/\bformatFor\b|\bformatDual\b|\bformatDualThickness\b/);
      expect(code, f).not.toMatch(/round\s*:\s*['"]nearest['"]|'nearest'/);
      expect(code, f).not.toMatch(/toPrecision|Math\.round|Math\.ceil|Math\.floor/);
    }
  });
  it('no engineering math in the view-model or page', () => {
    for (const code of [vmSrc, pageSrc]) {
      const stripped = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(stripped).not.toMatch(/Math\.(sqrt|pow|log|exp|PI)|\.si\s*[*/+-]/);
    }
  });
});

describe('overrides: cautions shown, values never defaulted', () => {
  it('resistivity and alpha are empty by default and in every fresh state', () => {
    expect(DEFAULT_STATE.resistivity).toBe('');
    expect(DEFAULT_STATE.alpha).toBe('');
    expect(fromHashState({}).state.resistivity).toBe('');
    expect(fromHashState({}).state.alpha).toBe('');
    const keys = Object.keys(toHashState(st({ ...BASE, units: 'imperial', current: '1 A', frequency: '1 MHz' })));
    expect(keys).not.toContain('rho');
    expect(keys).not.toContain('al');
    expect(pageSrc).not.toMatch(/resistivity:\s*'[^']/);
  });
  it('the result without an override uses the ledger value and shows no override caution', () => {
    const v = ok(st(BASE));
    expect(v.result.warnings.map((w) => w.message).join(' ')).not.toMatch(/you entered/);
    expect(v.raw.inputs.map((i) => i.name)).not.toContain('resistivity');
    expect(v.raw.inputs.map((i) => i.name)).not.toContain('alpha');
  });
  it('an override you type is applied, labelled as yours and carries the plated-copper caution', () => {
    const d = ok(st(BASE));
    const v = ok(st({ ...BASE, resistivity: '2e-8 Ω·m', alpha: '3930 ppm/K' }));
    expect(ohms(v.result.headline.text)).toBeGreaterThan(ohms(d.result.headline.text));
    const msgs = v.result.warnings.map((w) => w.message).join(' ');
    expect(msgs).toMatch(/resistivity you entered will replace the ledger value/);
    expect(msgs).toMatch(/plated copper/);
    expect(msgs).toMatch(/temperature coefficient you entered will replace/);
    expect(v.result.warnings.filter((w) => w.severity === 'caution').length).toBeGreaterThanOrEqual(2);
    expect(v.result.details.inputs.find((r) => r.label.startsWith('Resistivity override'))?.source).toBe('user');
    expect(v.result.details.inputs.find((r) => r.label.startsWith('Temperature coefficient override'))?.source).toBe('user');
    expect(v.result.ledger.unverifiedIds).toContain('S-012');
  });
  it('the advanced section states the plated-copper caution and is collapsed unless the link carries an override', () => {
    expect(ADVANCED_CAUTION).toMatch(/Plated copper/);
    expect(ADVANCED_CAUTION).toMatch(/S-012/);
    expect(ADVANCED_CAUTION).toMatch(/Nothing here is prefilled/);
    expect(pageSrc).toMatch(/Advanced \(overrides\)/);
    expect(pageSrc).toMatch(/ADVANCED_CAUTION/);
    expect(pageSrc).toMatch(/useState\(init\.state\.resistivity\.trim\(\) !== '' \|\| init\.state\.alpha\.trim\(\) !== ''\)/);
  });
  it('an override that gives a non-positive resistivity is an error value', () => {
    expect(computeView(st({ ...BASE, resistivity: '0 Ω·m' })).status).toBe('error');
    expect(computeView(st({ ...BASE, alpha: '-1 /K', deltaT: '100 °C' })).status).toBe('error');
  });
});

describe('skin depth', () => {
  const fail = ok(st({ ...BASE, frequency: '1 GHz' }));
  it('fails at 1 GHz on 35 um copper: failed check, callout, warning first, low confidence', () => {
    const c = fail.result.details.validity.find((x) => x.name === SKIN_CHECK_NAME);
    expect(c?.ok).toBe(false);
    expect(c?.detail).toMatch(/Skin depth 2.11 µm against half thickness 17\.5 µm/);
    expect(fail.callout?.heading).toBe(SKIN_WARNING);
    expect(fail.callout?.text).toMatch(/Skin depth 2.11 µm/);
    expect(fail.result.warnings[0]?.message).toBe(SKIN_WARNING);
    expect(fail.result.warnings[0]?.severity).toBe('warning');
    expect(fail.result.confidence.level).toBe('low');
    expect(fail.result.confidence.reasons.join(' ')).toMatch(/frequency = .*skin depth at least half the copper thickness/);
  });
  it('the failed check gets the DC-optimistic hint, other failed checks get the range hint', () => {
    expect(hintForCheck(SKIN_CHECK_NAME)).toBe(SKIN_HINT);
    expect(SKIN_HINT).toMatch(/^DC formula is optimistic/);
    expect(hintForCheck('length up to 10 m')).toBeUndefined();
    expect(RANGE_HINT).toMatch(/plausibility range/);
    expect(pageSrc).toMatch(/failedHintFor=\{hintForCheck\}/);
    expect(pageSrc).toMatch(/failedCheckHint=\{RANGE_HINT\}/);
    expect(validitySrc).toMatch(/hintFor\?\.\(c\.name\) \?\? failedHint/);
  });
  it('the headline is still the DC value and the callout sits directly under it', () => {
    expect(fail.result.headline.label).toBe('Resistance at conductor temperature');
    expect(resultsSrc.indexOf('v.headline.meaning')).toBeLessThan(resultsSrc.indexOf('<Callout'));
    expect(resultsSrc.indexOf('<Callout')).toBeLessThan(resultsSrc.indexOf('<ValidityChecksList'));
  });
  it('a passing frequency has the check ok, no callout and no skin warning', () => {
    const v = ok(st({ ...BASE, frequency: '1 kHz' }));
    expect(v.result.details.validity.find((x) => x.name === SKIN_CHECK_NAME)?.ok).toBe(true);
    expect(v.callout).toBeUndefined();
    expect(v.result.warnings.map((w) => w.message)).not.toContain(SKIN_WARNING);
  });
  it('with no frequency there is no skin check', () => {
    const v = ok(st(BASE));
    expect(v.result.details.validity.map((c) => c.name)).not.toContain(SKIN_CHECK_NAME);
    expect(v.callout).toBeUndefined();
  });
  it('the validity checks show the exact bound text from the calculator', () => {
    const v = ok(st(BASE));
    expect(v.result.details.validity.map((c) => c.name)).toEqual(['conductor temperature within -55 to 150 °C', 'length up to 10 m', 'width up to 100 mm']);
    const long = ok(st({ ...BASE, length: '11 m' }));
    expect(long.result.details.validity.find((c) => c.name === 'length up to 10 m')?.ok).toBe(false);
    expect(long.result.confidence.level).toBe('low');
  });
});

describe('confidence, badges, provenance', () => {
  const v = ok(st(BASE));
  it('shows level, score and every reason from the calculator', () => {
    expect(v.result.confidence.reasons).toEqual([...v.raw.confidence.reasons]);
    expect(v.result.confidence.score).toBe(v.raw.confidence.score);
    expect(v.result.confidence.reasons.length).toBeGreaterThan(1);
    expect(confSrc).toMatch(/confidence\.reasons\.map/);
  });
  it('shows the UNVERIFIED badge from ledger status and the formula from the exported metadata', () => {
    expect(v.result.ledger.unverifiedIds.length).toBeGreaterThan(0);
    expect(resultsSrc).toMatch(/UNVERIFIED/);
    expect(v.result.details.formula).toBe(meta.formula);
    expect(v.result.details.method).toBe(meta.method);
    expect(v.result.ledger.entries.map((e) => e.id)).toEqual(expect.arrayContaining(['S-004', 'S-006', 'S-003']));
    const f = ok(st({ ...BASE, frequency: '1 kHz' }));
    expect(f.result.ledger.entries.map((e) => e.id)).toContain('S-013');
  });
  it('defaults are marked as defaults, user entries as user', () => {
    const rows = v.result.details.inputs;
    expect(rows.find((r) => r.label === 'Ambient temperature')?.source).toBe('default');
    expect(rows.find((r) => r.label === 'Foil convention')?.source).toBe('default');
    expect(rows.find((r) => r.label === 'Copper layer')?.source).toBe('user');
    expect(rows.find((r) => r.label === 'Trace length')?.source).toBe('user');
    const w = ok(st({ ...BASE, ambient: '40 °C' }));
    expect(w.result.details.inputs.find((r) => r.label === 'Ambient temperature')?.source).toBe('user');
  });
  it('warnings are ordered most severe first', () => {
    const w = ok(st({ ...BASE, frequency: '1 GHz', resistivity: '2e-8 Ω·m', deltaT: '5 °C' }));
    const rank = { critical: 0, warning: 1, caution: 2, info: 3 } as const;
    const r = w.result.warnings.map((x) => rank[x.severity]);
    expect(r).toEqual([...r].sort((a, b) => a - b));
  });
});

describe('hash state', () => {
  const full = st({
    length: '4 in', width: '10 mil', layer: 'inner', copperBy: 'thickness', copperThickness: '1.4 mil', basis: 'finished', convention: 'mass-density',
    ambient: '40 °C', deltaT: '20 K', resistivity: '1.72 µΩ·cm', alpha: '3930 ppm/K', frequency: '100 MHz', current: '2 A', units: 'imperial', copperWeight: '2 oz',
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
  it('the default state has a clean URL', () => {
    expect(serializeHash(ROUTE, toHashState(DEFAULT_STATE))).toBe('#/calc/trace-resistance');
  });
  it('writes only documented keys, and never a reserved key other than u', () => {
    const keys = Object.keys(toHashState(full));
    const doc = CALCULATOR_STATE_KEYS[CALCULATOR_ID];
    const documented = new Set([...Object.keys(doc), 'u']);
    for (const k of keys) expect(documented.has(k)).toBe(true);
    for (const k of WRITTEN_KEYS) expect(documented.has(k)).toBe(true);
    expect(keys.filter((k) => Object.prototype.hasOwnProperty.call(RESERVED_STATE_KEYS, k))).toEqual(['u']);
    expect(Object.keys(doc).sort()).toEqual(['al', 'am', 'cb', 'conv', 'cs', 'ct', 'cw', 'dt', 'f', 'i', 'l', 'ly', 'rho', 'w', 'wsrc']);
    for (const k of Object.keys(doc)) expect(doc[k as keyof typeof doc].length).toBeGreaterThan(20);
    expect(Object.keys(doc).filter((k) => Object.prototype.hasOwnProperty.call(RESERVED_STATE_KEYS, k) || k === 'v')).toEqual([]);
  });
  it('survives special characters in the typed text', () => {
    const s = st({ length: '1 mm & 2=3 #%', layer: 'inner' });
    expect(fromHashState(parseHash(serializeHash(ROUTE, toHashState(s))).state).state.length).toBe(s.length);
  });
  it('a shared link with a proper degree sign reproduces the example result', () => {
    const link = '#/calc/trace-resistance?v=1&am=25%20%C2%B0C&cw=1%20oz&dt=20%20%C2%B0C&l=100%20mm&ly=outer&w=0.254%20mm';
    const state = fromHashState(parseHash(link).state).state;
    expect(state.deltaT).toBe('20 °C');
    expect(ok(state).result.headline.text).toBe(ok(st({ ...BASE, ambient: '25 °C', deltaT: '20 °C' })).result.headline.text);
    expect(ok(state).result.headline.text).toBe('213 mΩ');
  });
});

describe('malformed hash state falls back safely', () => {
  it('unknown values become defaults with notices in human words, not key names', () => {
    const { state, notices } = fromHashState({ ly: 'middle', cs: 'y', cb: 'wrong', conv: 'bogus', u: 'furlongs' });
    expect(state).toEqual(DEFAULT_STATE);
    expect(notices).toHaveLength(4);
    expect(notices.join(' ')).not.toMatch(/\bly\b|\bcs\b|\bcb\b|\bconv\b/);
  });
  it('an over-long text is dropped with a notice that names the field', () => {
    const { state, notices } = fromHashState({ l: 'x'.repeat(500), rho: 'y'.repeat(41) });
    expect(state.length).toBe('');
    expect(state.resistivity).toBe('');
    expect(notices).toHaveLength(2);
    expect(notices.join(' ')).toMatch(/Trace length/);
    expect(notices.join(' ')).toMatch(/Resistivity override/);
  });
  it('prototype keys and empty state never throw', () => {
    expect(() => fromHashState({})).not.toThrow();
    expect(fromHashState({ __proto__: 'x', constructor: 'y', toString: 'z' } as never).state).toEqual(DEFAULT_STATE);
  });
  it('a corrupt, unversioned, foreign-version or oversized hash gives the default state', () => {
    for (const h of [
      '#/calc/trace-resistance?v=1&l=%E0%A4%A',
      '#/calc/trace-resistance?v=9&l=1%20m&ly=outer',
      '#/calc/trace-resistance?l=1%20m',
      '#/calc/trace-resistance?v=1&' + 'a=1&'.repeat(80),
    ]) {
      expect(fromHashState(parseHash(h).state).state).toEqual(DEFAULT_STATE);
    }
  });
  it('a hostile value is only ever text: it parses to an error, never a number', () => {
    const { state } = fromHashState({ l: '<img src=x onerror=alert(1)>', w: '0.254 mm', cw: '1 oz', ly: 'outer' });
    expect(computeView(state).status).toBe('error');
    const s2 = fromHashState({ l: '100 mm', w: '0.254 mm', cw: '1 oz', ly: 'outer', rho: 'javascript:alert(1)//' }).state;
    expect(computeView(s2).status).toBe('error');
  });
  it('the unused mode and fc keys are noticed, not applied', () => {
    const a = fromHashState(parseHash('#/calc/trace-resistance?v=1&fc=35&mode=A&l=1%20m').state);
    expect(a.state.convention).toBe('');
    expect(a.notices.join(' ')).toMatch(/foil thickness per oz\/ft²/);
    expect(a.notices.join(' ')).toMatch(/method mode/);
    expect(Object.keys(a.state)).not.toContain('mode');
  });
});

describe('accessibility wiring', () => {
  it('has a polite live summary, a labelled form, a labelled results section and rAF debounce', () => {
    expect(pageSrc).toMatch(/role="status" aria-live="polite" aria-atomic="true"/);
    expect(pageSrc).toMatch(/aria-label="Trace resistance inputs"/);
    expect(pageSrc).toMatch(/aria-labelledby="result-h"/);
    expect(pageSrc).toMatch(/useRafValue/);
  });
  it('every quantity field announces its unit in the label', () => {
    expect(fieldSrc).toMatch(/<span class="unit">\(\{p\.unitHint\}\)<\/span>/);
    const hints = [...pageSrc.matchAll(/unitHint="([^"]+)"/g)].map((m) => m[1]);
    expect(hints.length).toBe(10);
  });
  it('uses no inline scripts, inline styles or raw HTML', () => {
    for (const code of [pageSrc, calloutSrc]) {
      expect(code).not.toMatch(/style=|dangerouslySetInnerHTML|innerHTML|<script/);
    }
  });
});

describe('speed', () => {
  it('a closed-form compute plus view build stays well under a frame', () => {
    const s = st({ ...BASE, current: '2 A', frequency: '1 GHz', deltaT: '20 °C' });
    computeView(s);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) computeView(s);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('voltage-drop scope is shown beside the voltage drop', () => {
  it('attaches the core scope warning to the voltage drop row and not only to the list', () => {
    const v = computeView(st({ ...BASE, current: '2 A' }));
    if (v.status !== 'ok') throw new Error('expected ok');
    const scope = v.raw.warnings.find((w) => w.code === 'VOLTAGE_DROP_SCOPE');
    expect(scope).toBeDefined();
    const row = v.result.rows.find((r) => r.label === 'Voltage drop');
    expect(row?.note?.message).toBe(scope?.message);
    expect(row?.note?.label).toBe('Caution');
  });
  it('has no scope note when no current was entered', () => {
    const v = computeView(st({ ...BASE }));
    if (v.status !== 'ok') throw new Error('expected ok');
    expect(v.result.rows.every((r) => r.note === undefined)).toBe(true);
  });
});
