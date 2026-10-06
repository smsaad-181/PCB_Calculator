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
  it('uses actionable wording and names the ledger id', () => {
    expect(badgeText('UNVERIFIED', ['S-001'])).toBe('Not independently verified — see source ledger S-001');
    expect(badgeText('CONFLICT', ['S-002'])).toBe('Sources disagree — see source ledger S-002');
    expect(badgeText('PAYWALLED-USER-MUST-VERIFY', ['S-003'])).toBe(
      'Not checked against the standard (paywalled): compare with your licensed copy — see source ledger S-003',
    );
  });
  it('falls back to a generic ledger reference and joins several ids', () => {
    expect(badgeText('UNVERIFIED', [])).toBe('Not independently verified — see the source ledger');
    expect(badgeText('UNVERIFIED', ['S-001', 'S-004'])).toContain('S-001, S-004');
  });
  it('never uses the old wording', () => {
    for (const s of ['UNVERIFIED', 'PAYWALLED-USER-MUST-VERIFY', 'CONFLICT'] as const) {
      expect(badgeText(s, ['S-001'])).not.toMatch(/you must verify|UNVERIFIED \(/);
    }
  });
});
