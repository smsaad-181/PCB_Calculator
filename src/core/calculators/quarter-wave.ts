import { rateConfidence } from '../confidence';
import type { AccuracyClass } from '../confidence';
import { C_LEDGER_ID, C_M_PER_S } from '../data/constants';
import { dataStatusForLedgerIds } from '../data-status';
import { assertCalcResult } from '../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning, Result } from '../result';
import { DIM, q } from '../units';
import type { Quantity } from '../units';
import { guardQuantity } from './copper-converter/guards';
import { delayPerLength, guidedWavelength } from './delay-shared';
import { dimensionless, guardEr, guardLabel, isObject } from './impedance-shared';

/**
 * Quarter-wave helper for a TRANSMISSION-LINE stub or resonator (Phase 2 core D, task 3; ledger S-029c UNVERIFIED, derived from
 * S-029a). Given eps_eff (from any of the line models) and a frequency it returns lambda_g/4 = c / (4 f sqrt(eps_eff)); given a
 * physical length it returns the frequency at which that length is a quarter of the guided wavelength. There is NO antenna mode:
 * the antenna length is not computed (decision Q-18), only a warning is shown. Open-end extension and other end effects are not
 * modelled. eps_eff is a user-entered number here and inherits the accuracy and the badge of the model that produced it.
 */

export interface Inputs {
  /** eps_eff as a dimensionless Quantity, at least 1. */
  epsEff: Quantity;
  /** Exactly one of frequency and length. */
  frequency?: Quantity;
  length?: Quantity;
  /** Where eps_eff came from (for example "microstrip result, 150 um"). Optional free text. */
  epsEffSource?: string;
}

export const meta = {
  id: 'quarter-wave',
  title: 'Quarter-wave stub helper (transmission line, not an antenna)',
  method: 'Guided quarter wavelength of a transmission-line stub or resonator from eps_eff: lambda_g/4 = c / (4 f sqrt(eps_eff)); no end effects, no dispersion, no antenna',
  reference: {
    standard: 'Derived from the guided wavelength lambda_g = lambda0/sqrt(eps_eff) (Steer, Microwave and RF Design II §3.5); antenna caveat from EnOcean AN102 (2026-06-25)',
    edition: 'derived, not sourced as a helper; ledger S-029c (UNVERIFIED), S-029a, S-029',
    ledgerIds: ['S-029c', 'S-029a', C_LEDGER_ID],
  },
  formula:
    'λg = λ0/√εeff = c/(f·√εeff); stub length L = λg/4 = c/(4·f·√εeff); resonant frequency of a given length f = c/(4·L·√εeff); ' +
    'free-space λ0/4 = c/(4·f) is shown for comparison only; c = 299 792 458 m/s exactly (S-029)',
  ledgerIds: ['S-029c', 'S-029a', C_LEDGER_ID],
  validity: { epsEffMin: 1 },
  accuracyClass: 'analytical' as AccuracyClass,
  toleranceInputs: [] as string[],
} as const;

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

export const ANTENNA_MESSAGE =
  'free-space lambda/4 is not the guided lambda/4 and no antenna length is computed here. For an antenna the length is set by geometry, substrate, ground plane, enclosure and end effects and must be tuned by measurement (the EnOcean note in ledger S-029c uses a different factor of 0.75 of the free-space wavelength, which is not a microstrip eps_eff); this helper is for transmission-line stubs and resonators only.';
export const END_EFFECTS_MESSAGE =
  'end effects (open-end extension) not modelled: a real open-ended stub is electrically longer than its metal by the fringing extension, a short or via adds inductance, and a junction or neighbouring trace loads the stub; the physical length for resonance is therefore somewhat shorter than the value shown. No correction is applied because none is recorded in the ledger.';
const DISPERSION_MESSAGE =
  'Dispersion is not modelled: eps_eff is taken as a single number, so the quarter-wave length or frequency is a quasi-static value; eps_eff and the laminate er drift with frequency (decision Q-7: no threshold frequency is applied). Use eps_eff evaluated for your frequency.';
const EPS_MESSAGE =
  'eps_eff is the value you entered; it inherits the accuracy and the badge of the model that produced it (its own validity range and ledger status apply) and has not been checked against the fabricator.';

function validate(raw: unknown): Result<{ epsEff: number; frequency?: Quantity; length?: Quantity; epsEffSource?: string }, CalcError> {
  if (!isObject(raw) || Array.isArray(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };
  const hasF = raw['frequency'] !== undefined;
  const hasL = raw['length'] !== undefined;
  if (hasF === hasL) {
    return { ok: false, error: err('INVALID_INPUT', hasF ? 'length' : 'frequency', 'Give exactly one of frequency (for the quarter-wave length) or length (for the quarter-wave frequency), not both and not neither.') };
  }
  const e = guardEr('epsEff', raw['epsEff']);
  if (!e.ok) return e;
  const out: { epsEff: number; frequency?: Quantity; length?: Quantity; epsEffSource?: string } = { epsEff: e.value };
  if (hasF) {
    const f = guardQuantity('frequency', raw['frequency'], DIM.FREQUENCY, 'frequency (Hz)');
    if (!f.ok) return f;
    out.frequency = f.value;
  } else {
    const l = guardQuantity('length', raw['length'], DIM.LENGTH, 'length');
    if (!l.ok) return l;
    out.length = l.value;
  }
  const s = guardLabel('epsEffSource', raw['epsEffSource']);
  if (!s.ok) return s;
  if (s.value !== undefined) out.epsEffSource = s.value;
  return { ok: true, value: out };
}

const lengthQ = (x: number): Quantity => q(x, DIM.LENGTH);

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const { epsEff, frequency, length } = v.value;
  const root = Math.sqrt(epsEff);
  const dl = dimensionless;

  const inputs: CalcInput[] = [
    { name: 'eps_eff', value: dl(epsEff), source: 'user', ...(v.value.epsEffSource !== undefined ? { sourceDetail: v.value.epsEffSource } : {}) },
  ];
  const steps: CalcResult['steps'] = [{ label: 'Square root of eps_eff', expr: 'sqrt(eps_eff)', value: dl(root) }];
  const results: CalcResult['results'] = [];

  let fHz: number;
  if (frequency !== undefined) {
    fHz = frequency.si;
    inputs.push({ name: 'frequency', value: frequency, source: 'user' });
    const lam = guidedWavelength(epsEff, frequency);
    const quarter = lengthQ(lam.si / 4);
    steps.push({ label: 'Guided wavelength', expr: 'lambda_g = c / (f x sqrt(eps_eff))', value: lam }, { label: 'Quarter guided wavelength', expr: 'L = lambda_g / 4', value: quarter });
    results.push(
      { name: 'guided quarter-wave length lambda_g/4', value: quarter, role: 'primary', bound: 'nominal', note: 'transmission-line stub or resonator only; end effects not modelled' },
      { name: 'guided wavelength lambda_g', value: lam, role: 'secondary', bound: 'nominal' },
      { name: 'free-space quarter wavelength lambda0/4 (comparison only, not a stub or antenna length)', value: lengthQ(C_M_PER_S / (4 * fHz)), role: 'secondary', bound: 'nominal', note: 'shown to make the difference from the guided value visible; not an antenna length' },
    );
  } else {
    const L = length as Quantity;
    inputs.push({ name: 'length', value: L, source: 'user' });
    fHz = C_M_PER_S / (4 * L.si * root);
    const fq = q(fHz, DIM.FREQUENCY);
    const lam = guidedWavelength(epsEff, fq);
    steps.push({ label: 'Quarter-wave frequency', expr: 'f = c / (4 L sqrt(eps_eff))', value: fq });
    results.push(
      { name: 'quarter-wave frequency for the given length', value: fq, role: 'primary', bound: 'nominal', note: 'transmission-line stub or resonator only; end effects not modelled' },
      { name: 'guided wavelength at that frequency', value: lam, role: 'secondary', bound: 'nominal' },
      { name: 'free-space quarter wavelength lambda0/4 (comparison only, not a stub or antenna length)', value: lengthQ(C_M_PER_S / (4 * fHz)), role: 'secondary', bound: 'nominal', note: 'shown to make the difference from the guided value visible; not an antenna length' },
    );
  }
  const tpd = delayPerLength(epsEff);
  steps.push({ label: 'Delay per length (for reference)', expr: 't_pd = sqrt(eps_eff) / c', value: tpd });
  for (const r of results) {
    if (!Number.isFinite(r.value.si) || !(r.value.si > 0)) {
      return { ok: false, error: err('OUT_OF_DOMAIN', frequency !== undefined ? 'frequency' : 'length', `Result "${r.name}" is not a finite positive number for these inputs (check the units).`) };
    }
  }

  const ledgerIds = [...meta.reference.ledgerIds];
  const dataStatus = dataStatusForLedgerIds(ledgerIds);
  const confidence = rateConfidence({ outOfRangeInputs: [], defaultedAssumptions: [], accuracyClass: meta.accuracyClass, dataStatus });
  const warnings: CalcWarning[] = [
    { severity: 'caution', message: END_EFFECTS_MESSAGE, code: 'END_EFFECTS_NOT_MODELLED' },
    { severity: 'warning', message: ANTENNA_MESSAGE, code: 'ANTENNA_NOT_COMPUTED' },
    { severity: 'caution', message: DISPERSION_MESSAGE, code: 'DISPERSION_NOT_MODELLED' },
    { severity: 'info', message: EPS_MESSAGE, code: 'EPS_EFF_USER_ENTERED' },
  ];
  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds },
    formula: meta.formula,
    inputs,
    assumptions: [
      'The line is a uniform transmission line with one eps_eff; the stub is straight, unloaded and its far end is an ideal open or short.',
      'c = 299 792 458 m/s exactly (ledger S-029), not 3e8 m/s.',
      'The helper is derived from the guided wavelength (S-029a); no read source prints it as a helper (ledger S-029c, UNVERIFIED).',
      'No antenna length is computed; the free-space quarter wavelength is shown only so that its difference from the guided one is visible.',
    ],
    steps,
    results,
    validityChecks: [{ name: 'eps_eff at least 1', ok: true, detail: `eps_eff = ${String(Number(epsEff.toPrecision(5)))}; a passive dielectric cannot be below vacuum (domain condition, not an accuracy range).` }],
    warnings,
    confidence,
    recommendation: 'Approximate helper for a transmission-line stub. Confirm the resonance on the real board (field solver or measurement); this is not an antenna design tool.',
    dataStatus,
    designValues: [],
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) return { ok: false, error: { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` } };
  return { ok: true, value: result };
}

/** Quarter-wave length (from a frequency) or frequency (from a length) of a transmission-line stub. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
