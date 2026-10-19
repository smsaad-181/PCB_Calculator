import { describe, expect, it } from 'vitest';
import { RESERVED_STATE_KEYS } from './hash';
import { CALCULATOR_STATE_KEYS } from './state-key-docs';
import { CALCULATOR_STATE_KEY_NAMES, stateKeyNames } from './state-keys';

describe('runtime state key names match the documented table', () => {
  it('has the same calculators and the same keys in the same order', () => {
    const documented = Object.fromEntries(Object.entries(CALCULATOR_STATE_KEYS).map(([id, keys]) => [id, Object.keys(keys)]));
    expect(CALCULATOR_STATE_KEY_NAMES).toEqual(documented);
  });
  it('never reuses a reserved key or v', () => {
    for (const names of Object.values(CALCULATOR_STATE_KEY_NAMES)) {
      for (const k of names) {
        expect(Object.prototype.hasOwnProperty.call(RESERVED_STATE_KEYS, k)).toBe(false);
        expect(k).not.toBe('v');
      }
    }
  });
  it('stateKeyNames returns a fresh copy and an empty list for an unknown id', () => {
    const a = stateKeyNames('rc-lc');
    a.push('zz');
    expect(stateKeyNames('rc-lc')).not.toContain('zz');
    expect(stateKeyNames('no-such-calculator')).toEqual([]);
  });
});
