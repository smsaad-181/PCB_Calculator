import { useMemo } from 'preact/hooks';
import { DIM } from '../../core/units';
import { ImpedanceResults, Q, UnitsChoice } from '../components/ImpedanceCommon';
import { NoticeBanner } from '../components/NoticeBanner';
import { QuantityField } from '../components/QuantityField';
import { RadioGroup } from '../components/RadioGroup';
import { ResetButton } from '../components/ResetButton';
import { TextField } from '../components/TextField';
import { useCalcState } from '../useCalcState';
import { parseNumberField } from './impedance.vm';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  EPS_HELP,
  EPS_LABEL,
  FIELD,
  MODE_NOTE,
  MODE_OPTIONS,
  PAGE_INTRO,
  SOURCE_HELP,
  computeView,
  fromHashState,
  liveSummary,
  toHashState,
  type QuarterWaveState,
} from './quarter-wave.vm';

const parseEps = (t: string) => parseNumberField(t, 'effective permittivity');

export default function QuarterWave() {
  const { state, applied, pending, notices, setNotices, patch, reset } = useCalcState<QuarterWaveState>({
    id: CALCULATOR_ID,
    defaultState: DEFAULT_STATE,
    fromHash: fromHashState,
    toHash: toHashState,
  });
  const view = useMemo(() => computeView(applied), [applied]);
  const fe = 'fieldErrors' in view ? view.fieldErrors : {};
  const byLength = state.mode === 'length';

  return (
    <div class="calc-layout">
      <p class="muted">{PAGE_INTRO}</p>
      <NoticeBanner notices={notices} onDismiss={() => setNotices([])} />
      <div class="calc-grid">
        <form class="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="Quarter-wave inputs" noValidate>
          <h2>Inputs</h2>
          <RadioGroup name="qw-mode" legend="What is given" value={state.mode} options={MODE_OPTIONS} onChange={(v) => patch({ mode: v === 'length' ? 'length' : 'frequency' })} />
          <p class="help">{MODE_NOTE}</p>
          <QuantityField
            id="eps-eff"
            label={EPS_LABEL}
            unitHint="plain number, no unit"
            text={state.epsEff}
            onText={(epsEff) => patch({ epsEff })}
            expectedDim={DIM.DIMENSIONLESS}
            parser={parseEps}
            help={EPS_HELP}
            required
            externalError={fe['epsEff']}
          />
          {byLength ? (
            <Q
              id="length"
              def={FIELD.length}
              text={state.length}
              onText={(length) => patch({ length })}
              units={state.units}
              unitHint="mm, mil, in or cm"
              help="The metal length of the stub, measured along the trace. The result is the frequency at which it is a quarter of the guided wavelength."
              required
              error={fe['length']}
            />
          ) : (
            <Q
              id="frequency"
              def={FIELD.frequency}
              text={state.frequency}
              onText={(frequency) => patch({ frequency })}
              units={state.units}
              unitHint="Hz, kHz, MHz or GHz"
              help="The frequency at which the stub should be a quarter wave. eps_eff should be the value for this frequency."
              required
              error={fe['frequency']}
            />
          )}
          <TextField
            id="eps-source"
            label={FIELD.epsEffSource.label}
            text={state.epsEffSource}
            onText={(epsEffSource) => patch({ epsEffSource })}
            help={SOURCE_HELP}
            maxLength={200}
            placeholder="where eps_eff came from"
            externalError={fe['epsEffSource']}
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
