import { describe, expect, it } from 'vitest';
import { fromUnit } from '../units';
import { assertCalcResult } from '../result';
import { compute } from '../calculators/microstrip/calc';
import { dimensionless } from '../calculators/impedance-shared';
import { deriveMicrostrip, exportStackup, importStackup, validateStackup } from '.';

// Stackup to microstrip wiring: the geometry derived from a stackup (h, t, er and their source labels) feeds the calculator, and the
// result equals entering the same numbers by hand. Also checks the stack survives a JSON round trip before use.

const um = (n: number) => fromUnit(n, 'um');

describe('stackup to microstrip calculator', () => {
  const v = validateStackup({
    name: 'demo',
    layers: [
      { kind: 'soldermask', name: 'mask', thickness: um(20) },
      { kind: 'copper', name: 'L1', weight: fromUnit(1, 'oz/ft2') },
      { kind: 'dielectric', name: 'pp', thickness: um(200), er: 4.2, source: 'user-entered, datasheet X rev A @ 1 GHz' },
      { kind: 'copper', name: 'L2', thickness: um(35) },
    ],
  });
  if (!v.ok) throw new Error('stack');

  it('derived h, t and er give the same Z0 as hand-entered values, with the source labels on the inputs', () => {
    const back = importStackup(exportStackup(v.value));
    if (!back.ok) throw new Error('round trip');
    const d = deriveMicrostrip(back.value, 'L1');
    if (!d.ok) throw new Error(d.error.message);
    const out = compute({ width: um(350), height: d.value.h, er: dimensionless(d.value.er), thickness: d.value.t, erSource: d.value.erSource, geometrySource: 'stackup "demo", layer L1' });
    if (!out.ok) throw new Error(out.error.message);
    expect(assertCalcResult(out.value).ok).toBe(true);
    const hand = compute({ width: um(350), height: um(200), er: dimensionless(4.2) });
    if (!hand.ok) throw new Error(hand.error.message);
    const z = (r: typeof out.value) => r.results.find((x) => x.name === 'characteristic impedance Z0')?.value.si;
    expect(z(out.value)).toBeCloseTo(z(hand.value) ?? 0, 9);
    expect(out.value.inputs.find((i) => i.name === 'er')?.sourceDetail).toContain('datasheet X rev A');
    expect(d.value.soldermask).toBe(true);
    expect(d.value.copper.basis).toBe('nominal');
    // t from a 1 oz weight (default convention, 35 um) is only used by the opt-in thickness variant; the base model warns it is ignored.
    expect(out.value.warnings.map((w) => w.code)).toContain('ZERO_THICKNESS_MODEL');
  });
});
