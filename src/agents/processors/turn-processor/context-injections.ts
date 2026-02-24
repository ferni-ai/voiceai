/**
 * Turn Processor - Context Injection Building
 *
 * Builds all context injections for the LLM, organized in tiers:
 * - Tier 1 (CRITICAL): Always run, block LLM start
 * - Tier 2 (IMPORTANT): Run with timeout, graceful degradation
 * - Tier 3 (OPTIONAL): Run with aggressive timeout, nice-to-have
 */

import type { ContextUserData } from '../../../intelligence/context-builders/index.js';
import type {
  BundleRuntimeContext,
  ContextInjection,
  EmotionalState,
  IdentityContext,
  ResponseGuidance,
  TrustContextSummary,
  TurnAnalysisResult,
  TurnContext,
} from '../types.js';
import type { ContextInjectionsResult } from './types.js';

import { diag } from '../../../services/diagnostic-logger.js';
import {
  getPredictiveIntelligenceContext,
} from '../../../intelligence/predictive/index.js';
import { getBehavioralContextBuilder, getTaskManagerCached } from '../cached-modules.js';

import {
  buildAmbientAwarenessInjections,
  buildAmbientModeInjections,
  buildBoundaryCheckInjections,
  buildConversationDynamicsInjections,
  buildCrisisHistoryInjection,
  buildCrossPersonaInsightsInjection,
  buildDeepHumanInjections,
  buildFunctionCallingReinforcement,
  buildHealthAwarenessInjections,
  buildHumanLevelInjections,
  buildHumanTransferInjections,
  buildLifeCoachingInjections,
  buildPersonaSpecificContextInjections,
  buildSafetyInjections,
  buildScientificCoachingInjections,
  buildSemanticIntelligenceInjection,
  buildServiceAvailabilityInjection,
  buildSessionDynamicsInjection,
  buildToolHistoryInjection,
  buildTrustSystemsInjections,
  buildUserHealthInjection,
  buildVisualMemoryInjections,
  type ConversationDynamicsResult as InjectionDynamicsResult,
  type SemanticIntelligenceInjectionResult,
} from '../injection-builders/index.js';

import { buildLiveSuperhumanInjections } from '../live-superhuman-injections.js';

import {
  getMemoryInjection,
} from '../../../intelligence/memory-intelligence/turn-processor-integration.js';

import type { SuperhumanCapability } from '../../../conversation/superhuman/analytics.js';
import {
  queueResonanceCheck,
} from '../../integrations/better-than-human-integration.js';

import { getHonestyInjection } from '../../../intelligence/context-builders/safety/honesty-guardrail.js';

import { filterBuildersByTopic, skipBuilder, type BuilderName } from '../topic-builder-filter.js';

import {
  formatHumanizingForPrompt,
  type HumanizingResult,
} from '../../../intelligence/context-builders/humanization/humanizing.js';

import {
  buildConversationHumanizingContext,
  formatConversationHumanizingForPrompt,
} from '../../../intelligence/context-builders/humanization/conversation-humanizing.js';

import { getResponseEnhancements } from '../../../speech/response-naturalness.js';

import { valueCapture } from '../../../services/monetization/value-capture.js';

import { getBetterThanHuman } from '../../../conversation/superhuman/index.js';

import {
  buildReferralConversationContext,
  buildReferralPromptInjection,
} from '../../../intelligence/context-builders/engagement/referral-prompt.js';

import type { ConversationDynamicsResult } from '../conversation-dynamics.js';

/**
 * Build all context injections for the LLM
 */
export async function buildContextInjections(
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
    voiceEmotion: userData.voiceEmotion
      ? {
          emotion: userData.voiceEmotion.primary || 'neutral',
          confidence: userData.voiceEmotion.confidence || 0.5,
          speechRate: userData.voiceEmotion.prosody?.speechRate,
        }
      : undefined,
  };

  // 2a. SAFETY FIRST: Crisis Detection
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

  // 2b. HONESTY GUARDRAIL
  const sessionId = services.sessionId || 'unknown';
  const honestyInjection = getHonestyInjection(sessionId, userText);
  if (honestyInjection) {
    injections.push({
      category: 'honesty',
      content: honestyInjection,
      priority: 99,
    });
  }

  // 2b-2. FUNCTION CALLING REINFORCEMENT
  const currentTurnCount = userData.turnCount || 1;
  const functionCallingReinforcement = buildFunctionCallingReinforcement(
    userText,
    currentTurnCount
  );
  if (functionCallingReinforcement) {
    injections.push(functionCallingReinforcement);
    diag.debug('🔧 Function calling reinforcement added', {
      turnCount: currentTurnCount,
      userTextPreview: userText.slice(0, 50),
    });
  }

  // 2c–2g. PREDICTIVE + FIRST-TURN CONTEXT (all run in PARALLEL)
  // Previously these ran sequentially, adding 300-600ms on first turn.
  const FIRST_TURN_TIMEOUT_MS = 150;
  const isFirstTurn = (userData.turnCount || 0) === 0;
  const userId = services.userId;

  const firstTurnResults = await Promise.allSettled([
    // 2c. PREDICTIVE INTELLIGENCE (every turn)
    userId
      ? getPredictiveIntelligenceContext(userId, {
          currentEmotion: analysis.emotion.primary,
          currentTopic,
        }).catch(() => null)
      : Promise.resolve(null),

    // 2d. TEAM HUDDLE (first turn only)
    userId && isFirstTurn
      ? Promise.race([
          import('../../../services/cross-persona/team-huddle.js').then(async ({ generateTeamHuddle, formatTeamHuddleForLLM }) => {
            const huddle = await generateTeamHuddle(userId);
            if (huddle.observations.length > 0) {
              return { category: 'team_huddle' as const, content: formatTeamHuddleForLLM(huddle), priority: 78 };
            }
            return null;
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), FIRST_TURN_TIMEOUT_MS)),
        ]).catch(() => null)
      : Promise.resolve(null),

    // 2e. OUTREACH BRIDGE (first turn only)
    userId && isFirstTurn
      ? Promise.race([
          import('../../../services/outreach/conversation-context-bridge.js').then(async ({ buildOutreachBridgeInjection }) => {
            const bridgeInjection = await buildOutreachBridgeInjection(userId);
            if (bridgeInjection) {
              return { category: 'outreach_bridge' as const, content: bridgeInjection.content, priority: bridgeInjection.priority };
            }
            return null;
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), FIRST_TURN_TIMEOUT_MS)),
        ]).catch(() => null)
      : Promise.resolve(null),

    // 2f. CROSS-CHANNEL CONTEXT (first turn only)
    userId && isFirstTurn
      ? Promise.race([
          import('../../../services/session-context/session-summary.js').then(async ({ getActiveUserContext, formatContextForVoiceCall }) => {
            const activeContext = await getActiveUserContext(userId);
            if (activeContext) {
              const crossChannelContext = formatContextForVoiceCall(activeContext);
              if (crossChannelContext && crossChannelContext.length > 50) {
                return { category: 'cross_channel' as const, content: crossChannelContext, priority: 75 };
              }
            }
            return null;
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), FIRST_TURN_TIMEOUT_MS)),
        ]).catch(() => null)
      : Promise.resolve(null),

    // 2g. WHILE YOU WERE AWAY (first turn only)
    userId && isFirstTurn
      ? Promise.race([
          import('../../../intelligence/context-builders/external/pending-call-results.js').then(async ({ buildAllPendingResultsContext }) => {
            const pendingResultsContext = await buildAllPendingResultsContext(userId);
            if (pendingResultsContext) {
              return { category: 'pending_background_results' as const, content: pendingResultsContext, priority: 90 };
            }
            return null;
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), FIRST_TURN_TIMEOUT_MS)),
        ]).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Process parallel results
  const [predictiveResult, ...firstTurnOnlyResults] = firstTurnResults;

  if (predictiveResult.status === 'fulfilled' && predictiveResult.value) {
    injections.push({
      category: 'predictive',
      content: predictiveResult.value,
      priority: 80,
    });
  }

  for (const result of firstTurnOnlyResults) {
    if (result.status === 'fulfilled' && result.value) {
      injections.push(result.value as ContextInjection);
    }
  }

  if (isFirstTurn) {
    const settled = firstTurnOnlyResults.filter((r) => r.status === 'fulfilled' && r.value).length;
    const timedOut = firstTurnOnlyResults.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)).length;
    diag.debug('First-turn parallel context complete', { settled, timedOut });
  }

  // ============================================================================
  // TIERED CONTEXT BUILDERS (LATENCY OPTIMIZED)
  // ============================================================================
  const builderInput = {
    userText,
    services,
    userData,
    persona,
    analysis,
    currentTopic,
    emotionalState,
    sessionId: services.sessionId,
  };

  // TOPIC-BASED BUILDER FILTERING
  const topicCategory = analysis.topics?.category;
  const builderFilter = filterBuildersByTopic(topicCategory, userText, userData.turnCount || 0);

  if (builderFilter.skip.size > 0) {
    diag.debug('⚡ Topic-based builder filtering', {
      topic: topicCategory || 'general',
      skipping: Array.from(builderFilter.skip).join(', '),
      estimatedSavingsMs: builderFilter.estimatedSavingsMs,
    });
  }

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
  // TIER 1: CRITICAL BUILDERS (with safety timeout)
  // ============================================================================
  const TIER1_TIMEOUT_MS = 120;
  const behavioralFallback: Awaited<ReturnType<typeof buildIntegratedContext>> = {
    behavioralDirective: '',
    awarenessFacts: '',
    toolGuidance: '',
    compactDirective: '',
    highEmotionMode: false,
    metrics: { mode: 'behavioral', behavioralBuildersRun: 0, totalDurationMs: 0 },
  };

  const [behavioralResult, humanTransferInjection, crisisHistoryInjection, toolHistoryInjection] =
    await Promise.all([
      withTimeout(
        buildIntegratedContext(contextInput),
        TIER1_TIMEOUT_MS,
        behavioralFallback,
        'buildIntegratedContext'
      ),
      buildHumanTransferInjections(userText, services.userId),
      buildCrisisHistoryInjection(services.userId || 'unknown'),
      buildToolHistoryInjection(builderInput),
    ]);

  // ============================================================================
  // TIER 2 + TIER 3: Run in PARALLEL
  // ============================================================================
  const IMPORTANT_TIMEOUT_MS = 50;
  const OPTIONAL_TIMEOUT_MS = 40;

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

  const [tier2Results, tier3Results] = await Promise.all([
    // TIER 2: IMPORTANT BUILDERS
    Promise.all([
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
      withTimeout(
        buildTrustSystemsInjections(builderInput),
        IMPORTANT_TIMEOUT_MS,
        trustFallback,
        'trust-systems'
      ),
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
      withTimeout(
        buildSemanticIntelligenceInjection({
          userId: services.userId || 'unknown',
          sessionId: services.sessionId || 'unknown',
          personaId: persona.id,
          userText,
          recentTools: userData?.conversationState?.getToolExecutionData?.()?.recentlyUsedTools,
          recentTopics: currentTopic ? [currentTopic] : undefined,
        }),
        IMPORTANT_TIMEOUT_MS,
        semanticIntelligenceFallback,
        'semantic-intelligence'
      ),
      withTimeout(
        buildPersonaSpecificContextInjections({
          services,
          userData,
          persona,
          userText,
          analysis,
          turnCount: userData.turnCount || 0,
          isHandoff: Boolean(userData.isHandoff),
        }),
        IMPORTANT_TIMEOUT_MS,
        [] as ContextInjection[],
        'persona-context'
      ),
      withTimeout(
        buildServiceAvailabilityInjection(builderInput),
        IMPORTANT_TIMEOUT_MS,
        null,
        'service-availability'
      ),
    ]),
    // TIER 3: OPTIONAL BUILDERS
    Promise.all([
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
    ]),
  ]);

  // Destructure TIER 2 results
  const [
    scientificResult,
    coachingInjections,
    trustSystemsResult,
    boundaryInjections,
    liveSuperhumanResult,
    semanticIntelligenceResult,
    personaSpecificInjections,
    serviceAvailabilityInjection,
  ] = tier2Results;

  // Destructure TIER 3 results
  const [healthInjections, userHealthInjection, visualMemoryInjection, ambientModeInjection] =
    tier3Results;

  // Extract trust injections and summary
  const trustInjections = trustSystemsResult.injections;
  const trustContextSummary = trustSystemsResult.summary;

  // Process behavioral context result
  if (behavioralResult.awarenessFacts) {
    injections.push({
      category: 'awareness',
      content: behavioralResult.awarenessFacts,
      priority: 90,
    });
  }

  if (behavioralResult.behavioralDirective) {
    injections.push({
      category: 'behavioral',
      content: behavioralResult.behavioralDirective,
      priority: 85,
    });
  }

  if (behavioralResult.toolGuidance) {
    injections.push({
      category: 'tools',
      content: behavioralResult.toolGuidance,
      priority: 75,
    });
  }

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

  if (scientificResult.endpointingRecommendation) {
    (userData as Record<string, unknown>).adaptiveEndpointing =
      scientificResult.endpointingRecommendation;
    diag.debug('Adaptive endpointing updated', scientificResult.endpointingRecommendation);
  }

  // Process remaining injection results
  injections.push(...coachingInjections);
  injections.push(...trustInjections);
  injections.push(...boundaryInjections);
  injections.push(...healthInjections);
  injections.push(...personaSpecificInjections);

  if (serviceAvailabilityInjection) {
    injections.push(serviceAvailabilityInjection);
    diag.debug('🔌 Service availability context added - LLM knows what services are connected');
  }

  // LIVE SUPERHUMAN INJECTIONS
  if (liveSuperhumanResult.injections.length > 0) {
    injections.push(...liveSuperhumanResult.injections);
    diag.info('🌟 Live superhuman injections added', {
      count: liveSuperhumanResult.injections.length,
      signals: liveSuperhumanResult.signals,
      processingTimeMs: liveSuperhumanResult.processingTimeMs,
    });

    // Queue resonance checks for surfaced capabilities
    const { sessionId: sId } = services;
    const turnCount = userData.turnCount || 0;
    const { signals } = liveSuperhumanResult;

    if (signals.commitmentDetected) {
      queueResonanceCheck(sId, 'commitment_keeper' as SuperhumanCapability, 'Commitment or intention detected', turnCount);
    }
    if (signals.valuesConflict) {
      queueResonanceCheck(sId, 'values_alignment' as SuperhumanCapability, 'Values conflict or alignment surfaced', turnCount);
    }
    if (signals.capacityWarning) {
      queueResonanceCheck(sId, 'capacity_guardian' as SuperhumanCapability, 'Capacity warning or energy check surfaced', turnCount);
    }
    if (signals.voiceDistressDetected) {
      queueResonanceCheck(sId, 'voice_biomarkers' as SuperhumanCapability, 'Voice distress or emotional state detected', turnCount);
    }
    if (signals.predictiveInsight) {
      queueResonanceCheck(sId, 'predictive_coaching' as SuperhumanCapability, 'Predictive insight or pattern surfaced', turnCount);
    }
  }

  // SEMANTIC INTELLIGENCE
  if (semanticIntelligenceResult?.injection) {
    injections.push(semanticIntelligenceResult.injection);
    diag.debug('🧠 Semantic intelligence injection added (tool hints, patterns)');
  }

  if (semanticIntelligenceResult?.prediction) {
    userData.semanticPrediction = semanticIntelligenceResult.prediction;
  } else {
    userData.semanticPrediction = undefined;
  }

  // "BETTER THAN HUMAN" INJECTIONS (Legacy)
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

  if (toolHistoryInjection) {
    injections.push(toolHistoryInjection);
    diag.info('🔧 Tool history awareness added - LLM knows recent actions', {
      category: toolHistoryInjection.category,
      priority: toolHistoryInjection.priority,
    });
  }

  // SESSION DYNAMICS
  const sessionDynamicsInjection = buildSessionDynamicsInjection(services.sessionId);
  if (sessionDynamicsInjection) {
    injections.push(sessionDynamicsInjection);
    diag.debug('📈 Session dynamics injected', {
      phase: sessionDynamicsInjection.content.split('\n')[0],
    });
  }

  // RELATIONSHIP STAGE CONTEXT
  try {
    const relationshipStage = services.userProfile?.relationshipStage || userData.relationshipStage;
    const totalConversations = services.userProfile?.totalConversations || 1;
    const firstMet = services.userProfile?.createdAt;

    if (relationshipStage || totalConversations > 1) {
      const stageName = String(relationshipStage || 'building');

      const daysKnown = firstMet
        ? Math.floor((Date.now() - new Date(firstMet).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

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

  // BETTER THAN HUMAN ORCHESTRATOR
  try {
    const userId = services.userId || 'unknown';
    const bthSessionId = services.sessionId || `session-${Date.now()}`;
    const sessionCount = services.userProfile?.totalConversations || 0;

    const bthOrchestrator = getBetterThanHuman(userId, bthSessionId, persona.id, sessionCount);

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

    const hour = new Date().getHours();
    const timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' =
      hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
    const dayOfWeek = new Date().getDay();

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
      sessionId: bthSessionId,
      timeOfDay,
      dayOfWeek,
    };

    const insight = bthOrchestrator.analyze(bthContext);

    if (insight && insight.prioritizedActions && insight.prioritizedActions.length > 0) {
      const topActions = insight.prioritizedActions.slice(0, 4);

      for (const action of topActions) {
        if (action.content && action.priority > 0.35) {
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
  }

  // Ambient Awareness
  const ambientInjections = buildAmbientAwarenessInjections(userData);
  injections.push(...ambientInjections);

  // Value Capture
  try {
    const vcUserId = services.userId || 'unknown';
    const valueEvent = await valueCapture.detect({
      userId: vcUserId,
      message: userText,
      conversationId: services.sessionId,
    });

    if (valueEvent) {
      diag.info('💰 Value event detected', {
        type: valueEvent.type,
        estimatedValue: valueEvent.estimatedValueCents,
      });

      (userData as Record<string, unknown>).lastValueEvent = {
        type: valueEvent.type,
        eventId: valueEvent.id,
        message: userText.slice(0, 100),
        timestamp: valueEvent.createdAt,
      };

      const recentValuePromptCount =
        ((userData as Record<string, unknown>).valuePromptCount as number) || 0;
      const shouldShow = valueCapture.shouldShow({
        event: valueEvent,
        recentValuePromptCount,
        conversationTurnCount: userData.turnCount || 0,
      });

      if (shouldShow) {
        (userData as Record<string, unknown>).shouldPromptValueCapture = true;
        (userData as Record<string, unknown>).valuePromptCount = recentValuePromptCount + 1;
      }
    }
  } catch (valueError) {
    diag.debug('Value capture detection skipped', { error: String(valueError) });
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

  // PARALLELIZED ASYNC INJECTION BUILDERS
  const [humanLevelInjections, insightsInjection, deepHumanResult] = await Promise.all([
    buildHumanLevelInjections({
      services,
      userData,
      userText,
      analysis,
      currentTopic,
      humorGuidance: responseGuidance.humor,
      logger: ctx.logger,
    }),
    buildCrossPersonaInsightsInjection(services, persona.id),
    buildDeepHumanInjections({
      sessionId: services.sessionId || 'unknown',
      userId: services.userId || 'unknown',
      userText,
      persona,
      turnCount: userData.turnCount || 1,
      detectedEmotion: emotionalState.primary,
      emotionIntensity: emotionalState.intensity,
      analysis,
      userProfile: services.userProfile
        ? {
            sessionCount: services.userProfile.totalConversations,
            name: services.userProfile.name,
          }
        : undefined,
    }),
  ]);

  injections.push(...humanLevelInjections);
  if (insightsInjection) {
    injections.push(insightsInjection);
  }

  if (deepHumanResult) {
    injections.push(...deepHumanResult.injections);

    if (deepHumanResult.activeSecretMode || deepHumanResult.laughterTriggered) {
      diag.info('Deep Human System activated', {
        sessionId: services.sessionId,
        turnCount: userData.turnCount,
        secretMode: deepHumanResult.activeSecretMode,
        energy: deepHumanResult.detectedEnergy,
        speechNaturalizer: deepHumanResult.speechNaturalizerApplied,
        laughter: deepHumanResult.laughterTriggered,
        injectionCount: deepHumanResult.injections.length,
      });
    }
  }

  // 8. Emotional guidance
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

  // 9b. PROACTIVE MEMORY SURFACING
  if (ctx.proactiveSurfacing && ctx.proactiveSurfacing.length > 0) {
    const surfacingLines = ctx.proactiveSurfacing
      .slice(0, 2)
      .map((opp) => `- ${opp.naturalPhrasing}`);

    injections.push({
      category: 'proactive_memory',
      content: `[MEMORY SURFACING - Consider mentioning naturally if relevant]\n${surfacingLines.join('\n')}\n(Only mention if it flows naturally - don't force it)`,
      priority: 29,
    });
  }

  // 9c. MEMORY INTELLIGENCE
  try {
    const valenceMap: Record<string, number> = {
      positive: 0.7,
      negative: -0.7,
      neutral: 0,
      mixed: 0,
    };
    const emotionalValence = valenceMap[analysis.emotion.valence] ?? 0;

    const memoryIntelInjection = await getMemoryInjection({
      userId: services.userId || 'anonymous',
      userText,
      sessionId: services.sessionId || undefined,
      turnCount: userData.turnCount || 0,
      persona: persona.id as 'ferni' | 'peter' | 'maya' | 'jordan' | 'alex' | 'nayan',
      detectedTopics: analysis.topics?.detected || [],
      peopleMentioned: [],
      crisisDetected: (emotionalState.distressLevel || 0) > 0.8,
      emotionalIntensity: emotionalState.intensity || 0,
      emotionalValence,
      isVulnerable: (emotionalState.distressLevel || 0) > 0.5,
      trustLevel:
        (userData.trustLevel as 'new' | 'developing' | 'established' | 'deep') || 'developing',
      turnsSinceLastMemory: ctx.surfacingCount || 0,
    });

    if (memoryIntelInjection) {
      injections.push(memoryIntelInjection);

      if (memoryIntelInjection.metadata?.memoryIds) {
        ctx.lastSurfacedMemoryIds = memoryIntelInjection.metadata.memoryIds;
        ctx.surfacingCount = (ctx.surfacingCount || 0) + 1;
        ctx.memoriesSurfacedThisSession = [
          ...(ctx.memoriesSurfacedThisSession || []),
          ...memoryIntelInjection.metadata.memoryIds,
        ];
      }

      diag.debug('🧠 Memory Intelligence injection added', {
        category: memoryIntelInjection.category,
        priority: memoryIntelInjection.priority,
        hasMetadata: !!memoryIntelInjection.metadata,
        surfacedMemoryIds: memoryIntelInjection.metadata?.memoryIds,
      });
    }
  } catch (error) {
    diag.warn('Memory Intelligence injection failed', { error: String(error) });
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

  // 15. Viral Growth - Referral prompt
  try {
    const referralRelationshipStage =
      (services.userProfile?.relationshipStage as 'new' | 'building' | 'established' | 'deep') ||
      'building';

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

    const topicsObj = analysisResult.analysis?.topics;
    const topics: string[] = topicsObj?.detected || [];

    const referralResult = await buildReferralPromptInjection({
      userId: services.userId || 'unknown',
      personaId: persona.id,
      turnCount: userData.turnCount || 1,
      relationshipStage: referralRelationshipStage,
      userMood: userMood as 'positive' | 'neutral' | 'struggling',
      recentTopics: topics,
      userText,
    });

    if (referralResult.shouldInject && referralResult.injection) {
      injections.push(referralResult.injection);
      diag.info('🌱 Referral prompt injected (natural trigger detected)');
    }

    const referralConversationContext = buildReferralConversationContext();
    if (referralConversationContext) {
      injections.push(referralConversationContext);
      diag.debug('📞 Referral conversation context injected');
    }
  } catch (error) {
    diag.warn('Referral prompt injection failed (non-blocking)', { error: String(error) });
  }

  // 16. Conversation dynamics
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

  // Data capture acknowledgment
  if (userData.dataCaptureAcknowledgment) {
    injections.push({
      category: 'data_capture',
      content: `[SAVED DATA: ${userData.dataCaptureAcknowledgment} - Acknowledge this naturally in your response, e.g., "Got it, I've saved that."]`,
      priority: 75,
    });
    userData.dataCaptureAcknowledgment = undefined;
  }

  // Sort by priority (highest first)
  injections.sort((a, b) => b.priority - a.priority);

  return {
    injections,
    trustContextSummary,
  };
}
