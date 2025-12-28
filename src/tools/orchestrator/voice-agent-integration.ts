/**
 * Voice Agent Integration for Tool Orchestrator
 *
 * Drop-in replacement for the current tool building logic in voice-agent.ts.
 * This module provides the bridge between the voice agent and the unified
 * tool orchestrator.
 *
 * USAGE:
 *
 * // Replace in voice-agent.ts:
 * // OLD:
 * // const personaTools = await buildAgentTools(persona.id);
 * // const essentialTools = await buildEssentialTools();
 * // let toolsForAgent = { ...essentialTools, ...personaTools };
 *
 * // NEW:
 * import { getToolsForAgent } from './orchestrator/voice-agent-integration.js';
 * const { tools: toolsForAgent, meta } = await getToolsForAgent({
 *   persona,
 *   userId,
 *   initialTranscript: '',
 * });
 */

import { getLogger } from '../../utils/safe-logger.js';
import { toolOrchestrator, type ToolSelectionContext } from './unified-tool-orchestrator.js';
import { buildAgentTools, buildEssentialTools } from '../builder.js';
import { buildHandoffTools } from '../handoff/handoff-factory.js';
import { autoRegisterAllDomains } from '../registry/loader.js';
import type { Tool, ToolContext } from '../registry/types.js';
import type { UserProfile } from '../../types/user-profile.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface PersonaConfig {
  id: string;
  displayName?: string;
  systemPrompt?: string;
  tools?: {
    domains?: string[];
    required?: string[];
    forbidden?: string[];
  };
}

export interface GetToolsForAgentOptions {
  /** Persona configuration */
  persona: PersonaConfig;
  /** User ID */
  userId: string;
  /** Initial transcript (for semantic matching on session start) */
  initialTranscript?: string;
  /** User profile for permission checks */
  userProfile?: UserProfile | null;
  /** Subscription tier */
  subscriptionTier?: 'free' | 'friend' | 'partner';
  /** Additional context */
  context?: ToolSelectionContext;
  /** Use legacy mode (falls back to buildAgentTools) */
  useLegacy?: boolean;
  /** Force specific tools */
  forceInclude?: string[];
  /** Exclude specific tools */
  forceExclude?: string[];
  /**
   * Session services for dev mode bypass.
   * When frontend dev panel sends dev_mode_sync, this propagates bypass to handoff tools.
   */
  services?: { devMode?: { enabled: boolean; bypassUnlocks: boolean } };
  /**
   * User's detected location from IP (TikTok-style personalization)
   * Used for weather defaults, local content hints
   */
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
}

export interface GetToolsResult {
  /** Tools ready for the LLM */
  tools: Record<string, Tool>;
  /** Selection metadata */
  meta: {
    mode: 'orchestrator' | 'legacy';
    toolCount: number;
    selectionTimeMs: number;
    sources?: {
      essential: number;
      semantic: number;
      contextual: number;
      handoff: number;
    };
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

/**
 * Initialize the tool orchestrator (call once at startup)
 */
export async function initializeToolOrchestrator(): Promise<void> {
  if (initialized) {
    log.debug('Tool orchestrator already initialized');
    return;
  }

  const startTime = Date.now();
  log.info('🚀 Initializing tool orchestrator for voice agent...');

  try {
    // CRITICAL: Register domain loaders BEFORE initializing orchestrator
    // This is required for tool definitions to be discoverable
    await autoRegisterAllDomains();
    log.info('📦 Domain loaders registered');

    await toolOrchestrator.initialize();
    initialized = true;

    log.info(
      { elapsed: Date.now() - startTime, stats: toolOrchestrator.getStats() },
      '✅ Tool orchestrator ready for voice agent'
    );
  } catch (error) {
    log.error({ error }, '❌ Failed to initialize tool orchestrator');
    throw error;
  }
}

/**
 * Check if orchestrator is initialized
 */
export function isOrchestratorInitialized(): boolean {
  return initialized;
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Get tools for a voice agent session
 *
 * This is the main integration point - replaces buildAgentTools + buildEssentialTools
 */
export async function getToolsForAgent(options: GetToolsForAgentOptions): Promise<GetToolsResult> {
  const startTime = Date.now();

  // Use legacy mode if requested or if orchestrator isn't ready
  if (options.useLegacy || !initialized) {
    return getLegacyTools(options);
  }

  try {
    // Get tools from orchestrator
    const result = await toolOrchestrator.getToolsForIntent({
      transcript: options.initialTranscript || '',
      userId: options.userId,
      agentId: options.persona.id,
      agentDisplayName: options.persona.displayName,
      subscriptionTier: options.subscriptionTier,
      context: options.context,
      forceInclude: options.forceInclude,
      forceExclude: [...(options.forceExclude || []), ...(options.persona.tools?.forbidden || [])],
      // IP-detected location for weather, local content (TikTok-style)
      userLocation: options.userLocation,
    });

    // Add handoff tools (handled separately due to unlock logic)
    const handoffTools = await getHandoffToolsForAgent(options);
    const allTools = { ...result.tools, ...handoffTools };

    // Apply forbidden filter
    const forbiddenTools = options.persona.tools?.forbidden || [];
    for (const forbidden of forbiddenTools) {
      delete allTools[forbidden];
    }

    const elapsed = Date.now() - startTime;

    log.info(
      {
        personaId: options.persona.id,
        toolCount: Object.keys(allTools).length,
        mode: 'orchestrator',
        elapsed,
        sources: result.meta.sources,
      },
      '🔧 Tools selected for agent via orchestrator'
    );

    return {
      tools: allTools,
      meta: {
        mode: 'orchestrator',
        toolCount: Object.keys(allTools).length,
        selectionTimeMs: elapsed,
        sources: {
          ...result.meta.sources,
          handoff: Object.keys(handoffTools).length,
        },
      },
    };
  } catch (error) {
    log.warn({ error }, 'Orchestrator failed, falling back to legacy mode');
    return getLegacyTools(options);
  }
}

/**
 * Options for refreshing tools mid-session
 */
export interface RefreshToolsOptions {
  /** Persona ID */
  personaId: string;
  /** User ID */
  userId: string;
  /** User profile for permission checks */
  userProfile?: UserProfile | null;
  /** Subscription tier */
  subscriptionTier?: 'free' | 'friend' | 'partner';
  /** New transcript that triggered the refresh check */
  newTranscript: string;
  /** Currently loaded tool names */
  currentTools?: string[];
  /** Session ID for caching */
  sessionId?: string;
  /** Additional context updates */
  contextUpdate?: Partial<ToolSelectionContext>;
}

/**
 * Result from tool refresh check
 */
export interface RefreshToolsResult {
  shouldRefresh: boolean;
  tools?: Record<string, Tool>;
  reason: string;
}

/**
 * Refresh tools mid-session based on new context
 *
 * Called either:
 * 1. At session init when real user profile becomes available
 * 2. Mid-conversation when topic changes significantly
 */
export async function refreshToolsForContext(
  options: RefreshToolsOptions
): Promise<RefreshToolsResult> {
  const {
    personaId,
    userId,
    userProfile,
    subscriptionTier = 'free',
    newTranscript,
    currentTools = [],
    sessionId,
    contextUpdate,
  } = options;

  if (!initialized) {
    return {
      shouldRefresh: false,
      reason: 'Orchestrator not initialized',
    };
  }

  // At session init (empty transcript, have user profile) - always refresh to get user-specific tools
  const isSessionInit = newTranscript === '' && userProfile !== undefined;

  if (isSessionInit) {
    log.debug({ personaId, userId }, 'Session init: refreshing tools with user profile');

    const result = await getToolsForAgent({
      persona: { id: personaId },
      userId,
      userProfile,
      subscriptionTier,
      initialTranscript: '',
      // Pass context updates including voice emotion for "Better Than Human" features
      context: contextUpdate,
    });

    return {
      shouldRefresh: true,
      tools: result.tools,
      reason: 'Session init with user profile',
    };
  }

  // Mid-conversation - check if significant topic change warrants refresh
  const result = await toolOrchestrator.shouldRefreshTools({
    newTranscript,
    previousTools: currentTools,
    sessionId: sessionId || 'unknown',
    contextUpdate,
  });

  return {
    shouldRefresh: result.shouldRefresh,
    tools: result.newTools,
    reason: result.reason,
  };
}

// ============================================================================
// LEGACY MODE
// ============================================================================

/**
 * Fall back to legacy tool building (buildAgentTools + buildEssentialTools)
 */
async function getLegacyTools(options: GetToolsForAgentOptions): Promise<GetToolsResult> {
  const startTime = Date.now();

  log.debug({ personaId: options.persona.id }, 'Using legacy tool building');

  // Build tools the old way
  const [personaTools, essentialTools] = await Promise.all([
    buildAgentTools(options.persona.id, {
      userId: options.userId,
      userProfile: options.userProfile,
      subscriptionTier: options.subscriptionTier,
    }),
    buildEssentialTools({ userId: options.userId }),
  ]);

  const allTools = { ...essentialTools, ...personaTools };

  // Filter forbidden
  const forbiddenTools = options.persona.tools?.forbidden || [];
  for (const forbidden of forbiddenTools) {
    delete allTools[forbidden];
  }

  const elapsed = Date.now() - startTime;

  return {
    tools: allTools,
    meta: {
      mode: 'legacy',
      toolCount: Object.keys(allTools).length,
      selectionTimeMs: elapsed,
    },
  };
}

/**
 * Get handoff tools with unlock filtering
 */
async function getHandoffToolsForAgent(
  options: GetToolsForAgentOptions
): Promise<Record<string, Tool>> {
  try {
    const { tools: handoffTools } = await buildHandoffTools({
      currentAgentId: options.persona.id,
      userProfile: options.userProfile,
      subscriptionTier: options.subscriptionTier || 'free',
      // Pass services for dev mode bypass check (synced from frontend dev panel)
      services: options.services,
    });

    return handoffTools as Record<string, Tool>;
  } catch (error) {
    log.warn({ error }, 'Failed to build handoff tools');
    return {};
  }
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Get diagnostic info about tool selection
 */
export function getToolSelectionDiagnostics(): {
  orchestratorStats: ReturnType<typeof toolOrchestrator.getStats>;
  initialized: boolean;
} {
  return {
    orchestratorStats: toolOrchestrator.getStats(),
    initialized,
  };
}

/**
 * Explain a tool selection (for debugging)
 */
export async function explainToolSelection(
  transcript: string,
  userId: string,
  agentId: string
): Promise<string> {
  if (!initialized) {
    return 'Orchestrator not initialized - using legacy mode';
  }

  const result = await toolOrchestrator.getToolsForIntent({
    transcript,
    userId,
    agentId,
  });

  return toolOrchestrator.explainSelection(result);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeToolOrchestrator,
  isOrchestratorInitialized,
  getToolsForAgent,
  refreshToolsForContext,
  getToolSelectionDiagnostics,
  explainToolSelection,
};
