import { describe, expect, it } from 'vitest';
import { RESERVED_STATE_KEYS, parseHash, sanitizeReservedState, serializeHash } from './hash';

const route = { name: 'calc', id: 'x' } as const;

describe('reserved state keys', () => {
  it('exports the four documented keys', () => {
    expect(Object.keys(RESERVED_STATE_KEYS).sort()).toEqual(['fc', 'fp', 'mode', 'u']);
    for (const k of Object.keys(RESERVED_STATE_KEYS)) {
      expect(RESERVED_STATE_KEYS[k as keyof typeof RESERVED_STATE_KEYS].description.length).toBeGreaterThan(10);
    }
  });

  it('accepts known values and round-trips them', () => {
    const state = { mode: 'B', u: 'imperial', fc: '35', fp: 'generic-example', other: 'z' };
    const p = parseHash(serializeHash(route, state));
    expect(p.state).toEqual(state);
    expect(p.notes).toEqual([]);
  });

  it('drops unknown values with a note on parse, keeps other keys', () => {
    const p = parseHash('#/calc/x?v=1&mode=C&u=furlongs&fc=abc&fp=%3Cscript%3E&keep=1');
    expect(p.stateDiscarded).toBe(false);
    expect(p.state).toEqual({ keep: '1' });
    expect(p.notes).toHaveLength(4);
    for (const key of ['mode', 'u', 'fc', 'fp']) expect(p.notes.some((n) => n.includes(`"${key}"`))).toBe(true);
  });

  it('fc must be a plausible um-per-oz number', () => {
    expect(sanitizeReservedState({ fc: '34.3' }).state).toEqual({ fc: '34.3' });
    for (const bad of ['0', '-35', '3500', 'NaN', '', '35e0', '1e9']) {
      expect(sanitizeReservedState({ fc: bad }).state).toEqual({});
    }
  });

  it('serializeHash drops invalid reserved values', () => {
    const h = serializeHash(route, { mode: 'Z', a: '1' });
    expect(h).not.toContain('mode');
    expect(parseHash(h).state).toEqual({ a: '1' });
  });

  it('sanitizeReservedState does not mutate its input and ignores non-reserved keys', () => {
    const input = { mode: 'A', zz: 'whatever' };
    const r = sanitizeReservedState(input);
    expect(r.state).toEqual(input);
    expect(r.notes).toEqual([]);
  });
});
