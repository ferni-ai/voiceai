/**
 * #3872: callLLM's `timeout` (LLM_TIMEOUT_MS, 5 s by default) must end a call to a model that
 * never answers. It used to make an AbortController whose signal reached nothing, so a hung
 * Vertex or Gemini request held its caller for as long as the request hung. Real callLLM and
 * circuit breakers; only the SDK clients are stubbed, and nothing reaches the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const never = (): Promise<never> => new Promise(() => {});
const vertexGenerate = vi.fn();
const geminiGenerate = vi.fn();

vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: class {
    getGenerativeModel() {
      return { generateContent: vertexGenerate };
    }
  },
}));
vi.mock('openai', () => ({ default: class {} }));
vi.mock('../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../config/gemini-config.js')>()),
  getGeminiClient: async () => ({ models: { generateContent: geminiGenerate } }),
}));

/** callLLM as loaded with USE_VERTEX_AI set as given (llm-utils reads it once, on load). */
async function loadCallLLM(useVertex: 'true' | 'false') {
  vi.resetModules();
  vi.stubEnv('USE_VERTEX_AI', useVertex);
  return (await import('../llm-utils.js')).callLLM;
}

/** Settles with what callLLM returned, or 'still waiting' if it hadn't by `ms`. */
async function settledBy(call: Promise<string | null>, ms: number) {
  const outcome = call.then((text) => ({ text }));
  await vi.advanceTimersByTimeAsync(ms);
  return Promise.race([outcome, Promise.resolve('still waiting' as const)]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vertexGenerate.mockReset();
  geminiGenerate.mockReset();
  delete process.env.OPENAI_API_KEY;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('callLLM timeout (#3872)', () => {
  it('Vertex: a model that never answers gives null at the timeout, not a hang', async () => {
    const callLLM = await loadCallLLM('true');
    vertexGenerate.mockImplementation(never);
    const call = callLLM('p', { timeout: 1000 });
    expect(await settledBy(call, 999)).toBe('still waiting');
    expect(await settledBy(call, 1)).toEqual({ text: null });
    expect(vertexGenerate).toHaveBeenCalledTimes(1);
  });

  it('Gemini API: a model that never answers gives null at the timeout, not a hang', async () => {
    const callLLM = await loadCallLLM('false');
    geminiGenerate.mockImplementation(never);
    const call = callLLM('p', { timeout: 1000 });
    expect(await settledBy(call, 999)).toBe('still waiting');
    expect(await settledBy(call, 1)).toEqual({ text: null });
    expect(geminiGenerate).toHaveBeenCalledTimes(1);
  });

  it('an answer inside the timeout still comes back', async () => {
    const callLLM = await loadCallLLM('true');
    vertexGenerate.mockResolvedValue({
      response: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'hi' }] } }] },
    });
    expect(await settledBy(callLLM('p', { timeout: 1000 }), 0)).toEqual({ text: 'hi' });
  });

  it('timeouts count as breaker failures: enough hung calls open it, the next never asks', async () => {
    const callLLM = await loadCallLLM('true');
    const { CIRCUIT_FAILURE_THRESHOLD } = await import('../../config/resilience-config.js');
    vertexGenerate.mockImplementation(never);
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i++) {
      // eslint-disable-next-line no-await-in-loop -- each hung call times out before the next
      expect(await settledBy(callLLM('p', { timeout: 1000 }), 1000)).toEqual({ text: null });
    }
    expect(await settledBy(callLLM('p', { timeout: 1000 }), 0)).toEqual({ text: null });
    expect(vertexGenerate).toHaveBeenCalledTimes(CIRCUIT_FAILURE_THRESHOLD);
  });
});
