import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import preact from '@preact/preset-vite';

export const PRODUCTION_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'";

/** Injects a CSP meta tag into the production build only (dev server/HMR untouched). */
export function cspPlugin(csp: string = PRODUCTION_CSP): Plugin {
  return {
    name: 'pcb-calc-csp',
    apply: 'build',
    transformIndexHtml(html: string): string {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
      return html.replace('<head>', `<head>
    ${tag}`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), cspPlugin()],
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
