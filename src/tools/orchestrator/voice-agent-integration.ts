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
  /**
   * ⚡ FAST PATH: Skip semantic router entirely.
   * Use for handoffs where we only need handoff tools + essentials.
   * Goes from 5-20s → <500ms.
   */
  fastPath?: boolean;
  /**
   * Session ID for session-level caching (used with fastPath)
   */
  sessionId?: string;
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
// INITIALIZATION (Process-Wide Global Singleton)
// ============================================================================

/**
 * Global singleton key - ensures orchestrator state persists even if module is re-imported
 * This is critical for avoiding re-initialization during handoffs
 */
const GLOBAL_STATE_KEY = Symbol.for('ferni.toolOrchestrator.state');

interface GlobalOrchestratorState {
  initialized: boolean;
  initializePromise: Promise<void> | null;
  initStartTime: number | null;
}

/**
 * Get or create global orchestrator state (process-wide singleton)
 */
function getGlobalState(): GlobalOrchestratorState {
  const g = globalThis as Record<symbol, GlobalOrchestratorState | undefined>;
  if (!g[GLOBAL_STATE_KEY]) {
    g[GLOBAL_STATE_KEY] = {
      initialized: false,
      initializePromise: null,
      initStartTime: null,
    };
  }
  return g[GLOBAL_STATE_KEY];
}

/**
 * Initialize the tool orchestrator (call once at startup)
 *
 * Uses process-wide singleton pattern to ensure initialization happens exactly once,
 * even if module is re-imported or called from multiple locations.
 */
export async function initializeToolOrchestrator(): Promise<void> {
  const state = getGlobalState();

  // Already initialized - instant return
  if (state.initialized) {
    log.debug('Tool orchestrator already initialized (global singleton)');
    return;
  }

  // Initialization in progress - wait for it
  if (state.initializePromise) {
    log.debug('Tool orchestrator initialization in progress, waiting...');
    return state.initializePromise;
  }

  // Start initialization (only one caller will reach here)
  state.initStartTime = Date.now();
  log.info('🚀 Initializing tool orchestrator for voice agent (global singleton)...');

  state.initializePromise = (async () => {
    try {
      // =======================================================================
      // FAST INITIALIZATION: Use pre-built manifest + embeddings!
      // This is 100x faster than loading all 98 domains at startup.
      // =======================================================================
      
      // Step 1: Try to load pre-built manifest (50ms vs 5-15s for imports)
      let useManifestMode = false;
      try {
        const { loadToolManifest, isManifestLoaded } = await import('../registry/manifest-loader.js');
        if (!isManifestLoaded()) {
          const manifest = await loadToolManifest();
          log.info(
            { totalTools: manifest.totalTools, totalDomains: manifest.totalDomains },
            '⚡ Loaded tool manifest (100x faster than imports!)'
          );
        }
        useManifestMode = true;
      } catch (manifestError) {
        log.warn({ error: String(manifestError) }, '⚠️ Manifest not available, will use slow path');
      }

      // Step 2: Try to load pre-computed embeddings (100ms vs 3-5s for API)
      if (useManifestMode) {
        try {
          const { loadPrecomputedEmbeddings, areEmbeddingsLoaded } = await import(
            '../semantic-router/precomputed-embeddings.js'
          );
          if (!areEmbeddingsLoaded()) {
            const embeddings = await loadPrecomputedEmbeddings();
            log.info(
              { totalTools: embeddings.totalTools, dimension: embeddings.dimension },
              '⚡ Loaded pre-computed embeddings (30x faster than API!)'
            );
          }
        } catch (embeddingsError) {
          log.warn({ error: String(embeddingsError) }, '⚠️ Pre-computed embeddings not available');
        }
      }

      // Step 3: Register domain loaders (does NOT load the actual modules!)
      // This is fast (~10ms) - it just registers the loader FUNCTIONS
    await autoRegisterAllDomains();
    log.info('📦 Domain loaders registered');

      // Step 4: Initialize orchestrator
      // If manifest is available, this will skip expensive operations
    await toolOrchestrator.initialize();
      state.initialized = true;

    log.info(
        { elapsed: Date.now() - (state.initStartTime || 0), stats: toolOrchestrator.getStats() },
        '✅ Tool orchestrator ready for voice agent (global singleton)'
    );
  } catch (error) {
      // Reset state so retry is possible
      state.initializePromise = null;
    log.error({ error }, '❌ Failed to initialize tool orchestrator');
    throw error;
  }
  })();

  return state.initializePromise;
}

/**
 * Check if orchestrator is initialized
 */
export function isOrchestratorInitialized(): boolean {
  return getGlobalState().initialized;
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

  // =========================================================================
  // ⚡ FAST PATH: For handoffs, skip semantic router entirely!
  // This is 10-40x faster than full orchestrator (500ms vs 5-20s)
  // =========================================================================
  if (options.fastPath) {
    return getToolsFastPath(options);
  }

  // Use legacy mode if requested or if orchestrator isn't ready
  if (options.useLegacy || !isOrchestratorInitialized()) {
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

  if (!isOrchestratorInitialized()) {
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
// ⚡ FAST PATH - Skip semantic router for handoffs (10-40x faster)
// ============================================================================

/**
 * Pre-loaded essential tools cache (loaded once, reused)
 * These are tools that should ALWAYS be available regardless of context
 */
let essentialToolsCache: Record<string, Tool> | null = null;

/**
 * Get essential tools from cache (loads once on first call)
 */
async function getEssentialToolsCached(): Promise<Record<string, Tool>> {
  if (essentialToolsCache) {
    return essentialToolsCache;
  }

  try {
    essentialToolsCache = await buildEssentialTools({ userId: 'shared' });
    log.info(
      { toolCount: Object.keys(essentialToolsCache).length },
      '⚡ Essential tools cached for fast path'
    );
    return essentialToolsCache;
  } catch (error) {
    log.warn({ error }, 'Failed to cache essential tools');
    return {};
  }
}

/**
 * ⚡ FAST PATH: Get tools without semantic router
 *
 * This is 10-40x faster than the full orchestrator path:
 * - Full path: 5-20 seconds (semantic search, intelligence, context)
 * - Fast path: 200-500ms (session cache + essential tools)
 *
 * Use for:
 * - Handoffs (we know we only need handoff tools)
 * - Quick agent switches
 * - Emergency fallback when orchestrator is slow
 */
async function getToolsFastPath(options: GetToolsForAgentOptions): Promise<GetToolsResult> {
  const startTime = Date.now();
  const allTools: Record<string, Tool> = {};

  log.info(
    { personaId: options.persona.id, sessionId: options.sessionId },
    '⚡ Using FAST PATH for tool loading (skipping semantic router)'
  );

  try {
    // 1. TRY SESSION CACHE FIRST (instant if warmed)
    if (options.sessionId) {
      const { getCachedHandoffTools, hasHandoffToolsCache } = await import(
        '../handoff/session-cache.js'
      );

      if (hasHandoffToolsCache(options.sessionId)) {
        const cachedHandoffTools = getCachedHandoffTools(options.sessionId, options.persona.id);
        if (cachedHandoffTools && Object.keys(cachedHandoffTools).length > 0) {
          Object.assign(allTools, cachedHandoffTools);
          log.debug(
            { toolCount: Object.keys(cachedHandoffTools).length },
            '⚡ Loaded handoff tools from session cache'
          );
        }
      }
    }

    // 2. BUILD HANDOFF TOOLS IF NOT CACHED
    if (Object.keys(allTools).length === 0) {
      const handoffTools = await getHandoffToolsForAgent(options);
      Object.assign(allTools, handoffTools);
      log.debug(
        { toolCount: Object.keys(handoffTools).length },
        '🔄 Built handoff tools fresh'
      );
    }

    // 3. ADD ESSENTIAL TOOLS (music, weather, etc.)
    const essentialTools = await getEssentialToolsCached();
    Object.assign(allTools, essentialTools);

    const elapsed = Date.now() - startTime;

    log.info(
      {
        personaId: options.persona.id,
        toolCount: Object.keys(allTools).length,
        elapsedMs: elapsed,
        mode: 'fast-path',
      },
      '⚡ Fast path complete - tools loaded without semantic router'
    );

    return {
      tools: allTools,
      meta: {
        mode: 'orchestrator', // Report as orchestrator for compatibility
        toolCount: Object.keys(allTools).length,
        selectionTimeMs: elapsed,
        sources: {
          essential: Object.keys(essentialTools).length,
          semantic: 0, // Skipped!
          contextual: 0, // Skipped!
          handoff: Object.keys(allTools).length - Object.keys(essentialTools).length,
        },
      },
    };
  } catch (error) {
    log.warn({ error, personaId: options.persona.id }, '⚠️ Fast path failed, using legacy');
    return getLegacyTools(options);
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
    initialized: isOrchestratorInitialized(),
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
  if (!isOrchestratorInitialized()) {
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
