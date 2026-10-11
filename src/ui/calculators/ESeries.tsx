import { useMemo } from 'preact/hooks';
import { DIM } from '../../core/units';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { SelectField } from '../components/SelectField';
import { UnverifiedBadge } from '../components/UnverifiedBadge';
import { parseFractionField } from '../components/view';
import { useCalcState } from '../useCalcState';
import { isSeriesName, isTopology } from './circuit-choices';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  METHOD_TEXT,
  PAIR_COUNT,
  SERIES_OPTIONS,
  SOURCE_ADVICE,
  SOURCE_LEDGER_IDS,
  SOURCE_STATUS,
  TOPOLOGY_OPTIONS,
  TOPOLOGY_FORMULA,
  computeNearest,
  computePairs,
  fromHashState,
  nearestSummary,
  pairTargetLabel,
  pairsSummary,
  toHashState,
  type ESeriesState,
  type NearestView,
  type PairsView,
} from './e-series.vm';

function Nearest({ view }: { view: NearestView }) {
  if (view.status === 'needs-input') return <ResultStatus status="needs-input" items={view.needs} />;
  if (view.status === 'error') return <ResultStatus status="error" items={view.problems} />;
  return (
    <div class="results">
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">Nearest, next up and next down values with their signed error against your target</caption>
          <thead>
            <tr>
              <th scope="col">Which</th>
              <th scope="col">Value</th>
              <th scope="col">Error vs target</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td class="num">{r.value}</td>
                <td class="num">{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.exact && <p class="muted">The target is itself a value of this series, so all three rows agree.</p>}
      <p class="muted">Error is (value − target) / target. Its size is printed rounded up to 0.1 %, so it is never understated.</p>
      <details class="more">
        <summary>{view.decade.title}</summary>
        <ul class="decade">
          {view.decade.values.map((v, i) => (
            <li key={`${String(i)}:${v.text}`} class={v.chosen ? 'chosen' : undefined}>
              {v.text}
              {v.chosen && <span class="visually-hidden"> (the nearest value)</span>}
              {v.chosen && <span aria-hidden="true"> ◄</span>}
            </li>
          ))}
        </ul>
        <p class="muted">The value marked ◄ is the nearest to your target.</p>
      </details>
    </div>
  );
}

function Pairs({ view, topology }: { view: PairsView; topology: ESeriesState['topology'] }) {
  if (view.status === 'needs-input') return <ResultStatus status="needs-input" items={view.needs} />;
  if (view.status === 'error') return <ResultStatus status="error" items={view.problems} />;
  const divider = topology === 'divider-ratio';
  return (
    <div class="results">
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">The best pairs of series values for your target, closest first</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{divider ? 'R1 (top)' : 'R1'}</th>
              <th scope="col">{divider ? 'R2 (bottom)' : 'R2'}</th>
              <th scope="col">{divider ? 'Ratio' : 'Result'}</th>
              <th scope="col">Error vs target</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r, i) => (
              <tr key={`${r.r1}:${r.r2}`}>
                <th scope="row">{i + 1}</th>
                <td class="num">{r.r1}</td>
                <td class="num">{r.r2}</td>
                <td class="num">{r.value}</td>
                <td class="num">{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="muted">
        <strong>Result</strong> is {view.resultHeading}. {view.window} Pairs are ordered by error, then by fewer significant digits. Error is printed rounded up to 0.1 %.
      </p>
    </div>
  );
}

export default function ESeries() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<ESeriesState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const nearest = useMemo(() => computeNearest(applied), [applied]);
  const pairs = useMemo(() => computePairs(applied), [applied]);
  const ratio = state.topology === 'divider-ratio';

  return (
    <div class="calc-layout">
      <p class="muted">Find the closest standard resistor value to a target, or the best pair of standard values for a series, parallel or divider-ratio target.</p>
      <p class="unverified-line">
        <span class="pill-unverified">UNVERIFIED</span> <UnverifiedBadge status={SOURCE_STATUS} ledgerIds={SOURCE_LEDGER_IDS} />
      </p>
      <p class="notice">
        <strong>Check against IEC 60063 yourself.</strong> {SOURCE_ADVICE}
      </p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <p class="method-line">{METHOD_TEXT}</p>
      <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {nearestSummary(nearest)} {pairsSummary(pairs)}
      </div>
      <div class="calc-stack" aria-busy={pending ? 'true' : undefined} data-pending={pending ? 'true' : undefined}>
        <section class="panel" aria-labelledby="near-h">
          <h2 id="near-h">Nearest value</h2>
          <QuantityField
            id="nt"
            label="Target resistance"
            unitHint="Ω, kΩ, MΩ or a code such as 4k7"
            text={state.nearestTarget}
            onText={(nearestTarget) => patch({ nearestTarget })}
            expectedDim={DIM.RESISTANCE}
            help="Examples: 4k7, 2.2k, 4.7 kΩ, 330 Ω. Always write the unit or a code such as 4k7."
            placeholder="4k7"
            required
          />
          <SelectField
            id="ns"
            label="Series"
            value={state.nearestSeries}
            options={SERIES_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => {
              if (isSeriesName(v)) patch({ nearestSeries: v });
            }}
          />
          <h3>Result</h3>
          <Nearest view={nearest} />
        </section>
        <section class="panel" aria-labelledby="pair-h">
          <h2 id="pair-h">Two-resistor search</h2>
          <RadioGroup
            name="topology"
            legend="What the pair makes"
            value={state.topology}
            options={TOPOLOGY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => {
              if (isTopology(v)) patch({ topology: v });
            }}
          />
          <p class="help">{TOPOLOGY_FORMULA[state.topology]}</p>
          <QuantityField
            id="pt"
            label={pairTargetLabel(state.topology)}
            unitHint={ratio ? 'a fraction or percent, for example 0.25 or 25%' : 'Ω, kΩ, MΩ or a code such as 4k7'}
            text={state.pairTarget}
            onText={(pairTarget) => patch({ pairTarget })}
            expectedDim={ratio ? DIM.DIMENSIONLESS : DIM.RESISTANCE}
            {...(ratio ? { parser: parseFractionField } : {})}
            help={ratio ? 'Strictly between 0 and 1. Examples: 0.25, 25%, 0.3125.' : 'Examples: 3k3, 3.3 kΩ, 47 Ω.'}
            placeholder={ratio ? '0.25' : '3k3'}
            required
          />
          <SelectField
            id="ps"
            label="Series"
            value={state.pairSeries}
            options={SERIES_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => {
              if (isSeriesName(v)) patch({ pairSeries: v });
            }}
          />
          <h3>Best {String(PAIR_COUNT)} pairs</h3>
          <Pairs view={pairs} topology={applied.topology} />
        </section>
        <ResetButton onReset={reset} />
      </div>
    </div>
  );
}
