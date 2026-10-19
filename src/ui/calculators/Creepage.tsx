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
  DEFAULT_STATE,
  FIELD_LABEL,
  GROOVE_OPTIONS,
  GROUP_OPTIONS,
  MATERIAL_ROUTE_OPTIONS,
  METHOD_TEXT,
  PAGE_INTRO,
  SURFACE_OPTIONS,
  computeView,
  fromHashState,
  liveSummary,
  toHashState,
  type CreepageState,
} from './creepage.vm';
import { SelectField } from '../components/SelectField';

export default function Creepage() {
  const { tables } = useSpacingTables();
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<CreepageState>({
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
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Creepage inputs" noValidate>
          <h2>Inputs (all required unless marked optional)</h2>
          <EditionField id="cr-edition" label={FIELD_LABEL.edition} text={state.edition} onText={(edition) => patch({ edition })} help="Every table used must hold exactly this edition text. No default." />
          <InsulationField id="cr-insulation" value={state.insulation} onChange={(insulation) => patch({ insulation })} />
          <VoltageEntry
            idPrefix="cr"
            state={state}
            patch={patch}
            fieldErrors={fe}
            peak={{ label: `${FIELD_LABEL.peak} (optional)`, help: 'Optional here; used only for the scope check recorded in table T7.', required: false }}
            rms={{ label: FIELD_LABEL.rms, help: 'The RMS voltage across the insulation over a long period. Creepage is driven by RMS, never by peak.', required: true }}
          />
          <PollutionField id="cr-pollution" value={state.pollution} onChange={(pollution) => patch({ pollution })} />
          <RadioGroup
            name="cr-material"
            legend="How the material is given"
            value={state.materialRoute}
            options={MATERIAL_ROUTE_OPTIONS}
            onChange={(v) => patch({ materialRoute: v === 'cti' ? 'cti' : 'group' })}
          />
          {state.materialRoute === 'cti' ? (
            <QuantityField
              id="cr-cti"
              label={FIELD_LABEL.cti}
              unitHint="V"
              text={state.cti}
              onText={(cti) => patch({ cti })}
              expectedDim={DIM.VOLTAGE}
              help="From the laminate data sheet. The group is read from your table T6; give the group or the CTI, not both."
              required
              externalError={fe['cti']}
            />
          ) : (
            <ChoiceField
              id="cr-group"
              label={FIELD_LABEL.group}
              value={state.group}
              placeholder="Choose a material group"
              options={GROUP_OPTIONS}
              help="Never assumed: a PCB laminate's group comes from its CTI data."
              onChange={(group) => patch({ group })}
            />
          )}
          <ChoiceField
            id="cr-surface"
            label={FIELD_LABEL.surface}
            value={state.surface}
            placeholder="Choose a surface"
            options={SURFACE_OPTIONS}
            help="Used only if your table T5 has separate columns for it."
            onChange={(surface) => patch({ surface })}
          />
          <QuantityField
            id="cr-associated"
            label={FIELD_LABEL.associated}
            unitHint="mm, mil or um"
            text={state.associated}
            onText={(associated) => patch({ associated })}
            expectedDim={DIM.LENGTH}
            help="The clearance for the same pair, for example from the clearance page. Creepage is never less than it."
            required
            externalError={fe['associated']}
          />
          <QuantityField
            id="cr-frequency"
            label={FIELD_LABEL.frequency}
            unitHint="Hz, kHz or MHz; 0 Hz for DC"
            text={state.frequency}
            onText={(frequency) => patch({ frequency })}
            expectedDim={DIM.FREQUENCY}
            help="Required: above the frequency limit recorded in table T7 the IEC 60664-4 values apply instead and no number is given."
            required
            externalError={fe['frequency']}
          />
          <SelectField
            id="cr-grooves"
            label="Grooves, slots or ribs"
            value={state.grooves}
            options={GROOVE_OPTIONS}
            help="No credit is given for grooves, slots or ribs in this version; declaring them adds a warning."
            onChange={(v) => patch({ grooves: GROOVE_OPTIONS.find((o) => o.value === v)?.value ?? 'none' })}
          />
          <CoatingAndMask idPrefix="cr" coating={state.coating} soldermask={state.soldermask} onCoating={(coating) => patch({ coating })} onMask={(soldermask) => patch({ soldermask })} />
          <QuantityField
            id="cr-altitude"
            label={`${FIELD_LABEL.altitude} (optional)`}
            unitHint="m or km"
            text={state.altitude}
            onText={(altitude) => patch({ altitude })}
            expectedDim={DIM.LENGTH}
            help="Altitude never changes creepage: if you enter it, the result says it was ignored."
            externalError={fe['altitude']}
          />
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
