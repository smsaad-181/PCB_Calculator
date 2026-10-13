import { describe, expect, it } from 'vitest';
import { DIM, fromUnit } from '../../core/units';
import { CALCULATOR_STATE_KEYS, RESERVED_STATE_KEYS } from '../../state/hash';
import { ledgerView, orderWarnings, parseField } from './view';

describe('parseField', () => {
  it('is empty for blank text', () => {
    expect(parseField('   ', DIM.LENGTH).status).toBe('empty');
  });
  it('echoes what was understood, in the requested unit', () => {
    const r = parseField('0.254 mm', DIM.LENGTH);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.echo).toBe('= 0.254 mm (length)');
    const um = parseField('1.4 mil', DIM.LENGTH, { length: 'um', temperature: 'C', area: 'mm2' });
    if (um.status === 'ok') expect(um.echo).toBe('= 35.6 µm (length)');
  });
  it('echoes copper weight', () => {
    const r = parseField('1 oz', DIM.AREAL_MASS);
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.echo).toBe('= 1 oz/ft² (copper weight)');
    expect(r.value.si).toBeCloseTo(fromUnit(1, 'oz/ft2').si, 12);
  });
  it('turns errors into text with the hint', () => {
    const r = parseField('35u', DIM.LENGTH);
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.message).toMatch(/Bare prefix/);
  });
  it('never returns a non-finite value', () => {
    for (const t of ['NaN', 'Infinity', '1e999 mm', '--1', '', '1 mm mm']) {
      const r = parseField(t, DIM.LENGTH);
      if (r.status === 'ok') expect(Number.isFinite(r.value.si)).toBe(true);
    }
  });
});

describe('ledgerView', () => {
  it('lists non-VERIFIED ids and the worst status', () => {
    const v = ledgerView(['S-006', 'S-009']);
    expect(v.unverifiedIds).toEqual(['S-009']);
    expect(v.worst).toBe('PAYWALLED-USER-MUST-VERIFY');
  });
  it('is clean only when everything is VERIFIED', () => {
    const v = ledgerView(['S-006', 'S-003d']);
    expect(v.unverifiedIds).toEqual([]);
    expect(v.worst).toBe('VERIFIED');
  });
  it('treats an unknown id as UNVERIFIED', () => {
    expect(ledgerView(['not-in-ledger']).unverifiedIds).toEqual(['not-in-ledger']);
  });
});

describe('orderWarnings', () => {
  it('sorts by severity, stable within a level, with icon and label', () => {
    const w = orderWarnings([
      { severity: 'info', message: 'i' },
      { severity: 'caution', message: 'c1' },
      { severity: 'critical', message: 'x' },
      { severity: 'caution', message: 'c2' },
    ]);
    expect(w.map((x) => x.message)).toEqual(['x', 'c1', 'c2', 'i']);
    expect(w[0]?.label).toBe('Critical');
    for (const x of w) expect(x.icon).not.toBe('');
  });
});

describe('orderWarnings with pinned codes', () => {
  it('puts a pinned code first, then the rest by severity', () => {
    const w = orderWarnings(
      [
        { severity: 'warning', message: 'w' },
        { severity: 'caution', message: 'pin', code: 'LEGACY' },
        { severity: 'critical', message: 'x' },
      ],
      ['LEGACY'],
    );
    expect(w.map((x) => x.message)).toEqual(['pin', 'x', 'w']);
  });
  it('does nothing special without pinned codes', () => {
    const w = orderWarnings([{ severity: 'caution', message: 'c', code: 'LEGACY' }, { severity: 'warning', message: 'w' }]);
    expect(w.map((x) => x.message)).toEqual(['w', 'c']);
  });
});

describe('local state keys', () => {
  it('never collide with reserved keys or the version key', () => {
    for (const keys of Object.values(CALCULATOR_STATE_KEYS)) {
      for (const k of Object.keys(keys)) {
        expect(Object.prototype.hasOwnProperty.call(RESERVED_STATE_KEYS, k)).toBe(false);
        expect(k).not.toBe('v');
      }
    }
  });
});

describe('ledgerView groups', () => {
  it('separates paywalled from conflicting sources', () => {
    const v = ledgerView(['S-001', 'S-010', 'S-003']);
    for (const g of v.groups) for (const id of g.ids) expect(v.entries.find((e) => e.id === id)?.status).toBe(g.status);
    expect(v.groups.flatMap((g) => g.ids).sort()).toEqual([...v.unverifiedIds].sort());
    expect(new Set(v.groups.map((g) => g.status)).size).toBe(v.groups.length);
  });
  it('has no groups when everything is verified', () => {
    expect(ledgerView([]).groups).toEqual([]);
  });
});
