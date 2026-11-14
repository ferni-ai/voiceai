/**
 * Landing copy must reach Gemini through the shared @google/genai client. It
 * used to call `client.getGenerativeModel`, which that client doesn't have:
 * 2,377 "Gemini generation failed" errors on john-bogle-ui from 10-10 to 10-12,
 * with every page variant on fallback copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
const getGeminiClient = vi.fn();
const log = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/gemini-config.js')>()),
  isGeminiConfigured: () => true,
  // A client with only the @google/genai surface: no getGenerativeModel.
  getGeminiClient: () => getGeminiClient(),
}));
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log }));

import { clearCache, generateJSON, generateText } from '../gemini-client.js';
import { generatePersonaPreview, generateSentimentReactiveCopy } from '../ai-interactions.js';

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  vi.stubEnv('LANDING_AI', 'on');
  getGeminiClient.mockResolvedValue({ models: { generateContent } });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

// The landing routes are public, so the model must stay unreachable until
// LANDING_AI is turned on.
describe('with LANDING_AI unset (default off)', () => {
  beforeEach(() => {
    vi.stubEnv('LANDING_AI', undefined);
    generateContent.mockResolvedValue({ text: 'model reply' });
  });

  it('persona preview returns the static fallback without calling the client', async () => {
    const preview = await generatePersonaPreview({
      persona: 'ferni',
      question: 'how do you handle stress?',
    });

    expect(preview.response).toBe(
      "That sounds like a lot to carry. What's weighing on you the most right now?"
    );
    expect(getGeminiClient).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('AI variants (generateJSON / generateText) return null without calling the client', async () => {
    expect(await generateJSON('write a headline', { skipCache: true })).toBeNull();
    expect(await generateText('Say "ok"')).toBeNull();
    expect(getGeminiClient).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe('landing gemini-client on the shared client (LANDING_AI=on)', () => {
  it('generateJSON calls models.generateContent and parses the reply', async () => {
    generateContent.mockResolvedValue({ text: '{"headline":"Finally, someone who listens"}' });

    const result = await generateJSON<{ headline: string }>('write a headline', {
      skipCache: true,
    });

    expect(result).toEqual({ headline: 'Finally, someone who listens' });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config).toMatchObject({ maxOutputTokens: 500 });
  });

  it('generateText calls models.generateContent and trims the reply', async () => {
    generateContent.mockResolvedValue({ text: '  ok \n' });

    expect(await generateText('Say "ok"')).toBe('ok');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('returns null and logs the error when the client call fails', async () => {
    generateContent.mockRejectedValue(new Error('vertex 503'));

    expect(await generateJSON('write a headline', { skipCache: true })).toBeNull();
    expect(log.error).toHaveBeenCalledWith(
      { error: expect.objectContaining({ message: 'vertex 503' }) },
      'Gemini generation failed'
    );
  });
});

describe('ai-interactions on the shared client (LANDING_AI=on)', () => {
  const request = {
    sentiment: 0.2,
    currentSection: 'hero',
    timeOnPage: 30,
    originalCopy: { ctaText: 'Start now' },
  };

  it('sentiment copy is generated through models.generateContent', async () => {
    generateContent.mockResolvedValue({ text: '{"ctaText":"No rush","reason":"hesitant"}' });

    expect(await generateSentimentReactiveCopy(request)).toEqual({
      ctaText: 'No rush',
      reason: 'hesitant',
    });
    expect(generateContent.mock.calls[0][0].config).toMatchObject({
      responseMimeType: 'application/json',
    });
  });

  it('sentiment copy keeps its fallback and logs the error when the call fails', async () => {
    generateContent.mockRejectedValue(new Error('vertex 503'));

    expect(await generateSentimentReactiveCopy(request)).toEqual({
      reason: 'Generation failed',
    });
    expect(log.error).toHaveBeenCalledWith(
      { error: expect.objectContaining({ message: 'vertex 503' }) },
      'Failed to generate sentiment-reactive copy'
    );
  });

  it('persona preview is generated through models.generateContent', async () => {
    generateContent.mockResolvedValue({ text: 'I breathe first, then pick one thing.' });

    const preview = await generatePersonaPreview({ persona: 'ferni', question: 'stress?' });

    expect(preview.response).toBe('I breathe first, then pick one thing.');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
