import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, div, fromUnit, q } from '../units';
import type { Quantity } from '../units';
import { C_M_PER_S, COPPER_RESISTIVITY_20C, MU0_H_PER_M } from '../data/constants';
import { LEDGER } from '../data/ledger';
import type { CalcResult } from '../result';
import { err, expectError, expectNoClaimWording, has, okOf, res, si, vec, warningText } from './circuit-test-utils';
import { compute as coax } from './coax/calc';
import { compute as cpw } from './cpw/calc';
import { compute as cpwg } from './cpwg/calc';
import { compute as diffMicrostrip } from './diff-microstrip/calc';
import { compute as diffStripline } from './diff-stripline/calc';
import { LOSS_LABEL, LOSS_PER_LENGTH, NP_TO_DB, dielectricLossNpPerM, skinDepth, surfaceResistance } from './loss-shared';
import { compute as microstrip } from './microstrip/calc';
import { compute as stripline } from './stripline/calc';

// Phase 2 core D, task 6: approximate loss estimate (conductor + dielectric) on the seven impedance calculators. TESTS FIRST.
// Expected numbers come from the independent oracle (loss_*, skin_depth_*, surface_resistance_* vectors in
// docs/golden-vectors.json), written from the equations recorded in ledger rows S-029d, S-029e and S-029f.

const um = (n: number): Quantity => fromUnit(n, 'um');
const mm = (n: number): Quantity => fromUnit(n, 'mm');
const hz = (n: number): Quantity => q(n, DIM.FREQUENCY);
const dl = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const rawQ = (n: number, dim: Quantity['dim']): Quantity => ({ si: n, dim }) as Quantity;
const rho = (n: number): Quantity => q(n, DIM.RESISTIVITY);
const TOL = 1e-9;
const SRC = 'FR-4 datasheet rev B, tan delta at 1 GHz';

const AD = 'dielectric loss alpha_d';
const AC = 'conductor loss alpha_c';
const AT = 'total loss alpha (dielectric + conductor)';
const ADL = 'dielectric loss over length';
const ATL = 'total loss over length';

const dBpm = (r: CalcResult, name: string): number => si(r, name);

describe('pure functions against the oracle', () => {
  it('skin depth and surface resistance of copper and of a resistivity override (S-013, S-029f)', () => {
    for (const [f, tag, r] of [[1e6, 'f1e+06Hz_rhoCu', COPPER_RESISTIVITY_20C], [1e9, 'f1e+09Hz_rhoCu', COPPER_RESISTIVITY_20C], [1e10, 'f1e+10Hz_rhoCu', COPPER_RESISTIVITY_20C], [1e9, 'f1e+09Hz_rho1.9e-08', 1.9e-8]] as const) {
      expect(err(skinDepth(r, f) * 1e6, vec(`skin_depth_um_${tag}`).pinned_expected), tag).toBeLessThan(TOL);
      expect(err(surfaceResistance(r, f) * 1e3, vec(`surface_resistance_mohm_${tag}`).pinned_expected), tag).toBeLessThan(TOL);
    }
  });
  it('hand check: copper at 1 GHz has delta 2.0898 um and Rs 8.250 mohm per square (the figures recorded in S-029f)', () => {
    expect(skinDepth(1 / 58e6, 1e9) * 1e6).toBeCloseTo(2.08981, 4);
    expect(surfaceResistance(1 / 58e6, 1e9) * 1e3).toBeCloseTo(8.2502, 3);
    expect(skinDepth(1 / 58e6, 1e9)).toBeCloseTo(Math.sqrt(1 / 58e6 / (Math.PI * 1e9 * MU0_H_PER_M)), 15);
  });
  it('Np to dB is 20 log10(e)', () => {
    expect(NP_TO_DB).toBeCloseTo(8.685889638065, 10);
    expect(NP_TO_DB).toBe(20 * Math.log10(Math.E));
  });
  it('dielectric loss: the researcher example, the homogeneous limit and the no-dielectric limit', () => {
    // S-029e researcher example (arithmetic by the researcher, not a source output): er 4.1, ee 2.9671, tan 0.02, 1 GHz
    expect(dielectricLossNpPerM(1e9, 4.1, 2.9671, 0.02)).toBeCloseTo(0.31655, 4);
    expect(dielectricLossNpPerM(1e9, 4.1, 2.9671, 0.02) * NP_TO_DB).toBeCloseTo(2.7495, 3);
    // homogeneous (ee = er): alpha_d = pi f sqrt(er) tan(delta) / c
    expect(err(dielectricLossNpPerM(2e9, 4, 4, 0.01), (Math.PI * 2e9 * 2 * 0.01) / C_M_PER_S)).toBeLessThan(1e-14);
    expect(dielectricLossNpPerM(1e9, 1, 1, 0.5)).toBe(0);
    expect(dielectricLossNpPerM(1e9, 4, 4, 0)).toBe(0);
  });
  it('the dB per inch shortcut 2.312 dB/in per (GHz x tan delta x sqrt(er)) is derived here, not cited', () => {
    // derived: pi x (20 log10 e) x 0.0254 m/in / (c / 1e9)
    const k = (Math.PI * NP_TO_DB * 0.0254) / (C_M_PER_S / 1e9);
    expect(k).toBeCloseTo(2.312, 3);
    for (const [f, er, tand] of [[1e9, 4, 0.02], [5e9, 3.66, 0.004], [250e6, 2.2, 0.0009]] as const) {
      const perInch = dielectricLossNpPerM(f, er, er, tand) * NP_TO_DB * 0.0254;
      expect(err(perInch, k * (f / 1e9) * tand * Math.sqrt(er))).toBeLessThan(1e-12);
    }
  });
  it('the loss per length has the dimension 1/length and the label is the required one', () => {
    expect(LOSS_PER_LENGTH).toEqual(div(dl(1), q(1, DIM.LENGTH)).dim);
    expect(LOSS_LABEL).toBe('approximate estimate; roughness not modelled raises conductor loss; dispersion not modelled');
    expect(LOSS_LABEL).not.toMatch(/lower bound/i);
  });
});

const MS: Parameters<typeof microstrip>[0] = { width: um(600), height: um(635), er: dl(4.1), frequency: hz(1e9), lossTangent: dl(0.02), lossTangentSource: SRC, length: mm(100) };

describe('golden vectors (oracle): microstrip, conductor plus dielectric', () => {
  it('A: copper default, 1 GHz, tan 0.02, 100 mm', () => {
    const r = okOf(microstrip, MS);
    const t = 'loss_microstrip_A_f1e+09Hz_tand0.02';
    expect(err(dBpm(r, AD), vec(`${t}_ad_dBpm`).pinned_expected)).toBeLessThan(TOL);
    expect(err(dBpm(r, AC), vec(`${t}_ac_dBpm`).pinned_expected)).toBeLessThan(TOL);
    expect(err(dBpm(r, AT), vec(`${t}_total_dBpm`).pinned_expected)).toBeLessThan(TOL);
    expect(err(si(r, ATL), vec(`${t}_total_dB_len100mm`).pinned_expected)).toBeLessThan(TOL);
    expect(res(r, AD).value.dim).toEqual(LOSS_PER_LENGTH);
    expect(res(r, ATL).value.dim).toEqual(DIM.DIMENSIONLESS);
  });
  it('B: resistivity override 1.9e-8, 5 GHz, tan 0.004, 250 mm', () => {
    const r = okOf(microstrip, { width: um(300), height: um(150), er: dl(4.2), frequency: hz(5e9), lossTangent: dl(0.004), lossTangentSource: SRC, length: mm(250), resistivity: rho(1.9e-8) });
    const t = 'loss_microstrip_B_f5e+09Hz_tand0.004';
    expect(err(dBpm(r, AD), vec(`${t}_ad_dBpm`).pinned_expected)).toBeLessThan(TOL);
    expect(err(dBpm(r, AC), vec(`${t}_ac_dBpm`).pinned_expected)).toBeLessThan(TOL);
    expect(err(si(r, ATL), vec(`${t}_total_dB_len250mm`).pinned_expected)).toBeLessThan(TOL);
    expect(r.inputs.find((i) => i.name === 'conductor resistivity')?.source).toBe('user');
  });
});

describe('golden vectors (oracle): the other topologies', () => {
  it('stripline: dielectric only, conductor loss not modelled for this geometry', () => {
    const r = okOf(stripline, { width: um(200), spacing: um(1000), er: dl(4), frequency: hz(2.5e9), lossTangent: dl(0.01), lossTangentSource: SRC, length: mm(50) });
    const t = 'loss_stripline_A_f2.5e+09Hz_tand0.01';
    expect(err(dBpm(r, AD), vec(`${t}_ad_dBpm`).pinned_expected)).toBeLessThan(TOL);
    expect(err(si(r, ADL), vec(`${t}_ad_dB_len50mm`).pinned_expected)).toBeLessThan(TOL);
    expect(has(r, AC)).toBe(false);
    expect(has(r, AT)).toBe(false);
    expect(r.warnings.some((w) => w.code === 'CONDUCTOR_LOSS_NOT_MODELLED' && /conductor loss not modelled for this geometry/.test(w.message))).toBe(true);
  });
  it('coax A (100 MHz) and B (2 GHz, override): conductor loss from R-prime and alpha = R-prime/(2 Z0)', () => {
    const a = okOf(coax, { outerDiameter: mm(3.5), innerDiameter: mm(1), er: dl(2.1), frequency: hz(1e8), lossTangent: dl(0.0003), lossTangentSource: SRC, length: mm(1000) });
    const ta = 'loss_coax_A_f1e+08Hz_tand0.0003';
    expect(err(dBpm(a, AD), vec(`${ta}_ad_dBpm`).pinned_expected)).toBeLessThan(TOL);
    expect(err(dBpm(a, AC), vec(`${ta}_ac_dBpm`).pinned_expected)).toBeLessThan(TOL);
    expect(err(dBpm(a, AT), vec(`${ta}_total_dBpm`).pinned_expected)).toBeLessThan(TOL);
    expect(err(si(a, ATL), vec(`${ta}_total_dB_len1000mm`).pinned_expected)).toBeLessThan(TOL);
    const b = okOf(coax, { outerDiameter: mm(4.6), innerDiameter: mm(1.5), er: dl(2.25), frequency: hz(2e9), lossTangent: dl(0.001), lossTangentSource: SRC, length: mm(300), resistivity: rho(2e-8) });
    const tb = 'loss_coax_B_f2e+09Hz_tand0.001';
    expect(err(dBpm(b, AC), vec(`${tb}_ac_dBpm`).pinned_expected)).toBeLessThan(TOL);
    expect(err(si(b, ATL), vec(`${tb}_total_dB_len300mm`).pinned_expected)).toBeLessThan(TOL);
  });
  it('differential microstrip: dielectric loss per mode, no conductor loss', () => {
    const r = okOf(diffMicrostrip, { width: um(150), edgeSpacing: um(100), height: um(200), er: dl(4.5), frequency: hz(3e9), lossTangent: dl(0.015), lossTangentSource: SRC, length: mm(100) });
    const t = 'loss_diffmicrostrip_A_f3e+09Hz_tand0.015';
    expect(err(dBpm(r, `${AD} (odd mode)`), vec(`${t}_ad_odd_dBpm`).pinned_expected)).toBeLessThan(TOL);
    expect(err(dBpm(r, `${AD} (even mode)`), vec(`${t}_ad_even_dBpm`).pinned_expected)).toBeLessThan(TOL);
    expect(si(r, `${ADL} (odd mode)`)).toBeCloseTo(dBpm(r, `${AD} (odd mode)`) * 0.1, 12);
    expect(has(r, AC)).toBe(false);
    expect(r.warnings.some((w) => w.code === 'CONDUCTOR_LOSS_NOT_MODELLED')).toBe(true);
  });
  it('differential stripline, CPW and CPWG', () => {
    const s = okOf(diffStripline, { width: um(300), edgeSpacing: um(200), planeSpacing: um(1000), er: dl(4), frequency: hz(1e9), lossTangent: dl(0.01), lossTangentSource: SRC, length: mm(100) });
    expect(err(dBpm(s, AD), vec('loss_diffstripline_A_f1e+09Hz_tand0.01_ad_dBpm').pinned_expected)).toBeLessThan(TOL);
    expect(err(si(s, ADL), vec('loss_diffstripline_A_f1e+09Hz_tand0.01_ad_dB_len100mm').pinned_expected)).toBeLessThan(TOL);
    const c = okOf(cpw, { width: um(300), gap: um(200), height: um(1600), er: dl(4.5), frequency: hz(2e9), lossTangent: dl(0.02), lossTangentSource: SRC, length: mm(80) });
    expect(err(dBpm(c, AD), vec('loss_cpw_A_f2e+09Hz_tand0.02_ad_dBpm').pinned_expected)).toBeLessThan(TOL);
    expect(err(si(c, ADL), vec('loss_cpw_A_f2e+09Hz_tand0.02_ad_dB_len80mm').pinned_expected)).toBeLessThan(TOL);
    const g = okOf(cpwg, { width: um(300), gap: um(200), height: um(200), er: dl(4.2), frequency: hz(4e9), lossTangent: dl(0.018), lossTangentSource: SRC, length: mm(60) });
    expect(err(dBpm(g, AD), vec('loss_cpwg_A_f4e+09Hz_tand0.018_ad_dBpm').pinned_expected)).toBeLessThan(TOL);
    expect(err(si(g, ADL), vec('loss_cpwg_A_f4e+09Hz_tand0.018_ad_dB_len60mm').pinned_expected)).toBeLessThan(TOL);
    for (const r of [s, c, g]) expect(r.warnings.some((w) => w.code === 'CONDUCTOR_LOSS_NOT_MODELLED')).toBe(true);
  });
});

describe('hand check from the recorded equations', () => {
  it('coax D/d = e, er 1, Cu, 1 GHz: Z0 = 59.958 ohm, R-prime = Rs/(2 pi)(1/a + 1/b), alpha_c = R-prime/(2 Z0)', () => {
    const d = 1e-3;
    const D = Math.E * d;
    const r = okOf(coax, { outerDiameter: q(D, DIM.LENGTH), innerDiameter: q(d, DIM.LENGTH), er: dl(1), frequency: hz(1e9), lossTangent: dl(0), lossTangentSource: SRC, length: mm(1000) });
    const z0 = 59.9584916;
    expect(si(r, 'characteristic impedance Z0')).toBeCloseTo(z0, 6);
    const rs = 8.2502e-3;
    const rPrime = (rs / (2 * Math.PI)) * (1 / (d / 2) + 1 / (D / 2));
    const aNp = rPrime / (2 * z0);
    expect(aNp).toBeCloseTo(0.029956, 5);
    expect(si(r, AC) / NP_TO_DB).toBeCloseTo(aNp, 5);
    expect(si(r, AC)).toBeCloseTo(0.26021, 4);
    // er = 1 with tan delta 0 (a loss request without dielectric loss): the conductor term alone; er = 1 with tan delta above 0 is refused (F-2)
    expect(si(r, AD)).toBe(0);
  });
  it('microstrip: alpha_c = Rs/(Z0 w) with Rs at 1 GHz', () => {
    const r = okOf(microstrip, MS);
    const aNp = 8.2502e-3 / (si(r, 'characteristic impedance Z0') * 600e-6);
    expect(si(r, AC) / NP_TO_DB).toBeCloseTo(aNp, 5);
  });
});

describe('labels, provenance and confidence', () => {
  const r = okOf(microstrip, MS);
  it('every loss result is labelled approximate and names the rows it relies on', () => {
    for (const n of [AD, AC, AT, ADL, ATL]) {
      const note = res(r, n).note ?? '';
      expect(note, n).toContain(LOSS_LABEL);
      expect(note, n).toMatch(/S-029[def]/);
    }
    expect(res(r, AD).note).toMatch(/S-029e \(UNVERIFIED\)/);
    expect(res(r, AC).note).toMatch(/S-029f \(UNVERIFIED\)/);
    expect(res(r, AT).note).toMatch(/S-029d \(VERIFIED\)/);
    expect(warningText(r)).toContain(LOSS_LABEL);
  });
  it('cites the rows, takes the status from the ledger and is never rated high', () => {
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-029d', 'S-029e', 'S-029f', 'S-013', 'S-004']));
    expect(LEDGER.find((x) => x.id === 'S-029e')?.status).toBe('UNVERIFIED');
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.confidence.level).not.toBe('high');
    expect(r.confidence.reasons.join(' ')).toMatch(/UNVERIFIED/);
    expectNoClaimWording(r);
  });
  it('the loss tangent and its source label are echoed, and the default copper resistivity is a visible default', () => {
    expect(r.inputs.find((i) => i.name === 'loss tangent tan(delta)')?.sourceDetail).toBe(SRC);
    expect(r.inputs.find((i) => i.name === 'loss tangent tan(delta)')?.source).toBe('user');
    const rho0 = r.inputs.find((i) => i.name === 'conductor resistivity');
    expect(rho0?.source).toBe('default');
    expect(rho0?.sourceDetail).toMatch(/S-004/);
    expect(rho0?.value.si).toBe(COPPER_RESISTIVITY_20C);
    expect(r.confidence.reasons.join(' ')).toMatch(/Defaulted assumptions used:.*conductor resistivity/);
    expect(r.assumptions.join(' ')).toMatch(/roughness/i);
  });
  it('a user resistivity is not a default and costs no score', () => {
    const user = okOf(microstrip, { ...MS, resistivity: rho(COPPER_RESISTIVITY_20C) });
    expect(user.confidence.score).toBe(r.confidence.score - 1);
  });
  it('without a loss tangent there is no loss output and the plain result is unchanged', () => {
    const plain = okOf(microstrip, { width: um(600), height: um(635), er: dl(4.1), frequency: hz(1e9), length: mm(100) });
    expect(plain.results.some((x) => /loss/.test(x.name))).toBe(false);
    expect(plain.reference.ledgerIds).not.toContain('S-029e');
    expect(r.confidence.score).toBeGreaterThan(plain.confidence.score);
    for (const x of plain.results) expect(si(r, x.name)).toBe(x.value.si);
  });
  it('without a length only per-length values are given', () => {
    const noLen = okOf(microstrip, { width: um(600), height: um(635), er: dl(4.1), frequency: hz(1e9), lossTangent: dl(0.02), lossTangentSource: SRC });
    expect(has(noLen, AD)).toBe(true);
    expect(has(noLen, ADL)).toBe(false);
    expect(has(noLen, ATL)).toBe(false);
  });
});

describe('skin depth against the conductor thickness (the recorded t > 3 delta)', () => {
  it('35 um copper at 1 GHz passes, 4 um fails and drops the confidence to low with a warning', () => {
    const ok = okOf(microstrip, { ...MS, thickness: um(35) });
    expect(ok.validityChecks.find((c) => /skin depths/.test(c.name))?.ok).toBe(true);
    const thin = okOf(microstrip, { ...MS, thickness: um(4) });
    expect(thin.validityChecks.find((c) => /skin depths/.test(c.name))?.ok).toBe(false);
    expect(thin.confidence.level).toBe('low');
    expect(thin.warnings.some((w) => w.code === 'SKIN_DEPTH_COMPARABLE')).toBe(true);
    // the estimate itself is unchanged: only the warning and the confidence react
    expect(si(thin, AC)).toBe(si(ok, AC));
  });
  it('without a thickness the check is not done and the result says so', () => {
    const r = okOf(microstrip, MS);
    expect(r.validityChecks.some((c) => /skin depths/.test(c.name))).toBe(false);
    expect(r.warnings.some((w) => w.code === 'SKIN_DEPTH_NOT_CHECKED')).toBe(true);
  });
  it('coax: a hair-thin inner conductor against the skin depth fails the check (3 delta applied by analogy, stated)', () => {
    const r = okOf(coax, { outerDiameter: mm(0.0105), innerDiameter: mm(0.003), er: dl(2.1), frequency: hz(1e9), lossTangent: dl(0.001), lossTangentSource: SRC });
    const c = r.validityChecks.find((x) => /skin depths/.test(x.name));
    expect(c?.ok).toBe(false);
    expect(c?.detail).toMatch(/analogy/);
    expect(r.confidence.level).toBe('low');
  });
});

describe('a model outside its validity range still gives the estimate but at low confidence', () => {
  it('microstrip w/h outside 0.01-100', () => {
    const r = okOf(microstrip, { ...MS, width: um(100000), height: um(635) });
    expect(r.confidence.level).toBe('low');
    expect(has(r, AD)).toBe(true);
  });
  it('an invalid model gives an error value and no loss number', () => {
    expectError(microstrip, { ...MS, width: um(1e9), height: um(1) }, 'OUT_OF_DOMAIN');
  });
});

describe('guards: errors are values', () => {
  const calls: [string, (extra: Record<string, unknown>) => unknown][] = [
    ['microstrip', (x) => microstrip({ ...MS, ...x } as never)],
    ['coax', (x) => coax({ outerDiameter: mm(3.5), innerDiameter: mm(1), er: dl(2.1), frequency: hz(1e9), lossTangent: dl(0.01), lossTangentSource: SRC, ...x } as never)],
    ['cpwg', (x) => cpwg({ width: um(300), gap: um(200), height: um(200), er: dl(4.2), frequency: hz(1e9), lossTangent: dl(0.01), lossTangentSource: SRC, ...x } as never)],
  ];
  const outcome = (f: (x: Record<string, unknown>) => unknown, x: Record<string, unknown>): { ok: boolean; error?: { code: string; field?: string; message: string } } => f(x) as never;
  it.each(calls)('%s: the source label is required and never pre-filled', (_n, f) => {
    for (const bad of [undefined, '', '   ']) {
      const o = outcome(f, { lossTangentSource: bad });
      expect(o.ok).toBe(false);
      expect(o.error?.code).toBe('INVALID_INPUT');
      expect(o.error?.field).toBe('lossTangentSource');
    }
  });
  it.each(calls)('%s: loss needs a frequency', (_n, f) => {
    const o = outcome(f, { frequency: undefined });
    expect(o.ok).toBe(false);
    expect(o.error?.field).toBe('frequency');
  });
  it.each(calls)('%s: tan delta must be finite, not negative and below 1 (zero is allowed)', (_n, f) => {
    for (const v of [Number.NaN, Infinity, -Infinity, -0.001]) {
      const o = outcome(f, { lossTangent: rawQ(v, DIM.DIMENSIONLESS) });
      expect(o.ok, String(v)).toBe(false);
      expect(o.error?.code).toBe('INVALID_INPUT');
    }
    for (const v of [1, 2, 20]) {
      const o = outcome(f, { lossTangent: dl(v) });
      expect(o.ok, String(v)).toBe(false);
      expect(o.error?.code).toBe('OUT_OF_DOMAIN');
      expect(o.error?.message).toMatch(/unit/);
    }
    expect(outcome(f, { lossTangent: dl(0) }).ok).toBe(true);
    expect(outcome(f, { lossTangent: dl(0.999) }).ok).toBe(true);
    expect(outcome(f, { lossTangent: fromUnit(1, 'mm') }).error?.code).toBe('DIMENSION');
  });
  it.each(calls)('%s: frequency zero or negative and resistivity guards', (_n, f) => {
    expect(outcome(f, { frequency: rawQ(0, DIM.FREQUENCY) }).ok).toBe(false);
    expect(outcome(f, { frequency: rawQ(-1e9, DIM.FREQUENCY) }).ok).toBe(false);
    for (const v of [0, -1e-8, Number.NaN, Infinity]) expect(outcome(f, { resistivity: rawQ(v, DIM.RESISTIVITY) }).error?.code).toBe('INVALID_INPUT');
    for (const v of [1e-12, 5e-3]) expect(outcome(f, { resistivity: rawQ(v, DIM.RESISTIVITY) }).error?.code).toBe('OUT_OF_DOMAIN');
    expect(outcome(f, { resistivity: dl(1e-8) }).error?.code).toBe('DIMENSION');
  });
  it('loss inputs without a loss tangent are refused, not silently ignored', () => {
    for (const extra of [{ lossTangentSource: SRC }, { resistivity: rho(1.7e-8) }]) {
      const o = microstrip({ width: um(600), height: um(635), er: dl(4.1), frequency: hz(1e9), ...extra } as never);
      expect(o.ok).toBe(false);
      if (!o.ok) expect(o.error.code).toBe('INVALID_INPUT');
    }
  });
});

describe('properties', () => {
  const ms = (f: number, tand: number, extra: Record<string, unknown> = {}): CalcResult =>
    okOf(microstrip, { width: um(600), height: um(635), er: dl(4.1), frequency: hz(f), lossTangent: dl(tand), lossTangentSource: SRC, ...extra } as never);
  const sl = (f: number, tand: number, extra: Record<string, unknown> = {}): CalcResult =>
    okOf(stripline, { width: um(300), spacing: um(1000), er: dl(4), frequency: hz(f), lossTangent: dl(tand), lossTangentSource: SRC, ...extra } as never);
  it('alpha_d is linear in frequency and in tan delta', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e7, max: 1e10, noNaN: true }), fc.double({ min: 1e-4, max: 0.1, noNaN: true }), fc.double({ min: 1.1, max: 9, noNaN: true }), (f, t, k) => {
        expect(err(si(sl(k * f, t), AD), k * si(sl(f, t), AD))).toBeLessThan(1e-12);
        expect(err(si(sl(f, k * t / 10), AD), (k / 10) * si(sl(f, t), AD))).toBeLessThan(1e-12);
        expect(err(si(ms(2 * f, t), AD), 2 * si(ms(f, t), AD))).toBeLessThan(1e-12);
        expect(err(si(ms(f, (3 * t) / 10), AD), 0.3 * si(ms(f, t), AD))).toBeLessThan(1e-12);
      }),
      { numRuns: 30 },
    );
  });
  it('alpha_c is proportional to sqrt(frequency) in the skin regime (microstrip and coax)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e7, max: 1e10, noNaN: true }), (f) => {
        expect(err(si(ms(4 * f, 0.01), AC), 2 * si(ms(f, 0.01), AC))).toBeLessThan(1e-12);
        const c = (x: number): CalcResult => okOf(coax, { outerDiameter: mm(3.5), innerDiameter: mm(1), er: dl(2.1), frequency: hz(x), lossTangent: dl(0.01), lossTangentSource: SRC });
        expect(err(si(c(9 * f), AC), 3 * si(c(f), AC))).toBeLessThan(1e-12);
      }),
      { numRuns: 30 },
    );
  });
  it('alpha_c scales with sqrt(resistivity)', () => {
    expect(err(si(ms(1e9, 0.01, { resistivity: rho(4 * COPPER_RESISTIVITY_20C) }), AC), 2 * si(ms(1e9, 0.01), AC))).toBeLessThan(1e-12);
  });
  it('dB over a length is additive and equals alpha times length', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 500, noNaN: true }), fc.double({ min: 1, max: 500, noNaN: true }), (a, b) => {
        const ra = ms(1e9, 0.02, { length: mm(a) });
        const rb = ms(1e9, 0.02, { length: mm(b) });
        const rab = ms(1e9, 0.02, { length: mm(a + b) });
        expect(err(si(ra, ATL) + si(rb, ATL), si(rab, ATL))).toBeLessThan(1e-12);
        expect(err(si(ra, ATL), si(ra, AT) * (a / 1000))).toBeLessThan(1e-12);
        expect(err(si(ra, ADL) + si(ra, 'conductor loss over length'), si(ra, ATL))).toBeLessThan(1e-12);
      }),
      { numRuns: 30 },
    );
  });
  it('results are finite, non-negative and the per-length value in dB/m equals Np/m x 20 log10 e', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e6, max: 2e10, noNaN: true }), fc.double({ min: 0, max: 0.5, noNaN: true }), (f, t) => {
        const r = ms(f, t);
        for (const n of [AD, AC, AT]) {
          expect(Number.isFinite(si(r, n))).toBe(true);
          expect(si(r, n)).toBeGreaterThanOrEqual(0);
        }
        expect(err(si(r, AT), si(r, AD) + si(r, AC))).toBeLessThan(1e-12);
      }),
      { numRuns: 40 },
    );
  });
  it('is fast: 10 000 computes with loss inside a 5 s budget, and deterministic', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) {
      const out = microstrip({ ...MS, frequency: hz(1e8 * (1 + (i % 97))) });
      if (!out.ok) throw new Error('unexpected error');
    }
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(microstrip(MS)).toEqual(microstrip(MS));
  });
});
