/**
 * When OpenAI can't analyse a call transcript, the fallback is the shared Gemini
 * client (Vertex on the configured location), never the API-key Gemini API,
 * whose processing location can't be chosen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
const getGeminiClient = vi.fn();

vi.mock('../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/gemini-config.js')>()),
  getGeminiClient: () => getGeminiClient(),
}));

import { getDefaultModel } from '../../../config/gemini-config.js';
import { analyzeCallTranscript, type CallTranscript } from '../call-transcript-intelligence.js';

const transcript: CallTranscript = {
  callId: 'call-fictional-1',
  contactName: 'Aunt Rosa',
  relationship: 'aunt',
  turns: [
    { role: 'agent', content: 'Hi Rosa, Sam asked me to check in.', timestamp: 0 },
    { role: 'recipient', content: 'Tell Sam the garden is full of tomatoes!', timestamp: 1 },
  ],
  duration: 60,
  capturedAt: '',
};

const urls: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  urls.length = 0;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.GOOGLE_API_KEY = 'test-key';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: false, status: 500 } as Response;
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
});

describe('call analysis fallback', () => {
  it('uses the shared client after OpenAI fails, and never calls the API-key Gemini API', async () => {
    getGeminiClient.mockResolvedValue({ models: { generateContent } });
    generateContent.mockResolvedValue({
      text: '{"summary":"Rosa is swimming in tomatoes.","objectiveAchieved":true}',
    });

    const insights = await analyzeCallTranscript(transcript, 'check in', 'Sam');

    expect(generateContent).toHaveBeenCalledTimes(1);
    const req = generateContent.mock.calls[0][0] as {
      model: string;
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(req.model).toBe(getDefaultModel());
    expect(req.contents[0].parts[0].text).toContain('garden is full of tomatoes');
    expect(insights.summary).toBe('Rosa is swimming in tomatoes.');
    expect(urls.some((u) => u.includes('generativelanguage.googleapis.com'))).toBe(false);
    expect(urls).toEqual(['https://api.openai.com/v1/chat/completions']);
  });

  it('falls back to basic insights when there is no shared client either', async () => {
    getGeminiClient.mockResolvedValue(null);

    const insights = await analyzeCallTranscript(transcript, 'check in', 'Sam');

    expect(insights.summary).toBe('Spoke with Aunt Rosa about check in.');
    expect(urls.some((u) => u.includes('generativelanguage.googleapis.com'))).toBe(false);
  });
});
