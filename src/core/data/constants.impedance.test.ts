import { describe, expect, it } from 'vitest';
import { LEDGER } from './ledger';
import { C_LEDGER_ID, C_M_PER_S, ETA0_OHM, MU0_H_PER_M, Z_PREFACTOR_OHM, Z_STRIPLINE_PREFACTOR_OHM } from './constants';

// Expected values restated from ledger rows S-029 (c exact) and S-013 (mu0 = 4 pi 1e-7), and from the oracle constants in
// tools/reference/ref_impedance.py (eta0 = mu0 c = 376.730313..., eta0/(2 pi) = 59.9584916...).
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

describe('impedance constants [S-029, S-013]', () => {
  it('c is exactly 299 792 458 m/s', () => {
    expect(C_M_PER_S).toBe(299792458);
  });
  it('S-029 is a VERIFIED ledger row', () => {
    expect(C_LEDGER_ID).toBe('S-029');
    expect(LEDGER.find((r) => r.id === C_LEDGER_ID)?.status).toBe('VERIFIED');
  });
  it('eta0 = mu0 c is about 376.7303 ohm', () => {
    expect(ETA0_OHM).toBe(MU0_H_PER_M * 299792458);
    expect(relErr(ETA0_OHM, 376.730313)).toBeLessThan(1e-8);
  });
  it('eta0/(2 pi) = 2e-7 c = 59.9584916 ohm and eta0/4 = pi 1e-7 c', () => {
    expect(relErr(Z_PREFACTOR_OHM, 2e-7 * 299792458)).toBeLessThan(1e-15);
    expect(relErr(Z_PREFACTOR_OHM, 59.9584916)).toBeLessThan(1e-9);
    expect(relErr(Z_STRIPLINE_PREFACTOR_OHM, Math.PI * 1e-7 * 299792458)).toBeLessThan(1e-15);
  });
  it('the textbook roundings 60 and 30 pi are about 0.07 % high (Q-1)', () => {
    expect(relErr(60, Z_PREFACTOR_OHM)).toBeGreaterThan(6e-4);
    expect(relErr(60, Z_PREFACTOR_OHM)).toBeLessThan(8e-4);
    expect(relErr(30 * Math.PI, Z_STRIPLINE_PREFACTOR_OHM)).toBeGreaterThan(6e-4);
    expect(relErr(30 * Math.PI, Z_STRIPLINE_PREFACTOR_OHM)).toBeLessThan(8e-4);
  });
});
