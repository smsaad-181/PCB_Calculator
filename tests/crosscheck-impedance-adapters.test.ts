/**
 * Unit tests for the Phase 2 impedance adapters in tests/crosscheck/adapters.ts and structure tests for the shipped
 * (pending) record files X-01-{microstrip,stripline,diff,cpw,coax}.json and X-02-qucs-*.json.
 *
 * SYNTHETIC inputs only: every number below is an invented test input, never a tool output, and none of them appears in
 * tests/crosscheck/*.json. Expected values are restated inside this file from the ledger formulas (S-020 Hammerstad-Jensen
 * zero-thickness microstrip, S-021 stripline, S-024 coax, S-022b mode definitions) with eta0 = mu0 c from exact SI constants.
 * They check the unit mapping, the explicit thickness-model handling and the error path of the adapters, not the physics.
 * A passing adapter test verifies no ledger row.
 */
import { describe, expect, it } from 'vitest';
import { CROSSCHECK_ADAPTERS } from './crosscheck/adapters';
import { validateRecord } from './crosscheck/runner';

const A = (id: string): ((i: Record<string, unknown>) => Record<string, number>) => {
  const f = CROSSCHECK_ADAPTERS[id];
  if (f === undefined) throw new Error(`no adapter ${id}`);
  return f;
};

const ETA0 = 4e-7 * Math.PI * 299792458;
const P = ETA0 / (2 * Math.PI);
const MIL_MM = 0.0254;

/** Independent restatement of ledger S-020 (zero thickness), u = w/h. */
function hj(u: number, er: number): { z0: number; ee: number } {
  const a = 1 + Math.log((u ** 4 + (u / 52) ** 2) / (u ** 4 + 0.432)) / 49 + Math.log(1 + (u / 18.1) ** 3) / 18.7;
  const b = 0.564 * ((er - 0.9) / (er + 3)) ** 0.053;
  const ee = (er + 1) / 2 + ((er - 1) / 2) * (1 + 10 / u) ** (-a * b);
  const f1 = 6 + (2 * Math.PI - 6) * Math.exp(-((30.666 / u) ** 0.7528));
  const z01 = P * Math.log(f1 / u + Math.sqrt(1 + (2 / u) ** 2));
  return { z0: z01 / Math.sqrt(ee), ee };
}

describe('impedance adapters are registered', () => {
  it.each(['microstrip', 'stripline', 'coax', 'diff-microstrip', 'diff-stripline', 'cpw', 'cpwg'])('%s', (id) => {
    expect(CROSSCHECK_ADAPTERS[id]).toBeTypeOf('function');
  });
});

describe('microstrip adapter (synthetic inputs)', () => {
  const base = { width_mm: 0.3, height_mm: 0.2, er: 4.2 }; // synthetic

  it('zero-thickness Z0 and eps_eff match the restated S-020 formulas', () => {
    const out = A('microstrip')({ ...base });
    const ref = hj(1.5, 4.2);
    expect(out['Z0_ohm']).toBeCloseTo(ref.z0, 9);
    expect(out['eps_eff']).toBeCloseTo(ref.ee, 12);
  });
  it('returns exactly the displayed-type outputs Z0_ohm and eps_eff', () => {
    expect(Object.keys(A('microstrip')({ ...base })).sort()).toEqual(['Z0_ohm', 'eps_eff']);
  });
  it('mil inputs give the same answer as the equivalent mm inputs (1 mil = 0.0254 mm exactly)', () => {
    const mm = A('microstrip')({ ...base });
    const mil = A('microstrip')({ width_mil: 0.3 / MIL_MM, height_mil: 0.2 / MIL_MM, er: 4.2 });
    expect(mil['Z0_ohm']).toBeCloseTo(mm['Z0_ohm'] as number, 9);
  });
  it('thickness with no model, or explicit thicknessModel none, is ignored (zero-thickness result)', () => {
    const zero = A('microstrip')({ ...base });
    const implicit = A('microstrip')({ ...base, thickness_mm: 0.035 });
    const explicit = A('microstrip')({ ...base, thickness_mm: 0.035, thicknessModel: 'none' });
    expect(implicit['Z0_ohm']).toBe(zero['Z0_ohm']);
    expect(explicit['Z0_ohm']).toBe(zero['Z0_ohm']);
    expect(explicit['eps_eff']).toBe(zero['eps_eff']);
  });
  it('both opt-in thickness variants change the result and are finite; Z0 is lower than zero thickness', () => {
    const zero = A('microstrip')({ ...base });
    for (const m of ['hj-procedure-A', 'hj-procedure-B']) {
      const o = A('microstrip')({ ...base, thickness_mm: 0.035, thicknessModel: m });
      expect(Number.isFinite(o['Z0_ohm'])).toBe(true);
      expect(o['Z0_ohm']).toBeLessThan(zero['Z0_ohm'] as number);
    }
  });
  it('frequency_Hz is accepted and does not change the quasi-static numbers', () => {
    expect(A('microstrip')({ ...base, frequency_Hz: 1e6 })['Z0_ohm']).toBe(A('microstrip')({ ...base })['Z0_ohm']);
  });
  it('monotonic: a wider strip never raises Z0', () => {
    const z = [0.15, 0.3, 0.6, 1.2].map((w) => A('microstrip')({ ...base, width_mm: w })['Z0_ohm'] as number);
    for (let i = 1; i < z.length; i++) expect(z[i]).toBeLessThan(z[i - 1] as number);
  });
  it('rejects bad input with clear messages', () => {
    expect(() => A('microstrip')({ ...base, typo: 1 })).toThrow(/unknown input "typo"/);
    expect(() => A('microstrip')({ ...base, width_mil: 12 })).toThrow(/exactly one of width_mm or width_mil/);
    expect(() => A('microstrip')({ height_mm: 0.2, er: 4.2 })).toThrow(/width/);
    expect(() => A('microstrip')({ ...base, er: null })).toThrow(/er/);
    expect(() => A('microstrip')({ ...base, er: '4.2' })).toThrow(/er/);
    expect(() => A('microstrip')({ ...base, thicknessModel: 'wheeler', thickness_mm: 0.035 })).toThrow(/thicknessModel/);
    expect(() => A('microstrip')({ ...base, thicknessModel: 'hj-procedure-A' })).toThrow(/our calculator returned an error/);
    expect(() => A('microstrip')({ ...base, width_mm: -0.3 })).toThrow(/our calculator returned an error/);
    expect(() => A('microstrip')({ ...base, er: 0.5 })).toThrow(/our calculator returned an error/);
  });
});

describe('stripline adapter (synthetic inputs)', () => {
  const base = { width_mm: 0.5, spacing_mm: 1.0, er: 4.0 }; // synthetic

  it('zero-thickness Z0 matches the restated S-021 form; eps_eff equals er', () => {
    const out = A('stripline')({ ...base });
    expect(out['Z0_ohm']).toBeCloseTo((ETA0 / 4 / 2 / (0.5 + 0.441)), 9);
    expect(out['eps_eff']).toBe(4);
  });
  it('narrow strip uses the effective-width branch below w/b = 0.35', () => {
    const out = A('stripline')({ ...base, width_mm: 0.2 });
    const we = 0.2 - (0.35 - 0.2) ** 2;
    expect(out['Z0_ohm']).toBeCloseTo(ETA0 / 4 / 2 / (we + 0.441), 9);
  });
  it('thickness is ignored with none and applied with cohn-wide (lower Z0)', () => {
    const zero = A('stripline')({ ...base });
    const ignored = A('stripline')({ ...base, thickness_mm: 0.02, thicknessModel: 'none' });
    const wide = A('stripline')({ ...base, thickness_mm: 0.02, thicknessModel: 'cohn-wide' });
    expect(ignored['Z0_ohm']).toBe(zero['Z0_ohm']);
    expect(wide['Z0_ohm']).toBeLessThan(zero['Z0_ohm'] as number);
  });
  it('mil inputs equal mm inputs', () => {
    const mil = A('stripline')({ width_mil: 0.5 / MIL_MM, spacing_mil: 1.0 / MIL_MM, er: 4.0 });
    expect(mil['Z0_ohm']).toBeCloseTo(A('stripline')({ ...base })['Z0_ohm'] as number, 9);
  });
  it('rejects bad input and the narrow-strip thickness variant (error value from our calculator)', () => {
    expect(() => A('stripline')({ ...base, spacing: 1 })).toThrow(/unknown input "spacing"/);
    expect(() => A('stripline')({ ...base, width_mm: 0.2, thickness_mm: 0.02, thicknessModel: 'cohn-wide' })).toThrow(/our calculator returned an error/);
    expect(() => A('stripline')({ ...base, thicknessModel: 'hj-procedure-A', thickness_mm: 0.02 })).toThrow(/thicknessModel/);
  });
});

describe('coax adapter (synthetic inputs)', () => {
  it('Z0 matches the restated S-024 formula; eps_eff equals er', () => {
    const out = A('coax')({ outerDiameter_mm: 3.5, innerDiameter_mm: 1.0, er: 2.3 });
    expect(out['Z0_ohm']).toBeCloseTo((P * Math.log(3.5)) / Math.sqrt(2.3), 9);
    expect(out['eps_eff']).toBe(2.3);
    expect(Object.keys(out).sort()).toEqual(['Z0_ohm', 'eps_eff']);
  });
  it('rejects an inner diameter not below the outer one (error value) and unknown keys', () => {
    expect(() => A('coax')({ outerDiameter_mm: 1, innerDiameter_mm: 2, er: 2 })).toThrow(/our calculator returned an error/);
    expect(() => A('coax')({ outerDiameter_mm: 3, innerDiameter_mm: 1, er: 2, width_mm: 1 })).toThrow(/unknown input "width_mm"/);
  });
});

describe('diff-microstrip adapter (synthetic inputs)', () => {
  const base = { width_mm: 0.15, edgeSpacing_mm: 0.15, height_mm: 0.2, er: 4.0 }; // synthetic
  const out = A('diff-microstrip')({ ...base });
  it('returns only the quantities a coupled-line tool displays', () => {
    expect(Object.keys(out).sort()).toEqual(['Zdiff_ohm', 'Zeven_ohm', 'Zodd_ohm', 'eps_eff_even', 'eps_eff_odd']);
  });
  it('Zdiff is exactly twice Zodd (S-022b) and Zeven exceeds Zodd', () => {
    expect(out['Zdiff_ohm']).toBeCloseTo(2 * (out['Zodd_ohm'] as number), 9);
    expect(out['Zeven_ohm']).toBeGreaterThan(out['Zodd_ohm'] as number);
    expect(out['eps_eff_even']).toBeGreaterThan(1);
  });
  it('closer spacing lowers Zodd (stronger coupling)', () => {
    const tight = A('diff-microstrip')({ ...base, edgeSpacing_mm: 0.08 });
    expect(tight['Zodd_ohm']).toBeLessThan(out['Zodd_ohm'] as number);
  });
  it('mil inputs equal mm inputs', () => {
    const mil = A('diff-microstrip')({ width_mil: 0.15 / MIL_MM, edgeSpacing_mil: 0.15 / MIL_MM, height_mil: 0.2 / MIL_MM, er: 4.0 });
    expect(mil['Zodd_ohm']).toBeCloseTo(out['Zodd_ohm'] as number, 9);
  });
  it('rejects bad input', () => {
    expect(() => A('diff-microstrip')({ ...base, thicknessModel: 'none' })).toThrow(/unknown input "thicknessModel"/);
    expect(() => A('diff-microstrip')({ ...base, edgeSpacing_mm: 0 })).toThrow(/our calculator returned an error/);
  });
});

describe('diff-stripline adapter (synthetic inputs)', () => {
  const base = { width_mm: 0.2, edgeSpacing_mm: 0.3, planeSpacing_mm: 0.5, er: 4.0 }; // synthetic
  const out = A('diff-stripline')({ ...base });
  it('returns Zdiff, Zodd, Zeven and eps_eff only', () => {
    expect(Object.keys(out).sort()).toEqual(['Zdiff_ohm', 'Zeven_ohm', 'Zodd_ohm', 'eps_eff']);
    expect(out['eps_eff']).toBe(4);
  });
  it('Zdiff = 2 Zodd and Zeven > Zodd', () => {
    expect(out['Zdiff_ohm']).toBeCloseTo(2 * (out['Zodd_ohm'] as number), 9);
    expect(out['Zeven_ohm']).toBeGreaterThan(out['Zodd_ohm'] as number);
  });
  it('rejects bad input', () => {
    expect(() => A('diff-stripline')({ ...base, spacing_mm: 1 })).toThrow(/unknown input "spacing_mm"/);
    expect(() => A('diff-stripline')({ ...base, er: 0 })).toThrow(/our calculator returned an error/);
  });
});

describe('cpw and cpwg adapters (synthetic inputs)', () => {
  const base = { width_mm: 0.3, gap_mm: 0.2, height_mm: 1.6, er: 4.0 }; // synthetic, h/max(W,s) = 5.3
  it.each(['cpw', 'cpwg'])('%s returns Z0_ohm and eps_eff, both finite and physical', (id) => {
    const out = A(id)({ ...base });
    expect(Object.keys(out).sort()).toEqual(['Z0_ohm', 'eps_eff']);
    expect(out['Z0_ohm']).toBeGreaterThan(0);
    expect(out['eps_eff']).toBeGreaterThanOrEqual(1);
    expect(out['eps_eff']).toBeLessThanOrEqual(4);
  });
  it.each(['cpw', 'cpwg'])('%s: a wider gap raises Z0; mil inputs equal mm inputs', (id) => {
    const narrow = A(id)({ ...base });
    const wide = A(id)({ ...base, gap_mm: 0.4 });
    expect(wide['Z0_ohm']).toBeGreaterThan(narrow['Z0_ohm'] as number);
    const mil = A(id)({ width_mil: 0.3 / MIL_MM, gap_mil: 0.2 / MIL_MM, height_mil: 1.6 / MIL_MM, er: 4.0 });
    expect(mil['Z0_ohm']).toBeCloseTo(narrow['Z0_ohm'] as number, 9);
  });
  it.each(['cpw', 'cpwg'])('%s rejects bad input', (id) => {
    expect(() => A(id)({ ...base, typo: 1 })).toThrow(/unknown input "typo"/);
    expect(() => A(id)({ ...base, gap_mm: -1 })).toThrow(/our calculator returned an error/);
  });
});

// ---- structure of the shipped (pending) records; no tool numbers are read or asserted -----------------------------------

const shipped = import.meta.glob('./crosscheck/X-0[12]-*.json', { eager: true, import: 'default' });
const PHASE2_MIN: Record<string, number> = {
  'X-01-microstrip.json': 6,
  'X-01-stripline.json': 4,
  'X-01-diff.json': 6,
  'X-01-cpw.json': 6,
  'X-01-coax.json': 3,
  'X-02-qucs-microstrip.json': 4,
  'X-02-qucs-cpw.json': 3,
};
const phase2 = Object.entries(shipped)
  .map(([p, data]) => ({ name: p.slice(p.lastIndexOf('/') + 1), data }))
  .filter((f) => f.name in PHASE2_MIN);

describe('shipped Phase 2 record files', () => {
  it('contains the seven expected files', () => {
    expect(phase2.map((f) => f.name).sort()).toEqual(Object.keys(PHASE2_MIN).sort());
  });
  for (const { name, data } of phase2) {
    describe(name, () => {
      const v = validateRecord(data);
      it('is valid and human-obtained', () => {
        expect(v.ok ? [] : v.errors).toEqual([]);
        if (v.ok) expect(v.record.obtainedBy).toBe('human');
      });
      if (!v.ok) return;
      it(`has at least ${String(PHASE2_MIN[name])} cases`, () => {
        expect(v.record.cases.length).toBeGreaterThanOrEqual(PHASE2_MIN[name] as number);
      });
      it('is pending: every toolOutput is null, version and date carry the sentinel', () => {
        expect(v.record.toolVersion).toBe('TO BE FILLED BY HUMAN');
        expect(v.record.retrieved).toBe('TO BE FILLED BY HUMAN');
        for (const c of v.record.cases) expect(Object.values(c.toolOutputs).every((x) => x === null), c.id).toBe(true);
      });
      it('method tells the human what to record', () => {
        expect(v.record.method.length).toBeGreaterThan(150);
      });
      it('every compare entry has a real tolerance and a stated reason', () => {
        for (const c of v.record.cases) for (const e of c.compare) {
          expect(e.relTol, `${c.id}/${e.output}`).toBeGreaterThan(0);
          expect(e.relTol, `${c.id}/${e.output}`).toBeLessThan(0.1);
          expect(e.why.length, `${c.id}/${e.output}`).toBeGreaterThan(60);
        }
      });
      it('every case maps through the adapter without an error and yields every compared output', () => {
        for (const c of v.record.cases) {
          const ours = A(c.calculator)(c.inputs as Record<string, unknown>);
          for (const e of c.compare) expect(Object.keys(ours), `${c.id}/${e.output}`).toContain(e.output);
        }
      });
      it('every case sets its thickness handling explicitly where the core has a thickness model', () => {
        for (const c of v.record.cases) {
          if (c.calculator === 'microstrip' || c.calculator === 'stripline') expect(c.inputs['thicknessModel'], c.id).toBeTypeOf('string');
        }
      });
      it('every case states the quasi-static frequency used in the tool', () => {
        for (const c of v.record.cases) expect(c.inputs['frequency_Hz'], c.id).toBe(1e6);
      });
    });
  }
  it('CPW file keeps a geometry inside the core h >= 2 max(W, s) rule and covers both cpw and cpwg', () => {
    const f = phase2.find((x) => x.name === 'X-01-cpw.json');
    const v = validateRecord(f?.data);
    if (!v.ok) throw new Error('invalid');
    const calcs = new Set(v.record.cases.map((c) => c.calculator));
    expect(calcs.has('cpw') && calcs.has('cpwg')).toBe(true);
    const near = v.record.cases.filter((c) => {
      const w = c.inputs['width_mm'] as number;
      const s = c.inputs['gap_mm'] as number;
      const h = c.inputs['height_mm'] as number;
      return c.calculator === 'cpw' && h >= 2 * Math.max(w, s) && h < 2.5 * Math.max(w, s);
    });
    expect(near.length).toBeGreaterThanOrEqual(1);
  });
  it('X-01 microstrip spans er 3.5 and 4.5, w/h 0.5, 1, 2 and t of 0 and 35 um', () => {
    const f = phase2.find((x) => x.name === 'X-01-microstrip.json');
    const v = validateRecord(f?.data);
    if (!v.ok) throw new Error('invalid');
    const cs = v.record.cases;
    const wh = new Set(cs.map((c) => (c.inputs['width_mm'] as number) / (c.inputs['height_mm'] as number)));
    for (const r of [0.5, 1, 2]) expect([...wh].some((x) => Math.abs(x - r) < 1e-9), `w/h ${String(r)}`).toBe(true);
    expect(new Set(cs.map((c) => c.inputs['er'])).has(3.5) && new Set(cs.map((c) => c.inputs['er'])).has(4.5)).toBe(true);
    expect(cs.some((c) => c.inputs['thickness_mm'] === undefined || c.inputs['thickness_mm'] === 0)).toBe(true);
    expect(cs.some((c) => c.inputs['thickness_mm'] === 0.035)).toBe(true);
  });
});
