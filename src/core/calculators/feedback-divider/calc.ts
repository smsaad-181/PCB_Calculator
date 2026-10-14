import type { OutOfRangeInput } from '../../confidence';
import { dataStatusForLedgerIds } from '../../data-status';
import { bestPairs, nearest } from '../../eseries';
import type { SeriesName } from '../../eseries';
import type { CalcInput, CalcOutcome, CalcResult, CalcWarning, Envelope } from '../../result';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { Failure, fin, finish, num, pct, rate, run, text, within } from '../circuit-shared';
import { validate } from './guards';
import type { BiasDirection, SeriesChoice, SnapMode } from './guards';
import { meta } from './meta';

export interface Inputs {
  /** Reference voltage from the regulator datasheet (user input; the app embeds no IC parameters). */
  vref: Quantity;
  /** Where the Vref value came from, echoed back as user-supplied. Free text, optional. */
  vrefSource?: string;
  /** Top resistor, between Vout and the FB pin. */
  r1?: Quantity;
  /** Bottom resistor, between the FB pin and ground. */
  r2?: Quantity;
  /** Output voltage: the target when solving a resistor, the only voltage given in a pair search. Exactly two of r1, r2, vout (or vout alone with a series). */
  vout?: Quantity;
  series?: SeriesChoice;
  snap?: SnapMode;
  /** Number of best pairs listed in a pair search (1 to 10, default 5). */
  pairs?: number;
  /** Resistor initial tolerance, a fraction (0.01 is 1 %). TCR is excluded. */
  tolerance?: Quantity;
  /** Vref initial tolerance, a fraction. */
  vrefTolerance?: Quantity;
  /** FB pin bias current magnitude (user value); needs fbBiasDirection. */
  fbBiasCurrent?: Quantity;
  fbBiasDirection?: BiasDirection;
}

const RECOMMENDATION =
  'Values are exact for the stated inputs and ideal resistors. Check the power rating of each resistor, then check the result against the regulator datasheet (Vref tolerance, FB bias current, minimum load and the allowed resistor range).';
const POWER_INFO = 'Choose resistors rated for at least twice the dissipation shown for each resistor unless your design rules say otherwise; check the power rating against the figures above.';
const NAMING =
  'R1 is the TOP resistor (between Vout and the FB pin) and R2 is the BOTTOM resistor (between the FB pin and ground). Texts name these inconsistently (an adjustable-regulator formula with R1 as the bottom resistor is the reverse): follow the positions, not the labels.';
const STATUS_PLAIN = dataStatusForLedgerIds(['S-019']);
const STATUS_SNAP = dataStatusForLedgerIds(['S-019', 'S-016']);
const ACC = meta.accuracyClass;

const vOf = (vref: number, r1: number, r2: number): number => vref * (1 + r1 / r2);

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const vref = inp.vref.si;
  const target = inp.vout?.si;
  const snapSeries = inp.series !== 'none';
  if (target !== undefined && inp.mode !== 'vout' && !(target > vref)) {
    throw new Failure('OUT_OF_DOMAIN', 'vout must be above vref: this topology cannot output less than the reference voltage.', 'vout');
  }

  let r1: number;
  let r2: number;
  let ideal: number | undefined;
  let pairRows: { r1: number; r2: number; vout: number }[] = [];
  if (inp.mode === 'vout') {
    r1 = (inp.r1 as Quantity).si;
    r2 = (inp.r2 as Quantity).si;
  } else if (inp.mode === 'r1') {
    r2 = (inp.r2 as Quantity).si;
    ideal = fin(r2 * ((target as number) / vref - 1), 'Solved r1');
    r1 = ideal;
  } else if (inp.mode === 'r2') {
    r1 = (inp.r1 as Quantity).si;
    ideal = fin(r1 / ((target as number) / vref - 1), 'Solved r2');
    r2 = ideal;
  } else {
    const found = bestPairs(vref / (target as number), inp.series as SeriesName, 'divider-ratio', inp.pairs, meta.pairWindow);
    if (!found.ok) throw new Failure('OUT_OF_DOMAIN', found.error.message, 'vout');
    pairRows = found.value.map((p) => ({ r1: p.r1, r2: p.r2, vout: fin(vOf(vref, p.r1, p.r2), 'Pair Vout') }));
    const first = pairRows[0];
    if (first === undefined) throw new Failure('OUT_OF_DOMAIN', 'No resistor pair was found.', 'vout');
    r1 = first.r1;
    r2 = first.r2;
  }
  if (inp.mode === 'r1' || inp.mode === 'r2') {
    if (snapSeries && ideal !== undefined) {
      if (ideal < 1e-12 || ideal > 1e12) throw new Failure('OUT_OF_DOMAIN', `The solved ${inp.mode} is outside 1e-12 to 1e12 ohm and cannot be snapped to a series.`, inp.mode);
      const n = nearest(ideal, inp.series as SeriesName, inp.snap);
      if (!n.ok) throw new Failure('OUT_OF_DOMAIN', n.error.message, inp.mode);
      if (inp.mode === 'r1') r1 = n.value.value;
      else r2 = n.value.value;
    }
  }

  const vout = fin(vOf(vref, r1, r2), 'Vout');
  const iDiv = fin(vref / r2, 'Divider current');
  const vR1 = fin(vout - vref, 'Voltage across r1');
  const p1 = fin((vR1 * vR1) / r1, 'Power in r1');
  const p2 = fin((vref * vref) / r2, 'Power in r2');
  const pTotal = fin(vout * iDiv, 'Total power');
  const errFrac = target === undefined ? undefined : (vout - target) / target;

  const bias = inp.fbBiasCurrent !== undefined && inp.fbBiasDirection !== undefined ? { ib: inp.fbBiasCurrent.si, sign: inp.fbBiasDirection === 'into-pin' ? 1 : -1 } : undefined;
  const shift = bias === undefined ? undefined : fin(bias.sign * bias.ib * r1, 'FB bias shift');
  const voutBias = shift === undefined ? undefined : vout + shift;
  if (voutBias !== undefined && !(voutBias > 0)) {
    throw new Failure('OUT_OF_DOMAIN', 'The FB bias shift pulls Vout to zero or below: the bias current is far too large for these resistors (check the units).', 'fbBiasCurrent');
  }

  const dir = inp.fbBiasDirection;
  const inputs: CalcInput[] = [
    {
      name: 'vref',
      value: q(vref, DIM.VOLTAGE),
      source: 'user',
      sourceDetail: inp.vrefSource === undefined ? 'user-supplied; no source note given' : `user-supplied; source note: ${inp.vrefSource}`,
    },
  ];
  if (inp.r1 !== undefined) inputs.push({ name: 'r1', value: q(inp.r1.si, DIM.RESISTANCE), source: 'user' });
  if (inp.r2 !== undefined) inputs.push({ name: 'r2', value: q(inp.r2.si, DIM.RESISTANCE), source: 'user' });
  if (inp.vout !== undefined) inputs.push({ name: 'vout', value: q(inp.vout.si, DIM.VOLTAGE), source: 'user' });
  if (inp.tolerance !== undefined) inputs.push({ name: 'tolerance', value: q(inp.tolerance.si, DIM.DIMENSIONLESS), source: 'user' });
  if (inp.vrefTolerance !== undefined) inputs.push({ name: 'vrefTolerance', value: q(inp.vrefTolerance.si, DIM.DIMENSIONLESS), source: 'user' });
  if (inp.fbBiasCurrent !== undefined) inputs.push({ name: 'fbBiasCurrent', value: q(inp.fbBiasCurrent.si, DIM.CURRENT), source: 'user', sourceDetail: `direction ${dir ?? ''}` });

  const steps: CalcResult['steps'] = [];
  if (ideal !== undefined) {
    steps.push({ label: `Solve ${inp.mode}`, expr: inp.mode === 'r1' ? 'R1 = R2 × (Vout / Vref − 1)' : 'R2 = R1 / (Vout / Vref − 1)', value: q(ideal, DIM.RESISTANCE) });
  }
  if (inp.mode === 'pair') steps.push({ label: 'Target divider ratio', expr: 'R2 / (R1 + R2) = Vref / Vout', value: q(vref / (target as number), DIM.DIMENSIONLESS) });
  steps.push({ label: 'Output voltage', expr: 'Vout = Vref × (1 + R1 / R2)', value: q(vout, DIM.VOLTAGE) });
  steps.push({ label: 'Divider current', expr: 'I = Vref / R2', value: q(iDiv, DIM.CURRENT) });
  steps.push({ label: 'Total power', expr: 'P = Vout × I', value: q(pTotal, DIM.POWER) });
  if (shift !== undefined) steps.push({ label: 'FB bias shift', expr: 'ΔVout = ±Ib × R1 (+ into the pin, − out of the pin)', value: q(shift, DIM.VOLTAGE) });

  const primary = inp.mode === 'pair' ? 'r1' : inp.mode;
  const role = (name: string): 'primary' | 'secondary' => (name === primary ? 'primary' : 'secondary');
  const results: CalcResult['results'] = [
    { name: 'vout', value: q(vout, DIM.VOLTAGE), role: role('vout'), bound: 'nominal' },
    { name: 'r1', value: q(r1, DIM.RESISTANCE), role: role('r1'), bound: 'nominal' },
    { name: 'r2', value: q(r2, DIM.RESISTANCE), role: role('r2'), bound: 'nominal' },
    { name: 'voltage across r1', value: q(vR1, DIM.VOLTAGE), role: 'secondary', bound: 'prediction' },
    { name: 'voltage across r2', value: q(vref, DIM.VOLTAGE), role: 'secondary', bound: 'prediction' },
    { name: 'divider current', value: q(iDiv, DIM.CURRENT), role: 'secondary', bound: 'prediction' },
    { name: 'power in r1', value: q(p1, DIM.POWER), role: 'secondary', bound: 'prediction' },
    { name: 'power in r2', value: q(p2, DIM.POWER), role: 'secondary', bound: 'prediction' },
    { name: 'total power', value: q(pTotal, DIM.POWER), role: 'secondary', bound: 'prediction' },
  ];
  if (errFrac !== undefined && (snapSeries || inp.mode === 'pair')) {
    results.push({ name: 'vout error vs target', value: q(errFrac, DIM.DIMENSIONLESS), role: 'secondary', bound: 'nominal' });
  }
  if (snapSeries && ideal !== undefined) results.push({ name: `ideal ${inp.mode}`, value: q(ideal, DIM.RESISTANCE), role: 'secondary', bound: 'nominal' });
  if (inp.mode === 'pair') {
    pairRows.forEach((p, k) => {
      const n = String(k + 1);
      results.push({ name: `pair ${n} r1`, value: q(p.r1, DIM.RESISTANCE), role: 'secondary', bound: 'nominal' });
      results.push({ name: `pair ${n} r2`, value: q(p.r2, DIM.RESISTANCE), role: 'secondary', bound: 'nominal' });
      results.push({ name: `pair ${n} vout`, value: q(p.vout, DIM.VOLTAGE), role: 'secondary', bound: 'nominal' });
      results.push({ name: `pair ${n} vout error vs target`, value: q((p.vout - (target as number)) / (target as number), DIM.DIMENSIONLESS), role: 'secondary', bound: 'nominal' });
    });
  }
  let ratio: number | undefined;
  if (bias !== undefined && shift !== undefined && voutBias !== undefined) {
    ratio = fin(iDiv / bias.ib, 'Divider current to bias current ratio');
    results.push({ name: 'fb bias shift', value: q(shift, DIM.VOLTAGE), role: 'secondary', bound: 'nominal' });
    results.push({ name: 'vout with fb bias', value: q(voutBias, DIM.VOLTAGE), role: 'secondary', bound: 'nominal' });
    results.push({ name: 'fb bias shift vs vout', value: q(shift / vout, DIM.DIMENSIONLESS), role: 'secondary', bound: 'nominal' });
    results.push({ name: 'divider current / fb bias current', value: q(ratio, DIM.DIMENSIONLESS), role: 'secondary', bound: 'nominal' });
  }

  // Envelope: initial-tolerance corners only (TCR excluded). Vout rises with Vref and R1 and falls with R2, so corners are exact extremes.
  let envelope: Envelope[] | undefined;
  if (inp.tolerance !== undefined || inp.vrefTolerance !== undefined) {
    const t = inp.tolerance?.si ?? 0;
    const vt = inp.vrefTolerance?.si ?? 0;
    const ideals: number[] = [];
    const withBias: number[] = [];
    for (const a of [1 - vt, 1 + vt]) {
      for (const b of [1 - t, 1 + t]) {
        for (const c of [1 - t, 1 + t]) {
          const x = fin(vOf(vref * a, r1 * b, r2 * c), 'Envelope corner');
          ideals.push(x);
          if (bias !== undefined) withBias.push(x + bias.sign * bias.ib * r1 * b);
        }
      }
    }
    const names = [...(inp.tolerance !== undefined ? ['r1', 'r2'] : []), ...(inp.vrefTolerance !== undefined ? ['vref'] : [])];
    envelope = [{ name: 'vout', min: q(Math.min(vout, ...ideals), DIM.VOLTAGE), typ: q(vout, DIM.VOLTAGE), max: q(Math.max(vout, ...ideals), DIM.VOLTAGE), toleranceInputs: names }];
    if (voutBias !== undefined) {
      envelope.push({ name: 'vout with fb bias', min: q(Math.min(voutBias, ...withBias), DIM.VOLTAGE), typ: q(voutBias, DIM.VOLTAGE), max: q(Math.max(voutBias, ...withBias), DIM.VOLTAGE), toleranceInputs: names });
    }
  }

  // Validity: plausibility ranges, not standards.
  const V = meta.validity;
  const [vrLo, vrHi] = V.vrefV;
  const [rLo, rHi] = V.resistanceOhm;
  const badR = ([['r1', r1], ['r2', r2]] as [string, number][]).filter(([, x]) => !within(x, rLo, rHi));
  const vrefOk = within(vref, vrLo, vrHi);
  const voutOk = vout <= V.voutV * (1 + 1e-9);
  const biasOk = bias === undefined || bias.ib <= V.fbBiasA * (1 + 1e-9);
  const validityChecks: CalcResult['validityChecks'] = [
    { name: `vref between ${String(vrLo)} V and ${String(vrHi)} V`, ok: vrefOk, detail: `Plausibility range for regulator references, not a standard and not an IC parameter. Vref ${num(vref)} V.` },
    { name: `vout up to ${String(V.voutV)} V`, ok: voutOk, detail: `Plausibility range for board-level circuits, not a standard. Vout ${num(vout)} V.` },
    { name: 'resistances between 1 Ω and 1e9 Ω', ok: badR.length === 0, detail: `Plausibility range for board-level resistors, not a standard. R1 ${num(r1)} Ω, R2 ${num(r2)} Ω.` },
  ];
  if (bias !== undefined) {
    validityChecks.push({ name: `fb bias current up to ${String(V.fbBiasA)} A`, ok: biasOk, detail: `Plausibility range for a feedback-pin bias current, not a standard (a larger value is usually a unit slip). Ib ${num(bias.ib)} A.` });
  }
  const outOfRange: OutOfRangeInput[] = [];
  if (!vrefOk) outOfRange.push({ name: 'vref', value: `${num(vref)} V`, bound: `${String(vrLo)} V to ${String(vrHi)} V` });
  if (!voutOk) outOfRange.push({ name: 'vout', value: `${num(vout)} V`, bound: `up to ${String(V.voutV)} V` });
  for (const [n, x] of badR) outOfRange.push({ name: n, value: `${num(x)} Ω`, bound: '1 Ω to 1e9 Ω' });
  if (!biasOk && bias !== undefined) outOfRange.push({ name: 'fbBiasCurrent', value: `${num(bias.ib)} A`, bound: `up to ${String(V.fbBiasA)} A` });

  const warnings: CalcWarning[] = [
    { severity: 'info', message: NAMING, code: 'RESISTOR_NAMING' },
    { severity: 'info', message: POWER_INFO, code: 'POWER_RATING' },
  ];
  if (bias !== undefined && ratio !== undefined && shift !== undefined) {
    const shiftText = `${pct(shift / vout, ACC)} of Vout`;
    if (ratio < 1) {
      warnings.push({
        severity: 'warning',
        message: `The divider current (${text(q(iDiv, DIM.CURRENT), 'prediction', ACC)}) is smaller than the FB bias current you entered (ratio ${num(ratio)}). The bias current dominates the divider: the shift is ${text(q(shift, DIM.VOLTAGE), 'nominal', ACC)} (${shiftText}). Lower R1 and R2 or recheck the bias current.`,
        code: 'FB_BIAS_DOMINATES',
      });
    } else {
      warnings.push({
        severity: 'info',
        message: `Divider current / FB bias current = ${num(ratio)}; the bias shift is ${text(q(shift, DIM.VOLTAGE), 'nominal', ACC)} (${shiftText}). The ratio is shown so you can judge it against your accuracy target; no threshold is built in.`,
        code: 'FB_BIAS_RATIO',
      });
    }
  }

  const assumptions: string[] = [
    'Ideal resistors at their stated values; DC. The error amplifier is assumed to hold the FB pin exactly at Vref, so the relation holds only in regulation (error-amplifier offset and load regulation are ignored). Relation from ledger S-019 (textbook, VERIFIED).',
    NAMING,
    inp.vrefSource === undefined
      ? 'Vref is a user-supplied datasheet value; no source note was given, so check it against the datasheet. The app embeds no IC parameters.'
      : `Vref is a user-supplied datasheet value (source note: ${inp.vrefSource}). The app embeds no IC parameters and has not checked this note.`,
  ];
  if (inp.mode === 'pair') {
    assumptions.push(
      `Pair search over the ${inp.series} series from 1 kΩ to just under 1 MΩ (${String(meta.pairWindow.decades)} decades), ranked by the divider-ratio error R2 / (R1 + R2) against Vref / Vout; Vout and its error are recomputed for each pair. Series lists are ledger S-016 (PAYWALLED-USER-MUST-VERIFY).`,
    );
  } else if (inp.mode !== 'vout') {
    assumptions.push(
      snapSeries
        ? `Solved resistor snapped to the ${inp.series} series, direction ${inp.snap}; the E-series lists are ledger S-016 (PAYWALLED-USER-MUST-VERIFY). Vout and its error use the snapped value.`
        : 'Solved resistor is the exact value, not a stock value.',
    );
  }
  if (snapSeries && errFrac !== undefined) assumptions.push(`Vout error vs target after choosing stock values: ${errFrac === 0 ? '0 %' : pct(errFrac, ACC)} (signed; the target is the vout you entered).`);
  if (envelope !== undefined) {
    assumptions.push('The envelope covers initial tolerance corners only (resistors and Vref). TCR (temperature coefficient), leakage, ageing, self-heating, line and load regulation are excluded.');
  } else {
    assumptions.push('No tolerance given, so no envelope is shown. TCR (temperature coefficient) and the Vref tolerance are never included unless entered.');
  }
  if (bias !== undefined) {
    assumptions.push(
      `FB bias current ${text(q(bias.ib, DIM.CURRENT), 'nominal', ACC)} (user value) flows ${dir ?? ''}: ΔVout = ${bias.sign > 0 ? '+' : '−'}Ib × R1 (KCL at the FB node). The headline vout is the ideal relation; the bias is shown as a separate effect. Divider current, voltages and powers are for the ideal relation (the bias adds ${bias.sign > 0 ? '+' : '−'}Ib to the R1 current). Ib has no tolerance.`,
    );
  }
  assumptions.push('Resistor dissipation is computed from the ideal relation. Zero-ohm links are not supported (resistances must be above zero).');

  const dataStatus = snapSeries ? STATUS_SNAP : STATUS_PLAIN;
  const confidence = rate({ accuracyClass: ACC, dataStatus, inputs, outOfRange });
  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds: snapSeries ? ['S-019', 'S-016'] : ['S-019'] },
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
    ...(envelope !== undefined ? { envelope } : {}),
  };
  return finish(result);
}

export function compute(inputs: Inputs): CalcOutcome {
  return run(() => build(inputs));
}
