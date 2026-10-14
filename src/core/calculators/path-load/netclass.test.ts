import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, q } from '../../units';
import type { Quantity } from '../../units';
import { parseFabProfile } from '../../fab/profile';
import type { ParsedFabProfile } from '../../fab/profile';
import { assertCalcResult } from '../../result';
import { compute } from './calc';
import type { Inputs, LoadElement } from './calc';
import { buildExports } from './netclass';
import type { TraceLoadElement, ViaLoadElement } from './guards';

// Net-class export edge cases. Test values only; the profiles below are synthetic and say nothing about any fabricator.

const mm = (n: number): Quantity => fromUnit(n, 'mm');
const um = (n: number): Quantity => fromUnit(n, 'um');
const A = (n: number): Quantity => q(n, DIM.CURRENT);
const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const R = (n: number): Quantity => q(n, DIM.RESISTANCE);
const dK = (n: number): Quantity => fromUnit(n, 'ddegC');

const trace = (label: string, w = 1, dT = 20): TraceLoadElement => ({
  kind: 'trace',
  label,
  layer: 'outer',
  length: mm(100),
  width: mm(w),
  copperWeight: fromUnit(1, 'oz/ft2'),
  allowedTempRise: dK(dT),
});
const via = (extra: Partial<ViaLoadElement> = {}): ViaLoadElement => ({ kind: 'via', label: 'v', finishedHoleDiameter: mm(0.3), platingThickness: um(25), barrelLength: mm(1.6), count: 1, ...extra });

function profile(status: 'VERIFIED' | 'UNVERIFIED', limits: unknown[], ledger = 'S-019l'): ParsedFabProfile {
  const r = parseFabProfile({
    schemaVersion: 1,
    id: `synthetic-${status.toLowerCase()}`,
    fabricator: 'Synthetic test fabricator',
    profileDate: '2026-10-01',
    source: 'test',
    status,
    ledgerIds: [ledger],
    verifiedBy: status === 'VERIFIED' ? 'test' : '',
    bannerRequired: status !== 'VERIFIED',
    limits: {},
    scopedLimits: limits,
  });
  if (!r.ok) throw new Error(r.error.join('; '));
  return r.value;
}
const spaceEntry = (published: boolean, kind: 'min' | 'recommended-min' = 'min', ledgerId = 'S-019l'): Record<string, unknown> => ({
  key: 'traceSpace',
  kind,
  published,
  ...(published ? { value: { value: 0.12, unit: 'mm' } } : {}),
  holeType: 'any',
  sizeBasis: 'not-applicable',
  layerCount: '2',
  copperOz: 1,
  layerSide: 'outer',
  ledgerId,
  quote: 'synthetic test quote',
  retrievedOn: '2026-10-01',
});

describe('buildExports directly', () => {
  const base = { current: 2, traces: [trace('t1')], vias: [], accuracyClass: 'empirical' } as const;
  it('two traces with the same layer, copper and rise share one net class', () => {
    const out = buildExports({ ...base, traces: [trace('t1', 1), trace('t2', 3)] });
    expect(out.exports.length).toBe(1);
    expect(out.exports[0]?.note).toContain('"t1", "t2"');
  });
  it('traces with different allowed rises get separate net classes', () => {
    expect(buildExports({ ...base, traces: [trace('t1', 1, 10), trace('t2', 1, 30)] }).exports.length).toBe(2);
  });
  it('a width solve that fails is a warning, not an export', () => {
    const out = buildExports({ ...base, current: 1e300 });
    expect(out.exports.length).toBe(0);
    expect(out.warnings.map((w) => w.code)).toContain('EXPORT_WIDTH_UNAVAILABLE');
  });
  it('an implausibly wide recommended width is a warning, not an export', () => {
    const out = buildExports({ ...base, current: 900 });
    expect(out.exports.length).toBe(0);
    expect(out.warnings.map((w) => w.code)).toContain('EXPORT_WIDTH_OUT_OF_RANGE');
    expect(out.validityChecks.some((c) => !c.ok)).toBe(true);
  });
  it('a via with only a pad entered exports only the pad', () => {
    const out = buildExports({ ...base, traces: [], vias: [via({ padDiameter: mm(0.7) })] });
    expect(Object.keys(out.exports[0]?.values ?? {})).toEqual(['viaPad']);
  });
});

describe('clearance from a synthetic profile', () => {
  const els = (): LoadElement[] => [{ ...trace('t'), copperWeight: fromUnit(1, 'oz/ft2') }];
  const inputs = (p: ParsedFabProfile): Inputs => ({ vsource: V(12), loadCurrent: A(2), returnPath: 'not-counted', elements: els(), fabProfile: p, layerCount: '2', today: '2026-10-20' });
  it('a VERIFIED profile with a published entry exports the clearance with no unverified tag', () => {
    const p = profile('VERIFIED', [spaceEntry(true, 'min', 'S-019')], 'S-019');
    // the ledger row S-019 is VERIFIED, so a VERIFIED profile may cite it
    const out = compute(inputs(p));
    expect(out.ok).toBe(true);
    if (out.ok) {
      const x = out.value.exports?.[0];
      expect(x?.profile?.status).toBe('VERIFIED');
      expect(x?.values['clearance']?.si).toBeCloseTo(0.12e-3, 15);
      expect(out.value.dataStatus).not.toBe('VERIFIED'); // the trace limit is PAYWALLED regardless
      expect(assertCalcResult(out.value).ok).toBe(true);
    }
  });
  it('an entry recorded as not published is reported as such and no value is exported', () => {
    const p = profile('UNVERIFIED', [spaceEntry(false)]);
    const out = compute(inputs(p));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.exports?.[0]?.values['clearance']).toBeUndefined();
      expect(out.value.exports?.[0]?.note).toMatch(/recorded as not published/);
    }
  });
  it('the recommended minimum is preferred over the minimum when both are published', () => {
    const p = profile('UNVERIFIED', [spaceEntry(true, 'min'), { ...spaceEntry(true, 'recommended-min'), value: { value: 0.15, unit: 'mm' } }]);
    const out = compute(inputs(p));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.exports?.[0]?.values['clearance']?.si).toBeCloseTo(0.15e-3, 15);
      expect(out.value.exports?.[0]?.note).toContain('"recommended-min"');
    }
  });
});

describe('rare resolution failures are error values', () => {
  const base: Inputs = { vsource: V(12), loadCurrent: A(1), returnPath: 'not-counted', elements: [] };
  it('a via whose resistivity model goes non-positive is an error value naming the via', () => {
    const e = compute({ ...base, elements: [{ ...via({ conductorTemperature: fromUnit(-270, 'degC') }) }] });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.error.message).toContain('Via "v"');
  });
  it('a trace whose limit cannot be represented is an error value naming the trace', () => {
    const e = compute({ ...base, elements: [{ ...trace('t'), allowedTempRise: q(1e300, DIM.TEMPERATURE_DIFFERENCE), width: q(1e300, DIM.LENGTH) }] });
    expect(e.ok).toBe(false);
  });
  it('a path with a user element of resistance R still resolves when R is tiny but in range', () => {
    const e = compute({ ...base, elements: [{ kind: 'connector', label: 'c', resistance: R(1e-6), sourceNote: 'test' }] });
    expect(e.ok).toBe(true);
  });
});
