import { describe, expect, it } from 'vitest';
import { InvalidValueError } from './errors';
import { formatQuantity } from './format';
import { DIM } from './dim';
import { q } from './quantity';

describe('m-3 formatQuantity rejects invalid sig with InvalidValueError', () => {
  const x = q(0.0015, DIM.LENGTH);
  for (const sig of [Number.NaN, 0, -1, 2.5, 18, 21, 100, Infinity, -Infinity]) {
    it(`m-3 sig=${sig} throws InvalidValueError (not RangeError)`, () => {
      expect(() => formatQuantity(x, { sig })).toThrow(InvalidValueError);
    });
    it(`m-3 sig=${sig} throws InvalidValueError with explicit unit`, () => {
      expect(() => formatQuantity(x, { sig, unit: 'mm' })).toThrow(InvalidValueError);
    });
  }
  it('m-3 valid sig 1 and 17 still work', () => {
    expect(() => formatQuantity(x, { sig: 1 })).not.toThrow();
    expect(() => formatQuantity(x, { sig: 17 })).not.toThrow();
  });
});
