import { describe, expect, it } from 'vitest';
import { LEDGER } from '../src/core/data/ledger';

const files = import.meta.glob('/docs/sources/LEDGER.md', { query: '?raw', import: 'default', eager: true });
const md = Object.values(files)[0] as string | undefined;

function parseRows(text: string): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!/^\|\s*S-\d/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim());
    // ['', id, item, value, where, status, '']
    const id = cells[1];
    const status = cells[cells.length - 2];
    if (id && status) rows.set(id, status);
  }
  return rows;
}

describe('ledger.ts mirrors docs/sources/LEDGER.md', () => {
  it('reads the markdown', () => {
    expect(md).toBeTypeOf('string');
  });
  const rows = parseRows(md ?? '');
  it('every markdown row is present in ledger.ts with the same status', () => {
    expect(rows.size).toBeGreaterThan(0);
    const mine = new Map(LEDGER.map((r) => [r.id, r.status] as const));
    expect([...mine.keys()].sort()).toEqual([...rows.keys()].sort());
    for (const [id, status] of rows) expect(mine.get(id), id).toBe(status);
  });
  it('ledger.ts has no duplicate ids', () => {
    expect(new Set(LEDGER.map((r) => r.id)).size).toBe(LEDGER.length);
  });
});
