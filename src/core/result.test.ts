import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q } from './units';
import type { Quantity } from './units';
import {
  assertNoNonFinite,
  checkDesignValue,
  checkEnvelope,
  defaultedInputNames,
  guardPositiveFinite,
  guardPositiveFiniteNumber,
  highestWarningSeverity,
} from './result';
import type { CalcError, CalcOutcome, CalcResult } from './result';

type Input = CalcResult['inputs'][number];
type Warning = CalcResult['warnings'][number];
type Severity = Warning['severity'];
type DesignValue = NonNullable<CalcResult['designValue']>;
type Envelope = NonNullable<CalcResult['envelope']>[number];

// Test-only numbers; nothing here is a physical claim.
const nonFiniteQ = (si: number): Quantity => ({ si, dim: DIM.LENGTH }) as Quantity;

function baseResult(): CalcResult {
  return {
    method: 'test method',
    reference: { standard: 'TEST', edition: 'n/a', ledgerIds: [] },
    formula: 'y = x',
    inputs: [{ name: 'x', value: q(1, DIM.LENGTH), source: 'user' }],
    assumptions: [],
    steps: [{ label: 's1', expr: 'x', value: q(1, DIM.LENGTH) }],
    results: [{ name: 'y', value: q(2, DIM.LENGTH), role: 'primary' }],
    validityChecks: [],
    warnings: [],
    confidence: { level: 'high', reasons: [] },
    recommendation: 'none',
    dataStatus: 'VERIFIED',
  };
}

describe('CalcResult schema (type-level + shape)', () => {
  it('accepts the documented shape including dataStatus', () => {
    const r = baseResult();
    expect(r.dataStatus).toBe('VERIFIED');
    const o: CalcOutcome = { ok: true, value: r };
    expect(o.ok).toBe(true);
  });
  it('CalcError code union is usable', () => {
    const codes: CalcError['code'][] = [
      'INVALID_INPUT',
      'OUT_OF_DOMAIN',
      'DIMENSION',
      'NO_CONVERGENCE',
      'INTERNAL',
    ];
    expect(codes).toHaveLength(5);
  });
});

describe('guardPositiveFinite (Quantity)', () => {
  it('accepts a positive finite quantity and returns it unchanged', () => {
    const x = q(0.5, DIM.LENGTH);
    const r = guardPositiveFinite('width', x);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.si).toBe(0.5);
  });
  it.each([
    ['zero', 0],
    ['negative', -1e-3],
    ['negative zero', -0],
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['-Infinity', -Infinity],
  ])('rejects %s with INVALID_INPUT naming the field', (_n, v) => {
    const r = guardPositiveFinite('trace width', nonFiniteQ(v));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INVALID_INPUT');
      expect(r.error.field).toBe('trace width');
      expect(r.error.message).toContain('trace width');
      expect(r.error.message.length).toBeGreaterThan(10);
    }
  });
  it('never returns ok for a non-positive or non-finite value (property)', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: false }), (v) => {
        const r = guardPositiveFinite('f', nonFiniteQ(v));
        expect(r.ok).toBe(Number.isFinite(v) && v > 0);
      }),
    );
  });
});

describe('guardPositiveFiniteNumber', () => {
  it('accepts positive finite numbers', () => {
    const r = guardPositiveFiniteNumber('n', 3.5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeDefined();
  });
  it.each([0, -0, -2, NaN, Infinity, -Infinity])('rejects %s', (v) => {
    const r = guardPositiveFiniteNumber('current', v);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INVALID_INPUT');
      expect(r.error.field).toBe('current');
      expect(r.error.message).toContain('current');
    }
  });
  it('ok iff finite and > 0 (property)', () => {
    fc.assert(
      fc.property(fc.double(), (v) => {
        expect(guardPositiveFiniteNumber('v', v).ok).toBe(Number.isFinite(v) && v > 0);
      }),
    );
  });
});

describe('assertNoNonFinite', () => {
  it('passes for a fully finite result', () => {
    expect(() => assertNoNonFinite(baseResult())).not.toThrow();
  });
  it.each([NaN, Infinity, -Infinity])('throws for %s in inputs', (v) => {
    const r = baseResult();
    r.inputs[0] = { name: 'x', value: nonFiniteQ(v), source: 'user' };
    expect(() => assertNoNonFinite(r)).toThrow();
  });
  it.each([NaN, Infinity, -Infinity])('throws for %s in steps', (v) => {
    const r = baseResult();
    r.steps[0] = { label: 's', expr: 'e', value: nonFiniteQ(v) };
    expect(() => assertNoNonFinite(r)).toThrow();
  });
  it.each([NaN, Infinity, -Infinity])('throws for %s in results', (v) => {
    const r = baseResult();
    r.results[0] = { name: 'y', value: nonFiniteQ(v), role: 'primary' };
    expect(() => assertNoNonFinite(r)).toThrow();
  });
  it('error message identifies the offending location', () => {
    const r = baseResult();
    r.results[0] = { name: 'ampacity', value: nonFiniteQ(NaN), role: 'primary' };
    expect(() => assertNoNonFinite(r)).toThrow(/ampacity/);
  });
  it('finite zero and negative values are not "non-finite"', () => {
    const r = baseResult();
    r.results.push({ name: 'neg', value: q(-5, DIM.LENGTH), role: 'secondary' });
    r.results.push({ name: 'zero', value: q(0, DIM.LENGTH), role: 'secondary' });
    expect(() => assertNoNonFinite(r)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------
// Phase 1 task 0 (e): per-input provenance, warning severity, design value, envelope, fab profile, limiting
// element. Test-only numbers; nothing here is a physical claim.
// ---------------------------------------------------------------------------------------------------------

const dvOk = (): DesignValue => ({
  name: 'current limit',
  calculated: q(10, DIM.CURRENT),
  recommended: q(7, DIM.CURRENT),
  derating: { factor: 0.7, rationale: 'test derating' },
});
const envOk = (): Envelope => ({
  name: 'width',
  min: q(1, DIM.LENGTH),
  typ: q(2, DIM.LENGTH),
  max: q(3, DIM.LENGTH),
  toleranceInputs: ['copper thickness'],
});

function fullResult(): CalcResult {
  return {
    ...baseResult(),
    inputs: [
      { name: 'x', value: q(1, DIM.LENGTH), source: 'user' },
      { name: 'k', value: q(2, DIM.LENGTH), source: 'default', sourceDetail: 'tool default' },
      { name: 'plating', value: q(3, DIM.LENGTH), source: 'fab-profile', sourceDetail: 'jlcpcb-2026-10-06' },
      { name: 'foil', value: q(4, DIM.LENGTH), source: 'preset' },
    ],
    warnings: [
      { severity: 'caution', message: 'check', code: 'W-TEST' },
      { severity: 'info', message: 'fyi' },
    ],
    designValue: dvOk(),
    envelope: [envOk()],
    fabProfile: { id: 'jlcpcb-2026-10-06', fabricator: 'JLCPCB', profileDate: '2026-10-06', status: 'UNVERIFIED' },
    limitingElement: { id: 'seg-2', name: 'neck', reason: 'narrowest segment' },
  };
}

describe('CalcResult new shape (provenance, severity, optional blocks)', () => {
  it('accepts all new fields and keeps them', () => {
    const r = fullResult();
    expect(r.inputs.map((i) => i.source)).toEqual(['user', 'default', 'fab-profile', 'preset']);
    expect(r.inputs[1]?.sourceDetail).toBe('tool default');
    expect(r.warnings[0]).toEqual({ severity: 'caution', message: 'check', code: 'W-TEST' });
    expect(r.fabProfile?.status).toBe('UNVERIFIED');
    expect(r.limitingElement?.name).toBe('neck');
    expect(() => assertNoNonFinite(r)).not.toThrow();
  });
  it('optional blocks may be absent', () => {
    const r = baseResult();
    expect(r.designValue).toBeUndefined();
    expect(r.envelope).toBeUndefined();
    expect(r.fabProfile).toBeUndefined();
    expect(r.limitingElement).toBeUndefined();
  });
  it('old shapes no longer type-check (enforced by npm run typecheck)', () => {
    // @ts-expect-error `defaulted` was replaced by `source`
    const bad: Input = { name: 'x', value: q(1, DIM.LENGTH), defaulted: false };
    // @ts-expect-error warnings are objects with a severity, not strings
    const w: Warning = 'plain string';
    expect(bad).toBeDefined();
    expect(w).toBeDefined();
  });
});

describe('defaultedInputNames', () => {
  const mk = (name: string, source: Input['source']): Input => ({ name, value: q(1, DIM.LENGTH), source });
  it('lists every input whose source is not user, in order (presets and fab-profile included)', () => {
    expect(defaultedInputNames(fullResult().inputs)).toEqual(['k', 'plating', 'foil']);
  });
  it('is empty for empty or all-user inputs', () => {
    expect(defaultedInputNames([])).toEqual([]);
    expect(defaultedInputNames([mk('a', 'user'), mk('b', 'user')])).toEqual([]);
  });
  it('lists all names when none came from the user', () => {
    expect(defaultedInputNames([mk('a', 'default'), mk('b', 'preset'), mk('c', 'fab-profile')])).toEqual(['a', 'b', 'c']);
  });
  it('does not mutate its argument', () => {
    const inputs = fullResult().inputs;
    const copy = inputs.map((i) => ({ ...i }));
    defaultedInputNames(inputs);
    expect(inputs).toEqual(copy);
  });
  it('count equals the number of non-user inputs (property)', () => {
    const src = fc.constantFrom<Input['source']>('user', 'default', 'fab-profile', 'preset');
    fc.assert(
      fc.property(fc.array(src, { maxLength: 20 }), (sources) => {
        const inputs = sources.map((s, i) => mk(`n${String(i)}`, s));
        expect(defaultedInputNames(inputs)).toHaveLength(sources.filter((s) => s !== 'user').length);
      }),
    );
  });
});

describe('highestWarningSeverity', () => {
  const w = (severity: Severity): Warning => ({ severity, message: 'm' });
  const order: Severity[] = ['info', 'caution', 'warning', 'critical'];
  it('is null for no warnings', () => {
    expect(highestWarningSeverity([])).toBeNull();
  });
  it.each(order)('single %s warning', (s) => {
    expect(highestWarningSeverity([w(s)])).toBe(s);
  });
  it('orders info < caution < warning < critical', () => {
    expect(highestWarningSeverity([w('info'), w('caution')])).toBe('caution');
    expect(highestWarningSeverity([w('critical'), w('info'), w('warning')])).toBe('critical');
    expect(highestWarningSeverity([w('caution'), w('warning'), w('caution')])).toBe('warning');
  });
  it('returns the maximum of any list (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...order), { minLength: 1, maxLength: 12 }), (sev) => {
        const expected = order[Math.max(...sev.map((s) => order.indexOf(s)))];
        expect(highestWarningSeverity(sev.map(w))).toBe(expected);
      }),
    );
  });
});

describe('checkDesignValue (recommended = calculated x factor)', () => {
  const bad = (dv: DesignValue): string => {
    const r = checkDesignValue(dv);
    expect(r.ok).toBe(false);
    return r.ok ? '' : String(r.error).toLowerCase();
  };
  it('accepts a consistent design value and returns it', () => {
    const r = checkDesignValue(dvOk());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.derating.factor).toBe(0.7);
  });
  it('accepts factor exactly 1 (no derating)', () => {
    const dv = dvOk();
    dv.derating.factor = 1;
    dv.recommended = q(10, DIM.CURRENT);
    expect(checkDesignValue(dv).ok).toBe(true);
  });
  it.each([0, -0.5, 1.0000001, 2, NaN, Infinity, -Infinity])('rejects factor %s (error mentions "factor")', (f) => {
    const dv = dvOk();
    dv.derating.factor = f;
    expect(bad(dv)).toContain('factor');
  });
  it('rejects a recommended value that is not calculated x factor (error mentions "recommended")', () => {
    const dv = dvOk();
    dv.recommended = q(8, DIM.CURRENT);
    expect(bad(dv)).toContain('recommended');
  });
  it.each(['', '   '])('rejects empty rationale %j (error mentions "rationale")', (rationale) => {
    const dv = dvOk();
    dv.derating.rationale = rationale;
    expect(bad(dv)).toContain('rationale');
  });
  it('rejects calculated and recommended of different dimensions (error mentions "dimension")', () => {
    const dv = dvOk();
    dv.recommended = q(7, DIM.LENGTH);
    expect(bad(dv)).toContain('dimension');
  });
  it('does not treat absolute temperature and temperature difference as the same dimension', () => {
    const dv = dvOk();
    dv.calculated = q(10, DIM.TEMPERATURE_DIFFERENCE);
    dv.recommended = q(7, DIM.ABS_TEMPERATURE);
    expect(bad(dv)).toContain('dimension');
  });
  it.each([NaN, Infinity, -Infinity])('rejects non-finite calculated %s', (v) => {
    const dv = dvOk();
    dv.calculated = { si: v, dim: DIM.CURRENT } as Quantity;
    expect(checkDesignValue(dv).ok).toBe(false);
  });
  it.each([NaN, Infinity, -Infinity])('rejects non-finite recommended %s', (v) => {
    const dv = dvOk();
    dv.recommended = { si: v, dim: DIM.CURRENT } as Quantity;
    expect(checkDesignValue(dv).ok).toBe(false);
  });
  it('accepts every factor in (0,1] when recommended is computed from it (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1e-6, max: 1, noNaN: true }),
        fc.double({ min: 1e-6, max: 1e6, noNaN: true }),
        (f, c) => {
          const dv: DesignValue = {
            name: 'n',
            calculated: q(c, DIM.CURRENT),
            recommended: q(c * f, DIM.CURRENT),
            derating: { factor: f, rationale: 'r' },
          };
          expect(checkDesignValue(dv).ok).toBe(true);
        },
      ),
    );
  });
});

describe('checkEnvelope (min <= typ <= max, same dimension)', () => {
  const bad = (e: Envelope): string => {
    const r = checkEnvelope(e);
    expect(r.ok).toBe(false);
    return r.ok ? '' : String(r.error).toLowerCase();
  };
  it('accepts an ordered envelope and returns it', () => {
    const r = checkEnvelope(envOk());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe('width');
  });
  it('accepts a degenerate envelope (min = typ = max)', () => {
    const e = envOk();
    e.min = e.typ = e.max = q(2, DIM.LENGTH);
    expect(checkEnvelope(e).ok).toBe(true);
  });
  it('rejects min > typ (error mentions "min")', () => {
    const e = envOk();
    e.min = q(2.5, DIM.LENGTH);
    expect(bad(e)).toContain('min');
  });
  it('rejects typ > max (error mentions "max")', () => {
    const e = envOk();
    e.max = q(1.5, DIM.LENGTH);
    expect(bad(e)).toContain('max');
  });
  it('rejects mixed dimensions (error mentions "dimension")', () => {
    const e = envOk();
    e.max = q(3, DIM.CURRENT);
    expect(bad(e)).toContain('dimension');
  });
  it.each([NaN, Infinity, -Infinity])('rejects a non-finite member %s', (v) => {
    for (const k of ['min', 'typ', 'max'] as const) {
      const e = envOk();
      e[k] = nonFiniteQ(v);
      expect(checkEnvelope(e).ok).toBe(false);
    }
  });
  it('ok iff sorted (property)', () => {
    const d = fc.double({ min: -1e6, max: 1e6, noNaN: true });
    fc.assert(
      fc.property(d, d, d, (a, b, c) => {
        const e: Envelope = {
          name: 'n',
          min: q(a, DIM.LENGTH),
          typ: q(b, DIM.LENGTH),
          max: q(c, DIM.LENGTH),
          toleranceInputs: [],
        };
        expect(checkEnvelope(e).ok).toBe(a <= b && b <= c);
      }),
    );
  });
});

describe('assertNoNonFinite covers designValue and envelope', () => {
  it.each([NaN, Infinity, -Infinity])('throws for %s in designValue.calculated', (v) => {
    const r = fullResult();
    r.designValue = { ...dvOk(), name: 'ampacity limit', calculated: nonFiniteQ(v) };
    expect(() => assertNoNonFinite(r)).toThrow(/ampacity limit/);
  });
  it.each([NaN, Infinity, -Infinity])('throws for %s in designValue.recommended', (v) => {
    const r = fullResult();
    r.designValue = { ...dvOk(), name: 'ampacity limit', recommended: nonFiniteQ(v) };
    expect(() => assertNoNonFinite(r)).toThrow(/ampacity limit/);
  });
  it.each(['min', 'typ', 'max'] as const)('throws for a non-finite envelope %s and names the envelope', (k) => {
    for (const v of [NaN, Infinity, -Infinity]) {
      const r = fullResult();
      r.envelope = [{ ...envOk(), name: 'finished width', [k]: nonFiniteQ(v) }];
      expect(() => assertNoNonFinite(r)).toThrow(/finished width/);
    }
  });
  it('checks every envelope entry, not just the first', () => {
    const r = fullResult();
    r.envelope = [envOk(), { ...envOk(), name: 'second', max: nonFiniteQ(NaN) }];
    expect(() => assertNoNonFinite(r)).toThrow(/second/);
  });
});
