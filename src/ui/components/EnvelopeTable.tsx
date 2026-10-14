export interface EnvelopeRow {
  readonly label: string;
  readonly min: string;
  readonly typ: string;
  readonly max: string;
  readonly note: string;
}

/** Minimum, typical and maximum as already-formatted text (the view-model prints them through format-result). */
export function EnvelopeTable({ env, id }: { readonly env: EnvelopeRow; readonly id: string }) {
  return (
    <section class="envelope" aria-labelledby={id}>
      <h3 id={id}>{env.label}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Minimum</th>
              <th scope="col">Typical</th>
              <th scope="col">Maximum</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{env.min}</td>
              <td>{env.typ}</td>
              <td>{env.max}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted">{env.note}</p>
    </section>
  );
}
