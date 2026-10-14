import { describe, expect, it } from 'vitest';
import { evaluateBudget, routeName } from '../tools/size-lib.mjs';

const KB = 1024;

// Fixture shaped like Vite's dist/.vite/manifest.json.
const manifest = {
  'index.html': {
    file: 'assets/index.js',
    isEntry: true,
    imports: ['_core.js'],
    dynamicImports: ['src/ui/calculators/A.tsx', 'src/ui/calculators/B.tsx'],
  },
  '_core.js': { file: 'assets/core.js' },
  '_shared.js': { file: 'assets/shared.js', imports: ['_core.js'] },
  'src/ui/calculators/A.tsx': {
    file: 'assets/A.js',
    isDynamicEntry: true,
    src: 'src/ui/calculators/A.tsx',
    imports: ['_shared.js'],
  },
  'src/ui/calculators/B.tsx': {
    file: 'assets/B.js',
    isDynamicEntry: true,
    src: 'src/ui/calculators/B.tsx',
    imports: ['_shared.js'],
  },
};

const sizes = {
  'assets/index.js': 10 * KB,
  'assets/core.js': 20 * KB,
  'assets/shared.js': 30 * KB,
  'assets/A.js': 5 * KB,
  'assets/B.js': 7 * KB,
};

describe('routeName', () => {
  it('uses the module basename without extension', () => {
    expect(routeName('src/ui/calculators/TraceWidth.tsx')).toBe('TraceWidth');
  });
});

describe('evaluateBudget', () => {
  it('counts a shared chunk once per route, not twice', () => {
    const r = evaluateBudget({ manifest, sizes, firstLoadBudget: 150 * KB, totalBudget: 400 * KB });
    const a = r.routes.find((x) => x.route === 'A');
    const b = r.routes.find((x) => x.route === 'B');
    // entry 10 + core 20 (reached via entry AND shared, once) + shared 30 + A 5
    expect(a?.bytes).toBe(65 * KB);
    expect(b?.bytes).toBe(67 * KB);
    expect(a?.files).toHaveLength(4);
    expect(r.total).toBe(72 * KB);
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('sorts routes largest first and reports the largest', () => {
    const r = evaluateBudget({ manifest, sizes, firstLoadBudget: 150 * KB, totalBudget: 400 * KB });
    expect(r.routes.map((x) => x.route)).toEqual(['B', 'A']);
    expect(r.largest?.route).toBe('B');
  });

  it('fails when one route exceeds the first-load budget', () => {
    const r = evaluateBudget({ manifest, sizes, firstLoadBudget: 66 * KB, totalBudget: 400 * KB });
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatch(/B/);
  });

  it('passes when a route is exactly at the budget', () => {
    const r = evaluateBudget({ manifest, sizes, firstLoadBudget: 67 * KB, totalBudget: 72 * KB });
    expect(r.ok).toBe(true);
  });

  it('fails when the total exceeds the total ceiling', () => {
    const r = evaluateBudget({ manifest, sizes, firstLoadBudget: 150 * KB, totalBudget: 71 * KB });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /total/i.test(f))).toBe(true);
  });

  it('counts unmanifested JS files in the total', () => {
    const r = evaluateBudget({
      manifest,
      sizes: { ...sizes, 'assets/orphan.js': 100 * KB },
      firstLoadBudget: 150 * KB,
      totalBudget: 150 * KB,
    });
    expect(r.total).toBe(172 * KB);
    expect(r.ok).toBe(false);
  });

  it('throws on a manifest reference with no measured size', () => {
    const rest: Record<string, number> = { ...sizes };
    delete rest['assets/A.js'];
    expect(() =>
      evaluateBudget({ manifest, sizes: rest, firstLoadBudget: 150 * KB, totalBudget: 400 * KB }),
    ).toThrow(/assets\/A\.js/);
  });

  it('throws when there is no entry or no route', () => {
    expect(() =>
      evaluateBudget({ manifest: { x: { file: 'assets/core.js' } }, sizes, firstLoadBudget: 1, totalBudget: 1 }),
    ).toThrow(/entry/i);
    const noRoutes = { 'index.html': { file: 'assets/index.js', isEntry: true } };
    expect(() =>
      evaluateBudget({ manifest: noRoutes, sizes, firstLoadBudget: 1, totalBudget: 1 }),
    ).toThrow(/route/i);
  });

  it('tolerates import cycles', () => {
    const cyc = {
      ...manifest,
      '_core.js': { file: 'assets/core.js', imports: ['_shared.js'] },
    };
    const r = evaluateBudget({ manifest: cyc, sizes, firstLoadBudget: 150 * KB, totalBudget: 400 * KB });
    expect(r.routes).toHaveLength(2);
  });
});
