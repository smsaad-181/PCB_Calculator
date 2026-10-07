import type { ComponentType } from 'preact';

export type Category = 'routing' | 'trace' | 'load' | 'circuit';

export interface CalculatorEntry {
  readonly id: string;
  readonly title: string;
  readonly category: Category;
  readonly phase: number;
  readonly load: () => Promise<{ default: ComponentType }>;
}

export const CATEGORIES: readonly { id: Category; title: string; phase: number }[] = [
  { id: 'routing', title: 'Routing', phase: 2 },
  { id: 'trace', title: 'Trace', phase: 1 },
  { id: 'load', title: 'Load / path', phase: 1 },
  { id: 'circuit', title: 'Circuit values', phase: 1 },
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
];

export function findCalculator(id: string, registry: readonly CalculatorEntry[] = REGISTRY): CalculatorEntry | undefined {
  return registry.find((e) => e.id === id);
}

export function calculatorsIn(category: Category, registry: readonly CalculatorEntry[] = REGISTRY): CalculatorEntry[] {
  return registry.filter((e) => e.category === category);
}
