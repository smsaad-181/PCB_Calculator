import type { InputSource } from '../../core/result';
import type { ProvenanceRow } from './view';

const SOURCE_TEXT: Readonly<Record<InputSource, string>> = {
  user: 'entered by you',
  default: 'DEFAULT (assumed, not entered by you)',
  preset: 'PRESET (assumed, not entered by you)',
  'fab-profile': 'from a fab profile',
};

/** Where each input came from. Defaults and presets are marked in words and with an icon. */
export function InputsProvenance({ inputs }: { readonly inputs: readonly ProvenanceRow[] }) {
  if (inputs.length === 0) return null;
  return (
    <section aria-labelledby="inputs-h">
      <h3 id="inputs-h">Inputs and where they came from</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Input</th>
              <th scope="col">Value</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {inputs.map((i) => {
              const assumed = i.source === 'default' || i.source === 'preset';
              return (
                <tr key={`${i.label}:${i.value}`} class={assumed ? 'assumed' : undefined}>
                  <th scope="row">{i.label}</th>
                  <td>{i.value}</td>
                  <td>
                    {assumed && <span aria-hidden="true">{'⚑ '}</span>}
                    {SOURCE_TEXT[i.source]}
                    {i.detail !== undefined && <span class="muted"> ({i.detail})</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
