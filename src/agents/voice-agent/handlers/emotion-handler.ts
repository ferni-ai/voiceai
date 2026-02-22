/**
 * Emotion Handler
 *
 * Handles human listening pipeline and Better Than Human transcript processing
 * for distress detection and emotional analysis.
 *
 * Extracted from transcript-handler.ts to reduce file size.
 *
 * @module voice-agent/handlers/emotion-handler
 */

import { setHumanListeningResult } from '../../../intelligence/context-builders/emotional/human-listening.js';
import { processTranscriptForBetterThanHuman } from '../../integrations/better-than-human-integration.js';
import type { UserData } from '../../shared/types.js';
import { getHumanListeningPipeline } from '../../../speech/human-listening-pipeline.js';
import { safeFireAndForget } from '../../../utils/safe-fire-and-forget.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'EmotionHandler' });

/**
 * Process human listening pipeline for distress detection
 */
export function processHumanListeningPipeline(
  transcript: string,
  userData: UserData,
  sessionId: string
): void {
  safeFireAndForget(
    async () => {
      const pipeline = getHumanListeningPipeline(sessionId);

      // Get prosody features from voice emotion if available
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

      // Store for context builder access
      setHumanListeningResult(sessionId, listeningResult);

      if (listeningResult.possibleDistress) {
        log.warn('Human listening: Distress signals detected', {
          signals: listeningResult.prioritySignals,
          guidance: listeningResult.agentGuidance,
        });
      } else if (listeningResult.shouldSlowDown) {
        log.info('Human listening: User needs slower pace', {
          assessment: listeningResult.overallAssessment.slice(0, 100),
        });
      }
    },
    { context: 'human-listening-pipeline' }
  );
}

/**
 * Process Better Than Human transcript analysis
 * Detects first-time vulnerability, emotional contradictions, patterns, linguistic style
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

      // Store results in userData for context building
      if (result.vulnerability?.isFirstTime) {
        (userData as Record<string, unknown>).betterThanHumanVulnerability = result.vulnerability;
        log.info('💎 First-time vulnerability detected', {
          category: result.vulnerability.category,
          level: result.vulnerability.level.toFixed(2),
        });
      }

      if (result.contradiction?.detected) {
        (userData as Record<string, unknown>).betterThanHumanContradiction = result.contradiction;
        log.info('🎭 Emotional contradiction detected', {
          emotions: result.contradiction.emotions.join(' + '),
        });
      }

      if (result.patterns?.insights && result.patterns.insights.length > 0) {
        (userData as Record<string, unknown>).betterThanHumanPatterns = result.patterns;
      }
    },
    { context: 'better-than-human-transcript' }
  );
}
