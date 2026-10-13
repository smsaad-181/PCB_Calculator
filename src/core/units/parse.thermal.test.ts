/** Thermal resistance (K/W) and thermal resistance per length (K*m/W) field-aware parsing, display and dimension rules. */
import { describe, expect, it } from 'vitest';
import { DIM, describeParsed, formatFor, fromUnit, mul, parseQuantity, parseQuantityDetailed, q, sameDim, toUnit } from './index';

const THETA = DIM.THERMAL_RESISTANCE;
const PER_LEN = DIM.THERMAL_RESISTANCE_PER_LENGTH;
const PER_LEN_BY_ALGEBRA = mul(q(1, THETA), q(1, DIM.LENGTH)).dim;

function si(text: string, dim: typeof THETA): number {
  const r = parseQuantity(text, dim);
  if (!r.ok) throw new Error(`${text}: ${r.error.message}`);
  expect(r.value.dim).toBe(dim);
  return r.value.si;
}

describe('thermal resistance field (K/W)', () => {
  it.each([
    ['50 K/W', 50],
    ['50K/W', 50],
    ['46.7 K/W', 46.7],
    ['50 °C/W', 50],
    ['50 degC/W', 50],
  ])('%s -> %f K/W, no offset', (t, v) => {
    expect(si(t, THETA)).toBe(v);
  });
  it('°C/W is a delta per watt: no 273.15 offset, dimension is not absolute temperature', () => {
    const r = parseQuantity('0 °C/W', THETA);
    expect(r.ok && r.value.si).toBe(0);
    expect(THETA.kind).toBe('plain');
    expect(sameDim(q(1, THETA), q(1, DIM.ABS_TEMPERATURE))).toBe(false);
    expect(parseQuantity('50 °C/W', DIM.ABS_TEMPERATURE).ok).toBe(false);
    expect(parseQuantity('50 °C/W', DIM.TEMPERATURE_DIFFERENCE).ok).toBe(false);
  });
  it('rejects bare numbers, bare prefixes, and wrong-dimension units', () => {
    for (const t of ['50', 'k', '50 k', '50 m', '50 M', '50 K', '50 W', '50 K*m/W', '50 Ω']) {
      expect(parseQuantity(t, THETA).ok, t).toBe(false);
    }
    const bare = parseQuantity('50 k', THETA);
    if (!bare.ok) expect(bare.error.message).toContain('K/W');
  });
});

describe('thermal resistance per length field (K*m/W)', () => {
  it('dimension equals thermal resistance times length', () => {
    expect(sameDim(q(1, PER_LEN), q(1, PER_LEN_BY_ALGEBRA))).toBe(true);
    expect(PER_LEN.kind).toBe('plain');
  });
  it.each([
    ['25 K·m/W', 25],
    ['25 K*m/W', 25],
    ['25 K.m/W', 25],
    ['25 K m/W', 25],
    ['25K*m/W', 25],
    ['25 °C·m/W', 25],
    ['25 °C*m/W', 25],
    ['25 degC*m/W', 25],
    ['25 K·mm/W', 0.025],
    ['25 K*mm/W', 0.025],
  ])('%s -> %f K m/W', (t, v) => {
    expect(si(t, PER_LEN)).toBeCloseTo(v, 12);
  });
  it('rejects ambiguous or wrong forms', () => {
    for (const t of ['25', 'k', '25 k', '25 m', '25 K/W', '25 K/W/m', '250 K/W/m', '25 K/(W/m)', '25 K·m', '25 m/W', '25 K']) {
      expect(parseQuantity(t, PER_LEN).ok, t).toBe(false);
    }
  });
  it('K m/W is refused in the K/W field and vice versa', () => {
    expect(parseQuantity('25 K*m/W', THETA).ok).toBe(false);
    expect(parseQuantity('25 K/W', PER_LEN).ok).toBe(false);
  });
  it('without a field the unit still resolves to its own dimension', () => {
    const r = parseQuantity('25 K*m/W');
    expect(r.ok && sameDim(r.value, q(1, PER_LEN))).toBe(true);
  });
  it('error message lists accepted units', () => {
    const r = parseQuantity('25 zz', PER_LEN);
    expect(!r.ok && r.error.message).toContain('K·m/W');
  });
  it('detailed parser agrees', () => {
    const r = parseQuantityDetailed('25 K*m/W', PER_LEN);
    expect(r.ok && r.value.si).toBe(25);
  });
});

describe('conversion and display', () => {
  it('fromUnit/toUnit round trip', () => {
    expect(toUnit(fromUnit(25, 'K·m/W'), 'K*mm/W')).toBeCloseTo(25000, 9);
    expect(toUnit(fromUnit(25, '°C/W'), 'K/W')).toBe(25);
    expect(() => toUnit(fromUnit(25, 'K·m/W'), 'K/W')).toThrow();
  });
  it('formats K/W and K m/W', () => {
    expect(formatFor(q(46.7, THETA))).toContain('46.7');
    expect(formatFor(q(46.7, THETA))).toContain('K/W');
    const s = formatFor(q(25, PER_LEN));
    expect(s).toContain('25');
    expect(s).toContain('K·m/W');
  });
  it('echo names the field', () => {
    expect(describeParsed(q(46.7, THETA), THETA)).toBe('= 46.7 K/W (thermal resistance)');
    expect(describeParsed(q(25, PER_LEN), PER_LEN)).toContain('(thermal resistance per length)');
  });
});
