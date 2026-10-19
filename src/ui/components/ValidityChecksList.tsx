interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  /** Information, not a pass/fail test: shown without a pass mark and never counted as failed. */
  readonly informational?: boolean;
  /** A condition that could not be checked (it needs the user's copy of a standard): shown as "not checked", never as a failure. */
  readonly notChecked?: boolean;
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
 * never by colour alone. A failed check is a bordered block with its own heading line. An informational entry has no
 * pass mark at all (an estimate against your own number is not a pass) and is not counted as failed.
 */
export function ValidityChecksList({ checks, failedHint, hintFor }: Props) {
  if (checks.length === 0) return null;
  const failed = checks.filter((c) => c.informational !== true && c.notChecked !== true && !c.ok).length;
  const unchecked = checks.filter((c) => c.notChecked === true).length;
  return (
    <section class="validity" aria-labelledby="validity-h">
      <h3 id="validity-h">
        Validity checks{' '}
        <span class={failed > 0 ? 'validity-count bad' : 'validity-count'}>
          {failed > 0 ? `${String(failed)} failed` : 'all within range'}
        </span>
        {unchecked > 0 && <span class="validity-count"> {String(unchecked)} not checked</span>}
      </h3>
      <ul class="checks">
        {checks.map((c) =>
          c.notChecked === true ? (
            <li key={c.name} class="check info">
              <p class="check-head">
                <span aria-hidden="true">{'ℹ '}</span>
                <strong>Not checked, needs your copy of the standard:</strong> {c.name}
              </p>
              <p class="muted check-detail">{c.detail}</p>
            </li>
          ) : c.informational === true ? (
            <li key={c.name} class="check info">
              <p class="check-head">
                <span aria-hidden="true">{'ℹ '}</span>
                <strong>Informational (an estimate, not a test):</strong> {c.name}
              </p>
              <p class="muted check-detail">{c.detail}</p>
            </li>
          ) : (
            <li key={c.name} class={c.ok ? 'check ok' : 'check fail'}>
              <p class="check-head">
                <span aria-hidden="true">{c.ok ? '✔ ' : '✖ '}</span>
                <strong>{c.ok ? 'Within range' : 'OUTSIDE RANGE'}:</strong> {c.name}
              </p>
              {!c.ok && <p class="check-hint">{hintFor?.(c.name) ?? failedHint}</p>}
              <p class="muted check-detail">{c.detail}</p>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
