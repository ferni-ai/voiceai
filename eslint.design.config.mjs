/**
 * `pnpm lint:design`: the design-system rules (design-system/eslint-plugin) on the web
 * app and the React component package.
 *
 * They get their own config because neither existing one can carry them: the root
 * eslint.config.mjs ignores apps/web and is type-aware against ./tsconfig.json, which
 * doesn't include apps/web; apps/web/.eslintrc.cjs is legacy eslintrc. Only these rules run
 * here, so CI can ratchet their counts per rule (ratchet-baseline.json "designEslint").
 */
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import designSystem from './design-system/eslint-plugin/index.js';

export default [
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'packages/ferni-react/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    // The code's `eslint-disable` comments name @typescript-eslint rules, and a comment naming
    // a rule ESLint has no definition for is an error. The plugin supplies the definitions;
    // none of its rules is turned on, so those comments are unused here, and not reported.
    plugins: { ...designSystem.configs.strict.plugins, '@typescript-eslint': tseslint },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: designSystem.configs.strict.rules,
  },
];
