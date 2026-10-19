import { dataStatusForLedgerIds } from '../../data-status';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import {
  anyUnverified,
  checkScope,
  coatingDecision,
  commonWarnings,
  dimless,
  iecRecommendation,
  insulationAssumption,
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
import { findGroupForCti, findRule, lookupGrid } from '../../spacing/tables';
import type { MaterialGroup, SpacingTable, SpacingTableSet } from '../../spacing/tables';
import { validate } from './guards';
import type { GrooveState, Surface } from './guards';
import { meta } from './meta';

export interface Inputs {
  tables?: SpacingTableSet;
  edition?: string;
  insulationType?: InsulationType;
  workingVoltageRms?: Quantity;
  workingVoltagePeak?: Quantity;
  waveform?: { shape: 'dc' | 'sine' | 'square' | 'triangle'; basis: 'peak' | 'rms'; value: Quantity };
  pollutionDegree?: PollutionDegree;
  materialGroup?: MaterialGroup;
  cti?: Quantity;
  surface?: Surface;
  frequency?: Quantity;
  associatedClearance?: Quantity;
  coatingCredit?: CoatingCredit;
  grooves?: GrooveState;
  soldermask?: boolean;
  /** Accepted only so the panel can say that altitude is not used; it never changes the result. */
  altitude?: Quantity;
}

const DATA_STATUS = dataStatusForLedgerIds(meta.ledgerIds);
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
  const reinforced = inp.insulationType === 'reinforced';

  const required: SpacingTable[] = [T.T5];
  if (inp.cti !== undefined) required.push(T.T6);
  if (reinforced || inp.coating !== 'none') required.push(T.T7);
  const missingData = requiredDataError(required, T.T7, inp.frequency.si);
  if (missingData !== undefined) return { ok: false, error: missingData };
  const t7 = scopeTable(T.T7, edition, reinforced || inp.coating !== 'none' || inp.frequency.si > 0);
  if (t7.error !== undefined) return { ok: false, error: t7.error };

  const rmsV = inp.rms.si;
  const scope = checkScope(t7.table, { frequencyHz: inp.frequency.si, rmsV, peakV: inp.peak?.si });
  if (scope.refusal !== undefined) return { ok: false, error: scope.refusal };

  const used: SpacingTable[] = [];
  const lines: string[] = [];
  const steps: CalcResult['steps'] = [];

  // material group: entered, or from CTI through the T6 definitions the user entered
  let group: MaterialGroup;
  let groupText: string;
  if (inp.cti !== undefined) {
    const g = findGroupForCti(T.T6, inp.cti.si, edition);
    if (!g.ok) return { ok: false, error: lookupError(g) };
    group = g.group;
    used.push(T.T6);
    groupText = `Material group ${group} from CTI ${String(inp.cti.si)} V through the T6 definitions entered by the user.`;
    lines.push(
      `T6 (material groups by CTI), edition ${T.T6.edition}: group ${group}, printed "${g.record.printed}", source ${g.record.source}; entered by ${g.record.enteredBy} on ${g.record.enteredDate}; ${g.record.checkedBy !== undefined ? `checked by ${g.record.checkedBy}` : 'not checked'}.`,
    );
  } else {
    group = inp.materialGroup as MaterialGroup;
    groupText = `Material group ${group} entered by the user (no default; no CTI conversion used).`;
  }

  const l5 = lookupGrid(T.T5, { rowSi: rmsV, selectors: { pollutionDegree: inp.pollutionDegree, materialGroup: group, surface: inp.surface }, edition });
  if (!l5.ok) return { ok: false, error: lookupError(l5) };
  used.push(T.T5);
  lines.push(provenanceLine(T.T5, l5));
  steps.push({ label: 'Creepage from T5', expr: 'T5(rms working voltage, pollution degree, material group, surface)', value: lenQ(l5.valueSi), bound: 'min-requirement' });
  let creepage = l5.valueSi;

  if (reinforced) {
    const rule = findRule(T.T7, 'reinforced-creepage-multiplier');
    if (rule === undefined) return { ok: false, error: ruleMissingError(T.T7, 'reinforced-creepage-multiplier') };
    used.push(T.T7);
    const k = rule.value as number;
    creepage *= k;
    steps.push({ label: 'Reinforced multiplier (T7)', expr: 'user-entered rule record', value: dimless(k) });
    lines.push(`T7 rule reinforced-creepage-multiplier = ${String(k)}, source ${rule.source}: ${rule.clauseText}`);
  }

  const coat = coatingDecision(T.T7, inp.coating, 'creepage');
  if (coat.applied) {
    creepage *= coat.factor;
    steps.push({ label: 'Coating credit factor (T7)', expr: 'verified user-entered rule record', value: dimless(coat.factor) });
    used.push(T.T7);
  }

  // creepage is never less than the associated clearance
  const clearance = inp.associatedClearance.si;
  steps.push({ label: 'Creepage before the clearance floor', expr: 'T5 value after multiplier and credit', value: lenQ(creepage), bound: 'min-requirement' });
  steps.push({ label: 'Associated clearance (input)', expr: 'user-entered or from the clearance calculator', value: lenQ(clearance), bound: 'min-requirement' });
  const warnings: CalcWarning[] = [];
  if (creepage < clearance) {
    steps.push({ label: 'Creepage raised to the associated clearance', expr: 'creepage = max(creepage, clearance)', value: lenQ(clearance), bound: 'min-requirement' });
    warnings.push({
      severity: 'warning',
      code: 'CREEPAGE_RAISED_TO_CLEARANCE',
      message: `The table creepage (${String(creepage)} m) was below the associated clearance (${String(clearance)} m); creepage is not less than the associated clearance (S-030b), so the clearance is shown.`,
    });
    creepage = clearance;
  }

  const unverified = anyUnverified(used);
  const inputs: CalcInput[] = [
    userInput('working voltage (rms)', inp.rms, inp.voltageHow === 'waveform' ? `from the declared ${inp.waveformShape ?? ''} waveform` : undefined),
    userInput('pollution degree', dimless(inp.pollutionDegree)),
    userInput('frequency', inp.frequency),
    userInput('associated clearance', inp.associatedClearance),
  ];
  if (inp.cti !== undefined) inputs.push(userInput('CTI', inp.cti));
  if (inp.peak !== undefined) inputs.push(userInput('working voltage (peak)', inp.peak));

  const assumptions: string[] = [
    `Data set edition: ${edition} (every table used holds exactly this edition).`,
    insulationAssumption(inp.insulationType),
    groupText,
    `Pollution degree: ${String(inp.pollutionDegree)}. Surface: ${inp.surface} (used only if the T5 columns distinguish it).`,
    'Creepage is never scaled by altitude (S-032).',
    ...lines,
    ...(coat.note !== undefined ? [coat.note] : []),
  ];
  if (inp.coating === 'none') assumptions.push('No coating credit applied (none selected).');

  const allWarnings: CalcWarning[] = [...commonWarnings({ unverified, iec: true }), ...scope.warnings, ...warnings, ...coat.warnings];
  const sq = squareRmsWarning(inp.waveformShape, inp.waveformBasis);
  if (sq !== undefined) allWarnings.push(sq);
  const ledgerIds = withWaveformRow(meta.reference.ledgerIds, inp.voltageHow === 'waveform');
  if (inp.altitude !== undefined) {
    allWarnings.push({
      severity: 'info',
      code: 'ALTITUDE_NOT_USED',
      message: 'altitude does not change creepage in IEC 60664-1 (S-032, PAYWALLED): the altitude you entered is ignored here; it applies to the clearance calculator only.',
    });
  }
  if (inp.grooves === 'present') {
    allWarnings.push({
      severity: 'caution',
      code: 'GROOVES_NOT_CREDITED',
      message:
        'Grooves, slots and ribs are not credited: the creepage shown is for a flat surface path; check the standard before relying on a longer path.',
    });
  }
  if (inp.soldermask) allWarnings.push(SOLDERMASK_DECLARED_WARNING);

  const validityChecks: CalcResult['validityChecks'] = [
    ...standardChecks(meta.mandatoryInputs, used, edition),
    { name: 'creepage not less than the associated clearance', ok: true, detail: 'Enforced in code: the larger of the table value and the associated clearance is reported.' },
    ...scope.checks,
  ];

  const confidence = spacingConfidence({ verified: !unverified, safetyRelevantDefaults: scope.unchecked, dataStatus: DATA_STATUS });
  const recommendation = iecRecommendation(unverified, used);

  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition, ledgerIds },
    formula: meta.formula,
    inputs,
    assumptions,
    steps,
    results: [primaryResult(unverified, 'minimum creepage distance', creepage)],
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

/** Gated creepage. Never throws; an error value says which mandatory input or table entry is missing. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'INTERNAL', message: `Creepage could not be completed: ${message}` } };
  }
}
