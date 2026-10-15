import { describe, expect, it } from 'vitest';
import { CATEGORIES, REGISTRY, calculatorsIn, findCalculator, type CalculatorEntry } from './registry';
import { CALCULATOR_STATE_KEYS } from '../state/hash';
import { badgeText } from './components/UnverifiedBadge';

describe('registry', () => {
  it('lists the copper converter under Trace as a lazy phase-1 entry', () => {
    const e = findCalculator('copper-converter');
    expect(e).toBeDefined();
    expect(e?.category).toBe('trace');
    expect(e?.phase).toBe(1);
    expect(calculatorsIn('trace').map((x) => x.id)).toContain('copper-converter');
    expect(REGISTRY.map((x) => x.id)).toEqual([...new Set(REGISTRY.map((x) => x.id))]);
    expect(findCalculator('anything')).toBeUndefined();
  });
  it('lists trace width under Trace as a lazy phase-1 entry', () => {
    const e = findCalculator('trace-width');
    expect(e).toBeDefined();
    expect(e?.category).toBe('trace');
    expect(e?.phase).toBe(1);
    expect(calculatorsIn('trace').map((x) => x.id)).toEqual(expect.arrayContaining(['copper-converter', 'trace-width']));
    expect(e?.title).toMatch(/legacy/i);
    expect(typeof e?.load).toBe('function');
  });
  it('lists trace resistance under Trace as a lazy phase-1 entry', () => {
    const e = findCalculator('trace-resistance');
    expect(e).toBeDefined();
    expect(e?.category).toBe('trace');
    expect(e?.phase).toBe(1);
    expect(calculatorsIn('trace').map((x) => x.id)).toEqual(expect.arrayContaining(['copper-converter', 'trace-width', 'trace-resistance']));
    expect(typeof e?.load).toBe('function');
  });
  it('lists the circuit-value calculators under Circuit values as lazy phase-1 entries', () => {
    for (const id of ['ohm-power', 'resistor-divider', 'feedback-divider', 'led-resistor', 'rc-lc', 'reactance', 'e-series']) {
      const e = findCalculator(id);
      expect(e, id).toBeDefined();
      expect(e?.category).toBe('circuit');
      expect(e?.phase).toBe(1);
      expect(typeof e?.load).toBe('function');
      expect(e?.title.length).toBeGreaterThan(5);
    }
    expect(calculatorsIn('circuit').map((x) => x.id)).toEqual(['ohm-power', 'resistor-divider', 'feedback-divider', 'led-resistor', 'rc-lc', 'reactance', 'e-series']);
    const titles = Object.fromEntries(REGISTRY.map((x) => [x.id, x.title]));
    expect(titles['feedback-divider']).toBe('Regulator feedback divider');
    expect(titles['led-resistor']).toBe('LED series resistor');
    expect(titles['rc-lc']).toBe('RC and LC (time constant, cutoff, resonance)');
    expect(titles['reactance']).toBe('Reactance (inductor and capacitor)');
  });
  it('the circuit-value loaders resolve to a component module with a default export', async () => {
    for (const id of ['ohm-power', 'resistor-divider', 'feedback-divider', 'led-resistor', 'rc-lc', 'reactance', 'e-series']) {
      const m = await findCalculator(id)?.load();
      expect(typeof m?.default, id).toBe('function');
    }
  });
  it('lists via and annular ring under Trace as lazy phase-1 entries that resolve to a component', async () => {
    expect(findCalculator('via')?.title).toBe('Via resistance and thermal (barrel)');
    for (const id of ['via', 'annular-ring']) {
      const e = findCalculator(id);
      expect(e?.category, id).toBe('trace');
      expect(e?.phase, id).toBe(1);
      expect(typeof (await e?.load())?.default, id).toBe('function');
    }
  });
  it('every registry entry has a hash-state key table', () => {
    for (const x of REGISTRY) expect(Object.keys(CALCULATOR_STATE_KEYS)).toContain(x.id);
  });
  it('registry ids are valid route ids', () => {
    for (const x of REGISTRY) expect(x.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });
  it('has the four categories', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(['routing', 'trace', 'load', 'circuit']);
  });
  it('looks up injected entries', () => {
    const e: CalculatorEntry = { id: 't', title: 'T', category: 'trace', phase: 1, load: () => Promise.reject(new Error('x')) };
    expect(findCalculator('t', [e])).toBe(e);
    expect(calculatorsIn('trace', [e])).toEqual([e]);
    expect(calculatorsIn('load', [e])).toEqual([]);
  });
});

describe('badgeText', () => {
  it('is null for VERIFIED', () => expect(badgeText('VERIFIED', ['S-001'])).toBeNull());
  it('uses actionable wording and names the ledger id', () => {
    expect(badgeText('UNVERIFIED', ['S-001'])).toBe('Not independently verified — see source ledger S-001');
    expect(badgeText('CONFLICT', ['S-002'])).toBe('Sources disagree — see source ledger S-002');
    expect(badgeText('PAYWALLED-USER-MUST-VERIFY', ['S-003'])).toBe(
      'Not checked against the standard (paywalled): compare with your licensed copy — see source ledger S-003',
    );
  });
  it('falls back to a generic ledger reference and joins several ids', () => {
    expect(badgeText('UNVERIFIED', [])).toBe('Not independently verified — see the source ledger');
    expect(badgeText('UNVERIFIED', ['S-001', 'S-004'])).toContain('S-001, S-004');
  });
  it('never uses the old wording', () => {
    for (const s of ['UNVERIFIED', 'PAYWALLED-USER-MUST-VERIFY', 'CONFLICT'] as const) {
      expect(badgeText(s, ['S-001'])).not.toMatch(/you must verify|UNVERIFIED \(/);
    }
  });
});
