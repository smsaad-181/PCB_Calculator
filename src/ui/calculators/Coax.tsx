import { useMemo } from 'preact/hooks';
import { ErFields, ImpedanceResults, Q, SolveChoice, UnitsChoice } from '../components/ImpedanceCommon';
import { NoticeBanner } from '../components/NoticeBanner';
import { ResetButton } from '../components/ResetButton';
import { useCalcState } from '../useCalcState';
import { CALCULATOR_ID, DEFAULT_STATE, FIELD, PAGE_INTRO, SOLVE_OPTIONS, computeView, fromHashState, liveSummary, toHashState, type CoaxState, type SolveFor } from './coax.vm';

export default function Coax() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<CoaxState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied), [applied]);
  const fe = 'fieldErrors' in view ? view.fieldErrors : {};
  const needsTarget = state.solveFor !== 'z0';
  const needsOuter = state.solveFor !== 'outer';
  const needsInner = state.solveFor !== 'inner';

  return (
    <div class="calc-layout">
      <p class="muted">{PAGE_INTRO}</p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Coaxial line inputs" noValidate>
          <h2>Inputs</h2>
          <SolveChoice options={SOLVE_OPTIONS} value={state.solveFor} onChange={(v) => patch({ solveFor: v as SolveFor })} />
          {needsTarget && (
            <Q
              id="target-z0"
              def={FIELD.targetZ0}
              text={state.targetZ0}
              onText={(targetZ0) => patch({ targetZ0 })}
              units={state.units}
              unitHint="Ω"
              help="The impedance the line should have, for example 50 ohm. The other diameter is solved for it."
              placeholder="50 ohm"
              required
              error={fe['targetZ0']}
            />
          )}
          {needsOuter && (
            <Q
              id="outer-diameter"
              def={FIELD.outerDiameter}
              text={state.outerDiameter}
              onText={(outerDiameter) => patch({ outerDiameter })}
              units={state.units}
              unitHint="mm, mil, in or µm"
              help="The inside diameter of the outer conductor. Radii give the same ratio, so enter both as diameters or both as radii."
              placeholder="4 mm"
              required
              error={fe['outerDiameter']}
            />
          )}
          {needsInner && (
            <Q
              id="inner-diameter"
              def={FIELD.innerDiameter}
              text={state.innerDiameter}
              onText={(innerDiameter) => patch({ innerDiameter })}
              units={state.units}
              unitHint="mm, mil, in or µm"
              help="The outside diameter of the centre conductor. It must be smaller than the outer diameter."
              placeholder="1 mm"
              required
              error={fe['innerDiameter']}
            />
          )}
          <ErFields
            er={FIELD.er}
            source={FIELD.erSource}
            erText={state.er}
            sourceText={state.erSource}
            onEr={(er) => patch({ er })}
            onSource={(erSource) => patch({ erSource })}
            erError={fe['er']}
            sourceError={fe['erSource']}
            locked={false}
            lockedReason=""
            erHelp="No default and no example: enter the relative permittivity of the line's dielectric from its datasheet or your cable specification, at your frequency. It varies with material and frequency, and this page does not pick one for you."
          />
          <Q
            id="frequency"
            def={FIELD.frequency}
            text={state.frequency}
            onText={(frequency) => patch({ frequency })}
            units={state.units}
            unitHint="Hz, kHz, MHz or GHz"
            help="Optional: adds the guided wavelength. The upper frequency limit of the TEM model is not computed."
            placeholder="1 GHz"
            error={fe['frequency']}
          />
          <Q
            id="length"
            def={FIELD.length}
            text={state.length}
            onText={(length) => patch({ length })}
            units={state.units}
            unitHint="mm, mil, in, cm or m"
            help="Optional: adds the propagation delay of the cable."
            placeholder="1 m"
            error={fe['length']}
          />
          <Q
            id="mismatch"
            def={FIELD.mismatch}
            text={state.mismatch}
            onText={(mismatch) => patch({ mismatch })}
            units={state.units}
            unitHint="mm, mil, in or cm"
            help="Optional: the length difference between two cables of the same type. Adds the skew (ledger S-029b, UNVERIFIED)."
            placeholder="5 mm"
            error={fe['mismatch']}
          />
          <UnitsChoice value={state.units} onChange={(units) => patch({ units })} />
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
