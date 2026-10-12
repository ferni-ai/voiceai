/**
 * Landing copy must reach Gemini through the shared @google/genai client. It
 * used to call `client.getGenerativeModel`, which that client doesn't have:
 * 2,377 "Gemini generation failed" errors on john-bogle-ui from 10-10 to 10-12,
 * with every page variant on fallback copy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { generateSentimentReactiveCopy, sendDemoChatMessage } from '../ai-interactions.js';

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  getGeminiClient.mockResolvedValue({ models: { generateContent } });
});

describe('landing gemini-client on the shared client', () => {
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

describe('ai-interactions on the shared client', () => {
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

  it('demo chat sends the history plus the new turn in one request', async () => {
    generateContent.mockResolvedValue({ text: 'What is weighing on you?' });

    await sendDemoChatMessage('visitor-1', 'hi there');
    const reply = await sendDemoChatMessage('visitor-1', 'work is a lot');

    expect(reply.response).toBe('What is weighing on you?');
    const { contents } = generateContent.mock.calls[1][0];
    expect(contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
    expect(contents[2].parts[1]).toEqual({ text: 'work is a lot' });
  });
});
