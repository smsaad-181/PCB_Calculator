import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'node',
    exclude: ['node_modules/**', 'dist/**', 'tests/fixtures/**'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.regression.test.ts', 'tests/**'],
      reporter: ['text', 'json-summary'],
      // Enforced only when run with --coverage (npm run test:coverage, used in CI).
      thresholds: {
        // Global floor for src/core/** (measured 2026: 98.16 / 99.1 / 98.27 / 98.18)
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
        // Phase 0 exit criterion: units branch coverage >= 95% (measured 99.54)
        'src/core/units/**': { branches: 95 },
      },
    },
  },
});
