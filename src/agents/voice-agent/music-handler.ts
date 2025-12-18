/**
 * Voice Agent Music Handler
 *
 * Handles music player initialization and DJ booth setup:
 * - Music player initialization (before session.start)
 * - DJ booth for smooth audio orchestration
 * - Track ended callbacks
 * - Mid-song moment callbacks ("Wait for it..." interjections)
 * - Music state change callbacks (crossfade, outro, unexpected stops)
 * - Music appreciation comments
 * - "Read the room" engagement checks
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/music-handler
 */

import type { voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import {
  getMusicHumanization,
  initializeDJBooth,
  type DJBooth,
  type MusicState,
  type MusicTrack,
} from '../../audio/index.js';
// 🐛 FIX: Static import for DJ phrases - dynamic imports add latency causing silence!
import {
  getDJTrackChangePhrase,
  getMidSongMomentPhrase,
  getMusicStoppedPhrase,
} from '../../audio/ambient-music.js';
// 🎵 Music Humanization - spontaneous offers, emotional mirrors
import {
  checkSpontaneousMusicMoment,
  getEmotionalMirrorOffer,
  getPostMusicCheckIn,
  type MusicHumanizationController,
} from '../../audio/music-humanization.js';
import { isMusicEnabled } from '../../config/environment.js';
import type { PersonaConfig } from '../../personas/types.js';
import type { ConversationManager } from '../../services/conversation-manager.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import { getDJIntegration } from '../dj-integration.js';
import type { UserData } from '../shared/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MusicHandlerContext {
  /** LiveKit room instance */
  room: Room;
  /** Voice session instance */
  session: voice.AgentSession<UserData>;
  /** Session services */
  services: SessionServices;
  /** Current persona config */
  sessionPersona: PersonaConfig;
  /** Conversation manager for checking agent speaking state */
  conversationManager: ConversationManager;
}

export interface MusicHandlerResult {
  /** DJ booth instance (for cleanup) */
  djBooth: DJBooth | null;
  /** Music humanization controller (for spontaneous offers) */
  musicHumanization: MusicHumanizationController | null;
  /** Cleanup function to clear timers */
  clearTimers: () => void;
  /** Whether music was initialized */
  initialized: boolean;
}

// ============================================================================
// MAIN MUSIC SETUP
// ============================================================================

/**
 * Initialize music player and DJ booth
 *
 * CRITICAL: This must be called BEFORE session.start() to prevent race conditions.
 * If we wait until after session.start(), the agent could try to play music
 * before the music player is ready, causing silent "simulation mode" playback.
 */
export async function setupMusicHandler(ctx: MusicHandlerContext): Promise<MusicHandlerResult> {
  const { room, session, services, sessionPersona, conversationManager } = ctx;

  let djBooth: DJBooth | null = null;
  let musicHumanization: MusicHumanizationController | null = null;
  let appreciationTimer: NodeJS.Timeout | null = null;
  let readTheRoomTimer: NodeJS.Timeout | null = null;

  const clearTimers = () => {
    if (appreciationTimer) clearInterval(appreciationTimer);
    if (readTheRoomTimer) clearInterval(readTheRoomTimer);
    appreciationTimer = null;
    readTheRoomTimer = null;
  };

  // 🔍 DIAGNOSTIC LOGGING
  diag.session('🎵 [DIAG] setupMusicHandler called', {
    hasRoom: !!room,
    isMusicEnabled: isMusicEnabled(),
    personaId: sessionPersona?.id,
  });

  if (!room || !isMusicEnabled()) {
    if (!room) {
      diag.session('🎵 [DIAG] Music player skipped - NO ROOM provided');
    }
    if (!isMusicEnabled()) {
      diag.session('🎵 [DIAG] Music player skipped - MUSIC_ENABLED is false');
      diag.session('🎵 [DIAG] Set MUSIC_ENABLED=true in environment to enable music');
    }
    return { djBooth: null, musicHumanization: null, clearTimers, initialized: false };
  }

  try {
    diag.session('🎵 [DIAG] Importing audio modules...');
    const {
      initializeMusicPlayer,
      getMusicPlayer,
      getAmbientMusicEndedPhrase,
      initializeSoundEffectsPlayer,
    } = await import('../../audio/index.js');

    diag.session('🎵 [DIAG] Audio modules imported, calling initializeMusicPlayer...');

    // 🐛 FIX: Generate a unique session ID to detect singleton pollution
    // This helps prevent one session's state from affecting another
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Pass the agent session for proper audio mixing with voice
    // Also pass session ID to detect and handle singleton reuse
    await initializeMusicPlayer(room, session, sessionId);

    diag.session('🎵 [DIAG] initializeMusicPlayer completed successfully');

    // 🔊 Initialize dedicated sound effects player (separate from music)
    // This ensures sounds never trigger "music ended" callbacks
    await initializeSoundEffectsPlayer(room, session);
    diag.session('🔊 [DIAG] Sound effects player initialized');

    // Set up callback for when ambient music ends - agent comes back in
    const player = getMusicPlayer();

    diag.session('🎵 [DIAG] Music player retrieved', {
      isInitialized: player.isInitialized(),
      state: player.getState(),
    });

    // Initialize DJ Booth with user's existing music preferences
    const existingMusicPrefs = services.userProfile?.musicMemory
      ? {
          likedArtists: services.userProfile.musicMemory.favoriteArtists || [],
          dislikedArtists: services.userProfile.musicMemory.dislikedArtists || [],
          favoriteGenres: services.userProfile.musicMemory.favoriteGenres || [],
          totalTracksPlayed: services.userProfile.musicMemory.totalTracksPlayed || 0,
          lastPlayed: services.userProfile.musicMemory.lastPlayedTrack
            ? {
                artist: services.userProfile.musicMemory.lastPlayedArtist || 'Unknown',
                track: services.userProfile.musicMemory.lastPlayedTrack,
                timestamp: services.userProfile.musicMemory.updatedAt?.getTime() || Date.now(),
              }
            : undefined,
        }
      : undefined;

    djBooth = initializeDJBooth(
      {
        personaId: sessionPersona.id,
        speakCallback: (phrase, options) => {
          try {
            session.say(phrase, options);
          } catch (e) {
            diag.warn('DJ Booth speak callback failed', { error: String(e) });
          }
        },
        onAgentSpeakStart: () => {
          diag.state('🎧 DJ Booth: Agent speaking (music will duck)');
        },
        onAgentSpeakEnd: () => {
          diag.state('🎧 DJ Booth: Agent stopped (music will restore)');
        },
        isAgentSpeaking: () => conversationManager.isAgentSpeaking(),
      },
      existingMusicPrefs
    );

    // Set user ID for "Our Songs" trust system tracking
    if (services.userId) {
      djBooth.setUserId(services.userId);
      diag.state('🎵 DJ Booth user ID set for "Our Songs"', { userId: services.userId });
    }

    diag.state('🎧 DJ Booth initialized with enhancements', {
      persona: sessionPersona.id,
      hasExistingPrefs: !!existingMusicPrefs,
      hasUserId: !!services.userId,
    });

    // 🎵 Initialize Music Humanization for spontaneous offers and emotional mirroring
    musicHumanization = getMusicHumanization();
    musicHumanization.setPersona(sessionPersona.id);
    diag.state('🎵 Music Humanization initialized', { persona: sessionPersona.id });

    // Set up track ended callback
    player.setOnTrackEndedCallback((track, wasAmbient) => {
      // 🐛 FIX: Skip system sounds (session sounds like connect.mp3)
      // These have track names like "sound-session-start", "sound-handoff"
      // We don't want Ferni to comment when these short stingers end
      if (track.name.startsWith('sound-')) {
        diag.state('🔔 System sound ended (ignoring)', { track: track.name });
        return;
      }

      // 🐛 FIX: Skip music-ended phrases during handoffs
      // When switching personas, we stop music but don't want to announce it
      if (djBooth?.isHandoffInProgress()) {
        diag.state('🔄 Music ended during handoff (suppressing phrase)', { track: track.name });
        return;
      }

      if (wasAmbient) {
        // 🐛 FIX: Only announce ambient music ending 20% of the time
        // Ambient music is meant to be subtle - constant announcements are jarring
        // The user may not have even noticed music was playing
        if (Math.random() < 0.2) {
          const comeBackPhrase = getAmbientMusicEndedPhrase(sessionPersona.id);
          diag.state('Ambient music ended, agent coming back', { track: track.name });

          try {
            session.say(comeBackPhrase, { allowInterruptions: true });
          } catch (e) {
            diag.warn('Failed to say music-ended phrase', { error: String(e) });
          }
        } else {
          diag.state('🎵 Ambient music ended - staying quiet (letting silence breathe)', {
            track: track.name,
          });
        }
      } else {
        // 🎵 HUMANIZED MUSIC ENDING - User-requested music just ended
        // Wait for natural silence, then gently check in (not always)
        // This is the "let it breathe" moment after music fades

        // 70% chance to speak - sometimes silence is golden
        if (Math.random() < 0.7) {
          // Natural pause after music ends (600-1000ms feels human)
          const pauseMs = 600 + Math.floor(Math.random() * 400);

          setTimeout(() => {
            try {
              // Gentle, non-DJ phrases - just checking in naturally
              const gentlePhrases = [
                '<break time="300ms"/>That was nice.',
                '<break time="300ms"/>Mm.',
                '<break time="400ms"/>How are you feeling?',
                '<break time="300ms"/>Good song.',
                '<break time="400ms"/>Where were we?',
                '<break time="300ms"/>Ready to continue?',
              ];
              const phrase = gentlePhrases[Math.floor(Math.random() * gentlePhrases.length)];

              diag.state('🎵 Music ended - gentle check-in', {
                track: track.name,
                phrase,
                pauseMs,
              });

              session.say(phrase, { allowInterruptions: true });
            } catch (e) {
              diag.warn('Failed to say music-ended phrase', { error: String(e) });
            }
          }, pauseMs);
        } else {
          diag.state('🎵 Music ended - staying quiet (letting silence breathe)', {
            track: track.name,
          });
        }
      }
    });

    // Set up mid-song moment callback
    // 🐛 FIX: Use static import for immediate response
    player.setOnMidSongMomentCallback((track, momentType) => {
      // 🐛 FIX: Skip system sounds (session sounds like connect.mp3)
      // These have track names like "sound-session-start", "sound-handoff"
      // We don't want Ferni to do mid-song moments for short stingers
      if (track.name.startsWith('sound-')) {
        diag.state('🔔 System sound mid-song moment (ignoring)', { track: track.name });
        return;
      }

      try {
        const phrase = getMidSongMomentPhrase(momentType, track.name, sessionPersona.id);

        diag.state('🎤 Mid-song moment!', {
          track: track.name,
          momentType,
          phrase: phrase.slice(0, 50),
        });

        session.say(phrase, { allowInterruptions: true });
      } catch (e) {
        diag.warn('Failed to speak mid-song moment', { error: String(e) });
      }
    });

    // Set up music state change callback
    setupMusicStateCallback(
      player,
      session,
      sessionPersona,
      djBooth,
      room,
      clearTimers,
      (timer) => {
        appreciationTimer = timer;
      },
      (timer) => {
        readTheRoomTimer = timer;
      }
    );

    diag.state('🎵 [DIAG] Music player SUCCESSFULLY initialized (before session.start)', {
      hasDJBooth: !!djBooth,
      hasMusicHumanization: !!musicHumanization,
      personaId: sessionPersona?.id,
    });
    return { djBooth, musicHumanization, clearTimers, initialized: true };
  } catch (musicError) {
    diag.warn('🎵 [DIAG] Music player init FAILED (non-fatal)', {
      error: String(musicError),
      stack: musicError instanceof Error ? musicError.stack : undefined,
    });
    return { djBooth: null, musicHumanization: null, clearTimers, initialized: false };
  }
}

// ============================================================================
// MUSIC STATE CALLBACK
// ============================================================================

interface MusicPlayer {
  setOnMusicStateChangeCallback: (
    callback: (state: MusicState, track: MusicTrack | null, isAmbient: boolean) => void
  ) => void;
}

function setupMusicStateCallback(
  player: MusicPlayer,
  session: voice.AgentSession<UserData>,
  sessionPersona: PersonaConfig,
  djBooth: DJBooth | null,
  room: Room,
  clearTimers: () => void,
  setAppreciationTimer: (timer: NodeJS.Timeout | null) => void,
  setReadTheRoomTimer: (timer: NodeJS.Timeout | null) => void
): void {
  // Track state for detecting unexpected stops
  let lastMusicState: MusicState = 'idle';
  let lastTrackName: string | undefined;

  // DJ engagement tracking
  let musicPlaybackStartTime: number | null = null;
  let lastAppreciationTime: number | null = null;
  let lastReadTheRoomTime: number | null = null;

  player.setOnMusicStateChangeCallback((state, track, isAmbient) => {
    // 🐛 FIX: Skip system sounds (session sounds like connect.mp3)
    // These have track names like "sound-session-start", "sound-handoff"
    // We don't want Ferni to comment when these short stingers play/end
    if (track?.name.startsWith('sound-')) {
      diag.state('🔔 System sound state change (ignoring)', { state, track: track.name });
      // Still update lastMusicState to avoid false "unexpected stop" detection
      lastMusicState = state;
      return;
    }

    diag.state('Music state changed', {
      state,
      previousState: lastMusicState,
      track: track?.name,
      isAmbient,
    });

    // 🎵 HUMANIZED MUSIC TRANSITIONS
    // The old approach spoke "DJ-style" over the fade - felt forced and unnatural.
    // New approach: Let music breathe, wait for natural ending, then gently check in.

    if (state === 'fading' && !isAmbient && track) {
      // 🎵 During fade: Stay quiet and let the music breathe
      // No DJ outro here - it felt forced. Just log for debugging.
      diag.state('🎵 Music fading - letting it breathe (no DJ outro)', {
        track: track.name,
      });
      // The track ended callback will handle the gentle check-in after silence
    }

    if (state === 'changing' && !isAmbient) {
      // 🎧 CROSSFADE TRANSITION - this one still makes sense to speak
      // But make it more subtle than before
      const transitionPhrase = getDJTrackChangePhrase(
        track ? { name: track.name, artist: track.artist } : undefined,
        undefined,
        sessionPersona.id
      );
      diag.state('🎧 DJ crossfade - speaking transition', {
        track: track?.name,
        phrase: transitionPhrase.slice(0, 50),
      });
      session.say(transitionPhrase, { allowInterruptions: false });
    }

    // Non-time-sensitive operations can be async
    void (async () => {
      // Forward state changes to DJ Booth (after speaking)
      if (djBooth) {
        try {
          djBooth.onMusicStateChange(state, track, isAmbient);
        } catch (e) {
          diag.warn('Failed to forward music state to DJ Booth', { error: String(e) });
        }
      }

      // Handle unexpected music stop
      const isUnexpectedStop =
        (state === 'stopped' || state === 'paused') && !isAmbient && lastMusicState === 'playing';

      // 🐛 FIX: Don't announce music stop during handoffs
      if (isUnexpectedStop && !djBooth?.isHandoffInProgress()) {
        const stoppedPhrase = getMusicStoppedPhrase(sessionPersona.id, state === 'paused');
        diag.state('🎧 Music unexpectedly stopped', {
          track: lastTrackName,
          newState: state,
        });
        session.say(stoppedPhrase, { allowInterruptions: true });
      } else if (isUnexpectedStop && djBooth?.isHandoffInProgress()) {
        diag.state('🔄 Music stopped during handoff (suppressing phrase)', {
          track: lastTrackName,
          newState: state,
        });
      }

      // Update tracking state
      lastMusicState = state;
      lastTrackName = track?.name;

      // Set up engagement timers when music starts
      if (state === 'playing' && !isAmbient && track) {
        musicPlaybackStartTime = Date.now();
        lastAppreciationTime = null;
        lastReadTheRoomTime = null;

        // Track music for cross-session callbacks
        try {
          const dj = getDJIntegration();
          dj.trackMusicPlayed(track.artist);
          diag.state('🎧 Tracked music for session', { artist: track.artist });
        } catch (e) {
          diag.warn('🎧 Failed to track music', { error: String(e) });
        }

        clearTimers();

        // Set up appreciation timer
        const appreciationTimer = setInterval(() => {
          void handleAppreciationInterval(
            session,
            sessionPersona,
            track,
            musicPlaybackStartTime,
            lastAppreciationTime,
            (time) => {
              lastAppreciationTime = time;
            }
          );
        }, 10000);
        setAppreciationTimer(appreciationTimer);

        // Set up read-the-room timer
        const readTheRoomTimer = setInterval(() => {
          void handleReadTheRoomInterval(
            session,
            sessionPersona,
            musicPlaybackStartTime,
            lastReadTheRoomTime,
            (time) => {
              lastReadTheRoomTime = time;
            }
          );
        }, 30000);
        setReadTheRoomTimer(readTheRoomTimer);
      }

      // Clear timers when music stops
      if (state === 'stopped' || state === 'paused' || state === 'idle') {
        clearTimers();
        musicPlaybackStartTime = null;
      }

      // Notify frontend for avatar dancing
      try {
        const { getFrontendPublisher } = await import('../realtime/index.js');
        const publisher = getFrontendPublisher();
        if (publisher && room) {
          const trackInfo = track ? { name: track.name, artist: track.artist } : undefined;
          await publisher.sendMusicState(state, trackInfo, isAmbient);
        }
      } catch (pubError) {
        diag.warn('Failed to publish music state', { error: String(pubError) });
      }
    })();
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
// Note: DJ outro and crossfade phrases are now handled inline in the callback
// using static imports for immediate response (no async latency)

async function handleAppreciationInterval(
  session: voice.AgentSession<UserData>,
  sessionPersona: PersonaConfig,
  track: { name: string; artist: string },
  musicPlaybackStartTime: number | null,
  lastAppreciationTime: number | null,
  setLastAppreciationTime: (time: number) => void
): Promise<void> {
  try {
    const { getMusicAppreciationComment, getMusicElementAppreciation } =
      await import('../../services/dj-service.js');

    const now = Date.now();
    const timeSinceStart = (now - (musicPlaybackStartTime || now)) / 1000;
    const timeSinceLastAppreciation = lastAppreciationTime
      ? (now - lastAppreciationTime) / 1000
      : timeSinceStart;

    // HUMANIZATION FIX: Reduced from 15s/30% to 45s/10%
    // Music should be enjoyed in silence - comments should be rare and meaningful
    if (timeSinceLastAppreciation > 45 && Math.random() < 0.1) {
      const comment =
        Math.random() < 0.7
          ? getMusicAppreciationComment(sessionPersona.id, track)
          : getMusicElementAppreciation(sessionPersona.id);

      if (comment) {
        diag.state('🎧 DJ appreciation comment', {
          comment: comment.slice(0, 50),
          timeSinceStart: Math.round(timeSinceStart),
        });
        session.say(comment, { allowInterruptions: true });
        setLastAppreciationTime(now);
      }
    }
  } catch (e) {
    diag.warn('Failed to generate appreciation', { error: String(e) });
  }
}

async function handleReadTheRoomInterval(
  session: voice.AgentSession<UserData>,
  sessionPersona: PersonaConfig,
  musicPlaybackStartTime: number | null,
  lastReadTheRoomTime: number | null,
  setLastReadTheRoomTime: (time: number) => void
): Promise<void> {
  try {
    const { getReadTheRoomAction } = await import('../../services/dj-service.js');

    const now = Date.now();
    const timeSinceStart = (now - (musicPlaybackStartTime || now)) / 1000;
    const timeSinceLastCheck = lastReadTheRoomTime
      ? (now - lastReadTheRoomTime) / 1000
      : timeSinceStart;

    // HUMANIZATION FIX: Increased from 60s to 120s
    // Let users enjoy music without constant check-ins
    if (timeSinceLastCheck > 120) {
      const action = getReadTheRoomAction(
        {
          musicHasBeenPlayingFor: timeSinceStart,
          userIsSilentDuringMusic: true,
        },
        sessionPersona.id
      );

      if (action?.phrase && action.action !== 'continue') {
        diag.state('🎧 Read the room check', {
          action: action.action,
          timePlaying: Math.round(timeSinceStart),
        });
        session.say(action.phrase, { allowInterruptions: true });
        setLastReadTheRoomTime(now);
      }
    }
  } catch (e) {
    diag.warn('Failed read-the-room check', { error: String(e) });
  }
}

// ============================================================================
// MUSIC HUMANIZATION HELPERS
// ============================================================================

/**
 * Check if a spontaneous music offer is appropriate based on emotional state
 *
 * Call this after emotion detection in the turn handler to offer music
 * that mirrors the user's emotional state.
 *
 * @param params.emotion - Detected user emotion
 * @param params.conversationDurationMs - How long the conversation has been going
 * @param params.personaId - Current persona ID
 * @param params.session - Voice session for speaking the offer
 * @returns Whether an offer was made
 */
export async function checkEmotionalMusicOffer(params: {
  emotion: string;
  emotionalIntensity: number;
  conversationDurationMs: number;
  personaId: string;
  recentTopics?: string[];
  session: voice.AgentSession<UserData>;
}): Promise<boolean> {
  const { emotion, emotionalIntensity, conversationDurationMs, personaId, recentTopics, session } =
    params;

  // Only offer music when emotion is intense enough
  if (emotionalIntensity < 0.6) {
    return false;
  }

  // Don't offer music in very short conversations (< 2 minutes)
  if (conversationDurationMs < 2 * 60 * 1000) {
    return false;
  }

  try {
    const musicHumanization = getMusicHumanization();

    // Check for emotional mirror opportunity
    const emotionalOffer = getEmotionalMirrorOffer(emotion);
    if (emotionalOffer) {
      diag.state('🎵 Emotional music mirror offer', {
        emotion,
        intensity: emotionalIntensity,
        offer: emotionalOffer.slice(0, 50),
      });
      session.say(emotionalOffer, { allowInterruptions: true });
      return true;
    }

    // Check for spontaneous music moment (heavy conversation, celebration, etc.)
    const spontaneous = checkSpontaneousMusicMoment({
      conversationDurationMs,
      timeSinceLastMusicMs: Infinity, // Let the function check internally
      recentTopics: recentTopics || [],
      emotionalIntensity,
      isAwkwardSilence: false,
      recentAchievement: false,
    });

    if (spontaneous) {
      diag.state('🎵 Spontaneous music offer triggered', {
        type: spontaneous.type,
        emotion,
      });
      session.say(spontaneous.offer, { allowInterruptions: true });
      return true;
    }

    return false;
  } catch (e) {
    diag.warn('Failed to check emotional music offer', { error: String(e) });
    return false;
  }
}

/**
 * Get a post-music check-in phrase when music ends
 *
 * @param personaId - Current persona ID
 * @param wasRequested - Whether user requested the music (vs ambient)
 * @returns Check-in phrase to say
 */
export function getMusicCheckIn(personaId: string, wasRequested: boolean): string {
  return getPostMusicCheckIn(personaId, wasRequested);
}

export default setupMusicHandler;
