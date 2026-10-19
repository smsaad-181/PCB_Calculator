// Phase 2 closure, UI side: PCB2-1 band tags, PCB2-2 conflict rows and the limits block, PCB2-3 net-class basis, PCB2-4 profile minimum notes,
// PCB2-8 paper wording, PCB2-11 low-confidence line, PCB2-15 hand-off link, PV2-3 categories. Strings come from the core; nothing is pinned twice.
import { describe, expect, it } from 'vitest';
import { IMPEDANCE_BANNER, STANDING_ASSUMPTION } from '../core/calculators/impedance-shared';
import { LOSS_LABEL } from '../core/calculators/loss-shared';
import { SOLDERMASK_WORDING, MU0_LEDGER_DISPLAY, paywalledPaperRole } from '../core/data/impedance-wording';
import { parseHash } from '../state/hash';
import * as cx from './calculators/coax.vm';
import * as cp from './calculators/cpw.vm';
import * as dm from './calculators/diff-microstrip.vm';
import * as ds from './calculators/diff-stripline.vm';
import { LEDGER_ROLE } from './calculators/impedance.vm';
import * as ms from './calculators/microstrip.vm';
import * as sl from './calculators/stripline.vm';
import { DiffPage } from './components/DiffPage';
import { PresetComparison } from './components/DiffPresets';
import { ImpedanceResults } from './components/ImpedanceCommon';
import { badgeText } from './components/UnverifiedBadge';
import { CATEGORIES, calculatorsIn } from './registry';

interface VNodeLike {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}
const isV = (n: unknown): n is VNodeLike => typeof n === 'object' && n !== null && 'props' in n && 'type' in n;
const textOf = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isV(node)) return typeof node.type === 'function' ? textOf((node.type as (p: unknown) => unknown)(node.props)) : textOf(node.props['children']);
  return '';
};
void DiffPage;

const PASS_WORDS = new RegExp(String.raw`${'compl'}iant|\bpass(ed)?\b|\bOK\b|${'cert'}ified`, 'i');
const MS = { ...ms.DEFAULT_STATE, width: '600 um', height: '635 um', er: '4.1', erSource: 'test value' };
const DM = { ...dm.DEFAULT_STATE, width: '0.3 mm', spacing: '0.15 mm', size: '0.2 mm', er: '4.1', erSource: 'test value' };

function ok<T extends { status: string }>(v: T): Extract<T, { status: 'ok' }> {
  if (v.status !== 'ok') throw new Error(`expected ok: ${JSON.stringify(v)}`);
  return v as Extract<T, { status: 'ok' }>;
}

describe('PCB2-1 and PCB2-16: the band tag names the nominal value and the corners; it works in every solve mode', () => {
  const tol = { tolWidth: '10%', tolSpacing: '10%', tolHeight: '10%', tolEr: '5%' };
  it('nominal tag says "nominal model value", never a bare "within"', () => {
    const v = ok(dm.computeView({ ...DM, preset: 'usb2-hs-90', tolerance: 'usb2-tol-10' }));
    const c = v.preset.comparison;
    expect(c?.bandTag).toMatch(/^nominal model value is (within|outside) the stated \+\/-10 % band$/);
    expect(c?.exclusions).toMatch(/fab tolerance and the model's own accuracy are not included/i);
    expect(c?.envelopeTag).toBeUndefined();
    expect(c?.envelopeNote).toMatch(/no tolerances entered/i);
  });
  it('a second tag appears when the entered tolerance corners leave the band', () => {
    const v = ok(dm.computeView({ ...DM, ...tol, preset: 'usb2-hs-90', tolerance: 'usb2-tol-10' }));
    const c = v.preset.comparison;
    expect(c?.bandTag).toMatch(/^nominal model value is (within|outside)/);
    expect(c?.envelopeTag).toMatch(/^tolerance corners you entered: .*(outside|inside) the stated \+\/-10 % band/i);
    expect(c?.envelopeNote).toBeUndefined();
  });
  it('narrow tolerances put both corners inside the band, still without pass wording', () => {
    const v = ok(dm.computeView({ ...DM, tolWidth: '0.1%', tolSpacing: '0.1%', tolHeight: '0.1%', tolEr: '0.1%', preset: 'usb2-hs-90', tolerance: 'usb2-tol-15' }));
    const c = v.preset.comparison;
    expect(c?.envelopeTag).toMatch(/inside/);
    expect(`${c?.bandTag} ${c?.envelopeTag} ${c?.exclusions}`).not.toMatch(PASS_WORDS);
  });
  it('solve modes compare the solved geometry Zdiff with the band (the tolerance choice has an effect)', () => {
    for (const mode of ['spacing', 'width'] as const) {
      const s = dm.choosePreset({ ...DM, ...tol, solveFor: mode, spacing: mode === 'spacing' ? '' : '0.15 mm', width: mode === 'width' ? '' : '0.3 mm' }, 'usb2-hs-90');
      const none = ok(dm.computeView(s));
      expect(none.preset.comparison?.bandTag).toBeUndefined();
      const v = ok(dm.computeView({ ...s, tolerance: 'usb2-tol-10' }));
      expect(v.preset.comparison?.bandTag).toMatch(/^nominal model value is (within|outside) the stated \+\/-10 % band$/);
      expect(v.preset.comparison?.envelopeTag).toBeDefined();
      expect(v.preset.comparison?.solvedNote).toMatch(/solved geometry/i);
    }
  });
  it('the comparison renders the tags as plain text with the exclusions and no pass styling', () => {
    const v = ok(dm.computeView({ ...DM, ...tol, preset: 'usb2-hs-90', tolerance: 'usb2-tol-10' }));
    const t = textOf(PresetComparison({ view: v.preset }));
    expect(t).toMatch(/nominal model value is/);
    expect(t).toMatch(/not included/);
    expect(t).not.toMatch(PASS_WORDS);
  });
});

describe('PCB2-2: thickness variants are labelled CONFLICT rows beside the headline', () => {
  it('microstrip with t shows variant A Z0, eps_eff and the signed difference from the core', () => {
    const v = ok(ms.computeView({ ...MS, thickness: '35 um' }));
    const rows = Object.fromEntries((v.conflict?.rows ?? []).map((r) => [r.label, r.text]));
    expect(Object.keys(rows)).toEqual([
      'Z0 with thickness variant A (CONFLICT, S-020a)',
      'Effective permittivity with thickness variant A (CONFLICT, S-020a)',
      'Z0 difference, thickness variant A vs zero-thickness headline (CONFLICT, S-020a)',
    ]);
    const note = v.raw.results.find((r) => r.name.startsWith('Z0 difference'))?.note ?? '';
    const pct = /^([+-]?[\d.]+ %)/.exec(note)?.[1];
    expect(pct).toBeDefined();
    expect(rows['Z0 difference, thickness variant A vs zero-thickness headline (CONFLICT, S-020a)']).toBe(pct);
    expect(v.result.rows.some((r) => /thickness variant A/.test(r.label))).toBe(false);
    expect(v.conflict?.notes.some((n) => /labelled secondary result/.test(n.message))).toBe(true);
    const t = textOf(ImpedanceResults({ view: v }));
    expect(t).toMatch(/Z0 with thickness variant A \(CONFLICT, S-020a\)/);
  });
  it('without t there is no conflict block', () => {
    expect(ok(ms.computeView(MS)).conflict).toBeUndefined();
  });
  it('t at or above h explains why the value is not shown', () => {
    const v = ok(ms.computeView({ ...MS, thickness: '700 um' }));
    expect(v.conflict?.rows).toEqual([]);
    expect(v.conflict?.notes.some((n) => /not shown/.test(n.message))).toBe(true);
  });
  it('stripline with a wide strip and t shows the cohn-wide value and its difference', () => {
    const v = ok(sl.computeView({ ...sl.DEFAULT_STATE, width: '0.5 mm', spacing: '0.9 mm', thickness: '35 um', er: '4', erSource: 'test value' }));
    expect((v.conflict?.rows ?? []).map((r) => r.label)).toEqual([
      'Z0 with finite-thickness variant cohn-wide (CONFLICT, S-021a)',
      'Z0 difference, finite-thickness variant cohn-wide vs zero-thickness headline (CONFLICT, S-021a)',
    ]);
  });
  it('a narrow stripline strip gets the core note instead of rows', () => {
    const v = ok(sl.computeView({ ...sl.DEFAULT_STATE, width: '0.1 mm', spacing: '0.9 mm', thickness: '35 um', er: '4', erSource: 'test value' }));
    expect(v.conflict?.rows).toEqual([]);
    expect(v.conflict?.notes.length).toBeGreaterThan(0);
  });
});

describe('PCB2-19: what the model does not include, from core text only', () => {
  it('lists the soldermask sentence of the core once, and the page shows it next to the result', () => {
    const v = ok(ms.computeView({ ...MS, thickness: '35 um' }));
    const items = v.limits?.items ?? [];
    expect(items.filter((i) => i.text.includes(SOLDERMASK_WORDING))).toHaveLength(1);
    expect(items.map((i) => i.title)).toEqual(expect.arrayContaining(['Soldermask or coating', 'Finite copper thickness', 'Frequency dependence']));
    expect(items.some((i) => i.text.includes(LOSS_LABEL))).toBe(true);
    const t = textOf(ImpedanceResults({ view: v }));
    expect(t).toMatch(/What this model does not include/);
    // the same sentence is not repeated in the general warning list
    expect(t.split(SOLDERMASK_WORDING).length - 1).toBe(1);
  });
  it('every page that has the soldermask warning uses the one core wording', () => {
    for (const view of [ms.computeView(MS), dm.computeView(DM), cp.computeView({ ...cp.DEFAULT_STATE, width: '0.3 mm', gap: '0.2 mm', height: '0.2 mm', er: '4', erSource: 't' })]) {
      const v = ok(view);
      const mask = v.limits?.items.find((i) => i.title === 'Soldermask or coating');
      expect(mask?.text).toBe(SOLDERMASK_WORDING);
    }
  });
});

describe('PCB2-3: the net-class text carries its basis', () => {
  const solveMs = { ...MS, solveFor: 'width' as const, width: '', targetZ0: '50 ohm', geometrySource: 'fab stackup rev B', thickness: '35 um' };
  it('microstrip', () => {
    const v = ok(ms.computeView(solveMs, '2026-10-18'));
    const t = v.netClass ?? '';
    expect(t).toContain(v.result.headline.text);
    expect(t).toMatch(/Model: .*Hammerstad-Jensen/);
    expect(t).toMatch(/S-020 /);
    expect(t).toMatch(/er: 4\.1 \(source: test value\)/);
    expect(t).toMatch(/h: 635 µm \(25 mil\)/);
    expect(t).toMatch(/t: 35 µm \(1\.38 mil\), not used by this model/);
    expect(t).toMatch(/Thickness model: zero thickness/);
    expect(t).toMatch(/Geometry source: fab stackup rev B/);
    expect(t).toMatch(/Confidence: (low|medium)/);
    expect(t).toContain(IMPEDANCE_BANNER);
    expect(t).toMatch(/Date: 2026-10-18/);
    expect(t).toMatch(/not a design rule/i);
    expect(v.netClassHelp).toMatch(/trace width for the target Z0/i);
  });
  it('microstrip variant says t was used and which variant', () => {
    const v = ok(ms.computeView({ ...solveMs, thicknessModel: 'hj-procedure-A' }, '2026-10-18'));
    expect(v.netClass).toMatch(/t: 35 µm \(1\.38 mil\), used by the thickness model/);
    expect(v.netClass).toMatch(/Thickness model: hj-procedure-A/);
  });
  it('stripline uses b', () => {
    const v = ok(sl.computeView({ ...sl.DEFAULT_STATE, solveFor: 'width', targetZ0: '50 ohm', spacing: '0.4 mm', er: '4', erSource: 'laminate sheet' }, '2026-10-18'));
    expect(v.netClass).toMatch(/b: 0\.4 mm/);
    expect(v.netClass).toMatch(/er: 4 \(source: laminate sheet\)/);
    expect(v.netClass).toMatch(/Geometry source: not given/);
  });
  it('diff pairs and coplanar carry the same basis, and name the solved quantity', () => {
    const s = dm.choosePreset({ ...DM, solveFor: 'spacing', spacing: '', thickness: '35 um', geometrySource: 'fab rev C' }, 'usb2-hs-90');
    const v = ok(dm.computeView(s, '2026-10-18'));
    expect(v.netClass).toMatch(/h: 200 µm/);
    expect(v.netClass).toMatch(/t: 35 µm \(1\.38 mil\), not used by this model/);
    expect(v.netClass).toMatch(/Model: /);
    expect(v.netClass).toMatch(/S-022 PAYWALLED-USER-MUST-VERIFY/);
    expect(v.netClass).toMatch(/Date: 2026-10-18/);
    expect(v.netClassHelp).toMatch(/edge spacing/i);
    expect(v.netClassHelp).not.toMatch(/solved width/i);
    const w = ok(dm.computeView({ ...s, solveFor: 'width', width: '', spacing: '0.15 mm' }, '2026-10-18'));
    expect(w.netClassHelp).toMatch(/trace width/i);
    const c = ok(cp.computeView({ ...cp.DEFAULT_STATE, solveFor: 'gap', gap: '', width: '0.3 mm', targetZ0: '50 ohm', height: '0.2 mm', er: '4', erSource: 't' }, '2026-10-18'));
    expect(c.netClassHelp).toMatch(/gap/i);
    expect(c.netClass).toMatch(/h: 200 µm/);
    const d = ok(ds.computeView({ ...ds.DEFAULT_STATE, solveFor: 'spacing', targetZ: '90 ohm', width: '0.15 mm', size: '0.4 mm', er: '4', erSource: 't' }, '2026-10-18'));
    expect(d.netClass).toMatch(/b: 0\.4 mm/);
  });
  it('with no date the text says so instead of inventing one', () => {
    expect(ok(ms.computeView(solveMs)).netClass).toMatch(/Date: not available/);
  });
});

describe('PCB2-4: the fab profile minimum notes show next to the result, without needing tolerances', () => {
  const prof = { profile: 'bundled', layerCount: '2', layerSide: 'outer', copperWeight: '1 oz' };
  const solve = { ...MS, solveFor: 'width' as const, width: '', targetZ0: '50 ohm' };
  it('no profile chosen: a plain note says nothing was checked', () => {
    const v = ok(ms.computeView(solve, '2026-10-18'));
    expect(v.near?.notes.map((n) => n.message).join(' ')).toMatch(/[Ww]idth\/spacing not checked against any fab minimum/);
  });
  it('a chosen profile with a scope gives the core note: below, or meets, never a verdict', () => {
    const below = ok(ms.computeView({ ...MS, ...prof, width: '50 um' }, '2026-10-18'));
    const b = below.near?.notes.find((n) => n.code === 'BELOW_PROFILE_MINIMUM');
    expect(b?.severity).toBe('warning');
    expect(below.near?.unverified).toBe(true);
    const meets = ok(ms.computeView({ ...MS, ...prof, width: '0.3 mm' }, '2026-10-18'));
    const m = meets.near?.notes.find((n) => n.code === 'MEETS_PROFILE_MINIMUM');
    expect(m?.message).toMatch(/meets the profile minimum/);
    expect(meets.near?.notes.some((n) => /not checked against any fab minimum/.test(n.message))).toBe(false);
    expect(`${b?.message} ${m?.message}`).not.toMatch(PASS_WORDS);
    expect(meets.result.warnings.some((w) => /profile minimum/.test(w.message))).toBe(false);
  });
  it('a solved width is checked too', () => {
    const v = ok(ms.computeView({ ...solve, ...prof, targetZ0: '95 ohm' }, '2026-10-18'));
    expect(v.near?.notes.some((n) => n.code === 'BELOW_PROFILE_MINIMUM' || n.code === 'MEETS_PROFILE_MINIMUM')).toBe(true);
  });
  it('a profile without a complete scope gives the core "not checked" caution and still a result', () => {
    const v = ok(ms.computeView({ ...MS, profile: 'bundled', width: '0.3 mm' }, '2026-10-18'));
    expect(v.near?.notes.some((n) => n.code === 'PROFILE_MINIMUM_NOT_CHECKED')).toBe(true);
  });
  it('profile "none" is the same as no profile', () => {
    const v = ok(ms.computeView({ ...MS, profile: 'none' }, '2026-10-18'));
    expect(v.near?.notes.map((n) => n.message).join(' ')).toMatch(/not checked against any fab minimum/);
  });
  it('the profile choice is offered on the pages for width, spacing or gap, and round-trips in the link', () => {
    const f = ms.extForm({ ...MS, ...prof }, '2026-10-18');
    expect(f.offerProfile).toBe(true);
    expect(f.banner?.unverified).toBe(true);
    expect(f.hasProfile).toBe(true);
    expect(cx.extForm({ ...cx.DEFAULT_STATE }, '2026-10-18').offerProfile).toBe(false);
    const back = ms.fromHashState(parseHash(`#/calc/microstrip?v=1&fp=${encodeURIComponent(ms.toHashState({ ...MS, ...prof }).fp ?? '')}&lc=2&ls=outer`).state);
    expect(back.state.profile).toBe('bundled');
  });
  it('coax has no width/spacing, so no note', () => {
    const v = ok(cx.computeView({ ...cx.DEFAULT_STATE, outerDiameter: '3.5 mm', innerDiameter: '1 mm', er: '2.1', erSource: 't' }, '2026-10-18'));
    expect(v.near).toBeUndefined();
  });
});

describe('PCB2-8: paywalled paper rows and mu0', () => {
  it('S-022, S-022a and S-023a use the core paper wording', () => {
    for (const id of ['S-022', 'S-022a', 'S-023a']) {
      const role = paywalledPaperRole(id);
      expect(role).toBeDefined();
      expect(LEDGER_ROLE[id]).toContain(role as string);
      expect(LEDGER_ROLE[id]).not.toMatch(/licensed copy/);
    }
    expect(LEDGER_ROLE['S-013']).toContain(MU0_LEDGER_DISPLAY);
  });
  it('the badge says paper for a paper row and keeps the standard wording for a standard row', () => {
    expect(badgeText('PAYWALLED-USER-MUST-VERIFY', ['S-022'])).toMatch(/primary source is a paywalled paper; not read by this project/i);
    expect(badgeText('PAYWALLED-USER-MUST-VERIFY', ['S-022'])).not.toMatch(/licensed copy/);
    expect(badgeText('PAYWALLED-USER-MUST-VERIFY', ['S-003'])).toMatch(/compare with your licensed copy/);
    const mixed = badgeText('PAYWALLED-USER-MUST-VERIFY', ['S-022', 'S-003']) ?? '';
    expect(mixed).toMatch(/paywalled paper/);
    expect(mixed).toMatch(/licensed copy/);
  });
});

describe('PCB2-9, PCB2-10, PCB2-11, PCB2-15', () => {
  const COAX = { ...cx.DEFAULT_STATE, outerDiameter: '2.95 mm', innerDiameter: '0.9 mm', er: '2.25', erSource: 'cable datasheet' };
  it('coax does not talk about a stackup', () => {
    const v = ok(cx.computeView(COAX));
    expect(v.result.details.assumptions.join(' ')).not.toContain(STANDING_ASSUMPTION);
    expect(v.result.details.assumptions.join(' ')).toMatch(/cable dimensions and dielectric not verified against the cable datasheet/);
    expect(v.result.details.assumptions.join(' ')).not.toMatch(/stackup \(er, h, t\)/);
  });
  it('a low-confidence result carries the plain-language line; a medium one does not', () => {
    const low = ok(dm.computeView(DM));
    expect(low.result.confidence.level).toBe('low');
    expect(low.lowNote).toMatch(/Low means the model's source is conflicting or paywalled, not that the number is wrong: verify with your fabricator/);
    expect(textOf(ImpedanceResults({ view: low }))).toMatch(/not that the number is wrong/);
    const med = ok(cx.computeView(COAX));
    if (med.result.confidence.level !== 'low') expect(med.lowNote).toBeUndefined();
  });
  it('the loss label is shown once per block, not on every row', () => {
    const v = ok(ms.computeView({ ...MS, frequency: '1 GHz', length: '100 mm', lossTangent: '0.02', lossSource: 'datasheet, test value' }));
    expect(v.loss?.caption).toBe(LOSS_LABEL);
    for (const r of v.loss?.rows ?? []) expect(r.hint ?? '').not.toContain(LOSS_LABEL);
  });
  it('the eps_eff hand-off is a plain link to the quarter-wave page carrying only ee', () => {
    const v = ok(ms.computeView(MS));
    expect(v.handoff?.href).toMatch(/^#\/calc\/quarter-wave\?v=1&ee=2\.96\d+$/);
    const parsed = parseHash(v.handoff?.href ?? '');
    expect(Object.keys(parsed.state).sort()).toEqual(['ee']);
    expect(textOf(ImpedanceResults({ view: v }))).toMatch(/eps_eff -> quarter-wave/);
    expect(ok(dm.computeView(DM)).handoff).toBeUndefined();
  });
});

describe('PV2-3: no empty Routing category', () => {
  it('every category has at least one calculator', () => {
    for (const c of CATEGORIES) expect(calculatorsIn(c.id).length, c.id).toBeGreaterThan(0);
    expect(CATEGORIES.map((c) => c.id)).not.toContain('routing');
  });
});

describe('PCB2-5 and PV2-6: stackup refusal next step, import size cap', async () => {
  const vmMod = await import('./components/stackup.vm');
  it('has a next-step line and caps the import and the stored draft at the core text limit', () => {
    expect(vmMod.NEXT_STEP).toMatch(/fabricator.*field-solver.*approximate b or h/);
    expect(vmMod.MAX_IMPORT_CHARS).toBe(200000);
    const huge = { getItem: () => ' '.repeat(vmMod.MAX_IMPORT_CHARS + 1), setItem: () => undefined };
    expect(vmMod.loadStored(huge, 'k')).toEqual(vmMod.loadStored(null, 'k'));
  });
});
