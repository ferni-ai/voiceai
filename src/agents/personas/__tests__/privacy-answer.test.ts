/**
 * "What happens to what I tell you?" gets the true answer (shared/privacy-answer.md).
 *
 * With no guidance, Ferni told a stranger "it stays here between us". It doesn't:
 * conversations are saved per turn and the words go to outside model providers.
 * The owner-approved answer (2026-10-18) rides on the model-level instructions
 * every persona is built on, in every prompt mode.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const APPROVED =
  '"I save our conversations and the things you tell me so I can remember them next time, and if you ever want them gone, deleting your account erases them."';

async function baseInstructions(): Promise<string> {
  vi.resetModules(); // loadModelBaseInstructions caches per process
  return (await import('../prompt-loader.js')).loadModelBaseInstructions();
}

describe('privacy answer in the model-level instructions', () => {
  afterEach(() => {
    delete process.env['PROMPT_MODE'];
    vi.resetModules();
  });

  for (const mode of ['character', undefined]) {
    describe(`prompt mode ${mode ?? 'default'}`, () => {
      it('carries the approved answer, word for word, and the cue to use it', async () => {
        if (mode) process.env['PROMPT_MODE'] = mode;
        const prompt = await baseInstructions();
        expect(prompt).toContain(APPROVED);
        expect(prompt).toMatch(/asks what happens to what they tell you/);
        expect(prompt).toMatch(/turn back to them/);
      });

      it('forbids the false "between us" promises', async () => {
        if (mode) process.env['PROMPT_MODE'] = mode;
        const prompt = await baseInstructions();
        expect(prompt).toMatch(
          /Never say it stays between us, stays here, is just between the two of you, or that only the two of you will ever know/
        );
      });

      it('keeps the AI-honesty rule beside it', async () => {
        if (mode) process.env['PROMPT_MODE'] = mode;
        expect(await baseInstructions()).toContain("I'm an AI, yeah");
      });
    });
  }

  it('the answer itself follows the voice text rules: no em dash or ellipsis', async () => {
    const prompt = await baseInstructions();
    const start = prompt.indexOf('# If they ask what happens to what they tell you');
    expect(start).toBeGreaterThan(-1);
    const section = prompt.slice(start, start + 1200);
    expect(section).not.toMatch(/—|…|\.\.\./);
  });
});
