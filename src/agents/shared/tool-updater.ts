/**
 * Tool Updater - Mid-Session Tool Updates for Voice AI
 *
 * Adds tools to a running agent (e.g. domain tools the semantic router picks
 * for a turn) through the LiveKit Agents SDK's public API:
 * `agent.toolCtx` holds the current tools and `agent.updateTools()` replaces
 * them. The SDK forwards the change to the LLM: per-request for text LLMs, and
 * via the realtime session for realtime models.
 *
 * SDK 1.5.1 removed the private `_tools` field this module used to mutate, so
 * every update silently returned false and calls kept their initial tools.
 *
 * ## Provider notes
 * - Text LLMs (cascade) and OpenAI Realtime: updates apply on the next request.
 * - Gemini Live (incl. native audio): the plugin cannot change tools mid-session
 *   (`midSessionToolsUpdate: false`); updateTools() reconnects the session.
 *   Callers check isMidSessionToolUpdateSafe() first.
 * - JSON-workaround providers additionally get a short system note naming the
 *   new tools, because they call tools by name in text.
 *
 * @see https://docs.livekit.io/agents/logic-structure/tools/
 */

import { voice } from '@livekit/agents';
import { capToolsToLimit, getMaxTools, isMetaToolEnabled } from '../../config/tool-config.js';
import { withoutSharedHandoffs } from '../../tools/handoff/handoff-availability.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getModelProvider } from '../model-provider/index.js';
import type { UserData } from './types.js';
import { resolveInitialToolLimit } from '../multi-agent/initial-tools.js';

const log = createLogger({ module: 'ToolUpdater' });

/** Providers whose realtime session reconnects when its tools change. */
const RESTART_ON_TOOL_UPDATE = new Set(['gemini-live', 'gemini-native-audio']);

/** The slice of the SDK Agent this module relies on. */
interface ToolCapableAgent {
  readonly toolCtx: { readonly functionTools: Record<string, unknown> };
  updateTools(tools: Record<string, unknown>): Promise<void>;
  readonly chatCtx?: { copy(): ChatContextLike };
  updateChatCtx?(chatCtx: ChatContextLike): Promise<void>;
}

interface ChatContextLike {
  addMessage(params: { role: 'system'; content: string }): unknown;
}

function asToolCapable(agent: voice.Agent<UserData>): ToolCapableAgent {
  return agent as unknown as ToolCapableAgent;
}

/**
 * The agent's current tools as an anonymous-tool record (what updateTools()
 * accepts). The SDK stamps `id` and `name` onto each tool it stores; a record
 * entry that carries them is rejected, so they are stripped here.
 */
function currentToolRecord(agent: ToolCapableAgent): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(agent.toolCtx.functionTools)) {
    const { id: _id, name: _name, ...anonymous } = tool as Record<string, unknown>;
    record[name] = anonymous;
  }
  return record;
}

let warnedMetaTool = false;

/**
 * Update tools mid-session for any LLM provider.
 *
 * Merges `newTools` into the agent's tools and applies them via
 * `agent.updateTools()`. Respects TOOL_LIMIT (capToolsToLimit keeps must-keep
 * tools first). Handoff tools in `newTools` are ignored: the shared catalogs
 * passed here carry a handoff to every persona, while the agent's own came
 * from its per-user build (see handoff-availability.ts).
 *
 * @param agent - The voice agent instance
 * @param offeredTools - New tools to add (merged with existing)
 * @param options - Optional configuration
 * @returns true if the agent's tools are up to date, false if the update failed
 */
export async function updateAgentTools(
  agent: voice.Agent<UserData>,
  offeredTools: Record<string, unknown>,
  options: {
    /** Domain names for better logging/messaging */
    domains?: string[];
    /** Skip informing a JSON-workaround LLM about new tools */
    silentMerge?: boolean;
    /** Re-apply the tools even if none are new */
    forceSync?: boolean;
  } = {}
): Promise<boolean> {
  const provider = getModelProvider();
  const { domains = [], silentMerge = false, forceSync = false } = options;
  const target = asToolCapable(agent);
  const newTools = withoutSharedHandoffs(offeredTools);

  try {
    const existing = currentToolRecord(target);
    const actuallyNew = Object.keys(newTools).filter((name) => !(name in existing));

    if (!forceSync && actuallyNew.length === 0) {
      log.debug({ attemptedTools: Object.keys(newTools) }, 'All tools already registered');
      return true;
    }

    if (isMetaToolEnabled() && !warnedMetaTool) {
      warnedMetaTool = true;
      log.warn(
        'USE_META_TOOL is set, but the meta-tool declaration is not an executable SDK tool; updating regular tools instead'
      );
    }

    // The tools just asked for come first, so the cap evicts the oldest
    // non-essential ones, not them. Same cap as the first agent (64 when
    // TOOL_LIMIT is unset): uncapped, a dev call grew 64 -> 160 -> 213 tools,
    // ~9.5k prompt tokens on every turn.
    const merged = capToolsToLimit(
      { ...newTools, ...existing, ...newTools },
      resolveInitialToolLimit(getMaxTools())
    );

    await target.updateTools(merged);

    log.info(
      {
        existingCount: Object.keys(existing).length,
        newTools: actuallyNew.slice(0, 10),
        totalCount: Object.keys(merged).length,
        provider: provider.id,
        forceSync,
      },
      '🔧 Agent tools updated'
    );

    if (!provider.hasNativeFunctionCalling() && !silentMerge && actuallyNew.length > 0) {
      await announceNewTools(target, actuallyNew, domains);
    }
    return true;
  } catch (error) {
    log.error({ error: String(error), provider: provider.id }, 'Failed to update agent tools');
    return false;
  }
}

/**
 * JSON-workaround providers call tools by writing their name in text, so they
 * need to be told which tools just became available.
 */
async function announceNewTools(
  agent: ToolCapableAgent,
  toolNames: string[],
  domains: string[]
): Promise<void> {
  if (!agent.chatCtx || !agent.updateChatCtx) return;

  const toolList = toolNames.slice(0, 10).join(', ');
  const moreCount = toolNames.length > 10 ? ` and ${toolNames.length - 10} more` : '';
  const domainInfo = domains.length > 0 ? ` (${domains.join(', ')})` : '';
  const content = `[SYSTEM: New tools now available${domainInfo}: ${toolList}${moreCount}. Call them through native function calling — never write JSON or function names in speech.]`;

  try {
    const chatCtx = agent.chatCtx.copy();
    chatCtx.addMessage({ role: 'system', content });
    await agent.updateChatCtx(chatCtx);
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not announce new tools to the LLM');
  }
}

/**
 * Check if mid-session tool updates are supported.
 */
export function supportsToolUpdates(): boolean {
  return true;
}

/**
 * Confirm the agent's initial tools are in place.
 *
 * With SDK 1.5.1 the tools passed to the Agent constructor live in its
 * ToolContext and the SDK sends them to the LLM when the activity starts, so
 * there is nothing to force-sync (re-sending them would reconnect a Gemini
 * session for no reason). Kept for callers that log the result.
 *
 * @returns true if the agent has tools
 */
export async function registerInitialTools(agent: voice.Agent<UserData>): Promise<boolean> {
  const toolCount = getAgentToolCount(agent);
  if (toolCount === 0) {
    log.warn('Agent started with no tools');
    return false;
  }
  log.debug({ toolCount }, 'Initial agent tools are registered with the SDK');
  return true;
}

/**
 * Check if provider has NATIVE tool update support.
 */
export function hasNativeToolUpdates(): boolean {
  return getModelProvider().hasNativeFunctionCalling();
}

/**
 * Check if mid-session tool updates are SAFE (won't reconnect the session).
 *
 * Gemini Live cannot change tools mid-session: updateTools() marks the session
 * for a restart, which drops in-flight audio and state.
 */
export function isMidSessionToolUpdateSafe(): boolean {
  return !RESTART_ON_TOOL_UPDATE.has(getModelProvider().id);
}

/**
 * Get the current tool count from an agent.
 */
export function getAgentToolCount(agent: voice.Agent<UserData>): number {
  return getAgentToolNames(agent).length;
}

/**
 * Get tool names from an agent.
 */
export function getAgentToolNames(agent: voice.Agent<UserData>): string[] {
  return Object.keys(asToolCapable(agent).toolCtx.functionTools);
}

/**
 * Run `fn` once the agent starts speaking (or goes back to listening without
 * speaking), whichever comes first, or after 8 s at the latest.
 */
export function applyAfterReplyStarts(
  session: voice.AgentSession<UserData>,
  fn: () => Promise<void>
): void {
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    session.off(voice.AgentSessionEventTypes.AgentStateChanged, onState);
    clearTimeout(fallback);
    void fn();
  };
  const onState = (ev: { newState: string }): void => {
    if (ev.newState === 'speaking' || ev.newState === 'listening') run();
  };
  const fallback = setTimeout(run, 8000);
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, onState);
}
