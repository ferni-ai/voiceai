/**
 * Voice Baseline Recording
 *
 * Records each analyzed utterance into the caller's voice baseline, keeps
 * "how they sound today" next to their usual voice, and feeds tonal memory
 * and prosody humanization.
 *
 * Extracted from audio-processor.ts.
 *
 * @module voice-agent/voice-baseline-recorder
 */

import type { log } from '@livekit/agents';
import { analyzeDeviation, recordVoiceSample } from '../../services/trust-systems/index.js';
import type { VoiceEmotionResult } from '../../speech/audio-prosody/types.js';
import {
  averageMeasures,
  rememberUtterance,
  voiceTodayCue,
} from '../../speech/expression/index.js';
import type { UserData } from '../shared/types.js';

export async function recordVoiceBaseline(
  voiceEmotion: VoiceEmotionResult,
  userId: string,
  userData: UserData | undefined,
  logger: ReturnType<typeof log>
): Promise<void> {
  try {
    const characteristics = {
      pitchMean: voiceEmotion.prosody.pitchMean || 150,
      pitchRange: voiceEmotion.prosody.pitchRange || 30,
      pitchVariability: voiceEmotion.prosody.pitchVariance
        ? voiceEmotion.prosody.pitchVariance / 100
        : 0.3,
      energyMean: voiceEmotion.prosody.energyMean || 0.5,
      energyRange: voiceEmotion.prosody.energyVariance || 0.2,
      energyVariability: voiceEmotion.prosody.energyVariance
        ? voiceEmotion.prosody.energyVariance / 100
        : 0.3,
      speakingRate: voiceEmotion.prosody.speechRate || 150,
      pauseFrequency: voiceEmotion.prosody.pauseFrequency || 3,
      pauseDuration: voiceEmotion.prosody.pauseDuration || 300,
      breathiness: voiceEmotion.prosody.breathiness || 0.3,
      tension: voiceEmotion.stressLevel || 0.3,
      clarity: voiceEmotion.confidence || 0.7,
    };

    // How they sound today next to their usual voice (speech/expression/voice-today.ts)
    if (userData) {
      const recent = rememberUtterance(userData.voiceToday?.recent ?? [], characteristics);
      const avg = averageMeasures(recent);
      userData.voiceToday = {
        recent,
        cue: avg ? voiceTodayCue(analyzeDeviation(userId, avg)) : null,
      };
    }

    recordVoiceSample(userId, characteristics, {
      detectedEmotion: voiceEmotion.primary,
      conversationContext: userData?.lastTopic || undefined,
    });

    logger.debug(
      { userId, emotion: voiceEmotion.primary, confidence: voiceEmotion.confidence },
      '🎤 BETTER-THAN-HUMAN: Recorded voice sample for baseline building'
    );

    // 🎤 TONAL MEMORY: Record how things are said per topic
    // "Your voice gets quieter when you mention your sister"
    if (userData?.lastTopic && voiceEmotion.primary !== 'neutral') {
      try {
        const { recordTonalObservation } =
          await import('../../services/trust-systems/tonal-memory.js');
        recordTonalObservation({
          userId,
          topic: userData.lastTopic,
          voiceSignals: {
            pitch: characteristics.pitchVariability,
            energy: characteristics.energyMean,
            speechRate: characteristics.speakingRate,
            tremor: (voiceEmotion.prosody.shimmer || 0) > 0.5,
            breathiness: characteristics.breathiness,
          },
          emotion: voiceEmotion.primary,
          confidence: voiceEmotion.confidence,
        });
      } catch {
        // Non-critical - tonal memory is optional enhancement
      }
    }

    // Process for humanization
    if (userData?.services?.sessionId) {
      try {
        const { processProsodyForHumanization } =
          await import('../../conversation/humanization/prosody-bridge.js');
        processProsodyForHumanization(
          userData.services.sessionId,
          userId,
          voiceEmotion as unknown as Parameters<typeof processProsodyForHumanization>[2]
        );
      } catch {
        // Non-critical
      }
    }
  } catch (e) {
    logger.debug({ error: String(e) }, 'Voice prosody baseline recording failed (non-blocking)');
  }
}
