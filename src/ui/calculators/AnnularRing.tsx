import { useMemo } from 'preact/hooks';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { ResultsPanel } from '../components/ResultsPanel';
import { echoPrefs } from '../components/prefs';
import { useToday } from '../hooks';
import { useCalcState } from '../useCalcState';
import { BUNDLED_LABEL, NONE_LABEL, isProfileChoice } from './fab-profile-choice';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  HOLE_TYPE_OPTIONS,
  LAYER_COUNT_OPTIONS,
  LAYER_SIDE_OPTIONS,
  METHOD_TEXT,
  PROFILE_HELP,
  PROFILE_QUESTION,
  RANGE_HINT,
  RING_REF_OPTIONS,
  TOLERANCE_HELP,
  computeView,
  fieldDim,
  fromHashState,
  isHoleType,
  isLayerCount,
  isLayerSide,
  isRingRef,
  liveSummary,
  profileBanner,
  toHashState,
  type AnnularRingState,
  type AnnularRingView,
  type Comparison,
  type FieldErrors,
  type NotPublished,
  type ProfileBanner,
  type StackUp,
} from './annular-ring.vm';

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

function StackUpSection({ s, incomplete }: { s: StackUp; incomplete: string | undefined }) {
  return (
    <section class="stackup" aria-labelledby="stackup-h">
      <h3 id="stackup-h">{s.partial ? 'Partial worst-case stack-up (not a complete worst case)' : 'Worst-case stack-up'}</h3>
      <p>
        <strong>{s.nominalLabel}:</strong> {s.nominal}
      </p>
      {s.terms.length > 0 ? (
        <div class="table-wrap">
          <table>
            <caption class="visually-hidden">Tolerance terms and their sources.</caption>
            <thead>
              <tr>
                <th scope="col">Term</th>
                <th scope="col">Tolerance</th>
                <th scope="col">Taken off the ring</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {s.terms.map((t) => (
                <tr key={t.label}>
                  <th scope="row">{t.label}</th>
                  <td class="num">{t.tolerance}</td>
                  <td class="num">{t.contribution}</td>
                  <td>
                    {t.unverified && <span class="pill-unverified">UNVERIFIED</span>} {t.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p class="muted">No tolerance terms are included, so there is no worst case.</p>
      )}
      {s.total !== undefined && <p>Total taken off the ring: <strong>{s.total}</strong></p>}
      {s.worst !== undefined && s.worstLabel !== undefined && (
        <p>
          <strong>{s.worstLabel}:</strong> {s.worst}
        </p>
      )}
      {s.omitted.length > 0 && s.terms.length > 0 && (
        <p class="field-warning" role="note">
          <span aria-hidden="true">{'▲ '}</span>
          <strong>Not in the partial worst case:</strong> {s.omitted.join(', ')} (not supplied or not published).
        </p>
      )}
      {incomplete !== undefined && (
        <p class="field-warning" role="note">
          <span aria-hidden="true">{'▲ '}</span>
          <strong>Partial worst case.</strong> {incomplete}
        </p>
      )}
    </section>
  );
}

function ComparisonSection({ items, notPublished }: { items: readonly Comparison[]; notPublished: readonly NotPublished[] }) {
  if (items.length === 0 && notPublished.length === 0) return null;
  return (
    <section class="comparisons" aria-labelledby="cmp-h">
      <h3 id="cmp-h">Comparison with ring limits</h3>
      <p class="muted">A comparison with a figure, not an acceptance result. The text tags carry the outcome.</p>
      {notPublished.map((n) => (
        <div class="cmp" key={n.name}>
          <h4>{n.name}</h4>
          <p>
            <strong class="cmp-tag">[Not published]</strong> {n.text}.
          </p>
          <p class="muted">No margin is shown.</p>
        </div>
      ))}
      {items.map((c) => (
        <div class="cmp" key={c.name}>
          <h4>{c.kind === 'diff' ? `${c.name} (a diameter difference, not an annular ring)` : c.name}</h4>
          <p>
            Value: <strong>{c.value}</strong>. Source: {c.unverified && <span class="pill-unverified">UNVERIFIED</span>} {c.source}.
          </p>
          {c.margins.length > 0 && (
            <dl class="rows">
              {c.margins.map((m) => (
                <div class="row" key={m.label}>
                  <dt>{m.label}</dt>
                  <dd>{m.text}</dd>
                </div>
              ))}
            </dl>
          )}
          <ul class="cmp-statements">
            {c.statements.map((st) => (
              <li key={st.text}>
                <strong class="cmp-tag">[{st.tag}]</strong> {st.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Results({ view }: { view: AnnularRingView }) {
  if (view.status === 'ok') {
    return (
      <ResultsPanel
        view={view.result}
        failedCheckHint={RANGE_HINT}
        {...(view.breakout !== undefined ? { callout: view.breakout } : {})}
        afterHeadline={
          <>
            <StackUpSection s={view.stackUp} incomplete={view.incomplete} />
            <ComparisonSection items={view.comparisons} notPublished={view.notPublished} />
          </>
        }
      />
    );
  }
  if (view.status === 'error') return <ResultStatus status="error" items={view.problems} />;
  return <ResultStatus status="needs-input" items={view.needs} />;
}

interface TolProps {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly flag: boolean;
  readonly profileActive: boolean;
  readonly onText: (t: string) => void;
  readonly onFlag: (f: boolean) => void;
  readonly error: string | undefined;
  readonly prefs: ReturnType<typeof echoPrefs>;
  readonly help: string;
}

function ToleranceField(p: TolProps) {
  const checkId = `${p.id}-profile`;
  return (
    <div class="tol">
      <QuantityField
        id={p.id}
        label={p.label}
        unitHint="mm, mil or µm"
        text={p.flag ? '' : p.text}
        onText={p.onText}
        expectedDim={fieldDim('holeTol')}
        echoPrefs={p.prefs}
        help={p.help}
        disabled={p.flag}
        disabledReason="Taken from the fab profile for your scope, if it publishes it."
        externalError={p.error}
      />
      <div class="radio">
        <input
          id={checkId}
          type="checkbox"
          checked={p.flag}
          disabled={!p.profileActive && !p.flag}
          onChange={(e) => p.onFlag((e.currentTarget as HTMLInputElement).checked)}
        />
        <label for={checkId}>Use the fab profile value{p.profileActive ? '' : ' (choose a profile first)'}</label>
      </div>
      {p.flag && p.error !== undefined && (
        <p class="field-error">
          <span aria-hidden="true">{'✖ '}</span>
          <span class="visually-hidden">Error: </span>
          {p.error}
        </p>
      )}
    </div>
  );
}

/** The page for a given day (YYYY-MM-DD). The day is handed in so tests and callers control the clock; the core never reads one. */
export function AnnularRingOn({ today }: { readonly today: string }) {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<AnnularRingState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied, today), [applied, today]);
  const banner = useMemo(() => profileBanner(state, today), [state, today]);
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const widthPrefs = echoPrefs(state.units, 'width');
  const otherPrefs = echoPrefs(state.units, 'other');
  const profileActive = state.profile === 'bundled';
  const showPlating = state.holeType !== 'npth' || state.plating.trim() !== '';

  return (
    <div class="calc-layout">
      <p class="muted">
        Nominal annular ring, a worst case from the tolerances you supply (or a fab profile you choose), and a comparison with a ring minimum.
      </p>
      {banner !== undefined && <Banner b={banner} />}
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Annular ring inputs" noValidate>
          <h2>Inputs</h2>
          <RadioGroup
            name="profile"
            legend={`${PROFILE_QUESTION} (required)`}
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
          <QuantityField
            id="pad"
            label="Pad diameter"
            unitHint="mm, mil, in or µm"
            text={state.pad}
            onText={(pad) => patch({ pad })}
            expectedDim={fieldDim('pad')}
            echoPrefs={widthPrefs}
            help="Copper pad diameter. Examples: 1.0 mm, 40 mil."
            placeholder="1.0 mm"
            required
            externalError={fe.pad}
          />
          <QuantityField
            id="hole"
            label="Finished hole diameter (not the drill)"
            unitHint="mm, mil, in or µm"
            text={state.hole}
            onText={(hole) => patch({ hole })}
            expectedDim={fieldDim('hole')}
            echoPrefs={widthPrefs}
            help="The hole after plating (for an NPTH, the hole itself)."
            placeholder="0.6 mm"
            required
            externalError={fe.hole}
          />
          <RadioGroup
            name="holetype"
            legend="Hole type (required)"
            value={state.holeType}
            options={HOLE_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => {
              if (isHoleType(v)) patch({ holeType: v });
            }}
          />
          {state.holeType === '' && <p class="help">There is no default: limits differ by hole type, so choose one.</p>}
          <RadioGroup
            name="ringref"
            legend="Measure the ring to"
            value={state.ringRef}
            options={RING_REF_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => patch({ ringRef: v === '' ? '' : isRingRef(v) ? v : '' })}
          />
          <QuantityField
            id="drill"
            label={state.ringRef === 'drill' ? 'Drill diameter' : 'Drill diameter (optional)'}
            unitHint="mm, mil, in or µm"
            text={state.drill}
            onText={(drill) => patch({ drill })}
            expectedDim={fieldDim('drill')}
            echoPrefs={widthPrefs}
            help="Tool size before plating. Required for a drill-referenced ring."
            required={state.ringRef === 'drill'}
            externalError={fe.drill}
          />
          {showPlating && (
            <QuantityField
              id="plating"
              label="Plating thickness (optional, with a drill diameter)"
              unitHint="µm or mil"
              text={state.plating}
              onText={(plating) => patch({ plating })}
              expectedDim={fieldDim('plating')}
              echoPrefs={echoPrefs(state.units, 'thickness')}
              help="Only splits drill minus finished hole into plating and allowance."
              externalError={fe.plating}
            />
          )}
          <h3>Scope for fab profile lookups (optional)</h3>
          <p class="help">A profile entry is used only when it matches exactly what you give here.</p>
          <RadioGroup
            name="layercount"
            legend="Layer count"
            value={state.layerCount}
            options={LAYER_COUNT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => patch({ layerCount: v === '' ? '' : isLayerCount(v) ? v : '' })}
          />
          <QuantityField
            id="cweight"
            label="Ordered copper weight (optional)"
            unitHint="oz/ft²"
            text={state.copperWeight}
            onText={(copperWeight) => patch({ copperWeight })}
            expectedDim={fieldDim('copperWeight')}
            echoPrefs={otherPrefs}
            help="The order-form weight, for example 1 oz or 2 oz/ft2."
            placeholder="1 oz"
            externalError={fe.copperWeight}
          />
          <RadioGroup
            name="layerside"
            legend="Layer side"
            value={state.layerSide}
            options={LAYER_SIDE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => patch({ layerSide: v === '' ? '' : isLayerSide(v) ? v : '' })}
          />
          <h3>Tolerances for the worst case (optional)</h3>
          <p class="help">{TOLERANCE_HELP}</p>
          <ToleranceField
            id="holetol"
            label="Finished-hole size tolerance, plus side"
            text={state.holeTol}
            flag={state.holeTolProfile}
            profileActive={profileActive}
            onText={(holeTol) => patch({ holeTol })}
            onFlag={(holeTolProfile) => patch({ holeTolProfile })}
            error={fe.holeTol}
            prefs={widthPrefs}
            help="How much larger the finished hole may come out. Not applied to a ring measured to the drill."
          />
          <ToleranceField
            id="postol"
            label="Drill position tolerance (radial)"
            text={state.posTol}
            flag={state.posTolProfile}
            profileActive={profileActive}
            onText={(posTol) => patch({ posTol })}
            onFlag={(posTolProfile) => patch({ posTolProfile })}
            error={fe.posTol}
            prefs={widthPrefs}
            help="How far the hole centre may sit from the pad centre."
          />
          <ToleranceField
            id="padtol"
            label="Pad size tolerance (+/-)"
            text={state.padTol}
            flag={state.padTolProfile}
            profileActive={profileActive}
            onText={(padTol) => patch({ padTol })}
            onFlag={(padTolProfile) => patch({ padTolProfile })}
            error={fe.padTol}
            prefs={widthPrefs}
            help="Plus or minus on the pad diameter."
          />
          <h3>Your own ring limits (optional)</h3>
          <QuantityField
            id="minring"
            label="Your minimum ring"
            unitHint="mm, mil or µm"
            text={state.minRing}
            onText={(minRing) => patch({ minRing })}
            expectedDim={fieldDim('minRing')}
            echoPrefs={widthPrefs}
            help="Your fabricator's absolute minimum ring, if you have it."
            externalError={fe.minRing}
          />
          <QuantityField
            id="recring"
            label="Your recommended ring"
            unitHint="mm, mil or µm"
            text={state.recRing}
            onText={(recRing) => patch({ recRing })}
            expectedDim={fieldDim('recRing')}
            echoPrefs={widthPrefs}
            help="Your fabricator's recommended ring, if you have it."
            externalError={fe.recRing}
          />
          <RadioGroup
            name="units"
            legend="Echo units for what you type"
            value={state.units}
            options={[
              { value: 'metric', label: 'Metric (mm, µm)' },
              { value: 'imperial', label: 'Imperial (mil)' },
            ]}
            onChange={(v) => patch({ units: v === 'imperial' ? 'imperial' : 'metric' })}
          />
          <p class="help">Results always show mm and mil together.</p>
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
export default function AnnularRing() {
  return <AnnularRingOn today={useToday()} />;
}
