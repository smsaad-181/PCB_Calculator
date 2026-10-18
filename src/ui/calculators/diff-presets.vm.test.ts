import { describe, expect, it } from 'vitest';
import src from './diff-presets.vm.ts?raw';
import { IMPEDANCE_PRESETS } from '../../core/data/impedance-presets';
import { DIM, q } from '../../core/units';
import {
  buildPresetView,
  presetChoices,
  presetTargetText,
  selectPreset,
  terminationNotes,
  toleranceChoices,
  type PresetInput,
} from './diff-presets.vm';

const z = (ohm: number) => q(ohm, DIM.RESISTANCE);
// Wording the presets must never use: pass/fail, OK, compliance claims. Built from pieces so this file stays clean for the audit.
const BAD = new RegExp(String.raw`\b(pass|passed|ok|${'compl'}iant|${'compl'}ies|meets|satisfies)\b`, 'i');
const base: PresetInput = { preset: '', tolerance: '', solveMode: 'zdiff', targetText: '' };

describe('picker lists only the offered differential-target presets, never pre-selected', () => {
  it('has exactly the differential-target entries of the data', () => {
    const want = IMPEDANCE_PRESETS.filter((p) => p.kind === 'differential-target').map((p) => p.id);
    expect(presetChoices().map((c) => c.value)).toEqual(want);
    expect(want).toEqual(['usb2-hs-90', 'ethernet-mdi-100', 'lvds-100']);
    for (const c of presetChoices()) expect(c.value).not.toMatch(/can|rs485|usb3/);
  });
  it('the empty selection shows nothing about a preset', () => {
    const v = buildPresetView(base);
    expect(v.selected).toBeNull();
    expect(v.comparison).toBeUndefined();
    expect(v.toleranceOptions).toEqual([]);
  });
});

describe('selectPreset', () => {
  it('sets the target field in a solve mode and clears the tolerance', () => {
    expect(presetTargetText('usb2-hs-90')).toBe('90 ohm');
    const s = selectPreset({ preset: '', tolerance: 'usb2-tol-10', solveMode: 'spacing', targetText: '' }, 'usb2-hs-90');
    expect(s.preset).toBe('usb2-hs-90');
    expect(s.targetText).toBe('90 ohm');
    expect(s.tolerance).toBe('');
  });
  it('leaves the target field alone when computing Zdiff from the geometry', () => {
    const s = selectPreset({ ...base, targetText: '77 ohm' }, 'ethernet-mdi-100');
    expect(s.targetText).toBe('77 ohm');
    expect(s.preset).toBe('ethernet-mdi-100');
  });
  it('choosing none clears the preset and the tolerance but not the typed target', () => {
    const s = selectPreset({ preset: 'usb2-hs-90', tolerance: 'usb2-tol-15', solveMode: 'width', targetText: '90 ohm' }, '');
    expect(s).toEqual({ preset: '', tolerance: '', solveMode: 'width', targetText: '90 ohm' });
  });
  it('an unknown id selects nothing', () => {
    expect(selectPreset(base, 'can-hs-120').preset).toBe('');
  });
});

describe('target line (solve modes)', () => {
  it('names the preset, its source, ledger id and status, and the design-target wording', () => {
    const v = buildPresetView({ preset: 'usb2-hs-90', tolerance: '', solveMode: 'spacing', targetText: '90 ohm' });
    expect(v.targetLine).toMatch(/^target from preset USB 2\.0 high-speed/);
    expect(v.targetLine).toContain('TI SPRAAR7J');
    expect(v.targetLine).toContain('S-026');
    expect(v.targetLine).toContain('VERIFIED');
    expect(v.designTargetLine).toMatch(/^design target from .*, not a compliance statement/);
  });
  it('says so when the target was edited after choosing the preset', () => {
    const v = buildPresetView({ preset: 'usb2-hs-90', tolerance: '', solveMode: 'width', targetText: '85 ohm' });
    expect(v.targetLine).toMatch(/edited/);
    expect(v.targetLine).not.toMatch(/^target from preset/);
  });
  it('has no target line when computing Zdiff', () => {
    expect(buildPresetView({ ...base, preset: 'usb2-hs-90' }).targetLine).toBeUndefined();
  });
});

describe('USB 2.0: tolerance is never defaulted', () => {
  it('offers both source-stated tolerances as separate options with their ledger status', () => {
    const t = toleranceChoices('usb2-hs-90');
    expect(t.map((x) => x.value)).toEqual(['usb2-tol-15', 'usb2-tol-10']);
    for (const x of t) {
      expect(x.ledgerId).toBe('S-026a');
      expect(x.status).toBe('CONFLICT');
      expect(x.label).toContain('S-026a');
      expect(x.label).toContain('CONFLICT');
    }
  });
  it('without a tolerance the comparison is the deviation and the options, with no band statement', () => {
    const v = buildPresetView({ ...base, preset: 'usb2-hs-90', zdiff: z(96) });
    expect(v.comparison?.statement).toMatch(/6\.6667 % above the 90 ohm design target/);
    expect(v.comparison?.statement).toMatch(/No tolerance was selected/);
    expect(v.comparison?.bandTag).toBeUndefined();
    expect(v.toleranceOptions.length).toBe(2);
    expect(v.toleranceNote).toMatch(/choose one/i);
  });
  it('with a chosen tolerance the band is stated as a text tag', () => {
    const inside = buildPresetView({ ...base, preset: 'usb2-hs-90', tolerance: 'usb2-tol-10', zdiff: z(96) });
    expect(inside.comparison?.bandTag).toMatch(/^within the stated \+\/-10 % band/);
    const outside = buildPresetView({ ...base, preset: 'usb2-hs-90', tolerance: 'usb2-tol-10', zdiff: z(110) });
    expect(outside.comparison?.bandTag).toMatch(/^outside the stated \+\/-10 % band/);
    expect(outside.comparison?.status).toBe('UNVERIFIED');
  });
  it('a tolerance that does not belong to the preset is ignored with a note, never used', () => {
    const v = buildPresetView({ ...base, preset: 'ethernet-mdi-100', tolerance: 'usb2-tol-15', zdiff: z(100) });
    expect(v.comparison?.bandTag).toBeUndefined();
    expect(v.notes.join(' ')).toMatch(/does not belong/);
  });
});

describe('LVDS has no PCB tolerance', () => {
  it('says so, offers no tolerance, and lists the informational ranges as not tolerances', () => {
    const v = buildPresetView({ ...base, preset: 'lvds-100', zdiff: z(100) });
    expect(v.toleranceOptions).toEqual([]);
    expect(v.toleranceNote).toMatch(/no PCB tolerance published/);
    expect(v.comparison?.bandTag).toBeUndefined();
    expect(v.info.length).toBe(2);
    expect(v.info.join(' ')).toMatch(/not a PCB trace tolerance/);
  });
});

describe('termination notes (CAN, RS-485)', () => {
  it('are informational, not selectable, and RS-485 carries UNVERIFIED', () => {
    const n = terminationNotes();
    expect(n.map((x) => x.id)).toEqual(['can-hs-120', 'rs485-120']);
    expect(n.find((x) => x.id === 'rs485-120')?.status).toBe('UNVERIFIED');
    expect(n.find((x) => x.id === 'rs485-120')?.ledgerId).toBe('S-026e');
    expect(n.find((x) => x.id === 'can-hs-120')?.ledgerId).toBe('S-026d');
    for (const x of n) expect(x.text).toMatch(/not a (PCB )?controlled-impedance/i);
    expect(presetChoices().some((c) => n.some((x) => x.id === c.value))).toBe(false);
  });
});

describe('wording and source', () => {
  it('no pass/OK/compliance wording anywhere in the view or the source, and the comparison status is UNVERIFIED', () => {
    for (const preset of ['usb2-hs-90', 'ethernet-mdi-100', 'lvds-100']) {
      for (const tolerance of ['', ...toleranceChoices(preset).map((t) => t.value)]) {
        const v = buildPresetView({ preset, tolerance, solveMode: 'zdiff', targetText: '', zdiff: z(100) });
        const text = JSON.stringify(v);
        expect(text).not.toMatch(BAD);
        expect(v.comparison?.status).toBe('UNVERIFIED');
        expect(v.comparison?.statement).toMatch(/design target, not a compliance statement/i);
      }
    }
    expect(JSON.stringify(terminationNotes())).not.toMatch(BAD);
    expect(src).not.toMatch(/Math\.|toFixed|toPrecision|\.si\b/);
    expect(src).not.toMatch(new RegExp(String.raw`(passed?|${'compl'}iant|${'compl'}ies|meets|satisfies)`, 'i')); // source: `result.ok` is code, not wording
  });
  it('a bad zdiff is an error value, never a number', () => {
    const v = buildPresetView({ ...base, preset: 'usb2-hs-90', zdiff: z(-1) });
    expect(v.comparison).toBeUndefined();
    expect(v.notes.join(' ')).toMatch(/greater than zero/);
  });
});
