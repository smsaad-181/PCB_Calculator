import type { DataStatus } from '../../confidence';
import { dataStatusFromLedger } from '../../data-status';
import { fabProfileAgeDays, fabProfileStale } from '../../fab/profile';
import type { ParsedFabProfile } from '../../fab/profile';
import { lookupLimit } from '../../fab/scoped-limits';
import type { LimitKind, ScopeRequest } from '../../fab/scoped-limits';
import { formatResult } from '../../format-result';
import { NET_CLASS_KEYS } from '../../result';
import type { CalcExport, CalcWarning, ExportSource, NetClassKey } from '../../result';
import { DIM, q, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { compute as computeTraceWidth } from '../trace-width/calc';
import type { LayerCountInput, TraceLoadElement, ViaLoadElement } from './guards';

/**
 * Net-class export (G3-c). Three kinds of value, each with its own provenance:
 *  - width: the trace-width solve at the user's allowed rise for the applied current, with that calculator's design margin
 *    on current (an engineering default, not from a standard). Legacy IPC-2221 (S-001, PAYWALLED).
 *  - viaDrill / viaPad: an ECHO of what the user entered. Nothing is derived or recommended.
 *  - clearance: only from a fab profile the user selected, for the exact scope, and only if the profile publishes it.
 * A value that is outside its plausible range is never exported (a warning says why).
 */

export interface ExportArgs {
  readonly current: number;
  readonly traces: readonly TraceLoadElement[];
  readonly vias: readonly ViaLoadElement[];
  readonly fabProfile?: ParsedFabProfile;
  readonly today?: string;
  readonly layerCount?: LayerCountInput;
  readonly accuracyClass: 'empirical' | 'analytical';
}

export interface ExportOutcome {
  readonly exports: CalcExport[];
  readonly warnings: CalcWarning[];
  readonly validityChecks: { name: string; ok: boolean; detail: string }[];
  readonly outOfRange: string[];
  /** Statuses of data actually used in the exports (profile and entries), beyond the path's own ledger rows. */
  readonly statuses: DataStatus[];
  readonly assumptions: string[];
  readonly steps: { label: string; expr: string; value: Quantity; bound: 'min-requirement' }[];
}

const num = (x: number): string => String(Number(x.toPrecision(4)));
const lengthOk = (key: NetClassKey, v: Quantity): boolean => {
  const s = NET_CLASS_KEYS[key];
  return Number.isFinite(v.si) && v.si >= s.minSi && v.si <= s.maxSi;
};

function groupKey(t: TraceLoadElement): string {
  const copper = t.copperWeight !== undefined ? `w${num(toUnit(t.copperWeight, 'oz/ft2'))}` : `t${String(t.copperThickness?.si)}`;
  return [t.layer, copper, t.copperBasis ?? '', t.convention ?? '', String(t.allowedTempRise.si)].join('|');
}

export function buildExports(a: ExportArgs): ExportOutcome {
  const exports: CalcExport[] = [];
  const warnings: CalcWarning[] = [];
  const validityChecks: ExportOutcome['validityChecks'] = [];
  const outOfRange: string[] = [];
  const statuses: DataStatus[] = [];
  const assumptions: string[] = [];
  const steps: ExportOutcome['steps'] = [];
  const opts = { accuracyClass: a.accuracyClass } as const;
  const fmtUp = (v: Quantity): string => formatResult({ value: v, bound: 'min-requirement' }, opts);

  // Traces, grouped by what determines the width (layer, copper, allowed rise).
  const groups = new Map<string, TraceLoadElement[]>();
  for (const t of a.traces) {
    const k = groupKey(t);
    const g = groups.get(k);
    if (g === undefined) groups.set(k, [t]);
    else g.push(t);
  }
  let n = 0;
  for (const g of groups.values()) {
    n += 1;
    const rep = g[0] as TraceLoadElement;
    const labels = g.map((t) => `"${t.label}"`).join(', ');
    const tw = computeTraceWidth({
      mode: 'B',
      layer: rep.layer,
      current: q(a.current, DIM.CURRENT),
      deltaT: rep.allowedTempRise,
      ...(rep.copperWeight !== undefined ? { copperWeight: rep.copperWeight } : {}),
      ...(rep.copperThickness !== undefined ? { copperThickness: rep.copperThickness } : {}),
      ...(rep.copperBasis !== undefined ? { copperBasis: rep.copperBasis } : {}),
      ...(rep.convention !== undefined ? { convention: rep.convention } : {}),
    });
    if (!tw.ok) {
      warnings.push({
        severity: 'caution',
        code: 'EXPORT_WIDTH_UNAVAILABLE',
        message: `No net-class width is exported for ${labels}: the width solve for ${num(a.current)} A at a ${num(toUnit(rep.allowedTempRise, 'ddegC'))} °C rise failed (${tw.error.message}).`,
      });
      continue;
    }
    const dv = tw.value.designValues.find((d) => d.name === 'width');
    const margin = tw.value.inputs.find((i) => i.name === 'designMargin');
    if (dv === undefined || margin === undefined) {
      warnings.push({ severity: 'caution', code: 'EXPORT_WIDTH_UNAVAILABLE', message: `No net-class width is exported for ${labels}: the width solve returned no design value.` });
      continue;
    }
    for (const c of tw.value.validityChecks.filter((x) => !x.ok)) {
      validityChecks.push({ name: `net-class width ${String(n)}: ${c.name}`, ok: false, detail: c.detail });
      outOfRange.push(`net-class width ${String(n)}: ${c.name}`);
    }
    if (!lengthOk('width', dv.recommended)) {
      warnings.push({
        severity: 'caution',
        code: 'EXPORT_WIDTH_OUT_OF_RANGE',
        message: `No net-class width is exported for ${labels}: the recommended width ${fmtUp(dv.recommended)} is outside the plausible range of a PCB trace (check the current and the temperature rise).`,
      });
      continue;
    }
    steps.push({ label: `Calculated minimum trace width (net class ${String(n)})`, expr: 'width solved for I at the allowed rise (legacy IPC-2221), no margin', value: dv.calculated, bound: 'min-requirement' });
    steps.push({ label: `Recommended minimum trace width (net class ${String(n)})`, expr: 'width solved for margin x I at the allowed rise (legacy IPC-2221)', value: dv.recommended, bound: 'min-requirement' });
    const values: Record<string, Quantity> = { width: q(dv.recommended.si, dv.recommended.dim) };
    const sources: Record<string, ExportSource> = { width: 'calculated' };
    const noteParts: string[] = [
      `Net class for ${labels} (${rep.layer} layer): recommended minimum trace width ${fmtUp(dv.recommended)} for the applied ${num(a.current)} A at the ${num(toUnit(rep.allowedTempRise, 'ddegC'))} °C rise you allowed; the calculated minimum is ${fmtUp(dv.calculated)} and the design margin is x${num(margin.value.si)} on current (${margin.source === 'default' ? 'an engineering default, not from a standard' : 'set by the user'}). LEGACY IPC-2221 method (ledger S-001, PAYWALLED), not IPC-2152; the width is a minimum, not a guarantee.`,
    ];
    let profileInfo: CalcExport['profile'];

    // Clearance: only from a selected profile, for the exact scope.
    if (a.fabProfile === undefined || a.today === undefined) {
      noteParts.push('Clearance is omitted: no fab profile was selected, and no clearance is assumed.');
    } else if (a.layerCount === undefined) {
      noteParts.push(`Clearance is omitted: layerCount was not given, so the scope of the profile ${a.fabProfile.id} cannot be matched and no entry is borrowed from another scope.`);
    } else {
      const scope: ScopeRequest = {
        layerCount: a.layerCount,
        layerSide: rep.layer,
        ...(rep.copperWeight !== undefined ? { copperOz: Number(toUnit(rep.copperWeight, 'oz/ft2').toFixed(9)) } : {}),
      };
      let found: { value: Quantity; kind: LimitKind; ledgerId: string; status: DataStatus; quote: string } | undefined;
      const why: string[] = [];
      for (const kind of ['recommended-min', 'min'] as const) {
        const r = lookupLimit(a.fabProfile, 'traceSpace', kind, scope);
        if (r.status === 'found') {
          found = { value: r.value, kind, ledgerId: r.entry.ledgerId, status: r.entry.status, quote: r.entry.quote };
          break;
        }
        why.push(r.status === 'not-published' ? `"${kind}" is recorded as not published (${r.entry.ledgerId})` : r.reason);
      }
      if (found === undefined) {
        noteParts.push(`Clearance is omitted: profile ${a.fabProfile.id} publishes no track spacing for this scope (${why.join('; ')}). Enter your fabricator value.`);
      } else if (!lengthOk('clearance', found.value)) {
        noteParts.push(`Clearance is omitted: the profile value is outside the plausible range of a clearance.`);
      } else {
        const age = fabProfileAgeDays(a.fabProfile, a.today);
        const stale = fabProfileStale(a.fabProfile, a.today);
        const pStatus = dataStatusFromLedger(a.fabProfile.status);
        profileInfo = { id: a.fabProfile.id, status: pStatus, ageDays: age, stale };
        values['clearance'] = q(found.value.si, found.value.dim);
        sources['clearance'] = 'fab-profile';
        statuses.push(pStatus, found.status);
        const tag = pStatus === 'VERIFIED' && found.status === 'VERIFIED' ? '' : ` Data status ${pStatus === 'VERIFIED' ? found.status : pStatus} (profile ${a.fabProfile.id}, entry ${found.ledgerId} ${found.status}): UNVERIFIED or unconfirmed data must be re-read on the fabricator's own page.`;
        noteParts.push(
          `Clearance ${fmtUp(found.value)} is the fabricator's published track spacing ("${found.kind}", ${found.ledgerId}; profile ${a.fabProfile.id}, ${String(age)} days old${stale ? ', STALE' : ''}; wording: ${found.quote}). It is a manufacturing minimum only: voltage-based spacing and creepage are not evaluated here.${tag}`,
        );
        if (pStatus !== 'VERIFIED' && !noteParts.join(' ').includes(pStatus)) noteParts.push(`Profile status ${pStatus}.`);
      }
    }
    const exp: CalcExport = { id: `net-class-trace-${String(n)}`, kind: 'net-class', values, sources, note: noteParts.join(' '), ...(profileInfo !== undefined ? { profile: profileInfo } : {}) };
    exports.push(exp);
  }

  // Vias: echo of the user's own drill and pad entries.
  let v = 0;
  for (const via of a.vias) {
    const values: Record<string, Quantity> = {};
    const sources: Record<string, ExportSource> = {};
    const skipped: string[] = [];
    const put = (key: 'viaDrill' | 'viaPad', x: Quantity | undefined, what: string): void => {
      if (x === undefined) return;
      if (!lengthOk(key, x)) {
        skipped.push(what);
        return;
      }
      values[key] = q(x.si, x.dim);
      sources[key] = 'user-entered';
    };
    put('viaDrill', via.drillDiameter, 'drill diameter');
    put('viaPad', via.padDiameter, 'pad diameter');
    if (skipped.length > 0) {
      warnings.push({ severity: 'caution', code: 'EXPORT_VIA_OUT_OF_RANGE', message: `Via "${via.label}": the ${skipped.join(' and ')} you entered is outside the plausible range and is not exported (check the unit).` });
    }
    if (Object.keys(values).length === 0) {
      if (via.drillDiameter === undefined && via.padDiameter === undefined) assumptions.push(`Via "${via.label}": no drill or pad diameter was entered, so no via entry is exported; none is derived from the finished hole or the plating.`);
      continue;
    }
    v += 1;
    exports.push({
      id: `net-class-via-${String(v)}`,
      kind: 'net-class',
      values,
      sources,
      note: `Via "${via.label}": drill and pad as you entered them (an echo, not a recommendation; the tool derives no drill or pad size and no via rating). The finished hole you entered for the resistance is a different number from the drill.`,
    });
  }
  return { exports, warnings, validityChecks, outOfRange, statuses, assumptions, steps };
}
