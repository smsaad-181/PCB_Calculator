import { useMemo } from 'preact/hooks';
import { Callout } from '../components/Callout';
import { LedgerRowBadges } from '../components/LedgerRowBadges';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { ResultsPanel } from '../components/ResultsPanel';
import { WarningList } from '../components/WarningList';
import { SelectField } from '../components/SelectField';
import { echoPrefs } from '../components/prefs';
import { useCalcState } from '../useCalcState';
import {
  AREA_HELP,
  BASIS_OPTIONS,
  CALCULATOR_ID,
  CONVENTION_HELP,
  CP_HELP,
  CURRENT_HELP,
  DEFAULT_STATE,
  GEOMETRY_OPTIONS,
  I2T_HELP,
  METHOD_TEXT,
  MODE_OPTIONS,
  PAGE_INTRO,
  RANGE_HINT,
  SELF_HEATING_HREF,
  SELF_HEATING_LINK_TEXT,
  SEPARATION_NOTE,
  TE_HELP,
  VIA_HOLE_HELP,
  VIA_PLATING_HELP,
  STATUS_LINES,
  TEMP_HELP,
  THICKNESS_HELP,
  TIME_HELP,
  WIDTH_HELP,
  WIRE_HELP,
  computeView,
  conventionOptions,
  fieldDim,
  fromHashState,
  liveSummary,
  parseThickness,
  specificHeatConflictNote,
  specificHeatOptions,
  toHashState,
  type Basis,
  type CpChoice,
  type FieldErrors,
  type FusingState,
  type FusingView,
  type Geometry,
  type Mode,
} from './fusing.vm';
import { FOIL_CONVENTIONS, type FoilConvention } from '../../core/units';

const NOT_CHECKED_HINT = 'Not checked: this needs your copy of the standard. It is not a failure and not a pass.';

function Results({ view }: { view: FusingView }) {
  if (view.status === 'ok') {
    return (
      <>
        {view.thicknessNote !== undefined && <p class="muted">{view.thicknessNote}</p>}
        <ResultsPanel
          view={view.result}
          failedCheckHint={RANGE_HINT}
          underHeadline={<WarningList warnings={view.headlineWarnings} />}
          callouts={view.callouts}
          afterHeadline={
            <>
              {view.suppressedHeadline !== undefined && (
                <p class="muted">
                  <strong>{view.suppressedHeadline.label}.</strong> {view.suppressedHeadline.text}
                </p>
              )}
              <LedgerRowBadges heading="Data behind this result (one status per ledger row)" rows={view.ledgerRows} />
            </>
          }
        />
        {view.notCheckedCount > 0 && <p class="muted">{NOT_CHECKED_HINT}</p>}
        {view.preece !== undefined && (
          <details class="more">
            <summary>Historical reference (not a PCB model)</summary>
            <p>
              <strong>{view.preece.label}:</strong> {view.preece.text}
            </p>
            <p class="muted">{view.preece.note}</p>
          </details>
        )}
      </>
    );
  }
  if (view.status === 'error') return <ResultStatus status="error" items={view.problems} />;
  return <ResultStatus status="needs-input" items={view.needs} />;
}

export default function Fusing() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<FusingState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied), [applied]);
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const widthPrefs = echoPrefs(state.units, 'width');
  const otherPrefs = echoPrefs(state.units, 'other');
  const thk = state.geometry === 'trace' ? parseThickness(state) : undefined;
  const isWeight = thk?.kind === 'weight';

  return (
    <div class="calc-layout">
      <p class="muted">{PAGE_INTRO}</p>
      <div class="notice" role="note" aria-label="Fusing is not steady-state heating">
        <p>
          <strong>A different question from steady-state heating.</strong> {SEPARATION_NOTE}
        </p>
        <p>
          <a href={SELF_HEATING_HREF}>{SELF_HEATING_LINK_TEXT}</a>
        </p>
      </div>
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
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Fusing inputs" noValidate>
          <h2>Inputs</h2>
          <RadioGroup
            name="geometry"
            legend="Conductor geometry (choose one)"
            value={state.geometry}
            options={GEOMETRY_OPTIONS}
            onChange={(v) => patch({ geometry: (v === 'area' || v === 'wire' || v === 'trace' || v === 'via' ? v : '') as Geometry })}
          />
          {state.geometry === 'area' && (
            <QuantityField
              id="area"
              label="Cross-section area"
              unitHint="mm2 or mil2 (not cmil)"
              text={state.area}
              onText={(area) => patch({ area })}
              expectedDim={fieldDim('area')}
              echoPrefs={otherPrefs}
              help={AREA_HELP}
              required
              externalError={fe.area}
            />
          )}
          {state.geometry === 'wire' && (
            <QuantityField
              id="wire"
              label="Wire diameter"
              unitHint="mm, mil or in"
              text={state.wire}
              onText={(wire) => patch({ wire })}
              expectedDim={fieldDim('wire')}
              echoPrefs={widthPrefs}
              help={WIRE_HELP}
              placeholder="0.5 mm"
              required
              externalError={fe.wire}
            />
          )}
          {state.geometry === 'via' && (
            <>
              <QuantityField
                id="via-hole"
                label="Via finished hole diameter (not the drill)"
                unitHint="mm or mil"
                text={state.viaHole}
                onText={(viaHole) => patch({ viaHole })}
                expectedDim={fieldDim('viaHole')}
                echoPrefs={widthPrefs}
                help={VIA_HOLE_HELP}
                required
                externalError={fe.viaHole}
              />
              <QuantityField
                id="via-plating"
                label="Via barrel plating thickness"
                unitHint="µm or mil"
                text={state.viaPlating}
                onText={(viaPlating) => patch({ viaPlating })}
                expectedDim={fieldDim('viaPlating')}
                echoPrefs={echoPrefs(state.units, 'thickness')}
                help={VIA_PLATING_HELP}
                required
                externalError={fe.viaPlating}
              />
            </>
          )}
          {state.geometry === 'trace' && (
            <>
              <QuantityField
                id="width"
                label="Trace width"
                unitHint="mm, mil or in"
                text={state.width}
                onText={(width) => patch({ width })}
                expectedDim={fieldDim('width')}
                echoPrefs={widthPrefs}
                help={WIDTH_HELP}
                placeholder="2 mm"
                required
                externalError={fe.width}
              />
              <div class="field">
                <label for="thickness">
                  Copper thickness <span class="unit">(µm or mil; or a foil weight in oz/ft2)</span>
                  <span class="req"> required</span>
                </label>
                <input
                  id="thickness"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  spellcheck={false}
                  maxLength={40}
                  value={state.thickness}
                  aria-invalid={fe.thickness !== undefined ? 'true' : undefined}
                  aria-describedby={`thickness-help${thk?.kind === 'error' || fe.thickness !== undefined ? ' thickness-err' : ''}`}
                  onInput={(e) => patch({ thickness: (e.currentTarget as HTMLInputElement).value })}
                />
                <p id="thickness-help" class="help">
                  {THICKNESS_HELP}
                </p>
                {thk?.kind === 'length' && <p class="echo">Read as a length; the basis below applies.</p>}
                {thk?.kind === 'weight' && <p class="echo">{thk.note}</p>}
                {(thk?.kind === 'error' || fe.thickness !== undefined) && (
                  <p id="thickness-err" class="field-error">
                    <span aria-hidden="true">{'✖ '}</span>
                    <span class="visually-hidden">Error: </span>
                    {thk?.kind === 'error' ? thk.message : fe.thickness}
                  </p>
                )}
              </div>
              {isWeight ? (
                <>
                  <p class="help">Thickness basis: nominal (a foil weight is converted to a nominal thickness; this is not finished copper).</p>
                  <SelectField
                    id="convention"
                    label="Foil convention"
                    value={state.convention}
                    options={conventionOptions().filter((o) => o.value !== '')}
                    placeholderOption={conventionOptions()[0]?.label ?? 'Default'}
                    onChange={(v) => patch({ convention: (v !== '' && Object.prototype.hasOwnProperty.call(FOIL_CONVENTIONS, v) ? v : '') as FoilConvention | '' })}
                    help={CONVENTION_HELP}
                  />
                </>
              ) : (
                <SelectField
                  id="basis"
                  label="Thickness basis"
                  value={state.basis}
                  options={BASIS_OPTIONS}
                  placeholderOption="Choose (no default)"
                  onChange={(v) => patch({ basis: (v === 'finished' || v === 'measured' || v === 'nominal' ? v : '') as Basis })}
                  help="Where the thickness came from. There is no default: finished copper differs from nominal, and thinner copper fuses sooner."
                  required
                />
              )}
            </>
          )}
          <QuantityField
            id="initial-temp"
            label="Initial conductor temperature (start of the pulse)"
            unitHint="°C, K or °F"
            text={state.initialTemp}
            onText={(initialTemp) => patch({ initialTemp })}
            expectedDim={fieldDim('initialTemp')}
            echoPrefs={otherPrefs}
            help={TEMP_HELP}
            placeholder="25 °C"
            required
            externalError={fe.initialTemp}
          />
          <QuantityField
            id="end-temp"
            label="End temperature (optional)"
            unitHint="°C, K or °F"
            text={state.endTemp}
            onText={(endTemp) => patch({ endTemp })}
            expectedDim={fieldDim('endTemp')}
            echoPrefs={otherPrefs}
            help={TE_HELP}
            externalError={fe.endTemp}
          />
          <RadioGroup
            name="mode"
            legend="What do you know? (choose one)"
            value={state.mode}
            options={MODE_OPTIONS}
            onChange={(v) => patch({ mode: (v === 'current' || v === 'time' || v === 'i2t' ? v : '') as Mode })}
          />
          {state.mode === 'current' && (
            <QuantityField
              id="current"
              label="Pulse current"
              unitHint="A, mA or kA"
              text={state.current}
              onText={(current) => patch({ current })}
              expectedDim={fieldDim('current')}
              echoPrefs={otherPrefs}
              help={CURRENT_HELP}
              placeholder="10 A"
              required
              externalError={fe.current}
            />
          )}
          {state.mode === 'time' && (
            <QuantityField
              id="time"
              label="Pulse time"
              unitHint="s, ms or µs"
              text={state.time}
              onText={(time) => patch({ time })}
              expectedDim={fieldDim('time')}
              echoPrefs={otherPrefs}
              help={TIME_HELP}
              placeholder="0.5 s"
              required
              externalError={fe.time}
            />
          )}
          {state.mode === 'i2t' && (
            <QuantityField
              id="i2t"
              label="Action integral I²t of your pulse"
              unitHint="A2s"
              text={state.i2t}
              onText={(i2t) => patch({ i2t })}
              expectedDim={fieldDim('i2t')}
              echoPrefs={otherPrefs}
              help={I2T_HELP}
              placeholder="40 A2s"
              required
              externalError={fe.i2t}
            />
          )}
          <SelectField
            id="specific-heat"
            label="Copper specific heat"
            value={state.specificHeat}
            options={specificHeatOptions().filter((o) => o.value !== '')}
            placeholderOption={specificHeatOptions()[0]?.label ?? 'Default'}
            onChange={(v) => patch({ specificHeat: (v === 'pppl-293k' || v === 'pppl-300k' || v === 'hyperphysics-20c' ? v : '') as CpChoice })}
            help={CP_HELP}
          />
          <p class="help">{specificHeatConflictNote()}</p>
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
          <p class="help">Results always show mm and mil together (copper thickness as µm and mil).</p>
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
