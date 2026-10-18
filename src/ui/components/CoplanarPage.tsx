import { useMemo, useState } from 'preact/hooks';
import { MODEL_STATUS_HEADING, type CoplanarVm, type FieldName, type SolveMode } from '../calculators/coplanar.vm';
import { useToday } from '../hooks';
import { useCalcState } from '../useCalcState';
import { ErFields, ImpedanceResults, Q, SolveChoice, UnitsChoice } from './ImpedanceCommon';
import { ExtSections } from './ImpedanceExt';
import { LedgerRowBadges } from './LedgerRowBadges';
import { NoticeBanner } from './NoticeBanner';
import { ResetButton } from './ResetButton';
import { StackupEditor } from './StackupEditor';
import type { StackupScalars } from './stackup.vm';

interface Props {
  readonly vm: CoplanarVm;
  readonly stackupKey: string;
  readonly formLabel: string;
  /** Sentence above the stackup editor that says what it can and cannot supply for this model. */
  readonly stackupNote: string;
}

const LOCKED_REASON = 'Filled from the stackup below. Switch off "Use the derived values" to edit it by hand.';

/** One coplanar waveguide page. Everything shown comes from the view-model, which prints the core's own strings. */
export function CoplanarPage({ vm, stackupKey, formLabel, stackupNote }: Props) {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState({
    id: vm.CALCULATOR_ID,
    defaultState: vm.DEFAULT_STATE,
    fromHash: vm.fromHashState,
    toHash: vm.toHashState,
  });
  const today = useToday();
  const view = useMemo(() => vm.computeView(applied, today), [applied, today, vm]);
  const [locked, setLocked] = useState(false);
  const fe = 'fieldErrors' in view ? view.fieldErrors : {};
  const active = vm.activeFields(state);
  const show = (k: FieldName): boolean => active.includes(k);
  const F = vm.FIELD;

  const onUse = (use: boolean, sc: StackupScalars | null): void => {
    setLocked(use);
    if (!use) return;
    patch(
      sc === null
        ? { height: '', thickness: '', er: '', erSource: '', geometrySource: '' }
        : { height: sc.size, thickness: sc.thickness, er: sc.er, erSource: sc.erSource, geometrySource: sc.geometrySource },
    );
  };

  return (
    <div class="calc-layout">
      <p class="muted">{vm.PAGE_INTRO}</p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <section class="model-status" aria-label="Model status">
        <LedgerRowBadges heading={MODEL_STATUS_HEADING} rows={vm.modelStatusRows()} />
        <p>
          <strong>{vm.VERIFY_LINE}</strong>
        </p>
      </section>
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label={formLabel} noValidate>
          <h2>Inputs</h2>
          <SolveChoice options={vm.SOLVE_OPTIONS} value={state.solveFor} onChange={(v) => patch({ solveFor: v as SolveMode })} />
          {show('targetZ0') && (
            <Q
              id="target-z0"
              def={F.targetZ0}
              text={state.targetZ0}
              onText={(targetZ0) => patch({ targetZ0 })}
              units={state.units}
              unitHint="Ω"
              help="The impedance the line should have, for example 50 ohm. The gap or the width is solved for it."
              placeholder="50 ohm"
              required
              error={fe['targetZ0']}
            />
          )}
          {show('width') && (
            <Q
              id="width"
              def={F.width}
              text={state.width}
              onText={(width) => patch({ width })}
              units={state.units}
              unitHint="mm, mil, in or µm"
              help="Drawn width of the centre strip."
              placeholder="500 um"
              required
              error={fe['width']}
            />
          )}
          {show('gap') && (
            <Q
              id="gap"
              def={F.gap}
              text={state.gap}
              onText={(gap) => patch({ gap })}
              units={state.units}
              unitHint="mm, mil, in or µm"
              help="Edge-to-edge gap between the strip and each coplanar ground (the same on both sides). This is the clearance to the ground pour."
              placeholder="200 um"
              required
              error={fe['gap']}
            />
          )}
          <Q
            id="height"
            def={F.height}
            text={state.height}
            onText={(height) => patch({ height })}
            units={state.units}
            unitHint="mm, mil, in or µm"
            help={vm.HEIGHT_HELP}
            placeholder="500 um"
            required
            error={fe['height']}
            disabled={locked}
            disabledReason={LOCKED_REASON}
          />
          <Q
            id="thickness"
            def={F.thickness}
            text={state.thickness}
            onText={(thickness) => patch({ thickness })}
            units={state.units}
            unitHint="µm, mil or mm"
            help={vm.THICKNESS_HELP}
            placeholder="35 um"
            error={fe['thickness']}
            disabled={locked}
            disabledReason={LOCKED_REASON}
          />
          <ErFields
            er={F.er}
            source={F.erSource}
            erText={state.er}
            sourceText={state.erSource}
            onEr={(er) => patch({ er })}
            onSource={(erSource) => patch({ erSource })}
            erError={fe['er']}
            sourceError={fe['erSource']}
            locked={locked}
            lockedReason={LOCKED_REASON}
          />
          <Q
            id="frequency"
            def={F.frequency}
            text={state.frequency}
            onText={(frequency) => patch({ frequency })}
            units={state.units}
            unitHint="Hz, kHz, MHz or GHz"
            help="Optional: adds the guided wavelength. The model is quasi-static; dispersion is not modelled at any frequency."
            placeholder="1 GHz"
            error={fe['frequency']}
          />
          <Q
            id="length"
            def={F.length}
            text={state.length}
            onText={(length) => patch({ length })}
            units={state.units}
            unitHint="mm, mil, in or cm"
            help="Optional: adds the propagation delay of the line."
            placeholder="50 mm"
            error={fe['length']}
          />
          <Q
            id="mismatch"
            def={F.mismatch}
            text={state.mismatch}
            onText={(mismatch) => patch({ mismatch })}
            units={state.units}
            unitHint="mm, mil, in or cm"
            help="Optional: the length difference between two lines of the same structure. Adds the skew (ledger S-029b, UNVERIFIED)."
            placeholder="2 mm"
            error={fe['mismatch']}
          />
          <UnitsChoice value={state.units} onChange={(units) => patch({ units })} />
          <ExtSections form={vm.extForm(state, today)} state={state} patch={patch} errors={fe} />
          <p class="help" role="note">
            {stackupNote}
          </p>
          <StackupEditor kind="microstrip" storageKey={stackupKey} onUse={onUse} />
          <ResetButton onReset={reset} />
        </form>
        <section class="panel output" aria-labelledby="result-h" aria-busy={pending ? 'true' : undefined} data-pending={pending ? 'true' : undefined}>
          <h2 id="result-h">Result</h2>
          <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {vm.liveSummary(view)}
          </div>
          <ImpedanceResults view={view} />
        </section>
      </div>
    </div>
  );
}
