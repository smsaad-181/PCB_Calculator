import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit } from '../units';
import { detectForbidden } from '../../../tools/audit-lib.mjs';
import { LEDGER } from './ledger';
import { DESIGN_TARGET_DISCLAIMER, IMPEDANCE_PRESETS, compareToPreset, presetById } from './impedance-presets';
import type { ImpedancePreset } from './impedance-presets';

// Phase 2 task 2/4 part B: protocol presets (ledger S-026 .. S-026f). Design targets taken from application notes and layout
// guides, never from the interface standards themselves (none was read), so every preset is "design target, not a compliance
// statement". TESTS FIRST. Decisions applied (docs/validation/OPEN_RISKS.md): Q-10 USB 2.0 90 ohm offered with NO default
// tolerance (the user picks among the sources' stated values); Q-11 USB 3.x not offered; Q-12/Q-13 CAN and RS-485 are
// informational termination/cable notes, RS-485 UNVERIFIED; Q-14 single-source device-specific presets not offered.

const ohm = (n: number) => fromUnit(n, 'ohm');
const ledgerStatus = new Map(LEDGER.map((r) => [r.id, r.status] as const));
const get = (id: string): ImpedancePreset => {
  const p = presetById(id);
  if (p === undefined) throw new Error(`preset ${id} missing`);
  return p;
};

describe('the offered presets (and only those)', () => {
  it('exactly USB 2.0 HS, Ethernet MDI, LVDS, CAN and RS-485', () => {
    expect(IMPEDANCE_PRESETS.map((p) => p.id)).toEqual(['usb2-hs-90', 'ethernet-mdi-100', 'lvds-100', 'can-hs-120', 'rs485-120']);
    expect(new Set(IMPEDANCE_PRESETS.map((p) => p.id)).size).toBe(IMPEDANCE_PRESETS.length);
  });
  it('USB 3.x / SuperSpeed and the single-source device-specific presets are ABSENT', () => {
    // USB 3.x: the read sources conflict (90 +/-7 % vs 90 +/-7 ohm vs 95 +/-5 %, device-specific), ledger S-026b CONFLICT,
    // decision Q-11: the user types a target. PCIe / HDMI / SATA / SGMII / MIPI CSI / eUSB2 / DisplayPort: one source each and
    // device-family specific (S-026g UNVERIFIED) or no value read, decision Q-14: not offered. A preset needs two independent sources.
    const text = JSON.stringify(IMPEDANCE_PRESETS);
    expect(text).not.toMatch(/usb\s*3|superspeed|ss(rx|tx)|pcie|pci express|hdmi|sata|sgmii|mipi|csi|eusb2|displayport/i);
    for (const row of ['S-026b', 'S-026g']) expect(text).not.toContain(row);
  });
});

describe('every entry: ledger id exists, status mirrors the ledger, sources and scope are stated', () => {
  const rows: { where: string; ledgerId: string; status: string }[] = [];
  for (const p of IMPEDANCE_PRESETS) {
    rows.push({ where: p.id, ledgerId: p.ledgerId, status: p.status });
    for (const t of p.tolerances) rows.push({ where: `${p.id}/${t.id}`, ledgerId: t.ledgerId, status: t.status });
    for (const i of p.info) rows.push({ where: `${p.id}/${i.label}`, ledgerId: i.ledgerId, status: i.status });
  }
  it('every ledger id is in src/core/data/ledger.ts and the status equals the ledger status', () => {
    expect(rows.length).toBeGreaterThan(IMPEDANCE_PRESETS.length);
    for (const r of rows) {
      expect(ledgerStatus.has(r.ledgerId), `${r.where}: ${r.ledgerId}`).toBe(true);
      expect(r.status, r.where).toBe(ledgerStatus.get(r.ledgerId));
    }
  });
  it('source text, scope text, retrieval date and the design-target statement are present on every entry', () => {
    for (const p of IMPEDANCE_PRESETS) {
      expect(p.sources.length, p.id).toBeGreaterThanOrEqual(1);
      for (const s of p.sources) {
        expect(s.document.length, p.id).toBeGreaterThan(5);
        expect(s.quote.length, p.id).toBeGreaterThan(5);
      }
      expect(p.scope.length, p.id).toBeGreaterThan(20);
      expect(p.retrieved).toBe('2026-10-18');
      expect(p.disclaimer).toBe(DESIGN_TARGET_DISCLAIMER);
      expect(p.disclaimer).toMatch(/design target, not a compliance statement/i);
      for (const t of p.tolerances) {
        expect(t.source.length, `${p.id}/${t.id}`).toBeGreaterThan(5);
        expect(t.value).toBeGreaterThan(0);
        expect(t.unit).toBe('percent');
      }
    }
  });
  it('no entry has a default tolerance, a pass band or a compliance word; no text trips the audit phrases', () => {
    const text = JSON.stringify(IMPEDANCE_PRESETS);
    expect(text).not.toMatch(/"default[A-Za-z]*"|"passBand"|"tolerance"\s*:/);
    for (const line of text.split(/(?<=[.;])/)) expect(detectForbidden(line)).toEqual([]);
    for (const p of IMPEDANCE_PRESETS) expect(Object.keys(p)).not.toContain('defaultTolerance');
  });
  it('the table is deeply frozen', () => {
    expect(Object.isFrozen(IMPEDANCE_PRESETS)).toBe(true);
    for (const p of IMPEDANCE_PRESETS) {
      expect(Object.isFrozen(p), p.id).toBe(true);
      expect(Object.isFrozen(p.sources), p.id).toBe(true);
      expect(Object.isFrozen(p.tolerances), p.id).toBe(true);
      expect(Object.isFrozen(p.info), p.id).toBe(true);
      for (const t of p.tolerances) expect(Object.isFrozen(t)).toBe(true);
      for (const s of p.sources) expect(Object.isFrozen(s)).toBe(true);
    }
  });
});

describe('the individual presets', () => {
  it('USB 2.0 HS: 90 ohm differential PCB target; two labelled tolerance options (15 %, 10 %), no default', () => {
    const p = get('usb2-hs-90');
    expect(p.kind).toBe('differential-target');
    expect(p.nominalOhm).toBe(90);
    expect(p.ledgerId).toBe('S-026');
    expect(p.status).toBe('VERIFIED');
    expect(p.scopeKind).toBe('pcb-trace');
    expect(p.tolerances.map((t) => t.value).sort()).toEqual([10, 15]);
    for (const t of p.tolerances) {
      expect(t.ledgerId).toBe('S-026a');
      expect(t.status).toBe('CONFLICT');
    }
    expect(p.tolerances.find((t) => t.value === 15)?.source).toMatch(/NXP AN13462/);
    expect(p.tolerances.find((t) => t.value === 15)?.source).toMatch(/Prolific/);
    expect(p.tolerances.find((t) => t.value === 10)?.source).toMatch(/TI SPRAAR7J/);
    expect(p.sources.map((s) => s.document).join(' ')).toMatch(/TI SPRAAR7J.*NXP AN13462.*Prolific|NXP AN13462.*TI SPRAAR7J/s);
  });
  it('Ethernet 10/100/1000BASE-T MDI: 100 ohm differential, +/-10 %, VERIFIED', () => {
    const p = get('ethernet-mdi-100');
    expect(p.nominalOhm).toBe(100);
    expect(p.status).toBe('VERIFIED');
    expect(p.ledgerId).toBe('S-026f');
    expect(p.tolerances).toHaveLength(1);
    expect(p.tolerances[0]?.value).toBe(10);
    expect(p.tolerances[0]?.status).toBe('VERIFIED');
    expect(p.sources.map((s) => s.document).join(' ')).toMatch(/TI SNLA387/);
    expect(p.sources.map((s) => s.document).join(' ')).toMatch(/Renesas/);
  });
  it('LVDS: 100 ohm nominal, tolerance ABSENT (not invented); the interconnect and termination ranges are information only', () => {
    const p = get('lvds-100');
    expect(p.nominalOhm).toBe(100);
    expect(p.status).toBe('VERIFIED');
    expect(p.ledgerId).toBe('S-026c');
    expect(p.tolerances).toEqual([]);
    expect('tolerance' in p).toBe(false);
    expect(p.info.length).toBeGreaterThanOrEqual(2);
    const ti = p.info.find((i) => /TI/.test(i.source) && i.minOhm === 90 && i.maxOhm === 130);
    const national = p.info.find((i) => /National/.test(i.source) && i.minOhm === 90 && i.maxOhm === 120);
    expect(ti).toBeDefined();
    expect(national).toBeDefined();
    expect(`${ti?.scope ?? ''} ${national?.scope ?? ''}`).toMatch(/termination/i);
    expect(p.note).toMatch(/no PCB (trace )?tolerance/i);
  });
  it('CAN: 120 ohm cable and termination note, not a PCB controlled-impedance preset', () => {
    const p = get('can-hs-120');
    expect(p.kind).toBe('termination-note');
    expect(p.nominalOhm).toBe(120);
    expect(p.ledgerId).toBe('S-026d');
    expect(p.status).toBe('VERIFIED');
    expect(p.scopeKind).toBe('cable-and-termination');
    expect(p.scope).toMatch(/cable/i);
    expect(p.scope).toMatch(/termination/i);
    expect(p.tolerances).toEqual([]);
    expect(p.note).toMatch(/not a (tight )?PCB controlled-impedance/i);
  });
  it('RS-485: 120 ohm termination note, flagged UNVERIFIED (second source probably derived from the first)', () => {
    const p = get('rs485-120');
    expect(p.kind).toBe('termination-note');
    expect(p.nominalOhm).toBe(120);
    expect(p.ledgerId).toBe('S-026e');
    expect(p.status).toBe('UNVERIFIED');
    expect(p.tolerances).toEqual([]);
    expect(p.note).toMatch(/derived/i);
  });
  it('presetById returns undefined for an unknown id', () => {
    expect(presetById('usb3-90')).toBeUndefined();
    expect(presetById('')).toBeUndefined();
  });
});

describe('compareToPreset: deviation from the target and the source-stated tolerance, never pass or compliance wording', () => {
  const okc = (z: number, id: string, tol?: string) => {
    const r = compareToPreset(ohm(z), id, tol);
    if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
    return r.value;
  };
  it('exact target: 0 % deviation', () => {
    const c = okc(90, 'usb2-hs-90');
    expect(c.deviationPercent).toBe(0);
    expect(c.deviationOhm).toBe(0);
    expect(c.targetOhm).toBe(90);
  });
  it('USB 2.0 with no tolerance selected: deviation only, the options are listed, no band is evaluated', () => {
    const c = okc(100, 'usb2-hs-90');
    expect(c.deviationPercent).toBeCloseTo(11.111111, 5);
    expect(c.tolerance).toBeUndefined();
    expect(c.toleranceOptions.map((t) => t.value).sort()).toEqual([10, 15]);
    expect(c.statement).toMatch(/no tolerance was selected/i);
    expect(c.statement).toMatch(/15 %/);
    expect(c.statement).toMatch(/10 %/);
    expect(c.statement).not.toMatch(/within/i);
  });
  it('USB 2.0 +/-15 % and +/-10 % at 100 ohm: within the first, outside the second', () => {
    const a = okc(100, 'usb2-hs-90', 'usb2-tol-15');
    expect(a.tolerance?.within).toBe(true);
    expect(a.tolerance?.lowerOhm).toBeCloseTo(76.5, 9);
    expect(a.tolerance?.upperOhm).toBeCloseTo(103.5, 9);
    expect(a.statement).toMatch(/within the source-stated tolerance/);
    const b = okc(100, 'usb2-hs-90', 'usb2-tol-10');
    expect(b.tolerance?.within).toBe(false);
    expect(b.statement).toMatch(/outside the source-stated tolerance/);
    expect(b.tolerance?.lowerOhm).toBeCloseTo(81, 9);
    expect(b.tolerance?.upperOhm).toBeCloseTo(99, 9);
  });
  it('the band edges are inclusive', () => {
    expect(okc(99, 'usb2-hs-90', 'usb2-tol-10').tolerance?.within).toBe(true);
    expect(okc(81, 'usb2-hs-90', 'usb2-tol-10').tolerance?.within).toBe(true);
    expect(okc(99.01, 'usb2-hs-90', 'usb2-tol-10').tolerance?.within).toBe(false);
    expect(okc(80.99, 'usb2-hs-90', 'usb2-tol-10').tolerance?.within).toBe(false);
  });
  it('Ethernet: +/-10 % around 100 ohm', () => {
    const c = okc(95, 'ethernet-mdi-100', 'ethernet-tol-10');
    expect(c.deviationPercent).toBeCloseTo(-5, 9);
    expect(c.tolerance?.within).toBe(true);
    expect(c.statement).toMatch(/below the 100 ohm design target/);
  });
  it('LVDS has no published PCB tolerance: no band is ever evaluated and the statement says so', () => {
    const c = okc(104, 'lvds-100');
    expect(c.tolerance).toBeUndefined();
    expect(c.toleranceOptions).toEqual([]);
    expect(c.statement).toMatch(/no PCB tolerance is published/i);
    expect(c.statement).not.toMatch(/within|outside/i);
    const e = compareToPreset(ohm(104), 'lvds-100', 'lvds-tol-5');
    expect(e.ok).toBe(false);
  });
  it('every statement carries the UNVERIFIED comparison status, the ledger status and the design-target disclaimer', () => {
    for (const [id, tol] of [['usb2-hs-90', 'usb2-tol-15'], ['usb2-hs-90', undefined], ['ethernet-mdi-100', 'ethernet-tol-10'], ['lvds-100', undefined]] as const) {
      const c = okc(93, id, tol);
      expect(c.comparisonStatus).toBe('UNVERIFIED');
      expect(c.statement).toMatch(/UNVERIFIED/);
      expect(c.statement).toMatch(/design target, not a compliance statement/i);
      expect(c.statement).toContain(`ledger ${c.ledgerId}`);
      expect(c.ledgerStatus).toBe(ledgerStatus.get(c.ledgerId));
      expect(c.statement).not.toMatch(/\b(pass|passes|passed|fail|fails|meets|approved)\b/i);
      for (const line of c.statement.split(/(?<=[.;])/)) expect(detectForbidden(line)).toEqual([]);
    }
  });
  it('termination notes are not impedance targets: an error value, no deviation', () => {
    for (const id of ['can-hs-120', 'rs485-120']) {
      const r = compareToPreset(ohm(120), id);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe('OUT_OF_DOMAIN');
        expect(r.error.message).toMatch(/termination/i);
      }
    }
  });
  it('guards: unknown preset or tolerance, wrong dimension, NaN, infinity, zero and negative are error values', () => {
    const code = (x: ReturnType<typeof compareToPreset>): string => (x.ok ? 'ok' : x.error.code);
    expect(code(compareToPreset(ohm(90), 'usb3-90'))).toBe('INVALID_INPUT');
    expect(code(compareToPreset(ohm(90), 'usb2-hs-90', 'nope'))).toBe('INVALID_INPUT');
    expect(code(compareToPreset(ohm(90), 'usb2-hs-90', 'ethernet-tol-10'))).toBe('INVALID_INPUT');
    expect(code(compareToPreset(fromUnit(1, 'GHz'), 'usb2-hs-90'))).toBe('DIMENSION');
    for (const si of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -5]) {
      expect(code(compareToPreset({ si, dim: DIM.RESISTANCE }, 'usb2-hs-90'))).toBe('INVALID_INPUT');
    }
    expect(code(compareToPreset(null as never, 'usb2-hs-90'))).toBe('INVALID_INPUT');
  });
  it('property: deviation is relative to the target, and "within" is exactly |deviation| <= tolerance', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 500, noNaN: true }), fc.constantFrom('usb2-tol-15', 'usb2-tol-10'), (z, tol) => {
        const c = okc(z, 'usb2-hs-90', tol);
        expect(c.deviationPercent).toBeCloseTo(((z - 90) / 90) * 100, 9);
        const pct = tol === 'usb2-tol-15' ? 15 : 10;
        const edge = Math.abs(Math.abs(c.deviationPercent) - pct) < 1e-9;
        fc.pre(!edge);
        expect(c.tolerance?.within).toBe(Math.abs(c.deviationPercent) <= pct);
      }),
      { numRuns: 300 },
    );
  });
});
