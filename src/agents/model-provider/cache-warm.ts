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
 * Both fast-lane models are warmed. CASCADE_CACHE_WARM=on (or FIRST_TURN_FAST=on)
 * turns it on.
 *
 * @module agents/model-provider/cache-warm
 */

import { llm } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { FastLaneLLM } from './fast-lane.js';

const log = createLogger({ module: 'CacheWarm' });

/** How long the tools must stay unchanged before a warm is sent. */
export const WARM_SETTLE_MS = 750;

/** Warms per agent at most: the greeting's plus a few mid-call tool changes. */
const MAX_WARMS = 6;

export function cacheWarmEnabled(env: Record<string, string | undefined> = process.env): boolean {
  // FIRST_TURN_FAST covers every part of the first reply that is slow because it is first.
  return env.CASCADE_CACHE_WARM === 'on' || env.FIRST_TURN_FAST === 'on';
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

/** The models a first reply can go to. */
export function modelsToWarm(model: unknown): llm.LLM[] {
  if (model instanceof FastLaneLLM) return [model.fast, model.main];
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

async function warmOne(
  model: llm.LLM,
  agent: AgentView,
  toolCtx: llm.ToolContext,
  timeoutMs: number
): Promise<void> {
  const chatCtx = agent.chatCtx.copy();
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
    const models = modelsToWarm(agent.llm ?? s.llm);
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
