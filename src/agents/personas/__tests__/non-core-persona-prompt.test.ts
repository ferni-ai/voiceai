/**
 * Marketplace P0 (docs/plans/2026-11-07-marketplace-return.md, rule 1): the canonical crisis
 * line in the prompt a fictional non-core persona ("test-companion") is assembled with, in
 * each PROMPT_MODE. On main no loader adds it (issue #3595), so those two tests are `it.fails`:
 * they turn red, and must become `it`, the day the loader carries the line.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The 988 rule each core character sheet carries (character-lines-you-dont-cross.test.ts). */
const CANONICAL = /might hurt themselves or says they don't want to be here[^.]*988/;

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
  it('the probe matches a core persona in character mode', async () => {
    expect(await assembled('ferni', 'character')).toMatch(CANONICAL);
  });

  it.each(['full', 'character'] as const)(
    '%s mode: assembles the generic fallback prompt',
    async (mode) => {
      expect(await assembled('test-companion', mode)).toContain(
        'You are test-companion, a helpful companion.'
      );
    }
  );

  it.fails('full mode: carries the canonical crisis line (gap: #3595)', async () => {
    expect(await assembled('test-companion', 'full')).toMatch(CANONICAL);
  });

  it.fails('character mode: carries the canonical crisis line (gap: #3595)', async () => {
    expect(await assembled('test-companion', 'character')).toMatch(CANONICAL);
  });
});
