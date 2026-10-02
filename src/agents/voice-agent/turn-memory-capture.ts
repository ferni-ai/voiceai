/**
 * Turn memory capture (turn-handler path).
 *
 * DYNAMIC MEMORY CAPTURE: LLM-powered extraction with temporal decoupling.
 * Fast capture (< 50ms) runs first, deep extraction runs async in background;
 * the turn is recorded to the STM buffer. Fire-and-forget so it never blocks
 * turn completion.
 *
 * @module agents/voice-agent/turn-memory-capture
 */

import { fastCapture } from '../../memory/dynamic/index.js';
import { diag } from '../../services/diagnostic-logger.js';
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';
import type { UserData } from '../shared/types.js';

export interface TurnMemoryCaptureInput {
  userId: string;
  sessionId: string;
  turnNumber: number;
  userText: string;
  /** Primary emotion from text analysis (preferred over the voice reading) */
  analysisEmotion?: string;
  /** Voice emotion reading for this turn, if any */
  voiceEmotion: UserData['voiceEmotion'];
  personaId: string;
  /** Firestore conversation ID (fact provenance) */
  conversationId?: string;
}

/** Capture this turn into dynamic memory in the background. */
export function captureTurnMemory(input: TurnMemoryCaptureInput): void {
  const { userId: captureUserId, sessionId, turnNumber, userText, personaId } = input;
  const voiceEmotionForCapture = input.voiceEmotion;

  fireAndForget(async () => {
    const captureResult = await fastCapture({
      userId: captureUserId,
      sessionId,
      turnNumber,
      transcript: userText,
      voiceEmotion: input.analysisEmotion ?? voiceEmotionForCapture?.primary,
      personaId, // For multi-persona data attribution
      conversationId: input.conversationId, // fact provenance
    });

    // Map voice emotion to STM-compatible shape (for emotional trajectory)
    const voiceEmotionSnapshot =
      voiceEmotionForCapture && typeof voiceEmotionForCapture.primary === 'string'
        ? {
            primary: voiceEmotionForCapture.primary,
            confidence: voiceEmotionForCapture.confidence ?? 0.5,
            stressLevel: voiceEmotionForCapture.stressLevel ?? 0.3,
            valence: voiceEmotionForCapture.valence ?? 0,
            arousal: voiceEmotionForCapture.arousal ?? 0.5,
          }
        : undefined;

    // 🧠 CRITICAL: Record to STM buffer for session context
    // This enables wasEntityMentioned(), buildSTMContext(), and session-end promotion
    const { recordTurn } = await import('../../memory/dynamic/index.js');
    recordTurn(
      sessionId,
      captureUserId,
      captureResult,
      userText,
      turnNumber,
      personaId,
      voiceEmotionSnapshot
    );

    // voice-session-store removed during DDD cleanup

    // 🧠 MEMORY AUDIT: Log capture results (upgraded to info level)
    diag.info('🧠 [MEMORY-AUDIT] turn-handler memory capture DONE', {
      userId: captureUserId,
      sessionId,
      turnNumber,
      entityCount: captureResult.mentionedEntities.length,
      topicCount: captureResult.topicHints.length,
      emotionCount: captureResult.emotionSignals.length,
      asyncJobId: captureResult.asyncJobId,
      captureTimeMs: captureResult.captureTimeMs,
    });
  }, 'dynamic-memory-capture');
}
