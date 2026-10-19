import { useMemo } from 'preact/hooks';
import { DIM } from '../../core/units';
import { Callout } from '../components/Callout';
import { LedgerRowBadges } from '../components/LedgerRowBadges';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { ResultsPanel } from '../components/ResultsPanel';
import { SelectField } from '../components/SelectField';
import { echoPrefs } from '../components/prefs';
import { useCalcState } from '../useCalcState';
import {
  CALCULATOR_ID,
  COUNT_HELP,
  DEFAULT_STATE,
  DIAMETER_BASIS_HELP,
  DIAMETER_BASIS_OPTIONS,
  DIAMETER_HELP,
  FILL_HELP,
  FILL_K_HELP,
  FILL_OPTIONS,
  K_HELP,
  LENGTH_HELP,
  METHOD_TEXT,
  PAGE_INTRO,
  PLATING_HELP,
  PLATING_SOURCE_HELP,
  PLATING_SOURCE_OPTIONS,
  POWER_HELP,
  RANGE_HINT,
  STATUS_LINES,
  computeView,
  diameterPlaceholder,
  fieldDim,
  fromHashState,
  kOptions,
  liveSummary,
  parseCountField,
  toHashState,
  type DiameterBasis,
  type FieldErrors,
  type FillChoice,
  type KChoice,
  type PlatingSource,
  type ThermalViaState,
  type ThermalViaView,
} from './thermal-via.vm';

function Results({ view }: { view: ThermalViaView }) {
  if (view.status === 'ok') {
    return (
      <ResultsPanel
        view={view.result}
        failedCheckHint={RANGE_HINT}
        underHeadline={view.reliefCallout !== undefined ? <Callout heading={view.reliefCallout.heading} text={view.reliefCallout.text} /> : undefined}
        callouts={view.callouts}
        afterHeadline={<LedgerRowBadges heading="Data behind this result (one status per ledger row)" rows={view.ledgerRows} />}
      />
    );
  }
  if (view.status === 'error') return <ResultStatus status="error" items={view.problems} />;
  return <ResultStatus status="needs-input" items={view.needs} />;
}

export default function ThermalVia() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<ThermalViaState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied), [applied]);
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const widthPrefs = echoPrefs(state.units, 'width');
  const thickPrefs = echoPrefs(state.units, 'thickness');
  const otherPrefs = echoPrefs(state.units, 'other');

  return (
    <div class="calc-layout">
      <p class="muted">{PAGE_INTRO}</p>
      <div class="notice" role="note" aria-label="Status of this estimate">
        <ul>
          {STATUS_LINES.map((l) => (
            <li key={l}>
              <strong>{l}</strong>
            </li>
          ))}
        </ul>
      </div>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Thermal via inputs" noValidate>
          <h2>Inputs</h2>
          <RadioGroup
            name="diameter-basis"
            legend="Diameter basis (required, no default)"
            value={state.diameterBasis}
            options={DIAMETER_BASIS_OPTIONS}
            onChange={(v) => patch({ diameterBasis: (v === 'finished' || v === 'drill' ? v : '') as DiameterBasis })}
          />
          <p class="help">{DIAMETER_BASIS_HELP}</p>
          <QuantityField
            id="diameter"
            label="Hole diameter (on the basis chosen above)"
            unitHint="mm, mil, in or µm"
            text={state.diameter}
            onText={(diameter) => patch({ diameter })}
            expectedDim={fieldDim('diameter')}
            echoPrefs={widthPrefs}
            help={DIAMETER_HELP}
            placeholder={diameterPlaceholder(state.diameterBasis)}
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
          <RadioGroup
            name="plating-source"
            legend="Where the plating value came from"
            value={state.platingSource}
            options={PLATING_SOURCE_OPTIONS}
            onChange={(v) => patch({ platingSource: (v === 'fab-profile-average' ? 'fab-profile-average' : 'user') as PlatingSource })}
          />
          <p class="help">{PLATING_SOURCE_HELP}</p>
          <QuantityField
            id="length"
            label="Barrel length"
            unitHint="mm, mil, in or cm"
            text={state.length}
            onText={(length) => patch({ length })}
            expectedDim={fieldDim('length')}
            echoPrefs={widthPrefs}
            help={LENGTH_HELP}
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
            help={COUNT_HELP}
            placeholder="1"
            required
            externalError={fe.count}
          />
          <SelectField
            id="kmaterial"
            label="Thermal conductivity of the copper"
            value={state.kMaterial}
            options={kOptions()}
            placeholderOption="Choose (no default)"
            onChange={(v) => patch({ kMaterial: (v === 'pure-401' || v === 'c11000-391' ? v : '') as KChoice })}
            help={K_HELP}
            required
          />
          <SelectField
            id="fill"
            label="Via fill"
            value={state.fill}
            options={FILL_OPTIONS}
            placeholderOption="Choose (no default)"
            onChange={(v) => patch({ fill: (v === 'none' || v === 'filled' ? v : '') as FillChoice })}
            help={FILL_HELP}
            required
          />
          {state.fill === 'filled' && (
            <QuantityField
              id="fillk"
              label="Fill thermal conductivity"
              unitHint="W/mK"
              text={state.fillK}
              onText={(fillK) => patch({ fillK })}
              expectedDim={fieldDim('fillK')}
              echoPrefs={otherPrefs}
              help={FILL_K_HELP}
              required
              externalError={fe.fillK}
            />
          )}
          <QuantityField
            id="power"
            label="Power through the vias (optional)"
            unitHint="W or mW"
            text={state.power}
            onText={(power) => patch({ power })}
            expectedDim={fieldDim('power')}
            echoPrefs={otherPrefs}
            help={POWER_HELP}
            placeholder="1 W"
            externalError={fe.power}
          />
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
          {view.status !== 'ok' && <Callout heading="Estimate, low confidence" text={STATUS_LINES.slice(1).join(' ')} />}
          <Results view={view} />
        </section>
      </div>
    </div>
  );
}
