import { useMemo } from 'preact/hooks';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { ResultsPanel } from '../components/ResultsPanel';
import { useCalcState } from '../useCalcState';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  FIELD_HELP,
  FIELD_KEYS,
  FIELD_LABEL,
  FIELD_PLACEHOLDER,
  FIELD_UNIT_HINT,
  HINT_TEXT,
  METHOD_TEXT,
  RANGE_HINT,
  computeView,
  countStatus,
  countText,
  fieldDim,
  fieldPatch,
  fromHashState,
  liveSummary,
  toHashState,
  type FieldErrors,
  type OhmState,
} from './ohm-power.vm';

export default function OhmPower() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<OhmState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied), [applied]);
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const count = countStatus(state);

  return (
    <div class="calc-layout">
      <p class="muted">
        Give any two of voltage, current, resistance and power; the other two are solved. Ideal resistor, DC or RMS values of a resistive load.
      </p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Ohm's law and power inputs" aria-describedby="ohm-count" noValidate>
          <h2>Inputs</h2>
          <p class="help" id="ohm-hint">
            {HINT_TEXT}
          </p>
          <p id="ohm-count" class={`count-state count-${count}`}>
            <span aria-hidden="true">{count === 'ok' ? '✔ ' : count === 'over' ? '✖ ' : '… '}</span>
            <strong>{countText(state)}</strong>
          </p>
          {FIELD_KEYS.map((k) => (
            <QuantityField
              key={k}
              id={`ohm-${k}`}
              label={FIELD_LABEL[k]}
              unitHint={FIELD_UNIT_HINT[k]}
              text={state[k]}
              onText={(text) => patch(fieldPatch(k, text))}
              expectedDim={fieldDim(k)}
              help={FIELD_HELP[k]}
              placeholder={FIELD_PLACEHOLDER[k]}
              externalError={fe[k]}
            />
          ))}
          <ResetButton onReset={reset} />
        </form>
        <section class="panel output" aria-labelledby="result-h" aria-busy={pending ? 'true' : undefined} data-pending={pending ? 'true' : undefined}>
          <h2 id="result-h">Result</h2>
          <p class="method-line">{METHOD_TEXT}</p>
          <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {liveSummary(applied, view)}
          </div>
          {view.status === 'ok' ? (
            <ResultsPanel view={view.result} failedCheckHint={RANGE_HINT} />
          ) : view.status === 'error' ? (
            <ResultStatus status="error" items={view.problems} />
          ) : (
            <ResultStatus status="needs-input" items={view.needs} />
          )}
        </section>
      </div>
    </div>
  );
}
