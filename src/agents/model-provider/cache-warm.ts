/**
 * Warm the model's prompt cache while the greeting plays.
 *
 * Gemini reuses a cached prefix (system prompt + tools, ~8k tokens) across a
 * call's requests, but the first reply has nothing cached: on dev the first
 * turn was 0% cached vs 86% after, model first text 1,081 vs 871 ms and ready
 * to speak 1,654 vs 1,010 ms (n=58 / 119, 2026-10-10). The greeting is written
 * by another model, so the reply model's first request is the caller's first
 * turn. This sends one throwaway request with the agent's own instructions and
 * tools, reads one chunk and closes it.
 *
 * The warm must carry the tools the caller's turns will. The tool set is not
 * final when the greeting starts: on a prod call (2026-10-10) the post-greeting
 * expansion (agent-setup.ts) took the agent from 65 to 88 tools 16 ms after it,
 * and a mid-call domain load changed them again. So armPromptCacheWarm waits
 * until the tools have been unchanged for WARM_SETTLE_MS, sends the tools a
 * turn would (toolsForTurn), and warms again after each later change to them,
 * once per distinct tool set.
 *
 * Both fast-lane models are warmed (with CACHE_WARM_PRIMARY=on, each hedge's
 * primary rather than the hedge). CASCADE_CACHE_WARM=on (or FIRST_TURN_FAST=on)
 * turns it on.
 *
 * @module agents/model-provider/cache-warm
 */

import { llm } from '@livekit/agents';
import { flagOn } from '../../config/env-flag.js';
import { llmContextCacheEnabled } from '../../config/llm-context-cache-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { FastLaneLLM } from './fast-lane.js';
import { HedgedLLM } from './hedged-llm.js';

const log = createLogger({ module: 'CacheWarm' });

/** How long the tools must stay unchanged before a warm is sent. */
export const WARM_SETTLE_MS = 750;

/** Warms per agent at most: the greeting's plus a few mid-call tool changes. */
const MAX_WARMS = 6;

export function cacheWarmEnabled(env: Record<string, string | undefined> = process.env): boolean {
  // FIRST_TURN_FAST covers every part of the first reply that is slow because it is first.
  return (
    env.CASCADE_CACHE_WARM === 'on' || env.FIRST_TURN_FAST === 'on' || llmContextCacheEnabled(env)
  );
}

interface AgentView {
  chatCtx: llm.ChatContext;
  toolCtx: llm.ToolContext;
  llm?: unknown;
  updateTools?: (tools: never) => Promise<void>;
}

interface SessionView {
  llm?: unknown;
  userData: unknown;
  currentAgent?: AgentView;
}

/**
 * What the model is sent for these tools: names, descriptions and schemas. A
 * domain re-offered as new tool objects with the same content is the same set.
 */
export function toolContent(toolCtx: llm.ToolContext): string {
  return JSON.stringify(
    llm
      .sortedToolEntries(toolCtx)
      .map(([name, tool]) => [name, tool.description, llm.toJsonSchema(tool.parameters, false)])
  );
}

/**
 * The models a first reply can go to. A hedge is warmed through itself unless
 * CACHE_WARM_PRIMARY=on, which warms its primary directly. A warm starts cold, so
 * it can pass the hedge delay; the backup then starts, answers first, and the
 * primary's stream is closed before its prefix is cached. Prod 2026-10-23: the warm's
 * backup won at 1,304 ms and the caller's first turn had 0 of 13,755 tokens cached.
 */
export function modelsToWarm(
  model: unknown,
  env: Record<string, string | undefined> = process.env
): llm.LLM[] {
  if (model instanceof FastLaneLLM) {
    return [model.fast, model.main].flatMap((m) => modelsToWarm(m, env));
  }
  if (model instanceof HedgedLLM && flagOn('CACHE_WARM_PRIMARY', env)) {
    return modelsToWarm(model.primary, env);
  }
  return model instanceof llm.LLM ? [model] : [];
}

/**
 * The tools a reply's request would carry (minus a retrieval pick, which needs
 * the caller's words): see PersonaVoiceAgent.llmNode.
 */
async function turnTools(session: SessionView, agent: AgentView): Promise<llm.ToolContext> {
  // Loaded on use: the turn helpers pull in much of the agent graph, which
  // every importer of after-greeting.ts would otherwise load with the flag off.
  const { toolsForTurn } = await import('../personas/turn-request.js');
  const state = { loggedLockedHandoffs: true };
  return toolsForTurn(session, llm.ChatContext.empty(), agent.toolCtx, state);
}

/**
 * A copy of the chat without a tool call still waiting for its output (or an output
 * whose call is gone). A warm can land mid-tool: a handoff loads the next persona's
 * tools, the settle timer fires while handoffToMaya is still running, and the copy
 * carried the call alone. Prod call 2026-10-17: "function call missing the
 * corresponding function output, ignoring" twice, once per hedged model. The call and
 * its output stay in the real chat; only the throwaway warm request drops them.
 */
export function withPairedToolCalls(chatCtx: llm.ChatContext): llm.ChatContext {
  const calls = new Set<string>();
  const outputs = new Set<string>();
  for (const item of chatCtx.items) {
    if (item.type === 'function_call') calls.add(item.callId);
    if (item.type === 'function_call_output') outputs.add(item.callId);
  }
  const copy = chatCtx.copy();
  copy.items = copy.items.filter((item) => {
    if (item.type === 'function_call') return outputs.has(item.callId);
    if (item.type === 'function_call_output') return calls.has(item.callId);
    return true;
  });
  return copy;
}

async function warmOne(
  model: llm.LLM,
  agent: AgentView,
  toolCtx: llm.ToolContext,
  timeoutMs: number
): Promise<void> {
  const chatCtx = withPairedToolCalls(agent.chatCtx);
  chatCtx.addMessage({ role: 'user', content: 'Hey.' });
  const started = Date.now();
  const stream = model.chat({
    chatCtx,
    toolCtx,
    connOptions: { maxRetry: 0, retryIntervalMs: 0, timeoutMs },
  });
  try {
    for await (const _chunk of stream) break;
    log.info(
      {
        model: model.label(),
        ms: Date.now() - started,
        tools: Object.keys(toolCtx.functionTools).length,
      },
      'CACHE_WARM'
    );
  } catch (error) {
    log.warn({ model: model.label(), error: String(error) }, 'cache warm failed');
  } finally {
    stream.close();
  }
}

/** Never throws; does nothing unless CASCADE_CACHE_WARM=on. Returns the tool set warmed, if any. */
export async function warmPromptCache(
  session: unknown,
  env: Record<string, string | undefined> = process.env,
  timeoutMs = 10_000
): Promise<string | null> {
  if (!cacheWarmEnabled(env)) return null;
  try {
    const s = session as SessionView | undefined;
    const agent = s?.currentAgent;
    if (s === undefined || agent === undefined) return null;
    const models = modelsToWarm(agent.llm ?? s.llm, env);
    const toolCtx = await turnTools(s, agent);
    await Promise.all(models.map(async (m) => warmOne(m, agent, toolCtx, timeoutMs)));
    return toolContent(toolCtx);
  } catch (error) {
    log.warn({ error: String(error) }, 'cache warm skipped');
    return null;
  }
}

const armed = new WeakSet<object>();

/**
 * Warm once the agent's tools have settled, and again after each later change
 * to them (debounced; a tool set already warmed is not warmed again). Never
 * throws; does nothing unless CASCADE_CACHE_WARM=on.
 */
export function armPromptCacheWarm(
  session: unknown,
  env: Record<string, string | undefined> = process.env,
  settleMs = WARM_SETTLE_MS
): void {
  if (!cacheWarmEnabled(env)) return;
  const s = session as SessionView | undefined;
  const agent = s?.currentAgent;
  if (!s || !agent || armed.has(agent)) return;
  armed.add(agent);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let warmed: string | null = null;
  let warms = 0;
  const warmIfNew = async (): Promise<void> => {
    // A handoff replaced the agent, or the warms ran out: stop.
    if (s.currentAgent !== agent || warms >= MAX_WARMS) return;
    if (toolContent(await turnTools(s, agent)) === warmed) return;
    warms += 1;
    warmed = (await warmPromptCache(s, env)) ?? warmed;
  };
  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      warmIfNew().catch((error: unknown) =>
        log.warn({ error: String(error) }, 'cache warm skipped')
      );
    }, settleMs);
    timer.unref?.();
  };

  const update = agent.updateTools?.bind(agent);
  if (update !== undefined) {
    agent.updateTools = async (tools: never): Promise<void> => {
      const before = toolContent(agent.toolCtx);
      await update(tools);
      if (toolContent(agent.toolCtx) !== before) schedule();
    };
  }
  schedule();
}
