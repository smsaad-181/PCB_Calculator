// Phase 3 UI guard rails read from the source text, in the style of pointers-and-wording.test.ts.
import { describe, expect, it } from 'vitest';
import panelSrc from './components/SpacingTablePanel.tsx?raw';
import resultsSrc from './components/SpacingResults.tsx?raw';
import { CALCULATOR_STATE_KEYS } from '../state/state-key-docs';
import { CATEGORIES, calculatorsIn, findCalculator } from './registry';

const files = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../**/*.testutil.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const spacingUi = Object.entries(files).filter(([f]) => (f.startsWith('./') || f.startsWith('../state/')) && /spacing|Spacing|clearance|Clearance|creepage|Creepage|VoltageEntry/.test(f));

describe('registry and home', () => {
  it('lists the three pages under Safety / Spacing as lazy phase-3 entries that resolve to a component', async () => {
    expect(CATEGORIES.find((c) => c.id === 'spacing')?.title).toBe('Safety / Spacing');
    expect(calculatorsIn('spacing').map((e) => e.id)).toEqual(['clearance', 'creepage', 'ipc-spacing']);
    for (const id of ['clearance', 'creepage', 'ipc-spacing']) {
      const e = findCalculator(id);
      expect(e?.phase, id).toBe(3);
      expect(Object.keys(CALCULATOR_STATE_KEYS), id).toContain(id);
      expect(typeof (await e?.load())?.default, id).toBe('function');
    }
    expect(findCalculator('ipc-spacing')?.title).toMatch(/design guideline; not a safety insulation assessment/);
  });
});

describe('shipped UI source', () => {
  it('finds the spacing UI files', () => {
    expect(spacingUi.length).toBeGreaterThan(8);
  });
  it('never imports the synthetic test tables (they are never shipped in the bundle)', () => {
    for (const [f, src] of Object.entries(files)) {
      expect(src, f).not.toContain('synthetic-tables');
      expect(src, f).not.toContain('SYNTHETIC TEST DATA');
    }
  });
  it('has no network access of any kind', () => {
    for (const [f, src] of spacingUi) expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|import\(\s*['"]https?:/);
  });
  it('the import box is capped by the core limit and files are read in the browser on a user action', () => {
    expect(panelSrc).toContain('maxLength={MAX_IMPORT_CHARS}');
    expect(panelSrc).toContain('FileReader');
    expect(panelSrc).toContain('onChange={onFile}');
    expect(panelSrc).toContain('type="file"');
    expect(panelSrc).toContain('importMessage(store, text)');
  });
  it('the UI can never mark a table VERIFIED: it never writes status, verifiedBy or bannerRequired', () => {
    for (const [f, src] of spacingUi) {
      expect(src, f).not.toMatch(/\.(verifiedBy|verifiedDate|bannerRequired|status)\s*=(?!=)|status\s*:\s*'VERIFIED'|bannerRequired\s*:\s*false/);
    }
  });
  it('the import link is a focus move, not a hash anchor (the page routes by hash)', () => {
    expect(resultsSrc).toContain('document.getElementById(IMPORT_ANCHOR_ID)');
    expect(resultsSrc).not.toMatch(/href="#spacing/);
  });
  it('banner text is rendered from the view-model and the page never types a forbidden claim', () => {
    const claim = new RegExp(String.raw`${'compl'}iant|${'cert'}ified|production[- ]${'saf'}e|${'IPC'} ${'compl'}`, 'i');
    for (const [f, src] of spacingUi) expect(src, f).not.toMatch(claim);
  });
});
