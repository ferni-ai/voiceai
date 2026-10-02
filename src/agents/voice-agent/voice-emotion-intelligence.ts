/**
 * Voice Emotion Intelligence Recording
 *
 * Feeds voice emotion detected by the audio processor into the unified
 * intelligence layer.
 *
 * Extracted from audio-processor.ts.
 *
 * @module voice-agent/voice-emotion-intelligence
 */

import type { log } from '@livekit/agents';
import type { VoiceEmotionResult } from '../../speech/audio-prosody/types.js';

// ============================================================================
// BETTER THAN HUMAN: Intelligence Layer Integration
// ============================================================================

/**
 * Record emotion data for the unified intelligence layer
 *
 * This enables:
 * 1. Cross-session learning about user emotional patterns
 * 2. Emotion-aware tool selection in future sessions
 * 3. Proactive outreach based on emotional patterns
 */
export async function recordEmotionForIntelligence(
  userId: string,
  sessionId: string,
  voiceEmotion: VoiceEmotionResult,
  logger: ReturnType<typeof log>
): Promise<void> {
  try {
    const { getUnifiedIntelligence } = await import('../../tools/intelligence/index.js');
    const intelligence = getUnifiedIntelligence();

    // Record the emotion as a learning event
    await intelligence.recordLearning({
      userId,
      sessionId,
      query: `emotion:${voiceEmotion.primary}`,
      predictedTool: '', // No tool prediction for emotion events
      actualTool: '', // No tool execution
      confidence: voiceEmotion.confidence,
      wasCorrection: false,
      timestamp: new Date(),
      context: {
        timeOfDay:
          new Date().getHours() < 12
            ? 'morning'
            : new Date().getHours() < 17
              ? 'afternoon'
              : 'evening',
        personaId: 'voice-agent', // Will be overridden if actual persona is known
        emotionalState: voiceEmotion.primary,
        voiceEmotion: {
          primary: voiceEmotion.primary,
          valence: voiceEmotion.valence,
          arousal: voiceEmotion.arousal,
          stressLevel: voiceEmotion.stressLevel,
          anxietyMarkers: voiceEmotion.anxietyMarkers,
        },
      },
    });

    logger.debug(
      {
        userId,
        emotion: voiceEmotion.primary,
        stressLevel: voiceEmotion.stressLevel,
      },
      '🧠 Emotion recorded for intelligence layer'
    );
  } catch (error) {
    // Non-critical, don't fail the audio processing
    logger.debug({ error: String(error) }, 'Could not record emotion for intelligence');
  }
}
