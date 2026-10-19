import type { ComponentType } from 'preact';

export type Category = 'trace' | 'impedance' | 'load' | 'circuit' | 'spacing' | 'thermal' | 'fusing';

export interface CalculatorEntry {
  readonly id: string;
  readonly title: string;
  readonly category: Category;
  readonly phase: number;
  readonly load: () => Promise<{ default: ComponentType }>;
}

export const CATEGORIES: readonly { id: Category; title: string; phase: number }[] = [
  { id: 'trace', title: 'Trace', phase: 1 },
  { id: 'impedance', title: 'Impedance and delay', phase: 2 },
  { id: 'load', title: 'Load / path', phase: 1 },
  { id: 'circuit', title: 'Circuit values', phase: 1 },
  { id: 'spacing', title: 'Safety / Spacing', phase: 3 },
  { id: 'thermal', title: 'Thermal', phase: 4 },
  { id: 'fusing', title: 'Fusing (short pulse to melting; not steady-state heating)', phase: 4 },
];

/** Each calculator is a lazy import, so it ships as its own code-split chunk. */
export const REGISTRY: readonly CalculatorEntry[] = [
  {
    id: 'copper-converter',
    title: 'Copper weight and thickness converter',
    category: 'trace',
    phase: 1,
    load: () => import('./calculators/CopperConverter'),
  },
  {
    id: 'trace-width',
    title: 'Trace width, current and temperature rise (legacy IPC-2221)',
    category: 'trace',
    phase: 1,
    load: () => import('./calculators/TraceWidth'),
  },
  {
    id: 'trace-resistance',
    title: 'Trace resistance, voltage drop and power loss',
    category: 'trace',
    phase: 1,
    load: () => import('./calculators/TraceResistance'),
  },
  {
    id: 'self-heating',
    title: 'Trace self-heating (coupled R(T))',
    category: 'trace',
    phase: 1,
    load: () => import('./calculators/SelfHeating'),
  },
  {
    id: 'voltage-drop',
    title: 'Voltage drop and power loss (feed path)',
    category: 'trace',
    phase: 1,
    load: () => import('./calculators/VoltageDrop'),
  },
  {
    id: 'via',
    title: 'Via resistance and thermal (barrel)',
    category: 'trace',
    phase: 1,
    load: () => import('./calculators/Via'),
  },
  {
    id: 'annular-ring',
    title: 'Annular ring, drill reference and tolerance stack-up',
    category: 'trace',
    phase: 1,
    load: () => import('./calculators/AnnularRing'),
  },
  {
    id: 'microstrip',
    title: 'Microstrip impedance',
    category: 'impedance',
    phase: 2,
    load: () => import('./calculators/Microstrip'),
  },
  {
    id: 'stripline',
    title: 'Symmetric stripline impedance',
    category: 'impedance',
    phase: 2,
    load: () => import('./calculators/Stripline'),
  },
  {
    id: 'coax',
    title: 'Coaxial line impedance',
    category: 'impedance',
    phase: 2,
    load: () => import('./calculators/Coax'),
  },
  {
    id: 'diff-microstrip',
    title: 'Edge-coupled differential microstrip',
    category: 'impedance',
    phase: 2,
    load: () => import('./calculators/DiffMicrostrip'),
  },
  {
    id: 'diff-stripline',
    title: 'Edge-coupled differential stripline',
    category: 'impedance',
    phase: 2,
    load: () => import('./calculators/DiffStripline'),
  },
  {
    id: 'cpw',
    title: 'Coplanar waveguide (CPW) impedance',
    category: 'impedance',
    phase: 2,
    load: () => import('./calculators/Cpw'),
  },
  {
    id: 'cpwg',
    title: 'Grounded coplanar waveguide (CPWG) impedance',
    category: 'impedance',
    phase: 2,
    load: () => import('./calculators/Cpwg'),
  },
  {
    id: 'quarter-wave',
    title: 'Quarter-wave stub length (transmission line)',
    category: 'impedance',
    phase: 2,
    load: () => import('./calculators/QuarterWave'),
  },
  {
    id: 'path-load',
    title: 'Path and load (weakest link)',
    category: 'load',
    phase: 1,
    load: () => import('./calculators/PathLoad'),
  },
  {
    id: 'ohm-power',
    title: "Ohm's law and power",
    category: 'circuit',
    phase: 1,
    load: () => import('./calculators/OhmPower'),
  },
  {
    id: 'resistor-divider',
    title: 'Resistor divider (output, R1 or R2, load, tolerance, E-series)',
    category: 'circuit',
    phase: 1,
    load: () => import('./calculators/ResistorDivider'),
  },
  {
    id: 'feedback-divider',
    title: 'Regulator feedback divider',
    category: 'circuit',
    phase: 1,
    load: () => import('./calculators/FeedbackDivider'),
  },
  {
    id: 'led-resistor',
    title: 'LED series resistor',
    category: 'circuit',
    phase: 1,
    load: () => import('./calculators/LedResistor'),
  },
  {
    id: 'rc-lc',
    title: 'RC and LC (time constant, cutoff, resonance)',
    category: 'circuit',
    phase: 1,
    load: () => import('./calculators/RcLc'),
  },
  {
    id: 'reactance',
    title: 'Reactance (inductor and capacitor)',
    category: 'circuit',
    phase: 1,
    load: () => import('./calculators/Reactance'),
  },
  {
    id: 'e-series',
    title: 'E-series nearest value and two-resistor search',
    category: 'circuit',
    phase: 1,
    load: () => import('./calculators/ESeries'),
  },
  {
    id: 'clearance',
    title: 'Clearance (IEC 60664-1 method, gated table lookup)',
    category: 'spacing',
    phase: 3,
    load: () => import('./calculators/Clearance'),
  },
  {
    id: 'creepage',
    title: 'Creepage (IEC 60664-1 method, gated table lookup)',
    category: 'spacing',
    phase: 3,
    load: () => import('./calculators/Creepage'),
  },
  {
    id: 'ipc-spacing',
    title: 'IPC-2221 conductor spacing (design guideline; not a safety insulation assessment)',
    category: 'spacing',
    phase: 3,
    load: () => import('./calculators/IpcSpacing'),
  },
  {
    id: 'thermal-via',
    title: 'Thermal via array (1-D conduction estimate, lower bound)',
    category: 'thermal',
    phase: 4,
    load: () => import('./calculators/ThermalVia'),
  },
  {
    id: 'fusing',
    title: 'Fusing: adiabatic time to melting (estimate, not a fuse rating)',
    category: 'fusing',
    phase: 4,
    load: () => import('./calculators/Fusing'),
  },
];

export function findCalculator(id: string, registry: readonly CalculatorEntry[] = REGISTRY): CalculatorEntry | undefined {
  return registry.find((e) => e.id === id);
}

export function calculatorsIn(category: Category, registry: readonly CalculatorEntry[] = REGISTRY): CalculatorEntry[] {
  return registry.filter((e) => e.category === category);
}
