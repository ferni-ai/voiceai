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

// Import all tool definitions
import { allToolDefinitions, getToolStats } from './tool-definitions/index.js';

// Import i18n support
import {
  preloadLocales,
  autoDetectAndLoadLocale,
  mergeLocaleIntoTools,
  getLocale,
  initializeMultilingualEmbeddings,
} from './i18n/index.js';
import type { SemanticToolDefinition } from './types.js';

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
let router: SemanticRouter | null = null;

/**
 * Initialize the voice semantic router
 */
export async function initializeVoiceRouter(): Promise<void> {
  if (initialized) return;

  log.info('Initializing voice semantic router...');
  const startTime = performance.now();

  // Get the registry and register all tools
  const registry = getToolRegistry();

  // Register ALL semantic tool definitions
  registry.registerMany(allToolDefinitions);

  const stats = getToolStats();
  log.info(
    {
      totalTools: registry.size,
      byCategory: stats,
    },
    '✅ Semantic tools registered'
  );

  // Pre-load common locales for faster multilingual routing
  await preloadLocales(['en', 'es', 'fr', 'de', 'pt']);
  log.info('🌍 Multilingual locales pre-loaded');

  // Create router
  router = createSemanticRouter({
    debug: process.env.NODE_ENV === 'development',
    thresholds: {
      autoExecute: 0.92,
      confirm: 0.8,
      hint: 0.55, // Lower threshold for hints
      minimum: 0.35,
    },
  });

  // Initialize with embedding provider
  // Use OpenAI for production quality, Google for cost savings
  const embeddingModel = process.env.EMBEDDING_MODEL || 'openai';
  const embeddingProvider = createEmbeddingProvider(
    embeddingModel as 'openai' | 'google' | 'local'
  );

  await router.initialize(embeddingProvider);

  // Initialize multilingual embeddings for language-agnostic routing
  try {
    await initializeMultilingualEmbeddings(
      allToolDefinitions as SemanticToolDefinition[],
      embeddingProvider
    );
    log.info('🧠 Multilingual embeddings initialized');
  } catch (embedError) {
    log.warn({ error: String(embedError) }, 'Multilingual embeddings failed (non-fatal)');
  }

  // Initialize NER engine (compromise.js)
  try {
    await initializeNER();
    log.info('🔍 NER engine initialized');
  } catch (nerError) {
    log.warn({ error: String(nerError) }, 'NER engine failed (non-fatal, using regex fallback)');
  }

  // Initialize streaming router
  try {
    initializeStreamingRouter(allToolDefinitions as SemanticToolDefinition[]);
    log.info('⚡ Streaming router initialized');
  } catch (streamError) {
    log.warn({ error: String(streamError) }, 'Streaming router failed (non-fatal)');
  }

  // eslint-disable-next-line require-atomic-updates
  initialized = true;
  const duration = performance.now() - startTime;

  log.info(
    {
      toolCount: registry.size,
      embeddingModel,
      durationMs: duration.toFixed(1),
    },
    'Voice semantic router initialized'
  );
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
 */
function generateLLMHint(type: string, action: RouterAction): string {
  switch (type) {
    case 'confirm':
      if (action.type === 'confirm') {
        return `[TOOL HINT] User likely wants: ${action.toolId}. Args: ${JSON.stringify(action.args)}. Confirm naturally before executing.`;
      }
      break;

    case 'hint':
      if (action.type === 'hint') {
        return `[TOOL HINT] Consider using: ${action.toolId} (confidence: ${(action.confidence * 100).toFixed(0)}%)`;
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
        return `[TOOL HINT] To use a tool, need: ${action.missingInfo.join(', ')}. Ask naturally.`;
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
