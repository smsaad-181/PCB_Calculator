import { NO_TOLERANCE_LABEL, PRESET_HELP, PRESET_PLACEHOLDER, presetChoices, terminationNotes, type PresetView } from '../calculators/diff-presets.vm';
import { RadioGroup } from './RadioGroup';
import { SelectField } from './SelectField';
import { UnverifiedBadge } from './UnverifiedBadge';

interface PickerProps {
  readonly preset: string;
  readonly tolerance: string;
  readonly view: PresetView;
  readonly onPreset: (id: string) => void;
  readonly onTolerance: (id: string) => void;
}

/** Optional protocol preset: never pre-selected. Tolerances are separate radios from the data; none is chosen for the user. */
export function PresetPicker({ preset, tolerance, view, onPreset, onTolerance }: PickerProps) {
  const sel = view.selected;
  return (
    <fieldset class="preset-picker">
      <legend>Protocol design target (optional)</legend>
      <SelectField id="preset" label="Protocol preset" value={preset} options={presetChoices()} onChange={onPreset} help={PRESET_HELP} placeholderOption={PRESET_PLACEHOLDER} />
      {view.notes.map((n) => (
        <p key={n} class="field-warning" role="note">
          <span aria-hidden="true">{'▲ '}</span>
          {n}
        </p>
      ))}
      {sel !== null && (
        <>
          <p class="help" role="note">
            <strong>{sel.label}.</strong> {sel.scope}
          </p>
          {view.targetLine !== undefined && (
            <p class="help" id="preset-target-line">
              {view.targetLine}
            </p>
          )}
          {sel.status !== 'VERIFIED' && <UnverifiedBadge status={sel.status} ledgerIds={[sel.ledgerId]} />}
          <p class="help">{sel.note}</p>
          {view.info.length > 0 && (
            <ul class="help">
              {view.info.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          {view.toleranceOptions.length > 0 ? (
            <>
              <RadioGroup
                name="preset-tolerance"
                legend="Tolerance (choose one to get a band statement)"
                value={tolerance}
                options={[{ value: '', label: NO_TOLERANCE_LABEL }, ...view.toleranceOptions.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))]}
                onChange={onTolerance}
              />
              <p class="help">{view.toleranceNote}</p>
            </>
          ) : (
            <p class="help">
              <strong>Tolerance:</strong> {view.toleranceNote}
            </p>
          )}
          <p class="help">
            <strong>Sources:</strong> {sel.sources.join('; ')}.
          </p>
        </>
      )}
    </fieldset>
  );
}

/** CAN and RS-485: informational, not selectable as a PCB target. */
export function TerminationNotes() {
  return (
    <section class="termination-notes" aria-labelledby="term-h">
      <h3 id="term-h">Termination note (CAN, RS-485)</h3>
      <ul>
        {terminationNotes().map((n) => (
          <li key={n.id}>
            <strong>{n.heading}</strong>{' '}
            <span class="status-text">
              ledger {n.ledgerId}, {n.status}
            </span>{' '}
            {n.status !== 'VERIFIED' && <UnverifiedBadge status={n.status} ledgerIds={[n.ledgerId]} />}
            <span class="muted"> {n.text}</span>
            <span class="muted"> Sources: {n.sources.join('; ')}.</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The comparison with the design target, as text. No pass or fail wording and no colour carrying meaning. */
export function PresetComparison({ view }: { readonly view: PresetView }) {
  const c = view.comparison;
  if (c === undefined || view.selected === null) return null;
  return (
    <section class="preset-comparison" aria-labelledby="pc-h">
      <h3 id="pc-h">Comparison with the preset design target</h3>
      <p>
        <span class="pill-unverified">UNVERIFIED</span> {c.statement}
      </p>
      {c.bandTag !== undefined && (
        <p>
          <strong>[{c.bandTag}]</strong>
        </p>
      )}
      {view.designTargetLine !== undefined && <p class="muted">{view.designTargetLine}.</p>}
    </section>
  );
}
