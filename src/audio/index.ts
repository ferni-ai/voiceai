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
  initializeMusicPlayer,
  resetMusicPlayer,
  type MusicPlayerState,
  type MusicState,
  type MusicTrack,
  type OnMidSongMomentCallback,
  type OnMusicStateChangeCallback,
  type OnTrackEndedCallback,
  type SessionMusicEntry,
} from './music-player.js';

// Ambient music for silences
export {
  getAmbientMusicEndedPhrase,
  getAmbientTracks,
  getDJDropPhrase,
  getDJOutroPhrase,
  getDJTrackChangePhrase,
  getMidSongMomentPhrase,
  getMoodAwareMusicOffer,
  getMusicStoppedPhrase,
  getRandomAmbientTrack,
  getSessionCallbackPhrase,
  isAmbientMusicEnabled,
  playAmbientMusic,
  stopAmbientMusic,
} from './ambient-music.js';

// Session sounds (stingers, game sounds, etc.)
export {
  VERBAL_SOUNDS,
  getSessionSounds,
  getVerbalSound,
  playSessionSound,
  resetSessionSounds,
  type SessionSoundType,
} from './session-sounds.js';

// DJ Booth - Full audio orchestration (ducking, timing, talk-over)
export {
  DJBooth,
  getDJBooth,
  initializeDJBooth,
  resetDJBooth,
  type DJBoothConfig,
  type DJBoothState,
} from './dj-booth.js';

// DJ Enhancements - Pixar-level magic (thinking music, emotion-reactive, session flow)
export {
  // Controllers
  DJEnhancementController,
  MusicMemoryManager,
  PERSONA_DJ_STYLES,
  SessionFlowManager,
  ThinkingMusicController,
  getCountdownPhrase,
  getDJEnhancements,
  getEmotionMusicOffer,
  // Phase 5: Emotion-reactive
  getEmotionMusicSuggestion,
  // Phase 6: Game music
  getGameMusicConfig,
  getGameMusicPhrase,
  // Phase 3: Persona DJ styles
  getPersonaDJStyle,
  getPersonaMusicIntro,
  // Singleton management
  initializeDJEnhancements,
  resetDJEnhancements,
  // Phase 2: Predictive timing
  scheduleTrackTimingCallbacks,
  type EmotionMusicMapping,
  type GameMusicConfig,
  type MusicPreferences,
  // Types
  type PersonaDJStyle,
  type SessionFlowState,
  type TrackTimingCallbacks,
} from './dj-enhancements.js';

// Music Humanization - Natural, fun, engaging music interactions
export {
  // Main controller
  MusicHumanizationController,
  // Engagement detection
  analyzeVibingBehavior,
  // Spontaneous moments
  checkSpontaneousMusicMoment,
  // Conversation bridges
  getConversationBridge,
  // Emotional mirror
  getEmotionalMirrorOffer,
  // Fun personality
  getFunInterjection,
  getMusicConversationStarter,
  // Music discovery
  getMusicDiscoveryQuestion,
  getMusicHumanization,
  getPersonaFunMoment,
  // Post-music check-ins
  getPostMusicCheckIn,
  getTimeAwareMusicSuggestion,
  // Time awareness
  getTimeOfDay,
  resetMusicHumanization,
  shouldInterruptMusic,
  type MusicHumanizationConfig,
  // Types
  type MusicHumanizationState,
  type MusicMoment,
  type SpontaneousTrigger,
  type TimeOfDay,
} from './music-humanization.js';
