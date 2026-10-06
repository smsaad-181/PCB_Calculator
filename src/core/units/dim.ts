/**
 * Dimension vector over (m, kg, s, A, K, mol, cd) plus a `kind` tag that separates quantities which share
 * an exponent vector but must never mix:
 *  - absTemp:   absolute temperature (K, offset scales)
 *  - deltaT:    temperature difference (no offset)
 *  - arealMass: copper foil weight (oz/ft2); only foilThickness() turns it into a length
 *  - plain:     everything else
 */
export type DimKind = 'plain' | 'absTemp' | 'deltaT' | 'arealMass';
export type Exps = readonly [number, number, number, number, number, number, number];

export interface Dim {
  readonly exp: Exps;
  readonly kind: DimKind;
}

function d(exp: Exps, kind: DimKind = 'plain'): Dim {
  return Object.freeze({ exp: Object.freeze(exp) as Exps, kind });
}

//                       m   kg  s   A   K   mol cd
export const DIM = Object.freeze({
  DIMENSIONLESS: d([0, 0, 0, 0, 0, 0, 0]),
  LENGTH: d([1, 0, 0, 0, 0, 0, 0]),
  AREA: d([2, 0, 0, 0, 0, 0, 0]),
  MASS: d([0, 1, 0, 0, 0, 0, 0]),
  TIME: d([0, 0, 1, 0, 0, 0, 0]),
  CURRENT: d([0, 0, 0, 1, 0, 0, 0]),
  VOLTAGE: d([2, 1, -3, -1, 0, 0, 0]),
  RESISTANCE: d([2, 1, -3, -2, 0, 0, 0]),
  RESISTIVITY: d([3, 1, -3, -2, 0, 0, 0]),
  POWER: d([2, 1, -3, 0, 0, 0, 0]),
  DENSITY: d([-3, 1, 0, 0, 0, 0, 0]),
  FREQUENCY: d([0, 0, -1, 0, 0, 0, 0]),
  CAPACITANCE: d([-2, -1, 4, 2, 0, 0, 0]),
  INDUCTANCE: d([2, 1, -2, -2, 0, 0, 0]),
  ABS_TEMPERATURE: d([0, 0, 0, 0, 1, 0, 0], 'absTemp'),
  TEMPERATURE_DIFFERENCE: d([0, 0, 0, 0, 1, 0, 0], 'deltaT'),
  AREAL_MASS: d([-2, 1, 0, 0, 0, 0, 0], 'arealMass'),
  THERMAL_RESISTANCE: d([-2, -1, 3, 0, 1, 0, 0]),
  PER_KELVIN: d([0, 0, 0, 0, -1, 0, 0]),
});

export function expsEqual(a: Exps, b: Exps): boolean {
  return (
    a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6]
  );
}

export function dimEqual(a: Dim, b: Dim): boolean {
  return a === b || (a.kind === b.kind && expsEqual(a.exp, b.exp));
}

export function isDimensionless(a: Dim): boolean {
  return a.kind === 'plain' && expsEqual(a.exp, DIM.DIMENSIONLESS.exp);
}

const SYMBOLS = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd'] as const;

/** Human readable dimension for error messages (slow path only). */
export function describeDim(a: Dim): string {
  const parts: string[] = [];
  for (let i = 0; i < 7; i++) {
    const e = a.exp[i] as number;
    if (e !== 0) parts.push(e === 1 ? SYMBOLS[i] as string : `${SYMBOLS[i] as string}^${e}`);
  }
  const si = parts.length === 0 ? '1' : parts.join('*');
  return a.kind === 'plain' ? `[${si}]` : `${a.kind} [${si}]`;
}
