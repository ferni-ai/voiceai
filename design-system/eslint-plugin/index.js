/**
 * ESLint Plugin: Ferni Design System
 * 
 * Enforces design system compliance across the codebase.
 * Catches hardcoded values that should use design tokens.
 * 
 * Usage in .eslintrc.js:
 * 
 *   plugins: ['@ferni/design-system'],
 *   rules: {
 *     '@ferni/design-system/no-hardcoded-colors': 'error',
 *     '@ferni/design-system/no-hardcoded-durations': 'warn',
 *     '@ferni/design-system/no-banned-words': 'error',
 *     '@ferni/design-system/prefer-design-tokens': 'warn',
 *   }
 */

const noHardcodedColors = require('./rules/no-hardcoded-colors');
const noHardcodedDurations = require('./rules/no-hardcoded-durations');
const noBannedWords = require('./rules/no-banned-words');
const preferDesignTokens = require('./rules/prefer-design-tokens');
const noConsoleInUI = require('./rules/no-console-in-ui');
const noDirectPersonaColors = require('./rules/no-direct-persona-colors');

module.exports = {
  meta: {
    name: '@ferni/eslint-plugin-design-system',
    version: '1.0.0',
  },
  rules: {
    'no-hardcoded-colors': noHardcodedColors,
    'no-hardcoded-durations': noHardcodedDurations,
    'no-banned-words': noBannedWords,
    'prefer-design-tokens': preferDesignTokens,
    'no-console-in-ui': noConsoleInUI,
    'no-direct-persona-colors': noDirectPersonaColors,
  },
  configs: {
    recommended: {
      plugins: ['@ferni/design-system'],
      rules: {
        '@ferni/design-system/no-hardcoded-colors': 'error',
        '@ferni/design-system/no-hardcoded-durations': 'warn',
        '@ferni/design-system/no-banned-words': 'error',
        '@ferni/design-system/prefer-design-tokens': 'warn',
        '@ferni/design-system/no-console-in-ui': 'error',
        '@ferni/design-system/no-direct-persona-colors': 'error',
      },
    },
    strict: {
      plugins: ['@ferni/design-system'],
      rules: {
        '@ferni/design-system/no-hardcoded-colors': 'error',
        '@ferni/design-system/no-hardcoded-durations': 'error',
        '@ferni/design-system/no-banned-words': 'error',
        '@ferni/design-system/prefer-design-tokens': 'error',
        '@ferni/design-system/no-console-in-ui': 'error',
        '@ferni/design-system/no-direct-persona-colors': 'error',
      },
    },
  },
};

