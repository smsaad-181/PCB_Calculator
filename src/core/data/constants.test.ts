import { describe, expect, it } from 'vitest';
import { LEDGER } from './ledger';
import {
  COPPER_ALPHA_20C,
  COPPER_RESISTIVITY_20C,
  DEFAULT_COPPER_K_MATERIAL,
  DEFAULT_FOIL_CONVENTION,
  copperThermalConductivity,
  foilAssumptionText,
  foilSpreadPercent,
  copperBasisFactors,
  copperBasisFromFoil,
} from './constants';
import { DIM, FOIL_CONVENTIONS, div, foilThickness, fromUnit, mul, q, sameDim } from '../units';
import type { FoilConvention } from '../units';

// Expected values come from ledger rows S-003, S-004, S-007 and the Python oracle (tools/reference/ref_calcs.py,
// mirrored in docs/golden-vectors.json). The implementation is never consulted for an expected value.

const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const row = (id: string) => LEDGER.find((r) => r.id === id);

describe('copper electrical constants [S-004]', () => {
  it('rho20 is exactly 1/58e6 ohm*m (IACS defining value, R-11)', () => {
    expect(COPPER_RESISTIVITY_20C).toBe(1 / 58e6);
  });
  it('rho20 is not the 5 s.f. rounding 1.7241e-8 (relative gap about 2.2e-5)', () => {
    expect(COPPER_RESISTIVITY_20C).not.toBe(1.7241e-8);
    const gap = relErr(COPPER_RESISTIVITY_20C, 1.7241e-8);
    expect(gap).toBeGreaterThan(1e-5);
    expect(gap).toBeLessThan(4e-5);
  });
  it('rho20 x 58 MS/m = 1 to machine precision', () => {
    expect(relErr(COPPER_RESISTIVITY_20C * 58e6, 1)).toBeLessThanOrEqual(1e-15);
  });
  it('alpha20 is 0.00393 per K', () => {
    expect(COPPER_ALPHA_20C).toBe(0.00393);
  });
  it('S-004 exists in the ledger and is VERIFIED (status is read, never assumed)', () => {
    expect(row('S-004')?.status).toBe('VERIFIED');
  });
});

describe('copperThermalConductivity [S-007, CONFLICT row]', () => {
  it('default material is pure copper', () => {
    expect(DEFAULT_COPPER_K_MATERIAL).toBe('pure-401');
    expect(copperThermalConductivity(DEFAULT_COPPER_K_MATERIAL).value.si).toBe(401);
  });
  it('pure copper = 401 W/m.K and C11000 = 391 W/m.K, with thermal-conductivity dimension', () => {
    const pure = copperThermalConductivity('pure-401');
    const c11000 = copperThermalConductivity('c11000-391');
    expect(pure.value.si).toBe(401);
    expect(c11000.value.si).toBe(391);
    expect(sameDim(pure.value, q(1, DIM.THERMAL_CONDUCTIVITY))).toBe(true);
    expect(sameDim(c11000.value, q(1, DIM.THERMAL_CONDUCTIVITY))).toBe(true);
  });
  it('DIM.THERMAL_CONDUCTIVITY is W/(m.K) = m kg s^-3 K^-1 and is a plain dimension', () => {
    expect([...DIM.THERMAL_CONDUCTIVITY.exp]).toEqual([1, 1, -3, 0, -1, 0, 0]);
    expect(DIM.THERMAL_CONDUCTIVITY.kind).toBe('plain');
  });
  it('dimensional algebra: L / (k * A) has the thermal-resistance dimension (K/W)', () => {
    const k = copperThermalConductivity('pure-401').value;
    const theta = div(q(1.6e-3, DIM.LENGTH), mul(k, q(2.5e-8, DIM.AREA)));
    expect(sameDim(theta, q(1, DIM.THERMAL_RESISTANCE))).toBe(true);
  });
  it('carries ledger id S-007 and the status of that ledger row (CONFLICT)', () => {
    expect(row('S-007')).toBeDefined();
    for (const m of ['pure-401', 'c11000-391'] as const) {
      const k = copperThermalConductivity(m);
      expect(k.ledgerId).toBe('S-007');
      expect(k.status).toBe(row('S-007')?.status);
      expect(k.status).toBe('CONFLICT');
    }
  });
  it('assumption text names the material, the value and its unit', () => {
    const pure = copperThermalConductivity('pure-401').assumption;
    const c11000 = copperThermalConductivity('c11000-391').assumption;
    expect(pure).toContain('401');
    expect(pure).toContain('W/m');
    expect(c11000).toContain('391');
    expect(c11000).toContain('W/m');
    expect(pure).not.toBe(c11000);
    expect(pure.length).toBeGreaterThan(20);
  });
  it('the unsourced oracle value 385 never appears in any returned object', () => {
    for (const m of ['pure-401', 'c11000-391'] as const) {
      expect(JSON.stringify(copperThermalConductivity(m))).not.toMatch(/\b385\b/);
    }
  });
  it('assumption text says the highest conductivity is the non-conservative direction for via temperature rise (G-2/m-E)', () => {
    for (const m of ['pure-401', 'c11000-391'] as const) {
      expect(copperThermalConductivity(m).assumption).toMatch(/non-conservative/i);
    }
  });
  it('throws on an unknown material instead of falling back to a default', () => {
    for (const m of ['aluminium', '', 'pure-385', '__proto__', 'constructor']) {
      expect(() => copperThermalConductivity(m as 'pure-401')).toThrow();
    }
  });
  it('is deterministic', () => {
    expect(copperThermalConductivity('pure-401')).toEqual(copperThermalConductivity('pure-401'));
  });
});

describe('foil convention default, spread and assumption text [S-003, R-9]', () => {
  const conventions = Object.keys(FOIL_CONVENTIONS) as FoilConvention[];
  const oneOz = fromUnit(1, 'oz/ft2');
  // Spread from arithmetic through the units engine: max relative to min over the three conventions at 1 oz.
  const thicknessesUm = conventions.map((c) => foilThickness(oneOz, c).thickness.si * 1e6);
  const spreadPct = ((Math.max(...thicknessesUm) - Math.min(...thicknessesUm)) / Math.min(...thicknessesUm)) * 100;

  it('default convention is nominal-35um and it exists in FOIL_CONVENTIONS with value 35', () => {
    expect(DEFAULT_FOIL_CONVENTION).toBe('nominal-35um');
    expect(FOIL_CONVENTIONS[DEFAULT_FOIL_CONVENTION].value).toBe(35);
  });
  it('the three conventions at 1 oz are 35 / 34.29 / 34.33 um (arithmetic sanity)', () => {
    const byId = Object.fromEntries(conventions.map((c, i) => [c, thicknessesUm[i] as number]));
    expect(relErr(byId['nominal-35um'] as number, 35)).toBeLessThanOrEqual(1e-12);
    expect(relErr(byId['nominal-1.35mil'] as number, 34.29)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs((byId['mass-density'] as number) - 34.3256)).toBeLessThan(5e-4);
  });
  it('foilSpreadPercent() = (35 - 34.29)/34.29 = about 2.07 %', () => {
    expect(relErr(foilSpreadPercent(), spreadPct)).toBeLessThanOrEqual(1e-9);
    expect(relErr(foilSpreadPercent(), ((35 - 34.29) / 34.29) * 100)).toBeLessThanOrEqual(1e-9);
    expect(foilSpreadPercent().toFixed(2)).toBe('2.07');
  });
  it('foilSpreadPercent() matches the oracle golden vector foil_spread_pct_1oz (2.070574511519396)', () => {
    expect(relErr(foilSpreadPercent(), 2.070574511519396)).toBeLessThanOrEqual(1e-9);
  });
  it('foilAssumptionText() names the convention, its um/oz value and the spread to 2 decimals', () => {
    const t = foilAssumptionText();
    expect(t).toMatch(/35(\.0+)?\s?(um|µm)/);
    expect(t).toContain(foilSpreadPercent().toFixed(2));
    expect(t).toContain('2.07');
    expect(t).toContain('%');
    expect(t).toMatch(/assum/i);
    expect(t).toMatch(/oz/);
  });
  it('foilAssumptionText() never cites a standard as the source of the value', () => {
    expect(foilAssumptionText()).not.toMatch(/\b(IPC|IEC|ISO|ASTM|JEDEC)\b/i);
  });
  it('foilAssumptionText() is deterministic', () => {
    expect(foilAssumptionText()).toBe(foilAssumptionText());
  });
});

// ---------------------------------------------------------------------------------------------------------
// Constants against the oracle's golden vectors (docs/golden-vectors.json, generated by gen_golden.py).
// ---------------------------------------------------------------------------------------------------------
interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
  ledger_ids: string[];
  note: string;
}
const goldenFiles = import.meta.glob('../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const goldenText = Object.values(goldenFiles)[0];
const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;
const vec = (name: string): GoldenVector => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found (docs/golden-vectors.json loaded: ${String(vectors.length)} vectors)`);
  return v;
};
const MU0 = 4e-7 * Math.PI;
const viaArea = (dFin: number, t: number): number => Math.PI * t * (dFin + t);

describe('constants reproduce the oracle golden vectors at the recorded tolerance (no loosening)', () => {
  it('golden vectors file loaded', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(18);
  });
  it('trace_R_100x0.3mm_35um_20C_ohm = 0.1642036124794746', () => {
    const v = vec('trace_R_100x0.3mm_35um_20C_ohm');
    const r = (COPPER_RESISTIVITY_20C * 0.1) / (0.3e-3 * 35e-6);
    expect(v.pinned_expected).toBe(0.1642036124794746);
    expect(relErr(r, v.pinned_expected)).toBeLessThanOrEqual(v.rel_tol);
  });
  it('trace_R_same_30C_ohm = 0.17065681444991793 (alpha 0.00393)', () => {
    const v = vec('trace_R_same_30C_ohm');
    const r = ((COPPER_RESISTIVITY_20C * (1 + COPPER_ALPHA_20C * (30 - 20))) * 0.1) / (0.3e-3 * 35e-6);
    expect(v.pinned_expected).toBe(0.17065681444991793);
    expect(relErr(r, v.pinned_expected)).toBeLessThanOrEqual(v.rel_tol);
  });
  it('via_R_mohm_1.6mm = 1.0807338310749393', () => {
    const v = vec('via_R_mohm_1.6mm');
    const r = ((COPPER_RESISTIVITY_20C * 1.6e-3) / viaArea(0.3e-3, 25e-6)) * 1e3;
    expect(relErr(r, v.pinned_expected)).toBeLessThanOrEqual(v.rel_tol);
  });
  it('skin_depth_um_10MHz = 20.89806784938892', () => {
    const v = vec('skin_depth_um_10MHz');
    const d = Math.sqrt(COPPER_RESISTIVITY_20C / (Math.PI * 10e6 * MU0)) * 1e6;
    expect(relErr(d, v.pinned_expected)).toBeLessThanOrEqual(v.rel_tol);
  });
  it('via_theta_KperW_1.6mm = 156.31561646470445 with the default k (401), cites S-007, no UNLEDGERED marker', () => {
    const v = vec('via_theta_KperW_1.6mm');
    const k = copperThermalConductivity(DEFAULT_COPPER_K_MATERIAL).value.si;
    const theta = 1.6e-3 / (k * viaArea(0.3e-3, 25e-6));
    expect(relErr(theta, v.pinned_expected)).toBeLessThanOrEqual(v.rel_tol);
    expect(v.ledger_ids).toContain('S-007');
    expect(v.note).not.toContain('UNLEDGERED');
    expect(Math.abs(v.pinned_expected - 162.81184987622464)).toBeGreaterThan(1); // old k = 385 pin is gone
  });
  it('tolerances were not loosened (exact closed-form vectors stay at 1e-9)', () => {
    for (const n of [
      'trace_R_100x0.3mm_35um_20C_ohm',
      'trace_R_same_30C_ohm',
      'via_R_mohm_1.6mm',
      'via_theta_KperW_1.6mm',
      'skin_depth_um_10MHz',
      'foil_spread_pct_1oz',
    ]) {
      expect(vec(n).rel_tol).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe('copper basis helpers are exported from constants (detailed tests in copper-basis.test.ts)', () => {
  it('exports copperBasisFromFoil and copperBasisFactors', () => {
    expect(typeof copperBasisFromFoil).toBe('function');
    expect(typeof copperBasisFactors).toBe('function');
  });
});
