import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const coreGlobals = ['window', 'document', 'fetch', 'localStorage', 'sessionStorage', 'navigator'];

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'tools/reference/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // CLAUDE.md rule 5: src/core is pure, deterministic TypeScript.
    files: ['src/core/**/*.{ts,tsx}'],
    ignores: ['src/core/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...coreGlobals.map((name) => ({ name, message: 'src/core must be pure: no DOM/network/storage globals.' })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'src/core must be deterministic: inject time.' },
        { object: 'Math', property: 'random', message: 'src/core must be deterministic: inject a seeded RNG.' },
        { object: 'window', property: '*', message: 'No DOM in src/core.' },
        { object: 'globalThis', property: 'fetch', message: 'No network in src/core.' },
        { object: 'globalThis', property: 'window', message: 'No DOM in src/core.' },
        { object: 'globalThis', property: 'document', message: 'No DOM in src/core.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'new Date() reads the clock; inject time.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^preact(/.*)?$', message: 'src/core must not import preact.' },
            { regex: '(^|/)ui(/|$)', message: 'src/core must not import from src/ui.' },
            { regex: '(^|/)(state|workers)(/|$)', message: 'src/core must not import from state/workers.' },
          ],
        },
      ],
    },
  },
);
