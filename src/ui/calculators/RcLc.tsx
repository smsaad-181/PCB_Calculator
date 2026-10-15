import { useMemo } from 'preact/hooks';
import { LedgerRowBadges } from '../components/LedgerRowBadges';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { ResultsPanel } from '../components/ResultsPanel';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  FAMILY_OPTIONS,
  FIELD_HELP,
  FIELD_PLACEHOLDER,
  FIELD_UNIT_HINT,
  METHOD_TEXT,
  RANGE_HINT,
  activeFields,
  computeView,
  fieldDim,
  fieldLabel,
  formulaOf,
  fromHashState,
  isFamily,
  liveSummary,
  toHashState,
  type FieldErrors,
  type RcLcState,
  type RcLcView,
} from './rc-lc.vm';
import { useCalcState } from '../useCalcState';

function Results({ view }: { view: RcLcView }) {
  if (view.status === 'ok') {
    return (
      <ResultsPanel
        view={view.result}
        failedCheckHint={RANGE_HINT}
        {...(view.callout !== undefined ? { callout: view.callout } : {})}
        afterHeadline={<LedgerRowBadges heading="Data behind this result (one status per ledger row)" rows={view.ledgerRows} />}
      />
    );
  }
  if (view.status === 'error') return <ResultStatus status="error" items={view.problems} />;
  return <ResultStatus status="needs-input" items={view.needs} />;
}

export default function RcLc() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<RcLcState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied), [applied]);
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const family = state.family;
  const fields = activeFields(family);

  return (
    <div class="calc-layout">
      <p class="muted">
        Time constant and cut-off of an ideal RC section, or the resonant frequency of an ideal LC. Give any two of the three values and the third is solved. Ideal parts: parasitics, tolerance and source or load
        impedance are not included.
      </p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="RC and LC inputs" noValidate>
          <h2>Inputs</h2>
          <RadioGroup
            name="rclc-family"
            legend="Circuit family (required, no default)"
            value={family}
            options={FAMILY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => {
              if (isFamily(v)) patch({ family: v });
            }}
          />
          {family !== '' && (
            <p class="help" id="rclc-formula">
              Formula for this family: <code>{formulaOf(family)}</code>. Give exactly two of the {String(fields.length)} values below; the empty one is solved.
            </p>
          )}
          {family !== '' &&
            fields.map((k) => (
              <QuantityField
                key={k}
                id={`rclc-${k}`}
                label={fieldLabel(family, k)}
                unitHint={FIELD_UNIT_HINT[k]}
                text={state[k]}
                onText={(text) => patch({ [k]: text })}
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
            {liveSummary(view)}
          </div>
          <Results view={view} />
        </section>
      </div>
    </div>
  );
}
