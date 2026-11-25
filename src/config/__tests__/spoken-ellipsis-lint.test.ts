/**
 * The `ferni/no-spoken-ellipsis` lint selectors (eslint.config.mjs, #2063) catch an ellipsis in
 * the words of a hard-coded spoken (SSML) line, in a plain string or a template, and leave alone
 * an ellipsis outside spoken words. The sites that existed when the rule landed are baselined
 * in eslint-suppressions.json.
 */
import { Linter } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import { describe, expect, it } from 'vitest';

interface Selector {
  selector: string;
  message: string;
}

async function lint(code: string): Promise<number> {
  const configUrl = new URL('../../../eslint.config.mjs', import.meta.url).href;
  const { SPOKEN_ELLIPSIS } = (await import(configUrl)) as { SPOKEN_ELLIPSIS: Selector[] };
  const rule = builtinRules.get('no-restricted-syntax');
  if (!rule) throw new Error('no-restricted-syntax missing');
  return new Linter({ configType: 'flat' }).verify(
    code,
    [
      {
        files: ['**/*.ts'],
        plugins: { ferni: { rules: { 'no-spoken-ellipsis': rule } } },
        rules: { 'ferni/no-spoken-ellipsis': ['error', ...SPOKEN_ELLIPSIS] },
      },
    ],
    'seeded.ts'
  ).length;
}

describe('ferni/no-spoken-ellipsis', () => {
  it.each([
    `'<break time="100ms"/>So... what brings you here?'`,
    `'<emotion value="affectionate"/>...hey.<break time="200ms"/>'`,
    `'And you are…?<break time="500ms"/>'`,
    `'<speed ratio="0.9"/>Oh...'`,
    `'<volume ratio="0.7"/>Mm...'`,
    'name => `<break time="300ms"/>...hey. I\'m ${name}.`',
    'detail => `The way you said ${detail}... <break time="200ms"/>`',
  ])('flags %s', async (expr) => {
    expect(await lint(`export const x = ${expr};`)).toBe(1);
  });

  it.each([
    `'<break time="100ms"/>So,<break time="150ms"/>what brings you here?'`,
    `'Loading...'`,
    "'[...items]'",
    'name => `Calling ${name}...`',
    `'<emotion .../>'`,
    'n => `<break time="${n}ms"/>` + "Hey."',
  ])('leaves %s alone', async (expr) => {
    expect(await lint(`export const x = ${expr};`)).toBe(0);
  });
});
