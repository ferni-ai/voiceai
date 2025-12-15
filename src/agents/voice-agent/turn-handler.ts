/**
 * Voice Agent Turn Handler
 *
 * Handles the completion of each user turn with:
 * - Slash command detection
 * - Turn processing via TurnProcessor
 * - Context injection for LLM
 * - Celebration events
 * - Trust systems recording
 * - Dead air prevention (thinking fillers, error recovery)
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/turn-handler
 */

import { log, type llm } from '@livekit/agents';
import { getGracefulErrorResponse } from '../../intelligence/conversation-quality.js';
import {
  analyzeUserEngagement,
  recordResponseForLearning,
  type ConversationSignalContext,
} from '../../intelligence/index.js';
import type { BundleRuntimeEngine } from '../../personas/bundles/index.js';
import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import { getThinkingFiller } from '../../speech/persona-phrases.js';
import { dispatchEmotionEvents } from '../realtime/emotion-event-dispatcher.js';
import type { SessionStateManager } from '../session/session-state.js';
import { PROCESSING_TIMEOUTS } from '../shared/constants.js';
import { handleSlashCommand, recordTrustSystemsData, sendCelebrationEvents } from './index.js';

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
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Process a completed user turn.
 *
 * This is the main turn processing pipeline that:
 * 1. Detects and handles slash commands
 * 2. Processes the turn through TurnProcessor
 * 3. Injects context into LLM
 * 4. Handles extensibility hooks
 * 5. Sends celebration events
 * 6. Records trust systems data
 * 7. Prevents dead air with fillers and error recovery
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
  // EXTENSIBILITY: Slash command detection
  // ================================================================
  const trimmedText = userText.trim();
  let _isSlashCommand = false;
  if (trimmedText.startsWith('/')) {
    const slashResult = await handleSlashCommand({
      text: trimmedText,
      turnCtx,
      personaId: persona.id,
      services: { userId: services.userId, sessionId: services.sessionId },
    });
    _isSlashCommand = slashResult.handled;
  }

  try {
    // Import the turn processor (cached after first load)
    const { processTurn, injectTurnContext, getCelebrationEvents } =
      await import('../processors/index.js');

    // Build turn context
    const turnContext = {
      turnCtx,
      userText,
      persona,
      bundleRuntime,
      services,
      userData,
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
          const filler = getThinkingFiller(persona.id);
          currentSession.say(filler, { allowInterruptions: true });
          diag.state('Spoke thinking filler (processing slow)', {
            personaId: persona.id,
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

    // Inject context into LLM
    injectTurnContext(turnCtx, result);

    // ================================================================
    // UPDATE SESSION STATE MANAGER (Single Source of Truth)
    // All state updates go through SessionStateManager
    // ================================================================
    if (sessionStateManager) {
      // Increment turn count
      sessionStateManager.incrementTurn();

      // Update last user message
      sessionStateManager.setLastUserMessage(userText);

      // Update emotional state from analysis
      if (result.emotional) {
        sessionStateManager.setEmotionAnalysis({
          primary: result.emotional.primary,
          intensity: result.emotional.intensity,
          distressLevel: result.emotional.distressLevel,
        });
      }

      // Update topic from analysis
      if (result.analysis?.currentTopic) {
        sessionStateManager.setTopic(result.analysis.currentTopic);
      }

      // Update relationship stage from humanizing result
      if (result.context.humanizingResult?.relationship?.stage) {
        sessionStateManager.setRelationshipStage(
          result.context.humanizingResult.relationship.stage
        );
      }

      // Update mood from humanizing result
      if (result.context.humanizingResult?.mood) {
        sessionStateManager.setMood(result.context.humanizingResult.mood.state);
      }

      // Record personal themes mentioned in response
      const themeMentions = result.context.injections
        ?.filter((i) => i.category === 'memory' || i.category === 'continuity')
        .map((i) => i.content)
        .join(' ');
      if (themeMentions) {
        sessionStateManager.recordThemesMentioned(themeMentions);
      }

      diag.state('SessionStateManager updated after turn', {
        turnCount: sessionStateManager.getTurnCount(),
        topic: result.analysis?.currentTopic,
        emotionalPrimary: result.emotional?.primary,
      });
    }

    // ================================================================
    // EXTENSIBILITY: before_response hook
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
        logger.info({ personaId: persona.id }, 'Extensibility before_response hook injected');
      }

      // Session start context for first turns
      const extSessionPrompt = userData.extensibilitySessionPrompt;
      if (extSessionPrompt && (userData.turnCount ?? 0) <= 1) {
        turnCtx.addMessage({
          role: 'system',
          content: `[AGENT EXTENSIBILITY - SESSION CONTEXT]\n${extSessionPrompt}`,
        });
        logger.info({ personaId: persona.id }, 'Extensibility session_start context injected');
      }
    } catch (extHookErr) {
      logger.warn({ error: String(extHookErr) }, 'Extensibility hook failed (non-fatal)');
    }

    // ================================================================
    // HUMAN-FIRST 2FA: Phone ask opportunity
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

        diag.session('Phone ask injected', {
          momentType: phoneAskMod.momentType,
          tone: phoneAskMod.tone,
        });
      }
    } catch (phoneAskErr) {
      logger.debug({ error: String(phoneAskErr) }, 'Phone ask injection skipped');
    }

    // Send celebration events to frontend
    const celebrations = getCelebrationEvents(result);
    if (celebrations.length > 0) {
      await sendCelebrationEvents({ injections: celebrations, room });
    }

    // Send mood update to frontend
    if (result.context.humanizingResult) {
      const hr = result.context.humanizingResult;
      await sendDataMessage('mood', {
        state: hr.mood.state,
        energyLevel: hr.mood.energyLevel,
        relationshipStage: hr.relationship.stage,
        hasTransition: !!hr.relationshipTransition,
      });
    }

    // ================================================================
    // 🚀 FERNI EQ: Dispatch emotion events for "Better Than Human" UI
    // ================================================================
    // This sends humanization signals to the frontend EQ system:
    // - Concern detection (distress awareness)
    // - Voice-text mismatch (protective instinct)
    // - Emotional trajectory (improving/declining arc)
    // The frontend better-than-human.ui.ts responds with avatar expressions
    if (services.userId) {
      try {
        await dispatchEmotionEvents(
          {
            emotionalState: result.emotional,
            userId: services.userId,
            personaId: persona.id,
            sessionId: services.sessionId,
          },
          sendDataMessage
        );
      } catch (eqError) {
        logger.debug({ error: String(eqError) }, 'Emotion event dispatch (non-critical)');
      }
    }

    // ================================================================
    // TRUST SYSTEMS DATA RECORDING
    // ================================================================
    const { userId } = services;
    if (userId) {
      await recordTrustSystemsData({ userId, userText, result });
    }

    // ================================================================
    // COLLECTIVE LEARNING: Record signal for community insights
    // ================================================================
    if (userId && services.sessionId) {
      try {
        // Extract topic from injections if available
        const topicInjection = result.context.injections.find(
          (i) => i.category === 'topics' || i.content.includes('topic')
        );
        const topic = topicInjection?.content.split(' ')[0] || 'general';

        // Build context for collective learning
        const learningContext: ConversationSignalContext = {
          sessionId: services.sessionId,
          userId,
          personaId: persona.id,
          turnNumber: userData.turnCount ?? 0,
          emotion: result.emotional.primary || 'neutral',
          topic,
          relationshipStage: result.context.humanizingResult?.relationship?.stage || 'unknown',
        };

        // Create a simplified emotion result for engagement analysis
        const valence = result.emotional.intensity > 0.5 ? 'positive' : 'neutral';
        const emotionForEngagement = {
          primary: result.emotional.primary as 'neutral',
          intensity: result.emotional.intensity,
          valence: valence as 'positive' | 'neutral' | 'negative',
          distressLevel: result.emotional.distressLevel || 0,
          confidence: 0.8,
          markers: [] as string[],
          suggestedTone: 'warm' as 'warm',
        };

        // Analyze user engagement based on their message
        const engagement = analyzeUserEngagement(
          userText,
          null, // Previous emotion (not tracked here)
          emotionForEngagement
        );

        // Record the response signal (async, non-blocking)
        void recordResponseForLearning(
          learningContext,
          result.context.injections
            .map((i) => i.content)
            .join(' ')
            .slice(0, 500), // Summarize context injections
          engagement,
          {
            hadPersonalShare: result.context.injections.some(
              (i) => i.content.includes('personal') || i.content.includes('story')
            ),
            hadQuirk: result.context.injections.some(
              (i) => i.content.includes('quirk') || i.content.includes('playful')
            ),
            hadTeamReference: result.context.injections.some(
              (i) => i.content.includes('team') || i.content.includes('handoff')
            ),
          }
        );

        logger.debug(
          { emotion: result.emotional.primary, topic: learningContext.topic },
          'Collective learning signal recorded'
        );
      } catch (learningError) {
        logger.debug(
          { error: String(learningError) },
          'Collective learning recording (non-critical)'
        );
      }
    }

    logger.info(
      {
        elapsedMs: result.context.elapsedMs,
        contextCount: result.context.injections.length,
        emotion: result.emotional.primary,
      },
      'Turn processed with TurnProcessor V2'
    );
  } catch (error) {
    logger.error({ error: String(error) }, 'TurnProcessor V2 failed');

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
