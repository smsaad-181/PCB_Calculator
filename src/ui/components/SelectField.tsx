import type { ComponentChildren } from 'preact';

export interface Option {
  readonly value: string;
  readonly label: string;
}

interface Props {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly Option[];
  readonly onChange: (value: string) => void;
  readonly help?: ComponentChildren;
  readonly disabled?: boolean;
  readonly required?: boolean;
  /** When set, the first option is this text with an empty value: there is no default selection. */
  readonly placeholderOption?: string;
}

/** Explicit select. With `placeholderOption` there is no default selection: the user must choose. */
export function SelectField(p: Props) {
  const helpId = `${p.id}-help`;
  return (
    <div class="field">
      <label for={p.id}>
        {p.label}
        {p.required === true && <span class="req"> required</span>}
      </label>
      <select
        id={p.id}
        value={p.value}
        disabled={p.disabled === true}
        aria-required={p.required === true ? 'true' : undefined}
        aria-describedby={p.help !== undefined ? helpId : undefined}
        onChange={(e) => p.onChange((e.currentTarget as HTMLSelectElement).value)}
      >
        {p.placeholderOption !== undefined && <option value="">{p.placeholderOption}</option>}
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {p.help !== undefined && (
        <p id={helpId} class="help">
          {p.help}
        </p>
      )}
    </div>
  );
}
