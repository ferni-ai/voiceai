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
import { capToolsToLimit, getMaxTools, isMetaToolEnabled } from '../../config/tool-config.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getModelProvider } from '../model-provider/index.js';
import { generateToolCatalog, getMetaToolDeclaration } from './meta-tool.js';
import type { UserData } from './types.js';

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
    /** Force send ALL tools to session (for initial registration) */
    forceSync?: boolean;
  } = {}
): Promise<boolean> {
  const provider = getModelProvider();
  const { domains = [], silentMerge = false, forceSync = false } = options;

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

    // If forceSync, we send ALL agent tools regardless of whether they're "new"
    // This is needed for initial tool registration with the session
    if (!forceSync && actuallyNew.length === 0) {
      log.debug(
        { attemptedTools: newToolNames },
        'All tools already registered - no update needed'
      );
      return true;
    }

    // Step 1: Merge new tools into agent's tool context (works for ALL providers)
    Object.assign(agentWithTools._tools, newTools);

    const toolsToReport = forceSync ? Object.keys(agentWithTools._tools) : actuallyNew;

    log.info(
      {
        existingCount,
        newTools: toolsToReport.slice(0, 10), // Cap for log readability
        totalCount: Object.keys(agentWithTools._tools).length,
        provider: provider.getLogPrefix(),
        forceSync,
      },
      forceSync ? '🔧 Force-syncing ALL tools to session' : '🔧 Merging new tools into agent'
    );

    // Step 2: Provider-specific updates
    if (provider.hasNativeFunctionCalling()) {
      // OpenAI/Gemini Realtime: Use native updateTools() API
      return await updateToolsNativeFC(agentWithTools, toolsToReport, forceSync);
    } else {
      // Gemini (JSON workaround): Inject system message about new tools
      if (!silentMerge) {
        return await updateToolsGemini(agentWithTools, toolsToReport, domains);
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
 * Native Function Calling: Update tools via session API
 *
 * Works for BOTH OpenAI Realtime AND Gemini Live since both implement
 * the same `updateTools()` interface via LiveKit's abstraction.
 *
 * ⚠️ CRITICAL FOR GEMINI (Jan 2026):
 * For Gemini, `updateTools()` triggers `markRestartNeeded()` which causes
 * the session to close and reconnect ASYNCHRONOUSLY. This means:
 * 1. updateTools() returns immediately
 * 2. Session restarts in the background (1-2 seconds later)
 * 3. Tools are LOST after the restart!
 *
 * Fix: For initial registration (forceSync=true), we wait for the restart
 * to complete and then re-register tools.
 */
async function updateToolsNativeFC(
  agentWithTools: AgentWithInternals,
  toolsToReport: string[],
  forceSync: boolean
): Promise<boolean> {
  // 🔍 DIAGNOSTIC: Track when updateTools is called (may trigger session restart for Gemini!)
  const timestamp = new Date().toISOString();
  const totalTools = agentWithTools._tools ? Object.keys(agentWithTools._tools).length : 0;
  const provider = getModelProvider();
  const isGemini = provider.id === 'gemini-live';
  const useMetaTool = isMetaToolEnabled();

  process.stderr.write(
    `\n⚠️ [TOOL UPDATER] updateToolsNativeFC called at ${timestamp}\n` +
      `   forceSync: ${forceSync}, toolsToReport: ${toolsToReport.length}, totalTools: ${totalTools}\n` +
      `   provider: ${provider.id}, useMetaTool: ${useMetaTool}\n` +
      (isGemini
        ? `   ⚡ NOTE: For Gemini, this triggers markRestartNeeded() → SESSION RESTART\n`
        : '')
  );

  if (!agentWithTools.getActivityOrThrow) {
    log.debug('No getActivityOrThrow method - tools merged locally only');
    return true;
  }

  // Helper to get the realtime session, with retries for forceSync
  const getRealtimeSession = async (): Promise<RealtimeSession | null> => {
    try {
      const activity = agentWithTools.getActivityOrThrow!();
      if (activity.realtimeLLMSession) {
        return activity.realtimeLLMSession;
      }
    } catch {
      // Activity not ready
    }

    // For initial registration (forceSync), retry with backoff
    // The Gemini WebSocket may still be connecting after session.start()
    if (forceSync) {
      const retryDelays = [500, 1000, 2000, 3000];
      for (const delay of retryDelays) {
        process.stderr.write(
          `   ⏳ [TOOL UPDATER] realtimeLLMSession not ready, retrying in ${delay}ms...\n`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          const activity = agentWithTools.getActivityOrThrow!();
          if (activity.realtimeLLMSession) {
            process.stderr.write(
              `   ✅ [TOOL UPDATER] realtimeLLMSession available after ${delay}ms wait\n`
            );
            return activity.realtimeLLMSession;
          }
        } catch {
          // Still not ready
        }
      }
      process.stderr.write(
        `   ⚠️ [TOOL UPDATER] realtimeLLMSession still not available after retries\n`
      );
    }
    return null;
  };

  try {
    const realtimeSession = await getRealtimeSession();

    if (realtimeSession) {
      let allTools = { ...agentWithTools._tools };
      let toolCount = Object.keys(allTools).length;

      // =====================================================================
      // META-TOOL PATTERN (Jan 2026)
      // =====================================================================
      // Instead of registering 100+ tools with Gemini, register ONE tool:
      // executeTool(toolName, args)
      //
      // The LLM only makes ONE decision: "Should I use a tool?"
      // Then specifies which via executeTool.
      //
      // Benefits:
      // 1. Simpler LLM decision (binary vs 100+ choice)
      // 2. No context bloat (1 declaration vs 100+)
      // 3. No tool limits needed (semantic router filters)
      // 4. Existing execution path stays the same
      // =====================================================================
      if (useMetaTool) {
        const toolCatalog = Object.keys(allTools);
        const metaToolDeclaration = getMetaToolDeclaration(toolCatalog);

        process.stderr.write(
          `   🎯 [META-TOOL] Registering single executeTool with ${toolCatalog.length} tools in catalog\n`
        );

        // Register ONLY the meta-tool
        // The actual tools are kept in agent._tools for execution
        await realtimeSession.updateTools({
          executeTool: metaToolDeclaration as unknown,
        });

        log.info(
          { toolCatalogSize: toolCatalog.length, forceSync, provider: provider.id },
          '✅ Meta-tool registered with catalog'
        );

        // Generate catalog for system prompt injection (if enabled)
        if (process.env.META_TOOL_CATALOG_IN_PROMPT !== 'false') {
          const catalog = generateToolCatalog(allTools as Record<string, { description?: string }>);
          log.debug({ catalogLength: catalog.length }, '📋 Tool catalog generated for prompt');
        }

        return true;
      }

      // =====================================================================
      // TOOL LIMIT (Jan 2026) - Use centralized config
      // =====================================================================
      // Uses capToolsToLimit() from tool-config.ts with TOOL_LIMIT env var.
      // Default: 0 (unlimited) - semantic router handles filtering.
      //
      // FEB 2026 FIX: Removed the Gemini fallback cap of 18. The essential
      // tools list alone has ~42 entries, so a cap of 18 was meaningless
      // (capToolsToLimit prioritizes essentials, so all 42 survived anyway).
      // The semantic router already pre-filters to relevant tools per turn,
      // so a hard cap here is unnecessary and confusing.
      // =====================================================================
      const configLimit = getMaxTools();

      if (configLimit > 0) {
        allTools = capToolsToLimit(allTools, configLimit);
        const newToolCount = Object.keys(allTools).length;

        if (newToolCount !== toolCount) {
          process.stderr.write(
            `   ⚠️ [TOOL LIMIT] Capped: ${toolCount} → ${newToolCount} (limit: ${configLimit})\n`
          );
          toolCount = newToolCount;
        }
      }

      process.stderr.write(`   📤 Calling session.updateTools() with ${toolCount} tools...\n`);

      await realtimeSession.updateTools(allTools);

      process.stderr.write(`   ✅ session.updateTools() completed\n`);

      // =====================================================================
      // GEMINI SESSION RESTART FIX (Jan 2026)
      // =====================================================================
      // For Gemini, updateTools() triggers markRestartNeeded() which causes
      // an ASYNC session restart. The restart happens AFTER updateTools() returns,
      // so tools are lost. We need to wait for the restart and re-register.
      //
      // This only applies to initial registration (forceSync=true) because:
      // 1. Mid-session updates are already blocked for Gemini (isMidSessionToolUpdateSafe)
      // 2. The initial registration is the only time we should call updateTools for Gemini
      // =====================================================================
      if (isGemini && forceSync && toolCount > 0) {
        process.stderr.write(`   ⏳ [GEMINI FIX] Waiting for session restart to complete...\n`);

        // Wait for the session restart to complete
        // The restart typically takes 1-2 seconds based on logs:
        // - updateTools completes at 03:05:03.584
        // - Session closes/reconnects shortly after
        // - We need to wait for the new session to be ready
        await new Promise((resolve) => setTimeout(resolve, 2500));

        process.stderr.write(
          `   🔄 [GEMINI FIX] Re-registering ${toolCount} tools after session restart...\n`
        );

        // Re-register tools after the restart
        try {
          // Get fresh session reference (might have changed after restart)
          const freshActivity = agentWithTools.getActivityOrThrow();
          const freshSession = freshActivity.realtimeLLMSession;

          if (freshSession) {
            await freshSession.updateTools(allTools);
            process.stderr.write(
              `   ✅ [GEMINI FIX] Tools re-registered successfully after restart!\n\n`
            );
          } else {
            process.stderr.write(`   ⚠️ [GEMINI FIX] No session available after restart\n\n`);
          }
        } catch (reregError) {
          process.stderr.write(`   ⚠️ [GEMINI FIX] Re-registration error: ${reregError}\n\n`);
        }
      } else {
        process.stderr.write('\n');
      }

      log.info(
        {
          toolsReported: toolsToReport.slice(0, 10), // Cap for readability
          totalTools: toolCount,
          forceSync,
          provider: provider.id,
        },
        forceSync
          ? '✅ Native FC: Initial tools synced to session'
          : '✅ Native FC: Tools updated via session API'
      );
      return true;
    } else {
      if (forceSync) {
        log.warn(
          'No realtime session available for initial tool registration - tools NOT sent to LLM!'
        );
        process.stderr.write(
          `   🚨 [TOOL UPDATER] CRITICAL: realtimeLLMSession is null - tools NOT registered with Gemini!\n` +
            `   Tools are in agent._tools but Gemini has no function declarations.\n\n`
        );
      } else {
        log.debug('No realtime session available - tools merged but not sent to session');
      }
      return true;
    }
  } catch (activityError) {
    if (forceSync) {
      log.warn(
        { error: String(activityError) },
        'Activity not available for initial tool registration - tools NOT sent to LLM!'
      );
    } else {
      log.debug(
        { error: String(activityError) },
        'Activity not available yet - tools merged locally'
      );
    }
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
 * Register INITIAL agent tools with the session.
 *
 * CRITICAL: LiveKit's session starts with EMPTY tools. The agent's `_tools`
 * must be explicitly sent to the session via `updateTools()` for native
 * function calling to work.
 *
 * Call this AFTER session.start() but BEFORE the first user message.
 *
 * @param agent - The voice agent instance
 * @returns true if tools were registered successfully
 */
export async function registerInitialTools(agent: voice.Agent<UserData>): Promise<boolean> {
  const agentWithTools = agent as unknown as AgentWithInternals;

  if (!agentWithTools._tools || Object.keys(agentWithTools._tools).length === 0) {
    log.debug('Agent has no initial tools to register');
    return true;
  }

  const toolCount = Object.keys(agentWithTools._tools).length;
  log.info({ toolCount }, '🔧 Registering initial agent tools with session (forceSync=true)');

  // Force sync ALL agent tools to the session
  // Use empty object for newTools since we just want to sync existing _tools
  return updateAgentTools(agent, {}, { forceSync: true });
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
 * Check if mid-session tool updates are SAFE (won't cause session restart).
 *
 * For Gemini: Mid-session updateTools() triggers markRestartNeeded() which
 * causes a session restart. This can break function calling because the
 * session loses state. So we return false to prevent mid-session updates.
 *
 * For OpenAI: Mid-session updates are safe and don't cause restarts.
 *
 * @returns true if mid-session tool updates are safe
 */
export function isMidSessionToolUpdateSafe(): boolean {
  const provider = getModelProvider();

  // Gemini triggers session restart on updateTools() - NOT safe
  // Provider ID is 'gemini-live' for the Gemini Live API
  if (provider.id === 'gemini-live') {
    return false;
  }

  // OpenAI Realtime (provider.id === 'openai-realtime') can handle mid-session updates safely
  return true;
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
