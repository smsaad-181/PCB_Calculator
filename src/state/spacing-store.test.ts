import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_CHARS, SHIPPED_TABLES, dataStateOf, serializeTableSet } from '../core/spacing/tables';
import { synthSet } from '../core/spacing/synthetic-tables.testutil';
import { STORAGE_KEY, browserStorage, createSpacingStore, getSpacingStore, type StoreStorage } from './spacing-store';

// Every table value in this file is the synthetic fake data of synthetic-tables.testutil.ts (never a standard value).
class Memory implements StoreStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}
const FAKE_BUNDLE = serializeTableSet(synthSet(['T2', 'T4']));

describe('spacing store', () => {
  it('starts with the shipped empty set and keeps imports in memory (not in any URL)', () => {
    const s = createSpacingStore(undefined);
    expect(s.get()).toBe(SHIPPED_TABLES);
    expect(s.note()).toBeUndefined();
    const r = s.importText(FAKE_BUNDLE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.saveNote).toMatch(/memory only/);
    expect(dataStateOf(s.get().tables.T2)).toBe('ENTERED_UNVERIFIED');
    expect(dataStateOf(s.get().tables.T1)).toBe('EMPTY');
  });

  it('notifies subscribers on import and clear, and unsubscribes', () => {
    const s = createSpacingStore(new Memory());
    let n = 0;
    const off = s.subscribe(() => {
      n += 1;
    });
    s.importText(FAKE_BUNDLE);
    s.clear();
    expect(n).toBe(2);
    off();
    s.importText(FAKE_BUNDLE);
    expect(n).toBe(2);
  });

  it('saves a draft and restores it through the validating importer', () => {
    const mem = new Memory();
    const a = createSpacingStore(mem);
    const r = a.importText(FAKE_BUNDLE);
    expect(r.ok && r.saveNote).toBeFalsy();
    expect(mem.getItem(STORAGE_KEY)).not.toBeNull();
    const b = createSpacingStore(mem);
    expect(dataStateOf(b.get().tables.T4)).toBe('ENTERED_UNVERIFIED');
    b.clear();
    expect(mem.getItem(STORAGE_KEY)).toBeNull();
    expect(b.get()).toBe(SHIPPED_TABLES);
  });

  it('a corrupt or tampered draft is discarded with a note, never half-loaded', () => {
    const mem = new Memory();
    mem.setItem(STORAGE_KEY, '{not json');
    const s = createSpacingStore(mem);
    expect(s.get()).toBe(SHIPPED_TABLES);
    expect(s.note()).toMatch(/not valid and was discarded/);
    expect(mem.getItem(STORAGE_KEY)).toBeNull();
  });

  it('a failed import changes nothing and returns plain errors', () => {
    const s = createSpacingStore(new Memory());
    const bad = s.importText('{"schema":"wrong"}');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.length).toBeGreaterThan(0);
    expect(s.get()).toBe(SHIPPED_TABLES);
    const big = s.importText('x'.repeat(MAX_IMPORT_CHARS + 1));
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.errors.join(' ')).toMatch(/too large/);
  });

  it('survives storage that throws (full, blocked)', () => {
    const throwing: StoreStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const s = createSpacingStore(throwing);
    expect(s.note()).toMatch(/would not let this page read/);
    const r = s.importText(FAKE_BUNDLE);
    expect(r.ok && r.saveNote).toMatch(/refused to save/);
    s.clear();
    expect(s.note()).toMatch(/could not be removed/);
    expect(s.get()).toBe(SHIPPED_TABLES);
  });

  it('survives a draft that cannot be removed after it was found invalid', () => {
    const bad: StoreStorage = { getItem: () => '{bad', setItem: () => undefined, removeItem: () => { throw new Error('x'); } };
    expect(createSpacingStore(bad).note()).toMatch(/discarded/);
  });

  it('passes the injected date to the importer (a future entry date is refused)', () => {
    const s = createSpacingStore(undefined, { today: '2020-01-01' });
    const r = s.importText(FAKE_BUNDLE);
    expect(r.ok).toBe(false);
  });

  it('browserStorage and the shared store are safe without a window (node)', () => {
    expect(browserStorage()).toBeUndefined();
    expect(getSpacingStore()).toBe(getSpacingStore('2026-01-01'));
  });
});
