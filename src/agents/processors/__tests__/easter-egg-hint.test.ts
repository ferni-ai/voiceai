/**
 * Easter eggs used to make the model open with a canned line ("A wedding!
 * That's wonderful! Congratulations!") even when the user said they were
 * nervous about it, and to drop random scripted quirks into turns. The model
 * now gets a hint about what the user shared and answers in its own words.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const checker = vi.fn();
vi.mock('../cached-modules.js', () => ({ getEasterEggChecker: async () => checker }));

import { checkEasterEggs } from '../easter-egg-handler.js';

const ctx = (userText: string) =>
  ({
    userText,
    persona: { id: 'ferni' },
    services: { userProfile: {} },
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }) as unknown as Parameters<typeof checkEasterEggs>[0];

const injectedText = (turnCtx: llm.ChatContext) =>
  turnCtx.items.map((item) => String((item as { textContent?: string }).textContent ?? '')).join('\n');

describe('easter egg injection', () => {
  beforeEach(() => checker.mockReset());

  it('hints at the news instead of scripting the opening line', async () => {
    checker.mockReturnValue({
      type: 'wedding',
      response: '<emotion value="happy"/>A wedding! That\'s wonderful! Congratulations!',
      triggered: true,
    });
    const turnCtx = llm.ChatContext.empty();

    await checkEasterEggs(ctx("my sister's wedding is next month and I'm nervous"), turnCtx);

    const text = injectedText(turnCtx);
    expect(text).toMatch(/wedding/i);
    expect(text).not.toContain('Congratulations!');
    expect(text).not.toMatch(/start with/i);
    expect(text).not.toContain('<emotion');
  });

  it('does not inject random personality quirks', async () => {
    checker.mockReturnValue({
      type: 'personality_quirk',
      response: "[laughter] Okay I'm in a weird mood today.",
      triggered: true,
    });
    const turnCtx = llm.ChatContext.empty();

    const result = await checkEasterEggs(ctx('how was your day'), turnCtx);

    expect(turnCtx.items).toHaveLength(0);
    expect(result).toBeUndefined();
  });
});
