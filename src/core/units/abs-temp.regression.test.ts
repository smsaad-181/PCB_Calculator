import { describe, expect, it } from 'vitest';
import { DIM, InvalidValueError, add, fromUnit, parseQuantity, q, sub } from './index';

/*
 * Calc-validator finding m-1: absolute temperature below 0 K is non-physical and must be rejected.
 * Tolerance: a value within 1e-9 K below zero (float noise, e.g. -459.67 degF -> -5.7e-14 K) is accepted.
 */
describe('absolute temperature < 0 K is rejected', () => {
  it('q(-1, ABS_TEMPERATURE) throws InvalidValueError', () => {
    expect(() => q(-1, DIM.ABS_TEMPERATURE)).toThrow(InvalidValueError);
  });
  it('q(0, ABS_TEMPERATURE) is allowed (0 K exactly)', () => {
    expect(q(0, DIM.ABS_TEMPERATURE).si).toBe(0);
  });
  it('fromUnit(-300, degC) throws InvalidValueError', () => {
    expect(() => fromUnit(-300, '°C')).toThrow(InvalidValueError);
  });
  it('fromUnit(-500, degF) throws InvalidValueError', () => {
    expect(() => fromUnit(-500, '°F')).toThrow(InvalidValueError);
  });
  it('fromUnit(-273.15, degC) is 0 K and allowed', () => {
    expect(Math.abs(fromUnit(-273.15, '°C').si)).toBeLessThanOrEqual(1e-9);
  });
  it('fromUnit(-459.67, degF) (absolute zero, float noise ~ -5.7e-14 K) is allowed', () => {
    expect(Math.abs(fromUnit(-459.67, '°F').si)).toBeLessThanOrEqual(1e-9);
  });
  it('fromUnit(-1, K) throws', () => {
    expect(() => fromUnit(-1, 'K')).toThrow(InvalidValueError);
  });
  it('parseQuantity("-300 °C") returns ok:false with InvalidValueError', () => {
    const r = parseQuantity('-300 °C');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(InvalidValueError);
  });
  it('parseQuantity("-500 °F") returns ok:false', () => {
    expect(parseQuantity('-500 °F').ok).toBe(false);
  });
  it('parseQuantity("-40 °C") is still fine', () => {
    const r = parseQuantity('-40 °C');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.si).toBeCloseTo(233.15, 9);
  });
  it('absTemp - deltaT below 0 K throws InvalidValueError', () => {
    expect(() => sub(q(10, DIM.ABS_TEMPERATURE), q(20, DIM.TEMPERATURE_DIFFERENCE))).toThrow(InvalidValueError);
  });
  it('absTemp - deltaT landing exactly on 0 K is allowed', () => {
    expect(sub(q(10, DIM.ABS_TEMPERATURE), q(10, DIM.TEMPERATURE_DIFFERENCE)).si).toBe(0);
  });
  it('absTemp + negative deltaT below 0 K throws; deltaT + absTemp likewise', () => {
    expect(() => add(q(10, DIM.ABS_TEMPERATURE), q(-20, DIM.TEMPERATURE_DIFFERENCE))).toThrow(InvalidValueError);
    expect(() => add(q(-20, DIM.TEMPERATURE_DIFFERENCE), q(10, DIM.ABS_TEMPERATURE))).toThrow(InvalidValueError);
  });
  it('negative temperature DIFFERENCES remain legal', () => {
    expect(q(-5, DIM.TEMPERATURE_DIFFERENCE).si).toBe(-5);
    expect(sub(q(10, DIM.ABS_TEMPERATURE), q(20, DIM.ABS_TEMPERATURE)).si).toBe(-10);
  });
});
