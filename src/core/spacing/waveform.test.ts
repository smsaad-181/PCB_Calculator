import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, q } from '../units';
import { dcPlusSine, pulseRms, resolveVoltage, voltageFromWaveform, WAVEFORM_SHAPES } from './waveform';

// Phase 3 core: working-voltage waveform helpers (ledger S-035 VERIFIED textbook relations; S-019e for the pulse).
// Expected values come from the independent oracle (tools/reference/ref_calcs.py, mirrored in docs/golden-vectors.json),
// which integrates the RMS definition numerically and does not use the crest-factor shortcuts used in src.

interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
}
const goldenFiles = import.meta.glob('../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const goldenText = Object.values(goldenFiles)[0];
const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;
const vec = (name: string): GoldenVector => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found (${String(vectors.length)} vectors loaded)`);
  return v;
};
const close = (got: number, name: string): void => {
  const v = vec(name);
  expect(Math.abs(got - v.pinned_expected)).toBeLessThanOrEqual(v.rel_tol * Math.abs(v.pinned_expected));
};
const volts = (n: number) => q(n, DIM.VOLTAGE);

describe('waveform conversions against the oracle', () => {
  it('sine', () => {
    const a = voltageFromWaveform('sine', 'peak', volts(100));
    expect(a.ok).toBe(true);
    if (a.ok) close(a.value.rms.si, 'waveform_sine_peak_to_rms_V_pk100');
    const b = voltageFromWaveform('sine', 'rms', volts(100));
    if (b.ok) close(b.value.peak.si, 'waveform_sine_rms_to_peak_V_rms100');
    else throw new Error('expected ok');
    const c = voltageFromWaveform('sine', 'rms', volts(230));
    if (c.ok) close(c.value.peak.si, 'waveform_sine_rms_to_peak_V_rms230');
    else throw new Error('expected ok');
  });
  it('square', () => {
    const a = voltageFromWaveform('square', 'peak', volts(100));
    if (a.ok) close(a.value.rms.si, 'waveform_square_peak_to_rms_V_pk100');
    else throw new Error('expected ok');
    const b = voltageFromWaveform('square', 'rms', volts(100));
    if (b.ok) close(b.value.peak.si, 'waveform_square_rms_to_peak_V_rms100');
    else throw new Error('expected ok');
  });
  it('triangle', () => {
    const a = voltageFromWaveform('triangle', 'peak', volts(100));
    if (a.ok) close(a.value.rms.si, 'waveform_triangle_peak_to_rms_V_pk100');
    else throw new Error('expected ok');
    const b = voltageFromWaveform('triangle', 'rms', volts(100));
    if (b.ok) close(b.value.peak.si, 'waveform_triangle_rms_to_peak_V_rms100');
    else throw new Error('expected ok');
  });
  it('dc', () => {
    const a = voltageFromWaveform('dc', 'peak', volts(100));
    if (a.ok) close(a.value.rms.si, 'waveform_dc_value_to_rms_V_dc100');
    else throw new Error('expected ok');
  });
  it('dc plus sine', () => {
    const r = dcPlusSine(volts(120), volts(30));
    expect(r.ok).toBe(true);
    if (r.ok) {
      close(r.value.rms.si, 'waveform_dc_plus_sine_rms_V_dc120_ac30rms');
      close(r.value.peak.si, 'waveform_dc_plus_sine_peak_V_dc120_ac30rms');
    }
  });
  it('pulse rms', () => {
    const r = pulseRms(volts(10), 0.36);
    expect(r.ok).toBe(true);
    if (r.ok) close(r.value.si, 'waveform_pulse_rms_V_pk10_D0.36');
  });
});

describe('waveform properties', () => {
  const amp = fc.double({ min: 1e-3, max: 1e5, noNaN: true });
  it('rms -> peak -> rms round trip for every shape', () => {
    fc.assert(
      fc.property(fc.constantFrom(...WAVEFORM_SHAPES), amp, (shape, v) => {
        const a = voltageFromWaveform(shape, 'rms', volts(v));
        if (!a.ok) return false;
        const b = voltageFromWaveform(shape, 'peak', a.value.peak);
        return b.ok && Math.abs(b.value.rms.si - v) <= 1e-9 * v;
      }),
    );
  });
  it('peak is never below rms (crest factor >= 1)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...WAVEFORM_SHAPES), amp, (shape, v) => {
        const a = voltageFromWaveform(shape, 'peak', volts(v));
        return a.ok && a.value.peak.si >= a.value.rms.si * (1 - 1e-12);
      }),
    );
  });
  it('pulse rms is between 0 and peak and equals peak at duty 1', () => {
    fc.assert(
      fc.property(amp, fc.double({ min: 1e-6, max: 1, noNaN: true }), (v, d) => {
        const r = pulseRms(volts(v), d);
        return r.ok && r.value.si > 0 && r.value.si <= v * (1 + 1e-12);
      }),
    );
    const one = pulseRms(volts(7), 1);
    expect(one.ok && one.value.si).toBe(7);
  });
});

describe('waveform guards (errors are values)', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects value %s', (v) => {
    const raw = { si: v, dim: DIM.VOLTAGE } as unknown as ReturnType<typeof volts>;
    const r = voltageFromWaveform('sine', 'rms', raw);
    expect(r.ok).toBe(false);
  });
  it('rejects a non-voltage quantity and an unknown shape/basis', () => {
    expect(voltageFromWaveform('sine', 'rms', q(5, DIM.CURRENT)).ok).toBe(false);
    expect(voltageFromWaveform('pulse' as never, 'rms', volts(5)).ok).toBe(false);
    expect(voltageFromWaveform('sine', 'mean' as never, volts(5)).ok).toBe(false);
  });
  it.each([0, -0.1, 1.0000001, Number.NaN])('rejects duty %s', (d) => {
    expect(pulseRms(volts(5), d).ok).toBe(false);
  });
  it('rejects a bad DC or AC part', () => {
    expect(dcPlusSine(volts(0), volts(5)).ok).toBe(false);
    expect(dcPlusSine(volts(5), volts(0)).ok).toBe(false);
    expect(dcPlusSine(q(1, DIM.CURRENT), volts(5)).ok).toBe(false);
  });
});

describe('resolveVoltage (direct value or declared waveform, never both)', () => {
  it('direct peak and direct rms', () => {
    const a = resolveVoltage({ peak: volts(10) });
    expect(a.ok && a.value.peak?.si).toBe(10);
    expect(a.ok && a.value.rms).toBeUndefined();
    const b = resolveVoltage({ rms: volts(10) });
    expect(b.ok && b.value.rms?.si).toBe(10);
  });
  it('waveform gives both', () => {
    const r = resolveVoltage({ waveform: { shape: 'square', basis: 'rms', value: volts(10) } });
    expect(r.ok && r.value.peak?.si).toBeCloseTo(10, 12);
  });
  it('neither gives an empty (missing) outcome; both is an error', () => {
    const none = resolveVoltage({});
    expect(none.ok && none.value.peak).toBeUndefined();
    expect(none.ok && none.value.rms).toBeUndefined();
    expect(resolveVoltage({ peak: volts(1), waveform: { shape: 'dc', basis: 'peak', value: volts(1) } }).ok).toBe(false);
    expect(resolveVoltage({ rms: volts(1), waveform: { shape: 'dc', basis: 'peak', value: volts(1) } }).ok).toBe(false);
  });
  it('both direct values are allowed when peak >= rms, refused when peak < rms', () => {
    const ok = resolveVoltage({ peak: volts(14), rms: volts(10) });
    expect(ok.ok && ok.value.how).toBe('direct');
    expect(resolveVoltage({ peak: volts(9), rms: volts(10) }).ok).toBe(false);
  });
  it('bad direct values are refused', () => {
    expect(resolveVoltage({ peak: q(5, DIM.CURRENT) }).ok).toBe(false);
    expect(resolveVoltage({ rms: { si: -1, dim: DIM.VOLTAGE } as never }).ok).toBe(false);
    expect(resolveVoltage({ waveform: { shape: 'sine', basis: 'rms', value: q(5, DIM.CURRENT) } }).ok).toBe(false);
  });
});
