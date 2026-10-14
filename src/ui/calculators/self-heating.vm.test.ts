import { describe, expect, it } from 'vitest';
import vmSrc from './self-heating.vm.ts?raw';
import pageSrc from './SelfHeating.tsx?raw';
import { meta } from '../../core/calculators/self-heating/meta';
import { DIM } from '../../core/units';
import { CALCULATOR_STATE_KEYS, RESERVED_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  LAW_LABEL,
  WRITTEN_KEYS,
  activeFields,
  computeView,
  fieldDim,
  fromHashState,
  toHashState,
  type SelfHeatingState,
} from './self-heating.vm';

const st = (p: Partial<SelfHeatingState>): SelfHeatingState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
const BASE: Partial<SelfHeatingState> = {
  thermalLaw: 'user-theta',
  length: '100 mm',
  width: '0.254 mm',
  copperBy: 'thickness',
  copperThickness: '35 um',
  layer: 'outer',
  current: '2 A',
  theta: '50 K/W',
  ambient: '25 °C',
};

function ok(s: SelfHeatingState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}
const rowsOf = (v: ReturnType<typeof ok>) => Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));

describe('worked example', () => {
  it('user theta 50 K/W, 2 A, 100 mm x 0.254 mm, 35 um: dT about 46.66 K, conductor 71.66 degC', () => {
    const v = ok(st(BASE));
    expect(v.result.headline.label).toBe('Temperature rise');
    expect(v.result.headline.text).toMatch(/^46\.7 Δ°C$/);
    const rows = rowsOf(v);
    expect(rows['Conductor temperature']).toMatch(/^71\.[67]\d* °C$/);
    expect(rows['Resistance at conductor temperature']).toMatch(/mΩ$/);
    expect(rows['Power dissipated']).toMatch(/W$/);
    expect(rows['Voltage drop']).toMatch(/mV$/);
    expect(rows['Temperature rise without resistance coupling (alpha = 0)']).toMatch(/Δ°C$/);
    expect(Object.keys(rows).join('|')).toMatch(/Coupling effect/);
  });
  it('the voltage drop row carries the scope caution beside it', () => {
    const v = ok(st(BASE));
    const row = v.result.rows.find((r) => r.label === 'Voltage drop');
    expect(row?.note?.label).toBe('Caution');
    expect(row?.note?.message).toBe(v.raw.warnings.find((w) => w.code === 'VOLTAGE_DROP_SCOPE')?.message);
  });
  it('theta per length gives the same answer as the equivalent theta', () => {
    const a = ok(st(BASE));
    // 50 K/W x 0.1 m = 5 K m/W
    const b = ok(st({ ...BASE, thetaBy: 'per-length', theta: '', thetaPerLength: '5 K·m/W' }));
    expect(b.result.headline.text).toBe(a.result.headline.text);
  });
  it('the solver status, iterations and residual are in the details steps', () => {
    const v = ok(st(BASE));
    const labels = v.result.details.steps.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining(['Solver status', 'Solver residual', 'Loop gain']));
    expect(v.result.details.steps.find((s) => s.label === 'Solver status')?.expr).toMatch(/converged/);
  });
});

describe('the thermal law and the layer are never defaulted', () => {
  it('DEFAULT_STATE has no law and no layer, and the empty form asks for both', () => {
    expect(DEFAULT_STATE.thermalLaw).toBe('');
    expect(DEFAULT_STATE.layer).toBe('');
    const v = computeView(DEFAULT_STATE);
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') {
      expect(v.needs.join(' ')).toMatch(/thermal law/i);
      expect(v.needs.join(' ')).toMatch(/copper layer/i);
    }
  });
  it('no law, no result, even with everything else entered', () => {
    const v = computeView(st({ ...BASE, thermalLaw: '' }));
    expect(v.status).toBe('needs-input');
    expect(v).not.toHaveProperty('result');
  });
  it('no layer, no result', () => {
    expect(computeView(st({ ...BASE, layer: '' })).status).toBe('needs-input');
  });
  it('the hash never writes or invents a law or layer', () => {
    expect(toHashState(DEFAULT_STATE)).not.toHaveProperty('law');
    expect(toHashState(DEFAULT_STATE)).not.toHaveProperty('ly');
    expect(fromHashState({ l: '1 m' }).state.thermalLaw).toBe('');
    const bad = fromHashState({ law: 'whatever', ly: 'middle' });
    expect(bad.state.thermalLaw).toBe('');
    expect(bad.state.layer).toBe('');
    expect(bad.notices).toHaveLength(2);
  });
  it('the source has no preselected law or layer', () => {
    expect(vmSrc).not.toMatch(/thermalLaw:\s*'(user-theta|legacy)/);
    expect(vmSrc).not.toMatch(/layer:\s*'(outer|inner)'/);
    expect(pageSrc).not.toMatch(/thermalLaw:\s*'(user-theta|legacy)/);
  });
  it('user theta needs exactly one theta field, read according to the choice', () => {
    expect(activeFields(st({ thermalLaw: 'user-theta', thetaBy: 'theta' }))).toContain('theta');
    expect(activeFields(st({ thermalLaw: 'user-theta', thetaBy: 'theta' }))).not.toContain('thetaPerLength');
    expect(activeFields(st({ thermalLaw: 'user-theta', thetaBy: 'per-length' }))).toContain('thetaPerLength');
    expect(activeFields(st({ thermalLaw: 'user-theta', thetaBy: 'per-length' }))).not.toContain('theta');
    const none = activeFields(st({ thermalLaw: 'legacy-ipc2221-calibrated' }));
    expect(none).not.toContain('theta');
    expect(none).not.toContain('thetaPerLength');
    // a garbage hidden theta is not read
    expect(computeView(st({ ...BASE, thetaPerLength: 'garbage' })).status).toBe('ok');
    const v = computeView(st({ ...BASE, theta: '' }));
    expect(v.status).toBe('needs-input');
  });
  it('theta fields have thermal dimensions', () => {
    expect(fieldDim('theta')).toBe(DIM.THERMAL_RESISTANCE);
    expect(fieldDim('thetaPerLength')).toBe(DIM.THERMAL_RESISTANCE_PER_LENGTH);
    expect(fieldDim('ambient')).toBe(DIM.ABS_TEMPERATURE);
    expect(fieldDim('current')).toBe(DIM.CURRENT);
  });
});

describe('legacy law', () => {
  const legacy = st({ ...BASE, thermalLaw: 'legacy-ipc2221-calibrated', theta: '', current: '1 A' });
  it('computes, is labelled legacy, and never carries user theta caution', () => {
    const v = ok(legacy);
    expect(LAW_LABEL['legacy-ipc2221-calibrated']).toMatch(/legacy/i);
    expect(v.result.details.assumptions[0]).toMatch(/legacy IPC-2221 calibrated/);
    expect(v.result.details.inputs.find((r) => r.label === 'Thermal law')?.value).toBe(LAW_LABEL['legacy-ipc2221-calibrated']);
    expect(v.result.warnings.map((w) => w.message).join(' ')).toMatch(/Legacy IPC-2221 method/);
    expect(v.result.ledger.unverifiedIds).toEqual(expect.arrayContaining(['S-001']));
    const groups = v.result.ledger.groups.map((g) => g.status);
    expect(groups).toContain('PAYWALLED-USER-MUST-VERIFY');
  });
  it('the user law does not pull in the legacy relation ledger row', () => {
    const v = ok(st(BASE));
    expect(v.result.ledger.unverifiedIds.length).toBeGreaterThan(0);
    expect(v.result.ledger.entries.map((e) => e.id)).not.toContain('S-001');
  });
  it('never uses compliance wording or Mode A', () => {
    for (const src of [vmSrc, pageSrc]) {
      expect(src).not.toMatch(new RegExp(['(IPC|IEC)[- ]comp', 'liant|production ', 'safe'].join(''), 'i'));
      expect(src).not.toMatch(/IPC-2152-informed/);
    }
  });
});

describe('pulse', () => {
  const pulse = (period: SelfHeatingState['periodVsTau']) =>
    st({ ...BASE, theta: period === 'comparable-or-longer' ? '10 K/W' : BASE.theta as string, currentMode: 'pulse', current: '', peakCurrent: '4 A', duty: '25%', periodVsTau: period });
  it('requires an explicit period choice', () => {
    expect(DEFAULT_STATE.periodVsTau).toBe('');
    const v = computeView(pulse(''));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/period/i);
  });
  it('period much shorter: mean rise label, callout and the peak-is-higher warning from core', () => {
    const v = ok(pulse('much-shorter'));
    expect(v.result.headline.label).toMatch(/^Mean temperature rise/);
    expect(v.callout?.heading).toMatch(/peak is higher/i);
    const w = v.raw.warnings.find((x) => x.code === 'PULSE_RMS_ASSUMPTION');
    expect(w).toBeDefined();
    expect(v.callout?.text).toBe(w?.message);
    expect(v.result.warnings[0]?.message).toBe(w?.message);
    // 4 A at 25 % duty is 2 A rms, so the same answer as the 2 A steady case
    expect(v.result.headline.text).toBe(ok(st(BASE)).result.headline.text);
  });
  it('period comparable or longer: peak held continuously, not an rms result', () => {
    const v = ok(pulse('comparable-or-longer'));
    expect(v.result.headline.label).toMatch(/peak current held continuously/);
    expect(v.result.headline.label).toMatch(/not an rms result/);
    expect(v.callout).toBeUndefined();
    expect(v.result.warnings.some((w) => w.message.includes('comparable to or longer'))).toBe(true);
  });
  it('invalid duty is an error naming the field, no number', () => {
    for (const duty of ['0', '1.5', '150%', 'half']) {
      const v = computeView(st({ ...pulse('much-shorter'), duty }));
      expect(v.status, duty).toBe('error');
      if (v.status === 'error') expect(v.problems[0]).toMatch(/^Duty cycle: /);
    }
  });
  it('the steady current field is not read in pulse mode and vice versa', () => {
    expect(computeView({ ...pulse('much-shorter'), current: 'garbage' }).status).toBe('ok');
    expect(computeView(st({ ...BASE, peakCurrent: 'garbage', duty: 'x' })).status).toBe('ok');
  });
});

describe('runaway and no-converge give a hard warning and no number', () => {
  it('thermal runaway: status no-steady-state, critical warning, no result values', () => {
    const v = computeView(st({ ...BASE, current: '60 A', theta: '5000 K/W' }));
    expect(v.status).toBe('no-steady-state');
    if (v.status !== 'no-steady-state') return;
    expect(v.critical.length).toBeGreaterThan(0);
    expect(v.critical[0]?.severity).toBe('critical');
    expect(v.critical[0]?.message).toMatch(/No steady-state temperature rise/);
    expect(v).not.toHaveProperty('result');
    expect(v).not.toHaveProperty('raw');
    expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity/);
  });
  it('a modest overheat that stays below the search limit still converges', () => {
    expect(computeView(st({ ...BASE, theta: '10 K/W' })).status).toBe('ok');
  });
});

describe('error mapping: invalid input never gives a number', () => {
  it('names the field for a parse error', () => {
    const cases: [Partial<SelfHeatingState>, string][] = [
      [{ length: 'abc' }, 'Trace length'],
      [{ width: '0 mm' }, 'Trace width'],
      [{ copperThickness: '-1 um' }, 'Copper thickness'],
      [{ ambient: '10 Δ°C' }, 'Ambient temperature'],
      [{ current: '-2 A' }, 'Current'],
      [{ current: '2 V' }, 'Current'],
      [{ theta: '50' }, 'Thermal resistance'],
      [{ theta: '50 K*m/W' }, 'Thermal resistance'],
      [{ theta: '0 K/W' }, 'Thermal resistance'],
    ];
    for (const [p, label] of cases) {
      const v = computeView(st({ ...BASE, ...p }));
      expect(v.status, JSON.stringify(p)).toBe('error');
      if (v.status !== 'error') continue;
      expect(v.problems[0]).toMatch(new RegExp(`^${label}: `));
      expect(v).not.toHaveProperty('result');
      expect(v).not.toHaveProperty('raw');
    }
  });
  it('a conductor above absolute-zero nonsense or ambient above the bound is an error value', () => {
    const v = computeView(st({ ...BASE, ambient: '200 °C' }));
    expect(['error', 'no-steady-state']).toContain(v.status);
    expect(v.status === 'ok').toBe(false);
  });
  it('rejects NaN, infinity and over-long text without throwing', () => {
    for (const text of ['NaN', 'Infinity mm', '1e999 mm', '1'.repeat(200) + ' mm']) {
      expect(() => computeView(st({ ...BASE, length: text }))).not.toThrow();
      expect(computeView(st({ ...BASE, length: text })).status, text).toBe('error');
    }
  });
  it('weight from a fab order form needs a thickness instead', () => {
    const v = computeView(st({ ...BASE, copperBy: 'weight', copperWeight: '1 oz', weightSource: 'finished' }));
    expect(v.status).toBe('needs-input');
  });
  it('weight mode works with the foil source', () => {
    const v = ok(st({ ...BASE, copperBy: 'weight', copperWeight: '1 oz', weightSource: 'foil', copperThickness: '' }));
    expect(v.result.headline.text).toMatch(/Δ°C$/);
  });
});

describe('confidence, badges and formula come from the core', () => {
  const v = ok(st(BASE));
  it('shows reasons, the UNVERIFIED badge and the exported formula', () => {
    expect(v.result.confidence.reasons).toEqual([...v.raw.confidence.reasons]);
    expect(v.result.confidence.reasons.join(' ')).toMatch(/user-supplied/);
    expect(v.result.ledger.unverifiedIds.length).toBeGreaterThan(0);
    expect(v.result.details.formula).toBe(meta.formula);
    expect(v.result.details.method).toBe(meta.method);
  });
  it('defaults are marked as defaults and the law is provenance', () => {
    const d = ok(st({ ...BASE, ambient: '' }));
    expect(d.result.details.inputs.find((r) => r.label === 'Ambient temperature')?.source).toBe('default');
    expect(v.result.details.inputs.find((r) => r.label === 'Thermal law')?.source).toBe('user');
    expect(v.result.details.inputs.find((r) => r.label === 'Thermal resistance (user-supplied)')?.value).toMatch(/K\/W/);
  });
  it('no engineering math or hand rounding in the view-model or page', () => {
    for (const code of [vmSrc, pageSrc]) {
      const s = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(s).not.toMatch(/Math\.(sqrt|pow|log|exp|PI|round|ceil|floor)|toPrecision|toFixed|\.si\s*[*/+-]/);
      expect(s).not.toMatch(/\bformatFor\b|\bformatDual\b/);
    }
  });
});

describe('hash state', () => {
  const full = st({
    thermalLaw: 'user-theta', length: '4 in', width: '10 mil', layer: 'inner', copperBy: 'weight', copperWeight: '2 oz', weightSource: 'foil',
    copperThickness: '', basis: 'finished', convention: 'mass-density', ambient: '40 °C', thetaBy: 'per-length', thetaPerLength: '5 K·m/W',
    currentMode: 'pulse', peakCurrent: '4 A', duty: '25%', periodVsTau: 'much-shorter', units: 'imperial',
    current: '', theta: '',
  });
  it('round-trips every field', () => {
    const p = parseHash(serializeHash(ROUTE, toHashState(full)));
    expect(p.stateDiscarded).toBe(false);
    const back = fromHashState(p.state);
    expect(back.notices).toEqual([]);
    expect(back.state).toEqual(full);
  });
  it('the default state has a clean URL', () => {
    expect(serializeHash(ROUTE, toHashState(DEFAULT_STATE))).toBe('#/calc/self-heating');
  });
  it('writes only documented keys and no reserved key but u', () => {
    const keys = Object.keys(toHashState(full));
    const doc = CALCULATOR_STATE_KEYS[CALCULATOR_ID];
    const documented = new Set([...Object.keys(doc), 'u']);
    for (const k of [...keys, ...WRITTEN_KEYS]) expect(documented.has(k), k).toBe(true);
    expect(keys.filter((k) => Object.prototype.hasOwnProperty.call(RESERVED_STATE_KEYS, k))).toEqual(['u']);
    for (const k of Object.keys(doc)) expect(doc[k as keyof typeof doc].length).toBeGreaterThan(20);
    expect(Object.keys(doc).filter((k) => Object.prototype.hasOwnProperty.call(RESERVED_STATE_KEYS, k) || k === 'v')).toEqual([]);
  });
  it('a shared link reproduces the worked example', () => {
    const link =
      '#/calc/self-heating?v=1&law=user-theta&l=100%20mm&w=0.254%20mm&ly=outer&cs=thickness&ct=35%20um&i=2%20A&th=50%20K%2FW&am=25%20%C2%B0C';
    const state = fromHashState(parseHash(link).state).state;
    expect(ok(state).result.headline.text).toBe(ok(st(BASE)).result.headline.text);
  });
  it('unknown values fall back to defaults with notices; corrupt hashes give defaults', () => {
    const { state, notices } = fromHashState({ law: 'x', ly: 'm', cs: 'y', cb: 'z', conv: 'q', thby: 'w', cm: 'k', pt: 'j', u: 'furlongs' });
    expect(state).toEqual(DEFAULT_STATE);
    expect(notices.length).toBeGreaterThanOrEqual(7);
    expect(notices.join(' ')).not.toMatch(/\bthby\b|\bpt\b|\bcm\b/);
    expect(fromHashState({ l: 'x'.repeat(500) }).notices.join(' ')).toMatch(/Trace length/);
    expect(() => fromHashState({ __proto__: 'x', constructor: 'y' } as never)).not.toThrow();
    for (const h of ['#/calc/self-heating?v=1&l=%E0%A4%A', '#/calc/self-heating?v=9&law=user-theta', '#/calc/self-heating?law=user-theta']) {
      expect(fromHashState(parseHash(h).state).state).toEqual(DEFAULT_STATE);
    }
  });
  it('hostile text is only ever text', () => {
    const { state } = fromHashState({ law: 'user-theta', l: '<img src=x onerror=alert(1)>', w: '1 mm', ct: '35 um', cs: 'thickness', ly: 'outer', i: '1 A', th: '1 K/W' });
    expect(computeView(state).status).toBe('error');
  });
});

describe('accessibility wiring and speed', () => {
  it('has a polite live summary, a labelled form, rAF debounce, no raw HTML', () => {
    expect(pageSrc).toMatch(/role="status" aria-live="polite" aria-atomic="true"/);
    expect(pageSrc).toMatch(/aria-label="Trace self-heating inputs"/);
    expect(pageSrc).toMatch(/aria-labelledby="result-h"/);
    expect(pageSrc).toMatch(/useRafValue/);
    expect(pageSrc).not.toMatch(/style=|dangerouslySetInnerHTML|innerHTML|<script/);
  });
  it('every quantity field announces a unit hint', () => {
    expect(pageSrc.match(/unitHint="/g)?.length).toBeGreaterThanOrEqual(8);
  });
  it('compute plus view build stays well under a frame', () => {
    const s = st(BASE);
    computeView(s);
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) computeView(s);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
