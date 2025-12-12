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
import { checkForAccentChange } from '../../api/session-accent-routes.js';
import { getDJBooth } from '../../audio/index.js';
import { getActiveListeningEngine } from '../../conversation/active-listening.js';
import {
  getMeaningfulSilenceResponse,
  playAmbientMusicDuringSilence,
  stopAmbientMusic,
  type SilenceContext,
} from '../../personas/meaningful-silence.js';
import type { PersonaConfig } from '../../personas/types.js';
import type { ConversationManager } from '../../services/conversation-manager.js';
import { diag } from '../../services/diagnostic-logger.js';
import { getThinkingFiller } from '../../speech/response-naturalness.js';
import {
  trackBackchannelEvent,
  trackResponseLatency,
  validateTurnPrediction,
} from '../integrations/speech-metrics-integration.js';
import { SILENCE_THRESHOLDS } from '../shared/constants.js';
import type { UserData } from '../shared/types.js';

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
  const { session, sessionPersona, conversationManager, userData, sessionId } = ctx;

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

  // Backchannel timing constants
  const BACKCHANNEL_MIN_INTERVAL_MS = 4000; // 4s feels more natural than 5s
  const BACKCHANNEL_TRIGGER_MS = 3000; // 3s better than 3.5s for responsiveness

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

  // ============================================================
  // BACKCHANNEL HELPER
  // ============================================================
  const attemptBackchannel = async () => {
    // Don't backchannel if agent is speaking
    if (conversationManager.isAgentSpeaking()) return;

    // Don't backchannel too frequently
    if (Date.now() - lastBackchannelAt < BACKCHANNEL_MIN_INTERVAL_MS) return;

    // Get a backchannel from active listening engine
    const backchannel = activeListening.getBackchannel(sessionPersona.id, {
      userEmotion: silenceContext.recentEmotionalTone === 'heavy' ? 'worried' : undefined,
      topicSeriousness: silenceContext.recentEmotionalTone === 'heavy' ? 'serious' : 'casual',
      userJustSharedSomethingPersonal: silenceContext.recentEmotionalTone === 'heavy',
    });

    if (backchannel) {
      try {
        // Say the backchannel with SSML - allow interruption
        session.say(backchannel.ssml, { allowInterruptions: true });
        const backchannelFiredAt = Date.now();
        const pauseDuration = backchannelFiredAt - lastBackchannelAt;
        lastBackchannelAt = backchannelFiredAt;

        // Track that we gave a backchannel (for reaction analysis)
        pendingBackchannelReaction = true;

        // Track detailed backchannel event in unified metrics
        trackBackchannelEvent(sessionId, {
          pauseDurationMs: pauseDuration,
          wasTimely: true,
          category:
            backchannel.type === 'empathy'
              ? 'empathy'
              : backchannel.type === 'encouragement'
                ? 'encouragement'
                : backchannel.type === 'agreement'
                  ? 'affirmation'
                  : 'acknowledgment',
          userEmotion: silenceContext.recentEmotionalTone === 'heavy' ? 'worried' : 'neutral',
          mode: 'adaptive',
        });

        diag.state('Backchannel fired', {
          text: backchannel.verbal,
          type: backchannel.type,
          persona: sessionPersona.id,
        });
      } catch (e) {
        getLogger().warn({ error: e }, 'Failed to fire backchannel');
      }
    }
  };

  // ============================================================
  // AGENT STATE CHANGED HANDLER
  // ============================================================
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
    if (event.newState === 'speaking') {
      conversationManager.handleAgentStartedSpeaking('');

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
        import('../../config/environment.js')
          .then(async ({ isMusicEnabled }) => {
            if (!isMusicEnabled()) return;
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
      conversationManager.handleAgentFinishedSpeaking(0);

      // DJ BOOTH: Notify agent stopped speaking
      const booth = getDJBooth();
      if (booth) {
        booth.onAgentFinishedSpeaking();
        diag.state('Agent stopped - DJ Booth restoring music');
      } else {
        // Fallback to basic unducking
        import('../../config/environment.js')
          .then(async ({ isMusicEnabled }) => {
            if (!isMusicEnabled()) return;
            return import('../../audio/index.js');
          })
          .then((audioModule) => {
            if (!audioModule) return;
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
      void (async () => {
        try {
          const { isGameCurrentlyActive, duckForUserGuess, updateGameActivity } =
            await import('../../services/games/index.js');
          if (isGameCurrentlyActive()) {
            duckForUserGuess();
            updateGameActivity();
          }
        } catch {
          // Games module not loaded
        }
      })();

      // Schedule potential backchannel after user has been speaking a while
      if ((userData.turnCount || 0) >= 3) {
        backchannelTimer = setTimeout(() => {
          void attemptBackchannel();
        }, BACKCHANNEL_TRIGGER_MS);
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
      let earlyAckTimer: ReturnType<typeof setTimeout> | null = null;

      earlyAckTimer = setTimeout(() => {
        if (!conversationManager.isAgentSpeaking()) {
          const timeSinceStop = Date.now() - userStoppedAt;
          if (timeSinceStop >= SILENCE_THRESHOLDS.EARLY_ACKNOWLEDGMENT_SECONDS * 1000 - 100) {
            const filler = getThinkingFiller(sessionPersona.id);
            try {
              session.say(filler, { allowInterruptions: true });
              diag.state('Early acknowledgment (agent processing)', {
                waitedMs: timeSinceStop,
                personaId: sessionPersona.id,
              });
            } catch (e) {
              getLogger().debug({ error: e }, 'Failed to say early acknowledgment');
            }
          }
        }
        earlyAckTimer = null;
      }, SILENCE_THRESHOLDS.EARLY_ACKNOWLEDGMENT_SECONDS * 1000);

      // Clean up timer if agent starts speaking
      const cleanupEarlyAck = () => {
        if (earlyAckTimer) {
          clearTimeout(earlyAckTimer);
          earlyAckTimer = null;
        }
      };

      const agentStateHandler = (agentEvent: { newState: string }) => {
        if (agentEvent.newState === 'speaking') {
          cleanupEarlyAck();
          session.off(voice.AgentSessionEventTypes.AgentStateChanged, agentStateHandler);
        }
      };
      session.on(voice.AgentSessionEventTypes.AgentStateChanged, agentStateHandler);

      // Clean up after 10 seconds regardless (prevents memory leaks)
      setTimeout(() => {
        cleanupEarlyAck();
        session.off(voice.AgentSessionEventTypes.AgentStateChanged, agentStateHandler);
      }, 10000);

      // GAME UNDUCK: Restore music volume after user finishes speaking
      void (async () => {
        try {
          const { isGameCurrentlyActive, unduckAfterGuess } =
            await import('../../services/games/index.js');
          if (isGameCurrentlyActive()) {
            unduckAfterGuess();
          }
        } catch {
          // Games module not loaded
        }
      })();
    }

    // ----------------------------------------------------------------
    // MEANINGFUL SILENCE HANDLING (USER AWAY)
    // ----------------------------------------------------------------
    if (event.newState === 'away') {
      const silenceDurationMs = Date.now() - userLastSpokeAt;
      const silenceDurationSec = silenceDurationMs / 1000;

      // Track negative backchannel reaction if user went silent after our backchannel
      if (pendingBackchannelReaction && Date.now() - lastBackchannelAt > 5000) {
        activeListening.recordBackchannelReaction(false);
        pendingBackchannelReaction = false;
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
              session.say(silenceBackchannel.ssml, { allowInterruptions: true });
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
                session.say(`<break time="300ms"/>${insight.ssml}`, {
                  allowInterruptions: true,
                });
                userData.deliveredVoiceInsight = true;
                userData.pendingVoiceInsight = undefined;

                diag.state('Delivered voice state insight', {
                  emotion: insight.emotion,
                  confidence: insight.confidence,
                });

                void (async () => {
                  const { humanizationAnalytics } =
                    await import('../../conversation/humanization/analytics.js');
                  humanizationAnalytics.recordApplied(sessionId, 'voice_print_detection', {
                    emotion: insight.emotion,
                    confidence: insight.confidence,
                  });
                })();
              }
            } catch (insightErr) {
              getLogger().debug({ error: insightErr }, 'Failed to deliver voice insight');
            }
          }
        }
      }

      // LONG SILENCE (10s+) - Meaningful silence responses
      const intervals = [10, 22, 38];
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

        // Get meaningful silence response
        const silenceResponse = getMeaningfulSilenceResponse(sessionPersona, silenceContext);

        diag.state('Meaningful silence response', {
          type: silenceResponse.type,
          silenceDuration: Math.round(silenceDurationSec),
          responseCount: silenceResponseCount + 1,
        });

        try {
          session.say(silenceResponse.text, { allowInterruptions: true });
          silenceResponseCount++;

          // If we offered music, actually play it after a short delay
          if (silenceResponse.type === 'music_offering') {
            setTimeout(() => {
              void (async () => {
                const musicStarted = await playAmbientMusicDuringSilence();
                if (musicStarted) {
                  diag.state('Started ambient music during silence');
                }
              })();
            }, 3000);
          }
          lastSilenceResponseAt = Date.now();
        } catch (e) {
          getLogger().warn({ error: e }, 'Failed to say silence response');
        }
      }
    }
  });

  // ============================================================
  // CLEANUP
  // ============================================================
  const clearTimers = () => {
    if (backchannelTimer) {
      clearTimeout(backchannelTimer);
      backchannelTimer = null;
    }
  };

  return {
    silenceContext,
    clearTimers,
  };
}

export default setupSessionStateHandlers;
