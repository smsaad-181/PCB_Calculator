import { useMemo } from 'preact/hooks';
import { LedgerRowBadges } from '../components/LedgerRowBadges';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { ResultsPanel } from '../components/ResultsPanel';
import { useCalcState } from '../useCalcState';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  FIELD_KEYS,
  KIND_OPTIONS,
  METHOD_TEXT,
  RANGE_HINT,
  computeView,
  fieldDim,
  fieldHelp,
  fieldLabel,
  fieldPlaceholder,
  fieldUnitHint,
  formulaOf,
  fromHashState,
  isKind,
  liveSummary,
  toHashState,
  type FieldErrors,
  type ReactanceState,
  type ReactanceView,
} from './reactance.vm';

function Results({ view }: { view: ReactanceView }) {
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

export default function Reactance() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<ReactanceState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied), [applied]);
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const kind = state.kind;

  return (
    <div class="calc-layout">
      <p class="muted">
        Reactance magnitude of an ideal inductor or capacitor at one frequency. Give any two of reactance, frequency and the component value and the third is solved. Ideal parts: no ESR, ESL or self-resonance.
      </p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Reactance inputs" noValidate>
          <h2>Inputs</h2>
          <RadioGroup
            name="reactance-kind"
            legend="Kind of reactance (required, no default)"
            value={kind}
            options={KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => {
              if (isKind(v)) patch({ kind: v });
            }}
          />
          {kind !== '' && (
            <p class="help" id="reactance-formula">
              Formula: <code>{formulaOf(kind)}</code>. Give exactly two of the three values below; the empty one is solved. Reactance is a magnitude (always positive).
            </p>
          )}
          {kind !== '' &&
            FIELD_KEYS.map((k) => (
              <QuantityField
                key={k}
                id={`reactance-${k}`}
                label={fieldLabel(kind, k)}
                unitHint={fieldUnitHint(kind, k)}
                text={state[k]}
                onText={(text) => patch({ [k]: text })}
                expectedDim={fieldDim(kind, k)}
                help={fieldHelp(kind, k)}
                placeholder={fieldPlaceholder(kind, k)}
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
