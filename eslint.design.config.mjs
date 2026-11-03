/**
 * `pnpm lint:design`: the design-system rules (design-system/eslint-plugin) on the web
 * app and the React component package.
 *
 * They get their own config because neither existing one can carry them: the root
 * eslint.config.mjs ignores apps/web and is type-aware against ./tsconfig.json, which
 * doesn't include apps/web; apps/web/.eslintrc.cjs is legacy eslintrc. Only these rules run
 * here, so CI can ratchet their counts per rule (ratchet-baseline.json "designEslint").
 */
import tsparser from '@typescript-eslint/parser';
import designSystem from './design-system/eslint-plugin/index.js';

export default [
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'packages/ferni-react/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    // Inline config comments are ignored, so an `eslint-disable` added in any PR can't hide a
    // violation from the ratchet. ESLint reports each such comment as a warning ("has no
    // effect"), which the ratchet doesn't count.
    plugins: designSystem.configs.strict.plugins,
    linterOptions: { noInlineConfig: true },
    rules: designSystem.configs.strict.rules,
  },
];
