/**
 * Voice Agent Transcript Handler
 *
 * Handles incoming user transcript events from the voice agent session:
 * - Micro-interruption detection (stops agent when user says "wait", "hold on")
 * - Partial transcript streaming to frontend (for anticipation)
 * - Response anticipation for faster responses
 * - Trial status checking (First Taste Trial)
 * - Human listening pipeline (distress detection, cognitive load)
 * - Memorable moments extraction (meaningful silence system)
 * - Game topic change detection
 * - Dynamic tool loading
 * - Voice identity processing
 * - DJ session flow tracking
 * - Feedback collection for tool optimization
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/transcript-handler
 */

import { log, type voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import { TextEncoder } from 'node:util';
import {
  detectFeedbackFromResponse,
  extractMusicPreferences,
  getDJController,
  hasMusicContext,
  hasPendingMusicFeedback,
  recordMusicFeedback,
} from '../../audio/index.js';
import { getSessionFlags } from '../../config/voice-humanization-flags.js';
import { setHumanListeningResult } from '../../intelligence/context-builders/emotional/human-listening.js';
import {
  extractPreferences,
  hasPreferenceContent,
  type ExtractedPreference,
} from '../../intelligence/tracking/preferences.js';
import {
  extractMemorableMoments,
  mergeMemorableMoments,
  type SilenceContext,
} from '../../personas/meaningful-silence.js';
import type { PersonaConfig } from '../../personas/types.js';
import type { ConversationManager } from '../../services/conversation-manager.js';
import { diag } from '../../services/diagnostic-logger.js';
import { checkTrialStatus } from '../../services/first-taste-trial.js';
import type { SessionServices } from '../../services/index.js';
import {
  recordCacheAttempt,
  recordLatency,
} from '../../services/voice/voice-humanization-metrics.js';
import { getHumanListeningPipeline } from '../../speech/human-listening-pipeline.js';
import { getResponseAnticipationService } from '../../speech/response-anticipation.js';
import {
  processPartialTranscript as processSesamePartial,
  startNewTurn as startSesameTurn,
} from '../../speech/sesame-inspired/index.js';
import {
  addAvoidTopic,
  addFavoriteTeam,
  addNewsInterest,
  addToWatchlist,
  saveLocation,
  setAllergies,
} from '../../tools/domains/information/preferences/index.js';
import type { ConversationContext as FeedbackContext } from '../../tools/optimization/feedback-collector.js';
import { fireAndForget, safeFireAndForget } from '../../utils/safe-fire-and-forget.js';
import { trackConversationTurn } from '../integrations/speech-metrics-integration.js';
import type { IntegrationResult as VoiceHumanizationIntegration } from '../integrations/voice-humanization-integration.js';
import type { UserData } from '../shared/types.js';
import {
  analyzeTurnSignals,
  handleInterruption,
  updateSessionState,
  type TurnContext,
} from './human-turn-intelligence.js';
import {
  isLikelyNoise,
  validateTranscript,
  type ValidationContext,
} from './transcript-validator.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../../memory/rust-accelerator.js';
import {
  createTeamHuddleTrigger,
  detectTeamHuddleRequest,
} from '../../services/engagement/engagement-conversation-triggers.js';
import { getTrailingSsml, senseInterrupt } from '../../speech/graceful-interrupt/index.js';
import {
  cleanupStaleCheckIns,
  processDailyCheckIn,
  type DailyCheckInContext,
} from './daily-checkin-handler.js';
// E2E Latency tracking - diagnose OpenAI vs TTS vs our code
import {
  startTurn as startLatencyTurn,
  markProcessingStarted,
} from '../shared/e2e-latency-tracker.js';

// Check Rust availability at module load
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();
// Better Than Human - Transcript processing integration
import { processTranscriptForBetterThanHuman } from '../integrations/better-than-human-integration.js';
// Phase 5: Anticipatory Triggers - "Better than Human" early signal detection
import {
  learnFromUtterance,
  processPartialInput as processAnticipatoryInput,
  recordAnticipatoryOutcome,
  type VoiceProsodyCue,
} from '../../intelligence/triggers/index.js';
// Semantic Router - pre-LLM tool routing for high-confidence requests
import {
  isSemanticRoutingEnabled,
  routeTranscript,
} from '../../tools/semantic-router/integration/index.js';
// Unified Anticipation Pipeline - "Better Than Human" anticipation during speech
import { getAnticipationPipeline } from '../../speech/anticipation/index.js';
// Speech Orchestrator integration for micro-reactions
import { isOrchestratorEnabled } from '../integrations/speech-orchestrator-integration.js';
// Speech coordination for centralized speech management
import { coordinatedSay } from '../../speech/coordination/index.js';
// Tool updater for mid-session tool updates (OpenAI Realtime)
import { updateAgentTools, supportsToolUpdates } from '../shared/tool-updater.js';
import { createLogger } from '../../utils/safe-logger.js';
// PersonaIdString is just a string alias, defined locally to avoid import issues

// ============================================================================
// TYPES
// ============================================================================

export interface TranscriptHandlerContext {
  /** LiveKit room instance for publishing data messages */
  room: Room;
  /** Voice session instance */
  session: voice.AgentSession<UserData>;
  /** Session services */
  services: SessionServices;
  /** Current persona config */
  sessionPersona: PersonaConfig;
  /** Conversation manager for checking agent speaking state */
  conversationManager: ConversationManager;
  /** Voice humanization integration for micro-interruption detection */
  voiceHumanization: VoiceHumanizationIntegration | null;
  /** User data from session */
  userData: UserData;
  /** User ID (may be undefined for anonymous) */
  userId: string | undefined;
  /** Session ID for logging */
  sessionId: string;
  /** Silence context for meaningful silence system */
  silenceContext: SilenceContext;
  /** Dynamic tool loader for topic-based tool loading */
  dynamicToolLoader: {
    processMessage: (message: string) => Promise<string[]>;
    getLoadedDomains: () => string[];
    getCurrentTools: () => Record<string, unknown>;
  };
  /** Voice agent reference for tool updates */
  agent: voice.Agent<UserData>;
  /** Auto optimizer for feedback collection */
  autoOptimizer: {
    processUserMessage: (
      message: string,
      context: FeedbackContext,
      lastToolId: string | undefined
    ) => void;
  };
  /** Function to send data messages to frontend */
  sendDataMessage?: (type: string, payload: Record<string, unknown>) => Promise<void>;
}

/**
 * ECHO PREVENTION COOLDOWN
 *
 * After the agent finishes speaking, there's a delay before the microphone
 * stops picking up echo and the speech-to-text finishes processing. During
 * this window, we should NOT use cached responses to prevent the agent from
 * responding to its own echo (e.g., Ferni says "how are you?" → mic picks up
 * echo → transcribes "how are you" → matches cached response → says "I'm doing
 * well, thanks for asking!").
 *
 * NEW: Uses adaptive echo window from SpeechCoordinator when available.
 * Falls back to 2000ms if coordination system unavailable.
 *
 * Legacy 2 seconds accounts for:
 * - Audio buffer flush (~200-500ms)
 * - Speech-to-text processing (~500-1000ms)
 * - Network latency buffer (~200ms)
 */
const ECHO_PREVENTION_COOLDOWN_MS_DEFAULT = 2000;

/**
 * Get adaptive echo prevention window.
 * Uses learned timing from SpeechCoordinator when available.
 *
 * CRITICAL FIX: Now content-aware! Pass userTranscript to enable
 * intelligent detection of legitimate requests vs echoes.
 *
 * @param lastUtteranceDurationMs - Duration of last agent utterance
 * @param userTranscript - The user's transcript for content-aware detection
 */
function getEchoPreventioncooldownMs(
  lastUtteranceDurationMs?: number,
  userTranscript?: string
): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getAdaptiveEchoWindow } = require('../../speech/coordination/index.js') as {
      getAdaptiveEchoWindow: (duration?: number, transcript?: string) => number;
    };
    return getAdaptiveEchoWindow(lastUtteranceDurationMs, userTranscript);
  } catch {
    // Fall back to default if coordination module unavailable
    return ECHO_PREVENTION_COOLDOWN_MS_DEFAULT;
  }
}

/**
 * Record echo detection for adaptive learning.
 * Call this when we detect what appears to be agent echo being picked up.
 */
function recordEchoDetectionForLearning(sessionId: string, delayMs: number): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recordEchoDetected } = require('../../speech/coordination/index.js') as {
      recordEchoDetected: (sessionId: string, delayMs: number) => void;
    };
    recordEchoDetected(sessionId, delayMs);
  } catch {
    // Ignore if coordination module unavailable
  }
}

export interface TranscriptEvent {
  transcript: string;
  isFinal: boolean;
}

export interface TranscriptHandlerResult {
  /** The event handler function to register */
  handler: (event: TranscriptEvent) => void;
}

// ============================================================================
// MAIN TRANSCRIPT HANDLER
// ============================================================================

// Lazy getLogger() initialization - log() can only be called after LiveKit initializes
const getLogger = () => log();

/**
 * Set up the user transcript event handler
 *
 * This function creates a handler for UserInputTranscribed events that processes
 * both partial and final transcripts with all the necessary processing steps.
 */
export function createTranscriptHandler(ctx: TranscriptHandlerContext): TranscriptHandlerResult {
  const {
    room,
    session,
    services,
    sessionPersona,
    conversationManager,
    voiceHumanization,
    userData,
    userId,
    sessionId,
    silenceContext,
    dynamicToolLoader,
    autoOptimizer,
    sendDataMessage,
    agent,
  } = ctx;

  const handler = (event: TranscriptEvent): void => {
    // ===============================================
    // MICRO-INTERRUPTION DETECTION (Phase 1)
    // Check EVERY transcript (partial or final) for stop words
    // "wait", "hold on", "actually" should stop agent immediately
    // ===============================================
    if (event.transcript && voiceHumanization) {
      const isAgentSpeaking = conversationManager.isAgentSpeaking();
      const microInterrupt = voiceHumanization.processStreamingWord(
        event.transcript,
        isAgentSpeaking
      );

      if (microInterrupt.shouldStopAgent) {
        diag.state('Micro-interrupt triggered', {
          trigger: microInterrupt.trigger,
          transcript: event.transcript.slice(0, 30),
        });
        // Set hard interrupt type for more deliberate recovery
        userData.interruptType = 'hard';
        // The onInterrupt callback handles the actual interruption
      }

      // ===============================================
      // GRACEFUL INTERRUPT: Pre-emptive trailing
      // Sense when user is about to interrupt and inject
      // trailing-off SSML before the hard cut happens
      // ===============================================
      const interruptSense = senseInterrupt(sessionId, event.transcript, isAgentSpeaking);
      if (interruptSense.shouldTrail) {
        const trailingSsml = getTrailingSsml(sessionId);
        if (trailingSsml) {
          diag.state('🎭 Injecting pre-emptive trailing', {
            trigger: interruptSense.trigger,
            trailing: trailingSsml.slice(0, 30),
          });
          // The trailing SSML will be picked up by the TTS stream
          // via the transcription node's response wrapper
          userData.pendingTrailingSsml = trailingSsml;
        }
      }
    }

    // ===============================================
    // PARTIAL TRANSCRIPT STREAMING TO FRONTEND
    // Enables "reading the future" - responding before user finishes
    // ===============================================
    if (event.transcript && !event.isFinal && event.transcript.length > 10) {
      // Quick noise check for partials - don't stream obvious noise
      if (isLikelyNoise(event.transcript)) {
        return; // Skip this partial - it's noise
      }

      // Store the latest partial for fast recovery if the final transcript stalls
      userData.lastPartialTranscript = event.transcript;

      // ===============================================
      // 🧠 HUMAN TURN INTELLIGENCE (Partial)
      // Analyze HOW user is speaking to predict turn state
      // ===============================================
      const isAgentCurrentlySpeakingNow = conversationManager.isAgentSpeaking();
      const turnContext: TurnContext = {
        transcript: event.transcript,
        isFinal: false,
        emotion: userData.voiceEmotion?.primary as TurnContext['emotion'],
        emotionalIntensity: userData.lastEmotionAnalysis?.intensity,
        isAgentSpeaking: isAgentCurrentlySpeakingNow,
        turnCount: userData.turnCount || 0,
        previousMessage: userData.lastUserMessage,
      };

      const turnSignals = analyzeTurnSignals(sessionId, turnContext);

      // Handle potential interruption intelligently
      if (isAgentCurrentlySpeakingNow && turnSignals.shouldYieldFloor) {
        const interruptDecision = handleInterruption({
          interruptionText: event.transcript,
          agentWasSaying: userData.lastAgentResponse || '',
          agentProgressPercent: 50, // Estimate - could track more precisely
          userEmotion: userData.voiceEmotion?.primary,
        });

        if (interruptDecision.shouldYield) {
          diag.state('🧠 Human intelligence: Yielding floor gracefully', {
            style: interruptDecision.yieldStyle,
            trigger: event.transcript.slice(0, 30),
          });
          // The micro-interrupt handler above will stop the agent
        }
      }

      // If user wants to continue and agent might respond too early, log it
      if (turnSignals.wantsToContinue || turnSignals.isHesitating) {
        diag.state('🧠 User may not be done speaking', {
          confidence: turnSignals.completionConfidence.toFixed(2),
          isHesitating: turnSignals.isHesitating,
          wantsToContinue: turnSignals.wantsToContinue,
        });
      }

      sendPartialTranscript(room, event.transcript);

      // ===============================================
      // SESAME-INSPIRED ANTICIPATORY PROSODY
      // Pre-compute response prosody while user is still speaking
      // This enables faster, more natural responses
      // ===============================================
      try {
        processSesamePartial(sessionId, {
          text: event.transcript,
          isSpeaking: true,
          // Detect tone from voice emotion if available
          tone: userData.voiceEmotion?.primary as
            | 'neutral'
            | 'excited'
            | 'sad'
            | 'frustrated'
            | 'curious'
            | undefined,
        });
      } catch {
        // Sesame processing is non-critical
      }

      // ===============================================
      // 🎭 UNIFIED ANTICIPATION PIPELINE ("Better Than Human")
      // Process partial transcript through anticipation pipeline to:
      // - Predict user intent (celebration, question, emotional share, etc.)
      // - Anticipate emotional trajectory (rising excitement, falling sadness)
      // - Prepare prosody adjustments for response (speed, emotion, micro-reactions)
      // ===============================================
      if (isOrchestratorEnabled()) {
        try {
          // Get anticipation pipeline for this session
          const pipeline = getAnticipationPipeline(sessionId);

          // Process the partial transcript
          const anticipation = pipeline.process({
            sessionId,
            partialTranscript: event.transcript,
            isSpeaking: true,
            tone: userData.voiceEmotion?.primary as
              | 'neutral'
              | 'excited'
              | 'sad'
              | 'frustrated'
              | 'curious'
              | undefined,
          });

          // If actionable, store for use in response preparation
          if (anticipation?.isActionable) {
            // Store on userData for turn handler to use
            (
              userData as UserData & { anticipatedProsody?: typeof anticipation.prosody }
            ).anticipatedProsody = anticipation.prosody;

            diag.state('🎭 Anticipation pipeline result', {
              intent: anticipation.intent.intent,
              intentConfidence: anticipation.intent.confidence.toFixed(2),
              emotionTrajectory: anticipation.emotion.trajectory,
              emotionConfidence: anticipation.emotion.confidence.toFixed(2),
              speedMultiplier: anticipation.prosody.speedMultiplier.toFixed(2),
              microReaction: !!anticipation.prosody.microReactionSsml,
            });

            // ===============================================
            // 🚀 BETTER THAN HUMAN: Send anticipation to frontend BEFORE turn completes
            // This enables the avatar to show emotional response while user is still speaking
            // ===============================================
            if (sendDataMessage && anticipation.emotion.confidence > 0.5) {
              // Determine urgency from trajectory
              const urgency =
                anticipation.emotion.trajectory.includes('distress') ||
                anticipation.emotion.trajectory.includes('crisis')
                  ? 'high'
                  : anticipation.emotion.trajectory.includes('stable')
                    ? 'low'
                    : 'normal';

              void sendDataMessage('anticipation_signal', {
                intent: anticipation.intent.intent,
                intentConfidence: anticipation.intent.confidence,
                emotionTrajectory: anticipation.emotion.trajectory,
                predictedEmotion:
                  anticipation.emotion.anticipatedEmotion || anticipation.emotion.trajectory,
                emotionConfidence: anticipation.emotion.confidence,
                urgency,
                timestamp: Date.now(),
              }).catch(() => {
                // Non-critical
              });

              diag.state('🚀 Anticipation signal sent to frontend', {
                intent: anticipation.intent.intent,
                trajectory: anticipation.emotion.trajectory,
              });
            }
          }
        } catch {
          // Anticipation pipeline processing is non-critical
        }
      }

      // ===============================================
      // 🧠 ANTICIPATORY TRIGGERS (Phase 5)
      // "Better than Human" - Fire early responses before full expression
      // Detects vulnerability, distress, celebration, etc. from partial input
      // ===============================================
      if (userData.anticipatoryIntelligence && !conversationManager.isAgentSpeaking()) {
        try {
          // Convert voice emotion to VoiceProsodyCue format if available
          let voiceProsody: { cues: VoiceProsodyCue[]; overallScore: number } | undefined;
          if (userData.voiceEmotion) {
            const cues: VoiceProsodyCue[] = [];
            const confidence = userData.voiceEmotion.confidence || 0.5;
            // Map emotion to prosody cues
            if (userData.voiceEmotion.primary === 'sad') {
              cues.push({
                type: 'tremor',
                intensity: confidence,
                typicalMeaning: 'vulnerability',
                reliability: 0.7,
                observations: 1,
              });
            }
            if (
              userData.voiceEmotion.primary === 'angry' ||
              userData.voiceEmotion.primary === 'sad'
            ) {
              cues.push({
                type: 'pitch_change',
                direction: 'irregular',
                intensity: confidence,
                typicalMeaning: 'distress',
                reliability: 0.6,
                observations: 1,
              });
            }
            // Add pause detection if we have breath pause data
            if (userData.isInBreathPause) {
              cues.push({
                type: 'pause',
                intensity: 0.6,
                typicalMeaning: 'processing',
                reliability: 0.5,
                observations: 1,
              });
            }
            voiceProsody = {
              cues,
              overallScore: confidence,
            };
          }

          // Check session-level safeguards
          const now = Date.now();
          const firingsThisSession = userData.anticipatoryFiringsThisSession ?? 0;
          const lastFiringAt = userData.lastAnticipatoryFiringAt ?? 0;
          const cooldownMs =
            (userData.anticipatoryIntelligence.safeguards?.minSecondsBetween ?? 120) * 1000;
          const maxPerSession = userData.anticipatoryIntelligence.safeguards?.maxPerSession ?? 3;

          // Skip if we've exceeded session limits
          if (firingsThisSession < maxPerSession && now - lastFiringAt > cooldownMs) {
            const result = processAnticipatoryInput(
              sessionId,
              event.transcript,
              userData.anticipatoryIntelligence,
              voiceProsody,
              userData.lastTopic
            );

            if (result.shouldFire && result.verbalResponse) {
              // Speak the anticipatory response via coordinated speech
              void coordinatedSay(sessionId, result.verbalResponse, { allowInterruptions: true });

              // Send avatar cue to frontend
              if (ctx.sendDataMessage && result.responseTemplate?.nonVerbal) {
                void ctx.sendDataMessage('avatar_cue', {
                  type: 'anticipatory_response',
                  ...result.responseTemplate.nonVerbal,
                  anticipatedOutcome: result.anticipatedOutcome,
                });
              }

              // Update session-level tracking
              userData.anticipatoryFiringsThisSession = firingsThisSession + 1;
              userData.lastAnticipatoryFiringAt = now;

              // Store pending result for outcome recording when final transcript arrives
              // Only store if we have a detection result
              if (result.detection) {
                userData.pendingAnticipatoryResult = {
                  detection: result.detection,
                  firedAt: now,
                  verbalResponse: result.verbalResponse,
                  anticipatedOutcome: result.anticipatedOutcome || 'unknown',
                };
              }

              diag.session('🔮 Anticipatory trigger fired', {
                anticipatedOutcome: result.anticipatedOutcome,
                confidence: result.confidence.toFixed(2),
                partialTranscript: event.transcript.slice(0, 50),
              });
            }
          }
        } catch {
          // Anticipatory trigger processing is non-critical
        }
      }

      // ===============================================
      // 🚀 SPECULATIVE CONTEXT PREFETCH
      // Start building context while user is still speaking
      // Saves ~150ms on final response
      // ===============================================
      if (event.transcript.length > 20 && userId) {
        // Use .then() to avoid await in non-async context
        import('../shared/performance/session-optimizations.js')
          .then(({ startSpeculativePrefetch }) => {
            startSpeculativePrefetch(sessionId, event.transcript, async (text) => {
              const { getRAGContext } = await import('../../memory/semantic-rag.js');
              return getRAGContext(text, {
                topK: 3,
                userId,
                minScore: 0.3,
              });
            });
          })
          .catch(() => {
            // Prefetch is non-critical
          });
      }
    }

    // ===============================================
    // RESPONSE ANTICIPATION (Monitoring Mode)
    // Analyze partial transcripts for pattern caching
    //
    // Skip when agent is speaking to prevent echo/feedback from
    // triggering false pattern matches and caching wrong responses.
    // ===============================================
    const isAgentCurrentlySpeaking = conversationManager.isAgentSpeaking();
    if (!isAgentCurrentlySpeaking) {
      processResponseAnticipation(sessionId, event);
    }

    // ===============================================
    // FINAL TRANSCRIPT PROCESSING
    // ===============================================
    if (event.isFinal && event.transcript) {
      // 📊 E2E LATENCY: Start tracking this turn
      // This helps diagnose whether pauses are OpenAI, TTS, or our code
      const turnId = startLatencyTurn(sessionId, event.transcript);
      markProcessingStarted(sessionId);

      // ===============================================
      // 🧠 INTELLIGENT NOISE/ECHO FILTERING
      // Validate transcript before treating as user turn
      // Catches: foreign char noise, echo, STT artifacts
      // ===============================================
      const lastAgentSpeechEnd = userData.lastAgentSpeechEndTime || 0;
      const timeSinceAgentSpoke = Date.now() - lastAgentSpeechEnd;

      const validationContext: ValidationContext = {
        // Use lastAgentResponse for echo detection (already tracked)
        lastAgentUtterance: userData.lastAgentResponse,
        timeSinceAgentSpoke,
        expectedLanguage: userData.preferredLanguage || 'en',
        isAgentSpeaking: isAgentCurrentlySpeaking,
      };

      const validation = validateTranscript(event.transcript, validationContext);

      if (!validation.isValid) {
        diag.state('🚫 Transcript rejected by intelligent filter', {
          reason: validation.reason,
          confidence: validation.confidence.toFixed(2),
          transcript: event.transcript.slice(0, 30),
          timeSinceAgentSpoke,
        });
        // Don't process this as a user turn - it's noise/echo
        return;
      }

      // Use cleaned transcript if available
      const cleanedTranscript = validation.cleanedTranscript || event.transcript;

      // ===============================================
      // 🌍 LANGUAGE DETECTION (First few utterances)
      // Detect user's language from speech patterns
      // Fire-and-forget since this handler is sync
      // ===============================================
      void (async () => {
        try {
          // Lazy import to avoid circular dependencies
          const { accumulateForDetection, updateDetectedLanguage, initializeSessionLanguage } =
            await import('../../services/language/index.js');

          // Initialize session language if not already done
          const preferredLang = userData.preferredLanguage as string | undefined;
          initializeSessionLanguage(
            sessionId,
            userData.userId,
            preferredLang as Parameters<typeof initializeSessionLanguage>[2]
          );

          // Accumulate for detection (returns result after 2+ utterances)
          const detection = accumulateForDetection(sessionId, cleanedTranscript);
          if (detection && detection.confidence >= 0.7) {
            const updated = updateDetectedLanguage(sessionId, detection);
            if (updated) {
              userData.preferredLanguage = detection.detectedLanguage;
              diag.state('🌍 Language auto-detected', {
                detected: detection.detectedLanguage,
                confidence: detection.confidence.toFixed(2),
              });
            }
          }
        } catch {
          // Language detection is non-critical - silently continue
        }
      })();

      // ===============================================
      // 🧠 HUMAN TURN INTELLIGENCE (Final)
      // Full analysis now that we have the complete utterance
      // ===============================================
      const finalTurnContext: TurnContext = {
        transcript: cleanedTranscript,
        isFinal: true,
        emotion: userData.voiceEmotion?.primary as TurnContext['emotion'],
        emotionalIntensity: userData.lastEmotionAnalysis?.intensity,
        isAgentSpeaking: isAgentCurrentlySpeaking,
        turnCount: userData.turnCount || 0,
        previousMessage: userData.lastUserMessage,
        silenceDurationMs: timeSinceAgentSpoke > 5000 ? undefined : timeSinceAgentSpoke,
      };

      const finalTurnSignals = analyzeTurnSignals(sessionId, finalTurnContext);

      // Store recommended delay for response processor
      userData.recommendedResponseDelay = finalTurnSignals.recommendedDelay;
      userData.lastUserMessage = cleanedTranscript;

      // Update session state for learning user's patterns
      // 🦀 Use Rust for O(1) word counting, JS fallback otherwise
      const wordCount = RUST_COUNTING_AVAILABLE
        ? countWordsRust(cleanedTranscript)
        : cleanedTranscript.split(/\s+/).filter((w: string) => w.length > 0).length;
      updateSessionState(sessionId, {
        sentenceLength: wordCount,
        emotionalIntensity: userData.lastEmotionAnalysis?.intensity,
      });

      // Log human intelligence insights
      if (finalTurnSignals.isUrgent) {
        diag.state('🧠 Human intelligence: URGENT message detected', {
          transcript: cleanedTranscript.slice(0, 50),
        });
      }

      diag.state('🧠 Turn analysis complete', {
        completionConfidence: finalTurnSignals.completionConfidence.toFixed(2),
        recommendedDelay: finalTurnSignals.recommendedDelay,
        isUrgent: finalTurnSignals.isUrgent,
      });

      // ===============================================
      // 🔄 WORKFLOW PHRASE TRIGGER CHECK
      // Check if this transcript matches any phrase-triggered routines
      // Fire-and-forget since routine execution is independent
      // ===============================================
      if (userData.userId) {
        const userId = userData.userId;
        void (async () => {
          try {
            const { getWorkflowEngine } =
              await import('../../services/workflows/workflow-engine.js');
            const engine = getWorkflowEngine(userId);
            const triggered = await engine.handlePhraseTrigger(cleanedTranscript);
            if (triggered) {
              diag.state('🔄 Routine triggered by phrase', {
                routineName: triggered.name,
                transcript: cleanedTranscript.slice(0, 30),
              });
            }
          } catch {
            // Phrase trigger check is non-critical - silently continue
          }
        })();
      }

      // ===============================================
      // 🧠 ANTICIPATORY TRIGGER OUTCOME RECORDING
      // Learn from the completed utterance to improve predictions
      // ===============================================
      if (userData.pendingAnticipatoryResult && userData.triggerProfile) {
        try {
          // Determine user reaction based on how they continued
          // If they continued speaking on a related topic, we likely guessed right
          // If they changed topic or seemed annoyed, we likely guessed wrong
          let userReaction: 'appreciated' | 'continued' | 'ignored' | 'corrected' | 'annoyed' =
            'continued';

          // Simple heuristics for reaction detection
          const response = cleanedTranscript.toLowerCase();
          if (
            response.includes('thank') ||
            response.includes('exactly') ||
            response.includes('yes')
          ) {
            userReaction = 'appreciated';
          } else if (
            response.includes('no') ||
            response.includes("that's not") ||
            response.includes("i wasn't")
          ) {
            userReaction = 'corrected';
          } else if (response.includes('anyway') || response.includes('moving on')) {
            userReaction = 'ignored';
          }

          // Record outcome for learning
          const updatedProfile = recordAnticipatoryOutcome(
            userData.triggerProfile,
            sessionId,
            userData.pendingAnticipatoryResult.detection,
            userReaction,
            'space_creating', // Default response type
            userData.voiceEmotion?.confidence ?? 0,
            userReaction === 'appreciated' || userReaction === 'continued'
          );

          // Also learn from the completed utterance
          const { anticipatedOutcome } = userData.pendingAnticipatoryResult;
          const profileWithLearning = learnFromUtterance(updatedProfile, {
            fullUtterance: cleanedTranscript,
            actualOutcome: (anticipatedOutcome || 'processing') as
              | 'vulnerability'
              | 'distress'
              | 'celebration'
              | 'processing'
              | 'avoidance'
              | 'request',
            voiceCues: userData.voiceEmotion
              ? [
                  {
                    type: 'pitch_change' as const,
                    direction: 'irregular' as const,
                    intensity: userData.voiceEmotion.confidence ?? 0.5,
                    typicalMeaning: 'distress' as const,
                    reliability: 0.6,
                    observations: 1,
                  },
                ]
              : [],
            sessionId,
            activatedTriggers: [],
          });

          // Update profile for session-end save
          userData.triggerProfile = profileWithLearning;
          userData.anticipatoryIntelligence = profileWithLearning.anticipatoryIntelligence;

          diag.session('🔮 Anticipatory outcome recorded', {
            anticipatedOutcome: userData.pendingAnticipatoryResult.anticipatedOutcome,
            userReaction,
            timeSinceFiring: Date.now() - userData.pendingAnticipatoryResult.firedAt,
          });
        } catch {
          // Outcome recording is non-critical
        } finally {
          // Clear pending result
          userData.pendingAnticipatoryResult = null;
        }
      }

      // 📊 MUSIC TRANSITION FEEDBACK
      // If music recently ended, record user's response for per-user learning
      // This helps the system learn what transition types work for each user
      if (hasPendingMusicFeedback()) {
        try {
          // Auto-detect feedback signals from what the user said
          const detectedFeedback = detectFeedbackFromResponse(cleanedTranscript);

          // Also use voice emotion if available
          // Note: 'calm' is not a valid VoiceEmotionType, using 'neutral' as base
          const voiceTone =
            userData.voiceEmotion?.primary === 'happy' ||
            (userData.voiceEmotion?.valence ?? 0) > 0.3
              ? 'warmer'
              : userData.voiceEmotion?.primary === 'neutral'
                ? 'calmer'
                : 'neutral';

          const feedbackRecorded = recordMusicFeedback(
            {
              ...detectedFeedback,
              voiceTone: voiceTone as 'warmer' | 'calmer' | 'neutral',
              continuedSession: true,
            },
            sessionId
          );

          if (feedbackRecorded) {
            diag.state('📊 Music feedback recorded from user response', {
              transcript: cleanedTranscript.slice(0, 50),
              wasPositive: detectedFeedback.wasPositive,
              voiceTone,
            });
          }
        } catch (feedbackErr) {
          // Non-critical, don't block transcript processing
          diag.debug('📊 Music feedback recording failed (non-critical)', {
            error: String(feedbackErr),
          });
        }
      }

      // 🚀 RESPONSE ANTICIPATION CACHE BYPASS
      // If we have a high-confidence cached response, say it immediately
      // This provides instant-feeling responses for common patterns (greetings, etc.)
      //
      // IMPORTANT: Skip cache bypass if agent is currently speaking OR recently finished!
      // This prevents echo/feedback from triggering false responses.
      // e.g., Ferni says "Hey, how are you?" → mic picks up echo → transcribes "how are you"
      // → matches question_about_agent pattern → could trigger cached response
      // NOTE: We now use empty templates for this pattern so LLM handles it with character
      //
      // The cooldown period accounts for:
      // - Short greetings where agent finishes before echo is transcribed
      // - STT processing delay
      // - Network latency
      // NOTE: lastAgentSpeechEnd and timeSinceAgentSpoke already calculated above
      // CRITICAL FIX: Use content-aware echo window that checks transcript content
      // This prevents blocking legitimate user requests like "Could you check the news?"
      const adaptiveEchoCooldown = getEchoPreventioncooldownMs(
        userData.lastAgentUtteranceDurationMs,
        event.transcript // Pass transcript for content-aware detection
      );
      const isInEchoCooldown = timeSinceAgentSpoke < adaptiveEchoCooldown;

      // Skip cache if currently speaking OR within cooldown window
      const shouldSkipCache = isAgentCurrentlySpeaking || isInEchoCooldown;
      const cached = !shouldSkipCache ? getCachedResponseIfAvailable(sessionId) : null;

      if (isInEchoCooldown && !isAgentCurrentlySpeaking) {
        // Record this as potential echo for learning
        recordEchoDetectionForLearning(sessionId, timeSinceAgentSpoke);

        diag.state('⚡ CACHE BYPASS SKIPPED - Adaptive echo prevention', {
          timeSinceAgentSpokeMs: timeSinceAgentSpoke,
          adaptiveCooldownMs: adaptiveEchoCooldown,
          lastUtteranceDurationMs: userData.lastAgentUtteranceDurationMs,
          transcript: event.transcript.slice(0, 30),
        });
      }

      if (cached) {
        diag.state('⚡ CACHE BYPASS - Speaking cached response immediately', {
          intent: cached.intent,
          response: cached.response.slice(0, 50),
        });

        // Say the cached response immediately (with SSML if available) via coordinated speech
        try {
          coordinatedSay(sessionId, cached.ssml || cached.response, { allowInterruptions: true });

          // Track that we used a cached response (+ on-behalf call capture)
          import('./agent-turn-recorder.js')
            .then(({ recordAgentTurn }) => recordAgentTurn(sessionId, services, cached.response))
            .catch(() => {
              // Fallback
              if (services && typeof services.addTurn === 'function') {
                services.addTurn('assistant', cached.response);
              }
            });
          if (userData) {
            userData.lastAgentResponse = cached.response;
            userData.lastAgentResponseTime = Date.now();
          }
        } catch (sayErr) {
          diag.warn('Cached response say failed', { error: String(sayErr) });
          // Fall through to normal processing
        }
      } else if (shouldSkipCache && getCachedResponseIfAvailable(sessionId)) {
        // Log when we skip cache due to agent speaking or cooldown (echo prevention)
        if (isAgentCurrentlySpeaking) {
          diag.state('⚡ CACHE BYPASS SKIPPED - Agent is speaking (echo prevention)');
        }
        // Cooldown skip is logged above already
      }

      // Fire and forget - async but we don't await in the sync handler
      void processFinalTranscript({
        event,
        cleanedTranscript,
        room,
        session,
        services,
        sessionPersona,
        conversationManager,
        voiceHumanization,
        userData,
        userId,
        sessionId,
        silenceContext,
        dynamicToolLoader,
        autoOptimizer,
        agent,
      }).catch((err) => {
        diag.warn('processFinalTranscript error', { error: String(err) });
      });
    }
  };

  return { handler };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Send partial transcript to frontend for anticipation UI
 */
function sendPartialTranscript(room: Room, transcript: string): void {
  const now = Date.now();
  const lastPartialKey = Symbol.for('ferniLastPartialTime');
  const lastPartialTime = (globalThis as Record<symbol, number>)[lastPartialKey] || 0;

  // Only send every ~500ms to avoid spam
  if (now - lastPartialTime > 500) {
    (globalThis as Record<symbol, number>)[lastPartialKey] = now;
    room.localParticipant
      ?.publishData(
        new TextEncoder().encode(
          JSON.stringify({
            type: 'partial_transcript',
            text: transcript,
            isFinal: false,
            timestamp: now,
          })
        ),
        { reliable: false } // Use unreliable for partial transcripts (low latency)
      )
      .catch((err) => {
        // Non-blocking - log at debug for troubleshooting transcript publish failures
        getLogger().debug({ error: String(err) }, 'Transcript publish failed (non-critical)');
      });
  }
}

/**
 * Process response anticipation for faster responses
 */
function processResponseAnticipation(sessionId: string, event: TranscriptEvent): void {
  const antFlags = getSessionFlags(sessionId);
  if (!antFlags.enableResponseAnticipation || !event.transcript) {
    return;
  }

  try {
    const anticipator = getResponseAnticipationService(sessionId);
    const startTime = Date.now();
    const anticipation = anticipator.anticipate(event.transcript);
    const latencyMs = Date.now() - startTime;

    if (anticipation && anticipation.confidence > 0.5) {
      // Record metrics
      if (antFlags.enableMetrics) {
        recordCacheAttempt(sessionId, anticipation.isComplete, anticipation.intent, latencyMs);
        recordLatency(sessionId, 'anticipation', latencyMs);
      }

      diag.state('Response anticipation', {
        intent: anticipation.intent,
        confidence: anticipation.confidence.toFixed(2),
        isComplete: anticipation.isComplete,
        isFinal: event.isFinal,
        latencyMs,
      });

      // If using cached responses (not just monitoring) and high confidence
      if (
        antFlags.useCachedResponses &&
        anticipation.isComplete &&
        anticipation.confidence >= antFlags.cacheConfidenceThreshold &&
        event.isFinal
      ) {
        const cached = anticipator.getCompleteResponse();
        if (cached) {
          // 🚀 CACHE HIT: Store for bypass in processFinalTranscript
          // The cached response will be used instead of calling LLM for simple intents
          anticipator.markCacheHit(anticipation.intent);
          diag.state('⚡ CACHE HIT - Cached response ready', {
            intent: anticipation.intent,
            response: cached.response.slice(0, 50),
            confidence: anticipation.confidence,
          });
        }
      }
    }
  } catch {
    // Response anticipation is non-critical
  }
}

/**
 * Check if we have a cached response to bypass LLM
 * Returns the cached response + SSML if available
 */
export function getCachedResponseIfAvailable(
  sessionId: string
): { response: string; ssml: string; intent: string } | null {
  const antFlags = getSessionFlags(sessionId);
  if (!antFlags.useCachedResponses) {
    return null;
  }

  try {
    const anticipator = getResponseAnticipationService(sessionId);
    if (!anticipator.hasCacheHit()) {
      return null;
    }

    const cached = anticipator.getCompleteResponse();
    if (!cached) {
      return null;
    }

    // Clear the cache hit flag after using
    const intent = anticipator.consumeCacheHit();
    return {
      response: cached.response,
      ssml: cached.ssml,
      intent: intent || 'unknown',
    };
  } catch {
    return null;
  }
}

// ============================================================================
// NEWS FOLLOW-UP HANDLING
// ============================================================================

const NEWS_FOLLOWUP_EXPIRY_MS = 5 * 60 * 1000;
const NEWS_READ_PATTERNS = [
  /^(read|tell|share)\s+(them|it|the news|the headlines)\b/i,
  /^(go ahead|yes|yeah|yep|please|sure)\b.*(read|share|tell)?/i,
  /^(just\s+)?(read|say)\s+(it|them)\b/i,
  /^(give me|tell me)\s+(the\s+)?(headlines|news)\b/i,
];
const NEWS_SUMMARY_PATTERNS = [
  /^(quick|short)\s+(summary|version)\b/i,
  /^(give me|just)\s+(the\s+)?(highlights|summary|gist)\b/i,
  /^(highlights|summary)\s*(please)?$/i,
];
const NEWS_SKIP_PATTERNS = [/^(not now|later|skip|never mind|no thanks)\b/i];

function handlePendingNewsFollowup(
  transcript: string,
  userData: UserData,
  sessionId: string
): boolean {
  const pending = userData.pendingNewsResponse;
  if (!pending) {
    return false;
  }

  if (Date.now() - pending.createdAt > NEWS_FOLLOWUP_EXPIRY_MS) {
    userData.pendingNewsResponse = undefined;
    return false;
  }

  const normalized = transcript.trim();
  const wantsRead = NEWS_READ_PATTERNS.some((pattern) => pattern.test(normalized));
  const wantsSummary = NEWS_SUMMARY_PATTERNS.some((pattern) => pattern.test(normalized));
  const wantsSkip = NEWS_SKIP_PATTERNS.some((pattern) => pattern.test(normalized));

  if (!wantsRead && !wantsSummary && !wantsSkip) {
    return false;
  }

  if (wantsSkip) {
    userData.pendingNewsResponse = undefined;
    void coordinatedSay(
      sessionId,
      'Got it. If you want headlines later, just say check the news.',
      {
        allowInterruptions: true,
      }
    );
    return true;
  }

  const response = pending.response;
  userData.pendingNewsResponse = undefined;
  void coordinatedSay(sessionId, response, { allowInterruptions: true });
  return true;
}

/**
 * Process final transcript with all necessary processing steps
 */
async function processFinalTranscript(
  ctx: TranscriptHandlerContext & { event: TranscriptEvent; cleanedTranscript: string }
): Promise<void> {
  const {
    event,
    cleanedTranscript,
    session,
    services,
    sessionPersona,
    conversationManager,
    voiceHumanization,
    userData,
    userId,
    sessionId,
    silenceContext,
    dynamicToolLoader,
    autoOptimizer,
    agent,
  } = ctx;

  // ===============================================
  // 🧠 DYNAMIC MEMORY CAPTURE: LLM-powered extraction
  // Uses temporal decoupling: fast capture (< 50ms) + async deep extraction
  // Extracts entities, relationships, emotions, dates, topics
  // Deep LLM extraction runs in background worker
  // ===============================================
  try {
    if (!userId) {
      diag.debug('Skipping memory capture - no userId');
    } else {
      const { fastCapture, recordTurn } = await import('../../memory/dynamic/index.js');
      const captureResult = await fastCapture({
        userId,
        sessionId,
        turnNumber: 0, // Transcript handler doesn't track turn numbers
        transcript: event.transcript,
        personaId: userData.personaId,
      });

      // 🧠 CRITICAL: Record to STM buffer for session context
      recordTurn(sessionId, userId, captureResult, event.transcript, 0);

      // Log capture results for debugging
      if (captureResult.mentionedEntities.length > 0 || captureResult.asyncJobId) {
        diag.state('🧠 Dynamic memory: Fast capture complete', {
          entityCount: captureResult.mentionedEntities.length,
          topicHints: captureResult.topicHints,
          asyncJobId: captureResult.asyncJobId,
          captureTimeMs: captureResult.captureTimeMs,
        });
      }
    }
  } catch (captureError) {
    // Non-fatal - memory capture is enhancement, not critical
    diag.warn('Memory capture error', { error: String(captureError) });
  }

  // ===============================================
  // 🧵 THREAD RECORDING: Record user message for cross-channel continuity
  // This enables seamless conversation flow: SMS → Voice → Push
  // ===============================================
  if (userId && event.transcript) {
    try {
      const { recordUserMessage } =
        await import('../../services/conversation-thread/thread-recorder.js');
      void recordUserMessage({
        userId,
        sessionId,
        personaId: sessionPersona.id as import('../../personas/types.js').PersonaId,
        threadId: userData.threadId,
        content: event.transcript,
        sentiment:
          userData.lastEmotionAnalysis?.primary === 'happy'
            ? 'positive'
            : userData.lastEmotionAnalysis?.primary === 'sad'
              ? 'negative'
              : 'neutral',
        topics: userData.recentTopics,
      });
    } catch (threadErr) {
      // Non-fatal - thread recording is enhancement
      diag.debug('Thread recording error', { error: String(threadErr) });
    }
  }

  // ===============================================
  // 🔴 CRITICAL FIX: Record user turn for memory persistence
  // This was MISSING - causing all user speech to be lost!
  // Without this, learning engine gets no data, summaries are empty,
  // and Ferni never remembers what users say.
  // ===============================================
  // For on-behalf calls, also captures for superhuman analysis
  if (event.transcript) {
    import('./agent-turn-recorder.js')
      .then(({ recordUserTurn }) => recordUserTurn(sessionId, services, event.transcript))
      .catch(() => {
        // Fallback
        if (services && typeof services.addTurn === 'function') {
          services.addTurn('user', event.transcript);
        }
      });
    diag.debug('📝 User turn recorded for memory', {
      preview: event.transcript.slice(0, 50),
      sessionId,
    });
  }

  // ===============================================
  // 📰 NEWS FOLLOW-UP: Read or summarize on request
  // ===============================================
  if (handlePendingNewsFollowup(cleanedTranscript, userData, sessionId)) {
    return;
  }

  // ===============================================
  // 🎯 DIRECT TOOL ROUTING (Surgical Pre-LLM Execution)
  // HIGH-CONFIDENCE ONLY: Music, weather, handoff - obvious intents
  // This fixes the "Gemini returns nothing" bug for clear tool requests
  // Unlike full semantic routing, this has very low false positive rate
  // ===============================================
  if (event.transcript) {
    try {
      const { routeDirectly, isDirectRoutingEnabled } = await import('./direct-tool-router.js');

      if (isDirectRoutingEnabled()) {
        const directResult = await routeDirectly(event.transcript, {
          userId: userId || 'anonymous',
          sessionId,
          personaId: sessionPersona.id,
          recentTopics: userData.recentTopics,
          lastAgentMessage: userData.lastAgentResponse,
          userLocation: userData.userLocation,
        });

        if (directResult.handled) {
          diag.state('🎯 Direct router handled transcript', {
            toolId: directResult.toolId,
            confidence: directResult.confidence,
            intent: directResult.intent,
          });

          // Track turn count and user message
          userData.turnCount = (userData.turnCount || 0) + 1;
          userData.lastUserMessage = event.transcript;

          // 🚫 DEDUPLICATION: Mark tool as executed to prevent LLM from also calling it
          // This prevents double-execution when:
          // 1. Direct router executes tool
          // 2. LLM (OpenAI native function calling or JSON workaround) also tries to call same tool
          if (directResult.toolId) {
            try {
              const { markToolExecutedBySemanticRouter } =
                await import('../shared/tool-call-sanitizer.js');
              markToolExecutedBySemanticRouter(sessionId, directResult.toolId);
            } catch {
              // Non-critical - deduplication is defensive
            }
          }

          if (directResult.speechResponse) {
            if (directResult.intent === 'news') {
              userData.pendingNewsResponse = {
                response: directResult.speechResponse,
                createdAt: Date.now(),
              };
              void coordinatedSay(
                sessionId,
                'I pulled the headlines. Want a quick summary, or should I read them out?',
                { allowInterruptions: true }
              );
            } else {
              void coordinatedSay(sessionId, directResult.speechResponse, {
                allowInterruptions: true,
              });
            }
          }

          // 🛑 EARLY RETURN: Skip LLM processing to prevent double-response
          // Previously we let LLM "respond naturally" but this caused issues:
          // 1. LLM didn't know tool was already executed
          // 2. With JSON prompts, LLM output JSON instead of natural speech
          // 3. Even with OpenAI native function calling, LLM might call the tool again
          // The tool result provides the response (e.g., music starts playing)
          return;
        }
      }
    } catch (directRouteError) {
      // Non-fatal - fall through to semantic routing / Gemini
      diag.debug('Direct routing error (non-blocking)', { error: String(directRouteError) });
    }
  }

  // ===============================================
  // 🎯 SEMANTIC ROUTING (Pre-LLM Tool Execution)
  // Route high-confidence tool requests BEFORE Gemini processes
  // This bypasses the LLM entirely for deterministic tool calls
  // ===============================================
  if (isSemanticRoutingEnabled() && event.transcript) {
    try {
      // Build voice prosody context from userData (Better Than Human)
      const voiceProsody = userData.voiceEmotion
        ? {
            stressLevel: userData.voiceEmotion.stressLevel,
            arousal: userData.voiceEmotion.arousal,
            valence: userData.voiceEmotion.valence,
            anxietyMarkers: userData.voiceEmotion.anxietyMarkers ? ['detected'] : undefined,
            voiceTremor: userData.voiceEmotion.prosody?.breathiness
              ? userData.voiceEmotion.prosody.breathiness > 0.7
              : undefined,
          }
        : undefined;

      // Calculate WPM from prosody if available
      const wordsPerMinute = userData.voiceEmotion?.prosody?.speechRate;

      // Build detected emotion from voice analysis
      const detectedEmotion = userData.voiceEmotion
        ? {
            emotion: String(userData.voiceEmotion.primary),
            intensity: userData.voiceEmotion.confidence,
            valence: userData.voiceEmotion.valence,
            source: 'voice' as const,
          }
        : undefined;

      const routingResult = await routeTranscript(event.transcript, {
        userId: userId || 'anonymous',
        sessionId,
        personaId: sessionPersona.id,
        session,
        // ConversationHistory and recentTools are optional
        conversationHistory: [],
        recentTools: [],
        // Better Than Human: Voice prosody signals
        voiceProsody,
        wordsPerMinute,
        detectedEmotion,
      });

      // If semantic router handled it, skip normal processing
      if (routingResult.handled) {
        diag.state('🎯 Semantic router handled transcript', {
          toolId: routingResult.toolId,
          confidence: routingResult.confidence,
          // Better Than Human features
          emotionalArc: routingResult.emotionalArc?.trend,
          prosodyBoost: routingResult.prosodyBoost?.boostedTools?.slice(0, 2),
          hasIntervention: !!routingResult.suggestedIntervention,
        });

        // Still track the turn count and user message
        userData.turnCount = (userData.turnCount || 0) + 1;
        userData.lastUserMessage = event.transcript;

        // If there's a suggested intervention, store it for potential use
        if (routingResult.suggestedIntervention) {
          userData.suggestedIntervention = routingResult.suggestedIntervention;
          diag.state('🧠 Proactive intervention suggested', {
            type: routingResult.suggestedIntervention.type,
            urgency: routingResult.suggestedIntervention.urgency,
          });
        }

        return; // Skip Gemini processing
      }

      // Log if routing was attempted but not handled
      if (routingResult.attempted) {
        diag.state('🎯 Semantic routing attempted, passing to Gemini', {
          confidence: routingResult.confidence,
          emotionalTrend: routingResult.emotionalArc?.trend,
          boostedTools: routingResult.prosodyBoost?.boostedTools?.slice(0, 2),
        });

        // Store prosody boost for Gemini context injection
        if (routingResult.prosodyBoost?.boostedTools?.length) {
          userData.prosodyBoost = routingResult.prosodyBoost;
        }
      }
    } catch (routingError) {
      // Non-fatal - let Gemini handle
      diag.warn('Semantic routing error', { error: String(routingError) });
    }
  }

  // ===============================================
  // SESAME-INSPIRED: START NEW TURN
  // Signal turn boundary to reset anticipatory prosody state
  // This enables fresh anticipation for the next user utterance
  // ===============================================
  try {
    startSesameTurn(sessionId);
  } catch {
    // Sesame processing is non-critical
  }

  userData.turnCount = (userData.turnCount || 0) + 1;

  // Record turn in voice humanization for rhythm learning
  if (voiceHumanization) {
    voiceHumanization.recordTurn();
  }

  // Track turn in unified speech metrics
  trackConversationTurn(sessionId);

  // Process trial status for trial users
  processTrialStatus(userId, userData, services, session, conversationManager, sessionId);

  // Run human listening pipeline
  processHumanListeningPipeline(event.transcript, userData, sessionId);

  // 🌟 Better Than Human transcript processing
  // Detects: first-time vulnerability, emotional contradictions, patterns, linguistic style
  processBetterThanHumanTranscript(event.transcript, userData, sessionId, sessionPersona.id);

  // 🎵 Music Preference Extraction
  // Detects: "I love jazz", "I don't like country", "Taylor Swift is my favorite"
  // Music preferences are now learned automatically via music-user-learning.ts
  // using Thompson Sampling for preference optimization
  if (hasMusicContext(event.transcript)) {
    const extractedPrefs = extractMusicPreferences(event.transcript);
    if (extractedPrefs.length > 0) {
      // Preferences are stored via the music learning persistence system
      diag.state('🎵 Extracted music preferences from conversation', {
        count: extractedPrefs.length,
        preferences: extractedPrefs.map((p) => `${p.type} ${p.category}: ${p.value}`),
      });
    }
  }

  // 🧠 General Preference Extraction
  // Detects: sports teams, stocks, news interests, avoid topics, locations, allergies
  // Learns preferences from natural conversation without explicit commands
  if (userId && hasPreferenceContent(event.transcript)) {
    const extractedPrefs = extractPreferences(event.transcript);
    if (extractedPrefs.length > 0) {
      // Fire-and-forget: save each preference to the appropriate store
      for (const pref of extractedPrefs) {
        fireAndForget(async () => {
          await saveExtractedPreference(userId, pref);
        }, 'preference-extraction');
      }
      diag.state('🧠 Extracted general preferences from conversation', {
        count: extractedPrefs.length,
        preferences: extractedPrefs.map((p) => `${p.category}: ${p.value}`),
      });
    }
  }

  // Extract memorable moments
  const newMoments = extractMemorableMoments(event.transcript);
  if (newMoments.length > 0) {
    silenceContext.memorableMoments = mergeMemorableMoments(
      silenceContext.memorableMoments || [],
      newMoments
    );
    diag.state('Captured memorable moments', {
      newMoments,
      total: silenceContext.memorableMoments.length,
    });
  }

  // ===============================================
  // 🧠 LEARNING ENGINE: Record reaction to surfaced memory
  // If we surfaced a memory recently, infer user's reaction from their response
  // This enables "Better Than Human" adaptive memory surfacing
  // ===============================================
  if (userId && userData.lastSurfacedMemoryEventId) {
    fireAndForget(async () => {
      try {
        const { getMostRecentPendingSurfacingEvent, recordMemoryReaction } =
          await import('../../services/unified-memory-service.js');
        const { inferReactionFromTranscript, detectTopicChange } =
          await import('../../memory/learning-engine.js');

        const pendingEvent = getMostRecentPendingSurfacingEvent(userId);
        if (pendingEvent && pendingEvent.eventId === userData.lastSurfacedMemoryEventId) {
          // Infer reaction based on transcript content and topic
          const previousTopic = userData.lastSurfacedMemoryTopics?.[0];
          const reaction = inferReactionFromTranscript(event.transcript, {
            previousTopic,
          });

          // Record the reaction for learning
          await recordMemoryReaction(pendingEvent.eventId, reaction);

          diag.state('🧠 Learning Engine: Recorded memory reaction', {
            eventId: pendingEvent.eventId,
            reaction,
            previousTopic,
            transcript: event.transcript.slice(0, 50),
          });
        }
      } catch (error) {
        // Non-critical - learning engine is optional
        diag.debug('Learning engine reaction recording failed (non-blocking)', {
          error: String(error),
        });
      }

      // Clear the surfaced memory tracking for next turn
      userData.lastSurfacedMemoryEventId = undefined;
      userData.lastSurfacedMemoryTopics = undefined;
    }, 'learning-engine-reaction');
  }

  // Update context with last user message
  // NOTE: Data capture now runs BEFORE semantic routing (see above) to ensure
  // we capture everything regardless of how the request is handled
  silenceContext.lastUserMessage = event.transcript;

  // ===============================================
  // SYNC SILENCE CONTEXT WITH CONVERSATION STATE
  // This enables dynamic, context-aware silence responses
  // instead of generic repeated questions
  // ===============================================

  // Sync topics discussed from userData
  if (userData.recentTopics && userData.recentTopics.length > 0) {
    silenceContext.topicsDiscussed = [...userData.recentTopics];
  } else if (userData.lastTopic && !silenceContext.topicsDiscussed.includes(userData.lastTopic)) {
    silenceContext.topicsDiscussed = [
      userData.lastTopic,
      ...silenceContext.topicsDiscussed.slice(0, 9), // Keep last 10 topics
    ];
  }

  // Sync current topic being discussed
  if (userData.lastTopic) {
    silenceContext.wasDiscussingTopic = userData.lastTopic;
  }

  // Sync emotional tone from emotion analysis
  if (userData.lastEmotionAnalysis) {
    const { primary, intensity, distressLevel } = userData.lastEmotionAnalysis;

    // Determine emotional tone: heavy if distressed/intense, light if positive, neutral otherwise
    if ((distressLevel ?? 0) > 0.4 || (intensity ?? 0) > 0.7) {
      silenceContext.recentEmotionalTone = 'heavy';
    } else if (
      primary === 'happy' ||
      primary === 'excited' ||
      primary === 'joyful' ||
      primary === 'amused'
    ) {
      silenceContext.recentEmotionalTone = 'light';
    } else {
      silenceContext.recentEmotionalTone = 'neutral';
    }
  }

  // Sync last agent message for context
  if (userData.lastAgentResponse) {
    silenceContext.lastAgentMessage = userData.lastAgentResponse;
  }

  diag.state('Silence context synced', {
    topicsDiscussed: silenceContext.topicsDiscussed.slice(0, 3),
    emotionalTone: silenceContext.recentEmotionalTone,
    wasDiscussingTopic: silenceContext.wasDiscussingTopic,
  });

  // Process game topic change detection
  processGameTopicChange(event.transcript, silenceContext, sessionId);

  // Dynamic tool loading based on conversation topic
  // When new domains are loaded, update the agent's tools for OpenAI Realtime
  if (dynamicToolLoader) {
    const toolUpdaterLog = createLogger({ module: 'DynamicToolUpdate' });
    dynamicToolLoader
      .processMessage(event.transcript)
      .then(async (loadedDomains) => {
        if (loadedDomains.length > 0) {
          diag.tool('Dynamic domains loaded based on user message', {
            transcript: event.transcript.slice(0, 50),
            loadedDomains,
            totalLoadedDomains: dynamicToolLoader.getLoadedDomains().length,
          });

          // 🔧 MID-SESSION TOOL UPDATE: Register new tools with LLM
          // - OpenAI Realtime: Uses native updateTools() API
          // - Gemini: Injects system message about new tools
          if (supportsToolUpdates() && agent) {
            try {
              const newTools = dynamicToolLoader.getCurrentTools();
              const updated = await updateAgentTools(agent, newTools, {
                domains: loadedDomains,
              });
              if (updated) {
                toolUpdaterLog.info(
                  {
                    loadedDomains,
                    newToolCount: Object.keys(newTools).length,
                  },
                  '🔧 Agent tools updated mid-session'
                );
              }
            } catch (updateError) {
              toolUpdaterLog.warn(
                { error: String(updateError) },
                'Failed to update agent tools mid-session'
              );
            }
          }
        }
      })
      .catch((error) => {
        toolUpdaterLog.warn({ error }, 'Failed to process message for dynamic tool loading');
      });
  }

  // Process voice identity
  processVoiceIdentity(sessionId, event.transcript, userData);

  // Process DJ session flow tracking
  processDJSessionFlow(event.transcript, userData);

  // Collect feedback for tool optimization
  processFeedbackCollection(event.transcript, userData, sessionId, sessionPersona, autoOptimizer);

  // Process daily check-in (extracts weather and records to engagement system)
  processDailyCheckInTranscript(event.transcript, userData, sessionId, ctx.sendDataMessage);

  // Detect team huddle requests
  processTeamHuddleDetection(event.transcript, sessionPersona.id, ctx.sendDataMessage);
}

/**
 * Process First Taste Trial status
 */
function processTrialStatus(
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

    // Update userData with latest trial status
    userData.trialStatus = {
      inTrial: trialStatus.inTrial,
      timeRemainingMs: trialStatus.timeRemainingMs,
      approachingEnd: trialStatus.approachingEnd,
      trialEnded: trialStatus.trialEnded,
    };

    // If trial is ending and we should show transition, inject it
    if (trialStatus.showTransition && trialStatus.transitionPrompt) {
      userData.hasSpokenTrialEndPrompt = true;
      diag.session('Trial ending - speaking transition prompt', {
        timeRemainingMs: trialStatus.timeRemainingMs,
        trialEnded: trialStatus.trialEnded,
      });

      // Speak the transition prompt after the agent's next response via coordinated speech
      setTimeout(() => {
        try {
          if (session && !conversationManager.isAgentSpeaking()) {
            coordinatedSay(sessionId, trialStatus.transitionPrompt!, {
              allowInterruptions: true,
            });
          } else if (session) {
            // Agent is speaking - retry after another delay
            setTimeout(() => {
              try {
                if (session && !conversationManager.isAgentSpeaking()) {
                  coordinatedSay(sessionId, trialStatus.transitionPrompt!, {
                    allowInterruptions: true,
                  });
                }
              } catch {
                // Ignore retry errors
              }
            }, 3000);
          }
        } catch (sayErr) {
          diag.warn('Failed to speak trial transition', { error: String(sayErr) });
        }
      }, 2000);
    }
  }, 'trial-status-check');
}

/**
 * Process human listening pipeline for distress detection
 */
function processHumanListeningPipeline(
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

/**
 * Process Better Than Human transcript analysis
 * Detects first-time vulnerability, emotional contradictions, patterns, linguistic style
 */
function processBetterThanHumanTranscript(
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
        diag.state('💎 First-time vulnerability detected', {
          category: result.vulnerability.category,
          level: result.vulnerability.level.toFixed(2),
        });
      }

      if (result.contradiction?.detected) {
        (userData as Record<string, unknown>).betterThanHumanContradiction = result.contradiction;
        diag.state('🎭 Emotional contradiction detected', {
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

/**
 * Process game topic change detection
 */
function processGameTopicChange(
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
        // User seems to have moved on from the game
        const engine = getSessionGameEngine(sessionId);
        const gameSession = engine.endGame();
        resetSessionGameActivity(sessionId);

        diag.state('Game auto-ended due to topic change', {
          gameType,
          score: gameSession.score,
          rounds: gameSession.roundsPlayed,
        });
      }

      // Update silence context to reflect game state
      silenceContext.isGameActive = isSessionGameActive(sessionId);
      silenceContext.activeGameType = getSessionGameType(sessionId) || undefined;
    }
  }, 'game-topic-change');
}

/**
 * Process voice identity for trust/identity context
 */
function processVoiceIdentity(sessionId: string, transcript: string, userData: UserData): void {
  fireAndForget(async () => {
    const { onUserMessage } =
      await import('../../services/trust-and-identity/voice-agent-integration.js');
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

/**
 * Process DJ session flow tracking
 * Note: Topic and emotion tracking is now handled by the emotional-arc.ts system
 */
function processDJSessionFlow(transcript: string, userData: UserData): void {
  fireAndForget(async () => {
    const djController = getDJController();

    // Topic tracking is now handled by emotional-arc.ts and conversation-state.ts
    // which provide more sophisticated analysis than keyword matching
    const transcriptLower = transcript.toLowerCase();

    // Simple topic detection for debugging (actual tracking done elsewhere)
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

    // Process speech during music for "Our Songs" memories
    if (djController.isMusicActive()) {
      const voiceEmotion = userData.voiceEmotion?.primary || undefined;
      // Music memories are now stored via music-memory-integration.ts
      diag.state('User speech during music', {
        hasEmotion: !!voiceEmotion,
        transcript: transcript.slice(0, 50),
        emotion: voiceEmotion,
      });
    }
  }, 'dj-session-flow-tracking');
}

/**
 * Process daily check-in detection and recording
 * Extracts emotional weather from conversation and persists to engagement system
 */
function processDailyCheckInTranscript(
  transcript: string,
  userData: UserData,
  sessionId: string,
  sendDataMessage?: (type: string, payload: Record<string, unknown>) => Promise<void>
): void {
  // Only process if we have a user ID
  if (!userData.userId) {
    return;
  }

  // Build context for check-in detection
  const checkInCtx: DailyCheckInContext = {
    sessionId,
    userId: userData.userId,
    turnCount: userData.turnCount || 0,
    recentTranscripts: userData.recentTranscripts || [],
  };

  // Track recent transcripts for multi-turn check-in detection
  if (!userData.recentTranscripts) {
    userData.recentTranscripts = [];
  }
  userData.recentTranscripts.push(transcript);
  // Keep only last 10 transcripts
  if (userData.recentTranscripts.length > 10) {
    userData.recentTranscripts.shift();
  }

  // Process asynchronously (non-blocking)
  fireAndForget(async () => {
    const recorded = await processDailyCheckIn(transcript, checkInCtx, sendDataMessage);

    if (recorded) {
      diag.state('✅ Daily check-in recorded successfully', { sessionId });

      // Clean up stale sessions periodically
      cleanupStaleCheckIns();
    }
  }, 'daily-check-in-processing');
}

/**
 * Process feedback collection for tool optimization
 */
function processFeedbackCollection(
  transcript: string,
  userData: UserData,
  sessionId: string,
  sessionPersona: PersonaConfig,
  autoOptimizer: TranscriptHandlerContext['autoOptimizer']
): void {
  try {
    // Get tool execution data from conversation state
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

    // Process feedback (synchronous)
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
 * Detect and trigger team huddle when user requests team input
 */
function processTeamHuddleDetection(
  transcript: string,
  personaId: string,
  sendDataMessage: TranscriptHandlerContext['sendDataMessage']
): void {
  try {
    const detection = detectTeamHuddleRequest(transcript);

    if (detection.detected && detection.confidence >= 0.7) {
      diag.info('Team huddle request detected', {
        confidence: detection.confidence,
        phrase: detection.phrase,
      });

      // Create and send the team huddle trigger to frontend
      const trigger = createTeamHuddleTrigger(personaId, transcript);

      // Send via data message to frontend
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

// ============================================================================
// PREFERENCE EXTRACTION HELPERS
// ============================================================================

/**
 * Save an extracted preference to the appropriate storage
 * 🧠 Enables "Better than Human" - Ferni learns from natural conversation
 */
async function saveExtractedPreference(userId: string, pref: ExtractedPreference): Promise<void> {
  try {
    switch (pref.category) {
      // =======================================================================
      // ORIGINAL CATEGORIES (specific storage functions)
      // =======================================================================
      case 'sports_team':
        await addFavoriteTeam(userId, {
          name: pref.value,
          league: pref.context || 'Unknown',
          priority: 'secondary', // Auto-extracted = secondary, explicit = primary
        });
        diag.info('🏈 Learned favorite team from conversation', {
          team: pref.value,
          league: pref.context,
        });
        break;

      case 'stock_watchlist':
        await addToWatchlist(userId, pref.value);
        diag.info('📈 Learned stock interest from conversation', { ticker: pref.value });
        break;

      case 'news_interest':
        await addNewsInterest(userId, pref.value);
        diag.info('📰 Learned news interest from conversation', { topic: pref.value });
        break;

      case 'avoid_topic':
        await addAvoidTopic(userId, pref.value);
        diag.info('🚫 Learned topic to avoid from conversation', { topic: pref.value });
        break;

      case 'home_location':
        await saveLocation(userId, { name: 'Home', address: pref.value });
        diag.info('🏠 Learned home location from conversation', { location: pref.value });
        break;

      case 'work_location':
        await saveLocation(userId, { name: 'Work', address: pref.value });
        diag.info('💼 Learned work location from conversation', { location: pref.value });
        break;

      case 'allergy':
        await setAllergies(userId, [pref.value], 'add');
        diag.info('🤧 Learned allergy from conversation', { allergy: pref.value });
        break;

      case 'health_condition':
        // Health conditions are sensitive - log but don't auto-store without confirmation
        diag.info('🏥 Detected health condition mention (not auto-stored)', {
          condition: pref.value,
        });
        break;

      // =======================================================================
      // NEW "BETTER THAN HUMAN" LIFESTYLE PREFERENCES
      // Stored in Firestore: bogle_users/{userId}/lifestyle_preferences/{category}
      // =======================================================================
      case 'music_genre':
      case 'music_artist':
        await saveLifestylePreference(userId, 'music', pref.category, pref.value, pref.isNegative);
        diag.info(`🎵 Learned music preference from conversation`, {
          type: pref.category,
          value: pref.value,
          isNegative: pref.isNegative,
        });
        break;

      case 'movie_genre':
      case 'tv_show':
        await saveLifestylePreference(
          userId,
          'entertainment',
          pref.category,
          pref.value,
          pref.isNegative
        );
        diag.info(`🎬 Learned entertainment preference from conversation`, {
          type: pref.category,
          value: pref.value,
          isNegative: pref.isNegative,
        });
        break;

      case 'cuisine_preference':
      case 'dietary_restriction':
      case 'drink_preference':
      case 'restaurant_favorite':
        await saveLifestylePreference(userId, 'food', pref.category, pref.value, pref.isNegative);
        diag.info(`🍽️ Learned food preference from conversation`, {
          type: pref.category,
          value: pref.value,
          isNegative: pref.isNegative,
        });
        break;

      case 'exercise_routine':
      case 'wellness_practice':
      case 'sleep_pattern':
        await saveLifestylePreference(
          userId,
          'wellness',
          pref.category,
          pref.value,
          pref.isNegative
        );
        diag.info(`🏋️ Learned wellness preference from conversation`, {
          type: pref.category,
          value: pref.value,
        });
        break;

      case 'travel_style':
      case 'bucket_list_destination':
      case 'favorite_place':
        await saveLifestylePreference(userId, 'travel', pref.category, pref.value, pref.isNegative);
        diag.info(`✈️ Learned travel preference from conversation`, {
          type: pref.category,
          value: pref.value,
        });
        break;

      case 'learning_goal':
      case 'skill_building':
        await saveLifestylePreference(
          userId,
          'learning',
          pref.category,
          pref.value,
          pref.isNegative
        );
        diag.info(`📚 Learned learning goal from conversation`, {
          type: pref.category,
          value: pref.value,
        });
        break;

      case 'communication_preference':
      case 'social_style':
      case 'pet_preference':
        await saveLifestylePreference(userId, 'social', pref.category, pref.value, pref.isNegative);
        diag.info(`👥 Learned social preference from conversation`, {
          type: pref.category,
          value: pref.value,
        });
        break;

      case 'productivity_style':
      case 'morning_routine':
      case 'shopping_preference':
        await saveLifestylePreference(
          userId,
          'daily_life',
          pref.category,
          pref.value,
          pref.isNegative
        );
        diag.info(`🛠️ Learned daily life preference from conversation`, {
          type: pref.category,
          value: pref.value,
        });
        break;

      default:
        diag.debug('Unknown preference category', { category: pref.category, value: pref.value });
    }
  } catch (error) {
    diag.warn('Failed to save extracted preference', {
      category: pref.category,
      value: pref.value,
      error: String(error),
    });
  }
}

/**
 * Save a lifestyle preference to Firestore
 * Stores in: bogle_users/{userId}/lifestyle_preferences/{domain}
 *
 * Each domain (music, food, wellness, etc.) has arrays for:
 * - likes: things the user enjoys
 * - dislikes: things the user doesn't enjoy
 * - preferences: specific preference items with metadata
 */
async function saveLifestylePreference(
  userId: string,
  domain: string,
  category: string,
  value: string,
  isNegative?: boolean
): Promise<void> {
  try {
    const { getFirestoreStore } = await import('../../memory/firestore-store.js');
    const store = getFirestoreStore();
    const db = await store.getDatabase();

    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('lifestyle_preferences')
      .doc(domain);

    const doc = await docRef.get();
    const data = doc.exists ? (doc.data() as Record<string, unknown>) : {};

    // Get or initialize arrays
    const likes = (data.likes as string[]) || [];
    const dislikes = (data.dislikes as string[]) || [];
    const preferences =
      (data.preferences as Array<{ category: string; value: string; timestamp: string }>) || [];

    // Add to appropriate list
    if (isNegative) {
      if (!dislikes.includes(value)) {
        dislikes.push(value);
      }
    } else {
      if (!likes.includes(value)) {
        likes.push(value);
      }
    }

    // Also store with metadata
    const existingPrefIndex = preferences.findIndex(
      (p) => p.category === category && p.value === value
    );
    if (existingPrefIndex === -1) {
      preferences.push({
        category,
        value,
        timestamp: new Date().toISOString(),
      });
    }

    await docRef.set(
      {
        likes,
        dislikes,
        preferences,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    diag.debug('Saved lifestyle preference to Firestore', { userId, domain, category, value });
  } catch (error) {
    // Non-fatal - preference saving shouldn't break the session
    diag.debug('Could not save lifestyle preference to Firestore', {
      userId,
      domain,
      category,
      value,
      error: String(error),
    });
  }
}

export default createTranscriptHandler;
