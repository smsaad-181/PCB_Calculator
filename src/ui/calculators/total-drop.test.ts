import { describe, expect, it } from 'vitest';
import { findTotalDrop, isTotalDropName, totalDropLabel } from './total-drop';
import { q } from '../../core/units';
import { DIM } from '../../core/units';

const r = (name: string) => ({ name, value: q(1, DIM.VOLTAGE), role: 'primary' as const, bound: 'prediction' as const });

describe('total drop name matching', () => {
  it('accepts both core names and nothing else', () => {
    expect(isTotalDropName('total voltage drop')).toBe(true);
    expect(isTotalDropName('total voltage drop (forward path only)')).toBe(true);
    expect(isTotalDropName('total voltage drop budget')).toBe(false);
    expect(isTotalDropName('voltage drop percent of source')).toBe(false);
  });
  it('finds the entry under either name and labels it', () => {
    expect(findTotalDrop([r('x'), r('total voltage drop (forward path only)')])?.name).toBe('total voltage drop (forward path only)');
    expect(findTotalDrop([r('total voltage drop')])?.name).toBe('total voltage drop');
    expect(findTotalDrop([r('x')])).toBeUndefined();
    expect(totalDropLabel('total voltage drop (forward path only)')).toBe('Total voltage drop (forward path only)');
  });
});
