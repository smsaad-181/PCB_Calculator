import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  KIND_LABEL,
  LAYER_KINDS,
  NOT_IN_LINK,
  STACKUP_INTRO,
  addLayer,
  copperNames,
  deriveView,
  exportDraft,
  importDraft,
  loadStored,
  moveLayer,
  removeLayer,
  saveStored,
  updateLayer,
  type CopperBy,
  type Draft,
  type DraftLayer,
  type StackupKind,
  type StackupScalars,
  type StorageLike,
} from './stackup.vm';
import { SelectField } from './SelectField';
import { TextField } from './TextField';

interface Props {
  readonly kind: StackupKind;
  /** Key under which the draft is kept in session storage (one per page). */
  readonly storageKey: string;
  /**
   * Called when "use the derived values" is switched, and whenever the derived values change while it is on.
   * `scalars` is null when the stackup is incomplete or cannot be derived: the page then clears the fields it fills,
   * so a stale value is never used.
   */
  readonly onUse: (use: boolean, scalars: StackupScalars | null) => void;
}

/** Session storage, or null when the browser blocks it. Touching it can throw, so it is read inside try/catch. */
function sessionStore(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function download(text: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stackup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

const SIZE_LABEL: Readonly<Record<StackupKind, string>> = { microstrip: 'h (dielectric height)', stripline: 'b (plane-to-plane spacing)' };

function LayerRow({ i, l, last, onChange, onMove, onRemove }: { i: number; l: DraftLayer; last: boolean; onChange: (p: Partial<DraftLayer>) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void }) {
  const n = `Layer ${String(i + 1)}`;
  const isCu = l.kind === 'copper';
  const isDi = l.kind === 'dielectric';
  return (
    <tr>
      <th scope="row">{String(i + 1)}</th>
      <td>
        <select aria-label={`${n} kind`} value={l.kind} onChange={(e) => onChange({ kind: (e.currentTarget as HTMLSelectElement).value as DraftLayer['kind'] })}>
          {LAYER_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input type="text" aria-label={`${n} name`} autoComplete="off" spellcheck={false} maxLength={100} value={l.name} onInput={(e) => onChange({ name: (e.currentTarget as HTMLInputElement).value })} />
      </td>
      <td>
        {isCu && (
          <select aria-label={`${n} copper given as`} value={l.copperBy} onChange={(e) => onChange({ copperBy: (e.currentTarget as HTMLSelectElement).value as CopperBy })}>
            <option value="thickness">Thickness</option>
            <option value="weight">Foil weight</option>
          </select>
        )}
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${n} ${isCu && l.copperBy === 'weight' ? 'foil weight, for example 1 oz' : 'thickness, for example 35 um'}`}
          autoComplete="off"
          spellcheck={false}
          maxLength={40}
          placeholder={isCu && l.copperBy === 'weight' ? '1 oz' : '35 um'}
          value={l.thickness}
          onInput={(e) => onChange({ thickness: (e.currentTarget as HTMLInputElement).value })}
        />
      </td>
      <td>
        {isDi ? (
          <input type="text" inputMode="decimal" aria-label={`${n} er (from your fabricator)`} autoComplete="off" spellcheck={false} maxLength={40} value={l.er} onInput={(e) => onChange({ er: (e.currentTarget as HTMLInputElement).value })} />
        ) : (
          <span class="muted">not used</span>
        )}
      </td>
      <td>
        {isDi ? (
          <input type="text" inputMode="decimal" aria-label={`${n} Df (optional)`} autoComplete="off" spellcheck={false} maxLength={40} value={l.df} onInput={(e) => onChange({ df: (e.currentTarget as HTMLInputElement).value })} />
        ) : (
          <span class="muted">not used</span>
        )}
      </td>
      <td>
        {isDi ? (
          <input type="text" aria-label={`${n} source of er and Df (required)`} autoComplete="off" spellcheck={false} maxLength={500} value={l.source} onInput={(e) => onChange({ source: (e.currentTarget as HTMLInputElement).value })} />
        ) : (
          <span class="muted">not used</span>
        )}
      </td>
      <td>
        <div class="element-actions">
          <button type="button" class="secondary" disabled={i === 0} aria-label={`Move ${n} up`} onClick={() => onMove(-1)}>
            Up
          </button>
          <button type="button" class="secondary" disabled={last} aria-label={`Move ${n} down`} onClick={() => onMove(1)}>
            Down
          </button>
          <button type="button" class="secondary" aria-label={`Remove ${n}`} onClick={onRemove}>
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}

/**
 * Optional stackup editor: an alternative way to fill the h or b, t and er fields. Everything is derived by the core
 * (src/core/stackup); nothing is pre-filled and er, Df and their sources are the user's own. The stackup stays in this
 * page's memory (and session storage when allowed), never in the link.
 */
export function StackupEditor({ kind, storageKey, onUse }: Props) {
  const [draft, setDraft] = useState<Draft>(() => loadStored(sessionStore(), storageKey));
  const [use, setUse] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<readonly string[]>([]);
  const [imported, setImported] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const view = useMemo(() => deriveView(draft, kind), [draft, kind]);
  const json = useMemo(() => exportDraft(draft), [draft]);
  const scalars = view.status === 'ok' ? view.scalars : null;
  const key = scalars === null ? 'none' : JSON.stringify(scalars);

  useEffect(() => {
    saveStored(sessionStore(), storageKey, draft);
  }, [draft]);
  useEffect(() => {
    onUse(use, use ? scalars : null);
  }, [use, key]);

  const set = (d: Draft): void => {
    setDraft(d);
    setImported(false);
  };
  const names = copperNames(draft);

  return (
    <details class="advanced stackup-editor" open={draft.layers.length > 0}>
      <summary>Stackup (optional): derive {kind === 'microstrip' ? 'h' : 'b'}, t and er from your layers</summary>
      <p class="help">{STACKUP_INTRO}</p>
      <p class="notice" id="stackup-not-in-link">
        <strong>Not in the link.</strong> {NOT_IN_LINK}
      </p>
      <TextField id="stk-name" label="Stackup name" text={draft.name} onText={(name) => set({ ...draft, name })} help="Shown in the geometry source note." maxLength={100} />
      <div class="table-wrap">
        <table class="stackup-table">
          <caption class="visually-hidden">Stackup layers from top to bottom. Every dielectric needs its own er and the source of that er.</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Kind</th>
              <th scope="col">Name</th>
              <th scope="col">Thickness or foil weight</th>
              <th scope="col">er</th>
              <th scope="col">Df</th>
              <th scope="col">Source of er and Df</th>
              <th scope="col">Order</th>
            </tr>
          </thead>
          <tbody>
            {draft.layers.map((l, i) => (
              <LayerRow
                key={i}
                i={i}
                l={l}
                last={i === draft.layers.length - 1}
                onChange={(p) => set(updateLayer(draft, i, p))}
                onMove={(dir) => set(moveLayer(draft, i, dir))}
                onRemove={() => set(removeLayer(draft, i))}
              />
            ))}
          </tbody>
        </table>
      </div>
      {draft.layers.length === 0 && <p class="muted">No layers yet. Add layers from the top of the board to the bottom.</p>}
      <div class="element-actions">
        {LAYER_KINDS.map((k) => (
          <button key={k} type="button" class="secondary" onClick={() => set(addLayer(draft, k))}>
            Add {KIND_LABEL[k].toLowerCase()}
          </button>
        ))}
      </div>
      <SelectField
        id="stk-signal"
        label="Signal layer"
        value={draft.signalLayer}
        options={names.map((n) => ({ value: n, label: n }))}
        onChange={(signalLayer) => set({ ...draft, signalLayer })}
        placeholderOption="Choose the copper layer that carries the signal"
        help={`The page takes ${SIZE_LABEL[kind]}, t and er from the layers around it.`}
      />

      <section aria-labelledby="stk-derived-h" aria-live="polite">
        <h3 id="stk-derived-h">Derived from the stackup</h3>
        {view.status === 'empty' && <p class="muted">Add layers to see the derived values.</p>}
        {view.status === 'no-signal' && <p class="muted">Choose the signal layer to see the derived values.</p>}
        {view.status === 'error' && (
          <div class="error-box" role="group" aria-label="Stackup problems">
            <p>
              <strong>The stackup is not complete. No values are derived:</strong>
            </p>
            <ul>
              {view.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {view.status === 'derive-error' && (
          <div class="error-box" role="group" aria-label="Stackup cannot be used">
            <p>
              <strong>This stackup cannot be used for a {kind} here:</strong> {view.message}
            </p>
          </div>
        )}
        {view.status === 'ok' && (
          <>
            <dl class="rows">
              {view.rows.map((r) => (
                <div class="row" key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>{r.text}</dd>
                </div>
              ))}
            </dl>
            {view.notes.map((n) => (
              <p key={n} class="muted">
                {n}
              </p>
            ))}
          </>
        )}
        <div class="field">
          <div class="radio">
            <input id="stk-use" type="checkbox" checked={use} onChange={(e) => setUse((e.currentTarget as HTMLInputElement).checked)} aria-describedby="stk-use-help" />
            <label for="stk-use">Use the derived values for the fields</label>
          </div>
          <p id="stk-use-help" class="help">
            While this is on, the geometry and er fields are filled from the stackup and cannot be edited by hand. If the stackup is incomplete they are cleared, so no stale value is used.
          </p>
        </div>
      </section>

      <section aria-labelledby="stk-export-h">
        <h3 id="stk-export-h">Export</h3>
        {json === undefined ? (
          <p class="muted">Complete the stackup to export it as JSON.</p>
        ) : (
          <>
            <div class="field">
              <label for="stk-json">Stackup JSON (select and copy)</label>
              <textarea id="stk-json" class="netclass-text" readOnly rows={10} value={json} aria-describedby="stk-json-help" />
              <p id="stk-json-help" class="help">
                Schema version 1, tagged user-entered and unverified, with every er source label. Nothing is sent anywhere.
              </p>
            </div>
            <button type="button" class="secondary" onClick={() => setDownloadFailed(!download(json))}>
              Download stackup.json
            </button>
            {downloadFailed && <p class="field-warning">The download was blocked; copy the text above instead.</p>}
          </>
        )}
      </section>

      <section aria-labelledby="stk-import-h">
        <h3 id="stk-import-h">Import</h3>
        <div class="field">
          <label for="stk-import">Paste stackup JSON</label>
          <textarea id="stk-import" class="netclass-text" rows={6} value={importText} spellcheck={false} onInput={(e) => setImportText((e.currentTarget as HTMLTextAreaElement).value)} aria-describedby="stk-import-help" />
          <p id="stk-import-help" class="help">
            Replaces the layers above. The text is checked by the same rules as typing: unknown fields, missing er or source, and unit slips are refused with the field named.
          </p>
        </div>
        <button
          type="button"
          class="secondary"
          onClick={() => {
            const r = importDraft(importText, draft.signalLayer);
            if (r.ok) {
              set(r.draft);
              setImportErrors([]);
              setImportText('');
              setImported(true);
            } else {
              setImportErrors(r.errors);
              setImported(false);
            }
          }}
        >
          Import
        </button>
        {imported && (
          <p class="echo" role="status">
            Imported. Choose the signal layer if it is not selected.
          </p>
        )}
        {importErrors.length > 0 && (
          <div class="error-box" role="group" aria-label="Import problems">
            <p>
              <strong>Not imported. Fix this and try again:</strong>
            </p>
            <ul>
              {importErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </details>
  );
}
