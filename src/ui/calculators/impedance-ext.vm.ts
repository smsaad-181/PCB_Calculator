// Shared view-model for the two optional sections of the impedance pages: "Tolerances and sensitivity" and "Loss estimate".
// Pure: no DOM, no engineering math. It parses what the user typed, builds the extra core inputs (tolerances, fab profile and
// scope, loss tangent and its source, resistivity) and turns the core result into display strings. The envelope, the
// sensitivities and the loss numbers all come from the core result (impedance-envelope.ts, loss-shared.ts through the calculators).
import { LOSS_LABEL } from '../../core/calculators/loss-shared';
import { DIM, q, type Quantity } from '../../core/units';
import { echoPrefs } from '../components/prefs';
import { MAX_FIELD_CHARS, parseField, type FieldView } from '../components/view';
import { profileBanner, type ProfileBanner } from './fab-profile-banner';
import { bundledProfile, choiceFromHash, choiceToHash, isProfileChoice, type ProfileChoice } from './fab-profile-choice';
import type { ChoiceDef, TextDef } from './impedance.vm';
import {
  EMPTY_TOL,
  collectTolerances,
  decodeTol,
  isTolEmpty,
  tolProblems,
  type TolFieldDef,
  type TolInput,
  type TolState,
} from './tolerance-view';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export type ExtTolKey = 'tolWidth' | 'tolHeight' | 'tolSpacing' | 'tolEr' | 'tolThickness' | 'tolOuter' | 'tolInner';

/** The extra form state of every impedance page. Strings are exactly what was typed; empty means "not entered"; nothing is pre-filled. */
export type ExtState = {
  /** Tolerance text per input: "5%" for one value or "3%|10%" for minus|plus (the encoding of tolerance-view encodeTol, kept even while empty). */
  readonly tolWidth: string;
  readonly tolHeight: string;
  readonly tolSpacing: string;
  readonly tolEr: string;
  readonly tolThickness: string;
  readonly tolOuter: string;
  readonly tolInner: string;
  /** Fab profile: '' not chosen (the default, never pre-selected), 'none', 'bundled'. */
  readonly profile: string;
  /** '1' when the width (or the gap or spacing) tolerance is taken from the fab profile; '' otherwise. */
  readonly profWidth: string;
  readonly profSpacing: string;
  readonly layerCount: string;
  readonly layerSide: string;
  readonly copperWeight: string;
  readonly lossTangent: string;
  readonly lossSource: string;
  readonly resistivity: string;
};

export const EXT_DEFAULTS: ExtState = Object.freeze({
  tolWidth: '',
  tolHeight: '',
  tolSpacing: '',
  tolEr: '',
  tolThickness: '',
  tolOuter: '',
  tolInner: '',
  profile: '',
  profWidth: '',
  profSpacing: '',
  layerCount: '',
  layerSide: '',
  copperWeight: '',
  lossTangent: '',
  lossSource: '',
  resistivity: '',
});

export const EXT_TOL_HASH: Readonly<Record<ExtTolKey, string>> = {
  tolWidth: 'kw',
  tolHeight: 'kh',
  tolSpacing: 'ks',
  tolEr: 'ke',
  tolThickness: 'kt',
  tolOuter: 'ko',
  tolInner: 'ki',
};

/** Longest tolerance text: two sides of 40 characters and the separator (the caps of tolerance-view decodeTol). */
export const MAX_TOL_CHARS = 2 * MAX_FIELD_CHARS + 1;
/** Longest free-text source note (the core refuses more than 500; the link carries at most this many). */
export const MAX_SOURCE_CHARS = 200;

export const LAYER_COUNT_VALUES: readonly string[] = ['1', '2', 'multilayer'];
export const LAYER_SIDE_VALUES: readonly string[] = ['inner', 'outer'];
export const LAYER_COUNT_CHOICES: readonly { value: string; label: string }[] = [
  { value: '', label: 'Not given' },
  { value: '1', label: '1 layer' },
  { value: '2', label: '2 layers' },
  { value: 'multilayer', label: 'Multilayer (4 or more)' },
];
export const LAYER_SIDE_CHOICES: readonly { value: string; label: string }[] = [
  { value: '', label: 'Not given' },
  { value: 'outer', label: 'Outer layer' },
  { value: 'inner', label: 'Inner layer' },
];

// ---------------------------------------------------------------------------
// Per page definition
// ---------------------------------------------------------------------------
export interface ExtTolDef {
  /** Core tolerance key (tolerances.<core>). */
  readonly core: string;
  readonly state: ExtTolKey;
  /** What the tolerance is on, for example "Trace width w". */
  readonly label: string;
  /** State key of the input the tolerance is on: it is offered only when that input is active and was entered. */
  readonly input: string;
  /** A width or a gap/spacing can take a fab-profile value ('profWidth' or 'profSpacing' holds the choice). */
  readonly profile?: 'profWidth' | 'profSpacing';
  /** The copper thickness: offered only when the thickness model of the page actually uses it. */
  readonly thickness?: boolean;
  readonly help: string;
}

export interface ExtSpec {
  readonly tol: readonly ExtTolDef[];
  /** True when the page's thickness model uses the entered thickness (the opt-in variants). Needed with a thickness def. */
  readonly thicknessUsed?: (s: Record<string, string>) => boolean;
  /** True for a page with no loss estimate (the quarter-wave helper): its state and link carry no loss keys. */
  readonly noLoss?: boolean;
}

export const PROFILE_WIDTH_LABEL = 'width';
export const NOT_USED_THICKNESS = 'The selected model does not use the thickness, so a tolerance on it would have no effect; it is not offered. Choose a thickness variant that uses it to tolerance it.';

export function canTakeProfile(ext: ExtSpec): boolean {
  return ext.tol.some((d) => d.profile !== undefined);
}

function entered(s: Record<string, string>, key: string): boolean {
  return (s[key] ?? '').trim() !== '';
}

/** True when the input a tolerance is on was supplied by the user (active in the current solve mode, and entered). */
export function isOffered(ext: ExtSpec, d: ExtTolDef, s: Record<string, string>, active: readonly string[]): boolean {
  if (!active.includes(d.input) || !entered(s, d.input)) return false;
  if (d.thickness === true) return ext.thicknessUsed?.(s) === true;
  return true;
}

const SUPPLIED_ONLY = 'Only offered for an input you entered.';

export const EXT_TEXT_LABEL: Readonly<Record<string, string>> = {
  lossTangent: 'Loss tangent tan delta',
  lossSource: 'Source of the loss tangent',
  resistivity: 'Conductor resistivity',
  copperWeight: 'Ordered copper weight',
  layerCount: 'Layer count',
  layerSide: 'Layer side',
};

// ---------------------------------------------------------------------------
// Hash definitions (one place for every page; keys documented in state/hash.ts)
// ---------------------------------------------------------------------------
export function extTextDefs(ext: ExtSpec): TextDef[] {
  const defs: TextDef[] = ext.tol.map((d) => ({ key: d.state, label: `${d.label} tolerance`, hash: EXT_TOL_HASH[d.state], kind: 'note', max: MAX_TOL_CHARS }));
  if (ext.noLoss !== true) {
    defs.push(
      { key: 'lossTangent', label: EXT_TEXT_LABEL['lossTangent'] ?? 'Loss tangent', hash: 'td', kind: 'note', max: MAX_FIELD_CHARS },
      { key: 'lossSource', label: EXT_TEXT_LABEL['lossSource'] ?? 'Loss tangent source', hash: 'ds', kind: 'note', max: MAX_SOURCE_CHARS },
      { key: 'resistivity', label: EXT_TEXT_LABEL['resistivity'] ?? 'Resistivity', hash: 'rho', kind: 'note', max: MAX_FIELD_CHARS },
    );
  }
  if (canTakeProfile(ext)) defs.push({ key: 'copperWeight', label: EXT_TEXT_LABEL['copperWeight'] ?? 'Copper weight', hash: 'cw', kind: 'note', max: MAX_FIELD_CHARS });
  return defs;
}

export function extChoiceDefs(ext: ExtSpec): ChoiceDef[] {
  if (!canTakeProfile(ext)) return [];
  const defs: ChoiceDef[] = [
    { key: 'layerCount', hash: 'lc', values: LAYER_COUNT_VALUES, notice: 'The layer count was not recognised: none is given.' },
    { key: 'layerSide', hash: 'ls', values: LAYER_SIDE_VALUES, notice: 'The layer side was not recognised: none is given.' },
  ];
  if (ext.tol.some((d) => d.profile === 'profWidth')) defs.push({ key: 'profWidth', hash: 'pw', values: ['1'], notice: 'The fab-profile width tolerance choice was not recognised: it is not used.' });
  if (ext.tol.some((d) => d.profile === 'profSpacing')) defs.push({ key: 'profSpacing', hash: 'ps', values: ['1'], notice: 'The fab-profile spacing tolerance choice was not recognised: it is not used.' });
  return defs;
}

/** Writes the fab profile (reserved key fp). Only pages that can take a profile write it. */
export function extProfileToHash(ext: ExtSpec, s: Record<string, string>, out: Record<string, string>): void {
  if (!canTakeProfile(ext)) return;
  const p = s['profile'] ?? '';
  const fp = isProfileChoice(p) ? choiceToHash(p) : undefined;
  if (fp !== undefined) out['fp'] = fp;
}

export function extProfileFromHash(ext: ExtSpec, h: Readonly<Record<string, string>>, out: Record<string, string>, notices: string[]): void {
  if (!canTakeProfile(ext)) return;
  const fp = h['fp'];
  if (fp !== undefined) {
    const c = choiceFromHash(fp);
    if (c !== undefined) out['profile'] = c;
    else notices.push('The fab profile in the link is not one this version knows: no profile is chosen. Choose one, or none.');
  }
  if (out['profile'] !== 'bundled' && ((out['profWidth'] ?? '') !== '' || (out['profSpacing'] ?? '') !== '')) {
    out['profWidth'] = '';
    out['profSpacing'] = '';
    notices.push('The link asked for a fab-profile tolerance but names no usable fab profile: the choice was ignored. Choose a fab profile, then the tolerance choice.');
  }
}

// ---------------------------------------------------------------------------
// Tolerance text kept in the page state
// ---------------------------------------------------------------------------
/** State text of a tolerance as typed (an asymmetric pair keeps its separator even while both sides are empty). */
export function rawTol(t: TolInput): string {
  return t.asym ? `${t.minus}|${t.plus}` : t.both;
}

const SINK: string[] = [];
export function tolOf(s: Record<string, string>, key: ExtTolKey): TolInput {
  const v = s[key];
  return v === undefined || v === '' ? EMPTY_TOL : decodeTol(v, SINK, key);
}

// ---------------------------------------------------------------------------
// Loss tangent and resistivity
// ---------------------------------------------------------------------------
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
export const LOSS_TANGENT_HELP =
  'Required for a loss estimate and never filled in for you: take tan delta from the laminate datasheet at your frequency. Df varies with frequency (ledger S-027, UNVERIFIED), so use the value for the frequency you enter above.';
export const LOSS_SOURCE_HELP = 'Required with the loss tangent. Say where it came from (product, revision, test frequency). It is echoed in the result inputs and is not checked.';
export const RESISTIVITY_HELP = 'Optional. Leave empty for copper at 20 °C (ledger S-004, shown as a default in the result); enter your own, for example from a plating datasheet, to change it. Only used with a loss tangent.';
export const LOSS_INTRO =
  `Optional. A rough attenuation estimate (dielectric, and conductor loss where a form is recorded): ${LOSS_LABEL}. It uses the Frequency (required for loss) and the Line length fields above.`;

/** A plain number (tan delta, dimensionless). Input validation only; the core refuses negative values and values of 1 or more. */
export function parseLossTangent(text: string): FieldView {
  const t = text.trim();
  if (t === '') return { status: 'empty' };
  if (t.length > MAX_FIELD_CHARS) return { status: 'error', message: `Too long (at most ${String(MAX_FIELD_CHARS)} characters).` };
  if (!PLAIN_NUMBER.test(t)) return { status: 'error', message: 'Enter tan delta as a plain number without a unit, from the laminate datasheet.' };
  const n = Number(t);
  if (!Number.isFinite(n)) return { status: 'error', message: 'The value is not a finite number.' };
  return { status: 'ok', value: q(n, DIM.DIMENSIONLESS), echo: `= ${t} (loss tangent tan delta, dimensionless)`, warnings: [] };
}

export function parseResistivity(text: string): FieldView {
  return parseField(text, DIM.RESISTIVITY, echoPrefs('metric', 'other'));
}

export function parseCopperWeight(text: string): FieldView {
  return parseField(text, DIM.AREAL_MASS, echoPrefs('metric', 'other'));
}

// ---------------------------------------------------------------------------
// Collecting the extra core inputs
// ---------------------------------------------------------------------------
export interface ExtCollected {
  /** Keys to merge into the core input object (tolerances, fabProfile, today, profileScope, lossTangent, lossTangentSource, resistivity). */
  readonly inputs: Record<string, unknown>;
  readonly problems: string[];
  /** Error text per STATE key (a tolerance, the loss tangent, the resistivity, the scope). */
  readonly fieldErrors: Record<string, string>;
  /** What is still missing before the main result can be shown (the fab-profile scope). */
  readonly needs: string[];
  /** What is missing before a loss estimate can be shown; the main result is still shown. */
  readonly lossNeeds: string[];
  readonly fields: readonly TolFieldDef[];
}

export interface CollectOptions {
  readonly today: string | undefined;
  readonly hasFrequency: boolean;
}

function flagOf(s: Record<string, string>, d: ExtTolDef): boolean {
  return d.profile !== undefined && s['profile'] === 'bundled' && s[d.profile] === '1';
}

export function tolFieldDefs(ext: ExtSpec, s: Record<string, string>, active: readonly string[]): TolFieldDef[] {
  return ext.tol.map((d): TolFieldDef => {
    const offered = isOffered(ext, d, s, active);
    const whyNot = d.thickness === true && !offered && entered(s, d.input) && active.includes(d.input) ? NOT_USED_THICKNESS : undefined;
    return {
      key: d.core,
      hash: EXT_TOL_HASH[d.state],
      id: `tol-${d.core}`,
      label: d.label,
      kind: 'relative',
      offered,
      help: `${d.help} ${SUPPLIED_ONLY}`,
      ...(whyNot !== undefined ? { whyNot } : {}),
      ...(offered && flagOf(s, d) ? { fromProfile: true } : {}),
    };
  });
}

export function collectExt(ext: ExtSpec, s: Record<string, string>, active: readonly string[], o: CollectOptions): ExtCollected {
  const inputs: Record<string, unknown> = {};
  const problems: string[] = [];
  const fieldErrors: Record<string, string> = {};
  const needs: string[] = [];
  const lossNeeds: string[] = [];
  const fields = tolFieldDefs(ext, s, active);
  const stateOf = (core: string): ExtTolKey | undefined => ext.tol.find((d) => d.core === core)?.state;

  // tolerances: only the inputs the user supplied; nothing is defaulted
  const tolState: Record<string, TolInput> = {};
  for (const d of ext.tol) tolState[d.core] = tolOf(s, d.state);
  const col = collectTolerances(fields, tolState as TolState, '');
  for (const [core, message] of Object.entries(col.errors)) {
    const k = stateOf(core);
    if (k !== undefined) fieldErrors[k] = message;
  }
  problems.push(...tolProblems(col.errors, fields));
  if (col.tolerances !== undefined) inputs['tolerances'] = col.tolerances;

  // fab profile: needed for a width or gap tolerance taken from it (then the scope is required) and, when a profile is chosen, for the
  // minimum width/spacing note (then an incomplete scope is not an error: the core says the minimum was not checked)
  const profileWanted = col.tolerances !== undefined && Object.values(col.tolerances).some((v) => v === 'profile');
  const profileChosen = canTakeProfile(ext) && s['profile'] === 'bundled';
  if (profileWanted || profileChosen) {
    const scope: Record<string, unknown> = {};
    if (!LAYER_COUNT_VALUES.includes(s['layerCount'] ?? '')) {
      if (profileWanted) needs.push('Choose the layer count for the fab-profile tolerance lookup (the profile entry is used only for the exact scope).');
    } else scope['layerCount'] = s['layerCount'];
    if (!LAYER_SIDE_VALUES.includes(s['layerSide'] ?? '')) {
      if (profileWanted) needs.push('Choose the layer side (inner or outer) for the fab-profile tolerance lookup.');
    } else scope['layerSide'] = s['layerSide'];
    if (entered(s, 'copperWeight')) {
      const w = parseCopperWeight(s['copperWeight'] ?? '');
      if (w.status === 'error') {
        problems.push(`${EXT_TEXT_LABEL['copperWeight'] ?? 'Copper weight'}: ${w.message}`);
        fieldErrors['copperWeight'] = w.message;
      } else if (w.status === 'ok') scope['copperWeight'] = w.value;
    }
    const p = bundledProfile();
    if (p === null) {
      if (profileWanted) problems.push('The bundled fab profile could not be read: no profile tolerance can be applied.');
    } else if (o.today === undefined || o.today === '') {
      if (profileWanted) problems.push("Today's date is not available, so the fab profile age cannot be checked: no profile tolerance can be applied.");
    } else {
      inputs['fabProfile'] = p;
      inputs['today'] = o.today;
      inputs['profileScope'] = scope;
    }
  }

  // loss estimate: asked for by giving a loss tangent; the rest is checked here so a missing piece is a message, not a number
  if (ext.noLoss === true) return { inputs, problems, fieldErrors, needs, lossNeeds, fields };
  const lossText = s['lossTangent'] ?? '';
  const parsedTan = parseLossTangent(lossText);
  if (parsedTan.status === 'error') {
    problems.push(`${EXT_TEXT_LABEL['lossTangent'] ?? 'Loss tangent'}: ${parsedTan.message}`);
    fieldErrors['lossTangent'] = parsedTan.message;
  }
  let rho: Quantity | undefined;
  if (entered(s, 'resistivity')) {
    const r = parseResistivity(s['resistivity'] ?? '');
    if (r.status === 'error') {
      problems.push(`${EXT_TEXT_LABEL['resistivity'] ?? 'Resistivity'}: ${r.message}`);
      fieldErrors['resistivity'] = r.message;
    } else if (r.status === 'ok') rho = r.value;
  }
  const source = (s['lossSource'] ?? '').trim();
  if (parsedTan.status === 'ok') {
    if (!o.hasFrequency) lossNeeds.push('The loss estimate needs the frequency: enter it in the Frequency field above (loss depends on it and none is assumed).');
    if (source === '') lossNeeds.push('The loss estimate needs the source of the loss tangent (where tan delta came from); it is required and never filled in.');
    if (lossNeeds.length === 0) {
      inputs['lossTangent'] = parsedTan.value;
      inputs['lossTangentSource'] = source;
      if (rho !== undefined) inputs['resistivity'] = rho;
    }
  } else if (parsedTan.status === 'empty' && (source !== '' || rho !== undefined)) {
    lossNeeds.push('Enter the loss tangent to get a loss estimate: the source note and the resistivity are only used with it.');
  }
  return { inputs, problems, fieldErrors, needs, lossNeeds, fields };
}

/** State key of an extra input for a core error field name such as "tolerances.width" or "lossTangentSource". */
export function extStateKeyOfCoreField(ext: ExtSpec, field: string | undefined): string | undefined {
  if (field === undefined) return undefined;
  if (field.startsWith('tolerances.')) return ext.tol.find((d) => d.core === field.slice('tolerances.'.length))?.state;
  const map: Readonly<Record<string, string>> = {
    lossTangent: 'lossTangent',
    lossTangentSource: 'lossSource',
    resistivity: 'resistivity',
    'profileScope.layerCount': 'layerCount',
    'profileScope.layerSide': 'layerSide',
    'profileScope.copperWeight': 'copperWeight',
  };
  return map[field];
}

// ---------------------------------------------------------------------------
// The form model the page renders
// ---------------------------------------------------------------------------
export interface ProfileFlag {
  readonly state: 'profWidth' | 'profSpacing';
  readonly core: string;
  readonly label: string;
  readonly checked: boolean;
}

export interface ExtForm {
  readonly fields: readonly TolFieldDef[];
  readonly tol: TolState;
  /** Core tolerance key to state key. */
  readonly stateKeyOf: Readonly<Record<string, ExtTolKey>>;
  /** Fields whose typed value is replaced by the fab profile (shown disabled with this reason). */
  readonly lockedReason: Readonly<Record<string, string>>;
  /** A fab profile can be chosen: some entered input (a width or a gap) can take a published tolerance. */
  readonly offerProfile: boolean;
  readonly profile: ProfileChoice;
  readonly banner: ProfileBanner | undefined;
  readonly flags: readonly ProfileFlag[];
  /** True when the tolerance section holds anything (the page opens it then). */
  readonly hasTolerance: boolean;
  /** True when a fab profile is chosen or none (the fab profile section opens then). */
  readonly hasProfile: boolean;
  readonly hasLoss: boolean;
}

export const PROFILE_LOCK_REASON = 'Taken from the fab profile for the scope below, if it publishes it.';
export const PROFILE_QUESTION = 'Fab profile (optional)';
export const PROFILE_HELP =
  'Nothing is chosen for you. A profile is used for two things: a note comparing the width and the spacing or gap with its published minimum, and (if you ask for it below) a width or gap tolerance. Both apply only to the exact layer count, layer side and copper weight you give; if the profile publishes nothing for that scope, the result says so and nothing is assumed. None means no fab minimum is checked and only your own values are used.';

export function extFormOf(ext: ExtSpec, s: Record<string, string>, active: readonly string[], today: string): ExtForm {
  const fields = tolFieldDefs(ext, s, active);
  const tol: Record<string, TolInput> = {};
  const stateKeyOf: Record<string, ExtTolKey> = {};
  for (const d of ext.tol) {
    tol[d.core] = tolOf(s, d.state);
    stateKeyOf[d.core] = d.state;
  }
  const offeredProfileDefs = ext.tol.filter((d) => d.profile !== undefined && isOffered(ext, d, s, active));
  const profile: ProfileChoice = isProfileChoice(s['profile'] ?? '') ? (s['profile'] as ProfileChoice) : '';
  const lockedReason: Record<string, string> = {};
  for (const d of offeredProfileDefs) if (flagOf(s, d)) lockedReason[d.core] = PROFILE_LOCK_REASON;
  const banner = profile === 'bundled' ? profileBanner(profile, today) : undefined;
  return {
    fields,
    tol,
    stateKeyOf,
    lockedReason,
    offerProfile: canTakeProfile(ext),
    profile,
    banner,
    flags: profile === 'bundled' ? offeredProfileDefs.map((d) => ({ state: d.profile as 'profWidth' | 'profSpacing', core: d.core, label: d.label, checked: flagOf(s, d) })) : [],
    hasTolerance: ext.tol.some((d) => !isTolEmpty(tolOf(s, d.state))),
    hasProfile: (s['profile'] ?? '') !== '',
    hasLoss: ['lossTangent', 'lossSource', 'resistivity'].some((k) => entered(s, k)),
  };
}

// ---------------------------------------------------------------------------
// Ledger roles shown beside the extra results
// ---------------------------------------------------------------------------
export const EXT_LEDGER_ROLE: Readonly<Record<string, string>> = {
  'S-004': 'Copper resistivity at 20 degC (IACS), the default for the conductor loss; not corrected for temperature.',
  'S-019l': 'Fab profile example data: published track tolerance and minimum width and spacing (example data, UNVERIFIED).',
  'S-027': 'FR-4 class Dk and Df ranges and their frequency dependence (manufacturer data).',
  'S-029c': 'Quarter-wave helper lambda_g/4, derived from the guided wavelength; the antenna remark is one application note. Not an antenna calculator.',
  'S-029d': 'Low-loss attenuation alpha = R/(2 Z0) + G Z0/2 and the Np to dB conversion.',
  'S-029e': 'Dielectric loss of a quasi-TEM line (filling-factor form): one secondary source and one tier-4 document.',
  'S-029f': 'Conductor skin-effect loss estimate for a wide microstrip strip and a coaxial line, smooth copper; one tier-4 document and secondary sources.',
};

// ---------------------------------------------------------------------------
// Definition helpers: the same tolerance wording on every page
// ---------------------------------------------------------------------------
const HELP_GEOMETRY = 'Plus and minus on the value you entered, for example 5%; your own figure (for example from your fabricator). Nothing is assumed.';
const HELP_ER = 'Your own spread on er (for example from the laminate datasheet at your frequency), as a percent. It is never filled in for you.';
const HELP_THICKNESS = 'Plus and minus on the copper thickness you entered, as a percent.';

/** A width: may take the fab-profile tolerance. */
export const tolWidth = (label: string, input: string): ExtTolDef => ({ core: 'width', state: 'tolWidth', label, input, profile: 'profWidth', help: HELP_GEOMETRY });
/** The dielectric height h or the plane spacing b (the core key differs, the state key is shared). */
export const tolHeight = (core: string, label: string, input: string): ExtTolDef => ({ core, state: 'tolHeight', label, input, help: HELP_GEOMETRY });
/** A gap or edge spacing: may take the fab-profile tolerance. */
export const tolSpacing = (core: string, label: string, input: string): ExtTolDef => ({ core, state: 'tolSpacing', label, input, profile: 'profSpacing', help: HELP_GEOMETRY });
export const tolEr = (): ExtTolDef => ({ core: 'er', state: 'tolEr', label: 'Relative permittivity er', input: 'er', help: HELP_ER });
export const tolThickness = (label: string, input: string): ExtTolDef => ({ core: 'thickness', state: 'tolThickness', label, input, thickness: true, help: HELP_THICKNESS });
export const tolDiameter = (core: 'outerDiameter' | 'innerDiameter', label: string, input: string): ExtTolDef => ({ core, state: core === 'outerDiameter' ? 'tolOuter' : 'tolInner', label, input, help: HELP_GEOMETRY });
