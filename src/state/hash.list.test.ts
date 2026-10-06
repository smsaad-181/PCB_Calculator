import { describe, expect, it } from 'vitest';
import { MAX_HASH_LENGTH, MAX_STATE_KEYS, decodeList, encodeList, parseHash, serializeHash } from './hash';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ALPHABET = ['a', 'Z', '0', '~', '%', '&', '=', '?', '#', ' ', '/', ',', '+', 'é', '漢', '😀', '\n'];

describe('encodeList / decodeList', () => {
  it('round-trips edge cases', () => {
    const cases: string[][] = [
      [],
      [''],
      ['', ''],
      ['a'],
      ['a', 'b', 'c'],
      ['~'],
      ['~~', '~'],
      ['%7E', '%', '%%'],
      ['a&b=c?d#e'],
      ['é', '漢字', '😀'],
      ['', 'x', ''],
    ];
    for (const c of cases) expect(decodeList(encodeList(c))).toEqual(c);
  });

  it('distinguishes the empty list from a list holding one empty string', () => {
    expect(encodeList([])).toBe('');
    expect(encodeList([''])).not.toBe('');
    expect(decodeList('')).toEqual([]);
  });

  it('never emits a raw delimiter inside a value', () => {
    const enc = encodeList(['a~b', 'c']);
    expect(enc.split('~')).toHaveLength(3); // two terminators + trailing empty
    expect(enc).toContain('%7E');
  });

  it('is URL-safe: output survives hash serialize/parse unchanged', () => {
    const values = ['a~b', '', 'x y', '100%', '😀'];
    const route = { name: 'calc', id: 'path-load' } as const;
    const p = parseHash(serializeHash(route, { segs: encodeList(values) }));
    expect(p.stateDiscarded).toBe(false);
    expect(decodeList(p.state['segs'] ?? '')).toEqual(values);
  });

  it('round-trips random strings (property)', () => {
    const r = rng(12345);
    for (let n = 0; n < 500; n++) {
      const count = Math.floor(r() * 8);
      const values: string[] = [];
      for (let i = 0; i < count; i++) {
        let s = '';
        const len = Math.floor(r() * 6);
        for (let j = 0; j < len; j++) s += ALPHABET[Math.floor(r() * ALPHABET.length)] ?? '';
        values.push(s);
      }
      expect(decodeList(encodeList(values))).toEqual(values);
    }
  });

  it('does not throw on lone surrogates when encoding', () => {
    expect(() => encodeList(['\uD800', 'a\uDC00'])).not.toThrow();
  });

  it('50-segment path/load example fits in one key and the hash limits', () => {
    const segs = Array.from({ length: 50 }, (_, i) => `${(0.2 + i * 0.05).toFixed(2)}mm:${(1 + i * 0.1).toFixed(1)}A:${10 + i}mm`);
    const enc = encodeList(segs);
    // 50 segments, each followed by one '~'; ':' is escaped to %3A (2 extra chars each, two per segment).
    const expected = segs.reduce((n, s) => n + s.length + 4 + 1, 0);
    expect(enc.length).toBe(expected);
    const h = serializeHash({ name: 'calc', id: 'path-load' }, { segs: enc, mode: 'A' });
    expect(h.length).toBeLessThan(MAX_HASH_LENGTH);
    expect(1 + 2).toBeLessThan(MAX_STATE_KEYS);
    const p = parseHash(h);
    expect(p.stateDiscarded).toBe(false);
    expect(decodeList(p.state['segs'] ?? '')).toEqual(segs);
  });

  it('decodeList never throws on garbage', () => {
    const r = rng(777);
    const junk = ['%', '%E0%A4%A', '~~~', '%zz~%', '\uD800', '%7E%7e~', '~'.repeat(10_000), '%'.repeat(1001)];
    for (const j of junk) expect(() => decodeList(j)).not.toThrow();
    for (let n = 0; n < 300; n++) {
      let s = '';
      for (let j = 0; j < 20; j++) s += ALPHABET[Math.floor(r() * ALPHABET.length)] ?? '';
      expect(Array.isArray(decodeList(s))).toBe(true);
    }
    expect(decodeList(undefined as unknown as string)).toEqual([]);
  });

  it('decodeList keeps an undecodable segment as raw text rather than dropping it', () => {
    expect(decodeList('a~%E0%A4%A~')).toEqual(['a', '%E0%A4%A']);
  });
});
