import { useMemo } from 'preact/hooks';
import { EnvelopeTable } from '../components/EnvelopeTable';
import { FeedbackSchematic } from '../components/FeedbackSchematic';
import { LedgerRowBadges } from '../components/LedgerRowBadges';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { ResultsPanel } from '../components/ResultsPanel';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { useCalcState } from '../useCalcState';
import { useSearch } from '../useSearch';
import { FEEDBACK_SERIES, SNAP_CHOICES, isFeedbackSeries, isSnapChoice, parseCountFieldView, parseToleranceField } from './circuit-choices';
import {
  BIAS_OPTIONS,
  CALCULATOR_ID,
  DEFAULT_STATE,
  FIELD_LABEL,
  MAX_NOTE_CHARS,
  METHOD_TEXT,
  NAMING_TEXT,
  RANGE_HINT,
  VREF_HELP,
  VREF_PLACEHOLDER,
  VREF_SOURCE_HELP,
  fieldDim,
  finishView,
  fromHashState,
  isBiasDirection,
  liveSummary,
  mode,
  plan,
  schematicDescription,
  searchingSummary,
  seriesApplies,
  snapApplies,
  toHashState,
  type FeedbackState,
  type FeedbackView,
  type FieldErrors,
} from './feedback-divider.vm';

function PairsTable({ view }: { view: Extract<FeedbackView, { status: 'ok' }> }) {
  if (view.pairs.length === 0) return null;
  return (
    <section class="pairs" aria-labelledby="fb-pairs-h">
      <h3 id="fb-pairs-h">Best pairs, closest first</h3>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">The best pairs of stock values for your target output voltage, with the resulting Vout and its signed error against the target</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">R1 (top)</th>
              <th scope="col">R2 (bottom)</th>
              <th scope="col">Vout</th>
              <th scope="col">Vout error vs target</th>
            </tr>
          </thead>
          <tbody>
            {view.pairs.map((p) => (
              <tr key={`${p.r1}:${p.r2}`}>
                <th scope="row">{p.n}</th>
                <td class="num">{p.r1}</td>
                <td class="num">{p.r2}</td>
                <td class="num">{p.vout}</td>
                <td class="num">{p.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="muted">Pairs are ranked by the divider-ratio error, then Vout and its error are recomputed for each pair. Error size is rounded away from zero.</p>
    </section>
  );
}

function Results({ view }: { view: FeedbackView }) {
  if (view.status === 'ok') {
    return (
      <ResultsPanel
        view={view.result}
        failedCheckHint={RANGE_HINT}
        afterHeadline={
          <>
            <PairsTable view={view} />
            {view.envelopes.map((e, i) => (
              <EnvelopeTable key={e.label} env={e} id={`fb-env-${String(i)}`} />
            ))}
            <LedgerRowBadges heading="Data behind this result (one status per ledger row)" rows={view.ledgerRows} />
          </>
        }
      />
    );
  }
  if (view.status === 'error') return <ResultStatus status="error" items={view.problems} />;
  return <ResultStatus status="needs-input" items={view.needs} />;
}

export default function FeedbackDivider() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<FeedbackState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const p = useMemo(() => plan(applied), [applied]);
  const search = useSearch(p.kind === 'search' ? p.task : null);
  const view = useMemo((): FeedbackView | 'searching' => {
    if (p.kind === 'view') return p.view;
    if (search.status === 'done' && search.reply.kind === 'feedback') return finishView(p.state, search.reply.outcome);
    return 'searching';
  }, [p, search]);
  const fe: FieldErrors = view !== 'searching' && 'fieldErrors' in view ? view.fieldErrors : {};

  const m = mode(state);
  const drawn = m === 'vout' || m === 'r1' || m === 'r2' || m === 'pair' ? m : null;
  const showSeries = seriesApplies(state);
  const showSnap = snapApplies(state);
  const showPairs = m === 'pair';
  const showDirection = state.fbBias.trim() !== '';

  return (
    <div class="calc-layout">
      <p class="muted">
        Output voltage of a regulator feedback divider, Vout = Vref × (1 + R1 / R2). Give any two of R1, R2 and Vout and the empty one is solved; give Vout alone and choose a series to search for the best pair of stock
        values. Ideal resistors, DC.
      </p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Regulator feedback divider inputs" noValidate>
          <h2>Inputs</h2>
          <FeedbackSchematic unknown={drawn} description={schematicDescription(drawn ?? 'vout')} />
          <p class="notice">
            <strong>Resistor naming.</strong> {NAMING_TEXT}
          </p>
          <QuantityField
            id="fb-vref"
            label={FIELD_LABEL.vref}
            unitHint="V or mV"
            text={state.vref}
            onText={(vref) => patch({ vref })}
            expectedDim={fieldDim('vref')}
            help={VREF_HELP}
            placeholder={VREF_PLACEHOLDER}
            required
            externalError={fe.vref}
          />
          <TextField
            id="fb-vsrc"
            label="Vref source note (optional)"
            text={state.vrefSource}
            onText={(vrefSource) => patch({ vrefSource })}
            help={VREF_SOURCE_HELP}
            maxLength={MAX_NOTE_CHARS}
            placeholder="datasheet name, revision, table"
            externalError={fe.vrefSource}
          />
          <p class="help" id="fb-two-of-three">
            Fill in exactly two of R1, R2 and Vout. The empty one is solved. Vout alone with a series chosen is a best-pair search.
          </p>
          <QuantityField
            id="fb-r1"
            label={FIELD_LABEL.r1}
            unitHint="Ω, kΩ, MΩ or a code such as 4k7"
            text={state.r1}
            onText={(r1) => patch({ r1 })}
            expectedDim={fieldDim('r1')}
            help="The resistor between Vout and the FB pin. Examples: 100k, 4.7 kΩ. Leave empty to solve for it."
            placeholder="100 kΩ"
            externalError={fe.r1}
          />
          <QuantityField
            id="fb-r2"
            label={FIELD_LABEL.r2}
            unitHint="Ω, kΩ, MΩ or a code such as 4k7"
            text={state.r2}
            onText={(r2) => patch({ r2 })}
            expectedDim={fieldDim('r2')}
            help="The resistor between the FB pin and ground. Examples: 10k, 4.7 kΩ. Leave empty to solve for it."
            placeholder="10 kΩ"
            externalError={fe.r2}
          />
          <QuantityField
            id="fb-vout"
            label={FIELD_LABEL.vout}
            unitHint="V"
            text={state.vout}
            onText={(vout) => patch({ vout })}
            expectedDim={fieldDim('vout')}
            help="The target when solving a resistor, or the only voltage given in a pair search. Must be above Vref. Leave empty to solve for it."
            placeholder="3.3 V"
            externalError={fe.vout}
          />
          {showSeries && (
            <SelectField
              id="fb-series"
              label={m === 'pair' ? 'Series to search (required)' : 'Snap the solved resistor to a series'}
              value={state.series}
              options={FEEDBACK_SERIES.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => {
                if (isFeedbackSeries(v)) patch({ series: v });
              }}
              help={
                m === 'pair'
                  ? 'A pair search needs a series. E96 and E192 search more pairs and take up to about a second; the page stays responsive. Those lists are not yet checked against IEC 60063.'
                  : 'None gives the exact value. A series picks a stock value; those lists are not yet checked against IEC 60063.'
              }
            />
          )}
          {showSnap && (
            <RadioGroup
              name="fb-snap"
              legend="Snap direction (required, no default)"
              value={state.snap}
              options={SNAP_CHOICES.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => {
                if (isSnapChoice(v)) patch({ snap: v });
              }}
            />
          )}
          {showPairs && (
            <QuantityField
              id="fb-pairs"
              label={FIELD_LABEL.pairs}
              unitHint="a whole number from 1 to 10"
              text={state.pairs}
              onText={(pairs) => patch({ pairs })}
              expectedDim={fieldDim('vref')}
              parser={parseCountFieldView}
              help="Optional. Empty lists 5."
              placeholder="5"
              externalError={fe.pairs}
            />
          )}
          <QuantityField
            id="fb-tol"
            label="Resistor tolerance (optional)"
            unitHint="percent, for example 1%"
            text={state.tolerance}
            onText={(tolerance) => patch({ tolerance })}
            expectedDim={fieldDim('vref')}
            parser={parseToleranceField}
            help="Write 1% or 0.01. Gives a minimum and maximum output voltage. Empty means no tolerance."
            placeholder="1%"
            externalError={fe.tolerance}
          />
          <QuantityField
            id="fb-vtol"
            label="Vref tolerance (optional)"
            unitHint="percent, for example 1%"
            text={state.vrefTolerance}
            onText={(vrefTolerance) => patch({ vrefTolerance })}
            expectedDim={fieldDim('vref')}
            parser={parseToleranceField}
            help="From the regulator datasheet. Write 1% or 0.01. Empty means Vref is exact."
            placeholder="1%"
            externalError={fe.vrefTolerance}
          />
          <QuantityField
            id="fb-ib"
            label="FB pin bias current (optional)"
            unitHint="A, mA, µA or nA; magnitude"
            text={state.fbBias}
            onText={(fbBias) => patch({ fbBias })}
            expectedDim={fieldDim('fbBias')}
            help="From the regulator datasheet. Shows the shift of Vout; needs a direction. Empty means the bias current is ignored."
            placeholder="50 nA"
            externalError={fe.fbBias}
          />
          {showDirection && (
            <RadioGroup
              name="fb-dir"
              legend="Direction of the FB bias current (required, no default)"
              value={state.biasDirection}
              options={BIAS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => {
                if (isBiasDirection(v)) patch({ biasDirection: v });
              }}
            />
          )}
          <ResetButton onReset={reset} />
        </form>
        <section class="panel output" aria-labelledby="result-h" aria-busy={pending || view === 'searching' ? 'true' : undefined} data-pending={pending ? 'true' : undefined}>
          <h2 id="result-h">Result</h2>
          <p class="method-line">{METHOD_TEXT}</p>
          <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {view === 'searching' ? searchingSummary(applied) : liveSummary(view)}
          </div>
          {view === 'searching' ? (
            <div class="needs">
              <p>
                <strong>Searching...</strong>
              </p>
              <p>
                Looking for the best pair in the {applied.series} series. This can take up to about a second for E96 and E192, and the page stays responsive. No result is shown until the search finishes.
              </p>
            </div>
          ) : (
            <Results view={view} />
          )}
        </section>
      </div>
    </div>
  );
}
