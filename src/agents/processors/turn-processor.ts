/**
 * Turn Processor
 *
 * Orchestrates all processing for a single user turn:
 * - Message analysis
 * - Context building
 * - Emotional tracking
 * - Response guidance
 * - Identity reinforcement
 *
 * Benefits:
 * - Testable in isolation
 * - Clear data flow
 * - Modular context builders
 * - Split into focused sub-modules for maintainability
 *
 * EXTRACTED SUB-MODULES:
 * - conversation-dynamics.ts - processConversationDynamics
 * - easter-egg-handler.ts - checkEasterEggs
 * - emotional-state-builder.ts - buildEmotionalState
 * - response-guidance-builder.ts - buildResponseGuidance
 * - identity-context-builder.ts - buildIdentityContext
 * - humanizing-context-builder.ts - buildHumanizingContextForTurn
 * - bundle-runtime-processor.ts - processBundleRuntime
 * - advanced-humanization.ts - processAdvancedHumanization
 * - cached-modules.ts - getContextBuilders, getTaskManagerCached
 */

import type { llm } from '@livekit/agents';
import type { ContextUserData } from '../../intelligence/context-builders/index.js';
import { diag } from '../../services/diagnostic-logger.js';
import { updateUserContextForHandoff } from '../../tools/handoff/index.js';
import { safeFireAndForget } from '../../utils/safe-fire-and-forget.js';
import {
  publishPatternDetection,
  publishPredictiveIntelligence,
  publishKeyMoment,
  publishOutreachExtraction,
} from '../../services/intelligence-publisher.js';

// 🧠 TRUE PREDICTIVE INTELLIGENCE: Feed data into ML models + Get predictions for context
import {
  processConversationForLearning,
  getPredictiveIntelligenceContext,
} from '../../intelligence/predictive/index.js';
import type {
  BundleRuntimeContext,
  ContextInjection,
  EmotionalState,
  IdentityContext,
  ResonanceCheckResult,
  ResponseGuidance,
  SemanticRoutingResult,
  TrustContextSummary,
  TurnAnalysisResult,
  TurnContext,
  TurnProcessorResult,
} from './types.js';

// 🎯 SEMANTIC ROUTER: Pre-LLM tool routing (replaces JSON workaround)
// 🧠 INTELLIGENT ROUTING: Advanced 6-strategy cascade (A/B tested)
import {
  startSemanticRouting,
  applyRoutingResult,
  isRoutingEnabled,
  startIntelligentRouting,
  isIntelligentRouterInitialized,
  recordIntelligentOutcome,
  type TurnRouterResult,
} from '../../tools/semantic-router/integration/index.js';
import { shouldUseIntelligentRouting } from '../../tools/semantic-router/advanced/intelligent/index.js';

// Context inspection for debugging
import { recordContextBuild, createInspectionData } from '../../services/context-inspection.js';

// Injection builders (cleaner separation of concerns)
import {
  buildAdvancedHumanizationInjections,
  buildAmbientAwarenessInjections,
  buildBoundaryCheckInjections,
  buildConversationDynamicsInjections,
  buildCrossPersonaInsightsInjection,
  buildHealthAwarenessInjections,
  buildHumanLevelInjections,
  buildLifeCoachingInjections,
  buildSafetyInjections,
  buildScientificCoachingInjections,
  buildSessionDynamicsInjection,
  buildTrustSystemsInjections,
  // "Better Than Human" injection builders
  buildUserHealthInjection,
  buildVisualMemoryInjections,
  buildAmbientModeInjections,
  buildHumanTransferInjections,
  buildCrisisHistoryInjection,
  buildSemanticIntelligenceInjection,
  type AdvancedHumanizationInjectionResult,
  type ConversationDynamicsResult as InjectionDynamicsResult,
  type SemanticIntelligenceInjectionResult,
} from './injection-builders.js';

// 🌟 LIVE SUPERHUMAN INJECTIONS - Real-time "Better Than Human" capabilities per-turn
import { buildLiveSuperhumanInjections } from './live-superhuman-injections.js';

// 📊 RESONANCE CHECK - Voice-native feedback for superhuman capability effectiveness
import {
  queueResonanceCheck,
  getNextResonanceCheck,
  processUserResponseForResonance,
} from '../integrations/better-than-human-integration.js';
import type { SuperhumanCapability } from '../../conversation/superhuman/analytics.js';

// Honesty guardrail - prevents Ferni from implying she did something she didn't
import { getHonestyInjection } from '../../intelligence/context-builders/safety/honesty-guardrail.js';

// Smart injection filtering - be selective like a human
import {
  detectConversationMode,
  filterInjections,
  deduplicateInjections,
} from './injection-filter.js';

// Topic-based builder skipping - skip irrelevant builders BEFORE evaluation
import { filterBuildersByTopic, skipBuilder, type BuilderName } from './topic-builder-filter.js';

// Semantic short-circuit - skip context building for high-confidence tool matches
import { checkSemanticShortCircuit } from './semantic-short-circuit.js';

// Speculative TTS pre-warming - start TTS generation early based on emotional state
import { speculateTTS } from '../../services/performance/speculative-tts.js';

// Message analysis - extracted for maintainability
import { analyzeMessage, updateConversationState } from './message-analyzer.js';

// ============================================================================
// EXTRACTED SUB-MODULES (for maintainability)
// ============================================================================

// Cached module getters (lazy loading)
import { getTaskManagerCached, getBehavioralContextBuilder } from './cached-modules.js';

// Conversation dynamics (narrative arc, engagement, rhythm, silence)
import {
  processConversationDynamics,
  type ConversationDynamicsResult,
} from './conversation-dynamics.js';

// Easter egg detection
import { checkEasterEggs } from './easter-egg-handler.js';

// Emotional state building (with voice-text mismatch detection)
import { buildEmotionalState, type EmotionalStateWithMismatch } from './emotional-state-builder.js';

// Response guidance (length, pacing, story timing)
import { buildResponseGuidance } from './response-guidance-builder.js';

// Identity context (post-handoff reinforcement)
import { buildIdentityContext } from './identity-context-builder.js';

// Humanizing context (voice emotion, inner world, mood)
import { buildHumanizingContextForTurn } from './humanizing-context-builder.js';

// Bundle runtime (modes, situational responses, pushback)
import { processBundleRuntime } from './bundle-runtime-processor.js';

// Advanced humanization (10 deep capabilities)
import { processAdvancedHumanization } from './advanced-humanization.js';

// Performance metrics
import {
  recordTurnTiming,
  recordPhaseTiming,
  recordContextInjectionTiming,
  createTimer,
} from '../../services/performance-metrics.js';

// Development telemetry for E2E observability
import { createTurnTrace, type Trace } from '../shared/dev-telemetry.js';

// Coaching Intelligence - "Better than Human" pattern detection
import { processTranscriptForPatterns } from '../../intelligence/coaching-patterns.js';
import { recordVoiceTurn, initializeVoiceTracking } from '../../intelligence/voice-signals.js';

// Speculative Persona Preloading - "Better than Human" handoff prediction
import { analyzeAndPreload } from '../shared/performance/speculative-preloading.js';

// Predictive Intelligence - Superhuman pattern prediction
import { processForPredictiveIntelligence } from '../integrations/predictive-intelligence-integration.js';

// Team Huddle - Cross-persona observations for coordinated care
import {
  recordObservation as recordTeamObservation,
  type PersonaId,
} from '../../services/cross-persona/team-huddle.js';
import {
  analyzeTextForPersona,
  detectHandoffCues,
} from '../../services/cross-persona/persona-observation-patterns.js';

// Relationship Arc - "Better than Human" key moment detection
import { detectAndRecordKeyMoment } from '../integrations/relationship-arc-integration.js';

// Viral Growth - Natural referral prompts and conversation context
import {
  buildReferralPromptInjection,
  buildReferralConversationContext,
} from '../../intelligence/context-builders/engagement/referral-prompt.js';

// Humanizing context formatting (used in buildContextInjections)
import {
  formatHumanizingForPrompt,
  type HumanizingResult,
} from '../../intelligence/context-builders/humanization/humanizing.js';

// Conversation humanizing
import {
  buildConversationHumanizingContext,
  formatConversationHumanizingForPrompt,
} from '../../intelligence/context-builders/humanization/conversation-humanizing.js';

// Response naturalness
import { getResponseEnhancements } from '../../speech/response-naturalness.js';

// Voice-text mismatch - for recording insights
import { recordMismatchInsight } from '../../intelligence/voice-text-mismatch.js';

// Cross-session reflection ("Better Than Human" - remember significant moments)
import {
  detectReflectionMoment,
  saveReflectionMoment,
} from '../../intelligence/cross-session-reflection.js';

// Monetization - Value Capture (detect achievements/breakthroughs)
import { valueCapture } from '../../services/monetization/value-capture.js';

// Intelligent Outreach - Extract context for proactive check-ins
import { extractAndProcess as extractOutreachContext } from '../../services/outreach/conversation-extractor.js';

// Better Than Human Orchestrator - Coordinates all 12 superhuman capabilities
// This is the central coordinator for genuine care that makes Ferni better than human
import { getBetterThanHuman } from '../../conversation/superhuman/index.js';

// 🚨 SAFETY: Crisis detection - HARD safety rails that CANNOT be bypassed
import { detectCrisis, guardPreResponse } from '../safety/crisis-guard.js';

// 🧠 REAL-TIME LEARNING: Relationship network, data capture, and persistence
// "Better than Human" - We learn and remember as the conversation unfolds
import { recordMention, extractNames } from '../../services/superhuman/relationship-network.js';
import { processDataCapture } from '../../intelligence/data-capture/index.js';
import { triggerAutoSave } from '../../services/realtime-persistence.js';

// NOTE: Cached module getters moved to cached-modules.ts
// NOTE: analyzeMessage and updateConversationState are imported from message-analyzer.ts

// NOTE: processConversationDynamics moved to conversation-dynamics.ts
// NOTE: checkEasterEggs moved to easter-egg-handler.ts

// NOTE: buildEmotionalState moved to emotional-state-builder.ts

// NOTE: buildResponseGuidance moved to response-guidance-builder.ts

// NOTE: buildIdentityContext moved to identity-context-builder.ts

// NOTE: buildHumanizingContextForTurn moved to humanizing-context-builder.ts
// NOTE: processBundleRuntime moved to bundle-runtime-processor.ts

// ============================================================================
// CONTEXT INJECTION BUILDING
// ============================================================================

/**
 * Result from building context injections
 */
interface ContextInjectionsResult {
  /** All context injections for LLM */
  injections: ContextInjection[];
  /** Trust context summary for post-response monitoring */
  trustContextSummary: TrustContextSummary;
}

/**
 * Build all context injections for the LLM
 */
async function buildContextInjections(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult,
  emotionalState: EmotionalState,
  responseGuidance: ResponseGuidance,
  identityContext: IdentityContext,
  humanizingResult: HumanizingResult | null,
  bundleRuntimeContext: BundleRuntimeContext | undefined,
  conversationDynamics: ConversationDynamicsResult
): Promise<ContextInjectionsResult> {
  const { services, userData, persona, bundleRuntime, userText } = ctx;
  const { analysis, currentTopic } = analysisResult;

  const injections: ContextInjection[] = [];

  // 1. Identity reinforcement (highest priority)
  if (identityContext.needsReinforcement && identityContext.injection) {
    injections.push({
      category: 'identity',
      content: identityContext.injection,
      priority: 100,
    });
  }

  // 2. BEHAVIORAL CONTEXT SYSTEM (replaces legacy context builders)
  // This system separates concerns to prevent context leakage:
  // - Behavioral signals: HOW to behave (tone, pace, style) - can't leak
  // - Awareness facts: WHAT to know (time, user, topic) - model should use
  // - Tool guidance: WHEN to query (memories, calendar) - on-demand data
  const buildIntegratedContext = await getBehavioralContextBuilder();

  const contextUserData: ContextUserData = {
    ...(userData || {}),
    keyMoments: userData.keyMoments?.map((summary) => ({
      summary,
      timestamp: new Date(),
    })),
  };

  const contextInput = {
    userText,
    analysis,
    services,
    userData: contextUserData,
    userProfile: services.userProfile,
    persona,
    bundleRuntime,
    // Pass voice emotion with speechRate for relationship-arc builders
    voiceEmotion: userData.voiceEmotion
      ? {
          emotion: userData.voiceEmotion.primary || 'neutral',
          confidence: userData.voiceEmotion.confidence || 0.5,
          speechRate: userData.voiceEmotion.prosody?.speechRate,
        }
      : undefined,
  };

  // 2a. SAFETY FIRST: Crisis Detection (extracted to injection-builders.ts)
  // Safety MUST run first and block - this is critical for user safety
  const safetyInjections = await buildSafetyInjections({
    userText,
    services,
    userData,
    persona,
    analysis,
    currentTopic,
    emotionalState,
  });
  injections.push(...safetyInjections);

  // 2b. HONESTY GUARDRAIL: Prevent implying we did something we didn't
  // When user asks "did you call my mom?", check action history and answer honestly
  // Priority 99 = just below identity (100), but before everything else
  const sessionId = services.sessionId || 'unknown';
  const honestyInjection = getHonestyInjection(sessionId, userText);
  if (honestyInjection) {
    injections.push({
      category: 'honesty',
      content: honestyInjection,
      priority: 99, // Critical - right after identity
    });
  }

  // 2c. 🧠 PREDICTIVE INTELLIGENCE: Inject ML predictions and deep analysis insights
  // This provides: Markov predictions, time-series forecasts, Gemini-powered insights
  // Priority 80 = high but below safety/honesty
  if (services.userId) {
    try {
      const predictiveContext = await getPredictiveIntelligenceContext(services.userId, {
        currentEmotion: analysis.emotion.primary,
        currentTopic,
      });
      if (predictiveContext) {
        injections.push({
          category: 'predictive',
          content: predictiveContext,
          priority: 80,
        });
      }
    } catch (error) {
      // Non-critical - don't block if predictive context fails
      diag.debug('Predictive intelligence context failed (non-blocking)', { error: String(error) });
    }
  }

  // 2d. 🤝 TEAM HUDDLE: Cross-persona observations and coordinated care
  // This provides: What other personas have noticed, suggested handoffs, patterns
  // Priority 78 = high but below predictive intelligence
  // Only on first turn to set context (don't repeat every turn)
  if (services.userId && (userData.turnCount || 0) === 0) {
    try {
      const { generateTeamHuddle, formatTeamHuddleForLLM } =
        await import('../../services/cross-persona/team-huddle.js');
      const huddle = await generateTeamHuddle(services.userId);
      if (huddle.observations.length > 0) {
        const huddleContext = formatTeamHuddleForLLM(huddle);
        injections.push({
          category: 'team_huddle',
          content: huddleContext,
          priority: 78,
        });
        diag.debug('🤝 Team Huddle context injected', {
          observations: huddle.observations.length,
          connections: huddle.connections.length,
        });
      }
    } catch (error) {
      diag.debug('Team Huddle context failed (non-blocking)', { error: String(error) });
    }
  }

  // 2e. 📨 OUTREACH BRIDGE: Context from proactive outreach (SMS/push reply)
  // This tells Ferni WHY the user is calling back (if following up on outreach)
  // Priority 95 = very high - sets the tone for the conversation
  // Only on first turn to establish context
  if (services.userId && (userData.turnCount || 0) === 0) {
    try {
      const { buildOutreachBridgeInjection } =
        await import('../../services/outreach/conversation-context-bridge.js');
      const bridgeInjection = await buildOutreachBridgeInjection(services.userId);
      if (bridgeInjection) {
        injections.push({
          category: 'outreach_bridge',
          content: bridgeInjection.content,
          priority: bridgeInjection.priority,
        });
        diag.debug('📨 Outreach bridge context injected');
      }
    } catch (error) {
      diag.debug('Outreach bridge context failed (non-blocking)', { error: String(error) });
    }
  }

  // 2f. 📱 CROSS-CHANNEL CONTEXT: What user did in app since last voice call
  // This enables continuity: "I noticed you were looking at your sleep patterns..."
  // Priority 75 = important but below predictive intelligence
  // Only on first turn to establish context
  if (services.userId && (userData.turnCount || 0) === 0) {
    try {
      const { getActiveUserContext, formatContextForVoiceCall } =
        await import('../../services/session-context/session-summary.js');
      const activeContext = await getActiveUserContext(services.userId);
      if (activeContext) {
        const crossChannelContext = formatContextForVoiceCall(activeContext);
        if (crossChannelContext && crossChannelContext.length > 50) {
          injections.push({
            category: 'cross_channel',
            content: crossChannelContext,
            priority: 75,
          });
          diag.debug('📱 Cross-channel context injected', {
            lastInteraction: activeContext.lastInteractionType,
            pendingTopics: activeContext.pendingTopics.length,
          });
        }
      }
    } catch (error) {
      diag.debug('Cross-channel context failed (non-blocking)', { error: String(error) });
    }
  }

  // 2g. 📋 WHILE YOU WERE AWAY: What background tasks completed
  // "Better Than Human" - Ferni tells you about everything that happened while you were away
  // This includes: calls, research, reservations, follow-ups, and more!
  // Priority 90 = high - this is important news to share early in the greeting
  // Only on first turn to establish context
  if (services.userId && (userData.turnCount || 0) === 0) {
    try {
      const { buildAllPendingResultsContext } =
        await import('../../intelligence/context-builders/external/pending-call-results.js');
      const pendingResultsContext = await buildAllPendingResultsContext(services.userId);
      if (pendingResultsContext) {
        injections.push({
          category: 'pending_background_results',
          content: pendingResultsContext,
          priority: 90, // High priority - tell them early
        });
        diag.debug('📋 While You Were Away context injected');
      }
    } catch (error) {
      diag.debug('Pending background results context failed (non-blocking)', { error: String(error) });
    }
  }

  // ============================================================================
  // TIERED CONTEXT BUILDERS (LATENCY OPTIMIZED - Dec 2024)
  // ============================================================================
  // Builders are split into tiers to minimize time-to-first-audio:
  //
  // TIER 1 (CRITICAL): Always run, block LLM start (~100ms)
  //   - Behavioral context (essential for response quality)
  //   - Human transfer (safety - when to escalate)
  //
  // TIER 2 (IMPORTANT): Run with timeout, drop gracefully (~80ms cap)
  //   - Scientific coaching, Life coaching, Trust systems, Boundary check
  //
  // TIER 3 (OPTIONAL): Run with aggressive timeout, drop if slow (~60ms cap)
  //   - Health awareness, User health, Visual memory, Ambient mode
  // ============================================================================

  const builderInput = {
    userText,
    services,
    userData,
    persona,
    analysis,
    currentTopic,
    emotionalState,
    sessionId: services.sessionId, // For SessionDynamicsEngine
  };

  // ============================================================================
  // TOPIC-BASED BUILDER FILTERING (saves ~30-50ms by skipping irrelevant builders)
  // ============================================================================
  const topicCategory = analysis.topics?.category;
  const builderFilter = filterBuildersByTopic(topicCategory, userText, userData.turnCount || 0);

  if (builderFilter.skip.size > 0) {
    diag.debug('⚡ Topic-based builder filtering', {
      topic: topicCategory || 'general',
      skipping: Array.from(builderFilter.skip).join(', '),
      estimatedSavingsMs: builderFilter.estimatedSavingsMs,
    });
  }

  // Helper: run builder only if not skipped, otherwise return fallback immediately
  const runIfRelevant = async <T>(
    builder: BuilderName,
    builderFn: () => Promise<T>,
    fallback: T
  ): Promise<T> => {
    if (builderFilter.skip.has(builder)) {
      return skipBuilder(fallback);
    }
    return builderFn();
  };

  // Timeout helper - returns result or fallback after timeout
  const withTimeout = async <T>(
    promise: Promise<T>,
    timeoutMs: number,
    fallback: T,
    name: string
  ): Promise<T> => {
    try {
      const result = await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout: ${name}`)), timeoutMs);
        }),
      ]);
      return result;
    } catch (error) {
      diag.debug(`⏱️ Context builder timeout: ${name}`, { timeoutMs });
      return fallback;
    }
  };

  // ============================================================================
  // TIER 1: CRITICAL BUILDERS (no timeout - these are essential)
  // ============================================================================
  const [behavioralResult, humanTransferInjection, crisisHistoryInjection] = await Promise.all([
    // Behavioral context system - essential for response quality
    buildIntegratedContext(contextInput),
    // Human transfer awareness - safety critical (includes signal logging for analytics)
    buildHumanTransferInjections(userText, services.userId),
    // Crisis history follow-up - better than human continuity
    buildCrisisHistoryInjection(services.userId || 'unknown'),
  ]);

  // ============================================================================
  // TIER 2: IMPORTANT BUILDERS (80ms timeout - graceful degradation)
  // With topic-based filtering: skip builders not relevant to current topic
  // UPDATED Dec 29 2024: Reduced from 80ms to 50ms for Better than Human latency
  // ============================================================================
  const IMPORTANT_TIMEOUT_MS = 50;

  // Fallback values for skipped builders
  const scientificFallback = { injections: [], endpointingRecommendation: undefined };
  const coachingFallback: never[] = [];
  const trustFallback = { injections: [], summary: {} as TrustContextSummary };
  const boundaryFallback: never[] = [];
  const superhumanFallback = {
    injections: [],
    signals: {
      commitmentDetected: false,
      valuesConflict: false,
      capacityWarning: false,
      insideJokeOpportunity: false,
      voiceDistressDetected: false,
      predictiveInsight: false,
    },
    processingTimeMs: 0,
  };
  const semanticIntelligenceFallback: SemanticIntelligenceInjectionResult = { injection: null };

  const [
    scientificResult,
    coachingInjections,
    trustSystemsResult,
    boundaryInjections,
    liveSuperhumanResult,
    semanticIntelligenceResult,
  ] = await Promise.all([
    // Scientific coaching - skip if topic is emotional/personal
    runIfRelevant(
      'scientific-coaching',
      async () =>
        withTimeout(
          buildScientificCoachingInjections(builderInput),
          IMPORTANT_TIMEOUT_MS,
          scientificFallback,
          'scientific-coaching'
        ),
      scientificFallback
    ),
    // Life coaching - skip if topic is market/financial data
    runIfRelevant(
      'life-coaching',
      async () =>
        withTimeout(
          buildLifeCoachingInjections(builderInput),
          IMPORTANT_TIMEOUT_MS,
          coachingFallback,
          'life-coaching'
        ),
      coachingFallback
    ),
    // Trust systems - NEVER skipped (core to relationship)
    withTimeout(
      buildTrustSystemsInjections(builderInput),
      IMPORTANT_TIMEOUT_MS,
      trustFallback,
      'trust-systems'
    ),
    // Boundary check - skip if topic doesn't involve personal/emotional
    runIfRelevant(
      'boundary-check',
      async () =>
        withTimeout(
          buildBoundaryCheckInjections({
            userId: services.userId || 'unknown',
            currentTopic,
          }),
          IMPORTANT_TIMEOUT_MS,
          boundaryFallback,
          'boundary-check'
        ),
      boundaryFallback
    ),
    // 🌟 LIVE SUPERHUMAN - Real-time "Better Than Human" capabilities per-turn
    // This is the CRITICAL missing piece: superhuman insights flowing into
    // each turn, not just at session start.
    runIfRelevant(
      'live-superhuman',
      async () =>
        withTimeout(
          buildLiveSuperhumanInjections({
            userId: services.userId || 'unknown',
            sessionId: services.sessionId || 'unknown',
            userText,
            currentTopic,
            emotionalState,
            voiceEmotion: userData.voiceEmotion
              ? {
                  primary: userData.voiceEmotion.primary,
                  confidence: userData.voiceEmotion.confidence,
                  stressLevel: userData.voiceEmotion.stressLevel,
                  valence: userData.voiceEmotion.valence,
                  anxietyMarkers: userData.voiceEmotion.anxietyMarkers,
                  prosody: userData.voiceEmotion.prosody,
                }
              : undefined,
            analysis,
            turnCount: userData.turnCount || 0,
            totalConversations: services.userProfile?.totalConversations,
          }),
          IMPORTANT_TIMEOUT_MS,
          superhumanFallback,
          'live-superhuman'
        ),
      superhumanFallback
    ),
    // 🧠 SEMANTIC INTELLIGENCE - Tool hints, learned patterns, proactive suggestions
    // This enriches LLM context with semantic insights WITHOUT auto-executing
    withTimeout(
      buildSemanticIntelligenceInjection({
        userId: services.userId || 'unknown',
        sessionId: services.sessionId || 'unknown',
        personaId: persona.id,
        userText,
        // Get recently used tools from conversation state for learning context
        recentTools: userData?.conversationState?.getToolExecutionData?.()?.recentlyUsedTools,
        recentTopics: currentTopic ? [currentTopic] : undefined,
      }),
      IMPORTANT_TIMEOUT_MS,
      semanticIntelligenceFallback,
      'semantic-intelligence'
    ),
  ]);

  // ============================================================================
  // TIER 3: OPTIONAL BUILDERS (60ms timeout - these are nice-to-have)
  // With aggressive topic-based filtering: these are often skipped
  // UPDATED Dec 29 2024: Reduced from 60ms to 40ms for Better than Human latency
  // ============================================================================
  const OPTIONAL_TIMEOUT_MS = 40;

  const [healthInjections, userHealthInjection, visualMemoryInjection, ambientModeInjection] =
    await Promise.all([
      // System health - skip unless health topic or keywords
      runIfRelevant(
        'health-awareness',
        async () =>
          withTimeout(
            buildHealthAwarenessInjections(),
            OPTIONAL_TIMEOUT_MS,
            [],
            'health-awareness'
          ),
        []
      ),
      // User health (Apple HealthKit) - skip unless health keywords
      runIfRelevant(
        'user-health',
        async () =>
          withTimeout(
            buildUserHealthInjection(services.userId || 'unknown'),
            OPTIONAL_TIMEOUT_MS,
            null,
            'user-health'
          ),
        null
      ),
      // Visual memory - skip unless visual/photo keywords
      runIfRelevant(
        'visual-memory',
        async () =>
          withTimeout(
            buildVisualMemoryInjections(services.userId || 'unknown'),
            OPTIONAL_TIMEOUT_MS,
            null,
            'visual-memory'
          ),
        null
      ),
      // Ambient mode - skip unless location keywords
      runIfRelevant(
        'ambient-mode',
        async () =>
          withTimeout(
            buildAmbientModeInjections(services.userId || 'unknown'),
            OPTIONAL_TIMEOUT_MS,
            null,
            'ambient-mode'
          ),
        null
      ),
    ]);

  // Extract trust injections and summary
  const trustInjections = trustSystemsResult.injections;
  const trustContextSummary = trustSystemsResult.summary;

  // Process behavioral context result
  // Inject awareness facts (what the model should know)
  if (behavioralResult.awarenessFacts) {
    injections.push({
      category: 'awareness',
      content: behavioralResult.awarenessFacts,
      priority: 90, // High priority - model should know these
    });
  }

  // Inject behavioral directive (how to behave)
  if (behavioralResult.behavioralDirective) {
    injections.push({
      category: 'behavioral',
      content: behavioralResult.behavioralDirective,
      priority: 85, // High priority - guides response style
    });
  }

  // Inject tool guidance (when to call tools)
  if (behavioralResult.toolGuidance) {
    injections.push({
      category: 'tools',
      content: behavioralResult.toolGuidance,
      priority: 75, // Moderate priority
    });
  }

  // Log behavioral mode status
  if (behavioralResult.highEmotionMode) {
    diag.info('🎯 High emotion mode: Behavioral signals adjusted for focused support');
  }

  diag.debug('📊 Behavioral context built', {
    mode: behavioralResult.metrics.mode,
    buildersRun: behavioralResult.metrics.behavioralBuildersRun,
    durationMs: behavioralResult.metrics.totalDurationMs.toFixed(1),
  });

  // Process scientific coaching results
  injections.push(...scientificResult.injections);

  // Store adaptive endpointing recommendation in userData for voice agent
  if (scientificResult.endpointingRecommendation) {
    (userData as Record<string, unknown>).adaptiveEndpointing =
      scientificResult.endpointingRecommendation;
    diag.debug('Adaptive endpointing updated', scientificResult.endpointingRecommendation);
  }

  // Process remaining injection results (already parallelized above)
  injections.push(...coachingInjections);
  injections.push(...trustInjections);
  injections.push(...boundaryInjections);
  injections.push(...healthInjections);

  // ========================================================================
  // 🌟 LIVE SUPERHUMAN INJECTIONS - Real-time "Better Than Human" per turn
  // These are the CRITICAL capabilities that were missing - superhuman
  // insights that flow into EVERY turn, not just session start.
  // ========================================================================
  if (liveSuperhumanResult.injections.length > 0) {
    injections.push(...liveSuperhumanResult.injections);
    diag.info('🌟 Live superhuman injections added', {
      count: liveSuperhumanResult.injections.length,
      signals: liveSuperhumanResult.signals,
      processingTimeMs: liveSuperhumanResult.processingTimeMs,
    });

    // ========================================================================
    // 📊 QUEUE RESONANCE CHECKS - Track which superhuman insights to validate
    // When capabilities are surfaced, queue them for voice-native feedback
    // ========================================================================
    const { sessionId } = services;
    const turnCount = userData.turnCount || 0;
    const { signals } = liveSuperhumanResult;

    // Map signals to capability types and queue for resonance checks
    if (signals.commitmentDetected) {
      queueResonanceCheck(
        sessionId,
        'commitment_keeper' as SuperhumanCapability,
        'Commitment or intention detected',
        turnCount
      );
    }
    if (signals.valuesConflict) {
      queueResonanceCheck(
        sessionId,
        'values_alignment' as SuperhumanCapability,
        'Values conflict or alignment surfaced',
        turnCount
      );
    }
    if (signals.capacityWarning) {
      queueResonanceCheck(
        sessionId,
        'capacity_guardian' as SuperhumanCapability,
        'Capacity warning or energy check surfaced',
        turnCount
      );
    }
    if (signals.voiceDistressDetected) {
      queueResonanceCheck(
        sessionId,
        'voice_biomarkers' as SuperhumanCapability,
        'Voice distress or emotional state detected',
        turnCount
      );
    }
    if (signals.predictiveInsight) {
      queueResonanceCheck(
        sessionId,
        'predictive_coaching' as SuperhumanCapability,
        'Predictive insight or pattern surfaced',
        turnCount
      );
    }
  }

  // 🧠 SEMANTIC INTELLIGENCE - Tool hints help LLM make better decisions
  // Also captures prediction for learning loop comparison
  if (semanticIntelligenceResult?.injection) {
    injections.push(semanticIntelligenceResult.injection);
    diag.debug('🧠 Semantic intelligence injection added (tool hints, patterns)');
  }

  // Store semantic prediction in userData for learning loop comparison.
  // When a tool is actually executed, the executor compares this prediction
  // to the actual tool to detect implicit corrections (user chose different tool).
  if (semanticIntelligenceResult?.prediction) {
    userData.semanticPrediction = semanticIntelligenceResult.prediction;
  } else {
    // Clear previous prediction if none this turn
    userData.semanticPrediction = undefined;
  }

  // ========================================================================
  // "BETTER THAN HUMAN" INJECTIONS (Legacy - session-level capabilities)
  // These 4 capabilities make Ferni genuinely better than a human friend
  // ========================================================================
  if (userHealthInjection) {
    injections.push(userHealthInjection);
    diag.debug('💪 User health injection added (Apple HealthKit)');
  }
  if (visualMemoryInjection) {
    injections.push(visualMemoryInjection);
    diag.debug('📸 Visual memory injection added');
  }
  if (ambientModeInjection) {
    injections.push(ambientModeInjection);
    diag.debug('🌙 Ambient mode injection added');
  }
  if (humanTransferInjection) {
    injections.push(humanTransferInjection);
    diag.info('🆘 Human transfer awareness added', {
      category: humanTransferInjection.category,
      priority: humanTransferInjection.priority,
    });
  }
  if (crisisHistoryInjection) {
    injections.push(crisisHistoryInjection);
    diag.info('📋 Crisis history awareness added (Better Than Human follow-up)', {
      category: crisisHistoryInjection.category,
      priority: crisisHistoryInjection.priority,
    });
  }

  // 2c-1. SESSION DYNAMICS - Phase-aware conversation guidance
  // Provides natural conversation arc: opening → warming → engaged → deepening → winding
  const sessionDynamicsInjection = buildSessionDynamicsInjection(services.sessionId);
  if (sessionDynamicsInjection) {
    injections.push(sessionDynamicsInjection);
    diag.debug('📈 Session dynamics injected', {
      phase: sessionDynamicsInjection.content.split('\n')[0],
    });
  }

  // 2d-1. RELATIONSHIP STAGE CONTEXT - "Better than Human" relationship awareness
  // The system knows exactly where it stands with this person
  try {
    const relationshipStage = services.userProfile?.relationshipStage || userData.relationshipStage;
    const totalConversations = services.userProfile?.totalConversations || 1;
    const firstMet = services.userProfile?.createdAt;

    if (relationshipStage || totalConversations > 1) {
      const stageName = String(relationshipStage || 'building');

      const daysKnown = firstMet
        ? Math.floor((Date.now() - new Date(firstMet).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Determine guidance based on conversation count (more reliable than stage names)
      let guidance: string;
      if (totalConversations <= 1) {
        guidance = `This is early in your relationship. Be warm but don't presume intimacy.
Don't reference "our conversations" or "as we've discussed" yet.
Focus on getting to know them. Ask their name if you don't know it.`;
      } else if (totalConversations <= 5) {
        guidance = `You're getting to know each other. Building rapport.
You can reference previous conversations but keep it light.
Share some of yourself - it builds trust.`;
      } else if (totalConversations <= 20) {
        guidance = `You have history together. They trust you.
Reference past conversations when relevant. Remember details.
You can go deeper - they've shown you who they are.`;
      } else {
        guidance = `Deep relationship. Real trust. They've let you in.
You know their patterns, their fears, their dreams.
Speak with the intimacy of someone who truly knows them.`;
      }

      injections.push({
        category: 'relationship_stage',
        content: `[🤝 RELATIONSHIP CONTEXT]
Stage: ${stageName}
Conversations: ${totalConversations}
${daysKnown > 0 ? `Days known: ${daysKnown}` : 'First meeting today'}

${guidance}`,
        priority: 85,
      });

      diag.debug('📊 Relationship stage injected', {
        stage: stageName,
        conversations: totalConversations,
      });
    }
  } catch (relationshipError) {
    diag.debug('Relationship stage injection skipped', { error: String(relationshipError) });
  }

  // 2d-2. BETTER THAN HUMAN ORCHESTRATOR - Superhuman insights coordination
  // Activates all 12 engines for genuine "better than human" moments
  try {
    const userId = services.userId || 'unknown';
    const sessionId = services.sessionId || `session-${Date.now()}`;
    const sessionCount = services.userProfile?.totalConversations || 0;

    const bthOrchestrator = getBetterThanHuman(userId, sessionId, persona.id, sessionCount);

    // Map user data relationship stage to BTH stage
    const userStage = userData.relationshipStage;
    type BthStage = 'new_acquaintance' | 'getting_to_know' | 'trusted_advisor' | 'old_friend';
    const bthStageMap: Record<string, BthStage> = {
      stranger: 'new_acquaintance',
      acquaintance: 'getting_to_know',
      friend: 'trusted_advisor',
      trusted_advisor: 'old_friend',
    };
    const bthRelationshipStage: BthStage =
      (userStage && bthStageMap[userStage]) || 'getting_to_know';

    // Get time of day
    const hour = new Date().getHours();
    const timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' =
      hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
    const dayOfWeek = new Date().getDay();

    // Build context for the orchestrator using its expected interface
    const bthContext = {
      userMessage: userText,
      turnCount: userData.turnCount || 0,
      sessionCount,
      topic: analysis.topics?.detected?.[0],
      emotion: analysis.emotion.primary,
      isSessionStart: (userData.turnCount || 0) <= 1,
      relationshipStage: bthRelationshipStage,
      personaId: persona.id,
      userId,
      sessionId,
      timeOfDay,
      dayOfWeek,
    };

    // Use the analyze method
    const insight = bthOrchestrator.analyze(bthContext);

    // Inject top prioritized actions
    // INCREASED: From max 2 → max 4, and threshold 0.5 → 0.35
    // This ensures more superhuman insights actually reach the LLM
    if (insight && insight.prioritizedActions && insight.prioritizedActions.length > 0) {
      const topActions = insight.prioritizedActions.slice(0, 4); // Max 4 per turn (was 2)

      for (const action of topActions) {
        if (action.content && action.priority > 0.35) {
          // Threshold lowered from 0.5 to 0.35
          injections.push({
            category: 'superhuman_insight',
            content: `[🌟 BETTER THAN HUMAN - ${action.type}]
${action.content}

${action.reason ? `Why: ${action.reason}` : ''}
Placement: ${action.placement || 'natural'} - weave this in naturally.`,
            priority: Math.round(action.priority * 100),
          });
        }
      }

      if (topActions.length > 0) {
        diag.info('🌟 BetterThanHuman insights active', {
          count: topActions.length,
          types: topActions.map((a) => a.type).join(', '),
        });
      }
    }
  } catch (bthError) {
    diag.debug('BetterThanHuman orchestration skipped', { error: String(bthError) });
    // Non-fatal - continue without superhuman insights
  }

  // 2e. Ambient Awareness - "Better than Human" environment detection
  // A human friend on the phone might not notice you're in a car or coffee shop. We do.
  const ambientInjections = buildAmbientAwarenessInjections(userData);
  injections.push(...ambientInjections);

  // NOTE: Boundary Check (2f) and Health Awareness (2g) are now parallelized above
  // with the other context builders - see the Promise.all block

  // 2h. Value Capture - Detect achievements/breakthroughs for optional contribution prompt
  // This runs silently and stores detected events for later potential prompting
  try {
    const userId = services.userId || 'unknown';
    const valueEvent = await valueCapture.detect({
      userId,
      message: userText,
      conversationId: services.sessionId,
    });

    if (valueEvent) {
      diag.info('💰 Value event detected', {
        type: valueEvent.type,
        estimatedValue: valueEvent.estimatedValueCents,
      });

      // Store on userData for later frontend integration
      // This allows the UI to optionally prompt for contribution after conversation
      (userData as Record<string, unknown>).lastValueEvent = {
        type: valueEvent.type,
        eventId: valueEvent.id,
        message: userText.slice(0, 100),
        timestamp: valueEvent.createdAt,
      };

      // Check if we should show value capture (rate-limited, not disruptive)
      const recentValuePromptCount =
        ((userData as Record<string, unknown>).valuePromptCount as number) || 0;
      const shouldShow = valueCapture.shouldShow({
        event: valueEvent,
        recentValuePromptCount,
        conversationTurnCount: userData.turnCount || 0,
      });

      if (shouldShow) {
        // Flag for potential post-conversation prompt (not during!)
        (userData as Record<string, unknown>).shouldPromptValueCapture = true;
        (userData as Record<string, unknown>).valuePromptCount = recentValuePromptCount + 1;
      }
    }
  } catch (valueError) {
    diag.debug('Value capture detection skipped', { error: String(valueError) });
    // Non-fatal - monetization detection should never block conversation
  }

  // 3. Task wisdom
  try {
    const taskManager = await getTaskManagerCached();
    const taskContext = taskManager.processUserTurn(analysis, userText, {
      isReturningUser: userData.isReturningUser,
      lastSummary: services.userProfile?.lastConversationSummary,
    });

    if (taskContext.length > 0) {
      injections.push({
        category: 'tasks',
        content: `[TASK GUIDANCE]\n${taskContext.join('\n\n')}`,
        priority: 70,
      });
    }
  } catch {
    // Non-fatal
  }

  // 4. Response length guidance
  injections.push({
    category: 'response_length',
    content: responseGuidance.length.guidance,
    priority: 60,
  });

  // 5. Topic transition
  if (responseGuidance.topicTransition) {
    injections.push({
      category: 'topic_transition',
      content: responseGuidance.topicTransition,
      priority: 55,
    });
  }

  // 6. Pacing guidance
  if (responseGuidance.pacing) {
    injections.push({
      category: 'pacing',
      content: `[PACING GUIDANCE]\n${responseGuidance.pacing}`,
      priority: 50,
    });
  }

  // ============================================================================
  // PARALLELIZED ASYNC INJECTION BUILDERS (saves ~30-50ms)
  // These builders are independent and can run concurrently
  // ============================================================================
  const [humanLevelInjections, insightsInjection] = await Promise.all([
    // 7. Human-level features (extracted to injection-builders.ts)
    buildHumanLevelInjections({
      services,
      userData,
      userText,
      analysis,
      currentTopic,
      humorGuidance: responseGuidance.humor,
      logger: ctx.logger,
    }),
    // 8b. Cross-persona insights (extracted to injection-builders.ts)
    buildCrossPersonaInsightsInjection(services, persona.id),
  ]);

  // Process parallelized results
  injections.push(...humanLevelInjections);
  if (insightsInjection) {
    injections.push(insightsInjection);
  }

  // 8. Emotional guidance (synchronous - no change)
  if (emotionalState.responseGuidance) {
    injections.push({
      category: 'emotional_guidance',
      content: emotionalState.responseGuidance,
      priority: 33,
    });
  }

  if (emotionalState.transitionPhrase) {
    injections.push({
      category: 'emotional_transition',
      content: `[EMOTIONAL SHIFT DETECTED: Consider acknowledging with something like: "${emotionalState.transitionPhrase}"]`,
      priority: 32,
    });
  }

  // 9. Story opportunity
  if (responseGuidance.storyOpportunity) {
    injections.push({
      category: 'story_opportunity',
      content: `[STORY OPPORTUNITY: Consider sharing this story: "${responseGuidance.storyOpportunity.story}..." Transition: "${responseGuidance.storyOpportunity.transitionPhrase}"]`,
      priority: 30,
    });
  }

  // 9b. PROACTIVE MEMORY SURFACING - "Better than Human" memory intelligence
  // Suggests relevant memories worth mentioning at this moment
  if (ctx.proactiveSurfacing && ctx.proactiveSurfacing.length > 0) {
    const surfacingLines = ctx.proactiveSurfacing
      .slice(0, 2) // Max 2 suggestions
      .map((opp) => `- ${opp.naturalPhrasing}`);
    
    injections.push({
      category: 'proactive_memory',
      content: `[MEMORY SURFACING - Consider mentioning naturally if relevant]\n${surfacingLines.join('\n')}\n(Only mention if it flows naturally - don't force it)`,
      priority: 29,
    });
  }

  // 10. Humanizing context
  if (humanizingResult && humanizingResult.injections.length > 0) {
    const humanizingPrompt = formatHumanizingForPrompt(humanizingResult);
    if (humanizingPrompt) {
      injections.push({
        category: 'humanizing',
        content: humanizingPrompt,
        priority: 28,
      });
    }
  }

  // 11. Conversation humanizing
  try {
    const conversationHumanizingInput = {
      userText,
      analysis,
      services,
      userData: {
        ...userData,
        keyMoments: userData.keyMoments?.map((s) => ({ summary: s, timestamp: new Date() })),
      },
      userProfile: services.userProfile,
      persona,
      bundleRuntime,
      personaId: persona.id,
      turnNumber: userData.turnCount || 0,
      wasPersonalSharing:
        (analysis.emotion.distressLevel ?? 0) > 0.5 || analysis.emotion.intensity > 0.7,
    };

    const convHumanizingInjections = buildConversationHumanizingContext(
      conversationHumanizingInput
    );
    if (convHumanizingInjections.length > 0) {
      const prompt = formatConversationHumanizingForPrompt(convHumanizingInjections);
      if (prompt) {
        injections.push({
          category: 'conversation_humanizing',
          content: prompt,
          priority: 25,
        });
      }
    }
  } catch {
    // Non-fatal
  }

  // 12. Bundle runtime context
  if (bundleRuntimeContext) {
    if (bundleRuntimeContext.modeTransitionPhrase) {
      const mode = bundleRuntime?.getCurrentMode();
      const modeGuidance = mode
        ? [
            `[PERSONA MODE: ${bundleRuntimeContext.currentMode.toUpperCase()}]`,
            `Style: ${mode.description}`,
            `Response length: ${mode.response_length}`,
            `Behaviors: ${mode.behaviors.join(', ')}`,
          ].join('\n')
        : '';

      injections.push({
        category: 'mode_transition',
        content: `[MODE SHIFT: ${bundleRuntimeContext.previousMode} → ${bundleRuntimeContext.currentMode}]\nConsider transitioning with: "${bundleRuntimeContext.modeTransitionPhrase}"\n${modeGuidance}`,
        priority: 22,
      });
    }

    if (bundleRuntimeContext.situationalResponse) {
      const sr = bundleRuntimeContext.situationalResponse;
      const content =
        sr.type === 'celebration'
          ? `[CELEBRATION DETECTED: ${sr.situation}]\nUse this celebratory tone: "${sr.response}"`
          : `[SENSITIVE MOMENT: ${sr.situation}]\nRespond with care: "${sr.response}"\nAVOID phrases like: ${sr.avoidPhrases?.join(', ') || ''}`;

      injections.push({
        category: 'situational_response',
        content,
        priority: 20,
      });
    }

    if (bundleRuntimeContext.pushbackDetected) {
      injections.push({
        category: 'pushback',
        content: `[USER PUSHBACK DETECTED: ${bundleRuntimeContext.pushbackDetected.type}]\nRespond with curiosity not defense: "${bundleRuntimeContext.pushbackDetected.response}"`,
        priority: 18,
      });
    }
  }

  // 13. Response naturalness
  const turnCount = userData.turnCount || 0;
  const enhancements = getResponseEnhancements({
    personaId: persona.id,
    turnCount,
    userEmotion: analysis.emotion.primary,
    topicWeight: 'medium',
    isQuestion: userText.includes('?'),
    isFollowUp: turnCount > 0,
    isGreeting: turnCount === 0,
    isPositiveMoment:
      analysis.emotion.primary === 'joy' || analysis.emotion.primary === 'anticipation',
  });

  if (enhancements.prefix) {
    injections.push({
      category: 'response_prefix',
      content: `[RESPONSE STYLE]\nStart your response with: "${enhancements.prefix.replace(/<[^>]+>/g, '')}"\nThen continue with your substantive response.\n\n⛔ NEVER SAY: "Good question", "Great question", "Well...", "That's a great point" - these are AI clichés. Just respond naturally.`,
      priority: 15,
    });
  }

  if (enhancements.suffix) {
    injections.push({
      category: 'catchphrase',
      content: `[CATCHPHRASE MOMENT]\nIf appropriate, weave in this signature phrase naturally: "${enhancements.suffix.replace(/<[^>]+>/g, '')}"`,
      priority: 12,
    });
  }

  // 14. Conversation state summary
  if (userData.conversationState) {
    const convSummary = userData.conversationState.getSummaryForLLM();
    if (convSummary) {
      injections.push({
        category: 'conversation_state',
        content: `[CONVERSATION STATE]\n${convSummary}`,
        priority: 10,
      });
    }

    const wrapUp = userData.conversationState.shouldWrapUp();
    if (wrapUp.should) {
      injections.push({
        category: 'wrap_up',
        content: `[CONSIDER WRAPPING UP]\nReasons: ${wrapUp.reasons.join(', ')}\nLook for a natural moment to offer a graceful conclusion.`,
        priority: 8,
      });
    }
  }

  // 15. Viral Growth - Referral prompt (very conservative)
  // Only injects when conversation naturally leads to sharing
  try {
    const relationshipStage =
      (services.userProfile?.relationshipStage as 'new' | 'building' | 'established' | 'deep') ||
      'building';

    // Determine mood from emotional state
    const userMood =
      emotionalState.intensity < 0.3
        ? 'neutral'
        : emotionalState.primary?.toLowerCase().includes('joy') ||
            emotionalState.primary?.toLowerCase().includes('happy') ||
            emotionalState.primary?.toLowerCase().includes('excit')
          ? 'positive'
          : emotionalState.distressLevel > 0.5
            ? 'struggling'
            : 'neutral';

    // Extract topic strings from analysis
    // TopicExtractionResult has 'detected' array of topic strings
    const topicsObj = analysisResult.analysis?.topics;
    const topics: string[] = topicsObj?.detected || [];

    const referralResult = await buildReferralPromptInjection({
      userId: services.userId || 'unknown',
      personaId: persona.id,
      turnCount: userData.turnCount || 1,
      relationshipStage,
      userMood: userMood as 'positive' | 'neutral' | 'struggling',
      recentTopics: topics,
      userText,
    });

    if (referralResult.shouldInject && referralResult.injection) {
      injections.push(referralResult.injection);
      diag.info('🌱 Referral prompt injected (natural trigger detected)');
    }

    // Also inject context about past referral calls (if any)
    // This lets Ferni naturally mention how calls went when relevant
    const referralConversationContext = buildReferralConversationContext();
    if (referralConversationContext) {
      injections.push(referralConversationContext);
      diag.debug('📞 Referral conversation context injected');
    }
  } catch (error) {
    diag.warn('Referral prompt injection failed (non-blocking)', { error: String(error) });
  }

  // 16. Conversation dynamics (extracted to injection-builders.ts)
  // Map to the injection builder's expected type (which has stricter level typing)
  const dynamicsForBuilder: InjectionDynamicsResult = {
    narrativeArc: conversationDynamics.narrativeArc,
    engagement: conversationDynamics.engagement
      ? {
          level: conversationDynamics.engagement.level as 'low' | 'medium' | 'high' | 'distracted',
          declining: conversationDynamics.engagement.declining,
          suggestedAction: conversationDynamics.engagement.suggestedAction,
          actionGuidance: conversationDynamics.engagement.actionGuidance,
        }
      : undefined,
    rhythm: conversationDynamics.rhythm
      ? {
          lengthMultiplier: conversationDynamics.rhythm.lengthMultiplier,
          energyLevel: conversationDynamics.rhythm.energyLevel as 'low' | 'medium' | 'high',
          guidance: conversationDynamics.rhythm.guidance,
        }
      : undefined,
    silence: conversationDynamics.silence,
  };
  const dynamicsInjections = buildConversationDynamicsInjections(dynamicsForBuilder);
  injections.push(...dynamicsInjections);

  // Data capture acknowledgment (if we captured contact info, etc.)
  if (userData.dataCaptureAcknowledgment) {
    injections.push({
      category: 'data_capture',
      content: `[SAVED DATA: ${userData.dataCaptureAcknowledgment} - Acknowledge this naturally in your response, e.g., "Got it, I've saved that."]`,
      priority: 75, // High priority - should be acknowledged
    });
    // Clear after injecting
    userData.dataCaptureAcknowledgment = undefined;
  }

  // Sort by priority (highest first)
  injections.sort((a, b) => b.priority - a.priority);

  return {
    injections,
    trustContextSummary,
  };
}

// ============================================================================
// ADVANCED HUMANIZATION PROCESSING
// ============================================================================

/**
 * Process advanced humanization for a turn
 *
 * This coordinates all 10 deep humanization capabilities:
 * 1. Subtext Detection - Read between the lines
 * 2. Emotional Aftercare - Guide back to equilibrium
 * 3. Conversational Repair - Recover from miscommunication
 * 4. Hope Injection - Subtle forward-looking language
 * 5. Curiosity Engine - Genuine interest in their life
 * NOTE: processAdvancedHumanization moved to advanced-humanization.ts
 */

// ============================================================================
// MAIN TURN PROCESSOR
// ============================================================================

/**
 * Process a complete user turn
 *
 * This is the main entry point that orchestrates all turn processing.
 * Extracted from voice-agent.ts onUserTurnCompleted method.
 *
 * @param ctx - Turn context with all required inputs
 * @returns Complete turn processing result
 */
export async function processTurn(ctx: TurnContext): Promise<TurnProcessorResult> {
  const startTime = Date.now();
  const { turnCtx, userText, userData, services, logger } = ctx;

  // ============================================================================
  // 📊 DEV TELEMETRY: Create turn trace for E2E observability
  // ============================================================================
  const isDev = process.env.NODE_ENV === 'development' || process.env.DEV_TELEMETRY === 'true';
  const trace = isDev ? createTurnTrace(services.sessionId) : null;

  // Log start
  diag.user('Processing user turn', {
    preview: userText.slice(0, 100),
  });

  if (!userText || userText.trim().length === 0) {
    diag.warn('Empty user text');
    throw new Error('Empty user text');
  }

  // ============================================================================
  // 🚨 SAFETY FIRST: Crisis detection runs BEFORE anything else
  // This is a HARD safety rail that CANNOT be bypassed
  // ============================================================================
  const voiceEmotionForCrisis = userData?.voiceEmotion
    ? {
        primary: userData.voiceEmotion.primary || 'neutral',
        intensity: userData.voiceEmotion.confidence || 0.5,
        confidence: userData.voiceEmotion.confidence,
      }
    : undefined;

  const crisisResult = detectCrisis(userText, voiceEmotionForCrisis);
  const preResponseGuard = guardPreResponse(userText, voiceEmotionForCrisis);

  // Log crisis detection if anything was found
  if (crisisResult.isCrisis || crisisResult.severity > 0.3) {
    diag.state('🚨 Crisis detection result', {
      isCrisis: crisisResult.isCrisis,
      severity: crisisResult.severity,
      indicators: crisisResult.indicators,
      shouldOverride: preResponseGuard.shouldBlock,
    });

    // 🧠 SUPERHUMAN OUTREACH: Accumulate crisis signal for intelligent outreach
    if (userData.userId) {
      try {
        const { accumulateSignal, signalFromCrisis } =
          await import('../../services/conversation-thread/superhuman-outreach-intelligence.js');
        const severityLevel =
          crisisResult.severity > 0.7
            ? 'severe'
            : crisisResult.severity > 0.5
              ? 'high'
              : 'moderate';
        accumulateSignal(
          userData.userId,
          signalFromCrisis({
            type: crisisResult.indicators.join(', ') || 'crisis',
            severity: severityLevel,
            context: userText.slice(0, 100),
          })
        );
      } catch {
        // Non-blocking
      }
    }
  }

  // Enable verbose timing with DEBUG_TURN_TIMING=true
  const debugTiming = process.env.DEBUG_TURN_TIMING === 'true';
  const turnStartMs = Date.now();

  // 1. Analyze message (synchronous - required for all downstream)
  const analysisTimer = createTimer();
  trace?.stage('message_analysis');
  const analysisSpan = trace?.startSpan('message_analysis');
  const analysisResult = analyzeMessage(ctx);
  const analysisMs = analysisTimer.stop();
  analysisSpan?.end();
  recordPhaseTiming('message_analysis', analysisMs);
  if (debugTiming) diag.info(`⏱️ [TIMING] message_analysis: ${analysisMs}ms`);

  // 2. Update conversation state (synchronous)
  const stateTimer = createTimer();
  const stateSpan = trace?.startSpan('conversation_state');
  updateConversationState(ctx, analysisResult);
  stateSpan?.end();
  recordPhaseTiming('conversation_state', stateTimer.stop());

  // ============================================================================
  // 📊 RESONANCE RESPONSE: Check if user is responding to "Does that track?"
  // This captures voice-native feedback for superhuman capability effectiveness
  // ============================================================================
  const turnCount = userData.turnCount || 0;
  if (services.sessionId && userData.userId && turnCount >= 2) {
    const resonanceResult = processUserResponseForResonance(
      services.sessionId,
      userData.userId,
      userText,
      turnCount
    );

    if (resonanceResult.processed) {
      diag.state('📊 Resonance feedback captured', {
        capability: resonanceResult.capability,
        reaction: resonanceResult.reaction,
        turn: turnCount,
      });
    }
  }

  // ============================================================================
  // 🎯 TRIGGER EFFECTIVENESS: Process outcomes from previous turn (Phase 4)
  // "Better than Human" - learn which triggers actually help this user
  // ============================================================================
  if (services.sessionId && userData.lastFiredTriggers?.length) {
    // Calculate average response length from recent transcripts
    const recentTranscripts = userData.recentTranscripts || [];
    const avgLen =
      recentTranscripts.length > 0
        ? recentTranscripts.reduce((sum, t) => sum + t.length, 0) / recentTranscripts.length
        : 100;

    // Process trigger outcomes (safe fire-and-forget)
    safeFireAndForget(
      async () => {
        const { processTriggerOutcomes } = await import('./trigger-outcome-handler.js');
        await processTriggerOutcomes(userData, {
          sessionId: services.sessionId,
          userResponse: userText,
          averageResponseLength: avgLen,
          previousTopic: userData.lastTopic,
          currentTopic: analysisResult.currentTopic,
        });
      },
      { context: 'trigger-outcome-processing' }
    );
  }

  // ============================================================================
  // 🧠 COACHING INTELLIGENCE: Pattern tracking and voice signals
  // "Better than Human" - track patterns across sessions, detect voice signals
  // ============================================================================
  if (services.userId) {
    // Initialize voice tracking for this session if not already done
    initializeVoiceTracking(services.sessionId);

    // Fire-and-forget: Record voice turn for signal detection
    recordVoiceTurn(services.sessionId, userText, {
      topic: analysisResult.currentTopic,
      energy: userData?.voiceEmotion?.confidence,
      pauseBeforeMs: userData?.pauseBeforeSpeakingMs,
    });

    // Publish to intelligence worker: Pattern detection (cross-session)
    publishPatternDetection(services.userId, services.sessionId, {
      message: userText,
      topic: analysisResult.currentTopic || 'general',
      emotion: analysisResult.analysis.emotion.primary,
    });

    // Publish to intelligence worker: Predictive Intelligence
    publishPredictiveIntelligence(services.userId, services.sessionId, {
      message: userText,
      topic: analysisResult.currentTopic || 'general',
      emotion: analysisResult.analysis.emotion.primary,
      emotionIntensity: analysisResult.analysis.emotion.intensity,
      voiceStrain: userData?.voiceEmotion?.confidence,
      dayOfWeek: new Date().getDay(),
      hourOfDay: new Date().getHours(),
      turnCount:
        userData?.conversationState?.getFlowContext?.()?.turnCount || userData?.turnCount || 0,
      sessionCount: services.userProfile?.totalConversations || 1,
      relationshipStage: services.userProfile?.relationshipStage,
    });

    // =========================================================================
    // 🧠 TRUE PREDICTIVE INTELLIGENCE: Feed ML models in real-time
    // This trains Markov chains, time-series forecasters, and signal fusion
    // =========================================================================
    const { userId } = services; // Capture for closure (narrows type)
    // Capture previous state for Markov chain transitions (before updating)
    const previousEmotion = userData?.lastEmotionAnalysis?.primary;
    const previousTopic = userData?.lastTopic;
    safeFireAndForget(
      async () => {
        await processConversationForLearning(userId, {
          text: userText,
          emotion: analysisResult.analysis.emotion.primary,
          topic: analysisResult.currentTopic || 'general',
          mood:
            analysisResult.analysis.emotion.valence === 'positive'
              ? 0.7
              : analysisResult.analysis.emotion.valence === 'negative'
                ? 0.3
                : 0.5,
          energy: userData?.voiceEmotion?.confidence || 0.5,
          timestamp: new Date(),
          // Previous state for Markov chain transitions
          previousEmotion,
          previousTopic,
        });
      },
      { context: 'predictive-ml-learning' }
    );

    // Publish to intelligence worker: Key Moment Detection
    publishKeyMoment(services.userId, services.sessionId, {
      personaId: ctx.persona?.id || 'ferni',
      message: userText,
      topic: analysisResult.currentTopic || 'general',
      emotion: analysisResult.analysis.emotion.primary,
      emotionIntensity: analysisResult.analysis.emotion.intensity,
    });

    // ============================================================================
    // 🧠 REAL-TIME LEARNING: Social graph + data capture + auto-save
    // "Better than Human" - We learn and remember as the conversation unfolds
    // ============================================================================

    // 1. RELATIONSHIP NETWORK: Extract and record names/relationships mentioned
    safeFireAndForget(
      async () => {
        // Extract names from the user's message
        const extractedNames = extractNames(userText);

        for (const { name, context } of extractedNames) {
          // recordMention analyzes sentiment internally from context
          await recordMention(services.userId!, {
            name,
            type: 'acquaintance', // Default - will be refined by extractPerson
            context,
          });
          diag.state('📇 Recorded person mention', { name });
        }
      },
      { context: 'relationship-network-extraction' }
    );

    // 2. DATA CAPTURE ROUTER: Extract contacts, commitments, etc.
    safeFireAndForget(
      async () => {
        const captureResult = await processDataCapture({
          transcript: userText,
          userId: services.userId!,
          sessionId: services.sessionId,
        });

        if (captureResult.captured.length > 0) {
          diag.state('🎯 Data captured in real-time', {
            count: captureResult.captured.length,
            types: captureResult.captured.map((c) => c.entity.type),
          });
        }
      },
      { context: 'data-capture-routing' }
    );

    // 2b. KNOWLEDGE GRAPH CAPTURE: Extract entities, facts, relationships via LLM
    // "Better than Human" - build unified knowledge graph from every conversation
    safeFireAndForget(
      async () => {
        try {
          const { captureTurn, isKnowledgeCaptureReady } = await import(
            '../../memory/knowledge-graph/index.js'
          );

          if (!isKnowledgeCaptureReady()) return;

          const captureResult = await captureTurn({
            userId: services.userId!,
            sessionId: services.sessionId,
            turnNumber: turnCount,
            transcript: userText,
            personaId: ctx.persona?.id,
            emotion: analysisResult?.analysis?.emotion
              ? {
                  primary: analysisResult.analysis.emotion.primary,
                  intensity: analysisResult.analysis.emotion.intensity,
                  valence: analysisResult.analysis.emotion.valence,
                }
              : undefined,
            topic: analysisResult?.analysis?.topics?.primary,
            recentContext: ctx.conversationHistory?.slice(-3).join('\n'),
          });

          if (captureResult.entities.created > 0 || captureResult.entities.updated > 0) {
            diag.state('🧠 Knowledge graph updated', {
              entitiesCreated: captureResult.entities.created,
              entitiesUpdated: captureResult.entities.updated,
              factsCount: captureResult.facts.count,
              relationshipsCount: captureResult.relationships.count,
              timeMs: captureResult.metrics.totalTimeMs,
            });
          }
        } catch (error) {
          diag.debug('Knowledge graph capture failed (non-blocking)', { error: String(error) });
        }
      },
      { context: 'knowledge-graph-capture' }
    );

    // 3. PERIODIC AUTO-SAVE: Persist extracted details and social graph every 3 turns
    // Note: extractedDetails may be in userData from context-builders/personal.ts
    const extractedDetails = (userData as Record<string, unknown>).extractedDetails as
      | Array<{ type: string; value: string }>
      | undefined;
    if (extractedDetails) {
      triggerAutoSave(services.userId, turnCount, extractedDetails);
    } else {
      triggerAutoSave(services.userId, turnCount);
    }

    // ============================================================================
    // 🎯 SPECULATIVE PERSONA PRELOADING: Predict handoff before user requests it
    // "Better than Human" - pre-warm target persona context for instant handoffs
    // ============================================================================
    analyzeAndPreload(userText, {
      sessionId: services.sessionId,
      userId: services.userId || 'anonymous',
      currentPersona: ctx.persona?.id || 'ferni',
      buildInsightsFn: async (personaId: string) => {
        // Return minimal insights structure - full context is built lazily on handoff
        return {
          personaId,
          userId: services.userId || 'anonymous',
          generatedAt: Date.now(),
          personaBriefing: `Pre-warmed context for ${personaId}`,
        };
      },
    });

    // ============================================================================
    // 🤝 TEAM HUDDLE: Record observations for cross-persona coordination
    // "Better than Human" - personas share insights like a real care team
    // ============================================================================
    if (services.userId) {
      safeFireAndForget(
        async () => {
          await recordTeamHuddleObservation(
            services.userId!,
            ctx.persona?.id || 'ferni',
            userText,
            analysisResult,
            userData as unknown as ContextUserData // UserData has compatible shape
          );
        },
        { context: 'team-huddle-observation' }
      );
    }

    // ============================================================================
    // 💡 PROACTIVE SURFACING: Check for memories worth mentioning
    // "Better than Human" - bring up relevant memories at the right moment
    // ============================================================================
    if (services.userId) {
      safeFireAndForget(
        async () => {
          try {
            const { checkProactiveSurfacing, isEntityStoreReady } = await import(
              '../../memory/entity-store/integration.js'
            );

            if (!isEntityStoreReady()) return;

            const opportunities = await checkProactiveSurfacing(
              services.userId!,
              userText,
              {
                sessionId: services.sessionId,
                personaId: ctx.persona?.id || 'ferni',
                turnNumber: turnCount,
                surfacingCountThisSession: ctx.surfacingCount || 0,
                sessionTopics: ctx.sessionTopics || [],
                conversationMood: analysisResult?.mood as 'exploratory' | 'venting' | 'seeking_help' | 'casual' | undefined,
                lastTurnWasQuestion: userText.trim().endsWith('?'),
                detectedEmotion: analysisResult?.analysis?.emotion?.primary,
              }
            );

            if (opportunities.length > 0) {
              diag.state('💡 Proactive surfacing opportunities found', {
                count: opportunities.length,
                types: opportunities.map((o) => o.type),
              });
              // Store in context for response generation
              ctx.proactiveSurfacing = opportunities;
            }
          } catch (error) {
            diag.debug('Proactive surfacing check failed (non-blocking)', { error: String(error) });
          }
        },
        { context: 'proactive-surfacing' }
      );
    }
  }

  // ============================================================================
  // PARALLEL PROCESSING: Run independent async operations concurrently
  // This saves ~30-50ms by not waiting for each operation sequentially
  // ============================================================================

  // 🎯 SEMANTIC ROUTING: Start tool routing in parallel (primary tool calling method)
  // This runs alongside other processing and can bypass LLM entirely for high-confidence tool requests.
  // Falls back to JSON function calling (legacy workaround) for LLM-routed tools.
  let semanticRoutingPromise: Promise<TurnRouterResult> | null = null;
  if (isRoutingEnabled()) {
    // Build conversation history from recent transcripts (if available)
    const conversationHistory = (userData.recentTranscripts || []).map((text) => ({
      role: 'user' as const,
      content: text,
    }));

    // Get recently used tools from conversation state for routing context
    const toolExecData = userData?.conversationState?.getToolExecutionData?.();
    const recentTools = toolExecData?.recentlyUsedTools || [];

    const userId = services.userId || 'unknown';
    const routingContext = {
      userId,
      sessionId: services.sessionId,
      personaId: ctx.persona.id,
      conversationHistory,
      recentTools,
    };

    // 🧠 Use intelligent routing if A/B test assigns user to treatment group
    if (isIntelligentRouterInitialized() && shouldUseIntelligentRouting(userId)) {
      diag.debug('🧠 Using intelligent routing (A/B test)', { userId, mode: 'intelligent' });
      semanticRoutingPromise = startIntelligentRouting(userText, routingContext);
    } else {
      semanticRoutingPromise = startSemanticRouting(userText, routingContext);
    }
  }

  // ============================================================================
  // ⚡ SEMANTIC SHORT-CIRCUIT: Skip context building for high-confidence tools
  // For ultra-high confidence matches (>0.95), we can skip expensive context
  // building entirely. Saves ~100-150ms for obvious tool requests.
  // SAFETY: Never short-circuits during crisis detection (safety first).
  // ============================================================================
  if (semanticRoutingPromise) {
    const shortCircuitResult = await checkSemanticShortCircuit(semanticRoutingPromise, {
      crisisDetected: crisisResult.isCrisis,
      crisisSeverity: crisisResult.severity,
      analysisResult,
      ctx,
    });

    if (shortCircuitResult.shortCircuited && shortCircuitResult.result) {
      diag.debug('⚡ Short-circuit applied', {
        reason: shortCircuitResult.reason,
        checkTimeMs: shortCircuitResult.checkTimeMs,
      });
      return shortCircuitResult.result;
    }

    // Log why we didn't short-circuit (for debugging)
    if (process.env.DEBUG_ROUTING === 'true') {
      diag.debug('⚡ Short-circuit bypassed', { reason: shortCircuitResult.reason });
    }
  }

  // Start independent async operations in parallel
  const easterEggPromise = checkEasterEggs(ctx, turnCtx);

  // Humanization processing (safe fire-and-forget)
  safeFireAndForget(
    async () => {
      const { processUserMessage } =
        await import('../../conversation/humanization/voice-agent-integration.js');
      processUserMessage(services.sessionId, userText, {
        voiceEmotion: userData?.voiceEmotion
          ? {
              primary: userData.voiceEmotion.primary,
              confidence: userData.voiceEmotion.confidence,
            }
          : undefined,
        topic: analysisResult.currentTopic,
      });
    },
    { context: 'humanization-processing' }
  );

  // Creative You topic recording (safe fire-and-forget)
  const userIdForCreativeYou = services.userId;
  if (userIdForCreativeYou && analysisResult.analysis.topics?.detected?.length > 0) {
    safeFireAndForget(
      async () => {
        const { recordConversationTopics } =
          await import('../../services/creative-you/conversation-integration.js');
        recordConversationTopics(
          userIdForCreativeYou,
          analysisResult.analysis.topics.detected,
          services.sessionId
        );
      },
      { context: 'creative-you-topics' }
    );
  }

  // ============================================================================
  // PARALLELIZED CORE ANALYSIS (Phase 1 of 2)
  // These operations only depend on analysisResult, so they run in parallel.
  // This saves ~30-50ms by not running them sequentially.
  // ============================================================================
  trace?.stage('parallel_core_analysis');
  const parallelCoreTimer = createTimer();

  const [emotionalState, identityContext, humanizingResult, bundleRuntimeContext] =
    await Promise.all([
      // 4. Emotional state - depends only on analysisResult
      (async () => {
        const timer = createTimer();
        const result = buildEmotionalState(ctx, analysisResult);
        recordPhaseTiming('emotional_state', timer.stop());
        return result;
      })(),

      // 6. Identity context - independent (only depends on ctx)
      (async () => {
        const timer = createTimer();
        const result = buildIdentityContext(ctx);
        recordPhaseTiming('identity_context', timer.stop());
        return result;
      })(),

      // 7. Humanizing context - depends only on analysisResult
      (async () => {
        const timer = createTimer();
        const result = buildHumanizingContextForTurn(ctx, analysisResult);
        recordPhaseTiming('humanizing_context', timer.stop());
        return result;
      })(),

      // 8. Bundle runtime - depends only on analysisResult
      (async () => {
        const timer = createTimer();
        const result = processBundleRuntime(ctx, analysisResult);
        recordPhaseTiming('bundle_runtime', timer.stop());
        return result;
      })(),
    ]);

  const parallelCoreMs = parallelCoreTimer.stop();
  recordPhaseTiming('parallel_core_analysis', parallelCoreMs);
  if (debugTiming) diag.info(`⏱️ [TIMING] parallel_core_analysis: ${parallelCoreMs}ms`);

  // 4b. Record mismatch as cross-persona insight (fire-and-forget)
  if (emotionalState.mismatch?.hasMismatch && emotionalState.mismatch.confidence > 0.5) {
    const personaId = ctx.persona.id as
      | 'ferni'
      | 'maya-santos'
      | 'peter-john'
      | 'alex-chen'
      | 'jordan-taylor'
      | 'nayan-patel';
    void recordMismatchInsight(
      services.userId || 'anonymous',
      personaId,
      emotionalState.mismatch
    ).catch((err) => {
      diag.debug('Failed to record mismatch insight (non-critical)', { error: String(err) });
    });
  }

  // ============================================================================
  // ⚡ EARLY SPECULATIVE TTS PRE-WARMING
  // Now that we have emotional state, start TTS speculation IMMEDIATELY.
  // This runs in parallel with Phase 2 analysis, saving ~100-200ms on first audio.
  // Previously, TTS speculation only started AFTER turn-handler received the result.
  // ============================================================================
  const personaVoiceId = ctx.persona.id;
  void speculateTTS(services.sessionId, personaVoiceId, {
    emotion: emotionalState.primary,
    intent: analysisResult.analysis.intent?.primary,
    topic: analysisResult.currentTopic,
    distressLevel: emotionalState.distressLevel,
  }).catch((err) => {
    diag.debug('Early speculative TTS failed (non-critical)', { error: String(err) });
  });

  // ============================================================================
  // PARALLELIZED DEPENDENT ANALYSIS (Phase 2 of 2)
  // These depend on emotionalState from Phase 1, so they run after.
  // Running them in parallel saves another ~10-20ms.
  // ============================================================================
  trace?.stage('parallel_dependent_analysis');
  const parallelDependentTimer = createTimer();

  const [conversationDynamics, responseGuidance] = await Promise.all([
    // 4c. Conversation dynamics - depends on analysisResult + emotionalState
    (async () => {
      const timer = createTimer();
      const result = processConversationDynamics(ctx, analysisResult, {
        primary: emotionalState.primary,
        intensity: emotionalState.intensity,
        distressLevel: emotionalState.distressLevel,
      });
      recordPhaseTiming('conversation_dynamics', timer.stop());
      return result;
    })(),

    // 5. Response guidance - depends on analysisResult + emotionalState
    (async () => {
      const timer = createTimer();
      const result = buildResponseGuidance(ctx, analysisResult, emotionalState);
      recordPhaseTiming('response_guidance', timer.stop());
      return result;
    })(),
  ]);

  const parallelDependentMs = parallelDependentTimer.stop();
  recordPhaseTiming('parallel_dependent_analysis', parallelDependentMs);
  if (debugTiming) diag.info(`⏱️ [TIMING] parallel_dependent_analysis: ${parallelDependentMs}ms`);

  // ============================================================================
  // LATENCY OPTIMIZATION: Run identity/2FA check in parallel with context building
  // This saves ~50-100ms by not blocking on identity detection
  // ============================================================================
  const identityPromise = (async () => {
    try {
      const { onUserMessage } =
        await import('../../services/trust-and-identity/voice-agent-integration.js');
      const emotionalIntensity = emotionalState.intensity ?? 0.5;
      const result = await onUserMessage(services.sessionId, userText, emotionalIntensity);

      if (result.contactDetected) {
        diag.user('📱 Contact info detected and saved');
      }
      if (result.shouldAskForPhone) {
        diag.user('✨ Magic moment detected - phone ask pending');
      }
      if (result.verificationResult) {
        diag.user('🔐 Verification code processed', {
          verified: result.verificationResult.verified,
        });
      }
      return result;
    } catch (identityErr) {
      diag.warn('Identity message processing failed (non-fatal)', { error: String(identityErr) });
      return undefined;
    }
  })();

  // ============================================================================
  // PARALLEL CONTEXT BUILDING: Run ALL async operations concurrently
  // This is the CRITICAL LATENCY OPTIMIZATION - saves ~100-200ms by running:
  // - Context injections (heavy)
  // - Advanced humanization (heavy)
  // - Identity/2FA detection (I/O bound)
  // - Easter egg check (light)
  // All in parallel instead of sequentially.
  // ============================================================================

  trace?.stage('context_building');
  const contextBuildSpan = trace?.startSpan('context_injections');
  const contextTimer = createTimer();
  const [contextInjectionsResult, advancedHumanizationResult, identityMessageResult, easterEgg] =
    await Promise.all([
      // 9. Build all context injections (HEAVY - 100-200ms)
      (async () => {
        const injectionsTimer = createTimer();
        const result = await buildContextInjections(
          ctx,
          analysisResult,
          emotionalState,
          responseGuidance,
          identityContext,
          humanizingResult,
          bundleRuntimeContext,
          conversationDynamics
        );
        recordContextInjectionTiming('all_context_injections', injectionsTimer.stop());
        return result;
      })(),

      // 9a. ADVANCED HUMANIZATION: Process through all 10 deep capabilities (HEAVY - 50-100ms)
      (async () => {
        const humanizationTimer = createTimer();
        const result = await processAdvancedHumanization(ctx, analysisResult, emotionalState);
        recordContextInjectionTiming('advanced_humanization', humanizationTimer.stop());
        return result;
      })(),

      // 9b. Identity/2FA detection (I/O bound - 50-100ms)
      identityPromise,

      // 9c. Easter egg check (light - <10ms, but was started earlier)
      easterEggPromise,
    ]);
  contextBuildSpan?.end();
  const contextInjectionsMs = contextTimer.stop();
  recordPhaseTiming('context_injections', contextInjectionsMs);
  if (debugTiming) diag.info(`⏱️ [TIMING] context_injections: ${contextInjectionsMs}ms`);

  // Extract injections and trust context from the result
  const { injections } = contextInjectionsResult;
  const { trustContextSummary } = contextInjectionsResult;

  // Add advanced humanization injections
  if (advancedHumanizationResult) {
    injections.push(...advancedHumanizationResult.injections);
    // Re-sort after adding
    injections.sort((a, b) => b.priority - a.priority);
  }

  // 📋 CONTEXT INSPECTION: Record for debugging API
  // Enable with LOG_CONTEXT_BUILDS=true for verbose logging
  const shouldRecordContext =
    process.env.LOG_CONTEXT_BUILDS === 'true' || process.env.DEBUG_INJECTIONS === 'true';
  if (shouldRecordContext) {
    // Always record, but only log if enabled
    try {
      const inspectionData = createInspectionData({
        sessionId: services.sessionId,
        userId: services.userId,
        personaId: ctx.persona?.id,
        turnNumber: userData?.turnCount || 0,
        injections,
        builderResults: [], // Would need to track from buildConversationContext
        buildDurationMs: contextInjectionsMs,
        userProfile: services.userProfile
          ? {
              exists: true,
              name: services.userProfile.name,
              humanMemory: services.userProfile.humanMemory,
              totalConversations: services.userProfile.totalConversations,
            }
          : null,
      });
      recordContextBuild(inspectionData);
    } catch (inspectionError) {
      // Non-fatal - don't break turn processing for debugging
      diag.warn('Context inspection recording failed', { error: String(inspectionError) });
    }
  }

  // 9b. Add identity-related context injections (verification results, contact detection)
  if (identityMessageResult) {
    // If verification code was detected and processed
    if (identityMessageResult.verificationResult) {
      injections.push({
        category: 'identity_verification',
        content: identityMessageResult.verificationResult.verified
          ? `[VERIFICATION SUCCESS] User verified their phone! Thank them warmly: "${identityMessageResult.verificationResult.message}"`
          : `[VERIFICATION NEEDED] ${identityMessageResult.verificationResult.message}`,
        priority: 100, // High priority
      });
    }

    // If contact info was detected in their message
    if (identityMessageResult.contactDetected) {
      injections.push({
        category: 'contact_detected',
        content: `[CONTACT SAVED] User provided their contact info! Thank them warmly and naturally - you can now follow up with them between sessions.`,
        priority: 50, // Medium priority
      });
    }

    // Note: Phone ask injection happens in voice-agent.ts via getResponseModification()
    // because it needs to be injected AFTER turn processing, right before the response
  }

  // 10. Update userData for handoff system
  const { currentTopic, analysis } = analysisResult;
  if (userData) {
    userData.lastTopic = currentTopic;
    userData.lastUserMessage = userText;
    userData.lastEmotionAnalysis = {
      primary: analysis.emotion.primary,
      intensity: analysis.emotion.intensity || 0.5,
      distressLevel: analysis.emotion.distressLevel,
    };

    updateUserContextForHandoff({
      lastUserMessage: userText,
      emotionAnalysis: userData.lastEmotionAnalysis,
    });
  }

  // 11. Track response quality with story/question metadata
  if (userData.lastAgentResponse) {
    // Check if a story was told in the previous response
    const turnCount = userData.turnCount || 1;
    const wasStoryTold = userData.lastStoryTurn === turnCount - 1;
    const lastStoryId =
      wasStoryTold && userData.storiesShared?.length
        ? userData.storiesShared[userData.storiesShared.length - 1]
        : undefined;

    // Extract any question asked in the previous response
    // Match sentences ending with ? that are meaningful questions
    const questionMatch = userData.lastAgentResponse.match(/(?:^|[.!]\s*)([A-Z][^?]*\?)/g);
    // Use the last question as most questions come at the end
    const questionAsked = questionMatch?.length
      ? questionMatch[questionMatch.length - 1].trim()
      : undefined;

    services.recordResponseSignal({
      agentResponse: userData.lastAgentResponse,
      userResponse: userText,
      topic: currentTopic || 'general',
      conversationPhase: String(services.getPromptContext().phase || 'building'),
      emotion: {
        primary: analysis.emotion.primary,
        intensity: analysis.emotion.intensity || 0.5,
      },
      storyId: lastStoryId,
      questionAsked,
    });
  }

  // 12. Persist humanizing state
  if (humanizingResult) {
    services.updateHumanizingState({
      sessionId: services.sessionId,
      newShareTags: humanizingResult.usedTags,
      spontaneousShareCount: humanizingResult.spontaneousShare ? 1 : 0,
      currentMood: humanizingResult.mood.state,
      storiesTold:
        humanizingResult.spontaneousShare?.type === 'micro_story'
          ? humanizingResult.spontaneousShare.tags
          : undefined,
      hotTakesShared:
        humanizingResult.spontaneousShare?.type === 'hot_take'
          ? humanizingResult.spontaneousShare.tags
          : undefined,
      innerWorldRevealed: humanizingResult.innerWorldContent?.map((c) => ({
        type: c.type,
        content: c.content,
      })),
      relationshipTransition: humanizingResult.relationshipTransition
        ? {
            from: userData.previousRelationshipStage || 'stranger',
            to: humanizingResult.relationship.stage,
            acknowledged: true,
          }
        : undefined,
    });
  }

  // 13. INTELLIGENT OUTREACH: Extract commitments, emotions, life events
  // This feeds the "Better Than Human" proactive outreach system
  // Publishes to intelligence worker for async processing
  const { userId } = services;
  if (userId && userText.length > 10) {
    publishOutreachExtraction(userId, services.sessionId, {
      message: userText,
    });
  }

  // 14. CROSS-SESSION REFLECTION: Detect moments worth reflecting on later
  // "Better Than Human" - We remember significant moments and reflect on them next session
  if (services.userProfile && (analysis.emotion.intensity || 0.5) > 0.6) {
    const reflectionMoment = detectReflectionMoment(
      userText,
      currentTopic || 'general',
      analysis.emotion.primary,
      analysis.emotion.intensity || 0.5,
      services.sessionId,
      ctx.persona.id
    );

    if (reflectionMoment) {
      saveReflectionMoment(services.userProfile, reflectionMoment);
      diag.debug('Reflection moment captured', {
        type: reflectionMoment.type,
        topic: reflectionMoment.topic,
        weight: reflectionMoment.emotionalWeight,
      });
    }
  }

  // 15. PERIODIC AUTO-SAVE: Save profile every 3 turns to prevent data loss
  // This ensures name and other critical data survives abrupt disconnects
  const currentTurnCount = userData.turnCount || 0;
  const AUTO_SAVE_INTERVAL = 3; // Save every 3 turns
  if (
    services.saveProfile &&
    services.userProfile &&
    currentTurnCount > 0 &&
    currentTurnCount % AUTO_SAVE_INTERVAL === 0
  ) {
    // Safe fire-and-forget profile save
    safeFireAndForget(async () => services.saveProfile!(), {
      context: 'periodic-auto-save',
      critical: true,
    });
    diag.debug('Periodic auto-save triggered', { turnCount: currentTurnCount });
  }

  // Calculate elapsed time
  const elapsedMs = Date.now() - startTime;

  // Record metrics for observability
  recordTurnTiming(elapsedMs);

  // Log completion
  logger.info(
    {
      emotion: analysis.emotion.primary,
      distress: analysis.emotion.distressLevel.toFixed(2),
      intent: analysis.intent.primary,
      topics: analysis.topics.detected.slice(0, 3),
      phase: analysis.state.phase,
      contextCount: injections.length,
      emotionalTrajectory: emotionalState.trajectory,
      elapsedMs,
    },
    'Turn processing complete'
  );

  if (elapsedMs > 1000) {
    logger.warn({ elapsedMs }, 'Turn processing took longer than expected');
  }

  // Build value capture result if detected
  const lastValueEvent = (userData as Record<string, unknown>).lastValueEvent as
    | { type: string; eventId: string }
    | undefined;
  const shouldPromptValue = (userData as Record<string, unknown>).shouldPromptValueCapture;

  const valueCapture = lastValueEvent
    ? {
        type: lastValueEvent.type,
        eventId: lastValueEvent.eventId,
        shouldPrompt: !!shouldPromptValue,
      }
    : undefined;

  // Build advanced humanization result for return
  const advancedHumanization = advancedHumanizationResult
    ? {
        responsePrefix: advancedHumanizationResult.responsePrefix,
        responseSuffix: advancedHumanizationResult.responseSuffix,
        stopDirectAdvice: advancedHumanizationResult.stopDirectAdvice,
        toneGuidance: advancedHumanizationResult.toneGuidance,
        lengthGuidance: advancedHumanizationResult.lengthGuidance,
      }
    : undefined;

  // SMART FILTERING: Only include injections relevant to this conversation mode
  // A human doesn't think about ALL possible response strategies every time.
  // They focus on what matters in the moment.
  // Crisis detection happens in safety injections, so we check if any crisis injection was added
  const crisisDetected = injections.some(
    (inj) => inj.category === 'safety' || inj.category === 'crisis_response'
  );
  const conversationMode = detectConversationMode(
    ctx.userText,
    emotionalState.intensity,
    crisisDetected
  );

  // ============================================================================
  // INJECTION DEDUPLICATION: Remove semantically similar injections
  // Multiple builders often inject similar guidance (e.g., "be empathetic").
  // Deduplication runs BEFORE filtering to avoid wasting slots on duplicates.
  // ============================================================================
  const deduplicatedInjections = deduplicateInjections(injections);
  if (deduplicatedInjections.length < injections.length) {
    diag.debug('⚡ Injection deduplication', {
      before: injections.length,
      after: deduplicatedInjections.length,
      removed: injections.length - deduplicatedInjections.length,
    });
  }

  const filteredInjections = filterInjections(deduplicatedInjections, {
    mode: conversationMode,
    userText: ctx.userText,
    emotionalIntensity: emotionalState.intensity,
    crisisDetected,
  });

  // ============================================================================
  // 🎯 SEMANTIC ROUTING: Await tool routing result and apply if applicable
  // ============================================================================
  trace?.stage('semantic_routing');
  let semanticRouting: SemanticRoutingResult | undefined;
  if (semanticRoutingPromise) {
    const routingSpan = trace?.startSpan('semantic_routing');
    const routingTimer = createTimer();
    const routingResult = await semanticRoutingPromise;
    const routingLatencyMs = routingTimer.stop();

    semanticRouting = applyRoutingResult(routingResult, {
      crisisDetected: crisisResult.isCrisis,
      latencyMs: routingLatencyMs,
    });

    if (semanticRouting.bypassLLM && semanticRouting.toolResult) {
      diag.state('🎯 Semantic routing: BYPASSING LLM', {
        tool: semanticRouting.toolResult.toolId,
        confidence: semanticRouting.metrics.confidence,
        latencyMs: semanticRouting.metrics.latencyMs,
      });
    } else if (semanticRouting.routed && routingResult.routeResult?.matches?.length) {
      // Medium confidence: Add hint to LLM context (helps guide the response)
      const topMatch = routingResult.routeResult.matches[0];
      const { confidence } = semanticRouting.metrics;

      diag.state('🎯 Semantic routing: Tool hint added to context', {
        toolId: topMatch.toolId,
        confidence,
        matchPath: semanticRouting.metrics.matchPath,
      });

      // Add tool hint injection to guide LLM
      filteredInjections.push({
        category: 'tool_hint',
        content: `[TOOL HINT - DO NOT MENTION THIS DIRECTLY]
The user may be requesting: ${topMatch.toolId}
Confidence: ${(confidence * 100).toFixed(0)}%

If the user is indeed asking for this action, use the JSON function call format:
{"fn":"${topMatch.toolId}","args":{...}}

If they're just conversing, respond naturally without the tool call.`,
        priority: 80,
      });
    }
    routingSpan?.end();
  }

  // ============================================================================
  // 📊 RESONANCE CHECK: Check if we should trigger voice-native feedback
  // This asks the user "Does that track?" after superhuman insights
  // ============================================================================
  let resonanceCheck: ResonanceCheckResult = { shouldCheck: false };
  // Note: turnCount is defined earlier in the function (after state update)

  // Only check for resonance after at least 2 turns (let conversation warm up)
  if (turnCount >= 2 && services.sessionId) {
    const nextCheck = getNextResonanceCheck(
      services.sessionId,
      turnCount,
      ctx.persona?.id || 'ferni'
    );

    if (nextCheck.shouldCheck && nextCheck.instructions) {
      resonanceCheck = {
        shouldCheck: true,
        instructions: nextCheck.instructions,
        capability: nextCheck.capability,
      };

      // Add resonance check injection to guide LLM to include backchannel
      filteredInjections.push({
        category: 'resonance_check',
        content: nextCheck.instructions,
        priority: 70, // Medium-high - important but not critical
      });

      diag.info('📊 Resonance check triggered', {
        capability: nextCheck.capability,
        turnCount,
      });
    }
  }

  // ============================================================================
  // 📊 DEV TELEMETRY: Complete the trace with final metrics
  // ============================================================================
  trace?.complete();

  // Log total turn processing time (before return)
  if (debugTiming) {
    const totalMs = Date.now() - turnStartMs;
    diag.info(
      `⏱️ [TIMING] TOTAL processTurn: ${totalMs}ms (analysis: ${analysisMs}ms, parallel_core: ${parallelCoreMs}ms, parallel_dependent: ${parallelDependentMs}ms, context: ${contextInjectionsMs}ms)`
    );
  }

  return {
    analysis: analysisResult,
    context: {
      injections: filteredInjections,
      humanizingResult: humanizingResult || undefined,
      elapsedMs,
    },
    emotional: emotionalState,
    response: responseGuidance,
    identity: identityContext,
    bundleRuntime: bundleRuntimeContext,
    easterEgg,
    valueCapture,
    advancedHumanization,
    // 🚨 SAFETY: Crisis detection result - MUST be checked by caller
    crisis: {
      isCrisis: crisisResult.isCrisis,
      severity: crisisResult.severity,
      indicators: crisisResult.indicators,
      suggestedResponse: crisisResult.suggestedResponse,
      shouldOverrideLLM: preResponseGuard.shouldBlock,
    },
    // 🤝 TRUST: Trust context summary for post-response monitoring
    trustContext: trustContextSummary,
    // 🎯 SEMANTIC ROUTING: Pre-LLM tool routing result
    semanticRouting,
    // 📊 RESONANCE CHECK: Voice-native feedback for BTH effectiveness
    resonanceCheck,
  };
}

/**
 * Inject turn processing results into the LLM context
 *
 * Call this after processTurn() to add all context injections to the chat.
 */
export function injectTurnContext(turnCtx: llm.ChatContext, result: TurnProcessorResult): void {
  const { injections } = result.context;

  if (injections.length === 0) return;

  // DEBUG: Log all injections being added
  const debugInjections = process.env.DEBUG_INJECTIONS === 'true';
  if (debugInjections) {
    const totalChars = injections.reduce((sum, inj) => sum + inj.content.length, 0);
    const categories = injections.map((inj) => `${inj.category}(${inj.content.length})`).join(', ');
    process.stderr.write(`\n${'='.repeat(80)}\n`);
    process.stderr.write(
      `[INJECTION DEBUG] ${injections.length} injections, ${totalChars} chars total\n`
    );
    process.stderr.write(`[INJECTION DEBUG] Categories: ${categories}\n`);
    process.stderr.write(`${'='.repeat(80)}\n`);

    // Log each injection content (truncated)
    for (const inj of injections) {
      const preview = inj.content.slice(0, 200).replace(/\n/g, ' ');
      process.stderr.write(`[${inj.category}] (priority ${inj.priority}): ${preview}...\n`);
    }
    process.stderr.write(`${'='.repeat(80)}\n\n`);
  }

  // Combine all injection content
  const combinedContent = injections.map((inj) => inj.content).join('\n\n');

  turnCtx.addMessage({
    role: 'user',
    content: combinedContent,
  });
}

/**
 * Get celebration events from context injections
 * (For sending visual feedback to frontend)
 */
export function getCelebrationEvents(
  result: TurnProcessorResult
): Array<{ category: string; content: string }> {
  const celebrationCategories = ['milestone', 'achievement', 'aha_moment', 'good_news'];

  return result.context.injections
    .filter((inj) => celebrationCategories.includes(inj.category))
    .map((inj) => ({ category: inj.category, content: inj.content }));
}

// ============================================================================
// TEAM HUDDLE OBSERVATION RECORDING
// ============================================================================

/**
 * Maps persona ID to domain for Team Huddle observations.
 */
const PERSONA_DOMAINS: Record<string, string> = {
  ferni: 'life_coaching',
  'peter-john': 'research',
  peter: 'research',
  maya: 'habits',
  jordan: 'milestones',
  alex: 'communication',
  nayan: 'wisdom',
};

/**
 * Record Team Huddle observations from conversation turns.
 *
 * This enables cross-persona coordination - what Maya notices about habits
 * can inform Peter's research suggestions or Jordan's milestone planning.
 *
 * Uses persona-specific observation patterns for intelligent detection.
 */
async function recordTeamHuddleObservation(
  userId: string,
  personaId: string,
  userText: string,
  analysisResult: TurnAnalysisResult,
  userData: ContextUserData
): Promise<void> {
  try {
    const canonicalPersonaId = personaId.replace('-john', '') as PersonaId;
    const emotionIntensity = analysisResult.analysis.emotion.intensity || 0;

    // =========================================================================
    // 1. USE PERSONA-SPECIFIC PATTERNS FOR INTELLIGENT OBSERVATION
    // =========================================================================
    const patternMatches = analyzeTextForPersona(canonicalPersonaId, userText, emotionIntensity);

    // Record top 2 pattern matches (avoid noise)
    for (const match of patternMatches.slice(0, 2)) {
      // Only record if confidence is high enough
      if (match.adjustedConfidence < 0.5) continue;

      recordTeamObservation(userId, {
        personaId: canonicalPersonaId,
        observationType: match.pattern.observationType,
        content: match.pattern.contentTemplate,
        confidence: match.adjustedConfidence,
        domain: match.pattern.domain,
        relatedTopics: [
          ...match.matchedKeywords,
          ...(analysisResult.analysis.topics?.detected || []),
        ],
        suggestedAction: match.pattern.suggestedActionTemplate,
      });

      diag.debug('🤝 Team Huddle observation (pattern)', {
        personaId: canonicalPersonaId,
        observationType: match.pattern.observationType,
        domain: match.pattern.domain,
        confidence: match.adjustedConfidence,
        matchedKeywords: match.matchedKeywords,
      });
    }

    // =========================================================================
    // 2. RECORD EMOTION-BASED OBSERVATIONS FOR HIGH-INTENSITY MOMENTS
    // =========================================================================
    const isHighIntensity = emotionIntensity > 0.6;
    const isNegativeEmotion = analysisResult.analysis.emotion.valence === 'negative';
    const isPositiveEmotion = analysisResult.analysis.emotion.valence === 'positive';

    if (isHighIntensity && patternMatches.length === 0) {
      // High emotion but no pattern match - record generic observation
      const domain = PERSONA_DOMAINS[personaId] || 'general';
      const observationType = isNegativeEmotion
        ? 'concern'
        : isPositiveEmotion
          ? 'opportunity'
          : 'insight';
      const content = isNegativeEmotion
        ? buildConcernObservation(domain, analysisResult, userText)
        : buildOpportunityObservation(domain, analysisResult, userText);

      if (content) {
        recordTeamObservation(userId, {
          personaId: canonicalPersonaId,
          observationType,
          content,
          confidence: Math.min(0.9, emotionIntensity + 0.2),
          domain,
          relatedTopics: analysisResult.analysis.topics?.detected || [],
          suggestedAction: isNegativeEmotion
            ? `Consider checking in about ${analysisResult.currentTopic || 'this'} soon`
            : undefined,
        });

        diag.debug('🤝 Team Huddle observation (emotion)', {
          personaId: canonicalPersonaId,
          observationType,
          domain,
          emotionIntensity,
        });
      }
    }

    // =========================================================================
    // 3. DETECT HANDOFF CUES FOR TEAM COORDINATION
    // =========================================================================
    const handoffCues = detectHandoffCues(canonicalPersonaId, userText);
    if (handoffCues.length > 0) {
      // Record as insight for Ferni's coordination
      for (const cue of handoffCues.slice(0, 1)) {
        // Top 1 cue only
        recordTeamObservation(userId, {
          personaId: canonicalPersonaId,
          observationType: 'insight',
          content: `Handoff opportunity detected: ${cue.reason}`,
          confidence: 0.7,
          domain: 'handoff_coordination',
          relatedTopics: cue.matchedKeywords,
          suggestedAction: `Consider involving ${cue.targetPersona}`,
        });

        diag.debug('🤝 Team Huddle observation (handoff cue)', {
          fromPersona: canonicalPersonaId,
          toPersona: cue.targetPersona,
          reason: cue.reason,
        });
      }
    }
  } catch (err) {
    // Non-blocking - don't fail the turn
    diag.debug('Team Huddle observation failed', { error: String(err) });
  }
}

/**
 * Detect patterns relevant to each domain.
 */
function detectDomainRelevantPattern(text: string, domain: string): boolean {
  const lowerText = text.toLowerCase();

  const domainPatterns: Record<string, string[]> = {
    habits: ['sleep', 'exercise', 'routine', 'habit', 'morning', 'night', 'tired', 'energy'],
    research: ['stress', 'work', 'career', 'money', 'finance', 'market', 'research', 'learn'],
    milestones: [
      'goal',
      'achieve',
      'celebrate',
      'birthday',
      'anniversary',
      'milestone',
      'deadline',
    ],
    communication: ['meeting', 'calendar', 'schedule', 'email', 'call', 'busy', 'overwhelm'],
    wisdom: ['meaning', 'purpose', 'values', 'life', 'important', 'legacy', 'death', 'reflect'],
    life_coaching: ['change', 'stuck', 'help', 'support', 'growth', 'better', 'improve'],
  };

  const patterns = domainPatterns[domain] || [];
  return patterns.some((p) => lowerText.includes(p));
}

/**
 * Build concern observation content.
 */
function buildConcernObservation(
  domain: string,
  analysisResult: TurnAnalysisResult,
  userText: string
): string {
  const emotion = analysisResult.analysis.emotion.primary;
  const topic = analysisResult.currentTopic || 'something';

  // Domain-specific framing
  switch (domain) {
    case 'habits':
      return `User expressed ${emotion} about ${topic}. May need habit/routine support.`;
    case 'research':
      return `User showed ${emotion} regarding ${topic}. Potential stress/information need.`;
    case 'milestones':
      return `User feeling ${emotion} about ${topic}. Goal progress may need attention.`;
    case 'communication':
      return `User ${emotion} about ${topic}. Calendar/boundary support may help.`;
    case 'wisdom':
      return `User exploring ${emotion} feelings about ${topic}. Deeper reflection opportunity.`;
    default:
      return `User expressed ${emotion} about ${topic}.`;
  }
}

/**
 * Build opportunity observation content.
 */
function buildOpportunityObservation(
  domain: string,
  analysisResult: TurnAnalysisResult,
  userText: string
): string {
  const emotion = analysisResult.analysis.emotion.primary;
  const topic = analysisResult.currentTopic || 'their progress';

  switch (domain) {
    case 'habits':
      return `User ${emotion} about ${topic}. Good moment to reinforce positive habits.`;
    case 'research':
      return `User excited about ${topic}. Opportunity to deepen learning.`;
    case 'milestones':
      return `User ${emotion} about ${topic}. Potential celebration moment!`;
    case 'communication':
      return `User positive about ${topic}. Good time to optimize schedule.`;
    case 'wisdom':
      return `User in reflective mood about ${topic}. Wisdom-building opportunity.`;
    default:
      return `User ${emotion} about ${topic}. Positive momentum to leverage.`;
  }
}

/**
 * Build pattern observation content.
 */
function buildPatternObservation(
  domain: string,
  analysisResult: TurnAnalysisResult,
  userText: string
): string {
  const topic = analysisResult.currentTopic || 'patterns';
  return `Repeated mentions related to ${domain}: ${topic}. Worth monitoring.`;
}
