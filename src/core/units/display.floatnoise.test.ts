/**
 * Float-noise guard of the directional display rounding: a double within ~4 ulp (relative) of a rounding boundary is
 * taken as exactly on it, so exact values print exactly, while genuinely larger values (>= ~1e-12 relative) still round
 * the safe way. Regression: 'Power in R2 = 64.0001 uW' for an exact 64 uW, 'Voltage across R1 = 2.40001 V'.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, formatDual, formatDualThickness, formatFor, parseQuantity, q, type RoundDirection } from './index';
import { ceilGuarded, floorGuarded, ROUND_GUARD } from './round-guard';
import { formatDesignValue, formatMargin, formatResult, formatStep } from '../format-result';

const EPS = Number.EPSILON;
const ulpUp = (x: number, n: number): number => x * (1 + n * EPS);
const ulpDown = (x: number, n: number): number => x * (1 - n * EPS);

describe('round-guard helpers', () => {
  it('absorb noise within 4 ulp and nothing larger', () => {
    expect(ROUND_GUARD).toBe(4 * EPS);
    expect(ceilGuarded(640000.0000000001)).toBe(640000);
    expect(ceilGuarded(640000.000001)).toBe(640001);
    expect(floorGuarded(639999.9999999999)).toBe(640000);
    expect(floorGuarded(639999.999999)).toBe(639999);
    expect(ceilGuarded(-640000.0000000001)).toBe(-640000);
    expect(floorGuarded(-640000.000001)).toBe(-640001);
    expect(ceilGuarded(2.5)).toBe(3);
    expect(floorGuarded(2.5)).toBe(2);
  });
});

describe('the reported artefacts, through the real formatters', () => {
  const P = 64.00000000000001e-6; // noisy 64 uW
  const V = 2.4000000000000004;
  it('prints 64 uW and 2.4 V for up/prediction', () => {
    expect(formatFor(q(P, DIM.POWER), { round: 'up' })).toBe('64 µW');
    expect(formatFor(q(V, DIM.VOLTAGE), { round: 'up' })).toBe('2.4 V');
    expect(formatResult({ value: q(P, DIM.POWER), bound: 'prediction' }, { accuracyClass: 'exact' })).toBe('64 µW');
    expect(formatResult({ value: q(V, DIM.VOLTAGE), bound: 'prediction' }, { accuracyClass: 'exact' })).toBe('2.4 V');
    expect(formatStep({ value: q(V, DIM.VOLTAGE), bound: 'prediction' }, { accuracyClass: 'exact' })).toBe('2.4 V');
    expect(
      formatDesignValue({ calculated: q(V, DIM.VOLTAGE), recommended: q(V, DIM.VOLTAGE), direction: 'min-requirement' } as never, 'calculated', {
        accuracyClass: 'exact',
      }),
    ).toBe('2.4 V');
  });
  it('genuine excess still rounds up: 1e-9 relative (and 1e-12) above the 6 s.f. boundary', () => {
    expect(formatFor(q(64e-6 * (1 + 1e-9), DIM.POWER), { round: 'up' })).toBe('64.0001 µW');
    expect(formatFor(q(2.4 * (1 + 1e-9), DIM.VOLTAGE), { round: 'up' })).toBe('2.40001 V');
    expect(formatFor(q(2.4 * (1 + 1e-12), DIM.VOLTAGE), { round: 'up' })).toBe('2.40001 V');
  });
  it('down: noise below the boundary prints the boundary; genuine deficit still rounds down', () => {
    expect(formatFor(q(ulpDown(2.4, 2), DIM.VOLTAGE), { round: 'down' })).toBe('2.4 V');
    expect(formatFor(q(ulpDown(64e-6, 2), DIM.POWER), { round: 'down' })).toBe('64 µW');
    expect(formatFor(q(2.4 * (1 - 1e-9), DIM.VOLTAGE), { round: 'down' })).toBe('2.39999 V');
  });
  it('negative values, both directions', () => {
    expect(formatFor(q(-V, DIM.VOLTAGE), { round: 'down' })).toBe('-2.4 V');
    expect(formatFor(q(-V, DIM.VOLTAGE), { round: 'up' })).toBe('-2.4 V');
    expect(formatFor(q(-2.4 * (1 + 1e-9), DIM.VOLTAGE), { round: 'down' })).toBe('-2.40001 V');
    expect(formatFor(q(-2.4 * (1 - 1e-9), DIM.VOLTAGE), { round: 'up' })).toBe('-2.39999 V');
  });
  it('0.1 + 0.2 style sums', () => {
    expect(formatFor(q(0.1 + 0.2, DIM.VOLTAGE), { round: 'up' })).toBe('300 mV');
    expect(formatFor(q(0.1 + 0.2, DIM.CURRENT), { round: 'up' })).toBe('300 mA');
    expect(formatFor(q(0.1 + 0.7, DIM.VOLTAGE), { round: 'down' })).toBe('800 mV');
    expect(formatFor(q(0.1 + 0.2, DIM.VOLTAGE), { round: 'nearest' })).toBe('300 mV');
  });
});

describe('every function that shares the routine', () => {
  it('formatFor fixed decimals (length, area, temperature, unit override)', () => {
    expect(formatFor(q(ulpUp(1.149e-3, 2), DIM.LENGTH), { round: 'up' })).toBe('1.149 mm');
    expect(formatFor(q(ulpDown(1.149e-3, 2), DIM.LENGTH), { round: 'down' })).toBe('1.149 mm');
    expect(formatFor(q(1.1490001e-3, DIM.LENGTH), { round: 'up' })).toBe('1.15 mm');
    expect(formatFor(q(ulpUp(0.25, 3) * 1e-6, DIM.AREA), { unit: 'mm2', round: 'up' })).toBe('0.25 mm2');
    expect(formatFor(q(ulpUp(300, 3), DIM.ABS_TEMPERATURE), { unit: 'K', round: 'up' })).toBe('300 K');
  });
  it('formatDual and formatDualThickness', () => {
    expect(formatDual(q(ulpUp(1.149e-3, 2), DIM.LENGTH), { round: 'up' })).toMatch(/^1\.149 mm /);
    expect(formatDualThickness(q(ulpUp(35e-6, 2), DIM.LENGTH), { round: 'up' })).toMatch(/^35 µm /);
    expect(formatDualThickness(q(ulpDown(35e-6, 2), DIM.LENGTH), { round: 'down' })).toMatch(/^35 µm /);
    expect(formatDualThickness(q(35e-6 * (1 + 1e-9), DIM.LENGTH), { round: 'up' })).toMatch(/^35\.01 µm /);
  });
  it('formatMargin (down) and sig-fig dimensionless', () => {
    const el = { margin: q(ulpDown(2.4, 2), DIM.VOLTAGE) } as never;
    expect(formatMargin(el, { accuracyClass: 'exact' })).toBe('+2.4 V');
    expect(formatFor(q(ulpUp(1.5, 2), DIM.DIMENSIONLESS), { round: 'up', accuracyClass: 'estimate' })).toBe('1.5');
  });
  it('nearest: a noisy decimal tie rounds half away from zero, like its exact decimal', () => {
    // decimal ties that are not exact doubles
    expect(formatFor(q(2.5, DIM.DIMENSIONLESS), { accuracyClass: 'estimate' })).toBe('2.5');
    expect(formatFor(q(0.1235, DIM.DIMENSIONLESS), { accuracyClass: 'empirical' })).toBe('0.124');
    expect(formatFor(q(-0.1235, DIM.DIMENSIONLESS), { accuracyClass: 'empirical' })).toBe('-0.124');
    expect(formatFor(q(0.285, DIM.DIMENSIONLESS), { accuracyClass: 'estimate' })).toBe('0.29');
    expect(formatFor(q(1.005, DIM.DIMENSIONLESS), { accuracyClass: 'empirical' })).toBe('1.01');
    expect(formatFor(q(1.0049, DIM.DIMENSIONLESS), { accuracyClass: 'empirical' })).toBe('1');
  });
});

describe('properties', () => {
  const dirs: RoundDirection[] = ['up', 'down'];
  const dims = [DIM.VOLTAGE, DIM.POWER, DIM.RESISTANCE, DIM.CURRENT, DIM.CAPACITANCE, DIM.DIMENSIONLESS];
  const mag = fc.double({ min: 1e-11, max: 1e8, noNaN: true });
  const sgn = fc.boolean();

  it('never below (up) / above (down) the true value by more than 4 ulp, any sign, any dimension', () => {
    fc.assert(
      fc.property(mag, sgn, fc.constantFrom(...dims), fc.constantFrom(...dirs), (m, neg, dim, dir) => {
        const si = neg ? -m : m;
        const r = parseQuantity(formatFor(q(si, dim), { round: dir }), dim);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const tol = 4 * EPS * Math.abs(si);
        if (dir === 'up') expect(r.value.si).toBeGreaterThanOrEqual(si - tol);
        else expect(r.value.si).toBeLessThanOrEqual(si + tol);
      }),
      { numRuns: 2000 },
    );
  });

  it('values just above/below a boundary by >= 1e-12 relative still go the safe way (strictly)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100000, max: 999999 }), fc.integer({ min: -9, max: 3 }), (n, e) => {
        const b = n * 10 ** e; // a 6 s.f. boundary (approximately representable)
        const up = formatFor(q(b * (1 + 1e-11), DIM.DIMENSIONLESS), { round: 'up' });
        const dn = formatFor(q(b * (1 - 1e-11), DIM.DIMENSIONLESS), { round: 'down' });
        const ru = parseQuantity(up, DIM.DIMENSIONLESS);
        const rd = parseQuantity(dn, DIM.DIMENSIONLESS);
        expect(ru.ok && ru.value.si > b * (1 + 5e-12)).toBe(true);
        expect(rd.ok && rd.value.si < b * (1 - 5e-12)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it('exact decimal inputs print their exact decimal in every direction', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100000, max: 999999 }), fc.integer({ min: -3, max: 3 }), fc.constantFrom<RoundDirection>('up', 'down', 'nearest'), (n, e, dir) => {
        // 6 digits, built from a decimal string so it is the nearest double; dimensionless parses exactly (no prefix arithmetic).
        const v = Number(`${n}e${e}`);
        const text = formatFor(q(v, DIM.DIMENSIONLESS), { round: dir });
        const back = parseQuantity(text, DIM.DIMENSIONLESS);
        expect(back.ok).toBe(true);
        if (back.ok) expect(back.value.si).toBe(v);
      }),
      { numRuns: 1500 },
    );
  });

  it('noisy sums of exact decimals print the exact decimal', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999 }), fc.integer({ min: 1, max: 999 }), fc.constantFrom(...dirs), (a, b, dir) => {
        const sum = a / 1000 + b / 1000; // e.g. 0.1 + 0.2
        const exact = Number(`${a + b}e-3`);
        const printed = parseQuantity(formatFor(q(sum, DIM.DIMENSIONLESS), { round: dir }), DIM.DIMENSIONLESS);
        expect(printed.ok).toBe(true);
        if (printed.ok) expect(printed.value.si).toBe(exact);
      }),
      { numRuns: 1500 },
    );
  });
});
