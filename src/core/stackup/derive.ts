import { copperBasisFromFoil } from '../data/constants';
import type { CalcError, CopperBasis, Result } from '../result';
import { DIM, q, toUnit } from '../units';
import type { Quantity } from '../units';
import type { CopperLayer, DielectricLayer, SoldermaskLayer, Stackup } from './types';

/**
 * Geometry the impedance models need, derived from a chosen signal layer of a stack:
 *  - microstrip: h (dielectric thickness to the reference plane), t (trace copper), er;
 *  - symmetric stripline: b (plane-to-plane spacing), t, er.
 * Anything the stack cannot supply is an explicit error: embedded microstrip, offset stripline and inhomogeneous dielectrics
 * are not offered (no verified source, ledger/decisions Q-4), and the error says so. Soldermask is reported, never modelled.
 */

export interface DerivedCommon {
  readonly signalLayer: string;
  readonly er: number;
  /** Loss tangent, only when every dielectric on the path has the same one. */
  readonly df?: number;
  readonly erSource: string;
  readonly t: Quantity;
  /** Basis of t: a nominal basis from a foil weight (with the convention in `source`), or the declared basis of an entered thickness. */
  readonly copper: CopperBasis;
  /** True when the signal copper came from a weight and the stack named no foil convention (the project default was used). */
  readonly conventionDefaulted: boolean;
  readonly notes: readonly string[];
}

export interface MicrostripGeometry extends DerivedCommon {
  readonly referenceLayer: string;
  readonly h: Quantity;
  /** True when the stack has soldermask on the trace side (not modelled). */
  readonly soldermask: boolean;
}

export interface StriplineGeometry extends DerivedCommon {
  readonly referenceAbove: string;
  readonly referenceBelow: string;
  readonly hAbove: Quantity;
  readonly hBelow: Quantity;
  /** Plane-to-plane spacing: dielectric above + strip copper + dielectric below. */
  readonly b: Quantity;
}

const SAME_ER_REL = 1e-9;
const DEFAULT_SYMMETRY_TOL = 1e-9;
const MAX_SYMMETRY_TOL = 0.5;

const fail = (message: string, field?: string): { ok: false; error: CalcError } => ({
  ok: false,
  error: { code: 'OUT_OF_DOMAIN', ...(field !== undefined ? { field } : {}), message },
});
const um = (x: Quantity): string => `${String(Number(toUnit(x, 'um').toPrecision(6)))} µm`;

function locate(s: Stackup, sig: string | number): Result<{ index: number; layer: CopperLayer }, CalcError> {
  let index: number;
  if (typeof sig === 'number') {
    if (!Number.isInteger(sig) || sig < 0 || sig >= s.layers.length) {
      return fail(`signal layer index ${String(sig)} is not a layer of this stack (0 to ${String(s.layers.length - 1)}).`, 'signalLayer');
    }
    index = sig;
  } else if (typeof sig === 'string') {
    index = s.layers.findIndex((l) => l.name === sig);
    if (index < 0) return fail(`signal layer "${sig}" is not a layer of this stack.`, 'signalLayer');
  } else {
    return fail('the signal layer must be a layer name or an index.', 'signalLayer');
  }
  const layer = s.layers[index];
  if (layer === undefined || layer.kind !== 'copper') return fail(`signal layer "${layer?.name ?? String(sig)}" is not a copper layer.`, 'signalLayer');
  return { ok: true, value: { index, layer } };
}

interface Side {
  readonly dielectrics: DielectricLayer[];
  readonly masks: SoldermaskLayer[];
  readonly reference: CopperLayer | undefined;
}

/** Walks from the signal layer in one direction until the next copper layer or the edge of the stack. */
function walk(s: Stackup, from: number, dir: 1 | -1): Side {
  const dielectrics: DielectricLayer[] = [];
  const masks: SoldermaskLayer[] = [];
  for (let i = from + dir; i >= 0 && i < s.layers.length; i += dir) {
    const l = s.layers[i];
    if (l === undefined) break;
    if (l.kind === 'copper') return { dielectrics, masks, reference: l };
    if (l.kind === 'dielectric') dielectrics.push(l);
    else masks.push(l);
  }
  return { dielectrics, masks, reference: undefined };
}

interface Homogeneous {
  readonly er: number;
  readonly df: number | undefined;
  readonly source: string;
  readonly thickness: Quantity;
  readonly notes: string[];
}

function homogeneous(ds: readonly DielectricLayer[], where: string): Result<Homogeneous, CalcError> {
  const first = ds[0];
  if (first === undefined) return fail(`no dielectric ${where}.`);
  let sum = 0;
  const sources: string[] = [];
  for (const d of ds) {
    if (Math.abs(d.er - first.er) > SAME_ER_REL * first.er) {
      return fail(`the dielectric layers ${where} have different er (${String(first.er)} and ${String(d.er)}); an inhomogeneous stack (effective er of mixed layers) is not offered. Enter one er for the whole path.`);
    }
    sum += d.thickness.si;
    if (!sources.includes(d.source)) sources.push(d.source);
  }
  const dfs = ds.map((d) => d.df);
  const someDf = dfs.some((x) => x !== undefined);
  const sameDf = dfs.every((x) => x !== undefined && x === dfs[0]);
  const notes: string[] = [];
  if (someDf && !sameDf) notes.push(`Df is not the same on every dielectric layer ${where}, so no single Df is carried.`);
  return { ok: true, value: { er: first.er, df: sameDf ? dfs[0] : undefined, source: sources.join('; '), thickness: q(sum, DIM.LENGTH), notes } };
}

function copperBasis(layer: CopperLayer, topology: 'outer' | 'inner'): CopperBasis {
  const src = layer.thicknessSource;
  if (src.from === 'weight') return copperBasisFromFoil(topology, src.weight, src.convention);
  return { layer: topology, basis: src.basis, thickness: layer.thickness, source: `Thickness entered in the stackup, declared ${src.basis}.` };
}

function common(layer: CopperLayer, topology: 'outer' | 'inner', h: Homogeneous, notes: string[]): DerivedCommon {
  const src = layer.thicknessSource;
  return {
    signalLayer: layer.name,
    er: h.er,
    ...(h.df !== undefined ? { df: h.df } : {}),
    erSource: h.source,
    t: layer.thickness,
    copper: copperBasis(layer, topology),
    conventionDefaulted: src.from === 'weight' && src.conventionDefaulted,
    notes: [...h.notes, ...notes],
  };
}

/** Microstrip geometry for a signal layer on the outside of the stack: h to the nearest copper layer on the dielectric side. */
export function deriveMicrostrip(s: Stackup, signalLayer: string | number, opts: { readonly referenceLayer?: string } = {}): Result<MicrostripGeometry, CalcError> {
  const loc = locate(s, signalLayer);
  if (!loc.ok) return loc;
  const { index, layer } = loc.value;
  const above = walk(s, index, -1);
  const below = walk(s, index, 1);
  const aboveD = above.dielectrics.length > 0;
  const belowD = below.dielectrics.length > 0;
  if (aboveD && belowD) {
    return fail(`layer "${layer.name}" has dielectric on both sides: that is an embedded microstrip or a stripline. embedded microstrip not offered (no verified source); use the stripline model for a centred inner layer.`, 'signalLayer');
  }
  if (!aboveD && !belowD) return fail(`layer "${layer.name}" has no dielectric next to it, so there is no reference plane.`, 'signalLayer');
  const ref = aboveD ? above : below;
  const air = aboveD ? below : above;
  if (ref.reference === undefined) {
    return fail(`layer "${layer.name}" has no reference plane: there is no copper layer on the dielectric side. A microstrip needs a reference plane (the nearest copper layer is taken as the plane).`, 'signalLayer');
  }
  if (opts.referenceLayer !== undefined && opts.referenceLayer !== ref.reference.name) {
    return fail(`the reference layer "${opts.referenceLayer}" is not the nearest copper layer ("${ref.reference.name}"); the nearest copper layer is the reference plane, and a plane behind another copper layer is not supported.`, 'referenceLayer');
  }
  const h = homogeneous(ref.dielectrics, `between "${layer.name}" and "${ref.reference.name}"`);
  if (!h.ok) return h;
  const notes: string[] = [`The reference plane is "${ref.reference.name}", the nearest copper layer; its copper roughness and thickness are not modelled.`];
  const soldermask = air.masks.length > 0;
  if (soldermask) notes.push('Soldermask over the trace is not modelled (no coating correction); it lowers Z0 slightly in a real board.');
  return { ok: true, value: { ...common(layer, 'outer', h.value, notes), referenceLayer: ref.reference.name, h: h.value.thickness, soldermask } };
}

export interface StriplineOptions {
  /** Largest allowed relative difference between the dielectric above and below the strip. Default 1e-9 (float noise only). 0 to 0.5. */
  readonly symmetryTolerance?: number;
}

/** Symmetric stripline geometry for an inner signal layer: b = plane-to-plane spacing. An off-centre strip is refused. */
export function deriveStripline(s: Stackup, signalLayer: string | number, opts: StriplineOptions = {}): Result<StriplineGeometry, CalcError> {
  const tol = opts.symmetryTolerance ?? DEFAULT_SYMMETRY_TOL;
  if (typeof tol !== 'number' || !Number.isFinite(tol) || tol < 0 || tol > MAX_SYMMETRY_TOL) {
    return fail(`symmetryTolerance must be a finite number from 0 to ${String(MAX_SYMMETRY_TOL)}.`, 'symmetryTolerance');
  }
  const loc = locate(s, signalLayer);
  if (!loc.ok) return loc;
  const { index, layer } = loc.value;
  const above = walk(s, index, -1);
  const below = walk(s, index, 1);
  if (above.dielectrics.length === 0 || below.dielectrics.length === 0) {
    return fail(`layer "${layer.name}" is on the outside of the stack, so it is not a stripline; use the microstrip model.`, 'signalLayer');
  }
  if (above.reference === undefined || below.reference === undefined) {
    return fail(`layer "${layer.name}" has no reference plane (copper layer) on ${above.reference === undefined ? 'the upper' : 'the lower'} side; a stripline needs a plane on both sides.`, 'signalLayer');
  }
  const ha = homogeneous(above.dielectrics, `between "${above.reference.name}" and "${layer.name}"`);
  if (!ha.ok) return ha;
  const hb = homogeneous(below.dielectrics, `between "${layer.name}" and "${below.reference.name}"`);
  if (!hb.ok) return hb;
  if (Math.abs(ha.value.er - hb.value.er) > SAME_ER_REL * ha.value.er) {
    return fail(`the dielectric above (er ${String(ha.value.er)}) and below (er ${String(hb.value.er)}) the strip have different er; an inhomogeneous stripline is not offered.`);
  }
  const a = ha.value.thickness.si;
  const b = hb.value.thickness.si;
  const offset = Math.abs(a - b) / Math.max(a, b);
  if (offset > tol) {
    return fail(
      `offset stripline not offered: the dielectric above the strip is ${um(ha.value.thickness)} and below is ${um(hb.value.thickness)} (differ by ${String(Number((offset * 100).toPrecision(4)))} %, symmetry tolerance ${String(Number((tol * 100).toPrecision(4)))} %). Only a centred strip is modelled.`,
      'signalLayer',
    );
  }
  const notes = [...hb.value.notes.filter((n) => !ha.value.notes.includes(n))];
  if (offset > DEFAULT_SYMMETRY_TOL) notes.push(`The strip is ${String(Number((offset * 100).toPrecision(4)))} % off-centre; accepted under the symmetry tolerance ${String(Number((tol * 100).toPrecision(4)))} % and treated as centred.`);
  const total = homogeneousMerge(ha.value, hb.value);
  const t = layer.thickness.si;
  return {
    ok: true,
    value: {
      ...common(layer, 'inner', total, notes),
      referenceAbove: above.reference.name,
      referenceBelow: below.reference.name,
      hAbove: ha.value.thickness,
      hBelow: hb.value.thickness,
      b: q(a + t + b, DIM.LENGTH),
    },
  };
}

/** One er/Df/source for both sides (er already equal): Df only when both sides carry the same one. */
function homogeneousMerge(a: Homogeneous, b: Homogeneous): Homogeneous {
  const sources = [...new Set([...a.source.split('; '), ...b.source.split('; ')])];
  const df = a.df !== undefined && a.df === b.df ? a.df : undefined;
  const notes = [...a.notes];
  if (df === undefined && (a.df !== undefined || b.df !== undefined) && notes.length === 0) notes.push('Df differs between the dielectric above and below the strip, so no single Df is carried.');
  return { er: a.er, df, source: sources.join('; '), thickness: a.thickness, notes };
}
