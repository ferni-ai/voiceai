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

import type { voice } from '@livekit/agents';
import { log } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import { TextEncoder } from 'node:util';
import { getDJBooth } from '../../audio/index.js';
import { getSessionFlags } from '../../config/voice-humanization-flags.js';
import { setHumanListeningResult } from '../../intelligence/context-builders/human-listening.js';
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
import { recordCacheAttempt, recordLatency } from '../../services/voice-humanization-metrics.js';
import { getHumanListeningPipeline } from '../../speech/human-listening-pipeline.js';
import { getResponseAnticipationService } from '../../speech/response-anticipation.js';
import {
  processPartialTranscript as processSesamePartial,
  startNewTurn as startSesameTurn,
} from '../../speech/sesame-inspired/index.js';
import type { ConversationContext as FeedbackContext } from '../../tools/feedback-collector.js';
import { trackConversationTurn } from '../integrations/speech-metrics-integration.js';
import type { IntegrationResult as VoiceHumanizationIntegration } from '../integrations/voice-humanization-integration.js';
import type { UserData } from '../shared/types.js';

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
  };
  /** Auto optimizer for feedback collection */
  autoOptimizer: {
    processUserMessage: (
      message: string,
      context: FeedbackContext,
      lastToolId: string | undefined
    ) => void;
  };
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
 * 2 seconds is enough for:
 * - Audio buffer flush (~200-500ms)
 * - Speech-to-text processing (~500-1000ms)
 * - Network latency buffer (~200ms)
 */
const ECHO_PREVENTION_COOLDOWN_MS = 2000;

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
        // The onInterrupt callback handles the actual interruption
      }
    }

    // ===============================================
    // PARTIAL TRANSCRIPT STREAMING TO FRONTEND
    // Enables "reading the future" - responding before user finishes
    // ===============================================
    if (event.transcript && !event.isFinal && event.transcript.length > 10) {
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
      // 🚀 RESPONSE ANTICIPATION CACHE BYPASS
      // If we have a high-confidence cached response, say it immediately
      // This provides instant-feeling responses for common patterns (greetings, etc.)
      //
      // IMPORTANT: Skip cache bypass if agent is currently speaking OR recently finished!
      // This prevents echo/feedback from triggering false responses.
      // e.g., Ferni says "Hey, how are you?" → mic picks up echo → transcribes "how are you"
      // → matches question_about_user pattern → would incorrectly say "I'm doing well..."
      //
      // The cooldown period accounts for:
      // - Short greetings where agent finishes before echo is transcribed
      // - STT processing delay
      // - Network latency
      const lastAgentSpeechEnd = userData.lastAgentSpeechEndTime || 0;
      const timeSinceAgentSpoke = Date.now() - lastAgentSpeechEnd;
      const isInEchoCooldown = timeSinceAgentSpoke < ECHO_PREVENTION_COOLDOWN_MS;

      // Skip cache if currently speaking OR within cooldown window
      const shouldSkipCache = isAgentCurrentlySpeaking || isInEchoCooldown;
      const cached = !shouldSkipCache ? getCachedResponseIfAvailable(sessionId) : null;

      if (isInEchoCooldown && !isAgentCurrentlySpeaking) {
        diag.state('⚡ CACHE BYPASS SKIPPED - Echo prevention cooldown', {
          timeSinceAgentSpokeMs: timeSinceAgentSpoke,
          cooldownMs: ECHO_PREVENTION_COOLDOWN_MS,
          transcript: event.transcript.slice(0, 30),
        });
      }

      if (cached) {
        diag.state('⚡ CACHE BYPASS - Speaking cached response immediately', {
          intent: cached.intent,
          response: cached.response.slice(0, 50),
        });

        // Say the cached response immediately (with SSML if available)
        try {
          session.say(cached.ssml || cached.response, { allowInterruptions: true });

          // Track that we used a cached response
          if (services && typeof services.addTurn === 'function') {
          services.addTurn('assistant', cached.response);
          }
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

      processFinalTranscript({
        event,
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

/**
 * Process final transcript with all necessary processing steps
 */
function processFinalTranscript(ctx: TranscriptHandlerContext & { event: TranscriptEvent }): void {
  const {
    event,
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
  } = ctx;

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

  // Update context with last user message
  silenceContext.lastUserMessage = event.transcript;

  // Process game topic change detection
  processGameTopicChange(event.transcript, silenceContext, sessionId);

  // Dynamic tool loading based on conversation topic
  if (dynamicToolLoader) {
  dynamicToolLoader
    .processMessage(event.transcript)
    .then((loadedDomains) => {
      if (loadedDomains.length > 0) {
        diag.tool('Dynamic domains loaded based on user message', {
          transcript: event.transcript.slice(0, 50),
          loadedDomains,
          totalLoadedDomains: dynamicToolLoader.getLoadedDomains().length,
        });
      }
    })
    .catch((error) => {
      getLogger().warn({ error }, 'Failed to process message for dynamic tool loading');
    });
  }

  // Process voice identity
  processVoiceIdentity(sessionId, event.transcript, userData);

  // Process DJ session flow tracking
  processDJSessionFlow(event.transcript, userData);

  // Collect feedback for tool optimization
  processFeedbackCollection(event.transcript, userData, sessionId, sessionPersona, autoOptimizer);
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

  void (async () => {
    try {
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

        // Speak the transition prompt after the agent's next response
        setTimeout(() => {
          try {
            if (session && !conversationManager.isAgentSpeaking()) {
              session.say(trialStatus.transitionPrompt!, { allowInterruptions: true });
            } else if (session) {
              // Agent is speaking - retry after another delay
              setTimeout(() => {
                try {
                  if (session && !conversationManager.isAgentSpeaking()) {
                    session.say(trialStatus.transitionPrompt!, { allowInterruptions: true });
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
    } catch (trialErr) {
      diag.warn('Trial status check failed (non-fatal)', { error: String(trialErr) });
    }
  })();
}

/**
 * Process human listening pipeline for distress detection
 */
function processHumanListeningPipeline(
  transcript: string,
  userData: UserData,
  sessionId: string
): void {
  void (async () => {
    try {
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
    } catch (listeningErr) {
      diag.warn('Human listening pipeline error', { error: String(listeningErr) });
    }
  })();
}

/**
 * Process game topic change detection
 */
function processGameTopicChange(
  transcript: string,
  silenceContext: SilenceContext,
  sessionId: string
): void {
  void (async () => {
    try {
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
    } catch {
      // Games module not loaded - that's fine
    }
  })();
}

/**
 * Process voice identity for trust/identity context
 */
function processVoiceIdentity(sessionId: string, transcript: string, userData: UserData): void {
  void (async () => {
    try {
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
    } catch (identityErr) {
      diag.warn('Identity message processing failed', { error: String(identityErr) });
    }
  })();
}

/**
 * Process DJ session flow tracking
 */
function processDJSessionFlow(transcript: string, userData: UserData): void {
  void (async () => {
    try {
      const booth = getDJBooth();
      if (!booth) return;

      // Track topics discussed for session summary
      const topicKeywords: Record<string, string[]> = {
        work: ['work', 'job', 'boss', 'meeting', 'project', 'deadline', 'office'],
        family: ['mom', 'dad', 'sister', 'brother', 'family', 'kids', 'parents'],
        health: ['health', 'exercise', 'gym', 'doctor', 'sleep', 'tired', 'sick'],
        finances: ['money', 'budget', 'save', 'invest', 'bills', 'debt', 'salary'],
        relationships: ['dating', 'relationship', 'partner', 'friend', 'boyfriend', 'girlfriend'],
        goals: ['goal', 'dream', 'plan', 'future', 'want to', 'hope to', 'wish'],
        stress: ['stress', 'anxious', 'worried', 'overwhelmed', 'burned out'],
      };

      const transcriptLower = transcript.toLowerCase();
      for (const [topic, keywords] of Object.entries(topicKeywords)) {
        if (keywords.some((kw) => transcriptLower.includes(kw))) {
          booth.trackTopic(topic);
          diag.state('Session flow: tracked topic', { topic });
          break;
        }
      }

      // Track emotional moments
      const emotionKeywords: Record<string, string[]> = {
        happy: ['happy', 'excited', 'great', 'amazing', 'wonderful', 'love'],
        sad: ['sad', 'upset', 'miss', 'hurt', 'lonely'],
        anxious: ['anxious', 'worried', 'nervous', 'scared', 'fear'],
        grateful: ['grateful', 'thankful', 'appreciate', 'blessed'],
      };

      for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
        if (keywords.some((kw) => transcriptLower.includes(kw))) {
          booth.trackEmotion(emotion);
          diag.state('Session flow: tracked emotion', { emotion });
          break;
        }
      }

      // "OUR SONGS" - Process user speech during music for meaningful moments
      if (booth.isPlayingMusic()) {
        const voiceEmotion = userData.voiceEmotion?.primary || undefined;
        booth.processUserSpeechDuringMusic(transcript, voiceEmotion, userData.lastTopic);
        diag.state('Processed user speech during music for "Our Songs"', {
          transcript: transcript.slice(0, 50),
          emotion: voiceEmotion,
        });
      }
    } catch (e) {
      // Session flow tracking is non-critical
      getLogger().debug({ error: String(e) }, 'Session flow tracking error (non-critical)');
    }
  })();
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

export default createTranscriptHandler;
