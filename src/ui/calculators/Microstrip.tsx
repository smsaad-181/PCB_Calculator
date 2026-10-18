import { useMemo, useState } from 'preact/hooks';
import { ErFields, ImpedanceResults, Q, SolveChoice, ThicknessChoice, UnitsChoice } from '../components/ImpedanceCommon';
import { NoticeBanner } from '../components/NoticeBanner';
import { ResetButton } from '../components/ResetButton';
import { StackupEditor } from '../components/StackupEditor';
import type { StackupScalars } from '../components/stackup.vm';
import { useCalcState } from '../useCalcState';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  FIELD,
  PAGE_INTRO,
  SOLVE_OPTIONS,
  THICKNESS_HELP,
  THICKNESS_VARIANT_LEDGER_ID,
  computeView,
  fromHashState,
  liveSummary,
  thicknessOptions,
  toHashState,
  type MicrostripState,
  type SolveFor,
} from './microstrip.vm';
import type { ThicknessModel } from '../../core/calculators/microstrip/meta';

const LOCKED_REASON = 'Filled from the stackup below. Switch off "Use the derived values" to edit it by hand.';

export default function Microstrip() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<MicrostripState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied), [applied]);
  const [locked, setLocked] = useState(false);
  const fe = 'fieldErrors' in view ? view.fieldErrors : {};
  const solveWidth = state.solveFor === 'width';

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
      <p class="muted">{PAGE_INTRO}</p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Microstrip inputs" noValidate>
          <h2>Inputs</h2>
          <SolveChoice options={SOLVE_OPTIONS} value={state.solveFor} onChange={(v) => patch({ solveFor: v as SolveFor })} />
          {solveWidth ? (
            <Q
              id="target-z0"
              def={FIELD.targetZ0}
              text={state.targetZ0}
              onText={(targetZ0) => patch({ targetZ0 })}
              units={state.units}
              unitHint="Ω"
              help="The impedance the trace should have, for example 50 ohm. The width is solved for it."
              placeholder="50 ohm"
              required
              error={fe['targetZ0']}
            />
          ) : (
            <Q
              id="width"
              def={FIELD.width}
              text={state.width}
              onText={(width) => patch({ width })}
              units={state.units}
              unitHint="mm, mil, in or µm"
              help="Drawn trace width. Examples: 0.3 mm, 12 mil."
              placeholder="0.3 mm"
              required
              error={fe['width']}
            />
          )}
          <Q
            id="height"
            def={FIELD.height}
            text={state.height}
            onText={(height) => patch({ height })}
            units={state.units}
            unitHint="mm, mil, in or µm"
            help="Dielectric thickness between the trace layer and its reference plane, from your fabricator's stackup."
            placeholder="0.2 mm"
            required
            error={fe['height']}
            disabled={locked}
            disabledReason={LOCKED_REASON}
          />
          <Q
            id="thickness"
            def={FIELD.thickness}
            text={state.thickness}
            onText={(thickness) => patch({ thickness })}
            units={state.units}
            unitHint="µm, mil or mm"
            help="Optional. The zero-thickness model ignores it (and says so); a thickness variant needs it."
            placeholder="35 um"
            error={fe['thickness']}
            disabled={locked}
            disabledReason={LOCKED_REASON}
          />
          <ErFields
            er={FIELD.er}
            source={FIELD.erSource}
            erText={state.er}
            sourceText={state.erSource}
            onEr={(er) => patch({ er })}
            onSource={(erSource) => patch({ erSource })}
            erError={fe['er']}
            sourceError={fe['erSource']}
            locked={locked}
            lockedReason={LOCKED_REASON}
          />
          <ThicknessChoice
            options={thicknessOptions()}
            value={state.thicknessModel}
            onChange={(v) => patch({ thicknessModel: v as ThicknessModel })}
            ledgerId={THICKNESS_VARIANT_LEDGER_ID}
            help={THICKNESS_HELP}
          />
          <Q
            id="frequency"
            def={FIELD.frequency}
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
            def={FIELD.length}
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
            def={FIELD.mismatch}
            text={state.mismatch}
            onText={(mismatch) => patch({ mismatch })}
            units={state.units}
            unitHint="mm, mil, in or cm"
            help="Optional: the length difference between two traces of the same structure on the same layer. Adds the skew (ledger S-029b, UNVERIFIED)."
            placeholder="2 mm"
            error={fe['mismatch']}
          />
          <UnitsChoice value={state.units} onChange={(units) => patch({ units })} />
          <StackupEditor kind="microstrip" storageKey="pcb-calc.stackup.v1.microstrip" onUse={onUse} />
          <ResetButton onReset={reset} />
        </form>
        <section class="panel output" aria-labelledby="result-h" aria-busy={pending ? 'true' : undefined} data-pending={pending ? 'true' : undefined}>
          <h2 id="result-h">Result</h2>
          <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {liveSummary(view)}
          </div>
          <ImpedanceResults view={view} />
        </section>
      </div>
    </div>
  );
}
