import { describe, expect, it } from 'vitest';
import genericSrc from './diff.vm.ts?raw';
import msVmSrc from './diff-microstrip.vm.ts?raw';
import slVmSrc from './diff-stripline.vm.ts?raw';
import msPageSrc from './DiffMicrostrip.tsx?raw';
import slPageSrc from './DiffStripline.tsx?raw';
import commonSrc from '../components/DiffPage.tsx?raw';
import { IMPEDANCE_BANNER } from '../../core/calculators/impedance-shared';
import { CALCULATOR_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import * as ms from './diff-microstrip.vm';
import * as sl from './diff-stripline.vm';
import type { DiffState, DiffVm } from './diff.vm';

// Built from pieces so this test file does not itself contain the phrases the repository audit searches for.
const BANNED_WORDS = new RegExp(String.raw`${'compl'}iant|production[- ]${'saf'}e|${'cert'}ified|\b(passed?|fails?)\b`, 'i');

interface Kind {
  readonly name: string;
  readonly vm: DiffVm;
  readonly example: Partial<DiffState>;
  readonly golden: { zdiff: number; zeven: number; zodd: number; zcommon: number };
  readonly sizeHash: 'h' | 'b';
  readonly widthWord: RegExp;
  readonly ledger: string;
}

const KINDS: readonly Kind[] = [
  {
    name: 'diff-microstrip',
    vm: ms,
    // w = s = h = 1 mm, er 4.5 (TEST values, never page defaults).
    example: { width: '1 mm', spacing: '1 mm', size: '1 mm', er: '4.5', erSource: 'test value (er 4.5)' },
    golden: { zdiff: 120.0741, zeven: 79.9391, zodd: 60.037, zcommon: 39.9696 },
    sizeHash: 'h',
    widthWord: /trace width/i,
    ledger: 'S-022',
  },
  {
    name: 'diff-stripline',
    vm: sl,
    // w 0.5 mm, b 1 mm, s 636.62 um, er 4 (TEST values, never page defaults).
    example: { width: '0.5 mm', spacing: '636.62 um', size: '1 mm', er: '4', erSource: 'test value (er 4)' },
    golden: { zdiff: 95.3692, zeven: 52.2732, zodd: 47.6846, zcommon: 26.1366 },
    sizeHash: 'b',
    widthWord: /strip width/i,
    ledger: 'S-022a',
  },
];

type Ok = Extract<ReturnType<DiffVm['computeView']>, { status: 'ok' }>;

describe.each(KINDS)('$name', (k) => {
  const { vm } = k;
  const st = (p: Partial<DiffState>): DiffState => ({ ...vm.DEFAULT_STATE, ...k.example, ...p });
  const ok = (s: DiffState): Ok => {
    const v = vm.computeView(s);
    if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
    return v;
  };
  const val = (v: Ok, name: string): number => {
    const r = v.raw.results.find((x) => x.name === name);
    if (r === undefined) throw new Error(`no result ${name}`);
    return r.value.si;
  };
  const rowsOf = (v: Ok) => Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));
  const ROUTE = { name: 'calc', id: vm.CALCULATOR_ID } as const;

  describe('golden example', () => {
    it('shows the core numbers: Zdiff, Zeven, Zodd, Zcommon', () => {
      const v = ok(st({}));
      expect(val(v, 'differential impedance Zdiff')).toBeCloseTo(k.golden.zdiff, 3);
      expect(val(v, 'even-mode impedance Zeven')).toBeCloseTo(k.golden.zeven, 3);
      expect(val(v, 'odd-mode impedance Zodd')).toBeCloseTo(k.golden.zodd, 3);
      expect(val(v, 'common-mode impedance Zcommon')).toBeCloseTo(k.golden.zcommon, 3);
      expect(v.result.headline.label).toMatch(/differential impedance Zdiff/i);
      expect(v.result.headline.meaning).toMatch(/nominal/i);
      const rows = rowsOf(v);
      for (const label of ['Odd-mode impedance Zodd', 'Even-mode impedance Zeven', 'Common-mode impedance Zcommon', 'Coupling ratio Zdiff / (2 Z0)']) {
        expect(rows[label], label).toBeDefined();
      }
      expect(Object.keys(rows).some((l) => /isolated-line impedance Z0/i.test(l))).toBe(true);
    });
    it('shows eps_e and delay per mode as the core prints them (microstrip: odd and even; stripline: one)', () => {
      const v = ok(st({}));
      const labels = Object.keys(rowsOf(v));
      expect(labels.filter((l) => /effective permittivity/i.test(l)).length).toBeGreaterThanOrEqual(1);
      const delays = labels.filter((l) => /^Delay per length/.test(l));
      expect(delays.length).toBe(k.name === 'diff-microstrip' ? 2 : 1);
      for (const d of delays) expect(rowsOf(v)[d]).toMatch(/ps\/mm \(.* ps\/in\)/);
      if (k.name === 'diff-microstrip') {
        expect(delays.join('|')).toMatch(/odd mode/);
        expect(delays.join('|')).toMatch(/even mode/);
      }
    });
    it('frequency, length and mismatch add guided wavelength, propagation delay and the odd-mode skew', () => {
      const base = Object.keys(rowsOf(ok(st({}))));
      expect(base.some((l) => /skew/i.test(l))).toBe(false);
      const rows = rowsOf(ok(st({ frequency: '2 GHz', length: '50 mm', mismatch: '2 mm' })));
      const labels = Object.keys(rows);
      expect(labels.some((l) => /guided wavelength/i.test(l))).toBe(true);
      expect(labels.some((l) => /propagation delay/i.test(l))).toBe(true);
      expect(labels.some((l) => /intra-pair skew/i.test(l))).toBe(true);
    });
    it('carries the formula, steps and assumptions of the core (display cannot drift)', () => {
      const v = ok(st({}));
      expect(v.result.details.formula).toBe(v.raw.formula);
      expect(v.result.details.steps.length).toBe(v.raw.steps.length);
      expect(v.result.details.assumptions).toEqual([...v.raw.assumptions]);
    });
  });

  describe('always: banner, ledger badge, confidence', () => {
    it('has the banner in every state (core constant)', () => {
      expect(vm.computeView(st({ er: '' })).banner.text).toBe(IMPEDANCE_BANNER);
      expect(vm.computeView(st({ width: '0 mm' })).banner.text).toBe(IMPEDANCE_BANNER);
      expect(ok(st({})).banner.text).toBe(IMPEDANCE_BANNER);
    });
    it('lists the model row as PAYWALLED-USER-MUST-VERIFY in the result and in the page-level model status', () => {
      const v = ok(st({}));
      expect(v.ledgerRows.find((r) => r.id === k.ledger)?.status).toBe('PAYWALLED-USER-MUST-VERIFY');
      expect(v.result.ledger.unverifiedIds).toContain(k.ledger);
      expect(v.result.ledger.groups.some((g) => g.status === 'PAYWALLED-USER-MUST-VERIFY')).toBe(true);
      const rows = vm.modelStatusRows();
      expect(rows.map((r) => r.id)).toEqual([k.ledger]);
      expect(rows[0]?.status).toBe('PAYWALLED-USER-MUST-VERIFY');
      expect(vm.VERIFY_LINE).toMatch(/verify with your licensed copy \/ fab stackup/i);
    });
    it('shows the confidence as the core gives it: low, with reasons and the score, not softened', () => {
      const v = ok(st({}));
      expect(v.result.confidence.level).toBe(v.raw.confidence.level);
      expect(v.result.confidence.level).toBe('low');
      expect(v.result.confidence.score).toBe(v.raw.confidence.score);
      expect(v.result.confidence.reasons).toEqual([...v.raw.confidence.reasons]);
      expect(v.result.confidence.reasons.length).toBeGreaterThan(0);
    });
    it('shows the core model warning first', () => {
      const v = ok(st({}));
      const w = v.raw.warnings.find((x) => x.code === 'MODEL_UNVERIFIED');
      expect(w).toBeDefined();
      expect(v.result.warnings[0]?.message).toBe(w?.message);
    });
  });

  describe('thickness t is ignored by the coupled model and says so', () => {
    it('labels the field and shows the core FINITE_THICKNESS_NOT_MODELLED warning only when t is entered', () => {
      expect(vm.FIELD.thickness.label).toMatch(/ignored by the coupled model/i);
      expect(ok(st({})).raw.warnings.some((w) => w.code === 'FINITE_THICKNESS_NOT_MODELLED')).toBe(false);
      const v = ok(st({ thickness: '35 um' }));
      const w = v.raw.warnings.find((x) => x.code === 'FINITE_THICKNESS_NOT_MODELLED');
      expect(w).toBeDefined();
      expect(v.result.warnings.some((x) => x.message === w?.message)).toBe(true);
      // The result does not change with t.
      expect(val(v, 'differential impedance Zdiff')).toBeCloseTo(k.golden.zdiff, 3);
    });
  });

  describe('core warnings and validity checks are shown, informational ones are marked', () => {
    it('shows every core warning as written', () => {
      const v = ok(st({ thickness: '35 um', frequency: '1 GHz' }));
      for (const w of v.raw.warnings) expect(v.result.warnings.some((x) => x.message === w.message), w.code).toBe(true);
    });
    it('lists the validity checks; the ordering check is information, not a test', () => {
      const v = ok(st({}));
      expect(v.result.details.validity.length).toBe(v.raw.validityChecks.length);
      const order = v.result.details.validity.find((c) => /Zodd < Z0 < Zeven/.test(c.name));
      expect(order?.informational).toBe(true);
    });
    it('a wide spacing shows WEAK_COUPLING_FIT (microstrip) or the model-mismatch family; a narrow strip shows its core caution', () => {
      if (k.name === 'diff-microstrip') {
        const v = ok(st({ spacing: '5 mm' }));
        expect(v.raw.warnings.some((w) => w.code === 'WEAK_COUPLING_FIT')).toBe(true);
        expect(v.result.warnings.some((x) => x.message === v.raw.warnings.find((w) => w.code === 'WEAK_COUPLING_FIT')?.message)).toBe(true);
      } else {
        const v = ok(st({ width: '0.1 mm', spacing: '0.3 mm' }));
        const codes = v.raw.warnings.map((w) => w.code);
        expect(codes).toContain('NARROW_STRIP_FORM');
        for (const w of v.raw.warnings) expect(v.result.warnings.some((x) => x.message === w.message)).toBe(true);
      }
    });
    it('out-of-range geometry is shown and the confidence stays low', () => {
      const v = ok(st({ width: '0.01 mm' }));
      expect(v.raw.warnings.some((w) => w.code === 'OUT_OF_RANGE')).toBe(true);
      expect(v.result.confidence.level).toBe('low');
      expect(v.result.warnings[0]?.message).toBe(v.raw.warnings.find((w) => w.code === 'MODEL_UNVERIFIED' || w.code === 'OUT_OF_RANGE')?.message);
    });
  });

  describe('er has no default and a required source note', () => {
    it('the default state is empty and writes nothing to the link', () => {
      for (const key of ['width', 'spacing', 'targetZ', 'size', 'thickness', 'er', 'erSource', 'geometrySource', 'preset', 'tolerance'] as const) expect(vm.DEFAULT_STATE[key], key).toBe('');
      expect(vm.DEFAULT_STATE.solveFor).toBe('zdiff');
      expect(vm.toHashState(vm.DEFAULT_STATE)).toEqual({});
    });
    it.each([
      ['er', { er: '' }, /\ber\b|permittivity/i],
      ['source', { erSource: '' }, /source of er|where er came from/i],
      ['size', { size: '' }, /dielectric height|plane-to-plane/i],
      ['width', { width: '' }, /width/i],
      ['spacing', { spacing: '' }, /spacing/i],
    ])('without %s there is no result, a message and the banner', (_n, p, re) => {
      const v = vm.computeView(st(p));
      expect(v.status).toBe('needs-input');
      if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(re);
      expect(v).not.toHaveProperty('result');
      expect(v.banner.text).toBe(IMPEDANCE_BANNER);
    });
  });

  describe('modes', () => {
    it('chooses the fields each mode uses', () => {
      expect(vm.activeFields(st({ solveFor: 'zdiff' }))).toEqual(expect.arrayContaining(['width', 'spacing']));
      expect(vm.activeFields(st({ solveFor: 'zdiff' }))).not.toContain('targetZ');
      expect(vm.activeFields(st({ solveFor: 'spacing' }))).toEqual(expect.arrayContaining(['width', 'targetZ']));
      expect(vm.activeFields(st({ solveFor: 'spacing' }))).not.toContain('spacing');
      expect(vm.activeFields(st({ solveFor: 'width' }))).toEqual(expect.arrayContaining(['spacing', 'targetZ']));
      expect(vm.activeFields(st({ solveFor: 'width' }))).not.toContain('width');
      expect(vm.SOLVE_OPTIONS.map((o) => o.value)).toEqual(['zdiff', 'spacing', 'width']);
    });
    it('needs the target in a solve mode', () => {
      const v = vm.computeView(st({ solveFor: 'spacing', targetZ: '' }));
      expect(v.status).toBe('needs-input');
      if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/target/i);
    });
    it('spacing for a target Zdiff round-trips and offers a net-class text with mm and mil', () => {
      const s = st({ solveFor: 'spacing', targetZ: '90 ohm', width: k.name === 'diff-microstrip' ? '0.5 mm' : '0.2 mm', spacing: '' });
      const v = ok(s);
      expect(v.result.headline.label).toMatch(/edge spacing/i);
      expect(v.result.headline.text).toMatch(/mm \(.* mil\)/);
      expect(val(v, 'differential impedance Zdiff')).toBeCloseTo(90, 6);
      expect(v.netClass).toBeDefined();
      expect(v.netClass).toContain(v.result.headline.text);
      expect(v.netClass).toMatch(/mil/);
      expect(v.netClass).toContain(IMPEDANCE_BANNER);
      expect(v.netClass).toMatch(/not a design rule/i);
      expect(v.netClass).toContain(k.ledger);
    });
    it('width for a target Zdiff round-trips and the net-class text has both the width and the spacing in mm and mil', () => {
      const s = st({ solveFor: 'width', targetZ: '90 ohm', width: '', spacing: k.name === 'diff-microstrip' ? '0.2 mm' : '0.3 mm' });
      const v = ok(s);
      expect(v.result.headline.label).toMatch(k.widthWord);
      expect(val(v, 'differential impedance Zdiff')).toBeCloseTo(90, 6);
      expect(v.netClass).toContain(v.result.headline.text);
      expect((v.netClass ?? '').match(/mil\)/g)?.length).toBeGreaterThanOrEqual(2);
    });
    it('an unreachable target is the core message as an error with the field marked', () => {
      const v = vm.computeView(st({ solveFor: 'spacing', targetZ: '900 ohm', spacing: '' }));
      expect(v.status).toBe('error');
      if (v.status === 'error') {
        expect(v.problems.join(' ')).toMatch(/unreachable/);
        expect(v.fieldErrors['targetZ']).toMatch(/unreachable/);
      }
      expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity/);
    });
    it('the analysis mode offers no net-class text', () => {
      expect(ok(st({})).netClass).toBeUndefined();
    });
  });

  describe('invalid input: an inline message, never a number', () => {
    it.each([
      ['zero width', { width: '0 mm' }],
      ['negative spacing', { spacing: '-1 mm' }],
      ['zero size', { size: '0 mm' }],
      ['er text', { er: 'x' }],
      ['er below 1', { er: '0.9' }],
      ['width in volts', { width: '1 V' }],
      ['zero target', { solveFor: 'spacing' as const, targetZ: '0 ohm' }],
      ['target in mm', { solveFor: 'width' as const, targetZ: '90 mm' }],
    ])('%s gives an error and no number', (_n, p) => {
      const v = vm.computeView(st(p));
      expect(v.status).toBe('error');
      expect(v).not.toHaveProperty('result');
      expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity/);
    });
    it('a core error names the field it belongs to', () => {
      const v = vm.computeView(st({ er: '0.9' }));
      if (v.status !== 'error') throw new Error('expected error');
      expect(v.fieldErrors['er']).toBeDefined();
    });
  });

  describe('protocol presets', () => {
    it('are not pre-selected and add nothing until chosen', () => {
      const v = ok(st({}));
      expect(vm.DEFAULT_STATE.preset).toBe('');
      expect(v.preset.selected).toBeNull();
      expect(v.preset.comparison).toBeUndefined();
    });
    it('computing Zdiff with a preset compares the computed Zdiff; USB 2.0 shows the deviation and the options, no band', () => {
      const v = ok(st({ preset: 'usb2-hs-90' }));
      expect(v.preset.comparison?.statement).toMatch(/% (above|below) the 90 ohm design target/);
      expect(v.preset.comparison?.bandTag).toBeUndefined();
      expect(v.preset.toleranceOptions.length).toBe(2);
      expect(v.preset.comparison?.status).toBe('UNVERIFIED');
    });
    it('with a tolerance chosen a band tag appears as text', () => {
      const v = ok(st({ preset: 'usb2-hs-90', tolerance: 'usb2-tol-15' }));
      expect(v.preset.comparison?.bandTag).toMatch(/^(within|outside) the stated \+\/-15 % band$/);
    });
    it('LVDS: no tolerance published', () => {
      const v = ok(st({ preset: 'lvds-100' }));
      expect(v.preset.toleranceOptions).toEqual([]);
      expect(v.preset.toleranceNote).toMatch(/no PCB tolerance published/);
    });
    it('choosePreset in a solve mode fills the target and the solve uses it', () => {
      const s = vm.choosePreset(st({ solveFor: 'spacing', width: k.name === 'diff-microstrip' ? '0.5 mm' : '0.2 mm', spacing: '' }), 'ethernet-mdi-100');
      expect(s.targetZ).toBe('100 ohm');
      const v = ok(s);
      expect(v.preset.targetLine).toMatch(/^target from preset Ethernet/);
      expect(val(v, 'differential impedance Zdiff')).toBeCloseTo(100, 6);
      expect(v.preset.comparison).toBeUndefined();
    });
    it('choosePreset in analysis mode keeps the target field', () => {
      expect(vm.choosePreset(st({ targetZ: '77 ohm' }), 'usb2-hs-90').targetZ).toBe('77 ohm');
    });
    it('chooseSolve into a solve mode fills the target from a chosen preset only when it is empty', () => {
      const a = vm.chooseSolve(st({ preset: 'usb2-hs-90' }), 'width');
      expect(a.solveFor).toBe('width');
      expect(a.targetZ).toBe('90 ohm');
      const b = vm.chooseSolve(st({ preset: 'usb2-hs-90', targetZ: '85 ohm' }), 'width');
      expect(b.targetZ).toBe('85 ohm');
      expect(vm.chooseSolve(st({}), 'spacing').targetZ).toBe('');
    });
  });

  describe('hash state', () => {
    const stateKeysOf = (id: string): Readonly<Record<string, string>> => {
      const table: Readonly<Record<string, Readonly<Record<string, string>>>> = CALCULATOR_STATE_KEYS;
      return table[id] ?? {};
    };
    it('round-trips every field, uses documented keys only, and the stackup is not in the link', () => {
      const s = st({ thickness: '35 um', frequency: '2 GHz', length: '20 mm', mismatch: '0.5 mm', geometrySource: 'stackup X', preset: 'usb2-hs-90', tolerance: 'usb2-tol-10', units: 'imperial' });
      const back = vm.fromHashState(parseHash(serializeHash(ROUTE, vm.toHashState(s))).state);
      expect(back.notices).toEqual([]);
      expect(back.state).toEqual(s);
      const documented = [...Object.keys(stateKeysOf(vm.CALCULATOR_ID)), 'u'];
      for (const key of vm.WRITTEN_KEYS) expect(documented).toContain(key);
      expect(Object.keys(vm.toHashState(s))).toContain(k.sizeHash);
      expect(JSON.stringify(vm.toHashState(s))).not.toMatch(/layer|stackup":/);
    });
    it('solve-for round-trips; unknown choices fall back with a notice', () => {
      const s = st({ solveFor: 'width', targetZ: '90 ohm', width: '', spacing: '0.2 mm' });
      expect(vm.fromHashState(parseHash(serializeHash(ROUTE, vm.toHashState(s))).state).state).toEqual(s);
      expect(vm.fromHashState({ sf: 'zz' }).notices.length).toBe(1);
      expect(vm.fromHashState({ sf: 'zz' }).state.solveFor).toBe('zdiff');
      const unknown = vm.fromHashState({ pr: 'can-hs-120', tl: 'nope' });
      expect(unknown.notices.length).toBe(2);
      expect(unknown.state.preset).toBe('');
      expect(unknown.state.tolerance).toBe('');
    });
    it('a corrupt link falls back to the defaults', () => {
      expect(vm.fromHashState(parseHash(`#/calc/${vm.CALCULATOR_ID}?v=1&${k.sizeHash}=%E0%A4%A`).state).state).toEqual(vm.DEFAULT_STATE);
      expect(vm.fromHashState(parseHash(`#/calc/${vm.CALCULATOR_ID}?v=99&w=1%20mm`).state).state).toEqual(vm.DEFAULT_STATE);
    });
    it('a too-long field is dropped with a notice', () => {
      const l = vm.fromHashState({ w: 'x'.repeat(100) });
      expect(l.state.width).toBe('');
      expect(l.notices.length).toBe(1);
    });
  });

  describe('live region', () => {
    it('summarises the result with the banner, and the lack of one', () => {
      expect(vm.liveSummary(ok(st({})))).toMatch(/Confidence low/);
      expect(vm.liveSummary(ok(st({})))).toContain(IMPEDANCE_BANNER);
      expect(vm.liveSummary(vm.computeView(st({ er: '' })))).toMatch(/No result yet/);
      expect(vm.liveSummary(vm.computeView(st({ width: '0 mm' })))).toMatch(/No result/);
    });
  });
});

describe('both calculators', () => {
  it('have distinct ids and one hash table each', () => {
    expect(ms.CALCULATOR_ID).toBe('diff-microstrip');
    expect(sl.CALCULATOR_ID).toBe('diff-stripline');
    expect(Object.keys(CALCULATOR_STATE_KEYS)).toEqual(expect.arrayContaining(['diff-microstrip', 'diff-stripline']));
  });
  it('microstrip uses h and stripline uses b for the dielectric size', () => {
    expect(ms.FIELD.size.hash).toBe('h');
    expect(sl.FIELD.size.hash).toBe('b');
    expect(ms.FIELD.size.label).toMatch(/dielectric height h/i);
    expect(sl.FIELD.size.label).toMatch(/plane-to-plane spacing b/i);
  });
  it('the page sources have no engineering math, no retyped banner and no compliance or pass/fail wording', () => {
    const src = `${genericSrc}\n${msVmSrc}\n${slVmSrc}\n${msPageSrc}\n${slPageSrc}\n${commonSrc}`;
    expect(src).not.toMatch(/Math\.|toFixed|toPrecision|\.si\b/);
    expect(src).not.toMatch(/Final controlled impedance/);
    expect(src).not.toMatch(BANNED_WORDS);
  });
  it('no green styling for presets: the page source names no success class', () => {
    expect(commonSrc).not.toMatch(/success|green|pass-|ok-badge/i);
  });
});
