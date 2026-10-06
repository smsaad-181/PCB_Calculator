import { describe, expect, it } from 'vitest';
import { parseHash, serializeHash, HASH_SCHEMA_VERSION } from './hash';

describe('hash', () => {
  it('routes', () => {
    expect(parseHash('').route).toEqual({ name: 'home' });
    expect(parseHash('#/').route).toEqual({ name: 'home' });
    expect(parseHash('#/about').route).toEqual({ name: 'about' });
    expect(parseHash('#/calc/trace-width').route).toEqual({ name: 'calc', id: 'trace-width' });
    expect(parseHash('#/nope/x').route.name).toBe('notfound');
    expect(parseHash('#/calc/').route.name).toBe('notfound');
    expect(parseHash('#/calc/%E0%A4%A').route.name).toBe('notfound');
    expect(parseHash('#/calc/../x').route.name).toBe('notfound');
  });
  it('round-trips state', () => {
    const route = { name: 'calc', id: 'x' } as const;
    const state = { i: '1.5', w: 'a b&c=d', unit: 'mm' };
    const h = serializeHash(route, state);
    expect(h.startsWith(`#/calc/x?v=${HASH_SCHEMA_VERSION}&`)).toBe(true);
    const p = parseHash(h);
    expect(p.route).toEqual(route);
    expect(p.state).toEqual(state);
    expect(p.stateDiscarded).toBe(false);
    expect(serializeHash(route, p.state)).toBe(h);
  });
  it('is stable regardless of key order', () => {
    const r = { name: 'calc', id: 'x' } as const;
    expect(serializeHash(r, { b: '1', a: '2' })).toBe(serializeHash(r, { a: '2', b: '1' }));
  });
  it('discards state on wrong or missing version', () => {
    expect(parseHash('#/calc/x?v=99&a=1')).toMatchObject({ state: {}, stateDiscarded: true });
    expect(parseHash('#/calc/x?a=1')).toMatchObject({ state: {}, stateDiscarded: true });
  });
  it('discards state on corrupt encoding, never throws', () => {
    expect(parseHash('#/calc/x?v=1&a=%E0%A4%A')).toMatchObject({ state: {}, stateDiscarded: true });
    for (const junk of ['#?', '#??&&==', '#/calc/x?=&=', '#%', '###', '#/calc/x?v=1&__proto__=1']) {
      expect(() => parseHash(junk)).not.toThrow();
    }
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
  it('non-calc routes carry no state', () => {
    expect(serializeHash({ name: 'about' }, { a: '1' })).toBe('#/about');
  });
});
