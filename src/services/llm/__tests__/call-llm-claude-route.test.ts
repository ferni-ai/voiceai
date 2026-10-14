/**
 * callLLM (llm-utils) with CLAUDE_LLM_TASKS: the real router, a fake Vertex
 * client that answers "gemini", and a fake Anthropic endpoint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: class {
    getGenerativeModel() {
      return {
        generateContent: async () => ({
          response: {
            candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'gemini' }] } }],
          },
        }),
      };
    }
  },
}));

const anthropic = vi.fn();

async function load() {
  vi.resetModules();
  const { resetAllCircuitBreakers } = await import('../../../utils/circuit-breaker.js');
  resetAllCircuitBreakers();
  return import('../../llm-utils.js');
}

beforeEach(() => {
  vi.stubEnv('USE_VERTEX_AI', 'true');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  anthropic.mockReset();
  vi.stubGlobal('fetch', anthropic);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const claudeSays = (text: string, status = 200) =>
  anthropic.mockResolvedValue(
    new Response(
      JSON.stringify(status === 200 ? { content: [{ type: 'text', text }] } : { error: {} }),
      { status }
    )
  );

describe('callLLM routing to Claude', () => {
  it('a summary stays on Gemini when CLAUDE_LLM_TASKS is unset', async () => {
    claudeSays('claude');
    const { createSummarizationLLMCaller } = await load();
    expect(await createSummarizationLLMCaller()('p')).toBe('gemini');
    expect(anthropic).not.toHaveBeenCalled();
  });

  it('a summary goes to Claude when CLAUDE_LLM_TASKS lists it', async () => {
    vi.stubEnv('CLAUDE_LLM_TASKS', 'summary');
    claudeSays('claude');
    const { createSummarizationLLMCaller } = await load();
    expect(await createSummarizationLLMCaller()('p')).toBe('claude');
    expect(anthropic).toHaveBeenCalledTimes(1);
  });

  it('falls back to Gemini when Claude fails', async () => {
    vi.stubEnv('CLAUDE_LLM_TASKS', 'summary');
    claudeSays('', 500);
    const { createSummarizationLLMCaller } = await load();
    expect(await createSummarizationLLMCaller()('p')).toBe('gemini');
    expect(anthropic).toHaveBeenCalledTimes(1);
  });

  it('untagged calls (emotion inference, mid-call) never go to Claude', async () => {
    vi.stubEnv('CLAUDE_LLM_TASKS', 'summary,memory,outreach');
    claudeSays('claude');
    const { createEmotionLLMCaller } = await load();
    expect(await createEmotionLLMCaller()('p')).toBe('gemini');
    expect(anthropic).not.toHaveBeenCalled();
  });
});
