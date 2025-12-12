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
  initializeDJBooth,
  type DJBooth,
  type MusicState,
  type MusicTrack,
} from '../../audio/index.js';
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
  let appreciationTimer: NodeJS.Timeout | null = null;
  let readTheRoomTimer: NodeJS.Timeout | null = null;

  const clearTimers = () => {
    if (appreciationTimer) clearInterval(appreciationTimer);
    if (readTheRoomTimer) clearInterval(readTheRoomTimer);
    appreciationTimer = null;
    readTheRoomTimer = null;
  };

  if (!room || !isMusicEnabled()) {
    if (!isMusicEnabled()) {
      diag.session('Music player skipped (MUSIC_ENABLED not set)');
    }
    return { djBooth: null, clearTimers, initialized: false };
  }

  try {
    const { initializeMusicPlayer, getMusicPlayer, getAmbientMusicEndedPhrase } =
      await import('../../audio/index.js');

    // Pass the agent session for proper audio mixing with voice
    await initializeMusicPlayer(room, session);

    // Set up callback for when ambient music ends - agent comes back in
    const player = getMusicPlayer();

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

    // Set up track ended callback
    player.setOnTrackEndedCallback((track, wasAmbient) => {
      if (wasAmbient) {
        const comeBackPhrase = getAmbientMusicEndedPhrase(sessionPersona.id);
        diag.state('Ambient music ended, agent coming back', { track: track.name });

        try {
          session.say(comeBackPhrase, { allowInterruptions: true });
        } catch (e) {
          diag.warn('Failed to say music-ended phrase', { error: String(e) });
        }
      }
    });

    // Set up mid-song moment callback
    player.setOnMidSongMomentCallback((track, momentType) => {
      void (async () => {
        try {
          const { getMidSongMomentPhrase } = await import('../../audio/ambient-music.js');
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
      })();
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

    diag.state('Music player initialized (before session.start)');
    return { djBooth, clearTimers, initialized: true };
  } catch (musicError) {
    diag.warn('Music player init failed (non-fatal)', { error: String(musicError) });
    return { djBooth: null, clearTimers, initialized: false };
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
    void (async () => {
      diag.state('Music state changed', {
        state,
        previousState: lastMusicState,
        track: track?.name,
        isAmbient,
      });

      // Forward state changes to DJ Booth
      if (djBooth) {
        try {
          djBooth.onMusicStateChange(state, track, isAmbient);
        } catch (e) {
          diag.warn('Failed to forward music state to DJ Booth', { error: String(e) });
        }
      }

      // DJ-style crossfade transition phrase
      if (state === 'changing' && !isAmbient) {
        await speakCrossfadeTransition(session, sessionPersona, track);
      }

      // DJ-style outro when fading
      if (state === 'fading' && !isAmbient && track) {
        await speakDJOutro(session, sessionPersona, track);
      }

      // Handle unexpected music stop
      const isUnexpectedStop =
        (state === 'stopped' || state === 'paused') && !isAmbient && lastMusicState === 'playing';

      if (isUnexpectedStop) {
        await speakUnexpectedStop(session, sessionPersona, state, lastTrackName);
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

async function speakCrossfadeTransition(
  session: voice.AgentSession<UserData>,
  sessionPersona: PersonaConfig,
  track: { name: string; artist: string } | null
): Promise<void> {
  try {
    const { getDJTrackChangePhrase } = await import('../../audio/ambient-music.js');
    const currentTrack = track ? { name: track.name, artist: track.artist } : undefined;
    const transitionPhrase = getDJTrackChangePhrase(currentTrack, undefined, sessionPersona.id);

    diag.state('🎧 DJ crossfade - speaking transition phrase', {
      currentTrack: track?.name,
      phrase: transitionPhrase.slice(0, 50),
    });

    session.say(transitionPhrase, { allowInterruptions: false });
  } catch (e) {
    diag.warn('Failed to speak DJ crossfade phrase', { error: String(e) });
  }
}

async function speakDJOutro(
  session: voice.AgentSession<UserData>,
  sessionPersona: PersonaConfig,
  track: { name: string; artist: string }
): Promise<void> {
  try {
    const { getDJOutroPhrase } = await import('../../audio/ambient-music.js');
    const djOutro = getDJOutroPhrase(track.name, track.artist, sessionPersona.id);

    diag.state('🎧 DJ outro - speaking over fading music', {
      track: track.name,
      phrase: djOutro.slice(0, 50),
    });

    session.say(djOutro, { allowInterruptions: true });
  } catch (e) {
    diag.warn('Failed to speak DJ outro', { error: String(e) });
  }
}

async function speakUnexpectedStop(
  session: voice.AgentSession<UserData>,
  sessionPersona: PersonaConfig,
  state: string,
  lastTrackName: string | undefined
): Promise<void> {
  try {
    const { getMusicStoppedPhrase } = await import('../../audio/ambient-music.js');
    const stoppedPhrase = getMusicStoppedPhrase(sessionPersona.id, state === 'paused');

    diag.state('🎧 Music unexpectedly stopped', {
      track: lastTrackName,
      newState: state,
      wasPaused: state === 'paused',
    });

    session.say(stoppedPhrase, { allowInterruptions: true });
  } catch (e) {
    diag.warn('Failed to speak music-stopped phrase', { error: String(e) });
  }
}

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

    // Only appreciate if enough time has passed (30% chance every 15+ seconds)
    if (timeSinceLastAppreciation > 15 && Math.random() < 0.3) {
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

    // Only check every 60+ seconds
    if (timeSinceLastCheck > 60) {
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

export default setupMusicHandler;
