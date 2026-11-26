/**
 * services/llm-utils.js with no model behind it.
 *
 * For a test that drives code which asks a model on the side (a summary, an
 * emotion read, a reworded outreach line) and is not about the answer. Each
 * function answers the way the real one does when no provider is configured,
 * so production takes its fallback: what these tests ran against before, after
 * a real client had been built and had failed.
 *
 *   vi.mock('../../services/llm-utils.js', async () =>
 *     (await import('../../tests/helpers/no-model.js')).llmUtilsWithNoModel()
 *   );
 *
 * The import sits inside the factory because vi.mock is hoisted above a test
 * file's own imports.
 */
import { vi } from 'vitest';

type LlmUtils = typeof import('../../services/llm-utils.js');

export function llmUtilsWithNoModel(): LlmUtils {
  const callLLM = vi.fn(async () => null);
  const callLLMForJSON = vi.fn(async () => null);
  const noText = (): ((prompt: string) => Promise<string>) => async () => '';
  const callers = {
    callLLM,
    callLLMForJSON,
    createEmotionLLMCaller: noText,
    createSummarizationLLMCaller: noText,
  };
  return { ...callers, warmVertexClient: async () => false, default: callers };
}
