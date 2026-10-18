import { describe, expect, it } from 'vitest';
import { VIA_RATING_POINTER_LABEL, VIA_RATING_POINTER_TEXT } from './components/via-rating-pointer';
import viaPage from './calculators/Via.tsx?raw';
import pathPage from './calculators/PathLoad.tsx?raw';

const files = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('via rating pointer (F3: pointer only, no number enters a computation)', () => {
  it('has the agreed wording and is labelled as not verified by this app', () => {
    expect(VIA_RATING_POINTER_LABEL).toBe('Not verified by this app');
    expect(VIA_RATING_POINTER_TEXT.startsWith('No via current rating is built in.')).toBe(true);
    expect(VIA_RATING_POINTER_TEXT).toMatch(/TI SLVA959B, Table 3-1 gives about 0\.84 A for a 12 mil via at a 10 C rise on 1 oz, IPC-2152 basis/);
    expect(VIA_RATING_POINTER_TEXT).toMatch(/not a ledger value and is not used in any calculation/);
  });
  it('is shown on the via page and on the path page', () => {
    expect(viaPage).toContain('<ViaRatingPointer />');
    expect(pathPage).toContain('<ViaRatingPointer />');
  });
  it('is imported only by the pointer component, and no view-model or page reads its text', () => {
    const users = Object.entries(files).filter(([, src]) => src.includes('via-rating-pointer')).map(([f]) => f);
    expect(users.sort()).toEqual(['./components/ViaRatingPointer.tsx']);
    expect(Object.values(files).filter((src) => src.includes('SLVA959B')).length).toBe(1);
  });
});

describe('stale or ambiguous wording is gone from the UI source', () => {
  it('no "future path calculator"', () => {
    for (const [f, src] of Object.entries(files)) expect(src, f).not.toMatch(/future path calculator/i);
  });
  it('no "Limiting element" wording (the voltage-drop page says Largest-drop element)', () => {
    for (const [f, src] of Object.entries(files)) expect(src, f).not.toMatch(/Limiting element|Limiting \(largest drop\)/);
  });
  it('the old bound label is not used for the annular ring headline', () => {
    const vm = files['./calculators/annular-ring.vm.ts'] ?? '';
    expect(vm).toContain('Rounded down (a minimum guarantee)');
  });
});
