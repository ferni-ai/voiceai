/**
 * Coaching Intelligence Processing
 *
 * Handles "Better than Human" pattern tracking and voice signal detection.
 * Extracted from turn-processor.ts for maintainability.
 *
 * This module coordinates:
 * - Voice tracking initialization and turn recording
 * - Pattern detection publishing (cross-session)
 * - Predictive intelligence publishing
 * - Key moment detection
 * - Coaching patterns transcript processing
 */

import { diag } from '../../services/diagnostic-logger.js';
import { safeFireAndForget } from '../../utils/safe-fire-and-forget.js';
import {
  publishPatternDetection,
  publishPredictiveIntelligence,
  publishKeyMoment,
} from '../../services/intelligence-publisher.js';
import { processConversationForLearning } from '../../intelligence/predictive/index.js';
import { processTranscriptForPatterns } from '../../intelligence/coaching-patterns.js';
import { recordVoiceTurn, initializeVoiceTracking } from '../../intelligence/voice-signals.js';
import type { TurnAnalysisResult, TurnContext } from './types.js';
import type { UserData } from '../shared/types.js';
import type { SessionServices } from '../../services/index.js';

/**
 * Input for coaching intelligence processing
 */
export interface CoachingIntelligenceInput {
  /** User's message text */
  userText: string;
  /** Analysis result from message analysis */
  analysisResult: TurnAnalysisResult;
  /** Session services */
  services: SessionServices;
  /** User data */
  userData: UserData;
  /** Persona ID */
  personaId?: string;
}

/**
 * Process coaching intelligence for a turn.
 *
 * This coordinates all "Better than Human" pattern tracking:
 * - Voice tracking (pause detection, energy, topic changes)
 * - Pattern detection (cross-session behavior patterns)
 * - Predictive intelligence (ML model training)
 * - Key moment detection (relationship milestones)
 *
 * All operations are fire-and-forget to avoid blocking turn processing.
 */
export function processCoachingIntelligence(input: CoachingIntelligenceInput): void {
  const { userText, analysisResult, services, userData, personaId } = input;

  if (!services.userId) {
    return;
  }

  const userId = services.userId;
  const sessionId = services.sessionId;

  // Initialize voice tracking for this session if not already done
  initializeVoiceTracking(sessionId);

  // Fire-and-forget: Record voice turn for signal detection
  recordVoiceTurn(sessionId, userText, {
    topic: analysisResult.currentTopic,
    energy: userData?.voiceEmotion?.confidence,
    pauseBeforeMs: userData?.pauseBeforeSpeakingMs,
  });

  // Publish to intelligence worker: Pattern detection (cross-session)
  publishPatternDetection(userId, sessionId, {
    message: userText,
    topic: analysisResult.currentTopic || 'general',
    emotion: analysisResult.analysis.emotion.primary,
  });

  // Publish to intelligence worker: Predictive Intelligence
  publishPredictiveIntelligence(userId, sessionId, {
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

  // Capture previous state for Markov chain transitions (before updating)
  const previousEmotion = userData?.lastEmotionAnalysis?.primary;
  const previousTopic = userData?.lastTopic;

  // TRUE PREDICTIVE INTELLIGENCE: Feed ML models in real-time
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

  // Publish to intelligence worker: Key Moment Detection
  publishKeyMoment(userId, sessionId, {
    personaId: personaId || 'ferni',
    message: userText,
    topic: analysisResult.currentTopic || 'general',
    emotion: analysisResult.analysis.emotion.primary,
    emotionIntensity: analysisResult.analysis.emotion.intensity,
  });
}

/**
 * Process transcript for coaching patterns.
 *
 * This is a separate function that can be called when needed
 * for deeper pattern analysis on transcripts.
 */
export async function processForCoachingPatterns(
  userId: string,
  transcript: string,
  topic: string = 'general'
): Promise<void> {
  try {
    await processTranscriptForPatterns(userId, transcript, topic);
  } catch (error) {
    diag.debug('Coaching patterns processing failed (non-blocking)', { error: String(error) });
  }
}
