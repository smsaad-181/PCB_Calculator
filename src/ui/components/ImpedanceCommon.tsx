import type { ComponentChildren } from 'preact';
import { DIM } from '../../core/units';
import { ER_HELP, ER_SOURCE_HELP, dimOfKind, echoOf, parseNumberField, type ConflictView, type ImpedanceView, type LimitsView, type TextDef, type Units } from '../calculators/impedance.vm';
import { Callout } from './Callout';
import { LedgerRowBadges } from './LedgerRowBadges';
import { LossResults } from './LossResults';
import { NearResultNotes } from './NearResultNotes';
import { QuantityField } from './QuantityField';
import { RadioGroup } from './RadioGroup';
import { ResultStatus } from './ResultStatus';
import { ResultsPanel } from './ResultsPanel';
import { TextField } from './TextField';
import { ToleranceResults } from './ToleranceResults';
import { UnverifiedBadge } from './UnverifiedBadge';
import type { LedgerStatus } from '../../core/data/ledger';

export const RANGE_HINT =
  "Outside the model's recorded validity range: the result is an extrapolation and the confidence is low. See the confidence reasons.";

interface QProps {
  readonly id: string;
  readonly def: TextDef;
  readonly text: string;
  readonly onText: (text: string) => void;
  readonly units: Units;
  readonly unitHint: string;
  readonly help: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly error?: string | undefined;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

/** One quantity field of an impedance page: parsed live against its dimension, with the echo of what was understood. */
export function Q(p: QProps) {
  return (
    <QuantityField
      id={p.id}
      label={p.def.label}
      unitHint={p.unitHint}
      text={p.text}
      onText={p.onText}
      expectedDim={dimOfKind(p.def.kind)}
      echoPrefs={echoOf(p.def, p.units)}
      help={p.help}
      {...(p.placeholder !== undefined ? { placeholder: p.placeholder } : {})}
      {...(p.required === true ? { required: true } : {})}
      externalError={p.error}
      {...(p.disabled === true ? { disabled: true } : {})}
      {...(p.disabledReason !== undefined ? { disabledReason: p.disabledReason } : {})}
    />
  );
}

interface ErProps {
  readonly er: TextDef;
  readonly source: TextDef;
  readonly erText: string;
  readonly sourceText: string;
  readonly onEr: (t: string) => void;
  readonly onSource: (t: string) => void;
  readonly erError?: string | undefined;
  readonly sourceError?: string | undefined;
  readonly locked: boolean;
  readonly lockedReason: string;
  readonly erHelp?: string;
}

/** er has no default and no example; its source note is required. Both are filled from the stackup while it is in use. */
export function ErFields(p: ErProps) {
  return (
    <>
      <QuantityField
        id="er"
        label={p.er.label}
        unitHint="plain number, no unit"
        text={p.erText}
        onText={p.onEr}
        expectedDim={DIM.DIMENSIONLESS}
        parser={parseNumberField}
        help={p.erHelp ?? ER_HELP}
        required
        externalError={p.erError}
        {...(p.locked ? { disabled: true, disabledReason: p.lockedReason } : {})}
      />
      <TextField
        id="er-source"
        label={p.source.label}
        text={p.sourceText}
        onText={p.onSource}
        help={ER_SOURCE_HELP}
        maxLength={200}
        placeholder="where er came from"
        required
        externalError={p.sourceError}
        disabled={p.locked}
        disabledReason={p.lockedReason}
      />
    </>
  );
}

interface SolveProps {
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly value: string;
  readonly onChange: (v: string) => void;
}

export function SolveChoice(p: SolveProps) {
  return <RadioGroup name="solvefor" legend="What to calculate" value={p.value} options={p.options} onChange={p.onChange} />;
}

export function UnitsChoice({ value, onChange }: { readonly value: Units; readonly onChange: (u: Units) => void }) {
  return (
    <>
      <RadioGroup
        name="units"
        legend="Echo units for what you type"
        value={value}
        options={[
          { value: 'metric', label: 'Metric (mm, µm)' },
          { value: 'imperial', label: 'Imperial (mil)' },
        ]}
        onChange={(v) => onChange(v === 'imperial' ? 'imperial' : 'metric')}
      />
      <p class="help">Results always show mm and mil together (copper and dielectric thickness as µm and mil).</p>
    </>
  );
}

interface ThicknessProps {
  readonly options: readonly { readonly value: string; readonly label: string; readonly conflict: boolean }[];
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly ledgerId: string;
  readonly help: string;
}

/** Thickness model radio. A variant carries the CONFLICT badge and a standing warning while it is chosen. */
export function ThicknessChoice(p: ThicknessProps) {
  const chosen = p.options.find((o) => o.value === p.value);
  const variant = chosen?.conflict === true;
  const status: LedgerStatus = 'CONFLICT';
  return (
    <>
      <RadioGroup
        name="thickness-model"
        legend="Strip thickness model"
        value={p.value}
        options={p.options.map((o) => ({ value: o.value, label: o.conflict ? `${o.label} - CONFLICT, ledger ${p.ledgerId}` : o.label }))}
        onChange={p.onChange}
      />
      <p class="help">{p.help}</p>
      {variant && (
        <div class="field-warning" role="note">
          <span aria-hidden="true">{'▲ '}</span>
          <strong>Variant chosen.</strong> Its source rows disagree, so the result is a labelled variant, not the verified base value. <UnverifiedBadge status={status} ledgerIds={[p.ledgerId]} />
        </div>
      )}
    </>
  );
}

/** Thickness-variant side values (ledger CONFLICT): labelled rows beside the headline, never the headline itself. */
function ConflictRows({ view }: { readonly view: ConflictView | undefined }) {
  if (view === undefined) return null;
  return (
    <section class="conflict-rows" aria-labelledby="conflict-h">
      <h3 id="conflict-h">{view.heading}</h3>
      {view.rows.length > 0 && (
        <dl class="rows">
          {view.rows.map((r) => (
            <div key={r.label} class="row">
              <dt>
                <span aria-hidden="true">{'▲ '}</span>
                {r.label}
              </dt>
              <dd>{r.text}</dd>
              {r.hint !== undefined && (
                <dd class="row-note">
                  <strong>Note:</strong> {r.hint}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {view.notes.map((n) => (
        <p key={n.message} class="muted">
          <strong>{n.label}.</strong> {n.message}
        </p>
      ))}
    </section>
  );
}

/** What the model leaves out and which way it moves the result, in the core's own words, next to the result. */
function LimitsBlock({ view }: { readonly view: LimitsView | undefined }) {
  if (view === undefined) return null;
  return (
    <section class="limits-block" aria-labelledby="limits-h">
      <h3 id="limits-h">{view.heading}</h3>
      <ul>
        {view.items.map((i) => (
          <li key={i.title}>
            <strong>{i.title}.</strong> {i.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Result area: the mandatory banner is an Important callout in every state (result, problems, or nothing to show yet). */
export function ImpedanceResults({ view, extra }: { readonly view: ImpedanceView; readonly extra?: ComponentChildren }) {
  if (view.status === 'ok') {
    return (
      <ResultsPanel
        view={view.result}
        failedCheckHint={RANGE_HINT}
        callout={view.banner}
        {...(view.callouts !== undefined ? { callouts: view.callouts } : {})}
        afterHeadline={
          <>
            {extra}
            <ConflictRows view={view.conflict} />
            <LimitsBlock view={view.limits} />
            {view.lowNote !== undefined && (
              <p class="help low-confidence-note" role="note">
                <strong>Confidence low.</strong> {view.lowNote}
              </p>
            )}
            <NearResultNotes view={view.near} />
            <ToleranceResults view={view.tolerance} />
            <LossResults loss={view.loss} needs={view.lossNeeds} />
            {view.handoff !== undefined && (
              <p class="handoff">
                <a href={view.handoff.href}>{view.handoff.label}</a>
                <span class="help"> {view.handoff.help}</span>
              </p>
            )}
            {view.netClass !== undefined && (
              <section class="netclass" aria-labelledby="nc-h">
                <h3 id="nc-h">Starting value for a net class (mm and mil)</h3>
                <div class="field">
                  <label for="nc-copy">Plain text to copy</label>
                  <textarea id="nc-copy" class="netclass-text" readOnly rows={3} value={view.netClass} aria-describedby="nc-copy-help" />
                  <p id="nc-copy-help" class="help">
                    {view.netClassHelp}
                  </p>
                </div>
              </section>
            )}
            <LedgerRowBadges heading="Data behind this result (one status per ledger row)" rows={view.ledgerRows} />
          </>
        }
      />
    );
  }
  return (
    <>
      <Callout heading={view.banner.heading} text={view.banner.text} />
      {view.status === 'error' ? <ResultStatus status="error" items={view.problems} /> : <ResultStatus status="needs-input" items={view.needs} />}
    </>
  );
}
