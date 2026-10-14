import { describe, expect, it } from 'vitest';
import choicesSrc from './circuit-choices.ts?raw';
import ohmVm from './ohm-power.vm.ts?raw';
import divVm from './resistor-divider.vm.ts?raw';
import eVm from './e-series.vm.ts?raw';
import ohmPage from './OhmPower.tsx?raw';
import divPage from './ResistorDivider.tsx?raw';
import ePage from './ESeries.tsx?raw';
import fbVm from './feedback-divider.vm.ts?raw';
import ledVm from './led-resistor.vm.ts?raw';
import rcVm from './rc-lc.vm.ts?raw';
import reVm from './reactance.vm.ts?raw';
import viewSrc from './circuit-view.ts?raw';
import fbPage from './FeedbackDivider.tsx?raw';
import ledPage from './LedResistor.tsx?raw';
import rcPage from './RcLc.tsx?raw';
import rePage from './Reactance.tsx?raw';
import clientSrc from '../search-client.ts?raw';
import searchHook from '../useSearch.ts?raw';
import fbSchem from '../components/FeedbackSchematic.tsx?raw';
import schemSrc from '../components/DividerSchematic.tsx?raw';
import noticeSrc from '../components/NoticeBanner.tsx?raw';
import statusSrc from '../components/ResultStatus.tsx?raw';
import hookSrc from '../useCalcState.ts?raw';
import { CALCULATOR_STATE_KEYS, RESERVED_STATE_KEYS } from '../../state/hash';
import {
  ALL_SERIES,
  CATALOG_OPTS,
  DIVIDER_SERIES,
  NEGLIGIBLE_ERROR,
  SNAP_CHOICES,
  catalogRatio,
  catalogResistance,
  parseToleranceField,
  signedPercent,
} from './circuit-choices';

// The stylesheet is read from disk: the test runner does not return CSS text from ?raw imports.
const NODE_FS = 'node:fs';
const fsModule = (await import(/* @vite-ignore */ NODE_FS)) as { readFileSync: (url: URL, encoding: string) => string };
const cssSrc = fsModule.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const strip = (t: string): string => t.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const UI_FILES: Record<string, string> = {
  'circuit-choices': choicesSrc,
  'ohm-power.vm': ohmVm,
  'resistor-divider.vm': divVm,
  'e-series.vm': eVm,
  OhmPower: ohmPage,
  ResistorDivider: divPage,
  ESeries: ePage,
  'feedback-divider.vm': fbVm,
  'led-resistor.vm': ledVm,
  'rc-lc.vm': rcVm,
  'reactance.vm': reVm,
  'circuit-view': viewSrc,
  FeedbackDivider: fbPage,
  LedResistor: ledPage,
  RcLc: rcPage,
  Reactance: rePage,
  'search-client': clientSrc,
  useSearch: searchHook,
  FeedbackSchematic: fbSchem,
  DividerSchematic: schemSrc,
  NoticeBanner: noticeSrc,
  ResultStatus: statusSrc,
  useCalcState: hookSrc,
};

describe('catalog printing goes through format-result', () => {
  it('prints catalog numbers', () => {
    expect(catalogResistance(4700)).toBe('4.7 kΩ');
    expect(catalogResistance(4750)).toBe('4.75 kΩ');
    expect(catalogResistance(0.047)).toBe('47 mΩ');
    expect(catalogResistance(1e6)).toBe('1 MΩ');
    expect(catalogRatio(0.25)).toBe('0.25');
    expect(CATALOG_OPTS.accuracyClass).toBe('exact');
  });
});

describe('signedPercent', () => {
  it('goes through core formatSignedPercent: explicit sign, size rounded away from zero', () => {
    expect(signedPercent(0.0073)).toBe('+0.7300 %');
    expect(signedPercent(-0.0125)).toBe('-1.250 %');
    expect(signedPercent(0.01)).toBe('+1.000 %');
  });
  it('prints zero and float noise as 0 % without a sign', () => {
    expect(signedPercent(0)).toBe('0 %');
    expect(signedPercent(1e-15)).toBe('0 %');
    expect(signedPercent(-NEGLIGIBLE_ERROR / 10)).toBe('0 %');
  });
  it('never prints NaN or Infinity', () => {
    expect(signedPercent(Number.NaN)).toBe('not available');
    expect(signedPercent(Number.POSITIVE_INFINITY)).toBe('not available');
  });
  it('never understates a size', () => {
    for (const f of [0.00001, 0.0004, 0.0049, 0.0051, 0.2, -0.00001, -0.0049]) {
      const shown = Number(signedPercent(f).replace(' %', ''));
      expect(Math.abs(shown)).toBeGreaterThanOrEqual(Math.abs(f) * 100 - 1e-9);
    }
  });
});

describe('parseToleranceField', () => {
  it('accepts a percent or a small fraction and echoes it as a percent', () => {
    const a = parseToleranceField('1%');
    const b = parseToleranceField('0.01');
    expect(a.status).toBe('ok');
    expect(b.status).toBe('ok');
    if (a.status === 'ok' && b.status === 'ok') {
      expect(a.value.si).toBeCloseTo(0.01, 12);
      expect(b.value.si).toBe(0.01);
      expect(a.echo).toContain('1 %');
    }
  });
  it('a bare 1 gets the "write 1% or 0.01" hint instead of meaning 100 %', () => {
    const r = parseToleranceField('1');
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.message).toMatch(/Write 1% or 0\.01/);
  });
  it('a bare number above 1 gets the parser hint and a bare 0.7 is refused', () => {
    const r = parseToleranceField('5');
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.message).toMatch(/write 5% or 0\.05/);
    expect(parseToleranceField('0.7').status).toBe('error');
  });
  it('empty, garbage, zero and negative never give a value', () => {
    expect(parseToleranceField('  ').status).toBe('empty');
    for (const t of ['abc', '0', '-1%', '1%%', 'NaN', 'Infinity', '1e999%']) expect(parseToleranceField(t).status, t).not.toBe('ok');
  });
});

describe('choices', () => {
  it('offers the documented series, snap directions and series list', () => {
    expect(DIVIDER_SERIES.map((s) => s.value)).toEqual(['none', 'E24', 'E96', 'E192']);
    expect(SNAP_CHOICES).toHaveLength(3);
    expect(ALL_SERIES).toEqual(['E3', 'E6', 'E12', 'E24', 'E48', 'E96', 'E192']);
  });
});

describe('source scans (all circuit-value UI files)', () => {
  it('no direct formatFor/formatDual, no hand rounding, no engineering math', () => {
    for (const [f, text] of Object.entries(UI_FILES)) {
      const code = strip(text);
      expect(code, f).not.toMatch(/\bformatFor\b|\bformatDual\b|\bformatDualThickness\b/);
      expect(code, f).not.toMatch(/round\s*:\s*['"]nearest['"]/);
      expect(code, f).not.toMatch(/toPrecision|toFixed|Math\.round|Math\.ceil|Math\.floor/);
      expect(code, f).not.toMatch(/Math\.(sqrt|pow|log|exp|PI)|\.si\s*[*/+-]/);
    }
  });
  it('the snap direction literal is spelled in exactly one UI file, never in a page or a view-model', () => {
    const holders = Object.entries(UI_FILES)
      .filter(([, t]) => /'nearest'/.test(strip(t)))
      .map(([f]) => f);
    expect(holders).toEqual(['circuit-choices']);
  });
  it('no inline scripts or styles, no raw HTML, no network, no storage', () => {
    for (const [f, text] of Object.entries(UI_FILES)) {
      const code = strip(text);
      expect(code, f).not.toMatch(/<script|\sstyle=|dangerouslySetInnerHTML|innerHTML|fetch\(|XMLHttpRequest|localStorage|sessionStorage|eval\(/);
    }
  });
  it('every page has a visually hidden live region, a reset button and the notice banner', () => {
    for (const [f, page] of [['OhmPower', ohmPage], ['ResistorDivider', divPage], ['ESeries', ePage], ['FeedbackDivider', fbPage], ['LedResistor', ledPage], ['RcLc', rcPage], ['Reactance', rePage]] as const) {
      expect(page, f).toMatch(/class="visually-hidden" role="status" aria-live="polite"/);
      expect(page, f).toMatch(/<ResetButton/);
      expect(page, f).toMatch(/NoticeBanner/);
    }
  });
});

describe('hash keys', () => {
  it('are documented, never reserved, never v', () => {
    const reserved = Object.keys(RESERVED_STATE_KEYS);
    for (const id of ['ohm-power', 'resistor-divider', 'e-series', 'feedback-divider', 'led-resistor', 'rc-lc', 'reactance'] as const) {
      const table: Record<string, string> = CALCULATOR_STATE_KEYS[id];
      const keys = Object.keys(table);
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) {
        expect(reserved, `${id}.${k}`).not.toContain(k);
        expect(k).not.toBe('v');
        expect((table[k] ?? '').length, `${id}.${k}`).toBeGreaterThan(20);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Contrast of the NEW styles, measured from the real stylesheet variables.
// ---------------------------------------------------------------------------
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
}
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
function vars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1] as string] = m[2] as string;
  return out;
}
describe('contrast of the circuit-value styles', () => {
  const light = vars(/:root\s*\{([^}]*)\}/.exec(cssSrc)?.[1] ?? '');
  const dark = vars(/prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(cssSrc)?.[1] ?? '');
  for (const [name, v] of [['light', light], ['dark', dark]] as const) {
    it(`${name}: text pairs reach 4.5:1 and graphic strokes 3:1`, () => {
      const g = (k: string): string => v[k] ?? '#000000';
      expect(Object.keys(v).length).toBeGreaterThan(8);
      expect(ratio(g('fg'), g('card'))).toBeGreaterThanOrEqual(4.5); // .schem-text
      expect(ratio(g('muted'), g('card'))).toBeGreaterThanOrEqual(4.5); // .schem-sub
      expect(ratio(g('fg'), g('bg'))).toBeGreaterThanOrEqual(4.5); // .count-state, ul.decade li
      expect(ratio(g('err-fg'), g('err-bg'))).toBeGreaterThanOrEqual(4.5); // .count-over
      expect(ratio(g('link'), g('card'))).toBeGreaterThanOrEqual(3); // .schem-unknown stroke
      expect(ratio(g('link'), g('bg'))).toBeGreaterThanOrEqual(3); // ul.decade li.chosen border
      expect(ratio(g('fg'), g('card'))).toBeGreaterThanOrEqual(3); // .schem-wire, .schem-box
    });
  }
});
