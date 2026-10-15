import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, q } from '../units';
import type { Quantity } from '../units';
import { compute as computeDrop } from './voltage-drop/calc';
import type { PathElement } from './voltage-drop/calc';
import { compute as computePath } from './path-load/calc';
import type { LoadElement } from './path-load/calc';
import { USER_SUPPLIED_REASON, userSuppliedDefault } from './circuit-shared';

// PCB-F1 / T5-1: voltage-drop and path-load share ONE rule for user-supplied resistances and ratings.
const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const A = (n: number): Quantity => q(n, DIM.CURRENT);
const R = (n: number): Quantity => q(n, DIM.RESISTANCE);

const dropEls: PathElement[] = [
  { kind: 'resistance', label: 'cable', resistance: R(0.03), sourceNote: 'guess' },
  { kind: 'resistance', label: 'connector', resistance: R(0.02), sourceNote: 'guess' },
];
const pathEls: LoadElement[] = [
  { kind: 'cable', label: 'cable', resistance: R(0.03), sourceNote: 'guess', ratedCurrent: A(5), ratingSource: 'guess' },
  { kind: 'connector', label: 'connector', resistance: R(0.02), sourceNote: 'guess', ratedCurrent: A(5), ratingSource: 'guess' },
];

describe('shared user-supplied confidence rule (T5-1)', () => {
  const common = { vsource: V(5), loadCurrent: A(3), returnPath: 'same-as-forward' as const };
  const d = computeDrop({ ...common, elements: dropEls });
  const p = computePath({ ...common, elements: pathEls });
  if (!d.ok || !p.ok) throw new Error('expected results');

  it('a path of only user-supplied values is never high in either calculator', () => {
    expect(d.value.confidence.level).not.toBe('high');
    expect(p.value.confidence.level).not.toBe('high');
    expect(d.value.confidence.score).toBeGreaterThanOrEqual(1);
  });
  it('both show the same visible reason text', () => {
    expect(d.value.confidence.reasons).toContain(USER_SUPPLIED_REASON);
    expect(p.value.confidence.reasons).toContain(USER_SUPPLIED_REASON);
  });
  it('both count the user-supplied values as one item (same reason sentence form)', () => {
    const line = (c: { reasons: string[] }): string | undefined => c.reasons.find((r) => r.startsWith('Defaulted assumptions used:'));
    expect(line(d.value.confidence)).toMatch(/user-supplied values taken as given and not checked against any source: cable resistance; connector resistance/);
    expect(line(p.value.confidence)).toMatch(/user-supplied values taken as given and not checked against any source: cable resistance; cable rating; connector resistance; connector rating/);
  });
  it('no user-supplied value, no reason', () => {
    const t = computeDrop({ ...common, elements: [{ kind: 'trace', label: 't', layer: 'outer', length: fromUnit(10, 'mm'), width: fromUnit(2, 'mm'), copperThickness: fromUnit(35, 'um'), copperBasis: 'finished', conductorTemperature: fromUnit(25, 'degC') }] });
    if (!t.ok) throw new Error('expected result');
    expect(t.value.confidence.reasons).not.toContain(USER_SUPPLIED_REASON);
  });
  it('helper: none gives undefined; duplicates collapse', () => {
    expect(userSuppliedDefault([])).toBeUndefined();
    expect(userSuppliedDefault(['a', 'a', 'b'])).toMatch(/: a; b$/);
  });
  it('same elements, same score contribution: resistances-only drop score equals path score minus unrated and basis effects', () => {
    // Both add exactly one +1 item; drop with the rule is 1 more than the same drop with no user-supplied item would be (0).
    expect(d.value.confidence.score).toBe(1);
  });
});
