import { downloadText } from '../download';
import { COMMON_HELP, EXAMPLE_FILE_NAME, FAKE_LABEL, TABLE_HELP, exampleJson } from './spacing-help';

/** Import help (lazy-loaded): the file format in plain language and a worked example whose numbers are all made up. */
export default function SpacingHelp() {
  const example = exampleJson();
  return (
    <div class="spacing-help">
      {COMMON_HELP.map((t) => (
        <p key={t} class="help">
          {t}
        </p>
      ))}
      <h4>Per table</h4>
      <dl>
        {TABLE_HELP.map((t) => (
          <div key={t.id}>
            <dt>{t.id}</dt>
            <dd class="help">{t.text}</dd>
          </div>
        ))}
      </dl>
      <h4>Worked example ({FAKE_LABEL})</h4>
      <pre class="example-json" tabIndex={0} aria-label={`Worked example, ${FAKE_LABEL}`}>
        {example}
      </pre>
      <button type="button" class="secondary" onClick={() => downloadText(example, EXAMPLE_FILE_NAME)}>
        Download worked example (fake)
      </button>
    </div>
  );
}
