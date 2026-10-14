import type { OutOfRangeInput } from '../../confidence';
import { dataStatusForLedgerIds } from '../../data-status';
import { nearest } from '../../eseries';
import type { SeriesName } from '../../eseries';
import type { CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { Failure, fin, finish, finPos, num, pct, rate, run, text, within } from '../circuit-shared';
import { validate } from './guards';
import type { SeriesChoice } from './guards';
import { meta } from './meta';

export interface Inputs {
  /** Supply voltage. */
  vs: Quantity;
  /** Forward voltage of ONE LED at the target current, from the LED datasheet (user input; no typical value is assumed). */
  vf: Quantity;
  /** Target LED current. */
  current: Quantity;
  /** LEDs in series (whole number, default 1). */
  nLeds?: number;
  /** Stock series the resistor is rounded UP to; 'none' (default) gives the exact value. */
  series?: SeriesChoice;
  /** Rated power of the resistor you will use (user input); gives a margin. Not checked when absent. */
  resistorRating?: Quantity;
}

const RECOMMENDATION =
  'The resistor value is a minimum for the target current (rounded up to a stock value when a series is chosen). The LED forward voltage is a nominal figure that changes with current, temperature and production bin, so treat the current as approximate and check it against the LED datasheet limits. Check the resistor power rating against the dissipation shown.';
const VF_CAUTION =
  'LED forward voltage is not constant: it depends on current, junction temperature and production bin. R = (Vs − N × Vf) / If gives a nominal resistor only, and the current you get is approximate. The sensitivity to a Vf shift is shown.';
const RATING_NOT_CHECKED = 'resistor power rating not checked: enter the rated power of the resistor you will use';
const STATUS_PLAIN = dataStatusForLedgerIds(['S-019']);
const STATUS_SNAP = dataStatusForLedgerIds(['S-019', 'S-016']);
const ACC = meta.accuracyClass;

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const vs = inp.vs.si;
  const vf = inp.vf.si;
  const target = inp.current.si;
  const n = inp.nLeds;
  const snapped = inp.series !== 'none';

  const vfTotal = fin(n * vf, 'Total forward voltage');
  const headroom = finPos(vs - vfTotal, 'Voltage across the resistor');
  const ideal = finPos(headroom / target, 'Required resistance');
  let r = ideal;
  if (snapped) {
    if (ideal < 1e-12 || ideal > 1e12) throw new Failure('OUT_OF_DOMAIN', 'The required resistance is outside 1e-12 to 1e12 ohm and cannot be rounded to a series.', 'current');
    const s = nearest(ideal, inp.series as SeriesName, 'up');
    if (!s.ok) throw new Failure('OUT_OF_DOMAIN', s.error.message, 'current');
    r = s.value.value;
  }
  const iAct = finPos(headroom / r, 'LED current');
  const errFrac = (iAct - target) / target;
  const pR = finPos(iAct * iAct * r, 'Resistor power');
  const pLed = finPos(vf * iAct, 'Power in one LED');
  const pLeds = finPos(n * pLed, 'Power in all LEDs');
  const pSrc = finPos(vs * iAct, 'Source power');
  const dI = fin((n * meta.vfSensitivityStepV) / r, 'Current sensitivity to Vf');

  const inputs: CalcInput[] = [
    { name: 'vs', value: q(vs, DIM.VOLTAGE), source: 'user' },
    { name: 'vf', value: q(vf, DIM.VOLTAGE), source: 'user', sourceDetail: 'user-supplied (LED datasheet); no typical value is assumed' },
    { name: 'current', value: q(target, DIM.CURRENT), source: 'user' },
  ];
  if (inp.resistorRating !== undefined) inputs.push({ name: 'resistorRating', value: q(inp.resistorRating.si, DIM.POWER), source: 'user' });

  const steps: CalcResult['steps'] = [
    { label: 'Total forward voltage', expr: 'Vfn = N × Vf', value: q(vfTotal, DIM.VOLTAGE) },
    { label: 'Voltage across the resistor', expr: 'Vr = Vs − N × Vf', value: q(headroom, DIM.VOLTAGE) },
    { label: 'Required resistance', expr: 'R = Vr / If', value: q(ideal, DIM.RESISTANCE) },
  ];
  if (snapped) steps.push({ label: `Round up to ${inp.series}`, expr: "R′ = smallest stock value ≥ R", value: q(r, DIM.RESISTANCE) });
  steps.push({ label: 'Actual LED current', expr: "If′ = Vr / R′", value: q(iAct, DIM.CURRENT) });
  steps.push({ label: 'Resistor power', expr: "P = If′² × R′", value: q(pR, DIM.POWER) });

  const results: CalcResult['results'] = [
    { name: 'resistor', value: q(r, DIM.RESISTANCE), role: 'primary', bound: 'min-requirement' },
    { name: 'led current', value: q(iAct, DIM.CURRENT), role: 'secondary', bound: 'prediction' },
    { name: 'current error vs target', value: q(errFrac, DIM.DIMENSIONLESS), role: 'secondary', bound: 'nominal' },
    { name: 'voltage across resistor', value: q(headroom, DIM.VOLTAGE), role: 'secondary', bound: 'nominal' },
    { name: 'power in resistor', value: q(pR, DIM.POWER), role: 'secondary', bound: 'prediction' },
    { name: 'power in each led', value: q(pLed, DIM.POWER), role: 'secondary', bound: 'prediction' },
    { name: 'power in all leds', value: q(pLeds, DIM.POWER), role: 'secondary', bound: 'prediction' },
    { name: 'source power', value: q(pSrc, DIM.POWER), role: 'secondary', bound: 'prediction' },
    { name: 'current change per 0.1 V Vf shift per led', value: q(dI, DIM.CURRENT), role: 'secondary', bound: 'prediction' },
  ];
  if (snapped) results.push({ name: 'ideal resistor', value: q(ideal, DIM.RESISTANCE), role: 'secondary', bound: 'min-requirement' });
  if (n > 1) results.push({ name: 'total forward voltage', value: q(vfTotal, DIM.VOLTAGE), role: 'secondary', bound: 'nominal' });

  const warnings: CalcWarning[] = [{ severity: 'info', message: VF_CAUTION, code: 'VF_NOT_CONSTANT' }];
  if (inp.resistorRating === undefined) {
    warnings.push({ severity: 'info', message: RATING_NOT_CHECKED, code: 'RESISTOR_RATING_NOT_CHECKED' });
  } else {
    const rating = inp.resistorRating.si;
    const util = pR / rating;
    results.push({ name: 'resistor power utilisation', value: q(util, DIM.DIMENSIONLESS), role: 'secondary', bound: 'prediction' });
    results.push({ name: 'resistor power margin', value: q(rating - pR, DIM.POWER), role: 'secondary', bound: 'max-capacity' });
    if (pR > rating * (1 + 1e-9)) {
      warnings.push({
        severity: 'warning',
        message: `The resistor dissipates ${text(q(pR, DIM.POWER), 'prediction', ACC)}, more than the rated power you entered (${text(inp.resistorRating, 'nominal', ACC)}). Use a larger package or split the resistance into several in series.`,
        code: 'RESISTOR_POWER',
      });
    } else {
      warnings.push({
        severity: 'info',
        message: `The resistor dissipates ${text(q(pR, DIM.POWER), 'prediction', ACC)} of the rated ${text(inp.resistorRating, 'nominal', ACC)}. No derating is applied here: choose your own margin against your design rules.`,
        code: 'RESISTOR_POWER_MARGIN',
      });
    }
  }

  const V = meta.validity;
  const [vfLo, vfHi] = V.vfV;
  const [iLo, iHi] = V.currentA;
  const [rLo, rHi] = V.resistanceOhm;
  const vsOk = vs <= V.vsV * (1 + 1e-9);
  const vfOk = within(vf, vfLo, vfHi);
  const iOk = within(target, iLo, iHi);
  const rOk = within(r, rLo, rHi);
  const validityChecks: CalcResult['validityChecks'] = [
    { name: `vs up to ${String(V.vsV)} V`, ok: vsOk, detail: `Plausibility range for board-level circuits, not a standard. Vs ${num(vs)} V.` },
    { name: `vf between ${String(vfLo)} V and ${String(vfHi)} V`, ok: vfOk, detail: `Plausibility range to catch unit slips, not a typical LED value and not a standard. Vf ${num(vf)} V.` },
    { name: 'led current between 1e-6 A and 10 A', ok: iOk, detail: `Plausibility range for indicator and small power LEDs, not a standard. If ${num(target)} A.` },
    { name: 'resistance between 0.1 Ω and 1e9 Ω', ok: rOk, detail: `Plausibility range for board-level resistors, not a standard. R ${num(r)} Ω.` },
  ];
  const outOfRange: OutOfRangeInput[] = [];
  if (!vsOk) outOfRange.push({ name: 'vs', value: `${num(vs)} V`, bound: `up to ${String(V.vsV)} V` });
  if (!vfOk) outOfRange.push({ name: 'vf', value: `${num(vf)} V`, bound: `${String(vfLo)} V to ${String(vfHi)} V` });
  if (!iOk) outOfRange.push({ name: 'current', value: `${num(target)} A`, bound: `${String(iLo)} A to ${String(iHi)} A` });
  if (!rOk) outOfRange.push({ name: 'resistor', value: `${num(r)} Ω`, bound: '0.1 Ω to 1e9 Ω' });

  const assumptions: string[] = [
    'DC steady state; the LED is modelled as a constant forward voltage Vf per LED at the target current (a datasheet value you enter; no typical value is assumed); the resistor is ideal. Relation from ledger S-019 (textbook, VERIFIED).',
    n > 1 ? `${String(n)} identical LEDs in series: the forward voltages add (N × Vf).` : 'One LED in series with the resistor.',
    snapped
      ? `Resistor rounded UP to the ${inp.series} series so the current does not exceed the target; the E-series lists are ledger S-016 (PAYWALLED-USER-MUST-VERIFY). Current error vs target: ${errFrac === 0 ? '0 %' : pct(errFrac, ACC)} (signed; rounding up never raises the current above the target, apart from float noise below 1e-12).`
      : 'Resistor is the exact value, not a stock value; no series was chosen.',
    'Resistor tolerance, supply tolerance and LED Vf spread are not included: they move the current. Check the worst case against the LED datasheet.',
  ];

  const dataStatus = snapped ? STATUS_SNAP : STATUS_PLAIN;
  const confidence = rate({ accuracyClass: ACC, dataStatus, inputs, outOfRange });
  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds: snapped ? ['S-019', 'S-016'] : ['S-019'] },
    formula: meta.formula,
    inputs,
    assumptions,
    steps,
    results,
    validityChecks,
    warnings,
    confidence,
    recommendation: RECOMMENDATION,
    dataStatus,
    designValues: [],
  };
  return finish(result);
}

export function compute(inputs: Inputs): CalcOutcome {
  return run(() => build(inputs));
}
