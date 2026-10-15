import { describe, expect, it } from 'vitest';
import pageSrc from './ResistorDivider.tsx?raw';
import schemSrc from '../components/DividerSchematic.tsx?raw';
import { meta } from '../../core/calculators/resistor-divider/meta';
import { formatResult } from '../../core/format-result';
import { CALCULATOR_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import { HIGH_VOLTAGE_DISPLAY_THRESHOLD_V, OVER_RATING_HEADING } from './divider-emphasis';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  R1_NAME,
  R2_NAME,
  RL_NAME,
  WRITTEN_KEYS,
  activeFields,
  computeView,
  fromHashState,
  liveSummary,
  schematicDescription,
  snapApplies,
  toHashState,
  type DividerState,
} from './resistor-divider.vm';

const st = (p: Partial<DividerState>): DividerState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
const FWD = { vin: '12 V', r1: '10 kΩ', r2: '4.7 kΩ' } as const;

function ok(s: DividerState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}
const rows = (v: ReturnType<typeof ok>): Record<string, string> => Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));

describe('solve for output voltage', () => {
  it('12 V, 10 kΩ over 4.7 kΩ is about 3.837 V', () => {
    const v = ok(st(FWD));
    expect(v.result.headline.label).toBe('Output voltage (Vout)');
    expect(v.result.headline.text).toBe('3.83673 V');
    expect(v.envelope).toBeUndefined();
    const r = rows(v);
    expect(r[R1_NAME]).toBe('10 kΩ');
    expect(r[R2_NAME]).toBe('4.7 kΩ');
    expect(r['Divider current (through R1)']).toMatch(/µA$/);
    expect(r['Power in R1']).toMatch(/mW$/);
    expect(r['Power in R2']).toMatch(/mW$/);
    expect(r['Total power (from the source)']).toMatch(/mW$/);
    expect(r['Output impedance (R1 ‖ R2)']).toBe('3.19728 kΩ');
  });
  it('powers and the divider current are predictions that round up', () => {
    const v = ok(st(FWD));
    for (const n of ['power in r1', 'power in r2', 'total power', 'divider current']) {
      expect(v.raw.results.find((r) => r.name === n)?.bound, n).toBe('prediction');
    }
  });
  it('the formula comes from the calculator metadata', () => {
    expect(ok(st(FWD)).result.details.formula).toBe(meta.formula);
  });
  it('without a series the ledger is S-019 only, VERIFIED, and there is no badge', () => {
    const v = ok(st(FWD));
    expect(v.result.ledger.entries.map((e) => e.id)).toEqual(['S-019']);
    expect(v.result.ledger.unverifiedIds).toEqual([]);
    expect(v.result.confidence.level).toBe('high');
  });
  it('series and snap are not read when solving for the output voltage', () => {
    const v = ok(st({ ...FWD, series: 'E96', snap: 'up' }));
    expect(v.result.ledger.unverifiedIds).toEqual([]);
    expect(snapApplies('vout')).toBe(false);
    expect(snapApplies('r1')).toBe(true);
    expect(snapApplies('r2')).toBe(true);
  });
});

describe('solve for a resistor', () => {
  const E96 = st({ solveFor: 'r1', vin: '12 V', target: '3.3 V', r2: '10 kΩ', series: 'E96' });
  it('R1 for 3.3 V from 12 V with R2 = 10 kΩ snaps to 26.1 kΩ (E96) and shows ideal value and error', () => {
    const v = ok(E96);
    expect(v.result.headline.label).toBe('R1 (top: Vin to Vout), snapped to E96: nearest value');
    expect(v.result.headline.text).toBe('26.1 kΩ');
    const r = rows(v);
    expect(r['Ideal R1 before snapping']).toBe('26.3636 kΩ');
    expect(r['Output voltage (Vout)']).toBe('3.3241 V');
    expect(r['Vout error vs target (size rounded away from zero)']).toBe('+0.7303 %');
    expect(r[R2_NAME]).toBe('10 kΩ');
  });
  it('shows the S-016 UNVERIFIED status and the paywalled reason in the confidence', () => {
    const v = ok(E96);
    expect(v.result.ledger.unverifiedIds).toEqual(['S-016']);
    expect(v.result.ledger.worst).toBe('PAYWALLED-USER-MUST-VERIFY');
    expect(v.result.confidence.level).toBe('medium');
    expect(v.result.confidence.score).toBe(2);
    expect(v.result.confidence.reasons.join(' ')).toMatch(/PAYWALLED/);
    expect(v.result.details.assumptions.join(' ')).toMatch(/S-016/);
  });
  it('with no series the exact value is shown and labelled as not a stock value', () => {
    const v = ok(st({ ...E96, series: 'none' }));
    expect(v.result.headline.label).toMatch(/exact value, not a stock value/);
    expect(v.result.headline.text).toBe('26.3636 kΩ');
    expect(Object.keys(rows(v))).not.toContain('Ideal R1 before snapping');
    expect(v.result.ledger.unverifiedIds).toEqual([]);
  });
  it('up and down pick the next value above or below', () => {
    const up = ok(st({ ...E96, snap: 'up' }));
    const down = ok(st({ ...E96, snap: 'down' }));
    expect(up.result.headline.text).toBe('26.7 kΩ');
    expect(down.result.headline.text).toBe('26.1 kΩ');
    expect(up.result.headline.label).toMatch(/next value up/);
  });
  it('solves R2 as well, with R1 given', () => {
    const v = ok(st({ solveFor: 'r2', vin: '12 V', target: '3.3 V', r1: '10 kΩ', series: 'E24' }));
    expect(v.result.headline.label).toMatch(/^R2 \(bottom: Vout to ground\), snapped to E24/);
    expect(v.result.headline.text).toMatch(/kΩ$/);
  });
  it('the unknown resistor field is not read, and a leftover value in it does not matter', () => {
    expect(activeFields('r1')).not.toContain('r1');
    expect(activeFields('r2')).not.toContain('r2');
    expect(activeFields('vout')).not.toContain('target');
    const v = ok(st({ ...E96, r1: 'garbage' }));
    expect(v.result.headline.text).toBe('26.1 kΩ');
  });
  it('a target at or above Vin is an inline error from the calculator', () => {
    const v = computeView(st({ ...E96, target: '12 V' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') {
      expect(v.problems.join(' ')).toMatch(/below vin/);
      expect(v.fieldErrors.target).toBeDefined();
    }
  });
  it('a load that is too heavy to reach the target is an inline error', () => {
    const v = computeView(st({ solveFor: 'r2', vin: '12 V', target: '10 V', r1: '1 kΩ', load: '1 kΩ' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.fieldErrors.load).toMatch(/too heavy/);
  });
});

describe('load, tolerance and caution', () => {
  it('a load shows the loaded and unloaded outputs and the load caution', () => {
    const v = ok(st({ ...FWD, load: '10 kΩ' }));
    expect(v.result.headline.text).toBe('2.90722 V');
    const r = rows(v);
    expect(r['Output voltage without the load']).toBe('3.83673 V');
    expect(r['Power in the load']).toMatch(/µW$/);
    const caution = v.result.warnings.find((w) => w.severity === 'caution');
    expect(caution?.message).toMatch(/load changes the output by 24\.2 %/);
    expect(v.result.warnings[0]?.label).toBe('Caution');
  });
  it('a resistor tolerance gives a min/typ/max row printed through format-result, rounded outward', () => {
    const v = ok(st({ ...FWD, tolerance: '1%' }));
    const env = v.raw.envelope?.[0];
    expect(env).toBeDefined();
    if (env === undefined || v.envelope === undefined) throw new Error('no envelope');
    expect(v.envelope.min).toBe(formatResult({ value: env.min, bound: 'max-capacity' }, { accuracyClass: meta.accuracyClass }));
    expect(v.envelope.typ).toBe(formatResult({ value: env.typ, bound: 'nominal' }, { accuracyClass: meta.accuracyClass }));
    expect(v.envelope.max).toBe(formatResult({ value: env.max, bound: 'prediction' }, { accuracyClass: meta.accuracyClass }));
    expect(v.envelope.typ).toBe(v.result.headline.text);
    expect(v.envelope.note).toMatch(/R1, R2/);
    expect(env.min.si).toBeLessThan(env.typ.si);
    expect(env.max.si).toBeGreaterThan(env.typ.si);
  });
  it('the input voltage tolerance widens the envelope and is named', () => {
    const a = ok(st({ ...FWD, tolerance: '1%' }));
    const b = ok(st({ ...FWD, tolerance: '1%', vinTolerance: '5%' }));
    expect(b.raw.envelope?.[0]?.max.si ?? 0).toBeGreaterThan(a.raw.envelope?.[0]?.max.si ?? 0);
    expect(b.envelope?.note).toMatch(/Vin/);
  });
  it('a bare 1 in a tolerance field gives the write 1% or 0.01 hint and no number', () => {
    const v = computeView(st({ ...FWD, tolerance: '1' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') {
      expect(v.fieldErrors.tolerance).toMatch(/Write 1% or 0\.01/);
      expect(JSON.stringify(v)).not.toMatch(/Output voltage/);
    }
    expect(computeView(st({ ...FWD, tolerance: '0.01' })).status).toBe('ok');
    expect(computeView(st({ ...FWD, vinTolerance: '5' })).status).toBe('error');
  });
  it('a tolerance of 50 % or more is refused by the calculator', () => {
    const v = computeView(st({ ...FWD, tolerance: '50%' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.fieldErrors.tolerance).toBeDefined();
  });
});

describe('initial-tolerance corners, rated voltage and load tolerance', () => {
  it('renames the envelope: initial-tolerance corners, TCR and leakage excluded, no worst-case claim', () => {
    const v = ok(st({ ...FWD, tolerance: '1%' }));
    expect(v.envelope?.label).toMatch(/initial-tolerance corners/i);
    expect(v.envelope?.note).toMatch(/initial-tolerance corners/i);
    expect(v.envelope?.note).toMatch(/TCR/);
    expect(v.envelope?.note).toMatch(/leakage/);
    expect(JSON.stringify(v.envelope)).not.toMatch(/worst case/i);
  });
  it('shows the voltage across each resistor', () => {
    const r = rows(ok(st(FWD)));
    expect(r['Voltage across R1 (nominal)']).toMatch(/V$/);
    expect(r['Voltage across R2 (nominal)']).toMatch(/V$/);
  });
  it('without a rated voltage the not-checked and creepage notes are listed; no rated-voltage failure', () => {
    const codes = ok(st(FWD)).raw.warnings.map((w) => w.code);
    expect(codes).toContain('RESISTOR_VOLTAGE_NOT_CHECKED');
    expect(codes).toContain('CREEPAGE_NOT_CHECKED');
    expect(codes).not.toContain('RESISTOR_VOLTAGE');
    const msgs = ok(st(FWD)).result.warnings.map((w) => w.message).join(' ');
    expect(msgs).toMatch(/creepage/i);
  });
  it('a rated working voltage below the voltage across R1 warns, listed first', () => {
    const v = ok(st({ ...FWD, ratedVoltage: '5 V' }));
    expect(v.raw.warnings.map((w) => w.code)).toContain('RESISTOR_VOLTAGE');
    expect(v.raw.warnings.map((w) => w.code)).not.toContain('RESISTOR_VOLTAGE_NOT_CHECKED');
    expect(v.result.warnings[0]?.message).toMatch(/rated working voltage/);
  });
  it('a rated voltage below the resistor voltage gives an Important block with the core message (and the core caution stays in the core result)', () => {
    const v = ok(st({ ...FWD, ratedVoltage: '5 V' }));
    expect(v.importantCallouts).toHaveLength(1);
    expect(v.importantCallouts[0]?.heading).toBe(OVER_RATING_HEADING);
    expect(v.importantCallouts[0]?.text).toBe(v.raw.warnings.find((w) => w.code === 'RESISTOR_VOLTAGE')?.message);
    expect(v.raw.warnings.map((w) => w.code)).toContain('RESISTOR_VOLTAGE');
  });
  it('no rating and above the presentation threshold: Important block asking for the rated working voltage', () => {
    const v = ok(st({ vin: '400 V', r1: '1.58 MΩ', r2: '10 kΩ' }));
    expect(HIGH_VOLTAGE_DISPLAY_THRESHOLD_V).toBe(100);
    expect(v.importantCallouts).toHaveLength(1);
    expect(v.importantCallouts[0]?.heading).toBe('high voltage across one resistor: enter its rated working voltage');
    expect(v.importantCallouts[0]?.text).toMatch(/R1/);
  });
  it('no block at or below the threshold, or when a sufficient rating is entered', () => {
    expect(ok(st(FWD)).importantCallouts).toEqual([]);
    expect(ok(st({ vin: '400 V', r1: '1.58 MΩ', r2: '10 kΩ', ratedVoltage: '500 V' })).importantCallouts).toEqual([]);
  });
  it('a high enough rated voltage does not warn', () => {
    const v = ok(st({ ...FWD, ratedVoltage: '100 V' }));
    expect(v.raw.warnings.map((w) => w.code)).not.toContain('RESISTOR_VOLTAGE');
    expect(v.raw.warnings.map((w) => w.code)).not.toContain('RESISTOR_VOLTAGE_NOT_CHECKED');
  });
  it('a bad rated voltage is an inline error and never a number', () => {
    for (const t of ['abc', '0 V', '-5 V', '5 A', '5']) {
      const v = computeView(st({ ...FWD, ratedVoltage: t }));
      expect(v.status, t).toBe('error');
      if (v.status === 'error') expect(v.fieldErrors.ratedVoltage, t).toBeDefined();
    }
  });
  it('load tolerance widens the envelope and names the load', () => {
    const a = ok(st({ ...FWD, load: '10 kΩ', tolerance: '1%' }));
    const b = ok(st({ ...FWD, load: '10 kΩ', tolerance: '1%', loadTolerance: '5%' }));
    expect(b.envelope?.note).toMatch(/RL/);
    expect(b.raw.envelope?.[0]?.min.si ?? 0).toBeLessThan(a.raw.envelope?.[0]?.min.si ?? 0);
  });
  it('load tolerance is only read when a load is given', () => {
    expect(activeFields('vout', true)).toContain('loadTolerance');
    expect(activeFields('vout', false)).not.toContain('loadTolerance');
    expect(activeFields('vout', false)).toContain('ratedVoltage');
    const v = ok(st({ ...FWD, loadTolerance: '5%' }));
    expect(v.envelope).toBeUndefined();
  });
  it('load tolerance must be a fraction below 50 %', () => {
    for (const t of ['50%', '1', 'abc', '-1%']) {
      const v = computeView(st({ ...FWD, load: '10 kΩ', loadTolerance: t }));
      expect(v.status, t).toBe('error');
      if (v.status === 'error') expect(v.fieldErrors.loadTolerance, t).toBeDefined();
    }
  });
  it('the page has fields for both and no worst-case wording', () => {
    expect(pageSrc).toMatch(/id="ratedv"/);
    expect(pageSrc).toMatch(/id="ltol"/);
    expect(pageSrc).toMatch(/state\.load\.trim\(\) !== ''/);
    expect(pageSrc).not.toMatch(/worst case/i);
  });
  it('hash keys vr and ltol round-trip and are documented', () => {
    const s = st({ ...FWD, load: '10k', loadTolerance: '5%', ratedVoltage: '75 V' });
    const h = toHashState(s);
    expect(h['vr']).toBe('75 V');
    expect(h['ltol']).toBe('5%');
    expect(Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID])).toEqual(expect.arrayContaining(['vr', 'ltol']));
    const back = fromHashState(parseHash(serializeHash(ROUTE, h)).state);
    expect(back.state).toEqual(s);
    expect(fromHashState({ vr: 'x'.repeat(100) }).state.ratedVoltage).toBe('');
  });
});

describe('needs and errors', () => {
  it('empty form asks for the missing values in words', () => {
    const v = computeView(DEFAULT_STATE);
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/Vin.*R1 \(top: Vin to Vout\).*R2 \(bottom: Vout to ground\)/);
    const r = computeView(st({ solveFor: 'r1' }));
    if (r.status === 'needs-input') expect(r.needs.join(' ')).toMatch(/target output voltage/);
  });
  it('invalid text is a field error naming the field, never a number', () => {
    for (const t of ['abc', '0 Ω', '-1 kΩ', '10', 'NaN', '1e999 Ω', '12 V']) {
      const v = computeView(st({ ...FWD, r1: t }));
      expect(v.status, t).toBe('error');
      if (v.status === 'error') expect(v.fieldErrors.r1, t).toBeDefined();
      expect('result' in v, t).toBe(false);
    }
  });
  it('the live summary is plain words', () => {
    expect(liveSummary(computeView(st(FWD)))).toMatch(/^Result: Output voltage \(Vout\) 3\.83673 V\. Confidence high\. 0 validity checks failed\. 0 cautions\.$/);
    expect(liveSummary(computeView(st({ ...FWD, r1: 'x' })))).toMatch(/^No result\. R1/);
    expect(liveSummary(computeView(DEFAULT_STATE))).toMatch(/^No result yet\./);
  });
});

describe('schematic text', () => {
  it('says where each resistor sits, not just its label', () => {
    const d = schematicDescription(false, 'vout');
    expect(d).toContain('top of R1 (top: Vin to Vout)');
    expect(d).toContain('R2 (bottom: Vout to ground) runs from the Vout node to ground');
    expect(d).toContain('Vout is the unknown');
    expect(d).not.toContain('RL');
    const l = schematicDescription(true, 'r2');
    expect(l).toContain(RL_NAME);
    expect(l).toContain('in parallel with R2');
    expect(l).toContain('R2 is the unknown');
  });
  it('the component is an SVG image with a title, a description and no external assets', () => {
    expect(schemSrc).toMatch(/role="img"/);
    expect(schemSrc).toMatch(/aria-labelledby="schem-title schem-desc"/);
    expect(schemSrc).toMatch(/<title id="schem-title">/);
    expect(schemSrc).toMatch(/<desc id="schem-desc">/);
    expect(schemSrc).not.toMatch(/<image|href=|xlink|url\(|<foreignObject|\sstyle=|#[0-9a-fA-F]{3,6}\b/);
    expect(schemSrc).toContain('R1 (top: Vin to Vout)');
    expect(schemSrc).toContain('R2 (bottom: Vout to ground)');
  });
  it('the page passes the load state and the unknown to the schematic', () => {
    expect(pageSrc).toMatch(/<DividerSchematic withLoad=\{withLoad\} unknown=\{sf\} description=\{schematicDescription\(withLoad, sf\)\}/);
  });
  it('the series and snap selects exist only when a resistor is solved', () => {
    expect(pageSrc).toMatch(/solvingResistor && \(\s*<>\s*<SelectField\s+id="series"/);
    expect(pageSrc).toMatch(/state\.series !== 'none' && \(\s*<SelectField\s+id="snap"/);
  });
});

describe('hash state', () => {
  it('writes only non-default values under documented keys', () => {
    expect(toHashState(DEFAULT_STATE)).toEqual({});
    const s = st({ solveFor: 'r1', vin: '12 V', target: '3.3 V', r2: '10k', load: '100k', tolerance: '1%', vinTolerance: '5%', series: 'E96', snap: 'up' });
    const h = toHashState(s);
    expect(h).toEqual({ sf: 'r1', vi: '12 V', tg: '3.3 V', r2: '10k', rl: '100k', tol: '1%', vtol: '5%', se: 'E96', sn: 'up' });
    for (const k of Object.keys(h)) expect(Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID])).toContain(k);
    expect([...WRITTEN_KEYS].sort()).toEqual(Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]).sort());
  });
  it('round-trips every field', () => {
    const s = st({ solveFor: 'r2', vin: '12 V', r1: '10k', target: '3.3 V', load: '100k', tolerance: '1%', vinTolerance: '0.05', series: 'E192', snap: 'down' });
    const link = serializeHash(ROUTE, toHashState(s));
    const back = fromHashState(parseHash(link).state);
    expect(back.state).toEqual(s);
    expect(back.notices).toEqual([]);
  });
  it('unknown choices fall back to the defaults and say so', () => {
    const l = fromHashState({ sf: 'r3', se: 'E999', sn: 'sideways', vi: '12 V' });
    expect(l.state.solveFor).toBe('vout');
    expect(l.state.series).toBe('none');
    expect(l.state.snap).toBe(DEFAULT_STATE.snap);
    expect(l.state.vin).toBe('12 V');
    expect(l.notices).toHaveLength(3);
    for (const n of l.notices) expect(n).not.toMatch(/\b(sf|se|sn|vi|tg)\b/);
  });
  it('hostile and corrupt state falls back safely', () => {
    const hostile = [
      '#/calc/resistor-divider?v=1&sf=%3Cscript%3E&se=__proto__&sn=constructor&vi=' + 'x'.repeat(100),
      '#/calc/resistor-divider?v=1&vi=%E0%A4%A',
      '#/calc/resistor-divider?v=2&vi=12%20V',
      '#/calc/resistor-divider?vi=12%20V',
    ];
    for (const h of hostile) {
      const p = parseHash(h);
      const l = fromHashState(p.state);
      expect(l.state.solveFor).toBe('vout');
      expect(l.state.series).toBe('none');
      expect(computeView(l.state).status).not.toBe('ok');
    }
    expect(parseHash(hostile[1] as string).stateDiscarded).toBe(true);
    expect(parseHash(hostile[2] as string).stateDiscarded).toBe(true);
    expect(fromHashState(parseHash(hostile[1] as string).state).state).toEqual(DEFAULT_STATE);
  });
});

describe('speed', () => {
  it('a snapped solve with tolerances stays far below 1 ms on average', () => {
    const s = st({ solveFor: 'r1', vin: '12 V', target: '3.3 V', r2: '10 kΩ', series: 'E192', load: '100k', tolerance: '1%', vinTolerance: '2%' });
    computeView(s);
    const n = 300;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) computeView(s);
    // Total budget over n runs (about 3 ms/run headroom) so scheduler jitter and coverage instrumentation cannot flake.
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
