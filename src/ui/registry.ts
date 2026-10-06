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

/** Phase 0: no real calculators yet. Each phase appends entries with a dynamic import. */
export const REGISTRY: readonly CalculatorEntry[] = [];

export function findCalculator(id: string, registry: readonly CalculatorEntry[] = REGISTRY): CalculatorEntry | undefined {
  return registry.find((e) => e.id === id);
}

export function calculatorsIn(category: Category, registry: readonly CalculatorEntry[] = REGISTRY): CalculatorEntry[] {
  return registry.filter((e) => e.category === category);
}
