import { describe, expect, it } from 'vitest';
import { LEDGER } from '../data/ledger';
import { AWG_FORMULA, awgDiameter } from './index';

/*
 * Calc-validator finding m-6. AWG_FORMULA metadata is rendered in the UI, so it must:
 *  - cite NBS Circular 31 / Handbook 100 as the source (ledger S-005), not an unread standard as the source
 *  - take the status from the ledger (VERIFIED), not from a stale comment
 *  - say the diameters are unrounded formula values, not ASTM B258 rounded nominal values
 *  - state why the range is -3..40 ("table range used by this app; formula valid beyond")
 * The metadata object may carry the notes in any string-valued fields; the test joins them.
 */
const awgSources = import.meta.glob('/src/core/units/awg.ts', { query: '?raw', import: 'default', eager: true });
const text = Object.values(AWG_FORMULA)
  .filter((v): v is string => typeof v === 'string')
  .join('\n');

describe('AWG_FORMULA metadata', () => {
  it('has ledgerId S-005 and the status of that row in the ledger (VERIFIED)', () => {
    expect(AWG_FORMULA.ledgerId).toBe('S-005');
    const row = LEDGER.find((r) => r.id === 'S-005');
    expect(row?.status).toBe('VERIFIED');
    expect(AWG_FORMULA.status).toBe(row?.status);
  });
  it('source cites NBS Circular 31 and Handbook 100', () => {
    expect(AWG_FORMULA.source).toMatch(/NBS/);
    expect(AWG_FORMULA.source).toMatch(/Circular 31/);
    expect(AWG_FORMULA.source).toMatch(/Handbook 100/);
  });
  it('does not present ASTM B258 as the source; if mentioned it is marked as not read', () => {
    expect(AWG_FORMULA.source.trim().startsWith('ASTM')).toBe(false);
    if (/B258/.test(AWG_FORMULA.source)) expect(AWG_FORMULA.source).toMatch(/B258[^;.]*not read/i);
  });
  it('states that diameters are unrounded formula values, not B258 rounded nominal values', () => {
    expect(text).toMatch(/unrounded/i);
    expect(text).toMatch(/formula value/i);
    expect(text).toMatch(/B258/);
    expect(text).toMatch(/rounded nominal/i);
  });
  it('keeps -3..40 and states the reason for the range end', () => {
    expect(AWG_FORMULA.minGauge).toBe(-3);
    expect(AWG_FORMULA.maxGauge).toBe(40);
    expect(text).toMatch(/table range used by this app/i);
    expect(text).toMatch(/formula valid beyond/i);
  });
  it('formula text matches the implementation (d(36) = 0.127 mm, d(-3) = 11.684 mm)', () => {
    expect(AWG_FORMULA.formula).toContain('0.127');
    expect(AWG_FORMULA.formula).toContain('92');
    expect(awgDiameter(36).si * 1e3).toBeCloseTo(0.127, 12);
    expect(awgDiameter(-3).si * 1e3).toBeCloseTo(11.684, 9);
  });
  it('awg.ts has no stale "UNVERIFIED" status comment', () => {
    const src = Object.values(awgSources)[0] as string | undefined;
    expect(src).toBeTypeOf('string');
    expect(src ?? '').not.toMatch(/UNVERIFIED/);
  });
});
