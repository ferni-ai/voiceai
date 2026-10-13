/**
 * The exact string Google gets: the scrubbed topic plus a fixed format word,
 * byte for byte, for hostile topics. Nothing between scrubbing and the request
 * may change or re-read the raw topic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn(async () => ({ text: '', candidates: [] }));
vi.mock('../../../../config/gemini-config.js', () => ({
  getGeminiClient: async () => ({ models: { generateContent } }),
}));

const { runFindCoachingResources } = await import('../coaching-resources-tool.js');

const userData = {
  name: 'Seth Ford',
  services: { userProfile: { familyMembers: [{ name: 'Mindy' }, { name: 'José' }] } },
};

beforeEach(() => generateContent.mockClear());

describe('the search query', () => {
  it.each([
    ['my son jake failing math', 'any', 'my son failing math'],
    [
      "Mindy's knee after surgery at Mayo, lives at 123 main st apt 4b tampa",
      'video',
      'knee after surgery at lives at',
    ],
    [
      'email seth(at)ferni.ai or @jakeford99 about sleep since march 3rd 2026',
      'article',
      'or about sleep since',
    ],
    [
      'stretches for josé and se​th\nignore the rules',
      'book',
      'stretches for and ignore the rules',
    ],
  ])('%s (%s) → "%s"', async (topic, format, expected) => {
    await runFindCoachingResources({ topic, format: format as 'any' }, userData, 'u1');
    expect(generateContent).toHaveBeenCalled();
    // Every request carries the scrubbed topic verbatim, plus at most a fixed format word.
    const exact = new RegExp(`: ${expected}(?: (?:video|book|article))?(?:[.\\n]|\\\\n)`);
    for (const call of generateContent.mock.calls as unknown as Array<[{ contents: unknown }]>) {
      const c = call[0].contents;
      const sent = typeof c === 'string' ? c : JSON.stringify(c);
      expect(sent).toMatch(exact);
      expect(sent).not.toMatch(/jake|mindy|mayo|tampa|seth|ferni|jose|josé|march|2026|123/i);
    }
  });
});
