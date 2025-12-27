/**
 * Voice Agent Integration for Semantic Router
 *
 * Integrates the semantic router into the voice agent pipeline.
 * This module intercepts user input BEFORE it reaches the LLM,
 * routes to tools when appropriate, and provides hints for ambiguous cases.
 *
 * INTEGRATION POINTS:
 *
 * 1. Pre-LLM: Route clear tool requests directly
 * 2. LLM Hint: Pass tool suggestions to LLM for ambiguous cases
 * 3. Post-LLM Fallback: Catch tool intents the LLM missed
 *
 * @module tools/semantic-router/voice-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { createEmbeddingProvider } from './embedding-providers.js';
import {
  createSemanticRouter,
  mightNeedTool,
  type ConversationTurn,
  type RouterAction,
  type SemanticRouter,
  type SemanticRouterResult,
  type ToolExecutionResult,
} from './index.js';
import { getToolRegistry } from './registry.js';

// Import all tool definitions (with capability filtering)
import {
  allToolDefinitions,
  getToolStats,
  getAvailableToolDefinitions,
} from './tool-definitions/index.js';

// Import capability checker for runtime availability checks
import {
  isToolAvailable,
  getUnavailabilityReason,
} from './capability-checker.js';

// Import i18n support
import {
  preloadLocales,
  autoDetectAndLoadLocale,
  mergeLocaleIntoTools,
  getLocale,
  initializeMultilingualEmbeddings,
} from './i18n/index.js';
import type { SemanticToolDefinition, EmbeddingProvider } from './types.js';

import { cleanForFirestore } from '../../utils/firestore-utils.js';

// Import advanced SOTA features
import {
  // Learning loop
  enhanceWithLearning,
  recordOutcome,
  handleExplicitCorrection,
  // Tool chains
  detectToolChain,
  learnToolSequence,
  // Deep context
  getDeepContext,
  updateContextWithInput,
  updateContextWithToolResult,
  resolveForTool,
  // Feedback store
  getUserVocabulary,
  calibrateConfidence,
  // NER engine
  initializeNER,
  extractNEREntities,
  // Streaming router
  initializeStreamingRouter,
  getStreamingRouter,
  type StreamingSignal,
  type LearningContext,
  type LearningOutcome,
  // Better Than Human
  analyzeVoiceProsodyForToolBoost,
  generateRoutingExplanation,
  recordEmotionalDataPoint,
  analyzeEmotionalArc,
  analyzeSpeakingPace,
  getToolBoostFromPace,
  performBetterThanHumanAnalysis,
  type VoiceProsodySignals,
  type SpeakingPaceAnalysis,
  type RoutingExplanation,
  type BetterThanHumanAnalysis,
} from './advanced/index.js';

const log = createLogger({ module: 'semantic-router:voice' });

// ============================================================================
// WARM-START CONTEXT (P0 FIX: Pre-warm routing for first turn)
// ============================================================================

/**
 * Session warm-start context for improved first-turn routing.
 *
 * PROBLEM: On session start, the first user turn has an empty transcript,
 * causing degraded routing (no semantic match, falls back to default tools).
 *
 * SOLUTION: Pre-warm the router with user context BEFORE the first turn.
 * This ensures the first turn has optimal tool selection.
 */
interface WarmStartContext {
  userId: string;
  sessionId: string;
  personaId: string;
  /** Recent topics from user history */
  recentTopics?: string[];
  /** User's commonly used tools */
  frequentTools?: string[];
  /** User preferences that affect routing */
  preferences?: Record<string, unknown>;
  /** Last session context */
  lastSessionContext?: {
    lastTool?: string;
    lastTopic?: string;
    timestamp?: number;
  };
}

/** Cache of warm-started sessions */
const warmStartedSessions = new Map<string, { timestamp: number; context: WarmStartContext }>();
const WARM_START_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Pre-warm the semantic router for a session.
 *
 * Call this at session start, BEFORE the first user turn.
 * Significantly improves first-turn tool selection by:
 * 1. Pre-loading likely tools based on user history
 * 2. Priming the deep context with recent topics
 * 3. Caching personalization data
 *
 * @example
 * ```typescript
 * // In session initialization
 * await warmStartSession({
 *   userId: 'user-123',
 *   sessionId: 'session-456',
 *   personaId: 'ferni',
 *   recentTopics: ['music', 'weather'],
 *   frequentTools: ['playMusic', 'getWeather'],
 * });
 * ```
 */
export async function warmStartSession(context: WarmStartContext): Promise<{
  success: boolean;
  preloadedTools: string[];
  primedTopics: string[];
}> {
  const startTime = performance.now();

  try {
    // Ensure router is initialized
    if (!initialized || !router) {
      await initializeVoiceRouter();
    }

    const preloadedTools: string[] = [];
    const primedTopics: string[] = [];

    // 1. Prime deep context with recent topics
    if (context.recentTopics?.length) {
      const deepContext = getDeepContext(context.sessionId);
      for (const topic of context.recentTopics) {
        // Add each topic to context to prime the router
        updateContextWithInput(context.sessionId, `Thinking about ${topic}`, deepContext.currentTurn);
        primedTopics.push(topic);
      }
      log.debug(
        { sessionId: context.sessionId, topics: primedTopics },
        '🔥 Warm-start: Primed deep context with recent topics'
      );
    }

    // 2. Pre-load likely tools based on user history
    if (context.frequentTools?.length) {
      // These tools will be prioritized in the next routing decision
      for (const toolId of context.frequentTools.slice(0, 5)) {
        preloadedTools.push(toolId);
      }
      log.debug(
        { sessionId: context.sessionId, tools: preloadedTools },
        '🔥 Warm-start: Pre-loaded frequent tools'
      );
    }

    // 3. If we have last session context, prime with that too
    if (context.lastSessionContext?.lastTool) {
      const lastTool = context.lastSessionContext.lastTool;
      if (!preloadedTools.includes(lastTool)) {
        preloadedTools.push(lastTool);
      }
    }

    // 4. Cache the warm-start state
    warmStartedSessions.set(context.sessionId, {
      timestamp: Date.now(),
      context,
    });

    // Clean up old warm-start entries
    cleanupWarmStartCache();

    const duration = performance.now() - startTime;
    log.info(
      {
        sessionId: context.sessionId,
        userId: context.userId,
        preloadedToolsCount: preloadedTools.length,
        primedTopicsCount: primedTopics.length,
        durationMs: Math.round(duration),
      },
      '🔥 Session warm-started for optimal first-turn routing'
    );

    return {
      success: true,
      preloadedTools,
      primedTopics,
    };
  } catch (error) {
    log.warn(
      { error: String(error), sessionId: context.sessionId },
      'Warm-start failed (non-fatal, will use cold start)'
    );
    return {
      success: false,
      preloadedTools: [],
      primedTopics: [],
    };
  }
}

/**
 * Check if a session has been warm-started
 */
export function isSessionWarmStarted(sessionId: string): boolean {
  const entry = warmStartedSessions.get(sessionId);
  if (!entry) return false;

  // Check if still valid (within TTL)
  if (Date.now() - entry.timestamp > WARM_START_TTL_MS) {
    warmStartedSessions.delete(sessionId);
    return false;
  }

  return true;
}

/**
 * Get warm-start context for a session (if available)
 */
export function getWarmStartContext(sessionId: string): WarmStartContext | null {
  const entry = warmStartedSessions.get(sessionId);
  if (!entry || Date.now() - entry.timestamp > WARM_START_TTL_MS) {
    return null;
  }
  return entry.context;
}

/**
 * Clear warm-start cache for a session (call on session end)
 */
export function clearWarmStartSession(sessionId: string): void {
  warmStartedSessions.delete(sessionId);
}

/**
 * Clean up expired warm-start entries
 */
function cleanupWarmStartCache(): void {
  const now = Date.now();
  for (const [sessionId, entry] of warmStartedSessions.entries()) {
    if (now - entry.timestamp > WARM_START_TTL_MS) {
      warmStartedSessions.delete(sessionId);
    }
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceRouterContext {
  userId: string;
  sessionId: string;
  personaId: string;
  conversationHistory: ConversationTurn[];
  recentTools: string[];
  /** Override locale (auto-detected if not provided) */
  locale?: string;

  // ============================================================================
  // BETTER THAN HUMAN: Voice Prosody Signals
  // ============================================================================

  /** Voice prosody signals from audio analysis */
  voiceProsody?: Partial<VoiceProsodySignals>;

  /** Speaking pace (words per minute) */
  wordsPerMinute?: number;

  /** Detected emotion from text/voice */
  detectedEmotion?: {
    emotion: string;
    intensity: number;
    valence: number;
    source: 'voice' | 'text' | 'inferred';
  };
}

export interface VoiceRouterResult {
  /** Whether to bypass LLM entirely and execute tool */
  bypassLLM: boolean;

  /** Tool execution result if bypassed */
  toolResult?: ToolExecutionResult;

  /** Hint to inject into LLM context */
  llmHint?: string;

  /** Original routing result */
  routingResult: SemanticRouterResult;

  /** Processing time in ms */
  processingTimeMs: number;

  /** Detected language (for multilingual support) */
  detectedLocale?: string;

  /** Tool chain detected (multi-step sequence) */
  toolChain?: {
    chainId: string;
    chainName: string;
    predictedSteps: string[];
  };

  /** User vocabulary match (per-user personalization) */
  userVocabularyMatch?: {
    toolId: string;
    confidence: number;
    phrase: string;
  };

  /** Deep context enhancements */
  contextEnhancements?: {
    resolvedPronouns: Record<string, string>;
    currentTopic: string | null;
    entityCount: number;
  };

  // ============================================================================
  // BETTER THAN HUMAN: Intelligence Results
  // ============================================================================

  /** Voice prosody tool boost decision */
  prosodyBoost?: {
    boostedTools: string[];
    suppressedTools: string[];
    reason: string;
    confidence: number;
  };

  /** Speaking pace analysis */
  paceAnalysis?: SpeakingPaceAnalysis;

  /** Routing explanation (transparency) */
  routingExplanation?: RoutingExplanation;

  /** User-friendly spoken explanation */
  spokenExplanation?: string;

  /** Emotional arc summary */
  emotionalArc?: {
    dominantEmotion: string;
    trend: 'improving' | 'declining' | 'stable';
    needsAttention: boolean;
  };

  /** Proactive intervention suggestion */
  suggestedIntervention?: {
    type: string;
    message: string;
    tool: string;
    urgency: string;
  };
}

// ============================================================================
// VOICE ROUTER INTEGRATION
// ============================================================================

let initialized = false;
let initPromise: Promise<void> | null = null;
let router: SemanticRouter | null = null;

/**
 * Initialize the voice semantic router
 */
export async function initializeVoiceRouter(): Promise<void> {
  // Return existing promise if initialization is in progress (race-safe)
  if (initPromise) {
    return initPromise;
  }
  
  if (initialized) return;

  initPromise = doInitializeVoiceRouter();
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

async function doInitializeVoiceRouter(): Promise<void> {
  if (initialized) return;
  
  const isDev = process.env.NODE_ENV === 'development';
  const startTime = performance.now();
  
  log.info({ isDev }, 'Initializing voice semantic router...');

  // Get the registry
  const registry = getToolRegistry();
  
  // CAPABILITY FILTERING: Only register tools whose backing services are configured
  // This prevents hallucination by ensuring we don't route to unavailable tools
  const availableTools = getAvailableToolDefinitions();
  log.info(
    {
      totalDefined: allToolDefinitions.length,
      available: availableTools.length,
      excluded: allToolDefinitions.length - availableTools.length,
    },
    '🔧 Tools filtered by capability availability'
  );
  
  // IMPORTANT: Merge locale triggers into tool definitions BEFORE registering
  // This adds patterns like "check the weather" from en.json to the hardcoded definitions
  // Without this, many natural phrases won't match!
  const localizedTools = await mergeLocaleIntoTools(availableTools);
  log.info({ localeToolCount: localizedTools.length }, '🌐 Locale merged into tool definitions');
  
  // Register all tools WITH locale patterns
  registry.registerMany(localizedTools);

  const stats = getToolStats();
  log.info({ totalTools: registry.size, byCategory: stats }, '✅ Semantic tools registered');

  // Create router
  router = createSemanticRouter({
    debug: isDev,
    thresholds: {
      autoExecute: 0.92,
      confirm: 0.8,
      hint: 0.55,
      minimum: 0.35,
    },
  });

  // =========================================================================
  // EMBEDDING STRATEGY:
  // Always use Google embeddings for best quality (text-embedding-004)
  // Firestore caching makes subsequent calls fast (~30-80ms first call, cached after)
  // =========================================================================
  
  log.info({ isDev }, '☁️ Using Google embeddings (text-embedding-004)');
  const embeddingProvider = createEmbeddingProvider('google');
  await router.initialize(embeddingProvider);
  
  // Load pre-computed embeddings from Firestore (fast!)
  // These are computed once on first deploy, then cached
  if (!isDev) {
    loadCachedEmbeddingsAsync(embeddingProvider);
  }

  // =========================================================================
  // ASYNC BACKGROUND TASKS (fire-and-forget, don't block)
  // =========================================================================
  
  // Load English locale in background
  preloadLocales(['en']).catch(() => {/* ignore */});

  // NER engine in background
  initializeNER()
    .then(() => log.info('🔍 NER engine initialized'))
    .catch(() => {/* regex fallback works fine */});

  // Streaming router (sync, fast) - use available tools only
  try {
    initializeStreamingRouter(availableTools as SemanticToolDefinition[]);
    log.info('⚡ Streaming router initialized');
  } catch {
    // Non-fatal
  }
  
  const duration = performance.now() - startTime;
  log.info({ durationMs: Math.round(duration), isDev }, '✅ Voice router initialized');

  // eslint-disable-next-line require-atomic-updates
  initialized = true;
}

/**
 * Load pre-computed embeddings from Firestore cache (background, non-blocking)
 * 
 * On first deploy, embeddings are computed and cached.
 * Subsequent startups load from cache (fast).
 */
async function loadCachedEmbeddingsAsync(embeddingProvider: EmbeddingProvider): Promise<void> {
  try {
    const { getToolEmbeddingIndex, initializeToolEmbeddingIndex } = await import(
      './persistence/index.js'
    );
    
    // Initialize the embedding index service
    await initializeToolEmbeddingIndex();
    const indexService = getToolEmbeddingIndex();
    
    // Batch load embeddings from Firestore cache
    const embeddings = await indexService.batchGetToolEmbeddings(
      allToolDefinitions as SemanticToolDefinition[]
    );
    
    const stats = indexService.getStats();
    log.info(
      {
        total: stats.totalTools,
        cacheHits: stats.cacheHits,
        firestoreLoads: stats.firestoreLoads,
        computedFresh: stats.computedFresh,
      },
      '☁️ Tool embeddings loaded from Firestore cache'
    );
    
    // If we had to compute fresh embeddings, they're now cached for next time
    if (stats.computedFresh > 0) {
      log.info(
        { computedFresh: stats.computedFresh },
        '📝 New embeddings computed and cached to Firestore'
      );
    }
  } catch (error) {
    log.warn(
      { error: String(error) },
      'Failed to load cached embeddings - falling back to pattern/keyword routing'
    );
  }
}

/**
 * Route user input through the semantic router
 *
 * Call this BEFORE sending to the LLM. It will:
 * 1. Auto-detect language and load locale triggers
 * 2. Check if input likely needs a tool
 * 3. Route and extract arguments
 * 4. Execute directly if high confidence
 * 5. Return hints for LLM if medium confidence
 */
export async function routeVoiceInput(
  inputText: string,
  context: VoiceRouterContext
): Promise<VoiceRouterResult> {
  const startTime = performance.now();

  // Ensure initialized
  if (!initialized || !router) {
    await initializeVoiceRouter();
  }

  // Safe reference to router after initialization check
  const activeRouter = router as SemanticRouter;

  // Auto-detect language if not provided (multilingual support)
  let detectedLocale = context.locale || 'en';
  if (!context.locale) {
    try {
      detectedLocale = await autoDetectAndLoadLocale(inputText);
      if (detectedLocale !== 'en') {
        log.debug(
          { detectedLocale, inputText: inputText.substring(0, 50) },
          'Language auto-detected'
        );
      }
    } catch {
      // Fall back to English on error
      detectedLocale = 'en';
    }
  }

  // ============================================================================
  // ADVANCED FEATURES: Deep Context & Personalization
  // ============================================================================

  // Update deep context with user input (entity tracking, topic detection)
  const deepContext = getDeepContext(context.sessionId);
  updateContextWithInput(context.sessionId, inputText, deepContext.currentTurn);

  // Check for tool chains (multi-step sequences)
  const chainDetection = detectToolChain(inputText, {
    recentTools: context.recentTools,
    timeOfDay: getTimeOfDay(),
  });

  let toolChain: VoiceRouterResult['toolChain'];
  if (chainDetection.chainId) {
    toolChain = {
      chainId: chainDetection.chainId,
      chainName: chainDetection.chainName || '',
      predictedSteps: chainDetection.predictedSteps.map((s) => s.toolId),
    };
    log.debug(
      { chainId: chainDetection.chainId, steps: toolChain.predictedSteps },
      'Tool chain detected'
    );
  }

  // ============================================================================
  // BETTER THAN HUMAN: Prosody Analysis & Emotional Intelligence
  // ============================================================================

  // Perform "Better Than Human" analysis (prosody + pace + emotional arc)
  let betterThanHumanAnalysis: BetterThanHumanAnalysis | undefined;
  let prosodyBoost: VoiceRouterResult['prosodyBoost'];
  let paceAnalysis: VoiceRouterResult['paceAnalysis'];
  let emotionalArc: VoiceRouterResult['emotionalArc'];
  let suggestedIntervention: VoiceRouterResult['suggestedIntervention'];

  if (context.voiceProsody || context.wordsPerMinute) {
    // Full prosody analysis
    const prosodySignals: VoiceProsodySignals = {
      stressLevel: context.voiceProsody?.stressLevel ?? 0,
      arousal: context.voiceProsody?.arousal ?? 0.5,
      valence: context.voiceProsody?.valence ?? 0,
      wordsPerMinute: context.wordsPerMinute,
      anxietyMarkers: context.voiceProsody?.anxietyMarkers,
      voiceTremor: context.voiceProsody?.voiceTremor,
      breathingPattern: context.voiceProsody?.breathingPattern,
    };

    betterThanHumanAnalysis = performBetterThanHumanAnalysis(
      context.userId,
      prosodySignals,
      context.wordsPerMinute
    );

    // Extract components for response
    prosodyBoost = {
      boostedTools: betterThanHumanAnalysis.toolBoost.boostedTools,
      suppressedTools: betterThanHumanAnalysis.toolBoost.suppressedTools,
      reason: betterThanHumanAnalysis.toolBoost.reason,
      confidence: betterThanHumanAnalysis.toolBoost.confidence,
    };

    paceAnalysis = betterThanHumanAnalysis.paceAnalysis;

    if (betterThanHumanAnalysis.recentEmotionalState) {
      emotionalArc = {
        dominantEmotion: betterThanHumanAnalysis.recentEmotionalState.dominantEmotion,
        trend: betterThanHumanAnalysis.recentEmotionalState.trend as
          | 'improving'
          | 'declining'
          | 'stable',
        needsAttention: betterThanHumanAnalysis.recentEmotionalState.needsAttention,
      };
    }

    if (betterThanHumanAnalysis.suggestedIntervention) {
      suggestedIntervention = betterThanHumanAnalysis.suggestedIntervention;
    }

    log.debug(
      {
        boostedTools: prosodyBoost.boostedTools.slice(0, 3),
        pace: paceAnalysis?.pace,
        emotionalTrend: emotionalArc?.trend,
        hasIntervention: !!suggestedIntervention,
      },
      '🧠 Better Than Human analysis complete'
    );
  }

  // Record emotional data point if detected
  if (context.detectedEmotion) {
    recordEmotionalDataPoint(
      context.userId,
      context.detectedEmotion.emotion,
      context.detectedEmotion.intensity,
      context.detectedEmotion.valence,
      context.detectedEmotion.source,
      inputText.substring(0, 100) // Context snippet
    );
  }

  // Quick check - does this even look like a tool request?
  if (!mightNeedTool(inputText)) {
    // Still route for logging/analytics, but expect conversation result
    const routingResult = await activeRouter.route(inputText, context);

    return {
      bypassLLM: false,
      routingResult,
      processingTimeMs: performance.now() - startTime,
      detectedLocale,
      toolChain,
      // Better Than Human results (even for non-tool requests)
      prosodyBoost,
      paceAnalysis,
      emotionalArc,
      suggestedIntervention,
    };
  }

  // ============================================================================
  // ADVANCED FEATURES: Learning Enhancement
  // ============================================================================

  // Create learning context for enhancement
  const learningContext: LearningContext = {
    userId: context.userId,
    sessionId: context.sessionId,
    personaId: context.personaId,
    inputText,
    inputLocale: detectedLocale,
    routingResult: null as unknown as SemanticRouterResult, // Will be set after routing
    conversationHistory: context.conversationHistory.map((t) => ({
      role: t.role,
      text: t.text,
    })),
    recentTools: context.recentTools,
  };

  // Full routing
  const routingResult = await activeRouter.route(inputText, context);

  // Enhance with learning (user vocabulary, calibration, time patterns)
  learningContext.routingResult = routingResult;
  const enhancement = await enhanceWithLearning(learningContext);

  // Apply calibration to confidence
  if (routingResult.matches.length > 0) {
    routingResult.matches[0].confidence = calibrateConfidence(routingResult.matches[0].confidence);
  }

  // Get context enhancements (pronoun resolution, topic)
  let contextEnhancements: VoiceRouterResult['contextEnhancements'];
  if (routingResult.matches.length > 0) {
    const toolId = routingResult.matches[0].toolId;
    const resolvedPronouns = resolveForTool(inputText, toolId, deepContext);

    contextEnhancements = {
      resolvedPronouns,
      currentTopic: deepContext.currentTopic?.name || null,
      entityCount: deepContext.entities.size,
    };

    // If we resolved pronouns, log it
    if (Object.keys(resolvedPronouns).length > 0) {
      log.debug({ resolvedPronouns, toolId }, 'Pronouns resolved');
    }
  }
  const { action } = routingResult;

  // Handle different action types
  switch (action.type) {
    case 'execute': {
      // High confidence - execute directly, bypass LLM
      log.info(
        {
          toolId: action.toolId,
          confidence: action.confidence,
          args: action.args,
        },
        'Auto-executing tool'
      );

      const toolResult = await activeRouter.execute(action.toolId, action.args, {
        userId: context.userId,
        sessionId: context.sessionId,
        personaId: context.personaId,
        conversationHistory: context.conversationHistory,
        services: undefined,
      });

      // 🚫 DEDUPLICATION: Mark tool as executed to prevent JSON workaround from re-executing
      // This prevents the race condition where LLM (running in parallel) outputs JSON for the same tool
      try {
        const { markToolExecutedBySemanticRouter } = await import(
          '../../agents/shared/tool-call-sanitizer.js'
        );
        markToolExecutedBySemanticRouter(context.sessionId, action.toolId);
      } catch (err) {
        log.warn({ error: String(err) }, 'Failed to mark tool as executed for deduplication');
      }

      // Update deep context with tool result
      updateContextWithToolResult(
        context.sessionId,
        action.toolId,
        toolResult,
        deepContext.currentTurn
      );

      // Learn tool sequence for chain prediction
      learnToolSequence(context.sessionId, [...context.recentTools, action.toolId]);

      // Record outcome for learning (async, don't block)
      recordOutcome(learningContext, {
        actualToolUsed: action.toolId,
        wasCorrection: false,
        wasSuccess: toolResult.success,
      }).catch((err) => log.warn({ error: String(err) }, 'Failed to record outcome'));

      // Generate routing explanation (transparency)
      // Parse match reason string for explanation factors
      const matchReason = routingResult.matches[0]?.matchReason || '';
      const matchedPhrases = matchReason.includes('Pattern:')
        ? [matchReason.split('Pattern: ')[1]?.split(';')[0]?.replace(/"/g, '')]
        : undefined;
      const matchedKeywords = matchReason.includes('Keywords:')
        ? matchReason.split('Keywords: ')[1]?.split(';')[0]?.split(', ')
        : undefined;

      const routingExplanation = generateRoutingExplanation(
        action.toolId,
        action.confidence,
        {
          matchedPhrases: matchedPhrases?.filter(Boolean),
          matchedKeywords: matchedKeywords?.filter(Boolean),
          entityMatches: contextEnhancements
            ? Object.entries(contextEnhancements.resolvedPronouns).map(([k, v]) => ({
                type: k,
                value: v,
              }))
            : undefined,
          userVocabulary: !!enhancement.userVocabularyMatch,
          emotionBoost: prosodyBoost && prosodyBoost.boostedTools.includes(action.toolId),
        },
        routingResult.matches.slice(1).map((m) => ({ toolId: m.toolId, confidence: m.confidence }))
      );

      return {
        bypassLLM: true,
        toolResult,
        routingResult,
        processingTimeMs: performance.now() - startTime,
        detectedLocale,
        toolChain,
        userVocabularyMatch: enhancement.userVocabularyMatch,
        contextEnhancements,
        // Better Than Human results
        prosodyBoost,
        paceAnalysis,
        emotionalArc,
        suggestedIntervention,
        routingExplanation,
        spokenExplanation: routingExplanation.userFriendlyExplanation,
      };
    }

    case 'confirm': {
      // High-ish confidence - let LLM confirm naturally
      return {
        bypassLLM: false,
        llmHint: generateLLMHint('confirm', action),
        routingResult,
        processingTimeMs: performance.now() - startTime,
        detectedLocale,
        toolChain,
        userVocabularyMatch: enhancement.userVocabularyMatch,
        contextEnhancements,
        prosodyBoost,
        paceAnalysis,
        emotionalArc,
        suggestedIntervention,
      };
    }

    case 'hint': {
      // Medium confidence - hint to LLM
      return {
        bypassLLM: false,
        llmHint: generateLLMHint('hint', action),
        routingResult,
        processingTimeMs: performance.now() - startTime,
        detectedLocale,
        toolChain,
        userVocabularyMatch: enhancement.userVocabularyMatch,
        contextEnhancements,
        prosodyBoost,
        paceAnalysis,
        emotionalArc,
        suggestedIntervention,
      };
    }

    case 'disambiguate': {
      // Multiple matches - let LLM ask
      return {
        bypassLLM: false,
        llmHint: generateLLMHint('disambiguate', action),
        routingResult,
        processingTimeMs: performance.now() - startTime,
        detectedLocale,
        toolChain,
        userVocabularyMatch: enhancement.userVocabularyMatch,
        contextEnhancements,
        prosodyBoost,
        paceAnalysis,
        emotionalArc,
        suggestedIntervention,
      };
    }

    case 'clarify': {
      // Missing info - let LLM ask
      return {
        bypassLLM: false,
        llmHint: generateLLMHint('clarify', action),
        routingResult,
        processingTimeMs: performance.now() - startTime,
        detectedLocale,
        toolChain,
        userVocabularyMatch: enhancement.userVocabularyMatch,
        contextEnhancements,
        prosodyBoost,
        paceAnalysis,
        emotionalArc,
        suggestedIntervention,
      };
    }

    case 'conversation':
    default:
      // Pure conversation - no tool hints
      return {
        bypassLLM: false,
        routingResult,
        processingTimeMs: performance.now() - startTime,
        detectedLocale,
        toolChain,
        contextEnhancements,
        // Better Than Human results (even for conversations)
        prosodyBoost,
        paceAnalysis,
        emotionalArc,
        suggestedIntervention,
      };
  }
}

/**
 * Helper function to get time of day for chain detection
 */
function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Generate a hint for the LLM based on routing result
 *
 * IMPORTANT: Hints guide the LLM but explicitly tell it NOT to pretend
 * to execute tools or fabricate outcomes. This is critical for telephony.
 *
 * Also checks capability availability - if a tool's backing service isn't
 * configured, tells the LLM explicitly that the capability is unavailable.
 */
function generateLLMHint(type: string, action: RouterAction): string {
  // Anti-hallucination warning for telephony tools
  const ANTI_HALLUCINATION_WARNING =
    ' CRITICAL: Do NOT pretend to execute this tool or make up outcomes. If you cannot actually call the tool, ask for information or explain what you need.';

  // Check if this is a telephony-related tool
  const isTelephonyTool = (toolId?: string): boolean =>
    toolId
      ? toolId.includes('telephony') ||
        toolId.includes('call') ||
        toolId.includes('phone') ||
        toolId.includes('sms') ||
        toolId.includes('message')
      : false;

  // =========================================================================
  // CAPABILITY CHECK: If tool isn't available, tell LLM explicitly
  // This is the KEY fix to prevent hallucination - tools that can't run
  // should never be hinted as if they can.
  // =========================================================================
  const getToolIdFromAction = (): string | undefined => {
    if (action.type === 'confirm' || action.type === 'hint') {
      return action.toolId;
    }
    return undefined;
  };

  const toolId = getToolIdFromAction();
  if (toolId && !isToolAvailable(toolId)) {
    const reason = getUnavailabilityReason(toolId);
    return `[CAPABILITY UNAVAILABLE] The user wants to use ${toolId}, but ${reason}. Tell the user honestly that this capability is not available yet. Do NOT pretend to perform the action or fabricate results.`;
  }

  switch (type) {
    case 'confirm':
      if (action.type === 'confirm') {
        const hint = `[TOOL HINT] User likely wants: ${action.toolId}. Args: ${JSON.stringify(action.args)}. Confirm naturally before executing.`;
        return isTelephonyTool(action.toolId) ? hint + ANTI_HALLUCINATION_WARNING : hint;
      }
      break;

    case 'hint':
      if (action.type === 'hint') {
        const hint = `[TOOL HINT] Consider using: ${action.toolId} (confidence: ${(action.confidence * 100).toFixed(0)}%)`;
        // For low-confidence telephony hints, add stronger warning
        if (isTelephonyTool(action.toolId)) {
          return (
            hint +
            ' NOTE: Only proceed if you have the required contact info. Do NOT pretend to make calls or fabricate conversations.'
          );
        }
        return hint;
      }
      break;

    case 'disambiguate':
      if (action.type === 'disambiguate') {
        const options = action.options.map((o) => o.description).join(', ');
        return `[TOOL HINT] Multiple tools might apply: ${options}. Ask user to clarify.`;
      }
      break;

    case 'clarify':
      if (action.type === 'clarify') {
        const hint = `[TOOL HINT] To use a tool, need: ${action.missingInfo.join(', ')}. Ask naturally.`;
        // Add warning to prevent fabrication
        return hint + ' Do NOT pretend the action happened if you do not have the required information.';
      }
      break;
  }

  return '';
}

/**
 * Post-LLM fallback: Check if LLM response indicates tool intent but didn't execute
 *
 * Call this AFTER LLM responds, if the response seems like it should have used a tool.
 */
export async function checkMissedToolIntent(
  userInput: string,
  llmResponse: string,
  context: VoiceRouterContext
): Promise<{
  missedTool: boolean;
  suggestedTool?: string;
  suggestedArgs?: Record<string, unknown>;
}> {
  if (!router) {
    return { missedTool: false };
  }

  // Indicators that LLM tried to call a tool but failed
  const missedPatterns = [
    /i (?:can't|cannot|am unable to) (?:play|call|search|set)/i,
    /i don't have (?:access|the ability) to/i,
    /unfortunately.*(?:can't|unable)/i,
    /i would need to.*but/i,
  ];

  const llmTriedButFailed = missedPatterns.some((p) => p.test(llmResponse));

  if (llmTriedButFailed) {
    // Re-route the user input
    const routingResult = await router.route(userInput, context);

    if (routingResult.matches.length > 0 && routingResult.matches[0].confidence > 0.5) {
      return {
        missedTool: true,
        suggestedTool: routingResult.matches[0].toolId,
        suggestedArgs: routingResult.matches[0].extractedArgs,
      };
    }
  }

  return { missedTool: false };
}

/**
 * Get the router instance (for testing/advanced usage)
 */
export function getVoiceRouter(): SemanticRouter | null {
  return router;
}

/**
 * Check if router is initialized
 */
export function isVoiceRouterInitialized(): boolean {
  return initialized;
}

// ============================================================================
// METRICS & ANALYTICS
// ============================================================================

interface RouterMetrics {
  totalRoutes: number;
  autoExecuted: number;
  hinted: number;
  conversations: number;
  avgLatencyMs: number;
  toolUsage: Record<string, number>;
}

const metrics: RouterMetrics = {
  totalRoutes: 0,
  autoExecuted: 0,
  hinted: 0,
  conversations: 0,
  avgLatencyMs: 0,
  toolUsage: {},
};

/**
 * Get router metrics
 */
export function getRouterMetrics(): RouterMetrics {
  return { ...metrics };
}

/**
 * Reset metrics (for testing)
 */
export function resetRouterMetrics(): void {
  metrics.totalRoutes = 0;
  metrics.autoExecuted = 0;
  metrics.hinted = 0;
  metrics.conversations = 0;
  metrics.avgLatencyMs = 0;
  metrics.toolUsage = {};
}

// ============================================================================
// ADVANCED FEATURES: Learning API
// ============================================================================

/**
 * Handle explicit user correction
 *
 * Call this when user explicitly says something like:
 * "No, I wanted to play music, not check calendar"
 *
 * This teaches the router to handle similar inputs better in the future.
 */
export async function recordUserCorrection(
  userId: string,
  inputText: string,
  wrongTool: string | null,
  correctTool: string
): Promise<void> {
  await handleExplicitCorrection(userId, inputText, wrongTool, correctTool);
  log.info(
    { userId, from: wrongTool, to: correctTool, input: inputText.substring(0, 30) },
    'User correction recorded'
  );
}

/**
 * Record that a tool was used successfully
 *
 * Call this AFTER tool execution to improve learning.
 */
export async function recordToolSuccess(
  context: VoiceRouterContext,
  inputText: string,
  toolId: string
): Promise<void> {
  const learningContext: LearningContext = {
    userId: context.userId,
    sessionId: context.sessionId,
    personaId: context.personaId,
    inputText,
    inputLocale: context.locale || 'en',
    routingResult: null as unknown as SemanticRouterResult,
    conversationHistory: context.conversationHistory.map((t) => ({
      role: t.role,
      text: t.text,
    })),
    recentTools: context.recentTools,
  };

  await recordOutcome(learningContext, {
    actualToolUsed: toolId,
    wasCorrection: false,
    wasSuccess: true,
  });
}

/**
 * Get the deep context for a session (entity tracking, topic)
 *
 * Use this for debugging or advanced features that need context awareness.
 */
export { getDeepContext, clearDeepContext as clearSessionContext } from './advanced/index.js';

// ============================================================================
// STREAMING ROUTING (Route as user speaks)
// ============================================================================

/**
 * Process a partial transcript (streaming mode)
 *
 * Call this as the user speaks to get early routing signals.
 * Returns a signal if confidence crosses a threshold.
 */
export async function processPartialTranscript(
  sessionId: string,
  partialTranscript: string
): Promise<StreamingSignal | null> {
  const streamingRouter = getStreamingRouter();
  return streamingRouter.processPartial(sessionId, partialTranscript);
}

/**
 * Subscribe to streaming signals for a session
 *
 * Callback is called whenever a routing signal is emitted.
 * Signals: 'likely' (0.4), 'probable' (0.6), 'certain' (0.85)
 */
export function onStreamingSignal(
  sessionId: string,
  callback: (signal: StreamingSignal) => void
): () => void {
  const streamingRouter = getStreamingRouter();
  return streamingRouter.onSignal(sessionId, callback);
}

/**
 * Start a streaming session
 */
export function startStreamingSession(sessionId: string): void {
  const streamingRouter = getStreamingRouter();
  streamingRouter.startSession(sessionId);
}

/**
 * End a streaming session and get final state
 */
export function endStreamingSession(sessionId: string): {
  signalsEmitted: number;
  finalToolId: string | null;
  finalConfidence: number;
} {
  const streamingRouter = getStreamingRouter();
  const state = streamingRouter.endSession(sessionId);

  return {
    signalsEmitted: state?.emittedSignals.length ?? 0,
    finalToolId: state?.currentBest.toolId ?? null,
    finalConfidence: state?.currentBest.confidence ?? 0,
  };
}

// ============================================================================
// NER (Named Entity Recognition)
// ============================================================================

/**
 * Extract entities from text using real NER (compromise.js)
 */
export { extractNEREntities } from './advanced/index.js';

export type { StreamingSignal };

// ============================================================================
// P1 FIX: TOOL RESULT FEEDBACK LOOP
// ============================================================================

/**
 * Tool execution outcome for feedback loop.
 * Records what happened after routing to improve future decisions.
 */
export interface ToolExecutionOutcome {
  toolId: string;
  /** Was the tool execution successful? */
  success: boolean;
  /** Did the user correct us? (e.g., "No, I wanted music not weather") */
  wasCorrection: boolean;
  /** If correction, what tool did user actually want? */
  intendedToolId?: string;
  /** Execution time in ms */
  executionTimeMs: number;
  /** Original routing confidence */
  routingConfidence: number;
  /** Did user express satisfaction? */
  userSatisfied?: boolean;
  /** Any error message if failed */
  errorMessage?: string;
}

/**
 * Aggregated feedback statistics for a tool.
 */
interface ToolFeedbackStats {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  correctionCount: number;
  avgExecutionTimeMs: number;
  avgRoutingConfidence: number;
  /** Tracks which tools users actually wanted when this tool was wrongly selected */
  confusionMatrix: Record<string, number>;
  lastUpdated: number;
}

/** Feedback stats per tool */
const feedbackStats = new Map<string, ToolFeedbackStats>();

/** Feedback history for analysis (rolling window) */
const feedbackHistory: Array<ToolExecutionOutcome & { timestamp: number; sessionId: string }> = [];
const MAX_FEEDBACK_HISTORY = 500;

/**
 * Record a tool execution outcome for feedback learning.
 *
 * Call this AFTER tool execution to improve routing:
 * 1. Tracks success/failure rates per tool
 * 2. Records user corrections for confusion analysis
 * 3. Feeds back to confidence calibration
 *
 * @example
 * ```typescript
 * // After successful tool execution
 * await recordToolExecutionOutcome(sessionId, {
 *   toolId: 'playMusic',
 *   success: true,
 *   wasCorrection: false,
 *   executionTimeMs: 250,
 *   routingConfidence: 0.92,
 * });
 *
 * // After user correction
 * await recordToolExecutionOutcome(sessionId, {
 *   toolId: 'getWeather',
 *   success: true,
 *   wasCorrection: true,
 *   intendedToolId: 'playMusic',
 *   executionTimeMs: 150,
 *   routingConfidence: 0.85,
 * });
 * ```
 */
export async function recordToolExecutionOutcome(
  sessionId: string,
  outcome: ToolExecutionOutcome
): Promise<void> {
  const { toolId, success, wasCorrection, intendedToolId, executionTimeMs, routingConfidence } =
    outcome;

  // Get or create stats for this tool
  let stats = feedbackStats.get(toolId);
  if (!stats) {
    stats = {
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      correctionCount: 0,
      avgExecutionTimeMs: 0,
      avgRoutingConfidence: 0,
      confusionMatrix: {},
      lastUpdated: Date.now(),
    };
    feedbackStats.set(toolId, stats);
  }

  // Update stats
  stats.totalExecutions++;
  if (success) {
    stats.successCount++;
  } else {
    stats.failureCount++;
  }
  if (wasCorrection) {
    stats.correctionCount++;
    if (intendedToolId) {
      stats.confusionMatrix[intendedToolId] = (stats.confusionMatrix[intendedToolId] || 0) + 1;
    }
  }

  // Update rolling averages
  const alpha = 0.1; // Exponential moving average weight
  stats.avgExecutionTimeMs =
    stats.avgExecutionTimeMs * (1 - alpha) + executionTimeMs * alpha || executionTimeMs;
  stats.avgRoutingConfidence =
    stats.avgRoutingConfidence * (1 - alpha) + routingConfidence * alpha || routingConfidence;
  stats.lastUpdated = Date.now();

  // Add to history
  feedbackHistory.push({
    ...outcome,
    timestamp: Date.now(),
    sessionId,
  });

  // Trim history if too long
  while (feedbackHistory.length > MAX_FEEDBACK_HISTORY) {
    feedbackHistory.shift();
  }

  // Log significant events
  if (wasCorrection) {
    log.warn(
      {
        sessionId,
        toolId,
        intendedToolId,
        routingConfidence,
        correctionRate: ((stats.correctionCount / stats.totalExecutions) * 100).toFixed(1) + '%',
      },
      '⚠️ Tool routing correction recorded - user wanted different tool'
    );

    // Also record the correction for learning
    if (intendedToolId) {
      try {
        await handleExplicitCorrection('anonymous', '', toolId, intendedToolId);
      } catch (error) {
        log.debug({ error: String(error) }, 'Failed to record correction for learning');
      }
    }
  } else if (!success) {
    log.warn(
      {
        sessionId,
        toolId,
        errorMessage: outcome.errorMessage,
        failureRate: ((stats.failureCount / stats.totalExecutions) * 100).toFixed(1) + '%',
      },
      '❌ Tool execution failed'
    );
  } else {
    log.debug(
      {
        toolId,
        executionTimeMs,
        successRate: ((stats.successCount / stats.totalExecutions) * 100).toFixed(1) + '%',
      },
      '✅ Tool execution recorded'
    );
  }
}

/**
 * Get feedback statistics for a tool.
 */
export function getToolFeedbackStats(toolId: string): ToolFeedbackStats | null {
  return feedbackStats.get(toolId) || null;
}

/**
 * Get all tool feedback statistics.
 */
export function getAllToolFeedbackStats(): Record<string, ToolFeedbackStats> {
  const result: Record<string, ToolFeedbackStats> = {};
  for (const [toolId, stats] of feedbackStats.entries()) {
    result[toolId] = { ...stats };
  }
  return result;
}

/**
 * Get the overall feedback summary.
 */
export function getFeedbackSummary(): {
  totalExecutions: number;
  overallSuccessRate: number;
  overallCorrectionRate: number;
  avgExecutionTimeMs: number;
  toolsWithHighCorrectionRate: Array<{ toolId: string; correctionRate: number }>;
  recentFeedbackCount: number;
} {
  let totalExecutions = 0;
  let totalSuccess = 0;
  let totalCorrections = 0;
  let totalExecutionTime = 0;
  const toolsWithHighCorrectionRate: Array<{ toolId: string; correctionRate: number }> = [];

  for (const [toolId, stats] of feedbackStats.entries()) {
    totalExecutions += stats.totalExecutions;
    totalSuccess += stats.successCount;
    totalCorrections += stats.correctionCount;
    totalExecutionTime += stats.avgExecutionTimeMs * stats.totalExecutions;

    const correctionRate = stats.totalExecutions > 10 ? stats.correctionCount / stats.totalExecutions : 0;
    if (correctionRate > 0.1) {
      // Flag tools with >10% correction rate
      toolsWithHighCorrectionRate.push({ toolId, correctionRate });
    }
  }

  return {
    totalExecutions,
    overallSuccessRate: totalExecutions > 0 ? totalSuccess / totalExecutions : 0,
    overallCorrectionRate: totalExecutions > 0 ? totalCorrections / totalExecutions : 0,
    avgExecutionTimeMs: totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0,
    toolsWithHighCorrectionRate: toolsWithHighCorrectionRate.sort(
      (a, b) => b.correctionRate - a.correctionRate
    ),
    recentFeedbackCount: feedbackHistory.length,
  };
}

/**
 * Get confidence adjustment based on tool's historical performance.
 *
 * Tools with high success rates get a small boost, while tools with
 * high correction rates get a penalty.
 */
export function getToolPerformanceConfidenceAdjustment(toolId: string): number {
  const stats = feedbackStats.get(toolId);
  if (!stats || stats.totalExecutions < 5) {
    return 1.0; // Not enough data, no adjustment
  }

  const successRate = stats.successCount / stats.totalExecutions;
  const correctionRate = stats.correctionCount / stats.totalExecutions;

  // Boost for high success + low correction, penalty otherwise
  // Range: 0.85 to 1.15
  let adjustment = 1.0;

  if (successRate > 0.95 && correctionRate < 0.02) {
    adjustment = 1.1; // Excellent performance - 10% boost
  } else if (successRate > 0.9 && correctionRate < 0.05) {
    adjustment = 1.05; // Good performance - 5% boost
  } else if (correctionRate > 0.2) {
    adjustment = 0.85; // High correction rate - 15% penalty
  } else if (correctionRate > 0.1) {
    adjustment = 0.9; // Moderate correction rate - 10% penalty
  } else if (successRate < 0.7) {
    adjustment = 0.9; // Low success rate - 10% penalty
  }

  return adjustment;
}

/**
 * Reset feedback stats (for testing).
 */
export function resetFeedbackStats(): void {
  feedbackStats.clear();
  feedbackHistory.length = 0;
}
