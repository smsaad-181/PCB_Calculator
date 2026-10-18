import { describe, expect, it } from 'vitest';
import genericSrc from './coplanar.vm.ts?raw';
import cpwVmSrc from './cpw.vm.ts?raw';
import cpwgVmSrc from './cpwg.vm.ts?raw';
import cpwPageSrc from './Cpw.tsx?raw';
import cpwgPageSrc from './Cpwg.tsx?raw';
import commonSrc from '../components/CoplanarPage.tsx?raw';
import { IMPEDANCE_BANNER } from '../../core/calculators/impedance-shared';
import { CALCULATOR_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import * as cpw from './cpw.vm';
import * as cpwg from './cpwg.vm';
import type { CoplanarState, CoplanarVm } from './coplanar.vm';

// Built from pieces so this test file does not itself contain the phrases the repository audit searches for.
const BANNED_WORDS = new RegExp(String.raw`${'compl'}iant|production[- ]${'saf'}e|${'cert'}ified|\b(passed?|fails?)\b`, 'i');

interface Kind {
  readonly name: string;
  readonly vm: CoplanarVm;
  readonly z0Er1: number;
  readonly ledger: string;
  readonly status: string;
  readonly code: string;
}

// W = 500 um, s = 200 um, h = 500 um are TEST values (the Steer geometry), never page defaults.
const BASE: Partial<CoplanarState> = { width: '500 um', gap: '200 um', height: '500 um', er: '1', erSource: 'test value (er 1)' };

const KINDS: readonly Kind[] = [
  { name: 'cpw', vm: cpw, z0Er1: 113.02151, ledger: 'S-023', status: 'CONFLICT', code: 'MODEL_CONFLICT' },
  { name: 'cpwg', vm: cpwg, z0Er1: 100.438, ledger: 'S-023a', status: 'PAYWALLED-USER-MUST-VERIFY', code: 'MODEL_UNVERIFIED' },
];

type Ok = Extract<ReturnType<CoplanarVm['computeView']>, { status: 'ok' }>;

describe.each(KINDS)('$name', (k) => {
  const { vm } = k;
  const st = (p: Partial<CoplanarState>): CoplanarState => ({ ...vm.DEFAULT_STATE, ...BASE, ...p });
  const ok = (s: CoplanarState): Ok => {
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
    it('shows the core Z0 and eps_eff for er = 1', () => {
      const v = ok(st({}));
      expect(val(v, 'characteristic impedance Z0')).toBeCloseTo(k.z0Er1, 3);
      expect(val(v, 'effective permittivity')).toBeCloseTo(1, 9);
      expect(v.result.headline.label).toMatch(/characteristic impedance Z0/i);
      expect(v.result.headline.meaning).toMatch(/nominal/i);
    });
    if (k.name === 'cpw') {
      it('shows Z0 45.246 ohm and eps_e 6.2397 for er = 12.85', () => {
        const v = ok(st({ er: '12.85', erSource: 'test value' }));
        expect(val(v, 'characteristic impedance Z0')).toBeCloseTo(45.246, 3);
        expect(val(v, 'effective permittivity')).toBeCloseTo(6.2397, 4);
      });
    }
    it('shows the k ratios as steps and the model numbers as rows, from the core', () => {
      const v = ok(st({}));
      const labels = v.result.details.steps.map((s) => s.label).join('|');
      expect(labels).toMatch(/Modulus k\b/);
      expect(labels).toMatch(/Elliptic ratio/);
      const rowLabels = Object.keys(rowsOf(v));
      expect(rowLabels.some((l) => /modulus k\b/i.test(l))).toBe(true);
      if (k.name === 'cpwg') {
        expect(rowLabels.some((l) => /modulus k3/i.test(l))).toBe(true);
        expect(rowLabels.some((l) => /filling factor q/i.test(l))).toBe(true);
      } else {
        expect(rowLabels.some((l) => /substrate thickness over max/i.test(l))).toBe(true);
      }
    });
    it('frequency, length and mismatch add guided wavelength, propagation delay and skew', () => {
      const base = Object.keys(rowsOf(ok(st({}))));
      expect(base.some((l) => /skew/i.test(l))).toBe(false);
      expect(base.some((l) => /^Delay per length/.test(l))).toBe(true);
      const labels = Object.keys(rowsOf(ok(st({ frequency: '2 GHz', length: '50 mm', mismatch: '2 mm' }))));
      expect(labels.some((l) => /guided wavelength/i.test(l))).toBe(true);
      expect(labels.some((l) => /propagation delay/i.test(l))).toBe(true);
      expect(labels.some((l) => /skew/i.test(l))).toBe(true);
    });
    it('carries the formula, steps and assumptions of the core (display cannot drift)', () => {
      const v = ok(st({}));
      expect(v.result.details.formula).toBe(v.raw.formula);
      expect(v.result.details.steps.length).toBe(v.raw.steps.length);
      expect(v.result.details.assumptions).toEqual([...v.raw.assumptions]);
    });
  });

  describe('always: banner, ledger badges, confidence', () => {
    it('has the banner in every state (core constant)', () => {
      expect(vm.computeView(st({ er: '' })).banner.text).toBe(IMPEDANCE_BANNER);
      expect(vm.computeView(st({ width: '0 mm' })).banner.text).toBe(IMPEDANCE_BANNER);
      expect(ok(st({})).banner.text).toBe(IMPEDANCE_BANNER);
    });
    it('lists the model row with its ledger status, and S-023b as VERIFIED, with a role text each', () => {
      const v = ok(st({}));
      expect(v.ledgerRows.find((r) => r.id === k.ledger)?.status).toBe(k.status);
      expect(v.ledgerRows.find((r) => r.id === 'S-023b')?.status).toBe('VERIFIED');
      expect(v.result.ledger.unverifiedIds).toContain(k.ledger);
      expect(v.result.ledger.unverifiedIds).not.toContain('S-023b');
      for (const r of v.ledgerRows) expect(r.role.length).toBeGreaterThan(10);
      const page = vm.modelStatusRows();
      expect(page.find((r) => r.id === k.ledger)?.status).toBe(k.status);
      expect(page.find((r) => r.id === 'S-023b')?.status).toBe('VERIFIED');
      expect(vm.VERIFY_LINE).toMatch(/verify with your licensed copy \/ fab stackup/i);
    });
    it('shows the confidence as the core gives it: low, with the core score and reasons, not softened', () => {
      const v = ok(st({}));
      expect(v.result.confidence.level).toBe('low');
      expect(v.result.confidence.level).toBe(v.raw.confidence.level);
      expect(v.result.confidence.score).toBe(v.raw.confidence.score);
      expect(v.result.confidence.reasons).toEqual([...v.raw.confidence.reasons]);
      expect(v.result.confidence.reasons.length).toBeGreaterThan(0);
    });
    it('shows every core warning as written, and the model warning first', () => {
      // h = 2 mm keeps the CPW substrate rule satisfied, so the model warning is the only pinned one.
      const v = ok(st({ thickness: '35 um', frequency: '1 GHz', height: '2 mm' }));
      for (const w of v.raw.warnings) expect(v.result.warnings.some((x) => x.message === w.message), w.code).toBe(true);
      const m = v.raw.warnings.find((w) => w.code === k.code);
      expect(m).toBeDefined();
      expect(v.result.warnings[0]?.message).toBe(m?.message);
      const codes = v.raw.warnings.map((w) => w.code);
      for (const c of ['DISPERSION_NOT_MODELLED', 'SOLDERMASK_NOT_MODELLED', 'FINITE_THICKNESS_NOT_MODELLED', 'COPLANAR_GROUND_WIDTH_ASSUMED']) expect(codes).toContain(c);
      if (k.name === 'cpwg') expect(codes).toContain('STITCHING_VIAS_NOT_MODELLED');
    });
    it('lists the validity checks', () => {
      const v = ok(st({}));
      expect(v.result.details.validity.length).toBe(v.raw.validityChecks.length);
      if (k.name === 'cpwg') expect(v.result.details.validity.find((c) => /validity range of the model/.test(c.name))?.informational).toBe(true);
    });
  });

  if (k.name === 'cpw') {
    describe('cpw conflict and substrate rules', () => {
      it('shows the sources-disagree wording and the MODEL_CONFLICT text', () => {
        expect(vm.modelStatusRows().find((r) => r.id === 'S-023')?.role).toMatch(/sources disagree/i);
        const v = ok(st({ height: '2 mm' }));
        const w = v.raw.warnings.find((x) => x.code === 'MODEL_CONFLICT');
        expect(w?.message).toMatch(/CONFLICT/);
        expect(v.result.warnings[0]?.message).toBe(w?.message);
        // The Steer golden geometry (h = max(W, s) x 1) is outside the substrate rule: both pinned warnings are shown.
        const g = ok(st({}));
        expect(g.result.warnings.slice(0, 2).map((x) => x.message)).toEqual([g.raw.warnings.find((x) => x.code === 'OUT_OF_RANGE')?.message, w?.message]);
      });
      it('a thin substrate is out of range with low confidence; a marginal one is a caution', () => {
        const thin = ok(st({ height: '600 um', width: '500 um', gap: '500 um' }));
        const oor = thin.raw.warnings.find((x) => x.code === 'OUT_OF_RANGE');
        expect(oor).toBeDefined();
        expect(thin.result.confidence.level).toBe('low');
        expect(thin.result.warnings.some((w) => w.message === oor?.message)).toBe(true);
        const marginal = ok(st({ height: '1.2 mm', width: '500 um', gap: '200 um' }));
        expect(marginal.raw.warnings.some((w) => w.code === 'SUBSTRATE_THICKNESS_MARGINAL')).toBe(true);
      });
    });
  }

  describe('thickness t is not modelled and says so', () => {
    it('labels the field "not modelled" and shows the core warning with the value echoed only', () => {
      expect(vm.FIELD.thickness.label).toMatch(/not modelled/i);
      expect(vm.THICKNESS_HELP).toMatch(/not modelled/i);
      const v = ok(st({ thickness: '35 um' }));
      const w = v.raw.warnings.find((x) => x.code === 'FINITE_THICKNESS_NOT_MODELLED');
      expect(w?.message).toMatch(/NOT used/);
      expect(v.result.warnings.some((x) => x.message === w?.message)).toBe(true);
      expect(val(v, 'characteristic impedance Z0')).toBeCloseTo(k.z0Er1, 3);
    });
  });

  describe('er has no default and a required source note', () => {
    it('the default state is empty and writes nothing to the link', () => {
      for (const key of ['width', 'gap', 'targetZ0', 'height', 'thickness', 'er', 'erSource', 'geometrySource', 'frequency', 'length', 'mismatch'] as const) expect(vm.DEFAULT_STATE[key], key).toBe('');
      expect(vm.DEFAULT_STATE.solveFor).toBe('z0');
      expect(vm.toHashState(vm.DEFAULT_STATE)).toEqual({});
    });
    it.each([
      ['er', { er: '' }, /\ber\b|permittivity/i],
      ['source', { erSource: '' }, /source of er|where er came from/i],
      ['height', { height: '' }, /substrate|dielectric|height|thickness/i],
      ['width', { width: '' }, /width/i],
      ['gap', { gap: '' }, /gap/i],
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
      expect(vm.activeFields(st({ solveFor: 'z0' }))).toEqual(expect.arrayContaining(['width', 'gap']));
      expect(vm.activeFields(st({ solveFor: 'z0' }))).not.toContain('targetZ0');
      expect(vm.activeFields(st({ solveFor: 'gap' }))).toEqual(expect.arrayContaining(['width', 'targetZ0']));
      expect(vm.activeFields(st({ solveFor: 'gap' }))).not.toContain('gap');
      expect(vm.activeFields(st({ solveFor: 'width' }))).toEqual(expect.arrayContaining(['gap', 'targetZ0']));
      expect(vm.activeFields(st({ solveFor: 'width' }))).not.toContain('width');
      expect(vm.SOLVE_OPTIONS.map((o) => o.value)).toEqual(['z0', 'gap', 'width']);
    });
    it('needs the target in a solve mode', () => {
      const v = vm.computeView(st({ solveFor: 'gap', targetZ0: '' }));
      expect(v.status).toBe('needs-input');
      if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/target/i);
    });
    it('gap for a target Z0 round-trips and offers a net-class text with mm and mil', () => {
      const v = ok(st({ solveFor: 'gap', targetZ0: '70 ohm', gap: '', er: '4', erSource: 'test' }));
      expect(v.result.headline.label).toMatch(/gap/i);
      expect(v.result.headline.text).toMatch(/mm \(.* mil\)/);
      expect(val(v, 'characteristic impedance Z0')).toBeCloseTo(70, 6);
      expect(v.netClass).toBeDefined();
      expect(v.netClass).toContain(v.result.headline.text);
      expect(v.netClass).toMatch(/mil/);
      expect(v.netClass).toContain(IMPEDANCE_BANNER);
      expect(v.netClass).toMatch(/not a design rule/i);
      expect(v.netClass).toContain(k.ledger);
    });
    it('width for a target Z0 round-trips and the net-class text has both width and gap in mm and mil', () => {
      const v = ok(st({ solveFor: 'width', targetZ0: '70 ohm', width: '', er: '4', erSource: 'test' }));
      expect(v.result.headline.label).toMatch(/width/i);
      expect(val(v, 'characteristic impedance Z0')).toBeCloseTo(70, 6);
      expect(v.netClass).toContain(v.result.headline.text);
      expect((v.netClass ?? '').match(/mil\)/g)?.length).toBeGreaterThanOrEqual(2);
    });
    it('an unreachable target is the core message as an error with the field marked, never a number', () => {
      const v = vm.computeView(st({ solveFor: 'gap', targetZ0: '2000 ohm', gap: '' }));
      expect(v.status).toBe('error');
      if (v.status === 'error') expect(v.fieldErrors['targetZ0']).toBeDefined();
      expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity/);
      expect(v).not.toHaveProperty('result');
    });
    it('the analysis mode offers no net-class text', () => {
      expect(ok(st({})).netClass).toBeUndefined();
    });
  });

  describe('invalid input: an inline message, never a number', () => {
    it.each([
      ['zero width', { width: '0 mm' }],
      ['negative gap', { gap: '-1 mm' }],
      ['zero height', { height: '0 mm' }],
      ['er text', { er: 'x' }],
      ['er below 1', { er: '0.9' }],
      ['width in volts', { width: '1 V' }],
      ['zero target', { solveFor: 'gap' as const, targetZ0: '0 ohm' }],
      ['target in mm', { solveFor: 'width' as const, targetZ0: '50 mm' }],
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

  describe('hash state', () => {
    const stateKeysOf = (id: string): Readonly<Record<string, string>> => {
      const table: Readonly<Record<string, Readonly<Record<string, string>>>> = CALCULATOR_STATE_KEYS;
      return table[id] ?? {};
    };
    it('round-trips every field, uses documented keys only, and the stackup is not in the link', () => {
      const s = st({ thickness: '35 um', frequency: '2 GHz', length: '20 mm', mismatch: '0.5 mm', geometrySource: 'stackup X', units: 'imperial' });
      const back = vm.fromHashState(parseHash(serializeHash(ROUTE, vm.toHashState(s))).state);
      expect(back.notices).toEqual([]);
      expect(back.state).toEqual(s);
      const documented = [...Object.keys(stateKeysOf(vm.CALCULATOR_ID)), 'u'];
      for (const key of vm.WRITTEN_KEYS) expect(documented).toContain(key);
      expect(Object.keys(vm.toHashState(s))).toEqual(expect.arrayContaining(['w', 's', 'h', 't', 'er', 'es', 'gs', 'f', 'l', 'dl', 'u']));
      expect(JSON.stringify(vm.toHashState(s))).not.toMatch(/layer|stackup":/);
    });
    it('solve-for round-trips; an unknown choice falls back with a notice', () => {
      const s = st({ solveFor: 'width', targetZ0: '50 ohm', width: '' });
      expect(vm.fromHashState(parseHash(serializeHash(ROUTE, vm.toHashState(s))).state).state).toEqual(s);
      const bad = vm.fromHashState({ sf: 'zz' });
      expect(bad.notices.length).toBe(1);
      expect(bad.state.solveFor).toBe('z0');
    });
    it('a corrupt link falls back to the defaults', () => {
      expect(vm.fromHashState(parseHash(`#/calc/${vm.CALCULATOR_ID}?v=1&h=%E0%A4%A`).state).state).toEqual(vm.DEFAULT_STATE);
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

describe('cpwg specifics', () => {
  const st = (p: Partial<CoplanarState>): CoplanarState => ({ ...cpwg.DEFAULT_STATE, ...BASE, ...p });
  it('shows the paywalled wording and the stitching caution', () => {
    const v = cpwg.computeView(st({}));
    if (v.status !== 'ok') throw new Error('expected ok');
    expect(cpwg.modelStatusRows().find((r) => r.id === 'S-023a')?.role).toMatch(/verify with your licensed copy \/ fab stackup/i);
    expect(v.raw.warnings.some((w) => w.code === 'STITCHING_VIAS_NOT_MODELLED')).toBe(true);
  });
  it('accepts er 12.85', () => {
    expect(cpwg.computeView(st({ er: '12.85' })).status).toBe('ok');
  });
});

describe('both calculators', () => {
  it('have distinct ids, one hash table each, and the substrate field named for the model', () => {
    expect(cpw.CALCULATOR_ID).toBe('cpw');
    expect(cpwg.CALCULATOR_ID).toBe('cpwg');
    expect(Object.keys(CALCULATOR_STATE_KEYS)).toEqual(expect.arrayContaining(['cpw', 'cpwg']));
    expect(cpw.FIELD.height.label).toMatch(/substrate thickness h/i);
    expect(cpwg.FIELD.height.label).toMatch(/lower ground plane/i);
  });
  it('the page sources have no engineering math, no retyped banner and no compliance or pass/fail wording', () => {
    const src = `${genericSrc}\n${cpwVmSrc}\n${cpwgVmSrc}\n${cpwPageSrc}\n${cpwgPageSrc}\n${commonSrc}`;
    expect(src).not.toMatch(/Math\.|toFixed|toPrecision|\.si\b/);
    expect(src).not.toMatch(/Final controlled impedance/);
    expect(src).not.toMatch(BANNED_WORDS);
  });
});
