/**
 * Voice Agent Music Handler
 *
 * NEW ARCHITECTURE: Uses DJController as single source of truth.
 *
 * Responsibilities:
 * - Initialize music player and DJ controller
 * - Wire up state change events
 * - Schedule DJ moments via TimingEngine
 * - Generate speech via SpeechEngine
 *
 * @module voice-agent/music-handler
 */

import type { Room } from '@livekit/rtc-node';
import { createLogger } from '../../utils/safe-logger.js';
import type { PersonaConfig } from '../../personas/types.js';
import type { ConversationManager } from '../../services/conversation-thread/conversation-manager.js';
import type { SessionServices } from '../../services/index.js';
import { coordinatedSay } from '../../speech/coordination/index.js';
import { isMusicEnabled } from '../../config/environment.js';

// New DJ Architecture
import { getDJController, resetDJController, type DJEvent } from '../../audio/dj-controller.js';
import { getDJTimingEngine, resetDJTimingEngine } from '../../audio/dj-timing-engine.js';
import {
  shouldSpeakIntro,
  shouldSpeakOutro,
  type DecisionContext,
} from '../../audio/dj-decision-engine.js';
import {
  getOutroPhrase,
  getDropPhrase,
  getMomentPhrase,
  getCheckInPhrase,
  getInterjection,
  prewarmInterjectionCache,
  type TrackSpeechContext,
} from '../../audio/dj-speech-engine.js';
import {
  getMusicPlayer,
  initializeMusicPlayer,
  isMusicAvailable,
  type MusicTrack,
  type MusicState,
} from '../../audio/music-player.js';

// Music learning and analytics
import { ensureMusicLearningLoaded } from '../../audio/music-learning-persistence.js';
import { startAnalyticsPersistence } from '../../audio/music-transition-analytics.js';
import {
  registerMusicFeedbackRecorder,
  clearMusicFeedbackRecorder,
} from '../../audio/music-feedback-manager.js';
import {
  startMusicContext,
  endMusicContext,
  clearMusicContext,
} from '../../audio/music-session-context.js';

// Frontend communication
import { getFrontendPublisher } from '../realtime/frontend-publisher.js';

const log = createLogger({ module: 'MusicHandler' });

// ============================================================================
// TYPES
// ============================================================================

export interface MusicHandlerContext {
  room: Room;
  services: SessionServices;
  sessionPersona: PersonaConfig;
  conversationManager: ConversationManager;
  sessionId: string;
  userId?: string;
}

export interface MusicHandlerResult {
  cleanup: () => void;
}

// ============================================================================
// SETUP
// ============================================================================

/**
 * Setup the music handler with the new DJ Controller architecture
 */
export async function setupMusicHandler(ctx: MusicHandlerContext): Promise<MusicHandlerResult> {
  const { room, sessionPersona, conversationManager, sessionId, userId } = ctx;

  log.info({ sessionId, personaId: sessionPersona.id }, '🎵 Setting up Music Handler');

  // Skip if music is disabled
  if (!isMusicEnabled()) {
    log.info('Music disabled by environment');
    return { cleanup: () => {} };
  }

  // Initialize music player (required for playback)
  // 🐛 FIX: Was checking isMusicAvailable() BEFORE init, which always returned false!
  // Now we just initialize directly - isMusicAvailable() is for AFTER init to check if it worked.
  try {
    await initializeMusicPlayer(room);
    log.info({ sessionId }, '🎵 Music player initialized successfully');
  } catch (err) {
    log.warn(
      { error: String(err), sessionId },
      '🎵 Music player initialization failed - music will not be available'
    );
  }

  // Pre-load user's music learning data
  if (userId) {
    ensureMusicLearningLoaded(userId).catch((err) => {
      log.warn({ error: String(err) }, 'Failed to load music learning data');
    });
  }

  // Start analytics persistence
  startAnalyticsPersistence();

  // Register feedback recorder for learning (creates a closure for this session)
  registerMusicFeedbackRecorder(sessionId, (feedback) => {
    log.debug({ feedback }, 'Music feedback received');
    // Feedback is automatically recorded by the music-user-learning system
  });

  // Initialize DJ Controller
  const djController = getDJController();
  djController.initialize({
    personaId: sessionPersona.id,
    sessionId,
    userId,
  });

  // Initialize Timing Engine
  const timingEngine = getDJTimingEngine();
  timingEngine.initialize({
    personaId: sessionPersona.id,
    sessionId,
  });

  // ==========================================================================
  // EVENT WIRING: DJ Controller -> Speech
  // ==========================================================================

  djController.on('state_changed', (event: DJEvent) => {
    if (event.type !== 'state_changed') return;

    log.info({ from: event.from, to: event.to, track: event.track?.name }, 'DJ state changed');
    timingEngine.onStateTransition(event.from, event.to);

    // ==========================================================================
    // 🎧 CRITICAL: Send music state to frontend via FrontendPublisher
    // Without this, the frontend Never knows about music state changes!
    // ==========================================================================
    const publisher = getFrontendPublisher();
    if (publisher.isConnected()) {
      const track = event.track
        ? { name: event.track.name, artist: event.track.artist }
        : undefined;

      // Get isAmbient from controller state, not event (state_changed doesn't have it)
      const controllerState = djController.getState();

      publisher
        .sendMusicState(event.to, track, controllerState.isAmbient)
        .then((success) => {
          if (success) {
            log.debug({ state: event.to, track: track?.name }, '🎧 Music state sent to frontend');
          } else {
            log.warn({ state: event.to }, '🎧 Failed to send music state to frontend');
          }
        })
        .catch((err) => {
          log.error({ error: String(err) }, '🎧 Error sending music state to frontend');
        });
    } else {
      log.debug({ state: event.to }, '🎧 Frontend publisher not connected, skipping music state');
    }
  });

  djController.on('track_started', async (event: DJEvent) => {
    if (event.type !== 'track_started') return;

    const { track, isAmbient } = event;
    log.info({ track: track.name, artist: track.artist, isAmbient }, 'Track started');

    // ==========================================================================
    // 🎧 Send track_started state to frontend with full track info
    // ==========================================================================
    const publisher = getFrontendPublisher();
    if (publisher.isConnected()) {
      // Check if this is an "Our Song" (shared musical memory)
      let ourSongInfo: { isOurSong: boolean; context?: string } | undefined;
      if (userId) {
        try {
          const { checkForOurSong } = await import('../../services/trust-systems/our-songs.js');
          const songCallback = checkForOurSong(userId, track.name, track.artist ?? '');
          if (songCallback) {
            ourSongInfo = { isOurSong: true, context: songCallback.phrase };
            log.info({ track: track.name }, '🎧 Playing "Our Song" - shared musical memory!');
          }
        } catch {
          // Our Songs feature not critical, continue without it
        }
      }

      publisher
        .sendMusicState(
          'playing',
          {
            name: track.name,
            artist: track.artist,
            duration: track.duration,
            albumArt: track.albumArt,
          },
          isAmbient,
          ourSongInfo
        )
        .catch((err) => {
          log.error({ error: String(err) }, '🎧 Error sending track_started to frontend');
        });
    }

    // Start music context for transition learning
    startMusicContext(sessionId, {
      startReason: isAmbient ? 'background' : 'user_request',
      trackName: track.name,
      trackArtist: track.artist,
      wasAmbient: isAmbient,
    });

    if (!isAmbient) {
      // Schedule DJ moments
      timingEngine.scheduleTrackMoments(track, (momentType, t) => {
        handleDJMoment(momentType, t, sessionPersona.id, sessionId, conversationManager);
      });

      // Pre-warm LLM cache
      const speechContext: TrackSpeechContext = { track, personaId: sessionPersona.id };
      prewarmInterjectionCache(speechContext).catch(() => {});
    }

    // Maybe speak intro
    const decisionContext: DecisionContext = {
      state: djController.getState(),
      track,
      personaId: sessionPersona.id,
    };

    const introDecision = shouldSpeakIntro(decisionContext);
    if (introDecision.shouldSpeak && !conversationManager.isAgentSpeaking()) {
      if (introDecision.delay > 0) {
        timingEngine.scheduleTimer('buildup', introDecision.delay, () => {
          speakTrackIntro(
            track,
            sessionPersona.id,
            introDecision.isInterjection,
            sessionId,
            conversationManager
          );
        });
      } else {
        speakTrackIntro(
          track,
          sessionPersona.id,
          introDecision.isInterjection,
          sessionId,
          conversationManager
        );
      }
    }
  });

  djController.on('should_speak_outro', async (event: DJEvent) => {
    if (event.type !== 'should_speak_outro') return;

    const { track } = event;

    // 🎧 FIX: Skip outro speech if there are more tracks in queue
    // This prevents speech overlap when transitioning between queued tracks.
    // The outro is only meaningful for the final track in a sequence.
    const playerState = musicPlayer.getState();
    if (playerState.queue.length > 0) {
      log.debug(
        { track: track.name, queueLength: playerState.queue.length },
        '🎧 Skipping outro - more tracks in queue'
      );
      return;
    }

    const decisionContext: DecisionContext = {
      state: djController.getState(),
      track,
      personaId: sessionPersona.id,
    };

    const outroDecision = shouldSpeakOutro(decisionContext);
    if (outroDecision.shouldSpeak && !conversationManager.isAgentSpeaking()) {
      const speechContext: TrackSpeechContext = { track, personaId: sessionPersona.id };
      const phrase = getOutroPhrase(speechContext);
      coordinatedSay(sessionId, phrase);
    }
  });

  djController.on('fading_started', (event: DJEvent) => {
    if (event.type !== 'fading_started') return;

    const { track } = event;
    log.info({ track: track.name }, '🎧 Track fading - notifying frontend');

    // Send fading state to frontend for visual feedback
    const publisher = getFrontendPublisher();
    if (publisher.isConnected()) {
      publisher
        .sendMusicState('fading', { name: track.name, artist: track.artist })
        .catch((err) => {
          log.error({ error: String(err) }, '🎧 Error sending fading state to frontend');
        });
    }
  });

  djController.on('track_ended', (event: DJEvent) => {
    if (event.type !== 'track_ended') return;
    endMusicContext(sessionId);

    // ==========================================================================
    // 🎧 Send track_ended (stopped) state to frontend
    // ==========================================================================
    const publisher = getFrontendPublisher();
    if (publisher.isConnected()) {
      publisher.sendMusicState('stopped').catch((err) => {
        log.error({ error: String(err) }, '🎧 Error sending track_ended to frontend');
      });
    }
  });

  // ==========================================================================
  // 🎧 DUCKING EVENTS: Send ducking state to frontend for volume control
  // The frontend uses Web Audio API GainNode to actually duck the volume
  // ==========================================================================

  djController.on('ducking_started', (event: DJEvent) => {
    if (event.type !== 'ducking_started') return;

    log.info({ reason: event.reason }, '🎧 Ducking started - notifying frontend');

    const publisher = getFrontendPublisher();
    if (publisher.isConnected()) {
      const state = djController.getState();
      const track = state.currentTrack
        ? { name: state.currentTrack.name, artist: state.currentTrack.artist }
        : undefined;

      publisher.sendMusicState('ducking', track, state.isAmbient).catch((err) => {
        log.error({ error: String(err) }, '🎧 Error sending ducking_started to frontend');
      });
    }
  });

  djController.on('ducking_ended', (event: DJEvent) => {
    if (event.type !== 'ducking_ended') return;

    log.info('🎧 Ducking ended - notifying frontend to restore volume');

    const publisher = getFrontendPublisher();
    if (publisher.isConnected()) {
      const state = djController.getState();
      const track = state.currentTrack
        ? { name: state.currentTrack.name, artist: state.currentTrack.artist }
        : undefined;

      publisher.sendMusicState('playing', track, state.isAmbient).catch((err) => {
        log.error({ error: String(err) }, '🎧 Error sending ducking_ended to frontend');
      });
    }
  });

  // ==========================================================================
  // WIRE UP: MusicPlayer -> DJController
  // ==========================================================================

  const musicPlayer = getMusicPlayer();

  musicPlayer.setOnMusicStateChangeCallback(
    (state: MusicState, track: MusicTrack | null, isAmbient: boolean) => {
      switch (state) {
        case 'playing':
          if (track) {
            // 🐛 FIX: Only dispatch PLAY_TRACK for NEW tracks, not when resuming from duck!
            // Without this check, unduck → playing triggers PLAY_TRACK → track_started → DJ speech → loop forever
            const currentState = djController.getState();
            const isNewTrack =
              !currentState.currentTrack || currentState.currentTrack.name !== track.name;
            const isResumeFromDuck =
              currentState.state === 'ducking' && currentState.currentTrack?.name === track.name;

            if (isNewTrack && !isResumeFromDuck) {
              djController.dispatch({ type: 'PLAY_TRACK', track, isAmbient });
            } else {
              log.debug(
                { track: track.name, state: currentState.state },
                '🎧 Skipping PLAY_TRACK - same track resuming from duck'
              );
            }
          }
          break;
        case 'stopped':
          djController.dispatch({ type: 'STOP' });
          break;
        case 'paused':
          djController.dispatch({ type: 'PAUSE' });
          break;
        case 'fading':
          djController.dispatch({ type: 'TRACK_NEAR_END' });
          break;
      }
    }
  );

  musicPlayer.setOnTrackEndedCallback((track: MusicTrack, _wasAmbient: boolean) => {
    djController.dispatch({ type: 'TRACK_ENDED' });
  });

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  const cleanup = (): void => {
    log.info({ sessionId }, 'Cleaning up Music Handler');

    musicPlayer.setOnMusicStateChangeCallback(() => {});
    musicPlayer.setOnTrackEndedCallback(() => {});

    clearMusicContext(sessionId);
    clearMusicFeedbackRecorder();
    resetDJController();
    resetDJTimingEngine();
  };

  log.info({ sessionId }, '🎵 Music Handler setup complete');

  return { cleanup };
}

// ============================================================================
// HELPERS
// ============================================================================

async function speakTrackIntro(
  track: MusicTrack,
  personaId: string,
  isInterjection: boolean,
  sessionId: string,
  conversationManager: ConversationManager
): Promise<void> {
  if (conversationManager.isAgentSpeaking()) return;

  const speechContext: TrackSpeechContext = { track, personaId };

  let phrase: string;
  if (isInterjection) {
    phrase = await getInterjection(speechContext, 'track_start');
  } else {
    phrase = getDropPhrase(speechContext);
  }

  coordinatedSay(sessionId, phrase);
}

async function handleDJMoment(
  momentType: string,
  track: MusicTrack,
  personaId: string,
  sessionId: string,
  conversationManager: ConversationManager
): Promise<void> {
  if (conversationManager.isAgentSpeaking()) return;

  let phrase: string;

  switch (momentType) {
    case 'buildup':
    case 'drop':
    case 'appreciation':
      phrase = getMomentPhrase(momentType, personaId);
      break;
    case 'check-in':
      phrase = getCheckInPhrase(personaId);
      break;
    // NOTE: 'outro' is handled by DJ Controller's 'should_speak_outro' event,
    // NOT by the timing engine. This prevents duplicate speech triggers.
    default:
      log.warn({ momentType }, 'Unknown DJ moment type');
      return;
  }

  log.debug({ momentType, track: track.name }, 'DJ moment triggered');
  coordinatedSay(sessionId, phrase);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if music is currently active
 */
export function isMusicActive(): boolean {
  const djController = getDJController();
  return djController.isMusicActive();
}

/**
 * Check if dead air detection should be active
 */
export function isDeadAirActive(): boolean {
  const djController = getDJController();
  return !djController.isMusicActive();
}

/**
 * Notify that agent started speaking (for ducking)
 */
export function notifyAgentSpeakingStart(): void {
  const djController = getDJController();
  djController.dispatch({ type: 'AGENT_SPEAKING_START' });
}

/**
 * Notify that agent stopped speaking
 */
export function notifyAgentSpeakingEnd(): void {
  const djController = getDJController();
  djController.dispatch({ type: 'AGENT_SPEAKING_END' });
}

/**
 * Notify that user started speaking
 */
export function notifyUserSpeakingStart(): void {
  const djController = getDJController();
  djController.dispatch({ type: 'USER_SPEAKING_START' });
}

/**
 * Notify that user stopped speaking
 */
export function notifyUserSpeakingEnd(): void {
  const djController = getDJController();
  djController.dispatch({ type: 'USER_SPEAKING_END' });
}

// Backward compatibility exports
export { getMusicPlayer, type MusicTrack, type MusicState } from '../../audio/music-player.js';
