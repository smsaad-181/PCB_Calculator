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

describe('dataStatusForLedgerIds { exclude } (foil CONFLICT is not a data-status input, D-2)', () => {
  it('FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE is exactly ["S-003"]', async () => {
    const c = await import('./data/constants');
    expect([...c.FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE]).toEqual(['S-003']);
  });
  it('not excluding S-003 yields CONFLICT; excluding it yields VERIFIED (real ledger)', () => {
    expect(dataStatusForLedgerIds(['S-003', 'S-006'])).toBe('CONFLICT');
    expect(dataStatusForLedgerIds(['S-003', 'S-006'], undefined, {})).toBe('CONFLICT');
    expect(dataStatusForLedgerIds(['S-003', 'S-006'], undefined, { exclude: [] })).toBe('CONFLICT');
    expect(dataStatusForLedgerIds(['S-003', 'S-006'], undefined, { exclude: ['S-003'] })).toBe('VERIFIED');
  });
  it('excluding only removes the named ids; other worse rows still count', () => {
    expect(dataStatusForLedgerIds(['S-003', 'S-006', 'S-001'], undefined, { exclude: ['S-003'] })).toBe('PAYWALLED');
  });
  it('works with an injected ledger', () => {
    const rows: readonly LedgerRow[] = [
      { id: 'T-1', item: 'a', edition: 'x', status: 'VERIFIED' },
      { id: 'T-2', item: 'b', edition: 'x', status: 'CONFLICT' },
    ];
    expect(dataStatusForLedgerIds(['T-1', 'T-2'], rows, { exclude: ['T-2'] })).toBe('VERIFIED');
  });
  it('excluding every id leaves nothing to rate and throws a typed error (never VERIFIED by default)', () => {
    expect(() => dataStatusForLedgerIds(['S-003'], undefined, { exclude: ['S-003'] })).toThrow(DataStatusError);
  });
  it('an unknown id still throws even when others are excluded', () => {
    expect(() => dataStatusForLedgerIds(['S-006', 'NOPE'], undefined, { exclude: ['S-003'] })).toThrow(DataStatusError);
  });
  it('does not mutate the id or exclude lists', () => {
    const ids = ['S-003', 'S-006'];
    const ex = ['S-003'];
    dataStatusForLedgerIds(ids, undefined, { exclude: ex });
    expect(ids).toEqual(['S-003', 'S-006']);
    expect(ex).toEqual(['S-003']);
  });
});
