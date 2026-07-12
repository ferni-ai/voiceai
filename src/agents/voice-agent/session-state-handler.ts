/**
 * Voice Agent Session State Handler
 *
 * Handles session state change events:
 * - AgentStateChanged: Agent speaking start/end, DJ booth integration, response latency
 * - UserStateChanged: User speaking start/end, backchannel system, meaningful silence
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/session-state-handler
 */

import { log, voice } from '@livekit/agents';
// FIX AUDIT: Import from service layer instead of API routes (clean architecture)
import { getDJController } from '../../audio/index.js';
import { checkForAccentChange } from '../../services/session/index.js';
import {
  notifyAgentSpeakingEnd,
  notifyAgentSpeakingStart,
  notifyUserSpeakingEnd,
  notifyUserSpeakingStart,
} from './music-handler.js';
// Tool execution tracking - prevents dead air check-in during active tool calls
import { getSessionFlags } from '../../config/voice-humanization-flags.js';
import { getActiveListeningEngine } from '../../conversation/active-listening/index.js';
import {
  analyzeSilence,
  recordSilence,
  type SilenceAnalysis,
} from '../../intelligence/deep-understanding/silence.js';
import {
  getLLMSilenceInstructions,
  playAmbientMusicDuringSilence,
  stopAmbientMusic,
  type SilenceContext,
} from '../../personas/meaningful-silence.js';
import type { PersonaConfig } from '../../personas/types.js';
import {
  recordBargeInAgentStopped,
  recordBargeInDetected,
} from '../../services/analytics/call-quality-monitor.js';
import type { ConversationManager } from '../../services/conversation-manager.js';
import { diag } from '../../services/diagnostic-logger.js';
import { getStateMetrics } from '../../speech/coordination/sanitizer-integration.js';
import { wrapSpeechWithInterruptAwareness } from '../../speech/graceful-interrupt/speech-wrapper.js';
import {
  getLiveBackchannelingService,
  MICRO_REACTION_COOLDOWN_MS,
} from '../../speech/live-backchanneling/index.js';
import { generateBackchannelInstructions } from '../../speech/llm-backchannel.js';
import {
  trackBackchannelEvent,
  trackResponseLatency,
  validateTurnPrediction,
} from '../integrations/speech-metrics-integration.js';
import {
  EMPTY_RESPONSE_WATCHDOG_MS,
  BACKCHANNEL_MIN_INTERVAL_MS,
  BACKCHANNEL_TRIGGER_MS,
  LIVE_BACKCHANNEL_MIN_INTERVAL_MS,
  MIN_SPEECH_FOR_LIVE_BACKCHANNEL_MS,
  MIN_SPEECH_DURATION_MS,
  BACKCHANNEL_TIMEOUT_MS,
  BREATH_PAUSE_CHECK_MS,
  BREATH_PAUSE_MAX_WAIT_MS,
  BACKCHANNEL_REACTION_WINDOW_MS,
  SILENCE_FOR_BACKCHANNEL_MS,
  SILENCE_HANDLER_MIN_MS,
  DEFAULT_UTTERANCE_DURATION_MS,
  SILENCE_CHECK_INTERVAL_MS,
  FEEDBACK_PROMPT_DELAY_MS,
  EARLY_ACK_CLEANUP_MS,
} from '../../config/timeouts.js';
import { IDLE_TIMEOUT, SILENCE_THRESHOLDS } from '../shared/constants.js';
import {
  clearPendingLowPriorityResponse,
  hasActiveResponsePending,
} from '../shared/generate-reply-gateway.js';
import { generateReplyWithContext, safeGenerateReply } from '../shared/safe-generate-reply.js';
// Response Orchestrator - SDK state tracking for proactive response coordination
import {
  canTriggerProactive,
  onAgentStateChanged,
  onGenerationComplete,
  onGenerationStarted,
  onUserSpeaking,
} from '../shared/response-orchestrator.js';
import type { UserData } from '../shared/types.js';
// Speech coordination for adaptive timing and centralized speech management
import { coordinatedSay, getSpeechCoordinator } from '../../speech/coordination/index.js';
// Safe fire-and-forget pattern for non-critical async operations
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';
// Better Than Human - Silence Interpreter integration
import { processSilenceWithInterpreter } from '../integrations/better-than-human-integration.js';
// Contextual Feedback System - collect feedback during natural conversation pauses
import { feedbackTriggerEngine } from '../feedback/index.js';
// Handoff state tracking - prevents operations during/after handoffs
import { shouldSkipGenerateReply } from '../../handoff/unified-state.js';
import {
  recordExperience,
  computeReward,
  type DynamicsState,
  type DynamicsAction,
} from '../shared/performance/dynamics-learner.js';
// 5D: Continuous prosody stream for rolling window updates
import { getContinuousProsodyStream } from '../../intelligence/context-builders/continuous-prosody.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionStateContext {
  /** Voice session instance */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: voice.AgentSession<any>;
  /** Current persona config */
  sessionPersona: PersonaConfig;
  /** Conversation manager for checking agent speaking state */
  conversationManager: ConversationManager;
  /** User data object (mutated by handlers) */
  userData: UserData;
  /** Session ID for logging and metrics */
  sessionId: string;
  /**
   * Callback to disconnect the room due to idle timeout.
   * If provided, idle timeout will auto-disconnect after extended silence.
   */
  onIdleTimeout?: () => void;
  /**
   * LiveKit room instance for checking participant presence.
   * FIX (Jan 2026): Required to prevent speaking to empty rooms when participant
   * hasn't joined yet (fixes "no response from Ferni" issue).
   */
  room?: { remoteParticipants?: Map<string, unknown> };
}

export interface SessionStateResult {
  /** The silence context (shared with transcript handler) */
  silenceContext: SilenceContext;
  /** Cleanup function to clear timers */
  clearTimers: () => void;
}

// ============================================================================
// MAIN SETUP FUNCTION
// ============================================================================

// Lazy getLogger() initialization - log() can only be called after LiveKit initializes
const getLogger = () => log();

/**
 * Set up session state change handlers (AgentStateChanged, UserStateChanged)
 *
 * Creates and registers handlers for:
 * - Agent speaking state (DJ booth, response latency, accent changes)
 * - User speaking state (backchannels, meaningful silence, early acknowledgments)
 *
 * Returns the silenceContext which is shared with the transcript handler.
 */
export function setupSessionStateHandlers(ctx: SessionStateContext): SessionStateResult {
  const { session, sessionPersona, conversationManager, userData, sessionId, onIdleTimeout, room } =
    ctx;

  // ============================================================
  // INTERRUPT-AWARE SPEECH HELPER
  // ============================================================
  /**
   * Speak text with interrupt awareness.
   * Applies recovery softening if the user interrupted us previously.
   * This makes agent responses feel less abrupt after an interrupt.
   *
   * CRITICAL: Checks if session is closing before speaking to prevent
   * errors during handoffs when the old agent's session is draining.
   */
  const sayWithInterruptAwareness = async (
    text: string,
    options?: { allowInterruptions?: boolean }
  ): Promise<void> => {
    // CRITICAL: Check if session is closing before trying to speak
    const { isSessionClosing } = await import('../shared/session-closing-tracker.js');
    if (isSessionClosing(sessionId)) {
      diag.state('🚪 Skipping speech - session is closing');
      return;
    }

    const wrapped = wrapSpeechWithInterruptAwareness(text, {
      wasInterrupted: userData.wasInterrupted,
      interruptType: userData.interruptType,
      personaId: sessionPersona.id,
      sessionId,
    });

    // Use coordinated speech for interrupt-aware responses
    coordinatedSay(sessionId, wrapped.text, options);

    // Clear the interrupt flag after using it (only for recovery, not cushioning)
    if (wrapped.recoveryApplied) {
      userData.wasInterrupted = false;
      userData.interruptType = undefined;
      diag.state('🎭 Interrupt recovery applied to speech');
    }
  };

  // ============================================================
  // STATE VARIABLES
  // ============================================================
  let userFinishedSpeakingAt = 0;
  let userLastSpokeAt = Date.now();
  let silenceResponseCount = 0;
  let lastSilenceResponseAt = 0;
  let backchannelTimer: ReturnType<typeof setTimeout> | null = null;
  let lastBackchannelAt = 0;
  let pendingBackchannelReaction = false;

  // Timer tracking for cleanup (prevents memory leaks on disconnect)
  let earlyAckTimer: ReturnType<typeof setTimeout> | null = null;
  let earlyAckCleanupTimer: ReturnType<typeof setTimeout> | null = null;
  // Track event handler reference to prevent MaxListenersExceededWarning
  // (new handler was being added on each user stop without removing previous)
  let earlyAckAgentStateHandler: ((event: { newState: string }) => void) | null = null;
  let liveBackchannelInterval: ReturnType<typeof setInterval> | null = null;
  let liveBackchannelFailsafeTimer: ReturnType<typeof setTimeout> | null = null;
  // 📊 Contextual Feedback timer
  let feedbackPromptTimer: ReturnType<typeof setTimeout> | null = null;

  // 🚨 EMPTY RESPONSE WATCHDOG (Jan 2026)
  // Detects when OpenAI Realtime produces no response and triggers recovery
  // This fixes the issue where user says "play music" and gets no response
  let emptyResponseWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let lastUserMessageForRecovery: string | null = null;
  // See config/timeouts.ts EMPTY_RESPONSE_WATCHDOG_MS

  // Idle timeout tracking - auto-disconnect after extended silence
  let idleTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let idleWarningTimer: ReturnType<typeof setTimeout> | null = null;
  let hasWarnedAboutIdle = false;
  let isDisconnectingDueToIdle = false;

  // Backchannel timing - see config/timeouts.ts

  // ============================================================
  // IDLE TIMEOUT HELPER - Auto-disconnect after extended silence
  // ============================================================
  /**
   * Start or reset the idle timeout timers.
   * Called when user stops speaking to track extended silence.
   */
  const startIdleTimeout = () => {
    // Don't start idle timeout if no callback provided
    if (!onIdleTimeout) return;

    // Don't restart if we're already disconnecting
    if (isDisconnectingDueToIdle) return;

    // Clear existing timers
    if (idleWarningTimer) {
      clearTimeout(idleWarningTimer);
      idleWarningTimer = null;
    }
    if (idleTimeoutTimer) {
      clearTimeout(idleTimeoutTimer);
      idleTimeoutTimer = null;
    }
    hasWarnedAboutIdle = false;

    // Warning timer: gentle check-in at 90 seconds
    idleWarningTimer = setTimeout(() => {
      if (isDisconnectingDueToIdle) return;

      hasWarnedAboutIdle = true;
      diag.state('⏰ Idle warning triggered', {
        threshold: IDLE_TIMEOUT.WARNING_THRESHOLD_SECONDS,
      });

      // Gentle check-in using coordinated speech
      try {
        coordinatedSay(
          sessionId,
          `<break time="300ms"/>Hey, I'm still here if you need me. <break time="200ms"/>Just let me know when you want to continue.`,
          { allowInterruptions: true }
        );
      } catch (e) {
        getLogger().debug({ error: e }, 'Failed to say idle warning');
      }
    }, IDLE_TIMEOUT.WARNING_THRESHOLD_SECONDS * 1000);

    // Disconnect timer: goodbye and disconnect at 120 seconds
    idleTimeoutTimer = setTimeout(() => {
      if (isDisconnectingDueToIdle) return;

      isDisconnectingDueToIdle = true;
      diag.state('⏰ Idle timeout triggered - disconnecting', {
        threshold: IDLE_TIMEOUT.DISCONNECT_THRESHOLD_SECONDS,
      });

      // Say goodbye, then trigger disconnect
      try {
        coordinatedSay(
          sessionId,
          `<break time="200ms"/>Looks like you might be busy. <break time="150ms"/>I'll be here whenever you're ready to chat again. <break time="300ms"/>Take care!`,
          { allowInterruptions: false }
        );

        // Give time for TTS to complete, then disconnect
        setTimeout(() => {
          if (onIdleTimeout) {
            onIdleTimeout();
          }
        }, IDLE_TIMEOUT.DISCONNECT_DELAY_MS);
      } catch (e) {
        getLogger().debug({ error: e }, 'Failed to say idle goodbye');
        // Still disconnect even if speech fails
        if (onIdleTimeout) {
          onIdleTimeout();
        }
      }
    }, IDLE_TIMEOUT.DISCONNECT_THRESHOLD_SECONDS * 1000);
  };

  /**
   * Clear idle timeout timers - called when user speaks
   */
  const clearIdleTimeout = () => {
    if (idleWarningTimer) {
      clearTimeout(idleWarningTimer);
      idleWarningTimer = null;
    }
    if (idleTimeoutTimer) {
      clearTimeout(idleTimeoutTimer);
      idleTimeoutTimer = null;
    }
    hasWarnedAboutIdle = false;
    isDisconnectingDueToIdle = false;
  };

  // 5D: Start continuous prosody stream for rolling window updates
  const prosodyStream = getContinuousProsodyStream();
  prosodyStream.start((_snapshot) => {
    // Prosody snapshots are collected; context injection happens in turn-handler
  });

  // Silence context for meaningful silence responses
  const silenceContext: SilenceContext = {
    silenceDurationSeconds: 0,
    turnCount: 0,
    topicsDiscussed: [],
    recentEmotionalTone: 'neutral',
    userName: userData.name,
    memorableMoments: [],
    isGameActive: false,
    activeGameType: undefined,
    isMusicPlaying: false,
  };

  // Active listening engine for backchannels
  const activeListening = getActiveListeningEngine();

  // Live backchanneling service (breath-pause aware)
  const voiceFlags = getSessionFlags(sessionId);
  const liveBackchannelService = voiceFlags.enableLiveBackchanneling
    ? getLiveBackchannelingService(sessionId)
    : null;
  let lastLiveBackchannelAt = 0;
  let lastMicroReactionAt = 0;
  // Live backchannel timing - see config/timeouts.ts

  // NOISE FILTER (Jan 2026): Filter out very short "speech" events (clicks, pops, noise)
  // "Hi" takes ~150-200ms to say, noise/clicks are usually < 100ms
  // This prevents false activations from VAD picking up non-speech sounds
  //
  // ⚠️ DEBUGGING: Set DISABLE_NOISE_FILTER=true to disable (helps debug what Gemini hears)
  // The filter was incorrectly triggering and blocking valid responses (Jan 2026 bug)
  const NOISE_FILTER_DISABLED = process.env.DISABLE_NOISE_FILTER === 'true';
  const minSpeechDurationMs = NOISE_FILTER_DISABLED ? 0 : MIN_SPEECH_DURATION_MS;

  if (NOISE_FILTER_DISABLED) {
    diag.state('⚠️ NOISE FILTER DISABLED via DISABLE_NOISE_FILTER=true');
  }

  // ============================================================
  // BACKCHANNEL HELPER (Regular - after user pauses)
  // LLM-based: Let the LLM generate contextual backchannels
  // ============================================================
  // Echo prevention grace period - ADAPTIVE based on actual speech patterns
  // Uses SpeechCoordinator's learned timing instead of hardcoded value
  const coordinator = getSpeechCoordinator();

  /**
   * Get adaptive echo grace period based on last utterance duration.
   * INTELLIGENT: Learns from actual echo patterns, not hardcoded.
   */
  const getEchoGracePeriod = (lastUtteranceDurationMs?: number): number => {
    return coordinator.getEchoWindow(lastUtteranceDurationMs);
  };

  const attemptBackchannel = async () => {
    // Skip if agent is speaking
    if (conversationManager.isAgentSpeaking()) return;

    // ECHO PREVENTION: Don't backchannel immediately after agent stopped speaking
    // Agent's audio gets picked up by mic, VAD thinks user is speaking, agent interrupts itself,
    // then backchannels ("mm-hmm") because it thinks user spoke. Wait for echo to clear.
    // ADAPTIVE: Uses learned timing based on last utterance duration
    const lastAgentSpeechEnd = userData.lastAgentSpeechEndTime ?? 0;
    const lastUtteranceDuration = userData.lastAgentUtteranceDurationMs;
    const timeSinceAgentStopped = Date.now() - lastAgentSpeechEnd;
    const echoGracePeriod = getEchoGracePeriod(lastUtteranceDuration);
    if (timeSinceAgentStopped < echoGracePeriod) {
      diag.state('🔇 Backchannel suppressed (adaptive echo prevention)', {
        timeSinceAgentStopped,
        threshold: echoGracePeriod,
        lastUtteranceDuration,
      });
      return;
    }

    // Don't backchannel too frequently
    // HUMANIZATION FIX: Add ±30% randomization to prevent robotic predictability
    const randomizedInterval = BACKCHANNEL_MIN_INTERVAL_MS * (0.7 + Math.random() * 0.6);
    const timeSinceLastBackchannel = Date.now() - lastBackchannelAt;
    if (timeSinceLastBackchannel < randomizedInterval) {
      // VISIBLE LOG: Show when backchannel is skipped due to cooldown
      diag.state('🔇 [BACKCHANNEL] Cooldown active', {
        waitedSec: Math.round(timeSinceLastBackchannel / 1000),
        needSec: Math.round(randomizedInterval / 1000),
        randomized: true,
      });
      return;
    }

    // Feature flag: Use LLM-based backchannels for more natural variation
    const useLLMBackchannels = voiceFlags.enableLLMBackchannels ?? true;

    if (useLLMBackchannels) {
      // LLM-BASED: Generate contextual backchannel via LLM
      const backchannelType =
        silenceContext.recentEmotionalTone === 'heavy' ? 'empathy' : 'acknowledgment';

      // Get recent transcript from recentTranscripts array
      const recentTranscripts = userData.recentTranscripts ?? [];
      const lastTranscript = recentTranscripts[recentTranscripts.length - 1] ?? '';

      const result = generateBackchannelInstructions(sessionId, {
        recentUserSpeech: lastTranscript,
        emotionalTone:
          silenceContext.recentEmotionalTone === 'heavy'
            ? 'heavy'
            : silenceContext.recentEmotionalTone === 'light'
              ? 'excited' // Map 'light' to 'excited' for LLM context
              : 'neutral',
        type: backchannelType,
        turnNumber: userData.turnCount ?? 0,
        speakingDurationMs: userData.currentSpeechDurationMs ?? 0,
        personaId: sessionPersona.id,
      });

      if (result.shouldTrigger) {
        // FIX: Use safeGenerateReply - don't await, fire and forget for backchannels
        // Backchannels should be quick acknowledgments, not blocking operations
        // FIX: Pass sessionId so safeGenerateReply can skip if session is closing
        // FIX: Use shorter timeout (3s) for backchannels - they should be quick or not happen
        // FIX: Bypass circuit breaker + low priority - backchannel failures shouldn't block real requests
        void safeGenerateReply(session, {
          instructions: result.instructions,
          allowInterruptions: true,
          waitForPlayout: false, // Don't wait - backchannels are non-blocking
          context: 'backchannel',
          sessionId,
          timeoutMs: BACKCHANNEL_TIMEOUT_MS,
          bypassCircuitBreaker: true, // Don't let backchannel failures affect real requests
          priority: 'low', // Low priority - failures don't affect circuit breaker
        }).catch(() => {
          // Silently swallow backchannel failures - they're optional
          // Don't log errors for backchannels - it's noise
        });

        const backchannelFiredAt = Date.now();
        const pauseDuration = backchannelFiredAt - lastBackchannelAt;
        lastBackchannelAt = backchannelFiredAt;
        pendingBackchannelReaction = true;

        trackBackchannelEvent(sessionId, {
          pauseDurationMs: pauseDuration,
          wasTimely: true,
          category: backchannelType === 'empathy' ? 'empathy' : 'acknowledgment',
          userEmotion: silenceContext.recentEmotionalTone === 'heavy' ? 'worried' : 'neutral',
          mode: 'llm',
        });

        // RL: Record backchannel experience for dynamics model training
        fireAndForget(async () => {
          const ve = userData.voiceEmotion;
          const state: DynamicsState = {
            audioFeatures: {
              energyMean: (typeof ve?.arousal === 'number' ? ve.arousal : 0.5) as number,
              energySlope: 0,
              pitchMean: 200,
              pitchSlope: 0,
              pauseDurationMs: (userData.currentSilenceDurationMs ?? 0) as number,
              speakingRate: 3.0,
            },
            partialTranscript: userData.lastUserMessage ?? '',
            context: {
              turnNumber: userData.turnCount ?? 0,
              topicCategory: 'general',
              emotionPrimary: userData.voiceEmotion?.primary ?? 'neutral',
              sessionDurationMs:
                Date.now() - (userData.services?.sessionStartTime ?? Date.now()),
            },
          };
          const action: DynamicsAction = {
            type: 'backchannel',
            delayMs: 0,
            phrase: 'auto',
          };
          const reward = computeReward({
            userContinuedSpeaking: true,
            positiveBiomarkers: (userData.voiceEmotion?.confidence ?? 0) > 0.5,
            userInterrupted: false,
            engagementScore: 0.7,
          });
          recordExperience(sessionId, state, action, reward);
        }, 'dynamics-learner-backchannel');

        // PROMINENT LOG: Show backchannel timing for debugging
        diag.state('🎯 [BACKCHANNEL] FIRED', {
          type: backchannelType,
          persona: sessionPersona.id,
          turnNumber: userData.turnCount,
          intervalSec: Math.round(pauseDuration / 1000),
          nextMinSec: Math.round(BACKCHANNEL_MIN_INTERVAL_MS / 1000),
        });
      } else {
        diag.state('🔇 [BACKCHANNEL] Skipped', { reason: result.skipReason });
      }
    }
    // NOTE: Legacy static phrase fallback REMOVED - always use LLM for natural variation
  };

  // ============================================================
  // LIVE BACKCHANNEL HELPER (During user speech at breath pauses)
  // "Better than Human" - soft "mm-hmm" while user is still talking
  // ============================================================
  const attemptLiveBackchannel = async () => {
    // Skip if live backchanneling is disabled
    if (!liveBackchannelService) return;

    // Don't live-backchannel if agent is speaking
    if (conversationManager.isAgentSpeaking()) return;

    // ECHO PREVENTION: Don't backchannel immediately after agent stopped speaking
    // ADAPTIVE: Uses learned timing based on last utterance duration
    const lastAgentSpeechEnd = userData.lastAgentSpeechEndTime ?? 0;
    const timeSinceAgentStopped = Date.now() - lastAgentSpeechEnd;
    const liveEchoGracePeriod = getEchoGracePeriod(userData.lastAgentUtteranceDurationMs);
    if (timeSinceAgentStopped < liveEchoGracePeriod) return;

    // Don't live-backchannel too frequently
    // HUMANIZATION FIX: Add ±30% randomization to prevent robotic predictability
    const randomizedLiveInterval = LIVE_BACKCHANNEL_MIN_INTERVAL_MS * (0.7 + Math.random() * 0.6);
    if (Date.now() - lastLiveBackchannelAt < randomizedLiveInterval) return;

    // Check breath pause state from userData
    const isBreathPause = userData.isInBreathPause ?? false;
    const speechDurationMs = userData.currentSpeechDurationMs ?? 0;

    // Need breath pause and sufficient speech duration
    if (!isBreathPause || speechDurationMs < MIN_SPEECH_FOR_LIVE_BACKCHANNEL_MS) return;

    // Determine if emotional moment
    const isEmotionalMoment =
      (userData.lastEmotionAnalysis?.distressLevel ?? 0) > 0.4 ||
      (userData.lastEmotionAnalysis?.intensity ?? 0) > 0.7 ||
      silenceContext.recentEmotionalTone === 'heavy';

    // Get live backchannel decision
    const result = liveBackchannelService.shouldEmitLiveBackchannel({
      personaId: sessionPersona.id,
      userSpeakingDurationMs: speechDurationMs,
      isBreathPause: true,
      emotion: userData.lastEmotionAnalysis,
      turnCount: userData.turnCount ?? 0,
      timeSinceLastBackchannel: Date.now() - lastLiveBackchannelAt,
      isEmotionalMoment,
    });

    if (result.shouldBackchannel && result.phrase) {
      try {
        // Say the live backchannel (soft volume, allows overlap)
        // Use coordinated speech for live backchannels
        coordinatedSay(sessionId, result.phrase, { allowInterruptions: true });
        lastLiveBackchannelAt = Date.now();
        userData.lastLiveBackchannelAt = lastLiveBackchannelAt;

        // Track in metrics
        trackBackchannelEvent(sessionId, {
          pauseDurationMs: 0, // During speech, not a pause
          wasTimely: true,
          category: isEmotionalMoment ? 'empathy' : 'acknowledgment',
          userEmotion: userData.lastEmotionAnalysis?.primary,
          mode: 'live',
        });

        // PROMINENT LOG: Show live backchannel timing
        diag.state('🎯 [LIVE BACKCHANNEL] FIRED during breath pause', {
          phrase: result.phrase,
          speechSec: Math.round(speechDurationMs / 1000),
          isEmotional: isEmotionalMoment,
          persona: sessionPersona.id,
        });
      } catch (e) {
        getLogger().debug({ error: e }, 'Live backchannel failed (non-critical)');
      }
    }
  };

  // ============================================================
  // SPEECH CREATED HANDLER - Track SDK auto-responses
  // CRITICAL: With createResponse=true, SDK auto-generates responses.
  // We must track these to prevent proactive systems from racing.
  // ============================================================
  session.on(voice.AgentSessionEventTypes.SpeechCreated, (event) => {
    // When SDK creates speech without us calling generateReply (userInitiated: false),
    // it means the SDK is handling an auto-response. Track it in the orchestrator.
    if (!event.userInitiated) {
      onGenerationStarted(sessionId, 'sdk-auto-response');
      diag.state('📡 [SPEECH] SDK auto-response detected - orchestrator tracking');
    }
  });

  // ============================================================
  // AGENT STATE CHANGED HANDLER
  // ============================================================
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
    // Update ResponseOrchestrator with agent state changes
    // This ensures proactive systems know when SDK is handling a response
    onAgentStateChanged(
      sessionId,
      event.newState as 'speaking' | 'listening' | 'thinking' | 'initializing'
    );

    if (event.newState === 'speaking') {
      conversationManager.handleAgentStartedSpeaking('');

      // 📊 Contextual Feedback: Track agent speaking start
      feedbackTriggerEngine.onAgentStartSpeaking(sessionId);

      // Track speech start time for duration calculation (adaptive echo prevention)
      userData.lastAgentSpeechStartTime = Date.now();

      // 🚨 EMPTY RESPONSE WATCHDOG: Clear watchdog - agent did respond!
      if (emptyResponseWatchdogTimer) {
        clearTimeout(emptyResponseWatchdogTimer);
        emptyResponseWatchdogTimer = null;
        lastUserMessageForRecovery = null;
      }

      // Track response latency: time from user finish to agent start
      if (userFinishedSpeakingAt > 0) {
        const responseLatency = Date.now() - userFinishedSpeakingAt;
        trackResponseLatency(sessionId, responseLatency);
        userFinishedSpeakingAt = 0;
      }

      // Check for mid-session accent changes
      void checkForAccentChange(sessionId).catch((accentErr: unknown) => {
        diag.warn('Mid-session accent check failed', { error: String(accentErr) });
      });

      // DJ CONTROLLER: Notify agent speaking - triggers automatic ducking
      notifyAgentSpeakingStart();
      diag.state('Agent speaking - DJ Controller notified');

      // Fallback ducking for music player (in case DJ Controller not wired)
      import('../session/event-cleanup-registry.js')
        .then(async ({ isSessionCleaningUp }) => {
          if (isSessionCleaningUp(sessionId)) {
            diag.debug('Skipping music ducking - session is cleaning up');
            return null;
          }
          const { isMusicEnabled } = await import('../../config/environment.js');
          if (!isMusicEnabled()) return null;
          return import('../../audio/index.js');
        })
        .then((audioModule) => {
          if (!audioModule) return;
          const player = audioModule.getMusicPlayer();
          if (player.isPlaying()) {
            player.duck();
            diag.state('Ducked background music for agent speech (basic)');
          }
        })
        .catch((e) => getLogger().debug({ error: String(e) }, 'Music ducking (non-critical)'));
    }

    if (event.oldState === 'speaking' && event.newState !== 'speaking') {
      const speechEndTime = Date.now();

      // Calculate and track utterance duration (for adaptive echo prevention)
      const utteranceDuration = userData.lastAgentSpeechStartTime
        ? speechEndTime - userData.lastAgentSpeechStartTime
        : undefined;

      userData.lastAgentSpeechEndTime = speechEndTime;
      userData.lastAgentUtteranceDurationMs = utteranceDuration;
      recordBargeInAgentStopped(sessionId, speechEndTime);

      // Notify speech coordinator for adaptive timing learning
      coordinator.onSpeechEnded(
        userData.wasInterrupted ?? false,
        utteranceDuration ?? DEFAULT_UTTERANCE_DURATION_MS
      );

      conversationManager.handleAgentFinishedSpeaking(0);

      // 📊 Contextual Feedback: Track agent finished speaking
      // Get the last agent message for insight detection
      const lastAgentMessage = (userData.recentTranscripts ?? []).slice(-1)[0] ?? '';
      feedbackTriggerEngine.onAgentFinishedSpeaking(sessionId, lastAgentMessage);

      // 📊 Contextual Feedback: Schedule feedback check after natural pause
      // Clear any existing timer
      if (feedbackPromptTimer) {
        clearTimeout(feedbackPromptTimer);
        feedbackPromptTimer = null;
      }

      // Check for feedback opportunity after 1 second pause
      feedbackPromptTimer = setTimeout(async () => {
        // Only check if user hasn't started speaking
        if (!conversationManager.isAgentSpeaking() && userData.userId) {
          const pauseDurationMs = Date.now() - (userData.lastAgentSpeechEndTime ?? Date.now());

          // Use the FrontendPublisher singleton to send data messages
          const { getFrontendPublisher } = await import('../realtime/frontend-publisher.js');
          const publisher = getFrontendPublisher();

          const sendDataMessage = async (type: string, payload: Record<string, unknown>) => {
            await publisher.sendData(type, payload);
          };

          await feedbackTriggerEngine.checkAndTrigger(
            sessionId,
            userData.userId,
            sessionPersona.id,
            pauseDurationMs,
            sendDataMessage
          );
        }
        feedbackPromptTimer = null;
      }, FEEDBACK_PROMPT_DELAY_MS);

      // DJ CONTROLLER: Notify agent stopped speaking - triggers automatic unduck
      notifyAgentSpeakingEnd();
      diag.state('Agent stopped - DJ Controller notified');

      // Fallback unducking for music player (in case DJ Controller not wired)
      import('../session/event-cleanup-registry.js')
        .then(async ({ isSessionCleaningUp }) => {
          if (isSessionCleaningUp(sessionId)) {
            diag.debug('Skipping music unducking - session is cleaning up');
            return null;
          }
          const { isMusicEnabled } = await import('../../config/environment.js');
          if (!isMusicEnabled()) return null;
          return import('../../audio/index.js');
        })
        .then(async (audioModule) => {
          if (!audioModule) return;
          // Re-check cleanup state - async imports can take time
          const { isSessionCleaningUp: recheck } =
            await import('../session/event-cleanup-registry.js');
          if (recheck(sessionId)) {
            diag.debug('Skipping music unducking - session cleanup started during import');
            return;
          }
          const player = audioModule.getMusicPlayer();
          if (player.getState().isDucked) {
            player.unduck();
            diag.state('Unducked background music after agent speech (basic)');
          }
        })
        .catch((e) => getLogger().debug({ error: String(e) }, 'Music unducking (non-critical)'));
    }
  });

  // ============================================================
  // USER STATE CHANGED HANDLER
  // ============================================================
  session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
    // ----------------------------------------------------------------
    // USER STARTED SPEAKING
    // ----------------------------------------------------------------
    if (event.newState === 'speaking') {
      // Update ResponseOrchestrator - user speaking clears SDK generation state
      // This ensures proactive systems can properly coordinate after interruptions
      onUserSpeaking(sessionId);

      // GRACEFUL INTERRUPT: Track if user interrupted while agent was speaking
      // This enables softer recovery when agent responds next
      if (conversationManager.isAgentSpeaking()) {
        userData.wasInterrupted = true;
        // Determine interrupt type: 'hard' if user said explicit stop words, else 'soft'
        // The transcript handler sets more precise type if available
        userData.interruptType = 'soft';
        // Track interrupt latency (time from agent speech start to user barge-in)
        const interruptLatencyMs = userData.lastAgentSpeechStartTime
          ? Date.now() - userData.lastAgentSpeechStartTime
          : undefined;
        recordBargeInDetected(sessionId);
        diag.state('🎭 User interrupted agent - VAD-triggered', {
          interruptLatencyMs,
        });
      }

      // Record silence if we had an analysis (user broke the silence by self-initiating)
      const { userId } = userData;
      if (userId && userData.lastSilenceAnalysis) {
        try {
          // User self-initiated speaking - record how they broke the silence
          recordSilence(userId, userData.lastSilenceAnalysis, 'self');
          diag.state('🤫 Silence recorded', {
            type: userData.lastSilenceAnalysis.type,
            howBroken: 'self',
          });
        } catch (recordErr) {
          getLogger().debug({ error: recordErr }, 'Failed to record silence');
        }
        userData.lastSilenceAnalysis = undefined; // Clear after recording
      }

      userLastSpokeAt = Date.now();
      userData.userSpeakingStartTime = userLastSpokeAt;

      // Validate turn prediction: user continued speaking
      validateTurnPrediction(sessionId, 'user_continued');

      // Check if user responded to our backchannel (within 10 seconds)
      if (pendingBackchannelReaction && Date.now() - lastBackchannelAt < BACKCHANNEL_REACTION_WINDOW_MS) {
        activeListening.recordBackchannelReaction(true);
        pendingBackchannelReaction = false;
      }

      // Reset silence tracking when user speaks
      silenceResponseCount = 0;
      lastSilenceResponseAt = 0;

      // Clear idle timeout - user is active
      clearIdleTimeout();

      // Clear early-ack timer - user is speaking again
      // This prevents "conversation_already_has_active_response" errors from OpenAI
      // when the early-ack fires while a response is already in progress
      if (earlyAckTimer) {
        clearTimeout(earlyAckTimer);
        earlyAckTimer = null;
      }
      if (earlyAckCleanupTimer) {
        clearTimeout(earlyAckCleanupTimer);
        earlyAckCleanupTimer = null;
      }
      if (earlyAckAgentStateHandler) {
        session.off(voice.AgentSessionEventTypes.AgentStateChanged, earlyAckAgentStateHandler);
        earlyAckAgentStateHandler = null;
      }

      // 🚨 EMPTY RESPONSE WATCHDOG: Clear watchdog when user speaks again
      // User might be continuing their thought or correcting themselves
      if (emptyResponseWatchdogTimer) {
        clearTimeout(emptyResponseWatchdogTimer);
        emptyResponseWatchdogTimer = null;
        lastUserMessageForRecovery = null;
      }

      // Clear any pending low-priority responses (backchannels) when user starts speaking
      // This prevents "conversation_already_has_active_response" errors from OpenAI
      // when we try to respond to the user's message
      clearPendingLowPriorityResponse(sessionId);

      // 📊 Contextual Feedback: Cancel pending feedback prompt - user is speaking
      if (feedbackPromptTimer) {
        clearTimeout(feedbackPromptTimer);
        feedbackPromptTimer = null;
      }
      // Track user message for feedback context
      const recentUserTranscripts = userData.recentTranscripts ?? [];
      const latestUserMessage = recentUserTranscripts[recentUserTranscripts.length - 1] ?? '';
      feedbackTriggerEngine.onUserMessage(sessionId, latestUserMessage);

      // Stop ambient music when user starts speaking
      stopAmbientMusic();
      conversationManager.handleUserStartedSpeaking();

      // DJ CONTROLLER: User started speaking - triggers automatic ducking
      notifyUserSpeakingStart();
      diag.state('User speaking - DJ Controller notified');

      // GAME DUCKING: Lower music volume when user speaks during a game
      fireAndForget(async () => {
        const { isGameCurrentlyActive, duckForUserGuess, updateGameActivity } =
          await import('../../services/games/index.js');
        if (isGameCurrentlyActive()) {
          duckForUserGuess();
          updateGameActivity();
        }
      }, 'game-ducking-on-user-speak');

      // Schedule potential backchannel after user has been speaking a while
      if ((userData.turnCount || 0) >= 3) {
        backchannelTimer = setTimeout(() => {
          void attemptBackchannel();
        }, BACKCHANNEL_TRIGGER_MS);
      }

      // 🎤 LIVE BACKCHANNELING: Start polling for breath pauses
      // Checks every 200ms while user is speaking for natural backchannel opportunities
      if (liveBackchannelService && (userData.turnCount || 0) >= 2) {
        // Clear any existing interval before creating new one
        if (liveBackchannelInterval) {
          clearInterval(liveBackchannelInterval);
        }
        if (liveBackchannelFailsafeTimer) {
          clearTimeout(liveBackchannelFailsafeTimer);
        }

        liveBackchannelInterval = setInterval(() => {
          // Stop polling if user stopped speaking
          if (!userData.userSpeakingStartTime) {
            if (liveBackchannelInterval) {
              clearInterval(liveBackchannelInterval);
              liveBackchannelInterval = null;
            }
            return;
          }
          void attemptLiveBackchannel();
        }, BREATH_PAUSE_CHECK_MS);

        // Failsafe: Clear interval after max wait to prevent memory leaks
        const originalUserSpeakingStart = userData.userSpeakingStartTime;
        liveBackchannelFailsafeTimer = setTimeout(() => {
          if (
            userData.userSpeakingStartTime === originalUserSpeakingStart &&
            liveBackchannelInterval
          ) {
            clearInterval(liveBackchannelInterval);
            liveBackchannelInterval = null;
          }
          liveBackchannelFailsafeTimer = null;
        }, BREATH_PAUSE_MAX_WAIT_MS);
      }
    }

    // ----------------------------------------------------------------
    // USER STOPPED SPEAKING (LISTENING)
    // ----------------------------------------------------------------
    else if (event.newState === 'listening') {
      // Cancel pending backchannel
      if (backchannelTimer) {
        clearTimeout(backchannelTimer);
        backchannelTimer = null;
      }

      // Validate turn prediction: user finished speaking
      validateTurnPrediction(sessionId, 'user_finished');

      // Record timestamp for response latency tracking
      userFinishedSpeakingAt = Date.now();

      // Calculate and store speech duration for noise filtering
      const speechDurationMs = userData.userSpeakingStartTime
        ? userFinishedSpeakingAt - userData.userSpeakingStartTime
        : 0;
      userData.lastSpeechDurationMs = speechDurationMs;

      // 🚫 NOISE FILTER: Reject very short "speech" (clicks, pops, mic noise)
      // "Hi" takes ~150-200ms, so anything shorter is almost certainly noise
      if (speechDurationMs > 0 && speechDurationMs < minSpeechDurationMs) {
        diag.state('🚫 [NOISE FILTER] Rejecting short speech (likely click/noise)', {
          durationMs: speechDurationMs,
          thresholdMs: minSpeechDurationMs,
        });

        // 🛑 CRITICAL FIX (Jan 2026): Interrupt SDK auto-response for noise
        // With createResponse=true, the SDK auto-generates responses when user "speech" ends.
        // For noise (clicks, pops), the SDK may have already started generating a response
        // based on the brief audio. We interrupt it to prevent hallucinated responses.
        try {
          session.interrupt();
          diag.debug('🛑 [NOISE FILTER] Interrupted SDK auto-response for noise');
        } catch (interruptErr) {
          // Non-critical - SDK might not have started a response yet
          diag.debug('🛑 [NOISE FILTER] Interrupt attempt (SDK may not have started response)');
        }

        // 🔧 FIX (Jan 2026): Clear ResponseOrchestrator state after noise interrupt
        // Without this, sdkGenerating stays true indefinitely, blocking all proactive responses.
        // The interrupt() call stops the SDK, but the orchestrator doesn't know about it.
        onGenerationComplete(sessionId);
        diag.debug('🛑 [NOISE FILTER] Cleared orchestrator state after interrupt');

        // Clear the speaking start time but don't process further
        userData.userSpeakingStartTime = undefined;
        // Don't notify DJ controller or start watchdogs for noise
        return;
      }

      if (userData.userSpeakingStartTime) {
        conversationManager.handleUserFinishedSpeaking(speechDurationMs);
      }

      // DJ CONTROLLER: User stopped speaking - triggers automatic unduck
      notifyUserSpeakingEnd();
      diag.state('User stopped - DJ Controller notified');

      // 🚨 EMPTY RESPONSE WATCHDOG: Start timer to detect if LLM produces no response
      // This fixes the critical issue where OpenAI Realtime sometimes returns nothing
      // and the user sits in silence for 15+ seconds
      if (emptyResponseWatchdogTimer) {
        clearTimeout(emptyResponseWatchdogTimer);
      }

      // Store the user's last message for recovery (from userData if available)
      const recentTranscripts = userData.recentTranscripts ?? [];
      lastUserMessageForRecovery =
        recentTranscripts[recentTranscripts.length - 1] || userData.lastUserMessage || null;

      emptyResponseWatchdogTimer = setTimeout(async () => {
        // If we get here, the agent didn't respond within 5 seconds
        // This is abnormal - try direct tool routing as recovery
        emptyResponseWatchdogTimer = null;

        // Skip if session is closing
        const { isSessionClosing } = await import('../shared/session-closing-tracker.js');
        if (isSessionClosing(sessionId)) {
          return;
        }

        // Skip if agent is already speaking (late check)
        if (conversationManager.isAgentSpeaking()) {
          return;
        }

        // Check if response is already being handled (gateway state + orchestrator)
        // This prevents the watchdog from firing recovery when SDK is responding
        if (hasActiveResponsePending(sessionId) || !canTriggerProactive(sessionId)) {
          diag.state('🚨 [EMPTY_RESPONSE_WATCHDOG] Skipped - SDK/gateway handling response');
          return;
        }

        // Skip if music is playing (user may be listening intentionally)
        try {
          const djController = getDJController();
          if (djController.isMusicActive()) {
            diag.state('🚨 [EMPTY_RESPONSE_WATCHDOG] Skipped - music is playing');
            return;
          }
        } catch {
          // DJ Controller not initialized - continue with recovery
        }

        diag.state(
          `🚨 [EMPTY_RESPONSE_WATCHDOG] No agent response after ${EMPTY_RESPONSE_WATCHDOG_MS}ms - triggering recovery`,
          {
            lastUserMessage: lastUserMessageForRecovery?.slice(0, 50),
            userFinishedAt: userFinishedSpeakingAt,
          }
        );

        // Simplified: Let the silence handler take over for empty responses
        diag.state(
          '🚨 [EMPTY_RESPONSE_WATCHDOG] Awaiting silence handler for recovery'
        );
      }, EMPTY_RESPONSE_WATCHDOG_MS);
      // Note: Thinking music is now handled by the ambient-music system automatically

      // DEAD AIR FIX: Early silence detection
      const userStoppedAt = Date.now();

      // Clear any existing early ack timers and handlers before creating new ones
      // This prevents MaxListenersExceededWarning memory leak
      if (earlyAckTimer) {
        clearTimeout(earlyAckTimer);
        earlyAckTimer = null;
      }
      if (earlyAckCleanupTimer) {
        clearTimeout(earlyAckCleanupTimer);
        earlyAckCleanupTimer = null;
      }
      if (earlyAckAgentStateHandler) {
        session.off(voice.AgentSessionEventTypes.AgentStateChanged, earlyAckAgentStateHandler);
        earlyAckAgentStateHandler = null;
      }

      earlyAckTimer = setTimeout(
        async () => {
          // CRITICAL: Check if session is closing before trying to speak
          // This prevents errors during handoffs when the old agent's session is draining
          const { isSessionClosing } = await import('../shared/session-closing-tracker.js');
          if (isSessionClosing(sessionId)) {
            diag.state('Early dead air skipped - session is closing');
            earlyAckTimer = null;
            return;
          }

          // FIX: Skip dead air check-in if tools are actively executing
          // This prevents gateway timeouts when LLM is busy processing tool calls (e.g., music)
          const stateMetrics = getStateMetrics(sessionId);
          if (stateMetrics && stateMetrics.activeToolCount > 0) {
            diag.state('🎭 [DEAD AIR] Skipped - tool execution in progress', {
              activeToolCount: stateMetrics.activeToolCount,
              state: stateMetrics.state,
            });
            earlyAckTimer = null;
            return;
          }

          // FIX: Skip dead air check-in if music is playing
          // User requested music and is listening - don't interrupt with unnecessary speech
          try {
            const djController = getDJController();
            if (djController.isMusicActive()) {
              const state = djController.getState();
              diag.state('🎭 [DEAD AIR] Skipped - music is playing', {
                track: state.currentTrack?.name,
                state: state.state,
              });
              earlyAckTimer = null;
              return;
            }
          } catch {
            // DJ Controller not initialized - continue with normal check
          }

          // Check if SDK/Ferni is already handling a response
          // Uses both gateway state and ResponseOrchestrator for complete picture
          const sdkActive = !canTriggerProactive(sessionId);
          if (
            !conversationManager.isAgentSpeaking() &&
            !hasActiveResponsePending(sessionId) &&
            !sdkActive
          ) {
            const timeSinceStop = Date.now() - userStoppedAt;
            if (timeSinceStop >= SILENCE_THRESHOLDS.EARLY_ACKNOWLEDGMENT_SECONDS * 1000 - 100) {
              // Dead air prevention: Use STRUCTURED commands (not conversational text)
              // CRITICAL: Conversational instructions can be echoed by Gemini!
              const lastTranscript = (userData.recentTranscripts ?? []).slice(-1)[0] ?? '';
              const turnCount = userData.turnCount ?? 0;

              // Build STRUCTURED meta-commands that cannot be mistaken for speech
              const contextParts = [
                `[SITUATION: ${Math.round(timeSinceStop / 1000)}s silence]`,
                '[TYPE: soft_acknowledgment]',
                '[MAX: 8 words]',
                '[NO: questions]',
              ];

              // Add context reference if available
              if (lastTranscript && lastTranscript.length > 10) {
                contextParts.push(`[CONTEXT: "${lastTranscript.slice(0, 80)}..."]`);
              }

              // Tone based on conversation stage
              if (turnCount < 3) {
                contextParts.push('[TONE: welcoming]');
              } else if (turnCount > 10) {
                contextParts.push('[TONE: casual]');
              }

              // PROMINENT LOG: Show dead air timing
              diag.state('🎭 [DEAD AIR] Early acknowledgment', {
                waitedSec: Math.round(timeSinceStop / 1000),
                persona: sessionPersona.id,
                turnCount,
                hasContext: !!lastTranscript,
              });

              // RACE CONDITION FIX: Re-check session closing state just before action
              // Session could have started closing during the async operations above
              if (isSessionClosing(sessionId)) {
                diag.state('Early dead air skipped - session closing (re-check)');
                earlyAckTimer = null;
                return;
              }

              // Use generateReplyWithContext which formats as behavioral instructions
              // Pass sessionId so session-closing check prevents errors during disconnect
              void generateReplyWithContext(session, {
                context: contextParts,
                fallbackMessage: "I'm here whenever you're ready.",
                allowInterruptions: true,
                logContext: 'early-dead-air-checkin',
                sessionId,
              });
            }
          }
          earlyAckTimer = null;
          // HUMANIZATION FIX: Add ±25% randomization to early acknowledgment timing
        },
        SILENCE_THRESHOLDS.EARLY_ACKNOWLEDGMENT_SECONDS * 1000 * (0.75 + Math.random() * 0.5)
      );

      // Clean up timer if agent starts speaking
      const cleanupEarlyAck = () => {
        if (earlyAckTimer) {
          clearTimeout(earlyAckTimer);
          earlyAckTimer = null;
        }
      };

      // Store handler reference so we can remove it on next user stop
      earlyAckAgentStateHandler = (agentEvent: { newState: string }) => {
        if (agentEvent.newState === 'speaking') {
          cleanupEarlyAck();
          if (earlyAckAgentStateHandler) {
            session.off(voice.AgentSessionEventTypes.AgentStateChanged, earlyAckAgentStateHandler);
            earlyAckAgentStateHandler = null;
          }
        }
      };
      session.on(voice.AgentSessionEventTypes.AgentStateChanged, earlyAckAgentStateHandler);

      earlyAckCleanupTimer = setTimeout(() => {
        cleanupEarlyAck();
        if (earlyAckAgentStateHandler) {
          session.off(voice.AgentSessionEventTypes.AgentStateChanged, earlyAckAgentStateHandler);
          earlyAckAgentStateHandler = null;
        }
        earlyAckCleanupTimer = null;
      }, EARLY_ACK_CLEANUP_MS);

      // GAME UNDUCK: Restore music volume after user finishes speaking
      fireAndForget(async () => {
        const { isGameCurrentlyActive, unduckAfterGuess } =
          await import('../../services/games/index.js');
        if (isGameCurrentlyActive()) {
          unduckAfterGuess();
        }
      }, 'game-unduck-on-user-finish');
    }

    // ----------------------------------------------------------------
    // MEANINGFUL SILENCE HANDLING (USER AWAY)
    // ----------------------------------------------------------------
    if (event.newState === 'away') {
      const silenceDurationMs = Date.now() - userLastSpokeAt;
      const silenceDurationSec = silenceDurationMs / 1000;

      // Start idle timeout - will warn then disconnect after extended silence
      // Only starts timer if onIdleTimeout callback is provided
      startIdleTimeout();

      // Track negative backchannel reaction if user went silent after our backchannel
      if (pendingBackchannelReaction && Date.now() - lastBackchannelAt > SILENCE_FOR_BACKCHANNEL_MS) {
        activeListening.recordBackchannelReaction(false);
        pendingBackchannelReaction = false;
      }

      // ----------------------------------------------------------------
      // DEEP UNDERSTANDING: Silence Intelligence Analysis
      // Analyze the silence to understand what type it is
      // ----------------------------------------------------------------
      let silenceAnalysis: SilenceAnalysis | null = null;
      const { userId } = userData;
      if (userId && silenceDurationMs >= SILENCE_HANDLER_MIN_MS) {
        // Only analyze meaningful silences
        try {
          silenceAnalysis = analyzeSilence(
            silenceDurationMs,
            silenceContext.lastUserMessage || '',
            userData.lastEmotionAnalysis?.primary || 'neutral',
            userData.lastEmotionAnalysis?.intensity || 0.5,
            silenceContext.memorableMoments || [],
            (silenceContext.lastUserMessage || '').includes('?')
          );

          // Store in userData for context builders
          userData.lastSilenceAnalysis = silenceAnalysis;

          diag.state('🤫 Silence analyzed', {
            type: silenceAnalysis.type,
            duration: silenceDurationMs,
            confidence: silenceAnalysis.confidence,
            suggestedResponse: silenceAnalysis.suggestedResponse,
          });

          // 🌟 BTH: Dispatch silence_analyzed signal to frontend avatar
          // This enables the avatar to show appropriate expressions during silence
          // (e.g., contemplative expression during reflective silence, concern during emotional silence)
          fireAndForget(async () => {
            const { getFrontendPublisher } = await import('../realtime/frontend-publisher.js');
            const publisher = getFrontendPublisher();
            await publisher.sendData('humanization_signal', {
              signalType: 'silence_analyzed',
              silenceType: silenceAnalysis!.type,
              silenceDurationMs,
              confidence: silenceAnalysis!.confidence,
              suggestedBehavior: silenceAnalysis!.suggestedResponse,
              timestamp: Date.now(),
            });
            diag.state('🚀 Dispatched silence_analyzed signal to avatar', {
              silenceType: silenceAnalysis!.type,
              durationMs: silenceDurationMs,
            });
          }, 'dispatch-silence-analyzed-signal');

          // 🌟 Better Than Human: Silence Interpreter - learns comfort thresholds
          try {
            const bthSilenceAnalysis = processSilenceWithInterpreter(
              {
                durationMs: silenceDurationMs,
                precedingTopic: silenceContext.topicsDiscussed.slice(-1)[0],
                precedingEmotion: userData.lastEmotionAnalysis?.primary,
                precedingUserMessage: silenceContext.lastUserMessage,
                voiceMarkersBefore: {
                  // Map prosody features to VoiceMarkers format
                  breathPattern: 'normal', // Estimated from energy/rate
                  microSounds: [], // Would need raw audio analysis
                  energyJustBefore: userData.voiceEmotion?.prosody?.energyMean ?? 0.5,
                  emotionJustBefore: userData.lastEmotionAnalysis?.primary,
                },
                conversationPhase:
                  (userData.turnCount ?? 0) < 3
                    ? 'opening'
                    : (userData.turnCount ?? 0) > 20
                      ? 'closing'
                      : silenceContext.recentEmotionalTone === 'heavy'
                        ? 'deep'
                        : 'middle',
              },
              {
                userId,
                sessionId,
                personaId: sessionPersona.id,
                turnCount: userData.turnCount || 0,
              }
            );

            if (bthSilenceAnalysis) {
              // Store enhanced analysis for context building
              (userData as Record<string, unknown>).betterThanHumanSilence = bthSilenceAnalysis;
            }
          } catch (bthErr) {
            getLogger().debug({ error: bthErr }, 'Better Than Human silence analysis failed');
          }
        } catch (silenceErr) {
          getLogger().debug({ error: silenceErr }, 'Silence analysis failed');
        }
      }

      // MEDIUM SILENCE BACKCHANNELS (3-8 seconds)
      const MEDIUM_SILENCE_THRESHOLD_SEC = 4;
      const MEDIUM_SILENCE_COOLDOWN_MS = 12000;

      if (
        silenceDurationSec >= MEDIUM_SILENCE_THRESHOLD_SEC &&
        silenceDurationSec < 10 &&
        silenceResponseCount === 0 &&
        Date.now() - lastBackchannelAt > MEDIUM_SILENCE_COOLDOWN_MS &&
        !conversationManager.isAgentSpeaking() &&
        (userData.turnCount || 0) >= 2
      ) {
        const isEmotionalMoment = silenceContext.recentEmotionalTone === 'heavy';

        if (!isEmotionalMoment || silenceDurationSec >= 6) {
          const silenceBackchannel = activeListening.getSilenceBackchannel(sessionPersona.id, {
            silenceDurationMs,
            userJustSharedPersonal: isEmotionalMoment,
            userIsProcessingEmotions: isEmotionalMoment,
            lastUserEmotion: userData.lastEmotionAnalysis?.primary,
            turnCount: userData.turnCount || 0,
          });

          if (silenceBackchannel) {
            try {
              // Use interrupt-aware wrapper for softer recovery after interrupts
              void sayWithInterruptAwareness(silenceBackchannel.ssml, { allowInterruptions: true });
              lastBackchannelAt = Date.now();
              diag.state('Silence-aware backchannel', {
                phrase: silenceBackchannel.verbal,
                silenceSec: Math.round(silenceDurationSec),
                type: silenceBackchannel.type,
              });
            } catch (e) {
              getLogger().debug({ error: e }, 'Failed to say silence backchannel');
            }
          }

          // VOICE INSIGHT DELIVERY
          if (
            userData?.pendingVoiceInsight &&
            !userData.deliveredVoiceInsight &&
            silenceDurationSec >= 4
          ) {
            try {
              const insight = userData.pendingVoiceInsight;
              if (insight.confidence > 0.6) {
                // Voice insights benefit from interrupt-aware delivery
                void sayWithInterruptAwareness(`<break time="300ms"/>${insight.ssml}`, {
                  allowInterruptions: true,
                });
                userData.deliveredVoiceInsight = true;
                userData.pendingVoiceInsight = undefined;

                diag.state('Delivered voice state insight', {
                  emotion: insight.emotion,
                  confidence: insight.confidence,
                });

                fireAndForget(async () => {
                  const { humanizationAnalytics } =
                    await import('../../conversation/humanization/analytics.js');
                  humanizationAnalytics.recordApplied(sessionId, 'voice_print_detection', {
                    emotion: insight.emotion,
                    confidence: insight.confidence,
                  });
                }, 'humanization-analytics-voice-print');
              }
            } catch (insightErr) {
              getLogger().debug({ error: insightErr }, 'Failed to deliver voice insight');
            }
          }
        }
      }

      // LONG SILENCE (10s+) - Meaningful silence responses
      // HUMANIZATION FIX: Add ±20% randomization to prevent predictable timing
      // Intervals are configurable via SILENCE_INTERVALS env var (e.g., "6,15,30" for faster)
      const baseIntervals = SILENCE_THRESHOLDS.intervals;
      const randomize = (base: number) => Math.round(base * (0.8 + Math.random() * 0.4));
      const intervals = baseIntervals.map(randomize);
      const targetInterval = intervals[silenceResponseCount];

      // FIX: Skip silence response if tools are actively executing (e.g., music search)
      // This prevents gateway timeouts when LLM is busy processing tool calls
      const silenceStateMetrics = getStateMetrics(sessionId);
      const toolsActive = silenceStateMetrics && silenceStateMetrics.activeToolCount > 0;

      // FIX: Skip silence response if a handoff is in progress or session is draining
      // After handoff, the old agent's session is draining - trying to call generateReply
      // causes "Cannot call waitForPlayout from inside function tool" errors
      // shouldSkipGenerateReply checks both: (1) handoff in progress, (2) 3s draining window
      const handoffOrDraining = shouldSkipGenerateReply(sessionId);

      // FIX (Jan 2026): Skip silence response if no participant has joined yet
      // This prevents speaking to an empty room when participant wait times out
      // but session continues anyway. The silence handler would generate audio
      // that nobody can hear, causing "no response from Ferni" issues.
      const hasParticipants = room?.remoteParticipants?.size
        ? room.remoteParticipants.size > 0
        : true;
      const noParticipants = room && !hasParticipants;

      if (toolsActive) {
        diag.state('🤫 [SILENCE] Skipped - tool execution in progress', {
          activeToolCount: silenceStateMetrics?.activeToolCount,
          silenceSec: Math.round(silenceDurationSec),
        });
      }

      if (handoffOrDraining) {
        diag.state('🤫 [SILENCE] Skipped - handoff in progress or session draining', {
          silenceSec: Math.round(silenceDurationSec),
        });
      }

      if (noParticipants) {
        diag.state('🤫 [SILENCE] Skipped - no participant in room yet', {
          silenceSec: Math.round(silenceDurationSec),
          hasRoom: !!room,
          participantCount: room?.remoteParticipants?.size ?? 'unknown',
        });
      }

      // ResponseOrchestrator check: Only trigger if SDK is not currently handling a response
      // This is the key integration point for the clean architecture
      const sdkIdle = canTriggerProactive(sessionId);
      if (!sdkIdle) {
        diag.state('🤫 [SILENCE] Skipped - SDK is handling response (orchestrator)', {
          silenceSec: Math.round(silenceDurationSec),
        });
      }

      if (
        !toolsActive &&
        !handoffOrDraining &&
        !noParticipants &&
        sdkIdle &&
        targetInterval &&
        silenceDurationSec >= targetInterval &&
        Date.now() - lastSilenceResponseAt > SILENCE_THRESHOLDS.MIN_RESPONSE_INTERVAL
      ) {
        userData.userWentSilent = true;

        // Update silence context
        silenceContext.silenceDurationSeconds = silenceDurationSec;
        silenceContext.turnCount = userData.turnCount || 0;
        silenceContext.userName = userData.name;
        silenceContext.silenceResponseCount = silenceResponseCount; // Sync for deduplication

        // FIX: Sync topics JUST BEFORE generating silence response (not at transcript time)
        // This ensures topics from turn analysis are available for memory_callback responses.
        // Previously, topics were synced in processFinalTranscript which runs BEFORE topic analysis.
        if (userData.recentTopics && userData.recentTopics.length > 0) {
          silenceContext.topicsDiscussed = [...userData.recentTopics];
        } else if (userData.lastTopic) {
          // Accumulate topics instead of replacing
          if (!silenceContext.topicsDiscussed.includes(userData.lastTopic)) {
            silenceContext.topicsDiscussed = [
              userData.lastTopic,
              ...silenceContext.topicsDiscussed.slice(0, 9),
            ];
          }
        }
        if (userData.lastTopic) {
          silenceContext.wasDiscussingTopic = userData.lastTopic;
        }

        // FIX: Update music state before silence response
        // Bug: isMusicPlaying was always false, causing LLM to call playMusic during silence
        // when music was already playing (the silence handler didn't know music was on)
        try {
          const djController = getDJController();
          silenceContext.isMusicPlaying = djController.isMusicActive();
        } catch {
          // DJ Controller not initialized - default to false
          silenceContext.isMusicPlaying = false;
        }

        // LLM-DRIVEN: Get instructions for natural, contextual silence response
        const silenceInstructions = getLLMSilenceInstructions(sessionPersona, silenceContext);

        // PROMINENT LOG: Show silence response timing
        diag.state('🤫 [SILENCE] LLM response triggered', {
          type: silenceInstructions.type,
          silenceSec: Math.round(silenceDurationSec),
          responseNum: silenceResponseCount + 1,
          persona: sessionPersona.id,
          isMusicPlaying: silenceContext.isMusicPlaying,
        });

        // Try LLM-driven response using safe wrapper to prevent native crash
        fireAndForget(async () => {
          if (silenceInstructions.instructions) {
            const result = await safeGenerateReply(session, {
              instructions: silenceInstructions.instructions,
              allowInterruptions: silenceInstructions.allowInterruptions,
              fallbackMessage: silenceContext.isMusicPlaying
                ? undefined
                : silenceInstructions.fallback,
              context: `silence-${silenceInstructions.type}`,
              sessionId,
              timeoutMs: 10_000,
              priority: 'low',
              waitForPlayout: false,
            });

            if (result.success && !result.noSpeechProduced) {
              diag.state('LLM silence response complete', { type: silenceInstructions.type });
            } else if (result.noSpeechProduced) {
              diag.state('LLM silence produced no speech, used fallback', {
                type: silenceInstructions.type,
                fallbackUsed: result.usedFallback,
              });
            } else if (result.usedFallback) {
              diag.state('LLM silence used fallback', {
                type: silenceInstructions.type,
                error: result.error,
              });
            }
          } else if (silenceInstructions.fallback && !silenceContext.isMusicPlaying) {
            void sayWithInterruptAwareness(silenceInstructions.fallback, {
              allowInterruptions: true,
            });
          }

          // If we offered music, actually play it after a short delay
          if (silenceInstructions.type === 'music_offering') {
            setTimeout(() => {
              fireAndForget(async () => {
                const musicStarted = await playAmbientMusicDuringSilence();
                if (musicStarted) {
                  diag.state('Started ambient music during silence');
                }
              }, 'play-ambient-music-during-silence');
            }, 3000);
          }
        }, 'llm-driven-silence-response');

        silenceResponseCount++;
        lastSilenceResponseAt = Date.now();
      }
    }
  });

  // ============================================================
  // CLEANUP - Clear all timers and listeners to prevent memory leaks
  // ============================================================
  const clearTimers = () => {
    if (backchannelTimer) {
      clearTimeout(backchannelTimer);
      backchannelTimer = null;
    }
    if (earlyAckTimer) {
      clearTimeout(earlyAckTimer);
      earlyAckTimer = null;
    }
    if (earlyAckCleanupTimer) {
      clearTimeout(earlyAckCleanupTimer);
      earlyAckCleanupTimer = null;
    }
    if (liveBackchannelInterval) {
      clearInterval(liveBackchannelInterval);
      liveBackchannelInterval = null;
    }
    if (liveBackchannelFailsafeTimer) {
      clearTimeout(liveBackchannelFailsafeTimer);
      liveBackchannelFailsafeTimer = null;
    }
    // 📊 Contextual Feedback: Clear timer and state
    if (feedbackPromptTimer) {
      clearTimeout(feedbackPromptTimer);
      feedbackPromptTimer = null;
    }
    feedbackTriggerEngine.clearState(sessionId);
    // Clear idle timeout timers
    clearIdleTimeout();
    // 🚨 EMPTY RESPONSE WATCHDOG: Clear timer
    if (emptyResponseWatchdogTimer) {
      clearTimeout(emptyResponseWatchdogTimer);
      emptyResponseWatchdogTimer = null;
    }
    lastUserMessageForRecovery = null;

    // 5D: Stop continuous prosody stream
    prosodyStream.stop();

    // 🔧 BTH FIX: Remove early-ack agent state handler to prevent listener leak
    if (earlyAckAgentStateHandler) {
      session.off(voice.AgentSessionEventTypes.AgentStateChanged, earlyAckAgentStateHandler);
      earlyAckAgentStateHandler = null;
    }
  };

  return {
    silenceContext,
    clearTimers,
  };
}

export default setupSessionStateHandlers;
