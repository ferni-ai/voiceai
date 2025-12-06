import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';

// NOTE: To enable import ordering rules, install eslint-plugin-import:
// npm install -D eslint-plugin-import eslint-import-resolver-typescript
// Then uncomment the import plugin configuration below

/**
 * 🏛️ Enterprise-Grade ESLint Configuration
 * 
 * Inspired by code quality standards from:
 * - Google (Gemini CLI, Angular)
 * - Anthropic (Claude)
 * - Apple (Swift-style clarity principles)
 * 
 * Goals:
 * 1. Type Safety - Catch bugs at compile time
 * 2. Clean Architecture - Enforce proper dependencies
 * 3. Maintainability - Readable, self-documenting code
 * 4. Consistency - Uniform style across codebase
 */

export default [
  // ============================================================================
  // GLOBAL IGNORES
  // ============================================================================
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js',
      '*.config.mjs',
      'frontend-typescript/dist/**',
      'functions/dist/**',
      'design-system/dist/**',
    ],
  },

  // ============================================================================
  // TYPESCRIPT FILES - STRICT CONFIGURATION
  // ============================================================================
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
        fetch: 'readonly',
        AbortSignal: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        NodeJS: 'readonly',
        require: 'readonly',
        global: 'readonly',
        performance: 'readonly',
        // Browser globals for frontend
        document: 'readonly',
        window: 'readonly',
        HTMLElement: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        MediaRecorder: 'readonly',
        AudioContext: 'readonly',
        WebSocket: 'readonly',
        // Firebase/Firestore types
        FirebaseFirestore: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'prettier': prettier,
      // 'import': importPlugin, // Uncomment after installing eslint-plugin-import
    },
    rules: {
      // ========================================================================
      // BASE RULES
      // ========================================================================
      ...eslint.configs.recommended.rules,
      ...tseslint.configs['recommended'].rules,
      ...tseslint.configs['stylistic'].rules,
      'prettier/prettier': 'warn',

      // ========================================================================
      // 🔒 TYPE SAFETY (Google/Anthropic Style)
      // These rules catch bugs before they happen
      // ========================================================================
      
      // Require explicit return types for better API contracts
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
        allowDirectConstAssertionInArrowFunctions: true,
      }],
      
      // Explicit module boundary types (public API clarity)
      '@typescript-eslint/explicit-module-boundary-types': ['warn', {
        allowArgumentsExplicitlyTypedAsAny: false,
        allowDirectConstAssertionInArrowFunctions: true,
        allowHigherOrderFunctions: true,
        allowTypedFunctionExpressions: true,
      }],
      
      // Strict any usage - prefer unknown for safety
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      
      // Prevent runtime type errors
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/strict-boolean-expressions': ['warn', {
        allowString: true,
        allowNumber: true,
        allowNullableObject: true,
        allowNullableBoolean: true,
        allowNullableString: true,
        allowNullableNumber: false,
        allowAny: false,
      }],
      
      // Async/await safety
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/promise-function-async': 'warn',
      
      // Type assertion safety (warn instead of error for flexibility)
      '@typescript-eslint/consistent-type-assertions': ['warn', {
        assertionStyle: 'as',
        objectLiteralTypeAssertions: 'allow-as-parameter',
      }],
      
      // Unused variables (allow underscore prefix for intentionally unused)
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // ========================================================================
      // 🏗️ CLEAN ARCHITECTURE & CODE QUALITY
      // ========================================================================
      
      // Consistent type imports/exports (tree-shaking friendly)
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        disallowTypeAnnotations: false,
        fixStyle: 'separate-type-imports',
      }],
      '@typescript-eslint/consistent-type-exports': ['error', {
        fixMixedExportsWithInlineTypeSpecifier: true,
      }],
      
      // Naming conventions (Google style)
      '@typescript-eslint/naming-convention': [
        'warn',
        // Variables: camelCase or UPPER_CASE for constants
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        // Functions: camelCase
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        // Types, interfaces, enums: PascalCase
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        // Interface names should NOT have I prefix (modern style)
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I[A-Z]',
            match: false,
          },
        },
        // Enum members: PascalCase or UPPER_CASE
        {
          selector: 'enumMember',
          format: ['PascalCase', 'UPPER_CASE'],
        },
        // Private members: camelCase with optional underscore
        {
          selector: 'memberLike',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
      ],
      
      // Prefer interfaces over types for object shapes (better error messages)
      '@typescript-eslint/consistent-type-definitions': ['warn', 'interface'],
      
      // Array type consistency
      '@typescript-eslint/array-type': ['warn', { default: 'array-simple' }],
      
      // Method signature style
      '@typescript-eslint/method-signature-style': ['warn', 'property'],

      // ========================================================================
      // 📏 CODE SIZE LIMITS (Prevent God Objects)
      // ========================================================================
      
      'max-lines': ['warn', {
        max: 500,
        skipBlankLines: true,
        skipComments: true,
      }],
      'max-lines-per-function': ['warn', {
        max: 80,
        skipBlankLines: true,
        skipComments: true,
        IIFEs: true,
      }],
      'max-depth': ['warn', 4],
      'max-nested-callbacks': ['warn', 3],
      'max-params': ['warn', 5],
      'complexity': ['warn', 15],

      // ========================================================================
      // 🎯 IMPORT ORGANIZATION (Clean Dependencies)
      // Uncomment after: npm install -D eslint-plugin-import eslint-import-resolver-typescript
      // ========================================================================
      
      // 'import/order': ['warn', {
      //   'groups': [
      //     'builtin',
      //     'external',
      //     'internal',
      //     ['parent', 'sibling'],
      //     'index',
      //     'type',
      //   ],
      //   'newlines-between': 'always',
      //   'alphabetize': {
      //     order: 'asc',
      //     caseInsensitive: true,
      //   },
      // }],
      // 'import/no-duplicates': 'error',
      // 'import/no-cycle': ['warn', { maxDepth: 3 }],
      // 'import/no-self-import': 'error',
      'no-duplicate-imports': 'error', // Basic duplicate import check
      
      // ========================================================================
      // 🚫 BANNED PATTERNS & ANTI-PATTERNS
      // ========================================================================
      
      'no-console': 'off', // Allow for voice agent logging
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      
      // Prevent common mistakes
      'no-return-await': 'error',
      'no-await-in-loop': 'warn',
      'no-promise-executor-return': 'error',
      'require-atomic-updates': 'warn',
      
      // Object/array best practices
      'prefer-object-spread': 'error',
      'prefer-destructuring': ['warn', {
        array: false,
        object: true,
      }],
      
      // String best practices
      'prefer-template': 'warn',
      'no-useless-concat': 'error',
      
      // Comparison safety
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-eq-null': 'off',
      
      // Allow empty functions/blocks (often intentional, e.g., no-op handlers)
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      
      // Escape characters in strings (too strict for SSML patterns)
      'no-useless-escape': 'warn',
      
      // ========================================================================
      // 🔧 CUSTOM PROJECT RULES
      // ========================================================================
      
      // Prevent unsafe LiveKit logger usage (warn only - many legacy patterns exist)
      'no-restricted-syntax': [
        'warn',
        {
          selector: "VariableDeclarator[init.type='ArrowFunctionExpression'][init.body.type='CallExpression'][init.body.callee.name='log']",
          message: '❌ Unsafe logger pattern! Use `import { getLogger } from "utils/safe-logger.js"` instead.',
        },
        // Note: Removed direct log() and magic number rules - too noisy for legacy code
      ],
      
      // Restrict certain imports (architectural boundaries)
      'no-restricted-imports': ['warn', {
        patterns: [
          {
            group: ['../**/services/*'],
            message: 'Avoid deep relative imports to services. Use absolute imports.',
          },
        ],
      }],
    },
  },

  // ============================================================================
  // TEST FILES - RELAXED RULES
  // These rules are disabled for tests as they don't need strict type checking
  // Type-aware rules must be disabled when project: null is set
  // ============================================================================
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: null, // Disable type-aware linting for tests
      },
    },
    rules: {
      // Type-aware rules (require parserOptions.project)
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/promise-function-async': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/consistent-type-exports': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Size limits don't apply to tests
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-depth': 'off',
      'max-nested-callbacks': 'off',
      'complexity': 'off',
    },
  },

  // ============================================================================
  // FRONTEND FILES - ADJUSTED RULES
  // ============================================================================
  {
    files: ['frontend-typescript/**/*.ts'],
    rules: {
      // Frontend often needs DOM manipulation with any-like patterns
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      // Event handlers don't always need explicit returns
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  // ============================================================================
  // UI FILES - DESIGN SYSTEM ENFORCEMENT
  // Prevent hardcoded CSS values that should use design tokens
  // ============================================================================
  {
    files: ['frontend-typescript/src/ui/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        // ❌ Prevent hardcoded hex colors (should use CSS variables)
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message: '🎨 Hardcoded hex color! Use CSS variable: var(--color-*) or var(--persona-*). See FERNI-BRAND-GUIDELINES.md',
        },
        // ❌ Prevent hardcoded rgba() in template literals (in CSS strings)
        {
          selector: "TemplateLiteral[quasis.0.value.raw=/rgba\\s*\\(/]",
          message: '🎨 Hardcoded rgba() color! Use CSS variable: var(--backdrop-*), var(--persona-tint), or var(--color-border-subtle). See tokens.css',
        },
        // ❌ Prevent hardcoded font-family strings
        {
          selector: "Literal[value=/font-family:\\s*['\"][^v]/]",
          message: '📝 Hardcoded font-family! Use CSS variable: var(--font-body) or var(--font-display). See tokens.css',
        },
        // ❌ Prevent hardcoded blur values
        {
          selector: "Literal[value=/backdrop-filter:\\s*blur\\([0-9]+px\\)/]",
          message: '💨 Hardcoded blur value! Use CSS variable: var(--glass-blur-subtle) or var(--glass-blur-heavy). See tokens.css',
        },
        // ❌ Prevent hardcoded transition durations (should use DURATION constants)
        {
          selector: "Literal[value=/transition.*[0-9]{3,4}ms/]",
          message: '⏱️ Hardcoded duration! Import { DURATION } from animation-constants.js and use DURATION.SLOW, DURATION.NORMAL, etc.',
        },
        // ❌ Prevent hardcoded box-shadow with rgba
        {
          selector: "Literal[value=/box-shadow:.*rgba/]",
          message: '🌫️ Hardcoded box-shadow! Use CSS variable: var(--shadow-sm), var(--shadow-md), var(--shadow-lg), etc. See tokens.css',
        },
      ],
    },
  },
];
