// View-model of the shared table-status panel: import messages in plain language. Pure. The only validator is the core importer
// (importSpacingTables via the store); nothing here can create or upgrade a VERIFIED table.
import { MAX_IMPORT_CHARS } from '../../core/spacing/tables';
import type { SpacingStore } from '../../state/spacing-store';
import { importProblems, importSuccessLines } from './spacing-common.vm';

export { MAX_IMPORT_CHARS };

export type PanelMessage =
  | { readonly kind: 'ok'; readonly title: string; readonly lines: readonly string[]; readonly note?: string }
  | { readonly kind: 'error'; readonly title: string; readonly lines: readonly string[]; readonly more: number };

export const PANEL_INTRO =
  'The app ships these eight tables EMPTY. The values must come from your licensed copies of IEC 60664-1 and IPC-2221, entered by a person who takes responsibility for them. Download the blank template, fill it in, then paste or load it below. Imported tables stay in this browser only (a local draft, never in the link) and can be removed with the Clear button.';
export const VERIFIED_NOTE =
  'This app cannot verify table values. A table shows VERIFIED only when the imported file itself names the person who verified it and records a checker on every value; the app passes that claim on and does not check it.';
export const EMPTY_IMPORT_MESSAGE = 'Nothing to import: paste the JSON text or load a file first.';

/** A file of more than four times the character cap cannot hold an importable text (UTF-8 uses at most four bytes per character). */
export function checkFileSize(bytes: number): string | undefined {
  return bytes > MAX_IMPORT_CHARS * 4 ? `That file is too large to import (the limit is ${String(MAX_IMPORT_CHARS)} characters).` : undefined;
}

export function importMessage(store: SpacingStore, text: string): PanelMessage {
  if (text.trim() === '') return { kind: 'error', title: 'Import refused', lines: [EMPTY_IMPORT_MESSAGE], more: 0 };
  const r = store.importText(text);
  if (!r.ok) {
    const p = importProblems(r.errors);
    return { kind: 'error', title: 'Import refused. Nothing was changed. Fix these problems and try again:', lines: p.shown, more: p.more };
  }
  return {
    kind: 'ok',
    title: 'Imported. These tables were read:',
    lines: importSuccessLines(r.imported),
    ...(r.saveNote !== undefined ? { note: r.saveNote } : {}),
  };
}
