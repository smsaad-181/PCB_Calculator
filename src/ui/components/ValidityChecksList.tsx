interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

interface Props {
  readonly checks: readonly Check[];
  /** Sentence added under a failed check, explaining what failing means for this calculator. */
  readonly failedHint: string;
  /** Optional per-check sentence that replaces `failedHint` for a failed check (matched by the check's name). */
  readonly hintFor?: (name: string) => string | undefined;
}

/**
 * Validity checks with the exact bound text from the calculator. Pass or fail is carried by a mark and by words,
 * never by colour alone. A failed check is a bordered block with its own heading line.
 */
export function ValidityChecksList({ checks, failedHint, hintFor }: Props) {
  if (checks.length === 0) return null;
  const failed = checks.filter((c) => !c.ok).length;
  return (
    <section class="validity" aria-labelledby="validity-h">
      <h3 id="validity-h">
        Validity checks{' '}
        <span class={failed > 0 ? 'validity-count bad' : 'validity-count'}>
          {failed > 0 ? `${String(failed)} failed` : 'all within range'}
        </span>
      </h3>
      <ul class="checks">
        {checks.map((c) => (
          <li key={c.name} class={c.ok ? 'check ok' : 'check fail'}>
            <p class="check-head">
              <span aria-hidden="true">{c.ok ? '✔ ' : '✖ '}</span>
              <strong>{c.ok ? 'Within range' : 'OUTSIDE RANGE'}:</strong> {c.name}
            </p>
            {!c.ok && <p class="check-hint">{hintFor?.(c.name) ?? failedHint}</p>}
            <p class="muted check-detail">{c.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
