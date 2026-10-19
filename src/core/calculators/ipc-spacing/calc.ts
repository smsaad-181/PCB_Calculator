import { dataStatusForLedgerIds } from '../../data-status';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import {
  INDICATIVE_PREFIX,
  anyUnverified,
  commonWarnings,
  emptyTablesError,
  insufficientData,
  lookupError,
  primaryResult,
  provenanceLine,
  spacingConfidence,
  standardChecks,
  squareRmsWarning,
  userInput,
  withWaveformRow,
} from '../../spacing/gating';
import { lookupGrid } from '../../spacing/tables';
import type { Selectors, SpacingTableSet } from '../../spacing/tables';
import { validate } from './guards';
import type { Coating, ConductorKind, Location } from './guards';
import { meta } from './meta';

export interface Inputs {
  tables?: SpacingTableSet;
  edition?: string;
  voltagePeak?: Quantity;
  voltageRms?: Quantity;
  waveform?: { shape: 'dc' | 'sine' | 'square' | 'triangle'; basis: 'peak' | 'rms'; value: Quantity };
  location?: Location;
  conductorKind?: ConductorKind;
  coating?: Coating;
  /** A length above sea level, or the text "vacuum". */
  elevation?: Quantity | 'vacuum';
}

const DATA_STATUS = dataStatusForLedgerIds(meta.ledgerIds);
const lenQ = (m: number): Quantity => q(m, DIM.LENGTH);
export const COATED_COLUMN_EXPOSED_COPPER_NOTE =
  'Pads, lands and component leads are normally uncoated: use the uncoated column (or the component-lead column) for gaps that touch them. A coated column fits only where mask or coating covers both conductors along the whole gap.';
export const IPC_LABEL = 'IPC-2221 conductor spacing (design guideline; not a safety insulation assessment)';
const IPC_NOTE =
  'IPC-2221 conductor spacing is a design guideline, not a safety insulation assessment: it has no pollution degree, material group or overvoltage category and does not replace the IEC 60664-1 calculators or the product standard (S-033a).';

function internal(message: string): CalcOutcome {
  const error: CalcError = { code: 'INTERNAL', message };
  return { ok: false, error };
}

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const t8 = inp.tables.tables.T8;
  const edition = inp.edition;
  const empty = emptyTablesError([t8]);
  if (empty !== undefined) return { ok: false, error: empty };

  const selectors: Record<string, string | number> = { location: inp.location };
  const notes: string[] = [];
  if (inp.location === 'external') {
    selectors['conductorKind'] = inp.conductorKind as string;
    selectors['coating'] = inp.coating as string;
    if (inp.elevation !== undefined) {
      if (inp.elevation.kind === 'vacuum') {
        // A column that does not mention elevation must never answer a vacuum request by default.
        if (!t8.columns.some((c) => c.selectors['elevation'] === 'vacuum')) {
          return { ok: false, error: insufficientData([`INSUFFICIENT DATA: table ${t8.name} has no vacuum column (enter it from your licensed copy if your edition has one)`]) };
        }
        selectors['elevation'] = 'vacuum';
      } else {
        const usesBreakpoint = t8.columns.some((c) => c.selectors['elevation'] === 'below-breakpoint' || c.selectors['elevation'] === 'above-breakpoint');
        if (usesBreakpoint) {
          const bp = t8.elevationBreakpoint;
          if (bp === undefined) {
            return {
              ok: false,
              error: insufficientData([`INSUFFICIENT DATA: the elevation breakpoint is not entered in table ${t8.name} (enter it from your licensed copy)`]),
            };
          }
          const bpM = bp.value * (bp.unit === 'km' ? 1e3 : 1);
          const h = inp.elevation.height.si;
          // At the breakpoint itself the "above" column is used: inclusivity is not known, and the conservative reading is taken.
          selectors['elevation'] = h >= bpM ? 'above-breakpoint' : 'below-breakpoint';
          notes.push(`Elevation ${String(h)} m against the breakpoint ${String(bpM)} m entered in T8 (${bp.source}): ${String(selectors['elevation'])}; at the breakpoint the "above" column is used (conservative).`);
        }
      }
    }
  }
  const l = lookupGrid(t8, { rowSi: inp.peak.si, selectors: selectors as Selectors, edition });
  if (!l.ok) return { ok: false, error: lookupError(l) };

  const unverified = anyUnverified([t8]);
  const inputs: CalcInput[] = [userInput('voltage between conductors (peak)', inp.peak, inp.voltageHow === 'waveform' ? `from the declared ${inp.waveformShape ?? ''} waveform` : undefined)];
  const assumptions: string[] = [
    `Data set edition: ${edition} (the table holds exactly this edition).`,
    `Conductors: ${inp.location}${inp.location === 'external' ? `, ${inp.conductorKind ?? ''}, coating ${inp.coating ?? ''}` : ''} (user-entered, no defaults).`,
    'IPC-2221 has no pollution degree, material group or overvoltage category input; this is not the IEC 60664-1 method.',
    provenanceLine(t8, l),
    ...notes,
  ];
  if (inp.location === 'internal') assumptions.push('Internal conductors: any coating or elevation entered is not used.');

  const warnings: CalcWarning[] = [...commonWarnings({ unverified, iec: false }), { severity: 'warning', message: IPC_NOTE, code: 'IPC_NOT_SAFETY' }];
  const sq = squareRmsWarning(inp.waveformShape, inp.waveformBasis);
  if (sq !== undefined) warnings.push(sq);
  if (inp.location === 'external' && inp.coating !== undefined && inp.coating !== 'uncoated') {
    warnings.push({ severity: 'caution', message: COATED_COLUMN_EXPOSED_COPPER_NOTE, code: 'COATED_COLUMN_EXPOSED_COPPER' });
  }
  const ledgerIds = withWaveformRow(meta.reference.ledgerIds, inp.voltageHow === 'waveform');
  const recommendation = unverified
    ? `${INDICATIVE_PREFIX}: the table data is UNVERIFIED (entered by a user, not verified by a named person). ${IPC_LABEL}. Check every cell against your licensed copy of IPC-2221 before using this spacing.`
    : `${IPC_LABEL}. The table was signed off by ${t8.verifiedBy}. Use the IEC 60664-1 calculators and your product standard for insulation spacing.`;

  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition, ledgerIds },
    formula: meta.formula,
    inputs,
    assumptions,
    steps: [
      { label: 'Voltage between conductors (peak)', expr: inp.voltageHow === 'waveform' ? 'from the declared waveform' : 'user-entered', value: inp.peak, bound: 'min-requirement' },
      { label: `Spacing from T8 (${l.method})`, expr: 'T8(voltage, location, conductor kind, coating, elevation)', value: lenQ(l.valueSi), bound: 'min-requirement' },
    ],
    results: [primaryResult(unverified, 'minimum conductor spacing (IPC-2221 design guideline)', l.valueSi)],
    validityChecks: standardChecks(meta.mandatoryInputs, [t8], edition),
    warnings,
    confidence: spacingConfidence({ verified: !unverified, safetyRelevantDefaults: [], dataStatus: DATA_STATUS }),
    recommendation,
    dataStatus: DATA_STATUS,
    designValues: [],
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) return internal(`Result failed its schema check: ${chk.error.join('; ')}`);
  return { ok: true, value: result };
}

/** Gated IPC-2221 spacing. Never throws; an error value says which mandatory input or table entry is missing. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'INTERNAL', message: `IPC spacing could not be completed: ${message}` } };
  }
}
