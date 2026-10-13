import { describe, expect, it } from 'vitest';
import { fromUnit } from '../../units';
import type { CalcResult } from '../../result';
import { compute } from './calc';
import type { Inputs } from './calc';

// Phase 1 validation findings PCB-2 (wording) and F-2 (thicknessBasis with weight).
const oz1 = fromUnit(1, 'oz/ft2');

function ok(i: Inputs): CalcResult {
  const o = compute(i);
  if (!o.ok) throw new Error(o.error.message);
  return o.value;
}

describe('PCB-2 wording and F-2 basis guard', () => {
  it('outer caution: no "usually"; IPC-6012 minimum indexed by starting foil, secondhand, S-009, not typical', () => {
    const w = ok({ weight: oz1, layer: 'outer' }).warnings.find((x) => x.code === 'OUTER_FINISHES_THICKER');
    expect(w?.message).not.toMatch(/usually/i);
    for (const re of [/IPC-6012/, /minimum/i, /starting foil/i, /secondhand/i, /S-009/, /not typical/i, /\+37/]) expect(w?.message).toMatch(re);
  });
  it('plating estimate is labelled an upper estimate and not a design input', () => {
    const r = ok({ weight: oz1, layer: 'outer', platingThickness: fromUnit(25, 'um') });
    const step = r.steps.find((s) => /Estimated finished thickness/.test(s.label));
    expect(step?.label).toMatch(/upper estimate/i);
    const w = r.warnings.find((x) => x.code === 'PLATING_UPPER_ESTIMATE');
    expect(w?.message).toMatch(/upper estimate/i);
    expect(w?.message).toMatch(/not .*design input/i);
    expect(w?.message).toMatch(/fabricator/i);
    expect(ok({ weight: oz1, layer: 'outer' }).warnings.some((x) => x.code === 'PLATING_UPPER_ESTIMATE')).toBe(false);
  });
  it('thicknessBasis together with a weight is rejected, naming the field', () => {
    const o = compute({ weight: oz1, layer: 'outer', thicknessBasis: 'finished' });
    expect(o.ok).toBe(false);
    if (!o.ok) {
      expect([o.error.code, o.error.field]).toEqual(['INVALID_INPUT', 'thicknessBasis']);
      expect(o.error.message).toMatch(/weight/i);
    }
  });
});
