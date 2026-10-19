import { useMemo } from 'preact/hooks';
import { DIM } from '../../core/units';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ChoiceField, EditionField } from '../components/SpacingFields';
import { SpacingBanners } from '../components/SpacingBanners';
import { SpacingResults } from '../components/SpacingResults';
import { SpacingTablePanel } from '../components/SpacingTablePanel';
import { VoltageEntry } from '../components/VoltageEntry';
import { useCalcState } from '../useCalcState';
import { useSpacingTables } from '../useSpacingTables';
import {
  CALCULATOR_ID,
  COATING_OPTIONS,
  DEFAULT_STATE,
  ELEVATION_OPTIONS,
  FIELD_LABEL,
  GUIDELINE_LABEL,
  KIND_OPTIONS,
  LOCATION_OPTIONS,
  METHOD_TEXT,
  PAGE_INTRO,
  computeView,
  fromHashState,
  liveSummary,
  toHashState,
  usesElevation,
  type IpcSpacingState,
} from './ipc-spacing.vm';

export default function IpcSpacing() {
  const { tables } = useSpacingTables();
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<IpcSpacingState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied, tables), [applied, tables]);
  const fe = view.fieldErrors;
  const external = state.location === 'external';

  return (
    <div class="calc-layout">
      <p class="muted">{PAGE_INTRO}</p>
      <p class="guideline-label">
        <strong>{GUIDELINE_LABEL}</strong>
      </p>
      <SpacingBanners banners={view.banners} />
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="IPC-2221 spacing inputs" noValidate>
          <h2>Inputs (all required unless marked optional)</h2>
          <EditionField id="ipc-edition" label={FIELD_LABEL.edition} text={state.edition} onText={(edition) => patch({ edition })} help="The table must hold exactly this edition text. No default." />
          <VoltageEntry
            idPrefix="ipc"
            state={state}
            patch={patch}
            fieldErrors={fe}
            peak={{ label: FIELD_LABEL.peak, help: 'The highest voltage between the two conductors (DC or AC peak).', required: true }}
            rms={{ label: `${FIELD_LABEL.rms} (optional)`, help: 'Optional; echoed only.', required: false }}
          />
          <ChoiceField
            id="ipc-location"
            label={FIELD_LABEL.location}
            value={state.location}
            placeholder="Choose a location"
            options={LOCATION_OPTIONS}
            help="Internal conductors ignore the kind, coating and elevation choices."
            onChange={(location) => patch({ location })}
          />
          {external && (
            <>
              <ChoiceField id="ipc-kind" label={FIELD_LABEL.kind} value={state.kind} placeholder="Choose a conductor kind" options={KIND_OPTIONS} onChange={(kind) => patch({ kind })} />
              <ChoiceField
                id="ipc-coating"
                label={FIELD_LABEL.coating}
                value={state.coating}
                placeholder="Choose a coating"
                options={COATING_OPTIONS}
                help="Selects a column of your table T8. This app adds no credit of its own."
                onChange={(coating) => patch({ coating })}
              />
            </>
          )}
          {usesElevation(state) && (
            <>
              <RadioGroup
                name="ipc-elevation-mode"
                legend="Elevation of the uncoated external conductors"
                value={state.elevationMode}
                options={ELEVATION_OPTIONS}
                onChange={(v) => patch({ elevationMode: v === 'vacuum' ? 'vacuum' : 'height' })}
              />
              {state.elevationMode === 'height' && (
                <QuantityField
                  id="ipc-elevation"
                  label={FIELD_LABEL.elevation}
                  unitHint="m or km; 0 m for sea level"
                  text={state.elevation}
                  onText={(elevation) => patch({ elevation })}
                  expectedDim={DIM.LENGTH}
                  help="Sea level is entered as 0 m, never assumed. It is compared with the breakpoint recorded in your table T8."
                  required
                  externalError={fe['elevation']}
                />
              )}
            </>
          )}
          <ResetButton onReset={reset} />
        </form>
        <section class="panel output" aria-labelledby="result-h" aria-busy={pending ? 'true' : undefined} data-pending={pending ? 'true' : undefined}>
          <h2 id="result-h">Result</h2>
          <p class="method-line">{METHOD_TEXT}</p>
          <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {liveSummary(view)}
          </div>
          <SpacingResults view={view} />
        </section>
      </div>
      <SpacingTablePanel />
    </div>
  );
}
