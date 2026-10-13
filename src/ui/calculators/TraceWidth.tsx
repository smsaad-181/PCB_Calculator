import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FOIL_CONVENTIONS } from '../../core/units';
import { parseHash, serializeHash, type Route } from '../../state/hash';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { FinishedCopperGuidance } from '../components/FinishedCopperGuidance';
import { ResetButton } from '../components/ResetButton';
import { ResultsPanel } from '../components/ResultsPanel';
import { SelectField } from '../components/SelectField';
import { useRafValue } from '../hooks';
import { WEIGHT_SOURCE_OPTIONS, WEIGHT_SOURCE_QUESTION, isWeightSource } from './copper-source';
import {
  BASES,
  CALCULATOR_ID,
  CONVENTION_IDS,
  DEFAULT_STATE,
  DEFAULT_TEXT,
  FAILED_CHECK_HINT,
  LAYERS,
  METHOD_TEXT,
  MODE_A_HINT,
  MODE_A_LABEL,
  SOLVE_OPTIONS,
  computeView,
  conventionOptionLabel,
  conventionSpreadText,
  echoPrefs,
  fieldDim,
  fromHashState,
  toHashState,
  type SolveFor,
  type TraceWidthState,
  type TraceWidthView,
  type FieldErrors,
  type Units,
} from './trace-width.vm';

const ROUTE: Route = { name: 'calc', id: CALCULATOR_ID };

// Expected dimensions per field come from the view-model's field table, so the page and the tests share one source.
const fieldDimWidth = fieldDim('width');
const fieldDimCurrent = fieldDim('current');
const fieldDimRise = fieldDim('deltaT');
const fieldDimWeight = fieldDim('copperWeight');
const fieldDimThickness = fieldDim('copperThickness');
const fieldDimAbsTemp = fieldDim('ambient');
const fieldDimFactor = fieldDim('designMargin');

const BASIS_LABEL: Readonly<Record<string, string>> = {
  nominal: 'Nominal (default)',
  finished: 'Finished (from your fabricator)',
  measured: 'Measured (for example a micro-section)',
};

function liveSummary(v: TraceWidthView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. ${v.result.headline.meaning}. Confidence ${v.result.confidence.level}. ${String(v.result.details.validity.filter((c) => !c.ok).length)} validity checks failed.`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}

function Results({ view }: { view: TraceWidthView }) {
  if (view.status === 'ok') return <ResultsPanel view={view.result} failedCheckHint={FAILED_CHECK_HINT} />;
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
  const [init] = useState(() => fromHashState(parseHash(window.location.hash).state));
  const [state, setState] = useState<TraceWidthState>(init.state);
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

  const set = (patch: Partial<TraceWidthState>) => setState((s) => ({ ...s, ...patch }));
  const reset = () => {
    setState(DEFAULT_STATE);
    setNotices([]);
  };
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const solve = state.solveFor;
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
            options={SOLVE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => set({ solveFor: v as SolveFor })}
          />
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
          {solve !== 'current' && (
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
            label="Maximum allowed conductor temperature (optional)"
            unitHint="°C, K or °F"
            text={state.maxTemp}
            onText={(maxTemp) => set({ maxTemp })}
            expectedDim={fieldDimAbsTemp}
            echoPrefs={otherPrefs}
            help="Absolute temperature, for example 105 °C. When given, ambient plus rise is checked against it."
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
