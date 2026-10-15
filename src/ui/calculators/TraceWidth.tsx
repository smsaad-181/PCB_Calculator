import { useMemo, useState } from 'preact/hooks';
import { FOIL_CONVENTIONS } from '../../core/units';
import { NearResultNotes } from '../components/NearResultNotes';
import { ProfileBanner } from '../components/ProfileBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { FinishedCopperGuidance } from '../components/FinishedCopperGuidance';
import { ResetButton } from '../components/ResetButton';
import { ResultsPanel } from '../components/ResultsPanel';
import { SelectField } from '../components/SelectField';
import { ToleranceResults } from '../components/ToleranceResults';
import { ToleranceSection } from '../components/ToleranceInputs';
import { parseFractionField } from '../components/view';
import { useToday } from '../hooks';
import { useCalcState } from '../useCalcState';
import { BUNDLED_LABEL, NONE_LABEL, isProfileChoice } from './fab-profile-choice';
import { profileBanner } from './fab-profile-banner';
import { PERIOD_HELP, PERIOD_LABEL, PERIOD_QUESTION } from './pulse-labels';
import { WEIGHT_SOURCE_OPTIONS, WEIGHT_SOURCE_QUESTION, isWeightSource } from './copper-source';
import {
  BASES,
  CALCULATOR_ID,
  CONVENTION_IDS,
  DEFAULT_STATE,
  DEFAULT_TEXT,
  FAILED_CHECK_HINT,
  LAYERS,
  LAYER_COUNT_HELP,
  LAYER_COUNT_OPTIONS,
  LAYER_COUNT_QUESTION,
  METHOD_TEXT,
  MODE_A_HINT,
  MODE_A_LABEL,
  PROFILE_HELP,
  PROFILE_QUESTION,
  PROFILE_WIDTH_LABEL,
  PROFILE_WIDTH_LOCKED,
  PULSE_SECTION_LEGEND,
  PULSE_SOLVE_CURRENT_TEXT,
  PULSE_STEADY_HELP,
  computeView,
  conventionOptionLabel,
  conventionSpreadText,
  echoPrefs,
  fieldDim,
  fromHashState,
  hasToleranceState,
  isLayerCount,
  profileWidthOffered,
  solveOptions,
  thicknessModesOffered,
  toHashState,
  toleranceFields,
  withProfile,
  type SolveFor,
  type TraceWidthState,
  type TraceWidthView,
  type FieldErrors,
  type Units,
} from './trace-width.vm';


// Expected dimensions per field come from the view-model's field table, so the page and the tests share one source.
const fieldDimWidth = fieldDim('width');
const fieldDimCurrent = fieldDim('current');
const fieldDimRise = fieldDim('deltaT');
const fieldDimWeight = fieldDim('copperWeight');
const fieldDimThickness = fieldDim('copperThickness');
const fieldDimAbsTemp = fieldDim('ambient');
const fieldDimFactor = fieldDim('designMargin');
const fieldDimDuty = fieldDim('duty');

const BASIS_LABEL: Readonly<Record<string, string>> = {
  nominal: 'Nominal (default)',
  finished: 'Finished (from your fabricator)',
  measured: 'Measured (for example a micro-section)',
};

function liveSummary(v: TraceWidthView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. ${v.result.headline.meaning}. Confidence ${v.result.confidence.level}. ${String(v.result.details.validity.filter((c) => c.informational !== true && !c.ok).length)} validity checks failed.${v.callout !== undefined ? ` ${v.callout.heading}.` : ''}`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}

function Results({ view }: { view: TraceWidthView }) {
  if (view.status === 'ok') {
    return (
      <ResultsPanel
        view={view.result}
        failedCheckHint={FAILED_CHECK_HINT}
        {...(view.callout !== undefined ? { callout: view.callout } : {})}
        afterHeadline={
          <>
            <NearResultNotes view={view.nearResult} />
            <ToleranceResults view={view.tolerance} />
          </>
        }
      />
    );
  }
  if (view.status === 'error') {
    return (
      <div class="error-box">
        <p>
          <strong>Cannot calculate. Fix this and the result will appear:</strong>
        </p>
        <ul>
          {view.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div class="needs">
      <p>
        <strong>No result yet.</strong>
      </p>
      <ul>
        {view.needs.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

export default function TraceWidth() {
  return <TraceWidthOn today={useToday()} />;
}

function TraceWidthOn({ today }: { readonly today: string }) {
  const { state, setState, applied, pending, notices, setNotices, patch: set, reset } = useCalcState<TraceWidthState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
    onExternalLoad: (s) => {
      if (hasToleranceState(s)) setTolOpen(true);
    },
  });
  // The tolerance section starts open only when the link already carries tolerance state, so it is never hidden from the reader.
  const [tolOpen, setTolOpen] = useState(() => hasToleranceState(state));

  const view = useMemo(() => computeView(applied, today), [applied, today]);
  const banner = useMemo(() => profileBanner(applied.profile, today), [applied.profile, today]);

  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const tolErrors = view.status === 'error' ? (view.tolErrors ?? {}) : {};
  const solve = state.solveFor;
  const pulse = state.currentMode === 'pulse';
  const pulseConflict = pulse && solve === 'current';
  const weightMode = state.copperBy === 'weight';
  const widthPrefs = echoPrefs(state.units, 'width');
  const otherPrefs = echoPrefs(state.units, 'other');
  const thickPrefs = echoPrefs(state.units, 'thickness');

  return (
    <div class="calc-layout">
      <p class="muted">
        Solve for the trace width, the current capacity or the temperature rise from the other two. This is the legacy IPC-2221 curve fit,
        for comparison and compatibility: it is not an IPC-2152 analysis.
      </p>
      {banner !== undefined && <ProfileBanner b={banner} />}
      {notices.length > 0 && (
        <div class="banner" role="status">
          <div class="banner-body">
            <p>
              <strong>This link loaded, but these settings were not recognised and defaults are used instead.</strong> Results may
              differ from the sender&rsquo;s.
            </p>
            <ul>
              {notices.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={() => setNotices([])} aria-label="Dismiss this message">
            Dismiss
          </button>
        </div>
      )}
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Trace width inputs" noValidate>
          <h2>Inputs</h2>
          <RadioGroup
            name="solve"
            legend="Solve for (the other two are entered)"
            value={solve}
            options={solveOptions(state).map((o) => ({ value: o.value, label: o.label, ...(o.disabled === true ? { disabled: true } : {}), ...(o.hint !== undefined ? { hint: o.hint } : {}) }))}
            onChange={(v) => set({ solveFor: v as SolveFor })}
          />
          {pulseConflict && (
            <p class="field-error" role="alert">
              Pulsed current cannot be combined with solving for current. {PULSE_SOLVE_CURRENT_TEXT} Choose width or temperature rise to solve for, or switch the current back to steady.
            </p>
          )}
          <RadioGroup
            name="cmode"
            legend={PULSE_SECTION_LEGEND}
            value={state.currentMode}
            options={[
              { value: 'steady', label: 'Steady (DC or RMS)' },
              { value: 'pulse', label: 'Pulsed (peak, duty cycle): RMS-equivalent mean heating' },
            ]}
            onChange={(v) => {
              if (v === 'pulse') set({ currentMode: 'pulse', ...(solve === 'current' ? { solveFor: 'width' as SolveFor } : {}) });
              else set({ currentMode: 'steady' });
            }}
          />
          {pulse && <p class="help">{PULSE_STEADY_HELP}</p>}
          {pulse && (
            <>
              <QuantityField
                id="peak"
                label="Peak current"
                unitHint="A or mA"
                text={state.peakCurrent}
                onText={(peakCurrent) => set({ peakCurrent })}
                expectedDim={fieldDimCurrent}
                echoPrefs={otherPrefs}
                help="Examples: 10 A, 800 mA. Rectangular pulses."
                placeholder="10 A"
                required
                externalError={fe.peakCurrent}
              />
              <QuantityField
                id="duty"
                label="Duty cycle"
                unitHint="percent or fraction, above 0 up to 100 %"
                text={state.duty}
                onText={(duty) => set({ duty })}
                expectedDim={fieldDimDuty}
                parser={parseFractionField}
                help="Write 25% or 0.25. Fraction of the period the current is on."
                placeholder="25%"
                required
                externalError={fe.duty}
              />
              <RadioGroup
                name="period"
                legend={PERIOD_QUESTION}
                value={state.periodVsTau}
                options={[
                  { value: 'much-shorter', label: PERIOD_LABEL['much-shorter'] },
                  { value: 'comparable-or-longer', label: PERIOD_LABEL['comparable-or-longer'] },
                ]}
                onChange={(v) => set({ periodVsTau: v === 'much-shorter' || v === 'comparable-or-longer' ? v : '' })}
              />
              <p class="help">{PERIOD_HELP}</p>
            </>
          )}
          {solve !== 'width' && (
            <QuantityField
              id="width"
              label="Trace width"
              unitHint="mm, mil or µm"
              text={state.width}
              onText={(width) => set({ width })}
              expectedDim={fieldDimWidth}
              echoPrefs={widthPrefs}
              help="Examples: 0.3 mm, 12 mil, 300 um. Always write the unit."
              placeholder="0.3 mm"
              required
              externalError={fe.width}
            />
          )}
          {!pulse && solve !== 'current' && (
            <QuantityField
              id="current"
              label="Current"
              unitHint="A or mA"
              text={state.current}
              onText={(current) => set({ current })}
              expectedDim={fieldDimCurrent}
              echoPrefs={otherPrefs}
              help="Examples: 1 A, 500 mA. Continuous (DC or RMS) current."
              placeholder="1 A"
              required
              externalError={fe.current}
            />
          )}
          {solve !== 'deltaT' && (
            <QuantityField
              id="rise"
              label="Temperature rise above ambient"
              unitHint="°C, K or °F, as a rise"
              text={state.deltaT}
              onText={(deltaT) => set({ deltaT })}
              expectedDim={fieldDimRise}
              echoPrefs={otherPrefs}
              help="Examples: 10 °C, 10 K, 18 °F. This is a difference, not a temperature: 10 °C here means 10 degrees of heating."
              placeholder="10 °C"
              required
              externalError={fe.deltaT}
            />
          )}
          <SelectField
            id="layer"
            label="Copper layer"
            value={state.layer}
            placeholderOption="Choose a layer…"
            options={LAYERS.map((l) => ({ value: l, label: l === 'outer' ? 'Outer layer' : 'Inner layer' }))}
            onChange={(v) => set({ layer: v === 'outer' || v === 'inner' ? v : '' })}
            required
            help="Inner traces use a constant half the outer one in this method. There is no default: choose one."
          />
          <RadioGroup
            name="copperby"
            legend="Copper is given as"
            value={state.copperBy}
            options={[
              { value: 'weight', label: 'Weight (oz/ft²)' },
              { value: 'thickness', label: 'Thickness (µm or mil)' },
            ]}
            onChange={(v) => set({ copperBy: v === 'thickness' ? 'thickness' : 'weight' })}
          />
          {weightMode && (
            <>
              <RadioGroup
                name="wsrc"
                legend={WEIGHT_SOURCE_QUESTION}
                value={state.weightSource}
                options={WEIGHT_SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => set({ weightSource: isWeightSource(v) ? v : '' })}
              />
              {state.weightSource === 'finished' && <FinishedCopperGuidance />}
            </>
          )}
          {weightMode ? (
            <QuantityField
              id="cweight"
              label="Copper weight"
              unitHint="oz/ft²"
              text={state.copperWeight}
              onText={(copperWeight) => set({ copperWeight })}
              expectedDim={fieldDimWeight}
              echoPrefs={otherPrefs}
              help="Examples: 1 oz, 0.5 oz, 2 oz/ft2. A bare oz means oz/ft². Answer the question above: base foil and finished copper differ."
              placeholder="1 oz"
              required
              externalError={fe.copperWeight}
            />
          ) : (
            <>
              <QuantityField
                id="cthick"
                label="Copper thickness"
                unitHint="µm or mil"
                text={state.copperThickness}
                onText={(copperThickness) => set({ copperThickness })}
                expectedDim={fieldDimThickness}
                echoPrefs={thickPrefs}
                help="Examples: 35 um, 1.4 mil. Always write the unit."
                placeholder="35 um"
                required
                externalError={fe.copperThickness}
              />
              <SelectField
                id="basis"
                label="Thickness basis (what your thickness number is)"
                value={state.basis}
                options={BASES.map((b) => ({ value: b, label: BASIS_LABEL[b] ?? b }))}
                onChange={(v) => set({ basis: BASES.find((b) => b === v) ?? 'nominal' })}
                help="Nominal is the default assumption. Choose finished or measured only if the number really is one."
              />
            </>
          )}
          <SelectField
            id="convention"
            label="Foil convention (how oz/ft² maps to thickness)"
            value={state.convention}
            options={[
              { value: '', label: conventionOptionLabel('') },
              ...CONVENTION_IDS.map((id) => ({ value: id, label: FOIL_CONVENTIONS[id].label })),
            ]}
            onChange={(v) => set({ convention: CONVENTION_IDS.find((id) => id === v) ?? '' })}
            help={`The three conventions differ by up to ${conventionSpreadText()} at 1 oz/ft². Leaving the default counts as an assumption.`}
          />
          <QuantityField
            id="ambient"
            label="Ambient temperature (optional)"
            unitHint="°C, K or °F"
            text={state.ambient}
            onText={(ambient) => set({ ambient })}
            expectedDim={fieldDimAbsTemp}
            echoPrefs={otherPrefs}
            help="Absolute temperature, for example 40 °C. It only sets the maximum conductor temperature, not the rise."
            placeholder="25 °C"
            defaultText={DEFAULT_TEXT.ambient}
            externalError={fe.ambient}
          />
          {solve === 'width' && (
            <QuantityField
              id="margin"
              label="Design margin on the width (optional)"
              unitHint="factor, at least 1"
              text={state.designMargin}
              onText={(designMargin) => set({ designMargin })}
              expectedDim={fieldDimFactor}
              echoPrefs={otherPrefs}
              help="A plain factor: 1.25 means draw 25 % wider than the calculated minimum. The echo shows the same number as a percentage."
              placeholder="1.25"
              defaultText={DEFAULT_TEXT.designMargin}
              externalError={fe.designMargin}
            />
          )}
          {solve === 'current' && (
            <QuantityField
              id="derating"
              label="Current derating (optional)"
              unitHint="factor, above 0 up to 1"
              text={state.derating}
              onText={(derating) => set({ derating })}
              expectedDim={fieldDimFactor}
              echoPrefs={otherPrefs}
              help="A plain factor: 0.8 means design for 80 % of the calculated limit. The echo shows the same number as a percentage."
              placeholder="0.8"
              defaultText={DEFAULT_TEXT.derating}
              externalError={fe.derating}
            />
          )}
          <QuantityField
            id="maxtemp"
            label="Maximum allowed conductor temperature (optional, informational)"
            unitHint="°C, K or °F"
            text={state.maxTemp}
            onText={(maxTemp) => set({ maxTemp })}
            expectedDim={fieldDimAbsTemp}
            echoPrefs={otherPrefs}
            help="Absolute temperature, for example 105 °C. When given, ambient plus rise is shown against it as an informational estimate. It is an estimate, not a design check: this legacy relation does not model ambient."
            placeholder="105 °C"
            externalError={fe.maxTemp}
          />
          <RadioGroup
            name="method"
            legend={METHOD_TEXT}
            value="B"
            options={[
              { value: 'B', label: 'IPC-2221 legacy (Mode B)' },
              { value: 'A', label: MODE_A_LABEL, disabled: true, hint: MODE_A_HINT },
            ]}
            onChange={() => undefined}
          />
          <RadioGroup
            name="units"
            legend="Echo units for what you type"
            value={state.units}
            options={[
              { value: 'metric', label: 'Metric (mm, µm, °C)' },
              { value: 'imperial', label: 'Imperial (mil, °F)' },
            ]}
            onChange={(v) => set({ units: (v === 'imperial' ? 'imperial' : 'metric') as Units })}
          />
          <p class="help">Results always show mm and mil together (copper thickness as µm and mil).</p>
          <ToleranceSection
            fields={toleranceFields(state)}
            tol={state.tol}
            onTol={(key, t) => setState((s) => ({ ...s, tol: { ...s.tol, [key]: t } }))}
            errors={tolErrors}
            thickness={{ mode: state.thickMode, options: thicknessModesOffered(state), onMode: (thickMode) => set({ thickMode }), weight: weightMode }}
            prefs={otherPrefs}
            open={tolOpen}
            onToggle={setTolOpen}
            lockedReason={state.widthProfile && profileWidthOffered(state) ? { width: PROFILE_WIDTH_LOCKED } : {}}
          >
            <RadioGroup
              name="profile"
              legend={PROFILE_QUESTION}
              value={state.profile}
              options={[
                { value: 'bundled', label: BUNDLED_LABEL },
                { value: 'none', label: NONE_LABEL },
              ]}
              onChange={(v) => {
                if (isProfileChoice(v)) setState((s) => withProfile(s, v));
              }}
            />
            <p class="help">{PROFILE_HELP}</p>
            {profileWidthOffered(state) && (
              <div class="radio">
                <input id="tol-width-profile" type="checkbox" checked={state.widthProfile} onChange={(e) => set({ widthProfile: (e.currentTarget as HTMLInputElement).checked })} />
                <label for="tol-width-profile">{PROFILE_WIDTH_LABEL}</label>
              </div>
            )}
            {profileWidthOffered(state) && (
              <>
                <RadioGroup
                  name="layercount"
                  legend={LAYER_COUNT_QUESTION}
                  value={state.layerCount}
                  options={LAYER_COUNT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  onChange={(v) => set({ layerCount: isLayerCount(v) ? v : '' })}
                />
                <p class="help">{LAYER_COUNT_HELP}</p>
              </>
            )}
          </ToleranceSection>
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
