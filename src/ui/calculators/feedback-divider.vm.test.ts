import { describe, expect, it } from 'vitest';
import { meta } from '../../core/calculators/feedback-divider/meta';
import { CALCULATOR_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import { runTask } from '../../workers/pair-search.protocol';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  NAMING_TEXT,
  R1_NAME,
  R2_NAME,
  VREF_HELP,
  VREF_PLACEHOLDER,
  WRITTEN_KEYS,
  computeView,
  finishView,
  fromHashState,
  liveSummary,
  mode,
  plan,
  schematicDescription,
  toHashState,
  type FeedbackState,
} from './feedback-divider.vm';

const st = (p: Partial<FeedbackState>): FeedbackState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
const FWD = { vref: '0.8 V', r1: '100 kΩ', r2: '10 kΩ' } as const;
const SNAP = { vref: '0.8 V', vout: '3.3 V', r2: '10 kΩ', series: 'E24', snap: 'nearest' } as const;

function ok(s: FeedbackState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}
const rows = (v: ReturnType<typeof ok>): Record<string, string> => Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));

describe('required choices and Vref have no default', () => {
  it('the default state pre-fills nothing', () => {
    expect(DEFAULT_STATE.vref).toBe('');
    expect(DEFAULT_STATE.vrefSource).toBe('');
    expect(DEFAULT_STATE.snap).toBe('');
    expect(DEFAULT_STATE.biasDirection).toBe('');
    expect(DEFAULT_STATE.series).toBe('none');
  });
  it('the Vref placeholder carries no value and the help says datasheet and source note', () => {
    expect(VREF_PLACEHOLDER).not.toMatch(/\d/);
    expect(VREF_HELP).toMatch(/datasheet/);
    expect(VREF_HELP).toMatch(/source/i);
  });
  it('the empty form asks for Vref using the core message', () => {
    const v = computeView(DEFAULT_STATE);
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/vref is required/);
  });
  it('Vref given but nothing else asks for two of r1, r2, vout with the core message', () => {
    const v = computeView(st({ vref: '0.8 V' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/Give exactly two of r1, r2, vout/);
  });
});

describe('solve for Vout', () => {
  it('Vref 0.8 V, R1 100 kΩ, R2 10 kΩ gives 8.8 V', () => {
    const v = ok(st(FWD));
    expect(mode(st(FWD))).toBe('vout');
    expect(v.result.headline.label).toBe('Output voltage (Vout), solved');
    expect(v.result.headline.text).toBe('8.8 V');
    const r = rows(v);
    expect(r[R1_NAME]).toBe('100 kΩ');
    expect(r[R2_NAME]).toBe('10 kΩ');
    expect(r['Divider current']).toMatch(/µA$/);
    expect(v.pairs).toEqual([]);
    expect(v.envelopes).toEqual([]);
  });
  it('the formula comes from the calculator metadata, the ledger row is S-019 only and VERIFIED, no badge', () => {
    const v = ok(st(FWD));
    expect(v.result.details.formula).toBe(meta.formula);
    expect(v.ledgerRows.map((r) => [r.id, r.status])).toEqual([['S-019', 'VERIFIED']]);
    expect(v.result.ledger.unverifiedIds).toEqual([]);
    expect(v.result.confidence.level).toBe('high');
  });
  it('series and snap are not read when both resistors are given', () => {
    const v = ok(st({ ...FWD, series: 'E24', snap: 'up' }));
    expect(v.result.headline.text).toBe('8.8 V');
    expect(v.ledgerRows.map((r) => r.id)).toEqual(['S-019']);
  });
});

describe('solve for a resistor', () => {
  it('3.3 V from Vref 0.8 V with R2 10 kΩ, E24 nearest: R1 30 kΩ, Vout 3.2 V, signed error through the core formatter', () => {
    const v = ok(st(SNAP));
    expect(v.result.headline.label).toBe('R1 (top: Vout to FB pin), solved, snapped to E24: nearest value');
    expect(v.result.headline.text).toBe('30 kΩ');
    const r = rows(v);
    expect(r['Output voltage (Vout)']).toBe('3.2 V');
    expect(r['Vout error vs target (signed; size rounded away from zero)']).toMatch(/^-3\.0\d+ %$/);
    expect(r['Exact R1 before snapping']).toBe('31.25 kΩ');
  });
  it('shows the ledger rows per row: S-019 VERIFIED and S-016 PAYWALLED, and the UNVERIFIED line', () => {
    const v = ok(st(SNAP));
    expect(v.ledgerRows.map((r) => [r.id, r.status])).toEqual([['S-019', 'VERIFIED'], ['S-016', 'PAYWALLED-USER-MUST-VERIFY']]);
    expect(v.result.ledger.unverifiedIds).toEqual(['S-016']);
  });
  it('without a series the exact value is shown and S-016 is absent', () => {
    const v = ok(st({ ...SNAP, series: 'none', snap: '' }));
    expect(v.result.headline.label).toBe('R1 (top: Vout to FB pin), solved, exact value, not a stock value');
    expect(v.result.headline.text).toBe('31.25 kΩ');
    expect(v.ledgerRows.map((r) => r.id)).toEqual(['S-019']);
  });
  it('R2 can be the solved one', () => {
    const v = ok(st({ vref: '0.8 V', vout: '3.3 V', r1: '31.25 kΩ' }));
    expect(v.result.headline.label).toBe('R2 (bottom: FB pin to ground), solved, exact value, not a stock value');
    expect(v.result.headline.text).toBe('10 kΩ');
  });
  it('with a series chosen the snap direction is required: no number until it is chosen', () => {
    const v = computeView(st({ ...SNAP, snap: '' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/snap direction/i);
    expect(plan(st({ ...SNAP, snap: '' })).kind).toBe('view');
  });
  it('the direction chosen is the one sent: up gives the next value above', () => {
    const v = ok(st({ ...SNAP, snap: 'up' }));
    expect(v.result.headline.label).toMatch(/next value up$/);
    expect(v.result.headline.text).toBe('33 kΩ');
  });
});

describe('best pair search', () => {
  const PAIR = st({ vref: '0.8 V', vout: '3.3 V', series: 'E24' });
  it('Vout alone with a series is a pair search that plans a worker task', () => {
    expect(mode(PAIR)).toBe('pair');
    const p = plan(PAIR);
    expect(p.kind).toBe('search');
    if (p.kind === 'search') {
      expect(p.task.kind).toBe('feedback');
      expect(p.state).toEqual(PAIR);
    }
  });
  it('the worker reply and the synchronous compute give the same view', () => {
    const p = plan(PAIR);
    if (p.kind !== 'search') throw new Error('expected a search plan');
    const reply = structuredClone(runTask(p.task));
    if (reply.kind !== 'feedback') throw new Error('wrong reply');
    const fromWorker = finishView(p.state, reply.outcome);
    const sync = computeView(PAIR);
    expect(fromWorker.status).toBe('ok');
    expect(JSON.stringify(fromWorker, (k, v: unknown) => (k === 'raw' ? undefined : v))).toBe(JSON.stringify(sync, (k, v: unknown) => (k === 'raw' ? undefined : v)));
  });
  it('lists five pairs by default, closest first, each with a signed error; the headline is the best pair', () => {
    const v = ok(PAIR);
    expect(v.pairs).toHaveLength(5);
    expect(v.pairs[0]?.n).toBe(1);
    for (const p of v.pairs) expect(p.error).toMatch(/^[+-]\d|^0 %$/);
    expect(v.result.headline.label).toBe('R1 (top) of the best pair, E24');
    expect(v.result.headline.text).toBe(v.pairs[0]?.r1);
    expect(v.ledgerRows.map((r) => r.id)).toEqual(['S-019', 'S-016']);
    expect(Object.keys(rows(v)).some((l) => /pair \d/i.test(l))).toBe(false);
  });
  it('the number of pairs is honoured and checked by the core', () => {
    expect(ok({ ...PAIR, pairs: '3' }).pairs).toHaveLength(3);
    const v = computeView({ ...PAIR, pairs: '11' });
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(Object.keys(v.fieldErrors)).toContain('pairs');
    const w = computeView({ ...PAIR, pairs: 'x' });
    expect(w.status).toBe('error');
  });
  it('Vout alone without a series says to choose a series, using the core message', () => {
    const v = computeView(st({ vref: '0.8 V', vout: '3.3 V' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/choose a series/);
  });
});

describe('over-specified and invalid input', () => {
  it('three given is an inline error with the core message; an inconsistent set is named', () => {
    const a = computeView(st({ ...FWD, vout: '8.8 V' }));
    expect(a.status).toBe('error');
    if (a.status === 'error') expect(a.problems.join(' ')).toMatch(/over-specified/);
    const b = computeView(st({ ...FWD, vout: '5 V' }));
    if (b.status === 'error') expect(b.problems.join(' ')).toMatch(/inconsistent/);
    else throw new Error('expected error');
  });
  it('a target at or below Vref cannot be reached and is an inline error', () => {
    const v = computeView(st({ vref: '0.8 V', vout: '0.8 V', r2: '10 kΩ' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') {
      expect(v.problems.join(' ')).toMatch(/above vref/);
      expect(Object.keys(v.fieldErrors)).toContain('vout');
    }
  });
  it('wrong dimension, zero, negative and garbage are field errors, never a number', () => {
    for (const [k, bad] of [['vref', '5 A'], ['r1', '0'], ['r2', '-1 kΩ'], ['vout', 'abc'], ['vref', 'NaN'], ['r1', '1e999 Ω'], ['tolerance', '50%'], ['fbBias', '5 V']] as const) {
      const v = computeView(st({ ...FWD, [k]: bad }));
      expect(v.status, `${k} ${bad}`).toBe('error');
      if (v.status === 'error') expect(Object.keys(v.fieldErrors), `${k} ${bad}`).toContain(k);
    }
  });
  it('a control character in the Vref note is refused by the core and shown on the note', () => {
    const v = computeView(st({ ...FWD, vrefSource: 'bad\u0007note' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(Object.keys(v.fieldErrors)).toContain('vrefSource');
  });
});

describe('Vref source note', () => {
  it('is echoed as user-supplied provenance', () => {
    const v = ok(st({ ...FWD, vrefSource: 'LM-X datasheet table 5' }));
    const row = v.result.details.inputs.find((i) => i.label === 'Vref');
    expect(row?.source).toBe('user');
    expect(row?.detail).toMatch(/LM-X datasheet table 5/);
  });
  it('without a note the page says no source note was given', () => {
    const row = ok(st(FWD)).result.details.inputs.find((i) => i.label === 'Vref');
    expect(row?.detail).toMatch(/no source note given/);
  });
});

describe('FB bias current', () => {
  it('a bias current without a direction needs the direction: never defaulted', () => {
    const v = computeView(st({ ...FWD, fbBias: '50 nA' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/direction/i);
  });
  it('a direction without a current is not sent', () => {
    expect(ok(st({ ...FWD, biasDirection: 'into-pin' })).result.headline.text).toBe('8.8 V');
  });
  it('with both: shows the shift, the output with bias, and the ratio', () => {
    const v = ok(st({ ...FWD, fbBias: '50 nA', biasDirection: 'into-pin' }));
    const r = rows(v);
    expect(r['FB bias shift of Vout (signed)']).toMatch(/mV$/);
    expect(r['Output voltage with the FB bias']).toMatch(/V$/);
    expect(r['FB bias shift as a share of Vout (signed)']).toMatch(/^[+-]\d.* %$|^0 %$/);
    expect(r['Divider current / FB bias current']).toMatch(/^\d/);
    const out = ok(st({ ...FWD, fbBias: '50 nA', biasDirection: 'out-of-pin' }));
    expect(rows(out)['FB bias shift of Vout (signed)']).toMatch(/^-/);
  });
});

describe('tolerance envelope', () => {
  it('prints the corners with outward rounding and names the excluded effects', () => {
    const v = ok(st({ ...FWD, tolerance: '1%', vrefTolerance: '1%' }));
    expect(v.envelopes).toHaveLength(1);
    const e = v.envelopes[0];
    expect(e?.label).toBe('Output voltage, initial-tolerance corners');
    expect(e?.typ).toBe('8.8 V');
    expect(e?.note).toMatch(/Temperature coefficient/);
    expect(e?.note).toMatch(/R1, R2, Vref/);
  });
});

describe('solved without FB bias (core notes shown with the values)', () => {
  const BIASED = { vref: '0.8 V', vout: '5 V', r2: '10 kΩ', series: 'E96', snap: 'nearest', fbBias: '1 uA', biasDirection: 'into-pin' } as const;
  it('the solved resistor carries the note, as a headline note', () => {
    const v = ok(st(BIASED));
    expect(v.result.headline.note).toBe('solved without FB bias');
    expect(v.raw.warnings.map((w) => w.code)).toContain('SOLVED_WITHOUT_FB_BIAS');
    expect(v.result.warnings.some((w) => /solved without the FB bias/i.test(w.message))).toBe(true);
  });
  it('the including-bias error row sits right after the ideal error row, with the core notes', () => {
    const v = ok(st(BIASED));
    const labels = v.result.rows.map((r) => r.label);
    const ideal = labels.indexOf('Vout error vs target (signed; size rounded away from zero)');
    expect(ideal).toBeGreaterThanOrEqual(0);
    expect(labels[ideal + 1]).toBe('Vout error vs target including FB bias (signed)');
    expect(v.result.rows[ideal]?.hint).toBe('ideal relation, without FB bias');
    expect(v.result.rows[ideal + 1]?.hint).toMatch(/nominal/);
    expect(v.result.rows[ideal + 1]?.text).toMatch(/^[+-]\d/);
  });
  it('without a bias there is no note and no including-bias row', () => {
    const v = ok(st({ ...BIASED, fbBias: '', biasDirection: '' }));
    expect(v.result.headline.note).toBeUndefined();
    expect(v.result.rows.map((r) => r.label).join('|')).not.toMatch(/including FB bias/);
  });
});

describe('envelope formatting uses the envelope accuracy class (F13)', () => {
  it('meta has envelopeAccuracyClass analytical and the corners print with few significant figures', () => {
    expect(meta.envelopeAccuracyClass).toBe('analytical');
    const v = ok(st({ vref: '0.8 V', r1: '52.3 kΩ', r2: '10 kΩ', tolerance: '1%', vrefTolerance: '1.5%' }));
    const e = v.envelopes[0];
    expect(e).toBeDefined();
    for (const t of [e?.min ?? '', e?.max ?? '']) expect(t.replace(/[^0-9]/g, '').replace(/^0+/, '').length).toBeLessThanOrEqual(5);
  });
});

describe('high voltage callout on the feedback page (presentation only)', () => {
  it('shows an Important block above the display threshold and none below it', () => {
    const hi = ok(st({ vref: '1.2 V', vout: '150 V', r2: '10 kΩ' }));
    expect(hi.importantCallouts).toHaveLength(1);
    expect(hi.importantCallouts[0]?.heading).toMatch(/high voltage across one resistor/);
    expect(ok(st(FWD)).importantCallouts).toEqual([]);
  });
});

describe('naming caveat', () => {
  it('names the top and bottom positions; the core warning is shown first', () => {
    expect(NAMING_TEXT).toMatch(/TOP/);
    expect(NAMING_TEXT).toMatch(/BOTTOM/);
    expect(R1_NAME).toMatch(/top/);
    expect(R2_NAME).toMatch(/bottom/);
    const v = ok(st(FWD));
    expect(v.result.warnings[0]?.message).toMatch(/TOP resistor/);
  });
  it('the schematic text alternative places every part and says what is solved', () => {
    for (const m of ['vout', 'r1', 'r2', 'pair'] as const) {
      const d = schematicDescription(m);
      expect(d).toMatch(/R1/);
      expect(d).toMatch(/R2/);
      expect(d).toMatch(/ground/);
      expect(d).toMatch(/FB/);
    }
    expect(schematicDescription('pair')).toMatch(/pair/);
  });
});

describe('hash state', () => {
  it('round-trips through the real hash', () => {
    const s = st({ ...SNAP, vrefSource: 'datasheet p.5', tolerance: '1%', vrefTolerance: '1%', fbBias: '50 nA', biasDirection: 'out-of-pin', pairs: '4' });
    const h = toHashState(s);
    expect(h).toEqual({ vr: '0.8 V', vs: 'datasheet p.5', vo: '3.3 V', r2: '10 kΩ', se: 'E24', sn: 'nearest', pc: '4', tol: '1%', vtol: '1%', ib: '50 nA', bd: 'out-of-pin' });
    const back = fromHashState(parseHash(serializeHash(ROUTE, h)).state);
    expect(back.notices).toEqual([]);
    expect(back.state).toEqual(s);
  });
  it('a default state writes nothing', () => {
    expect(toHashState(DEFAULT_STATE)).toEqual({});
  });
  it('unknown choices and over-long text fall back with notices and never pre-select', () => {
    const a = fromHashState({ se: 'E5', sn: 'sideways', bd: 'x', vr: 'y'.repeat(41), vs: 'z'.repeat(201) });
    expect(a.state.series).toBe('none');
    expect(a.state.snap).toBe('');
    expect(a.state.biasDirection).toBe('');
    expect(a.state.vref).toBe('');
    expect(a.state.vrefSource).toBe('');
    expect(a.notices).toHaveLength(5);
  });
  it('a link with a pair search state loads', () => {
    const l = fromHashState(parseHash('#/calc/feedback-divider?v=1&vr=0.8%20V&vo=3.3%20V&se=E96').state);
    expect(mode(l.state)).toBe('pair');
  });
  it('written keys are documented', () => {
    expect(Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]).sort()).toEqual([...WRITTEN_KEYS].sort());
  });
});

describe('live summary', () => {
  it('states the outcome in words', () => {
    expect(liveSummary(computeView(DEFAULT_STATE))).toMatch(/^No result yet/);
    expect(liveSummary(computeView(st({ ...FWD, r1: 'x' })))).toMatch(/^No result\./);
    expect(liveSummary(computeView(st(FWD)))).toMatch(/^Result: Output voltage \(Vout\), solved 8\.8 V\./);
  });
});
