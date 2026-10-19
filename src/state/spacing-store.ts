// In-browser holder of the user's imported safety tables (T1 to T8). No DOM or window access here: storage and the clock are injected,
// so the store is deterministic and testable. Imported tables are NEVER written into the URL hash (they are large and licensed data).
// The only validator is the core importer; this module cannot create a VERIFIED table (the core derives that state from a signed file).
import { MAX_IMPORT_CHARS, SHIPPED_TABLES, importSpacingTables, serializeTableSet } from '../core/spacing/tables';
import type { ImportOutcome, SpacingTableSet } from '../core/spacing/tables';

export const STORAGE_KEY = 'pcb-calc/spacing-tables-draft@1';

/** The part of Web Storage the store uses. */
export interface StoreStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ImportReport =
  | { readonly ok: true; readonly imported: ImportOutcome['imported']; readonly saveNote?: string }
  | { readonly ok: false; readonly errors: readonly string[] };

export interface SpacingStore {
  get(): SpacingTableSet;
  /** A plain-language note about the stored draft (for example that it could not be saved), or undefined. */
  note(): string | undefined;
  subscribe(fn: () => void): () => void;
  importText(text: string): ImportReport;
  /** Back to the shipped (empty) tables; the saved draft is removed. */
  clear(): void;
}

export interface StoreOptions {
  /** YYYY-MM-DD handed to the importer so that future dates are refused. */
  readonly today?: string;
}

export function createSpacingStore(storage: StoreStorage | undefined, opts: StoreOptions = {}): SpacingStore {
  let current: SpacingTableSet = SHIPPED_TABLES;
  let note: string | undefined;
  const listeners = new Set<() => void>();
  const importOpts = (base?: SpacingTableSet) => ({ ...(opts.today !== undefined ? { today: opts.today } : {}), ...(base !== undefined ? { base } : {}) });
  const emit = (): void => {
    for (const fn of [...listeners]) fn();
  };

  if (storage !== undefined) {
    let draft: string | null = null;
    try {
      draft = storage.getItem(STORAGE_KEY);
    } catch {
      note = 'The browser would not let this page read its saved table draft.';
    }
    if (draft !== null) {
      const r = importSpacingTables(draft, importOpts());
      if (r.ok) current = r.value.tables;
      else {
        note = 'A saved table draft in this browser was not valid and was discarded.';
        try {
          storage.removeItem(STORAGE_KEY);
        } catch {
          /* nothing more can be done */
        }
      }
    }
  }

  function persist(): string | undefined {
    if (storage === undefined) return 'Imported tables are kept in memory only (no browser storage is available); they are lost when the page is closed.';
    const text = serializeTableSet(current);
    if (text.length > MAX_IMPORT_CHARS) return `The tables are too large to save as a draft in this browser (more than ${String(MAX_IMPORT_CHARS)} characters); they are kept in memory only.`;
    try {
      storage.setItem(STORAGE_KEY, text);
    } catch {
      return 'The browser refused to save the tables (storage full or blocked); they are kept in memory only.';
    }
    return undefined;
  }

  return {
    get: () => current,
    note: () => note,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    importText(text) {
      const r = importSpacingTables(text, importOpts(current));
      if (!r.ok) return { ok: false, errors: r.error };
      current = r.value.tables;
      const saveNote = persist();
      note = saveNote;
      emit();
      return { ok: true, imported: r.value.imported, ...(saveNote !== undefined ? { saveNote } : {}) };
    },
    clear() {
      current = SHIPPED_TABLES;
      note = undefined;
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        note = 'The saved draft could not be removed from this browser storage.';
      }
      emit();
    },
  };
}

/** The browser's localStorage when it is usable, else undefined (private mode, blocked, or no window). Only the UI calls this. */
export function browserStorage(): StoreStorage | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    const s = window.localStorage;
    return s;
  } catch {
    return undefined;
  }
}

let shared: SpacingStore | undefined;
/** The one store of the running page, created on first use. */
export function getSpacingStore(today?: string): SpacingStore {
  shared ??= createSpacingStore(browserStorage(), today !== undefined ? { today } : {});
  return shared;
}
