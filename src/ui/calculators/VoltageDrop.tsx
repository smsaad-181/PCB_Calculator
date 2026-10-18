import { useMemo, useState } from 'preact/hooks';
import { FOIL_CONVENTIONS } from '../../core/units';
import { FinishedCopperGuidance } from '../components/FinishedCopperGuidance';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { ResultsPanel } from '../components/ResultsPanel';
import { SelectField } from '../components/SelectField';
import { BASES, BASIS_LABEL, CONVENTION_IDS, conventionOptionLabel, conventionSpreadText, echoPrefs } from '../components/prefs';
import { useCalcState } from '../useCalcState';
import { WEIGHT_SOURCE_OPTIONS, WEIGHT_SOURCE_QUESTION, isWeightSource } from './copper-source';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  DEFAULT_TEXT,
  LABEL_MAX_CHARS,
  LAYER_OPTIONS,
  LOAD_OPTIONS,
  MAX_FORWARD_ELEMENTS,
  MAX_RETURN_ELEMENTS,
  METHOD_TEXT,
  NOTE_MAX_CHARS,
  RANGE_HINT,
  RETURN_PATH_OPTIONS,
  RETURN_PATH_QUESTION,
  TEMPERATURE_DIM,
  VSOURCE_DIM,
  addElement,
  computeView,
  elementFieldDim,
  elementFieldKey,
  fromHashState,
  isLoadKind,
  isReturnPath,
  liveSummary,
  loadDim,
  parseBudget,
  removeElement,
  shareLengthNote,
  toHashState,
  type ElementForm,
  type ElementKind,
  type FieldErrors,
  type Side,
  type TableRow,
  type Units,
  type VoltageDropState,
  type VoltageDropView,
} from './voltage-drop.vm';

interface EditorProps {
  readonly side: Side;
  readonly list: readonly ElementForm[];
  readonly units: Units;
  readonly errors: FieldErrors;
  readonly onList: (l: readonly ElementForm[]) => void;
}

const MAX: Readonly<Record<Side, number>> = { forward: MAX_FORWARD_ELEMENTS, return: MAX_RETURN_ELEMENTS };

function ElementEditor({ side, list, units, errors, onList }: EditorProps) {
  const [capMessage, setCapMessage] = useState<string | undefined>(undefined);
  const prefix = side === 'forward' ? 'f' : 'r';
  const widthPrefs = echoPrefs(units, 'width');
  const thickPrefs = echoPrefs(units, 'thickness');
  const otherPrefs = echoPrefs(units, 'other');
  const add = (kind: ElementKind) => {
    const r = addElement(list, kind, side);
    setCapMessage(r.message);
    if (r.message === undefined) onList(r.elements);
  };
  const edit = (i: number, patch: Partial<ElementForm>) => onList(list.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const err = (i: number, f: Parameters<typeof elementFieldKey>[2]) => errors[elementFieldKey(side, i, f)];
  const full = list.length >= MAX[side];
  return (
    <div class="element-list">
      {list.length === 0 && <p class="muted">No {side} elements yet.</p>}
      {list.map((e, i) => {
        const id = `${prefix}${String(i)}`;
        const weightMode = e.copperBy === 'weight';
        return (
          <fieldset class="element-card" key={`${side}-${String(i)}`}>
            <legend>
              {side === 'forward' ? 'Forward' : 'Return'} element {i + 1}: {e.kind === 'trace' ? 'copper trace' : 'resistance'}
            </legend>
            <div class="field">
              <label for={`${id}-label`}>
                Label <span class="req"> required</span>
              </label>
              <input
                id={`${id}-label`}
                type="text"
                autoComplete="off"
                maxLength={LABEL_MAX_CHARS}
                value={e.label}
                aria-describedby={`${id}-label-help`}
                onInput={(ev) => edit(i, { label: (ev.currentTarget as HTMLInputElement).value })}
              />
              <p id={`${id}-label-help`} class="help">
                Names the element in the results. Labels must be unique.
              </p>
            </div>
            {e.kind === 'resistance' ? (
              <>
                <QuantityField
                  id={`${id}-resistance`}
                  label="Resistance"
                  unitHint="Ω, mΩ, kΩ"
                  text={e.resistance}
                  onText={(resistance) => edit(i, { resistance })}
                  expectedDim={elementFieldDim('resistance')}
                  echoPrefs={otherPrefs}
                  help="Cable, connector, fuse, shunt, switch. Examples: 0.5 ohm, 25 mΩ. Use the value at your operating conditions."
                  placeholder="25 mΩ"
                  required
                  externalError={err(i, 'resistance')}
                />
                <div class="field">
                  <label for={`${id}-note`}>
                    Where does this value come from? <span class="req"> required</span>
                  </label>
                  <input
                    id={`${id}-note`}
                    type="text"
                    autoComplete="off"
                    maxLength={NOTE_MAX_CHARS}
                    value={e.note}
                    aria-describedby={`${id}-note-help`}
                    onInput={(ev) => edit(i, { note: (ev.currentTarget as HTMLInputElement).value })}
                  />
                  <p id={`${id}-note-help`} class="help">
                    For example a datasheet page, a measurement or an estimate. It is shown in the results as user-supplied: it has no ledger status and is not checked.
                  </p>
                </div>
              </>
            ) : (
              <>
                <SelectField
                  id={`${id}-layer`}
                  label="Copper layer"
                  value={e.layer}
                  placeholderOption="Choose a layer…"
                  options={LAYER_OPTIONS.map((l) => ({ value: l.value, label: l.label }))}
                  onChange={(v) => edit(i, { layer: v === 'outer' || v === 'inner' ? v : '' })}
                  required
                  help="Outer and inner copper differ in finished thickness. There is no default: choose one."
                />
                <QuantityField
                  id={`${id}-length`}
                  label="Trace length"
                  unitHint="mm, mil, in, cm or m"
                  text={e.length}
                  onText={(length) => edit(i, { length })}
                  expectedDim={elementFieldDim('length')}
                  echoPrefs={widthPrefs}
                  help="Examples: 100 mm, 4 in. Always write the unit."
                  placeholder="100 mm"
                  required
                  externalError={err(i, 'length')}
                />
                <QuantityField
                  id={`${id}-width`}
                  label="Trace width"
                  unitHint="mm, mil, in, cm or m"
                  text={e.width}
                  onText={(width) => edit(i, { width })}
                  expectedDim={elementFieldDim('width')}
                  echoPrefs={widthPrefs}
                  help="Examples: 1 mm, 40 mil. Always write the unit."
                  placeholder="1 mm"
                  required
                  externalError={err(i, 'width')}
                />
                <RadioGroup
                  name={`${id}-copperby`}
                  legend="Copper is given as"
                  value={e.copperBy}
                  options={[
                    { value: 'weight', label: 'Weight (oz/ft²)' },
                    { value: 'thickness', label: 'Thickness (µm or mil)' },
                  ]}
                  onChange={(v) => edit(i, { copperBy: v === 'thickness' ? 'thickness' : 'weight' })}
                />
                {weightMode && (
                  <>
                    <RadioGroup
                      name={`${id}-wsrc`}
                      legend={WEIGHT_SOURCE_QUESTION}
                      value={e.weightSource}
                      options={WEIGHT_SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                      onChange={(v) => edit(i, { weightSource: isWeightSource(v) ? v : '' })}
                    />
                    {e.weightSource === 'finished' && <FinishedCopperGuidance />}
                  </>
                )}
                {weightMode ? (
                  <QuantityField
                    id={`${id}-cweight`}
                    label="Copper weight"
                    unitHint="oz/ft²"
                    text={e.copperWeight}
                    onText={(copperWeight) => edit(i, { copperWeight })}
                    expectedDim={elementFieldDim('copperWeight')}
                    echoPrefs={otherPrefs}
                    help="Examples: 1 oz, 2 oz/ft2. A bare oz means oz/ft². Answer the question above: base foil and finished copper differ."
                    placeholder="1 oz"
                    required
                    externalError={err(i, 'copperWeight')}
                  />
                ) : (
                  <>
                    <QuantityField
                      id={`${id}-cthick`}
                      label="Copper thickness"
                      unitHint="µm or mil"
                      text={e.copperThickness}
                      onText={(copperThickness) => edit(i, { copperThickness })}
                      expectedDim={elementFieldDim('copperThickness')}
                      echoPrefs={thickPrefs}
                      help="Examples: 35 um, 1.4 mil. Always write the unit."
                      placeholder="35 um"
                      required
                      externalError={err(i, 'copperThickness')}
                    />
                    <SelectField
                      id={`${id}-basis`}
                      label="Thickness basis (what your thickness number is)"
                      value={e.basis}
                      options={BASES.map((b) => ({ value: b, label: BASIS_LABEL[b] }))}
                      onChange={(v) => edit(i, { basis: BASES.find((b) => b === v) ?? 'nominal' })}
                      help="Nominal is the default assumption. Choose finished or measured only if the number really is one."
                    />
                  </>
                )}
              </>
            )}
            <button type="button" class="secondary" onClick={() => { setCapMessage(undefined); onList(removeElement(list, i)); }} aria-label={`Remove ${side} element ${String(i + 1)}${e.label.trim() !== '' ? `, ${e.label.trim()}` : ''}`}>
              Remove this element
            </button>
          </fieldset>
        );
      })}
      <div class="element-actions">
        <button type="button" class="secondary" onClick={() => add('trace')} disabled={full}>
          Add a copper trace
        </button>
        <button type="button" class="secondary" onClick={() => add('resistance')} disabled={full}>
          Add a resistance
        </button>
      </div>
      <p class="help">
        {list.length} of {MAX[side]} {side} elements used.
      </p>
      {(capMessage !== undefined || full) && (
        <p class="field-warning" role="status">
          <span aria-hidden="true">{'▲ '}</span>
          {capMessage ?? `Limit reached: at most ${String(MAX[side])} ${side} elements are supported on this page.`}
        </p>
      )}
    </div>
  );
}

function ElementTable({ rows }: { rows: readonly TableRow[] }) {
  return (
    <section aria-labelledby="elements-h" class="element-table">
      <h3 id="elements-h">Per element</h3>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">Resistance, voltage drop, power loss and share of the total drop for each path element. The largest-drop element is marked.</caption>
          <thead>
            <tr>
              <th scope="col">Element</th>
              <th scope="col">Resistance</th>
              <th scope="col">Drop</th>
              <th scope="col">Loss</th>
              <th scope="col">Share of drop</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} class={r.limiting ? 'limiting-row' : undefined}>
                <th scope="row">
                  {r.name}
                  {r.limiting && <span class="limiting-tag"> Largest-drop element</span>}
                  <span class="muted element-src"> {r.provenance}</span>
                </th>
                <td class="num">{r.resistance}</td>
                <td class="num">{r.drop}</td>
                <td class="num">{r.loss}</td>
                <td class="num">{r.share}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Results({ view }: { view: VoltageDropView }) {
  if (view.status === 'ok') {
    return (
      <ResultsPanel
        view={view.result}
        failedCheckHint={RANGE_HINT}
        callout={view.callout}
        afterHeadline={
          <>
            <p class="limiting-line">
              <strong>Largest-drop element:</strong> {view.limiting.text}
            </p>
            <ElementTable rows={view.table} />
          </>
        }
      />
    );
  }
  if (view.status === 'cannot-supply') {
    return (
      <div class="error-box" role="group" aria-label="The load cannot be supplied">
        <p>
          <strong>The load cannot be supplied. No operating point exists, so no result is shown.</strong>
        </p>
        <p>{view.message}</p>
      </div>
    );
  }
  if (view.status === 'error') return <ResultStatus status="error" items={view.problems} />;
  return <ResultStatus status="needs-input" items={view.needs} />;
}

export default function VoltageDrop() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<VoltageDropState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied), [applied]);
  const shareNote = useMemo(() => shareLengthNote(applied), [applied]);
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const otherPrefs = echoPrefs(state.units, 'other');
  const kind = state.loadKind === '' ? undefined : LOAD_OPTIONS.find((o) => o.value === state.loadKind);
  const returnCaution = RETURN_PATH_OPTIONS.find((o) => o.value === state.returnPath)?.caution;
  const hasTrace = [...state.elements, ...(state.returnPath === 'included-in-list' ? state.returnElements : [])].some((e) => e.kind === 'trace');

  return (
    <div class="calc-layout">
      <p class="muted">
        Voltage drop, power loss, load voltage and efficiency of one DC feed path: a source, a list of copper traces and resistances in series, and one load. The return path and the load
        are choices you make; nothing is assumed for them.
      </p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Voltage drop inputs" noValidate>
          <h2>Inputs</h2>
          <QuantityField
            id="vsource"
            label="Source voltage"
            unitHint="V, mV or kV"
            text={state.vsource}
            onText={(vsource) => patch({ vsource })}
            expectedDim={VSOURCE_DIM}
            echoPrefs={otherPrefs}
            help="Examples: 12 V, 3.3 V. An ideal source (no output resistance) is assumed."
            placeholder="12 V"
            required
            externalError={fe['vsource']}
          />
          <RadioGroup
            name="loadkind"
            legend="The load is described by"
            value={state.loadKind}
            options={LOAD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => {
              if (isLoadKind(v)) patch({ loadKind: v });
            }}
          />
          {kind !== undefined && (
            <QuantityField
              id="loadvalue"
              label={kind.fieldLabel}
              unitHint={kind.unitHint}
              text={state.loadValue}
              onText={(loadValue) => patch({ loadValue })}
              expectedDim={loadDim(kind.value)}
              echoPrefs={otherPrefs}
              help={kind.help}
              placeholder={kind.placeholder}
              required
              externalError={fe['loadValue']}
            />
          )}
          <RadioGroup
            name="returnpath"
            legend={RETURN_PATH_QUESTION}
            value={state.returnPath}
            options={RETURN_PATH_OPTIONS.map((o) => ({ value: o.value, label: o.label, hint: o.explain }))}
            onChange={(v) => {
              if (isReturnPath(v)) patch({ returnPath: v });
            }}
          />
          {state.returnPath === '' && <p class="help">There is no default: choose one of the three.</p>}
          {returnCaution !== undefined && (
            <p class="notice" role="note">
              <strong>Caution.</strong> {returnCaution}
            </p>
          )}
          <h3>Forward path (source to load)</h3>
          <ElementEditor side="forward" list={state.elements} units={state.units} errors={fe} onList={(elements) => patch({ elements })} />
          {state.returnPath === 'included-in-list' && (
            <>
              <h3>Return path (optional)</h3>
              <p class="help">List the return conductors here, or leave this empty if they are already in the forward list above.</p>
              <ElementEditor side="return" list={state.returnElements} units={state.units} errors={fe} onList={(returnElements) => patch({ returnElements })} />
            </>
          )}
          <QuantityField
            id="temperature"
            label="Conductor temperature of the traces (optional)"
            unitHint="°C, K or °F"
            text={state.temperature}
            onText={(temperature) => patch({ temperature })}
            expectedDim={TEMPERATURE_DIM}
            echoPrefs={otherPrefs}
            help="Absolute temperature of the copper, for example 60 °C. Self-heating is not calculated here. It applies to every trace."
            placeholder="25 °C"
            defaultText={DEFAULT_TEXT.temperature}
            externalError={fe['temperature']}
          />
          {hasTrace && (
            <SelectField
              id="convention"
              label="Foil convention (how oz/ft² maps to thickness)"
              value={state.convention}
              options={[{ value: '', label: conventionOptionLabel('') }, ...CONVENTION_IDS.map((id) => ({ value: id, label: FOIL_CONVENTIONS[id].label }))]}
              onChange={(v) => patch({ convention: CONVENTION_IDS.find((id) => id === v) ?? '' })}
              help={`The three conventions differ by up to ${conventionSpreadText()} at 1 oz/ft². Leaving the default counts as an assumption.`}
            />
          )}
          <QuantityField
            id="budget"
            label="Drop budget (optional)"
            unitHint="percent of the source, for example 5%"
            text={state.budget}
            onText={(budget) => patch({ budget })}
            expectedDim={VSOURCE_DIM}
            parser={parseBudget}
            help="Your own limit on the total drop, for example from the load's datasheet. Write 5% or 0.05. Empty means no budget; there is no default."
            placeholder="5%"
            externalError={fe['budget']}
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
          <p class="help">Results always show mm and mil together.</p>
          {shareNote !== undefined && (
            <p class="field-warning" role="status">
              <span aria-hidden="true">{'▲ '}</span>
              {shareNote}
            </p>
          )}
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
