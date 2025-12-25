/**
 * Unified Tool Orchestrator (UTO)
 *
 * The single source of truth for tool selection in Ferni.
 * Combines semantic retrieval, dynamic loading, permission filtering,
 * and context awareness into one elegant API.
 *
 * DESIGN PRINCIPLES:
 * 1. SCALE: Handle 1000+ tools by never showing >40 to the LLM
 * 2. SPEED: <100ms tool selection via caching and pre-computation
 * 3. CORRECTNESS: Always include the right tool via semantic matching
 * 4. DELIGHT: Contextual tools that anticipate user needs
 *
 * USAGE:
 *
 * // Initialize once at startup
 * await toolOrchestrator.initialize();
 *
 * // Get tools for a conversation turn
 * const tools = await toolOrchestrator.getToolsForIntent({
 *   transcript: "Play some relaxing jazz",
 *   userId: "user-123",
 *   agentId: "ferni",
 *   context: { emotion: "calm", timeOfDay: "evening" }
 * });
 *
 * // Mid-session tool refresh (when context shifts)
 * const newTools = await toolOrchestrator.refreshToolsForContext({
 *   newTranscript: "Actually, I'm feeling pretty stressed about my job",
 *   previousTools: currentTools,
 *   sessionId: "session-456"
 * });
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  getSuggestedReplacement,
  initializeToolLifecycle,
  isToolDeprecated,
} from '../advanced/tool-lifecycle.js';
import { buildEssentialTools } from '../builder.js';
import { detectToolIntent, type DetectedIntent } from '../dynamic-tool-router.js';
import {
  getUnifiedIntelligence,
  initializeUnifiedIntelligence,
  type IntelligenceEnhancement,
} from '../intelligence/index.js';
import { toolRegistry } from '../registry/index.js';
import { initializeToolRegistry, loadToolDomainsLazy } from '../registry/loader.js';
import type { Tool, ToolContext, ToolDomain } from '../registry/types.js';
// Migrated to new semantic router module
import { semanticRouter, type SemanticMatch } from '../semantic-router/compat.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ToolSelectionRequest {
  /** User's spoken/typed input */
  transcript: string;
  /** User ID for personalization and permissions */
  userId: string;
  /** Current agent (persona) ID */
  agentId: string;
  /** Agent display name */
  agentDisplayName?: string;
  /** Additional context for smart filtering */
  context?: ToolSelectionContext;
  /** User's subscription tier */
  subscriptionTier?: 'free' | 'friend' | 'partner';
  /** Previous conversation turns (for context building) */
  conversationHistory?: string[];
  /** Force include specific tools */
  forceInclude?: string[];
  /** Force exclude specific tools */
  forceExclude?: string[];
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

export interface ToolSelectionContext {
  /** Detected emotion in conversation */
  emotion?: 'neutral' | 'happy' | 'sad' | 'stressed' | 'angry' | 'anxious' | 'excited';
  /** Time-based context */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Is user in crisis mode? */
  isCrisis?: boolean;
  /** Current topic/domain being discussed */
  currentTopic?: string;
  /** Session duration in minutes */
  sessionDurationMinutes?: number;
  /** Number of messages in this session */
  messageCount?: number;
  /** Is this a new user? */
  isNewUser?: boolean;
  /** Session ID for tracking */
  sessionId?: string;
  /** Previous persona (for cross-persona intelligence) */
  previousPersonaId?: string;
  /** Voice emotion state (for emotion-aware tool selection) */
  voiceEmotion?: {
    primary: string;
    valence: number;
    arousal: number;
    stressLevel: number;
    anxietyMarkers: boolean;
  };
}

export interface ToolSelectionResult {
  /** Final tool set for the LLM */
  tools: Record<string, Tool>;
  /** Metadata about selection */
  meta: {
    /** Total tools in registry */
    totalAvailable: number;
    /** Tools returned */
    selected: number;
    /** Selection time in ms */
    selectionTimeMs: number;
    /** Which systems contributed tools */
    sources: {
      essential: number;
      semantic: number;
      contextual: number;
      mcp: number;
      /** Tools added from intelligence layer (anticipated/personalized) */
      intelligence: number;
    };
    /** Intent detected from transcript */
    detectedIntent: DetectedIntent | null;
    /** Semantic matches (for debugging) */
    semanticMatches: SemanticMatch[];
    /** Warnings/notes */
    warnings: string[];
    /** Intelligence enhancement applied (Better Than Human) */
    intelligenceEnhancement?: {
      anticipatedTools: string[];
      prioritizedTools: string[];
      proactiveSuggestions: number;
      isReturningUser: boolean;
    };
  };
}

export interface RefreshRequest {
  /** New transcript that triggered refresh */
  newTranscript: string;
  /** Current tool names */
  previousTools: string[];
  /** Session ID for caching */
  sessionId: string;
  /** Context update */
  contextUpdate?: Partial<ToolSelectionContext>;
}

export interface RefreshResult {
  /** Should we refresh tools? */
  shouldRefresh: boolean;
  /** New tools to add */
  toolsToAdd: string[];
  /** Tools to remove */
  toolsToRemove: string[];
  /** Reason for refresh/no-refresh */
  reason: string;
  /** Full new tool set if refreshing */
  newTools?: Record<string, Tool>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface OrchestratorConfig {
  /** Maximum tools to return to LLM */
  maxTools: number;
  /** Similarity threshold for semantic matching */
  semanticThreshold: number;
  /** Enable pre-computation of embeddings at startup */
  precomputeEmbeddings: boolean;
  /** Cache tool selections for this long (ms) */
  selectionCacheTtlMs: number;
  /** Domains that are ALWAYS included */
  alwaysDomains: ToolDomain[];
  /** Enable A/B testing variants */
  enableABTesting: boolean;
  /** Enable deprecation warnings */
  enableDeprecationWarnings: boolean;
  /** Enable contextual tool injection */
  enableContextualTools: boolean;

  // ======== NEW: Connected from model-config.json ========
  /** Tool domains to enable (empty = all domains) - from model-config.json */
  enabledDomains: string[];
  /** Specific tool IDs to exclude - from model-config.json */
  excludedTools: string[];
  /** Specific tool IDs to always include - from model-config.json */
  includedTools: string[];
  /** Enable verbose tool debug logging - from model-config.json */
  debugMode: boolean;
  /** Log tool schemas sent to LLM - from model-config.json */
  logToolSchemas: boolean;
  /** Log tool execution results - from model-config.json */
  logToolResults: boolean;
}

// Import admin config to read all tool settings from model-config.json
import { modelConfig } from '../../services/model-config.js';

// Base always-available domains (before filtering by enabledDomains)
// Games included so all personas can play Name That Tune, Tic-Tac-Toe, etc.
const BASE_ALWAYS_DOMAINS: ToolDomain[] = [
  'memory',
  'handoff',
  'entertainment',
  'information',
  'games',
];

const getDefaultConfig = (): OrchestratorConfig => {
  const adminConfig = modelConfig.getDefaultToolConfig();

  // Determine final alwaysDomains:
  // - If enabledDomains is set (non-empty), filter BASE_ALWAYS_DOMAINS to only include enabled ones
  // - If enabledDomains is empty, use all BASE_ALWAYS_DOMAINS
  let finalAlwaysDomains = BASE_ALWAYS_DOMAINS;
  if (adminConfig.enabledDomains && adminConfig.enabledDomains.length > 0) {
    finalAlwaysDomains = BASE_ALWAYS_DOMAINS.filter((d) => adminConfig.enabledDomains.includes(d));
    // Ensure we always have at least memory and handoff for core functionality
    if (!finalAlwaysDomains.includes('memory')) finalAlwaysDomains.push('memory');
    if (!finalAlwaysDomains.includes('handoff')) finalAlwaysDomains.push('handoff');
  }

  return {
    // Use admin config maxTools if set (> 0), otherwise default to 35
    maxTools: adminConfig.maxTools > 0 ? adminConfig.maxTools : 35,
    semanticThreshold: 0.15,
    precomputeEmbeddings: true,
    selectionCacheTtlMs: 5 * 60 * 1000, // 5 minutes
    alwaysDomains: finalAlwaysDomains,
    enableABTesting: true,
    enableDeprecationWarnings: true,
    enableContextualTools: true,

    // NEW: Pass through all model-config.json settings
    enabledDomains: adminConfig.enabledDomains || [],
    excludedTools: adminConfig.excludedTools || [],
    includedTools: adminConfig.includedTools || [],
    debugMode: adminConfig.debugMode ?? false,
    logToolSchemas: adminConfig.logToolSchemas ?? false,
    logToolResults: adminConfig.logToolResults ?? false,
  };
};

// Keep a static default for cases where we can't read config
const DEFAULT_CONFIG: OrchestratorConfig = {
  maxTools: 35,
  semanticThreshold: 0.15,
  precomputeEmbeddings: true,
  selectionCacheTtlMs: 5 * 60 * 1000, // 5 minutes
  alwaysDomains: BASE_ALWAYS_DOMAINS,
  enableABTesting: true,
  enableDeprecationWarnings: true,
  enableContextualTools: true,
  // Defaults for new settings
  enabledDomains: [],
  excludedTools: [],
  includedTools: [],
  debugMode: false,
  logToolSchemas: false,
  logToolResults: false,
};

// ============================================================================
// ORCHESTRATOR CLASS
// ============================================================================

export class UnifiedToolOrchestrator {
  private config: OrchestratorConfig;
  private initialized = false;
  private selectionCache = new Map<string, { result: ToolSelectionResult; timestamp: number }>();
  private toolContext: ToolContext | null = null;
  // Note: Embeddings are managed by SemanticRouter, not here

  constructor(config: Partial<OrchestratorConfig> = {}) {
    // Use getDefaultConfig() to pick up admin settings at runtime
    const baseConfig = getDefaultConfig();
    this.config = { ...baseConfig, ...config };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize all tool systems
   * Call this ONCE at application startup
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log.warn('Tool orchestrator already initialized');
      return;
    }

    const startTime = Date.now();
    log.info('🚀 Initializing Unified Tool Orchestrator...');

    try {
      // 1. Initialize tool registry (loads ALL tool definitions - NOT lazy loading!)
      // The orchestrator needs ALL tools registered for semantic search to work correctly
      await initializeToolRegistry({ lazyLoading: false });
      const allTools = toolRegistry.getAll();
      log.info({ toolCount: allTools.length }, '📦 Tool registry initialized');

      // 2. Initialize semantic router (builds embedding index)
      if (this.config.precomputeEmbeddings) {
        await semanticRouter.initialize();
        log.info('🎯 Semantic router initialized');
      }

      // 3. Initialize tool lifecycle (A/B testing, deprecation, etc.)
      await initializeToolLifecycle({
        buildSemanticIndex: true,
        checkDeprecations: this.config.enableDeprecationWarnings,
        toolDefinitions: allTools,
      });
      log.info('🔄 Tool lifecycle initialized');

      // 4. Initialize Unified Intelligence Layer (Better Than Human)
      try {
        await initializeUnifiedIntelligence();
        log.info('🧠 Unified Intelligence Layer initialized');
      } catch (intelligenceError) {
        log.warn(
          { error: String(intelligenceError) },
          '⚠️ Intelligence layer partially initialized'
        );
      }

      // 5. Pre-cache essential tools
      await this.preloadEssentialTools();
      log.info('⚡ Essential tools pre-cached');

      this.initialized = true;
      const elapsed = Date.now() - startTime;

      log.info(
        {
          totalTools: allTools.length,
          semanticIndex: this.config.precomputeEmbeddings,
          alwaysDomains: this.config.alwaysDomains,
          maxTools: this.config.maxTools,
          elapsedMs: elapsed,
        },
        '✅ Unified Tool Orchestrator ready'
      );
    } catch (error) {
      log.error({ error }, '❌ Failed to initialize tool orchestrator');
      throw error;
    }
  }

  /**
   * Pre-load essential tools that are always available
   */
  private async preloadEssentialTools(): Promise<void> {
    // Build essential tools to warm the cache
    await buildEssentialTools();
  }

  // ==========================================================================
  // MAIN API: GET TOOLS FOR INTENT
  // ==========================================================================

  /**
   * Get the optimal tool set for a user's intent
   *
   * This is the main API - call this for every conversation turn
   * to get the right tools for the LLM.
   */
  async getToolsForIntent(request: ToolSelectionRequest): Promise<ToolSelectionResult> {
    const startTime = Date.now();

    if (!this.initialized) {
      log.warn('Orchestrator not initialized, initializing now...');
      await this.initialize();
    }

    // Check cache
    const cacheKey = this.buildCacheKey(request);
    const cached = this.selectionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.selectionCacheTtlMs) {
      log.debug({ cacheKey }, '📋 Returning cached tool selection');
      return cached.result;
    }

    const warnings: string[] = [];
    const sources = { essential: 0, semantic: 0, contextual: 0, mcp: 0, intelligence: 0 };

    // Build tool context
    const ctx: ToolContext = {
      userId: request.userId,
      agentId: request.agentId,
      agentDisplayName: request.agentDisplayName || request.agentId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      services: undefined as any, // Will be populated by builder
      // IP-detected location for weather, local content (TikTok-style)
      userLocation: request.userLocation,
    };

    // 0. GET INTELLIGENCE ENHANCEMENT (Better Than Human)
    let intelligenceEnhancement: IntelligenceEnhancement | null = null;
    try {
      const intelligence = getUnifiedIntelligence();
      intelligenceEnhancement = await intelligence.enhanceToolSelection(request.userId, {
        personaId: request.agentId,
        timeOfDay: new Date(),
        transcript: request.transcript,
        sessionHistory: request.conversationHistory,
        // Better Than Human: Pass voice emotion for emotion-aware selection
        voiceEmotion: request.context?.voiceEmotion,
        // Better Than Human: Pass previous persona for cross-persona intelligence
        previousPersonaId: request.context?.previousPersonaId,
      });

      if (intelligenceEnhancement.anticipatedTools.length > 0) {
        log.debug(
          {
            anticipated: intelligenceEnhancement.anticipatedTools,
            prioritized: intelligenceEnhancement.prioritizeTools.slice(0, 5),
            emotionAware: !!intelligenceEnhancement.emotionAwareBoosts,
            crossPersona: !!intelligenceEnhancement.crossPersonaContext,
          },
          '🧠 Intelligence enhancement applied (Better Than Human)'
        );
      }

      // Log emotion-aware boosts
      if (intelligenceEnhancement.emotionAwareBoosts) {
        log.info(
          {
            boostedDomains: intelligenceEnhancement.emotionAwareBoosts.boostedDomains,
            reason: intelligenceEnhancement.emotionAwareBoosts.reason,
            stressLevel: intelligenceEnhancement.emotionAwareBoosts.stressLevel,
          },
          '🫂 Emotion-aware tool boosts applied'
        );
      }
    } catch (intelligenceError) {
      log.debug({ error: String(intelligenceError) }, 'Intelligence enhancement unavailable');
    }

    // 1. ALWAYS-AVAILABLE TOOLS (Tier 0)
    const alwaysTools = await this.getAlwaysAvailableTools(ctx);
    sources.essential = Object.keys(alwaysTools).length;

    // 2. SEMANTIC RETRIEVAL
    const { semanticTools, matches } = await this.getSemanticTools(
      request.transcript,
      ctx,
      request.conversationHistory
    );
    sources.semantic = Object.keys(semanticTools).length;

    // 3. CONTEXTUAL TOOLS (based on emotion, time, etc.)
    let contextualTools: Record<string, Tool> = {};
    if (this.config.enableContextualTools && request.context) {
      contextualTools = await this.getContextualTools(request.context, ctx);
      sources.contextual = Object.keys(contextualTools).length;
    }

    // 4. INTENT-BASED DOMAINS
    const intent = detectToolIntent(request.transcript);
    let intentTools: Record<string, Tool> = {};
    if (intent.domains.length > 0) {
      intentTools = await this.getToolsForDomains(intent.domains, ctx);
      log.debug(
        { intent: intent.categories, domains: intent.domains },
        '🎯 Intent-based domains detected'
      );
    }

    // 5. ANTICIPATED TOOLS (from intelligence layer - proactive loading)
    let anticipatedTools: Record<string, Tool> = {};
    if (intelligenceEnhancement?.anticipatedTools.length) {
      anticipatedTools = await this.getToolsByIds(intelligenceEnhancement.anticipatedTools, ctx);
      sources.intelligence = Object.keys(anticipatedTools).length;
    }

    // 6. MERGE AND FILTER
    let allTools: Record<string, Tool> = {
      ...alwaysTools,
      ...semanticTools,
      ...contextualTools,
      ...intentTools,
      ...anticipatedTools,
    };

    // ======== NEW: Apply model-config.json settings ========

    // 5a. Apply includedTools from config (always include these)
    if (this.config.includedTools.length > 0) {
      const configIncludedTools = await this.getToolsByIds(this.config.includedTools, ctx);
      allTools = { ...allTools, ...configIncludedTools };
      if (this.config.debugMode) {
        log.debug({ includedTools: this.config.includedTools }, '🔧 Config: Force-included tools');
      }
    }

    // 5b. Apply request-level force include/exclude
    if (request.forceInclude?.length) {
      const forcedTools = await this.getToolsByIds(request.forceInclude, ctx);
      allTools = { ...allTools, ...forcedTools };
    }

    // 5c. Apply excludedTools from config (filter these out)
    if (this.config.excludedTools.length > 0) {
      const beforeCount = Object.keys(allTools).length;
      for (const toolId of this.config.excludedTools) {
        delete allTools[toolId];
      }
      if (this.config.debugMode) {
        const afterCount = Object.keys(allTools).length;
        log.debug(
          { excludedTools: this.config.excludedTools, removed: beforeCount - afterCount },
          '🔧 Config: Excluded tools filtered out'
        );
      }
    }

    // 5d. Apply request-level force exclude
    if (request.forceExclude?.length) {
      for (const toolId of request.forceExclude) {
        delete allTools[toolId];
      }
    }

    // Handle deprecations
    if (this.config.enableDeprecationWarnings) {
      for (const [toolId, tool] of Object.entries(allTools)) {
        if (isToolDeprecated(toolId)) {
          const replacement = getSuggestedReplacement(toolId);
          if (replacement && !allTools[replacement]) {
            warnings.push(`Tool ${toolId} is deprecated, consider ${replacement}`);
          }
        }
      }
    }

    // Limit to max tools
    const finalTools = this.limitTools(allTools, this.config.maxTools);

    // ======== NEW: Debug logging from config ========
    if (this.config.logToolSchemas) {
      const toolSchemas = Object.entries(finalTools).map(([id, tool]) => ({
        id,
        description: tool.description?.slice(0, 100),
      }));
      log.info({ toolSchemas }, '📋 Tool schemas being sent to LLM');
    }

    // Build result
    const result: ToolSelectionResult = {
      tools: finalTools,
      meta: {
        totalAvailable: toolRegistry.getAll().length,
        selected: Object.keys(finalTools).length,
        selectionTimeMs: Date.now() - startTime,
        sources,
        detectedIntent: intent.domains.length > 0 ? intent : null,
        semanticMatches: matches,
        warnings,
        // Include intelligence enhancement info (Better Than Human)
        intelligenceEnhancement: intelligenceEnhancement
          ? {
              anticipatedTools: intelligenceEnhancement.anticipatedTools,
              prioritizedTools: intelligenceEnhancement.prioritizeTools.slice(0, 10),
              proactiveSuggestions: intelligenceEnhancement.proactiveSuggestions.length,
              isReturningUser: intelligenceEnhancement.contextHints.isReturningUser,
            }
          : undefined,
      },
    };

    // Cache result
    this.selectionCache.set(cacheKey, { result, timestamp: Date.now() });

    log.info(
      {
        transcript: request.transcript.slice(0, 50),
        selected: result.meta.selected,
        sources,
        elapsedMs: result.meta.selectionTimeMs,
      },
      '🔧 Tools selected for intent'
    );

    return result;
  }

  // ==========================================================================
  // LAYER 1: SEMANTIC RETRIEVAL
  // ==========================================================================

  /**
   * Get tools based on semantic similarity to the user's intent
   */
  private async getSemanticTools(
    transcript: string,
    ctx: ToolContext,
    conversationHistory?: string[]
  ): Promise<{ semanticTools: Record<string, Tool>; matches: SemanticMatch[] }> {
    // Build query from transcript + recent history for better context
    let query = transcript;
    if (conversationHistory?.length) {
      const recentHistory = conversationHistory.slice(-3).join(' ');
      query = `${recentHistory} ${transcript}`;
    }

    // Get semantic matches
    const matches = await semanticRouter.findRelevantToolsAsync(query);

    // Build tools from matches
    const tools: Record<string, Tool> = {};
    for (const match of matches) {
      const toolDef = toolRegistry.get(match.toolId);
      if (toolDef) {
        try {
          tools[match.toolId] = toolDef.create(ctx);
        } catch (error) {
          log.warn({ toolId: match.toolId, error }, 'Failed to create semantic tool');
        }
      }
    }

    return { semanticTools: tools, matches };
  }

  // ==========================================================================
  // LAYER 2: ALWAYS-AVAILABLE TOOLS
  // ==========================================================================

  /**
   * Get tools that are ALWAYS available (Tier 0)
   * These should already be loaded during initialization, but we'll check just in case
   */
  private async getAlwaysAvailableTools(ctx: ToolContext): Promise<Record<string, Tool>> {
    const tools: Record<string, Tool> = {};

    // Ensure always-available domains are loaded (should already be loaded at init)
    const domainsToLoad = this.config.alwaysDomains.filter((domain) => {
      const existing = toolRegistry.query({ domains: [domain] });
      return existing.length === 0;
    });

    if (domainsToLoad.length > 0) {
      log.debug({ domains: domainsToLoad }, '🔄 Lazy loading always-available domains');
      await loadToolDomainsLazy(domainsToLoad);
    }

    for (const domain of this.config.alwaysDomains) {
      const domainTools = toolRegistry.query({ domains: [domain] });
      log.debug({ domain, toolCount: domainTools.length }, 'Querying always-available domain');
      for (const toolDef of domainTools) {
        try {
          tools[toolDef.id] = toolDef.create(ctx);
        } catch (error) {
          log.warn(
            { toolId: toolDef.id, error: String(error) },
            'Failed to create always-available tool'
          );
        }
      }
    }

    return tools;
  }

  // ==========================================================================
  // LAYER 3: CONTEXTUAL TOOLS
  // ==========================================================================

  /**
   * Get tools based on contextual signals (emotion, time, etc.)
   * Lazy loads domains as needed
   */
  private async getContextualTools(
    context: ToolSelectionContext,
    ctx: ToolContext
  ): Promise<Record<string, Tool>> {
    const tools: Record<string, Tool> = {};
    const domainsToLoad: ToolDomain[] = [];

    // Crisis mode - load crisis tools
    if (context.isCrisis) {
      domainsToLoad.push('crisis' as ToolDomain);
    }

    // Emotional context
    if (context.emotion) {
      switch (context.emotion) {
        case 'stressed':
        case 'anxious':
          domainsToLoad.push('presence' as ToolDomain, 'wellness' as ToolDomain);
          break;
        case 'sad':
          domainsToLoad.push('self-compassion' as ToolDomain, 'grief' as ToolDomain);
          break;
        case 'excited':
        case 'happy':
          domainsToLoad.push('play' as ToolDomain, 'engagement' as ToolDomain);
          break;
      }
    }

    // Time of day
    if (context.timeOfDay) {
      switch (context.timeOfDay) {
        case 'morning':
          domainsToLoad.push('habits' as ToolDomain, 'productivity' as ToolDomain);
          break;
        case 'evening':
        case 'night':
          domainsToLoad.push('wellness' as ToolDomain, 'presence' as ToolDomain);
          break;
      }
    }

    // New user context
    if (context.isNewUser) {
      domainsToLoad.push('engagement' as ToolDomain);
    }

    // Dedupe domains
    const uniqueDomains = [...new Set(domainsToLoad)];

    // Lazy load domains that aren't loaded yet
    const unloadedDomains = uniqueDomains.filter((domain) => {
      const existing = toolRegistry.query({ domains: [domain] });
      return existing.length === 0;
    });

    if (unloadedDomains.length > 0) {
      log.debug({ domains: unloadedDomains }, '🔄 Lazy loading contextual domains');
      await loadToolDomainsLazy(unloadedDomains);
    }

    // Load contextual domains
    for (const domain of uniqueDomains) {
      const domainTools = toolRegistry.query({ domains: [domain] });
      for (const toolDef of domainTools.slice(0, 3)) {
        // Limit per domain
        try {
          tools[toolDef.id] = toolDef.create(ctx);
        } catch {
          // Ignore creation errors for contextual tools
        }
      }
    }

    return tools;
  }

  // ==========================================================================
  // MID-SESSION REFRESH
  // ==========================================================================

  /**
   * Check if tools should be refreshed based on new context
   * Call this when you detect a significant topic/emotion shift
   */
  async shouldRefreshTools(request: RefreshRequest): Promise<RefreshResult> {
    const intent = detectToolIntent(request.newTranscript);

    // Check if new intent requires tools not currently loaded
    const newDomainsNeeded = intent.domains.filter((domain) => {
      const domainTools = toolRegistry.query({ domains: [domain as ToolDomain] });
      return !domainTools.some((t) => request.previousTools.includes(t.id));
    });

    if (newDomainsNeeded.length === 0 && intent.confidence < 0.5) {
      return {
        shouldRefresh: false,
        toolsToAdd: [],
        toolsToRemove: [],
        reason: 'Current tools sufficient for detected intent',
      };
    }

    // Determine tools to add
    const toolsToAdd: string[] = [];
    for (const domain of newDomainsNeeded) {
      const domainTools = toolRegistry.query({ domains: [domain as ToolDomain] });
      toolsToAdd.push(...domainTools.slice(0, 5).map((t) => t.id));
    }

    // Don't remove essential tools
    const toolsToRemove = request.previousTools.filter((toolId) => {
      const tool = toolRegistry.get(toolId);
      return (
        tool && !this.config.alwaysDomains.includes(tool.domain) && !toolsToAdd.includes(toolId)
      );
    });

    // Only remove if we need space
    const netChange = toolsToAdd.length - toolsToRemove.length;
    const projectedTotal = request.previousTools.length + netChange;

    if (projectedTotal > this.config.maxTools) {
      // Remove oldest non-essential tools to make room
      const toRemove = projectedTotal - this.config.maxTools;
      // Keep toolsToRemove limited
    }

    return {
      shouldRefresh: toolsToAdd.length > 0,
      toolsToAdd,
      toolsToRemove: toolsToRemove.slice(0, 5),
      reason: `Detected shift to ${intent.categories.join(', ')} - adding ${toolsToAdd.length} tools`,
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Get tools for specific domains
   * Automatically lazy-loads domains if they're not already loaded
   * Respects enabledDomains filter from model-config.json
   */
  private async getToolsForDomains(
    domains: string[],
    ctx: ToolContext
  ): Promise<Record<string, Tool>> {
    const tools: Record<string, Tool> = {};

    // Filter domains by enabledDomains config (if set)
    let filteredDomains = domains;
    if (this.config.enabledDomains.length > 0) {
      filteredDomains = domains.filter((d) => this.config.enabledDomains.includes(d));
      if (this.config.debugMode && filteredDomains.length !== domains.length) {
        log.debug(
          {
            requested: domains,
            allowed: this.config.enabledDomains,
            filtered: filteredDomains,
          },
          '🔧 Config: Filtered domains by enabledDomains'
        );
      }
    }

    // Lazy load domains that aren't loaded yet
    const domainsToLoad = filteredDomains.filter((domain) => {
      const existing = toolRegistry.query({ domains: [domain as ToolDomain] });
      return existing.length === 0;
    });

    if (domainsToLoad.length > 0) {
      log.debug({ domains: domainsToLoad }, '🔄 Lazy loading unloaded domains');
      await loadToolDomainsLazy(domainsToLoad as ToolDomain[]);
    }

    for (const domain of filteredDomains) {
      const domainTools = toolRegistry.query({ domains: [domain as ToolDomain] });
      for (const toolDef of domainTools) {
        try {
          tools[toolDef.id] = toolDef.create(ctx);
        } catch {
          // Ignore
        }
      }
    }

    return tools;
  }

  /**
   * Get specific tools by ID
   */
  private async getToolsByIds(toolIds: string[], ctx: ToolContext): Promise<Record<string, Tool>> {
    const tools: Record<string, Tool> = {};

    for (const id of toolIds) {
      const toolDef = toolRegistry.get(id);
      if (toolDef) {
        try {
          tools[id] = toolDef.create(ctx);
        } catch {
          // Ignore
        }
      }
    }

    return tools;
  }

  /**
   * Limit tools to maxTools, prioritizing essential and high-similarity matches
   */
  private limitTools(tools: Record<string, Tool>, maxTools: number): Record<string, Tool> {
    const entries = Object.entries(tools);

    if (entries.length <= maxTools) {
      return tools;
    }

    // Sort: essential domains first, then by name (stable sort)
    const sorted = entries.sort(([idA], [idB]) => {
      const toolA = toolRegistry.get(idA);
      const toolB = toolRegistry.get(idB);

      const aEssential = toolA && this.config.alwaysDomains.includes(toolA.domain);
      const bEssential = toolB && this.config.alwaysDomains.includes(toolB.domain);

      if (aEssential && !bEssential) return -1;
      if (bEssential && !aEssential) return 1;
      return 0;
    });

    const limited = sorted.slice(0, maxTools);
    const result: Record<string, Tool> = {};

    for (const [id, tool] of limited) {
      result[id] = tool;
    }

    log.debug({ original: entries.length, limited: limited.length }, '🔪 Tools limited to max');

    return result;
  }

  /**
   * Build cache key for tool selection
   */
  private buildCacheKey(request: ToolSelectionRequest): string {
    // Normalize transcript to reduce cache misses
    const normalizedTranscript = request.transcript
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .slice(0, 100);

    return `${request.agentId}:${request.userId}:${normalizedTranscript}`;
  }

  // ==========================================================================
  // DIAGNOSTICS
  // ==========================================================================

  /**
   * Explain why tools were selected (for debugging)
   */
  explainSelection(result: ToolSelectionResult): string {
    let explanation = '🔧 Tool Selection Breakdown\n\n';

    explanation += `Selected ${result.meta.selected} of ${result.meta.totalAvailable} tools\n`;
    explanation += `Selection time: ${result.meta.selectionTimeMs}ms\n\n`;

    explanation += 'Sources:\n';
    explanation += `  • Essential (always): ${result.meta.sources.essential}\n`;
    explanation += `  • Semantic (matched): ${result.meta.sources.semantic}\n`;
    explanation += `  • Contextual (smart): ${result.meta.sources.contextual}\n`;
    explanation += `  • MCP (external): ${result.meta.sources.mcp}\n`;
    explanation += `  • Intelligence (anticipated): ${result.meta.sources.intelligence}\n\n`;

    // Better Than Human intelligence enhancement
    if (result.meta.intelligenceEnhancement) {
      const ie = result.meta.intelligenceEnhancement;
      explanation += '🧠 Better Than Human Intelligence:\n';
      explanation += `  • Returning user: ${ie.isReturningUser ? 'Yes' : 'No'}\n`;
      if (ie.anticipatedTools.length > 0) {
        explanation += `  • Anticipated tools: ${ie.anticipatedTools.join(', ')}\n`;
      }
      if (ie.prioritizedTools.length > 0) {
        explanation += `  • Prioritized tools: ${ie.prioritizedTools.slice(0, 5).join(', ')}\n`;
      }
      if (ie.proactiveSuggestions > 0) {
        explanation += `  • Proactive suggestions ready: ${ie.proactiveSuggestions}\n`;
      }
      explanation += '\n';
    }

    if (result.meta.detectedIntent) {
      explanation += `Detected Intent:\n`;
      explanation += `  Categories: ${result.meta.detectedIntent.categories.join(', ')}\n`;
      explanation += `  Domains: ${result.meta.detectedIntent.domains.join(', ')}\n`;
      explanation += `  Confidence: ${(result.meta.detectedIntent.confidence * 100).toFixed(0)}%\n\n`;
    }

    if (result.meta.semanticMatches.length > 0) {
      explanation += 'Top Semantic Matches:\n';
      for (const match of result.meta.semanticMatches.slice(0, 5)) {
        explanation += `  • ${match.toolId} (${(match.similarity * 100).toFixed(0)}%)\n`;
      }
    }

    if (result.meta.warnings.length > 0) {
      explanation += '\n⚠️ Warnings:\n';
      for (const warning of result.meta.warnings) {
        explanation += `  • ${warning}\n`;
      }
    }

    return explanation;
  }

  /**
   * Get orchestrator stats
   */
  getStats(): {
    initialized: boolean;
    totalTools: number;
    cacheSize: number;
    config: OrchestratorConfig;
  } {
    return {
      initialized: this.initialized,
      totalTools: this.initialized ? toolRegistry.getAll().length : 0,
      cacheSize: this.selectionCache.size,
      config: this.config,
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.selectionCache.clear();
    semanticRouter.clearCache();
    log.info('🧹 Orchestrator caches cleared');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const toolOrchestrator = new UnifiedToolOrchestrator();

export default toolOrchestrator;
