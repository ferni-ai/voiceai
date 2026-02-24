/**
 * Turn Processor - Main Turn Processing
 *
 * Orchestrates all processing for a single user turn:
 * - Message analysis
 * - Context building
 * - Emotional tracking
 * - Response guidance
 * - Identity reinforcement
 *
 * This is the main entry point that coordinates all turn processing.
 */

import type { ContextUserData } from '../../../intelligence/context-builders/index.js';
import type {
  ContextInjection,
  ResonanceCheckResult,
  SemanticRoutingResult,
  TrustContextSummary,
  TurnContext,
  TurnProcessorResult,
} from '../types.js';
import type { ContextInjectionsResult } from './types.js';
import type { TurnRouterResult } from '../../../tools/semantic-router/integration/index.js';
import type { ConversationSignals } from '../../../intelligence/unified-user-model.js';
import type { TurnOutcome } from '../../../intelligence/context-outcome-tracker.js';
import type { SelectionDecision } from '../../../intelligence/context-routing/index.js';

import { diag } from '../../../services/diagnostic-logger.js';
import {
  publishKeyMoment,
  publishOutreachExtraction,
  publishPatternDetection,
  publishPredictiveIntelligence,
} from '../../../services/intelligence-publisher.js';
import { updateUserContextForHandoff } from '../../../tools/handoff/index.js';
import { safeFireAndForget } from '../../../utils/safe-fire-and-forget.js';
import {
  processConversationForLearning,
} from '../../../intelligence/predictive/index.js';

import { shouldUseIntelligentRouting } from '../../../tools/semantic-router/advanced/intelligent/index.js';
import {
  applyRoutingResult,
  isIntelligentRouterInitialized,
  isRoutingEnabled,
  startIntelligentRouting,
  startSemanticRouting,
} from '../../../tools/semantic-router/integration/index.js';

import {
  buildFTISToolHint,
  convertToSemanticRoutingResult,
  isFTISEnabled,
  runFTISRouting,
} from '../tool-routing-integration.js';

import { createInspectionData, recordContextBuild } from '../../../services/context-inspection.js';

import {
  recordUserReaction,
  tagInjectionsForTracking,
} from '../../../intelligence/feedback/injection-tracker.js';

import { analyzeRichEmotion } from '../../../intelligence/rich-emotion-model.js';

import {
  createPlan,
  detectImplicitGoals,
  recordTopicCovered,
  loadPreviousFollowUps,
} from '../../../intelligence/conversation-planner.js';
import {
  loadUserModel,
  updateFromConversation,
} from '../../../intelligence/unified-user-model.js';

import { getContextOutcomeTracker } from '../../../intelligence/context-outcome-tracker.js';

import {
  selectInjections as smartSelectInjections,
} from '../../../intelligence/context-routing/index.js';

import { getTimingState } from '../../../intelligence/context-builders/awareness/system-state-awareness.js';
import { applyTimingAwareDegradation } from '../timing-aware-injection.js';

import { checkSemanticShortCircuit } from '../semantic-short-circuit.js';

import { speculateTTS } from '../../../services/performance/speculative-tts.js';

import { analyzeMessage, updateConversationState } from '../message-analyzer.js';

import { processConversationDynamics } from '../conversation-dynamics.js';
import { checkEasterEggs } from '../easter-egg-handler.js';
import { buildEmotionalState } from '../emotional-state-builder.js';
import { buildResponseGuidance } from '../response-guidance-builder.js';
import { buildIdentityContext } from '../identity-context-builder.js';
import { buildHumanizingContextForTurn } from '../humanizing-context-builder.js';
import { processBundleRuntime } from '../bundle-runtime-processor.js';
import { processAdvancedHumanization } from '../advanced-humanization.js';

import {
  createTimer,
  recordContextInjectionTiming,
  recordPhaseTiming,
  recordTurnTiming,
} from '../../../services/performance-metrics.js';

import { createTurnTrace } from '../../shared/dev-telemetry.js';

import { initializeVoiceTracking, recordVoiceTurn } from '../../../intelligence/voice-signals.js';
import { analyzeAndPreload } from '../../shared/performance/speculative-preloading.js';

import {
  recordMemoryResponse,
} from '../../../intelligence/memory-intelligence/turn-processor-integration.js';

import {
  getNextResonanceCheck,
  processUserResponseForResonance,
} from '../../integrations/better-than-human-integration.js';

import { detectCrisis, guardPreResponse } from '../../safety/crisis-guard.js';

import { fastCapture } from '../../../memory/dynamic/index.js';
import { triggerAutoSave } from '../../../services/realtime-persistence.js';
import { extractNames, recordMention } from '../../../services/superhuman/relationship-network.js';

import { processDataCapture } from '../../../intelligence/data-capture/index.js';
import { recordTemporalObservation } from '../../../intelligence/patterns/temporal-patterns.js';
import {
  extractPreferences,
  hasPreferenceContent,
} from '../../../intelligence/tracking/preferences.js';

import { recordMismatchInsight } from '../../../intelligence/voice-text-mismatch.js';
import {
  detectReflectionMoment,
  saveReflectionMoment,
} from '../../../intelligence/cross-session-reflection.js';

import {
  deduplicateInjections,
  detectConversationMode,
  filterInjections,
} from '../injection-filter.js';

import { enrichEmotionWithVoice } from './voice-biomarker.js';
import { recordTeamHuddleObservation } from './team-huddle-helpers.js';
import { buildContextInjections } from './context-injections.js';

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

  // DEV TELEMETRY: Create turn trace for E2E observability
  const isDev = process.env.NODE_ENV === 'development' || process.env.DEV_TELEMETRY === 'true';
  const trace = isDev ? createTurnTrace(services.sessionId) : null;

  diag.user('Processing user turn', {
    preview: userText.slice(0, 100),
  });

  if (!userText || userText.trim().length === 0) {
    diag.warn('Empty user text');
    throw new Error('Empty user text');
  }

  // FEEDBACK: Record user reaction to previous turn's injections (Phase 1 BTH)
  if (services.sessionId) {
    recordUserReaction(services.sessionId, userText);
  }

  // MEMORY RESPONSE TRACKING
  if (ctx.lastSurfacedMemoryIds && ctx.lastSurfacedMemoryIds.length > 0) {
    try {
      await recordMemoryResponse(
        services.userId || 'anonymous',
        userText,
        ctx.lastSurfacedMemoryIds
      );
      diag.debug('📊 Memory response recorded', {
        memoryIds: ctx.lastSurfacedMemoryIds,
        userTextPreview: userText.slice(0, 50),
      });
    } catch (error) {
      diag.warn('Memory response tracking failed', { error: String(error) });
    }
  }

  // SAFETY FIRST: Crisis detection runs BEFORE anything else
  const voiceEmotionForCrisis = userData?.voiceEmotion
    ? {
        primary: userData.voiceEmotion.primary || 'neutral',
        intensity: userData.voiceEmotion.confidence || 0.5,
        confidence: userData.voiceEmotion.confidence,
      }
    : undefined;

  const crisisResult = detectCrisis(userText, voiceEmotionForCrisis);
  const preResponseGuard = guardPreResponse(userText, voiceEmotionForCrisis);

  if (crisisResult.isCrisis || crisisResult.severity > 0.3) {
    diag.state('🚨 Crisis detection result', {
      isCrisis: crisisResult.isCrisis,
      severity: crisisResult.severity,
      indicators: crisisResult.indicators,
      shouldOverride: preResponseGuard.shouldBlock,
    });

    if (userData.userId) {
      try {
        const { accumulateSignal, signalFromCrisis } =
          await import('../../../services/conversation-thread/superhuman-outreach-intelligence.js');
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

  const debugTiming = process.env.DEBUG_TURN_TIMING === 'true';
  const turnStartMs = Date.now();

  // 1. Analyze message
  const analysisTimer = createTimer();
  trace?.stage('message_analysis');
  const analysisSpan = trace?.startSpan('message_analysis');
  const analysisResult = analyzeMessage(ctx);
  const analysisMs = analysisTimer.stop();
  analysisSpan?.end();
  recordPhaseTiming('message_analysis', analysisMs);
  if (debugTiming) diag.info(`⏱️ [TIMING] message_analysis: ${analysisMs}ms`);

  // 2. Update conversation state
  const stateTimer = createTimer();
  const stateSpan = trace?.startSpan('conversation_state');
  updateConversationState(ctx, analysisResult);
  stateSpan?.end();
  recordPhaseTiming('conversation_state', stateTimer.stop());

  // CONVERSATION PLANNER (H2.2)
  try {
    if (!userData._conversationPlan && services.userId) {
      const plan = createPlan(services.sessionId, services.userId);
      const followUpsResult = await loadPreviousFollowUps(services.userId);
      if (followUpsResult.ok && followUpsResult.value.length > 0) {
        plan.followUps.push(...followUpsResult.value);
      }
      userData._conversationPlan = plan;
    }
    if (userData._conversationPlan) {
      detectImplicitGoals(userText, userData._conversationPlan);
      if (analysisResult.currentTopic) {
        recordTopicCovered(userData._conversationPlan, analysisResult.currentTopic);
      }
    }
  } catch {
    // Non-blocking
  }

  // UNIFIED USER MODEL (H2.3)
  try {
    if (services.userId && !userData._unifiedUserModel) {
      userData._unifiedUserModel = await loadUserModel(services.userId);
    }
    if (userData._unifiedUserModel) {
      const signals: ConversationSignals = {};
      if (analysisResult.analysis.emotion) {
        signals.emotionalProfile = {
          baselineValence: analysisResult.analysis.emotion.intensity || 0.5,
        };
      }
      if (analysisResult.currentTopic) {
        signals.interests = [{ topic: analysisResult.currentTopic, engagementLevel: 0.6 }];
      }
      if (ctx.persona?.id) {
        signals.personaAffinity = { personaId: ctx.persona.id };
      }
      userData._unifiedUserModel = updateFromConversation(userData._unifiedUserModel, signals);
    }
  } catch {
    // Non-blocking
  }

  // CONTEXT OUTCOME TRACKING (H2.4)
  try {
    const prevTurn = (userData.turnCount || 1) - 1;
    if (prevTurn > 0 && services.sessionId) {
      const tracker = getContextOutcomeTracker();
      const recentTranscripts = userData.recentTranscripts || [];
      const avgLen =
        recentTranscripts.length > 1
          ? recentTranscripts.slice(0, -1).reduce((s, t) => s + t.length, 0) / (recentTranscripts.length - 1)
          : 100;
      const outcome: TurnOutcome = {
        userContinued: true,
        responseEngagement: userText.length > avgLen * 1.3 ? 'high' : userText.length > avgLen * 0.7 ? 'medium' : 'low',
        sentimentDelta: (analysisResult.analysis.emotion?.intensity || 0.5) - 0.5,
        wasTopicShift: analysisResult.currentTopic !== userData.lastTopic,
        positiveFeedback: /thank|great|helpful|awesome|love|perfect|exactly/i.test(userText),
        negativeFeedback: /wrong|bad|not helpful|stop|annoying|don't/i.test(userText),
        responseLatencyMs: 0,
        wasInterrupted: false,
      };
      tracker.recordOutcome(services.sessionId, prevTurn, outcome);
    }
  } catch {
    // Non-blocking
  }

  // RESONANCE RESPONSE
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

  // TRIGGER EFFECTIVENESS (Phase 4)
  if (services.sessionId && userData.lastFiredTriggers?.length) {
    const recentTranscripts = userData.recentTranscripts || [];
    const avgLen =
      recentTranscripts.length > 0
        ? recentTranscripts.reduce((sum, t) => sum + t.length, 0) / recentTranscripts.length
        : 100;

    safeFireAndForget(
      async () => {
        const { processTriggerOutcomes } = await import('../trigger-outcome-handler.js');
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

  // COACHING INTELLIGENCE
  if (services.userId) {
    initializeVoiceTracking(services.sessionId);

    recordVoiceTurn(services.sessionId, userText, {
      topic: analysisResult.currentTopic,
      energy: userData?.voiceEmotion?.confidence,
      pauseBeforeMs: userData?.pauseBeforeSpeakingMs,
    });

    publishPatternDetection(services.userId, services.sessionId, {
      message: userText,
      topic: analysisResult.currentTopic || 'general',
      emotion: analysisResult.analysis.emotion.primary,
    });

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

    // TRUE PREDICTIVE INTELLIGENCE: Feed ML models
    const { userId } = services;
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
          previousEmotion,
          previousTopic,
        });
      },
      { context: 'predictive-ml-learning' }
    );

    publishKeyMoment(services.userId, services.sessionId, {
      personaId: ctx.persona?.id || 'ferni',
      message: userText,
      topic: analysisResult.currentTopic || 'general',
      emotion: analysisResult.analysis.emotion.primary,
      emotionIntensity: analysisResult.analysis.emotion.intensity,
    });

    recordTemporalObservation(services.userId, {
      state: {
        emotion: analysisResult.analysis.emotion.primary,
        topic: analysisResult.currentTopic,
        intensity: analysisResult.analysis.emotion.intensity,
        energyLevel:
          (userData?.voiceEmotion?.confidence ?? 0.5) < 0.4
            ? 'low'
            : (userData?.voiceEmotion?.confidence ?? 0.5) > 0.7
              ? 'high'
              : 'medium',
      },
    });

    // REAL-TIME LEARNING
    try {
      const dataCaptureResult = await processDataCapture({
        transcript: userText,
        userId: services.userId!,
        sessionId: services.sessionId,
        personaId: ctx.persona?.id,
      });

      if (dataCaptureResult.suggestedAcknowledgment) {
        userData.dataCaptureAcknowledgment = dataCaptureResult.suggestedAcknowledgment;
        diag.state('🎯 Data capture acknowledgment set', {
          acknowledgment: dataCaptureResult.suggestedAcknowledgment,
          capturedCount: dataCaptureResult.captured.length,
        });
      }
    } catch (dataCaptureError) {
      diag.debug('Data capture failed (non-blocking)', { error: String(dataCaptureError) });
    }

    if (hasPreferenceContent(userText)) {
      safeFireAndForget(
        async () => {
          const preferences = extractPreferences(userText);
          if (preferences.length > 0) {
            const { storeUserPreferences } =
              await import('../../../services/user-preferences-store.js');
            await storeUserPreferences(services.userId!, preferences);
            diag.state('🎯 Preferences extracted', {
              count: preferences.length,
              categories: preferences.map((p) => p.category),
            });
          }
        },
        { context: 'preference-extraction' }
      );
    }

    safeFireAndForget(
      async () => {
        const extractedNames = extractNames(userText);
        for (const { name, context } of extractedNames) {
          await recordMention(services.userId!, {
            name,
            type: 'acquaintance',
            context,
          });
          diag.state('📇 Recorded person mention', { name });
        }
      },
      { context: 'relationship-network-extraction' }
    );

    safeFireAndForget(
      async () => {
        const captureResult = await fastCapture({
          transcript: userText,
          userId: services.userId!,
          sessionId: services.sessionId,
          turnNumber: turnCount,
          voiceEmotion: analysisResult.analysis.emotion.primary,
          personaId: ctx.persona?.id,
        });

        const { recordTurn } = await import('../../../memory/dynamic/index.js');
        recordTurn(services.sessionId, services.userId!, captureResult, userText, turnCount);

        if (captureResult.mentionedEntities.length > 0 || captureResult.asyncJobId) {
          diag.state('🧠 Dynamic memory capture', {
            entityCount: captureResult.mentionedEntities.length,
            topicCount: captureResult.topicHints.length,
            asyncJobId: captureResult.asyncJobId,
            captureTimeMs: captureResult.captureTimeMs,
          });
        }
      },
      { context: 'dynamic-memory-capture' }
    );

    safeFireAndForget(
      async () => {
        try {
          const { captureTurn, isKnowledgeCaptureReady } =
            await import('../../../memory/knowledge-graph/index.js');

          if (!isKnowledgeCaptureReady()) return;

          const valenceToNumber = (v?: string): number | undefined => {
            if (!v) return undefined;
            if (v === 'positive') return 1;
            if (v === 'negative') return -1;
            return 0;
          };

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
                  valence: valenceToNumber(analysisResult.analysis.emotion.valence),
                }
              : undefined,
            topic: analysisResult?.analysis?.topics?.detected?.[0],
            recentContext: undefined,
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

    const extractedDetails = (userData as Record<string, unknown>).extractedDetails as
      | Array<{ type: string; value: string }>
      | undefined;
    if (extractedDetails) {
      triggerAutoSave(services.userId, turnCount, extractedDetails);
    } else {
      triggerAutoSave(services.userId, turnCount);
    }

    // SPECULATIVE PERSONA PRELOADING
    analyzeAndPreload(userText, {
      sessionId: services.sessionId,
      userId: services.userId || 'anonymous',
      currentPersona: ctx.persona?.id || 'ferni',
      buildInsightsFn: async (personaId: string) => {
        return {
          personaId,
          userId: services.userId || 'anonymous',
          generatedAt: Date.now(),
          personaBriefing: `Pre-warmed context for ${personaId}`,
        };
      },
    });

    // TEAM HUDDLE
    if (services.userId) {
      safeFireAndForget(
        async () => {
          await recordTeamHuddleObservation(
            services.userId!,
            ctx.persona?.id || 'ferni',
            userText,
            analysisResult,
            userData as unknown as ContextUserData
          );
        },
        { context: 'team-huddle-observation' }
      );
    }

    // PROACTIVE SURFACING
    if (services.userId) {
      safeFireAndForget(
        async () => {
          try {
            const { checkProactiveSurfacing, isEntityStoreReady } =
              await import('../../../memory/entity-store/integration.js');

            if (!isEntityStoreReady()) return;

            const opportunities = await checkProactiveSurfacing(services.userId!, userText, {
              sessionId: services.sessionId,
              personaId: ctx.persona?.id || 'ferni',
              turnNumber: turnCount,
              surfacingCountThisSession: ctx.surfacingCount || 0,
              sessionTopics: ctx.sessionTopics || [],
              conversationMood: analysisResult?.analysis?.state?.currentMood as
                | 'exploratory'
                | 'venting'
                | 'seeking_help'
                | 'casual'
                | undefined,
              lastTurnWasQuestion: userText.trim().endsWith('?'),
              detectedEmotion: analysisResult?.analysis?.emotion?.primary,
            });

            if (opportunities.length > 0) {
              diag.state('💡 Proactive surfacing opportunities found', {
                count: opportunities.length,
                types: opportunities.map((o: { type: string }) => o.type),
              });
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
  // PARALLEL PROCESSING: Tool routing
  // ============================================================================
  const isFTISMode = isFTISEnabled();

  let semanticRoutingPromise: Promise<TurnRouterResult> | null = null;
  let ftisRoutingPromise: ReturnType<typeof runFTISRouting> | null = null;

  if (isFTISMode) {
    const ftisUserId = services.userId || 'unknown';
    const userLocationData = ctx.userData?.location as
      | { city?: string; regionCode?: string; countryCode?: string }
      | undefined;

    const lastAgentMessage = undefined;

    ftisRoutingPromise = runFTISRouting(userText, {
      userId: ftisUserId,
      sessionId: services.sessionId || '',
      personaId: ctx.persona.id,
      userLocation: userLocationData,
      lastAgentMessage,
    });
    diag.debug('🧠 FTIS routing started', { mode: 'ftis' });
  } else if (isRoutingEnabled()) {
    const conversationHistory = (userData.recentTranscripts || []).map((text) => ({
      role: 'user' as const,
      content: text,
    }));

    const toolExecData = userData?.conversationState?.getToolExecutionData?.();
    const recentTools = toolExecData?.recentlyUsedTools || [];

    const routingUserId = services.userId || 'unknown';
    const routingContext = {
      userId: routingUserId,
      sessionId: services.sessionId,
      personaId: ctx.persona.id,
      conversationHistory,
      recentTools,
    };

    if (isIntelligentRouterInitialized() && shouldUseIntelligentRouting(routingUserId)) {
      diag.debug('🧠 Using intelligent routing (A/B test)', { userId: routingUserId, mode: 'intelligent' });
      semanticRoutingPromise = startIntelligentRouting(userText, routingContext);
    } else {
      semanticRoutingPromise = startSemanticRouting(userText, routingContext);
    }
  }

  // FTIS DIRECT EXECUTION
  let ftisClassificationHint: string | null = null;

  if (ftisRoutingPromise) {
    const ftisResult = await ftisRoutingPromise;

    if (ftisResult.bypassLLM && ftisResult.toolResult) {
      diag.state('🧠 FTIS: Direct tool execution complete', {
        tool: ftisResult.toolResult.toolId,
        confidence: ftisResult.classification?.confidence,
        latencyMs: ftisResult.processingTimeMs,
      });

      const ftisSemanticRouting = convertToSemanticRoutingResult(ftisResult);

      diag.debug('🎯 FTIS: Will use generateReply for natural response', {
        tool: ftisResult.toolResult.toolId,
        result:
          ftisResult.toolResult.output?.slice(0, 100) ||
          ftisResult.toolResult.speakableResponse?.slice(0, 100),
      });

      return {
        analysis: analysisResult,
        context: {
          injections: [],
          elapsedMs: ftisResult.processingTimeMs,
        },
        emotional: {
          primary: analysisResult.analysis.emotion.primary,
          intensity: analysisResult.analysis.emotion.intensity,
          distressLevel: 0,
          trajectory: 'stable',
        },
        response: {
          length: {
            min: 1,
            max: 3,
            guidance: 'Keep response brief - FTIS tool already executed',
          },
        },
        identity: {
          needsReinforcement: false,
          activeAgentId: ctx.persona.id,
          sessionPersonaId: ctx.persona.id,
        },
        bundleRuntime: undefined,
        easterEgg: undefined,
        valueCapture: undefined,
        advancedHumanization: undefined,
        crisis: {
          isCrisis: false,
          severity: 0,
          indicators: [],
          shouldOverrideLLM: false,
        },
        semanticRouting: ftisSemanticRouting,
      };
    }

    if (ftisResult.classification && ftisResult.classification.confidence >= 0.5) {
      ftisClassificationHint = buildFTISToolHint(ftisResult.classification);
      diag.debug('🧠 FTIS: Classification added as context hint', {
        category: ftisResult.classification.fineCategory,
        confidence: ftisResult.classification.confidence,
        hintCreated: !!ftisClassificationHint,
      });
    }
  }

  // SEMANTIC SHORT-CIRCUIT
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

    if (process.env.DEBUG_ROUTING === 'true') {
      diag.debug('⚡ Short-circuit bypassed', { reason: shortCircuitResult.reason });
    }
  }

  const easterEggPromise = checkEasterEggs(ctx, turnCtx);

  // Humanization processing (safe fire-and-forget)
  safeFireAndForget(
    async () => {
      const { processUserMessage } =
        await import('../../../conversation/humanization/voice-agent-integration.js');
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

  // Creative You topic recording
  const userIdForCreativeYou = services.userId;
  if (userIdForCreativeYou && analysisResult.analysis.topics?.detected?.length > 0) {
    safeFireAndForget(
      async () => {
        const { recordConversationTopics } =
          await import('../../../services/creative-you/conversation-integration.js');
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
  // ============================================================================
  trace?.stage('parallel_core_analysis');
  const parallelCoreTimer = createTimer();

  const [emotionalState, identityContext, humanizingResult, bundleRuntimeContext] =
    await Promise.all([
      (async () => {
        const timer = createTimer();
        const result = buildEmotionalState(ctx, analysisResult);
        recordPhaseTiming('emotional_state', timer.stop());
        return result;
      })(),
      (async () => {
        const timer = createTimer();
        const result = buildIdentityContext(ctx);
        recordPhaseTiming('identity_context', timer.stop());
        return result;
      })(),
      (async () => {
        const timer = createTimer();
        const result = buildHumanizingContextForTurn(ctx, analysisResult);
        recordPhaseTiming('humanizing_context', timer.stop());
        return result;
      })(),
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

  // Voice biomarker enrichment
  const dspBiomarkers = ctx.userData.rustDspBiomarkers;
  if (dspBiomarkers) {
    const enriched = enrichEmotionWithVoice(
      { primary: emotionalState.primary, intensity: emotionalState.intensity },
      dspBiomarkers
    );
    emotionalState.primary = enriched.primary;
    emotionalState.intensity = enriched.intensity;
    if (enriched.mismatch) {
      diag.state('🔬 Voice biomarker mismatch detected', {
        original: emotionalState.primary,
        enriched: enriched.primary,
        mismatch: enriched.mismatch,
        confidence: enriched.confidence,
      });
    }
    ctx.userData.isInBreathPause = dspBiomarkers.isBreathPause;
  }

  // Record mismatch as cross-persona insight
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

  // EARLY SPECULATIVE TTS PRE-WARMING
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
  // ============================================================================
  trace?.stage('parallel_dependent_analysis');
  const parallelDependentTimer = createTimer();

  const [conversationDynamics, responseGuidance] = await Promise.all([
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

  // Identity/2FA detection (parallel with context building)
  const identityPromise = (async () => {
    try {
      const { onUserMessage } =
        await import('../../../services/trust-and-identity/voice-agent-integration.js');
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
  // PARALLEL CONTEXT BUILDING
  // ============================================================================
  trace?.stage('context_building');
  const contextBuildSpan = trace?.startSpan('context_injections');
  const contextTimer = createTimer();
  const [contextInjectionsResult, advancedHumanizationResult, identityMessageResult, easterEgg] =
    await Promise.all([
      (async () => {
        const injectionsTimer = createTimer();
        const speculativeInjections = (userData as Record<string, unknown>)
          .speculativeInjections as ContextInjection[] | undefined;

        let result: ContextInjectionsResult;

        if (speculativeInjections && speculativeInjections.length > 0) {
          const { buildQuickBuildersOnly } = await import('../context-injection-builder.js');
          const quickInjections = await buildQuickBuildersOnly(
            ctx,
            analysisResult,
            emotionalState,
            responseGuidance,
            identityContext,
            conversationDynamics
          );
          const merged = [...speculativeInjections, ...quickInjections];
          merged.sort((a, b) => b.priority - a.priority);
          result = { injections: merged, trustContextSummary: {} as TrustContextSummary };

          delete (userData as Record<string, unknown>).speculativeInjections;
          diag.info('⚡ WS1: Speculative context used', {
            speculativeCount: speculativeInjections.length,
            quickCount: quickInjections.length,
          });
        } else {
          result = await buildContextInjections(
            ctx,
            analysisResult,
            emotionalState,
            responseGuidance,
            identityContext,
            humanizingResult,
            bundleRuntimeContext,
            conversationDynamics
          );
        }

        recordContextInjectionTiming('all_context_injections', injectionsTimer.stop());
        return result;
      })(),

      (async () => {
        const humanizationTimer = createTimer();
        const result = await processAdvancedHumanization(ctx, analysisResult, emotionalState);
        recordContextInjectionTiming('advanced_humanization', humanizationTimer.stop());
        return result;
      })(),

      identityPromise,
      easterEggPromise,
    ]);
  contextBuildSpan?.end();
  const contextInjectionsMs = contextTimer.stop();
  recordPhaseTiming('context_injections', contextInjectionsMs);
  if (debugTiming) diag.info(`⏱️ [TIMING] context_injections: ${contextInjectionsMs}ms`);

  const { injections } = contextInjectionsResult;
  const { trustContextSummary } = contextInjectionsResult;

  if (advancedHumanizationResult) {
    injections.push(...advancedHumanizationResult.injections);
    injections.sort((a, b) => b.priority - a.priority);
  }

  if (ftisClassificationHint) {
    injections.push({
      category: 'tool_hint',
      content: ftisClassificationHint,
      priority: 70,
    });
    diag.debug('🧠 FTIS: Injected classification hint for LLM', {
      hintLength: ftisClassificationHint.length,
    });
  }

  // CONTEXT INSPECTION
  const shouldRecordContext =
    process.env.LOG_CONTEXT_BUILDS === 'true' || process.env.DEBUG_INJECTIONS === 'true';
  if (shouldRecordContext) {
    try {
      const inspectionData = createInspectionData({
        sessionId: services.sessionId,
        userId: services.userId,
        personaId: ctx.persona?.id,
        turnNumber: userData?.turnCount || 0,
        injections,
        builderResults: [],
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
      diag.warn('Context inspection recording failed', { error: String(inspectionError) });
    }
  }

  // Identity-related context injections
  if (identityMessageResult) {
    if (identityMessageResult.verificationResult) {
      injections.push({
        category: 'identity_verification',
        content: identityMessageResult.verificationResult.verified
          ? `[VERIFICATION SUCCESS] User verified their phone! Thank them warmly: "${identityMessageResult.verificationResult.message}"`
          : `[VERIFICATION NEEDED] ${identityMessageResult.verificationResult.message}`,
        priority: 100,
      });
    }

    if (identityMessageResult.contactDetected) {
      injections.push({
        category: 'contact_detected',
        content: `[CONTACT SAVED] User provided their contact info! Thank them warmly and naturally - you can now follow up with them between sessions.`,
        priority: 50,
      });
    }
  }

  // Update userData for handoff system
  const { currentTopic, analysis } = analysisResult;
  if (userData) {
    userData.lastTopic = currentTopic;
    userData.lastUserMessage = userText;
    userData.lastEmotionAnalysis = {
      primary: analysis.emotion.primary,
      intensity: analysis.emotion.intensity || 0.5,
      distressLevel: analysis.emotion.distressLevel,
    };

    try {
      userData.richEmotion = analyzeRichEmotion({
        text: userText,
        textEmotion: {
          primary: analysis.emotion.primary,
          intensity: analysis.emotion.intensity || 0.5,
          secondaryEmotions: analysis.emotion.secondary ? [analysis.emotion.secondary] : undefined,
          confidence: analysis.emotion.confidence,
        },
        voiceEmotion: userData.voiceEmotion
          ? {
              primary: userData.voiceEmotion.primary || 'neutral',
              confidence: userData.voiceEmotion.confidence || 0,
              valence: userData.voiceEmotion.valence,
              arousal: userData.voiceEmotion.arousal,
              dominance: userData.voiceEmotion.dominance,
              stressLevel: userData.voiceEmotion.stressLevel,
            }
          : undefined,
        sessionId: services.sessionId,
      });
    } catch {
      // Non-blocking
    }

    updateUserContextForHandoff({
      lastUserMessage: userText,
      emotionAnalysis: userData.lastEmotionAnalysis,
    });
  }

  // Track response quality
  if (userData.lastAgentResponse) {
    const responseTurnCount = userData.turnCount || 1;
    const wasStoryTold = userData.lastStoryTurn === responseTurnCount - 1;
    const lastStoryId =
      wasStoryTold && userData.storiesShared?.length
        ? userData.storiesShared[userData.storiesShared.length - 1]
        : undefined;

    const questionMatch = userData.lastAgentResponse.match(/(?:^|[.!]\s*)([A-Z][^?]*\?)/g);
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

  // Persist humanizing state
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

  // INTELLIGENT OUTREACH
  const { userId } = services;
  if (userId && userText.length > 10) {
    publishOutreachExtraction(userId, services.sessionId, {
      message: userText,
    });
  }

  // CROSS-SESSION REFLECTION
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

  // PERIODIC AUTO-SAVE
  const currentTurnCount = userData.turnCount || 0;
  const AUTO_SAVE_INTERVAL = 3;
  if (
    services.saveProfile &&
    services.userProfile &&
    currentTurnCount > 0 &&
    currentTurnCount % AUTO_SAVE_INTERVAL === 0
  ) {
    safeFireAndForget(async () => services.saveProfile!(), {
      context: 'periodic-auto-save',
      critical: true,
    });
    diag.debug('Periodic auto-save triggered', { turnCount: currentTurnCount });
  }

  const elapsedMs = Date.now() - startTime;
  recordTurnTiming(elapsedMs);

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

  const lastValueEvent = (userData as Record<string, unknown>).lastValueEvent as
    | { type: string; eventId: string }
    | undefined;
  const shouldPromptValue = (userData as Record<string, unknown>).shouldPromptValueCapture;

  const valueCaptureResult = lastValueEvent
    ? {
        type: lastValueEvent.type,
        eventId: lastValueEvent.eventId,
        shouldPrompt: !!shouldPromptValue,
      }
    : undefined;

  const advancedHumanization = advancedHumanizationResult
    ? {
        responsePrefix: advancedHumanizationResult.responsePrefix,
        responseSuffix: advancedHumanizationResult.responseSuffix,
        stopDirectAdvice: advancedHumanizationResult.stopDirectAdvice,
        toneGuidance: advancedHumanizationResult.toneGuidance,
        lengthGuidance: advancedHumanizationResult.lengthGuidance,
      }
    : undefined;

  // SMART FILTERING
  const crisisDetected = injections.some(
    (inj) => inj.category === 'safety' || inj.category === 'crisis_response'
  );
  const conversationMode = detectConversationMode(
    ctx.userText,
    emotionalState.intensity,
    crisisDetected
  );

  // INJECTION DEDUPLICATION
  const deduplicatedInjections = deduplicateInjections(injections);
  if (deduplicatedInjections.length < injections.length) {
    diag.debug('⚡ Injection deduplication', {
      before: injections.length,
      after: deduplicatedInjections.length,
      removed: injections.length - deduplicatedInjections.length,
    });
  }

  // SMART CONTEXT ROUTING
  let filteredInjections: ContextInjection[];
  let selectionDecision: SelectionDecision | undefined;

  const useSmartRouting = process.env.USE_SMART_CONTEXT_ROUTING === 'true';

  if (useSmartRouting && services.userId && services.sessionId) {
    selectionDecision = await smartSelectInjections(deduplicatedInjections, {
      userId: services.userId,
      sessionId: services.sessionId,
      userText: ctx.userText,
      emotionalIntensity: emotionalState.intensity,
      crisisDetected,
      useSmartSelection: true,
    });
    filteredInjections = selectionDecision.selected;

    diag.debug('🧠 Smart context routing', {
      algorithm: selectionDecision.algorithm,
      confidence: selectionDecision.confidence.toFixed(2),
      selected: selectionDecision.selected.length,
      rejected: selectionDecision.rejected.length,
      mode: selectionDecision.mode,
      processingTimeMs: selectionDecision.processingTimeMs,
    });
  } else {
    filteredInjections = filterInjections(deduplicatedInjections, {
      mode: conversationMode,
      userText: ctx.userText,
      emotionalIntensity: emotionalState.intensity,
      crisisDetected,
    });
  }

  // TIMING-AWARE DEGRADATION
  if (services.sessionId) {
    const timingState = await getTimingState(services.sessionId);
    const degradationResult = applyTimingAwareDegradation(
      filteredInjections,
      services.sessionId,
      timingState
    );

    if (degradationResult.degradationApplied) {
      diag.debug('⏱️ Timing-aware degradation applied', {
        pressureLevel: degradationResult.pressureLevel,
        before: filteredInjections.length,
        after: degradationResult.injections.length,
        userWaitingTime: timingState?.userWaitingTime,
        toolsInFlight: timingState?.toolsInFlight.length,
      });
      filteredInjections = degradationResult.injections;
    }
  }

  // FEEDBACK: Tag injections for tracking
  const trackedInjections = services.sessionId
    ? tagInjectionsForTracking(filteredInjections, services.sessionId)
    : undefined;

  // SEMANTIC ROUTING: Apply routing result
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
      const topMatch = routingResult.routeResult.matches[0];
      const { confidence } = semanticRouting.metrics;

      diag.state('🎯 Semantic routing: Tool hint added to context', {
        toolId: topMatch.toolId,
        confidence,
        matchPath: semanticRouting.metrics.matchPath,
      });

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

  // RESONANCE CHECK
  let resonanceCheck: ResonanceCheckResult = { shouldCheck: false };

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

      filteredInjections.push({
        category: 'resonance_check',
        content: nextCheck.instructions,
        priority: 70,
      });

      diag.info('📊 Resonance check triggered', {
        capability: nextCheck.capability,
        turnCount,
      });
    }
  }

  // DEV TELEMETRY: Complete trace
  trace?.complete();

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
      trackedInjections,
    },
    emotional: emotionalState,
    response: responseGuidance,
    identity: identityContext,
    bundleRuntime: bundleRuntimeContext,
    easterEgg,
    valueCapture: valueCaptureResult,
    advancedHumanization,
    crisis: {
      isCrisis: crisisResult.isCrisis,
      severity: crisisResult.severity,
      indicators: crisisResult.indicators,
      suggestedResponse: crisisResult.suggestedResponse,
      shouldOverrideLLM: preResponseGuard.shouldBlock,
    },
    trustContext: trustContextSummary,
    semanticRouting,
    resonanceCheck,
    memoryIntelligence: ctx.lastSurfacedMemoryIds?.length
      ? {
          surfacedMemoryIds: ctx.lastSurfacedMemoryIds,
          surfacingCount: ctx.surfacingCount || 0,
          memoriesSurfacedThisSession: ctx.memoriesSurfacedThisSession || [],
        }
      : undefined,
  };
}
