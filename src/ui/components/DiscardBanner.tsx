import { DISCARD_BANNER_TEXT, describeDiscard, type ParsedHash } from '../../state/hash';

interface Props {
  readonly parsed: Pick<ParsedHash, 'stateDiscarded' | 'reason' | 'notes'>;
  readonly onDismiss: () => void;
}

/** Never-silent notice for shared links whose settings could not be loaded (or were partly ignored). */
export function DiscardBanner({ parsed, onDismiss }: Props) {
  const reason = describeDiscard(parsed);
  if (reason === null && parsed.notes.length === 0) return null;
  return (
    <div class="banner" role="status">
      <div class="banner-body">
        {reason !== null && (
          <p>
            <strong>{DISCARD_BANNER_TEXT}</strong> {reason}
          </p>
        )}
        {parsed.notes.length > 0 && (
          <ul>
            {parsed.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss this message">
        Dismiss
      </button>
    </div>
  );
}
