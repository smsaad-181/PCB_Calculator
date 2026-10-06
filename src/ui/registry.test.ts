import { describe, expect, it } from 'vitest';
import { CATEGORIES, REGISTRY, calculatorsIn, findCalculator, type CalculatorEntry } from './registry';
import { badgeText } from './components/UnverifiedBadge';

describe('registry', () => {
  it('has no invented calculators in phase 0', () => {
    expect(REGISTRY).toHaveLength(0);
    expect(findCalculator('anything')).toBeUndefined();
  });
  it('has the four categories', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(['routing', 'trace', 'load', 'circuit']);
  });
  it('looks up injected entries', () => {
    const e: CalculatorEntry = { id: 't', title: 'T', category: 'trace', phase: 1, load: () => Promise.reject(new Error('x')) };
    expect(findCalculator('t', [e])).toBe(e);
    expect(calculatorsIn('trace', [e])).toEqual([e]);
    expect(calculatorsIn('load', [e])).toEqual([]);
  });
});

describe('badgeText', () => {
  it('is null for VERIFIED', () => expect(badgeText('VERIFIED', ['S-001'])).toBeNull());
  it('names the ledger id', () => {
    expect(badgeText('UNVERIFIED', ['S-001'])).toBe('UNVERIFIED data — see source ledger S-001');
    expect(badgeText('CONFLICT', ['S-002'])).toContain('S-002');
    expect(badgeText('PAYWALLED-USER-MUST-VERIFY', [])).toContain('UNVERIFIED');
  });
});
