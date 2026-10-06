import { describe, expect, expectTypeOf, it } from 'vitest';
import fc from 'fast-check';
import { WEIGHT_DATA_STATUS, type DataStatus } from './confidence';
import { LEDGER, type LedgerRow, type LedgerStatus } from './data/ledger';
import {
  DataStatusError,
  dataStatusForLedgerIds,
  dataStatusFromLedger,
  worstDataStatus,
} from './data-status';

const ALL: readonly LedgerStatus[] = ['VERIFIED', 'UNVERIFIED', 'PAYWALLED-USER-MUST-VERIFY', 'CONFLICT'];

describe('dataStatusFromLedger', () => {
  it('maps every ledger status', () => {
    expect(dataStatusFromLedger('VERIFIED')).toBe('VERIFIED');
    expect(dataStatusFromLedger('UNVERIFIED')).toBe('UNVERIFIED');
    expect(dataStatusFromLedger('PAYWALLED-USER-MUST-VERIFY')).toBe('PAYWALLED');
    expect(dataStatusFromLedger('CONFLICT')).toBe('CONFLICT');
  });

  it('always yields a key of the confidence weight table', () => {
    for (const s of ALL) {
      expect(Object.keys(WEIGHT_DATA_STATUS)).toContain(dataStatusFromLedger(s));
    }
  });

  it('is typed as DataStatus (compile-time)', () => {
    expectTypeOf(dataStatusFromLedger).parameter(0).toEqualTypeOf<LedgerStatus>();
    expectTypeOf(dataStatusFromLedger).returns.toEqualTypeOf<DataStatus>();
    expectTypeOf(worstDataStatus).returns.toEqualTypeOf<DataStatus>();
    expectTypeOf(dataStatusForLedgerIds).returns.toEqualTypeOf<DataStatus>();
  });

  it('rejects a status outside the union at run time', () => {
    expect(() => dataStatusFromLedger('BOGUS' as unknown as LedgerStatus)).toThrow(DataStatusError);
  });
});

describe('worstDataStatus', () => {
  it('single-element lists map directly', () => {
    for (const s of ALL) expect(worstDataStatus([s])).toBe(dataStatusFromLedger(s));
  });

  it('exhaustive pairs follow weight then severity order', () => {
    expect(worstDataStatus(['VERIFIED', 'UNVERIFIED'])).toBe('UNVERIFIED');
    expect(worstDataStatus(['UNVERIFIED', 'PAYWALLED-USER-MUST-VERIFY'])).toBe('PAYWALLED');
    expect(worstDataStatus(['PAYWALLED-USER-MUST-VERIFY', 'CONFLICT'])).toBe('CONFLICT');
    expect(worstDataStatus(['CONFLICT', 'PAYWALLED-USER-MUST-VERIFY'])).toBe('CONFLICT');
    expect(worstDataStatus(['VERIFIED', 'VERIFIED'])).toBe('VERIFIED');
    expect(worstDataStatus(['VERIFIED', 'CONFLICT', 'UNVERIFIED'])).toBe('CONFLICT');
  });

  it('throws a typed error on an empty list', () => {
    expect(() => worstDataStatus([])).toThrow(DataStatusError);
  });

  it('property: order independent', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...ALL), { minLength: 1, maxLength: 12 }), (xs) => {
        const reversed = [...xs].reverse();
        const sorted = [...xs].sort();
        const r = worstDataStatus(xs);
        expect(worstDataStatus(reversed)).toBe(r);
        expect(worstDataStatus(sorted)).toBe(r);
      }),
    );
  });

  it('property: never VERIFIED when any input is not VERIFIED, and never better than any input', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...ALL), { minLength: 1, maxLength: 12 }), (xs) => {
        const r = worstDataStatus(xs);
        if (xs.some((s) => s !== 'VERIFIED')) expect(r).not.toBe('VERIFIED');
        for (const s of xs) {
          expect(WEIGHT_DATA_STATUS[r]).toBeGreaterThanOrEqual(WEIGHT_DATA_STATUS[dataStatusFromLedger(s)]);
        }
      }),
    );
  });
});

describe('dataStatusForLedgerIds', () => {
  const rows: readonly LedgerRow[] = [
    { id: 'T-1', item: 'a', edition: 'x', status: 'VERIFIED' },
    { id: 'T-2', item: 'b', edition: 'x', status: 'UNVERIFIED' },
    { id: 'T-3', item: 'c', edition: 'x', status: 'PAYWALLED-USER-MUST-VERIFY' },
  ];

  it('looks ids up and returns the worst status', () => {
    expect(dataStatusForLedgerIds(['T-1'], rows)).toBe('VERIFIED');
    expect(dataStatusForLedgerIds(['T-1', 'T-2'], rows)).toBe('UNVERIFIED');
    expect(dataStatusForLedgerIds(['T-2', 'T-3', 'T-1'], rows)).toBe('PAYWALLED');
  });

  it('throws a typed error for an unknown id', () => {
    expect(() => dataStatusForLedgerIds(['T-1', 'NOPE'], rows)).toThrow(DataStatusError);
  });

  it('throws a typed error for an empty id list', () => {
    expect(() => dataStatusForLedgerIds([], rows)).toThrow(DataStatusError);
  });

  it('uses the real ledger by default', () => {
    expect(dataStatusForLedgerIds(['S-006'])).toBe('VERIFIED');
    expect(dataStatusForLedgerIds(['S-006', 'S-001'])).toBe('PAYWALLED');
    expect(dataStatusForLedgerIds(['S-003'])).toBe('CONFLICT');
    expect(LEDGER.length).toBeGreaterThan(0);
  });
});
