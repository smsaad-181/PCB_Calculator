import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, q } from '../../units';
import type { Quantity } from '../../units';
import { compute } from './calc';
import type { Inputs } from './calc';
import { validate } from './guards';

// Guards and the less common input paths of the path/load calculator. Test values only.

const mm = (n: number): Quantity => fromUnit(n, 'mm');
const um = (n: number): Quantity => fromUnit(n, 'um');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const dK = (n: number): Quantity => fromUnit(n, 'ddegC');
const V = (n: number): Quantity => q(n, DIM.VOLTAGE);
const A = (n: number): Quantity => q(n, DIM.CURRENT);
const R = (n: number): Quantity => q(n, DIM.RESISTANCE);

const feed = { vsource: V(12), loadCurrent: A(1), returnPath: 'not-counted' };
const trace = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'trace',
  label: 't',
  layer: 'outer',
  length: mm(100),
  width: mm(1),
  copperThickness: um(35),
  copperBasis: 'finished',
  allowedTempRise: dK(10),
  ...extra,
});
const via = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'via',
  label: 'v',
  finishedHoleDiameter: mm(0.3),
  platingThickness: um(25),
  barrelLength: mm(1.6),
  count: 1,
  ...extra,
});
const conn = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ kind: 'connector', label: 'c', resistance: R(0.01), sourceNote: 'test', ...extra });
const err = (elements: unknown, extra: Record<string, unknown> = {}) => {
  const r = validate({ ...feed, elements, ...extra });
  if (r.ok) throw new Error('expected an error');
  return r.error;
};

describe('element shape', () => {
  it('a non-object element, a bad label and an unknown kind are rejected with their path', () => {
    expect(err([3]).field).toBe('elements[0]');
    expect(err([{ ...conn(), label: '' }]).field).toBe('elements[0].label');
    expect(err([{ ...conn(), label: 'x'.repeat(81) }]).field).toBe('elements[0].label');
    expect(err([{ ...conn(), kind: 'wire' }]).field).toBe('elements[0].kind');
    expect(err('nope').field).toBe('elements');
    expect(err([conn()], { returnPath: 'included-in-list', returnElements: 'nope' }).field).toBe('returnElements');
  });
  it('an unknown key names itself', () => {
    expect(err([conn({ colour: 'red' })]).field).toBe('elements[0].colour');
  });
  it('a connector needs a source note and a resistance', () => {
    expect(err([conn({ sourceNote: '' })]).field).toBe('elements[0].sourceNote');
    expect(err([conn({ resistance: undefined })]).field).toBe('elements[0].resistance');
  });
});

describe('trace elements', () => {
  it('a wrong-dimension conductor temperature names conductorTemperature, not ambient', () => {
    expect(err([trace({ conductorTemperature: dK(5) })]).field).toBe('elements[0].conductorTemperature');
  });
  it('a foil convention and a copper weight are accepted and carried through', () => {
    const r = compute({ ...feed, elements: [trace({ copperThickness: undefined, copperBasis: undefined, copperWeight: fromUnit(1, 'oz/ft2'), convention: 'nominal-1.35mil', conductorTemperature: degC(25) })] } as unknown as Inputs);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.assumptions.join(' ')).toMatch(/nominal-1\.35mil/);
  });
  it('the allowed rise must be a temperature difference and positive', () => {
    expect(err([trace({ allowedTempRise: q(0, DIM.TEMPERATURE_DIFFERENCE) })]).field).toBe('elements[0].allowedTempRise');
    expect(err([trace({ allowedTempRise: V(10) })]).code).toBe('DIMENSION');
  });
});

describe('via elements', () => {
  it('each required field has its own error', () => {
    expect(err([via({ finishedHoleDiameter: undefined })]).field).toBe('elements[0].finishedHoleDiameter');
    expect(err([via({ barrelLength: undefined })]).field).toBe('elements[0].barrelLength');
    expect(err([via({ platingThickness: mm(-1) })]).field).toBe('elements[0].platingThickness');
    expect(err([via({ finishedHoleDiameter: A(1) })]).code).toBe('DIMENSION');
    expect(err([via({ barrelLength: A(1) })]).code).toBe('DIMENSION');
    expect(err([via({ conductorTemperature: dK(5) })]).field).toBe('elements[0].conductorTemperature');
    expect(err([via({ resistivity: R(1) })]).field).toBe('elements[0].resistivity');
    expect(err([via({ drillDiameter: R(1) })]).field).toBe('elements[0].drillDiameter');
    expect(err([via({ padDiameter: R(1) })]).field).toBe('elements[0].padDiameter');
  });
  it('a rating error on a via names the via', () => {
    expect(err([via({ ratedCurrent: A(2) })]).field).toBe('elements[0].ratingSource');
  });
  it('a pad larger than the hole and a drill at least the finished hole are accepted', () => {
    expect(validate({ ...feed, elements: [via({ drillDiameter: mm(0.35), padDiameter: mm(0.7) })] }).ok).toBe(true);
    expect(validate({ ...feed, elements: [via({ padDiameter: mm(0.7) })] }).ok).toBe(true);
    expect(err([via({ padDiameter: mm(0.2) })]).code).toBe('OUT_OF_DOMAIN');
  });
});

describe('fab profile inputs', () => {
  it('today without a profile is rejected; layerCount without a profile is rejected', () => {
    expect(err([conn()], { today: '2026-10-20' }).field).toBe('today');
    expect(err([conn()], { layerCount: '2' }).field).toBe('layerCount');
  });
});
