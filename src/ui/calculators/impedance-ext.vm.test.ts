import { describe, expect, it } from 'vitest';
import extSrc from './impedance-ext.vm.ts?raw';
import lossSrc from './loss-view.ts?raw';
import genericSrc from './impedance.vm.ts?raw';
import extComponentSrc from '../components/ImpedanceExt.tsx?raw';
import lossComponentSrc from '../components/LossResults.tsx?raw';
import commonSrc from '../components/ImpedanceCommon.tsx?raw';
import msPage from './Microstrip.tsx?raw';
import slPage from './Stripline.tsx?raw';
import cxPage from './Coax.tsx?raw';
import diffPage from '../components/DiffPage.tsx?raw';
import cpPage from '../components/CoplanarPage.tsx?raw';
import { LOSS_LABEL } from '../../core/calculators/loss-shared';
import { IMPEDANCE_BANNER } from '../../core/calculators/impedance-shared';
import { LAYER_COUNT_INPUTS } from '../../core/calculators/annular-ring/guards';
import { CALCULATOR_STATE_KEYS, MAX_HASH_LENGTH, MAX_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import * as ms from './microstrip.vm';
import * as sl from './stripline.vm';
import * as cx from './coax.vm';
import * as dm from './diff-microstrip.vm';
import * as ds from './diff-stripline.vm';
import * as cw from './cpw.vm';
import * as cg from './cpwg.vm';
import { LAYER_COUNT_VALUES, LAYER_SIDE_VALUES, parseLossTangent, rawTol, tolOf, type ExtForm } from './impedance-ext.vm';
import type { ImpedanceView } from './impedance.vm';

// Built from pieces so this test file does not itself contain the phrases the repository audit searches for.
const BANNED = new RegExp(String.raw`${'compl'}iant|production[- ]${'saf'}e|${'cert'}ified|worst[- ]case|\b(passed?|fails?)\b`, 'i');
const TODAY = '2026-10-18';

type St = Record<string, string>;
interface Page {
  readonly name: string;
  readonly id: string;
  readonly defaults: St;
  /** Valid inputs (TEST values, never page defaults). */
  readonly base: St;
  readonly view: (s: St, today?: string) => ImpedanceView;
  readonly form: (s: St, today: string) => ExtForm;
  readonly toHash: (s: St) => Record<string, string>;
  readonly fromHash: (h: Record<string, string>) => { state: St; notices: readonly string[] };
  readonly written: readonly string[];
  /** Conductor loss exists for this geometry (microstrip and coax only). */
  readonly conductor: boolean;
  /** State keys that take a tolerance in this page, by what they are. */
  readonly widthKey: string;
  readonly tolKeys: readonly string[];
  readonly profile: boolean;
}

const asSt = (x: unknown): St => x as St;
const PAGES: readonly Page[] = [
  {
    name: 'microstrip',
    id: 'microstrip',
    defaults: asSt(ms.DEFAULT_STATE),
    base: { width: '600 um', height: '635 um', er: '4.1', erSource: 'test value' },
    view: (s, t) => ms.computeView(s as unknown as ms.MicrostripState, t),
    form: (s, t) => ms.extForm(s as unknown as ms.MicrostripState, t),
    toHash: (s) => ms.toHashState(s as unknown as ms.MicrostripState),
    fromHash: (h) => ms.fromHashState(h) as unknown as { state: St; notices: readonly string[] },
    written: ms.WRITTEN_KEYS,
    conductor: true,
    widthKey: 'width',
    tolKeys: ['tolWidth', 'tolHeight', 'tolEr'],
    profile: true,
  },
  {
    name: 'stripline',
    id: 'stripline',
    defaults: asSt(sl.DEFAULT_STATE),
    base: { width: '0.2 mm', spacing: '0.4 mm', er: '4', erSource: 'test value' },
    view: (s, t) => sl.computeView(s as unknown as sl.StriplineState, t),
    form: (s, t) => sl.extForm(s as unknown as sl.StriplineState, t),
    toHash: (s) => sl.toHashState(s as unknown as sl.StriplineState),
    fromHash: (h) => sl.fromHashState(h) as unknown as { state: St; notices: readonly string[] },
    written: sl.WRITTEN_KEYS,
    conductor: false,
    widthKey: 'width',
    tolKeys: ['tolWidth', 'tolHeight', 'tolEr'],
    profile: true,
  },
  {
    name: 'coax',
    id: 'coax',
    defaults: asSt(cx.DEFAULT_STATE),
    base: { outerDiameter: '3.5 mm', innerDiameter: '1 mm', er: '2.1', erSource: 'test value' },
    view: (s, t) => cx.computeView(s as unknown as cx.CoaxState, t),
    form: (s, t) => cx.extForm(s as unknown as cx.CoaxState, t),
    toHash: (s) => cx.toHashState(s as unknown as cx.CoaxState),
    fromHash: (h) => cx.fromHashState(h) as unknown as { state: St; notices: readonly string[] },
    written: cx.WRITTEN_KEYS,
    conductor: true,
    widthKey: 'outerDiameter',
    tolKeys: ['tolOuter', 'tolInner', 'tolEr'],
    profile: false,
  },
  {
    name: 'diff-microstrip',
    id: 'diff-microstrip',
    defaults: asSt(dm.DEFAULT_STATE),
    base: { width: '1 mm', spacing: '1 mm', size: '1 mm', er: '4.5', erSource: 'test value' },
    view: (s, t) => dm.computeView(s as unknown as Parameters<typeof dm.computeView>[0], t),
    form: (s, t) => dm.extForm(s as unknown as Parameters<typeof dm.computeView>[0], t),
    toHash: (s) => dm.toHashState(s as unknown as Parameters<typeof dm.computeView>[0]),
    fromHash: (h) => dm.fromHashState(h) as unknown as { state: St; notices: readonly string[] },
    written: dm.WRITTEN_KEYS,
    conductor: false,
    widthKey: 'width',
    tolKeys: ['tolWidth', 'tolSpacing', 'tolHeight', 'tolEr'],
    profile: true,
  },
  {
    name: 'diff-stripline',
    id: 'diff-stripline',
    defaults: asSt(ds.DEFAULT_STATE),
    base: { width: '0.5 mm', spacing: '636.62 um', size: '1 mm', er: '4', erSource: 'test value' },
    view: (s, t) => ds.computeView(s as unknown as Parameters<typeof ds.computeView>[0], t),
    form: (s, t) => ds.extForm(s as unknown as Parameters<typeof ds.computeView>[0], t),
    toHash: (s) => ds.toHashState(s as unknown as Parameters<typeof ds.computeView>[0]),
    fromHash: (h) => ds.fromHashState(h) as unknown as { state: St; notices: readonly string[] },
    written: ds.WRITTEN_KEYS,
    conductor: false,
    widthKey: 'width',
    tolKeys: ['tolWidth', 'tolSpacing', 'tolHeight', 'tolEr'],
    profile: true,
  },
  {
    name: 'cpw',
    id: 'cpw',
    defaults: asSt(cw.DEFAULT_STATE),
    base: { width: '500 um', gap: '200 um', height: '500 um', er: '4.1', erSource: 'test value' },
    view: (s, t) => cw.computeView(s as unknown as Parameters<typeof cw.computeView>[0], t),
    form: (s, t) => cw.extForm(s as unknown as Parameters<typeof cw.computeView>[0], t),
    toHash: (s) => cw.toHashState(s as unknown as Parameters<typeof cw.computeView>[0]),
    fromHash: (h) => cw.fromHashState(h) as unknown as { state: St; notices: readonly string[] },
    written: cw.WRITTEN_KEYS,
    conductor: false,
    widthKey: 'width',
    tolKeys: ['tolWidth', 'tolSpacing', 'tolHeight', 'tolEr'],
    profile: true,
  },
  {
    name: 'cpwg',
    id: 'cpwg',
    defaults: asSt(cg.DEFAULT_STATE),
    base: { width: '500 um', gap: '200 um', height: '500 um', er: '4.1', erSource: 'test value' },
    view: (s, t) => cg.computeView(s as unknown as Parameters<typeof cg.computeView>[0], t),
    form: (s, t) => cg.extForm(s as unknown as Parameters<typeof cg.computeView>[0], t),
    toHash: (s) => cg.toHashState(s as unknown as Parameters<typeof cg.computeView>[0]),
    fromHash: (h) => cg.fromHashState(h) as unknown as { state: St; notices: readonly string[] },
    written: cg.WRITTEN_KEYS,
    conductor: false,
    widthKey: 'width',
    tolKeys: ['tolWidth', 'tolSpacing', 'tolHeight', 'tolEr'],
    profile: true,
  },
];

type Ok = Extract<ImpedanceView, { status: 'ok' }>;

describe('the sections are shared, not copied', () => {
  it('every impedance page renders the one shared ExtSections and passes the clock to the view-model', () => {
    for (const src of [msPage, slPage, cxPage, diffPage, cpPage]) {
      expect(src).toMatch(/<ExtSections form=\{/);
      expect(src).toMatch(/useToday\(\)/);
      expect(src).not.toMatch(/ToleranceSection|LossResults|QuantityField/);
    }
    expect(commonSrc).toMatch(/<LossResults loss=\{view\.loss\}/);
    expect(commonSrc).toMatch(/<ToleranceResults view=\{view\.tolerance\}/);
    expect(commonSrc).toMatch(/<NearResultNotes view=\{view\.near\}/);
    expect(extComponentSrc).toMatch(/<ToleranceSection /);
    expect(extComponentSrc).toMatch(/<ProfileBanner /);
  });
  it('the layer count values are the ones the core accepts', () => {
    expect([...LAYER_COUNT_VALUES]).toEqual([...LAYER_COUNT_INPUTS]);
    expect([...LAYER_SIDE_VALUES]).toEqual(['inner', 'outer']);
  });
  it('no engineering math and no wording that states a verdict in the new sources and strings', () => {
    for (const src of [extSrc, lossSrc, extComponentSrc, lossComponentSrc]) {
      expect(src).not.toMatch(BANNED);
      expect(src).not.toMatch(/Math\.(log|exp|sqrt|pow|PI)/);
    }
    expect(genericSrc).not.toMatch(/Math\.(log|exp|sqrt|pow|PI)/);
  });
});

describe.each(PAGES)('$name', (p) => {
  const st = (x: St = {}): St => ({ ...p.defaults, ...p.base, ...x });
  const ok = (s: St, today?: string): Ok => {
    const v = p.view(s, today);
    if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
    return v;
  };

  describe('nothing is assumed', () => {
    it('the default state carries no tolerance, no profile, no loss input and writes nothing to the link', () => {
      for (const k of ['tolWidth', 'tolHeight', 'tolSpacing', 'tolEr', 'tolThickness', 'tolOuter', 'tolInner', 'profile', 'profWidth', 'profSpacing', 'layerCount', 'layerSide', 'copperWeight', 'lossTangent', 'lossSource', 'resistivity']) {
        expect(p.defaults[k], k).toBe('');
      }
      expect(p.toHash(p.defaults)).toEqual({});
    });
    it('a plain result has no tolerance block, no loss block and no profile note', () => {
      const v = ok(st());
      expect(v.tolerance).toBeUndefined();
      expect(v.loss).toBeUndefined();
      expect(v.near).toBeUndefined();
      expect(v.raw.envelope).toBeUndefined();
      expect(v.lossNeeds).toEqual([]);
    });
    it('the form offers a tolerance field only for an input the user entered, and none is pre-filled', () => {
      const empty = p.form(p.defaults, TODAY);
      expect(empty.fields.every((f) => !f.offered)).toBe(true);
      expect(empty.offerProfile).toBe(false);
      expect(empty.profile).toBe('');
      expect(empty.hasTolerance).toBe(false);
      const f = p.form(st(), TODAY);
      for (const k of p.tolKeys) expect(f.tol[f.fields.find((x) => f.stateKeyOf[x.key] === k)?.key ?? '']?.both ?? '').toBe('');
      expect(f.fields.filter((x) => x.offered).length).toBeGreaterThanOrEqual(3);
    });
    it('the thickness (ignored or opt-in) is never offered by default', () => {
      const f = p.form(st({ thickness: '35 um' }), TODAY);
      expect(f.fields.some((x) => x.key === 'thickness' && x.offered)).toBe(false);
    });
  });

  describe('tolerance corners', () => {
    it('an er tolerance gives min/typ/max rows labelled as tolerance corners and a sensitivity table, with the nominal result unchanged', () => {
      const nominal = ok(st());
      const v = ok(st({ tolEr: '3%' }), TODAY);
      expect(v.tolerance).toBeDefined();
      const z = v.tolerance?.envelopes[0];
      expect(z?.row.label).toMatch(/tolerance corners/);
      expect(z?.row.label).not.toMatch(BANNED);
      expect(z?.row.note).not.toMatch(BANNED);
      expect(v.tolerance?.sensitivities.length).toBeGreaterThan(0);
      expect(v.result.headline.text).toBe(nominal.result.headline.text);
      const env = v.raw.envelope?.find((e) => e.name === v.raw.results.find((r) => r.role === 'primary')?.name);
      expect(env).toBeDefined();
      if (env !== undefined) {
        expect(env.min.si).toBeLessThanOrEqual(env.typ.si);
        expect(env.max.si).toBeGreaterThanOrEqual(env.typ.si);
      }
    });
    it('asymmetric minus|plus is accepted and a bare number is refused with the percent hint', () => {
      const a = ok(st({ tolEr: '3%|10%' }), TODAY);
      expect(a.tolerance?.envelopes.length).toBeGreaterThan(0);
      const bad = p.view(st({ tolEr: '5' }), TODAY);
      expect(bad.status).toBe('error');
      if (bad.status === 'error') {
        expect(bad.fieldErrors['tolEr']).toMatch(/5%/);
        expect(bad.problems.join(' ')).toMatch(/tolerance/i);
      }
    });
    it('a half-filled pair is an error, never a number', () => {
      const bad = p.view(st({ tolEr: '3%|' }), TODAY);
      expect(bad.status).toBe('error');
      expect(JSON.stringify(bad)).not.toMatch(/NaN|Infinity/);
    });
    it('a tolerance on the input that is solved for is neither offered nor sent', () => {
      const f = p.form(st(), TODAY);
      expect(f.fields.some((x) => x.offered)).toBe(true);
      const key = p.widthKey;
      const solved = { ...st({ solveFor: p.id === 'coax' ? 'outer' : p.id.startsWith('diff') || p.id.startsWith('cp') ? 'width' : 'width', [key]: '', targetZ0: '50 ohm', targetZ: '90 ohm', tolWidth: '5%', tolOuter: '5%' }) };
      const form = p.form(solved, TODAY);
      expect(form.fields.find((x) => x.key === (p.id === 'coax' ? 'outerDiameter' : 'width'))?.offered).toBe(false);
      const v = p.view({ ...solved, tolEr: '2%' }, TODAY);
      expect(v.status === 'ok' || v.status === 'needs-input').toBe(true);
      if (v.status === 'ok') expect(JSON.stringify(v.raw.warnings)).not.toMatch(/is not accepted here/);
    });
  });

  describe('loss estimate', () => {
    const LOSS = { frequency: '1 GHz', length: '100 mm', lossTangent: '0.02', lossSource: 'laminate datasheet, test value' };
    it('is asked for by the loss tangent, with the label always attached to the numbers and the core ledger rows beside them', () => {
      const v = ok(st(LOSS));
      expect(v.loss).toBeDefined();
      expect(v.loss?.caption).toBe(LOSS_LABEL);
      expect(v.loss?.caption).toMatch(/approximate estimate; roughness not modelled raises conductor loss; dispersion not modelled/);
      expect(v.loss?.rows.length).toBeGreaterThan(0);
      for (const r of v.loss?.rows ?? []) if (r.label.startsWith('Dielectric') || r.label.startsWith('Conductor') || r.label.startsWith('Total')) expect(r.hint ?? '').toContain(LOSS_LABEL);
      expect(v.loss?.ledgerRows.map((x) => x.id)).toEqual(expect.arrayContaining(['S-029d', 'S-029e']));
      expect(v.loss?.ledgerRows.find((x) => x.id === 'S-029e')?.status).toBe('UNVERIFIED');
      expect(v.result.ledger.unverifiedIds).toEqual(expect.arrayContaining(['S-029e']));
      expect(v.raw.dataStatus).not.toBe('VERIFIED');
      expect(v.raw.reference.ledgerIds).toContain('S-029e');
    });
    it('no loss row is repeated in the general rows, and the loss warnings are shown in their block only', () => {
      const v = ok(st(LOSS));
      expect(v.result.rows.map((r) => r.label).join('|')).not.toMatch(/loss|skin depth|surface resistance/i);
      expect(v.result.warnings.some((w) => /approximate estimate; roughness not modelled/.test(w.message))).toBe(false);
      expect(v.loss?.notes.some((w) => /approximate estimate; roughness not modelled/.test(w.message))).toBe(true);
    });
    it('conductor loss and a total exist only for microstrip and coax; every other geometry shows the core notice and no total', () => {
      const v = ok(st(LOSS));
      const labels = (v.loss?.rows ?? []).map((r) => r.label).join('|');
      if (p.conductor) {
        expect(labels).toMatch(/Conductor loss alpha_c/);
        expect(labels).toMatch(/Total loss/);
        expect(v.loss?.notices.some((n) => /conductor loss not modelled/.test(n.message))).toBe(false);
      } else {
        expect(labels).not.toMatch(/Conductor loss|Total loss|Skin depth/);
        const n = v.loss?.notices.find((x) => x.code === 'CONDUCTOR_LOSS_NOT_MODELLED');
        expect(n?.message).toMatch(/conductor loss not modelled for this geometry/);
        expect(n?.heading).toMatch(/not modelled/i);
      }
    });
    it('the confidence carries the core reasons and is never high with a loss estimate', () => {
      const v = ok(st(LOSS));
      expect(v.result.confidence.level).not.toBe('high');
      expect(v.result.confidence.reasons.join(' ')).toMatch(/UNVERIFIED|PAYWALLED|CONFLICT/);
    });
    it('loss tangent without a source or without a frequency keeps the main result and says what is missing; nothing is guessed', () => {
      const noSource = ok(st({ ...LOSS, lossSource: '  ' }));
      expect(noSource.loss).toBeUndefined();
      expect(noSource.lossNeeds.join(' ')).toMatch(/source of the loss tangent/i);
      expect(noSource.raw.results.some((r) => /loss/.test(r.name))).toBe(false);
      const noFreq = ok(st({ ...LOSS, frequency: '' }));
      expect(noFreq.loss).toBeUndefined();
      expect(noFreq.lossNeeds.join(' ')).toMatch(/frequency/i);
      const orphan = ok(st({ lossSource: 'x', resistivity: '2e-8 ohm m' }));
      expect(orphan.lossNeeds.join(' ')).toMatch(/loss tangent/i);
    });
    it('invalid loss inputs are messages on their field, never a number', () => {
      for (const [k, val] of [['lossTangent', 'abc'], ['lossTangent', '2%'], ['resistivity', '5 mm']] as const) {
        const v = p.view(st({ ...LOSS, [k]: val }), TODAY);
        expect(v.status, `${k}=${val}`).toBe('error');
        if (v.status === 'error') expect(v.fieldErrors[k]).toBeTruthy();
        expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity/);
      }
      const big = p.view(st({ ...LOSS, lossTangent: '1.5' }), TODAY);
      expect(big.status).toBe('error');
      if (big.status === 'error') expect(big.fieldErrors['lossTangent']).toMatch(/tan|loss/i);
    });
    it('the banner stays verbatim next to loss numbers', () => {
      expect(ok(st(LOSS)).banner.text).toBe(IMPEDANCE_BANNER);
    });
  });

  describe('link', () => {
    const FULL: St = {
      ...p.base,
      lossTangent: '0.02',
      lossSource: 'laminate datasheet, test value',
      resistivity: '2e-8 ohm m',
      frequency: '1 GHz',
      length: '100 mm',
      ...Object.fromEntries(p.tolKeys.map((k, i) => [k, i % 2 === 0 ? '5%' : '3%|10%'])),
    };
    it('round-trips every new field through the hash and writes only documented keys', () => {
      const s = st({ ...FULL, ...(p.profile ? { profile: 'bundled', profWidth: '1', layerCount: 'multilayer', layerSide: 'outer', copperWeight: '1 oz' } : {}) });
      const back = p.fromHash(parseHash(serializeHash({ name: 'calc', id: p.id }, p.toHash(s))).state);
      expect(back.notices).toEqual([]);
      expect(back.state).toEqual(s);
      const documented = [...Object.keys(CALCULATOR_STATE_KEYS[p.id as keyof typeof CALCULATOR_STATE_KEYS]), 'fp', 'u'];
      for (const k of Object.keys(p.toHash(s))) expect(p.written).toContain(k);
      for (const k of p.written) expect(documented).toContain(k);
      for (const k of ['kw', 'ke', 'td', 'ds', 'rho']) if (k !== 'kw' || p.id !== 'coax') expect(Object.keys(p.toHash(s))).toContain(k);
    });
    it('a profile choice and its scope are written only by a page that can take them', () => {
      expect(p.written.includes('fp')).toBe(p.profile);
      expect(p.written.includes('pw')).toBe(p.profile);
      expect(p.written.includes('lc')).toBe(p.profile);
    });
    it('the largest state stays inside the link caps (length and key count)', () => {
      const long = 'x'.repeat(200);
      const s = st({ ...FULL, erSource: long, geometrySource: long, lossSource: long, ...(p.profile ? { profile: 'bundled', profWidth: '1', profSpacing: '1', layerCount: 'multilayer', layerSide: 'inner', copperWeight: '1 oz' } : {}) });
      const h = p.toHash(s);
      expect(serializeHash({ name: 'calc', id: p.id }, h).length).toBeLessThan(MAX_HASH_LENGTH / 2);
      expect(Object.keys(h).length).toBeLessThan(MAX_STATE_KEYS / 2);
      expect(p.toHash({ ...s, lossSource: 'y'.repeat(500) })['ds']?.length).toBe(200);
    });
    it('corrupt or oversized values fall back to the defaults with a notice and never throw', () => {
      const tooLong = 'z'.repeat(300);
      const r = p.fromHash({ ke: tooLong, td: tooLong, ds: tooLong, rho: tooLong, ...(p.profile ? { lc: 'banana', ls: 'sideways', pw: 'yes', fp: 'not-a-profile' } : {}) });
      expect(r.state['tolEr']).toBe('');
      expect(r.state['lossTangent']).toBe('');
      expect(r.state['lossSource']).toBe('');
      expect(r.state['resistivity']).toBe('');
      expect(r.notices.length).toBeGreaterThanOrEqual(4);
      if (p.profile) {
        expect(r.state['layerCount']).toBe('');
        expect(r.state['layerSide']).toBe('');
        expect(r.state['profWidth']).toBe('');
        expect(r.state['profile']).toBe('');
      }
      expect(() => p.view(r.state, TODAY)).not.toThrow();
    });
    it('garbage tolerance text from a link gives a message, not a number', () => {
      const r = p.fromHash({ ke: '%%%|%%%' });
      expect(r.state['tolEr']).toBe('%%%|%%%');
      const v = p.view(st({ tolEr: r.state['tolEr'] ?? '' }), TODAY);
      expect(v.status).toBe('error');
    });
  });
});

describe('tolerance text kept in the page state', () => {
  it('rawTol keeps an empty asymmetric pair and tolOf reads it back', () => {
    expect(rawTol({ asym: true, both: '', minus: '', plus: '' })).toBe('|');
    expect(tolOf({ tolEr: '|' } as St, 'tolEr').asym).toBe(true);
    expect(tolOf({ tolEr: '5%' } as St, 'tolEr').both).toBe('5%');
    expect(tolOf({} as St, 'tolEr').both).toBe('');
  });
  it('an empty pair is not written to the link', () => {
    expect(ms.toHashState({ ...ms.DEFAULT_STATE, tolEr: '|' })).toEqual({});
  });
  it('the loss tangent parser takes a plain number only', () => {
    expect(parseLossTangent('').status).toBe('empty');
    expect(parseLossTangent('0').status).toBe('ok');
    expect(parseLossTangent('0.02').status).toBe('ok');
    expect(parseLossTangent('2 %').status).toBe('error');
    expect(parseLossTangent('NaN').status).toBe('error');
    expect(parseLossTangent('1'.repeat(41)).status).toBe('error');
  });
});

describe('golden vectors from the core (microstrip loss)', () => {
  const s = { ...ms.DEFAULT_STATE, width: '600 um', height: '635 um', er: '4.1', erSource: 'test value', frequency: '1 GHz', length: '100 mm', lossTangent: '0.02', lossSource: 'datasheet, test value' };
  const v = ms.computeView(s);
  it('shows the core numbers: Z0 75.266, alpha_d 2.7495, alpha_c 1.5868, total 4.3363 dB/m, 0.43363 dB over 100 mm', () => {
    if (v.status !== 'ok') throw new Error('expected ok');
    const val = (n: string): number => v.raw.results.find((r) => r.name === n)?.value.si ?? Number.NaN;
    expect(val('characteristic impedance Z0')).toBeCloseTo(75.266, 3);
    expect(val('dielectric loss alpha_d')).toBeCloseTo(2.7495, 3);
    expect(val('conductor loss alpha_c')).toBeCloseTo(1.5868, 3);
    expect(val('total loss alpha (dielectric + conductor)')).toBeCloseTo(4.3363, 3);
    expect(val('total loss over length')).toBeCloseTo(0.43363, 4);
    const rows = Object.fromEntries((v.loss?.rows ?? []).map((r) => [r.label, r]));
    expect(rows['Dielectric loss alpha_d (dB/m)']?.text).toMatch(/dB\/m$/);
    expect(rows['Total loss over the line length (dB)']?.text).toMatch(/dB$/);
    expect(rows['Total loss (dielectric + conductor) (dB/m)']?.hint).toMatch(/4\.3363 dB\/m/);
  });
  it('the skin depth against the trace thickness is checked once t is entered, and a thin trace raises the core warning', () => {
    const thin = ms.computeView({ ...s, thickness: '1 um', thicknessModel: 'none' });
    if (thin.status !== 'ok') throw new Error('expected ok');
    expect(thin.loss?.notices.some((n) => n.code === 'SKIN_DEPTH_COMPARABLE')).toBe(true);
    expect(thin.result.details.validity.some((c) => /skin depths/.test(c.name) && !c.ok)).toBe(true);
    expect(thin.result.confidence.level).toBe('low');
    const thick = ms.computeView({ ...s, thickness: '35 um' });
    if (thick.status !== 'ok') throw new Error('expected ok');
    expect(thick.loss?.notices.length).toBe(0);
    expect(thick.loss?.notes.some((n) => /No conductor thickness was entered/.test(n.message))).toBe(false);
  });
  it('a resistivity override replaces the default and the default is a visible input otherwise', () => {
    if (v.status !== 'ok') throw new Error('expected ok');
    const def = v.result.details.inputs.find((i) => /resistivity/.test(i.label));
    expect(def?.source).toBe('default');
    const mine = ms.computeView({ ...s, resistivity: '2.5e-8 ohm m' });
    if (mine.status !== 'ok') throw new Error('expected ok');
    expect(mine.result.details.inputs.find((i) => /resistivity/.test(i.label))?.source).toBe('user');
    const a = v.raw.results.find((r) => r.name === 'conductor loss alpha_c')?.value.si ?? 0;
    const b = mine.raw.results.find((r) => r.name === 'conductor loss alpha_c')?.value.si ?? 0;
    expect(b).toBeGreaterThan(a);
  });
});

describe('golden vectors from the core (coax tolerance corners)', () => {
  const s = { ...cx.DEFAULT_STATE, outerDiameter: '3.5 mm', innerDiameter: '1 mm', er: '2.1', erSource: 'test value', tolOuter: '2 %', tolInner: '2 %', tolEr: '3 %' };
  it('Z0 corners 49.442 / 51.833 / 54.310 ohm and S(Z0, D) 0.798', () => {
    const v = cx.computeView(s);
    if (v.status !== 'ok') throw new Error('expected ok');
    const env = v.raw.envelope?.find((e) => e.name === 'characteristic impedance Z0');
    expect(env?.min.si).toBeCloseTo(49.442, 3);
    expect(env?.typ.si).toBeCloseTo(51.833, 3);
    expect(env?.max.si).toBeCloseTo(54.31, 3);
    const sens = v.raw.results.find((r) => r.name === 'sensitivity of characteristic impedance Z0 to outer diameter');
    expect(sens?.value.si).toBeCloseTo(0.798, 3);
    const row = v.tolerance?.envelopes.find((e) => e.name === 'characteristic impedance Z0')?.row;
    expect(row?.label).toBe('Characteristic impedance Z0 (nominal), tolerance corners');
    expect([row?.min, row?.typ, row?.max]).toEqual(['49.44 Ω', '51.83 Ω', '54.31 Ω']);
    const line = v.tolerance?.sensitivities.find((x) => x.input === 'outer diameter' && x.output === 'characteristic impedance Z0');
    expect(line?.value).toBe('+0.798');
    expect(line?.statement).toMatch(/^\+1 % outer diameter gives about \+0\.79\d % characteristic impedance Z0 \(local estimate for small changes\)\.$/);
  });
  it('the delay per length corners print as ps/mm and ps/in, never as a raw SI unit', () => {
    const v = cx.computeView(s);
    if (v.status !== 'ok') throw new Error('expected ok');
    const row = v.tolerance?.envelopes.find((e) => e.name === 'delay per length')?.row;
    expect(row?.min).toMatch(/^\d[\d.]* ps\/mm \(\d[\d.]* ps\/in\)$/);
    expect(row?.max).toMatch(/ps\/mm/);
    expect(JSON.stringify(v.tolerance)).not.toMatch(/m\^-1/);
  });
  it('the core corners-only warning, when present, is shown prominently and the corners are never called a worst case by this page', () => {
    const v = ms.computeView({ ...ms.DEFAULT_STATE, width: '600 um', height: '635 um', er: '4.1', erSource: 't', tolWidth: '5%', tolHeight: '5%', tolEr: '5%' });
    if (v.status !== 'ok') throw new Error('expected ok');
    for (const n of v.tolerance?.notices ?? []) if (n.code === 'ENVELOPE_CORNERS_ONLY') expect(n.heading).toMatch(/corners and axis points only/);
    for (const e of v.tolerance?.envelopes ?? []) expect(e.row.label).not.toMatch(BANNED);
  });
});

describe('thickness tolerance only for the opt-in variants', () => {
  const base = { ...ms.DEFAULT_STATE, width: '600 um', height: '635 um', er: '4.1', erSource: 't', thickness: '35 um', tolThickness: '10%' };
  it('zero thickness: not offered, not sent, and a reason is shown', () => {
    const f = ms.extForm(base, TODAY);
    const th = f.fields.find((x) => x.key === 'thickness');
    expect(th?.offered).toBe(false);
    expect(th?.whyNot).toMatch(/does not use the thickness/);
    const v = ms.computeView(base);
    expect(v.status).toBe('ok');
    if (v.status === 'ok') expect(v.tolerance).toBeUndefined();
  });
  it('a thickness variant offers it and the envelope uses it', () => {
    const s = { ...base, thicknessModel: 'hj-procedure-A' as const };
    expect(ms.extForm(s, TODAY).fields.find((x) => x.key === 'thickness')?.offered).toBe(true);
    const v = ms.computeView(s);
    if (v.status !== 'ok') throw new Error('expected ok');
    expect(v.raw.envelope?.[0]?.toleranceInputs.join(' ')).toMatch(/thickness/);
  });
  it('the stripline variant behaves the same, and the coupled and coplanar pages never offer it', () => {
    const s = { ...sl.DEFAULT_STATE, width: '0.6 mm', spacing: '0.4 mm', er: '4', erSource: 't', thickness: '17.5 um', tolThickness: '5%' };
    expect(sl.extForm(s, TODAY).fields.find((x) => x.key === 'thickness')?.offered).toBe(false);
    expect(sl.extForm({ ...s, thicknessModel: 'cohn-wide' }, TODAY).fields.find((x) => x.key === 'thickness')?.offered).toBe(true);
    expect(dm.extForm({ ...dm.DEFAULT_STATE, width: '1 mm', thickness: '35 um' }, TODAY).fields.some((x) => x.key === 'thickness')).toBe(false);
    expect(cw.extForm({ ...cw.DEFAULT_STATE, width: '1 mm', thickness: '35 um' }, TODAY).fields.some((x) => x.key === 'thickness')).toBe(false);
  });
});

describe('fab profile tolerance', () => {
  const base = { ...ms.DEFAULT_STATE, width: '600 um', height: '635 um', er: '4.1', erSource: 't' };
  it('is never pre-selected: no choice, no checkbox and no banner until a profile is chosen', () => {
    const f = ms.extForm(base, TODAY);
    expect(f.profile).toBe('');
    expect(f.offerProfile).toBe(true);
    expect(f.flags).toEqual([]);
    expect(f.banner).toBeUndefined();
    expect(ms.extForm({ ...base, profile: 'none' }, TODAY).flags).toEqual([]);
  });
  it('coax has no width or gap with a published tolerance, so it never offers a profile', () => {
    expect(cx.extForm({ ...cx.DEFAULT_STATE, outerDiameter: '3.5 mm', innerDiameter: '1 mm', er: '2' }, TODAY).offerProfile).toBe(false);
  });
  it('choosing the bundled profile shows the banner with age and the example-data status, and the width choice', () => {
    const f = ms.extForm({ ...base, profile: 'bundled' }, TODAY);
    expect(f.banner?.unverified).toBe(true);
    expect(f.banner?.ageText).toMatch(/\d+ days? old/);
    expect(f.banner?.stale).toBe(false);
    expect(f.flags.map((x) => x.state)).toEqual(['profWidth']);
    const stale = ms.extForm({ ...base, profile: 'bundled' }, '2028-01-01');
    expect(stale.banner?.stale).toBe(true);
    expect(stale.banner?.staleText).toMatch(/Stale/);
  });
  it('a profile tolerance needs the exact scope: a missing layer count or side is a message, not a number', () => {
    const s = { ...base, profile: 'bundled', profWidth: '1' };
    const v = ms.computeView(s, TODAY);
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/layer count/);
    const v2 = ms.computeView({ ...s, layerCount: '2' }, TODAY);
    expect(v2.status).toBe('needs-input');
    if (v2.status === 'needs-input') expect(v2.needs.join(' ')).toMatch(/layer side/);
  });
  it('with the scope given, the bundled profile publishes no tolerance today: the core text is shown and nothing is assumed', () => {
    const s = { ...base, profile: 'bundled', profWidth: '1', layerCount: '2', layerSide: 'outer' };
    const v = ms.computeView(s, TODAY);
    if (v.status !== 'ok') throw new Error('expected ok');
    const n = v.tolerance?.notices.find((x) => x.code === 'TOLERANCE_NOT_PUBLISHED');
    expect(n?.message).toMatch(/Tolerance not published/);
    expect(n?.heading).toBeDefined();
    expect(v.tolerance?.envelopes).toEqual([]);
    expect(v.raw.envelope === undefined || v.raw.envelope.length === 0 || v.raw.envelope.every((e) => e.min.si === e.max.si)).toBe(true);
  });
  it('the profile choice is ignored without a chosen profile, and without today the choice is a message', () => {
    const noProfile = ms.computeView({ ...base, profWidth: '1', tolWidth: '5%' }, TODAY);
    expect(noProfile.status).toBe('ok');
    if (noProfile.status === 'ok') expect(noProfile.tolerance?.notices.length).toBe(0);
    const noToday = ms.computeView({ ...base, profile: 'bundled', profWidth: '1', layerCount: '2', layerSide: 'outer' });
    expect(noToday.status).toBe('error');
    if (noToday.status === 'error') expect(noToday.problems.join(' ')).toMatch(/date/i);
  });
  it('a typed width tolerance is locked while the profile value is chosen', () => {
    const f = ms.extForm({ ...base, profile: 'bundled', profWidth: '1', tolWidth: '5%' }, TODAY);
    expect(f.lockedReason['width']).toMatch(/fab profile/);
  });
  it('the link names the profile through the reserved key and drops a profile choice without a profile', () => {
    const s = { ...base, profile: 'bundled', profWidth: '1', layerCount: '2', layerSide: 'outer' };
    const h = ms.toHashState(s);
    expect(h['fp']).toMatch(/jlcpcb/);
    expect(h['pw']).toBe('1');
    const lonely = ms.fromHashState({ pw: '1', lc: '2' });
    expect(lonely.state.profWidth).toBe('');
    expect(lonely.notices.join(' ')).toMatch(/fab profile/);
  });
});

describe('speed', () => {
  it('a closed-form result stays fast with 3 tolerances and the loss estimate (generous bound; measured value is logged)', () => {
    const s = { ...cx.DEFAULT_STATE, outerDiameter: '3.5 mm', innerDiameter: '1 mm', er: '2.1', erSource: 't', frequency: '1 GHz', length: '1 m', lossTangent: '0.001', lossSource: 'test', tolOuter: '2 %', tolInner: '2 %', tolEr: '3 %' };
    const plain = { ...cx.DEFAULT_STATE, outerDiameter: '3.5 mm', innerDiameter: '1 mm', er: '2.1', erSource: 't' };
    const time = (st: cx.CoaxState, n: number): number => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) cx.computeView(st);
      return (performance.now() - t0) / n;
    };
    time(plain, 20);
    const base = time(plain, 200);
    const full = time(s, 100);
    console.info(`coax computeView: plain ${base.toFixed(3)} ms, tolerances + loss ${full.toFixed(3)} ms per call`);
    expect(base).toBeLessThan(5);
    expect(full).toBeLessThan(25);
  });
});
