import { useMemo } from 'preact/hooks';
import { LedgerRowBadges } from '../components/LedgerRowBadges';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { ResultsPanel } from '../components/ResultsPanel';
import { SelectField } from '../components/SelectField';
import { useCalcState } from '../useCalcState';
import { LED_SERIES, isLedSeries, parseCountFieldView } from './circuit-choices';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  FIELD_HELP,
  FIELD_LABEL,
  FIELD_PLACEHOLDER,
  FIELD_UNIT_HINT,
  METHOD_TEXT,
  RANGE_HINT,
  computeView,
  fieldDim,
  fromHashState,
  liveSummary,
  toHashState,
  type FieldErrors,
  type LedState,
  type LedView,
} from './led-resistor.vm';

function Results({ view }: { view: LedView }) {
  if (view.status === 'ok') {
    return (
      <ResultsPanel
        view={view.result}
        failedCheckHint={RANGE_HINT}
        afterHeadline={<LedgerRowBadges heading="Data behind this result (one status per ledger row)" rows={view.ledgerRows} />}
      />
    );
  }
  if (view.status === 'error') return <ResultStatus status="error" items={view.problems} />;
  return <ResultStatus status="needs-input" items={view.needs} />;
}

export default function LedResistor() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<LedState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied), [applied]);
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};

  return (
    <div class="calc-layout">
      <p class="muted">
        Series resistor for an LED (or several LEDs in series) from the supply voltage, the LED forward voltage and the target current, optionally rounded up to a stock value. Ideal resistor, DC.
      </p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="LED series resistor inputs" noValidate>
          <h2>Inputs</h2>
          <QuantityField
            id="led-vs"
            label={FIELD_LABEL.vs}
            unitHint={FIELD_UNIT_HINT.vs}
            text={state.vs}
            onText={(vs) => patch({ vs })}
            expectedDim={fieldDim('vs')}
            help={FIELD_HELP.vs}
            placeholder={FIELD_PLACEHOLDER.vs}
            required
            externalError={fe.vs}
          />
          <QuantityField
            id="led-vf"
            label={FIELD_LABEL.vf}
            unitHint={FIELD_UNIT_HINT.vf}
            text={state.vf}
            onText={(vf) => patch({ vf })}
            expectedDim={fieldDim('vf')}
            help={FIELD_HELP.vf}
            placeholder={FIELD_PLACEHOLDER.vf}
            required
            externalError={fe.vf}
          />
          <QuantityField
            id="led-i"
            label={FIELD_LABEL.current}
            unitHint={FIELD_UNIT_HINT.current}
            text={state.current}
            onText={(current) => patch({ current })}
            expectedDim={fieldDim('current')}
            help={FIELD_HELP.current}
            placeholder={FIELD_PLACEHOLDER.current}
            required
            externalError={fe.current}
          />
          <QuantityField
            id="led-n"
            label={FIELD_LABEL.nLeds}
            unitHint={FIELD_UNIT_HINT.nLeds}
            text={state.nLeds}
            onText={(nLeds) => patch({ nLeds })}
            expectedDim={fieldDim('vs')}
            parser={parseCountFieldView}
            help={FIELD_HELP.nLeds}
            placeholder={FIELD_PLACEHOLDER.nLeds}
            defaultText="1 LED"
            externalError={fe.nLeds}
          />
          <SelectField
            id="led-series"
            label="Round the resistor up to a series"
            value={state.series}
            options={LED_SERIES.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => {
              if (isLedSeries(v)) patch({ series: v });
            }}
            help="None gives the exact value. A series picks the next stock value at or above it, so the current does not exceed the target. Those lists are not yet checked against IEC 60063."
          />
          <QuantityField
            id="led-rating"
            label={`${FIELD_LABEL.rating} (optional)`}
            unitHint={FIELD_UNIT_HINT.rating}
            text={state.rating}
            onText={(rating) => patch({ rating })}
            expectedDim={fieldDim('rating')}
            help={FIELD_HELP.rating}
            placeholder={FIELD_PLACEHOLDER.rating}
            externalError={fe.rating}
          />
          <ResetButton onReset={reset} />
        </form>
        <section class="panel output" aria-labelledby="result-h" aria-busy={pending ? 'true' : undefined} data-pending={pending ? 'true' : undefined}>
          <h2 id="result-h">Result</h2>
          <p class="method-line">{METHOD_TEXT}</p>
          <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {liveSummary(view)}
          </div>
          <Results view={view} />
        </section>
      </div>
    </div>
  );
}
