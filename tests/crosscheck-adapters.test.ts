/**
 * Unit tests for the Phase 1 task 10 adapters in tests/crosscheck/adapters.ts.
 *
 * SYNTHETIC records only: every number below is an invented test input, never a tool output, and never appears in
 * tests/crosscheck/*.json. The expected values are computed inside this file from the ledger formulas written out again
 * (S-001 legacy relation with k 0.048 / 0.024, exponents 0.44 / 0.725 and 1 mil = 25.4 um exactly; S-004 rho = 1/58e6 ohm m
 * exactly; annulus area pi t (d + t)). They check the unit mapping and the error path of the adapters, not the physics.
 * A passing adapter test verifies no ledger row.
 */
import { describe, expect, it } from 'vitest';
import { CROSSCHECK_ADAPTERS } from './crosscheck/adapters';
import { evaluateCase, validateRecord, type CrosscheckCase } from './crosscheck/runner';

const traceWidth = CROSSCHECK_ADAPTERS['trace-width-ipc2221'];
const traceRes = CROSSCHECK_ADAPTERS['trace-resistance'];
const via = CROSSCHECK_ADAPTERS['via'];

const MIL_UM = 25.4;
const RHO = 1 / 58e6;

/** Independent restatement of the legacy relation (ledger S-001), inputs in tool units. */
function areaMil2(currentA: number, dT: number, k: number): number {
  return (currentA / (k * dT ** 0.44)) ** (1 / 0.725);
}
function currentA(areaMil2In: number, dT: number, k: number): number {
  return k * dT ** 0.44 * areaMil2In ** 0.725;
}

describe('adapters are registered', () => {
  it('has the three Phase 1 calculators', () => {
    expect(traceWidth).toBeTypeOf('function');
    expect(traceRes).toBeTypeOf('function');
    expect(via).toBeTypeOf('function');
  });
});

describe('trace-width-ipc2221 adapter (synthetic inputs)', () => {
  it.each([
    ['external', 0.048],
    ['internal', 0.024],
  ] as const)('current -> width, %s layer, thickness in um', (layer, k) => {
    const I = 2.5; // synthetic
    const dT = 17; // synthetic
    const tUm = 35;
    const out = traceWidth!({ current_A: I, deltaT_K: dT, thickness_um: tUm, layer });
    const a = areaMil2(I, dT, k);
    const widthMil = a / (tUm / MIL_UM);
    expect(out['width_mil']).toBeCloseTo(widthMil, 6);
    expect(out['width_mm']).toBeCloseTo((widthMil * MIL_UM) / 1000, 9);
    expect(out['area_mil2']).toBeCloseTo(a, 6);
    expect(out['area_mm2']).toBeCloseTo((a * MIL_UM * MIL_UM) / 1e6, 9);
  });

  it('width -> current (inverse direction)', () => {
    const wMm = 0.8; // synthetic
    const dT = 12; // synthetic
    const tUm = 70;
    const out = traceWidth!({ width_mm: wMm, deltaT_K: dT, thickness_um: tUm, layer: 'external' });
    const aMil = ((wMm * 1000) / MIL_UM) * (tUm / MIL_UM);
    expect(out['current_A']).toBeCloseTo(currentA(aMil, dT, 0.048), 9);
    expect(out['area_mil2']).toBeCloseTo(aMil, 6);
  });

  it('round trip: width from current, then current from that width', () => {
    const first = traceWidth!({ current_A: 3, deltaT_K: 20, thickness_um: 35, layer: 'internal' });
    const back = traceWidth!({ width_mm: first['width_mm'] as number, deltaT_K: 20, thickness_um: 35, layer: 'internal' });
    expect(back['current_A']).toBeCloseTo(3, 9);
  });

  it('rejects both or neither of current_A and width_mm', () => {
    expect(() => traceWidth!({ deltaT_K: 10, thickness_um: 35, layer: 'external' })).toThrow(/exactly one of current_A or width_mm/);
    expect(() => traceWidth!({ current_A: 1, width_mm: 1, deltaT_K: 10, thickness_um: 35, layer: 'external' })).toThrow(/exactly one/);
  });
  it('rejects a bad layer, a foil weight input, unknown keys and non-numbers', () => {
    expect(() => traceWidth!({ current_A: 1, deltaT_K: 10, thickness_um: 35, layer: 'outer' })).toThrow(/layer/);
    expect(() => traceWidth!({ current_A: 1, deltaT_K: 10, copper_oz: 1, layer: 'external' })).toThrow(/thickness_um/);
    expect(() => traceWidth!({ current_A: 1, deltaT_K: 10, thickness_um: 35, layer: 'external', typo: 1 })).toThrow(/unknown input "typo"/);
    expect(() => traceWidth!({ current_A: '1', deltaT_K: 10, thickness_um: 35, layer: 'external' })).toThrow(/current_A/);
    expect(() => traceWidth!({ current_A: null, deltaT_K: 10, thickness_um: 35, layer: 'external' })).toThrow(/current_A/);
  });
  it('throws our calculator error message for an invalid value (negative current)', () => {
    expect(() => traceWidth!({ current_A: -1, deltaT_K: 10, thickness_um: 35, layer: 'external' })).toThrow(/our calculator returned an error/);
  });
});

describe('trace-resistance adapter (synthetic inputs)', () => {
  const base = { length_mm: 25, width_mm: 0.4, thickness_um: 35, temperature_C: 20, layer: 'external' } as const;

  it('resistance and area with the ledger resistivity at 20 degC', () => {
    const out = traceRes!({ ...base });
    const area = 0.4e-3 * 35e-6;
    expect(out['area_mm2']).toBeCloseTo(area * 1e6, 9);
    expect(out['resistance_ohm']).toBeCloseTo((RHO * 25e-3) / area, 9);
    expect(out).not.toHaveProperty('voltage_drop_V');
  });
  it('voltage drop and power with a current', () => {
    const out = traceRes!({ ...base, current_A: 2 });
    const r = (RHO * 25e-3) / (0.4e-3 * 35e-6);
    expect(out['voltage_drop_V']).toBeCloseTo(2 * r, 9);
    expect(out['power_W']).toBeCloseTo(4 * r, 9);
  });
  it('resistivity override replaces the ledger value (used to isolate arithmetic from the constant)', () => {
    const rho = 1.72e-8;
    const out = traceRes!({ ...base, ourResistivity_ohm_m: rho });
    expect(out['resistance_ohm']).toBeCloseTo((rho * 25e-3) / (0.4e-3 * 35e-6), 9);
  });
  it('temperature is applied through the 20 degC linear coefficient, so 20 degC is the no-correction point', () => {
    const at20 = traceRes!({ ...base })['resistance_ohm'] as number;
    const at70 = traceRes!({ ...base, temperature_C: 70 })['resistance_ohm'] as number;
    expect(at70).toBeGreaterThan(at20);
  });
  it('rejects bad input with clear messages', () => {
    expect(() => traceRes!({ ...base, width_mm: 0 })).toThrow(/our calculator returned an error/);
    expect(() => traceRes!({ ...base, length_mm: 'x' })).toThrow(/length_mm/);
    expect(() => traceRes!({ ...base, extra: 1 })).toThrow(/unknown input "extra"/);
    expect(() => traceRes!({ ...base, layer: 'inner-ish' })).toThrow(/layer/);
  });
});

describe('via adapter (synthetic inputs)', () => {
  const base = { finishedHoleDiameter_mm: 0.4, platingThickness_um: 25, length_mm: 1.6, temperature_C: 20 } as const;

  it('barrel annulus area and resistance', () => {
    const out = via!({ ...base });
    const d = 0.4e-3;
    const t = 25e-6;
    const area = Math.PI * t * (d + t);
    expect(out['barrel_area_mm2']).toBeCloseTo(area * 1e6, 9);
    expect(out['resistance_ohm']).toBeCloseTo((RHO * 1.6e-3) / area, 9);
  });
  it('voltage drop and power with a current, resistivity override', () => {
    const rho = 1.72e-8;
    const out = via!({ ...base, current_A: 1.5, ourResistivity_ohm_m: rho });
    const area = Math.PI * 25e-6 * (0.4e-3 + 25e-6);
    const r = (rho * 1.6e-3) / area;
    expect(out['resistance_ohm']).toBeCloseTo(r, 9);
    expect(out['voltage_drop_V']).toBeCloseTo(1.5 * r, 9);
    expect(out['power_W']).toBeCloseTo(2.25 * r, 9);
  });
  it('maps only what corresponds: no thermal resistance, ampacity, capacitance or inductance outputs', () => {
    const keys = Object.keys(via!({ ...base, current_A: 1 }));
    expect(keys.sort()).toEqual(['barrel_area_mm2', 'power_W', 'resistance_ohm', 'voltage_drop_V']);
  });
  it('rejects bad input', () => {
    expect(() => via!({ ...base, platingThickness_um: 0 })).toThrow(/our calculator returned an error/);
    expect(() => via!({ ...base, length_mm: undefined })).toThrow(/length_mm/);
    expect(() => via!({ ...base, drill: 1 })).toThrow(/unknown input "drill"/);
  });
});

describe('adapters inside the runner (synthetic tool numbers computed from the same restated formula)', () => {
  const caseOf = (value: number, relTol: number): CrosscheckCase => {
    const v = validateRecord({
      tool: 'synthetic',
      toolId: 'X-99',
      toolVersion: 'synthetic',
      retrieved: '2026-01-01',
      obtainedBy: 'human',
      method: 'synthetic test fixture',
      cases: [
        {
          id: 'syn',
          calculator: 'trace-width-ipc2221',
          inputs: { current_A: 2, deltaT_K: 10, thickness_um: 35, layer: 'external' },
          toolOutputs: { width_mm: value, width_mil: null },
          compare: [
            { output: 'width_mm', relTol, why: 'synthetic' },
            { output: 'width_mil', relTol, why: 'synthetic' },
          ],
        },
      ],
    });
    if (!v.ok) throw new Error(v.errors.join('; '));
    return v.record.cases[0] as CrosscheckCase;
  };
  const expectedMm = (areaMil2(2, 10, 0.048) / (35 / MIL_UM) * MIL_UM) / 1000;

  it('passes when the synthetic tool value equals the formula, ignoring the null sibling output', () => {
    expect(evaluateCase(caseOf(expectedMm, 1e-9), CROSSCHECK_ADAPTERS).status).toBe('pass');
  });
  it('fails when the synthetic tool value is 1 % off with a tight tolerance', () => {
    expect(evaluateCase(caseOf(expectedMm * 1.01, 1e-5), CROSSCHECK_ADAPTERS).status).toBe('fail');
  });
});

describe('adapters: null optional current means absent', () => {
  it('trace-resistance and via ignore a null current_A (tool value not yet copied)', () => {
    const t = traceRes!({ length_mm: 25, width_mm: 0.4, thickness_um: 35, temperature_C: 20, layer: 'external', current_A: null });
    expect(t).not.toHaveProperty('voltage_drop_V');
    const v = via!({ finishedHoleDiameter_mm: 0.4, platingThickness_um: 25, length_mm: 1.6, temperature_C: 20, current_A: null });
    expect(v).not.toHaveProperty('voltage_drop_V');
  });
});

// Structure of the shipped (pending) record files. No tool numbers are read or asserted here.
const shipped = import.meta.glob('./crosscheck/X-0[13]-*.json', { eager: true, import: 'default' });
describe('shipped Phase 1 record files', () => {
  const minCases: Record<string, number> = { 'X-01-trace-width.json': 6, 'X-01-track-resistance.json': 4, 'X-01-via.json': 2, 'X-03-twc-ipc2221.json': 6 };
  // Phase 2 impedance records share the X-01 prefix; they are checked in tests/crosscheck-impedance-adapters.test.ts.
  const files = Object.entries(shipped)
    .map(([p, data]) => ({ name: p.slice(p.lastIndexOf('/') + 1), data }))
    .filter((f) => f.name in minCases);

  it('contains the four expected files', () => {
    expect(files.map((f) => f.name).sort()).toEqual(Object.keys(minCases).sort());
  });
  for (const { name, data } of files) {
    describe(name, () => {
      const v = validateRecord(data);
      it('is valid and human-obtained', () => {
        expect(v.ok ? [] : v.errors).toEqual([]);
        if (v.ok) expect(v.record.obtainedBy).toBe('human');
      });
      if (!v.ok) return;
      it(`has at least ${String(minCases[name])} cases`, () => {
        expect(v.record.cases.length).toBeGreaterThanOrEqual(minCases[name] as number);
      });
      it('every compare entry has a stated tolerance and a derived-or-provisional reason', () => {
        for (const c of v.record.cases) for (const e of c.compare) {
          expect(e.relTol, `${c.id}/${e.output}`).toBeGreaterThan(0);
          expect(e.why.length, `${c.id}/${e.output}`).toBeGreaterThan(40);
        }
      });
      it('every compared output can be produced by the adapter from the recorded inputs (current filled with a dummy only to test the mapping)', () => {
        for (const c of v.record.cases) {
          const adapter = CROSSCHECK_ADAPTERS[c.calculator];
          expect(adapter, c.id).toBeTypeOf('function');
          const inputs = { ...c.inputs, ...(c.inputs['current_A'] === null ? { current_A: 1 } : {}) };
          const ours = (adapter as (i: Record<string, unknown>) => Record<string, number>)(inputs);
          for (const e of c.compare) {
            // twc width_mil/width_mm are alternatives (the tool shows one); the adapter yields both.
            expect(Object.keys(ours), `${c.id}/${e.output}`).toContain(e.output);
          }
        }
      });
      it('a pending record carries no tool values', () => {
        if (v.record.toolVersion === 'TO BE FILLED BY HUMAN') {
          for (const c of v.record.cases) expect(Object.values(c.toolOutputs).every((x) => x === null), c.id).toBe(true);
        }
      });
    });
  }
});
