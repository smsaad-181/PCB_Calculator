interface Props {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly onText: (text: string) => void;
  readonly help: string;
  readonly maxLength: number;
  readonly placeholder?: string;
  readonly externalError?: string | undefined;
}

/** Free-text field (a note, not a quantity). The text is shown back as the user's own words and never parsed as a number. */
export function TextField(p: Props) {
  const helpId = `${p.id}-help`;
  const errId = `${p.id}-err`;
  const error = p.externalError;
  return (
    <div class="field">
      <label for={p.id}>{p.label}</label>
      <input
        id={p.id}
        type="text"
        autoComplete="off"
        spellcheck={false}
        maxLength={p.maxLength}
        value={p.text}
        placeholder={p.placeholder}
        aria-invalid={error !== undefined ? 'true' : undefined}
        aria-describedby={error !== undefined ? `${helpId} ${errId}` : helpId}
        onInput={(e) => p.onText((e.currentTarget as HTMLInputElement).value)}
      />
      <p id={helpId} class="help">
        {p.help}
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
