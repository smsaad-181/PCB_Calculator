import { useEffect, useState } from 'preact/hooks';
import type { SpacingTableSet } from '../core/spacing/tables';
import { getSpacingStore, type SpacingStore } from '../state/spacing-store';
import { isoDayUtc } from './today';

/** The user's imported tables (empty shipped set until something is imported). Re-renders when an import or clear happens. */
export function useSpacingTables(): { readonly tables: SpacingTableSet; readonly store: SpacingStore } {
  const [store] = useState(() => getSpacingStore(isoDayUtc(new Date())));
  const [tables, setTables] = useState(() => store.get());
  useEffect(() => {
    setTables(store.get());
    return store.subscribe(() => setTables(store.get()));
  }, [store]);
  return { tables, store };
}
