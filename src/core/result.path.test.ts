import { describe, expect, it } from 'vitest';
import { DIM, q } from './units';
import type { Quantity } from './units';
import { NET_CLASS_KEYS, assertCalcResult, checkElements, checkExports } from './result';
import type { CalcExport, CalcResult, ElementResult } from './result';
import { compute } from './calculators/path-load/calc';
import type { Inputs } from './calculators/path-load/calc';

// Gate G-7 (task 6) schema additions: element limit basis and source, one utilisation basis, absolute temperature rejected
// (G3-d, G3-g), typed and bounded net-class exports with the profile id and the visible status tag (G3-c). Test-only
// numbers; nothing here is a physical claim.

const el = (id: string, load: number, limit: number, extra: Partial<ElementResult> = {}): ElementResult => ({
  id,
  name: `element ${id}`,
  kind: 'trace',
  load: q(load, DIM.CURRENT),
  limit: q(limit, DIM.CURRENT),
  utilisation: load / limit,
  margin: q(limit - load, DIM.CURRENT),
  ...extra,
});
const len = (m: number): Quantity => q(m, DIM.LENGTH);
const exp = (extra: Partial<CalcExport> = {}): CalcExport => ({ id: 'x1', kind: 'net-class', values: { width: len(0.25e-3) }, note: 'n', ...extra });
const errs = (xs: CalcExport[]): string => {
  const r = checkExports(xs);
  return r.ok ? '' : r.error.join(' | ');
};

describe('checkElements: one basis, no absolute temperature, limit source (G3-d, G3-g)', () => {
  it('rejects an absolute temperature as load, limit or margin', () => {
    const t = (si: number): Quantity => q(si, DIM.ABS_TEMPERATURE);
    const e = el('t', 1, 4, { load: t(300), limit: t(400), margin: t(100) });
    const r = checkElements([e]);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error.join(' ')).toMatch(/absolute temperature cannot be an element load, limit or margin/);
  });
  it('rejects mixed bases across elements (a temperature-difference element beside a current element)', () => {
    const dT = el('d', 5, 20, { load: q(5, DIM.TEMPERATURE_DIFFERENCE), limit: q(20, DIM.TEMPERATURE_DIFFERENCE), margin: q(15, DIM.TEMPERATURE_DIFFERENCE) });
    const r = checkElements([el('a', 1, 4), dT]);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error.join(' ')).toMatch(/one utilisation basis only/);
  });
  it('a limitBasis other than current, or a current basis on a non-current load, is rejected', () => {
    const wrong = checkElements([el('a', 1, 4, { limitBasis: 'temperature' as unknown as 'current', limitSource: 's' })]);
    expect(wrong.ok).toBe(false);
    const dT = el('d', 5, 20, { load: q(5, DIM.TEMPERATURE_DIFFERENCE), limit: q(20, DIM.TEMPERATURE_DIFFERENCE), margin: q(15, DIM.TEMPERATURE_DIFFERENCE), limitBasis: 'current', limitSource: 's' });
    const r = checkElements([dT]);
    expect(r.ok ? '' : r.error.join(' ')).toMatch(/load is not a current/);
  });
  it('limitBasis and limitSource go together', () => {
    expect(checkElements([el('a', 1, 4, { limitBasis: 'current' })]).ok).toBe(false);
    expect(checkElements([el('a', 1, 4, { limitBasis: 'current', limitSource: '  ' })]).ok).toBe(false);
    expect(checkElements([el('a', 1, 4, { limitSource: 'user-supplied: x' })]).ok).toBe(false);
    expect(checkElements([el('a', 1, 4, { limitBasis: 'current', limitSource: 'user-supplied: x' })]).ok).toBe(true);
  });
  it('per-element resistance, drop and loss are dimension and sign checked', () => {
    const good = el('a', 1, 4, { resistance: q(0.1, DIM.RESISTANCE), drop: q(0.1, DIM.VOLTAGE), loss: q(0.1, DIM.POWER) });
    expect(checkElements([good]).ok).toBe(true);
    expect(checkElements([{ ...good, resistance: q(0.1, DIM.VOLTAGE) }]).ok).toBe(false);
    expect(checkElements([{ ...good, drop: q(-0.1, DIM.VOLTAGE) }]).ok).toBe(false);
    expect(checkElements([{ ...good, loss: { si: NaN, dim: DIM.POWER } as Quantity }]).ok).toBe(false);
  });
  it('plain current elements without the new fields are still valid (backward compatible)', () => {
    expect(checkElements([el('a', 1, 4), el('b', 9, 4)]).ok).toBe(true);
  });
});

describe('checkExports (G3-c)', () => {
  it('accepts a typed width and a via echo', () => {
    expect(errs([exp(), exp({ id: 'x2', values: { viaDrill: len(0.3e-3), viaPad: len(0.6e-3) }, sources: { viaDrill: 'user-entered', viaPad: 'user-entered' } })])).toBe('');
  });
  it('rejects unknown keys, wrong dimension, zero, negative, non-finite and out-of-range values', () => {
    expect(errs([exp({ values: { colour: len(1e-3) } })])).toMatch(/not a net-class key/);
    expect(errs([exp({ values: { width: q(1, DIM.CURRENT) } })])).toMatch(/must be a length/);
    expect(errs([exp({ values: { width: len(0) } })])).toMatch(/greater than zero/);
    expect(errs([exp({ values: { width: len(-1e-3) } })])).toMatch(/greater than zero/);
    expect(errs([exp({ values: { width: { si: NaN, dim: DIM.LENGTH } as Quantity } })])).toMatch(/must be finite/);
    expect(errs([exp({ values: { width: len(2) } })])).toMatch(/plausible range/);
    expect(errs([exp({ values: { viaDrill: len(1e-9) } })])).toMatch(/plausible range/);
  });
  it('NET_CLASS_KEYS bounds: width and clearance are minimums (round up); echoed via values are nominal', () => {
    expect(NET_CLASS_KEYS.width.bound).toBe('min-requirement');
    expect(NET_CLASS_KEYS.clearance.bound).toBe('min-requirement');
    expect(NET_CLASS_KEYS.viaDrill.bound).toBe('nominal');
    expect(NET_CLASS_KEYS.viaPad.bound).toBe('nominal');
  });
  it('a clearance must say where it came from; a fab-profile value needs the profile', () => {
    expect(errs([exp({ values: { clearance: len(0.1e-3) } })])).toMatch(/must say where it came from/);
    expect(errs([exp({ values: { clearance: len(0.1e-3) }, sources: { clearance: 'calculated' } })])).toMatch(/never calculated/);
    expect(errs([exp({ values: { clearance: len(0.1e-3) }, sources: { clearance: 'user-entered' } })])).toBe('');
    expect(errs([exp({ values: { clearance: len(0.1e-3) }, sources: { clearance: 'fab-profile' } })])).toMatch(/carries no profile/);
  });
  it('a non-VERIFIED profile needs its status tag in the note; a stale one needs the word stale; ageDays and stale must agree', () => {
    const p = { id: 'p', status: 'UNVERIFIED' as const, ageDays: 10, stale: false };
    const base = { values: { clearance: len(0.1e-3) }, sources: { clearance: 'fab-profile' as const } };
    expect(errs([exp({ ...base, profile: p, note: 'clearance from p' })])).toMatch(/must carry that tag visibly/);
    expect(errs([exp({ ...base, profile: p, note: 'clearance from p, UNVERIFIED' })])).toBe('');
    expect(errs([exp({ ...base, profile: { ...p, ageDays: 400, stale: true }, note: 'UNVERIFIED' })])).toMatch(/must say so/);
    expect(errs([exp({ ...base, profile: { ...p, ageDays: 400, stale: false }, note: 'UNVERIFIED' })])).toMatch(/stale must equal/);
    expect(errs([exp({ ...base, profile: { ...p, ageDays: -1 }, note: 'UNVERIFIED' })])).toMatch(/non-negative/);
    expect(errs([exp({ ...base, profile: { ...p, status: 'VERIFIED' }, note: 'n' })])).toBe('');
  });
  it('duplicate ids, empty notes and empty values are rejected', () => {
    expect(errs([exp(), exp()])).toMatch(/duplicate id/);
    expect(errs([exp({ note: ' ' })])).toMatch(/note must not be empty/);
    expect(errs([exp({ values: {} })])).toMatch(/at least one value/);
  });
});

describe('assertCalcResult on a real path result', () => {
  const inputs: Inputs = {
    vsource: q(12, DIM.VOLTAGE),
    loadCurrent: q(2, DIM.CURRENT),
    returnPath: 'not-counted',
    elements: [{ kind: 'connector', label: 'c', resistance: q(0.01, DIM.RESISTANCE), sourceNote: 'test', ratedCurrent: q(4, DIM.CURRENT), ratingSource: 'test' }],
  };
  const base = (): CalcResult => {
    const out = compute({
      ...inputs,
      elements: [
        { kind: 'trace', label: 't', layer: 'outer', length: q(0.1, DIM.LENGTH), width: q(1e-3, DIM.LENGTH), copperThickness: q(35e-6, DIM.LENGTH), copperBasis: 'finished', allowedTempRise: q(20, DIM.TEMPERATURE_DIFFERENCE) },
        ...inputs.elements,
      ],
    });
    if (!out.ok) throw new Error(out.error.message);
    return structuredClone(out.value);
  };
  it('the unmodified result is valid and carries a typed export', () => {
    const r = base();
    expect(assertCalcResult(r).ok).toBe(true);
    expect(r.exports?.length).toBe(1);
  });
  it('an export with an unknown key, an absolute-temperature element or a profile missing from the result is reported', () => {
    const a = base();
    (a.exports as CalcExport[])[0] = exp({ values: { colour: len(1e-3) } });
    expect(assertCalcResult(a).ok).toBe(false);
    const b = base();
    (b.elements as ElementResult[])[0] = el('t', 1, 4, { load: q(300, DIM.ABS_TEMPERATURE), limit: q(400, DIM.ABS_TEMPERATURE), margin: q(100, DIM.ABS_TEMPERATURE) });
    expect(assertCalcResult(b).ok).toBe(false);
    const c = base();
    (c.exports as CalcExport[])[0] = exp({ values: { clearance: len(0.1e-3) }, sources: { clearance: 'fab-profile' }, profile: { id: 'ghost', status: 'VERIFIED', ageDays: 1, stale: false } });
    const out = assertCalcResult(c);
    expect(out.ok ? '' : out.error.join(' ')).toMatch(/names fab profile "ghost" but the result's fabProfile is absent/);
  });
  it('a non-finite export value is still reported by assertCalcResult', () => {
    const r = base();
    (r.exports as CalcExport[])[0] = exp({ id: 'badexport', values: { width: { si: Infinity, dim: DIM.LENGTH } as Quantity } });
    expect(assertCalcResult(r).ok).toBe(false);
  });
});
