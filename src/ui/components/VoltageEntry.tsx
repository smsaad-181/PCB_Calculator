import { DIM } from '../../core/units';
import {
  BASIS_OPTIONS,
  SHAPE_OPTIONS,
  VOLTAGE_MODES,
  WAVEFORM_HELP,
  isBasis,
  isShape,
  isVoltageMode,
  waveformHelper,
  type VoltageState,
} from '../calculators/spacing-common.vm';
import { QuantityField } from './QuantityField';
import { RadioGroup } from './RadioGroup';
import { SelectField } from './SelectField';

interface Props {
  readonly idPrefix: string;
  readonly state: VoltageState;
  readonly patch: (p: Partial<VoltageState>) => void;
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly peak: { readonly label: string; readonly help: string; readonly required: boolean };
  readonly rms: { readonly label: string; readonly help: string; readonly required: boolean };
}

/** Working voltage: entered directly (peak and/or rms) or from a declared waveform. The peak/RMS helper line comes from the core waveform helper. */
export function VoltageEntry({ idPrefix, state, patch, fieldErrors, peak, rms }: Props) {
  const helper = waveformHelper(state);
  const waveform = state.voltageMode === 'waveform';
  return (
    <>
      <RadioGroup
        name={`${idPrefix}-vmode`}
        legend="How the working voltage is given"
        value={state.voltageMode}
        options={VOLTAGE_MODES}
        onChange={(v) => {
          if (isVoltageMode(v)) patch({ voltageMode: v });
        }}
      />
      {waveform ? (
        <>
          <SelectField
            id={`${idPrefix}-shape`}
            label="Waveform shape"
            value={state.shape}
            placeholderOption="Choose a shape"
            options={SHAPE_OPTIONS}
            required
            help={WAVEFORM_HELP}
            onChange={(v) => patch({ shape: isShape(v) ? v : '' })}
          />
          <SelectField
            id={`${idPrefix}-basis`}
            label="The value below is the"
            value={state.basis}
            placeholderOption="Choose peak or rms"
            options={BASIS_OPTIONS}
            required
            onChange={(v) => patch({ basis: isBasis(v) ? v : '' })}
          />
          <QuantityField
            id={`${idPrefix}-wave-value`}
            label="Waveform value"
            unitHint="V, mV or kV"
            text={state.waveValue}
            onText={(waveValue) => patch({ waveValue })}
            expectedDim={DIM.VOLTAGE}
            help="The peak or rms value (as chosen above) of the declared waveform, between the two conductors."
            required
            externalError={fieldErrors['waveValue']}
          />
          <p class="echo" role="status" aria-live="polite">
            {helper.text}
          </p>
        </>
      ) : (
        <>
          <QuantityField
            id={`${idPrefix}-peak`}
            label={peak.label}
            unitHint="V, mV or kV"
            text={state.peak}
            onText={(p) => patch({ peak: p })}
            expectedDim={DIM.VOLTAGE}
            help={peak.help}
            required={peak.required}
            externalError={fieldErrors['peak']}
          />
          <QuantityField
            id={`${idPrefix}-rms`}
            label={rms.label}
            unitHint="V, mV or kV"
            text={state.rms}
            onText={(r) => patch({ rms: r })}
            expectedDim={DIM.VOLTAGE}
            help={rms.help}
            required={rms.required}
            externalError={fieldErrors['rms']}
          />
        </>
      )}
    </>
  );
}
