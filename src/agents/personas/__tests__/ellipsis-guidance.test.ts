/**
 * Mid-sentence "..." is the one measured, controllable cause of Ferni's
 * mid-sentence breaks: Cartesia turns each into a 230-790 ms pause, and
 * removing it removed the pause in every offline render (dev measurement,
 * 2026-10-03). The live cascade prompts must not teach it: trailing off is
 * for the end of a turn, described rather than shown.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
});

async function cascadePrompts(): Promise<[string, string]> {
  vi.resetModules();
  const factory = await import('../../model-provider/factory.js');
  const { CartesiaCascadeProvider } = await import('../../model-provider/cartesia-cascade.js');
  factory.setModelProvider(new CartesiaCascadeProvider() as never);
  const loader = await import('../prompt-loader.js');
  return [await loader.loadModelBaseInstructions(), await loader.loadSystemPrompt('ferni')];
}

/** An ellipsis with more of the sentence after it, as in "just... huge". */
const MID_SENTENCE_ELLIPSIS = /(?:\.\.\.|…)\s*[a-z]/;

describe('ellipsis guidance in the live Ferni prompts (Cartesia cascade)', () => {
  it('keeps "..." to the end of a turn', async () => {
    const [base] = await cascadePrompts();
    expect(base).toMatch(/"\.\.\."[^\n]*end of (?:your|a) turn/i);
    expect(base).toMatch(/never (?:inside|in the middle of) a sentence/i);
  }, 60_000);

  it('shows no example of a mid-sentence ellipsis', async () => {
    const [base, system] = await cascadePrompts();
    const offending = `${base}\n${system}`
      .split('\n')
      .filter((line) => MID_SENTENCE_ELLIPSIS.test(line));
    expect(offending).toEqual([]);
  }, 60_000);
});
