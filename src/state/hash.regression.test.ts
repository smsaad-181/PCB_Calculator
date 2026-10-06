import { describe, expect, it } from 'vitest';
import { parseHash } from './hash';

function hashWithKeys(n: number): string {
  const parts = ['v=1'];
  for (let i = 0; i < n; i++) parts.push(`k${i}=a`);
  return `#/calc/trace-width?${parts.join('&')}`;
}

describe('m-5 hash size and key-count caps', () => {
  it('m-5 baseline: 60 keys and short hash is accepted', () => {
    const h = hashWithKeys(60);
    expect(h.length).toBeLessThan(8192);
    const r = parseHash(h);
    expect(r.stateDiscarded).toBe(false);
    expect(Object.keys(r.state)).toHaveLength(60);
  });

  it('m-5 hash longer than 8192 chars discards state, keeps route, does not throw', () => {
    const h = `#/calc/trace-width?v=1&a=${'x'.repeat(9000)}`;
    expect(h.length).toBeGreaterThan(8192);
    expect(() => parseHash(h)).not.toThrow();
    const r = parseHash(h);
    expect(r.stateDiscarded).toBe(true);
    expect(r.state).toEqual({});
    expect(r.route).toEqual({ name: 'calc', id: 'trace-width' });
  });

  it('m-5 more than 64 keys (even if short) discards state', () => {
    const h = hashWithKeys(70);
    expect(h.length).toBeLessThan(8192);
    const r = parseHash(h);
    expect(r.stateDiscarded).toBe(true);
    expect(r.state).toEqual({});
    expect(r.route).toEqual({ name: 'calc', id: 'trace-width' });
  });

  it('m-5 200k keys discards state quickly without throwing', () => {
    const h = hashWithKeys(200_000);
    const t0 = performance.now();
    const r = parseHash(h);
    expect(r.stateDiscarded).toBe(true);
    expect(r.state).toEqual({});
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it('m-5 route-only parsing of an oversized hash still works', () => {
    const r = parseHash(`#/about?v=1&a=${'x'.repeat(9000)}`);
    expect(r.route).toEqual({ name: 'about' });
    expect(r.state).toEqual({});
  });
});
