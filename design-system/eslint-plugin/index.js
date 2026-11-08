/**
 * ESLint Plugin: Ferni Design System
 * 
 * Enforces design system compliance across the codebase.
 * Catches hardcoded values that should use design tokens.
 * 
 * A flat-config plugin (ESLint 9). Usage in an eslint.config.mjs:
 *
 *   import designSystem from './design-system/eslint-plugin/index.js';
 *   export default [{ files: ['src/ui/*.ts'], ...designSystem.configs.recommended }];
 *
 * The repo runs it through eslint.design.config.mjs (`pnpm lint:design`).
 */

const noHardcodedColors = require('./rules/no-hardcoded-colors');
const noHardcodedDurations = require('./rules/no-hardcoded-durations');
const noBannedWords = require('./rules/no-banned-words');
const preferDesignTokens = require('./rules/prefer-design-tokens');
const noConsoleInUI = require('./rules/no-console-in-ui');
const noDirectPersonaColors = require('./rules/no-direct-persona-colors');

const plugin = {
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
  configs: {},
};

const ruleSet = (durations, tokens) => ({
  '@ferni/design-system/no-hardcoded-colors': 'error',
  '@ferni/design-system/no-hardcoded-durations': durations,
  '@ferni/design-system/no-banned-words': 'error',
  '@ferni/design-system/prefer-design-tokens': tokens,
  '@ferni/design-system/no-console-in-ui': 'error',
  '@ferni/design-system/no-direct-persona-colors': 'error',
});
// Flat-config shape: a config names the plugin object itself, not a package to resolve.
plugin.configs.recommended = { plugins: { '@ferni/design-system': plugin }, rules: ruleSet('warn', 'warn') };
plugin.configs.strict = { plugins: { '@ferni/design-system': plugin }, rules: ruleSet('error', 'error') };

module.exports = plugin;
