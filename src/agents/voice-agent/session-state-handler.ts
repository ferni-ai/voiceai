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
import { checkForAccentChange } from '../../services/session/index.js';
import { getDJBooth } from '../../audio/index.js';
import { getSessionFlags } from '../../config/voice-humanization-flags.js';
import { getActiveListeningEngine } from '../../conversation/active-listening.js';
import {
  analyzeSilence,
  recordSilence,
  type SilenceAnalysis,
} from '../../intelligence/silence-intelligence.js';
import {
  getMeaningfulSilenceResponse,
  getLLMSilenceInstructions,
  playAmbientMusicDuringSilence,
  stopAmbientMusic,
  type SilenceContext,
  type LLMSilenceInstructions,
} from '../../personas/meaningful-silence.js';
import type { PersonaConfig } from '../../personas/types.js';
import type { ConversationManager } from '../../services/conversation-manager.js';
import { diag } from '../../services/diagnostic-logger.js';
import { wrapSpeechWithInterruptAwareness } from '../../speech/graceful-interrupt/speech-wrapper.js';
import { getLiveBackchannelingService } from '../../speech/live-backchanneling/index.js';
import {
  generateBackchannelInstructions,
  generateSilenceInstructions,
} from '../../speech/llm-backchannel.js';
import { getContextAwareThinkingFiller } from '../../speech/persona-phrases.js';
import {
  trackBackchannelEvent,
  trackResponseLatency,
  validateTurnPrediction,
} from '../integrations/speech-metrics-integration.js';
import { SILENCE_THRESHOLDS, IDLE_TIMEOUT } from '../shared/constants.js';
import { safeGenerateReply, generateReplyWithContext } from '../shared/safe-generate-reply.js';
import type { UserData } from '../shared/types.js';
// Speech coordination for adaptive timing and centralized speech management
import { getSpeechCoordinator, coordinatedSay } from '../../speech/coordination/index.js';
// Safe fire-and-forget pattern for non-critical async operations
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';
// Better Than Human - Silence Interpreter integration
import { processSilenceWithInterpreter } from '../integrations/better-than-human-integration.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionStateContext {
  /** Voice session instance */
  session: voice.AgentSession<UserData>;
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
  const { session, sessionPersona, conversationManager, userData, sessionId, onIdleTimeout } = ctx;

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

  // Idle timeout tracking - auto-disconnect after extended silence
  let idleTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let idleWarningTimer: ReturnType<typeof setTimeout> | null = null;
  let hasWarnedAboutIdle = false;
  let isDisconnectingDueToIdle = false;

  // Backchannel timing constants - HUMANIZATION FIX (Dec 2025)
  // Real humans backchannel about once per 10-15 seconds, not every 4s!
  // Using longer intervals to prevent robotic over-backchanneling
  const BACKCHANNEL_MIN_INTERVAL_MS = 12000; // 12s between backchannels (was 4s - too robotic!)
  const BACKCHANNEL_TRIGGER_MS = 4000; // 4s pause before triggering (was 3s - too quick!)

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
  // HUMANIZATION FIX (Dec 2025): Live backchannels were too frequent - felt robotic
  // Increased interval and minimum speech time for more natural feel
  const LIVE_BACKCHANNEL_MIN_INTERVAL_MS = 15000; // 15s between live backchannels (was 4s!)
  const MIN_SPEECH_FOR_LIVE_BACKCHANNEL_MS = 5000; // User must speak 5s+ (was 2s)

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
    // Don't backchannel if agent is speaking
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
        void safeGenerateReply(session, {
          instructions: result.instructions,
          allowInterruptions: true,
          waitForPlayout: false, // Don't wait - backchannels are non-blocking
          context: 'backchannel',
          sessionId,
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
  // AGENT STATE CHANGED HANDLER
  // ============================================================
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
    if (event.newState === 'speaking') {
      conversationManager.handleAgentStartedSpeaking('');

      // Track speech start time for duration calculation (adaptive echo prevention)
      userData.lastAgentSpeechStartTime = Date.now();

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

      // DJ BOOTH: Notify agent speaking - smooth ducking with timing
      const booth = getDJBooth();
      if (booth) {
        booth.onProcessingEnd();
        diag.state('Agent speaking - DJ Booth managing music');
      } else {
        // Fallback to basic ducking if DJ Booth not initialized
        // GUARD: Don't access music player singleton if session is cleaning up (race condition fix)
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
    }

    if (event.oldState === 'speaking' && event.newState !== 'speaking') {
      const speechEndTime = Date.now();

      // Calculate and track utterance duration (for adaptive echo prevention)
      const utteranceDuration = userData.lastAgentSpeechStartTime
        ? speechEndTime - userData.lastAgentSpeechStartTime
        : undefined;

      userData.lastAgentSpeechEndTime = speechEndTime;
      userData.lastAgentUtteranceDurationMs = utteranceDuration;

      // Notify speech coordinator for adaptive timing learning
      coordinator.onSpeechEnded(
        userData.wasInterrupted ?? false,
        utteranceDuration ?? 1000 // Default to 1s if unknown
      );

      conversationManager.handleAgentFinishedSpeaking(0);

      // DJ BOOTH: Notify agent stopped speaking
      const booth = getDJBooth();
      if (booth) {
        booth.onAgentFinishedSpeaking();
        diag.state('Agent stopped - DJ Booth restoring music');
      } else {
        // Fallback to basic unducking
        // GUARD: Don't access music player singleton if session is cleaning up (race condition fix)
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
      // GRACEFUL INTERRUPT: Track if user interrupted while agent was speaking
      // This enables softer recovery when agent responds next
      if (conversationManager.isAgentSpeaking()) {
        userData.wasInterrupted = true;
        // Determine interrupt type: 'hard' if user said explicit stop words, else 'soft'
        // The transcript handler sets more precise type if available
        userData.interruptType = 'soft';
        diag.state('🎭 User interrupted agent - will use graceful recovery');
      }

      // Record silence if we had an analysis (user broke the silence by self-initiating)
      const userId = userData.userId;
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
      if (pendingBackchannelReaction && Date.now() - lastBackchannelAt < 10000) {
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

      // Stop ambient music when user starts speaking
      stopAmbientMusic();
      conversationManager.handleUserStartedSpeaking();

      // DJ BOOTH: User started speaking - duck music
      const booth = getDJBooth();
      if (booth) {
        booth.onUserStartSpeaking();
        diag.state('User speaking - DJ Booth ducking music');
      }

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
        }, 200); // Check every 200ms for breath pauses

        // Failsafe: Clear interval after 30s max to prevent memory leaks
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
        }, 30000);
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

      if (userData.userSpeakingStartTime) {
        conversationManager.handleUserFinishedSpeaking(Date.now() - userData.userSpeakingStartTime);
      }

      // DJ BOOTH: User stopped speaking - restore music (unless agent is responding)
      const userStopBooth = getDJBooth();
      if (userStopBooth) {
        userStopBooth.onUserStopSpeaking();
        diag.state('User stopped - DJ Booth managing volume restore');

        // THINKING MUSIC: User stopped speaking, agent is "thinking"
        userStopBooth.onProcessingStart();
        diag.state('User stopped speaking - thinking music scheduled');
      }

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

          if (!conversationManager.isAgentSpeaking()) {
            const timeSinceStop = Date.now() - userStoppedAt;
            if (timeSinceStop >= SILENCE_THRESHOLDS.EARLY_ACKNOWLEDGMENT_SECONDS * 1000 - 100) {
              // Dead air prevention: Use stage directions pattern for contextual check-ins
              // Behavioral instructions are used to guide the LLM's response style
              // without leaking into speech (uses [INTERNAL GUIDANCE] format internally).
              const lastTranscript = (userData.recentTranscripts ?? []).slice(-1)[0] ?? '';
              const turnCount = userData.turnCount ?? 0;

              // Build contextual stage directions
              const contextParts = [
                `The user has been silent for ${Math.round(timeSinceStop / 1000)} seconds after speaking.`,
                'Check in briefly to show you are present and listening.',
                'Keep it SHORT (under 10 words). Be warm but not needy.',
                "Don't ask questions - just acknowledge you're here.",
              ];

              // Add context about what they were discussing if available
              if (lastTranscript && lastTranscript.length > 10) {
                contextParts.push(`They were talking about: "${lastTranscript.slice(0, 100)}..."`);
              }

              // Adjust tone based on conversation stage
              if (turnCount < 3) {
                contextParts.push('This is early in the conversation - be welcoming.');
              } else if (turnCount > 10) {
                contextParts.push('You have rapport now - be casual and natural.');
              }

              // PROMINENT LOG: Show dead air timing
              diag.state('🎭 [DEAD AIR] Early acknowledgment', {
                waitedSec: Math.round(timeSinceStop / 1000),
                persona: sessionPersona.id,
                turnCount,
                hasContext: !!lastTranscript,
              });

              // Use generateReplyWithContext which formats as behavioral instructions
              void generateReplyWithContext(session, {
                context: contextParts,
                fallbackMessage: "I'm here whenever you're ready.",
                allowInterruptions: true,
                logContext: 'early-dead-air-checkin',
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

      // Clean up after 10 seconds regardless (prevents memory leaks)
      earlyAckCleanupTimer = setTimeout(() => {
        cleanupEarlyAck();
        if (earlyAckAgentStateHandler) {
          session.off(voice.AgentSessionEventTypes.AgentStateChanged, earlyAckAgentStateHandler);
          earlyAckAgentStateHandler = null;
        }
        earlyAckCleanupTimer = null;
      }, 10000);

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
      if (pendingBackchannelReaction && Date.now() - lastBackchannelAt > 5000) {
        activeListening.recordBackchannelReaction(false);
        pendingBackchannelReaction = false;
      }

      // ----------------------------------------------------------------
      // DEEP UNDERSTANDING: Silence Intelligence Analysis
      // Analyze the silence to understand what type it is
      // ----------------------------------------------------------------
      let silenceAnalysis: SilenceAnalysis | null = null;
      const userId = userData.userId;
      if (userId && silenceDurationMs >= 1500) {
        // Only analyze meaningful silences (>1.5s)
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
      const baseIntervals = [10, 22, 38];
      const randomize = (base: number) => Math.round(base * (0.8 + Math.random() * 0.4));
      const intervals = baseIntervals.map(randomize);
      const targetInterval = intervals[silenceResponseCount];

      if (
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

        // LLM-DRIVEN: Get instructions for natural, contextual silence response
        const silenceInstructions = getLLMSilenceInstructions(sessionPersona, silenceContext);

        // PROMINENT LOG: Show silence response timing
        diag.state('🤫 [SILENCE] LLM response triggered', {
          type: silenceInstructions.type,
          silenceSec: Math.round(silenceDurationSec),
          responseNum: silenceResponseCount + 1,
          persona: sessionPersona.id,
        });

        // Try LLM-driven response using safe wrapper to prevent native crash
        fireAndForget(async () => {
          if (silenceInstructions.instructions) {
            // FIX: Use safeGenerateReply to prevent native mutex crash
            // The SDK's generateReply can timeout and trigger a native crash
            // in @livekit/rtc-node when cleanup races with the mutex
            // FIX: Pass sessionId so safeGenerateReply can skip if session is closing
            // (prevents errors after handoff when old session is draining)
            const result = await safeGenerateReply(session, {
              instructions: silenceInstructions.instructions,
              allowInterruptions: silenceInstructions.allowInterruptions,
              fallbackMessage: silenceInstructions.fallback,
              context: `silence-${silenceInstructions.type}`,
              sessionId,
            });

            if (result.success) {
              diag.state('LLM silence response complete', { type: silenceInstructions.type });
            } else if (result.usedFallback) {
              diag.state('LLM silence used fallback', {
                type: silenceInstructions.type,
                error: result.error,
              });
            }
          } else if (silenceInstructions.fallback) {
            // No LLM instructions (e.g., music playing) - use fallback if present
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
  // CLEANUP - Clear all timers to prevent memory leaks on disconnect
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
    // Clear idle timeout timers
    clearIdleTimeout();
  };

  return {
    silenceContext,
    clearTimers,
  };
}

export default setupSessionStateHandlers;
