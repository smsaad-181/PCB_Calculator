import { describe, expect, it } from 'vitest';
import { LEDGER } from '../data/ledger';
import {
  DIM,
  DimensionError,
  FOIL_CONVENTIONS,
  type FoilConvention,
  InvalidValueError,
  UnitError,
  awgArea,
  awgDiameter,
  foilThickness,
  fromUnit,
  q,
  sameDim,
  toUnit,
} from './index';

// Unicode escapes keep the unit strings unambiguous across editors.
const DEG = '°';
const OHM = 'Ω';
const MU = 'µ';

function relErr(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

// Expected values come from definitions (S-006), the ledger formulas (S-003, S-005) and the Python oracle
// tools/reference/ref_calcs.py (mirrored in docs/golden-vectors.json). Never from running the implementation.

describe('exact length conversions [S-006]', () => {
  it('[S-006] 1 in = 0.0254 m', () => {
    expect(relErr(fromUnit(1, 'in').si, 0.0254)).toBeLessThanOrEqual(1e-15);
    expect(relErr(fromUnit(1, 'inch').si, 0.0254)).toBeLessThanOrEqual(1e-15);
    expect(sameDim(fromUnit(1, 'in'), q(1, DIM.LENGTH))).toBe(true);
  });
  it('[S-006] 1 mil = 25.4e-6 m', () => {
    expect(relErr(fromUnit(1, 'mil').si, 25.4e-6)).toBeLessThanOrEqual(1e-15);
  });
  it('[S-006] 1000 mil = 1 in = 25.4 mm', () => {
    expect(relErr(fromUnit(1000, 'mil').si, fromUnit(1, 'in').si)).toBeLessThanOrEqual(1e-15);
    expect(relErr(fromUnit(25.4, 'mm').si, fromUnit(1, 'in').si)).toBeLessThanOrEqual(1e-15);
  });
  it('SI prefix length units', () => {
    expect(relErr(fromUnit(1, 'mm').si, 1e-3)).toBeLessThanOrEqual(1e-15);
    expect(relErr(fromUnit(1, 'cm').si, 1e-2)).toBeLessThanOrEqual(1e-15);
    expect(relErr(fromUnit(1, `${MU}m`).si, 1e-6)).toBeLessThanOrEqual(1e-15);
    expect(relErr(fromUnit(1, 'um').si, 1e-6)).toBeLessThanOrEqual(1e-15);
    expect(fromUnit(1, 'm').si).toBe(1);
  });
  it('[S-006] toUnit inverts to mil / mm', () => {
    expect(relErr(toUnit(q(0.0254, DIM.LENGTH), 'mil'), 1000)).toBeLessThanOrEqual(1e-14);
    expect(relErr(toUnit(q(25.4e-6, DIM.LENGTH), `${MU}m`), 25.4)).toBeLessThanOrEqual(1e-14);
  });
});

describe('electrical and frequency unit factors', () => {
  const cases: Array<[string, number, ReturnType<typeof q>['dim']]> = [
    ['A', 1, DIM.CURRENT],
    ['mA', 1e-3, DIM.CURRENT],
    ['V', 1, DIM.VOLTAGE],
    ['mV', 1e-3, DIM.VOLTAGE],
    [OHM, 1, DIM.RESISTANCE],
    ['ohm', 1, DIM.RESISTANCE],
    [`m${OHM}`, 1e-3, DIM.RESISTANCE],
    ['mohm', 1e-3, DIM.RESISTANCE],
    ['W', 1, DIM.POWER],
    ['mW', 1e-3, DIM.POWER],
    ['Hz', 1, DIM.FREQUENCY],
    ['kHz', 1e3, DIM.FREQUENCY],
    ['MHz', 1e6, DIM.FREQUENCY],
    ['GHz', 1e9, DIM.FREQUENCY],
  ];
  for (const [unit, factor, dim] of cases) {
    it(`1 ${unit} -> si ${factor}`, () => {
      const x = fromUnit(1, unit);
      expect(relErr(x.si, factor)).toBeLessThanOrEqual(1e-15);
      expect(sameDim(x, q(1, dim))).toBe(true);
    });
  }
});

describe('temperature conversions [S-006]', () => {
  it('[S-006] 0 degC = 273.15 K', () => {
    expect(fromUnit(0, `${DEG}C`).si).toBeCloseTo(273.15, 12);
    expect(fromUnit(0, 'degC').si).toBeCloseTo(273.15, 12);
    expect(fromUnit(273.15, 'K').si).toBeCloseTo(273.15, 12);
  });
  it('[S-006] F -> K = (F-32)*5/9 + 273.15', () => {
    expect(fromUnit(32, `${DEG}F`).si).toBeCloseTo(273.15, 12);
    expect(fromUnit(212, `${DEG}F`).si).toBeCloseTo(373.15, 12);
    expect(fromUnit(100, 'degF').si).toBeCloseTo(((100 - 32) * 5) / 9 + 273.15, 12);
  });
  it('[S-006] -40 degF = -40 degC', () => {
    expect(fromUnit(-40, `${DEG}F`).si).toBeCloseTo(fromUnit(-40, `${DEG}C`).si, 12);
  });
  it('[S-006] toUnit inverts to degC and degF', () => {
    expect(toUnit(q(273.15, DIM.ABS_TEMPERATURE), `${DEG}C`)).toBeCloseTo(0, 12);
    expect(toUnit(q(0, DIM.ABS_TEMPERATURE), `${DEG}C`)).toBeCloseTo(-273.15, 12);
    expect(toUnit(q(373.15, DIM.ABS_TEMPERATURE), `${DEG}F`)).toBeCloseTo(212, 10);
  });
  it('[S-006] delta factors: 1 dK = 1, 1 dC = 1, 1 dF = 5/9', () => {
    expect(fromUnit(1, 'ΔK').si).toBe(1);
    expect(fromUnit(1, `Δ${DEG}C`).si).toBe(1);
    expect(relErr(fromUnit(1, `Δ${DEG}F`).si, 5 / 9)).toBeLessThanOrEqual(1e-15);
  });
});

describe('copper foil: areal mass [S-006] and thickness [S-003]', () => {
  const OZ_KG = 0.028349523125; // avoirdupois ounce, exact (S-006)
  const FT_M = 0.3048; // international foot, exact (S-006)
  const OZ_FT2_TO_KG_M2 = OZ_KG / (FT_M * FT_M); // oracle: 0.30515172727394063

  it('[S-006] 1 oz/ft2 -> kg/m2 exact factor', () => {
    expect(relErr(fromUnit(1, 'oz/ft2').si, OZ_FT2_TO_KG_M2)).toBeLessThanOrEqual(1e-12);
    expect(relErr(fromUnit(1, 'oz/ft2').si, 0.30515172727394063)).toBeLessThanOrEqual(1e-12);
  });
  it('[S-006] kg/m2 and g/m2 are arealMass; 1 oz/ft2 round trip', () => {
    expect(fromUnit(1, 'kg/m2').si).toBe(1);
    expect(relErr(fromUnit(1000, 'g/m2').si, 1)).toBeLessThanOrEqual(1e-15);
    expect(sameDim(fromUnit(1, 'kg/m2'), q(1, DIM.AREAL_MASS))).toBe(true);
    expect(relErr(toUnit(fromUnit(1, 'oz/ft2'), 'kg/m2'), OZ_FT2_TO_KG_M2)).toBeLessThanOrEqual(1e-12);
    expect(relErr(toUnit(q(OZ_FT2_TO_KG_M2, DIM.AREAL_MASS), 'oz/ft2'), 1)).toBeLessThanOrEqual(1e-12);
  });
  it('[S-003] nominal-35um: 1 oz/ft2 = 35 um exactly, not attributed to IPC', () => {
    const r = foilThickness(fromUnit(1, 'oz/ft2'), 'nominal-35um');
    expect(sameDim(r.thickness, q(1, DIM.LENGTH))).toBe(true);
    expect(relErr(r.thickness.si, 35e-6)).toBeLessThanOrEqual(1e-12);
    expect(FOIL_CONVENTIONS['nominal-35um'].label).not.toMatch(/IPC/);
    expect(r.statement).not.toMatch(/IPC/);
    expect(FOIL_CONVENTIONS['nominal-35um'].label).toContain('1.378');
    expect(FOIL_CONVENTIONS['nominal-35um'].value).toBe(35);
    expect(FOIL_CONVENTIONS['nominal-35um'].unit).toMatch(/um|\u00b5m/);
  });
  it('[S-003] nominal-1.35mil: 1 oz/ft2 = 1.35 mil, labelled as reported/secondhand/unverified', () => {
    const r = foilThickness(fromUnit(1, 'oz/ft2'), 'nominal-1.35mil');
    expect(relErr(r.thickness.si, 1.35 * 25.4e-6)).toBeLessThanOrEqual(1e-12);
    const label = FOIL_CONVENTIONS['nominal-1.35mil'].label;
    expect(label).toMatch(/IPC-4562A/);
    expect(label).toMatch(/unverified/i);
    expect(label).toMatch(/secondhand/i);
    expect(FOIL_CONVENTIONS['nominal-1.35mil'].value).toBe(1.35);
    expect(FOIL_CONVENTIONS['nominal-1.35mil'].unit).toMatch(/mil/);
  });
  it('[S-003] all conventions scale linearly (0.5, 2, 3 oz)', () => {
    for (const conv of ['nominal-35um', 'nominal-1.35mil', 'mass-density'] as const) {
      const one = foilThickness(fromUnit(1, 'oz/ft2'), conv).thickness.si;
      for (const oz of [0.5, 2, 3]) {
        const t = foilThickness(fromUnit(oz, 'oz/ft2'), conv).thickness.si;
        expect(relErr(t, oz * one)).toBeLessThanOrEqual(1e-12);
      }
    }
  });
  it('[S-003d] mass-density: default IACS density 8890 kg/m3', () => {
    const r = foilThickness(fromUnit(1, 'oz/ft2'), 'mass-density');
    expect(sameDim(r.thickness, q(1, DIM.LENGTH))).toBe(true);
    expect(relErr(r.thickness.si, OZ_KG / (FT_M * FT_M) / 8890)).toBeLessThanOrEqual(1e-12);
    expect(relErr(r.thickness.si, 0.028349523125 / 0.09290304 / 8890)).toBeLessThanOrEqual(1e-12);
    expect(FOIL_CONVENTIONS['mass-density'].value).toBe(8890);
    expect(FOIL_CONVENTIONS['mass-density'].unit).toBe('kg/m3');
    expect(r.constantUsed.value).toBe(8890);
    expect(r.constantUsed.source).toBe('default');
    expect(r.constantUsed.ledgerId).toBe('S-003d');
    expect(FOIL_CONVENTIONS['mass-density'].ledgerIds).toContain('S-003d');
  });
  it('[S-003] result carries ledger ID S-003 and exactly the ledger status of S-003', () => {
    const row = LEDGER.find((x) => x.id === 'S-003');
    expect(row).toBeDefined();
    for (const conv of ['nominal-35um', 'nominal-1.35mil', 'mass-density'] as const) {
      const r = foilThickness(fromUnit(1, 'oz/ft2'), conv);
      expect(r.ledgerId).toBe('S-003');
      expect(r.status).toBe(row?.status);
      expect(r.status).toMatch(/^(VERIFIED|UNVERIFIED|PAYWALLED-USER-MUST-VERIFY|CONFLICT)$/);
    }
  });
  it('[S-003] FOIL_CONVENTIONS exposes exactly the three conventions with full metadata', () => {
    expect(Object.keys(FOIL_CONVENTIONS).sort()).toEqual(['mass-density', 'nominal-1.35mil', 'nominal-35um']);
    const row = LEDGER.find((x) => x.id === 'S-003');
    for (const [id, info] of Object.entries(FOIL_CONVENTIONS)) {
      expect(info.id).toBe(id);
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.value).toBeGreaterThan(0);
      expect(info.unit.length).toBeGreaterThan(0);
      expect(info.ledgerIds).toContain('S-003');
      expect(info.status).toBe(row?.status);
    }
  });
  it("[S-003] the removed 'ipc-nominal' convention id throws", () => {
    const legacy = 'ipc-nominal' as unknown as FoilConvention;
    expect(() => foilThickness(fromUnit(1, 'oz/ft2'), legacy)).toThrow();
    expect(Object.keys(FOIL_CONVENTIONS)).not.toContain('ipc-nominal');
  });
  it('[S-003] the three conventions differ; ordering from arithmetic, spread < 2.1 %', () => {
    const oz = fromUnit(1, 'oz/ft2');
    const t35 = foilThickness(oz, 'nominal-35um').thickness.si; // 35.000 um
    const t135 = foilThickness(oz, 'nominal-1.35mil').thickness.si; // 34.290 um
    const tMass = foilThickness(oz, 'mass-density').thickness.si; // ~34.33 um at 8890 kg/m3
    // 35 um > mass@8890 (~34.33 um) > 1.35 mil (34.29 um): mass-density is slightly ABOVE 1.35 mil.
    expect(t35).toBeGreaterThan(tMass);
    expect(tMass).toBeGreaterThan(t135);
    const spread = (Math.max(t35, t135, tMass) - Math.min(t35, t135, tMass)) / Math.min(t35, t135, tMass);
    expect(spread).toBeLessThan(0.021);
    expect(spread).toBeGreaterThan(0.02);
    expect(relErr(toUnit(foilThickness(oz, 'mass-density').thickness, `${MU}m`), 34.33)).toBeLessThan(1e-3);
  });
  it('foilThickness rejects non-arealMass input (DimensionError)', () => {
    expect(() => foilThickness(q(1, DIM.LENGTH), 'nominal-35um')).toThrow(DimensionError);
    expect(() => foilThickness(q(1, DIM.MASS), 'mass-density')).toThrow(DimensionError);
    expect(() => foilThickness(q(1, DIM.ABS_TEMPERATURE), 'nominal-1.35mil')).toThrow(DimensionError);
  });
  it('foilThickness rejects zero and negative weight (rule 10)', () => {
    expect(() => foilThickness(q(0, DIM.AREAL_MASS), 'nominal-35um')).toThrow(InvalidValueError);
    expect(() => foilThickness(q(-0.3, DIM.AREAL_MASS), 'mass-density')).toThrow(InvalidValueError);
    expect(() => foilThickness(q(-0.3, DIM.AREAL_MASS), 'nominal-1.35mil')).toThrow(InvalidValueError);
  });
});

describe('AWG [S-005]', () => {
  // Oracle values (tools/reference/ref_calcs.py): d(mm) = 0.127 * 92^((36-n)/39); area = pi d^2 / 4
  const diameters: Array<[number, number]> = [
    [36, 0.127],
    [-3, 11.684],
    [-1, 9.265833249046812],
    [0, 8.251462802171464],
    [10, 2.5881867280128636],
    [20, 0.8118209703737738],
    [30, 0.2546390029766585],
    [40, 0.0798710851323451],
  ];
  for (const [n, mm] of diameters) {
    it(`[S-005] AWG ${n} diameter = ${mm} mm`, () => {
      const d = awgDiameter(n);
      expect(sameDim(d, q(1, DIM.LENGTH))).toBe(true);
      expect(relErr(toUnit(d, 'mm'), mm)).toBeLessThanOrEqual(1e-9);
    });
  }
  it('[S-005] AWG 36 = 0.127 mm exactly (definition endpoint)', () => {
    expect(relErr(awgDiameter(36).si, 0.127e-3)).toBeLessThanOrEqual(1e-12);
  });
  it('[S-005] AWG 0000 (-3) = 0.46 in = 11.684 mm (definition endpoint)', () => {
    expect(relErr(awgDiameter(-3).si, 0.46 * 0.0254)).toBeLessThanOrEqual(1e-9);
    expect(relErr(awgDiameter(-3).si, 11.684e-3)).toBeLessThanOrEqual(1e-9);
  });
  it('[S-005] AWG area = pi d^2 / 4 (oracle AWG 20 = 0.5176192419280384 mm2)', () => {
    const a = awgArea(20);
    expect(sameDim(a, q(1, DIM.AREA))).toBe(true);
    expect(relErr(a.si * 1e6, 0.5176192419280384)).toBeLessThanOrEqual(1e-9);
    expect(relErr(awgArea(36).si * 1e6, 0.012667686977437443)).toBeLessThanOrEqual(1e-9);
    expect(relErr(awgArea(-3).si * 1e6, 107.21930257703055)).toBeLessThanOrEqual(1e-9);
  });
  it('[S-005] accepts every integer from -3 to 40', () => {
    for (let n = -3; n <= 40; n++) {
      expect(Number.isFinite(awgDiameter(n).si)).toBe(true);
      expect(awgDiameter(n).si).toBeGreaterThan(0);
    }
  });
  it('[S-005] diameter strictly decreases with n; d(n+39) = d(n)/92', () => {
    for (let n = -3; n < 40; n++) {
      expect(awgDiameter(n + 1).si).toBeLessThan(awgDiameter(n).si);
    }
    for (let n = -3; n + 39 <= 40; n++) {
      expect(relErr(awgDiameter(n + 39).si * 92, awgDiameter(n).si)).toBeLessThanOrEqual(1e-12);
    }
  });
  it('[S-005] rejects non-integers, NaN, Infinity and out-of-range with InvalidValueError', () => {
    for (const bad of [1.5, -0.5, Number.NaN, Infinity, -Infinity, -4, 41, 1000]) {
      expect(() => awgDiameter(bad)).toThrow(InvalidValueError);
      expect(() => awgArea(bad)).toThrow(InvalidValueError);
    }
  });
});

describe('unit errors', () => {
  it('unknown unit throws UnitError (fromUnit and toUnit)', () => {
    expect(() => fromUnit(1, 'furlong')).toThrow(UnitError);
    expect(() => fromUnit(1, '')).toThrow(UnitError);
    expect(() => toUnit(q(1, DIM.LENGTH), 'furlong')).toThrow(UnitError);
  });
  it('units are case-sensitive (mm is not MM, mA is not ma)', () => {
    expect(() => fromUnit(1, 'MM')).toThrow(UnitError);
    expect(() => fromUnit(1, 'ma')).toThrow(UnitError);
  });
  it('toUnit with dimension-mismatched unit throws DimensionError', () => {
    expect(() => toUnit(q(1, DIM.LENGTH), 'A')).toThrow(DimensionError);
    expect(() => toUnit(q(1, DIM.CURRENT), 'mm')).toThrow(DimensionError);
    expect(() => toUnit(q(1, DIM.AREAL_MASS), 'mm')).toThrow(DimensionError);
  });
  it('aliases agree: um/micro, ohm/Omega, degC/deg-C, ddegC/delta-degC', () => {
    expect(fromUnit(3, 'um').si).toBe(fromUnit(3, `${MU}m`).si);
    expect(fromUnit(3, 'ohm').si).toBe(fromUnit(3, OHM).si);
    expect(fromUnit(3, 'mohm').si).toBe(fromUnit(3, `m${OHM}`).si);
    expect(fromUnit(3, 'degC').si).toBe(fromUnit(3, `${DEG}C`).si);
    expect(fromUnit(3, 'degF').si).toBe(fromUnit(3, `${DEG}F`).si);
    expect(fromUnit(3, 'ddegC').si).toBe(fromUnit(3, `Δ${DEG}C`).si);
    expect(fromUnit(3, 'ddegF').si).toBe(fromUnit(3, `Δ${DEG}F`).si);
    expect(fromUnit(3, 'inch').si).toBe(fromUnit(3, 'in').si);
  });
});
