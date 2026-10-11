import type { Option } from './SelectField';

export interface RadioOption extends Option {
  /** A visible but unavailable choice. It cannot be selected; `hint` says why. */
  readonly disabled?: boolean;
  readonly hint?: string;
}

interface Props {
  readonly name: string;
  readonly legend: string;
  readonly value: string;
  readonly options: readonly RadioOption[];
  readonly onChange: (value: string) => void;
}

/** Native radio group: arrow keys move the choice, Tab enters and leaves the group. */
export function RadioGroup(p: Props) {
  return (
    <fieldset class="radio-group">
      <legend>{p.legend}</legend>
      {p.options.map((o) => {
        const id = `${p.name}-${o.value}`;
        return (
          <div class="radio" key={o.value}>
            <input
              id={id}
              type="radio"
              name={p.name}
              value={o.value}
              checked={p.value === o.value}
              disabled={o.disabled === true}
              aria-describedby={o.hint !== undefined ? `${id}-hint` : undefined}
              onChange={() => {
                if (o.disabled !== true) p.onChange(o.value);
              }}
            />
            <label for={id}>
              {o.label}
              {o.hint !== undefined && (
                <span id={`${id}-hint`} class="radio-hint">
                  {' '}
                  {o.hint}
                </span>
              )}
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}
