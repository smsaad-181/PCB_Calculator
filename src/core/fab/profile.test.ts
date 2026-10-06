import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LEDGER } from '../data/ledger';
import { DIM, fromUnit, sameDim, toUnit } from '../units';
import { fabProfileAgeDays, fabProfileStale, parseFabProfile } from './profile';
import type { ParsedFabProfile } from './profile';

// Fab-profile contract (Phase 1 task 0 f). All numbers below are test inputs, not fabricator data, except the
// shipped-example test, which compares the shipped JSON to the figures in ledger row S-008 /
// docs/research/jlcpcb.md section 4 (UNVERIFIED, R-21).

const LENGTH_KEYS = [
  'minTraceWidth',
  'minTraceSpace',
  'minDrill',
  'maxDrill',
  'minAnnularRingRecommended',
  'minAnnularRingAbsolute',
  'holePlatingAverage',
  'drillTolerancePlus',
  'drillToleranceMinus',
  'holePositionTolerance',
  'copperToEdge',
  'holeToTrack',
] as const;
const PCT_KEYS = ['traceWidthTolerancePct', 'impedanceTolerancePct', 'boardThicknessTolerancePct'] as const;

type Raw = Record<string, unknown>;

function valid(): Raw {
  return {
    schemaVersion: 1,
    id: 'test-profile',
    fabricator: 'Test Fab',
    profileDate: '2026-10-06',
    source: 'https://example.invalid/capabilities',
    status: 'UNVERIFIED',
    ledgerIds: ['S-008'],
    verifiedBy: '',
    bannerRequired: true,
    limits: {},
  };
}
const withLimits = (limits: Raw): Raw => ({ ...valid(), limits });
function parseOk(raw: unknown): ParsedFabProfile {
  const r = parseFabProfile(raw);
  if (!r.ok) throw new Error(`expected ok, got errors: ${r.error.join(' | ')}`);
  return r.value;
}
function errorsOf(raw: unknown): string {
  const r = parseFabProfile(raw);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error.join('\n').toLowerCase();
}
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

describe('parseFabProfile: valid input', () => {
  it('parses a generic template with every limit absent', () => {
    const p = parseOk(valid());
    expect(p.schemaVersion).toBe(1);
    expect(p.id).toBe('test-profile');
    expect(p.fabricator).toBe('Test Fab');
    expect(p.profileDate).toBe('2026-10-06');
    expect(p.status).toBe('UNVERIFIED');
    expect(p.ledgerIds).toEqual(['S-008']);
    expect(p.bannerRequired).toBe(true);
    expect(Object.keys(p.limits)).toHaveLength(0);
  });
  it('keeps optional notes and edition when present', () => {
    const p = parseOk({ ...valid(), notes: 'a note', edition: 'ed 1' });
    expect(p.notes).toBe('a note');
    expect(p.edition).toBe('ed 1');
  });
  it('does not mutate its input', () => {
    const raw = withLimits({ minDrill: { value: 0.2, unit: 'mm' } });
    const copy = JSON.parse(JSON.stringify(raw)) as unknown;
    parseOk(raw);
    expect(raw).toEqual(copy);
  });
  it('every length limit parses to a SI length Quantity', () => {
    for (const key of LENGTH_KEYS) {
      const p = parseOk(withLimits({ [key]: { value: 0.2, unit: 'mm' } }));
      const v = (p.limits as Record<string, unknown>)[key] as ReturnType<typeof fromUnit>;
      expect(sameDim(v, fromUnit(1, 'm'))).toBe(true);
      expect(relErr(v.si, 2e-4)).toBeLessThanOrEqual(1e-12);
      expect(v.dim).toEqual(DIM.LENGTH);
    }
  });
  it('absent limits stay absent (no hidden defaults)', () => {
    const p = parseOk(withLimits({ minDrill: { value: 0.2, unit: 'mm' } }));
    expect(Object.keys(p.limits)).toEqual(['minDrill']);
  });
  it('plain-number tolerances and copper weights pass through unchanged', () => {
    const p = parseOk(
      withLimits({ traceWidthTolerancePct: 20, impedanceTolerancePct: 10, boardThicknessTolerancePct: 100, copperWeightsOzFt2: [0.5, 1, 2] }),
    );
    expect(p.limits.traceWidthTolerancePct).toBe(20);
    expect(p.limits.impedanceTolerancePct).toBe(10);
    expect(p.limits.boardThicknessTolerancePct).toBe(100);
    expect(p.limits.copperWeightsOzFt2).toEqual([0.5, 1, 2]);
  });
  it('accepts every ledger status when the banner rule is satisfied', () => {
    for (const status of ['UNVERIFIED', 'PAYWALLED-USER-MUST-VERIFY', 'CONFLICT']) {
      expect(parseFabProfile({ ...valid(), status, bannerRequired: true }).ok).toBe(true);
    }
    expect(parseFabProfile({ ...valid(), status: 'VERIFIED', verifiedBy: 'A. Person, 2026-10-06', bannerRequired: false }).ok).toBe(true);
  });
  it('allows empty verifiedBy for non-VERIFIED status', () => {
    expect(parseFabProfile({ ...valid(), verifiedBy: '' }).ok).toBe(true);
  });
});

describe('parseFabProfile: unit handling', () => {
  it('3.5 mil -> 88.9 um (exact: 1 mil = 25.4 um, S-006)', () => {
    const p = parseOk(withLimits({ minTraceWidth: { value: 3.5, unit: 'mil' } }));
    const w = p.limits.minTraceWidth;
    expect(w).toBeDefined();
    if (w) {
      expect(relErr(w.si, 88.9e-6)).toBeLessThanOrEqual(1e-12);
      expect(relErr(toUnit(w, 'um'), 88.9)).toBeLessThanOrEqual(1e-12);
    }
  });
  it('mm, mil, um (ascii u) and micro sign all land on the same SI value', () => {
    const MU = 'µm'; // micro sign U+00B5 + m
    const a = parseOk(withLimits({ minDrill: { value: 100, unit: 'um' } })).limits.minDrill;
    const b = parseOk(withLimits({ minDrill: { value: 100, unit: MU } })).limits.minDrill;
    const c = parseOk(withLimits({ minDrill: { value: 0.1, unit: 'mm' } })).limits.minDrill;
    const d = parseOk(withLimits({ minDrill: { value: 100 / 25.4, unit: 'mil' } })).limits.minDrill;
    for (const x of [a, b, c, d]) expect(x && relErr(x.si, 1e-4)).toBeLessThanOrEqual(1e-12);
  });
  it('18 um plating and 0.075 mm position tolerance convert exactly', () => {
    const p = parseOk(
      withLimits({ holePlatingAverage: { value: 18, unit: 'um' }, holePositionTolerance: { value: 0.075, unit: 'mm' } }),
    );
    expect(relErr(p.limits.holePlatingAverage?.si ?? 0, 18e-6)).toBeLessThanOrEqual(1e-12);
    expect(relErr(p.limits.holePositionTolerance?.si ?? 0, 7.5e-5)).toBeLessThanOrEqual(1e-12);
  });
  it('round trip value -> parsed SI == fromUnit(value, unit) (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-3, max: 1e3, noNaN: true }), fc.constantFrom('mm', 'mil', 'um', 'in'), (value, unit) => {
        const p = parseOk(withLimits({ minTraceSpace: { value, unit } }));
        expect(p.limits.minTraceSpace?.si).toBe(fromUnit(value, unit).si);
        expect(relErr(toUnit(p.limits.minTraceSpace ?? fromUnit(1, 'm'), unit), value)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
});

describe('parseFabProfile: rejection paths (all problems reported, messages name the field)', () => {
  it.each([null, undefined, 42, 'text', [], true])('rejects non-object input %j', (raw) => {
    const r = parseFabProfile(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.length).toBeGreaterThanOrEqual(1);
      expect(r.error.every((m) => typeof m === 'string' && m.length > 0)).toBe(true);
    }
  });
  it.each([0, 2, '1', undefined, null])('rejects schemaVersion %j', (v) => {
    const raw = { ...valid(), schemaVersion: v };
    expect(errorsOf(raw)).toContain('schemaversion');
  });
  it.each(['id', 'fabricator', 'source'])('rejects empty, blank, missing or non-string %s', (key) => {
    for (const v of ['', '   ', undefined, 5, null]) {
      expect(errorsOf({ ...valid(), [key]: v })).toContain(key.toLowerCase());
    }
  });
  it('rejects an unknown or non-ledger status (DataStatus spelling is not a LedgerStatus)', () => {
    for (const status of ['MAYBE', 'PAYWALLED', 'verified', '', undefined, 3]) {
      expect(errorsOf({ ...valid(), status })).toContain('status');
    }
  });
  it.each([[[]], ['S-008'], [[1]], [['']], [undefined]])('rejects ledgerIds %j', (ids) => {
    expect(errorsOf({ ...valid(), ledgerIds: ids })).toContain('ledgerids');
  });
  it('rejects a non-string verifiedBy', () => {
    for (const verifiedBy of [undefined, null, 3, ['x']]) {
      expect(errorsOf({ ...valid(), verifiedBy })).toContain('verifiedby');
    }
  });
  it('rejects VERIFIED with empty verifiedBy', () => {
    expect(errorsOf({ ...valid(), status: 'VERIFIED', verifiedBy: '', bannerRequired: false })).toContain('verifiedby');
  });
  it('force-checks the banner: non-VERIFIED with bannerRequired false or missing is rejected, never auto-fixed', () => {
    for (const status of ['UNVERIFIED', 'PAYWALLED-USER-MUST-VERIFY', 'CONFLICT']) {
      for (const bannerRequired of [false, undefined, 'true', null]) {
        expect(errorsOf({ ...valid(), status, bannerRequired })).toContain('bannerrequired');
      }
    }
  });
  it('rejects a non-boolean bannerRequired even for VERIFIED', () => {
    expect(
      errorsOf({ ...valid(), status: 'VERIFIED', verifiedBy: 'A, 2026-10-06', bannerRequired: 'no' }),
    ).toContain('bannerrequired');
  });
  it('rejects a missing or non-object limits block', () => {
    for (const limits of [undefined, null, [], 'x', 3]) {
      expect(errorsOf({ ...valid(), limits })).toContain('limits');
    }
  });
  it('rejects unknown limit keys (typo guard)', () => {
    expect(errorsOf(withLimits({ minDrll: { value: 0.2, unit: 'mm' } }))).toContain('minDrll'.toLowerCase());
  });
  it.each([0, -0, -1, NaN, Infinity, -Infinity, '3', null, undefined])('rejects length limit value %j', (value) => {
    expect(errorsOf(withLimits({ minTraceWidth: { value, unit: 'mil' } }))).toContain('mintracewidth');
  });
  it('rejects a limit that is not a {value, unit} object', () => {
    for (const bad of [5, '3 mil', null, [], { value: 3 }, { unit: 'mm' }]) {
      expect(errorsOf(withLimits({ minDrill: bad }))).toContain('mindrill');
    }
  });
  it('rejects unknown, empty or non-string units', () => {
    for (const unit of ['furlong', '', 'MM', undefined, 5]) {
      expect(errorsOf(withLimits({ minDrill: { value: 1, unit } }))).toContain('mindrill');
    }
  });
  it('rejects units of the wrong dimension for a length limit', () => {
    for (const unit of ['A', 'V', 'W', 'oz/ft2', 'K', 'ohm', 'mm2']) {
      expect(errorsOf(withLimits({ holePlatingAverage: { value: 1, unit } }))).toContain('holeplatingaverage');
    }
  });
  it.each(PCT_KEYS)('%s must be in (0, 100]', (key) => {
    for (const v of [0, -1, 100.0001, 1000, NaN, Infinity, '20', null]) {
      expect(errorsOf(withLimits({ [key]: v }))).toContain(key.toLowerCase());
    }
    for (const v of [0.001, 20, 100]) expect(parseFabProfile(withLimits({ [key]: v })).ok).toBe(true);
  });
  it('copperWeightsOzFt2 must be an array of finite numbers > 0', () => {
    for (const v of [1, '1', [0], [-1], [NaN], [Infinity], ['1'], [1, 0]]) {
      expect(errorsOf(withLimits({ copperWeightsOzFt2: v }))).toContain('copperweightsozft2');
    }
    expect(parseFabProfile(withLimits({ copperWeightsOzFt2: [] })).ok).toBe(true);
  });
  it('returns all problems, not just the first', () => {
    const msg = errorsOf({
      schemaVersion: 2,
      id: '',
      fabricator: '',
      profileDate: '2026-02-30',
      source: '',
      status: 'MAYBE',
      ledgerIds: [],
      verifiedBy: 1,
      bannerRequired: 'x',
      limits: { minDrill: { value: -1, unit: 'furlong' }, impedanceTolerancePct: 0 },
    });
    for (const needle of [
      'schemaversion',
      'id',
      'fabricator',
      'profiledate',
      'source',
      'status',
      'ledgerids',
      'verifiedby',
      'bannerrequired',
      'mindrill',
      'impedancetolerancepct',
    ]) {
      expect(msg).toContain(needle);
    }
    const r = parseFabProfile({ ...valid(), id: '', fabricator: '', source: '' });
    if (!r.ok) expect(r.error.length).toBeGreaterThanOrEqual(3);
  });
  it('two bad limits yield at least two messages', () => {
    const r = parseFabProfile(withLimits({ minDrill: { value: -1, unit: 'mm' }, maxDrill: { value: 0, unit: 'mm' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThanOrEqual(2);
  });
});

describe('parseFabProfile: profileDate must be a valid ISO calendar date', () => {
  it.each(['2026-02-30', '2026-02-29', '2100-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-10-00', '2026-1-5', '26-10-06', '2026-10-06T00:00:00Z', '2026/10/06', '06-10-2026', '', ' 2026-10-06', 'today', 20261006, null, undefined])(
    'rejects %j',
    (profileDate) => {
      expect(errorsOf({ ...valid(), profileDate })).toContain('profiledate');
    },
  );
  it.each(['2024-02-29', '2000-02-29', '2026-12-31', '2026-01-01'])('accepts %s', (profileDate) => {
    expect(parseFabProfile({ ...valid(), profileDate }).ok).toBe(true);
  });
});

describe('fabProfileAgeDays / fabProfileStale (today is injected, no clock)', () => {
  const p = (): ParsedFabProfile => parseOk({ ...valid(), profileDate: '2026-10-06' });
  it('is 0 on the profile date and counts whole days', () => {
    expect(fabProfileAgeDays(p(), '2026-10-06')).toBe(0);
    expect(fabProfileAgeDays(p(), '2026-10-07')).toBe(1);
    expect(fabProfileAgeDays(p(), '2026-11-05')).toBe(30);
    expect(fabProfileAgeDays(p(), '2027-10-06')).toBe(365);
  });
  it('handles leap years and month ends', () => {
    expect(fabProfileAgeDays(parseOk({ ...valid(), profileDate: '2024-02-28' }), '2024-03-01')).toBe(2);
    expect(fabProfileAgeDays(parseOk({ ...valid(), profileDate: '2025-02-28' }), '2025-03-01')).toBe(1);
    expect(fabProfileAgeDays(parseOk({ ...valid(), profileDate: '2027-10-06' }), '2028-10-06')).toBe(366);
  });
  it('is independent of daylight-saving changes (UTC day arithmetic)', () => {
    expect(fabProfileAgeDays(parseOk({ ...valid(), profileDate: '2026-03-28' }), '2026-03-30')).toBe(2);
    expect(fabProfileAgeDays(parseOk({ ...valid(), profileDate: '2026-10-24' }), '2026-10-26')).toBe(2);
  });
  it('is negative when today is before the profile date, and then not stale', () => {
    expect(fabProfileAgeDays(p(), '2026-10-05')).toBe(-1);
    expect(fabProfileStale(p(), '2026-10-05')).toBe(false);
  });
  it('stale means strictly more than maxDays (default 365)', () => {
    expect(fabProfileStale(p(), '2026-10-06')).toBe(false);
    expect(fabProfileStale(p(), '2027-10-06')).toBe(false);
    expect(fabProfileStale(p(), '2027-10-07')).toBe(true);
    expect(fabProfileStale(p(), '2026-11-05', 30)).toBe(false);
    expect(fabProfileStale(p(), '2026-11-06', 30)).toBe(true);
    expect(fabProfileStale(p(), '2026-10-06', 0)).toBe(false);
    expect(fabProfileStale(p(), '2026-10-07', 0)).toBe(true);
  });
  it('throws on a malformed or impossible "today" instead of guessing', () => {
    for (const today of ['2026-02-30', '2026-13-01', 'now', '', '2026-10-06T00:00:00Z']) {
      expect(() => fabProfileAgeDays(p(), today)).toThrow();
      expect(() => fabProfileStale(p(), today)).toThrow();
    }
  });
  it('age(today = date + n days) = n (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20000 }), (n) => {
        const base = Date.UTC(2000, 0, 1);
        const today = new Date(base + n * 86_400_000).toISOString().slice(0, 10);
        expect(fabProfileAgeDays(parseOk({ ...valid(), profileDate: '2000-01-01' }), today)).toBe(n);
      }),
    );
  });
});

// ---------------------------------------------------------------------------------------------------------
// Shipped data files: loaded raw (no JSON module import) so the test reads exactly what the app ships.
// ---------------------------------------------------------------------------------------------------------
const files = import.meta.glob('../data/fab-profiles/*.json', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const fileOf = (name: string): string => {
  const key = Object.keys(files).find((k) => k.endsWith(`/${name}`));
  if (key === undefined) throw new Error(`shipped fab profile ${name} not found; found: ${Object.keys(files).join(', ')}`);
  return files[key] as string;
};

describe('shipped example: src/core/data/fab-profiles/jlcpcb-2026-10-06.json', () => {
  const raw = (): unknown => JSON.parse(fileOf('jlcpcb-2026-10-06.json')) as unknown;
  const mm = (x: ReturnType<typeof fromUnit> | undefined): number => (x ? toUnit(x, 'mm') : NaN);
  it('parses and is labelled UNVERIFIED with a banner, ledger S-008, dated 2026-10-06', () => {
    const p = parseOk(raw());
    expect(p.status).toBe('UNVERIFIED');
    expect(p.bannerRequired).toBe(true);
    expect(p.ledgerIds).toEqual(['S-008']);
    expect(p.profileDate).toBe('2026-10-06');
    expect(p.id).toBe('jlcpcb-2026-10-06');
    expect(p.fabricator).toBe('JLCPCB');
    expect(p.source).toBe('https://jlcpcb.com/capabilities/pcb-capabilities');
    expect(p.verifiedBy).toBe('');
  });
  it('notes carry the re-read warning and the 1-2 layer figures', () => {
    const notes = parseOk(raw()).notes ?? '';
    expect(notes).toContain('R-21');
    expect(notes).toContain('example only');
    expect(notes).toContain('without notice');
    expect(notes).toContain('0.25');
    expect(notes).toContain('0.18');
    expect(notes).toMatch(/4 mil/);
  });
  it('numbers equal the JLCPCB figures in ledger S-008 / jlcpcb.md section 4 (multilayer values)', () => {
    const l = parseOk(raw()).limits;
    expect(relErr(mm(l.minAnnularRingRecommended), 0.2)).toBeLessThanOrEqual(1e-12);
    expect(relErr(mm(l.minAnnularRingAbsolute), 0.15)).toBeLessThanOrEqual(1e-12);
    expect(relErr(toUnit(l.holePlatingAverage ?? fromUnit(1, 'm'), 'um'), 18)).toBeLessThanOrEqual(1e-12);
    expect(relErr(mm(l.drillTolerancePlus), 0.13)).toBeLessThanOrEqual(1e-12);
    expect(relErr(mm(l.drillToleranceMinus), 0.08)).toBeLessThanOrEqual(1e-12);
    expect(relErr(mm(l.holePositionTolerance), 0.075)).toBeLessThanOrEqual(1e-12);
    expect(relErr(toUnit(l.minTraceWidth ?? fromUnit(1, 'm'), 'mil'), 3.5)).toBeLessThanOrEqual(1e-12);
    expect(relErr(toUnit(l.minTraceSpace ?? fromUnit(1, 'm'), 'mil'), 3.5)).toBeLessThanOrEqual(1e-12);
    expect(l.traceWidthTolerancePct).toBe(20);
    expect(l.impedanceTolerancePct).toBe(10);
    expect(relErr(mm(l.minDrill), 0.15)).toBeLessThanOrEqual(1e-12);
    expect(relErr(mm(l.maxDrill), 6.3)).toBeLessThanOrEqual(1e-12);
    expect(relErr(mm(l.holeToTrack), 0.2)).toBeLessThanOrEqual(1e-12);
    expect(relErr(mm(l.copperToEdge), 0.2)).toBeLessThanOrEqual(1e-12);
    expect(l.copperWeightsOzFt2).toEqual([1]);
  });
  it('lists no limit that the research note does not publish (board thickness tolerance is absent)', () => {
    const keys = Object.keys(parseOk(raw()).limits).sort();
    expect(keys).toEqual(
      [
        'minTraceWidth',
        'minTraceSpace',
        'minDrill',
        'maxDrill',
        'minAnnularRingRecommended',
        'minAnnularRingAbsolute',
        'holePlatingAverage',
        'drillTolerancePlus',
        'drillToleranceMinus',
        'holePositionTolerance',
        'copperToEdge',
        'holeToTrack',
        'traceWidthTolerancePct',
        'impedanceTolerancePct',
        'copperWeightsOzFt2',
      ].sort(),
    );
  });
});

describe('shipped template: src/core/data/fab-profiles/template.json', () => {
  it('parses with every limit absent, identity placeholders, UNVERIFIED, banner on', () => {
    const p = parseOk(JSON.parse(fileOf('template.json')) as unknown);
    expect(Object.keys(p.limits)).toHaveLength(0);
    expect(p.fabricator).toBe('YOUR FABRICATOR');
    expect(p.profileDate).toBe('2026-10-06');
    expect(p.status).toBe('UNVERIFIED');
    expect(p.bannerRequired).toBe(true);
    expect(p.verifiedBy).toBe('');
  });
});

describe('every shipped fab profile', () => {
  it('parses, is unique by id, matches its file name, and cites ledger rows that exist', () => {
    const entries = Object.entries(files);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    const ids = new Set<string>();
    const ledgerIds = new Set(LEDGER.map((r) => r.id));
    for (const [path, text] of entries) {
      const p = parseOk(JSON.parse(text) as unknown);
      expect(path.endsWith(`/${p.id}.json`)).toBe(true);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      for (const id of p.ledgerIds) expect(ledgerIds.has(id)).toBe(true);
      if (p.status !== 'VERIFIED') expect(p.bannerRequired).toBe(true);
    }
  });
});
