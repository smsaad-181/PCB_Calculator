import { useState } from 'preact/hooks';
import { DIM } from '../../core/units';
import { BUNDLED_LABEL, NONE_LABEL, bundledProfile, isProfileChoice } from '../calculators/fab-profile-choice';
import {
  LAYER_COUNT_CHOICES,
  LAYER_SIDE_CHOICES,
  LOSS_INTRO,
  LOSS_SOURCE_HELP,
  LOSS_TANGENT_HELP,
  PROFILE_HELP,
  PROFILE_QUESTION,
  RESISTIVITY_HELP,
  parseCopperWeight,
  parseLossTangent,
  parseResistivity,
  rawTol,
  type ExtForm,
  type ExtState,
} from '../calculators/impedance-ext.vm';
import type { TolInput } from '../calculators/tolerance-view';
import { ProfileBanner } from './ProfileBanner';
import { QuantityField } from './QuantityField';
import { RadioGroup } from './RadioGroup';
import { TextField } from './TextField';
import { ToleranceSection } from './ToleranceInputs';

interface Props {
  readonly form: ExtForm;
  readonly state: ExtState;
  readonly patch: (p: Partial<ExtState>) => void;
  /** Field errors per STATE key (a tolerance, the loss tangent, the resistivity, the scope). */
  readonly errors: Readonly<Record<string, string | undefined>>;
}

/** Scope, fab profile choice and the per-field "use the profile value" choices. Shown only for an entered width or gap. */
function ProfileControls({ form, state, patch, errors }: Props) {
  if (!form.offerProfile) return null;
  const bundled = form.profile === 'bundled';
  return (
    <div class="profile-controls">
      <RadioGroup
        name="tol-profile"
        legend={PROFILE_QUESTION}
        value={form.profile}
        options={[
          { value: 'bundled', label: BUNDLED_LABEL },
          { value: 'none', label: NONE_LABEL },
        ]}
        onChange={(v) => {
          if (isProfileChoice(v)) patch(v === 'bundled' ? { profile: v } : { profile: v, profWidth: '', profSpacing: '' });
        }}
      />
      <p class="help">{PROFILE_HELP}</p>
      {form.banner !== undefined && <ProfileBanner b={form.banner} />}
      {bundled && bundledProfile() === null && <p class="field-warning">The bundled fab profile could not be read; no profile tolerance can be applied.</p>}
      {bundled && (
        <>
          {form.flags.map((f) => (
            <div class="radio" key={f.state}>
              <input
                id={`use-profile-${f.state}`}
                type="checkbox"
                checked={f.checked}
                onChange={(e) => patch({ [f.state]: (e.currentTarget as HTMLInputElement).checked ? '1' : '' })}
              />
              <label for={`use-profile-${f.state}`}>Use the fab-profile tolerance for {f.label}</label>
            </div>
          ))}
          <h4>Scope for the fab-profile lookup</h4>
          <p class="help">A profile entry is used only when it matches exactly what you give here; no other scope is substituted.</p>
          <RadioGroup name="tol-layercount" legend="Layer count" value={state.layerCount} options={LAYER_COUNT_CHOICES} onChange={(layerCount) => patch({ layerCount })} />
          <RadioGroup name="tol-layerside" legend="Layer side" value={state.layerSide} options={LAYER_SIDE_CHOICES} onChange={(layerSide) => patch({ layerSide })} />
          <QuantityField
            id="tol-cweight"
            label="Ordered copper weight (optional)"
            unitHint="oz/ft²"
            text={state.copperWeight}
            onText={(copperWeight) => patch({ copperWeight })}
            expectedDim={DIM.AREAL_MASS}
            parser={parseCopperWeight}
            help="The order-form weight, for example 1 oz or 2 oz/ft2. Needed only when the profile publishes the tolerance per copper weight."
            placeholder="1 oz"
            externalError={errors['copperWeight']}
          />
        </>
      )}
    </div>
  );
}

/**
 * The two collapsed optional sections of an impedance page. One shared component: the tolerance fields, the fab-profile choice and
 * the loss inputs are defined by the page's view-model (impedance-ext.vm.ts), never by the page.
 */
export function ExtSections(p: Props) {
  const { form, state, patch, errors } = p;
  const [tolOpen, setTolOpen] = useState(form.hasTolerance);
  const [lossOpen, setLossOpen] = useState(form.hasLoss);
  const [profOpen, setProfOpen] = useState(form.hasProfile);
  const onTol = (core: string, t: TolInput): void => {
    const key = form.stateKeyOf[core];
    if (key !== undefined) patch({ [key]: rawTol(t) });
  };
  const tolErrors: Record<string, string> = {};
  for (const [core, key] of Object.entries(form.stateKeyOf)) {
    const e = errors[key];
    if (e !== undefined) tolErrors[core] = e;
  }
  return (
    <>
      <ToleranceSection fields={form.fields} tol={form.tol} onTol={onTol} errors={tolErrors} lockedReason={form.lockedReason} open={tolOpen} onToggle={setTolOpen}>
      </ToleranceSection>
      {form.offerProfile && (
        <details class="advanced profile-input" open={profOpen} onToggle={(e) => setProfOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>Fab profile (optional): minimum width and spacing note</summary>
          <ProfileControls form={form} state={state} patch={patch} errors={errors} />
        </details>
      )}
      <details class="advanced loss-input" open={lossOpen} onToggle={(e) => setLossOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>Loss estimate (optional)</summary>
        <p class="help">{LOSS_INTRO}</p>
        <QuantityField
          id="loss-tangent"
          label="Loss tangent tan delta"
          unitHint="plain number, no unit"
          text={state.lossTangent}
          onText={(lossTangent) => patch({ lossTangent })}
          expectedDim={DIM.DIMENSIONLESS}
          parser={parseLossTangent}
          help={LOSS_TANGENT_HELP}
          externalError={errors['lossTangent']}
        />
        <TextField
          id="loss-source"
          label="Source of the loss tangent"
          text={state.lossSource}
          onText={(lossSource) => patch({ lossSource })}
          help={LOSS_SOURCE_HELP}
          maxLength={200}
          placeholder="where tan delta came from"
          required
          externalError={errors['lossSource']}
        />
        <QuantityField
          id="resistivity"
          label="Conductor resistivity (optional override)"
          unitHint="ohm metre, Ω·m"
          text={state.resistivity}
          onText={(resistivity) => patch({ resistivity })}
          expectedDim={DIM.RESISTIVITY}
          parser={parseResistivity}
          help={RESISTIVITY_HELP}
          externalError={errors['resistivity']}
        />
      </details>
    </>
  );
}
