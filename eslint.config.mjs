import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.js', '*.config.mjs'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly', // Node.js 18+ native fetch
        AbortSignal: 'readonly', // Node.js 18+ native AbortSignal
        URL: 'readonly', // Node.js built-in
        URLSearchParams: 'readonly', // Node.js built-in
        TextEncoder: 'readonly', // Node.js built-in
        TextDecoder: 'readonly', // Node.js built-in
        NodeJS: 'readonly', // TypeScript namespace for Node.js types
        require: 'readonly', // CommonJS require (for dynamic imports)
        global: 'readonly', // Node.js global object
        performance: 'readonly', // Performance timing API
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettier,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'prettier/prettier': 'warn',

      // TypeScript specific
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // General code quality
      'no-console': 'off', // Allow console for logging in voice agent
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',

      // File size limits - prevent god objects
      'max-lines': ['warn', {
        max: 500,
        skipBlankLines: true,
        skipComments: true,
      }],
      'max-lines-per-function': ['warn', {
        max: 100,
        skipBlankLines: true,
        skipComments: true,
      }],

      // Production readiness
      'no-process-exit': 'error',
      'no-throw-literal': 'error',
      'require-await': 'warn',

      // CUSTOM: Prevent unsafe LiveKit logger usage
      // Use `import { getLogger } from '../utils/safe-logger.js'` instead
      'no-restricted-syntax': [
        'error',
        {
          selector: "VariableDeclarator[init.type='ArrowFunctionExpression'][init.body.type='CallExpression'][init.body.callee.name='log']",
          message: '❌ Unsafe logger pattern detected! Use `import { getLogger } from "utils/safe-logger.js"` instead of `const getLogger = () => log()`. The LiveKit log() function throws if called before initialization.',
        },
        {
          selector: "CallExpression[callee.name='log'][parent.type!='TryStatement']",
          message: '⚠️ Direct log() call may fail if logger not initialized. Consider using safeLog() from utils/safe-logger.js',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: null, // Don't use project for test files
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
