import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_PHRASES,
  auditDataTables,
  fixtureRoot,
  ledgerCovers,
  parseLedger,
  runAudit,
  scanForbiddenPhrases,
  validateTable,
} from '../tools/audit-lib.mjs';

const fx = (name: string): string => fixtureRoot(import.meta.url, name);
const matches = (s: string): boolean => new RegExp(FORBIDDEN_PHRASES.source, 'i').test(s);

describe('compliance phrase grep', () => {
  it('detects a forbidden phrase outside the gate', () => {
    const hits = scanForbiddenPhrases(fx('phrase-bad'));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ file: 'src/bad.ts', line: 1 });
  });
  it('allows the phrases in src/core/gate.ts and src/core/gate.test.ts only', () => {
    expect(scanForbiddenPhrases(fx('gate-ok'))).toEqual([]);
    expect(scanForbiddenPhrases(fx('gate-ok'), { allowed: [] }).map((h) => h.file).sort()).toEqual([
      'src/core/gate.test.ts',
      'src/core/gate.ts',
    ]);
  });
  it.each([
    'IPC compliant',
    'ipc-compliant',
    'IEC Compliant',
    'IEC-compliant',
    'IPC-2221 compliant',
    'IPC-2221B compliant',
    'IPC-2152-compliant',
    'IEC 60664-1 compliant',
    'Production-Safe',
    'production safe',
  ])('matches variant "%s"', (s) => {
    expect(matches(s)).toBe(true);
  });
  it.each([
    'Not assessed for compliance',
    'not compliant',
    'IPC-2221 non-compliant',
    'compliant with nothing',
    'safe for production use? unknown',
  ])('does not match "%s"', (s) => {
    expect(matches(s)).toBe(false);
  });
});

describe('data table audit', () => {
  it('fails when source is missing', () => {
    const r = auditDataTables(fx('data-missing-source'));
    expect(r.count).toBe(1);
    expect(r.errors.join('\n')).toContain('"source"');
  });
  it('passes a valid table', () => {
    expect(auditDataTables(fx('data-valid'))).toEqual({ count: 1, errors: [] });
  });
  it('requires bannerRequired for non-VERIFIED', () => {
    expect(auditDataTables(fx('data-unverified-nobanner')).errors.join()).toContain('bannerRequired');
  });
  it('requires profileDate and fabricator for fab profiles', () => {
    const msg = auditDataTables(fx('fab-missing')).errors.join('\n');
    expect(msg).toContain('profileDate');
    expect(msg).toContain('fabricator');
  });
  it('rejects VERIFIED with empty verifiedBy and bad status', () => {
    const base = { source: 's', edition: 'e', ledgerIds: ['S-001'], bannerRequired: false };
    expect(validateTable({ ...base, status: 'VERIFIED', verifiedBy: '' }, 'x.json').join()).toContain('verifiedBy');
    expect(validateTable({ ...base, status: 'VERIFIED', verifiedBy: 'A, 2026-01-01' }, 'x.json')).toEqual([]);
    expect(validateTable({ ...base, status: 'MAYBE', verifiedBy: '' }, 'x.json').join()).toContain('status');
  });
  it('reports zero tables for an empty tree', () => {
    expect(auditDataTables(fx('gate-ok')).count).toBe(0);
  });
});

describe('ledger audit', () => {
  const text = [
    '| ID | Item | Value | Where | Status |',
    '|---|---|---|---|---|',
    '| S-001 | a | b | c | UNVERIFIED |',
    '| S-020…S-028 | range | b | c | UNVERIFIED |',
  ].join('\n');
  it('parses ids and ranges', () => {
    const l = parseLedger(text);
    expect(l.errors).toEqual([]);
    expect(ledgerCovers(l, 'S-001')).toBe(true);
    expect(ledgerCovers(l, 'S-024')).toBe(true);
    expect(ledgerCovers(l, 'S-029')).toBe(false);
  });
  it('flags an invalid status', () => {
    expect(parseLedger('| S-001 | a | b | c | MAYBE |').errors.join()).toContain('MAYBE');
  });
  it('flags a src reference to an unknown ID but not a ranged one', () => {
    const r = runAudit(fx('ledger-ref-bad'), { ledgerText: text });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('S-999');
  });
});
