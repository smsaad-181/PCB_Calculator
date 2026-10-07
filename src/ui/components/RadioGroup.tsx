import type { Option } from './SelectField';

interface Props {
  readonly name: string;
  readonly legend: string;
  readonly value: string;
  readonly options: readonly Option[];
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
            <input id={id} type="radio" name={p.name} value={o.value} checked={p.value === o.value} onChange={() => p.onChange(o.value)} />
            <label for={id}>{o.label}</label>
          </div>
        );
      })}
    </fieldset>
  );
}
