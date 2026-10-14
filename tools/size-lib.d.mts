export interface ManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
}
export type Manifest = Record<string, ManifestChunk>;
export interface RouteSize {
  route: string;
  key: string;
  bytes: number;
  files: string[];
}
export interface BudgetResult {
  routes: RouteSize[];
  largest: RouteSize | undefined;
  total: number;
  ok: boolean;
  failures: string[];
}
export function routeName(key: string): string;
export function evaluateBudget(args: {
  manifest: Manifest;
  sizes: Record<string, number>;
  firstLoadBudget: number;
  totalBudget: number;
}): BudgetResult;
