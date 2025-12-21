/**
 * Voice Agent Turn Handler
 *
 * Orchestrates the processing of each user turn with:
 * - Slash command detection
 * - Turn processing via TurnProcessor
 * - "Better Than Human" personality injection
 * - Context injection for LLM
 * - Event dispatch (emotion, behavior, celebration)
 * - Trust systems recording
 * - Dead air prevention (thinking fillers, error recovery)
 *
 * This module has been refactored from a 1065-line monolith into focused modules:
 * - turn-personality.ts - Personality system integration
 * - turn-events.ts - Event dispatch to frontend
 * - turn-learning.ts - Trust systems and collective learning
 *
 * @module voice-agent/turn-handler
 */

import { log, type llm } from '@livekit/agents';
import { getGracefulErrorResponse } from '../../intelligence/conversation-quality.js';
import type { BundleRuntimeEngine } from '../../personas/bundles/index.js';
import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import { getThinkingFiller } from '../../speech/persona-phrases.js';
import type { SessionStateManager } from '../session/session-state.js';
import { PROCESSING_TIMEOUTS } from '../shared/constants.js';
import type { UserData } from '../shared/types.js';
import { handleSlashCommand, sendCelebrationEvents } from './index.js';

// Import extracted modules
import {
  processPersonality,
  cleanupPersonalityState as cleanupPersonalityStateInternal,
  type PersonalityContext,
} from './turn-personality.js';
import { dispatchAllTurnEvents, type EventDispatchContext } from './turn-events.js';
import { recordAllLearningData, type LearningContext } from './turn-learning.js';

// Performance optimization imports
import {
  getTurnProfiler,
  startTurnProfiling,
  markTurnCheckpoint,
  completeTurnProfiling,
} from '../shared/performance/turn-profiler.js';
import { speculateTTS } from '../shared/performance/speculative-tts.js';

// Re-export cleanupPersonalityState for backwards compatibility
export { cleanupPersonalityState } from './turn-personality.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TurnHandlerContext {
  /** LLM chat context */
  turnCtx: llm.ChatContext;
  /** User message text */
  userText: string;
  /** Current persona config */
  persona: PersonaConfig;
  /** Bundle runtime (optional) */
  bundleRuntime?: BundleRuntimeEngine;
  /** Session services */
  services: SessionServices;
  /** User data (proxy to SessionStateManager) */
  userData: {
    turnCount?: number;
    extensibilitySessionPrompt?: string | null;
    preSessionBriefing?: string;
    // Voice/prosody signals for personality system (optional)
    speechRateWPM?: number;
    pauseBeforeMs?: number;
    totalConversations?: number;
    sharedVulnerabilities?: number;
    relationshipStage?: string;
    lastEmotionAnalysis?: { primary: string; intensity: number; distressLevel?: number };
    // macOS context from menubar app (sent via data channel)
    macOS?: import('../../intelligence/context-builders/macos-context.js').MacOSContextPayload;
  };
  /** Voice emotion result (optional, from voice agent) */
  voiceEmotion?: {
    primary: string;
    confidence: number;
    arousal?: number;
    valence?: number;
  };
  /** Session state manager (single source of truth) */
  sessionStateManager?: SessionStateManager;
  /** Current session for speaking */
  currentSession?: {
    say: (text: string, opts?: { allowInterruptions?: boolean }) => void;
  };
  /** Room for data messages (optional) */
  room?: {
    localParticipant?: {
      publishData: (data: Uint8Array, opts: { reliable: boolean }) => Promise<void>;
    };
  };
  /** Send data message callback */
  sendDataMessage: (type: string, payload: Record<string, unknown>) => Promise<void>;
  /** Previous turn history for personality system */
  previousTurns?: Array<{
    userTranscript: string;
    speechRate?: number;
    pauseBefore?: number;
    voiceEmotion?: string;
    topics?: string[];
  }>;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Process a completed user turn.
 *
 * This is the main turn processing pipeline that orchestrates:
 * 1. Slash command detection and handling
 * 2. Turn processing through TurnProcessor
 * 3. Crisis detection and safety rails
 * 4. Personality system integration
 * 5. Context injection into LLM
 * 6. Session state updates
 * 7. Extensibility hooks
 * 8. Event dispatch (emotion, behavior, celebration)
 * 9. Trust systems recording
 * 10. Error recovery with graceful fallbacks
 */
export async function handleUserTurn(ctx: TurnHandlerContext): Promise<void> {
  const {
    turnCtx,
    userText,
    persona,
    bundleRuntime,
    services,
    userData,
    sessionStateManager,
    currentSession,
    room,
    sendDataMessage,
  } = ctx;
  const logger = log();

  if (!userText || userText.trim().length === 0) {
    return;
  }

  // ================================================================
  // PERFORMANCE: Start turn profiling
  // ================================================================
  const turnNumber = userData.turnCount || 1;
  startTurnProfiling(services.sessionId, turnNumber);

  // ================================================================
  // EXTENSIBILITY: Slash command detection
  // ================================================================
  const trimmedText = userText.trim();
  if (trimmedText.startsWith('/')) {
    const slashResult = await handleSlashCommand({
      text: trimmedText,
      turnCtx,
      personaId: persona.id,
      services: { userId: services.userId, sessionId: services.sessionId },
    });
    if (slashResult.handled) {
      return; // Slash command fully handled
    }
  }

  try {
    // Import the turn processor (cached after first load)
    const { processTurn, injectTurnContext, getCelebrationEvents } =
      await import('../processors/index.js');

    // Build turn context - cast userData to UserData for processor compatibility
    const turnContext = {
      turnCtx,
      userText,
      persona,
      bundleRuntime,
      services,
      userData: userData as UserData,
      logger,
    };

    // ================================================================
    // DEAD AIR FIX: Timeout wrapper for turn processing
    // ================================================================
    let spokeFiller = false;
    let fillerTimeout: ReturnType<typeof setTimeout> | null = null;

    // Schedule filler if processing takes too long
    const fillerPromise = new Promise<void>((resolve) => {
      fillerTimeout = setTimeout(() => {
        if (!spokeFiller && currentSession) {
          spokeFiller = true;
          // DEAD AIR FIX: Use getThinkingFiller for actual verbal content
          // getContextAwareThinkingFiller returns empty strings (by design for LLM responses)
          // But dead air prevention NEEDS verbal content like "Mm", "Yeah", "So..."
          const filler = getThinkingFiller(persona.id);
          currentSession.say(filler, { allowInterruptions: true });
          diag.filler('Spoke dead air thinking filler', {
            personaId: persona.id,
            filler,
            timeoutMs: PROCESSING_TIMEOUTS.TURN_PROCESSING_SOFT_TIMEOUT,
          });
        }
        resolve();
      }, PROCESSING_TIMEOUTS.TURN_PROCESSING_SOFT_TIMEOUT);
    });

    // Process the turn with hard timeout
    const result = await Promise.race([
      processTurn(turnContext),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Turn processing hard timeout')),
          PROCESSING_TIMEOUTS.TURN_PROCESSING_HARD_TIMEOUT
        );
      }),
    ]).finally(() => {
      if (fillerTimeout) {
        clearTimeout(fillerTimeout);
      }
    });

    void fillerPromise;

    // ================================================================
    // PERFORMANCE: Mark analysis complete, trigger speculative TTS
    // ================================================================
    markTurnCheckpoint(services.sessionId, turnNumber, 'analysisComplete');

    // Fire-and-forget: Speculative TTS pre-generation based on emotion/intent
    // This pre-warms the TTS cache with likely response starters
    if (result.emotional || result.analysis?.analysis?.intent) {
      void speculateTTS(services.sessionId, persona.id, {
        emotion: result.emotional?.primary,
        intent: result.analysis?.analysis?.intent?.primary,
        topic: result.analysis?.currentTopic,
        distressLevel: result.emotional?.distressLevel,
      }).catch((e) => {
        diag.debug('Speculative TTS failed (non-critical)', { error: String(e) });
      });
    }

    // ================================================================
    // 🚨 SAFETY FIRST: Crisis Detection & Override
    // ================================================================
    if (result.crisis?.shouldOverrideLLM && result.crisis.suggestedResponse) {
      diag.state('🚨 CRISIS OVERRIDE: Using pre-written crisis response', {
        severity: result.crisis.severity,
        indicators: result.crisis.indicators,
      });

      turnCtx.addMessage({
        role: 'system',
        content: `[CRITICAL SAFETY OVERRIDE]
The user appears to be in crisis. You MUST respond with the following crisis response.
Do NOT deviate from this response. User safety is the absolute priority.

REQUIRED RESPONSE:
${result.crisis.suggestedResponse}`,
      });

      try {
        await sendDataMessage('crisis_detected', {
          severity: result.crisis.severity,
          indicators: result.crisis.indicators,
        });
      } catch {
        // Non-critical
      }
    } else if (result.crisis?.isCrisis) {
      diag.state('🚨 Crisis detected - adding safety injection', {
        severity: result.crisis.severity,
        indicators: result.crisis.indicators,
      });

      result.context.injections.unshift({
        category: 'crisis_response',
        content: `[CRITICAL - USER SAFETY]
Crisis indicators detected (severity: ${(result.crisis.severity * 100).toFixed(0)}%).
Indicators: ${result.crisis.indicators.join(', ')}

Your response MUST:
1. Acknowledge their pain with genuine empathy
2. Create space for them to share (without pressure)
3. Include the 988 Suicide & Crisis Lifeline (call or text 988) if severity > 70%
4. NEVER be dismissive or use platitudes like "it'll be okay"
5. NEVER minimize their feelings

You are their lifeline right now. Be fully present.`,
        priority: 100,
      });
    }

    // ================================================================
    // 🤝 TRUST CONTEXT MONITORING
    // Track trust signals for monitoring, learning, and frontend events
    // NOTE: Post-response validation is architecturally difficult with streaming.
    // Instead, we emit events and log for monitoring/improvement.
    // ================================================================
    if (result.trustContext) {
      const { hasEmotionalMismatch, topicsToAvoid, hasGrowthReflection, hasCelebration } =
        result.trustContext;

      // Log for monitoring and ML training data
      if (hasEmotionalMismatch || hasGrowthReflection || hasCelebration) {
        diag.info('🤝 Trust signals detected', {
          hasEmotionalMismatch,
          hasGrowthReflection,
          hasCelebration,
          topicsToAvoidCount: topicsToAvoid.length,
        });
      }

      // Emit trust signals to frontend for avatar/UI adaptation
      // Frontend can use these to adjust avatar expressions, show subtle cues, etc.
      if (hasEmotionalMismatch) {
        void sendDataMessage('trust_signal', {
          type: 'emotional_mismatch_detected',
          // Frontend should show extra attentive/concerned expression
          avatarHint: 'attentive',
        }).catch((e) => {
          diag.debug('Trust signal send failed (non-critical)', {
            error: String(e),
            type: 'emotional_mismatch',
          });
        });
      }

      if (hasGrowthReflection) {
        void sendDataMessage('trust_signal', {
          type: 'growth_reflection_available',
          // Frontend might show a subtle "remembering" indicator
          avatarHint: 'thoughtful',
        }).catch((e) => {
          diag.debug('Trust signal send failed (non-critical)', {
            error: String(e),
            type: 'growth_reflection',
          });
        });
      }

      if (hasCelebration) {
        void sendDataMessage('trust_signal', {
          type: 'celebration_opportunity',
          // Frontend can prepare celebration animation
          avatarHint: 'joyful',
        }).catch((e) => {
          diag.debug('Trust signal send failed (non-critical)', {
            error: String(e),
            type: 'celebration',
          });
        });
      }

      // Store in userData for potential use in response quality tracking
      (userData as Record<string, unknown>).lastTrustContext = result.trustContext;
    }

    // ================================================================
    // 🎭 PERSONALITY SYSTEM INTEGRATION
    // ================================================================
    const personalityCtx: PersonalityContext = {
      sessionId: services.sessionId,
      userId: services.userId ?? null,
      personaId: persona.id,
      turnCount: userData.turnCount || 1,
      userText,
      userData,
      voiceEmotion: ctx.voiceEmotion,
      emotionalResult: result.emotional,
      humanizingResult: result.context.humanizingResult as PersonalityContext['humanizingResult'],
      analysisResult: result.analysis?.analysis,
      injections: result.context.injections,
      sessionStateManager,
    };

    const personalityResult = await processPersonality(personalityCtx);

    if (personalityResult.shouldInject && personalityResult.injectionContent) {
      result.context.injections.push({
        category: 'personality',
        content: personalityResult.injectionContent,
        priority: 75,
      });
    }

    // Handle behavior event from personality system
    if (personalityResult.behaviorEvent) {
      const behaviorEventContent = `[SYSTEM_EVENT]\n${JSON.stringify({
        event: personalityResult.behaviorEvent.event,
        data: personalityResult.behaviorEvent.data,
        suggestedResponse: personalityResult.behaviorEvent.suggestedResponse,
        source: 'personality_noticing',
      })}`;

      turnCtx.addMessage({
        role: 'system',
        content:
          `[BEHAVIOR SYSTEM - Personality Noticing]\n\n${behaviorEventContent}\n\n` +
          `The personality system noticed something. You may call behavior functions in response.`,
      });
    }

    // ================================================================
    // PERFORMANCE: Mark context building complete
    // ================================================================
    markTurnCheckpoint(services.sessionId, turnNumber, 'contextBuildComplete');

    // Inject context into LLM
    injectTurnContext(turnCtx, result);

    // Mark LLM start (LLM inference happens after this point)
    markTurnCheckpoint(services.sessionId, turnNumber, 'llmStart');

    // ================================================================
    // UPDATE SESSION STATE MANAGER
    // ================================================================
    if (sessionStateManager) {
      sessionStateManager.incrementTurn();
      sessionStateManager.setLastUserMessage(userText);

      if (result.emotional) {
        sessionStateManager.setEmotionAnalysis({
          primary: result.emotional.primary,
          intensity: result.emotional.intensity,
          distressLevel: result.emotional.distressLevel,
        });
      }

      if (result.analysis?.currentTopic) {
        sessionStateManager.setTopic(result.analysis.currentTopic);
      }

      const hrRelationship = result.context.humanizingResult?.relationship as
        | { stage?: string }
        | undefined;
      if (hrRelationship?.stage) {
        sessionStateManager.setRelationshipStage(
          hrRelationship.stage as 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor'
        );
      }

      const hrMood = result.context.humanizingResult?.mood as { state?: string } | undefined;
      if (hrMood?.state) {
        type MoodState =
          | 'energized'
          | 'reflective'
          | 'playful'
          | 'grounded'
          | 'tired_but_present'
          | 'philosophical'
          | 'nostalgic';
        sessionStateManager.setMood(hrMood.state as MoodState);
      }

      const themeMentions = result.context.injections
        ?.filter((i) => i.category === 'memory' || i.category === 'continuity')
        .map((i) => i.content)
        .join(' ');
      if (themeMentions) {
        sessionStateManager.recordThemesMentioned(themeMentions);
      }
    }

    // ================================================================
    // EXTENSIBILITY HOOKS
    // ================================================================
    try {
      const { onBeforeResponse } =
        await import('../../personas/bundles/extensibility-integration.js');
      const beforeResponsePrompt = await onBeforeResponse({
        personaId: persona.id,
        userId: services.userId,
        sessionId: services.sessionId,
      });

      if (beforeResponsePrompt) {
        turnCtx.addMessage({
          role: 'system',
          content: `[AGENT EXTENSIBILITY - RESPONSE GUIDANCE]\n${beforeResponsePrompt}`,
        });
      }

      if (userData.extensibilitySessionPrompt && (userData.turnCount ?? 0) <= 1) {
        turnCtx.addMessage({
          role: 'system',
          content: `[AGENT EXTENSIBILITY - SESSION CONTEXT]\n${userData.extensibilitySessionPrompt}`,
        });
      }

      if (userData.preSessionBriefing && (userData.turnCount ?? 0) === 0) {
        turnCtx.addMessage({
          role: 'system',
          content: userData.preSessionBriefing,
        });
      }
    } catch (extHookErr) {
      logger.warn({ error: String(extHookErr) }, 'Extensibility hook failed (non-fatal)');
    }

    // ================================================================
    // PHONE COLLECTION (Human-First 2FA)
    // ================================================================
    try {
      const { getResponseModification } =
        await import('../../services/trust-and-identity/voice-agent-integration.js');
      const phoneAskMod = getResponseModification(services.sessionId);

      if (phoneAskMod.injectPhoneAsk && phoneAskMod.script) {
        turnCtx.addMessage({
          role: 'system',
          content: `[MAGIC MOMENT - PHONE COLLECTION]
This is a perfect emotional moment to naturally ask for their phone number.
Moment type: ${phoneAskMod.momentType}
Emotional tone: ${phoneAskMod.tone}

SUGGESTED ASK (incorporate naturally): "${phoneAskMod.script}"

IMPORTANT:
- Frame this as wanting to follow up/check in, NOT data collection
- Make it feel like YOU want to stay connected, not that you NEED their info
- If they decline, accept gracefully and move on
- Don't repeat if already asked this session`,
        });
      }
    } catch {
      // Non-critical
    }

    // ================================================================
    // EVENT DISPATCH (Celebration, Mood, Emotion, Behavior)
    // ================================================================
    const celebrations = getCelebrationEvents(result);
    if (celebrations.length > 0) {
      await sendCelebrationEvents({ injections: celebrations, room });
    }

    const eventCtx: EventDispatchContext = {
      userId: services.userId ?? null,
      personaId: persona.id,
      sessionId: services.sessionId,
      turnCount: userData.turnCount ?? 0,
      emotionalResult: result.emotional,
      humanizingResult: result.context.humanizingResult as EventDispatchContext['humanizingResult'],
      injections: result.context.injections,
      sessionStateManager,
      sendDataMessage,
      turnCtx,
    };

    await dispatchAllTurnEvents(eventCtx);

    // ================================================================
    // LEARNING & TRUST RECORDING
    // ================================================================
    const learningCtx: LearningContext = {
      userId: services.userId ?? null,
      sessionId: services.sessionId,
      personaId: persona.id,
      turnCount: userData.turnCount ?? 0,
      userText,
      emotionalResult: result.emotional,
      humanizingResult: result.context.humanizingResult as LearningContext['humanizingResult'],
      injections: result.context.injections,
      turnResult: {
        emotional: result.emotional,
        context: {
          humanizingResult: result.context.humanizingResult,
        },
      },
    };

    await recordAllLearningData(learningCtx);

    // ================================================================
    // PERFORMANCE: Complete turn profiling
    // ================================================================
    const turnMetrics = completeTurnProfiling(services.sessionId, turnNumber);
    if (turnMetrics && (turnMetrics.tier === 'slow' || turnMetrics.tier === 'critical')) {
      diag.warn('Turn latency above threshold', {
        totalMs: turnMetrics.latencies.totalTurnMs,
        bottleneck: turnMetrics.bottleneck.component,
        tier: turnMetrics.tier,
      });
    }

    logger.info(
      {
        elapsedMs: result.context.elapsedMs,
        contextCount: result.context.injections.length,
        emotion: result.emotional.primary,
        turnMetrics: turnMetrics
          ? {
              totalMs: turnMetrics.latencies.totalTurnMs,
              ttfa: turnMetrics.latencies.timeToFirstAudioMs,
              tier: turnMetrics.tier,
            }
          : undefined,
      },
      'Turn processed successfully'
    );
  } catch (error) {
    logger.error({ error: String(error) }, 'Turn processing failed');

    // ================================================================
    // DEAD AIR FIX: Graceful error recovery
    // ================================================================
    const isTimeout = String(error).includes('timeout');
    const errorType = isTimeout ? 'api_timeout' : 'general';
    const gracefulError = getGracefulErrorResponse(errorType, String(error));

    if (currentSession) {
      try {
        currentSession.say(gracefulError.userMessage, { allowInterruptions: true });
        diag.state('Spoke graceful error recovery', {
          errorType,
          recoverable: gracefulError.recoverable,
        });
      } catch (sayError) {
        logger.error({ error: String(sayError) }, 'Failed to speak error recovery');
      }
    }
  }
}

export default handleUserTurn;
