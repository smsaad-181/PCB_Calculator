import type { Dim, DisplayPrefs } from '../../core/units';
import { MAX_FIELD_CHARS, parseField } from './view';

interface Props {
  readonly id: string;
  readonly label: string;
  /** Unit hint shown in the label, announced with it (for example "oz/ft²"). */
  readonly unitHint: string;
  readonly text: string;
  readonly onText: (text: string) => void;
  readonly expectedDim: Dim;
  /** Display units for the parsed echo. */
  readonly echoPrefs?: DisplayPrefs;
  /** Accepted spellings / example, shown under the field. */
  readonly help: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /** Shown instead of the help text when the field is disabled. */
  readonly disabledReason?: string;
  readonly required?: boolean;
  /** An error found after parsing (for example by the calculator's own guards). */
  readonly externalError?: string | undefined;
}

/**
 * Text field with live parsing against the field's expected dimension. It shows what was understood
 * ("= 0.254 mm (length)"), parser warnings, and the parse error with its hint. It never reports a number
 * for text that did not parse.
 */
export function QuantityField(p: Props) {
  const view =
    p.disabled === true
      ? undefined
      : p.echoPrefs === undefined
        ? parseField(p.text, p.expectedDim)
        : parseField(p.text, p.expectedDim, p.echoPrefs);
  const error = view?.status === 'error' ? view.message : view?.status === 'ok' ? p.externalError : undefined;
  const helpId = `${p.id}-help`;
  const echoId = `${p.id}-echo`;
  const errId = `${p.id}-err`;
  const describedBy = [helpId, view?.status === 'ok' ? echoId : '', error !== undefined ? errId : ''].filter((s) => s !== '').join(' ');
  return (
    <div class="field">
      <label for={p.id}>
        {p.label} <span class="unit">({p.unitHint})</span>
        {p.required === true && <span class="req"> required</span>}
      </label>
      <input
        id={p.id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellcheck={false}
        maxLength={MAX_FIELD_CHARS}
        value={p.text}
        placeholder={p.placeholder}
        disabled={p.disabled === true}
        aria-invalid={error !== undefined ? 'true' : undefined}
        aria-describedby={describedBy}
        onInput={(e) => p.onText((e.currentTarget as HTMLInputElement).value)}
      />
      <p id={helpId} class="help">
        {p.disabled === true ? (p.disabledReason ?? 'Not used here.') : p.help}
      </p>
      {view?.status === 'ok' && (
        <p id={echoId} class="echo">
          <span class="visually-hidden">Understood as </span>
          {view.echo}
        </p>
      )}
      {view?.status === 'ok' &&
        view.warnings.map((w) => (
          <p key={w} class="field-warning">
            <span aria-hidden="true">{'▲ '}</span>
            <span class="visually-hidden">Warning: </span>
            {w}
          </p>
        ))}
      {error !== undefined && (
        <p id={errId} class="field-error">
          <span aria-hidden="true">{'✖ '}</span>
          <span class="visually-hidden">Error: </span>
          {error}
        </p>
      )}
    </div>
  );
}
