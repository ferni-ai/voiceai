/**
 * The three legends (Nate Holloway, Tom Brannigan, Henry Caldwell) had no
 * character sheet, so PROMPT_MODE=character fell back to their legacy system
 * prompts, Henry's and Tom's with "Things You DO Say" lines the model repeats.
 * Their new character.md (+ character-spark.md) is read only with
 * PERSONA_SPARK=on (character-spark.ts), so a legend call doesn't change until
 * the flag flips.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHEET_WITH_SPARK } from '../character-spark.js';
import { loadSystemPrompt } from '../prompt-loader.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const LEGENDS: Array<[bundle: string, name: string, legacy: RegExp]> = [
  ['joel-dickson', 'Nate Holloway', /<role>/],
  ['peter-lynch', 'Tom Brannigan', /Things You DO Say/],
  ['john-bogle', 'Henry Caldwell', /Things You DO Say/],
];

const BUNDLES = join(dirname(fileURLToPath(import.meta.url)), '../../../personas/bundles');
const read = (bundle: string, file: string): string =>
  readFileSync(join(BUNDLES, bundle, 'identity', file), 'utf8');

const prompt = async (bundle: string, mode: string, spark?: string): Promise<string> => {
  vi.stubEnv('PROMPT_MODE', mode);
  vi.stubEnv('PERSONA_SPARK', spark ?? '');
  return loadSystemPrompt(bundle);
};

describe('legend character sheets (PERSONA_SPARK)', () => {
  it('are the only sheets that wait for the flag', () => {
    expect([...SHEET_WITH_SPARK].sort()).toEqual(LEGENDS.map(([b]) => b).sort());
  });

  it.each(LEGENDS)(
    '%s: off, the legacy prompt as before, in either mode',
    async (bundle, name, legacy) => {
      const full = await prompt(bundle, 'full');
      expect(full).toMatch(legacy);
      for (const spark of [undefined, 'off']) {
        expect(await prompt(bundle, 'character', spark)).toBe(full);
      }
      expect(full).not.toContain(`You are ${name}. This is who you are, not a script.`);
    }
  );

  it.each(LEGENDS)(
    '%s: on, the character sheet and spark, no scripted lines',
    async (bundle, name, legacy) => {
      const on = await prompt(bundle, 'character', 'on');
      expect(
        on.startsWith(`# ${name}\n\nYou are ${name}. This is who you are, not a script.`)
      ).toBe(true);
      expect(on).toContain('## When something is genuinely good');
      expect(on.indexOf('## When something is genuinely good')).toBeGreaterThan(
        on.indexOf("## Lines you don't cross")
      );
      expect(on).not.toMatch(legacy);
      expect(on).not.toMatch(/Things You (DO|NEVER) Say|<emotion|<break|<speed/);
      // The lines every persona holds: no advice, and 988 for someone in danger.
      expect(on).toContain("You don't give medical, legal or financial advice");
      expect(on).toContain('988 (the Suicide & Crisis Lifeline)');
      // Still fictional: no claim to be a real public figure.
      expect(on).toMatch(/never claim to be/);
    }
  );

  it.each(LEGENDS)(
    '%s: on, PROMPT_MODE=full keeps the legacy prompt',
    async (bundle, _name, legacy) => {
      expect(await prompt(bundle, 'full', 'on')).toMatch(legacy);
    }
  );

  it.each(LEGENDS)('%s: described, never scripted, and nothing about what they are', (bundle) => {
    for (const file of ['character.md', 'character-spark.md']) {
      const text = read(bundle, file);
      expect(text, file).not.toMatch(/["“”]/);
      expect(text, file).not.toMatch(/\bAI\b|artificial|language model|pixar|disney/i);
    }
    const spark = read(bundle, 'character-spark.md');
    expect(spark).toContain('When things are hard, the sheet above stands as written.');
    expect(spark).toContain("never brightness on top of someone's pain");
  });
});
