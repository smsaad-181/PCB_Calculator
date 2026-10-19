import { dataStatusForLedgerIds } from '../../data-status';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import {
  CATEGORY_CONFLICT_NOTE,
  anyUnverified,
  checkScope,
  coatingDecision,
  commonWarnings,
  dimless,
  iecRecommendation,
  insulationAssumption,
  insufficientData,
  lookupError,
  primaryResult,
  provenanceLine,
  requiredDataError,
  ruleMissingError,
  scopeTable,
  spacingConfidence,
  standardChecks,
  SOLDERMASK_DECLARED_WARNING,
  squareRmsWarning,
  userInput,
  withWaveformRow,
} from '../../spacing/gating';
import type { CoatingCredit, InsulationType, PollutionDegree } from '../../spacing/gating';
import { findRule, isTableEmpty, lookupGrid, nextPreferredImpulseStep } from '../../spacing/tables';
import type { SpacingTable, SpacingTableSet } from '../../spacing/tables';
import { validate } from './guards';
import type { FieldCondition, OvervoltageCategory } from './guards';
import { meta } from './meta';

export interface Inputs {
  tables?: SpacingTableSet;
  edition?: string;
  insulationType?: InsulationType;
  ratedImpulseVoltage?: Quantity;
  overvoltageCategory?: OvervoltageCategory;
  supplyVoltage?: Quantity;
  pollutionDegree?: PollutionDegree;
  fieldCondition?: FieldCondition;
  altitude?: Quantity;
  workingVoltagePeak?: Quantity;
  workingVoltageRms?: Quantity;
  waveform?: { shape: 'dc' | 'sine' | 'square' | 'triangle'; basis: 'peak' | 'rms'; value: Quantity };
  frequency?: Quantity;
  coatingCredit?: CoatingCredit;
  soldermask?: boolean;
}

// S-030c (category meanings, CONFLICT) is shown as its own labelled warning and is not counted in the rating, as the foil
// convention is in the copper calculators; every other row is rated, so the numeric result is at least PAYWALLED.
const DATA_STATUS = dataStatusForLedgerIds(meta.ledgerIds);
const LEDGER_ROUTE_A = [...meta.reference.ledgerIds, 'S-030c'];
const lenQ = (m: number): Quantity => q(m, DIM.LENGTH);

function internal(message: string): CalcOutcome {
  const error: CalcError = { code: 'INTERNAL', message };
  return { ok: false, error };
}

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const T = inp.tables.tables;
  const edition = inp.edition;
  const viaCategory = inp.route.kind === 'category';
  const reinforced = inp.insulationType === 'reinforced';

  // 1. tables that must hold data
  const required: SpacingTable[] = [T.T2, T.T4];
  if (viaCategory) required.push(T.T1);
  if (reinforced || inp.coating !== 'none') required.push(T.T7);
  const missingData = requiredDataError(required, T.T7, inp.frequency.si);
  if (missingData !== undefined) return { ok: false, error: missingData };
  const t7 = scopeTable(T.T7, edition, reinforced || inp.coating !== 'none' || inp.frequency.si > 0);
  if (t7.error !== undefined) return { ok: false, error: t7.error };

  // 2. recorded scope (frequency, voltage) before any lookup
  const peakV = inp.peak.si;
  const rmsV = inp.rms?.si;
  const scope = checkScope(t7.table, { frequencyHz: inp.frequency.si, rmsV, peakV });
  if (scope.refusal !== undefined) return { ok: false, error: scope.refusal };

  const used: SpacingTable[] = [];
  const lines: string[] = [];
  const steps: CalcResult['steps'] = [];

  // 3. impulse withstand requirement
  let impulseV: number;
  let impulseSource: 'user' | 'T1';
  if (inp.route.kind === 'impulse') {
    impulseV = inp.route.impulse.si;
    impulseSource = 'user';
  } else {
    const l = lookupGrid(T.T1, { rowSi: inp.route.supply.si, selectors: { overvoltageCategory: inp.route.category }, edition });
    if (!l.ok) return { ok: false, error: lookupError(l) };
    impulseV = l.valueSi;
    impulseSource = 'T1';
    used.push(T.T1);
    lines.push(provenanceLine(T.T1, l));
  }
  steps.push({ label: 'Rated impulse withstand voltage', expr: impulseSource === 'user' ? 'user-entered' : 'T1(supply voltage, overvoltage category)', value: q(impulseV, DIM.VOLTAGE), bound: 'min-requirement' });

  // 4. reinforced insulation: only the T7 rule records. The impulse part steps in the T7 preferred impulse series (never a T2 row);
  //    the steady-state (T3) part needs its own record.
  let lookupV = impulseV;
  let multiplier = 1;
  let steadyMultiplier = 1;
  if (reinforced) {
    const rule = findRule(T.T7, 'reinforced-clearance');
    if (rule === undefined) return { ok: false, error: ruleMissingError(T.T7, 'reinforced-clearance') };
    used.push(T.T7);
    lines.push(`T7 rule reinforced-clearance (${rule.mode ?? ''}), source ${rule.source}: ${rule.clauseText}`);
    if (rule.mode === 'multiplier') multiplier = rule.value as number;
    else {
      const st = nextPreferredImpulseStep(rule, impulseV);
      if (!st.ok) return { ok: false, error: st.above ? { code: 'OUT_OF_DOMAIN', gate: 'OUT_OF_SCOPE', message: st.message } : insufficientData([st.message]) };
      lookupV = st.valueSi;
      steps.push({ label: 'Next preferred impulse step (T7 series)', expr: 'T7 series value above the required impulse voltage', value: q(lookupV, DIM.VOLTAGE), bound: 'min-requirement' });
    }
    if (!isTableEmpty(T.T3)) {
      const steady = findRule(T.T7, 'reinforced-clearance-steady-state');
      if (steady === undefined) return { ok: false, error: ruleMissingError(T.T7, 'reinforced-clearance-steady-state') };
      steadyMultiplier = steady.value as number;
    }
  }
  if (isTableEmpty(T.T3) && peakV > lookupV * (1 + 1e-12)) {
    return {
      ok: false,
      error: {
        code: 'OUT_OF_DOMAIN',
        gate: 'OUT_OF_SCOPE',
        field: 'workingVoltagePeak',
        message: `The peak working voltage ${String(peakV)} V exceeds the impulse withstand voltage ${String(lookupV)} V used for T2, and table T3 is not entered: the clearance for that voltage cannot be found. Enter T3 from your licensed copy.`,
      },
    };
  }

  // 5. T2 lookup (and T3 when entered)
  const l2 = lookupGrid(T.T2, { rowSi: lookupV, selectors: { pollutionDegree: inp.pollutionDegree, fieldCondition: inp.fieldCondition }, edition });
  if (!l2.ok) return { ok: false, error: lookupError(l2) };
  used.push(T.T2);
  lines.push(provenanceLine(T.T2, l2));
  steps.push({ label: 'Clearance from T2', expr: 'T2(impulse withstand voltage, pollution degree, field condition)', value: lenQ(l2.valueSi), bound: 'min-requirement' });
  let base = l2.valueSi;
  base *= multiplier;
  const safetyDefaults: string[] = [...scope.unchecked];
  const warnings: CalcWarning[] = [];
  if (isTableEmpty(T.T3)) {
    warnings.push({
      severity: 'warning',
      code: 'T3_NOT_ENTERED',
      message: 'Table T3 (steady-state and recurring peak voltages) is not entered, so that check was NOT done; the clearance may be larger.',
    });
    safetyDefaults.push('steady-state/recurring-peak clearance table T3 not entered; that check is not done');
  } else {
    const l3 = lookupGrid(T.T3, { rowSi: peakV, selectors: { pollutionDegree: inp.pollutionDegree, fieldCondition: inp.fieldCondition }, edition });
    if (!l3.ok) return { ok: false, error: lookupError(l3) };
    used.push(T.T3);
    lines.push(provenanceLine(T.T3, l3));
    steps.push({ label: 'Clearance from T3', expr: 'T3(peak working voltage, field condition)', value: lenQ(l3.valueSi), bound: 'min-requirement' });
    base = Math.max(base, l3.valueSi * steadyMultiplier);
  }

  // 6. altitude: clearance only
  const l4 = lookupGrid(T.T4, { rowSi: inp.altitude.si, selectors: {}, edition });
  if (!l4.ok) return { ok: false, error: lookupError(l4) };
  used.push(T.T4);
  lines.push(provenanceLine(T.T4, l4));
  steps.push({ label: 'Altitude correction factor (T4)', expr: 'T4(altitude)', value: dimless(l4.valueSi) });
  let clearance = base * l4.valueSi;
  steps.push({ label: 'Clearance corrected for altitude', expr: 'clearance = base x T4 factor', value: lenQ(clearance), bound: 'min-requirement' });

  // 7. coating credit: only a verified rule AND the user's selection
  const coat = coatingDecision(T.T7, inp.coating, 'clearance');
  if (coat.applied) {
    clearance *= coat.factor;
    steps.push({ label: 'Coating credit factor (T7)', expr: 'verified user-entered rule record', value: dimless(coat.factor) });
    used.push(T.T7);
  }

  // 8. assemble
  const unverified = anyUnverified(used);
  const inputs: CalcInput[] = [
    userInput('pollution degree', dimless(inp.pollutionDegree)),
    userInput('altitude', inp.altitude),
    userInput('working voltage (peak)', inp.peak, inp.voltageHow === 'waveform' ? `from the declared ${inp.waveformShape ?? ''} waveform` : undefined),
    userInput('frequency', inp.frequency),
  ];
  if (inp.rms !== undefined) inputs.push(userInput('working voltage (rms)', inp.rms));
  if (inp.route.kind === 'impulse') inputs.push(userInput('rated impulse voltage', inp.route.impulse, 'user-supplied (for example from the product standard)'));
  else inputs.push(userInput('nominal supply voltage', inp.route.supply, `overvoltage category ${inp.route.category}`));

  const assumptions: string[] = [
    `Data set edition: ${edition} (every table used holds exactly this edition).`,
    insulationAssumption(inp.insulationType),
    `Field condition: ${inp.fieldCondition} (user-entered, no default). Pollution degree: ${String(inp.pollutionDegree)}.`,
    impulseSource === 'user' ? 'Rated impulse withstand voltage: user-supplied.' : `Rated impulse withstand voltage: read from T1 for overvoltage category ${inp.route.kind === 'category' ? inp.route.category : ''} (the row key is the supply voltage as entered; mapping a system voltage to a T1 row is your responsibility).`,
    'Altitude correction applies to clearance only (S-032); creepage is never scaled by altitude.',
    ...lines,
    ...(coat.note !== undefined ? [coat.note] : []),
  ];
  if (inp.coating === 'none') assumptions.push('No coating credit applied (none selected).');

  const allWarnings: CalcWarning[] = [...commonWarnings({ unverified, iec: true }), ...scope.warnings, ...warnings, ...coat.warnings];
  const sq = squareRmsWarning(inp.waveformShape, inp.waveformBasis);
  if (sq !== undefined) allWarnings.push(sq);
  const ledgerIds = withWaveformRow(viaCategory ? LEDGER_ROUTE_A : meta.reference.ledgerIds, inp.voltageHow === 'waveform');
  if (viaCategory) allWarnings.push({ severity: 'caution', message: CATEGORY_CONFLICT_NOTE, code: 'OVERVOLTAGE_CATEGORY_CONFLICT' });
  if (inp.soldermask) allWarnings.push(SOLDERMASK_DECLARED_WARNING);

  const validityChecks: CalcResult['validityChecks'] = [
    ...standardChecks(meta.mandatoryInputs, used, edition),
    ...scope.checks,
  ];

  const verified = !unverified;
  const confidence = spacingConfidence({ verified, safetyRelevantDefaults: safetyDefaults, dataStatus: DATA_STATUS });
  const recommendation = iecRecommendation(unverified, used);

  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition, ledgerIds },
    formula: meta.formula,
    inputs,
    assumptions,
    steps,
    results: [
      primaryResult(unverified, 'minimum clearance', clearance),
      { name: 'rated impulse withstand voltage used', value: q(impulseV, DIM.VOLTAGE), role: 'secondary', bound: 'min-requirement' },
      { name: 'altitude correction factor', value: dimless(l4.valueSi), role: 'secondary', bound: 'nominal' },
    ],
    validityChecks,
    warnings: allWarnings,
    confidence,
    recommendation,
    dataStatus: DATA_STATUS,
    designValues: [],
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) return internal(`Result failed its schema check: ${chk.error.join('; ')}`);
  return { ok: true, value: result };
}

/** Gated clearance. Never throws; an error value says which mandatory input or table entry is missing. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'INTERNAL', message: `Clearance could not be completed: ${message}` } };
  }
}
