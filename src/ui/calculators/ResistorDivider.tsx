import { useMemo } from 'preact/hooks';
import { DividerSchematic } from '../components/DividerSchematic';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { ResultStatus } from '../components/ResultStatus';
import { ResultsPanel } from '../components/ResultsPanel';
import { SelectField } from '../components/SelectField';
import { useCalcState } from '../useCalcState';
import { DIVIDER_SERIES, NEAREST_NOTE, SNAP_CHOICES, isDividerSeries, isSnapChoice, parseToleranceField } from './circuit-choices';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  METHOD_TEXT,
  R1_NAME,
  R2_NAME,
  RANGE_HINT,
  SOLVE_OPTIONS,
  computeView,
  fieldDim,
  fromHashState,
  isSolveFor,
  liveSummary,
  schematicDescription,
  snapApplies,
  toHashState,
  type DividerState,
  type DividerView,
  type EnvelopeView,
  type FieldErrors,
} from './resistor-divider.vm';

function Envelope({ env }: { env: EnvelopeView }) {
  return (
    <section class="envelope" aria-labelledby="env-h">
      <h3 id="env-h">{env.label}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Minimum</th>
              <th scope="col">Typical</th>
              <th scope="col">Maximum</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{env.min}</td>
              <td>{env.typ}</td>
              <td>{env.max}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted">{env.note}</p>
    </section>
  );
}

function Results({ view }: { view: DividerView }) {
  if (view.status === 'ok') {
    return <ResultsPanel view={view.result} failedCheckHint={RANGE_HINT} {...(view.envelope !== undefined ? { afterHeadline: <Envelope env={view.envelope} /> } : {})} />;
  }
  if (view.status === 'error') return <ResultStatus status="error" items={view.problems} />;
  return <ResultStatus status="needs-input" items={view.needs} />;
}

export default function ResistorDivider() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<DividerState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied), [applied]);
  const fe: FieldErrors = 'fieldErrors' in view ? view.fieldErrors : {};
  const sf = state.solveFor;
  const solvingResistor = snapApplies(sf);
  const withLoad = state.load.trim() !== '';

  return (
    <div class="calc-layout">
      <p class="muted">
        Output of a two-resistor divider (Vin, R1 on top, R2 at the bottom), or the resistor needed for a target output, with an optional load, initial-tolerance corners and E-series
        snapping. Ideal resistors, DC.
      </p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Resistor divider inputs" noValidate>
          <h2>Inputs</h2>
          <DividerSchematic withLoad={withLoad} unknown={sf} description={schematicDescription(withLoad, sf)} />
          <RadioGroup
            name="solvefor"
            legend="Solve for"
            value={sf}
            options={SOLVE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => {
              if (isSolveFor(v)) patch({ solveFor: v });
            }}
          />
          <QuantityField
            id="vin"
            label="Input voltage (Vin)"
            unitHint="V, mV or kV"
            text={state.vin}
            onText={(vin) => patch({ vin })}
            expectedDim={fieldDim('vin')}
            help="Examples: 12 V, 3.3 V. An ideal source is assumed."
            placeholder="12 V"
            required
            externalError={fe.vin}
          />
          {sf !== 'r1' && (
            <QuantityField
              id="r1"
              label={R1_NAME}
              unitHint="Ω, kΩ, MΩ or a code such as 4k7"
              text={state.r1}
              onText={(r1) => patch({ r1 })}
              expectedDim={fieldDim('r1')}
              help="The resistor between Vin and the output node. Examples: 10k, 4.7 kΩ, 4k7."
              placeholder="10 kΩ"
              required
              externalError={fe.r1}
            />
          )}
          {sf !== 'r2' && (
            <QuantityField
              id="r2"
              label={R2_NAME}
              unitHint="Ω, kΩ, MΩ or a code such as 4k7"
              text={state.r2}
              onText={(r2) => patch({ r2 })}
              expectedDim={fieldDim('r2')}
              help="The resistor between the output node and ground. Examples: 10k, 4.7 kΩ, 4k7."
              placeholder="4.7 kΩ"
              required
              externalError={fe.r2}
            />
          )}
          {solvingResistor && (
            <QuantityField
              id="target"
              label="Target output voltage (Vout)"
              unitHint="V or mV"
              text={state.target}
              onText={(target) => patch({ target })}
              expectedDim={fieldDim('target')}
              help="Must be below Vin. Examples: 3.3 V, 1.8 V."
              placeholder="3.3 V"
              required
              externalError={fe.target}
            />
          )}
          {solvingResistor && (
            <>
              <SelectField
                id="series"
                label="Snap the solved resistor to a series"
                value={state.series}
                options={DIVIDER_SERIES.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => {
                  if (isDividerSeries(v)) patch({ series: v });
                }}
                help="None gives the exact value. E24, E96 and E192 pick a stock value; those lists are not yet checked against IEC 60063."
              />
              {state.series !== 'none' && (
                <SelectField
                  id="snap"
                  label="Snap direction"
                  value={state.snap}
                  options={SNAP_CHOICES.map((o) => ({ value: o.value, label: o.label }))}
                  onChange={(v) => {
                    if (isSnapChoice(v)) patch({ snap: v });
                  }}
                  help={`${NEAREST_NOTE} Up or down picks the next stock value above or below it.`}
                />
              )}
            </>
          )}
          <QuantityField
            id="load"
            label="Load resistance RL (optional)"
            unitHint="Ω, kΩ, MΩ or a code such as 100k"
            text={state.load}
            onText={(load) => patch({ load })}
            expectedDim={fieldDim('load')}
            help="A resistor from the output node to ground, in parallel with R2. Empty means no load."
            placeholder="100 kΩ"
            externalError={fe.load}
          />
          <QuantityField
            id="tolerance"
            label="Resistor tolerance (optional)"
            unitHint="percent, for example 1%"
            text={state.tolerance}
            onText={(tolerance) => patch({ tolerance })}
            expectedDim={fieldDim('vin')}
            parser={parseToleranceField}
            help="Write 1% or 0.01. Gives a minimum and maximum output voltage. Empty means no tolerance."
            placeholder="1%"
            externalError={fe.tolerance}
          />
          {withLoad && (
            <QuantityField
              id="ltol"
              label="Load tolerance (optional)"
              unitHint="percent, for example 5%"
              text={state.loadTolerance}
              onText={(loadTolerance) => patch({ loadTolerance })}
              expectedDim={fieldDim('vin')}
              parser={parseToleranceField}
              help="Write 5% or 0.05. Adds the load to the initial-tolerance corners. Empty means the load is exact."
              placeholder="5%"
              externalError={fe.loadTolerance}
            />
          )}
          <QuantityField
            id="vtol"
            label="Input voltage tolerance (optional)"
            unitHint="percent, for example 5%"
            text={state.vinTolerance}
            onText={(vinTolerance) => patch({ vinTolerance })}
            expectedDim={fieldDim('vin')}
            parser={parseToleranceField}
            help="Write 5% or 0.05. Empty means Vin is exact."
            placeholder="5%"
            externalError={fe.vinTolerance}
          />
          <QuantityField
            id="ratedv"
            label="Rated working voltage of the resistors (optional)"
            unitHint="V"
            text={state.ratedVoltage}
            onText={(ratedVoltage) => patch({ ratedVoltage })}
            expectedDim={fieldDim('ratedVoltage')}
            help="From the resistor datasheet, for example 75 V. Compared with the voltage across each resistor. Empty means the voltage rating is not checked."
            placeholder="75 V"
            externalError={fe.ratedVoltage}
          />
          <ResetButton onReset={reset} />
        </form>
        <section class="panel output" aria-labelledby="result-h" aria-busy={pending ? 'true' : undefined} data-pending={pending ? 'true' : undefined}>
          <h2 id="result-h">Result</h2>
          <p class="method-line">{METHOD_TEXT}</p>
          <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {liveSummary(view)}
          </div>
          <Results view={view} />
        </section>
      </div>
    </div>
  );
}
