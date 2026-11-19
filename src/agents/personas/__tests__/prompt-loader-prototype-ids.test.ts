/**
 * #3631: the prompt loader's persona tables (PERSONA_BUNDLES, FALLBACK_PROMPTS) are plain objects,
 * so a persona id that names an Object.prototype member used to read the prototype: `toString`
 * returned a function as the prompt, and in character mode `__proto__` and `constructor` threw.
 * Each must load exactly as an unknown persona id does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCachedPrompt, loadSystemPrompt } from '../prompt-loader.js';

const PROTOTYPE_IDS = ['__proto__', '__PROTO__', 'constructor', 'toString', 'hasOwnProperty'];
const unknownPrompt = (id: string) => `You are ${id}, a helpful companion.`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('prompt loader: a prototype member name is an unknown persona id (#3631)', () => {
  it('the control: an unknown id loads the generic prompt', async () => {
    expect(await loadSystemPrompt('no-such-persona')).toBe(unknownPrompt('no-such-persona'));
    expect(getCachedPrompt('no-such-persona')).toBe(unknownPrompt('no-such-persona'));
  });

  it.each(PROTOTYPE_IDS)('%s: the full prompt is the unknown-persona prompt', async (id) => {
    expect(await loadSystemPrompt(id)).toBe(unknownPrompt(id));
  });

  it.each(PROTOTYPE_IDS)(
    '%s: the character-mode prompt is the unknown-persona prompt',
    async (id) => {
      vi.stubEnv('PROMPT_MODE', 'character');
      expect(await loadSystemPrompt(id)).toBe(unknownPrompt(id));
    }
  );

  it.each(PROTOTYPE_IDS)('%s: the cached prompt is the unknown-persona prompt', (id) => {
    expect(getCachedPrompt(id)).toBe(unknownPrompt(id));
  });

  it('a real persona still loads its own prompt, not the generic one', async () => {
    const prompt = await loadSystemPrompt('maya');
    expect(prompt).not.toBe(unknownPrompt('maya'));
    expect(prompt.length).toBeGreaterThan(unknownPrompt('maya').length);
  });
});
