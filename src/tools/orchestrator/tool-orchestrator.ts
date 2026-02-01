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

import {
  getFtisV5Threshold,
  getFtisV7Threshold,
  isFtisV5Enabled,
  isFtisV7Enabled,
} from '../../config/tool-config.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  getSuggestedReplacement,
  initializeToolLifecycle,
  isToolDeprecated,
} from '../advanced/tool-lifecycle.js';
import { buildEssentialTools } from '../builder.js';
import { detectToolIntent, type DetectedIntent } from '../dynamic-tool-router.js';
import { toolRegistry } from '../registry/index.js';
import { initializeToolRegistry, loadToolDomainsLazy } from '../registry/loader.js';
import {
  EnvironmentServiceRegistry,
  type Tool,
  type ToolContext,
  type ToolDomain,
} from '../registry/types.js';
// Semantic router for tool matching
import { semanticRouter, type SemanticMatch } from '../semantic-router/compat.js';
// FTIS V5 ONNX classifier for direct tool routing
import {
  classifyWithOnnx,
  initializeOnnxClassifier,
  type ClassificationOutput,
} from '../semantic-router/advanced/intelligent/onnx-classifier.js';
// FTIS V7 hierarchical classifier (domain → meta-tool two-stage)
import {
  classifyHierarchicalSafe,
  initializeHierarchicalClassifier,
  isHierarchicalClassifierAvailable,
  type HierarchicalClassificationOutput,
} from '../semantic-router/advanced/intelligent/hierarchical-classifier.js';
// V7 domain label → ToolDomain mapping (V7 taxonomy uses different names than tool registry)
import { mapV7DomainToToolDomains } from '../semantic-router/advanced/intelligent/v7-domain-map.js';

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
// These domains are ALWAYS sent to the LLM - they don't rely on semantic matching
// CRITICAL: Include all user-facing essentials, not just system domains!
// Must stay in sync with ESSENTIAL_DOMAINS in registry/loader.ts
const BASE_ALWAYS_DOMAINS: ToolDomain[] = [
  // Core system domains
  'memory',
  'handoff',

  // User-facing essential domains (users expect these to ALWAYS work)
  'calendar', // Schedule meetings, events, reminders
  'scheduling', // Scheduling coordination
  'communication', // Send messages, emails
  'telephony', // Make phone calls ("call my mom")
  'productivity', // Todos, notes, tasks
  'family', // Family-related actions, messages

  // Daily wellness & habits (people check these every day!)
  'habits', // "How are my habits?", "Log my workout"
  'wellness', // "I'm stressed", emotional support

  // Entertainment & info
  'entertainment', // Music, media
  'information', // Weather, news, search
  'games', // Name That Tune, Tic-Tac-Toe, etc.
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
    // Use admin config maxTools. 0 = unlimited (semantic router filters)
    maxTools: adminConfig.maxTools,
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
  maxTools: 0, // 0 = unlimited, semantic router handles filtering
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
      // =======================================================================
      // FAST INITIALIZATION: Use manifest + lazy loading!
      // OLD: lazyLoading: false → loads ALL 98 domains → 5-15 seconds
      // NEW: lazyLoading: true  → loads only essential → ~500ms
      // =======================================================================

      // Check if we have pre-built artifacts for fast semantic search
      let useManifestForSemantics = false;
      try {
        const { isManifestLoaded, loadToolManifest } =
          await import('../registry/manifest-loader.js');
        const { areEmbeddingsLoaded, loadPrecomputedEmbeddings } =
          await import('../semantic-router/precomputed-embeddings.js');

        // Load manifest if not already loaded
        if (!isManifestLoaded()) {
          await loadToolManifest();
        }
        // Load embeddings if not already loaded
        if (!areEmbeddingsLoaded()) {
          await loadPrecomputedEmbeddings();
        }

        useManifestForSemantics = isManifestLoaded() && areEmbeddingsLoaded();
        if (useManifestForSemantics) {
          log.info('⚡ Pre-built manifest + embeddings available for fast semantic search');
        }
      } catch (artifactError) {
        log.debug({ error: String(artifactError) }, 'Pre-built artifacts not available');
      }

      // 1. Initialize tool registry with LAZY LOADING (only essential domains)
      // Other domains will be loaded on-demand when tools are actually created
      await initializeToolRegistry({
        lazyLoading: true, // ⚡ KEY CHANGE: Only load essential domains!
        loadHighPriority: true,
      });
      const allTools = toolRegistry.getAll();
      log.info(
        { toolCount: allTools.length, lazyLoading: true },
        '📦 Tool registry initialized (essential only)'
      );

      // 2. Initialize semantic router (builds embedding index)
      if (this.config.precomputeEmbeddings) {
        await semanticRouter.initialize();
        log.info('🎯 Semantic router initialized');
      }

      // 2b. Initialize FTIS ONNX classifiers (V7 hierarchical or V5 flat)
      if (isFtisV7Enabled()) {
        try {
          await initializeHierarchicalClassifier();
          log.info('🧠 FTIS V7 hierarchical classifier initialized (2-stage domain→meta-tool)');
        } catch (v7Error) {
          log.warn(
            { error: String(v7Error) },
            'FTIS V7 initialization failed, will try V5 fallback'
          );
        }
      }
      if (isFtisV5Enabled()) {
        try {
          await initializeOnnxClassifier();
          log.info('🧠 FTIS V5 ONNX classifier initialized (98% top-1 accuracy)');
        } catch (ftisError) {
          log.warn(
            { error: String(ftisError) },
            'FTIS V5 initialization failed, using semantic fallback'
          );
        }
      }

      // 3. Initialize tool lifecycle (A/B testing, deprecation, etc.)
      await initializeToolLifecycle({
        buildSemanticIndex: true,
        checkDeprecations: this.config.enableDeprecationWarnings,
        toolDefinitions: allTools,
      });
      log.info('🔄 Tool lifecycle initialized');

      // 4. Pre-cache essential tools
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
    // =========================================================================
    // SIMPLIFIED ROUTING (Feature Flag)
    // When enabled, use a clean 3-layer approach:
    // 1. Essential tools (always-on domains)
    // 2. Semantic tools (embedding matching)
    // 3. Contextual tools (emotion/time/crisis)
    // Then let the LLM's native function calling decide which to use.
    // =========================================================================
    if (process.env.USE_SIMPLIFIED_ROUTING === 'true') {
      return this.getToolsSimplified(request);
    }

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
      // Use EnvironmentServiceRegistry to check actual env vars for service availability
      // This enables tools that require external services (Twilio, Plaid, etc.)
      services: new EnvironmentServiceRegistry(),
      // IP-detected location for weather, local content (TikTok-style)
      userLocation: request.userLocation,
    };

    // ==========================================================================
    // ⚡ PARALLELIZED TOOL FETCHING - Run independent operations concurrently
    // These operations don't depend on each other, so run them in parallel
    // to reduce total latency from O(n) to O(max(n))
    // ==========================================================================

    // 4. INTENT-BASED DOMAINS (sync - no await needed for detection)
    const intent = detectToolIntent(request.transcript);

    // Start all independent fetches in parallel
    const [alwaysTools, semanticResult, contextualTools, intentTools] = await Promise.all([
      // 1. ALWAYS-AVAILABLE TOOLS (Tier 0)
      this.getAlwaysAvailableTools(ctx),

      // 2. SEMANTIC RETRIEVAL
      this.getSemanticTools(request.transcript, ctx, request.conversationHistory),

      // 3. CONTEXTUAL TOOLS (based on emotion, time, etc.)
      this.config.enableContextualTools && request.context
        ? this.getContextualTools(request.context, ctx)
        : Promise.resolve({} as Record<string, Tool>),

      // 4. INTENT-BASED DOMAINS
      intent.domains.length > 0
        ? this.getToolsForDomains(intent.domains, ctx)
        : Promise.resolve({} as Record<string, Tool>),
    ]);

    // Unpack semantic result
    const { semanticTools, matches } = semanticResult;

    // Update sources
    sources.essential = Object.keys(alwaysTools).length;
    sources.semantic = Object.keys(semanticTools).length;
    sources.contextual = Object.keys(contextualTools).length;

    if (intent.domains.length > 0) {
      log.debug(
        { intent: intent.categories, domains: intent.domains },
        '🎯 Intent-based domains detected'
      );
    }

    // 6. MERGE AND FILTER
    let allTools: Record<string, Tool> = {
      ...alwaysTools,
      ...semanticTools,
      ...contextualTools,
      ...intentTools,
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
      },
    };

    // Cache result
    this.selectionCache.set(cacheKey, { result, timestamp: Date.now() });

    // Calculate estimated token usage from tool schemas
    const toolSchemaTokens = Object.values(finalTools).reduce((total, tool) => {
      // Estimate: tool name (~10 tokens) + description (~30 tokens) + params (~50 tokens)
      const descLen = tool.description?.length || 0;
      return total + 10 + Math.round(descLen / 4) + 50;
    }, 0);

    const MAX_TOOL_TOKENS = 8000; // Safe limit for tool schemas
    const toolUsagePercent = Math.round((toolSchemaTokens / MAX_TOOL_TOKENS) * 100);

    if (toolUsagePercent > 80) {
      log.warn(
        {
          toolCount: result.meta.selected,
          estimatedTokens: toolSchemaTokens,
          usagePercent: toolUsagePercent,
          maxTools: this.config.maxTools,
        },
        `⚠️ Tool schema size at ${toolUsagePercent}% of safe limit - consider reducing maxTools`
      );
    }

    // ======== OBSERVABILITY: Structured logging for monitoring ========
    // This block provides rich telemetry for debugging and dashboards
    const observabilityData = {
      // Request context
      transcript: request.transcript.slice(0, 50),
      userId: request.userId.slice(0, 8), // Truncate for privacy
      personaId: request.agentId,
      sessionId: request.context?.sessionId?.slice(0, 12),

      // Selection metrics
      selected: result.meta.selected,
      totalAvailable: result.meta.totalAvailable,
      selectionTimeMs: result.meta.selectionTimeMs,

      // Token budget
      toolTokens: toolSchemaTokens,
      toolUsagePercent,
      maxTools: this.config.maxTools,

      // Routing layers active
      layers: {
        semantic: matches.length > 0,
        intent: intent.domains.length > 0,
      },

      // Intent detection
      ...(intent.domains.length > 0 && {
        detectedDomains: intent.domains.slice(0, 3),
        intentConfidence: Math.round(intent.confidence * 100),
      }),

      // Top matches (for debugging semantic router)
      topMatches: matches.slice(0, 3).map((m) => ({
        tool: m.toolId,
        score: Math.round(m.similarity * 100),
      })),

      // Source breakdown
      sources,
    };

    log.info(observabilityData, '🔧 Tool selection complete');

    // Emit observability event for external monitoring (fire-and-forget)
    this.emitToolSelectionEvent(observabilityData).catch((err) => {
      log.debug({ error: String(err) }, 'Tool selection event emission failed (non-critical)');
    });

    return result;
  }

  // ==========================================================================
  // SIMPLIFIED ROUTING (Feature Flag: USE_SIMPLIFIED_ROUTING=true)
  // ==========================================================================

  /**
   * Simplified tool selection: Trust the LLM to pick the right tool.
   *
   * PHILOSOPHY: Modern LLMs (OpenAI, Gemini) have excellent native function calling.
   * Our job is just to pre-filter to ~40 relevant tools and let the LLM decide.
   *
   * 3-LAYER APPROACH:
   * 1. Essential tools (always-on domains like memory, calendar, music)
   * 2. Semantic tools (embedding matching for the user's transcript)
   * 3. Contextual tools (emotion/time/crisis based boosting)
   *
   * REMOVED COMPLEXITY:
   * - FTIS classification (LLM handles this natively)
   * - Memory-aware routing (over-engineered for marginal benefit)
   * - Intelligence enhancement (subsumed into contextual tools)
   * - MCTS planning (over-engineered for tool selection)
   */
  private async getToolsSimplified(request: ToolSelectionRequest): Promise<ToolSelectionResult> {
    const startTime = Date.now();

    if (!this.initialized) {
      log.warn('Orchestrator not initialized, initializing now...');
      await this.initialize();
    }

    // Check cache
    const cacheKey = this.buildCacheKey(request);
    const cached = this.selectionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.selectionCacheTtlMs) {
      log.debug({ cacheKey }, '📋 [SIMPLIFIED] Returning cached tool selection');
      return cached.result;
    }

    const warnings: string[] = [];

    // Build tool context
    const ctx: ToolContext = {
      userId: request.userId,
      agentId: request.agentId,
      agentDisplayName: request.agentDisplayName || request.agentId,
      services: new EnvironmentServiceRegistry(),
      userLocation: request.userLocation,
    };

    // =========================================================================
    // FTIS CLASSIFIER FAST PATH (V7 hierarchical → V5 flat → semantic fallback)
    // =========================================================================
    // V7: Two-stage classifier (domain → meta-tool), loads domain tools directly
    // V5: Flat classifier (860 tools), loads individual predicted tools
    // Both skip semantic routing when high-confidence match found.
    // =========================================================================
    let ftisTools: Record<string, Tool> = {};
    let ftisV5Classification: ClassificationOutput | null = null;
    let ftisV7Classification: HierarchicalClassificationOutput | null = null;

    // --- V7 Hierarchical Classifier (preferred when available) ---
    if (isFtisV7Enabled() && isHierarchicalClassifierAvailable()) {
      try {
        ftisV7Classification = classifyHierarchicalSafe(request.transcript);
        const threshold = getFtisV7Threshold();

        if (ftisV7Classification && ftisV7Classification.predictions.length > 0) {
          const topPrediction = ftisV7Classification.predictions[0];

          if (topPrediction.combinedConfidence >= threshold) {
            // High confidence - map V7 domain label to tool registry domains
            const toolDomains = mapV7DomainToToolDomains(topPrediction.domain);

            if (toolDomains.length > 0) {
              await loadToolDomainsLazy(toolDomains);

              // Get all tools in the mapped domains
              for (const domain of toolDomains) {
                const domainToolDefs = toolRegistry.query({ domains: [domain] });
                for (const toolDef of domainToolDefs) {
                  try {
                    ftisTools[toolDef.id] = toolDef.create(ctx);
                  } catch {
                    // Skip tools that fail to create
                  }
                }
              }
            }

            log.info(
              {
                transcript: request.transcript.slice(0, 50),
                v7Domain: topPrediction.domain,
                toolDomains: toolDomains.join(','),
                metaTool: topPrediction.metaTool,
                domainConfidence: topPrediction.domainConfidence.toFixed(3),
                metaToolConfidence: topPrediction.metaToolConfidence.toFixed(3),
                combinedConfidence: topPrediction.combinedConfidence.toFixed(3),
                toolCount: Object.keys(ftisTools).length,
                latencyMs: ftisV7Classification.latencyMs,
              },
              '🧠 [FTIS V7] High confidence hierarchical classification'
            );
          } else {
            log.debug(
              {
                domain: topPrediction.domain,
                metaTool: topPrediction.metaTool,
                combinedConfidence: topPrediction.combinedConfidence.toFixed(3),
                threshold,
              },
              '🧠 [FTIS V7] Low confidence, falling through to V5/semantic'
            );
          }
        }
      } catch (v7Error) {
        log.warn({ error: String(v7Error) }, 'FTIS V7 classification failed, falling through');
      }
    }

    // --- V5 Flat Classifier (fallback when V7 didn't produce results) ---
    if (Object.keys(ftisTools).length === 0 && isFtisV5Enabled()) {
      try {
        ftisV5Classification = await classifyWithOnnx(request.transcript);
        const threshold = getFtisV5Threshold();

        if (ftisV5Classification.predictions.length > 0) {
          const topPrediction = ftisV5Classification.predictions[0];

          if (topPrediction.confidence >= threshold) {
            // High confidence - load tools from top predictions
            const predictedToolIds = ftisV5Classification.predictions
              .filter((p) => p.confidence >= 0.3) // Include moderate confidence predictions
              .map((p) => p.toolId);

            ftisTools = await this.getToolsByIds(predictedToolIds, ctx);

            log.info(
              {
                transcript: request.transcript.slice(0, 50),
                topTool: topPrediction.toolId,
                confidence: topPrediction.confidence.toFixed(3),
                toolCount: Object.keys(ftisTools).length,
                latencyMs: ftisV5Classification.latencyMs,
              },
              '🧠 [FTIS V5] High confidence classification'
            );
          } else {
            log.debug(
              {
                topTool: topPrediction.toolId,
                confidence: topPrediction.confidence.toFixed(3),
                threshold,
              },
              '🧠 [FTIS V5] Low confidence, using semantic fallback'
            );
          }
        }
      } catch (ftisError) {
        log.warn({ error: String(ftisError) }, 'FTIS V5 classification failed, using semantic');
      }
    }

    // =========================================================================
    // 3 SIMPLE PARALLEL FETCHES - Essential + Semantic + Contextual
    // =========================================================================
    const [essentialTools, semanticResult, contextualTools] = await Promise.all([
      // 1. ESSENTIAL TOOLS (always-on domains)
      this.getAlwaysAvailableTools(ctx),

      // 2. SEMANTIC TOOLS (embedding matching) - skipped if FTIS classifier found high-confidence match
      Object.keys(ftisTools).length > 0
        ? Promise.resolve({ semanticTools: {}, matches: [] as SemanticMatch[] })
        : this.getSemanticTools(request.transcript, ctx, request.conversationHistory),

      // 3. CONTEXTUAL TOOLS (emotion/time/crisis)
      this.config.enableContextualTools && request.context
        ? this.getContextualTools(request.context, ctx)
        : Promise.resolve({} as Record<string, Tool>),
    ]);

    // Unpack semantic result
    const { semanticTools, matches } = semanticResult;

    // Track sources
    const sources = {
      essential: Object.keys(essentialTools).length,
      semantic: Object.keys(semanticTools).length,
      contextual: Object.keys(contextualTools).length,
      mcp: 0,
      intelligence: Object.keys(ftisTools).length, // FTIS classifier tools count (V7 or V5)
    };

    // =========================================================================
    // MERGE AND LIMIT TO 40 TOOLS
    // =========================================================================
    let allTools: Record<string, Tool> = {
      ...essentialTools,
      ...semanticTools,
      ...contextualTools,
      ...ftisTools, // FTIS classifier predictions (V7 or V5) - high priority
    };

    // Apply force include/exclude from request
    if (request.forceInclude?.length) {
      const forcedTools = await this.getToolsByIds(request.forceInclude, ctx);
      allTools = { ...allTools, ...forcedTools };
    }
    if (request.forceExclude?.length) {
      for (const toolId of request.forceExclude) {
        delete allTools[toolId];
      }
    }

    // Apply config-level include/exclude
    if (this.config.includedTools.length > 0) {
      const configIncludedTools = await this.getToolsByIds(this.config.includedTools, ctx);
      allTools = { ...allTools, ...configIncludedTools };
    }
    if (this.config.excludedTools.length > 0) {
      for (const toolId of this.config.excludedTools) {
        delete allTools[toolId];
      }
    }

    // Limit to maxTools (default 40)
    const finalTools = this.limitTools(allTools, this.config.maxTools);

    // Build result
    const result: ToolSelectionResult = {
      tools: finalTools,
      meta: {
        totalAvailable: toolRegistry.getAll().length,
        selected: Object.keys(finalTools).length,
        selectionTimeMs: Date.now() - startTime,
        sources,
        detectedIntent: null, // Simplified mode relies on LLM native intent detection
        semanticMatches: matches,
        warnings,
        // Simplified mode: LLM handles tool selection via native function calling
      },
    };

    // Cache result
    this.selectionCache.set(cacheKey, { result, timestamp: Date.now() });

    // Log selection
    log.info(
      {
        mode: 'SIMPLIFIED',
        selected: result.meta.selected,
        selectionTimeMs: result.meta.selectionTimeMs,
        sources,
        topSemanticMatches: matches.slice(0, 3).map((m) => ({
          tool: m.toolId,
          score: Math.round(m.similarity * 100),
        })),
      },
      '🔧 [SIMPLIFIED] Tool selection complete'
    );

    return result;
  }

  // ==========================================================================
  // LAYER 1: SEMANTIC RETRIEVAL
  // ==========================================================================

  /**
   * Get tools based on semantic similarity to the user's intent
   *
   * OPTIMIZATION: Uses pre-computed embeddings when available for 100x faster matching!
   * Then lazy-loads only the domains we actually need.
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

    // =========================================================================
    // FAST PATH: Use pre-computed embeddings if available (100x faster!)
    // =========================================================================
    let matches: SemanticMatch[] = [];
    try {
      const { areEmbeddingsLoaded, semanticSearchTools } =
        await import('../semantic-router/precomputed-embeddings.js');

      if (areEmbeddingsLoaded()) {
        // Use pre-computed embeddings for matching (near-instant)
        const precomputedMatches = await semanticSearchTools(query, {
          topK: 20,
          minSimilarity: this.config.semanticThreshold,
        });

        // Convert to SemanticMatch format (need domain from manifest)
        const { getToolEntry } = await import('../registry/manifest-loader.js');
        for (const m of precomputedMatches) {
          const entry = await getToolEntry(m.toolId);
          matches.push({
            toolId: m.toolId,
            domain: (entry?.domain || 'unknown') as ToolDomain,
            similarity: m.similarity,
            description: entry?.description || '',
          });
        }

        log.debug(
          { matchCount: matches.length, topMatch: matches[0]?.toolId },
          '⚡ Used pre-computed embeddings for semantic matching'
        );
      }
    } catch {
      // Fall back to semantic router
    }

    // =========================================================================
    // FALLBACK: Use semantic router (slower but works without pre-computed)
    // =========================================================================
    if (matches.length === 0) {
      matches = await semanticRouter.findRelevantToolsAsync(query);
    }

    // =========================================================================
    // LAZY LOADING: Load domains on-demand for matched tools
    // =========================================================================
    const tools: Record<string, Tool> = {};
    const domainsToLoad = new Set<string>();

    // First pass: identify which domains need to be loaded
    for (const match of matches) {
      const toolDef = toolRegistry.get(match.toolId);
      if (!toolDef) {
        // Tool not in registry - need to load its domain
        // Get domain from manifest
        try {
          const { getToolEntry } = await import('../registry/manifest-loader.js');
          const entry = await getToolEntry(match.toolId);
          if (entry?.domain) {
            domainsToLoad.add(entry.domain);
          }
        } catch {
          // Can't determine domain, skip this tool
        }
      }
    }

    // Load missing domains in parallel
    const domainsArray = Array.from(domainsToLoad);
    if (domainsArray.length > 0) {
      log.debug({ domains: domainsArray }, '🔄 Lazy-loading domains for matched tools');
      await loadToolDomainsLazy(domainsArray as ToolDomain[]);
    }

    // Second pass: create tools (now domains should be loaded)
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

    // DEBUG: Log alwaysDomains config
    log.info({ alwaysDomains: this.config.alwaysDomains }, '📦 Always-available domains config');

    // Ensure always-available domains are loaded (should already be loaded at init)
    const domainsToLoad = this.config.alwaysDomains.filter((domain) => {
      const existing = toolRegistry.query({ domains: [domain] });
      return existing.length === 0;
    });

    if (domainsToLoad.length > 0) {
      log.info({ domains: domainsToLoad }, '🔄 Lazy loading always-available domains');
      await loadToolDomainsLazy(domainsToLoad);
    }

    for (const domain of this.config.alwaysDomains) {
      const domainTools = toolRegistry.query({ domains: [domain] });
      // DEBUG: Log ALL tool names for each domain
      const toolNames = domainTools.map((t) => t.id);
      log.info(
        { domain, toolCount: domainTools.length, toolNames },
        '📦 Querying always-available domain'
      );
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

    log.info(
      { totalTools: Object.keys(tools).length, toolNames: Object.keys(tools) },
      '📦 Total always-available tools'
    );
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
    const uniqueDomains = Array.from(new Set(domainsToLoad));

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
   * Limit tools to maxTools, prioritizing essential domains
   */
  private limitTools(tools: Record<string, Tool>, maxTools: number): Record<string, Tool> {
    const entries = Object.entries(tools);

    if (entries.length <= maxTools) {
      return tools;
    }

    // Sort: essential domains first, then preserve insertion order
    const sorted = entries.sort(([idA], [idB]) => {
      const toolA = toolRegistry.get(idA);
      const toolB = toolRegistry.get(idB);

      // Essential domains always come first
      const aEssential = toolA && this.config.alwaysDomains.includes(toolA.domain);
      const bEssential = toolB && this.config.alwaysDomains.includes(toolB.domain);

      if (aEssential && !bEssential) return -1;
      if (bEssential && !aEssential) return 1;

      return 0; // Stable sort preserves original order
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
   * Get recent tools used in the session from context carrier
   */
  private getRecentToolsFromSession(sessionId: string): string[] {
    try {
      const { getContextCarrier } = require('../context-carrier.js');
      const carrier = getContextCarrier();
      const sessionContext = carrier.getSessionContext(sessionId);
      return sessionContext?.toolsUsed?.slice(-10) || [];
    } catch {
      return [];
    }
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
  // OBSERVABILITY
  // ==========================================================================

  /**
   * Emit tool selection event for external monitoring systems
   * Fire-and-forget - errors are logged but don't affect tool selection
   */
  private async emitToolSelectionEvent(data: Record<string, unknown>): Promise<void> {
    try {
      // Import the observability emitter lazily to avoid circular deps
      const { emitToolIntelligenceEvent } = await import('../../api/observability-routes.js');
      emitToolIntelligenceEvent('tool_selection', data);
    } catch (err) {
      // Silently ignore - observability should never break tool selection
      log.debug({ error: String(err) }, 'Tool selection event emission failed (non-critical)');
    }
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
