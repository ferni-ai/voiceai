/**
 * Transcript Processing Handlers
 *
 * Collection of specialized processing functions for different aspects
 * of transcript handling. Each function handles a specific concern.
 *
 * Extracted from transcript-handler.ts to reduce file size.
 *
 * @module voice-agent/transcript-processing-handlers
 */

import type { voice } from '@livekit/agents';
import type { PersonaConfig } from '../../personas/types.js';
import type { SilenceContext } from '../../personas/meaningful-silence.js';
import type { ConversationManager } from '../../services/conversation-manager.js';
import { diag } from '../../services/diagnostic-logger.js';
import { checkTrialStatus } from '../../services/first-taste-trial.js';
import type { SessionServices } from '../../services/index.js';
import { setHumanListeningResult } from '../../intelligence/context-builders/emotional/human-listening.js';
import { getHumanListeningPipeline } from '../../speech/human-listening-pipeline.js';
import { processTranscriptForBetterThanHuman } from '../integrations/better-than-human-integration.js';
import { coordinatedSay } from '../../speech/coordination/index.js';
import { getDJController } from '../../audio/index.js';
import { createTeamHuddleTrigger, detectTeamHuddleRequest } from '../../services/engagement/engagement-conversation-triggers.js';
import { cleanupStaleCheckIns, processDailyCheckIn, type DailyCheckInContext } from './daily-checkin-handler.js';
import type { ConversationContext as FeedbackContext } from '../../tools/optimization/feedback-collector.js';
import { fireAndForget, safeFireAndForget } from '../../utils/safe-fire-and-forget.js';
import type { UserData } from '../shared/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ProcessingHandlerContext {
  sendDataMessage?: (type: string, payload: Record<string, unknown>) => Promise<void>;
}

// ============================================================================
// TRIAL STATUS PROCESSING
// ============================================================================

/**
 * Process trial status for First Taste Trial users
 */
export function processTrialStatus(
  userId: string | undefined,
  userData: UserData,
  services: SessionServices,
  session: voice.AgentSession<UserData>,
  conversationManager: ConversationManager,
  sessionId: string
): void {
  if (!userData.isTrialUser || !userId || userData.hasSpokenTrialEndPrompt) {
    return;
  }

  fireAndForget(async () => {
    const sessionDurationMs = Date.now() - services.sessionStartTime;
    const trialStatus = await checkTrialStatus(userId, sessionDurationMs);

    userData.trialStatus = {
      inTrial: trialStatus.inTrial,
      timeRemainingMs: trialStatus.timeRemainingMs,
      approachingEnd: trialStatus.approachingEnd,
      trialEnded: trialStatus.trialEnded,
    };

    if (trialStatus.showTransition && trialStatus.transitionPrompt) {
      userData.hasSpokenTrialEndPrompt = true;

      setTimeout(() => {
        try {
          if (session && !conversationManager.isAgentSpeaking()) {
            coordinatedSay(sessionId, trialStatus.transitionPrompt!, { allowInterruptions: true });
          } else if (session) {
            setTimeout(() => {
              try {
                if (session && !conversationManager.isAgentSpeaking()) {
                  coordinatedSay(sessionId, trialStatus.transitionPrompt!, { allowInterruptions: true });
                }
              } catch {}
            }, 3000);
          }
        } catch (sayErr) {
          diag.warn('Failed to speak trial transition', { error: String(sayErr) });
        }
      }, 2000);
    }
  }, 'trial-status-check');
}

// ============================================================================
// HUMAN LISTENING PIPELINE
// ============================================================================

/**
 * Process transcript through human listening pipeline for distress detection
 */
export function processHumanListeningPipeline(
  transcript: string,
  userData: UserData,
  sessionId: string
): void {
  safeFireAndForget(
    async () => {
      const pipeline = getHumanListeningPipeline(sessionId);

      const prosodyFeatures = userData.voiceEmotion?.prosody
        ? {
            pitchVariance: userData.voiceEmotion.prosody.pitchVariance,
            jitter: userData.voiceEmotion.prosody.jitter,
            shimmer: userData.voiceEmotion.prosody.shimmer,
            breathiness: userData.voiceEmotion.prosody.breathiness,
            energyMean: userData.voiceEmotion.prosody.energyMean,
            energyVariance: userData.voiceEmotion.prosody.energyVariance,
            speechRate: userData.voiceEmotion.prosody.speechRate,
            pauseDuration: userData.voiceEmotion.prosody.pauseDuration,
            pauseFrequency: userData.voiceEmotion.prosody.pauseFrequency,
            utteranceDuration: userData.voiceEmotion.prosody.utteranceDuration,
            voiceQuality: userData.voiceEmotion.prosody.voiceQuality,
          }
        : undefined;

      const listeningResult = await pipeline.analyze({
        sessionId,
        text: transcript,
        turnNumber: userData.turnCount || 1,
        currentTopic: userData.lastTopic,
        emotion: userData.lastEmotionAnalysis?.primary,
        emotionalIntensity: userData.lastEmotionAnalysis?.intensity,
        durationMs: userData.voiceEmotion?.prosody?.utteranceDuration,
        prosodyFeatures,
        timeSinceAgentMessage: userData.lastAgentResponseTime
          ? Date.now() - userData.lastAgentResponseTime
          : undefined,
      });

      setHumanListeningResult(sessionId, listeningResult);

      if (listeningResult.possibleDistress) {
        diag.warn('Human listening: Distress signals detected', {
          signals: listeningResult.prioritySignals,
          guidance: listeningResult.agentGuidance,
        });
      } else if (listeningResult.shouldSlowDown) {
        diag.state('Human listening: User needs slower pace', {
          assessment: listeningResult.overallAssessment.slice(0, 100),
        });
      }
    },
    { context: 'human-listening-pipeline' }
  );
}

// ============================================================================
// BETTER THAN HUMAN PROCESSING
// ============================================================================

/**
 * Process transcript for "Better Than Human" features
 */
export function processBetterThanHumanTranscript(
  transcript: string,
  userData: UserData,
  sessionId: string,
  personaId: string
): void {
  safeFireAndForget(
    async () => {
      const result = await processTranscriptForBetterThanHuman(
        {
          transcript,
          isFinal: true,
          emotion: userData.lastEmotionAnalysis?.primary,
          emotionIntensity: userData.lastEmotionAnalysis?.intensity,
          topic: userData.lastTopic,
        },
        {
          userId: userData.userId || '',
          sessionId,
          personaId,
          turnCount: userData.turnCount || 0,
        }
      );

      if (result.vulnerability?.isFirstTime) {
        (userData as Record<string, unknown>).betterThanHumanVulnerability = result.vulnerability;
      }

      if (result.contradiction?.detected) {
        (userData as Record<string, unknown>).betterThanHumanContradiction = result.contradiction;
      }

      if (result.patterns?.insights && result.patterns.insights.length > 0) {
        (userData as Record<string, unknown>).betterThanHumanPatterns = result.patterns;
      }
    },
    { context: 'better-than-human-transcript' }
  );
}

// ============================================================================
// GAME TOPIC CHANGE DETECTION
// ============================================================================

/**
 * Detect topic changes that should end active games
 */
export function processGameTopicChange(
  transcript: string,
  silenceContext: SilenceContext,
  sessionId: string
): void {
  fireAndForget(async () => {
    const {
      isSessionGameActive,
      getSessionGameType,
      detectTopicChange,
      getSessionGameEngine,
      resetSessionGameActivity,
    } = await import('../../services/games/index.js');

    if (isSessionGameActive(sessionId)) {
      type GameType = import('../../services/games/types.js').GameType;
      const gameType = getSessionGameType(sessionId) as GameType | null;
      const hasChangedTopic = detectTopicChange(transcript, gameType);

      if (hasChangedTopic) {
        const engine = getSessionGameEngine(sessionId);
        const gameSession = engine.endGame();
        resetSessionGameActivity(sessionId);

        diag.state('Game auto-ended due to topic change', {
          gameType,
          score: gameSession.score,
          rounds: gameSession.roundsPlayed,
        });
      }

      silenceContext.isGameActive = isSessionGameActive(sessionId);
      silenceContext.activeGameType = getSessionGameType(sessionId) || undefined;
    }
  }, 'game-topic-change');
}

// ============================================================================
// VOICE IDENTITY PROCESSING
// ============================================================================

/**
 * Process transcript for voice identity verification
 */
export function processVoiceIdentity(
  sessionId: string,
  transcript: string,
  userData: UserData
): void {
  fireAndForget(async () => {
    const { onUserMessage } = await import('../../services/trust-and-identity/voice-agent-integration.js');
    const emotionalIntensity = userData?.lastEmotionAnalysis?.intensity ?? 0;
    const identityUpdate = await onUserMessage(sessionId, transcript, emotionalIntensity);

    if (identityUpdate.shouldAskForContact ?? false) {
      diag.state('Identity: Should ask for contact', {
        reason: identityUpdate.contactAskReason ?? 'unknown',
      });
    }

    if (identityUpdate.requiresVerification ?? false) {
      diag.state('Identity: Verification required', {
        reason: 'Speaker or content change detected',
      });
    }
  }, 'voice-identity-processing');
}

// ============================================================================
// DJ SESSION FLOW TRACKING
// ============================================================================

/**
 * Track session flow for DJ/music features
 */
export function processDJSessionFlow(transcript: string, userData: UserData): void {
  fireAndForget(async () => {
    const djController = getDJController();
    const transcriptLower = transcript.toLowerCase();

    const topicKeywords: Record<string, string[]> = {
      work: ['work', 'job', 'boss', 'meeting', 'project', 'deadline', 'office'],
      family: ['mom', 'dad', 'sister', 'brother', 'family', 'kids', 'parents'],
      health: ['health', 'exercise', 'gym', 'doctor', 'sleep', 'tired', 'sick'],
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some((kw) => transcriptLower.includes(kw))) {
        diag.state('Session flow: detected topic', { topic });
        break;
      }
    }

    if (djController.isMusicActive()) {
      const voiceEmotion = userData.voiceEmotion?.primary || undefined;
      diag.state('User speech during music', {
        hasEmotion: !!voiceEmotion,
        transcript: transcript.slice(0, 50),
        emotion: voiceEmotion,
      });
    }
  }, 'dj-session-flow-tracking');
}

// ============================================================================
// DAILY CHECK-IN PROCESSING
// ============================================================================

/**
 * Process transcript for daily check-in recording
 */
export function processDailyCheckInTranscript(
  transcript: string,
  userData: UserData,
  sessionId: string,
  sendDataMessage?: (type: string, payload: Record<string, unknown>) => Promise<void>
): void {
  if (!userData.userId) {
    return;
  }

  const checkInCtx: DailyCheckInContext = {
    sessionId,
    userId: userData.userId,
    turnCount: userData.turnCount || 0,
    recentTranscripts: userData.recentTranscripts || [],
  };

  if (!userData.recentTranscripts) {
    userData.recentTranscripts = [];
  }
  userData.recentTranscripts.push(transcript);
  if (userData.recentTranscripts.length > 10) {
    userData.recentTranscripts.shift();
  }

  fireAndForget(async () => {
    const recorded = await processDailyCheckIn(transcript, checkInCtx, sendDataMessage);
    if (recorded) {
      diag.state('Daily check-in recorded successfully', { sessionId });
      cleanupStaleCheckIns();
    }
  }, 'daily-check-in-processing');
}

// ============================================================================
// FEEDBACK COLLECTION
// ============================================================================

/**
 * Collect feedback for tool optimization
 */
export function processFeedbackCollection(
  transcript: string,
  userData: UserData,
  sessionId: string,
  sessionPersona: PersonaConfig,
  autoOptimizer: {
    processUserMessage: (
      message: string,
      context: FeedbackContext,
      lastToolId: string | undefined
    ) => void;
  }
): void {
  try {
    const toolExecData = userData.conversationState?.getToolExecutionData?.();
    const recentTools = toolExecData?.recentlyUsedTools || [];
    const lastToolResult = toolExecData?.lastToolResult;
    const lastToolId = toolExecData?.lastToolCalled;

    const feedbackContext: FeedbackContext = {
      userId: userData.userId || 'anonymous',
      sessionId,
      agentId: sessionPersona.id,
      turnNumber: userData.turnCount || 0,
      recentTools,
      lastToolResult,
    };

    if (autoOptimizer) {
      try {
        autoOptimizer.processUserMessage(transcript, feedbackContext, lastToolId);
      } catch (err) {
        diag.debug('Feedback processing error', { error: String(err) });
      }
    }
  } catch (feedbackError) {
    diag.warn('Feedback collection error', { error: String(feedbackError) });
  }
}

// ============================================================================
// TEAM HUDDLE DETECTION
// ============================================================================

/**
 * Detect requests for team huddles
 */
export function processTeamHuddleDetection(
  transcript: string,
  personaId: string,
  sendDataMessage?: (type: string, payload: Record<string, unknown>) => Promise<void>
): void {
  try {
    const detection = detectTeamHuddleRequest(transcript);

    if (detection.detected && detection.confidence >= 0.7) {
      diag.info('Team huddle request detected', {
        confidence: detection.confidence,
        phrase: detection.phrase,
      });

      const trigger = createTeamHuddleTrigger(personaId, transcript);

      const message = {
        triggerType: trigger.type,
        personaId: trigger.personaId,
        message: trigger.message,
        data: trigger.data,
      };

      void sendDataMessage?.('engagement_trigger', message);

      diag.info('Team huddle trigger sent', {
        triggerType: trigger.type,
        topic: trigger.data?.topic,
      });
    }
  } catch (err) {
    diag.debug('Team huddle detection error (non-fatal)', { error: String(err) });
  }
}

export default {
  processTrialStatus,
  processHumanListeningPipeline,
  processBetterThanHumanTranscript,
  processGameTopicChange,
  processVoiceIdentity,
  processDJSessionFlow,
  processDailyCheckInTranscript,
  processFeedbackCollection,
  processTeamHuddleDetection,
};
