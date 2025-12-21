/**
 * Voice Agent Audio Processor
 *
 * Processes user audio for prosody analysis, emotion detection,
 * and various voice humanization features.
 *
 * Extracted from voice-agent.ts sttNode method.
 *
 * @module voice-agent/audio-processor
 */

import type { AudioFrame } from '@livekit/rtc-node';
import { log } from '@livekit/agents';
import { getDJBooth } from '../../audio/index.js';
import { getSessionFlags } from '../../config/voice-humanization-flags.js';
import { isExperimentalEnabled } from '../../config/feature-flags.js';
import { getEmotionalArcTracker } from '../../conversation/index.js';
import { getSessionAudioProsodyAnalyzer } from '../../speech/audio-prosody.js';
import { getBreathPauseDetector } from '../../speech/live-backchanneling/index.js';
import { getEmotionModulation } from '../../speech/emotion-matching.js';
import {
  startEmotionStream,
  clearSession as clearGeminiSession,
} from '../../services/emotion-analysis/hume.js';
import { getMultiSignalLaughterDetector } from '../../speech/multi-signal-laughter.js';
import { getVoiceHumanizationService } from '../../speech/voice-humanization.js';
import { getWordTimingRhythmService } from '../../speech/word-timing-rhythm.js';
import { getAmbientAwarenessService } from '../../speech/ambient-awareness.js';
import { getConversationManager } from '../../services/conversation-manager.js';
import { recordVoiceSample } from '../../services/trust-systems/index.js';
import { recordLaughterDetection } from '../../services/voice/voice-humanization-metrics.js';
import { getSpeakerChangeDetector } from '../../services/voice/voice-speaker-change.js';
import { trackEmotionDetection } from '../integrations/speech-metrics-integration.js';
import type { UserData } from '../shared/types.js';
import type { VoiceEmotionResult } from '../../speech/audio-prosody/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AudioProcessorContext {
  /** Session ID for feature flags and services */
  sessionId: string;
  /** User ID for baseline building */
  userId?: string;
  /** User data from session */
  userData?: UserData;
  /** Function to send data messages to frontend */
  sendDataMessage: (type: string, payload: Record<string, unknown>) => Promise<void>;
}

// Re-export the VoiceEmotionResult for consumers
export type { VoiceEmotionResult };

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/**
 * Process audio stream for prosody analysis and emotion detection.
 *
 * This runs in the background while STT processes the same audio.
 * It extracts voice emotion, laughter, rhythm patterns, and other
 * voice characteristics for humanization.
 */
export async function processAudioStream(
  audio: ReadableStream<AudioFrame>,
  ctx: AudioProcessorContext
): Promise<void> {
  const logger = log();
  const { sessionId, userId, userData, sendDataMessage } = ctx;

  const reader = audio.getReader();

  // Session-scoped prosody analyzer
  let prosodyAnalyzer: ReturnType<typeof getSessionAudioProsodyAnalyzer> | null = null;
  let prosodySessionId: string | null = null;

  // Gemini multimodal emotion analysis
  const geminiEmotionEnabled = isExperimentalEnabled('geminiEmotionAnalysis');
  let geminiEmotionStream: Awaited<ReturnType<typeof startEmotionStream>> | null = null;
  let geminiSessionId: string | null = null;

  try {
    while (true) {
      const { value: frame, done } = await reader.read();
      if (done) break;

      if (frame && frame.data && frame.data.length > 0) {
        // Initialize prosody analyzer lazily
        if (!prosodyAnalyzer && sessionId) {
          prosodySessionId = sessionId;
          prosodyAnalyzer = getSessionAudioProsodyAnalyzer(prosodySessionId);
        }

        // Process frame for prosody
        prosodyAnalyzer?.processAudioFrame(frame);

        // Initialize Gemini emotion stream
        if (geminiEmotionEnabled && !geminiEmotionStream && sessionId) {
          geminiSessionId = sessionId;
          try {
            geminiEmotionStream = await startEmotionStream(
              geminiSessionId,
              (result: { primary: string; confidence: number }) => {
                logger.debug(
                  { primary: result.primary, confidence: result.confidence },
                  'Gemini emotion analysis result'
                );
              }
            );
            logger.info({ sessionId: geminiSessionId }, 'Gemini emotion analysis started');
          } catch (err) {
            logger.warn({ error: String(err) }, 'Failed to start Gemini emotion stream');
          }
        }

        // Feed to Gemini stream
        if (geminiEmotionStream && frame.data) {
          const audioBuffer = new Int16Array(frame.data).buffer;
          geminiEmotionStream.sendAudio(audioBuffer);
        }

        // Feed to speaker change detector
        if (sessionId) {
          try {
            const detector = getSpeakerChangeDetector(sessionId);
            const audioData = new Float32Array(frame.data.length);
            for (let i = 0; i < frame.data.length; i++) {
              audioData[i] = frame.data[i] / 32768.0;
            }
            detector.feedAudio(audioData);
          } catch {
            // Detector not initialized
          }

          // Feed to breath pause detector
          try {
            const breathDetector = getBreathPauseDetector(sessionId);
            breathDetector.processAudioFrame({
              data: frame.data,
              sampleRate: frame.sampleRate,
              channels: frame.channels,
            });

            if (userData) {
              userData.isInBreathPause = breathDetector.isBreathPause();
              userData.currentSpeechDurationMs = breathDetector.getCurrentSpeechDuration();
            }
          } catch {
            // Breath detector not initialized
          }
        }
      }
    }

    // Cleanup Gemini stream
    if (geminiEmotionStream) {
      geminiEmotionStream.stop();
      if (geminiSessionId) {
        clearGeminiSession(geminiSessionId);
      }
      logger.debug('Gemini emotion stream stopped');
    }

    // Analyze final prosody results
    const voiceEmotion = prosodyAnalyzer?.analyze() ?? null;
    if (voiceEmotion && userData) {
      userData.voiceEmotion = voiceEmotion;

      // Process emotion results
      await processVoiceEmotion(voiceEmotion, {
        sessionId,
        userId,
        userData,
        sendDataMessage,
        logger,
      });
    }

    prosodyAnalyzer?.clearBuffers();
  } catch (error) {
    logger.warn(`Audio processing error: ${error}`);
  } finally {
    reader.releaseLock();
  }
}

// ============================================================================
// EMOTION PROCESSING
// ============================================================================

interface EmotionProcessingContext {
  sessionId: string;
  userId?: string;
  userData?: UserData;
  sendDataMessage: (type: string, payload: Record<string, unknown>) => Promise<void>;
  logger: ReturnType<typeof log>;
}

async function processVoiceEmotion(
  voiceEmotion: VoiceEmotionResult,
  ctx: EmotionProcessingContext
): Promise<void> {
  const { sessionId, userId, userData, sendDataMessage, logger } = ctx;

  // Feed to emotional arc tracker
  const emotionalArc = getEmotionalArcTracker();
  emotionalArc.recordEmotion(null, voiceEmotion);

  // Process voice humanization features
  if (sessionId && voiceEmotion.prosody) {
    await processVoiceHumanization(voiceEmotion, sessionId, userData, logger);
  }

  // Get emotion modulation for response
  const tremorOptions = await getTremorOptions(sessionId);
  const modulation = getEmotionModulation(voiceEmotion, tremorOptions);
  if (userData) {
    userData.emotionModulation = modulation;
  }

  // Record voice sample for baseline building
  if (userId && voiceEmotion.prosody && voiceEmotion.confidence > 0.3) {
    await recordVoiceBaseline(voiceEmotion, userId, userData, logger);
  }

  // Feed to learning engine
  if (userData?.services && voiceEmotion.confidence > 0.4) {
    feedLearningEngine(voiceEmotion, userData);
  }

  // Send updates to frontend
  if (voiceEmotion.confidence > 0.5) {
    await sendEmotionUpdates(voiceEmotion, sessionId, sendDataMessage, logger);
  }
}

async function processVoiceHumanization(
  voiceEmotion: VoiceEmotionResult,
  sessionId: string,
  userData: UserData | undefined,
  logger: ReturnType<typeof log>
): Promise<void> {
  try {
    const voiceHumanService = getVoiceHumanizationService(sessionId);

    // Detect laughter
    const laughterResult = voiceHumanService.detectLaughter(
      voiceEmotion.prosody,
      voiceEmotion.prosody.utteranceDuration || 0
    );

    if (laughterResult.isLaughing) {
      logger.debug(
        { laughType: laughterResult.laughType, confidence: laughterResult.confidence },
        '😄 Laughter detected from prosody'
      );
      if (userData) {
        userData.detectedLaughter = laughterResult;
      }
    }

    // Update speech rhythm profile
    if (userData?.lastUserMessage) {
      voiceHumanService.updateRhythmProfile(
        userData.lastUserMessage,
        voiceEmotion.prosody.utteranceDuration || 2000
      );
    }

    // Ambient awareness
    await processAmbientAwareness(sessionId, userData, logger);

    // Advanced humanization features
    const advFlags = getSessionFlags(sessionId);

    // Multi-signal laughter detection
    if (advFlags.enableMultiSignalLaughter) {
      await processMultiSignalLaughter(voiceEmotion, sessionId, userData, advFlags, logger);
    }

    // Word-timing rhythm analysis
    if (advFlags.enableWordTimingRhythm && userData?.lastUserMessage) {
      try {
        const rhythmService = getWordTimingRhythmService(sessionId);
        rhythmService.processUtterance(userData.lastUserMessage, voiceEmotion.prosody);
      } catch {
        // Non-critical
      }
    }
  } catch (e) {
    logger.debug({ error: String(e) }, 'Voice humanization prosody hook failed (non-blocking)');
  }
}

async function processAmbientAwareness(
  sessionId: string,
  userData: UserData | undefined,
  logger: ReturnType<typeof log>
): Promise<void> {
  try {
    const ambientService = getAmbientAwarenessService(sessionId);

    if (userData) {
      const ambient = ambientService.getAnalysis();
      userData.ambientEnvironment = ambient.environment;
      userData.ambientNoiseLevel = ambient.noiseLevel;

      // Offer to pause in noisy environments
      if (
        ambient.recommendations.offerToPause &&
        !userData.hasOfferedToPause &&
        ambient.recommendations.acknowledgment
      ) {
        userData.pendingAmbientAcknowledgment = ambient.recommendations.acknowledgment;
        userData.hasOfferedToPause = true;
        logger.info(
          {
            environment: ambient.environment,
            noiseLevel: ambient.noiseLevel,
            acknowledgment: ambient.recommendations.acknowledgment,
          },
          '🔊 Noisy environment detected - will offer to pause'
        );
      }
    }
  } catch {
    // Ambient awareness is non-critical
  }
}

async function processMultiSignalLaughter(
  voiceEmotion: VoiceEmotionResult,
  sessionId: string,
  userData: UserData | undefined,
  advFlags: ReturnType<typeof getSessionFlags>,
  logger: ReturnType<typeof log>
): Promise<void> {
  try {
    const laughterDetector = getMultiSignalLaughterDetector(sessionId);
    laughterDetector.updateContext({
      recentAgentText: userData?.lastAgentResponse || undefined,
      emotionalArc: voiceEmotion.primary,
    });

    const laughterResult = laughterDetector.detect(
      voiceEmotion.prosody,
      undefined,
      voiceEmotion.prosody.utteranceDuration || 0
    );

    if (laughterResult.isLaughter && laughterResult.confidence > 0.6) {
      logger.debug(
        {
          laughType: laughterResult.laughType,
          socialFunction: laughterResult.socialFunction,
          confidence: laughterResult.confidence.toFixed(2),
        },
        '😂 Multi-signal laughter detected'
      );

      // Record metrics
      if (advFlags.enableMetrics) {
        recordLaughterDetection(
          sessionId,
          true,
          true,
          laughterResult.confidence,
          laughterResult.laughType
        );
      }

      // Store for response adjustment
      const basicLaughType =
        laughterResult.laughType === 'nervous' || laughterResult.laughType === 'polite'
          ? ('unknown' as const)
          : laughterResult.laughType;

      if (userData) {
        userData.detectedLaughter = {
          isLaughing: true,
          confidence: laughterResult.confidence,
          laughType: basicLaughType,
          suggestedResponse:
            laughterResult.suggestedResponse.type === 'join'
              ? 'join_in'
              : laughterResult.suggestedResponse.type === 'acknowledge'
                ? 'acknowledge'
                : 'smile',
        };
      }
    }
  } catch {
    // Non-critical
  }
}

async function getTremorOptions(
  sessionId: string
): Promise<{ intensity?: 'none' | 'subtle' | 'noticeable' | 'pronounced' }> {
  try {
    const { getHumanListeningResult } =
      await import('../../intelligence/context-builders/human-listening.js');
    const listeningResult = getHumanListeningResult(sessionId);
    if (listeningResult?.audio?.tremor?.detected) {
      return {
        intensity: listeningResult.audio.tremor.intensity as 'subtle' | 'noticeable' | 'pronounced',
      };
    }
  } catch {
    // Non-critical
  }
  return {};
}

async function recordVoiceBaseline(
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

    recordVoiceSample(userId, characteristics, {
      detectedEmotion: voiceEmotion.primary,
      conversationContext: userData?.lastTopic || undefined,
    });

    logger.debug(
      { userId, emotion: voiceEmotion.primary, confidence: voiceEmotion.confidence },
      '🎤 BETTER-THAN-HUMAN: Recorded voice sample for baseline building'
    );

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

function feedLearningEngine(voiceEmotion: VoiceEmotionResult, userData: UserData): void {
  try {
    const emotionMap: Record<string, string> = {
      happy: 'joy',
      sad: 'sadness',
      angry: 'anger',
      fearful: 'fear',
      anxious: 'anxiety',
      neutral: 'neutral',
      excited: 'anticipation',
      stressed: 'anxiety',
    };

    const mappedEmotion = emotionMap[voiceEmotion.primary] || 'neutral';

    userData.services?.captureInsight(
      'emotional_pattern',
      'voice_detected_emotion',
      {
        emotion: mappedEmotion,
        voiceEmotion: voiceEmotion.primary,
        stressLevel: voiceEmotion.stressLevel,
        confidence: voiceEmotion.confidence,
      },
      voiceEmotion.confidence
    );

    userData.services?.learningEngine.recordVoiceEmotion(
      voiceEmotion.primary,
      voiceEmotion.confidence
    );

    // Track mood globally for "Our Songs" feature
    (globalThis as unknown as { __ferniCurrentMood?: string }).__ferniCurrentMood =
      voiceEmotion.primary;
  } catch {
    // Non-critical
  }
}

async function sendEmotionUpdates(
  voiceEmotion: VoiceEmotionResult,
  sessionId: string,
  sendDataMessage: (type: string, payload: Record<string, unknown>) => Promise<void>,
  logger: ReturnType<typeof log>
): Promise<void> {
  // Send emotion update
  await sendDataMessage('emotion', {
    emotion: voiceEmotion.primary,
    confidence: voiceEmotion.confidence,
    intensity: voiceEmotion.arousal,
  }).catch((e) => logger.debug({ error: String(e) }, 'Voice emotion publish (non-critical)'));

  // Track in metrics
  trackEmotionDetection(sessionId, voiceEmotion.confidence);

  // Send prosody data
  await sendDataMessage('voice_prosody', {
    stressLevel: voiceEmotion.stressLevel,
    anxietyMarkers: voiceEmotion.anxietyMarkers,
    valence: voiceEmotion.valence,
    arousal: voiceEmotion.arousal,
    dominance: voiceEmotion.dominance,
    pitchVariance: voiceEmotion.prosody?.pitchVariance,
    pauseDuration: voiceEmotion.prosody?.pauseDuration,
    speechRate: voiceEmotion.prosody?.speechRate,
    voiceQuality: voiceEmotion.prosody?.voiceQuality,
    breathiness: voiceEmotion.prosody?.breathiness,
  }).catch((e) => logger.debug({ error: String(e) }, 'Voice prosody publish (non-critical)'));

  // Update music player mood
  try {
    const { getMusicPlayer } = await import('../../audio/index.js');
    const player = getMusicPlayer();
    if (player.isInitialized()) {
      player.setCurrentUserMood(voiceEmotion.primary);
    }
  } catch {
    // Music player not available
  }

  // DJ booth emotion tracking
  const booth = getDJBooth();
  if (booth) {
    booth.trackEmotion(voiceEmotion.primary);

    // Offer music for strong emotions
    const strongEmotions = ['sad', 'anxious', 'frustrated', 'excited', 'stressed'];
    if (
      strongEmotions.includes(voiceEmotion.primary) &&
      voiceEmotion.confidence > 0.6 &&
      Math.random() < 0.1 &&
      !booth.isPlayingMusic()
    ) {
      const musicOffer = booth.getEmotionMusicOffer(voiceEmotion.primary);
      if (musicOffer) {
        setTimeout(() => {
          const currentBooth = getDJBooth();
          if (
            currentBooth &&
            !currentBooth.isPlayingMusic() &&
            !getConversationManager().isAgentSpeaking()
          ) {
            currentBooth.speakOverMusic(musicOffer.offer);
          }
        }, 3000);
      }
    }
  }
}

export default processAudioStream;
