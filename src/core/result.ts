import { DIM, sameDim } from './units';
import type { Quantity } from './units';
import type { Confidence, DataStatus } from './confidence';

/** Errors-as-values container. Calculators never return NaN; they return `{ ok: false }`. */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export interface CalcError {
  code: 'INVALID_INPUT' | 'OUT_OF_DOMAIN' | 'DIMENSION' | 'NO_CONVERGENCE' | 'INTERNAL';
  field?: string;
  message: string;
}

export type InputSource = 'user' | 'default' | 'fab-profile' | 'preset';
export type WarningSeverity = 'info' | 'caution' | 'warning' | 'critical';

export interface CalcInput {
  name: string;
  value: Quantity;
  source: InputSource;
  sourceDetail?: string;
}

export interface CalcWarning {
  severity: WarningSeverity;
  message: string;
  code?: string;
}

export type DesignDirection = 'max-limit' | 'min-requirement';

/** What a reported number means: a required minimum, a capacity ceiling, a nominal value, or a model prediction. */
export type Bound = 'min-requirement' | 'max-capacity' | 'nominal' | 'prediction';
const BOUNDS: readonly string[] = ['min-requirement', 'max-capacity', 'nominal', 'prediction'];

export type ElementKind = 'trace' | 'via' | 'pad' | 'connector' | 'spoke' | 'pour-neck' | 'other';
const ELEMENT_KINDS: readonly string[] = ['trace', 'via', 'pad', 'connector', 'spoke', 'pour-neck', 'other'];

/** One element of a current path (trace segment, via, pad ...) with its load against its limit. */
export interface ElementResult {
  id: string;
  name: string;
  kind: ElementKind;
  load: Quantity;
  limit: Quantity;
  /** load / limit; above 1 means over the limit. */
  utilisation: number;
  /** limit - load; negative when over the limit. */
  margin: Quantity;
  /** Basis of load, limit and margin (G3-d). Only 'current' is ranked: temperature-rise limits are converted to a current limit first. */
  limitBasis?: LimitBasis;
  /** Where the limit comes from (G3-g): a method and ledger row, or a user-supplied source note. Required with limitBasis. */
  limitSource?: string;
  /** Per-element electrical state (G3-g), all optional. */
  resistance?: Quantity;
  drop?: Quantity;
  loss?: Quantity;
}
/** The only utilisation basis: I_applied / I_allowed. */
export type LimitBasis = 'current';

export type CopperBasisKind = 'nominal' | 'finished' | 'measured';

export interface CopperBasis {
  layer: 'outer' | 'inner';
  basis: CopperBasisKind;
  thickness: Quantity;
  source: string;
  /** Foil weight in oz/ft2 when the basis came from a foil weight; lets finished-copper text be per weight. */
  weightOzFt2?: number;
}

/** Where an export value came from. A clearance is never 'calculated'. */
export type ExportSource = 'calculated' | 'user-entered' | 'fab-profile';

/**
 * The typed keys of a net-class export (G3-c). Every value is a length. `bound` is the rounding direction the value prints
 * with (a width or clearance is a minimum and rounds up; an echoed user dimension is nominal); `minSi`/`maxSi` are
 * plausibility windows that catch unit slips, not standards.
 */
export const NET_CLASS_KEYS = {
  width: { bound: 'min-requirement', minSi: 5e-6, maxSi: 0.1 },
  clearance: { bound: 'min-requirement', minSi: 5e-6, maxSi: 0.02 },
  viaDrill: { bound: 'nominal', minSi: 20e-6, maxSi: 0.05 },
  viaPad: { bound: 'nominal', minSi: 50e-6, maxSi: 0.05 },
} as const satisfies Record<string, { bound: Bound; minSi: number; maxSi: number }>;
export type NetClassKey = keyof typeof NET_CLASS_KEYS;

export interface CalcExport {
  id: string;
  kind: 'net-class';
  /** Keys must be NET_CLASS_KEYS; every value is a positive, bounded length. */
  values: Record<string, Quantity>;
  note: string;
  /** Per-value provenance. Required for 'clearance'. */
  sources?: Record<string, ExportSource>;
  /** The fab profile a value came from; required when any value has source 'fab-profile'. */
  profile?: { id: string; status: DataStatus; ageDays: number; stale: boolean };
}

export interface DesignValue {
  name: string;
  direction: DesignDirection;
  calculated: Quantity;
  recommended: Quantity;
  derating: { factor: number; rationale: string };
  /** Set only where a zero or negative calculated value is meaningful; waives only the positivity rule. */
  allowNonPositive?: boolean;
}

export interface Envelope {
  name: string;
  min: Quantity;
  typ: Quantity;
  max: Quantity;
  toleranceInputs: string[];
  /**
   * Rounding direction for min, typ and max (additive, optional): 'min-requirement' and 'prediction' round up, 'max-capacity'
   * rounds down, so a requirement or prediction envelope is never understated and a capacity envelope never overstated.
   * Absent keeps the older behaviour (the viewer chooses).
   */
  bound?: Bound;
}

export interface CalcResult {
  method: string;
  reference: { standard: string; edition: string; ledgerIds: string[] };
  formula: string;
  inputs: CalcInput[];
  assumptions: string[];
  /** `bound`, when set, is the rounding direction for this step's displayed value; a step that repeats a result carries that result's bound so the two print identically. */
  steps: { label: string; expr: string; value: Quantity; bound?: Bound }[];
  results: { name: string; value: Quantity; role: 'primary' | 'secondary'; bound: Bound }[];
  validityChecks: { name: string; ok: boolean; detail: string }[];
  warnings: CalcWarning[];
  confidence: Confidence;
  recommendation: string;
  dataStatus: DataStatus;
  designValues: DesignValue[];
  envelope?: Envelope[];
  fabProfile?: {
    id: string;
    fabricator: string;
    profileDate: string;
    status: DataStatus;
    /** Whole days between the profile date and the evaluation date. */
    ageDays: number;
    stale: boolean;
  };
  elements?: ElementResult[];
  limitingElement?: { id: string; name: string; reason: string };
  copperBasis?: CopperBasis;
  exports?: CalcExport[];
}

export type CalcOutcome = Result<CalcResult, CalcError>;

function invalid(name: string, what: string): CalcError {
  return {
    code: 'INVALID_INPUT',
    field: name,
    message: `${name} is ${what}; it must be a finite number greater than zero.`,
  };
}

function classify(n: number): string | null {
  if (Number.isNaN(n)) return 'NaN (not a number)';
  if (!Number.isFinite(n)) return n > 0 ? 'infinite (+Infinity)' : 'infinite (-Infinity)';
  if (n === 0) return 'zero';
  if (n < 0) return `negative (${String(n)})`;
  return null;
}

export function guardPositiveFiniteNumber(name: string, n: number): Result<number, CalcError> {
  const bad = classify(n);
  return bad === null ? { ok: true, value: n } : { ok: false, error: invalid(name, bad) };
}

export function guardPositiveFinite(name: string, qty: Quantity): Result<Quantity, CalcError> {
  const bad = classify(qty.si);
  return bad === null ? { ok: true, value: qty } : { ok: false, error: invalid(name, bad) };
}

/** Names of inputs the user did not supply and that are assumptions (source default or preset), in order. Fab-profile values are excluded. */
export function defaultedInputNames(inputs: readonly CalcInput[]): string[] {
  return inputs.filter((i) => i.source === 'default' || i.source === 'preset').map((i) => i.name);
}

const SEVERITY_RANK: Readonly<Record<WarningSeverity, number>> = { info: 0, caution: 1, warning: 2, critical: 3 };

export function highestWarningSeverity(ws: readonly CalcWarning[]): WarningSeverity | null {
  let best: WarningSeverity | null = null;
  for (const w of ws) {
    if (best === null || SEVERITY_RANK[w.severity] > SEVERITY_RANK[best]) best = w.severity;
  }
  return best;
}

export function checkDesignValue(dv: DesignValue): Result<DesignValue, string> {
  const fail = (m: string): Result<DesignValue, string> => ({ ok: false, error: `Design value "${String(dv.name)}": ${m}` });
  const dir: unknown = (dv as { direction?: unknown }).direction;
  if (dir !== 'max-limit' && dir !== 'min-requirement') {
    return fail('direction must be "max-limit" or "min-requirement".');
  }
  const f = dv.derating.factor;
  if (dir === 'max-limit') {
    if (!Number.isFinite(f) || f <= 0 || f > 1) {
      return fail(`derating factor ${String(f)} is invalid for max-limit; it must be finite and in (0, 1].`);
    }
  } else if (!Number.isFinite(f) || f < 1) {
    return fail(`derating factor ${String(f)} is invalid for min-requirement; it must be finite and at least 1.`);
  }
  const c = dv.calculated;
  const r = dv.recommended;
  if (!Number.isFinite(c.si) || !Number.isFinite(r.si)) {
    return fail('calculated and recommended values must be finite.');
  }
  if (!sameDim(c, r)) return fail('calculated and recommended must have the same dimension.');
  if (c.dim.kind === 'absTemp') {
    return fail('an absolute temperature cannot be derated by a factor; use a temperature difference.');
  }
  if (c.si <= 0 && dv.allowNonPositive !== true) {
    return fail('calculated value is non-positive; set allowNonPositive only where that is meaningful.');
  }
  if (dv.derating.rationale.trim() === '') return fail('derating rationale must not be empty.');
  const expected = c.si * f;
  if (Math.abs(r.si - expected) > 1e-12 * Math.max(Math.abs(expected), Math.abs(r.si))) {
    return fail('recommended value must equal calculated x factor.');
  }
  return { ok: true, value: dv };
}

export function checkEnvelope(e: Envelope): Result<Envelope, string> {
  const fail = (m: string): Result<Envelope, string> => ({ ok: false, error: `Envelope "${e.name}": ${m}` });
  if (!Number.isFinite(e.min.si) || !Number.isFinite(e.typ.si) || !Number.isFinite(e.max.si)) {
    return fail('min, typ and max must be finite.');
  }
  if (!sameDim(e.min, e.typ) || !sameDim(e.typ, e.max)) {
    return fail('min, typ and max must have the same dimension.');
  }
  if (e.min.si > e.typ.si) return fail('min must not exceed typ.');
  if (e.typ.si > e.max.si) return fail('typ must not exceed max.');
  const b: unknown = (e as { bound?: unknown }).bound;
  if (b !== undefined && (typeof b !== 'string' || !BOUNDS.includes(b))) return fail(`unknown bound "${String(b)}".`);
  return { ok: true, value: e };
}

/** A fab profile older than this many days is stale. */
export const FAB_PROFILE_MAX_AGE_DAYS = 365;
const REL_TOL = 1e-9;
const isFiniteQ = (x: Quantity): boolean => Number.isFinite(x.si);
const SEVERITIES: readonly string[] = ['info', 'caution', 'warning', 'critical'];
const LEVELS: readonly string[] = ['high', 'medium', 'low'];
const DATA_STATUSES: readonly string[] = ['VERIFIED', 'UNVERIFIED', 'PAYWALLED', 'CONFLICT'];

/** Elements ordered by utilisation descending, ties by id ascending. Returns a new array. */
export function rankElements(es: readonly ElementResult[]): ElementResult[] {
  return [...es].sort((a, b) => b.utilisation - a.utilisation || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function checkElementExtras(e: ElementResult, add: (m: string) => void): void {
  const basis: unknown = (e as { limitBasis?: unknown }).limitBasis;
  if (basis !== undefined) {
    if (basis !== 'current') add(`limitBasis "${String(basis)}" is not "current"; only a current basis is ranked.`);
    else if (!sameDim(e.load, { si: 1, dim: DIM.CURRENT } as Quantity)) add('limitBasis is "current" but the load is not a current.');
    if (typeof e.limitSource !== 'string' || e.limitSource.trim() === '') add('limitSource must not be empty when limitBasis is given.');
  } else if (e.limitSource !== undefined) {
    add('limitSource is given without limitBasis.');
  }
  const extra: [string, Quantity | undefined, Quantity['dim'], string][] = [
    ['resistance', e.resistance, DIM.RESISTANCE, 'resistance'],
    ['drop', e.drop, DIM.VOLTAGE, 'voltage'],
    ['loss', e.loss, DIM.POWER, 'power'],
  ];
  for (const [name, v, dim, what] of extra) {
    if (v === undefined) continue;
    if (!isFiniteQ(v)) add(`${name} must be finite.`);
    else if (!sameDim(v, { si: 1, dim } as Quantity)) add(`${name} must have dimension ${what}.`);
    else if (v.si < 0) add(`${name} must not be negative.`);
  }
}

/** Validates every element and reports all problems; each message names the element id. Over-limit elements are valid. */
export function checkElements(es: readonly ElementResult[]): Result<ElementResult[], string[]> {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const e of es) {
    const tag = `Element "${String(e.id)}"`;
    const add = (m: string): void => {
      errors.push(`${tag}: ${m}`);
    };
    if (typeof e.id !== 'string' || e.id.trim() === '') add('id must not be empty.');
    else if (seen.has(e.id)) add('duplicate id.');
    else seen.add(e.id);
    if (!ELEMENT_KINDS.includes(e.kind)) add(`kind "${String(e.kind)}" is not one of ${ELEMENT_KINDS.join(', ')}.`);
    const loadOk = isFiniteQ(e.load);
    const limitOk = isFiniteQ(e.limit) && e.limit.si > 0;
    const marginOk = isFiniteQ(e.margin);
    if (!loadOk) add('load must be finite.');
    if (!limitOk) add('limit must be finite and greater than zero.');
    if (!marginOk) add('margin must be finite.');
    const dimOk = sameDim(e.load, e.limit) && sameDim(e.limit, e.margin);
    if (!dimOk) add('load, limit and margin must have the same dimension.');
    if (e.load.dim.kind === 'absTemp' || e.limit.dim.kind === 'absTemp' || e.margin.dim.kind === 'absTemp') {
      add('an absolute temperature cannot be an element load, limit or margin; express a temperature limit as an allowed rise and convert it to a current limit.');
    }
    checkElementExtras(e, add);
    if (loadOk && limitOk && dimOk) {
      const u = e.load.si / e.limit.si;
      if (!Number.isFinite(e.utilisation) || Math.abs(e.utilisation - u) > REL_TOL * Math.abs(u)) {
        add(`utilisation ${String(e.utilisation)} does not equal load / limit (${String(u)}).`);
      }
      if (marginOk) {
        const m = e.limit.si - e.load.si;
        if (Math.abs(e.margin.si - m) > REL_TOL * Math.max(Math.abs(m), Math.abs(e.limit.si))) {
          add(`margin ${String(e.margin.si)} does not equal limit - load (${String(m)}).`);
        }
      }
    }
  }
  // One utilisation basis for the whole list (G3-d): the same dimension everywhere, never absolute temperature.
  const first = es[0];
  if (first !== undefined) {
    for (const e of es) {
      if (!sameDim(e.load, first.load)) {
        errors.push(`Element "${String(e.id)}": load dimension differs from element "${String(first.id)}"; one utilisation basis only (convert other limits to a current limit before ranking).`);
      }
    }
  }
  return errors.length > 0 ? { ok: false, error: errors } : { ok: true, value: [...es] };
}

export function checkCopperBasis(b: CopperBasis): Result<CopperBasis, string> {
  const fail = (m: string): Result<CopperBasis, string> => ({ ok: false, error: `Copper basis: ${m}` });
  const layer: unknown = (b as { layer?: unknown }).layer;
  if (layer !== 'outer' && layer !== 'inner') return fail('layer must be "outer" or "inner".');
  const basis: unknown = (b as { basis?: unknown }).basis;
  if (basis !== 'nominal' && basis !== 'finished' && basis !== 'measured') {
    return fail('basis must be "nominal", "finished" or "measured".');
  }
  const t = b.thickness;
  const isLength = sameDim(t, { si: 1, dim: DIM.LENGTH } as Quantity);
  if (!Number.isFinite(t.si) || t.si <= 0 || !isLength) {
    return fail('thickness must be a finite length greater than zero.');
  }
  if (typeof b.source !== 'string' || b.source.trim() === '') return fail('source must not be empty.');
  return { ok: true, value: b };
}

/** Every Quantity in the result with a human-readable location, for finiteness checks. */
function* quantities(r: CalcResult): Generator<[string, Quantity]> {
  for (const i of r.inputs) yield [`inputs "${i.name}"`, i.value];
  for (const s of r.steps) yield [`steps "${s.label}"`, s.value];
  for (const o of r.results) yield [`results "${o.name}"`, o.value];
  for (const d of r.designValues) {
    yield [`designValues "${d.name}"`, d.calculated];
    yield [`designValues "${d.name}"`, d.recommended];
  }
  for (const e of r.envelope ?? []) {
    yield [`envelope "${e.name}"`, e.min];
    yield [`envelope "${e.name}"`, e.typ];
    yield [`envelope "${e.name}"`, e.max];
  }
  for (const e of r.elements ?? []) {
    yield [`elements "${e.id}"`, e.load];
    yield [`elements "${e.id}"`, e.limit];
    yield [`elements "${e.id}"`, e.margin];
    for (const v of [e.resistance, e.drop, e.loss]) if (v !== undefined) yield [`elements "${e.id}" (electrical state)`, v];
  }
  if (r.copperBasis) yield ['copperBasis (copper thickness)', r.copperBasis.thickness];
  for (const x of r.exports ?? []) {
    for (const [k, v] of Object.entries(x.values)) yield [`exports "${x.id}" value "${k}"`, v];
  }
}

/** Throws if any Quantity, derating factor or confidence score in the result is NaN or infinite. Zero and negatives are allowed. */
export function assertNoNonFinite(r: CalcResult): void {
  for (const [where, v] of quantities(r)) {
    if (!Number.isFinite(v.si)) throw new Error(`Non-finite value (${String(v.si)}) in ${where}`);
  }
  for (const d of r.designValues) {
    if (!Number.isFinite(d.derating.factor)) {
      throw new Error(`Non-finite value (${String(d.derating.factor)}) in designValues "${d.name}" derating factor`);
    }
  }
  if (!Number.isFinite(r.confidence.score)) {
    throw new Error(`Non-finite value (${String(r.confidence.score)}) in confidence score`);
  }
}

/** Validates net-class exports (G3-c): known keys, positive bounded lengths, provenance, and the profile with its status tag. */
export function checkExports(xs: readonly CalcExport[]): Result<CalcExport[], string[]> {
  const errors: string[] = [];
  const seen = new Set<string>();
  const lengthRef = { si: 1, dim: DIM.LENGTH } as Quantity;
  for (const x of xs) {
    const tag = `Export "${String(x.id)}"`;
    const add = (m: string): void => {
      errors.push(`${tag}: ${m}`);
    };
    if (typeof x.id !== 'string' || x.id.trim() === '') add('id must not be empty.');
    else if (seen.has(x.id)) add('duplicate id.');
    else seen.add(x.id);
    if (x.kind !== 'net-class') add('kind must be "net-class".');
    if (typeof x.note !== 'string' || x.note.trim() === '') add('note must not be empty.');
    const keys = Object.keys(x.values);
    if (keys.length === 0) add('an export needs at least one value.');
    for (const k of keys) {
      const v = x.values[k] as Quantity;
      if (!Object.prototype.hasOwnProperty.call(NET_CLASS_KEYS, k)) {
        add(`value "${k}" is not a net-class key (${Object.keys(NET_CLASS_KEYS).join(', ')}).`);
        continue;
      }
      const spec = NET_CLASS_KEYS[k as NetClassKey];
      if (!isFiniteQ(v)) add(`value "${k}" must be finite.`);
      else if (!sameDim(v, lengthRef)) add(`value "${k}" must be a length.`);
      else if (v.si <= 0) add(`value "${k}" must be greater than zero.`);
      else if (v.si < spec.minSi || v.si > spec.maxSi) {
        add(`value "${k}" (${String(v.si)} m) is outside its plausible range ${String(spec.minSi)} to ${String(spec.maxSi)} m; check the unit.`);
      }
    }
    const srcs = x.sources ?? {};
    for (const [k, s] of Object.entries(srcs)) {
      if (!keys.includes(k)) add(`sources names "${k}", which is not one of the values.`);
      if (s !== 'calculated' && s !== 'user-entered' && s !== 'fab-profile') add(`source of "${k}" must be calculated, user-entered or fab-profile.`);
    }
    if (keys.includes('clearance') && srcs['clearance'] !== 'fab-profile' && srcs['clearance'] !== 'user-entered') {
      add('a clearance must say where it came from (fab-profile or user-entered); it is never calculated or defaulted.');
    }
    const usesProfile = Object.values(srcs).includes('fab-profile');
    if (usesProfile && x.profile === undefined) add('a value comes from a fab profile but the export carries no profile.');
    if (x.profile !== undefined) {
      const p = x.profile;
      if (typeof p.id !== 'string' || p.id.trim() === '') add('profile id must not be empty.');
      if (!DATA_STATUSES.includes(p.status)) add(`profile status "${String(p.status)}" is not a data status.`);
      if (!Number.isInteger(p.ageDays) || p.ageDays < 0) add('profile ageDays must be a non-negative whole number.');
      else if (p.stale !== p.ageDays > FAB_PROFILE_MAX_AGE_DAYS) add('profile stale must equal (ageDays > 365).');
      if (p.status !== 'VERIFIED' && typeof x.note === 'string' && !x.note.includes(p.status)) {
        add(`the profile is ${String(p.status)} and the note must carry that tag visibly.`);
      }
      if (p.stale === true && typeof x.note === 'string' && !/stale/i.test(x.note)) add('the profile is stale and the note must say so.');
    }
  }
  return errors.length > 0 ? { ok: false, error: errors } : { ok: true, value: [...xs] };
}

/** Full schema check. Never throws; returns every problem as a string. */
export function assertCalcResult(r: CalcResult): Result<CalcResult, string[]> {
  const errors: string[] = [];
  try {
    for (const [where, v] of quantities(r)) {
      if (!Number.isFinite(v.si)) errors.push(`Non-finite value (${String(v.si)}) in ${where}.`);
    }
    for (const o of r.results) {
      const b: unknown = (o as { bound?: unknown }).bound;
      if (b === undefined) errors.push(`Result "${o.name}" is missing its bound.`);
      else if (typeof b !== 'string' || !BOUNDS.includes(b)) errors.push(`Result "${o.name}" has unknown bound "${String(b)}".`);
    }
    if (!Number.isFinite(r.confidence.score)) errors.push(`Confidence score is not finite (${String(r.confidence.score)}).`);
    if (!LEVELS.includes(r.confidence.level)) errors.push(`Confidence level "${String(r.confidence.level)}" is not high, medium or low.`);
    if (!DATA_STATUSES.includes(r.dataStatus)) errors.push(`Unknown dataStatus "${String(r.dataStatus)}".`);
    for (const d of r.designValues) {
      const c = checkDesignValue(d);
      if (!c.ok) errors.push(c.error);
    }
    for (const e of r.envelope ?? []) {
      const c = checkEnvelope(e);
      if (!c.ok) errors.push(c.error);
    }
    if (r.elements) {
      const c = checkElements(r.elements);
      if (!c.ok) errors.push(...c.error);
    }
    if (r.copperBasis) {
      const c = checkCopperBasis(r.copperBasis);
      if (!c.ok) errors.push(c.error);
    }
    if (r.exports) {
      const c = checkExports(r.exports);
      if (!c.ok) errors.push(...c.error);
      for (const x of r.exports) {
        if (x.profile !== undefined && (r.fabProfile === undefined || r.fabProfile.id !== x.profile.id)) {
          errors.push(`Export "${String(x.id)}" names fab profile "${x.profile.id}" but the result's fabProfile is ${r.fabProfile === undefined ? 'absent' : `"${r.fabProfile.id}"`}.`);
        }
      }
    }
    for (const w of r.warnings) {
      if (!SEVERITIES.includes(w.severity)) errors.push(`Warning has unknown severity "${String(w.severity)}": ${w.message}`);
    }
    if (r.elements && r.elements.length > 0) {
      const top = rankElements(r.elements)[0];
      if (r.limitingElement === undefined) {
        errors.push(`limitingElement is absent but elements are present; it must be "${String(top?.id)}".`);
      } else if (top && r.limitingElement.id !== top.id) {
        errors.push(`limitingElement "${r.limitingElement.id}" is not the top-ranked element "${top.id}".`);
      }
    }
    if (r.fabProfile) {
      const a = r.fabProfile.ageDays;
      if (!Number.isInteger(a) || a < 0) errors.push(`fabProfile.ageDays (${String(a)}) must be a non-negative whole number.`);
      if (typeof r.fabProfile.stale !== 'boolean') errors.push('fabProfile.stale must be a boolean.');
      else if (Number.isFinite(a) && r.fabProfile.stale !== a > FAB_PROFILE_MAX_AGE_DAYS) {
        errors.push(
          `fabProfile.stale is ${String(r.fabProfile.stale)} but ageDays ${String(a)} ${a > FAB_PROFILE_MAX_AGE_DAYS ? 'exceeds' : 'does not exceed'} ${String(FAB_PROFILE_MAX_AGE_DAYS)}; stale must equal (ageDays > ${String(FAB_PROFILE_MAX_AGE_DAYS)}).`,
        );
      }
      if (r.fabProfile.stale === true && r.confidence.level === 'high') {
        errors.push('A stale fab profile is in use but confidence level is high; stale data cannot rate high.');
      }
      if (r.fabProfile.status !== 'VERIFIED' && r.dataStatus === 'VERIFIED') {
        errors.push(`The fab profile status is ${String(r.fabProfile.status)} but dataStatus is VERIFIED; dataStatus must be the same non-VERIFIED status.`);
      }
    }
    const failed = r.validityChecks.filter((c) => !c.ok);
    const lvl = r.confidence.level;
    if (failed.length > 0 && lvl !== 'low') {
      errors.push(`Validity check failed ("${failed.map((c) => c.name).join('", "')}") but confidence level is ${String(lvl)}; it must be low.`);
    }
    const sc = r.confidence.score;
    if (Number.isFinite(sc) && LEVELS.includes(lvl)) {
      const expected = sc === 0 ? 'high' : sc <= 2 ? 'medium' : 'low';
      if (lvl !== expected && !(lvl === 'low' && failed.length > 0)) {
        errors.push(`Confidence level "${lvl}" does not match score ${String(sc)} (expected ${expected}).`);
      }
    }
    if (r.confidence.reasons.length === 0 && lvl !== 'high') {
      errors.push(`Confidence level is ${String(lvl)} but reasons is empty; every non-high level needs reasons.`);
    }
    if (!r.results.some((o) => o.role === 'primary')) errors.push('No result has role "primary"; exactly one headline result is required.');
    for (const o of r.results) {
      if (o.bound === 'min-requirement' && Number.isFinite(o.value.si) && o.value.si < 0 && o.value.dim.kind !== 'absTemp' && o.value.dim.kind !== 'deltaT') {
        errors.push(`Result "${o.name}" is a min-requirement with a negative minimum (${String(o.value.si)}).`);
      }
    }
  } catch (e) {
    errors.push(`Result could not be fully checked: ${e instanceof Error ? e.message : String(e)}`);
  }
  return errors.length > 0 ? { ok: false, error: errors } : { ok: true, value: r };
}
