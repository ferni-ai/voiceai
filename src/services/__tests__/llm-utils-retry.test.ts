/**
 * One callLLM. services/llm/llm-utils.ts was an 85% copy whose only caller
 * (llm-dynamic-content) got a 429 retry the other 16 callers didn't. The copy
 * is gone; the retry lives in services/llm-utils.ts, on for callers that ask
 * (retry429). Real callLLM and
 * vertexText; only the Vertex SDK and OpenAI are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
}));
vi.mock('openai', () => ({ default: class {} }));

const { callLLM } = await import('../llm-utils.js');
const { resetAllCircuitBreakers } = await import('../../utils/circuit-breaker.js');

const ok = (text: string) => ({
  response: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] },
});
const rateLimited = () => new Error('[VertexAI.ClientError]: got status: 429 Too Many Requests');

beforeEach(() => {
  generateContent.mockReset();
  resetAllCircuitBreakers();
  delete process.env.OPENAI_API_KEY;
});

describe('callLLM 429 retry', () => {
  it('off by default: a 429 is not retried', async () => {
    generateContent.mockRejectedValueOnce(rateLimited()).mockResolvedValue(ok('late'));
    expect(await callLLM('p')).toBeNull();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('retry429: retries a 429 and returns the answer', async () => {
    generateContent.mockRejectedValueOnce(rateLimited()).mockResolvedValue(ok('hello'));
    expect(await callLLM('p', { retry429: true })).toBe('hello');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('other errors are not retried', async () => {
    generateContent.mockRejectedValue(new Error('400 bad request'));
    expect(await callLLM('p', { retry429: true })).toBeNull();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('stops after three retries', async () => {
    vi.useFakeTimers();
    try {
      generateContent.mockRejectedValue(rateLimited());
      const result = callLLM('p', { retry429: true });
      await vi.runAllTimersAsync();
      expect(await result).toBeNull();
      expect(generateContent).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
