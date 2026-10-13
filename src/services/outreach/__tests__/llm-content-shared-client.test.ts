/**
 * Check-in copy must come from the shared Gemini client (Vertex via ADC), not an
 * API-key-only SDK: the UI server mounts no Gemini key, so every text fell back
 * to "Thinking of you. How are things going?".
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
  getGeminiClient: () => getGeminiClient(),
}));
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log }));

import { getContentGenerationModel } from '../../../config/gemini-config.js';
import { generatePersonalizedContent, type UserContext } from '../llm-content-generator.js';

const user: UserContext = {
  userId: 'u1',
  name: 'Ann',
  daysSinceSignup: 9,
  conversationCount: 4,
  engagementLevel: 'medium',
  primaryConcerns: ['her garden'],
};

describe('generatePersonalizedContent on the shared Gemini client', () => {
  beforeEach(() => {
    delete process.env.GEMINI_OUTREACH_MODEL;
    vi.clearAllMocks();
    generateContent.mockResolvedValue({ text: 'Hey Ann, how are the tomatoes doing?' });
    getGeminiClient.mockResolvedValue({ models: { generateContent } });
  });

  it('writes the text through the shared client with the content-generation model', async () => {
    const content = await generatePersonalizedContent(user, 'thinking_of_you', 'sms');

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].model).toBe(getContentGenerationModel());
    expect(content.text).toBe('Hey Ann, how are the tomatoes doing?');
    expect(content.reason).not.toContain('fallback');
  });

  it('falls back to the brand template and logs the error when the client call fails', async () => {
    generateContent.mockRejectedValue(new Error('vertex 503'));

    const content = await generatePersonalizedContent(user, 'thinking_of_you', 'sms');

    expect(content.text).toBe('Hey Ann. Just thinking of you. No agenda.');
    expect(content.reason).toBe('thinking_of_you - fallback');
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('vertex 503'), userId: 'u1' }),
      'Content generation failed'
    );
  });

  it('treats an empty reply as a failure instead of sending a blank text', async () => {
    generateContent.mockResolvedValue({ text: '' });

    const content = await generatePersonalizedContent(user, 'thinking_of_you', 'sms');

    expect(content.text).toBe('Hey Ann. Just thinking of you. No agenda.');
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Empty reply') }),
      'Content generation failed'
    );
  });

  it('keeps the canned line and warns when Gemini is not configured', async () => {
    getGeminiClient.mockResolvedValue(null);

    const content = await generatePersonalizedContent(user, 'thinking_of_you', 'sms');

    expect(content.text).toBe('Thinking of you. How are things going?');
    expect(generateContent).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      'Gemini client not configured, using fallback content generation'
    );
  });
});
