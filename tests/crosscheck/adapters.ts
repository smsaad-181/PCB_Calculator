/**
 * Adapter map for the cross-check runner.
 *
 * Key = `calculator` id used in tests/crosscheck/*.json cases.
 * Value = function mapping the case `inputs` (as recorded, tool units as stated in the record) to our calculator's
 * outputs, keyed by the same names as the record's `toolOutputs`.
 *
 * Phase 1 task 10 adapters (they call only the public compute() of each calculator and throw if it returns an error value):
 *   'trace-width-ipc2221'  legacy IPC-2221 (Mode B). Inputs: exactly one of current_A / width_mm, plus deltaT_K,
 *                          thickness_um (copper THICKNESS in micrometres, never a foil weight, so no oz convention can
 *                          cause a mismatch) and layer ('external' | 'internal').
 *                          Outputs: width_mm, width_mil, area_mm2, area_mil2 (current given); current_A, area_mm2,
 *                          area_mil2 (width given).
 *   'trace-resistance'     Inputs: length_mm, width_mm, thickness_um, temperature_C (our conductor temperature; 20 means no
 *                          temperature correction), layer, optional current_A, optional ourResistivity_ohm_m (OUR-side
 *                          override, see the worksheet). Outputs: resistance_ohm, area_mm2, and with a current voltage_drop_V,
 *                          power_W.
 *   'via'                  Inputs: finishedHoleDiameter_mm, platingThickness_um, length_mm, temperature_C, optional current_A,
 *                          optional ourResistivity_ohm_m. One via. Outputs: barrel_area_mm2, resistance_ohm, and with a
 *                          current voltage_drop_V, power_W. Nothing else is mapped: KiCad's via tab has capacitance,
 *                          inductance, ampacity and a different thermal model that do not correspond to our outputs.
 *
 * Phase 2 impedance adapters (public compute() only; outputs are named like the record's toolOutputs, and only quantities a
 * tool can display are mapped; delay is not mapped because the tools show an electrical angle at a frequency, not a delay):
 *   'microstrip'       Inputs: width_mm|width_mil, height_mm|height_mil, er, optional thickness_mm|thickness_mil, optional
 *                      thicknessModel ('none' default | 'hj-procedure-A' | 'hj-procedure-B'), optional frequency_Hz.
 *                      The model is passed EXPLICITLY (never inferred from the presence of a thickness), so a record states
 *                      whether it compares against a tool that ignores thickness or one that applies its own correction.
 *                      Outputs: Z0_ohm, eps_eff.
 *   'stripline'        Inputs: width, spacing (plane to plane, b), er, optional thickness, thicknessModel ('none' default |
 *                      'cohn-wide'), frequency_Hz. Strip centred between the planes. Outputs: Z0_ohm, eps_eff (= er).
 *   'coax'             Inputs: outerDiameter, innerDiameter, er, frequency_Hz. Outputs: Z0_ohm, eps_eff (= er).
 *   'diff-microstrip'  Inputs: width, edgeSpacing (edge to edge), height, er, frequency_Hz. Outputs: Zdiff_ohm, Zodd_ohm,
 *                      Zeven_ohm, eps_eff_odd, eps_eff_even. Our core applies no thickness correction here.
 *   'diff-stripline'   Inputs: width, edgeSpacing, planeSpacing, er, frequency_Hz. Outputs: Zdiff_ohm, Zodd_ohm, Zeven_ohm, eps_eff.
 *   'cpw', 'cpwg'      Inputs: width, gap (each side), height (substrate), er, frequency_Hz. Outputs: Z0_ohm, eps_eff.
 *   Lengths are given as `<name>_mm` or `<name>_mil` (exactly one of the two); er is a plain number.
 *
 * Unknown input keys throw (a typo must never be silently ignored). A case with real (non-null) tool data and no adapter
 * here FAILS the runner, by design.
 */
import { DIM, fromUnit, q, toUnit } from '../../src/core/units';
import type { Quantity } from '../../src/core/units';
import type { CalcOutcome, CalcResult } from '../../src/core/result';
import { compute as computeTraceWidth } from '../../src/core/calculators/trace-width/calc';
import { compute as computeTraceResistance } from '../../src/core/calculators/trace-resistance/calc';
import { compute as computeVia } from '../../src/core/calculators/via/calc';
import { compute as computeMicrostrip } from '../../src/core/calculators/microstrip/calc';
import { compute as computeStripline } from '../../src/core/calculators/stripline/calc';
import { compute as computeCoax } from '../../src/core/calculators/coax/calc';
import { compute as computeDiffMicrostrip } from '../../src/core/calculators/diff-microstrip/calc';
import { compute as computeDiffStripline } from '../../src/core/calculators/diff-stripline/calc';
import { compute as computeCpw } from '../../src/core/calculators/cpw/calc';
import { compute as computeCpwg } from '../../src/core/calculators/cpwg/calc';

export type CrosscheckInputs = Readonly<Record<string, unknown>>;
export type CrosscheckAdapter = (inputs: CrosscheckInputs) => Record<string, number>;

function checkKeys(id: string, inputs: CrosscheckInputs, allowed: readonly string[]): void {
  for (const k of Object.keys(inputs)) {
    if (!allowed.includes(k)) throw new Error(`${id}: unknown input "${k}" (allowed: ${allowed.join(', ')}); ${k === 'copper_oz' ? 'use thickness_um (copper thickness in micrometres), not a foil weight' : 'check the spelling'}`);
  }
}

function num(id: string, inputs: CrosscheckInputs, key: string): number {
  const v = inputs[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${id}: input "${key}" must be a finite number (got ${v === undefined ? 'nothing' : JSON.stringify(v)}); if it is null the tool value has not been filled in`);
  }
  return v;
}

function optNum(id: string, inputs: CrosscheckInputs, key: string): number | undefined {
  return inputs[key] === undefined || inputs[key] === null ? undefined : num(id, inputs, key);
}

function layerOf(id: string, inputs: CrosscheckInputs): 'outer' | 'inner' {
  const l = inputs['layer'];
  if (l === 'external') return 'outer';
  if (l === 'internal') return 'inner';
  throw new Error(`${id}: input "layer" must be exactly "external" or "internal" (got ${JSON.stringify(l)})`);
}

function value(id: string, outcome: CalcOutcome): CalcResult {
  if (!outcome.ok) {
    throw new Error(`${id}: our calculator returned an error (${outcome.error.code}${outcome.error.field !== undefined ? ` on ${outcome.error.field}` : ''}): ${outcome.error.message}`);
  }
  return outcome.value;
}

function result(id: string, r: CalcResult, name: string): Quantity {
  const found = r.results.find((x) => x.name === name);
  if (found === undefined) throw new Error(`${id}: our calculator has no result named "${name}"`);
  return found.value;
}

const resistivity = (v: number): Quantity => q(v, DIM.RESISTIVITY);

const TRACE_WIDTH_KEYS = ['current_A', 'width_mm', 'deltaT_K', 'thickness_um', 'layer'] as const;

const traceWidthIpc2221: CrosscheckAdapter = (inputs) => {
  const id = 'trace-width-ipc2221';
  checkKeys(id, inputs, TRACE_WIDTH_KEYS);
  const layer = layerOf(id, inputs);
  const hasI = inputs['current_A'] !== undefined;
  const hasW = inputs['width_mm'] !== undefined;
  if (hasI === hasW) throw new Error(`${id}: give exactly one of current_A or width_mm (the other one is the tool output being compared)`);
  const r = value(
    id,
    computeTraceWidth({
      mode: 'B',
      layer,
      deltaT: fromUnit(num(id, inputs, 'deltaT_K'), 'ddegC'),
      copperThickness: fromUnit(num(id, inputs, 'thickness_um'), 'um'),
      ...(hasI ? { current: fromUnit(num(id, inputs, 'current_A'), 'A') } : { width: fromUnit(num(id, inputs, 'width_mm'), 'mm') }),
    }),
  );
  const area = result(id, r, 'cross-section area');
  const out: Record<string, number> = { area_mil2: toUnit(area, 'mil2'), area_mm2: toUnit(area, 'mm2') };
  if (hasI) {
    const w = result(id, r, 'width');
    out['width_mm'] = toUnit(w, 'mm');
    out['width_mil'] = toUnit(w, 'mil');
  } else {
    out['current_A'] = toUnit(result(id, r, 'current capacity'), 'A');
  }
  return out;
};

const TRACE_RES_KEYS = ['length_mm', 'width_mm', 'thickness_um', 'temperature_C', 'layer', 'current_A', 'ourResistivity_ohm_m'] as const;

const traceResistance: CrosscheckAdapter = (inputs) => {
  const id = 'trace-resistance';
  checkKeys(id, inputs, TRACE_RES_KEYS);
  const layer = layerOf(id, inputs);
  const current = optNum(id, inputs, 'current_A');
  const rho = optNum(id, inputs, 'ourResistivity_ohm_m');
  const r = value(
    id,
    computeTraceResistance({
      layer,
      length: fromUnit(num(id, inputs, 'length_mm'), 'mm'),
      width: fromUnit(num(id, inputs, 'width_mm'), 'mm'),
      copperThickness: fromUnit(num(id, inputs, 'thickness_um'), 'um'),
      ambient: fromUnit(num(id, inputs, 'temperature_C'), 'degC'),
      ...(current !== undefined ? { current: fromUnit(current, 'A') } : {}),
      ...(rho !== undefined ? { resistivity: resistivity(rho) } : {}),
    }),
  );
  const out: Record<string, number> = {
    resistance_ohm: toUnit(result(id, r, 'resistance at conductor temperature'), 'ohm'),
    area_mm2: toUnit(result(id, r, 'cross-section area'), 'mm2'),
  };
  if (current !== undefined) {
    out['voltage_drop_V'] = toUnit(result(id, r, 'voltage drop'), 'V');
    out['power_W'] = toUnit(result(id, r, 'power loss'), 'W');
  }
  return out;
};

const VIA_KEYS = ['finishedHoleDiameter_mm', 'platingThickness_um', 'length_mm', 'temperature_C', 'current_A', 'ourResistivity_ohm_m'] as const;

const viaAdapter: CrosscheckAdapter = (inputs) => {
  const id = 'via';
  checkKeys(id, inputs, VIA_KEYS);
  const current = optNum(id, inputs, 'current_A');
  const rho = optNum(id, inputs, 'ourResistivity_ohm_m');
  const r = value(
    id,
    computeVia({
      finishedHoleDiameter: fromUnit(num(id, inputs, 'finishedHoleDiameter_mm'), 'mm'),
      platingThickness: fromUnit(num(id, inputs, 'platingThickness_um'), 'um'),
      barrelLength: fromUnit(num(id, inputs, 'length_mm'), 'mm'),
      count: 1,
      conductorTemperature: fromUnit(num(id, inputs, 'temperature_C'), 'degC'),
      ...(current !== undefined ? { current: fromUnit(current, 'A') } : {}),
      ...(rho !== undefined ? { resistivity: resistivity(rho) } : {}),
    }),
  );
  const out: Record<string, number> = {
    barrel_area_mm2: toUnit(result(id, r, 'barrel copper area (one via)'), 'mm2'),
    resistance_ohm: toUnit(result(id, r, 'resistance at conductor temperature'), 'ohm'),
  };
  if (current !== undefined) {
    out['voltage_drop_V'] = toUnit(result(id, r, 'voltage drop'), 'V');
    out['power_W'] = toUnit(result(id, r, 'power loss'), 'W');
  }
  return out;
};

// ---- Phase 2 impedance adapters ---------------------------------------------------------------------------------------------

/** A length given as `<base>_mm` or `<base>_mil`; exactly one of the two must be present. */
function lengthIn(id: string, inputs: CrosscheckInputs, base: string, required: true): Quantity;
function lengthIn(id: string, inputs: CrosscheckInputs, base: string, required: false): Quantity | undefined;
function lengthIn(id: string, inputs: CrosscheckInputs, base: string, required: boolean): Quantity | undefined {
  const hasMm = inputs[`${base}_mm`] !== undefined;
  const hasMil = inputs[`${base}_mil`] !== undefined;
  if (hasMm && hasMil) throw new Error(`${id}: give exactly one of ${base}_mm or ${base}_mil, not both`);
  if (!hasMm && !hasMil) {
    if (required) throw new Error(`${id}: give exactly one of ${base}_mm or ${base}_mil (the ${base} is missing)`);
    return undefined;
  }
  return hasMm ? fromUnit(num(id, inputs, `${base}_mm`), 'mm') : fromUnit(num(id, inputs, `${base}_mil`), 'mil');
}

const dimless = (v: number): Quantity => q(v, DIM.DIMENSIONLESS);
const REC_SOURCE = 'cross-check record input (value as typed into the third-party tool)';

/** Fields shared by all impedance adapters: er, optional frequency, and the provenance labels our UI asks for. */
function commonImpedance(id: string, inputs: CrosscheckInputs): { er: Quantity; frequency?: Quantity; erSource: string; geometrySource: string } {
  const f = optNum(id, inputs, 'frequency_Hz');
  return {
    er: dimless(num(id, inputs, 'er')),
    ...(f !== undefined ? { frequency: fromUnit(f, 'Hz') } : {}),
    erSource: REC_SOURCE,
    geometrySource: REC_SOURCE,
  };
}

/** The first entry of `allowed` is the default and is always 'none'. */
function modelOf<T extends string>(id: string, inputs: CrosscheckInputs, allowed: readonly [T, ...T[]]): T {
  const m = inputs['thicknessModel'];
  if (m === undefined) return allowed[0];
  const hit = allowed.find((a) => a === m);
  if (hit === undefined) throw new Error(`${id}: thicknessModel must be one of ${allowed.join(', ')} (got ${JSON.stringify(m)})`);
  return hit;
}

const ohm = (id: string, r: CalcResult, name: string): number => toUnit(result(id, r, name), 'ohm');
const plain = (id: string, r: CalcResult, name: string): number => result(id, r, name).si;

const MS_KEYS = ['width_mm', 'width_mil', 'height_mm', 'height_mil', 'thickness_mm', 'thickness_mil', 'er', 'thicknessModel', 'frequency_Hz'] as const;
const microstripAdapter: CrosscheckAdapter = (inputs) => {
  const id = 'microstrip';
  checkKeys(id, inputs, MS_KEYS);
  const model = modelOf(id, inputs, ['none', 'hj-procedure-A', 'hj-procedure-B']);
  const t = lengthIn(id, inputs, 'thickness', false);
  const r = value(
    id,
    computeMicrostrip({
      width: lengthIn(id, inputs, 'width', true),
      height: lengthIn(id, inputs, 'height', true),
      ...(t !== undefined ? { thickness: t } : {}),
      thicknessModel: model,
      ...commonImpedance(id, inputs),
    }),
  );
  return { Z0_ohm: ohm(id, r, 'characteristic impedance Z0'), eps_eff: plain(id, r, 'effective permittivity') };
};

const SL_KEYS = ['width_mm', 'width_mil', 'spacing_mm', 'spacing_mil', 'thickness_mm', 'thickness_mil', 'er', 'thicknessModel', 'frequency_Hz'] as const;
const striplineAdapter: CrosscheckAdapter = (inputs) => {
  const id = 'stripline';
  checkKeys(id, inputs, SL_KEYS);
  const model = modelOf(id, inputs, ['none', 'cohn-wide']);
  const t = lengthIn(id, inputs, 'thickness', false);
  const r = value(
    id,
    computeStripline({
      width: lengthIn(id, inputs, 'width', true),
      spacing: lengthIn(id, inputs, 'spacing', true),
      ...(t !== undefined ? { thickness: t } : {}),
      thicknessModel: model,
      ...commonImpedance(id, inputs),
    }),
  );
  return { Z0_ohm: ohm(id, r, 'characteristic impedance Z0'), eps_eff: plain(id, r, 'effective permittivity') };
};

const COAX_KEYS = ['outerDiameter_mm', 'outerDiameter_mil', 'innerDiameter_mm', 'innerDiameter_mil', 'er', 'frequency_Hz'] as const;
const coaxAdapter: CrosscheckAdapter = (inputs) => {
  const id = 'coax';
  checkKeys(id, inputs, COAX_KEYS);
  const r = value(
    id,
    computeCoax({
      outerDiameter: lengthIn(id, inputs, 'outerDiameter', true),
      innerDiameter: lengthIn(id, inputs, 'innerDiameter', true),
      ...commonImpedance(id, inputs),
    }),
  );
  return { Z0_ohm: ohm(id, r, 'characteristic impedance Z0'), eps_eff: plain(id, r, 'effective permittivity') };
};

const DM_KEYS = ['width_mm', 'width_mil', 'edgeSpacing_mm', 'edgeSpacing_mil', 'height_mm', 'height_mil', 'er', 'frequency_Hz'] as const;
const diffMicrostripAdapter: CrosscheckAdapter = (inputs) => {
  const id = 'diff-microstrip';
  checkKeys(id, inputs, DM_KEYS);
  const r = value(
    id,
    computeDiffMicrostrip({
      width: lengthIn(id, inputs, 'width', true),
      edgeSpacing: lengthIn(id, inputs, 'edgeSpacing', true),
      height: lengthIn(id, inputs, 'height', true),
      ...commonImpedance(id, inputs),
    }),
  );
  return {
    Zdiff_ohm: ohm(id, r, 'differential impedance Zdiff'),
    Zodd_ohm: ohm(id, r, 'odd-mode impedance Zodd'),
    Zeven_ohm: ohm(id, r, 'even-mode impedance Zeven'),
    eps_eff_odd: plain(id, r, 'odd-mode effective permittivity'),
    eps_eff_even: plain(id, r, 'even-mode effective permittivity'),
  };
};

const DS_KEYS = ['width_mm', 'width_mil', 'edgeSpacing_mm', 'edgeSpacing_mil', 'planeSpacing_mm', 'planeSpacing_mil', 'er', 'frequency_Hz'] as const;
const diffStriplineAdapter: CrosscheckAdapter = (inputs) => {
  const id = 'diff-stripline';
  checkKeys(id, inputs, DS_KEYS);
  const r = value(
    id,
    computeDiffStripline({
      width: lengthIn(id, inputs, 'width', true),
      edgeSpacing: lengthIn(id, inputs, 'edgeSpacing', true),
      planeSpacing: lengthIn(id, inputs, 'planeSpacing', true),
      ...commonImpedance(id, inputs),
    }),
  );
  return {
    Zdiff_ohm: ohm(id, r, 'differential impedance Zdiff'),
    Zodd_ohm: ohm(id, r, 'odd-mode impedance Zodd'),
    Zeven_ohm: ohm(id, r, 'even-mode impedance Zeven'),
    eps_eff: plain(id, r, 'effective permittivity'),
  };
};

const CPW_KEYS = ['width_mm', 'width_mil', 'gap_mm', 'gap_mil', 'height_mm', 'height_mil', 'er', 'frequency_Hz'] as const;
function coplanarAdapter(id: string, run: (i: Parameters<typeof computeCpw>[0]) => CalcOutcome): CrosscheckAdapter {
  return (inputs) => {
    checkKeys(id, inputs, CPW_KEYS);
    const r = value(
      id,
      run({
        width: lengthIn(id, inputs, 'width', true),
        gap: lengthIn(id, inputs, 'gap', true),
        height: lengthIn(id, inputs, 'height', true),
        ...commonImpedance(id, inputs),
      }),
    );
    return { Z0_ohm: ohm(id, r, 'characteristic impedance Z0'), eps_eff: plain(id, r, 'effective permittivity') };
  };
}

export const CROSSCHECK_ADAPTERS: Record<string, CrosscheckAdapter> = {
  'trace-width-ipc2221': traceWidthIpc2221,
  'trace-resistance': traceResistance,
  via: viaAdapter,
  microstrip: microstripAdapter,
  stripline: striplineAdapter,
  coax: coaxAdapter,
  'diff-microstrip': diffMicrostripAdapter,
  'diff-stripline': diffStriplineAdapter,
  cpw: coplanarAdapter('cpw', computeCpw),
  cpwg: coplanarAdapter('cpwg', computeCpwg),
};
