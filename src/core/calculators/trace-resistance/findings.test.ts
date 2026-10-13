import { describe, expect, it } from 'vitest';
import { fromUnit } from '../../units';
import { compute } from './calc';
import type { Inputs } from './calc';

// Phase 1 validation finding PCB-4: the voltage drop must carry a scope label.
const base: Inputs = { layer: 'outer', length: fromUnit(40, 'mm'), width: fromUnit(1.5, 'mm'), copperWeight: fromUnit(1, 'oz/ft2') };

describe('PCB-4: voltage drop carries a scope label', () => {
  it('with a current: warning and assumption state one conductor, one direction, and what is excluded', () => {
    const o = compute({ ...base, current: fromUnit(3, 'A') });
    if (!o.ok) throw new Error(o.error.message);
    const w = o.value.warnings.find((x) => x.code === 'VOLTAGE_DROP_SCOPE');
    expect(w).toBeDefined();
    for (const re of [/one conductor/i, /one direction/i, /return path/i, /vias/i, /pads/i, /connectors/i, /necking/i, /path calculator/i]) {
      expect(w?.message).toMatch(re);
    }
    expect(o.value.assumptions.join(' ')).toMatch(/one conductor, one direction/i);
    expect(o.value.results.some((r) => r.name === 'voltage drop')).toBe(true);
  });
  it('without a current there is no drop and no scope warning', () => {
    const o = compute(base);
    if (!o.ok) throw new Error(o.error.message);
    expect(o.value.results.some((r) => r.name === 'voltage drop')).toBe(false);
    expect(o.value.warnings.some((w) => w.code === 'VOLTAGE_DROP_SCOPE')).toBe(false);
  });
});
