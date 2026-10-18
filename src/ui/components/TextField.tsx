interface Props {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly onText: (text: string) => void;
  readonly help: string;
  readonly maxLength: number;
  readonly placeholder?: string;
  readonly externalError?: string | undefined;
  /** A field filled from elsewhere (for example a stackup): shown as not editable, with the reason instead of the help text. */
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly required?: boolean;
}

/** Free-text field (a note, not a quantity). The text is shown back as the user's own words and never parsed as a number. */
export function TextField(p: Props) {
  const helpId = `${p.id}-help`;
  const errId = `${p.id}-err`;
  const error = p.externalError;
  return (
    <div class="field">
      <label for={p.id}>
        {p.label}
        {p.required === true && <span class="req"> required</span>}
      </label>
      <input
        id={p.id}
        type="text"
        autoComplete="off"
        spellcheck={false}
        maxLength={p.maxLength}
        value={p.text}
        placeholder={p.placeholder}
        disabled={p.disabled === true}
        aria-invalid={error !== undefined ? 'true' : undefined}
        aria-describedby={error !== undefined ? `${helpId} ${errId}` : helpId}
        onInput={(e) => p.onText((e.currentTarget as HTMLInputElement).value)}
      />
      <p id={helpId} class="help">
        {p.disabled === true ? (p.disabledReason ?? "Not used here.") : p.help}
      </p>
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
