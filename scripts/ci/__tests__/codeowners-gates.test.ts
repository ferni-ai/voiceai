/**
 * CODEOWNERS covers what decides the ESLint ratchets: the web config, and the design-system
 * config and rules. Without it a PR could turn a rule off, or narrow what it matches, and
 * pass the gate it just changed.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { OWNER, ROOT, ownersOf } from './codeowners-rules.js';

describe('CODEOWNERS', () => {
  it.each([
    'apps/web/eslint.config.mjs',
    'eslint.design.config.mjs',
    'design-system/eslint-plugin/index.js',
    'design-system/eslint-plugin/rules/no-hardcoded-colors.js',
  ])('owns %s', (path) => {
    // A rule for a deleted file owns nothing, so check the path is still the live config.
    expect(existsSync(join(ROOT, path))).toBe(true);
    expect(ownersOf(path)).toEqual([OWNER]);
  });
});
