/**
 * ESLint for apps/web (flat config; ESLint 10 dropped .eslintrc). CI ratchets its error
 * counts per rule (ratchet-baseline.json "webEslint"), so a rule left out here reads as
 * fixed: keep this a translation of the old .eslintrc.cjs, not a new rule set.
 *
 * The old `env: { browser, es2022 }` is not carried over: typescript-eslint's
 * eslint-recommended config turns no-undef off for TypeScript, and no rule that runs here
 * reads globals.
 */
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/**', 'node_modules/**', '**/*.config.*'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // eslint:recommended, plugin:@typescript-eslint/recommended and
  // recommended-requiring-type-checking (renamed recommended-type-checked, a superset of both).
  { files: ['**/*.ts', '**/*.tsx'], ...js.configs.recommended },
  ...tseslint.configs['flat/recommended-type-checked'].map((c) => ({
    files: ['**/*.ts', '**/*.tsx'],
    ...c,
  })),
  { files: ['**/*.ts', '**/*.tsx'], ...prettier },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // TypeScript - Critical (keep as errors)
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // caughtErrors 'none' was the default before ESLint 9 / typescript-eslint 8 (now 'all'):
      // spelled out so the baselined rule keeps the meaning its count was taken under.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',

      // TypeScript - Stylistic (warnings for gradual fix)
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',

      // TypeScript - Type safety (warnings - address gradually)
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',

      // General
      'no-case-declarations': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'log', 'debug'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-empty': 'warn',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
];
