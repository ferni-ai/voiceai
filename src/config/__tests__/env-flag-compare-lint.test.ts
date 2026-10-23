/**
 * The `ferni/no-env-flag-compare` lint selectors (eslint.config.mjs, code-health G7) catch a
 * raw env flag comparison in each shape and leave other comparisons alone. The 106 sites that
 * existed when the rule landed are baselined in eslint-suppressions.json.
 */
import { Linter } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import { describe, expect, it } from 'vitest';

type Selector = { selector: string; message: string };

async function lint(code: string): Promise<number> {
  const configUrl = new URL('../../../eslint.config.mjs', import.meta.url).href;
  const { ENV_FLAG_COMPARE } = (await import(configUrl)) as { ENV_FLAG_COMPARE: Selector[] };
  const rule = builtinRules.get('no-restricted-syntax');
  if (!rule) throw new Error('no-restricted-syntax missing');
  return new Linter({ configType: 'flat' }).verify(
    code,
    [
      {
        files: ['**/*.ts'],
        plugins: { ferni: { rules: { 'no-env-flag-compare': rule } } },
        rules: { 'ferni/no-env-flag-compare': ['error', ...ENV_FLAG_COMPARE] },
      },
    ],
    'seeded.ts'
  ).length;
}

describe('ferni/no-env-flag-compare', () => {
  it.each([
    "process.env.MY_FLAG === 'on'",
    "process.env.MY_FLAG !== 'true'",
    "process.env['MY_FLAG'] == 'on'",
    "'true' === process.env.MY_FLAG",
    "process.env[name] === 'true'",
  ])('flags %s', async (expr) => {
    expect(await lint(`export const x = ${expr};`)).toBe(1);
  });

  it.each([
    "process.env.MODE === 'shadow'",
    "process.env.NODE_ENV === 'production'",
    "flags.MY_FLAG === 'on'",
    "env.MY_FLAG === 'on'",
  ])('leaves %s alone', async (expr) => {
    expect(await lint(`export const x = ${expr};`)).toBe(0);
  });
});
