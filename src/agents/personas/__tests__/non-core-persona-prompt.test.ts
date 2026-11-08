/**
 * Marketplace P0 (docs/plans/2026-11-07-marketplace-return.md, rule 1): the canonical crisis line
 * in the prompt a fictional non-core persona ("test-companion") is assembled with, per PROMPT_MODE.
 * No loader adds it on main (issue #3595), so those two tests are `it.fails` and turn red the day
 * one does. Whoever lands #3595 converts both to `it()`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The 988 rule each core character sheet carries (character-lines-you-dont-cross.test.ts). */
const CANONICAL = /might hurt themselves or says they don't want to be here[^.]*988/;
/** Full mode's model-level crisis rule (bundles/shared/model-base-instructions.md). */
const BASE_RULE = "For crisis: Acknowledge, provide 988 Lifeline, don't minimize";

/** System prompt + model-level instructions, as the voice agent entry assembles them. */
async function assembled(personaId: string, mode: 'full' | 'character'): Promise<string> {
  vi.resetModules(); // the model-level instructions are cached per process
  if (mode === 'character') process.env['PROMPT_MODE'] = 'character';
  else delete process.env['PROMPT_MODE'];
  const loader = await import('../prompt-loader.js');
  return `${await loader.loadSystemPrompt(personaId)}\n\n${await loader.loadModelBaseInstructions()}`;
}

afterEach(() => {
  delete process.env['PROMPT_MODE'];
});

describe('prompt for a non-core persona', () => {
  it('probe: core Ferni has the canonical line in character mode, only the base rule in full', async () => {
    expect(await assembled('ferni', 'character')).toMatch(CANONICAL);
    const full = await assembled('ferni', 'full'); // gap table G3: not canonical on main either
    expect(full).not.toMatch(CANONICAL);
    expect(full).toContain(BASE_RULE);
  });

  it.each(['full', 'character'] as const)('%s mode: the generic fallback prompt', async (mode) => {
    expect(await assembled('test-companion', mode)).toContain(
      'You are test-companion, a helpful companion.'
    );
  });

  it('full mode: a non-core id gets the same base 988 rule as core', async () => {
    expect(await assembled('test-companion', 'full')).toContain(BASE_RULE);
  });

  it.fails.each(['full', 'character'] as const)(
    '%s mode: the canonical crisis line (gap: #3595)',
    async (mode) => {
      expect(await assembled('test-companion', mode)).toMatch(CANONICAL);
    }
  );
});
