interface Props {
  readonly status: 'needs-input' | 'error';
  readonly items: readonly string[];
}

/** What blocks a result: either what is still missing or what to fix. Never a number. */
export function ResultStatus({ status, items }: Props) {
  if (status === 'error') {
    return (
      <div class="error-box" role="group" aria-label="Problems">
        <p>
          <strong>Cannot calculate. Fix this and the result will appear:</strong>
        </p>
        <ul>
          {items.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div class="needs">
      <p>
        <strong>No result yet.</strong>
      </p>
      <ul>
        {items.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
