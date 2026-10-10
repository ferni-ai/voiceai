/**
 * Warm the model's prompt cache while the greeting plays.
 *
 * Gemini reuses a cached prefix (system prompt + tools, ~8k tokens) across a
 * call's requests, but the first reply has nothing cached: on dev the first
 * turn was 0% cached vs 86% after, model first text 1,081 vs 871 ms and ready
 * to speak 1,654 vs 1,010 ms (n=58 / 119, 2026-10-10). The greeting is written
 * by another model, so the reply model's first request is the caller's first
 * turn. This sends one throwaway request with the agent's own instructions and
 * tools as soon as the greeting starts, reads one chunk and closes it.
 *
 * Both fast-lane models are warmed. CASCADE_CACHE_WARM=on turns it on.
 *
 * @module agents/model-provider/cache-warm
 */

import { llm } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { FastLaneLLM } from './fast-lane.js';

const log = createLogger({ module: 'CacheWarm' });

export function cacheWarmEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CASCADE_CACHE_WARM === 'on';
}

interface AgentView {
  chatCtx: llm.ChatContext;
  toolCtx: llm.ToolContext;
  llm?: unknown;
}

interface SessionView {
  llm?: unknown;
  currentAgent?: AgentView;
}

/** The models a first reply can go to. */
export function modelsToWarm(model: unknown): llm.LLM[] {
  if (model instanceof FastLaneLLM) return [model.fast, model.main];
  return model instanceof llm.LLM ? [model] : [];
}

async function warmOne(model: llm.LLM, agent: AgentView, timeoutMs: number): Promise<void> {
  const chatCtx = agent.chatCtx.copy();
  chatCtx.addMessage({ role: 'user', content: 'Hey.' });
  const started = Date.now();
  const stream = model.chat({
    chatCtx,
    toolCtx: agent.toolCtx,
    connOptions: { maxRetry: 0, retryIntervalMs: 0, timeoutMs },
  });
  try {
    for await (const _chunk of stream) break;
    log.info({ model: model.label(), ms: Date.now() - started }, 'CACHE_WARM');
  } catch (error) {
    log.warn({ model: model.label(), error: String(error) }, 'cache warm failed');
  } finally {
    stream.close();
  }
}

/** Never throws; does nothing unless CASCADE_CACHE_WARM=on. */
export async function warmPromptCache(
  session: unknown,
  env: Record<string, string | undefined> = process.env,
  timeoutMs = 10_000
): Promise<void> {
  if (!cacheWarmEnabled(env)) return;
  try {
    const s = session as SessionView | undefined;
    const agent = s?.currentAgent;
    if (!agent) return;
    const models = modelsToWarm(agent.llm ?? s?.llm);
    await Promise.all(models.map((m) => warmOne(m, agent, timeoutMs)));
  } catch (error) {
    log.warn({ error: String(error) }, 'cache warm skipped');
  }
}
