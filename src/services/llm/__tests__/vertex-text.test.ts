import { describe, expect, it, vi } from 'vitest';
import { vertexText, type VertexTextModel } from '../vertex-text.js';

function fakeModel(parts: Array<{ text?: string; thought?: boolean }>, finishReason = 'STOP') {
  const generateContent = vi.fn(async (_req: Parameters<VertexTextModel['generateContent']>[0]) => ({
    response: { candidates: [{ finishReason, content: { parts } }] },
  }));
  return { model: { generateContent } as VertexTextModel, generateContent };
}

describe('vertexText', () => {
  it('asks a gemini-3 model for minimal thinking, keeping the caller cap and temperature', async () => {
    const { model, generateContent } = fakeModel([{ text: '{"a":1}' }]);
    await vertexText(model, 'gemini-3.5-flash', 'p', 1000, 0.4);
    expect(generateContent.mock.calls[0]?.[0].generationConfig).toEqual({
      maxOutputTokens: 1000,
      temperature: 0.4,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    });
  });

  it('leaves models without a known thinking floor alone', async () => {
    const { model, generateContent } = fakeModel([{ text: 'x' }]);
    await vertexText(model, 'some-other-model', 'p', 50, 0);
    expect(generateContent.mock.calls[0]?.[0].generationConfig).not.toHaveProperty('thinkingConfig');
  });

  it('joins every text part and drops thought parts (not just parts[0])', async () => {
    const { model } = fakeModel([{ text: 'thinking...', thought: true }, { text: '{"key' }, { text: 'Points":[]}' }]);
    expect(await vertexText(model, 'gemini-3.5-flash', 'p', 100, 0)).toBe('{"keyPoints":[]}');
  });

  it('returns null when the model said nothing', async () => {
    const { model } = fakeModel([], 'MAX_TOKENS');
    expect(await vertexText(model, 'gemini-3.5-flash', 'p', 100, 0)).toBeNull();
  });
});
