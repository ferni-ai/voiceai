import { afterEach, describe, expect, it } from 'vitest';
import { loadSystemPrompt, promptMode } from '../prompt-loader.js';

describe('character prompt mode', () => {
  afterEach(() => {
    delete process.env['PROMPT_MODE'];
  });

  it('is off unless PROMPT_MODE=character', () => {
    expect(promptMode({})).toBe('full');
    expect(promptMode({ PROMPT_MODE: 'character' })).toBe('character');
  });

  it("uses Ferni's character sheet, a fraction of the full prompt, with no scripted lines", async () => {
    const full = await loadSystemPrompt('ferni');
    process.env['PROMPT_MODE'] = 'character';
    const character = await loadSystemPrompt('ferni');
    expect(character).toContain('This is who you are, not a script');
    expect(character.length).toBeLessThan(full.length / 3);
    expect(character).not.toMatch(/sounds exhausting|You did WHAT|What draws you to/);
  });
});
