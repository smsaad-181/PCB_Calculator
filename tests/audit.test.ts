import { describe, expect, it } from 'vitest';
import {
  detectForbidden,
  auditDataTables,
  fixtureRoot,
  ledgerCovers,
  parseLedger,
  runAudit,
  scanForbiddenPhrases,
  validateTable,
} from '../tools/audit-lib.mjs';

const fx = (name: string): string => fixtureRoot(import.meta.url, name);
const matches = (s: string): boolean => detectForbidden(s).length > 0;

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
  // m-4: wording variants and template-built strings (the template literals are written as plain
  // strings here; the detector sees the source text of other files, where they appear verbatim).
  it.each([
    'compliant with IPC-2221',
    'Compliant with IPC-2221B',
    'complies with IEC 60664-1',
    'Complies with IPC-2152',
    'conforms to IPC-2221',
    'conforms to IEC 60664-1',
    'meets IPC-2152',
    'Meets IPC-2221 requirements',
    'IPC certified',
    'IPC-certified',
    'certified to IEC 60664-1',
    'Certified to IPC-6012',
    'fab-ready',
    'Fab ready',
    'fab ready output',
    'label = `${std} compliant`',
    'return `${standard} compliant (per data)`',
    'const s = `${std}-compliant`',
    '`${standard} Compliant`',
  ])('matches wording variant "%s"', (s) => {
    expect(matches(s)).toBe(true);
  });
  it.each([
    'Not assessed for compliance',
    'Not assessed for compliance — mandatory inputs not provided: width',
    'does not certify compliance',
    'This tool does not certify compliance with any standard.',
    'Estimates only. Not a compliance certification. Verify IPC/IEC values against the licensed standard.',
    'not compliant',
    'non-compliant',
    'IPC-2221 non-compliant',
    'safe for production use? unknown',
    'fabrication ready? ask your fab',
    'the meeting minutes',
    'conformal coating',
    'Not assessed for compliance',
    'non-compliant',
    'not compliant with anything',
    'compliance is not assessed',
    'This tool does not certify designs',
    'IPC-2221 legacy formula (not a compliance claim)',
    'IPC-2221 does not comply with itself',
    'never guaranteed',
    'IPC-2221 does not meet nothing',
    'no fab-ready claim',
  ])('does not match "%s"', (s) => {
    expect(matches(s)).toBe(false);
  });
  // m-C: rule-based detector (R1 claim words, R2 readiness words, R3 IPC/IEC + verb, R4 templates).
  it.each([
    'IPC-2221 Class 2 compliant',
    'IEC60664 compliant',
    'in compliance with IPC-2221',
    'production-ready',
    'production ready',
    'manufacturing-ready',
    'safe to manufacture',
    'guaranteed',
    '${name} compliant',
    '`${name}-compliant`',
    'Fully compliant',
    'Complies with the standard',
    'You must comply with the standard',
    'conformant',
    'approved by the fab',
    'certified',
    'This board meets IEC limits',
    'Meet IPC requirements',
    'IEC 60664 satisfies the check',
    'IPC-2221 passes',
    'IPC class 2 qualified',
    'IPC approved',
    'compliant with nothing',
    'not compliant but also compliant',
    'does not certify compliance but is certified',
    'IPC-2221 is not wrong and meets the spec',
  ])('R-new matches "%s"', (s) => {
    expect(matches(s)).toBe(true);
  });
  it('reports only the un-negated phrase when a line mixes both', () => {
    expect(detectForbidden('not compliant but also compliant')).toEqual(['compliant']);
  });
  it('R3 needs an IPC/IEC token', () => {
    expect(matches('the board meets expectations')).toBe(false);
    expect(matches('the board meets IPC expectations')).toBe(true);
  });
  it('the repository itself (src, index.html, public) has no hits with the widened detector', () => {
    // tests/fixtures/audit/../../.. is the repository root; fixtureRoot normalises the path.
    const root = fx('../../..');
    expect(scanForbiddenPhrases(root)).toEqual([]);
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
  it('does not read a protocol name such as RS-485 as ledger id S-485, but still checks a real id', () => {
    const r = runAudit(fx('ledger-ref-embedded'), { ledgerText: text });
    expect(r.errors).toEqual([]);
  });
  it('flags a src reference to an unknown ID but not a ranged one', () => {
    const r = runAudit(fx('ledger-ref-bad'), { ledgerText: text });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('S-999');
  });
});

describe('spacing table audit (Phase 3: build fails if a safety table without verifiedBy lacks bannerRequired true)', () => {
  const shell = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    schema: 'pcb-calc/safety-table@1',
    schemaVersion: 1,
    table: 'T2',
    standard: 'IEC 60664-1',
    source: 'licensed copy held by the user',
    edition: 'not entered',
    ledgerIds: ['S-030b'],
    status: 'PAYWALLED-USER-MUST-VERIFY',
    entered: false,
    verifiedBy: '',
    verifiedDate: '',
    bannerRequired: true,
    cells: [],
    groups: [],
    rules: [],
    ...over,
  });
  const path = 'src/core/data/iec60664/T2.json';
  const errs = (o: unknown, p = path): string => validateTable(o, p).join(' | ');

  it('accepts an empty shell', () => {
    expect(validateTable(shell(), path)).toEqual([]);
  });
  it('a table lacking verifiedBy (missing, empty or blank) must set bannerRequired true, for ANY table', () => {
    const generic = { source: 's', edition: 'e', ledgerIds: ['S-001'], status: 'UNVERIFIED' };
    expect(errs({ ...generic, bannerRequired: false, verifiedBy: '' }, 'x.json')).toContain('bannerRequired');
    expect(errs({ ...generic, bannerRequired: false, verifiedBy: '   ' }, 'x.json')).toContain('bannerRequired');
    expect(errs({ ...generic, bannerRequired: false }, 'x.json')).toContain('verifiedBy');
    expect(errs(shell({ bannerRequired: false }))).toContain('bannerRequired');
    expect(errs(shell({ verifiedBy: undefined, bannerRequired: undefined }))).toContain('verifiedBy');
    // VERIFIED with a blank verifiedBy is refused even for a non-spacing table
    expect(errs({ ...generic, status: 'VERIFIED', verifiedBy: '   ', bannerRequired: false }, 'x.json')).toContain('verifiedBy');
  });
  it('a spacing table (by path or by schema) must declare the safety-table schema and an entered flag', () => {
    expect(errs(shell({ schema: 'other' }))).toContain('schema');
    expect(errs({ source: 's', edition: 'e', ledgerIds: ['S-030b'], status: 'UNVERIFIED', verifiedBy: '', bannerRequired: true }, path)).toContain('schema');
    expect(errs(shell({ entered: 'no' }))).toContain('entered');
    expect(errs(shell({ schemaVersion: 2 }))).toContain('schemaVersion');
    expect(errs({ ...shell(), table: 'T2' }, 'src/core/data/ipc2221-spacing.json')).toEqual('');
  });
  it('VERIFIED needs verifiedBy and verifiedDate, no banner, every record checked; a signer needs status VERIFIED', () => {
    const cell = { row: 'a', col: 'b', value: 1, unit: 'mm' };
    const verified = shell({ status: 'VERIFIED', entered: true, verifiedBy: 'A. Person', verifiedDate: '2026-01-02', bannerRequired: false, cells: [{ ...cell, enteredBy: 'C. Author', checkedBy: 'B. Checker', checkedDate: '2026-01-02' }] });
    expect(validateTable(verified, path)).toEqual([]);
    expect(errs({ ...verified, verifiedDate: '' })).toContain('verifiedDate');
    expect(errs({ ...verified, bannerRequired: true })).toContain('bannerRequired');
    expect(errs({ ...verified, cells: [cell] })).toContain('checkedBy');
    // second person: the signer may not be an enterer or checker of any record (case-insensitive, trimmed)
    const cells = (over: Record<string, unknown>) => [{ ...cell, enteredBy: 'C. Author', checkedBy: 'B. Checker', checkedDate: '2026-01-02', ...over }];
    expect(errs({ ...verified, cells: cells({ checkedBy: ' a. PERSON ' }) })).toContain('second person');
    expect(errs({ ...verified, cells: cells({ enteredBy: 'a. person' }) })).toContain('second person');
    expect(errs({ ...verified, enteredBy: 'A. Person' })).toContain('second person');
    expect(errs({ ...verified, elevationBreakpoint: { checkedBy: 'A. Person' } })).toContain('second person');
    expect(errs(shell({ verifiedBy: 'A. Person' }))).toContain('status');
    // names are normalised: NFKC, inner whitespace collapsed, trimmed, lower-cased
    expect(errs({ ...verified, enteredBy: '  a.   PERSON ' })).toContain('second person');
    expect(errs({ ...verified, cells: cells({ checkedBy: 'A.\u00a0Person' }) })).toContain('second person');
    expect(errs({ ...verified, cells: cells({ checkedBy: '\uff21. Person' }) })).toContain('second person');
    expect(errs({ ...verified, enteredBy: 'A. Persona' })).not.toContain('second person');
  });
  it('reinforced rules: multipliers strictly greater than 1, no multiplier mode for reinforced-clearance', () => {
    const rec = { clauseText: 'x', source: 'x', enteredBy: 'C. Author', enteredDate: '2026-01-01' };
    const t = (rules: Record<string, unknown>[]) => errs(shell({ entered: true, rules: rules.map((r) => ({ ...rec, ...r })) }));
    expect(t([{ rule: 'reinforced-creepage-multiplier', value: 1, unit: '1' }])).toContain('greater than 1');
    expect(t([{ rule: 'reinforced-clearance-steady-state', mode: 'multiplier', value: 1, unit: '1' }])).toContain('greater than 1');
    expect(t([{ rule: 'reinforced-creepage-multiplier', value: 2, unit: '1' }])).not.toContain('greater than 1');
    expect(t([{ rule: 'reinforced-clearance', mode: 'multiplier', value: 3, unit: '1' }])).toContain('next-preferred-impulse-step');
    expect(t([{ rule: 'reinforced-clearance', mode: 'next-preferred-impulse-step', series: [1, 2], unit: 'kV' }])).not.toContain('next-preferred-impulse-step');
  });
  it('an unentered table must hold no values, and values need entered true', () => {
    const cell = { row: 'a', col: 'b', value: 1, unit: 'mm' };
    expect(errs(shell({ cells: [cell] }))).toContain('entered');
    expect(errs(shell({ entered: true }))).toContain('entered');
  });
  it('the fixture with a signer but no date and no checker fails the audit', () => {
    const r = auditDataTables(fx('spacing-bad'));
    expect(r.count).toBe(1);
    expect(r.errors.join(' | ')).toContain('verifiedDate');
  });
  it('the shipped spacing tables pass the audit and are empty shells with the banner on', () => {
    const root = fx('../../..');
    const audit = auditDataTables(root);
    expect(audit.errors).toEqual([]);
    const shipped = import.meta.glob('../src/core/data/**/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const files = [
      'iec60664/T1-impulse-voltage.json',
      'iec60664/T2-clearance-transient.json',
      'iec60664/T3-clearance-steady-state.json',
      'iec60664/T4-altitude-factor.json',
      'iec60664/T5-creepage.json',
      'iec60664/T6-material-groups.json',
      'iec60664/T7-rules.json',
      'ipc2221-spacing.json',
    ];
    for (const f of files) {
      const text = shipped[`../src/core/data/${f}`];
      expect(text).toBeDefined();
      const o = JSON.parse(text as string) as Record<string, unknown>;
      expect(validateTable(o, `src/core/data/${f}`)).toEqual([]);
      expect(o['bannerRequired']).toBe(true);
      expect(o['verifiedBy']).toBe('');
      expect(o['entered']).toBe(false);
      expect(o['cells']).toEqual([]);
      expect(o['groups']).toEqual([]);
      expect(o['rules']).toEqual([]);
      expect(o['rows']).toEqual([]);
      // the hard rule: no entered value, edition, clause, table number or date in a shipped shell
      for (const k of ['edition', 'clause', 'tableNumber', 'enteredBy', 'enteredDate', 'verifiedDate']) {
        expect(String(o[k])).not.toMatch(/\d/);
      }
      expect(o['status']).toBe('PAYWALLED-USER-MUST-VERIFY');
    }
  });
});
