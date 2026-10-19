import {
  COATING_CREDIT_OPTIONS,
  COATING_HELP,
  INSULATION_HELP,
  INSULATION_OPTIONS,
  POLLUTION_OPTIONS,
  SOLDERMASK_LABEL,
  isInsulation,
  isPollution,
  type PollutionText,
} from '../calculators/spacing-common.vm';
import { isCoating } from '../calculators/spacing-state';
import type { CoatingCredit, InsulationType } from '../../core/spacing/gating';
import { SelectField } from './SelectField';

/** Free-text edition field shared by the three spacing pages. No default: the table must hold exactly this text. */
export function EditionField({ id, label, text, onText, help }: { id: string; label: string; text: string; onText: (t: string) => void; help: string }) {
  return (
    <div class="field">
      <label for={id}>
        {label} <span class="req"> required</span>
      </label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellcheck={false}
        maxLength={200}
        value={text}
        placeholder="edition text of your licensed copy"
        aria-describedby={`${id}-help`}
        onInput={(e) => onText((e.currentTarget as HTMLInputElement).value)}
      />
      <p id={`${id}-help`} class="help">
        {help}
      </p>
    </div>
  );
}

/** A choice with no default selection: an unknown value means "not chosen". */
export function ChoiceField<T extends string>(p: {
  id: string;
  label: string;
  value: T | '';
  options: readonly { value: T; label: string }[];
  placeholder: string;
  help?: string;
  onChange: (v: T | '') => void;
}) {
  return (
    <SelectField
      id={p.id}
      label={p.label}
      value={p.value}
      placeholderOption={p.placeholder}
      options={p.options}
      required
      {...(p.help !== undefined ? { help: p.help } : {})}
      onChange={(v) => p.onChange(p.options.find((o) => o.value === v)?.value ?? '')}
    />
  );
}

export function InsulationField({ id, value, onChange }: { id: string; value: '' | InsulationType; onChange: (v: '' | InsulationType) => void }) {
  return <ChoiceField id={id} label="Insulation type" value={value} options={INSULATION_OPTIONS} placeholder="Choose an insulation type" help={INSULATION_HELP} onChange={(v) => onChange(isInsulation(v) ? v : '')} />;
}

export function PollutionField({ id, value, onChange }: { id: string; value: PollutionText; onChange: (v: PollutionText) => void }) {
  return (
    <ChoiceField
      id={id}
      label="Pollution degree"
      value={value}
      options={POLLUTION_OPTIONS}
      placeholder="Choose a pollution degree"
      help="The micro-environment of the insulation. Solder mask does not change it."
      onChange={(v) => onChange(isPollution(v) ? v : '')}
    />
  );
}

/** Coating credit choice and the solder-mask declaration (both only add notes unless a verified T7 record applies). */
export function CoatingAndMask(p: { idPrefix: string; coating: CoatingCredit; soldermask: boolean; onCoating: (c: CoatingCredit) => void; onMask: (b: boolean) => void }) {
  return (
    <>
      <SelectField
        id={`${p.idPrefix}-coating`}
        label="Coating credit"
        value={p.coating}
        options={COATING_CREDIT_OPTIONS}
        help={COATING_HELP}
        onChange={(v) => p.onCoating(isCoating(v) ? v : 'none')}
      />
      <div class="field checkbox">
        <input id={`${p.idPrefix}-soldermask`} type="checkbox" checked={p.soldermask} onChange={(e) => p.onMask((e.currentTarget as HTMLInputElement).checked)} />
        <label for={`${p.idPrefix}-soldermask`}>{SOLDERMASK_LABEL}</label>
      </div>
    </>
  );
}
