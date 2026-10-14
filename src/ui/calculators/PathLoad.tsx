import { useMemo, useState } from 'preact/hooks';
import { DIM, FOIL_CONVENTIONS } from '../../core/units';
import { Callout } from '../components/Callout';
import { FinishedCopperGuidance } from '../components/FinishedCopperGuidance';
import { LedgerRowBadges } from '../components/LedgerRowBadges';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { ResultsPanel } from '../components/ResultsPanel';
import { SelectField } from '../components/SelectField';
import { BASES, BASIS_LABEL, CONVENTION_IDS, conventionOptionLabel, conventionSpreadText, echoPrefs } from '../components/prefs';
import { useToday } from '../hooks';
import { useCalcState } from '../useCalcState';
import { WEIGHT_SOURCE_OPTIONS, WEIGHT_SOURCE_QUESTION, isWeightSource } from './copper-source';
import { BUNDLED_LABEL, NONE_LABEL, isProfileChoice } from './fab-profile-choice';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  DEFAULT_TEXT,
  ELEMENT_KIND_OPTIONS,
  LABEL_MAX_CHARS,
  LAYER_COUNT_OPTIONS,
  LAYER_OPTIONS,
  LOAD_OPTIONS,
  MAX_FORWARD_ELEMENTS,
  MAX_RETURN_ELEMENTS,
  METHOD_TEXT,
  NOTE_MAX_CHARS,
  PROFILE_HELP,
  PROFILE_QUESTION,
  RANGE_HINT,
  RATING_HELP,
  RETURN_PATH_OPTIONS,
  RETURN_PATH_QUESTION,
  TEMPERATURE_DIM,
  VSOURCE_DIM,
  addElement,
  computeView,
  elementEchoPrefs,
  elementFieldDim,
  elementFieldKey,
  fromHashState,
  isLayerCount,
  isLoadKind,
  isReturnPath,
  isUserKind,
  kindShort,
  liveSummary,
  loadDim,
  parseBudget,
  parseCountField,
  profileBanner,
  removeElement,
  shareLengthNote,
  toHashState,
  type ElementField,
  type ElementForm,
  type ElementKind,
  type FieldErrors,
  type NetClassBlock,
  type PathLoadState,
  type PathLoadView,
  type ProfileBanner,
  type Side,
  type TableRow,
  type TotalRow,
  type UnratedRow,
} from './path-load.vm';

const MAX: Readonly<Record<Side, number>> = { forward: MAX_FORWARD_ELEMENTS, return: MAX_RETURN_ELEMENTS };

function Banner({ b }: { b: ProfileBanner }) {
  return (
    <div class="banner profile-banner" role="status" aria-label="Fab profile in use">
      <div class="banner-body">
        <p>
          <span class="pill-unverified">{b.unverified ? 'UNVERIFIED' : b.status}</span> <strong>{b.title}</strong>
        </p>
        <p>
          Profile <strong>{b.id}</strong> ({b.fabricator}), dated <strong>{b.profileDate}</strong>, <strong>{b.ageText}</strong>.
        </p>
        <p>{b.unverifiedText}</p>
        {b.stale && (
          <p class="profile-stale">
            <span aria-hidden="true">{'⚠ '}</span>
            <strong>{b.staleText}</strong>
          </p>
        )}
      </div>
    </div>
  );
}

interface TextProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly max: number;
  readonly help: string;
  readonly required?: boolean;
  readonly error?: string | undefined;
  readonly onInput: (v: string) => void;
}
/** A free-text field (label, source note, rating source) with its help and inline error. */
function TextField(p: TextProps) {
  const helpId = `${p.id}-help`;
  const errId = `${p.id}-err`;
  return (
    <div class="field">
      <label for={p.id}>
        {p.label}
        {p.required === true && <span class="req"> required</span>}
      </label>
      <input
        id={p.id}
        type="text"
        autoComplete="off"
        maxLength={p.max}
        value={p.value}
        aria-invalid={p.error !== undefined ? 'true' : undefined}
        aria-describedby={p.error !== undefined ? `${helpId} ${errId}` : helpId}
        onInput={(ev) => p.onInput((ev.currentTarget as HTMLInputElement).value)}
      />
      <p id={helpId} class="help">
        {p.help}
      </p>
      {p.error !== undefined && (
        <p id={errId} class="field-error">
          <span aria-hidden="true">{'✖ '}</span>
          <span class="visually-hidden">Error: </span>
          {p.error}
        </p>
      )}
    </div>
  );
}

interface EditorProps {
  readonly side: Side;
  readonly list: readonly ElementForm[];
  readonly units: PathLoadState['units'];
  readonly errors: FieldErrors;
  readonly onList: (l: readonly ElementForm[]) => void;
}

function RatingPair({ id, e, units, err, edit }: { id: string; e: ElementForm; units: PathLoadState['units']; err: (f: ElementField) => string | undefined; edit: (p: Partial<ElementForm>) => void }) {
  return (
    <fieldset class="rating-pair">
      <legend>Current rating (optional pair)</legend>
      <p class="help">{RATING_HELP}</p>
      <QuantityField
        id={`${id}-rated`}
        label="Rated current of the whole element"
        unitHint="A or mA"
        text={e.rated}
        onText={(rated) => edit({ rated })}
        expectedDim={elementFieldDim('rated')}
        echoPrefs={elementEchoPrefs(units, 'rated')}
        help={e.kind === 'via' ? 'For a via array this is the rating of the whole array, not of one via. Examples: 3 A, 500 mA.' : 'From the datasheet or drawing, at your conditions. Examples: 3 A, 500 mA.'}
        placeholder="3 A"
        externalError={err('rated')}
      />
      <TextField
        id={`${id}-rsrc`}
        label="Where does this rating come from?"
        value={e.ratingSource}
        max={NOTE_MAX_CHARS}
        help="For example a datasheet page, a drawing or a measurement. It is shown as user-supplied: it has no ledger status and is not checked."
        error={err('ratingSource')}
        onInput={(ratingSource) => edit({ ratingSource })}
      />
    </fieldset>
  );
}

function ElementEditor({ side, list, units, errors, onList }: EditorProps) {
  const [capMessage, setCapMessage] = useState<string | undefined>(undefined);
  const [pick, setPick] = useState<ElementKind | ''>('');
  const prefix = side === 'forward' ? 'f' : 'r';
  const add = () => {
    if (pick === '') return;
    const r = addElement(list, pick, side);
    setCapMessage(r.message);
    if (r.message === undefined) {
      onList(r.elements);
      setPick('');
    }
  };
  const edit = (i: number, patch: Partial<ElementForm>) => onList(list.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const err = (i: number, f: ElementField) => errors[elementFieldKey(side, i, f)];
  const full = list.length >= MAX[side];
  const widthPrefs = (f: 'length' | 'width' | 'hole' | 'barrel' | 'drill' | 'pad') => elementEchoPrefs(units, f);
  return (
    <div class="element-list">
      {list.length === 0 && <p class="muted">No {side} elements yet.</p>}
      {list.map((e, i) => {
        const id = `${prefix}${String(i)}`;
        const weightMode = e.copperBy === 'weight';
        const q = (f: ElementField) => err(i, f);
        return (
          <fieldset class="element-card" key={`${side}-${String(i)}`}>
            <legend>
              {side === 'forward' ? 'Forward' : 'Return'} element {i + 1}: {kindShort(e.kind)}
            </legend>
            <TextField
              id={`${id}-label`}
              label="Label"
              required
              value={e.label}
              max={LABEL_MAX_CHARS}
              help="Names the element in the results and the net-class export. Labels must be unique."
              error={q('label')}
              onInput={(label) => edit(i, { label })}
            />
            {e.kind === 'trace' && (
              <>
                <SelectField
                  id={`${id}-layer`}
                  label="Copper layer"
                  value={e.layer}
                  placeholderOption="Choose a layer…"
                  options={LAYER_OPTIONS.map((l) => ({ value: l.value, label: l.label }))}
                  onChange={(v) => edit(i, { layer: v === 'outer' || v === 'inner' ? v : '' })}
                  required
                  help="Outer and inner copper differ in finished thickness and in the legacy current limit. There is no default: choose one."
                />
                <QuantityField
                  id={`${id}-length`}
                  label="Trace length"
                  unitHint="mm, mil, in, cm or m"
                  text={e.length}
                  onText={(length) => edit(i, { length })}
                  expectedDim={elementFieldDim('length')}
                  echoPrefs={widthPrefs('length')}
                  help="Examples: 100 mm, 4 in. Always write the unit."
                  placeholder="100 mm"
                  required
                  externalError={q('length')}
                />
                <QuantityField
                  id={`${id}-width`}
                  label="Trace width"
                  unitHint="mm, mil, in, cm or m"
                  text={e.width}
                  onText={(width) => edit(i, { width })}
                  expectedDim={elementFieldDim('width')}
                  echoPrefs={widthPrefs('width')}
                  help="Examples: 1 mm, 40 mil. Always write the unit."
                  placeholder="1 mm"
                  required
                  externalError={q('width')}
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
                    echoPrefs={elementEchoPrefs(units, 'copperWeight')}
                    help="Examples: 1 oz, 2 oz/ft2. A bare oz means oz/ft². Answer the question above: base foil and finished copper differ."
                    placeholder="1 oz"
                    required
                    externalError={q('copperWeight')}
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
                      echoPrefs={elementEchoPrefs(units, 'copperThickness')}
                      help="Examples: 35 um, 1.4 mil. Always write the unit."
                      placeholder="35 um"
                      required
                      externalError={q('copperThickness')}
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
                <QuantityField
                  id={`${id}-rise`}
                  label="Allowed temperature rise (a difference)"
                  unitHint="K or °C of rise, °F of rise"
                  text={e.rise}
                  onText={(rise) => edit(i, { rise })}
                  expectedDim={elementFieldDim('rise')}
                  echoPrefs={elementEchoPrefs(units, 'rise')}
                  help="How much hotter than ambient you allow this trace to run, for example 20 K. Not an absolute temperature. It sets this trace's legacy current limit and the net-class width. Never assumed."
                  placeholder="20 K"
                  required
                  externalError={q('rise')}
                />
              </>
            )}
            {e.kind === 'via' && (
              <>
                <QuantityField
                  id={`${id}-hole`}
                  label="Finished hole diameter (not the drill)"
                  unitHint="mm, mil, in or µm"
                  text={e.hole}
                  onText={(hole) => edit(i, { hole })}
                  expectedDim={elementFieldDim('hole')}
                  echoPrefs={widthPrefs('hole')}
                  help="The inside diameter after plating. Examples: 0.3 mm, 12 mil."
                  placeholder="0.3 mm"
                  required
                  externalError={q('hole')}
                />
                <QuantityField
                  id={`${id}-plating`}
                  label="Plating thickness (barrel wall)"
                  unitHint="µm or mil"
                  text={e.plating}
                  onText={(plating) => edit(i, { plating })}
                  expectedDim={elementFieldDim('plating')}
                  echoPrefs={elementEchoPrefs(units, 'plating')}
                  help="Required, never filled in for you. Use the thinnest value your fabricator guarantees. Always write the unit (um or mil)."
                  required
                  externalError={q('plating')}
                />
                <QuantityField
                  id={`${id}-barrel`}
                  label="Barrel length"
                  unitHint="mm, mil, in or cm"
                  text={e.barrel}
                  onText={(barrel) => edit(i, { barrel })}
                  expectedDim={elementFieldDim('barrel')}
                  echoPrefs={widthPrefs('barrel')}
                  help="Board thickness for a through via. Example: 1.6 mm."
                  placeholder="1.6 mm"
                  required
                  externalError={q('barrel')}
                />
                <QuantityField
                  id={`${id}-count`}
                  label="Number of vias in parallel"
                  unitHint="whole number"
                  text={e.count}
                  onText={(count) => edit(i, { count })}
                  expectedDim={DIM.DIMENSIONLESS}
                  parser={parseCountField}
                  help="Identical vias sharing current equally (ideal; real arrays do not). Use 1 for a single via."
                  placeholder="1"
                  required
                  externalError={q('count')}
                />
                <QuantityField
                  id={`${id}-drill`}
                  label="Drill diameter (optional, for the net-class export)"
                  unitHint="mm, mil, in or µm"
                  text={e.drill}
                  onText={(drill) => edit(i, { drill })}
                  expectedDim={elementFieldDim('drill')}
                  echoPrefs={widthPrefs('drill')}
                  help="Echoed into the export as your value. Nothing is derived from the finished hole."
                  externalError={q('drill')}
                />
                <QuantityField
                  id={`${id}-pad`}
                  label="Pad diameter (optional, for the net-class export)"
                  unitHint="mm, mil, in or µm"
                  text={e.pad}
                  onText={(pad) => edit(i, { pad })}
                  expectedDim={elementFieldDim('pad')}
                  echoPrefs={widthPrefs('pad')}
                  help="Echoed into the export as your value."
                  externalError={q('pad')}
                />
                <RatingPair id={id} e={e} units={units} err={q} edit={(p) => edit(i, p)} />
              </>
            )}
            {isUserKind(e.kind) && (
              <>
                <QuantityField
                  id={`${id}-resistance`}
                  label="Resistance"
                  unitHint="Ω, mΩ, kΩ"
                  text={e.resistance}
                  onText={(resistance) => edit(i, { resistance })}
                  expectedDim={elementFieldDim('resistance')}
                  echoPrefs={elementEchoPrefs(units, 'resistance')}
                  help="Examples: 0.5 ohm, 25 mΩ. Use the value at your operating conditions."
                  placeholder="25 mΩ"
                  required
                  externalError={q('resistance')}
                />
                <TextField
                  id={`${id}-note`}
                  label="Where does this resistance come from?"
                  required
                  value={e.note}
                  max={NOTE_MAX_CHARS}
                  help="For example a datasheet page, a measurement or an estimate. It is shown as user-supplied: it has no ledger status and is not checked."
                  error={q('note')}
                  onInput={(note) => edit(i, { note })}
                />
                <RatingPair id={id} e={e} units={units} err={q} edit={(p) => edit(i, p)} />
              </>
            )}
            <button
              type="button"
              class="secondary"
              onClick={() => {
                setCapMessage(undefined);
                onList(removeElement(list, i));
              }}
              aria-label={`Remove ${side} element ${String(i + 1)}${e.label.trim() !== '' ? `, ${e.label.trim()}` : ''}`}
            >
              Remove this element
            </button>
          </fieldset>
        );
      })}
      <div class="element-actions add-row">
        <SelectField
          id={`${side}-add-kind`}
          label={`Add a ${side} element`}
          value={pick}
          placeholderOption="Choose a kind…"
          options={ELEMENT_KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => setPick(ELEMENT_KIND_OPTIONS.find((o) => o.value === v)?.value ?? '')}
          {...(full ? { disabled: true } : {})}
        />
        <button type="button" class="secondary" onClick={add} disabled={full || pick === ''}>
          Add element
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

function Totals({ rows }: { rows: readonly TotalRow[] }) {
  return (
    <section class="totals" aria-labelledby="totals-h">
      <h3 id="totals-h">Totals for the whole path</h3>
      <dl class="rows">
        {rows.map((r) => (
          <div class="row" key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RankedTable({ rows }: { rows: readonly TableRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="ranked-h" class="element-table">
      <h3 id="ranked-h">Rated elements, highest utilisation first</h3>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">
            Rated elements ranked by utilisation, applied current divided by allowed current. Each row gives resistance, voltage drop, power loss, share of the total drop, the current limit with its basis and source, utilisation and margin.
          </caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Element</th>
              <th scope="col">Resistance</th>
              <th scope="col">Drop</th>
              <th scope="col">Loss</th>
              <th scope="col">Share of drop</th>
              <th scope="col">Current limit, basis and source</th>
              <th scope="col">Utilisation</th>
              <th scope="col">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} class={r.weakest ? 'limiting-row' : undefined}>
                <td class="num">{r.rank}</td>
                <th scope="row">
                  {r.name}
                  {r.weakest && <span class="limiting-tag"> Weakest link (highest utilisation)</span>}
                  {r.over && <span class="limiting-tag over-tag"> {r.overTag}</span>}
                  <span class="muted element-src">
                    {r.kindLabel}, {r.side} path
                  </span>
                </th>
                <td class="num">{r.resistance}</td>
                <td class="num">{r.drop}</td>
                <td class="num">{r.loss}</td>
                <td class="num">{r.share}</td>
                <td>
                  <strong>{r.limit}</strong>
                  <span class="muted element-src">{r.limitBasis}</span>
                  <span class="element-src">{r.limitSource}</span>
                  <span class={r.limitUnverified ? 'pill-unverified' : 'cmp-tag'}>{r.limitBadge}</span>
                </td>
                <td class="num">{r.utilisation}</td>
                <td class="num">{r.margin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UnratedBlock({ heading, text, rows }: { heading: string; text: string; rows: readonly UnratedRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="unrated-h" class="element-table unrated">
      <h3 id="unrated-h">
        <span class="cmp-tag">[Unrated]</span> {heading}
      </h3>
      <p>{text}</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">Elements with no current rating. They are not in the weakest-link ranking and may be the real limit.</caption>
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
              <tr key={r.id}>
                <th scope="row">
                  {r.name}
                  <span class="muted element-src">
                    {r.kindLabel}, {r.side} path, no current rating
                  </span>
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

function NetClassSection({ nc }: { nc: NetClassBlock }) {
  return (
    <section class="netclass" aria-labelledby="nc-h">
      <h3 id="nc-h">{nc.heading}</h3>
      <p class="notice" role="note">
        <strong>Starting point, not a design rule.</strong> {nc.startingPoint}
      </p>
      {nc.empty !== undefined && <p class="muted">{nc.empty}</p>}
      {nc.groups.map((g) => (
        <div class="cmp" key={g.id}>
          <h4>{g.title}</h4>
          <dl class="rows">
            {g.values.map((v) => (
              <div class="row" key={v.key}>
                <dt>{v.label}</dt>
                <dd>
                  <strong>{v.text}</strong>{' '}
                  {v.unverified && <span class="pill-unverified">UNVERIFIED</span>}{' '}
                  {v.tags.map((t) => (
                    <span key={t} class="cmp-tag">
                      {t}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          {g.clearanceReason !== undefined && (
            <p class="field-warning" role="note">
              <span aria-hidden="true">{'▲ '}</span>
              <strong>No clearance exported.</strong> {g.clearanceReason}
            </p>
          )}
          <details class="more">
            <summary>Note from the calculator for {g.title}</summary>
            <p>{g.note}</p>
          </details>
        </div>
      ))}
      <div class="field">
        <label for="nc-copy">Net-class values as plain text (select and copy)</label>
        <textarea id="nc-copy" class="netclass-text" readOnly rows={12} value={nc.plainText} aria-describedby="nc-copy-help" />
        <p id="nc-copy-help" class="help">
          Plain text with units, status tags and the starting-point note. It is a starting point, not a design rule.
        </p>
      </div>
    </section>
  );
}

function Results({ view }: { view: PathLoadView }) {
  if (view.status === 'ok') {
    return (
      <ResultsPanel
        view={view.result}
        failedCheckHint={RANGE_HINT}
        callout={view.headlineCallout}
        afterHeadline={
          <>
            {view.scope !== undefined && <Callout heading={view.scope.heading} text={view.scope.text} />}
            <Totals rows={view.totals} />
            <RankedTable rows={view.table} />
            <UnratedBlock heading={view.unratedHeading} text={view.unratedText} rows={view.unrated} />
            <NetClassSection nc={view.netClass} />
            {view.userSupplied.length > 0 && (
              <p class="unverified-line">
                <span class="pill-unverified">USER-SUPPLIED</span> No ledger status and not checked: {view.userSupplied.join('; ')}.
              </p>
            )}
            <LedgerRowBadges heading="Data behind this result (one status per ledger row)" rows={view.ledgerRows} />
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

/** The page for a given day (YYYY-MM-DD). The day is handed in so tests and callers control the clock; the core never reads one. */
export function PathLoadOn({ today }: { readonly today: string }) {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<PathLoadState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied, today), [applied, today]);
  const shareNote = useMemo(() => shareLengthNote(state), [state]);
  const banner = useMemo(() => profileBanner(state, today), [state, today]);
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const otherPrefs = echoPrefs(state.units, 'other');
  const kind = state.loadKind === '' ? undefined : LOAD_OPTIONS.find((o) => o.value === state.loadKind);
  const returnCaution = RETURN_PATH_OPTIONS.find((o) => o.value === state.returnPath)?.caution;
  const hasTrace = [...state.elements, ...(state.returnPath === 'included-in-list' ? state.returnElements : [])].some((e) => e.kind === 'trace');

  return (
    <div class="calc-layout">
      <p class="muted">
        A series path from a source to one load: traces, vias, connectors and other elements. It reports each element's drop and loss, ranks the elements that have a current limit, names the weakest
        link and exports starting net-class values. Elements without a rating are not ranked and may be the real limit.
      </p>
      {banner !== undefined && <Banner b={banner} />}
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Path and load inputs" noValidate>
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
            legend="The load is described by (choose exactly one)"
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
            legend={`${RETURN_PATH_QUESTION} (required)`}
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
            label="Conductor temperature of traces and vias (optional)"
            unitHint="°C, K or °F"
            text={state.temperature}
            onText={(temperature) => patch({ temperature })}
            expectedDim={TEMPERATURE_DIM}
            echoPrefs={otherPrefs}
            help="Absolute temperature of the copper, for example 60 °C. Self-heating is not calculated here. It applies to every trace and via."
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
            name="profile"
            legend={PROFILE_QUESTION}
            value={state.profile}
            options={[
              { value: 'bundled', label: BUNDLED_LABEL },
              { value: 'none', label: NONE_LABEL },
            ]}
            onChange={(v) => {
              if (isProfileChoice(v)) patch({ profile: v });
            }}
          />
          <p class="help">{PROFILE_HELP}</p>
          {state.profile === 'bundled' && (
            <RadioGroup
              name="layercount"
              legend="Layer count (scope for the clearance lookup)"
              value={state.layerCount}
              options={LAYER_COUNT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => patch({ layerCount: v === '' ? '' : isLayerCount(v) ? v : '' })}
            />
          )}
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

/** The page: the current UTC day is read once, here, and handed down. */
export default function PathLoad() {
  return <PathLoadOn today={useToday()} />;
}
