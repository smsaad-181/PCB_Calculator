import { useState } from 'preact/hooks';
import {
  IMPORT_ANCHOR_ID,
  TABLES_PANEL_ID,
  TEMPLATE_FILE_NAME,
  loadedEditions,
  tableStatusRows,
  templateJson,
} from '../calculators/spacing-common.vm';
import { MAX_IMPORT_CHARS, PANEL_INTRO, VERIFIED_NOTE, checkFileSize, importMessage, type PanelMessage } from '../calculators/spacing-panel.vm';
import { useSpacingTables } from '../useSpacingTables';

/** Shared by the three spacing pages. Shows T1 to T8 status and the import box; it can never produce a VERIFIED table. */
export function SpacingTablePanel() {
  const { tables, store } = useSpacingTables();
  const [text, setText] = useState('');
  const [message, setMessage] = useState<PanelMessage | undefined>(undefined);
  const rows = tableStatusRows(tables);
  const editions = loadedEditions(tables);
  const note = store.note();

  const download = (): void => {
    const url = URL.createObjectURL(new Blob([templateJson()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = TEMPLATE_FILE_NAME;
    a.click();
    URL.revokeObjectURL(url);
  };
  const onFile = (e: Event): void => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;
    const tooBig = checkFileSize(file.size);
    if (tooBig !== undefined) {
      setMessage({ kind: 'error', title: 'File not loaded', lines: [tooBig], more: 0 });
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText(typeof reader.result === 'string' ? reader.result : '');
      setMessage(undefined);
    };
    reader.onerror = () => setMessage({ kind: 'error', title: 'File not loaded', lines: ['The file could not be read.'], more: 0 });
    reader.readAsText(file);
    input.value = '';
  };

  return (
    <section class="panel spacing-tables" id={TABLES_PANEL_ID} aria-labelledby="spacing-tables-h">
      <h2 id="spacing-tables-h">Safety tables T1 to T8 (data status)</h2>
      <p class="muted">{PANEL_INTRO}</p>
      <div class="table-scroll">
        <table class="status-table">
          <caption class="visually-hidden">Data state of each safety table</caption>
          <thead>
            <tr>
              <th scope="col">Table</th>
              <th scope="col">Data state</th>
              <th scope="col">Edition</th>
              <th scope="col">Entered by</th>
              <th scope="col">Verified by</th>
              <th scope="col">Records</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  {r.id} <span class="muted">{r.name.replace(/^T\d /, '')} ({r.standard})</span>
                </th>
                <td>
                  <span class={`state-pill state-${r.state.toLowerCase()}`}>{r.state}</span>
                  <span class="visually-hidden"> {r.stateText}</span>
                </td>
                <td>{r.edition}</td>
                <td>{r.enteredBy}</td>
                <td>{r.verifiedBy}</td>
                <td>{r.records}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="help">{VERIFIED_NOTE}</p>
      {editions.length > 0 && <p class="help">Editions in the loaded tables (type the matching text in the edition field): {editions.join('; ')}.</p>}
      {note !== undefined && (
        <p class="field-warning" role="status">
          {note}
        </p>
      )}

      <h3>Import tables</h3>
      <div class="field">
        <label for={IMPORT_ANCHOR_ID}>
          Table JSON (one table or a bundle) <span class="unit">(at most {String(MAX_IMPORT_CHARS)} characters)</span>
        </label>
        <textarea
          id={IMPORT_ANCHOR_ID}
          rows={8}
          maxLength={MAX_IMPORT_CHARS}
          spellcheck={false}
          autoComplete="off"
          value={text}
          aria-describedby="spacing-import-help"
          onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
        />
        <p id="spacing-import-help" class="help">
          Paste the JSON here, or load a file below (it is read in this browser, nothing is sent anywhere). Then press Import tables.
        </p>
      </div>
      <div class="field">
        <label for="spacing-file">Load a JSON file into the box</label>
        <input id="spacing-file" type="file" accept=".json,application/json" onChange={onFile} />
      </div>
      <div class="button-row">
        <button type="button" onClick={() => setMessage(importMessage(store, text))}>
          Import tables
        </button>
        <button type="button" class="secondary" onClick={download}>
          Download blank template
        </button>
        <button
          type="button"
          class="secondary"
          onClick={() => {
            store.clear();
            setMessage({ kind: 'ok', title: 'Imported tables cleared. All tables are empty again.', lines: [] });
          }}
        >
          Clear imported tables
        </button>
      </div>
      <div class="visually-hidden" role="status" aria-live="polite">
        {message?.kind === 'ok' ? message.title : ''}
      </div>
      {message?.kind === 'error' && (
        <div class="error-box" role="alert">
          <p>
            <strong>{message.title}</strong>
          </p>
          <ul>
            {message.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {message.more > 0 && <p>And {String(message.more)} more problems.</p>}
        </div>
      )}
      {message?.kind === 'ok' && (
        <div class="ok-box">
          <p>
            <strong>{message.title}</strong>
          </p>
          <ul>
            {message.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {message.note !== undefined && <p class="field-warning">{message.note}</p>}
        </div>
      )}
    </section>
  );
}
