import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FOIL_CONVENTIONS } from '../../core/units';
import { parseHash, serializeHash, type Route } from '../../state/hash';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { FinishedCopperGuidance } from '../components/FinishedCopperGuidance';
import { ResetButton } from '../components/ResetButton';
import { ResultsPanel } from '../components/ResultsPanel';
import { SelectField } from '../components/SelectField';
import { ValidityChecksList } from '../components/ValidityChecksList';
import { WarningList } from '../components/WarningList';
import { BASES, BASIS_LABEL, CONVENTION_IDS, LAYERS, conventionOptionLabel, conventionSpreadText, echoPrefs } from '../components/prefs';
import { parseFractionField } from '../components/view';
import { useRafValue } from '../hooks';
import { WEIGHT_SOURCE_OPTIONS, WEIGHT_SOURCE_QUESTION, isWeightSource } from './copper-source';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  DEFAULT_TEXT,
  LAW_HELP,
  LAW_LABEL,
  METHOD_TEXT,
  PERIOD_LABEL,
  RANGE_HINT,
  computeView,
  fieldDim,
  fromHashState,
  toHashState,
  type FieldErrors,
  type SelfHeatingState,
  type SelfHeatingView,
  type Units,
} from './self-heating.vm';

const ROUTE: Route = { name: 'calc', id: CALCULATOR_ID };

const DIM_LENGTH = fieldDim('length');
const DIM_WEIGHT = fieldDim('copperWeight');
const DIM_ABS_TEMP = fieldDim('ambient');
const DIM_CURRENT = fieldDim('current');
const DIM_THETA = fieldDim('theta');
const DIM_THETA_LEN = fieldDim('thetaPerLength');
const DIM_DUTY = fieldDim('duty');

function liveSummary(v: SelfHeatingView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. ${v.result.headline.meaning}. Confidence ${v.result.confidence.level}. ${String(v.result.details.validity.filter((c) => !c.ok).length)} validity checks failed.${v.callout !== undefined ? ` ${v.callout.heading}.` : ''}`;
    case 'no-steady-state':
      return `No result. ${v.critical.map((w) => `${w.label}. ${w.message}`).join(' ')}`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}

function Results({ view }: { view: SelfHeatingView }) {
  if (view.status === 'ok') {
    return <ResultsPanel view={view.result} failedCheckHint={RANGE_HINT} {...(view.callout !== undefined ? { callout: view.callout } : {})} />;
  }
  if (view.status === 'no-steady-state') {
    return (
      <div class="results">
        <div class="error-box" role="alert">
          <p>
            <strong>No temperature result: no steady state was found.</strong> No temperature rise, conductor temperature, resistance or voltage drop is
            shown because none can be trusted.
          </p>
          <WarningList warnings={view.critical} />
        </div>
        <ValidityChecksList checks={view.checks} failedHint={RANGE_HINT} />
        <WarningList warnings={view.other} />
        <p class="recommendation">
          <strong>Recommendation:</strong> {view.recommendation}
        </p>
      </div>
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

export default function SelfHeating() {
  const [init] = useState(() => fromHashState(parseHash(window.location.hash).state));
  const [state, setState] = useState<SelfHeatingState>(init.state);
  const [notices, setNotices] = useState<readonly string[]>(init.notices);
  const applied = useRafValue(state);
  const pending = applied !== state;
  const lastHash = useRef<string | null>(null);

  const view = useMemo(() => computeView(applied), [applied]);

  // State to URL hash. replaceState does not add history entries or fire hashchange.
  useEffect(() => {
    const h = serializeHash(ROUTE, toHashState(applied));
    lastHash.current = h;
    if (window.location.hash !== h) window.history.replaceState(null, '', h);
  }, [applied]);

  // The user edits or pastes the URL while the page is open.
  useEffect(() => {
    const on = () => {
      if (window.location.hash === lastHash.current) return;
      const p = parseHash(window.location.hash);
      if (p.route.name !== 'calc' || p.route.id !== CALCULATOR_ID) return;
      const loaded = fromHashState(p.state);
      setState(loaded.state);
      setNotices(loaded.notices);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const set = (patch: Partial<SelfHeatingState>) => setState((s) => ({ ...s, ...patch }));
  const reset = () => {
    setState(DEFAULT_STATE);
    setNotices([]);
  };
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const weightMode = state.copperBy === 'weight';
  const pulse = state.currentMode === 'pulse';
  const lengthPrefs = echoPrefs(state.units, 'width');
  const otherPrefs = echoPrefs(state.units, 'other');
  const thickPrefs = echoPrefs(state.units, 'thickness');

  return (
    <div class="calc-layout">
      <p class="muted">
        Steady-state temperature rise of a copper trace carrying a current, with the copper resistance rising as the trace warms (the heating and the
        resistance are solved together). The thermal law and the copper layer have no default: choose them.
      </p>
      {notices.length > 0 && (
        <div class="banner" role="status">
          <div class="banner-body">
            <p>
              <strong>This link loaded, but these settings were not recognised and defaults are used instead.</strong> Results may differ from the
              sender&rsquo;s.
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
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Trace self-heating inputs" noValidate>
          <h2>Inputs</h2>
          <RadioGroup
            name="law"
            legend="Thermal law (required, no default)"
            value={state.thermalLaw}
            options={[
              { value: 'user-theta', label: LAW_LABEL['user-theta'] },
              { value: 'legacy-ipc2221-calibrated', label: LAW_LABEL['legacy-ipc2221-calibrated'] },
            ]}
            onChange={(v) => set({ thermalLaw: v === 'user-theta' || v === 'legacy-ipc2221-calibrated' ? v : '' })}
          />
          {state.thermalLaw !== '' && <p class="help">{LAW_HELP[state.thermalLaw]}</p>}
          {state.thermalLaw === 'legacy-ipc2221-calibrated' && (
            <p class="notice">
              <strong>Legacy.</strong> This is the legacy IPC-2221 relation (source ledger S-001, paywalled: verify it yourself), calibrated at the 20 °C
              resistance. It is not a heat-flow model and is not a substitute for IPC-2152-based analysis. The legacy layer rule applies, so the layer
              below matters.
            </p>
          )}
          {state.thermalLaw === 'user-theta' && (
            <>
              <RadioGroup
                name="thetaby"
                legend="Thermal resistance is given as"
                value={state.thetaBy}
                options={[
                  { value: 'theta', label: 'Total for this trace (K/W)' },
                  { value: 'per-length', label: 'Per length of trace (K·m/W)' },
                ]}
                onChange={(v) => set({ thetaBy: v === 'per-length' ? 'per-length' : 'theta' })}
              />
              {state.thetaBy === 'theta' ? (
                <QuantityField
                  id="theta"
                  label="Thermal resistance"
                  unitHint="K/W"
                  text={state.theta}
                  onText={(theta) => set({ theta })}
                  expectedDim={DIM_THETA}
                  echoPrefs={otherPrefs}
                  help="Examples: 50 K/W, 50 °C/W. Temperature rise per watt dissipated in this trace. Treated as a constant; not checked against any source."
                  placeholder="50 K/W"
                  required
                  externalError={fe.theta}
                />
              ) : (
                <QuantityField
                  id="thetalen"
                  label="Thermal resistance per length"
                  unitHint="K·m/W"
                  text={state.thetaPerLength}
                  onText={(thetaPerLength) => set({ thetaPerLength })}
                  expectedDim={DIM_THETA_LEN}
                  echoPrefs={otherPrefs}
                  help="Examples: 5 K·m/W, 5 K*m/W. Divided by the trace length to get K/W. Treated as a constant; not checked against any source."
                  placeholder="5 K·m/W"
                  required
                  externalError={fe.thetaPerLength}
                />
              )}
            </>
          )}
          <QuantityField
            id="length"
            label="Trace length"
            unitHint="mm, mil, in, cm or m"
            text={state.length}
            onText={(length) => set({ length })}
            expectedDim={DIM_LENGTH}
            echoPrefs={lengthPrefs}
            help="Examples: 100 mm, 4 in, 250 mil. Always write the unit."
            placeholder="100 mm"
            required
            externalError={fe.length}
          />
          <QuantityField
            id="width"
            label="Trace width"
            unitHint="mm, mil, in, cm or m"
            text={state.width}
            onText={(width) => set({ width })}
            expectedDim={DIM_LENGTH}
            echoPrefs={lengthPrefs}
            help="Examples: 0.254 mm, 10 mil. Always write the unit."
            placeholder="0.254 mm"
            required
            externalError={fe.width}
          />
          <SelectField
            id="layer"
            label="Copper layer"
            value={state.layer}
            placeholderOption="Choose a layer…"
            options={LAYERS.map((l) => ({ value: l, label: l === 'outer' ? 'Outer layer' : 'Inner layer' }))}
            onChange={(v) => set({ layer: v === 'outer' || v === 'inner' ? v : '' })}
            required
            help="Outer and inner copper differ in finished thickness (and in the legacy relation). There is no default: choose one."
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
              expectedDim={DIM_WEIGHT}
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
                expectedDim={DIM_LENGTH}
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
                options={BASES.map((b) => ({ value: b, label: BASIS_LABEL[b] }))}
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
            expectedDim={DIM_ABS_TEMP}
            echoPrefs={otherPrefs}
            help="Absolute temperature, for example 40 °C. Use the worst case."
            placeholder="25 °C"
            defaultText={DEFAULT_TEXT.ambient}
            externalError={fe.ambient}
          />
          <RadioGroup
            name="cmode"
            legend="Current is"
            value={state.currentMode}
            options={[
              { value: 'steady', label: 'Steady (DC)' },
              { value: 'pulse', label: 'Pulsed (peak, duty cycle)' },
            ]}
            onChange={(v) => set({ currentMode: v === 'pulse' ? 'pulse' : 'steady' })}
          />
          {!pulse && (
            <QuantityField
              id="current"
              label="Current"
              unitHint="A or mA"
              text={state.current}
              onText={(current) => set({ current })}
              expectedDim={DIM_CURRENT}
              echoPrefs={otherPrefs}
              help="Examples: 2 A, 500 mA."
              placeholder="2 A"
              required
              externalError={fe.current}
            />
          )}
          {pulse && (
            <>
              <QuantityField
                id="peak"
                label="Peak current"
                unitHint="A or mA"
                text={state.peakCurrent}
                onText={(peakCurrent) => set({ peakCurrent })}
                expectedDim={DIM_CURRENT}
                echoPrefs={otherPrefs}
                help="Examples: 4 A, 800 mA. Rectangular pulses."
                placeholder="4 A"
                required
                externalError={fe.peakCurrent}
              />
              <QuantityField
                id="duty"
                label="Duty cycle"
                unitHint="percent or fraction, above 0 up to 100 %"
                text={state.duty}
                onText={(duty) => set({ duty })}
                expectedDim={DIM_DUTY}
                parser={parseFractionField}
                help="Write 25% or 0.25. Fraction of the period the current is on."
                placeholder="25%"
                required
                externalError={fe.duty}
              />
              <RadioGroup
                name="period"
                legend="Pulse period compared with the thermal time constant (required, no default)"
                value={state.periodVsTau}
                options={[
                  { value: 'much-shorter', label: PERIOD_LABEL['much-shorter'] },
                  { value: 'comparable-or-longer', label: PERIOD_LABEL['comparable-or-longer'] },
                ]}
                onChange={(v) => set({ periodVsTau: v === 'much-shorter' || v === 'comparable-or-longer' ? v : '' })}
              />
              <p class="help">The time constant is not computed here and your statement is not checked. If the period is not clearly much shorter, choose the second option.</p>
            </>
          )}
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
