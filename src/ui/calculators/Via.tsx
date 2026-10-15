import { useMemo, useState } from 'preact/hooks';
import { DIM } from '../../core/units';
import { Callout } from '../components/Callout';
import { LedgerRowBadges } from '../components/LedgerRowBadges';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { ResultsPanel } from '../components/ResultsPanel';
import { ViaRatingPointer } from '../components/ViaRatingPointer';
import { SelectField } from '../components/SelectField';
import { ToleranceResults } from '../components/ToleranceResults';
import { ToleranceSection } from '../components/ToleranceInputs';
import { echoPrefs } from '../components/prefs';
import { useCalcState } from '../useCalcState';
import {
  ADVANCED_CAUTION,
  CALCULATOR_ID,
  DEFAULT_STATE,
  DEFAULT_TEXT,
  DIAMETER_HELP,
  K_HELP,
  METHOD_TEXT,
  PLATING_HELP,
  RANGE_HINT,
  computeView,
  fieldDim,
  fromHashState,
  hasToleranceState,
  kOptions,
  liveSummary,
  parseCountField,
  toHashState,
  toleranceFields,
  type FieldErrors,
  type KChoice,
  type ViaState,
  type ViaView,
} from './via.vm';

function Results({ view }: { view: ViaView }) {
  if (view.status === 'ok') {
    return (
      <ResultsPanel
        view={view.result}
        failedCheckHint={RANGE_HINT}
        afterHeadline={
          <>
            <ViaRatingPointer />
            <ToleranceResults view={view.tolerance} />
            {view.cautions.map((c) => (
              <Callout key={c.code} heading={c.heading} text={c.text} />
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

export default function Via() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<ViaState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied), [applied]);
  const [tolOpen, setTolOpen] = useState(() => hasToleranceState(state));
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const tolErrors = view.status === 'error' ? (view.tolErrors ?? {}) : {};
  const widthPrefs = echoPrefs(state.units, 'width');
  const thickPrefs = echoPrefs(state.units, 'thickness');
  const otherPrefs = echoPrefs(state.units, 'other');

  return (
    <div class="calc-layout">
      <p class="muted">
        DC resistance, optional voltage drop and power loss, and axial thermal resistance of a via barrel (or N in parallel). Not a current rating. The plating thickness is required and never
        filled in.
      </p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Via inputs" noValidate>
          <h2>Inputs</h2>
          <QuantityField
            id="diameter"
            label="Finished hole diameter (not the drill)"
            unitHint="mm, mil, in or µm"
            text={state.diameter}
            onText={(diameter) => patch({ diameter })}
            expectedDim={fieldDim('diameter')}
            echoPrefs={widthPrefs}
            help={DIAMETER_HELP}
            placeholder="0.3 mm"
            required
            externalError={fe.diameter}
          />
          <QuantityField
            id="plating"
            label="Plating thickness (barrel wall)"
            unitHint="µm or mil"
            text={state.plating}
            onText={(plating) => patch({ plating })}
            expectedDim={fieldDim('plating')}
            echoPrefs={thickPrefs}
            help={PLATING_HELP}
            required
            externalError={fe.plating}
          />
          <QuantityField
            id="length"
            label="Barrel length"
            unitHint="mm, mil, in or cm"
            text={state.length}
            onText={(length) => patch({ length })}
            expectedDim={fieldDim('length')}
            echoPrefs={widthPrefs}
            help="Board thickness for a through via, or the span for a blind or buried via. Example: 1.6 mm."
            placeholder="1.6 mm"
            required
            externalError={fe.length}
          />
          <QuantityField
            id="count"
            label="Number of vias in parallel"
            unitHint="whole number"
            text={state.count}
            onText={(count) => patch({ count })}
            expectedDim={DIM.DIMENSIONLESS}
            parser={parseCountField}
            help="Identical vias sharing current equally (ideal). Use 1 for a single via."
            placeholder="1"
            required
            externalError={fe.count}
          />
          <QuantityField
            id="current"
            label="Total current (optional)"
            unitHint="A or mA"
            text={state.current}
            onText={(current) => patch({ current })}
            expectedDim={fieldDim('current')}
            echoPrefs={otherPrefs}
            help="Through the whole array. Empty means no voltage drop or power loss. Not used to rate the via."
            placeholder="1 A"
            externalError={fe.current}
          />
          <QuantityField
            id="temperature"
            label="Conductor temperature (optional)"
            unitHint="°C, K or °F"
            text={state.temperature}
            onText={(temperature) => patch({ temperature })}
            expectedDim={fieldDim('temperature')}
            echoPrefs={otherPrefs}
            help="Absolute barrel temperature, for example 60 °C. No self-heating is calculated."
            placeholder="25 °C"
            defaultText={DEFAULT_TEXT.temperature}
            externalError={fe.temperature}
          />
          <SelectField
            id="kmaterial"
            label="Thermal conductivity of the copper"
            value={state.kMaterial}
            options={kOptions().map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => patch({ kMaterial: (v === 'pure-401' || v === 'c11000-391' ? v : '') as KChoice })}
            help={K_HELP}
          />
          <details class="advanced" open={state.resistivity.trim() !== ''}>
            <summary>Advanced (plated copper resistivity override)</summary>
            <p class="notice" id="advanced-caution">
              <strong>Caution.</strong> {ADVANCED_CAUTION}
            </p>
            <QuantityField
              id="resistivity"
              label="Plated copper resistivity at 20 °C (override)"
              unitHint="Ω·m or µΩ·cm"
              text={state.resistivity}
              onText={(resistivity) => patch({ resistivity })}
              expectedDim={fieldDim('resistivity')}
              echoPrefs={otherPrefs}
              help="Empty uses pure copper (S-004)."
              externalError={fe.resistivity}
            />
          </details>
          <RadioGroup
            name="units"
            legend="Echo units for what you type"
            value={state.units}
            options={[
              { value: 'metric', label: 'Metric (mm, µm, °C)' },
              { value: 'imperial', label: 'Imperial (mil, °F)' },
            ]}
            onChange={(v) => patch({ units: v === 'imperial' ? 'imperial' : 'metric' })}
          />
          <p class="help">Results always show mm and mil together (plating as µm and mil).</p>
          <ToleranceSection
            fields={toleranceFields(state)}
            tol={state.tol}
            onTol={(key, t) => patch({ tol: { ...state.tol, [key]: t } })}
            errors={tolErrors}
            thickness={{ mode: '', options: [], onMode: () => undefined, weight: true }}
            prefs={otherPrefs}
            open={tolOpen}
            onToggle={setTolOpen}
          />
          <ResetButton onReset={reset} />
        </form>
        <section class="panel output" aria-labelledby="result-h" aria-busy={pending ? 'true' : undefined} data-pending={pending ? 'true' : undefined}>
          <h2 id="result-h">Result</h2>
          <p class="method-line">{METHOD_TEXT}</p>
          <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {liveSummary(view)}
          </div>
          {view.notes.map((n) => (
            <p key={n} class="muted">
              {n}
            </p>
          ))}
          <Results view={view} />
        </section>
      </div>
    </div>
  );
}
