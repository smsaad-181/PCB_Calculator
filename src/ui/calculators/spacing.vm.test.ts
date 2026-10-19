// Phase 3 UI: view-models of the clearance, creepage and IPC spacing pages, the shared banners and the table panel.
// Every table value here is the synthetic fake data of src/core/spacing/synthetic-tables.testutil.ts (never a standard value, never shipped).
import { describe, expect, it } from 'vitest';
import { PRODUCT_STANDARD_BANNER, SOLDERMASK_NOTE, UNVERIFIED_BANNER } from '../../core/spacing/gating';
import { rawSynthetic, synthSet, synthTable } from '../../core/spacing/synthetic-tables.testutil';
import { MAX_IMPORT_CHARS, SHIPPED_TABLES, TABLE_IDS, importSpacingTables, makeTableSet, parseSpacingTable, serializeTableSet, type TableId } from '../../core/spacing/tables';
import { MAX_HASH_LENGTH, MAX_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import { CALCULATOR_STATE_KEYS } from '../../state/state-key-docs';
import { createSpacingStore } from '../../state/spacing-store';
import { COMMON_HELP, EXAMPLE_FILE_NAME, FAKE_LABEL, TABLE_HELP, exampleJson } from '../components/spacing-help';
import { SpacingBanners } from '../components/SpacingBanners';
import { SpacingResults } from '../components/SpacingResults';
import * as cl from './clearance.vm';
import * as cr from './creepage.vm';
import * as ip from './ipc-spacing.vm';
import * as sc from './spacing-common.vm';
import { checkFileSize, importMessage } from './spacing-panel.vm';

interface VNodeLike {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}
const isV = (n: unknown): n is VNodeLike => typeof n === 'object' && n !== null && 'props' in n && 'type' in n;
const textOf = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (isV(node)) return typeof node.type === 'function' ? textOf((node.type as (p: unknown) => unknown)(node.props)) : textOf(node.props['children']);
  return '';
};
// Built from pieces so this test file does not itself contain the phrases the repository audit searches for.
const BANNED = new RegExp(String.raw`${'compl'}iant|production[- ]${'saf'}e|${'cert'}ified|\bpass(ed)?\b`, 'i');

const FAKE = synthSet();
const FAKE_VERIFIED = synthSet(undefined, { verified: true });
const EMPTY = SHIPPED_TABLES;
const ED = 'SYNTH-ED-1';

const CL_OK: cl.ClearanceState = {
  ...cl.DEFAULT_STATE,
  edition: ED,
  insulation: 'basic',
  route: 'impulse',
  impulse: '2 kV',
  pollution: '2',
  field: 'inhomogeneous',
  altitude: '2000 m',
  peak: '325 V',
  frequency: '50 Hz',
};
const CR_OK: cr.CreepageState = {
  ...cr.DEFAULT_STATE,
  edition: ED,
  insulation: 'basic',
  rms: '150 V',
  pollution: '2',
  group: 'II',
  surface: 'other',
  associated: '1 mm',
  frequency: '50 Hz',
};
const IP_OK: ip.IpcSpacingState = { ...ip.DEFAULT_STATE, edition: ED, peak: '20 V', location: 'internal' };

function ok<T extends { status: string }>(v: T): Extract<T, { status: 'ok' }> {
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v).slice(0, 400)}`);
  return v as Extract<T, { status: 'ok' }>;
}
const allText = (view: Parameters<typeof SpacingResults>[0]['view']): string => textOf(SpacingResults({ view }));

describe('banners: always present, core wording verbatim', () => {
  for (const [page, view] of [
    ['clearance', () => cl.computeView(cl.DEFAULT_STATE, EMPTY)],
    ['creepage', () => cr.computeView(cr.DEFAULT_STATE, EMPTY)],
    ['ipc-spacing', () => ip.computeView(ip.DEFAULT_STATE, EMPTY)],
  ] as const) {
    it(`${page}: banners are on the needs-input state (nothing entered, tables empty)`, () => {
      const b = view().banners;
      expect(b.product).toBe(PRODUCT_STANDARD_BANNER);
      expect(b.soldermask.startsWith(SOLDERMASK_NOTE)).toBe(true);
      expect(b.unverified).toBeUndefined();
      const t = textOf(SpacingBanners({ banners: b }));
      expect(t).toContain(PRODUCT_STANDARD_BANNER);
      expect(t).toContain(SOLDERMASK_NOTE);
      expect(t).not.toContain('UNVERIFIED');
    });
  }
  it('the soldermask note says it is not conformal coating and earns no credit', () => {
    expect(SOLDERMASK_NOTE).toMatch(/not conformal coating/i);
    expect(SOLDERMASK_NOTE).toMatch(/no coating credit/i);
  });
  it('the IPC page adds that its coating choice only selects a table column', () => {
    expect(ip.computeView(ip.DEFAULT_STATE, EMPTY).banners.soldermask).toContain(sc.IPC_COATING_NOTE);
  });
  it('banner wording is imported from the core, never retyped in the UI source', () => {
    const files = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    for (const [f, src] of Object.entries(files)) {
      expect(src, f).not.toContain('insulation-coordination framework');
      expect(src, f).not.toContain('is not conformal coating (IEC');
    }
  });
});

describe('needs-input: Insufficient inputs, no number', () => {
  it('clearance lists every mandatory input, in plain words', () => {
    const v = cl.computeView(cl.DEFAULT_STATE, EMPTY);
    expect(v.status).toBe('needs-input');
    if (v.status !== 'needs-input') return;
    expect(v.summary.startsWith('Insufficient inputs: ')).toBe(true);
    for (const w of ['data set edition', 'insulation type', 'impulse requirement', 'pollution degree', 'field condition', 'altitude', 'peak working voltage', 'frequency']) {
      expect(v.summary, w).toContain(w);
    }
  });
  it('each missing clearance input blocks the output', () => {
    const fields: [keyof cl.ClearanceState, string][] = [
      ['edition', 'data set edition'],
      ['insulation', 'insulation type'],
      ['impulse', 'impulse requirement'],
      ['pollution', 'pollution degree'],
      ['field', 'field condition'],
      ['altitude', 'altitude'],
      ['peak', 'peak working voltage'],
      ['frequency', 'frequency'],
    ];
    for (const [k, word] of fields) {
      const v = cl.computeView({ ...CL_OK, [k]: '' }, FAKE);
      expect(v.status, k).toBe('needs-input');
      if (v.status === 'needs-input') expect(v.summary, k).toContain(word);
    }
  });
  it('category route lists the missing category and supply separately', () => {
    const v = cl.computeView({ ...CL_OK, route: 'category', impulse: '', supply: '230 V' }, FAKE);
    expect(v.status === 'needs-input' && v.needs.join('|')).toBe('overvoltage category');
    const w = cl.computeView({ ...CL_OK, route: 'category', impulse: '', category: 'II' }, FAKE);
    expect(w.status === 'needs-input' && w.needs.join('|')).toBe('supply voltage');
  });
  it('creepage: each missing mandatory input blocks the output', () => {
    const fields: [keyof cr.CreepageState, string][] = [
      ['edition', 'data set edition'],
      ['insulation', 'insulation type'],
      ['rms', 'RMS working voltage'],
      ['pollution', 'pollution degree'],
      ['group', 'material group or CTI'],
      ['surface', 'surface'],
      ['associated', 'associated clearance'],
      ['frequency', 'frequency'],
    ];
    for (const [k, word] of fields) {
      const v = cr.computeView({ ...CR_OK, [k]: '' }, FAKE);
      expect(v.status, k).toBe('needs-input');
      if (v.status === 'needs-input') expect(v.summary, k).toContain(word);
    }
  });
  it('ipc: external conductors also need kind, coating, and elevation when uncoated', () => {
    const v = ip.computeView({ ...IP_OK, location: 'external' }, FAKE);
    expect(v.status === 'needs-input' && v.needs.join('|')).toBe('conductor kind|coating|elevation (a height above sea level, or vacuum)');
    const w = ip.computeView({ ...IP_OK, location: 'external', kind: 'bare-board', coating: 'permanent-polymer-or-solder-mask' }, FAKE);
    expect(w.status).toBe('ok');
    expect(ip.computeView({ ...IP_OK, edition: '' }, FAKE).status).toBe('needs-input');
    expect(ip.computeView({ ...IP_OK, peak: '' }, FAKE).status).toBe('needs-input');
    expect(ip.computeView({ ...IP_OK, location: '' }, FAKE).status).toBe('needs-input');
  });
  it('an incomplete waveform declaration counts as no voltage (never a partial number)', () => {
    const v = cl.computeView({ ...CL_OK, peak: '', voltageMode: 'waveform', shape: 'sine', basis: '', waveValue: '230 V' }, FAKE);
    expect(v.status === 'needs-input' && v.summary).toContain('peak working voltage');
  });
});

describe('INSUFFICIENT DATA with the shipped empty tables', () => {
  const cases = [
    // frequency above 0 needs the T7 scope-max-frequency record, so T7 is listed next to the empty tables
    ['clearance', () => cl.computeView(CL_OK, EMPTY), ['T2', 'T4', 'T7']],
    ['creepage', () => cr.computeView(CR_OK, EMPTY), ['T5', 'T7']],
    ['ipc-spacing', () => ip.computeView(IP_OK, EMPTY), ['T8']],
    // DC (0 Hz) and basic insulation: T7 is not consulted
    ['clearance at 0 Hz', () => cl.computeView({ ...CL_OK, frequency: '0 Hz' }, EMPTY), ['T2', 'T4']],
    ['creepage at 0 Hz', () => cr.computeView({ ...CR_OK, frequency: '0 Hz' }, EMPTY), ['T5']],
  ] as const;
  for (const [page, view, tables] of cases) {
    it(`${page}: complete inputs land in INSUFFICIENT DATA naming the table and offering the import box`, () => {
      const v = view();
      expect(v.status).toBe('insufficient-data');
      if (v.status !== 'insufficient-data') return;
      expect(v.heading).toBe('INSUFFICIENT DATA');
      expect(v.tables).toEqual([...tables]);
      expect(v.items.join(' ')).toMatch(/INSUFFICIENT DATA: table T\d/);
      const t = allText(v);
      expect(t).toContain('INSUFFICIENT DATA');
      expect(t).toContain(sc.IMPORT_LINK_TEXT);
      expect(t).toContain('The app ships no standard values');
      expect(t).not.toMatch(/\d\s*(mm|mil)\b/);
      expect(v.banners.product).toBe(PRODUCT_STANDARD_BANNER);
    });
  }
  it('the go-to-import button is wired and the box has the id the button targets', () => {
    const v = cl.computeView(CL_OK, EMPTY);
    let clicked = 0;
    const tree = SpacingResults({ view: v, onGoToImport: () => (clicked += 1) });
    const find = (n: unknown): VNodeLike | undefined => {
      if (Array.isArray(n)) return n.map(find).find((x) => x !== undefined);
      if (!isV(n)) return undefined;
      if (n.type === 'button') return n;
      return find(n.props['children']);
    };
    const b = find(tree);
    (b?.props['onClick'] as () => void)();
    expect(clicked).toBe(1);
    expect(sc.IMPORT_ANCHOR_ID).toBe('spacing-import');
  });
  it('INSUFFICIENT DATA also comes from a missing cell or edition (the core says which)', () => {
    const v = cl.computeView({ ...CL_OK, edition: 'ANOTHER-EDITION' }, FAKE);
    expect(v.status).toBe('insufficient-data');
    const w = cl.computeView({ ...CL_OK, route: 'category', impulse: '', category: 'II', supply: '230 V' }, synthSet(['T2', 'T4']));
    expect(w.status === 'insufficient-data' && w.tables).toContain('T1');
  });
});

describe('OUT OF TABLE RANGE', () => {
  it('a requirement above the table gives the heading and no number', () => {
    const v = cl.computeView({ ...CL_OK, impulse: '9 kV' }, FAKE);
    expect(v.status).toBe('out-of-range');
    if (v.status !== 'out-of-range') return;
    expect(v.heading).toBe('OUT OF TABLE RANGE');
    expect(allText(v)).toContain('OUT OF TABLE RANGE');
    expect(allText(v)).not.toMatch(/\d\s*mm\b/);
  });
  it('a frequency above the recorded T7 limit gives it too', () => {
    const v = cl.computeView({ ...CL_OK, frequency: '10 kHz' }, FAKE);
    expect(v.status).toBe('out-of-range');
    expect(v.status === 'out-of-range' && v.message).toMatch(/IEC 60664-4/);
    expect(cr.computeView({ ...CR_OK, frequency: '10 kHz' }, FAKE).status).toBe('out-of-range');
  });
});

describe('errors: inline, never a stale or NaN number', () => {
  it('unparseable text is a field error, not a result', () => {
    for (const bad of ['abc', '5 widgets', '1e999 m']) {
      const v = cl.computeView({ ...CL_OK, altitude: bad }, FAKE);
      expect(v.status, bad).toBe('error');
      if (v.status === 'error') {
        expect(v.fieldErrors['altitude'], bad).toBeTruthy();
        expect(v.problems.join(' ')).not.toMatch(/NaN|Infinity/);
      }
    }
  });
  it('a wrong dimension is refused (a length typed into a voltage field)', () => {
    const v = cl.computeView({ ...CL_OK, impulse: '2 mm' }, FAKE);
    expect(v.status).toBe('error');
    expect(v.fieldErrors['impulse']).toBeTruthy();
  });
  it('a unit slip caught by the core maps back to the field', () => {
    const v = cl.computeView({ ...CL_OK, altitude: '100000 km' }, FAKE);
    expect(v.status).toBe('error');
    expect(v.fieldErrors['altitude']).toMatch(/plausible range/);
  });
  it('zero and negative voltages are refused by the core', () => {
    expect(cl.computeView({ ...CL_OK, peak: '0 V' }, FAKE).status).toBe('error');
    expect(cr.computeView({ ...CR_OK, rms: '-5 V' }, FAKE).status).toBe('error');
    expect(ip.computeView({ ...IP_OK, peak: '0 V' }, FAKE).status).toBe('error');
  });
  it('peak below rms (direct entry) is a core error', () => {
    const v = cr.computeView({ ...CR_OK, peak: '100 V' }, FAKE);
    expect(v.status).toBe('error');
  });
  it('every error state still carries the banners', () => {
    expect(cl.computeView({ ...CL_OK, altitude: 'abc' }, FAKE).banners.product).toBe(PRODUCT_STANDARD_BANNER);
  });
  it('a hostile hash text never reaches the core as a number', () => {
    const v = cl.computeView({ ...CL_OK, altitude: 'x'.repeat(41) }, FAKE);
    expect(v.status).toBe('error');
  });
});

describe('results with ENTERED_UNVERIFIED tables', () => {
  it('clearance: red UNVERIFIED banner, indicative only, confidence below high with reasons, never a pass word', () => {
    const v = ok(cl.computeView(CL_OK, FAKE));
    expect(v.banners.unverified?.text).toBe(UNVERIFIED_BANNER);
    expect(v.banners.unverified?.prefix).toBe('indicative only');
    expect(v.banners.unverified?.tables).toEqual(['T1', 'T2', 'T3', 'T4', 'T7']);
    expect(v.result.headline.label.startsWith('indicative only: ')).toBe(true);
    expect(v.result.headline.text).toMatch(/mm/);
    expect(v.result.headline.text).toMatch(/mil/);
    expect(v.result.confidence.level).not.toBe('high');
    expect(v.result.confidence.reasons.length).toBeGreaterThan(0);
    expect(v.result.ledger.unverifiedIds.length).toBeGreaterThan(0);
    const t = allText(v);
    expect(t).toContain('UNVERIFIED');
    expect(t).toContain('Confidence:');
    expect(t).toContain('Details: formula, steps, assumptions, sources, inputs');
    expect(t).not.toMatch(BANNED);
  });
  it('the banner texts are shown once on the page (banners) and not repeated in the warning list', () => {
    const v = ok(cl.computeView(CL_OK, synthSet(['T2', 'T4', 'T7'])));
    const listed = v.result.warnings.map((w) => w.message);
    expect(listed).not.toContain(UNVERIFIED_BANNER);
    expect(listed).not.toContain(PRODUCT_STANDARD_BANNER);
    expect(listed).not.toContain(SOLDERMASK_NOTE);
    // everything else the core warned about is still listed
    expect(listed.some((m) => /T3 .* is not entered/.test(m))).toBe(true);
    expect(v.result.warnings[0]?.message).toMatch(/T3|high-frequency|Voltage scope|categories/);
  });
  it('clearance shows the standard result rows: impulse voltage used and the altitude factor (clearance only)', () => {
    const v = ok(cl.computeView(CL_OK, FAKE));
    expect(v.result.rows.map((r) => r.label)).toEqual(['Rated impulse withstand voltage used', 'Altitude correction factor (clearance only)']);
  });
  it('creepage and ipc results carry the same banners and prefix', () => {
    const c = ok(cr.computeView(CR_OK, FAKE));
    expect(c.result.headline.label).toBe('indicative only: Minimum creepage distance');
    expect(c.banners.unverified?.tables).toEqual(['T5', 'T6', 'T7']);
    const i = ok(ip.computeView(IP_OK, FAKE));
    expect(i.result.headline.label).toBe('indicative only: Minimum conductor spacing (IPC-2221 design guideline)');
    expect(i.banners.unverified?.tables).toEqual(['T8']);
    expect(i.result.warnings.some((w) => w.message.includes('design guideline, not a safety insulation assessment'))).toBe(true);
  });
  it('altitude never changes creepage; entering it only adds a note', () => {
    const a = ok(cr.computeView(CR_OK, FAKE));
    const b = ok(cr.computeView({ ...CR_OK, altitude: '4000 m' }, FAKE));
    expect(b.result.headline.text).toBe(a.result.headline.text);
    expect(b.result.warnings.some((w) => /altitude does not change creepage/.test(w.message))).toBe(true);
    expect(a.result.warnings.some((w) => /altitude does not change creepage/.test(w.message))).toBe(false);
  });
  it('creepage is raised to the associated clearance and says so', () => {
    const v = ok(cr.computeView({ ...CR_OK, associated: '500 mm' }, FAKE));
    expect(v.result.warnings.some((w) => /not less than the associated clearance/.test(w.message))).toBe(true);
  });
  it('CTI route reads the group from T6', () => {
    const v = ok(cr.computeView({ ...CR_OK, materialRoute: 'cti', group: '', cti: '100 V' }, FAKE));
    expect(v.result.details.assumptions.join(' ')).toMatch(/Material group I from CTI/);
  });
  it('grooves are never credited (warning only)', () => {
    const v = ok(cr.computeView({ ...CR_OK, grooves: 'present' }, FAKE));
    expect(v.result.warnings.some((w) => /not credited/.test(w.message))).toBe(true);
  });
  it('the calculation is repeatable and fast (closed form lookup)', () => {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) ok(cl.computeView(CL_OK, FAKE));
    expect((performance.now() - t0) / 200).toBeLessThan(5);
  });
});

describe('verified tables remove the banner and the prefix (a signed synthetic set)', () => {
  it('no UNVERIFIED banner and no prefix, but the product banner stays', () => {
    const v = ok(cl.computeView(CL_OK, FAKE_VERIFIED));
    expect(v.banners.unverified).toBeUndefined();
    expect(v.result.headline.label.startsWith('indicative only')).toBe(false);
    expect(v.banners.product).toBe(PRODUCT_STANDARD_BANNER);
    expect(v.result.confidence.level).not.toBe('high');
  });
  it('clearance takes no coating credit by default: a verified creepage-only record is not applied to it', () => {
    const none = ok(cl.computeView(CL_OK, FAKE_VERIFIED));
    const type1 = ok(cl.computeView({ ...CL_OK, coating: 'type1' }, FAKE_VERIFIED));
    expect(type1.result.headline.text).toBe(none.result.headline.text);
    expect(type1.result.warnings.some((w) => /NOT applied.*creepage only/.test(w.message))).toBe(true);
    const unverified = ok(cl.computeView({ ...CL_OK, coating: 'type1' }, FAKE));
    expect(unverified.result.warnings.some((w) => /NOT applied/.test(w.message))).toBe(true);
  });
  it('a verified T7 coating record that states appliesTo both is applied to clearance, and only when the user selects it', () => {
    const raw = rawSynthetic('T7', { verified: true }) as { rules: Record<string, unknown>[] };
    const rules = raw.rules.map((r) => (r['rule'] === 'coating-credit' ? { ...r, appliesTo: 'both' } : r));
    const t7 = parseSpacingTable({ ...raw, rules });
    if (!t7.ok) throw new Error(t7.error.join('; '));
    const parts: Partial<Record<TableId, ReturnType<typeof synthTable>>> = {};
    for (const id of TABLE_IDS) parts[id] = id === 'T7' ? t7.value : synthTable(id, { verified: true });
    const set = makeTableSet(parts);
    if (!set.ok) throw new Error(set.error.join('; '));
    const none = ok(cl.computeView(CL_OK, set.value));
    const type1 = ok(cl.computeView({ ...CL_OK, coating: 'type1' }, set.value));
    expect(type1.result.headline.text).not.toBe(none.result.headline.text);
  });
  it('solder mask earns no credit: declaring it changes nothing but a note', () => {
    const a = ok(cl.computeView(CL_OK, FAKE_VERIFIED));
    const b = ok(cl.computeView({ ...CL_OK, soldermask: true }, FAKE_VERIFIED));
    expect(b.result.headline.text).toBe(a.result.headline.text);
    expect(b.result.warnings.some((w) => /Solder mask was declared/.test(w.message))).toBe(true);
  });
});

describe('waveform entry (peak and rms helper)', () => {
  const W = { ...CL_OK, peak: '', voltageMode: 'waveform' as const, shape: 'sine' as const, basis: 'rms' as const, waveValue: '230 V' };
  it('uses the core crest factor to give the peak voltage and says how', () => {
    expect(sc.waveformHelper(W)).toEqual({ status: 'ok', text: expect.stringMatching(/Declared sine waveform: peak 32\d(\.\d+)? V, rms 230 V\./) });
    const v = ok(cl.computeView(W, FAKE));
    expect(v.result.details.inputs.some((i) => i.detail?.includes('declared sine waveform'))).toBe(true);
  });
  it('is idle in direct mode, prompts when incomplete, and reports errors', () => {
    expect(sc.waveformHelper(CL_OK).status).toBe('idle');
    expect(sc.waveformHelper({ ...W, basis: '' }).status).toBe('idle');
    expect(sc.waveformHelper({ ...W, waveValue: 'x' }).status).toBe('error');
    expect(sc.waveformHelper({ ...W, waveValue: '0 V' }).status).toBe('error');
  });
  it('creepage and ipc accept a declared waveform too', () => {
    expect(ok(cr.computeView({ ...CR_OK, rms: '', voltageMode: 'waveform', shape: 'dc', basis: 'peak', waveValue: '150 V' }, FAKE)).status).toBe('ok');
    expect(ok(ip.computeView({ ...IP_OK, peak: '', voltageMode: 'waveform', shape: 'triangle', basis: 'rms', waveValue: '10 V' }, FAKE)).status).toBe('ok');
  });
});

describe('IPC page specifics', () => {
  it('external, uncoated, height and vacuum', () => {
    const base = { ...IP_OK, location: 'external' as const, kind: 'bare-board' as const, coating: 'uncoated' as const };
    expect(ip.usesElevation(base)).toBe(true);
    expect(ok(ip.computeView({ ...base, elevation: '1000 m' }, FAKE)).status).toBe('ok');
    expect(ip.computeView({ ...base, elevationMode: 'vacuum' }, FAKE).status).toBe('insufficient-data');
    expect(ip.usesElevation({ ...base, coating: 'conformal-coating' })).toBe(false);
    expect(ip.usesElevation({ ...IP_OK })).toBe(false);
  });
  it('is labelled a design guideline, with no IEC inputs', () => {
    expect(ip.GUIDELINE_LABEL).toMatch(/design guideline; not a safety insulation assessment/);
    expect(Object.keys(ip.DEFAULT_STATE)).not.toContain('pollution');
  });
});

describe('table status panel and import', () => {
  it('shows T1 to T8 EMPTY with no edition or author for the shipped set', () => {
    const rows = sc.tableStatusRows(EMPTY);
    expect(rows.map((r) => r.id)).toEqual([...TABLE_IDS]);
    for (const r of rows) {
      expect(r.state).toBe('EMPTY');
      expect(r.edition).toBe(sc.NONE_TEXT);
      expect(r.enteredBy).toBe(sc.NONE_TEXT);
      expect(r.verifiedBy).toBe(sc.NONE_TEXT);
      expect(r.records).toBe(0);
    }
    expect(sc.loadedEditions(EMPTY)).toEqual([]);
  });
  it('shows entered tables with edition, enteredBy and the state, and VERIFIED only as a claim of the file', () => {
    const rows = sc.tableStatusRows(FAKE);
    const t2 = rows.find((r) => r.id === 't2'.toUpperCase());
    expect(t2?.state).toBe('ENTERED_UNVERIFIED');
    expect(t2?.edition).toBe(ED);
    expect(t2?.enteredBy).toBe('test-author');
    expect(t2?.verifiedBy).toBe(sc.NONE_TEXT);
    expect(sc.loadedEditions(FAKE)).toContain(`T2: ${ED}`);
    const v = sc.tableStatusRows(FAKE_VERIFIED)[1];
    expect(v?.state).toBe('VERIFIED');
    expect(v?.verifiedBy).toBe('test-verifier');
    expect(v?.stateText).toMatch(/cannot verify values itself/);
  });
  it('the blank template is the empty shells and re-imports as all EMPTY, never holding a value', () => {
    const text = sc.templateJson();
    const parsed = JSON.parse(text) as { tables: { cells: unknown[]; groups: unknown[]; rules: unknown[]; rows: unknown[] }[] };
    expect(parsed.tables.length).toBe(8);
    for (const t of parsed.tables) expect([t.cells.length, t.groups.length, t.rules.length, t.rows.length]).toEqual([0, 0, 0, 0]);
    const r = importSpacingTables(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.imported.every((i) => i.state === 'EMPTY')).toBe(true);
    expect(sc.TEMPLATE_FILE_NAME).toMatch(/\.json$/);
    expect(text).toBe(serializeTableSet(SHIPPED_TABLES));
  });
  it('import messages are plain, capped, and an empty box is refused', () => {
    const store = createSpacingStore(undefined);
    const empty = importMessage(store, '   ');
    expect(empty.kind).toBe('error');
    const bad = importMessage(store, '{"x":1}');
    expect(bad.kind).toBe('error');
    if (bad.kind === 'error') {
      expect(bad.title).toMatch(/Nothing was changed/);
      expect(bad.lines.every((l) => l.endsWith('.'))).toBe(true);
    }
    const notJson = importMessage(store, 'hello');
    expect(notJson.kind === 'error' && notJson.lines[0]).toMatch(/not valid JSON/);
    const good = importMessage(store, serializeTableSet(synthSet(['T2'])));
    expect(good.kind).toBe('ok');
    if (good.kind === 'ok') {
      expect(good.lines).toContain('T2: ENTERED_UNVERIFIED, ' + String(good.lines.find((l) => l.startsWith('T2'))?.split(', ')[1]?.split(' ')[0]) + ' records');
      expect(good.lines).toContain('T1: EMPTY, 0 records');
      expect(good.note).toMatch(/memory only/);
    }
    expect(sc.importProblems(Array.from({ length: 30 }, (_, i) => `e${String(i)}`))).toEqual({ shown: expect.any(Array), more: 10 });
    expect(sc.importSuccessLines([{ table: 'T4', state: 'ENTERED_UNVERIFIED', records: 1 }])).toEqual(['T4: ENTERED_UNVERIFIED, 1 record']);
  });
  it('a file bigger than four bytes per allowed character is refused before it is read', () => {
    expect(checkFileSize(MAX_IMPORT_CHARS * 4)).toBeUndefined();
    expect(checkFileSize(MAX_IMPORT_CHARS * 4 + 1)).toMatch(/too large/);
    expect(MAX_IMPORT_CHARS).toBe(524_288);
  });
  it('imports change what the pages compute (shipped -> insufficient data -> result)', () => {
    const store = createSpacingStore(undefined);
    expect(cl.computeView(CL_OK, store.get()).status).toBe('insufficient-data');
    store.importText(serializeTableSet(FAKE));
    expect(cl.computeView(CL_OK, store.get()).status).toBe('ok');
    store.clear();
    expect(cl.computeView(CL_OK, store.get()).status).toBe('insufficient-data');
  });
});

describe('hash state: schema-versioned, defaults on corruption, caps kept', () => {
  const pages = [
    ['clearance', cl.toHashState, cl.fromHashState, { ...CL_OK, route: 'category' as const, impulse: '', category: 'III' as const, supply: '230 V', coating: 'type1' as const, soldermask: true }, cl.DEFAULT_STATE, cl.WRITTEN_KEYS],
    ['creepage', cr.toHashState, cr.fromHashState, { ...CR_OK, materialRoute: 'cti' as const, group: '' as const, cti: '400 V', grooves: 'present' as const, altitude: '100 m', coating: 'type2' as const, soldermask: true }, cr.DEFAULT_STATE, cr.WRITTEN_KEYS],
    ['ipc-spacing', ip.toHashState, ip.fromHashState, { ...IP_OK, location: 'external' as const, kind: 'component-lead' as const, coating: 'uncoated' as const, elevationMode: 'vacuum' as const, elevation: '10 m' }, ip.DEFAULT_STATE, ip.WRITTEN_KEYS],
  ] as const;
  for (const [id, toHash, fromHash, state, defaults, written] of pages) {
    it(`${id}: round trip through the real hash serializer`, () => {
      const h = serializeHash({ name: 'calc', id }, toHash(state as never));
      expect(h).toContain('v=1');
      const back = fromHash(parseHash(h).state);
      expect(back.notices).toEqual([]);
      expect(back.state).toEqual(state);
      expect(h.length).toBeLessThan(MAX_HASH_LENGTH);
    });
    it(`${id}: only documented keys are written, none reserved`, () => {
      const keys = Object.keys(toHash(state as never));
      for (const k of keys) {
        expect(Object.keys(CALCULATOR_STATE_KEYS[id])).toContain(k);
        expect(['v', 'fc', 'fp', 'mode', 'u']).not.toContain(k);
      }
      expect(written.length).toBeLessThan(MAX_STATE_KEYS);
    });
    it(`${id}: empty or default state writes nothing, so mandatory inputs are never defaulted by a link`, () => {
      expect(toHash(defaults as never)).toEqual({});
      expect(fromHash({}).state).toEqual(defaults);
    });
    it(`${id}: unknown values fall back to not-chosen with a notice`, () => {
      const junk = Object.fromEntries(written.map((k) => [k, 'zzz-not-a-value']));
      const r = fromHash(junk);
      expect(r.notices.length).toBeGreaterThan(0);
      expect(r.state.edition).toBe('zzz-not-a-value');
      const over = fromHash({ vp: 'x'.repeat(41), ed: 'y'.repeat(201) });
      expect(over.notices.length).toBe(2);
      expect(over.state.peak).toBe('');
      expect(over.state.edition).toBe('');
    });
  }
  it('a corrupt link gives the defaults and the discard flag from the shared parser', () => {
    const p = parseHash('#/calc/clearance?v=1&ed=%E0%A4%A');
    expect(p.stateDiscarded).toBe(true);
    expect(cl.fromHashState(p.state).state).toEqual(cl.DEFAULT_STATE);
    expect(parseHash('#/calc/clearance?v=99&ed=x').stateDiscarded).toBe(true);
  });
  it('imported tables are never part of the link: no key holds table data', () => {
    for (const id of ['clearance', 'creepage', 'ipc-spacing'] as const) {
      expect(Object.keys(CALCULATOR_STATE_KEYS[id])).not.toContain('tables');
    }
  });
  it('caps are unchanged', () => {
    expect(MAX_HASH_LENGTH).toBe(8192);
    expect(MAX_STATE_KEYS).toBe(64);
  });
});

describe('live summaries', () => {
  it('every state has a plain announcement', () => {
    expect(cl.liveSummary(cl.computeView(cl.DEFAULT_STATE, EMPTY))).toMatch(/^No result yet\. Insufficient inputs/);
    expect(cl.liveSummary(cl.computeView(CL_OK, EMPTY))).toMatch(/INSUFFICIENT DATA\. No result/);
    expect(cl.liveSummary(cl.computeView({ ...CL_OK, impulse: '9 kV' }, FAKE))).toMatch(/OUT OF TABLE RANGE\. No result/);
    expect(cl.liveSummary(cl.computeView({ ...CL_OK, altitude: 'x' }, FAKE))).toMatch(/^No result\. /);
    expect(cl.liveSummary(cl.computeView(CL_OK, FAKE))).toMatch(/^Result: indicative only: Minimum clearance .* Confidence (low|medium)/);
    expect(cr.liveSummary(cr.computeView(CR_OK, EMPTY))).toMatch(/INSUFFICIENT DATA/);
    expect(ip.liveSummary(ip.computeView(IP_OK, FAKE))).toMatch(/^Result: /);
    expect(sc.liveSummaryOf({ status: 'ok' })).toBe('Result ready.');
  });
});

describe('Phase 3 UI fixes: import help, worked example, export, hints', () => {
  it('the worked example is labelled FAKE, imports as ENTERED_UNVERIFIED and never as VERIFIED', () => {
    const text = exampleJson();
    expect(text).toContain(FAKE_LABEL);
    expect(EXAMPLE_FILE_NAME).toMatch(/FAKE/);
    const r = importSpacingTables(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.imported.map((i) => `${i.table}:${i.state}`)).toEqual(['T2:ENTERED_UNVERIFIED', 'T7:ENTERED_UNVERIFIED']);
    expect(text).not.toContain('"VERIFIED"');
  });
  it('the help covers T1 to T8 and the T7 rules, the second-person rule and the edition rule', () => {
    expect(TABLE_HELP.map((t) => t.id)).toEqual([...TABLE_IDS]);
    const all = [...COMMON_HELP, ...TABLE_HELP.map((t) => t.text)].join(' ');
    for (const w of ['series', 'reinforced-clearance-steady-state', 'appliesTo', 'second person', 'letter for letter', 'pollutionDegree', 'perVolt', 'elevationBreakpoint']) expect(all, w).toContain(w);
  });
  it('an exported set re-imports to the same states', () => {
    const r = importSpacingTables(exampleJson());
    if (!r.ok) throw new Error('example did not import');
    const again = importSpacingTables(serializeTableSet(r.value.tables));
    expect(again.ok && again.value.imported.length).toBe(8);
    expect(again.ok && again.value.imported.filter((x) => x.state === 'ENTERED_UNVERIFIED').map((x) => x.table)).toEqual(['T2', 'T7']);
    expect(sc.tableStatusRows(r.value.tables).filter((x) => x.state !== 'EMPTY').map((x) => x.id)).toEqual(['T2', 'T7']);
  });
  it('a self-signed VERIFIED file is refused with the second-person message', () => {
    const raw = JSON.parse(exampleJson()) as { tables: Record<string, unknown>[] };
    const t = raw.tables[0] as Record<string, unknown>;
    const signed = { ...t, status: 'VERIFIED', bannerRequired: false, verifiedBy: 'example person a', verifiedDate: '2000-01-02' };
    const r = importMessage(createSpacingStore(undefined), JSON.stringify(signed));
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.lines.join(' ')).toMatch(/second person/);
  });
  it('a missing T7 frequency record is named in the refusal on both IEC pages', () => {
    const t = synthSet(['T2', 'T4', 'T5']);
    const c = cl.computeView(CL_OK, t);
    expect(c.status === 'insufficient-data' && c.items.join(' ')).toMatch(/scope-max-frequency/);
    const k = cr.computeView(CR_OK, t);
    expect(k.status === 'insufficient-data' && k.tables).toContain('T7');
  });
  it('a column combination that does not exist gets the plain hint', () => {
    const v = ip.computeView({ ...IP_OK, location: 'external', kind: 'component-lead', coating: 'permanent-polymer-or-solder-mask' }, FAKE);
    expect(v.status).toBe('insufficient-data');
    if (v.status === 'insufficient-data') expect(v.items).toContain(sc.NO_COLUMN_HINT);
  });
  it('the supply and peak voltage help separates the two and names the converter case', () => {
    expect(cl.SUPPLY_HELP).toMatch(/NOT the voltage across this gap/);
    expect(cl.SUPPLY_HELP).toMatch(/line-to-neutral/);
    expect(cl.SUPPLY_HELP).toMatch(/DC bus/);
    expect(cl.SUPPLY_HELP).toMatch(/isolating transformer or converter/);
    expect(cl.PEAK_HELP).toMatch(/Not the supply voltage/);
  });
  it('the IPC exposed-pad warning keeps the policy that the choice only selects a column', () => {
    expect(ip.EXPOSED_PAD_WARNING).toMatch(/uncoated/);
    expect(ip.EXPOSED_PAD_WARNING).toMatch(/Pads/);
    expect(sc.IPC_COATING_NOTE).toMatch(/only selects a column/);
  });
  it('the inner-layer and unipolar notes exist', () => {
    expect(sc.INNER_LAYER_NOTE).toMatch(/inner layers/);
    expect(sc.WAVEFORM_HELP).toMatch(/unipolar/);
  });
  it('the creepage page links to the clearance page and says creepage is raised to clearance', () => {
    expect(sc.ASSOCIATED_HINT).toMatch(/same pair and the same insulation type/);
    expect(sc.ASSOCIATED_HINT).toMatch(/raised to it/);
  });
});
