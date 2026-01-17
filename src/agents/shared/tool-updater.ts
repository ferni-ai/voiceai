/**
 * Tool Updater - Mid-Session Tool Updates for Voice AI
 *
 * This module provides functionality to update tools dynamically during a session.
 *
 * ## Provider Support:
 *
 * ### OpenAI Realtime (Native Function Calling)
 * - Uses `updateTools()` API to register new tools with OpenAI
 * - Tools immediately become callable via native function calling
 *
 * ### Gemini Live (JSON Workaround)
 * - Merges tools into agent's tool context for execution
 * - Injects a brief system message informing Gemini about new tools
 * - When Gemini fixes native function calling, we can switch to native approach
 *
 * @see https://docs.livekit.io/agents/logic-structure/tools/
 */

import { voice } from '@livekit/agents';
import type { UserData } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getModelProvider } from '../model-provider/index.js';

const log = createLogger({ module: 'ToolUpdater' });

// Type for the realtime session's updateTools method
interface RealtimeSession {
  updateTools(tools: Record<string, unknown>): Promise<void>;
  tools: Record<string, unknown>;
}

// Type for agent activity with realtime session
interface AgentActivityWithRealtime {
  realtimeLLMSession?: RealtimeSession;
}

// Type for ChatContext (from @livekit/agents)
interface ChatContext {
  addMessage(params: { role: string; content: string }): unknown;
  copy(opts?: { toolCtx?: Record<string, unknown> }): ChatContext;
}

// Extended agent type with internal properties
interface AgentWithInternals {
  _tools?: Record<string, unknown>;
  _chatCtx?: ChatContext;
  getActivityOrThrow?: () => AgentActivityWithRealtime;
  updateChatCtx?: (ctx: ChatContext) => Promise<void>;
}

/**
 * Update tools mid-session for any LLM provider.
 *
 * This function:
 * 1. Merges new tools into the agent's tool context
 * 2. For OpenAI Realtime: Calls `updateTools()` to register with OpenAI
 * 3. For Gemini: Injects a system message about new available tools
 *
 * @param agent - The voice agent instance (must be FerniAgent or similar)
 * @param newTools - New tools to add (will be merged with existing)
 * @param options - Optional configuration
 * @returns true if tools were updated, false if failed
 */
export async function updateAgentTools(
  agent: voice.Agent<UserData>,
  newTools: Record<string, unknown>,
  options: {
    /** Domain names for better logging/messaging */
    domains?: string[];
    /** Skip informing LLM about new tools (just merge for execution) */
    silentMerge?: boolean;
  } = {}
): Promise<boolean> {
  const provider = getModelProvider();
  const { domains = [], silentMerge = false } = options;

  try {
    const agentWithTools = agent as unknown as AgentWithInternals;

    if (!agentWithTools._tools) {
      log.warn('Agent has no _tools property - cannot update');
      return false;
    }

    // Count existing vs new tools
    const existingCount = Object.keys(agentWithTools._tools).length;
    const newToolNames = Object.keys(newTools);
    const actuallyNew = newToolNames.filter((name) => !(name in agentWithTools._tools!));

    if (actuallyNew.length === 0) {
      log.debug(
        { attemptedTools: newToolNames },
        'All tools already registered - no update needed'
      );
      return true;
    }

    // Step 1: Merge new tools into agent's tool context (works for ALL providers)
    Object.assign(agentWithTools._tools, newTools);

    log.info(
      {
        existingCount,
        newTools: actuallyNew,
        totalCount: Object.keys(agentWithTools._tools).length,
        provider: provider.getLogPrefix(),
      },
      '🔧 Merging new tools into agent'
    );

    // Step 2: Provider-specific updates
    if (provider.hasNativeFunctionCalling()) {
      // OpenAI Realtime: Use native updateTools() API
      return await updateToolsOpenAI(agentWithTools, actuallyNew);
    } else {
      // Gemini (JSON workaround): Inject system message about new tools
      if (!silentMerge) {
        return await updateToolsGemini(agentWithTools, actuallyNew, domains);
      }
      log.debug('Gemini: Silent merge - tools available for execution but LLM not informed');
      return true;
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to update agent tools');
    return false;
  }
}

/**
 * OpenAI Realtime: Update tools via native API
 */
async function updateToolsOpenAI(
  agentWithTools: AgentWithInternals,
  actuallyNew: string[]
): Promise<boolean> {
  if (!agentWithTools.getActivityOrThrow) {
    log.debug('No getActivityOrThrow method - tools merged locally only');
    return true;
  }

  try {
    const activity = agentWithTools.getActivityOrThrow();
    const realtimeSession = activity.realtimeLLMSession;

    if (realtimeSession) {
      const allTools = { ...agentWithTools._tools };
      await realtimeSession.updateTools(allTools);

      log.info(
        {
          newTools: actuallyNew,
          totalTools: Object.keys(allTools).length,
        },
        '✅ OpenAI Realtime: Tools updated via native API'
      );
      return true;
    } else {
      log.debug('No realtime session available - tools merged but not sent to OpenAI');
      return true;
    }
  } catch (activityError) {
    // Activity might not be ready yet - that's OK, tools are still merged
    log.debug(
      { error: String(activityError) },
      'Activity not available yet - tools merged locally'
    );
    return true;
  }
}

/**
 * Gemini (JSON Workaround): Inform LLM about new tools via system message
 *
 * Since Gemini uses the JSON workaround (outputting {"fn":"toolName","args":{}}),
 * we need to inform it about newly available tools so it knows to call them.
 *
 * NOTE: When Gemini fixes native function calling, this can be replaced with
 * a native updateTools() call similar to OpenAI.
 */
async function updateToolsGemini(
  agentWithTools: AgentWithInternals,
  actuallyNew: string[],
  domains: string[]
): Promise<boolean> {
  // Build a brief message informing Gemini about new tools
  const toolList = actuallyNew.slice(0, 10).join(', '); // Cap at 10 to avoid long messages
  const moreCount = actuallyNew.length > 10 ? ` and ${actuallyNew.length - 10} more` : '';
  const domainInfo = domains.length > 0 ? ` (${domains.join(', ')})` : '';

  const systemMessage = `[SYSTEM: New tools now available${domainInfo}: ${toolList}${moreCount}. You can call these using JSON format: {"fn":"toolName","args":{...}}]`;

  // Try to inject via chat context
  if (agentWithTools._chatCtx && agentWithTools.updateChatCtx) {
    try {
      const updatedCtx = agentWithTools._chatCtx.copy({ toolCtx: agentWithTools._tools });
      updatedCtx.addMessage({
        role: 'system',
        content: systemMessage,
      });
      await agentWithTools.updateChatCtx(updatedCtx);

      log.info(
        {
          newTools: actuallyNew,
          domains,
        },
        '✅ Gemini: Informed about new tools via system message'
      );
      return true;
    } catch (ctxError) {
      log.warn(
        { error: String(ctxError) },
        'Could not inject system message - tools available but Gemini may not know about them'
      );
      // Tools are still merged and can execute if Gemini happens to call them
      return true;
    }
  }

  log.debug('No chat context available - tools merged for execution only');
  return true;
}

/**
 * Check if mid-session tool updates are supported.
 * Returns true for BOTH OpenAI Realtime (native) and Gemini (via system message).
 */
export function supportsToolUpdates(): boolean {
  // Now supported for all providers!
  return true;
}

/**
 * Check if provider has NATIVE tool update support.
 * OpenAI Realtime has native support, Gemini uses workaround.
 */
export function hasNativeToolUpdates(): boolean {
  const provider = getModelProvider();
  return provider.hasNativeFunctionCalling();
}

/**
 * Get the current tool count from an agent.
 * Useful for debugging and verification.
 */
export function getAgentToolCount(agent: voice.Agent<UserData>): number {
  const agentWithTools = agent as unknown as AgentWithInternals;
  return agentWithTools._tools ? Object.keys(agentWithTools._tools).length : 0;
}

/**
 * Get tool names from an agent.
 * Useful for debugging.
 */
export function getAgentToolNames(agent: voice.Agent<UserData>): string[] {
  const agentWithTools = agent as unknown as AgentWithInternals;
  return agentWithTools._tools ? Object.keys(agentWithTools._tools) : [];
}
