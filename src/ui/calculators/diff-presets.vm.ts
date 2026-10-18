// View-model for the protocol preset picker of the differential pages. Pure: no DOM, no engineering math.
// Everything shown comes from src/core/data/impedance-presets (data and compareToPreset); nothing is typed in again here.
// A preset is a DESIGN TARGET from application notes and layout guides, never a statement about an interface standard.
import { IMPEDANCE_PRESETS, compareToPreset, presetById, type ImpedancePreset, type ToleranceOption } from '../../core/data/impedance-presets';
import type { LedgerStatus } from '../../core/data/ledger';
import type { Quantity } from '../../core/units';

export type SolveMode = 'zdiff' | 'spacing' | 'width';

/** The slice of a page state the preset logic reads and writes. */
export interface PresetInput {
  readonly preset: string;
  readonly tolerance: string;
  readonly solveMode: SolveMode;
  readonly targetText: string;
  /** The computed Zdiff when the page has a result (analysis mode); undefined otherwise. */
  readonly zdiff?: Quantity;
}

export const PRESET_PLACEHOLDER = 'No preset (optional)';
export const PRESET_HELP =
  'Optional. A preset only fills the target Zdiff field (when you solve for a width or a spacing) or compares the computed Zdiff with the design target (when you compute Zdiff). It never changes er or the geometry. The targets come from application notes and layout guides; the interface standards were not read.';
export const NO_TOLERANCE_LABEL = 'No tolerance chosen (show the deviation only)';

const targetPresets = (): readonly ImpedancePreset[] => IMPEDANCE_PRESETS.filter((p) => p.kind === 'differential-target');
const isOffered = (id: string): boolean => targetPresets().some((p) => p.id === id);
const sourcesOf = (p: ImpedancePreset): string => p.sources.map((s) => s.document).join('; ');

/** The selectable presets (differential-target kind only), in the order of the data. */
export function presetChoices(): readonly { readonly value: string; readonly label: string }[] {
  return targetPresets().map((p) => ({ value: p.id, label: p.label }));
}

/** Ids a link may carry for the preset choice. */
export function offeredPresetIds(): readonly string[] {
  return targetPresets().map((p) => p.id);
}

/** Ids a link may carry for the tolerance choice (every tolerance of every offered preset). */
export function offeredToleranceIds(): readonly string[] {
  return targetPresets().flatMap((p) => p.tolerances.map((t) => t.id));
}

/** Text a resistance field parses: the design target of the preset, for example "90 ohm". */
export function presetTargetText(id: string): string | undefined {
  const p = isOffered(id) ? presetById(id) : undefined;
  return p === undefined ? undefined : `${String(p.nominalOhm)} ohm`;
}

export interface ToleranceChoice {
  readonly value: string;
  readonly label: string;
  /** The source wording as recorded in the data. */
  readonly hint: string;
  readonly ledgerId: string;
  readonly status: LedgerStatus;
}

const toChoice = (t: ToleranceOption): ToleranceChoice => ({
  value: t.id,
  label: `+/-${String(t.value)} % (ledger ${t.ledgerId}, status ${t.status})`,
  hint: t.source,
  ledgerId: t.ledgerId,
  status: t.status,
});

/** The tolerances the sources state for a preset, each a separate choice. There is no default among them. */
export function toleranceChoices(presetId: string): readonly ToleranceChoice[] {
  const p = isOffered(presetId) ? presetById(presetId) : undefined;
  return p === undefined ? [] : p.tolerances.map(toChoice);
}

/** Applies a preset choice to the slice of state it touches. An id that is not offered selects nothing. */
export function selectPreset<T extends PresetInput>(s: T, id: string): T {
  if (id === '' || !isOffered(id)) return { ...s, preset: '', tolerance: '' };
  const target = presetTargetText(id);
  return { ...s, preset: id, tolerance: '', ...(s.solveMode !== 'zdiff' && target !== undefined ? { targetText: target } : {}) };
}

export interface TerminationNote {
  readonly id: string;
  readonly heading: string;
  readonly text: string;
  readonly sources: readonly string[];
  readonly ledgerId: string;
  readonly status: LedgerStatus;
}

/** CAN and RS-485: cable and termination notes. Informational; never offered as a PCB target. */
export function terminationNotes(): readonly TerminationNote[] {
  return IMPEDANCE_PRESETS.filter((p) => p.kind === 'termination-note').map((p) => ({
    id: p.id,
    heading: `${p.interface}: ${String(p.nominalOhm)} ohm (termination note)`,
    text: `${p.scope} ${p.note} This is not a controlled-impedance PCB target, so it cannot be chosen above. ${p.disclaimer}`,
    sources: p.sources.map((s) => s.document),
    ledgerId: p.ledgerId,
    status: p.status,
  }));
}

export interface PresetView {
  readonly selected: null | {
    readonly id: string;
    readonly label: string;
    readonly targetText: string;
    readonly scope: string;
    readonly note: string;
    readonly ledgerId: string;
    readonly status: LedgerStatus;
    readonly sources: readonly string[];
  };
  /** "design target from <source>, not a compliance statement". */
  readonly designTargetLine?: string;
  /** Solve modes: where the target field value came from. */
  readonly targetLine?: string;
  readonly toleranceOptions: readonly ToleranceChoice[];
  /** What to tell the user about tolerance: choose one, or that none is published. */
  readonly toleranceNote?: string;
  /** Informational ranges that are not PCB tolerances (LVDS). */
  readonly info: readonly string[];
  readonly comparison?: { readonly statement: string; readonly bandTag?: string; readonly status: 'UNVERIFIED' };
  readonly notes: readonly string[];
}

const EMPTY: PresetView = { selected: null, toleranceOptions: [], info: [], notes: [] };

export function buildPresetView(i: PresetInput): PresetView {
  if (i.preset === '') return EMPTY;
  const p = isOffered(i.preset) ? presetById(i.preset) : undefined;
  if (p === undefined) return { ...EMPTY, notes: ['The preset in the link is not one this page offers and is ignored.'] };
  const notes: string[] = [];
  const options = toleranceChoices(p.id);
  const sources = p.sources.map((s) => s.document);
  const target = presetTargetText(p.id) ?? '';
  const toleranceNote =
    options.length === 0
      ? 'no PCB tolerance published in the sources read: none is offered and none is assumed.'
      : 'The sources state more than one tolerance (or one that differs by source): choose one to get a band statement. No tolerance is chosen for you.';
  const designTargetLine = `design target from ${sourcesOf(p)}, not a compliance statement`;

  let targetLine: string | undefined;
  if (i.solveMode !== 'zdiff') {
    targetLine =
      i.targetText.trim() === target
        ? `target from preset ${p.label} (source: ${sourcesOf(p)}; ledger ${p.ledgerId}, status ${p.status})`
        : `target edited by you after choosing preset ${p.label}: the value in the field is yours, not the preset's (preset source: ledger ${p.ledgerId}, status ${p.status}).`;
  }

  let tolerance = i.tolerance;
  if (tolerance !== '' && !options.some((o) => o.value === tolerance)) {
    notes.push(`The tolerance "${tolerance}" does not belong to this preset and is ignored; no band is evaluated.`);
    tolerance = '';
  }

  let comparison: PresetView['comparison'];
  if (i.zdiff !== undefined && i.solveMode === 'zdiff') {
    const c = compareToPreset(i.zdiff, p.id, tolerance === '' ? undefined : tolerance);
    if (!c.ok) notes.push(c.error.message);
    else {
      const t = c.value.tolerance;
      comparison = {
        statement: c.value.statement,
        status: c.value.comparisonStatus,
        ...(t !== undefined ? { bandTag: `${t.within ? 'within' : 'outside'} the stated +/-${String(t.value)} % band` } : {}),
      };
    }
  }
  return {
    selected: { id: p.id, label: p.label, targetText: target, scope: p.scope, note: p.note, ledgerId: p.ledgerId, status: p.status, sources },
    designTargetLine,
    ...(targetLine !== undefined ? { targetLine } : {}),
    toleranceOptions: options,
    toleranceNote,
    info: p.info.map((r) => `${r.label}: ${String(r.minOhm)} to ${String(r.maxOhm)} ohm (${r.scope}; ledger ${r.ledgerId}, status ${r.status})`),
    ...(comparison !== undefined ? { comparison } : {}),
    notes,
  };
}
