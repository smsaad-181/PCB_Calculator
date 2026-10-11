import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FOIL_CONVENTIONS } from '../../core/units';
import { parseHash, serializeHash, type Route } from '../../state/hash';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultsPanel } from '../components/ResultsPanel';
import { SelectField } from '../components/SelectField';
import { BASES, BASIS_LABEL, CONVENTION_IDS, LAYERS, conventionOptionLabel, conventionSpreadText, echoPrefs } from '../components/prefs';
import { useRafValue } from '../hooks';
import {
  ADVANCED_CAUTION,
  CALCULATOR_ID,
  DEFAULT_STATE,
  DEFAULT_TEXT,
  METHOD_TEXT,
  RANGE_HINT,
  computeView,
  fieldDim,
  fromHashState,
  hintForCheck,
  toHashState,
  type FieldErrors,
  type TraceResistanceState,
  type TraceResistanceView,
  type Units,
} from './trace-resistance.vm';

const ROUTE: Route = { name: 'calc', id: CALCULATOR_ID };

// Expected dimensions per field come from the view-model's field table, so the page and the tests share one source.
const DIM_LENGTH = fieldDim('length');
const DIM_WEIGHT = fieldDim('copperWeight');
const DIM_ABS_TEMP = fieldDim('ambient');
const DIM_RISE = fieldDim('deltaT');
const DIM_RHO = fieldDim('resistivity');
const DIM_ALPHA = fieldDim('alpha');
const DIM_FREQ = fieldDim('frequency');
const DIM_CURRENT = fieldDim('current');

function liveSummary(v: TraceResistanceView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. ${v.result.headline.meaning}. Confidence ${v.result.confidence.level}. ${String(v.result.details.validity.filter((c) => !c.ok).length)} validity checks failed.${v.callout !== undefined ? ` ${v.callout.heading}.` : ''}`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}

function Results({ view }: { view: TraceResistanceView }) {
  if (view.status === 'ok') {
    return <ResultsPanel view={view.result} failedCheckHint={RANGE_HINT} failedHintFor={hintForCheck} {...(view.callout !== undefined ? { callout: view.callout } : {})} />;
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

export default function TraceResistance() {
  const [init] = useState(() => fromHashState(parseHash(window.location.hash).state));
  const [state, setState] = useState<TraceResistanceState>(init.state);
  const [notices, setNotices] = useState<readonly string[]>(init.notices);
  // The overrides section starts open only when the link already carries an override, so it is never hidden from the reader.
  const [advancedOpen, setAdvancedOpen] = useState(init.state.resistivity.trim() !== '' || init.state.alpha.trim() !== '');
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
      if (loaded.state.resistivity.trim() !== '' || loaded.state.alpha.trim() !== '') setAdvancedOpen(true);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const set = (patch: Partial<TraceResistanceState>) => setState((s) => ({ ...s, ...patch }));
  const reset = () => {
    setState(DEFAULT_STATE);
    setNotices([]);
  };
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const weightMode = state.copperBy === 'weight';
  const lengthPrefs = echoPrefs(state.units, 'width');
  const otherPrefs = echoPrefs(state.units, 'other');
  const thickPrefs = echoPrefs(state.units, 'thickness');

  return (
    <div class="calc-layout">
      <p class="muted">
        DC resistance of a copper trace at its conductor temperature, with an optional skin-depth screen and an optional voltage drop and power loss for a
        current. The copper layer has no default: choose one.
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
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Trace resistance inputs" noValidate>
          <h2>Inputs</h2>
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
            help="Outer and inner copper differ in finished thickness. There is no default: choose one."
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
          {weightMode ? (
            <QuantityField
              id="cweight"
              label="Copper weight"
              unitHint="oz/ft²"
              text={state.copperWeight}
              onText={(copperWeight) => set({ copperWeight })}
              expectedDim={DIM_WEIGHT}
              echoPrefs={otherPrefs}
              help="Examples: 1 oz, 0.5 oz, 2 oz/ft2. A bare oz means oz/ft². Nominal foil, not finished copper."
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
            help="Absolute temperature, for example 40 °C."
            placeholder="25 °C"
            defaultText={DEFAULT_TEXT.ambient}
            externalError={fe.ambient}
          />
          <QuantityField
            id="rise"
            label="Temperature rise above ambient (optional)"
            unitHint="°C, K or °F, as a rise"
            text={state.deltaT}
            onText={(deltaT) => set({ deltaT })}
            expectedDim={DIM_RISE}
            echoPrefs={otherPrefs}
            help="Supplied by you; no self-heating iteration is performed. Examples: 20 °C, 20 K. This is a difference, not a temperature. Empty means the conductor is at ambient."
            placeholder="20 °C"
            externalError={fe.deltaT}
          />
          <QuantityField
            id="frequency"
            label="Frequency for the skin-depth check (optional)"
            unitHint="Hz, kHz, MHz or GHz"
            text={state.frequency}
            onText={(frequency) => set({ frequency })}
            expectedDim={DIM_FREQ}
            echoPrefs={otherPrefs}
            help="Examples: 100 MHz, 1 GHz. Empty means no skin-depth check."
            placeholder="1 GHz"
            externalError={fe.frequency}
          />
          <QuantityField
            id="current"
            label="Current for voltage drop and power loss (optional)"
            unitHint="A or mA"
            text={state.current}
            onText={(current) => set({ current })}
            expectedDim={DIM_CURRENT}
            echoPrefs={otherPrefs}
            help="Examples: 2 A, 500 mA. Empty means no voltage drop or power loss."
            placeholder="2 A"
            externalError={fe.current}
          />
          <details
            class="advanced"
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary>Advanced (overrides)</summary>
            <p class="notice" id="advanced-caution">
              <strong>Caution.</strong> {ADVANCED_CAUTION}
            </p>
            <QuantityField
              id="resistivity"
              label="Resistivity at 20 °C (override)"
              unitHint="Ω·m or µΩ·cm"
              text={state.resistivity}
              onText={(resistivity) => set({ resistivity })}
              expectedDim={DIM_RHO}
              echoPrefs={otherPrefs}
              help="Example: 1.72 µΩ·cm. Empty uses the ledger value for annealed copper."
              externalError={fe.resistivity}
            />
            <QuantityField
              id="alpha"
              label="Temperature coefficient (override)"
              unitHint="/K or ppm/K"
              text={state.alpha}
              onText={(alpha) => set({ alpha })}
              expectedDim={DIM_ALPHA}
              echoPrefs={otherPrefs}
              help="Example: 3930 ppm/K. Empty uses the ledger value for copper at 20 °C."
              externalError={fe.alpha}
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
            onChange={(v) => set({ units: (v === 'imperial' ? 'imperial' : 'metric') as Units })}
          />
          <p class="help">Results always show mm and mil together (copper thickness and skin depth as µm and mil).</p>
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
