import { describe, expect, it } from 'vitest';
import { fromUnit } from '../units';
import { validateStackup } from './guards';
import { deriveMicrostrip, deriveStripline } from './derive';

// Edge cases of the stackup model not covered by the main suites.
const um = (n: number) => fromUnit(n, 'um');
const cu = (name: string) => ({ kind: 'copper' as const, name, thickness: um(35) });
const d = (name: string, t: number, extra: Record<string, unknown> = {}) => ({ kind: 'dielectric' as const, name, thickness: um(t), er: 4.2, source: 's', ...extra });

describe('stackup edge cases', () => {
  it('a soldermask with a source but no er is accepted', () => {
    const r = validateStackup({ name: 'x', layers: [{ kind: 'soldermask', name: 'm', thickness: um(20), source: 'fabricator note' }, cu('A'), d('d', 100), cu('B')] });
    expect(r.ok).toBe(true);
  });
  it('a soldermask with a blank source is rejected', () => {
    const r = validateStackup({ name: 'x', layers: [{ kind: 'soldermask', name: 'm', thickness: um(20), source: ' ' }, cu('A'), d('d', 100), cu('B')] });
    expect(r.ok).toBe(false);
  });
  it('a copper weight that converts to an implausible thickness is OUT_OF_DOMAIN', () => {
    const r = validateStackup({ name: 'x', layers: [{ kind: 'copper', name: 'A', weight: fromUnit(500, 'oz/ft2') }, d('d', 100), cu('B')] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.find((e) => e.field === 'layers[0].weight')?.code).toBe('OUT_OF_DOMAIN');
  });
  it('a note is carried and a blank note is rejected', () => {
    const a = validateStackup({ name: 'x', note: 'hello', layers: [cu('A'), d('d', 100), cu('B')] });
    expect(a.ok && a.value.note).toBe('hello');
    expect(validateStackup({ name: 'x', note: '', layers: [cu('A'), d('d', 100), cu('B')] }).ok).toBe(false);
  });
  it('the signal layer must be a name or an index', () => {
    const s = validateStackup({ name: 'x', layers: [cu('A'), d('d', 100), cu('B')] });
    if (!s.ok) throw new Error('stack');
    expect(deriveMicrostrip(s.value, undefined as unknown as string).ok).toBe(false);
    expect(deriveStripline(s.value, undefined as unknown as string).ok).toBe(false);
  });
  it('stripline: Df that differs above and below is not carried, with a note; equal Df is carried', () => {
    const mk = (a: number | undefined, b: number | undefined) => {
      const r = validateStackup({
        name: 'x',
        layers: [cu('P1'), d('t', 200, a === undefined ? {} : { df: a }), cu('S'), d('b', 200, b === undefined ? {} : { df: b }), cu('P2')],
      });
      if (!r.ok) throw new Error('stack');
      const g = deriveStripline(r.value, 'S');
      if (!g.ok) throw new Error(g.error.message);
      return g.value;
    };
    expect(mk(0.02, 0.02).df).toBe(0.02);
    const diff = mk(0.02, 0.03);
    expect(diff.df).toBeUndefined();
    expect(diff.notes.join(' ')).toMatch(/Df/);
    expect(mk(undefined, undefined).df).toBeUndefined();
  });
  it('stripline: a strip with dielectric but no plane on one side has no reference plane', () => {
    const r = validateStackup({ name: 'x', layers: [cu('P1'), d('t', 200), cu('S'), d('b', 200)] });
    if (!r.ok) throw new Error('stack');
    const g = deriveStripline(r.value, 'S');
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.error.message).toMatch(/reference plane/);
  });
  it('microstrip: dielectric with different er on a trace with no copper behind it still reports the missing plane or the er problem, never a number', () => {
    const r = validateStackup({ name: 'x', layers: [cu('T'), d('a', 100), d('b', 100, { er: 4.6 })] });
    if (!r.ok) throw new Error('stack');
    expect(deriveMicrostrip(r.value, 'T').ok).toBe(false);
  });
});
