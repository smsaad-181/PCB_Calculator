import { useMemo } from 'preact/hooks';
import { DIM } from '../../core/units';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ChoiceField, CoatingAndMask, EditionField, InsulationField, PollutionField } from '../components/SpacingFields';
import { SpacingBanners } from '../components/SpacingBanners';
import { SpacingResults } from '../components/SpacingResults';
import { SpacingTablePanel } from '../components/SpacingTablePanel';
import { VoltageEntry } from '../components/VoltageEntry';
import { useCalcState } from '../useCalcState';
import { useSpacingTables } from '../useSpacingTables';
import {
  CALCULATOR_ID,
  CATEGORY_OPTIONS,
  DEFAULT_STATE,
  FIELD_LABEL,
  FIELD_OPTIONS,
  METHOD_TEXT,
  PAGE_INTRO,
  ROUTE_OPTIONS,
  computeView,
  fromHashState,
  liveSummary,
  toHashState,
  type ClearanceState,
} from './clearance.vm';

export default function Clearance() {
  const { tables } = useSpacingTables();
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<ClearanceState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied, tables), [applied, tables]);
  const fe = view.fieldErrors;

  return (
    <div class="calc-layout">
      <p class="muted">{PAGE_INTRO}</p>
      <SpacingBanners banners={view.banners} />
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Clearance inputs" noValidate>
          <h2>Inputs (all required unless marked optional)</h2>
          <EditionField id="cl-edition" label={FIELD_LABEL.edition} text={state.edition} onText={(edition) => patch({ edition })} help="Every table used must hold exactly this edition text. No default." />
          <InsulationField id="cl-insulation" value={state.insulation} onChange={(insulation) => patch({ insulation })} />
          <RadioGroup
            name="cl-route"
            legend="How the impulse withstand requirement is given"
            value={state.route}
            options={ROUTE_OPTIONS}
            onChange={(v) => patch({ route: v === 'impulse' ? 'impulse' : 'category' })}
          />
          {state.route === 'impulse' ? (
            <QuantityField
              id="cl-impulse"
              label={FIELD_LABEL.impulse}
              unitHint="V or kV"
              text={state.impulse}
              onText={(impulse) => patch({ impulse })}
              expectedDim={DIM.VOLTAGE}
              help="From your product standard or system design. Exactly one of this or the category route is used."
              required
              externalError={fe['impulse']}
            />
          ) : (
            <>
              <ChoiceField
                id="cl-category"
                label={FIELD_LABEL.category}
                value={state.category}
                placeholder="Choose a category"
                options={CATEGORY_OPTIONS}
                help="The meaning of categories II and III differs between public sources; your product standard decides which applies."
                onChange={(category) => patch({ category })}
              />
              <QuantityField
                id="cl-supply"
                label={FIELD_LABEL.supply}
                unitHint="V or kV"
                text={state.supply}
                onText={(supply) => patch({ supply })}
                expectedDim={DIM.VOLTAGE}
                help="The nominal supply voltage as it is the row key of your table T1. How a system voltage maps to a row is your responsibility."
                required
                externalError={fe['supply']}
              />
            </>
          )}
          <PollutionField id="cl-pollution" value={state.pollution} onChange={(pollution) => patch({ pollution })} />
          <ChoiceField
            id="cl-field"
            label={FIELD_LABEL.field}
            value={state.field}
            placeholder="Choose a field condition"
            options={FIELD_OPTIONS}
            help="No default: a homogeneous field is a statement about the electrode geometry that only you can make."
            onChange={(field) => patch({ field })}
          />
          <QuantityField
            id="cl-altitude"
            label={FIELD_LABEL.altitude}
            unitHint="m or km; 0 m for sea level"
            text={state.altitude}
            onText={(altitude) => patch({ altitude })}
            expectedDim={DIM.LENGTH}
            help="The highest altitude of use. Sea level is entered as 0 m, never assumed. Altitude scales clearance only."
            required
            externalError={fe['altitude']}
          />
          <VoltageEntry
            idPrefix="cl"
            state={state}
            patch={patch}
            fieldErrors={fe}
            peak={{ label: FIELD_LABEL.peak, help: 'The highest steady or recurring peak voltage across the insulation (DC counts as peak).', required: true }}
            rms={{ label: `${FIELD_LABEL.rms} (optional)`, help: 'Optional here; used only for the scope check recorded in table T7.', required: false }}
          />
          <QuantityField
            id="cl-frequency"
            label={FIELD_LABEL.frequency}
            unitHint="Hz, kHz or MHz; 0 Hz for DC"
            text={state.frequency}
            onText={(frequency) => patch({ frequency })}
            expectedDim={DIM.FREQUENCY}
            help="Required: above the frequency limit recorded in table T7 the IEC 60664-4 values apply instead and no number is given. Switching nodes often exceed it."
            required
            externalError={fe['frequency']}
          />
          <CoatingAndMask idPrefix="cl" coating={state.coating} soldermask={state.soldermask} onCoating={(coating) => patch({ coating })} onMask={(soldermask) => patch({ soldermask })} />
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
