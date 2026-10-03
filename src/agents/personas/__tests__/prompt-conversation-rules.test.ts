/**
 * The live Ferni prompt (character mode, Cartesia cascade) keeps the call
 * about the caller. On the 2026-10-03 dev call "It's hard to say" got
 * Ferni's own grief back, direct questions got anecdotes, and a misheard
 * "Imagine trundle was useful" got riffed on for two turns.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
});

afterEach(() => {
  delete process.env.PROMPT_MODE;
  delete process.env.CONVERSATION_RULES;
});

async function livePrompts(): Promise<[string, string]> {
  process.env.PROMPT_MODE = 'character';
  vi.resetModules();
  const factory = await import('../../model-provider/factory.js');
  const { CartesiaCascadeProvider } = await import('../../model-provider/cartesia-cascade.js');
  factory.setModelProvider(new CartesiaCascadeProvider() as never);
  const loader = await import('../prompt-loader.js');
  return [await loader.loadModelBaseInstructions(), await loader.loadSystemPrompt('ferni')];
}

describe('conversation rules in the live Ferni prompt', () => {
  it('keeps every reply about what the caller just said', async () => {
    const [base] = await livePrompts();
    expect(base).toContain('## Whose call this is');
    expect(base).toContain('Your first sentence responds to their latest words');
    expect(base).toContain('When they ask you something directly, answer it directly');
    expect(base).toContain(
      "When they share something hard, or can't put it into words, stay on them"
    );
    expect(base).toContain('At most one story about yourself a call unless they ask for more');
    expect(base).toContain('Never say the same sentence, image or detail twice in a call');
    expect(base).toContain('one to three sentences');
    expect(base).toContain('"Already said this call"');
    // #171's rules stay.
    expect(base).toContain('It holds for the whole reply');
    expect(base).toContain('No ellipses');
  }, 60_000);

  it('asks when the words look misheard instead of riffing on them', async () => {
    const [base] = await livePrompts();
    expect(base).toContain("you probably misheard: ask about the part that didn't fit");
    expect(base).toContain("Don't build on it, and don't bring it back later");
    // The old rule answered nonsense with "mm?" and let it go.
    expect(base).not.toMatch(/stops mid-thought or doesn't make sense/);
  }, 60_000);

  it("doesn't invite volunteered stories in the character sheet", async () => {
    const [base, system] = await livePrompts();
    expect(system).toContain('Tanaka-san'); // the backstory is still there for when they ask
    expect(system).not.toContain('a small story of your own when it fits');
    expect(system).toContain('a small story of your own when they ask about you');
    expect(base).not.toContain('or share something, and let them lead');
  }, 60_000);

  it('leaves the rules out with CONVERSATION_RULES=off', async () => {
    process.env.CONVERSATION_RULES = 'off';
    const [base] = await livePrompts();
    expect(base).not.toContain('## Whose call this is');
    expect(base).toContain('No ellipses');
  }, 60_000);
});
