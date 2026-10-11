interface Props {
  readonly notices: readonly string[];
  readonly onDismiss: () => void;
}

/** Shown when a shared link loaded but some of its settings were not recognised and defaults replaced them. */
export function NoticeBanner({ notices, onDismiss }: Props) {
  if (notices.length === 0) return null;
  return (
    <div class="banner" role="status">
      <div class="banner-body">
        <p>
          <strong>This link loaded, but these settings were not recognised and defaults are used instead.</strong> Results may differ from the sender&rsquo;s.
        </p>
        <ul>
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss this message">
        Dismiss
      </button>
    </div>
  );
}
