import type { CalcError, CalcResult, Result } from '../result';
import { DIM, formatFor, mul } from '../units';
import type { Quantity } from '../units';
import { guardQuantity } from './copper-converter/guards';
import { delayPerLength, formatDelayPerLength, guidedWavelength } from './delay-shared';
import type { CommonInputs, DelayOutputs } from './impedance-shared';

/**
 * Shared pieces of the Phase 2 edge-coupled differential calculators (diff-microstrip, diff-stripline): the solve-mode
 * decoding, the common messages and the odd/even delay outputs. No physics of either model lives here.
 *
 * Modes: analysis (width and edgeSpacing given), spacing solve (targetZdiff and width given, edgeSpacing is the unknown),
 * width solve (targetZdiff and edgeSpacing given, width is the unknown).
 */

export type DiffMode = 'analysis' | 'solve-spacing' | 'solve-width';

export interface DiffGeometry {
  readonly mode: DiffMode;
  readonly width?: Quantity;
  readonly edgeSpacing?: Quantity;
  readonly targetZdiff?: Quantity;
}

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

export const MODE_MESSAGE = 'Give width and edgeSpacing (analysis), or targetZdiff with exactly one of width or edgeSpacing (solve for the other).';

/** Decides the mode from which of width, edgeSpacing and targetZdiff are present, then guards each present quantity. */
export function validateDiffGeometry(raw: Record<string, unknown>): Result<DiffGeometry, CalcError> {
  const hasW = raw['width'] !== undefined;
  const hasS = raw['edgeSpacing'] !== undefined;
  const hasZ = raw['targetZdiff'] !== undefined;
  let mode: DiffMode;
  if (hasW && hasS && !hasZ) mode = 'analysis';
  else if (hasZ && hasW && !hasS) mode = 'solve-spacing';
  else if (hasZ && hasS && !hasW) mode = 'solve-width';
  else return { ok: false, error: err('INVALID_INPUT', hasZ ? 'targetZdiff' : hasW ? 'edgeSpacing' : 'width', MODE_MESSAGE) };
  const out: { -readonly [K in keyof DiffGeometry]: DiffGeometry[K] } = { mode };
  if (hasW) {
    const w = guardQuantity('width', raw['width'], DIM.LENGTH, 'length');
    if (!w.ok) return w;
    out.width = w.value;
  }
  if (hasS) {
    const s = guardQuantity('edgeSpacing', raw['edgeSpacing'], DIM.LENGTH, 'length (edge-to-edge spacing of the pair)');
    if (!s.ok) return s;
    out.edgeSpacing = s.value;
  }
  if (hasZ) {
    const z = guardQuantity('targetZdiff', raw['targetZdiff'], DIM.RESISTANCE, 'resistance (ohm)');
    if (!z.ok) return z;
    out.targetZdiff = z.value;
  }
  return { ok: true, value: out };
}

export const num = (x: number): string => String(Number(x.toPrecision(5)));

export const FINITE_THICKNESS_MESSAGE =
  'Finite thickness is not modelled for the coupled model: the ledger rows for the edge-coupled forms (S-022, S-022a) give zero-thickness equations only and no finite-thickness coupled form is recorded, so the entered thickness t is NOT used (it is echoed in the inputs only). A real pair of finite thickness has lower even- and odd-mode impedances for the same width.';

export const SOLVE_CAUTION =
  'Zdiff here is the odd-mode based differential impedance, defined as 2 * Zodd (ledger S-022b); some tools use other definitions, so compare like with like.';

export function dispersionMessageCoupled(frequency: Quantity | undefined, accuracyClass: 'empirical'): string {
  const f = frequency === undefined ? 'no frequency was entered' : `frequency entered: ${formatFor(frequency, { accuracyClass })}`;
  return `Dispersion is not modelled: even- and odd-mode eps_e and the impedances are quasi-static (low-frequency) values and drift with frequency in a real pair, the two modes by different amounts (${f}). No threshold frequency is applied (decision Q-7) and the coupled-line dispersion model (Kirschning-Jansen 1984) was not read; verify with a field solver or fabricator data at your operating frequency.`;
}

/** Appends " (odd mode)" etc. to every result name of a delay block, and optionally renames the skew result. */
export function suffixDelay(d: DelayOutputs, suffix: string, skewName: string): DelayOutputs {
  const results = d.results.map((r) => ({ ...r, name: r.name === 'skew from length mismatch' ? skewName : `${r.name}${suffix}` }));
  return { ...d, results };
}

/** Even-mode delay per length, optional propagation delay and optional guided wavelength from the even-mode eps_eff. */
export function evenModeDelay(epsEven: number, c: CommonInputs): { results: CalcResult['results']; steps: CalcResult['steps'] } {
  const tpd = delayPerLength(epsEven);
  const results: CalcResult['results'] = [
    { name: 'delay per length (even mode)', value: tpd, role: 'secondary', bound: 'prediction', note: formatDelayPerLength(tpd, 'prediction') },
  ];
  const steps: CalcResult['steps'] = [{ label: 'Delay per length, even mode', expr: 't_pd,even = sqrt(eps_e,even) / c', value: tpd, bound: 'prediction' }];
  if (c.length !== undefined) {
    const total = mul(tpd, c.length);
    results.push({ name: 'propagation delay (even mode)', value: total, role: 'secondary', bound: 'prediction' });
  }
  if (c.frequency !== undefined) {
    results.push({ name: 'guided wavelength (even mode)', value: guidedWavelength(epsEven, c.frequency), role: 'secondary', bound: 'nominal' });
  }
  return { results, steps };
}
