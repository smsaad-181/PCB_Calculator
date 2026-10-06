import { describe, expect, it } from 'vitest';
import { DISCARD_BANNER_TEXT, describeDiscard, parseHash } from './hash';

const many = (n: number) => `#/calc/x?v=1&${Array.from({ length: n }, (_, i) => `k${i}=a`).join('&')}`;

describe('parseHash discard reasons', () => {
  it('reports version for wrong or missing version', () => {
    expect(parseHash('#/calc/x?v=9&a=1').reason).toBe('version');
    expect(parseHash('#/calc/x?a=1').reason).toBe('version');
    expect(parseHash('#/calc/x?v=abc&a=1').reason).toBe('version');
  });
  it('reports too-long', () => {
    expect(parseHash(`#/calc/x?v=1&a=${'x'.repeat(9000)}`).reason).toBe('too-long');
  });
  it('reports too-many-keys', () => {
    expect(parseHash(many(70)).reason).toBe('too-many-keys');
  });
  it('reports corrupt', () => {
    expect(parseHash('#/calc/x?v=1&a=%E0%A4%A').reason).toBe('corrupt');
  });
  it('has no reason and empty notes on success and on stateless hashes', () => {
    for (const h of ['#/calc/x?v=1&a=1', '#/calc/x', '#/about', '']) {
      const p = parseHash(h);
      expect(p.stateDiscarded).toBe(false);
      expect(p.reason).toBeUndefined();
      expect(p.notes).toEqual([]);
    }
  });
});

describe('describeDiscard', () => {
  it('is null when nothing was discarded', () => {
    expect(describeDiscard(parseHash('#/calc/x?v=1&a=1'))).toBeNull();
  });
  it('gives a distinct, specific reason for each cause', () => {
    const texts = [
      describeDiscard(parseHash('#/calc/x?v=9&a=1')),
      describeDiscard(parseHash(`#/calc/x?v=1&a=${'x'.repeat(9000)}`)),
      describeDiscard(parseHash(many(70))),
      describeDiscard(parseHash('#/calc/x?v=1&a=%E0%A4%A')),
    ];
    for (const t of texts) expect(typeof t).toBe('string');
    expect(new Set(texts).size).toBe(4);
    expect(texts[0]).toMatch(/version/i);
    expect(texts[1]).toMatch(/too long/i);
    expect(texts[2]).toMatch(/too many/i);
    expect(texts[3]).toMatch(/corrupt|damaged|encoding/i);
  });
  it('banner text is the fixed sentence', () => {
    expect(DISCARD_BANNER_TEXT).toBe('Could not load the shared settings from this link; showing defaults.');
  });
});
