import { describe, expect, it } from 'vitest';
import { HASH_SCHEMA_VERSION, MIGRATIONS, describeDiscard, migrateHashState, parseHash, type HashMigration } from './hash';

const v1to2: HashMigration = { from: 1, to: 2, migrate: (s) => ({ ...s, w: s['width'] ?? '', mig: '12' }) };
const v2to3: HashMigration = { from: 2, to: 3, migrate: (s) => ({ ...s, mig: `${s['mig'] ?? ''}3` }) };

describe('migrateHashState', () => {
  it('current version is 1 and the shipped registry is identity only', () => {
    expect(HASH_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS.every((m) => m.from === 1 && m.to === 1)).toBe(true);
    expect(migrateHashState(1, { a: '1' })).toEqual({ ok: true, state: { a: '1' }, version: 1 });
  });

  it('rejects unknown versions and non-integers', () => {
    for (const v of [0, 2, 99, -1, 1.5, NaN, Infinity]) {
      const r = migrateHashState(v, { a: '1' });
      expect(r.ok).toBe(false);
    }
  });

  it('chains migrations from an injected registry', () => {
    const r = migrateHashState(1, { width: '5' }, { registry: [v1to2, v2to3], target: 3 });
    expect(r).toEqual({ ok: true, state: { width: '5', w: '5', mig: '123' }, version: 3 });
  });

  it('fails when a step is missing', () => {
    const r = migrateHashState(1, {}, { registry: [v1to2], target: 3 });
    expect(r.ok).toBe(false);
  });

  it('fails (never throws) when a migration throws, and does not mutate input', () => {
    const boom: HashMigration = {
      from: 1,
      to: 2,
      migrate: () => {
        throw new Error('x');
      },
    };
    const input = { a: '1' };
    expect(migrateHashState(1, input, { registry: [boom], target: 2 }).ok).toBe(false);
    expect(input).toEqual({ a: '1' });
  });

  it('rejects cyclic or backwards registries', () => {
    const back: HashMigration = { from: 2, to: 1, migrate: (s) => s };
    expect(migrateHashState(2, {}, { registry: [back], target: 3 }).ok).toBe(false);
  });
});

describe('parseHash with migration', () => {
  it('migrates instead of discarding when a path exists', () => {
    const p = parseHash('#/calc/x?v=1&width=5', { registry: [v1to2], target: 2 });
    // v=1 is old relative to target 2: migrated.
    expect(p.stateDiscarded).toBe(false);
    expect(p.state['w']).toBe('5');
    expect(p.reason).toBeUndefined();
  });

  it('discards with reason "version" when no path exists', () => {
    const p = parseHash('#/calc/x?v=9&a=1');
    expect(p).toMatchObject({ stateDiscarded: true, reason: 'version', state: {} });
  });

  it('discards with reason "migration" when the migration throws', () => {
    const boom: HashMigration = {
      from: 1,
      to: 2,
      migrate: () => {
        throw new Error('x');
      },
    };
    const p = parseHash('#/calc/x?v=1&a=1', { registry: [boom], target: 2 });
    expect(p).toMatchObject({ stateDiscarded: true, reason: 'migration' });
    expect(describeDiscard(p)).toMatch(/migrat|older|version/i);
  });
});
