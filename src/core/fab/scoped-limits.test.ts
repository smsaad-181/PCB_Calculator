import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LEDGER } from '../data/ledger';
import { fromUnit, toUnit } from '../units';
import { fabProfileDateProblems, parseFabProfile } from './profile';
import type { ParsedFabProfile } from './profile';
import { HOLE_TYPES, LAYER_COUNTS, LAYER_SIDES, SCOPED_KEYS, lookupLimit } from './scoped-limits';
import type { ScopeRequest } from './scoped-limits';

// Scoped fab-limit model (gate G-6, Phase 1 task 7b). Numbers in the synthetic profiles are TEST values, not fabricator
// data. The shipped-data tests at the bottom compare the JSON with the quotes recorded in ledger rows S-019i..S-019m.

type Raw = Record<string, unknown>;

const entry = (over: Raw = {}): Raw => ({
  key: 'annularRing',
  kind: 'min',
  published: true,
  value: { value: 0.18, unit: 'mm' },
  holeType: 'pth',
  sizeBasis: 'designed-unstated',
  layerCount: '2',
  copperOz: 1,
  layerSide: 'unstated',
  ledgerId: 'S-019j',
  quote: 'test quote',
  retrievedOn: '2026-10-13',
  ...over,
});
const profile = (scopedLimits: unknown[], over: Raw = {}): Raw => ({
  schemaVersion: 1,
  id: 'test-profile',
  fabricator: 'Test Fab',
  profileDate: '2026-10-13',
  source: 'https://example.invalid/capabilities',
  status: 'UNVERIFIED',
  ledgerIds: ['S-019j', 'S-019k', 'S-019i', 'S-019m', 'S-006'],
  verifiedBy: '',
  bannerRequired: true,
  limits: {},
  scopedLimits,
  ...over,
});
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
const mm = (x: { si: number } & Parameters<typeof toUnit>[0]): number => toUnit(x, 'mm');
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

describe('scoped limits: parsing', () => {
  it('a profile without scopedLimits parses with an empty list (backwards compatible)', () => {
    const raw = profile([]);
    delete raw.scopedLimits;
    expect(parseOk(raw).scopedLimits).toEqual([]);
  });
  it('parses an entry into a SI Quantity with a status derived from its ledger row and keeps the quote', () => {
    const p = parseOk(profile([entry()]));
    const e = p.scopedLimits[0];
    expect(e).toBeDefined();
    if (!e) return;
    expect(e.value && relErr(e.value.si, 0.18e-3)).toBeLessThanOrEqual(1e-12);
    expect(e.status).toBe('UNVERIFIED');
    expect(e.ledgerId).toBe('S-019j');
    expect(e.quote).toBe('test quote');
    expect(e.retrievedOn).toBe('2026-10-13');
    expect(e.published).toBe(true);
  });
  it('a VERIFIED ledger row gives a VERIFIED entry status', () => {
    const e = parseOk(profile([entry({ key: 'holeToTrack', kind: 'min', ledgerId: 'S-006' })])).scopedLimits[0];
    expect(e?.status).toBe('VERIFIED');
  });
  it('published:false entries carry no value', () => {
    const e = parseOk(profile([entry({ published: false, value: undefined })])).scopedLimits[0];
    expect(e?.published).toBe(false);
    expect(e?.value).toBeUndefined();
  });
  it('does not mutate its input', () => {
    const raw = profile([entry()]);
    const copy = JSON.parse(JSON.stringify(raw)) as unknown;
    parseOk(raw);
    expect(raw).toEqual(copy);
  });
  it('rejects a non-array scopedLimits', () => {
    for (const v of [{}, 'x', 3, null]) expect(errorsOf(profile([], { scopedLimits: v }))).toContain('scopedlimits');
  });
  it.each([
    ['unknown key', { key: 'annularRng' }, 'annularrng'],
    ['kind not allowed for the key', { key: 'annularRing', kind: 'average' }, 'kind'],
    ['unknown kind', { kind: 'typical' }, 'kind'],
    ['published not boolean', { published: 'yes' }, 'published'],
    ['published true without value', { value: undefined }, 'value'],
    ['published false with a value', { published: false }, 'value'],
    ['zero value', { value: { value: 0, unit: 'mm' } }, 'value'],
    ['negative value', { value: { value: -0.1, unit: 'mm' } }, 'value'],
    ['non-length unit', { value: { value: 1, unit: 'A' } }, 'unit'],
    ['bad hole type', { holeType: 'blind' }, 'holetype'],
    ['missing hole type', { holeType: undefined }, 'holetype'],
    ['bad size basis', { sizeBasis: 'nominal' }, 'sizebasis'],
    ['bad layer count', { layerCount: '4' }, 'layercount'],
    ['missing layer count', { layerCount: undefined }, 'layercount'],
    ['bad copper weight', { copperOz: 0 }, 'copperoz'],
    ['string copper weight', { copperOz: '1' }, 'copperoz'],
    ['missing copper weight', { copperOz: undefined }, 'copperoz'],
    ['bad layer side', { layerSide: 'both' }, 'layerside'],
    ['empty quote', { quote: '  ' }, 'quote'],
    ['missing ledger id', { ledgerId: undefined }, 'ledgerid'],
    ['unknown ledger id', { ledgerId: `S-${'999'}` }, 'ledgerid'],
    ['ledger id not cited by the profile', { ledgerId: 'S-004' }, 'ledgerid'],
    ['bad retrievedOn', { retrievedOn: '2026-02-30' }, 'retrievedon'],
    ['retrievedOn after profileDate', { retrievedOn: '2026-10-14' }, 'retrievedon'],
  ])('rejects: %s', (_name, over, needle) => {
    const e = entry(over as Raw);
    if ((over as Raw).published === false) e.value = { value: 0.1, unit: 'mm' };
    expect(errorsOf(profile([e]))).toContain(needle);
  });
  it('rejects a non-object entry', () => {
    for (const bad of [null, 3, 'x', []]) expect(errorsOf(profile([bad]))).toContain('scopedlimits[0]');
  });
  it('reports every bad entry with its index', () => {
    const msg = errorsOf(profile([entry(), entry({ key: 'zzz' }), entry({ holeType: 'q' })]));
    expect(msg).toContain('scopedlimits[1]');
    expect(msg).toContain('scopedlimits[2]');
  });
  it('rejects implausible magnitudes (plating of 18 mm, ring of 1 nm, ring of 0.2 m)', () => {
    expect(errorsOf(profile([entry({ key: 'holePlating', kind: 'average', value: { value: 18, unit: 'mm' } })]))).toContain('plausible');
    expect(errorsOf(profile([entry({ value: { value: 0.2, unit: 'm' } })]))).toContain('plausible');
    expect(errorsOf(profile([entry({ value: { value: 1e-3, unit: 'um' } })]))).toContain('plausible');
  });
  it('rejects overlapping entries for the same key and kind (no ambiguity, no silent precedence)', () => {
    expect(errorsOf(profile([entry(), entry({ value: { value: 0.2, unit: 'mm' } })]))).toContain('overlap');
    // an "any" entry overlaps a specific one
    expect(errorsOf(profile([entry(), entry({ layerCount: 'any' })]))).toContain('overlap');
    expect(errorsOf(profile([entry(), entry({ copperOz: 'any' })]))).toContain('overlap');
    expect(errorsOf(profile([entry(), entry({ holeType: 'any' })]))).toContain('overlap');
    expect(errorsOf(profile([entry({ layerSide: 'inner' }), entry({ layerSide: 'unstated' })]))).toContain('overlap');
  });
  it('accepts entries that differ in any one scope dimension or kind', () => {
    for (const over of [{ holeType: 'npth' }, { layerCount: 'multilayer' }, { copperOz: 2 }, { kind: 'recommended-min', value: { value: 0.25, unit: 'mm' } }, { layerSide: 'outer', layerCount: '2' }]) {
      const second = entry(over as Raw);
      if ((over as Raw).layerSide === 'outer') second.layerSide = 'outer';
      const first = (over as Raw).layerSide ? entry({ layerSide: 'inner' }) : entry();
      expect(parseFabProfile(profile([first, second])).ok).toBe(true);
    }
  });
  it('rejects a recommended minimum below the absolute minimum of an overlapping scope', () => {
    const msg = errorsOf(
      profile([entry(), entry({ kind: 'recommended-min', value: { value: 0.1, unit: 'mm' } })]),
    );
    expect(msg).toContain('recommended');
  });
  it('rejects a minimum that is not below the maximum of an overlapping scope (min < max)', () => {
    const msg = errorsOf(
      profile([
        entry({ key: 'holeSize', kind: 'min', holeType: 'pth', value: { value: 7, unit: 'mm' } }),
        entry({ key: 'holeSize', kind: 'max', holeType: 'any', layerCount: 'any', copperOz: 'any', value: { value: 6.3, unit: 'mm' } }),
      ]),
    );
    expect(msg).toContain('maximum');
  });
  it('does not compare entries across scopes that cannot apply together', () => {
    const ok = parseFabProfile(
      profile([
        entry({ key: 'holeSize', kind: 'min', holeType: 'pth', value: { value: 0.3, unit: 'mm' } }),
        entry({ key: 'holeSize', kind: 'max', holeType: 'npth', layerCount: 'any', copperOz: 'any', value: { value: 0.2, unit: 'mm' } }),
      ]),
    );
    expect(ok.ok).toBe(true);
  });
  it('a VERIFIED profile cannot contain an entry from a non-VERIFIED ledger row', () => {
    const msg = errorsOf(profile([entry()], { status: 'VERIFIED', verifiedBy: 'A. Person, 2026-10-13', bannerRequired: false }));
    expect(msg).toContain('verified');
  });
  it('removed unscoped keys are rejected with a pointer to the scoped replacement', () => {
    const lim = (k: string): Raw => ({ [k]: { value: 0.2, unit: 'mm' } });
    for (const [k, hint] of [
      ['drillTolerancePlus', 'holefinishedtol'],
      ['drillToleranceMinus', 'holefinishedtol'],
      ['holeToTrack', 'holetotrack'],
      ['minAnnularRingRecommended', 'annularring'],
      ['minAnnularRingAbsolute', 'annularring'],
      ['holePlatingAverage', 'holeplating'],
      ['holePositionTolerance', 'holepositiontol'],
      ['minDrill', 'holesize'],
      ['maxDrill', 'holesize'],
      ['copperToEdge', 'copperto'],
      ['minTraceWidth', 'tracewidth'],
      ['minTraceSpace', 'tracespace'],
    ] as const) {
      const msg = errorsOf(profile([], { limits: lim(k) }));
      expect(msg).toContain(k.toLowerCase());
      expect(msg).toContain(hint);
    }
  });
  it('finished-copper keys, percent keys and copper weights still parse exactly as before', () => {
    const p = parseOk(
      profile([], {
        limits: {
          finishedCopperOuter1oz: { value: 1.6, unit: 'mil' },
          finishedCopperInner0p5oz: { value: 0.6, unit: 'mil' },
          finishedCopperInner1oz: { value: 1.2, unit: 'mil' },
          traceWidthTolerancePct: 20,
          impedanceTolerancePct: 10,
          boardThicknessTolerancePct: 10,
          copperWeightsOzFt2: [1],
        },
      }),
    );
    expect(relErr(toUnit(p.limits.finishedCopperOuter1oz ?? fromUnit(1, 'm'), 'mil'), 1.6)).toBeLessThanOrEqual(1e-12);
    expect(p.limits.traceWidthTolerancePct).toBe(20);
    expect(p.limits.copperWeightsOzFt2).toEqual([1]);
  });
  it('every registered key has kinds and a plausible magnitude window', () => {
    for (const [k, spec] of Object.entries(SCOPED_KEYS)) {
      expect(spec.kinds.length, k).toBeGreaterThan(0);
      expect(spec.minSi, k).toBeGreaterThan(0);
      expect(spec.maxSi, k).toBeGreaterThan(spec.minSi);
    }
  });
});

describe('fabProfileDateProblems (today injected)', () => {
  it('reports a profile date in the future and entry dates in the future', () => {
    const p = parseOk(profile([entry()]));
    expect(fabProfileDateProblems(p, '2026-10-13')).toEqual([]);
    expect(fabProfileDateProblems(p, '2027-10-13')).toEqual([]); // age is the stale rule's job
    const early = fabProfileDateProblems(p, '2026-10-12');
    expect(early.join(' ').toLowerCase()).toContain('future');
    expect(early.length).toBeGreaterThanOrEqual(2);
  });
  it('throws on a malformed today', () => {
    expect(() => fabProfileDateProblems(parseOk(profile([])), 'now')).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------
// Lookup: exact scope or "not available"; never a fallback to another hole type, layer count or copper weight.
// ---------------------------------------------------------------------------------------------------------
const FIXTURE = (): ParsedFabProfile =>
  parseOk(
    profile([
      entry({ kind: 'min', value: { value: 0.18, unit: 'mm' }, layerCount: '2', copperOz: 1 }),
      entry({ kind: 'recommended-min', value: { value: 0.25, unit: 'mm' }, layerCount: '2', copperOz: 1 }),
      entry({ kind: 'min', value: { value: 0.15, unit: 'mm' }, layerCount: 'multilayer', copperOz: 1 }),
      entry({ kind: 'min', published: false, value: undefined, layerCount: 'multilayer', copperOz: 2 }),
      entry({ kind: 'min', value: { value: 0.45, unit: 'mm' }, holeType: 'npth', layerCount: 'any', copperOz: 'any' }),
      entry({ key: 'holeToTrack', holeType: 'via', layerCount: 'any', copperOz: 'any', ledgerId: 'S-019k', value: { value: 0.2, unit: 'mm' } }),
      entry({ key: 'holeToTrack', holeType: 'pth', layerCount: 'any', copperOz: 'any', ledgerId: 'S-019k', value: { value: 0.28, unit: 'mm' } }),
      entry({ key: 'holeToCopper', holeType: 'pth', layerCount: 'any', copperOz: 'any', layerSide: 'inner', ledgerId: 'S-019k', value: { value: 0.3, unit: 'mm' } }),
      entry({ key: 'holePlating', kind: 'average', holeType: 'any', layerCount: 'any', copperOz: 'any', ledgerId: 'S-019m', value: { value: 18, unit: 'um' } }),
      entry({ key: 'holeFinishedTol', kind: 'tol-plus', holeType: 'pth', sizeBasis: 'finished', layerCount: 'any', copperOz: 'any', ledgerId: 'S-019i', value: { value: 0.13, unit: 'mm' } }),
    ]),
  );
const found = (r: ReturnType<typeof lookupLimit>): number => {
  expect(r.status).toBe('found');
  return r.status === 'found' ? mm(r.value) : NaN;
};

describe('lookupLimit: exact scope', () => {
  const p = FIXTURE();
  it('returns the entry for an exactly matching scope, with its ledger id and status', () => {
    const r = lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount: '2', copperOz: 1 });
    expect(found(r)).toBeCloseTo(0.18, 12);
    if (r.status === 'found') {
      expect(r.entry.ledgerId).toBe('S-019j');
      expect(r.entry.status).toBe('UNVERIFIED');
    }
    expect(found(lookupLimit(p, 'annularRing', 'recommended-min', { holeType: 'pth', layerCount: '2', copperOz: 1 }))).toBeCloseTo(0.25, 12);
    expect(found(lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount: 'multilayer', copperOz: 1 }))).toBeCloseTo(0.15, 12);
  });
  it('"any" entries match every request value', () => {
    for (const layerCount of ['1', '2', 'multilayer'] as const) {
      expect(found(lookupLimit(p, 'annularRing', 'min', { holeType: 'npth', layerCount, copperOz: 3 }))).toBeCloseTo(0.45, 12);
    }
    expect(found(lookupLimit(p, 'holeToTrack', 'min', { holeType: 'via' }))).toBeCloseTo(0.2, 12);
    expect(found(lookupLimit(p, 'holePlating', 'average', { holeType: 'pth' }))).toBeCloseTo(0.018, 12);
  });
  it('copper weight matches by value, not by nearness', () => {
    expect(lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount: '2', copperOz: 1 + 1e-12 }).status).toBe('found');
    for (const oz of [0.5, 0.999, 1.001, 2, 3]) {
      expect(lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount: '2', copperOz: oz }).status).toBe('not-available');
    }
  });
});

describe('lookupLimit: never falls back to another scope', () => {
  const p = FIXTURE();
  const na = (r: ReturnType<typeof lookupLimit>): string => {
    expect(r.status).toBe('not-available');
    return r.status === 'not-available' ? r.reason : '';
  };
  it('a via request never receives the PTH ring', () => {
    na(lookupLimit(p, 'annularRing', 'min', { holeType: 'via', layerCount: '2', copperOz: 1 }));
  });
  it('a PTH request never receives the NPTH ring or via hole-to-track', () => {
    expect(found(lookupLimit(p, 'holeToTrack', 'min', { holeType: 'pth' }))).toBeCloseTo(0.28, 12);
    na(lookupLimit(p, 'holeToTrack', 'min', { holeType: 'npth' }));
    na(lookupLimit(p, 'holeToTrack', 'min', { holeType: 'pressfit' }));
  });
  it('another layer count is not substituted (1-layer, and 2-layer vs multilayer)', () => {
    na(lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount: '1', copperOz: 1 }));
    expect(found(lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount: '2', copperOz: 1 }))).not.toBeCloseTo(0.15, 6);
  });
  it('another copper weight is not substituted', () => {
    na(lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount: '2', copperOz: 2 }));
    na(lookupLimit(p, 'annularRing', 'recommended-min', { holeType: 'pth', layerCount: 'multilayer', copperOz: 1 }));
  });
  it('a missing scope dimension is not guessed; the reason names it and says other scopes exist', () => {
    const r1 = na(lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', copperOz: 1 }));
    expect(r1).toContain('layer count');
    const r2 = na(lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount: '2' }));
    expect(r2).toContain('copper weight');
    const r3 = na(lookupLimit(p, 'annularRing', 'min', {}));
    expect(r3).toContain('hole type');
    expect(r3.toLowerCase()).toContain('other scope');
  });
  it('another kind is not substituted: the 18 um average is never returned as a minimum', () => {
    expect(found(lookupLimit(p, 'holePlating', 'average', { holeType: 'pth' }))).toBeCloseTo(0.018, 12);
    na(lookupLimit(p, 'holePlating', 'min', { holeType: 'pth' }));
    na(lookupLimit(p, 'annularRing', 'recommended-min', { holeType: 'npth' }));
  });
  it('inner-layer entries apply only to an inner request; unstated entries apply to every layer side', () => {
    expect(found(lookupLimit(p, 'holeToCopper', 'min', { holeType: 'pth', layerSide: 'inner' }))).toBeCloseTo(0.3, 12);
    na(lookupLimit(p, 'holeToCopper', 'min', { holeType: 'pth', layerSide: 'outer' }));
    na(lookupLimit(p, 'holeToCopper', 'min', { holeType: 'pth' }));
    for (const layerSide of ['inner', 'outer', undefined] as const) {
      expect(lookupLimit(p, 'holeToTrack', 'min', { holeType: 'pth', ...(layerSide ? { layerSide } : {}) }).status).toBe('found');
    }
  });
  it('a hole-type limit absent from the profile is not available (no entry at all)', () => {
    const r = na(lookupLimit(p, 'holeFinishedTol', 'tol-plus', { holeType: 'via' }));
    expect(r.toLowerCase()).toContain('other scope');
    na(lookupLimit(p, 'padToTrack', 'min', { holeType: 'pth' }));
  });
});

describe('lookupLimit: not published', () => {
  const p = FIXTURE();
  it('an exact-scope entry marked published:false returns not-published with its entry and no value', () => {
    const r = lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount: 'multilayer', copperOz: 2 });
    expect(r.status).toBe('not-published');
    if (r.status === 'not-published') {
      expect(r.entry.published).toBe(false);
      expect(r.entry.ledgerId).toBe('S-019j');
      expect('value' in r).toBe(false);
    }
  });
  it('is distinct from not-available', () => {
    const a = lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount: 'multilayer', copperOz: 2 }).status;
    const b = lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount: 'multilayer', copperOz: 3 }).status;
    expect(a).toBe('not-published');
    expect(b).toBe('not-available');
  });
});

describe('lookupLimit: property (a returned entry always matches the request)', () => {
  const holeTypes = ['via', 'pth', 'npth', 'pressfit'] as const;
  const counts = ['1', '2', 'multilayer'] as const;
  const sides = ['inner', 'outer'] as const;
  const entryArb = fc.record({
    holeType: fc.constantFrom(...HOLE_TYPES),
    layerCount: fc.constantFrom(...LAYER_COUNTS),
    copperOz: fc.constantFrom<number | 'any'>(0.5, 1, 2, 'any'),
    layerSide: fc.constantFrom(...LAYER_SIDES),
  });
  it('found/not-published entries are in scope; otherwise not-available', () => {
    fc.assert(
      fc.property(
        fc.array(entryArb, { minLength: 1, maxLength: 6 }),
        fc.record(
          {
            holeType: fc.constantFrom(...holeTypes),
            layerCount: fc.constantFrom(...counts),
            copperOz: fc.constantFrom(0.5, 1, 2, 3),
            layerSide: fc.constantFrom(...sides),
          },
          { requiredKeys: [] },
        ),
        (scopes, req) => {
          const raws = scopes.map((s, i) => entry({ ...s, value: { value: 0.1 + i * 0.01, unit: 'mm' } }));
          const parsed = parseFabProfile(profile(raws));
          if (!parsed.ok) return; // overlapping random scopes are rejected by design
          const r = lookupLimit(parsed.value, 'annularRing', 'min', req as ScopeRequest);
          if (r.status === 'not-available') return;
          const e = r.entry;
          expect(e.holeType === 'any' || e.holeType === req.holeType).toBe(true);
          expect(e.layerCount === 'any' || e.layerCount === req.layerCount).toBe(true);
          expect(e.copperOz === 'any' || e.copperOz === req.copperOz).toBe(true);
          expect(e.layerSide === 'unstated' || e.layerSide === req.layerSide).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });
});

// ---------------------------------------------------------------------------------------------------------
// Shipped data (raw files, as the app ships them)
// ---------------------------------------------------------------------------------------------------------
const files = import.meta.glob('../data/fab-profiles/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const shipped = (name: string): ParsedFabProfile => {
  const key = Object.keys(files).find((k) => k.endsWith(`/${name}`));
  if (key === undefined) throw new Error(`shipped fab profile ${name} not found`);
  return parseOk(JSON.parse(files[key] as string) as unknown);
};

describe('shipped JLCPCB profile: scoped entries', () => {
  const p = shipped('jlcpcb-2026-10-13.json');
  const ledgerIds = new Set(LEDGER.map((r) => r.id));
  it('is dated 2026-10-13, UNVERIFIED, with a banner, and cites the scoped rows', () => {
    expect(p.id).toBe('jlcpcb-2026-10-13');
    expect(p.profileDate).toBe('2026-10-13');
    expect(p.status).toBe('UNVERIFIED');
    expect(p.bannerRequired).toBe(true);
    for (const id of ['S-008', 'S-019c', 'S-019i', 'S-019j', 'S-019k', 'S-019l', 'S-019m']) expect(p.ledgerIds).toContain(id);
  });
  it('every scoped entry traces to a ledger row present in ledger.ts and in the profile, is UNVERIFIED, quoted and retrieved 2026-10-13', () => {
    expect(p.scopedLimits.length).toBeGreaterThan(40);
    for (const e of p.scopedLimits) {
      expect(ledgerIds.has(e.ledgerId), `${e.key} ${e.ledgerId}`).toBe(true);
      expect(p.ledgerIds).toContain(e.ledgerId);
      expect(e.status, `${e.key} ${e.ledgerId}`).toBe('UNVERIFIED');
      expect(e.quote.trim().length).toBeGreaterThan(5);
      expect(e.retrievedOn).toBe('2026-10-13');
      expect(['S-019i', 'S-019j', 'S-019k', 'S-019l', 'S-019m']).toContain(e.ledgerId);
    }
  });
  it('the ledger id of each key group matches the ledger row that records it', () => {
    const rowOf: Record<string, string> = {
      holeSize: 'S-019i',
      holeFinishedTol: 'S-019i',
      holePositionTol: 'S-019i',
      padSizeTol: 'S-019m',
      padDiameter: 'S-019i',
      padMinusHole: 'S-019j',
      annularRing: 'S-019j',
      holeToTrack: 'S-019k',
      holeToCopper: 'S-019k',
      holeToHole: 'S-019k',
      padToTrack: 'S-019k',
      smdPadToPad: 'S-019k',
      copperToRoutedEdge: 'S-019k',
      copperToVcutEdge: 'S-019k',
      traceWidth: 'S-019l',
      traceSpace: 'S-019l',
      holePlating: 'S-019m',
    };
    for (const e of p.scopedLimits) expect(e.ledgerId, e.key).toBe(rowOf[e.key]);
  });
  const val = (key: Parameters<typeof lookupLimit>[1], kind: Parameters<typeof lookupLimit>[2], scope: ScopeRequest): number => {
    const r = lookupLimit(p, key, kind, scope);
    if (r.status !== 'found') throw new Error(`${key} ${kind}: ${r.status}`);
    return mm(r.value);
  };
  it('PTH annular ring per layer count and copper weight (S-019j quotes)', () => {
    const c = (layerCount: '2' | 'multilayer', copperOz: number) => ({ holeType: 'pth' as const, layerCount, copperOz });
    expect(val('annularRing', 'recommended-min', c('2', 1))).toBeCloseTo(0.25, 12);
    expect(val('annularRing', 'min', c('2', 1))).toBeCloseTo(0.18, 12);
    expect(val('annularRing', 'recommended-min', c('multilayer', 1))).toBeCloseTo(0.2, 12);
    expect(val('annularRing', 'min', c('multilayer', 1))).toBeCloseTo(0.15, 12);
    expect(val('annularRing', 'recommended-min', c('2', 2))).toBeCloseTo(0.254, 12);
    expect(val('annularRing', 'recommended-min', c('multilayer', 2))).toBeCloseTo(0.254, 12);
  });
  it('PTH ring: absolute minimum at 2 oz and every 1-layer ring are NOT PUBLISHED; 0.5 oz and 2.5+ oz are not available', () => {
    for (const layerCount of ['2', 'multilayer'] as const) {
      expect(lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount, copperOz: 2 }).status).toBe('not-published');
    }
    for (const kind of ['min', 'recommended-min'] as const) {
      expect(lookupLimit(p, 'annularRing', kind, { holeType: 'pth', layerCount: '1', copperOz: 1 }).status).toBe('not-published');
    }
    for (const oz of [0.5, 2.5, 3.5, 4.5]) {
      expect(lookupLimit(p, 'annularRing', 'min', { holeType: 'pth', layerCount: 'multilayer', copperOz: oz }).status).toBe('not-available');
    }
  });
  it('NPTH ring is 0.45 mm; there is no via annular ring (not published); via pad minus hole is 0.10 / 0.15 mm diameter', () => {
    expect(val('annularRing', 'recommended-min', { holeType: 'npth', layerCount: '2', copperOz: 1 })).toBeCloseTo(0.45, 12);
    for (const kind of ['min', 'recommended-min'] as const) {
      expect(lookupLimit(p, 'annularRing', kind, { holeType: 'via', layerCount: 'multilayer', copperOz: 1 }).status).toBe('not-published');
    }
    expect(val('padMinusHole', 'min', { holeType: 'via' })).toBeCloseTo(0.1, 12);
    expect(val('padMinusHole', 'recommended-min', { holeType: 'via' })).toBeCloseTo(0.15, 12);
    expect(lookupLimit(p, 'padMinusHole', 'min', { holeType: 'pth' }).status).toBe('not-available');
  });
  it('finished-hole tolerance: PTH +0.13 / -0.08 mm; via and round NPTH NOT PUBLISHED; position +/-0.075 mm', () => {
    expect(val('holeFinishedTol', 'tol-plus', { holeType: 'pth' })).toBeCloseTo(0.13, 12);
    expect(val('holeFinishedTol', 'tol-minus', { holeType: 'pth' })).toBeCloseTo(0.08, 12);
    for (const holeType of ['via', 'npth'] as const) {
      for (const kind of ['tol-plus', 'tol-minus'] as const) {
        expect(lookupLimit(p, 'holeFinishedTol', kind, { holeType }).status, `${holeType} ${kind}`).toBe('not-published');
      }
    }
    expect(val('holePositionTol', 'tol-sym', { holeType: 'via' })).toBeCloseTo(0.075, 12);
    expect(val('holePositionTol', 'tol-sym', { holeType: 'pth' })).toBeCloseTo(0.075, 12);
  });
  it('hole to track is split: via 0.2, PTH 0.28 (0.35 recommended), NPTH 0.2 mm; inner-layer hole to copper via 0.2 / PTH 0.3', () => {
    expect(val('holeToTrack', 'min', { holeType: 'via' })).toBeCloseTo(0.2, 12);
    expect(val('holeToTrack', 'min', { holeType: 'pth' })).toBeCloseTo(0.28, 12);
    expect(val('holeToTrack', 'recommended-min', { holeType: 'pth' })).toBeCloseTo(0.35, 12);
    expect(val('holeToTrack', 'min', { holeType: 'npth' })).toBeCloseTo(0.2, 12);
    expect(val('holeToCopper', 'min', { holeType: 'via', layerSide: 'inner' })).toBeCloseTo(0.2, 12);
    expect(val('holeToCopper', 'min', { holeType: 'pth', layerSide: 'inner' })).toBeCloseTo(0.3, 12);
    expect(lookupLimit(p, 'holeToCopper', 'min', { holeType: 'pth', layerSide: 'outer' }).status).toBe('not-available');
  });
  it('plating: 18 um is stored as an AVERAGE only; no minimum is published', () => {
    const r = lookupLimit(p, 'holePlating', 'average', { holeType: 'pth' });
    expect(r.status).toBe('found');
    if (r.status === 'found') expect(toUnit(r.value, 'um')).toBeCloseTo(18, 9);
    expect(lookupLimit(p, 'holePlating', 'min', { holeType: 'pth' }).status).toBe('not-published');
  });
  it('trace / space per layer count and copper weight (S-019l); the larger of mm and mil is stored for multilayer 1 oz', () => {
    expect(val('traceWidth', 'min', { layerCount: '2', copperOz: 1 })).toBeCloseTo(0.1, 12);
    expect(val('traceWidth', 'min', { layerCount: '1', copperOz: 1 })).toBeCloseTo(0.1, 12);
    expect(val('traceWidth', 'min', { layerCount: 'multilayer', copperOz: 1 })).toBeGreaterThanOrEqual(0.09 - 1e-12);
    expect(val('traceSpace', 'min', { layerCount: 'multilayer', copperOz: 2 })).toBeCloseTo(0.15, 12);
    expect(val('traceSpace', 'min', { layerCount: '2', copperOz: 2 })).toBeCloseTo(0.16, 12);
    expect(val('traceSpace', 'min', { layerCount: '2', copperOz: 4.5 })).toBeCloseTo(0.3, 12);
    expect(lookupLimit(p, 'traceWidth', 'min', { layerCount: 'multilayer', copperOz: 3.5 }).status).toBe('not-available');
  });
  it('drill size minimum per hole type and layer count; V-cut and routed edge are different keys', () => {
    expect(val('holeSize', 'min', { holeType: 'pth', layerCount: '1' })).toBeCloseTo(0.3, 12);
    expect(val('holeSize', 'min', { holeType: 'pth', layerCount: '2' })).toBeCloseTo(0.15, 12);
    expect(val('holeSize', 'min', { holeType: 'npth', layerCount: '2' })).toBeCloseTo(0.5, 12);
    expect(val('copperToRoutedEdge', 'min', {})).toBeCloseTo(0.2, 12);
    expect(val('copperToVcutEdge', 'min', {})).toBeCloseTo(0.4, 12);
  });
  it('the misnamed or unscoped keys are gone from the flat limits block', () => {
    const keys = Object.keys(p.limits);
    for (const k of ['drillTolerancePlus', 'drillToleranceMinus', 'holeToTrack', 'minAnnularRingRecommended', 'minAnnularRingAbsolute', 'holePlatingAverage', 'minDrill', 'maxDrill', 'holePositionTolerance', 'copperToEdge', 'minTraceWidth', 'minTraceSpace']) {
      expect(keys).not.toContain(k);
    }
    expect(keys).toEqual(expect.arrayContaining(['finishedCopperOuter1oz', 'finishedCopperInner0p5oz', 'finishedCopperInner1oz', 'traceWidthTolerancePct', 'impedanceTolerancePct']));
  });
  it('notes say retrieved through a summarizing fetcher, list the not-published items and the ring-reference caveat', () => {
    const n = (p.notes ?? '').toLowerCase();
    for (const s of ['summarizing fetcher', 'r-21', 'not published', 'minimum plating', 'registration', 'finished or the drill']) expect(n).toContain(s);
  });
  it('profile-level dates are consistent (no entry newer than the profile)', () => {
    expect(fabProfileDateProblems(p, '2026-10-13')).toEqual([]);
  });
});

describe('published width and space tolerance (Phase 2 core D)', () => {
  const tol = (over: Raw = {}): Raw => entry({ key: 'traceWidth', kind: 'tol-sym', value: { value: 20, unit: 'um' }, holeType: 'any', sizeBasis: 'not-applicable', layerCount: '2', copperOz: 1, layerSide: 'outer', ledgerId: 'S-019j', ...over });
  it('traceWidth and traceSpace accept a tol-sym entry (a length) and look it up by exact scope only', () => {
    const p = parseOk(profile([tol(), tol({ key: 'traceSpace', value: { value: 25, unit: 'um' } })]));
    const hit = lookupLimit(p, 'traceWidth', 'tol-sym', { layerCount: '2', copperOz: 1, layerSide: 'outer' });
    expect(hit.status).toBe('found');
    if (hit.status === 'found') expect(relErr(hit.value.si, 20e-6)).toBeLessThanOrEqual(1e-12);
    expect(lookupLimit(p, 'traceSpace', 'tol-sym', { layerCount: '2', copperOz: 1, layerSide: 'outer' }).status).toBe('found');
    // no fallback to another layer count, copper weight or layer side
    expect(lookupLimit(p, 'traceWidth', 'tol-sym', { layerCount: 'multilayer', copperOz: 1, layerSide: 'outer' }).status).toBe('not-available');
    expect(lookupLimit(p, 'traceWidth', 'tol-sym', { layerCount: '2', copperOz: 2, layerSide: 'outer' }).status).toBe('not-available');
    expect(lookupLimit(p, 'traceWidth', 'tol-sym', { layerCount: '2', copperOz: 1, layerSide: 'inner' }).status).toBe('not-available');
  });
  it('a kind that no key allows is still refused', () => {
    expect(errorsOf(profile([tol({ key: 'annularRing' })]))).toContain('not allowed for this key');
  });
});

describe('shipped template: scoped limits', () => {
  const key = Object.keys(files).find((k) => k.endsWith('/template.json'));
  const t = parseOk(JSON.parse(files[key ?? ''] as string) as unknown);
  it('has every scoped entry absent and every lookup not available', () => {
    expect(t.scopedLimits).toEqual([]);
    for (const k of Object.keys(SCOPED_KEYS) as (keyof typeof SCOPED_KEYS)[]) {
      for (const kind of SCOPED_KEYS[k].kinds) {
        expect(lookupLimit(t, k, kind, { holeType: 'pth', layerCount: '2', copperOz: 1 }).status).toBe('not-available');
      }
    }
  });
  it('documents the scoped model so users know entries are explicit', () => {
    expect((t.notes ?? '').toLowerCase()).toContain('scopedlimits');
  });
});
