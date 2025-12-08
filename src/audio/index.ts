/**
 * Audio Module
 *
 * Handles all audio-related functionality including:
 * - Background music playback into calls via LiveKit BackgroundAudioPlayer
 * - Audio ducking when agent speaks
 * - Volume control
 * - Spotify preview streaming
 * - Ambient/thinking music for silences
 */

export {
  CallMusicPlayer,
  getMusicPlayer,
  resetMusicPlayer,
  initializeMusicPlayer,
  type MusicTrack,
  type MusicPlayerState,
  type MusicState,
  type SessionMusicEntry,
  type OnTrackEndedCallback,
  type OnMusicStateChangeCallback,
  type OnMidSongMomentCallback,
} from './music-player.js';

// Ambient music for silences
export {
  playAmbientMusic,
  stopAmbientMusic,
  isAmbientMusicEnabled,
  getAmbientTracks,
  getRandomAmbientTrack,
  getAmbientMusicEndedPhrase,
  getDJOutroPhrase,
  getDJTrackChangePhrase,
  getDJDropPhrase,
  getMidSongMomentPhrase,
  getMoodAwareMusicOffer,
  getSessionCallbackPhrase,
  getMusicStoppedPhrase,
} from './ambient-music.js';

// Session sounds (stingers, game sounds, etc.)
export {
  getSessionSounds,
  resetSessionSounds,
  playSessionSound,
  getVerbalSound,
  VERBAL_SOUNDS,
  type SessionSoundType,
} from './session-sounds.js';

// DJ Booth - Full audio orchestration (ducking, timing, talk-over)
export {
  DJBooth,
  initializeDJBooth,
  getDJBooth,
  resetDJBooth,
  type DJBoothConfig,
  type DJBoothState,
} from './dj-booth.js';

// DJ Enhancements - Pixar-level magic (thinking music, emotion-reactive, session flow)
export {
  // Controllers
  DJEnhancementController,
  ThinkingMusicController,
  SessionFlowManager,
  MusicMemoryManager,
  // Singleton management
  initializeDJEnhancements,
  getDJEnhancements,
  resetDJEnhancements,
  // Phase 2: Predictive timing
  scheduleTrackTimingCallbacks,
  getCountdownPhrase,
  // Phase 3: Persona DJ styles
  getPersonaDJStyle,
  getPersonaMusicIntro,
  PERSONA_DJ_STYLES,
  // Phase 5: Emotion-reactive
  getEmotionMusicSuggestion,
  getEmotionMusicOffer,
  // Phase 6: Game music
  getGameMusicConfig,
  getGameMusicPhrase,
  // Types
  type PersonaDJStyle,
  type MusicPreferences,
  type TrackTimingCallbacks,
  type EmotionMusicMapping,
  type GameMusicConfig,
  type SessionFlowState,
} from './dj-enhancements.js';
