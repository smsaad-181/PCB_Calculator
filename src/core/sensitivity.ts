import type { CalcOutcome } from './result';
import { q } from './units';
import type { Quantity } from './units';

/**
 * Generic tolerance-envelope and local-sensitivity helper (Phase 1 task 9). Pure and deterministic. It contains NO physics:
 * it only evaluates a calculator's own `compute` at perturbed copies of the base input and reads named results back.
 *
 * Sensitivity (a): S_i = d ln(output) / d ln(input_i), central difference in ln space with a relative step of REL_STEP
 * (1e-4). Exact (to rounding) for power laws. For an input whose tolerance is ABSOLUTE (a temperature, where a relative
 * change of an offset scale means nothing) the reported value is the semi-log sensitivity d ln(output) / dx per SI unit of
 * the input (for a temperature: per kelvin), central difference with step ABS_STEP_REL x max(|x|, 1). Where compute rejects
 * x(1 +- h) (an input at a validity boundary) the difference is one-sided and flagged ('forward' or 'backward'); where both
 * sides fail the sensitivity is 'unavailable'. If an output is not positive the logarithm does not exist and the relative
 * (linear) difference divided by the output is used instead; an output of exactly zero is 'unavailable'.
 *
 * Envelope (b): the calculator is evaluated at the nominal point, at every corner of the tolerance box (2^k corners for
 * k tolerated inputs, k <= MAX_CORNER_INPUTS = 6; an input whose minus and plus tolerances are both zero is not perturbed
 * and does not count), and along each axis at its low end, midpoint and high end. min and max are taken over all of those
 * evaluations, so min <= typ <= max always holds. For an output that is monotone in every tolerated input the extremes are
 * at corners and the envelope is exact. A monotonicity probe along each axis (sorted points: low, midpoint, nominal, high,
 * other inputs nominal) flags outputs that are not monotone in some input; such an output is labelled 'corners-only'
 * (corner and axis points evaluated, not guaranteed extremes).
 *
 * Never throws. A compute that errors at a corner is reported as "envelope incomplete at corner <name>"; the bound that
 * corner would determine (found from the signs of the axis slopes, both bounds when the output is not monotone or its
 * slope is unknown) is omitted (null), never clamped to the nominal value.
 */

export const REL_STEP = 1e-4;
export const ABS_STEP_REL = 1e-4;
export const MAX_CORNER_INPUTS = 6;
/** Relative slack when deciding that a sequence of axis-probe values is monotone (rounding noise is not curvature). */
const MONO_SLACK = 1e-12;

export type ToleranceKind = 'relative' | 'absolute';

export interface PerturbSpec {
  /** Name of a Quantity-valued property of the base input object. It must be present in the base. */
  readonly input: string;
  /** relative: x(1 - minus) .. x(1 + plus), the base value must be positive. absolute: x - minus .. x + plus in SI units. */
  readonly kind: ToleranceKind;
  readonly minus: number;
  readonly plus: number;
}

export interface OutputSpec {
  /** Name of an entry of CalcResult.results (its value is read as SI). */
  readonly name: string;
  /** Whether to report sensitivities of this output (an absolute temperature has no meaningful log sensitivity). */
  readonly sensitivity: boolean;
}

export type SensitivityScheme = 'central' | 'forward' | 'backward' | 'unavailable';

export interface SensitivityEntry {
  readonly input: string;
  readonly kind: ToleranceKind;
  /** d ln(out)/d ln(x) for relative inputs, d ln(out)/dx per SI unit for absolute ones; null when unavailable. */
  readonly value: number | null;
  readonly scheme: SensitivityScheme;
  readonly note?: string;
}

export type EnvelopeLabel = 'corners-exact-for-monotone' | 'corners-only';

export interface EnvelopeEntry {
  readonly output: string;
  readonly typ: number;
  /** null: the bound is omitted because a corner that determines it could not be evaluated. */
  readonly min: number | null;
  readonly max: number | null;
  readonly minAt: string;
  readonly maxAt: string;
  readonly monotone: boolean;
  readonly nonMonotoneInputs: readonly string[];
  readonly label: EnvelopeLabel;
}

export interface Analysis {
  readonly sensitivities: Readonly<Record<string, readonly SensitivityEntry[]>>;
  readonly envelopes: readonly EnvelopeEntry[];
  readonly activeInputs: readonly string[];
  readonly cornerCount: number;
  readonly evaluations: number;
  /** One 'envelope incomplete at corner <name>: <message>' text per corner (or axis end) that compute rejected. */
  readonly incomplete: readonly string[];
  /** Corners that fail a validity check the nominal point passes (extrapolation at that corner). */
  readonly extrapolatedCorners: readonly string[];
}

export type AnalysisResult = { readonly ok: true; readonly value: Analysis } | { readonly ok: false; readonly error: string };

interface Eval {
  readonly values: ReadonlyMap<string, number>;
  readonly failing: ReadonlySet<string>;
}
type Outcome = { readonly ok: true; readonly ev: Eval } | { readonly ok: false; readonly message: string };

function perturbOne(b: Readonly<Record<string, unknown>>, name: string, x: number): Record<string, unknown> {
  const v = b[name] as Quantity;
  return { ...b, [name]: q(x, v.dim) };
}

const isQuantity = (v: unknown): v is Quantity =>
  typeof v === 'object' && v !== null && typeof (v as { si?: unknown }).si === 'number' && typeof (v as { dim?: unknown }).dim === 'object';

/** Validates the perturbation list against the base. Returns an error text or undefined. */
function checkSpecs(base: Readonly<Record<string, unknown>>, perturb: readonly PerturbSpec[]): string | undefined {
  const seen = new Set<string>();
  for (const p of perturb) {
    if (seen.has(p.input)) return `input "${p.input}" is listed twice.`;
    seen.add(p.input);
    const v = base[p.input];
    if (!isQuantity(v) || !Number.isFinite(v.si)) return `input "${p.input}" is not a finite quantity in the base inputs.`;
    if (!Number.isFinite(p.minus) || !Number.isFinite(p.plus) || p.minus < 0 || p.plus < 0) return `tolerance of "${p.input}" must be finite and not negative.`;
    if (p.kind === 'relative') {
      if (!(v.si > 0)) return `input "${p.input}" is not positive, so a relative tolerance has no meaning; use an absolute tolerance.`;
      if (p.minus >= 1) return `relative minus tolerance of "${p.input}" must be below 1 (100 %).`;
    }
  }
  return undefined;
}

function perturbed(base: Readonly<Record<string, unknown>>, perturb: readonly PerturbSpec[], sign: Readonly<Record<string, number>>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const p of perturb) {
    const s = sign[p.input];
    if (s === undefined) continue;
    const v = base[p.input] as Quantity;
    const si = p.kind === 'relative' ? v.si * (1 + (s > 0 ? p.plus : -p.minus)) : v.si + (s > 0 ? p.plus : -p.minus);
    out[p.input] = q(si, v.dim);
  }
  return out;
}


/**
 * Local sensitivities and the tolerance-box envelope of `compute` around `base`. `compute` must be a function of one input
 * object (the object may carry any other properties, which are passed through untouched).
 */
export function analyse<I extends object>(
  compute: (inputs: I) => CalcOutcome,
  base: I,
  perturb: readonly PerturbSpec[],
  outputs: readonly OutputSpec[],
): AnalysisResult {
  try {
    return analyseUnsafe(compute, base, perturb, outputs);
  } catch (e) {
    return { ok: false, error: `analysis failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function analyseUnsafe<I extends object>(
  compute: (inputs: I) => CalcOutcome,
  base: I,
  perturb: readonly PerturbSpec[],
  outputs: readonly OutputSpec[],
): AnalysisResult {
  const baseRec = base as unknown as Readonly<Record<string, unknown>>;
  const specErr = checkSpecs(baseRec, perturb);
  if (specErr !== undefined) return { ok: false, error: specErr };
  if (outputs.length === 0) return { ok: false, error: 'no outputs were requested.' };
  const active = perturb.filter((p) => p.minus > 0 || p.plus > 0);
  if (active.length > MAX_CORNER_INPUTS) {
    return { ok: false, error: `${String(active.length)} tolerated inputs exceed the limit of ${String(MAX_CORNER_INPUTS)} (2^k corners are evaluated).` };
  }

  let evaluations = 0;
  const evalWith = (inputs: Record<string, unknown>): Outcome => {
    evaluations += 1;
    let out: CalcOutcome;
    try {
      out = compute(inputs as unknown as I);
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
    if (!out.ok) return { ok: false, message: out.error.message };
    const values = new Map<string, number>();
    for (const o of outputs) {
      const r = out.value.results.find((x) => x.name === o.name);
      if (r === undefined) return { ok: false, message: `result "${o.name}" is missing from the calculator output.` };
      if (!Number.isFinite(r.value.si)) return { ok: false, message: `result "${o.name}" is not finite.` };
      values.set(o.name, r.value.si);
    }
    return { ok: true, ev: { values, failing: new Set(out.value.validityChecks.filter((c) => !c.ok).map((c) => c.name)) } };
  };

  const nominal = evalWith(baseRec);
  if (!nominal.ok) return { ok: false, error: `the nominal point could not be evaluated: ${nominal.message}` };
  const typ = nominal.ev;

  // ---- sensitivities (all listed inputs, tolerance zero or not)
  const sensitivities: Record<string, SensitivityEntry[]> = {};
  const sensOutputs = outputs.filter((o) => o.sensitivity);
  for (const o of sensOutputs) sensitivities[o.name] = [];
  for (const p of perturb) {
    if (sensOutputs.length === 0) break;
    const x0 = (baseRec[p.input] as Quantity).si;
    const step = p.kind === 'relative' ? x0 * REL_STEP : ABS_STEP_REL * Math.max(Math.abs(x0), 1);
    const hi = evalWith(perturbOne(baseRec, p.input, x0 + step));
    // A relative lower step of x0 (1 - h) keeps the log-step symmetric-looking; for absolute the plain x0 - step.
    const lo = evalWith(perturbOne(baseRec, p.input, p.kind === 'relative' ? x0 * (1 - REL_STEP) : x0 - step));
    const dx = p.kind === 'relative' ? Math.log(1 + REL_STEP) - Math.log(1 - REL_STEP) : 2 * step;
    const dxHi = p.kind === 'relative' ? Math.log(1 + REL_STEP) : step;
    const dxLo = p.kind === 'relative' ? -Math.log(1 - REL_STEP) : step;
    for (const o of sensOutputs) {
      const f0 = typ.values.get(o.name) as number;
      const fp = hi.ok ? (hi.ev.values.get(o.name) as number) : undefined;
      const fm = lo.ok ? (lo.ev.values.get(o.name) as number) : undefined;
      let scheme: SensitivityScheme;
      let a: number | undefined;
      let b: number | undefined;
      let d: number;
      if (fp !== undefined && fm !== undefined) {
        scheme = 'central';
        a = fp;
        b = fm;
        d = dx;
      } else if (fp !== undefined) {
        scheme = 'forward';
        a = fp;
        b = f0;
        d = dxHi;
      } else if (fm !== undefined) {
        scheme = 'backward';
        a = f0;
        b = fm;
        d = dxLo;
      } else {
        sensitivities[o.name]?.push({ input: p.input, kind: p.kind, value: null, scheme: 'unavailable', note: 'the calculator rejected the point on both sides of the nominal value (input at a validity boundary).' });
        continue;
      }
      let value: number | null;
      let note: string | undefined;
      if (a > 0 && b > 0) value = (Math.log(a) - Math.log(b)) / d;
      else if (f0 !== 0) {
        value = (a - b) / f0 / d;
        note = 'output is not positive: relative (linear) difference used instead of a logarithm.';
      } else {
        value = null;
        note = 'output is zero: a normalised sensitivity does not exist.';
      }
      if (value !== null && !Number.isFinite(value)) {
        value = null;
        note = 'the difference quotient is not finite.';
      }
      if (value === null) scheme = 'unavailable';
      else if (scheme !== 'central') note = `one-sided (${scheme}) difference: a point on the other side of the nominal value was rejected by the calculator.`;
      sensitivities[o.name]?.push({ input: p.input, kind: p.kind, value, scheme, ...(note !== undefined ? { note } : {}) });
    }
  }

  // ---- axis probes and corners
  const incomplete: string[] = [];
  const extrapolated: string[] = [];
  const names = active.map((p) => p.input);
  const cornerName = (sign: Readonly<Record<string, number>>): string => names.map((n) => `${n}${sign[n] === 1 ? '+' : '-'}`).join(', ');
  const nominalFailing = typ.failing;
  const flagExtrap = (label: string, ev: Eval): void => {
    for (const f of ev.failing) {
      if (!nominalFailing.has(f)) {
        extrapolated.push(label);
        return;
      }
    }
  };

  interface Point {
    readonly label: string;
    readonly values: ReadonlyMap<string, number>;
  }
  const points: Point[] = [{ label: 'nominal', values: typ.values }];

  // Per output: omitted bounds and monotonicity
  const omitMin = new Set<string>();
  const omitMax = new Set<string>();
  const nonMono = new Map<string, Set<string>>();
  for (const o of outputs) nonMono.set(o.name, new Set());
  // slope sign per (output, input): +1, -1, 0 (flat) or undefined (unknown)
  const slope = new Map<string, number | undefined>();
  const slopeKey = (o: string, i: string): string => `${o}\u0000${i}`;
  const failedAxisEnds: { input: string; sign: number }[] = [];

  for (const p of active) {
    const x0 = (baseRec[p.input] as Quantity).si;
    const xLo = p.kind === 'relative' ? x0 * (1 - p.minus) : x0 - p.minus;
    const xHi = p.kind === 'relative' ? x0 * (1 + p.plus) : x0 + p.plus;
    const xMid = (xLo + xHi) / 2;
    const probes: { x: number; tag: string }[] = [
      { x: xLo, tag: `${p.input}-` },
      { x: xMid, tag: `${p.input} midpoint` },
      { x: x0, tag: 'nominal' },
      { x: xHi, tag: `${p.input}+` },
    ];
    const got: { x: number; ev: Eval | undefined; tag: string }[] = [];
    for (const pr of probes) {
      if (pr.tag === 'nominal') {
        got.push({ x: pr.x, ev: typ, tag: pr.tag });
        continue;
      }
      const r = evalWith(perturbOne(baseRec, p.input, pr.x));
      if (r.ok) {
        got.push({ x: pr.x, ev: r.ev, tag: pr.tag });
        points.push({ label: pr.tag, values: r.ev.values });
        if (pr.tag.endsWith('-') || pr.tag.endsWith('+')) flagExtrap(`${pr.tag} (axis end)`, r.ev);
      } else {
        got.push({ x: pr.x, ev: undefined, tag: pr.tag });
        if (pr.tag.endsWith('-') || pr.tag.endsWith('+')) incomplete.push(`envelope incomplete at corner ${pr.tag} (axis end, other inputs nominal): ${r.message}`);
      }
    }
    got.sort((a, b) => a.x - b.x);
    // an end that coincides with the nominal value (zero tolerance on that side) is one point, not two
    for (let i = got.length - 1; i > 0; i--) if ((got[i] as { x: number }).x === (got[i - 1] as { x: number }).x) got.splice(i, 1);
    for (const o of outputs) {
      const seq = got.filter((g) => g.ev !== undefined).map((g) => (g.ev as Eval).values.get(o.name) as number);
      const scale = Math.max(...seq.map((v) => Math.abs(v)), Number.MIN_VALUE);
      let up = true;
      let down = true;
      for (let i = 1; i < seq.length; i++) {
        const dlt = (seq[i] as number) - (seq[i - 1] as number);
        if (dlt < -MONO_SLACK * scale) up = false;
        if (dlt > MONO_SLACK * scale) down = false;
      }
      if (!up && !down) nonMono.get(o.name)?.add(p.input);
      // slope sign from the first and last points that could be evaluated (at least two distinct x needed)
      const okPts = got.filter((g) => g.ev !== undefined);
      const first = okPts[0]?.ev?.values.get(o.name);
      const last = okPts[okPts.length - 1]?.ev?.values.get(o.name);
      let s: number | undefined;
      const strict = seq.every((v, i) => i === 0 || Math.abs(v - (seq[i - 1] as number)) > MONO_SLACK * scale);
      // with an axis point missing, monotonicity is only credited from at least three strictly ordered points
      const trusted = okPts.length === got.length || (okPts.length >= 3 && ((strict && (up || down)) || (up && down)));
      if (trusted && okPts.length >= 2 && first !== undefined && last !== undefined) s = last > first + MONO_SLACK * scale ? 1 : last < first - MONO_SLACK * scale ? -1 : 0;
      slope.set(slopeKey(o.name, p.input), s);
    }
    for (const g of got) {
      if (g.ev === undefined && (g.tag.endsWith('-') || g.tag.endsWith('+'))) failedAxisEnds.push({ input: p.input, sign: g.tag.endsWith('+') ? 1 : -1 });
    }
  }

  const markOmitted = (output: string, partial: Readonly<Record<string, number>>): void => {
    const entries = Object.entries(partial);
    const mono = (nonMono.get(output)?.size ?? 0) === 0;
    if (!mono || entries.some(([i]) => slope.get(slopeKey(output, i)) === undefined)) {
      // unknown or non-monotone: this point may set either bound
      omitMin.add(output);
      omitMax.add(output);
      return;
    }
    let maxCand = true;
    let minCand = true;
    for (const [i, sgn] of entries) {
      const s = slope.get(slopeKey(output, i)) as number;
      if (s === 0) continue;
      if (sgn * s > 0) minCand = false;
      else maxCand = false;
    }
    if (entries.every(([i]) => slope.get(slopeKey(output, i)) === 0)) return;
    if (maxCand) omitMax.add(output);
    if (minCand) omitMin.add(output);
  };
  for (const e of failedAxisEnds) for (const o of outputs) markOmitted(o.name, { [e.input]: e.sign });

  const k = active.length;
  const cornerCount = k === 0 ? 0 : 2 ** k;
  for (let mask = 0; mask < cornerCount; mask++) {
    const sign: Record<string, number> = {};
    names.forEach((n, i) => {
      sign[n] = (mask >> i) & 1 ? 1 : -1;
    });
    const label = cornerName(sign);
    const r = evalWith(perturbed(baseRec, active, sign));
    if (r.ok) {
      points.push({ label, values: r.ev.values });
      flagExtrap(label, r.ev);
    } else {
      incomplete.push(`envelope incomplete at corner ${label}: ${r.message}`);
      for (const o of outputs) markOmitted(o.name, sign);
    }
  }

  const envelopes: EnvelopeEntry[] = outputs.map((o) => {
    const t = typ.values.get(o.name) as number;
    let lo = t;
    let hi = t;
    let loAt = 'nominal';
    let hiAt = 'nominal';
    for (const pt of points) {
      const v = pt.values.get(o.name) as number;
      if (v < lo) {
        lo = v;
        loAt = pt.label;
      }
      if (v > hi) {
        hi = v;
        hiAt = pt.label;
      }
    }
    const nm = [...(nonMono.get(o.name) ?? [])];
    return {
      output: o.name,
      typ: t,
      min: omitMin.has(o.name) ? null : lo,
      max: omitMax.has(o.name) ? null : hi,
      minAt: loAt,
      maxAt: hiAt,
      monotone: nm.length === 0,
      nonMonotoneInputs: nm,
      label: nm.length === 0 ? 'corners-exact-for-monotone' : 'corners-only',
    };
  });

  return {
    ok: true,
    value: {
      sensitivities,
      envelopes,
      activeInputs: names,
      cornerCount,
      evaluations,
      incomplete,
      extrapolatedCorners: extrapolated,
    },
  };
}
