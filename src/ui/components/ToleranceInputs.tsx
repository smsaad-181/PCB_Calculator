import type { ComponentChildren } from 'preact';
import { DIM, type DisplayPrefs } from '../../core/units';
import {
  THICKNESS_CHOICE_NEEDS_WEIGHT,
  THICKNESS_LEGEND,
  isThicknessMode,
  parseSide,
  toggleAsym,
  type ThicknessMode,
  type ThicknessOption,
  type TolFieldDef,
  type TolInput,
  type TolState,
  EMPTY_TOL,
} from '../calculators/tolerance-view';
import { QuantityField } from './QuantityField';
import { RadioGroup } from './RadioGroup';

interface FieldProps {
  readonly def: TolFieldDef;
  readonly value: TolInput;
  readonly onChange: (t: TolInput) => void;
  readonly error: string | undefined;
  readonly prefs: DisplayPrefs | undefined;
  readonly disabledReason?: string;
}

const PERCENT_HINT = 'percent, for example 5%';
const DIFFERENCE_HINT = 'K or °C, as a difference';

/** One tolerance: a single "plus and minus" value, or a separate minus and plus side. */
function ToleranceField({ def, value, onChange, error, prefs, disabledReason }: FieldProps) {
  const relative = def.kind === 'relative';
  const dim = relative ? DIM.DIMENSIONLESS : DIM.TEMPERATURE_DIFFERENCE;
  const hint = relative ? PERCENT_HINT : DIFFERENCE_HINT;
  const parser = (t: string) => parseSide(t, def.kind, prefs);
  const locked = disabledReason !== undefined;
  const minusError = error !== undefined && error.includes('minus') ? error : undefined;
  const plusError = error !== undefined && minusError === undefined ? error : undefined;
  return (
    <fieldset class="tol-field">
      <legend>{def.label} tolerance</legend>
      {!value.asym || locked ? (
        <QuantityField
          id={def.id}
          label="Plus and minus (±)"
          unitHint={hint}
          text={value.both}
          onText={(both) => onChange({ ...value, both })}
          expectedDim={dim}
          parser={parser}
          help={def.help}
          placeholder={relative ? '5%' : '5 K'}
          disabled={locked}
          {...(locked ? { disabledReason } : {})}
          externalError={error}
        />
      ) : (
        <>
          <QuantityField
            id={`${def.id}-minus`}
            label="Minus side (below nominal)"
            unitHint={hint}
            text={value.minus}
            onText={(minus) => onChange({ ...value, minus })}
            expectedDim={dim}
            parser={parser}
            help="A size, not a signed number: type 3% for a lower limit 3 % below nominal. Type 0% for none."
            placeholder={relative ? '3%' : '3 K'}
            externalError={minusError}
          />
          <QuantityField
            id={`${def.id}-plus`}
            label="Plus side (above nominal)"
            unitHint={hint}
            text={value.plus}
            onText={(plus) => onChange({ ...value, plus })}
            expectedDim={dim}
            parser={parser}
            help="A size, not a signed number. Type 0% for none."
            placeholder={relative ? '10%' : '10 K'}
            externalError={plusError}
          />
        </>
      )}
      {!locked && (
        <div class="radio">
          <input id={`${def.id}-asym`} type="checkbox" checked={value.asym} onChange={(e) => onChange(toggleAsym(value, (e.currentTarget as HTMLInputElement).checked))} />
          <label for={`${def.id}-asym`}>Different minus and plus side</label>
        </div>
      )}
    </fieldset>
  );
}

export interface ThicknessControl {
  readonly mode: ThicknessMode;
  readonly options: readonly ThicknessOption[];
  readonly onMode: (m: ThicknessMode) => void;
  /** True when the copper is given as a weight (the data-based choices are offered). */
  readonly weight: boolean;
}

interface SectionProps {
  readonly fields: readonly TolFieldDef[];
  readonly tol: TolState;
  readonly onTol: (key: string, t: TolInput) => void;
  /** Core error text per tolerance key. */
  readonly errors: Readonly<Record<string, string>>;
  /** Only for calculators with a copper thickness tolerance. */
  readonly thickness?: ThicknessControl;
  readonly prefs?: DisplayPrefs;
  readonly open: boolean;
  readonly onToggle: (open: boolean) => void;
  /** Fields whose typed value is replaced by a profile value (shown disabled with this reason). */
  readonly lockedReason?: Readonly<Record<string, string>>;
  /** Page-specific controls, shown after the fields (for example the fab profile choice). */
  readonly children?: ComponentChildren;
}

const INTRO =
  'Optional. Leave everything empty for no range. Every tolerance here is your own assumption or an explicit choice, never filled in for you. The result shows the tolerance corners (every combination of the limits you give) and how strongly the answer depends on each input. Enter 0% for an input to read its sensitivity without a range.';

/** The collapsed "Tolerances and sensitivity" section. Fields appear only for inputs you actually supplied. */
export function ToleranceSection(p: SectionProps) {
  const th = p.fields.find((f) => f.thickness === true);
  const thick = p.thickness;
  const others = p.fields.filter((f) => f.thickness !== true);
  return (
    <details
      class="advanced tolerances"
      open={p.open}
      onToggle={(e) => p.onToggle((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>Tolerances and sensitivity (optional)</summary>
      <p class="help">{INTRO}</p>
      {others.map((f) =>
        f.offered ? (
          <ToleranceField
            key={f.key}
            def={f}
            value={p.tol[f.key] ?? EMPTY_TOL}
            onChange={(t) => p.onTol(f.key, t)}
            error={p.errors[f.key]}
            prefs={p.prefs}
            {...(p.lockedReason?.[f.key] !== undefined ? { disabledReason: p.lockedReason[f.key] as string } : {})}
          />
        ) : f.whyNot !== undefined ? (
          <p key={f.key} class="help tol-absent">
            No {f.label.toLowerCase()} tolerance field: {f.whyNot}
          </p>
        ) : null,
      )}
      {th !== undefined && thick !== undefined && (
        <>
          <RadioGroup
            name="tol-thickness"
            legend={THICKNESS_LEGEND}
            value={thick.mode}
            options={thick.options.map((o) => ({ value: o.value, label: o.label, ...(o.hint !== undefined ? { hint: o.hint } : {}) }))}
            onChange={(v) => {
              if (isThicknessMode(v)) thick.onMode(v);
            }}
          />
          {!thick.weight && <p class="help">{THICKNESS_CHOICE_NEEDS_WEIGHT}</p>}
          {thick.mode === 'pct' && (
            <ToleranceField def={th} value={p.tol[th.key] ?? EMPTY_TOL} onChange={(t) => p.onTol(th.key, t)} error={p.errors[th.key]} prefs={p.prefs} />
          )}
        </>
      )}
      {p.children}
    </details>
  );
}
