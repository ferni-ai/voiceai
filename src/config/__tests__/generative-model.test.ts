import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
const getGeminiClient = vi.fn();
vi.mock('../gemini-config.js', () => ({ getGeminiClient: () => getGeminiClient() }));

import { getGenerativeModel } from '../generative-model.js';

describe('getGenerativeModel (old-SDK shape over the shared client)', () => {
  beforeEach(() => {
    generateContent.mockReset().mockResolvedValue({ text: '{"ok":true}' });
    getGeminiClient.mockReset().mockResolvedValue({ models: { generateContent } });
  });

  it('returns null when Gemini is not configured', async () => {
    getGeminiClient.mockResolvedValue(null);
    expect(await getGenerativeModel({ model: 'gemini-3.5-flash' })).toBeNull();
  });

  it('sends a string prompt with the model-level config and exposes response.text()', async () => {
    const model = await getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    });
    const result = await model!.generateContent('extract facts');

    expect(result.response.text()).toBe('{"ok":true}');
    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-3.5-flash',
      contents: 'extract facts',
      config: { temperature: 0.1, responseMimeType: 'application/json' },
    });
  });

  it('passes structured contents through and lets per-request config override', async () => {
    const model = await getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: { temperature: 0.5 },
      systemInstruction: 'be terse',
    });
    const contents = [{ role: 'user', parts: [{ text: 'hi' }] }];
    await model!.generateContent({ contents, generationConfig: { temperature: 0.2 } });

    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-3.5-flash',
      contents,
      config: { temperature: 0.2, systemInstruction: 'be terse' },
    });
  });

  it('returns empty text instead of throwing when the response has none', async () => {
    generateContent.mockResolvedValue({});
    const model = await getGenerativeModel({ model: 'gemini-3.5-flash' });
    expect((await model!.generateContent('x')).response.text()).toBe('');
  });
});
