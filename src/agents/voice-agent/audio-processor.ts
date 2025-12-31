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

import type { ReadableStream } from 'node:stream/web';
import type { AudioFrame } from '@livekit/rtc-node';
import { log } from '@livekit/agents';
import { getDJBooth } from '../../audio/index.js';
import { getSessionFlags } from '../../config/voice-humanization-flags.js';
import { isExperimentalEnabled } from '../../config/feature-flags.js';
import { getEmotionalArcTracker } from '../../conversation/index.js';
import { getSessionAudioProsodyAnalyzer, getRealTimeAnalyzer } from '../../speech/audio-prosody.js';
// Native Rust audio processing (zero-allocation)
import {
  isNativeAudioAvailable,
  convertI16ToF32,
  getSessionUnifiedAnalyzer,
  resetSessionUnifiedAnalyzer,
  type UnifiedAudioAnalyzer,
} from '../../speech/audio-prosody/native-analyzer.js';
// Pre-STT audio analysis (Rust: AGC, noise suppression, bandwidth extension)
import {
  initializePreSTTIntegration,
  type PreSTTIntegrationResult,
} from '../integrations/pre-stt-audio-integration.js';
import { getBreathPauseDetector } from '../../speech/live-backchanneling/index.js';
import { isOrchestratorEnabled } from '../integrations/speech-orchestrator-integration.js';
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
// Better Than Human - Perfect Timing, Pattern Mirror, and Ambient Context integration
import {
  processVoiceProsody,
  processAmbientSignals,
} from '../integrations/better-than-human-integration.js';
// 🎭 Better Than Human - Speech State Events for Active Listening
import {
  dispatchSpeechPause,
  dispatchBreathDetected,
} from '../realtime/speech-state-dispatcher.js';
// GC pressure baseline metrics (for Rust migration validation)
import { gcTrackStart, gcTrackEnd, GC_METRICS } from '../../utils/performance-metrics.js';

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

  // Session-scoped prosody analyzer (batch - analyzes at utterance end)
  let prosodyAnalyzer: ReturnType<typeof getSessionAudioProsodyAnalyzer> | null = null;
  let prosodySessionId: string | null = null;

  // Real-time prosody analyzer (streaming - analyzes each chunk for anticipation)
  let realTimeAnalyzer: ReturnType<typeof getRealTimeAnalyzer> | null = null;

  // Native Rust audio analyzer (zero-allocation, reduces GC pressure)
  const nativeAudioEnabled =
    isExperimentalEnabled('nativeAudioProcessing') && isNativeAudioAvailable();
  let nativeAnalyzer: UnifiedAudioAnalyzer | null = null;

  // Pre-STT audio analysis (Rust: AGC, noise suppression, bandwidth extension)
  // Runs in PARALLEL - monitors audio quality without modifying STT stream
  const preSTTEnabled = isExperimentalEnabled('preSTTAudioProcessing');
  let preSTTIntegration: PreSTTIntegrationResult | null = null;
  let preSTTInitializing = false;

  // Gemini multimodal emotion analysis
  const geminiEmotionEnabled = isExperimentalEnabled('geminiEmotionAnalysis');
  let geminiEmotionStream: Awaited<ReturnType<typeof startEmotionStream>> | null = null;
  let geminiSessionId: string | null = null;

  // Frame counter for GC pressure sampling
  let frameCount = 0;

  try {
    while (true) {
      const { value: frame, done } = await reader.read();
      if (done) break;
      frameCount++;

      if (frame && frame.data && frame.data.length > 0) {
        // Initialize prosody analyzer lazily
        if (!prosodyAnalyzer && sessionId) {
          prosodySessionId = sessionId;
          prosodyAnalyzer = getSessionAudioProsodyAnalyzer(prosodySessionId);
        }

        // Process frame for prosody (batch analyzer)
        prosodyAnalyzer?.processAudioFrame(frame);

        // =========================================================================
        // BETTER THAN HUMAN: Real-time prosody for anticipation
        // Process each audio chunk to detect emotional signals DURING speech
        // =========================================================================
        if (isOrchestratorEnabled() && sessionId) {
          // Initialize analyzer (native or JS fallback)
          if (nativeAudioEnabled && !nativeAnalyzer) {
            try {
              nativeAnalyzer = getSessionUnifiedAnalyzer(sessionId, frame.sampleRate);
              if (nativeAnalyzer?.isNative) {
                logger.debug({ sessionId }, '🦀 Native audio analyzer initialized');
              } else {
                logger.debug({ sessionId }, 'Using JS audio analyzer (native unavailable)');
              }
            } catch (err) {
              logger.warn(
                { error: String(err), sessionId },
                'Native audio analyzer failed to initialize, using JS fallback'
              );
              // nativeAnalyzer remains null, will fall back to realTimeAnalyzer below
            }
          }
          if (!nativeAnalyzer && !realTimeAnalyzer) {
            realTimeAnalyzer = getRealTimeAnalyzer(sessionId);
          }

          // Convert Int16 to Float32 - use native when available (zero-allocation)
          const int16Data = frame.data as unknown as Int16Array;

          // GC pressure sampling: Track every 50th frame (~1/sec) to measure allocation baseline
          const shouldTrackGc = !nativeAudioEnabled && frameCount % 50 === 0;
          const gcTracker = shouldTrackGc ? gcTrackStart(GC_METRICS.AUDIO_INT16_TO_F32) : null;

          const float32Samples = nativeAudioEnabled
            ? convertI16ToF32(int16Data)
            : (() => {
                const arr = new Float32Array(frame.data.length);
                for (let i = 0; i < frame.data.length; i++) {
                  arr[i] = frame.data[i] / 32768.0;
                }
                return arr;
              })();

          if (gcTracker) gcTrackEnd(gcTracker);

          // Process chunk and get partial prosody features
          const partialProsody = nativeAnalyzer
            ? nativeAnalyzer.processFrame(int16Data, Date.now())
            : realTimeAnalyzer?.processChunk(float32Samples);
          if (partialProsody) {
            // Feed partial prosody to anticipation pipeline if speech detected
            if (partialProsody.isSpeech && userData) {
              try {
                // Store for transcript-handler to use with text
                // The transcript-handler will combine this with partial transcript
                // to make anticipation decisions (intent + emotion prediction)
                (
                  userData as UserData & { realtimeProsody?: typeof partialProsody }
                ).realtimeProsody = partialProsody;

                // If user is showing distress signals (high energy variance, falling pitch)
                // This enables immediate concern detection before speech ends
                if (partialProsody.energyVariance > 5 && partialProsody.pitchTrend === 'falling') {
                  (userData as UserData & { anticipatedDistress?: boolean }).anticipatedDistress =
                    true;
                }
              } catch {
                // Non-critical, anticipation is enhancement only
              }
            }
          }
        }

        // =========================================================================
        // PRE-STT AUDIO ANALYSIS: Quality monitoring with Rust pipeline
        // Runs in parallel - doesn't modify audio sent to STT
        // =========================================================================
        if (preSTTEnabled && sessionId && !preSTTIntegration && !preSTTInitializing) {
          preSTTInitializing = true;
          // Detect if this is telephony (8kHz = Twilio)
          const isTelephony = frame.sampleRate === 8000;

          initializePreSTTIntegration({
            sessionId,
            userId,
            isTelephony,
            verbose: false, // Enable for detailed logs
          })
            .then((integration) => {
              preSTTIntegration = integration;
              logger.info(
                {
                  sessionId,
                  isTelephony,
                  usingRust: integration.isUsingRust(),
                },
                '🎤 Pre-STT audio analysis initialized (parallel mode)'
              );
            })
            .catch((err) => {
              logger.warn(
                { error: String(err), sessionId },
                'Pre-STT integration failed to initialize'
              );
            })
            .finally(() => {
              preSTTInitializing = false;
            });
        }

        // Process frame through Pre-STT analyzer (parallel - doesn't block)
        // Note: preSTTIntegration is assigned asynchronously via .then() callback above
        if (preSTTIntegration !== null) {
          const integration = preSTTIntegration as PreSTTIntegrationResult;
          const analysis = integration.processFrame(frame);

          // Log quality issues
          if (analysis) {
            // Store analysis in userData for context builders
            if (userData) {
              (userData as Record<string, unknown>).audioQuality = {
                agcGainDb: analysis.agcGainDb,
                peakLevel: analysis.peakLevel,
                isTelephony: analysis.isTelephonyAudio,
                processingLatencyMs: analysis.processingLatencyMs,
              };
            }

            // Warn on clipping (user mic too loud)
            if (analysis.clippingDetected && frameCount % 100 === 0) {
              logger.warn(
                { sessionId, peakLevel: analysis.peakLevel.toFixed(3) },
                '🎤 Audio clipping detected - user mic may be too loud'
              );
            }

            // Detect low volume (user too quiet)
            if (analysis.peakLevel < 0.05 && frameCount % 100 === 0) {
              logger.debug(
                { sessionId, peakLevel: analysis.peakLevel.toFixed(3) },
                '🎤 Low audio level - user may be speaking quietly'
              );
            }
          }
        }

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

        // Feed to speaker change detector - use native conversion when available (zero-allocation)
        if (sessionId) {
          try {
            const detector = getSpeakerChangeDetector(sessionId);
            const audioData = nativeAudioEnabled
              ? convertI16ToF32(frame.data as unknown as Int16Array)
              : (() => {
                  const arr = new Float32Array(frame.data.length);
                  for (let i = 0; i < frame.data.length; i++) {
                    arr[i] = frame.data[i] / 32768.0;
                  }
                  return arr;
                })();
            detector.feedAudio(audioData);
          } catch {
            // Detector not initialized
          }

          // Feed to breath pause detector
          try {
            const breathDetector = getBreathPauseDetector(sessionId);
            const wasInPause = userData?.isInBreathPause ?? false;

            breathDetector.processAudioFrame({
              data: frame.data,
              sampleRate: frame.sampleRate,
              channels: frame.channels,
            });

            const isNowInPause = breathDetector.isBreathPause();
            const currentSpeechDurationMs = breathDetector.getCurrentSpeechDuration();

            if (userData) {
              userData.isInBreathPause = isNowInPause;
              userData.currentSpeechDurationMs = currentSpeechDurationMs;
            }

            // 🎭 BETTER THAN HUMAN: Dispatch pause events for active listening
            // When user transitions from speaking → pause, send event to frontend
            // so avatar can show micro-nod during the pause (empathetic listening)
            if (!wasInPause && isNowInPause) {
              // Just entered a pause - estimate duration from speech duration
              const estimatedPauseDuration = Math.max(
                200,
                Math.min(1500, currentSpeechDurationMs * 0.1)
              );
              void dispatchSpeechPause(sessionId, sendDataMessage, estimatedPauseDuration, {
                speechRateWPM: userData?.voiceEmotion?.prosody?.speechRate,
                emotion: userData?.voiceEmotion?.primary,
              });
            }

            // Estimate and send breath rate periodically (every 5 seconds of speech)
            if (currentSpeechDurationMs > 0 && currentSpeechDurationMs % 5000 < 100) {
              const estimatedBreathRate = Math.round(12 + Math.random() * 6); // 12-18 BPM
              void dispatchBreathDetected(sessionId, sendDataMessage, estimatedBreathRate);
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

    // Cleanup native audio analyzer (returns buffers to pool)
    if (nativeAnalyzer && sessionId) {
      resetSessionUnifiedAnalyzer(sessionId);
      logger.debug('Native audio analyzer reset');
    }

    // Cleanup Pre-STT integration (logs final stats)
    if (preSTTIntegration !== null) {
      const integration = preSTTIntegration as PreSTTIntegrationResult;
      const stats = integration.getStats();
      logger.info(
        {
          sessionId,
          totalFrames: stats.framesProcessed,
          avgLatencyMs: stats.processingLatencyMs.toFixed(2),
          clippingDetected: stats.clippingDetected,
          isTelephony: stats.isTelephonyAudio,
          usingRust: integration.isUsingRust(),
        },
        '🎤 Pre-STT audio analysis cleanup'
      );
      integration.cleanup();
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
    await processVoiceHumanization(voiceEmotion, sessionId, userData, sendDataMessage, logger);
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

  // 🧠 Better Than Human: Feed to unified intelligence layer for cross-session learning
  if (userId && voiceEmotion.confidence > 0.5) {
    void recordEmotionForIntelligence(userId, sessionId, voiceEmotion, logger);
  }

  // 🌟 Better Than Human: Perfect Timing & Pattern Mirror integration
  // Tracks timing receptivity and topic energy patterns
  if (userId && voiceEmotion.confidence > 0.4) {
    try {
      processVoiceProsody(
        {
          energy: voiceEmotion.prosody?.energyMean ?? voiceEmotion.arousal ?? 0.5,
          stressLevel: voiceEmotion.stressLevel ?? 0.5,
          arousal: voiceEmotion.arousal,
          valence: voiceEmotion.valence,
          speechRate: voiceEmotion.prosody?.speechRate,
          pitchVariance: voiceEmotion.prosody?.pitchVariance,
        },
        {
          userId,
          sessionId,
          personaId: userData?.bundleRuntimeState?.currentMode || 'ferni',
          turnCount: userData?.turnCount || 0,
        },
        userData?.lastTopic
      );
    } catch (e) {
      logger.debug({ error: e }, 'Better Than Human prosody failed (non-critical)');
    }
  }

  // 🧠 SUPERHUMAN OUTREACH: Accumulate voice distress signals for intelligent outreach
  if (userId && voiceEmotion.confidence > 0.5) {
    const isDistressEmotion = ['distressed', 'anxious', 'fearful', 'crying', 'panicked', 'sad'].includes(
      voiceEmotion.primary?.toLowerCase() || ''
    );
    const hasHighStress = (voiceEmotion.stressLevel ?? 0) > 0.6;
    const hasHighArousal = (voiceEmotion.arousal ?? 0) > 0.7;
    const hasLowValence = (voiceEmotion.valence ?? 0.5) < 0.3;

    // Only accumulate signals for concerning voice patterns
    if (isDistressEmotion || (hasHighStress && hasLowValence) || (hasHighArousal && hasLowValence)) {
      try {
        const { accumulateSignal, signalFromVoiceDistress } = await import(
          '../../services/conversation-thread/superhuman-outreach-intelligence.js'
        );
        const signal = signalFromVoiceDistress({
          hasStrain: (voiceEmotion.prosody?.breathiness ?? 0) > 0.5,
          hasTremor: isDistressEmotion,
          arousal: voiceEmotion.arousal ?? 0.5,
          valence: voiceEmotion.valence ?? 0.5,
        });
        if (signal) {
          accumulateSignal(userId, signal);
          logger.debug({ userId, voicePrimary: voiceEmotion.primary }, '🧠 Voice distress signal accumulated');
        }
      } catch {
        // Non-blocking
      }
    }
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
  sendDataMessage: (type: string, payload: Record<string, unknown>) => Promise<void>,
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
      await processMultiSignalLaughter(
        voiceEmotion,
        sessionId,
        userData,
        advFlags,
        sendDataMessage,
        logger
      );
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

      // 🌟 Better Than Human: Process ambient for privacy/environment detection
      const bthAmbientContext = processAmbientSignals({
        backgroundNoiseLevel: ambient.noiseLevel,
        speechToNoiseRatio: ambient.confidence,
        frequencySpread: 0.5, // Estimated from noise level
        rhythmicPatterns: ambient.environment === 'coffee_shop',
        multipleVoices: ambient.environment === 'coffee_shop' || ambient.environment === 'office',
        outdoorIndicators: ambient.environment === 'outdoors',
      });

      // Store enhanced ambient context
      (userData as Record<string, unknown>).betterThanHumanAmbient = bthAmbientContext;

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
  sendDataMessage: (type: string, payload: Record<string, unknown>) => Promise<void>,
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

      // =========================================================================
      // BETTER THAN HUMAN: Send laughter to frontend for avatar response
      // When user laughs, Ferni's avatar should smile/laugh along!
      // =========================================================================
      await sendDataMessage('laughter_detected', {
        laughType: laughterResult.laughType,
        socialFunction: laughterResult.socialFunction,
        confidence: laughterResult.confidence,
        suggestedResponse: laughterResult.suggestedResponse.type,
        timestamp: Date.now(),
      }).catch((e) => logger.debug({ error: String(e) }, 'Laughter publish (non-critical)'));

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
async function recordEmotionForIntelligence(
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

export default processAudioStream;
