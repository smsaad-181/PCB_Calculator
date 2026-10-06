import { DIM, dimEqual, type Dim } from './dim';
import { InvalidValueError } from './errors';
import { type Quantity } from './quantity';
import { toUnit } from './units-table';

export interface FormatOptions {
  /** Significant digits (default 6, clamped to 1..21). */
  readonly sig?: number;
  /** Explicit display unit: no prefix selection, value is converted into this unit. */
  readonly unit?: string;
}

interface Display {
  readonly dim: Dim;
  readonly symbol: string;
  readonly prefixable: boolean;
  /** Multiplier from SI to the symbol's unit (mass is shown in g). */
  readonly factor: number;
}

const DISPLAYS: readonly Display[] = [
  { dim: DIM.LENGTH, symbol: 'm', prefixable: true, factor: 1 },
  { dim: DIM.RESISTANCE, symbol: 'Ω', prefixable: true, factor: 1 },
  { dim: DIM.FREQUENCY, symbol: 'Hz', prefixable: true, factor: 1 },
  { dim: DIM.CURRENT, symbol: 'A', prefixable: true, factor: 1 },
  { dim: DIM.VOLTAGE, symbol: 'V', prefixable: true, factor: 1 },
  { dim: DIM.POWER, symbol: 'W', prefixable: true, factor: 1 },
  { dim: DIM.CAPACITANCE, symbol: 'F', prefixable: true, factor: 1 },
  { dim: DIM.INDUCTANCE, symbol: 'H', prefixable: true, factor: 1 },
  { dim: DIM.TIME, symbol: 's', prefixable: true, factor: 1 },
  { dim: DIM.MASS, symbol: 'g', prefixable: true, factor: 1000 },
  { dim: DIM.DIMENSIONLESS, symbol: '', prefixable: false, factor: 1 },
  { dim: DIM.AREA, symbol: 'm²', prefixable: false, factor: 1 },
  { dim: DIM.ABS_TEMPERATURE, symbol: 'K', prefixable: false, factor: 1 },
  { dim: DIM.TEMPERATURE_DIFFERENCE, symbol: 'ΔK', prefixable: false, factor: 1 },
  { dim: DIM.AREAL_MASS, symbol: 'kg/m²', prefixable: false, factor: 1 },
];

const STEP_SCALE = [1e-12, 1e-9, 1e-6, 1e-3, 1, 1e3, 1e6, 1e9] as const;
const STEP_SYMBOL = ['p', 'n', 'µ', 'm', '', 'k', 'M', 'G'] as const;
const SI_NAMES = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd'] as const;

function siSymbol(dim: Dim): string {
  const parts: string[] = [];
  for (let i = 0; i < 7; i++) {
    const e = dim.exp[i] as number;
    if (e !== 0) parts.push(e === 1 ? (SI_NAMES[i] as string) : `${SI_NAMES[i] as string}^${e}`);
  }
  return parts.join('·');
}

function round(v: number, sig: number): number {
  return Number(v.toPrecision(sig));
}

/** Format with an engineering prefix (p n µ m k M G) or an explicit unit. Throws InvalidValueError on non-finite input. */
export function formatQuantity(x: Quantity, opts: FormatOptions = {}): string {
  if (!Number.isFinite(x.si)) throw new InvalidValueError('Cannot format a non-finite quantity');
  const sig = Math.min(21, Math.max(1, Math.trunc(opts.sig ?? 6)));

  if (opts.unit !== undefined) return `${String(round(toUnit(x, opts.unit), sig))} ${opts.unit}`;

  let disp: Display | undefined;
  for (const d of DISPLAYS) {
    if (dimEqual(d.dim, x.dim)) {
      disp = d;
      break;
    }
  }
  const symbol = disp ? disp.symbol : siSymbol(x.dim);
  const base = round(x.si * (disp ? disp.factor : 1), sig);
  let prefix = '';
  let value = base;
  if (disp?.prefixable && base !== 0) {
    const a = Math.abs(base);
    let i = 4;
    while (i < 7 && a >= (STEP_SCALE[i + 1] as number)) i++;
    while (i > 0 && a < (STEP_SCALE[i] as number)) i--;
    prefix = STEP_SYMBOL[i] as string;
    value = round(base / (STEP_SCALE[i] as number), sig);
  }
  const unit = prefix + symbol;
  return unit === '' ? String(value) : `${String(value)} ${unit}`;
}
