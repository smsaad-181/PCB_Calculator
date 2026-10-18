import type { OutOfRangeInput } from '../confidence';
import { ETA0_OHM } from '../data/constants';
import { EllipticDomainError, ellipticKRatioPair } from '../math/elliptic';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning, Result } from '../result';
import { brent } from '../solvers/rootfind';
import { DIM, formatFor } from '../units';
import type { Quantity } from '../units';
import { guardQuantity } from './copper-converter/guards';
import { impField } from './impedance-envelope';
import type { EnvelopeInputs, ImpField, SolveSpec } from './impedance-envelope';
import { SOLDERMASK_MESSAGE, commonInputEchoes, guardEr, isObject, validateCommon } from './impedance-shared';
import type { CommonInputs, LossInputs } from './impedance-shared';
import { solvedMessage, unusedMessage } from './impedance-envelope';
import type { OutputPlan } from './tolerance-shared';

/**
 * Shared pieces of the two coplanar calculators (cpw, cpwg): the conformal-map models, the solve-mode decoding and bracketed
 * solve, the input echoes and the common messages. Equations are those recorded in docs/sources/notes/impedance-models.md:
 *   S-023  (CONFLICT)                       CPW, finite-substrate eps_e by conformal map (decision Q-6)
 *   S-023a (PAYWALLED-USER-MUST-VERIFY)     CPWG, Ghione-Naldi form as transcribed in Qucs 12.10-12.13
 *   S-023b (VERIFIED)                       K(k) by the AGM, K'(k) = K(k')
 * Decision Q-1 is applied to the two prefactors: 30 pi = eta0/4 and 60 pi = eta0/2, with eta0 = mu0 c from exact constants.
 * No finite-thickness correction is recorded in a usable row, so thickness is not modelled (and says so).
 */

/** S-023: 30 pi of the sources, as eta0/4 (decision Q-1). */
export const Z_CPW_PREFACTOR_OHM = ETA0_OHM / 4;
/** S-023a: 60 pi of the sources, as eta0/2 (decision Q-1). */
export const Z_CPWG_PREFACTOR_OHM = ETA0_OHM / 2;

// ---- numerically stable hyperbolic ratios (x, y > 0; no overflow of sinh/cosh for large arguments) ---------------------------

/** sinh(x)/sinh(y) = exp(x - y) expm1(-2x)/expm1(-2y). */
export const sinhRatio = (x: number, y: number): number => Math.exp(x - y) * (Math.expm1(-2 * x) / Math.expm1(-2 * y));
/** tanh(x)/tanh(y) = [expm1(-2x)/expm1(-2y)] (1 + exp(-2y))/(1 + exp(-2x)). */
export const tanhRatio = (x: number, y: number): number => (Math.expm1(-2 * x) / Math.expm1(-2 * y)) * ((1 + Math.exp(-2 * y)) / (1 + Math.exp(-2 * x)));

/** ln of the modulus below which the small-modulus asymptote of K'/K is used (k1 < 1e-8: truncation error O(k1^2) < 1e-16). */
const SMALL_MODULUS_LOG = Math.log(1e-8);

export interface CpwModel {
  /** k = W/(W + 2 s) and k' = sqrt(1 - k^2), the latter evaluated without cancellation. */
  readonly k: number;
  readonly kp: number;
  /** a = pi W/(4h), b = pi (W + 2 s)/(4h). */
  readonly a: number;
  readonly b: number;
  /** k1 = sinh(a)/sinh(b) and k1'. */
  readonly k1: number;
  readonly k1p: number;
  /** rk = K(k')/K(k) and rk1 = K(k1')/K(k1). */
  readonly rk: number;
  readonly rk1: number;
  readonly epsEff: number;
  readonly z0: number;
}

export interface CpwgModel {
  readonly k: number;
  readonly kp: number;
  readonly a: number;
  readonly b: number;
  /** k3 = tanh(a)/tanh(b) and k3'. */
  readonly k3: number;
  readonly k3p: number;
  /** ratioK = K(k)/K(k'), ratioK3 = K(k3)/K(k3'). */
  readonly ratioK: number;
  readonly ratioK3: number;
  /** Filling factor q = ratioK3/(ratioK + ratioK3). */
  readonly q: number;
  readonly epsEff: number;
  readonly z0: number;
}

/** ln sinh(x) and ln cosh(x) for x > 0 without overflow. */
const lnSinh = (x: number): number => x + Math.log(-Math.expm1(-2 * x)) - Math.LN2;
const lnCosh = (x: number): number => x + Math.log1p(Math.exp(-2 * x)) - Math.LN2;

function strip(w: number, s: number, h: number): { k: number; kp: number; a: number; b: number; d: number } {
  const a = (Math.PI * w) / (4 * h);
  const b = (Math.PI * (w + 2 * s)) / (4 * h);
  const d = (Math.PI * s) / (2 * h); // b - a without cancellation
  const k = w / (w + 2 * s);
  const kp = (2 * Math.sqrt(s * (w + s))) / (w + 2 * s); // sqrt(1 - k^2) without cancellation
  return { k, kp, a, b, d };
}

/**
 * S-023: CPW on a finite substrate. All lengths in the same unit (ratios only). Throws EllipticDomainError when a modulus leaves
 * (0, 1) (k rounds to 1, or the ratios overflow); callers catch it and return an OUT_OF_DOMAIN error value.
 */
export function cpwModel(w: number, s: number, h: number, er: number): CpwModel {
  const { k, kp, a, b, d } = strip(w, s, h);
  const rk = ellipticKRatioPair(k, kp);
  // ln k1 = ln[sinh(a)/sinh(b)] is exact in the exponent: -d + ln[expm1(-2a)/expm1(-2b)], d = b - a = pi s/(2h).
  const lnK1 = -d + Math.log(Math.expm1(-2 * a) / Math.expm1(-2 * b));
  let k1: number;
  let k1p: number;
  let rk1: number;
  if (lnK1 < SMALL_MODULUS_LOG) {
    // k1 below 1e-8 (possibly underflowing double, a gap far larger than the substrate): K(k1) = pi/2 and K(k1') = ln(4/k1) hold
    // to relative O(k1^2) < 1e-16, so K(k1')/K(k1) = (2/pi) ln(4/k1) is used with ln k1 from the exact exponent above.
    k1 = Math.exp(lnK1);
    k1p = 1;
    rk1 = (2 / Math.PI) * (2 * Math.LN2 - lnK1);
  } else {
    k1 = sinhRatio(a, b);
    // 1 - k1^2 = sinh(b - a) sinh(b + a)/sinh(b)^2; the exponentials cancel because d = b - a, leaving expm1(-2d) expm1(-2(a + b))/expm1(-2b)^2
    k1p = Math.min(1, Math.sqrt(Math.expm1(-2 * d) * Math.expm1(-2 * (a + b))) / -Math.expm1(-2 * b));
    rk1 = ellipticKRatioPair(k1, k1p);
  }
  const epsEff = 1 + ((er - 1) / 2) * (rk / rk1);
  return { k, kp, a, b, k1, k1p, rk, rk1, epsEff, z0: (Z_CPW_PREFACTOR_OHM / Math.sqrt(epsEff)) * rk };
}

/** S-023a: conductor-backed CPW (lower ground plane at distance h), same conventions as cpwModel. */
export function cpwgModel(w: number, s: number, h: number, er: number): CpwgModel {
  const { k, kp, a, b, d } = strip(w, s, h);
  const ratioK = 1 / ellipticKRatioPair(k, kp);
  const k3 = tanhRatio(a, b);
  // 1 - k3^2 = sinh(d)/sinh(b) x (1 + k3)/cosh(a), d = b - a = pi s/(2h). Its logarithm is exact in the exponent (no underflow):
  const lnK3p = 0.5 * (lnSinh(d) - lnSinh(b) + Math.log(1 + k3) - lnCosh(a));
  let k3p: number;
  let ratioK3: number;
  if (lnK3p < SMALL_MODULUS_LOG) {
    // k3' below 1e-8 (a strip far wider than the substrate is thick; k3' can underflow double): K(k3) = ln(4/k3') and K(k3') = pi/2
    // hold to relative O(k3'^2) < 1e-16, so K(k3)/K(k3') = (2/pi) ln(4/k3').
    k3p = Math.exp(lnK3p);
    ratioK3 = (2 / Math.PI) * (2 * Math.LN2 - lnK3p);
  } else {
    // sinh(d)/sinh(b) x (1 + k3) x 1/cosh(a), with 1/cosh(a) = 2 exp(-a)/(1 + exp(-2a)): no cancellation near k3 = 1
    k3p = Math.min(1, Math.sqrt(sinhRatio(d, b) * (1 + k3) * ((2 * Math.exp(-a)) / (1 + Math.exp(-2 * a)))));
    ratioK3 = 1 / ellipticKRatioPair(k3, k3p);
  }
  const q = ratioK3 / (ratioK + ratioK3);
  const epsEff = 1 + q * (er - 1);
  return { k, kp, a, b, k3, k3p, ratioK, ratioK3, q, epsEff, z0: Z_CPWG_PREFACTOR_OHM / Math.sqrt(epsEff) / (ratioK + ratioK3) };
}

// ---- inputs --------------------------------------------------------------------------------------------------------------

export type CoplanarMode = 'analysis' | 'solve-gap' | 'solve-width';

export interface CoplanarGeometry {
  readonly mode: CoplanarMode;
  readonly width?: Quantity;
  readonly gap?: Quantity;
  readonly targetZ0?: Quantity;
}

export interface CoplanarValid {
  readonly geometry: CoplanarGeometry;
  readonly height: Quantity;
  readonly er: number;
  readonly thickness?: Quantity;
  readonly common: CommonInputs;
}

/** Public input shape of both coplanar calculators. Lengths are Quantities; er is a dimensionless Quantity. */
export interface CoplanarInputs extends LossInputs, EnvelopeInputs {
  width?: Quantity;
  gap?: Quantity;
  targetZ0?: Quantity;
  height: Quantity;
  er: Quantity;
  thickness?: Quantity;
  frequency?: Quantity;
  length?: Quantity;
  lengthMismatch?: Quantity;
  erSource?: string;
  geometrySource?: string;
}

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

export const MODE_MESSAGE = 'Give width and gap (analysis), or targetZ0 with exactly one of width or gap (solve for the other).';

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validateCoplanar(raw: unknown, heightLabel: string): Result<CoplanarValid, CalcError> {
  if (!isObject(raw) || Array.isArray(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };
  const hasW = raw['width'] !== undefined;
  const hasS = raw['gap'] !== undefined;
  const hasZ = raw['targetZ0'] !== undefined;
  let mode: CoplanarMode;
  if (hasW && hasS && !hasZ) mode = 'analysis';
  else if (hasZ && hasW && !hasS) mode = 'solve-gap';
  else if (hasZ && hasS && !hasW) mode = 'solve-width';
  else return { ok: false, error: err('INVALID_INPUT', hasZ ? 'targetZ0' : hasW ? 'gap' : 'width', MODE_MESSAGE) };
  const geo: { -readonly [K in keyof CoplanarGeometry]: CoplanarGeometry[K] } = { mode };
  if (hasW) {
    const w = guardQuantity('width', raw['width'], DIM.LENGTH, 'length (centre strip width)');
    if (!w.ok) return w;
    geo.width = w.value;
  }
  if (hasS) {
    const s = guardQuantity('gap', raw['gap'], DIM.LENGTH, 'length (gap between the strip and each coplanar ground)');
    if (!s.ok) return s;
    geo.gap = s.value;
  }
  if (hasZ) {
    const z = guardQuantity('targetZ0', raw['targetZ0'], DIM.RESISTANCE, 'resistance (ohm)');
    if (!z.ok) return z;
    geo.targetZ0 = z.value;
  }
  const h = guardQuantity('height', raw['height'], DIM.LENGTH, heightLabel);
  if (!h.ok) return h;
  const e = guardEr('er', raw['er']);
  if (!e.ok) return e;
  let thickness: Quantity | undefined;
  if (raw['thickness'] !== undefined) {
    const t = guardQuantity('thickness', raw['thickness'], DIM.LENGTH, 'length');
    if (!t.ok) return t;
    thickness = t.value;
  }
  const c = validateCommon(raw);
  if (!c.ok) return c;
  return { ok: true, value: { geometry: geo, height: h.value, er: e.value, ...(thickness !== undefined ? { thickness } : {}), common: c.value } };
}

/** Inputs with provenance (all user-entered; the labels name where er and the geometry came from). */
export function coplanarInputEchoes(inp: CoplanarValid, er: Quantity): CalcInput[] {
  const geo = inp.geometry;
  const label = inp.common.geometrySource;
  const detail = (l: string | undefined): { sourceDetail?: string } => (l === undefined ? {} : { sourceDetail: l });
  const out: CalcInput[] = [];
  if (geo.width !== undefined) out.push({ name: 'width', value: geo.width, source: 'user', ...detail(label) });
  if (geo.gap !== undefined) out.push({ name: 'gap', value: geo.gap, source: 'user', ...detail(label) });
  if (geo.targetZ0 !== undefined) out.push({ name: 'target Z0', value: geo.targetZ0, source: 'user' });
  out.push({ name: 'height', value: inp.height, source: 'user', ...detail(label) });
  out.push({ name: 'er', value: er, source: 'user', ...detail(inp.common.erSource) });
  if (inp.thickness !== undefined) out.push({ name: 'thickness', value: inp.thickness, source: 'user', ...detail(label) });
  out.push(...commonInputEchoes(inp.common));
  return out;
}

// ---- solving -------------------------------------------------------------------------------------------------------------

/** Bracket of the solve ratios: s/W for the gap solve, W/s for the width solve. Z0 is strictly monotone over all of (0, infinity) in both models. */
export const SOLVE_RATIO_RANGE: readonly [number, number] = [0.01, 100];

export const num = (x: number): string => String(Number(x.toPrecision(5)));

export type Resolved =
  | { readonly ok: true; readonly w: number; readonly s: number; readonly solved: 'gap' | 'width' | null; readonly bracketNote: string }
  | { readonly ok: false; readonly outcome: CalcOutcome };

const fail = (code: CalcError['code'], field: string, message: string): { ok: false; outcome: CalcOutcome } => ({ ok: false, outcome: { ok: false, error: err(code, field, message) } });

/** Z0 of a model, or NaN when its elliptic domain is violated (used at the solver bracket ends and inside the solver). */
export function safeZ0(model: (w: number, s: number, h: number, er: number) => { z0: number }, w: number, s: number, h: number, er: number): number {
  try {
    return model(w, s, h, er).z0;
  } catch (e) {
    if (e instanceof EllipticDomainError) return Number.NaN;
    throw e;
  }
}

/**
 * Analysis: width and gap as given. Gap solve: Brent over 0.01 <= s/W <= 100 (Z0 rises with s). Width solve: Brent over
 * 0.01 <= W/s <= 100 (Z0 falls with W). A target outside the bracket is OUT_OF_DOMAIN and the message states the reachable range.
 */
export function resolveGeometry(geo: CoplanarGeometry, z0At: (w: number, s: number) => number, er: number): Resolved {
  const [lo, hi] = SOLVE_RATIO_RANGE;
  if (geo.mode === 'analysis') return { ok: true, w: (geo.width as Quantity).si, s: (geo.gap as Quantity).si, solved: null, bracketNote: '' };
  const target = (geo.targetZ0 as Quantity).si;
  if (geo.mode === 'solve-gap') {
    const W = (geo.width as Quantity).si;
    const zLo = z0At(W, lo * W);
    const zHi = z0At(W, hi * W);
    if (![zLo, zHi].every((z) => Number.isFinite(z) && z > 0)) return fail('OUT_OF_DOMAIN', 'width', 'The model cannot be evaluated for this width and height (check the units).');
    if (!(target >= zLo && target <= zHi)) {
      return fail(
        'OUT_OF_DOMAIN',
        'targetZ0',
        `The target Z0 ${num(target)} ohm is unreachable for er ${num(er)} at this W and h: over ${String(lo)} <= s/W <= ${String(hi)} (the solve bracket; Z0 rises monotonically with the gap) the model gives Z0 from ${num(zLo)} ohm (s/W = ${String(lo)}) to ${num(zHi)} ohm (s/W = ${String(hi)}). Change the width, the substrate height, er or the target.`,
      );
    }
    const r = brent((x: number): number => z0At(W, x * W) - target, lo, hi, { xtol: 1e-14, maxIter: 200 });
    if (!r.ok) return fail('NO_CONVERGENCE', 'targetZ0', `The gap solve did not converge (${r.reason}: ${r.message}).`);
    return {
      ok: true,
      w: W,
      s: r.x * W,
      solved: 'gap',
      bracketNote: `Bracketed Brent on the analysis function over ${String(lo)} <= s/W <= ${String(hi)} (Z0 rises with the gap); ${String(r.iterations)} iterations, bracket width ${num(r.bracket[1] - r.bracket[0])}.`,
    };
  }
  const S = (geo.gap as Quantity).si;
  const zAtLo = z0At(lo * S, S);
  const zAtHi = z0At(hi * S, S);
  if (![zAtLo, zAtHi].every((z) => Number.isFinite(z) && z > 0)) return fail('OUT_OF_DOMAIN', 'gap', 'The model cannot be evaluated for this gap and height (check the units).');
  if (!(target <= zAtLo && target >= zAtHi)) {
    return fail(
      'OUT_OF_DOMAIN',
      'targetZ0',
      `The target Z0 ${num(target)} ohm is unreachable for er ${num(er)} at this s and h: over ${String(lo)} <= W/s <= ${String(hi)} (the solve bracket; Z0 falls monotonically with the width) the model gives Z0 from ${num(zAtHi)} ohm (W/s = ${String(hi)}) to ${num(zAtLo)} ohm (W/s = ${String(lo)}). Change the gap, the substrate height, er or the target.`,
    );
  }
  const r = brent((x: number): number => z0At(x * S, S) - target, lo, hi, { xtol: 1e-14, maxIter: 200 });
  if (!r.ok) return fail('NO_CONVERGENCE', 'targetZ0', `The width solve did not converge (${r.reason}: ${r.message}).`);
  return {
    ok: true,
    w: r.x * S,
    s: S,
    solved: 'width',
    bracketNote: `Bracketed Brent on the analysis function over ${String(lo)} <= W/s <= ${String(hi)} (Z0 falls with the width); ${String(r.iterations)} iterations, bracket width ${num(r.bracket[1] - r.bracket[0])}.`,
  };
}

/** Maps a thrown elliptic-domain error to the OUT_OF_DOMAIN error value (never a result). */
export function domainFailure(e: unknown): CalcOutcome {
  const detail = e instanceof Error ? e.message : String(e);
  return {
    ok: false,
    error: err(
      'OUT_OF_DOMAIN',
      'gap',
      `The elliptic modulus of this geometry is outside 0 < k < 1 in double precision (for example a gap many orders of magnitude below the width or the substrate height, or ratios that overflow); the model is undefined there. ${detail}`,
    ),
  };
}

// ---- validity and messages -------------------------------------------------------------------------------------------------

export interface SubstrateCheck {
  readonly check: CalcResult['validityChecks'][number];
  readonly outOfRange?: OutOfRangeInput;
  readonly marginal: boolean;
}

/** CPW (no lower ground): Steer's guidance, substrate thickness two or three times both W and s (S-023). Fails below 2; cautions below 3. */
export function substrateCheck(w: number, s: number, h: number, min: number, comfort: number): SubstrateCheck {
  const ratio = h / Math.max(w, s);
  const ok = ratio >= min * (1 - 1e-12);
  const shown = num(ratio);
  return {
    check: {
      name: `h/max(W, s) at least ${String(min)}`,
      ok,
      detail: `Steer (ledger S-023): the substrate thickness should be "two or three times greater than both the strip width w and the metal separation s"; the lower figure, ${String(min)}, is the limit enforced and ${String(comfort)} draws a caution. h/max(W, s) = ${shown}.`,
    },
    ...(ok ? {} : { outOfRange: { name: 'h/max(W, s)', value: shown, bound: `at least ${String(min)}` } }),
    marginal: ok && ratio < comfort * (1 - 1e-12),
  };
}

export { SOLDERMASK_MESSAGE };

export const GROUND_WIDTH_MESSAGE =
  'The coplanar grounds are assumed wide. Steer (ledger S-023) records that a finite ground width of w1 at least 3 W gives values very close to the ideal CPW; the ground width is not an input and is not checked, so a narrower ground changes Z0 and eps_e by an amount this model does not give.';

export function thicknessMessage(thickness: Quantity | undefined): string {
  const head =
    thickness === undefined
      ? 'Zero thickness assumed: finite conductor thickness is not modelled.'
      : `Finite thickness is not modelled: the entered thickness (${formatFor(thickness, { accuracyClass: 'analytical' })}) is NOT used and is echoed in the inputs only.`;
  return `${head} The only thickness correction found (Qucs 12.14-12.18, a single tier-4 source with one equation truncated) is not recorded as usable, so none is applied. A real strip of finite thickness has a narrower effective gap and a lower Z0 than this zero-thickness result.`;
}

export function dispersionMessage(frequency: Quantity | undefined): string {
  const f = frequency === undefined ? 'no frequency was entered' : `frequency entered: ${formatFor(frequency, { accuracyClass: 'analytical' })}`;
  return `Dispersion is not modelled: Z0, eps_e and delay are quasi-static (low-frequency) values and drift with frequency in a real coplanar line (${f}). No threshold frequency is applied (decision Q-7); the dispersion forms found (Qucs 12.19-12.24) are not recorded as usable. Verify with a field solver or fabricator data at your operating frequency.`;
}

/** Warnings and checks that never depend on the model variant. */
export function commonCoplanarWarnings(frequency: Quantity | undefined, thickness: Quantity | undefined): CalcWarning[] {
  return [
    { severity: 'caution', message: dispersionMessage(frequency), code: 'DISPERSION_NOT_MODELLED' },
    { severity: 'caution', message: SOLDERMASK_MESSAGE, code: 'SOLDERMASK_NOT_MODELLED' },
    { severity: 'caution', message: thicknessMessage(thickness), code: 'FINITE_THICKNESS_NOT_MODELLED' },
  ];
}


// ---- tolerance envelope (core D) -----------------------------------------------------------------------------------------------

/** The tolerance fields of both coplanar calculators: width, gap, height, er; the thickness is not modelled so it is refused. */
export function coplanarFields(inp: CoplanarValid): ImpField[] {
  const geo = inp.geometry;
  return [
    impField('width', 'width', 'width', geo.width !== undefined, solvedMessage('the width'), 'traceWidth'),
    impField('gap', 'gap', 'gap', geo.gap !== undefined, solvedMessage('the gap'), 'traceSpace'),
    impField('height', 'height', 'height', true, ''),
    impField('er', 'er', 'er', true, ''),
    impField('thickness', 'thickness', 'thickness', false, inp.thickness === undefined ? 'thickness tolerance needs a thickness; none was given.' : unusedMessage('the thickness', 'the coplanar models do not use it (finite thickness is not modelled).')),
  ];
}

export const COPLANAR_SOLVE: SolveSpec = { target: 'targetZ0', results: { 'gap for target Z0': 'gap', 'trace width for target Z0': 'width' } };

export const COPLANAR_OUTPUTS: readonly OutputPlan[] = [
  { name: 'characteristic impedance Z0', sensitivity: true },
  { name: 'effective permittivity', sensitivity: true },
  { name: 'delay per length', sensitivity: true },
];
