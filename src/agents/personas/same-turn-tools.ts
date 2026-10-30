/**
 * TOOLS_SAME_TURN: the tools a turn's words point to go into that turn's own
 * request (config/same-turn-tools-config.ts has the why).
 *
 * The SDK hands llmNode the reply's tool context and runs the reply's tool
 * calls against that same object (agent_activity pipelineReplyTask:
 * performLLMInference and performToolExecutions share `toolCtx`), so tools
 * added to it here are both offered and runnable this turn. The agent's own
 * tools are left alone: changing them as the turn ends voids LiveKit's
 * preemptive reply (the tools are compared after onUserTurnCompleted), and
 * this turn's reply would then wait the whole LLM time. The deferred update
 * still gives the agent the domain once its reply starts, for later turns.
 *
 * The lookup is synchronous: the session loader's topic patterns, then its
 * domains' tools built from the registry. A domain whose module isn't in the
 * registry yet is skipped (the call start preloads every topic domain:
 * preloadTopicDomains). Built once per turn text; llmNode runs several times a
 * turn (preemptive, final, after tools).
 *
 * @module agents/personas/same-turn-tools
 */
import { llm } from '@livekit/agents';
import { SAME_TURN_MAX_TOOLS, sameTurnToolsEnabled } from '../../config/same-turn-tools-config.js';
import {
  forbiddenToolsNow,
  withoutForbiddenTools,
} from '../../tools/orchestrator/persona-tool-policy.js';
import { TOPIC_TO_DOMAINS } from '../../tools/dynamic-loader/topic-mappings.js';
import { SAME_TURN_TOPIC_PATTERNS } from '../../tools/dynamic-loader/same-turn-topics.js';
import { smartHomeTopicPatterns } from '../../tools/dynamic-loader/index.js';
import { loadToolDomainsLazy } from '../../tools/registry/loader.js';
import type { ToolDomain } from '../../tools/registry/types.js';
import { latestUserText } from '../../tools/retrieval/turn-tool-retrieval.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SameTurnTools' });

/** The slice of the session's DynamicToolLoader this uses. */
export interface SameTurnLoader {
  detectTopics: (message: string) => { detectedTopics: string[]; suggestedDomains: ToolDomain[] };
  getToolsForDomains: (domains: readonly string[]) => Record<string, unknown>;
}

interface TurnPick {
  text: string;
  tools: Record<string, unknown>;
}

const loaders = new WeakMap<object, SameTurnLoader>();
const picks = new WeakMap<object, TurnPick>();

/** Agent setup: this call's loader, for the persona agent's llmNode. */
export function registerSameTurnLoader(session: object, loader: SameTurnLoader): void {
  loaders.set(session, loader);
}

/** Every domain a topic can load, so the same-turn lookup finds them registered. */
export async function preloadTopicDomains(): Promise<number> {
  const domains = new Set<ToolDomain>();
  for (const list of Object.values(TOPIC_TO_DOMAINS)) list.forEach((d) => domains.add(d));
  for (const [, list] of SAME_TURN_TOPIC_PATTERNS) list.forEach((d) => domains.add(d));
  for (const [, list] of smartHomeTopicPatterns()) list.forEach((d) => domains.add(d));
  return loadToolDomainsLazy([...domains]);
}

/** This turn's topic tools the request lacks, at most SAME_TURN_MAX_TOOLS. */
function pickFor(session: object, loader: SameTurnLoader, text: string): Record<string, unknown> {
  const cached = picks.get(session);
  if (cached?.text === text) return cached.tools;
  const started = Date.now();
  const { detectedTopics, suggestedDomains } = loader.detectTopics(text);
  let tools: Record<string, unknown> = {};
  if (suggestedDomains.length > 0) {
    // Handoffs come from the session's own build (handoff-availability.ts).
    const built = Object.entries(loader.getToolsForDomains(suggestedDomains)).filter(
      ([name]) => !name.startsWith('handoffTo')
    );
    tools = Object.fromEntries(built);
    log.info(
      {
        topics: detectedTopics,
        domains: suggestedDomains,
        built: built.length,
        ms: Date.now() - started,
      },
      'TOOLS_SAME_TURN pick'
    );
  }
  picks.set(session, { text, tools });
  return tools;
}

/**
 * Add this turn's topic tools to the reply's tool context (mutated in place,
 * as withPinnedTools does). Returns the names added; empty when the flag is
 * off, no loader is registered, or the words name no topic.
 */
export function withSameTurnTools(
  session: object,
  chatCtx: llm.ChatContext,
  toolCtx: llm.ToolContext,
  /** The agent whose reply this is: its persona's policy applies (else the session's userData) */
  agent?: object
): string[] {
  if (!sameTurnToolsEnabled()) return [];
  const loader = loaders.get(session);
  const text = loader ? latestUserText(chatCtx) : null;
  if (!loader || !text) return [];
  try {
    const have = toolCtx.functionTools;
    const forbidden = forbiddenToolsNow(agent ?? session); // PERSONA_TOOL_POLICY
    const picked = withoutForbiddenTools(pickFor(session, loader, text.toLowerCase()), forbidden);
    const missing = Object.entries(picked)
      .filter(([name]) => !(name in have))
      .slice(0, SAME_TURN_MAX_TOOLS);
    if (missing.length === 0) return [];
    const added = llm.toToolContext(Object.fromEntries(missing) as never).tools;
    toolCtx.updateTools([...toolCtx.tools, ...added]);
    const names = missing.map(([name]) => name);
    log.info(
      { added: names, toolCount: Object.keys(toolCtx.functionTools).length },
      'TOOLS_SAME_TURN'
    );
    return names;
  } catch (error) {
    log.warn({ error: String(error) }, 'Same-turn tools not added; the deferred update still runs');
    return [];
  }
}
