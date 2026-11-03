/**
 * CODEOWNERS covers what decides the ESLint ratchets: the web config, and the design-system
 * config and rules. Without it a PR could turn a rule off, or narrow what it matches, and
 * pass the gate it just changed.
 */
import { describe, expect, it } from 'vitest';
import { OWNER, ownersOf } from './codeowners-rules.js';

describe('CODEOWNERS', () => {
  it.each([
    'apps/web/.eslintrc.cjs',
    'eslint.design.config.mjs',
    'design-system/eslint-plugin/index.js',
    'design-system/eslint-plugin/rules/no-hardcoded-colors.js',
  ])('owns %s', (path) => {
    expect(ownersOf(path)).toEqual([OWNER]);
  });
});
