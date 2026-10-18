import { useMemo, useState } from 'preact/hooks';
import { MODEL_STATUS_HEADING, THICKNESS_IGNORED_HELP, type DiffVm, type FieldName, type SolveMode } from '../calculators/diff.vm';
import { useCalcState } from '../useCalcState';
import { PresetComparison, PresetPicker, TerminationNotes } from './DiffPresets';
import { ErFields, ImpedanceResults, Q, SolveChoice, UnitsChoice } from './ImpedanceCommon';
import { LedgerRowBadges } from './LedgerRowBadges';
import { NoticeBanner } from './NoticeBanner';
import { ResetButton } from './ResetButton';
import { StackupEditor } from './StackupEditor';
import type { StackupScalars } from './stackup.vm';

interface Props {
  readonly vm: DiffVm;
  readonly kind: 'microstrip' | 'stripline';
  readonly stackupKey: string;
  readonly formLabel: string;
  readonly examples: { readonly width: string; readonly spacing: string; readonly size: string };
}

const LOCKED_REASON = 'Filled from the stackup below. Switch off "Use the derived values" to edit it by hand.';

/** One edge-coupled differential page. Everything shown comes from the view-model, which prints the core's own strings. */
export function DiffPage({ vm, kind, stackupKey, formLabel, examples }: Props) {
  const { state, setState, applied, pending, notices, setNotices, patch, reset } = useCalcState({
    id: vm.CALCULATOR_ID,
    defaultState: vm.DEFAULT_STATE,
    fromHash: vm.fromHashState,
    toHash: vm.toHashState,
  });
  const view = useMemo(() => vm.computeView(applied), [applied, vm]);
  const [locked, setLocked] = useState(false);
  const fe = 'fieldErrors' in view ? view.fieldErrors : {};
  const active = vm.activeFields(state);
  const show = (k: FieldName): boolean => active.includes(k);
  const F = vm.FIELD;
  const livePreset = useMemo(() => vm.computeView(state).preset, [state, vm]);

  const onUse = (use: boolean, sc: StackupScalars | null): void => {
    setLocked(use);
    if (!use) return;
    patch(
      sc === null
        ? { size: '', thickness: '', er: '', erSource: '', geometrySource: '' }
        : { size: sc.size, thickness: sc.thickness, er: sc.er, erSource: sc.erSource, geometrySource: sc.geometrySource },
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
          <SolveChoice options={vm.SOLVE_OPTIONS} value={state.solveFor} onChange={(v) => setState((s) => vm.chooseSolve(s, v as SolveMode))} />
          {show('targetZ') && (
            <Q
              id="target-zdiff"
              def={F.targetZ}
              text={state.targetZ}
              onText={(targetZ) => patch({ targetZ })}
              units={state.units}
              unitHint="Ω"
              help="The differential impedance the pair should have, for example 90 ohm. Or choose a protocol preset below to fill it."
              placeholder="90 ohm"
              required
              error={fe['targetZ']}
            />
          )}
          {show('targetZ') && livePreset.targetLine !== undefined && (
            <p class="help" role="note">
              {livePreset.targetLine}
            </p>
          )}
          {show('width') && (
            <Q
              id="width"
              def={F.width}
              text={state.width}
              onText={(width) => patch({ width })}
              units={state.units}
              unitHint="mm, mil, in or µm"
              help="Drawn width of each trace of the pair."
              placeholder={examples.width}
              required
              error={fe['width']}
            />
          )}
          {show('spacing') && (
            <Q
              id="spacing"
              def={F.spacing}
              text={state.spacing}
              onText={(spacing) => patch({ spacing })}
              units={state.units}
              unitHint="mm, mil, in or µm"
              help="Gap between the facing edges of the two traces (not centre to centre)."
              placeholder={examples.spacing}
              required
              error={fe['spacing']}
            />
          )}
          <Q
            id="size"
            def={F.size}
            text={state.size}
            onText={(size) => patch({ size })}
            units={state.units}
            unitHint="mm, mil, in or µm"
            help={vm.SIZE_HELP}
            placeholder={examples.size}
            required
            error={fe['size']}
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
            help={THICKNESS_IGNORED_HELP}
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
            help="Optional: adds the guided wavelength per mode. The model is quasi-static; dispersion is not modelled at any frequency."
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
            help="Optional: adds the propagation delay per mode."
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
            help="Optional: the length difference between the two traces of the pair. Adds the intra-pair skew (ledger S-029b, UNVERIFIED)."
            placeholder="0.5 mm"
            error={fe['mismatch']}
          />
          <UnitsChoice value={state.units} onChange={(units) => patch({ units })} />
          <PresetPicker
            preset={state.preset}
            tolerance={state.tolerance}
            view={livePreset}
            onPreset={(id) => setState((s) => vm.choosePreset(s, id))}
            onTolerance={(tolerance) => patch({ tolerance })}
          />
          <TerminationNotes />
          <StackupEditor kind={kind} storageKey={stackupKey} onUse={onUse} />
          <ResetButton onReset={reset} />
        </form>
        <section class="panel output" aria-labelledby="result-h" aria-busy={pending ? 'true' : undefined} data-pending={pending ? 'true' : undefined}>
          <h2 id="result-h">Result</h2>
          <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {vm.liveSummary(view)}
          </div>
          <ImpedanceResults view={view} extra={<PresetComparison view={view.preset} />} />
        </section>
      </div>
    </div>
  );
}
