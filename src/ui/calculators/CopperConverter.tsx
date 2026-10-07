import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DIM, FOIL_CONVENTIONS } from '../../core/units';
import { parseHash, serializeHash, type Route } from '../../state/hash';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultsPanel } from '../components/ResultsPanel';
import { SelectField } from '../components/SelectField';
import { useRafValue } from '../hooks';
import {
  BASES,
  CALCULATOR_ID,
  CONVENTION_IDS,
  DEFAULT_STATE,
  LAYERS,
  computeView,
  conventionOptionLabel,
  conventionSpreadText,
  echoPrefs,
  fromHashState,
  toHashState,
  type ConverterState,
  type ConverterView,
  type EntryMode,
  type FieldErrors,
  type Units,
} from './copper-converter.vm';

const ROUTE: Route = { name: 'calc', id: CALCULATOR_ID };

const BASIS_LABEL: Readonly<Record<string, string>> = {
  nominal: 'Nominal (default)',
  finished: 'Finished (from your fabricator)',
  measured: 'Measured (for example a micro-section)',
};

function liveSummary(v: ConverterView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. ${v.result.headline.meaning}. Confidence ${v.result.confidence.level}.`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}

function Results({ view }: { view: ConverterView }) {
  if (view.status === 'ok') return <ResultsPanel view={view.result} />;
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

export default function CopperConverter() {
  const [init] = useState(() => fromHashState(parseHash(window.location.hash).state));
  const [state, setState] = useState<ConverterState>(init.state);
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

  const set = (patch: Partial<ConverterState>) => setState((s) => ({ ...s, ...patch }));
  const reset = () => {
    setState(DEFAULT_STATE);
    setNotices([]);
  };
  const prefs = echoPrefs(state.units);
  const weightMode = state.by === 'weight';
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};

  return (
    <div class="calc-layout">
      <p class="muted">
        Nominal conversion between copper foil weight and thickness. It is not finished copper: ask your fabricator for finished
        thickness per layer.
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
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Copper converter inputs" noValidate>
          <h2>Inputs</h2>
          <RadioGroup
            name="by"
            legend="Which value do you know? (the other is solved)"
            value={state.by}
            options={[
              { value: 'weight', label: 'Copper weight (oz/ft²)' },
              { value: 'thickness', label: 'Copper thickness (µm or mil)' },
            ]}
            onChange={(v) => set({ by: v as EntryMode })}
          />
          {weightMode ? (
            <QuantityField
              id="weight"
              label="Copper weight"
              unitHint="oz/ft²"
              text={state.weight}
              onText={(weight) => set({ weight })}
              expectedDim={DIM.AREAL_MASS}
              echoPrefs={prefs}
              help="Examples: 1 oz, 0.5 oz, 2 oz/ft2, 305 g/m2. A bare oz means oz/ft². Fractions such as 1/2 are not accepted: write 0.5."
              placeholder="1 oz"
              required
              externalError={fe.weight}
            />
          ) : (
            <QuantityField
              id="thickness"
              label="Copper thickness"
              unitHint="µm or mil"
              text={state.thickness}
              onText={(thickness) => set({ thickness })}
              expectedDim={DIM.LENGTH}
              echoPrefs={prefs}
              help="Examples: 35 um, 35 µm, 1.4 mil, 0.035 mm. Always write the unit."
              placeholder="35 um"
              required
              externalError={fe.thickness}
            />
          )}
          <SelectField
            id="layer"
            label="Copper layer"
            value={state.layer}
            placeholderOption="Choose a layer..."
            options={LAYERS.map((l) => ({ value: l, label: l === 'outer' ? 'Outer layer (plated up)' : 'Inner layer' }))}
            onChange={(v) => set({ layer: v === 'outer' || v === 'inner' ? v : '' })}
            required
            help="Outer copper finishes thicker after plating; inner copper can finish thinner. There is no default: choose one."
          />
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
          {!weightMode && (
            <SelectField
              id="basis"
              label="Thickness basis (what your thickness number is)"
              value={state.basis}
              options={BASES.map((b) => ({ value: b, label: BASIS_LABEL[b] ?? b }))}
              onChange={(v) => set({ basis: BASES.find((b) => b === v) ?? 'nominal' })}
              help="Nominal is the default assumption. Choose finished or measured only if the number really is one."
            />
          )}
          <QuantityField
            id="plating"
            label="Plating thickness (optional)"
            unitHint="µm or mil"
            text={state.plating}
            onText={(plating) => set({ plating })}
            expectedDim={DIM.LENGTH}
            echoPrefs={prefs}
            help="Added to the foil to estimate finished outer copper. Example: 25 um. Leave empty to skip."
            placeholder="25 um"
            disabled={state.layer !== 'outer'}
            disabledReason={
              state.layer === 'inner' ? 'Not used for an inner layer.' : 'Choose the outer layer to enter plating thickness.'
            }
            externalError={fe.plating}
          />
          <RadioGroup
            name="units"
            legend="Echo units for what you type"
            value={state.units}
            options={[
              { value: 'metric', label: 'Metric (µm)' },
              { value: 'imperial', label: 'Imperial (mil)' },
            ]}
            onChange={(v) => set({ units: (v === 'imperial' ? 'imperial' : 'metric') as Units })}
          />
          <p class="help">Results always show millimetres and mils together.</p>
          <ResetButton onReset={reset} />
        </form>
        <section class="panel output" aria-labelledby="result-h" aria-busy={pending ? 'true' : undefined} data-pending={pending ? 'true' : undefined}>
          <h2 id="result-h">Result</h2>
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
