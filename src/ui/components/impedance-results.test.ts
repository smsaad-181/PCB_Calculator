import { describe, expect, it } from 'vitest';
import { IMPEDANCE_BANNER } from '../../core/calculators/impedance-shared';
import { LOSS_LABEL } from '../../core/calculators/loss-shared';
import * as cx from '../calculators/coax.vm';
import * as ms from '../calculators/microstrip.vm';
import * as sl from '../calculators/stripline.vm';
import * as qw from '../calculators/quarter-wave.vm';
import { ImpedanceResults } from './ImpedanceCommon';
import { LossResults } from './LossResults';

interface VNodeLike {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}
const isV = (n: unknown): n is VNodeLike => typeof n === 'object' && n !== null && 'props' in n && 'type' in n;
const textOf = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isV(node)) return typeof node.type === 'function' ? textOf((node.type as (p: unknown) => unknown)(node.props)) : textOf(node.props['children']);
  return '';
};

const MS = { ...ms.DEFAULT_STATE, width: '600 um', height: '635 um', er: '4.1', erSource: 'test value', frequency: '1 GHz', length: '100 mm', lossTangent: '0.02', lossSource: 'datasheet, test value' };

describe('impedance results with loss and tolerance', () => {
  it('shows the loss block with its approximation label, the unverified rows and the verbatim banner', () => {
    const t = textOf(ImpedanceResults({ view: ms.computeView(MS) }));
    expect(t).toContain(IMPEDANCE_BANNER);
    expect(t).toContain(LOSS_LABEL);
    expect(t).toMatch(/Total loss \(dielectric \+ conductor\) \(dB\/m\)4\.4 dB\/m/);
    expect(t).toMatch(/S-029e\s*UNVERIFIED/);
    expect(t).toMatch(/S-029f\s*UNVERIFIED/);
    expect(t).toMatch(/S-029d\s*VERIFIED/);
  });
  it('a geometry without a conductor-loss form shows the core notice and no total', () => {
    const v = sl.computeView({ ...sl.DEFAULT_STATE, width: '0.2 mm', spacing: '0.4 mm', er: '4', erSource: 't', frequency: '1 GHz', lossTangent: '0.02', lossSource: 'datasheet, test value' });
    const t = textOf(ImpedanceResults({ view: v }));
    expect(t).toMatch(/conductor loss not modelled for this geometry/);
    expect(t).not.toMatch(/Total loss/);
    expect(t).toContain(LOSS_LABEL);
  });
  it('a missing source note shows what is missing instead of loss numbers, and the main result stays', () => {
    const v = ms.computeView({ ...MS, lossSource: '' });
    const t = textOf(ImpedanceResults({ view: v }));
    expect(t).toMatch(/Loss estimate: not shown yet/);
    expect(t).toMatch(/source of the loss tangent/);
    expect(t).not.toMatch(/dB\/m/);
    expect(t).toContain(IMPEDANCE_BANNER);
  });
  it('LossResults renders nothing with nothing to show', () => {
    expect(LossResults({ loss: undefined, needs: [] })).toBeNull();
  });
  it('tolerance corners are labelled as such with min, typical and max and the sensitivity table', () => {
    const v = cx.computeView({ ...cx.DEFAULT_STATE, outerDiameter: '3.5 mm', innerDiameter: '1 mm', er: '2.1', erSource: 't', tolOuter: '2 %', tolInner: '2 %', tolEr: '3 %' });
    const t = textOf(ImpedanceResults({ view: v }));
    expect(t).toMatch(/Characteristic impedance Z0 \(nominal\), tolerance corners/);
    expect(t).toMatch(/49\.44 Ω51\.83 Ω54\.31 Ω/);
    expect(t).toMatch(/Sensitivity of characteristic impedance Z0 to outer diameter/);
    expect(t).toContain(IMPEDANCE_BANNER);
  });
  it('the quarter-wave result carries the banner, the antenna notice and the unverified helper row', () => {
    const v = qw.computeView({ ...qw.DEFAULT_STATE, epsEff: '2.967', frequency: '5 GHz' });
    const t = textOf(ImpedanceResults({ view: v }));
    expect(t).toContain(IMPEDANCE_BANNER);
    expect(t).toMatch(/Important: This is not an antenna length/);
    expect(t).toMatch(/S-029c\s*UNVERIFIED/);
    expect(t).toMatch(/8\.70\d mm/);
  });
  it('an error or a missing input never renders a number', () => {
    for (const v of [ms.computeView({ ...MS, lossTangent: 'abc' }), ms.computeView({ ...MS, width: '' })]) {
      const t = textOf(ImpedanceResults({ view: v }));
      expect(t).toContain(IMPEDANCE_BANNER);
      expect(t).not.toMatch(/dB\/m|NaN|Infinity/);
    }
  });
});
